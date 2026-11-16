// Provider adapters against mocked HTTP: request shape (URL, auth header, system prompt, JSON mode,
// web search), response parsing, model lists, images, and error messages that never leak the key.
import { describe, expect, it } from 'vitest';
import { anthropicProvider, geminiProvider, openAiCompatibleProvider } from '../../server/llm/providers';
import { buildProvider } from '../../server/llm/catalog';
import { ProviderError } from '../../server/llm/types';
import { userTurn } from '../../server/prompts';

type Seen = { url: string; init: RequestInit; body: Record<string, unknown> | null };

function mockFetch(reply: unknown | ((url: string) => unknown), status = 200) {
  const seen: Seen[] = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    seen.push({ url: u, init, body: init.body ? JSON.parse(String(init.body)) : null });
    const data = typeof reply === 'function' ? (reply as (u: string) => unknown)(u) : reply;
    return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status });
  }) as typeof fetch;
  return { f, seen };
}

const KEY = 'sk-test-SECRET-abcdefghijklmnop1234';
const req = {
  system: 'SYSTEM RULES',
  contents: userTurn('Write a post.', { brief: 'Launch day' }),
  json: true,
};
const header = (s: Seen, name: string) => new Headers(s.init.headers as HeadersInit).get(name);

describe('Anthropic adapter', () => {
  it('calls the Messages API with the key in x-api-key and the system prompt separate', async () => {
    const { f, seen } = mockFetch({ content: [{ type: 'text', text: '{"caption":"Hi"}' }] });
    const out = await anthropicProvider({ apiKey: KEY, fetchImpl: f }).generate(req, 'claude-sonnet-5-5');
    expect(out.text).toBe('{"caption":"Hi"}');
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/messages');
    expect(header(seen[0], 'x-api-key')).toBe(KEY);
    expect(header(seen[0], 'anthropic-version')).toBe('2023-06-01');
    expect(seen[0].body).toMatchObject({ model: 'claude-sonnet-5-5', system: 'SYSTEM RULES', max_tokens: 4096 });
    const msg = (seen[0].body!.messages as Array<{ role: string; content: string }>)[0];
    expect(msg.role).toBe('user');
    expect(msg.content).toContain('<user_input name="brief">');
    expect(seen[0].url).not.toContain(KEY);
  });

  it('lists models', async () => {
    const { f, seen } = mockFetch({ data: [{ id: 'claude-a' }, { id: 'claude-b' }] });
    expect(await anthropicProvider({ apiKey: KEY, fetchImpl: f }).listModels!()).toEqual(['claude-a', 'claude-b']);
    expect(seen[0].url).toBe('https://api.anthropic.com/v1/models?limit=100');
  });

  it('turns HTTP errors into ProviderError without the key', async () => {
    const { f } = mockFetch({ error: { type: 'authentication_error', message: `invalid x-api-key ${KEY}` } }, 401);
    const err = await anthropicProvider({ apiKey: KEY, fetchImpl: f })
      .generate(req, 'm')
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(KEY);
    expect(err.message).toContain('[redacted]');
  });

  it('rejects an empty answer', async () => {
    const { f } = mockFetch({ content: [] });
    await expect(anthropicProvider({ apiKey: KEY, fetchImpl: f }).generate(req, 'm')).rejects.toThrow(/no text/);
  });
});

describe('Gemini adapter', () => {
  it('uses JSON mode, x-goog-api-key and skips thought parts', async () => {
    const { f, seen } = mockFetch({
      candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }, { text: '{"a":1}' }] } }],
    });
    const out = await geminiProvider({ apiKey: KEY, fetchImpl: f }).generate(req, 'gemini-3.8-flash');
    expect(out.text).toBe('{"a":1}');
    expect(out.grounding).toBeUndefined();
    expect(seen[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    );
    expect(header(seen[0], 'x-goog-api-key')).toBe(KEY);
    expect(seen[0].body).toMatchObject({
      systemInstruction: { parts: [{ text: 'SYSTEM RULES' }] },
      generationConfig: { responseMimeType: 'application/json' },
    });
    expect(seen[0].body!.tools).toBeUndefined();
  });

  it('web search adds the google_search tool, drops JSON mode and returns grounding', async () => {
    const { f, seen } = mockFetch({
      candidates: [
        {
          content: { parts: [{ text: '[]' }] },
          groundingMetadata: { webSearchQueries: ['q1'], groundingChunks: [{ web: { uri: 'https://x', title: 'X' } }] },
        },
      ],
    });
    const out = await geminiProvider({ apiKey: KEY, fetchImpl: f }).generate({ ...req, webSearch: true }, 'g');
    expect(seen[0].body!.tools).toEqual([{ google_search: {} }]);
    expect((seen[0].body!.generationConfig as Record<string, unknown>).responseMimeType).toBeUndefined();
    expect(out.grounding?.webSearchQueries).toEqual(['q1']);
  });

  it('lists only generateContent models and generates images', async () => {
    const { f } = mockFetch((url: string) =>
      url.includes('/models?')
        ? {
            models: [
              { name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
            ],
          }
        : { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } }] } }] },
    );
    const p = geminiProvider({ apiKey: KEY, fetchImpl: f });
    expect(await p.listModels!()).toEqual(['gemini-x']);
    expect(await p.generateImage!('a cat', 'img-model')).toEqual({ mimeType: 'image/png', base64: 'iVBORw0KGgo=' });
  });
});

