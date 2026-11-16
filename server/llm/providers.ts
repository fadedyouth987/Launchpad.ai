/**
 * Provider adapters. Every adapter is plain fetch() against the provider's public HTTP API (no
 * vendor SDKs), so tests can mock the network and the Neon Function bundle stays small.
 * API keys are sent only in request headers and are scrubbed from any error text.
 */
import type { Content } from '../prompts';
import {
  ProviderError,
  type ImageResult,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type ProviderId,
} from './types';

type FetchLike = typeof fetch;
const TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS) || 60_000;
const DEFAULT_MAX_TOKENS = 4096;

export interface AdapterOptions {
  apiKey: string;
  fetchImpl?: FetchLike;
}

function flatten(contents: Content[]): string {
  return contents.flatMap((c) => c.parts.map((p) => p.text)).join('\n\n');
}

function scrub(text: string, secret: string) {
  let out = text.slice(0, 400);
  if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
  return out.replace(/(sk|xai|AIza)[-_A-Za-z0-9]{12,}/g, '[redacted]');
}

async function call(
  provider: ProviderId,
  url: string,
  init: RequestInit,
  apiKey: string,
  fetchImpl: FetchLike | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const f = fetchImpl ?? globalThis.fetch;
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new ProviderError(provider, 0, `network error: ${scrub((err as Error)?.message || 'fetch failed', apiKey)}`);
  }
  const raw = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error?.type || body?.message || raw || res.statusText;
    throw new ProviderError(provider, res.status, `HTTP ${res.status}: ${scrub(String(msg), apiKey)}`);
  }
  if (body === null) throw new ProviderError(provider, res.status, 'response was not JSON');
  return body;
}

/** MIME type from the first bytes of base64 image data. */
export function sniffImageMime(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  return 'image/png';
}

function requireText(provider: ProviderId, text: string): string {
  if (!text.trim()) throw new ProviderError(provider, 200, 'response contained no text');
  return text;
}

// ---------------------------------------------------------------- Google Gemini (REST v1beta)
export function geminiProvider(
  { apiKey, fetchImpl }: AdapterOptions,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
): LlmProvider {
  const headers = { 'content-type': 'application/json', 'x-goog-api-key': apiKey, 'user-agent': 'launchpad-ai' };
  return {
    async generate(req: LlmRequest, model: string): Promise<LlmResult> {
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: req.contents,
        generationConfig: {
          maxOutputTokens: req.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
          // JSON mode cannot be combined with the search tool.
          ...(req.json && !req.webSearch ? { responseMimeType: 'application/json' } : {}),
        },
        ...(req.webSearch ? { tools: [{ google_search: {} }] } : {}),
      };
      const data = await call(
        'gemini',
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        apiKey,
        fetchImpl,
      );
      const cand = data?.candidates?.[0];
      const text = (cand?.content?.parts ?? [])
        .filter((p: { text?: string; thought?: boolean }) => typeof p.text === 'string' && !p.thought)
        .map((p: { text: string }) => p.text)
        .join('');
      const meta = cand?.groundingMetadata;
      return {
        text: requireText('gemini', text),
        ...(req.webSearch && meta
          ? {
              grounding: { webSearchQueries: meta.webSearchQueries ?? [], groundingChunks: meta.groundingChunks ?? [] },
            }
          : {}),
      };
    },
    async listModels() {
      const data = await call('gemini', `${baseUrl}/models?pageSize=200`, { headers }, apiKey, fetchImpl);
      return (data?.models ?? [])
        .filter((m: { supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent'),
        )
        .map((m: { name: string }) => String(m.name).replace(/^models\//, ''));
    },
    async generateImage(prompt: string, model: string): Promise<ImageResult> {
      const data = await call(
        'gemini',
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['IMAGE'] },
          }),
        },
        apiKey,
        fetchImpl,
      );
      const part = (data?.candidates?.[0]?.content?.parts ?? []).find(
        (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
      );
      if (!part) throw new ProviderError('gemini', 200, 'response contained no image');
      return { mimeType: part.inlineData.mimeType || 'image/png', base64: part.inlineData.data };
    },
  };
}

// ---------------------------------------------------------------- Anthropic Claude (Messages API)
export function anthropicProvider(
  { apiKey, fetchImpl }: AdapterOptions,
  baseUrl = 'https://api.anthropic.com/v1',
): LlmProvider {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'user-agent': 'launchpad-ai',
  };
  return {
    async generate(req: LlmRequest, model: string): Promise<LlmResult> {
      const data = await call(
        'anthropic',
        `${baseUrl}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
            system: req.system,
            messages: [{ role: 'user', content: flatten(req.contents) }],
          }),
        },
        apiKey,
        fetchImpl,
      );
      const text = (data?.content ?? [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
      return { text: requireText('anthropic', text) };
    },
    async listModels() {
      const data = await call('anthropic', `${baseUrl}/models?limit=100`, { headers }, apiKey, fetchImpl);
      return (data?.data ?? []).map((m: { id: string }) => String(m.id));
    },
  };
}

// ---------------------------------------------------------------- OpenAI-compatible (OpenAI, xAI, gateway, custom)
export interface OpenAiCompatOptions extends AdapterOptions {
  id: ProviderId;
  baseUrl: string;
  /** Send response_format {type:'json_object'} for JSON requests. */
  jsonMode: boolean;
  /** 'max_completion_tokens' (OpenAI) or 'max_tokens' (most compatible servers). */
  tokenParam: 'max_completion_tokens' | 'max_tokens' | 'none';
  /** Image generation support: extra body fields for /images/generations, or null when unsupported. */
  imageBody?: Record<string, unknown> | null;
}

export function openAiCompatibleProvider(o: OpenAiCompatOptions): LlmProvider {
  const base = o.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'launchpad-ai' };
  if (o.apiKey) headers.authorization = `Bearer ${o.apiKey}`;
  const provider: LlmProvider = {
    async generate(req: LlmRequest, model: string): Promise<LlmResult> {
      const max = req.maxOutputTokens ?? DEFAULT_MAX_TOKENS;
      const data = await call(
        o.id,
        `${base}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: flatten(req.contents) },
            ],
            ...(o.tokenParam === 'none' ? {} : { [o.tokenParam]: max }),
            ...(req.json && o.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        o.apiKey,
        o.fetchImpl,
      );
      const content = data?.choices?.[0]?.message?.content;
      const text = Array.isArray(content)
        ? content.map((p: { text?: string }) => p.text ?? '').join('')
        : typeof content === 'string'
          ? content
          : '';
      return { text: requireText(o.id, text) };
    },
    async listModels() {
      const data = await call(o.id, `${base}/models`, { headers }, o.apiKey, o.fetchImpl);
      return (data?.data ?? []).map((m: { id: string }) => String(m.id));
    },
  };
  if (o.imageBody) {
    provider.generateImage = async (prompt: string, model: string): Promise<ImageResult> => {
      const data = await call(
        o.id,
        `${base}/images/generations`,
        { method: 'POST', headers, body: JSON.stringify({ model, prompt, n: 1, ...o.imageBody }) },
        o.apiKey,
        o.fetchImpl,
      );
      const item = data?.data?.[0];
      if (!item?.b64_json) throw new ProviderError(o.id, 200, 'response contained no image');
      return { mimeType: sniffImageMime(item.b64_json), base64: item.b64_json };
    };
  }
  return provider;
}