describe('OpenAI-compatible adapters', () => {
  it('OpenAI: bearer auth, system + user messages, json_object, max_completion_tokens', async () => {
    const { f, seen } = mockFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
    const out = await buildProvider('openai', KEY, f).generate(req, 'gpt-6.1-sol');
    expect(out.text).toBe('{"ok":true}');
    expect(seen[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(header(seen[0], 'authorization')).toBe(`Bearer ${KEY}`);
    expect(seen[0].body).toMatchObject({
      model: 'gpt-6.1-sol',
      response_format: { type: 'json_object' },
      max_completion_tokens: 4096,
    });
    const msgs = seen[0].body!.messages as Array<{ role: string; content: string }>;
    expect(msgs[0]).toEqual({ role: 'system', content: 'SYSTEM RULES' });
    expect(msgs[1].role).toBe('user');
  });

  it('xAI: api.x.ai base URL and max_tokens', async () => {
    const { f, seen } = mockFetch({ choices: [{ message: { content: 'hi' } }] });
    await buildProvider('xai', KEY, f).generate(req, 'grok-4.7');
    expect(seen[0].url).toBe('https://api.x.ai/v1/chat/completions');
    expect(seen[0].body).toMatchObject({ model: 'grok-4.7', max_tokens: 4096 });
  });

  it('custom endpoint: no JSON mode by default, optional key, configured base URL', async () => {
    const { f, seen } = mockFetch({
      choices: [{ message: { content: [{ type: 'text', text: 'part1' }, { text: 'part2' }] } }],
    });
    const p = openAiCompatibleProvider({
      id: 'custom',
      apiKey: '',
      fetchImpl: f,
      baseUrl: 'http://localhost:11434/v1/',
      jsonMode: false,
      tokenParam: 'max_tokens',
    });
    expect((await p.generate(req, 'llama4')).text).toBe('part1part2');
    expect(seen[0].url).toBe('http://localhost:11434/v1/chat/completions');
    expect(header(seen[0], 'authorization')).toBeNull();
    expect(seen[0].body!.response_format).toBeUndefined();
  });

  it('Neon AI Gateway uses <base>/v1 with the gateway token', async () => {
    process.env.NEON_AI_GATEWAY_BASE_URL = 'https://gw.example.neon.tech/';
    try {
      const { f, seen } = mockFetch({ choices: [{ message: { content: 'x' } }] });
      await buildProvider('neon-gateway', 'gw-token-123456', f).generate(req, 'claude-sonnet-5-5');
      expect(seen[0].url).toBe('https://gw.example.neon.tech/v1/chat/completions');
      expect(header(seen[0], 'authorization')).toBe('Bearer gw-token-123456');
      expect(seen[0].body!.response_format).toBeUndefined();
    } finally {
      delete process.env.NEON_AI_GATEWAY_BASE_URL;
    }
  });

  it('images: OpenAI sends size/quality, xAI asks for b64_json; MIME is sniffed', async () => {
    const { f, seen } = mockFetch({ data: [{ b64_json: '/9j/4AAQSkZJRg==' }] });
    expect(await buildProvider('openai', KEY, f).generateImage!('a dog', 'gpt-image-2')).toEqual({
      mimeType: 'image/jpeg',
      base64: '/9j/4AAQSkZJRg==',
    });
    expect(seen[0].url).toBe('https://api.openai.com/v1/images/generations');
    expect(seen[0].body).toMatchObject({ model: 'gpt-image-2', prompt: 'a dog', size: '1024x1024' });
    await buildProvider('xai', KEY, f).generateImage!('a dog', 'grok-imagine-image');
    expect(seen[1].body).toMatchObject({ response_format: 'b64_json' });
    expect(buildProvider('anthropic', KEY, f).generateImage).toBeUndefined();
  });

  it('network failures and non-JSON bodies become ProviderError', async () => {
    const boom = (async () => {
      throw new Error(`connect ECONNREFUSED with ${KEY}`);
    }) as unknown as typeof fetch;
    const e1 = await buildProvider('openai', KEY, boom)
      .generate(req, 'm')
      .catch((e) => e);
    expect(e1).toBeInstanceOf(ProviderError);
    expect(e1.status).toBe(0);
    expect(e1.message).not.toContain(KEY);
    const { f } = mockFetch('<html>bad gateway</html>');
    await expect(buildProvider('openai', KEY, f).generate(req, 'm')).rejects.toThrow(/not JSON/);
  });
});
