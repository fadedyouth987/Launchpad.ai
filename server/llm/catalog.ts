/**
 * The LLM providers Launchpad can use, how each one is configured from the environment, and which
 * one is the server default. Keys come from server env vars (or, per workspace, from an encrypted
 * key an owner/admin saved; see aiSettings.ts). Nothing here is ever sent to the browser except the
 * public catalog fields and booleans saying whether a key is configured.
 */
import { anthropicProvider, geminiProvider, openAiCompatibleProvider } from './providers';
import type { LlmProvider, ProviderId } from './types';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** Short line for the Settings page. */
  description: string;
  /** Env var holding the server-wide API key. */
  keyEnv: string;
  /** Other env vars this provider needs (base URL, model) - names only. */
  otherEnv: string[];
  /** Env var that overrides the default text model. */
  modelEnv: string;
  defaultModel: string;
  /** Suggested models shown in the picker (any model id can still be typed). */
  suggestedModels: string[];
  /** Image generation model, when the provider can make images. */
  imageModel: string | null;
  imageModelEnv: string | null;
  /** Live Google Search grounding for the trend monitor. */
  supportsWebSearch: boolean;
  /** Workspace owners/admins may save their own key for this provider. */
  allowWorkspaceKey: boolean;
  /** Where to get a key. */
  keyUrl: string;
  docsUrl: string;
}

export const PROVIDER_ORDER: ProviderId[] = ['neon-gateway', 'anthropic', 'openai', 'gemini', 'xai', 'custom'];

const env = (name: string) => {
  const v = process.env[name]?.trim();
  return v && !/^MY_[A-Z_]+$/.test(v) && !/^(changeme|your[-_].*)$/i.test(v) ? v : '';
};

export function providerCatalog(): Record<ProviderId, ProviderInfo> {
  return {
    'neon-gateway': {
      id: 'neon-gateway',
      label: 'Neon AI Gateway',
      description:
        'One Neon credential for Claude, GPT, Gemini and open models, billed through Neon. Needs Neon AI Gateway credits or a paid Neon plan; set AI_GATEWAY_ENABLED=true for the Neon Function.',
      keyEnv: 'NEON_AI_GATEWAY_TOKEN',
      otherEnv: ['NEON_AI_GATEWAY_BASE_URL'],
      modelEnv: 'NEON_AI_GATEWAY_MODEL',
      defaultModel: env('NEON_AI_GATEWAY_MODEL') || 'claude-sonnet-5-5',
      suggestedModels: [
        'claude-sonnet-5-5',
        'claude-haiku-5-5',
        'gpt-6-1-sol',
        'gpt-6-luna',
        'gemini-4-argon',
        'grok-4-7',
      ],
      imageModel: null,
      imageModelEnv: null,
      supportsWebSearch: false,
      allowWorkspaceKey: false,
      keyUrl: 'https://console.neon.tech (project > AI Gateway; paid plan)',
      docsUrl: 'https://neon.com/docs/ai/ai-gateway',
    },
    anthropic: {
      id: 'anthropic',
      label: 'Anthropic Claude',
      description: 'Claude models through the Anthropic Messages API.',
      keyEnv: 'ANTHROPIC_API_KEY',
      otherEnv: [],
      modelEnv: 'ANTHROPIC_MODEL',
      defaultModel: env('ANTHROPIC_MODEL') || 'claude-sonnet-5-5',
      suggestedModels: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5', 'claude-fable-5-2'],
      imageModel: null,
      imageModelEnv: null,
      supportsWebSearch: false,
      allowWorkspaceKey: true,
      keyUrl: 'https://console.anthropic.com/settings/keys',
      docsUrl: 'https://docs.anthropic.com/en/api/messages',
    },
    openai: {
      id: 'openai',
      label: 'OpenAI',
      description: 'GPT models (chat completions) and gpt-image for pictures.',
      keyEnv: 'OPENAI_API_KEY',
      otherEnv: [],
      modelEnv: 'OPENAI_MODEL',
      defaultModel: env('OPENAI_MODEL') || 'gpt-6.1-sol',
      suggestedModels: ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-astra'],
      imageModel: env('OPENAI_IMAGE_MODEL') || 'gpt-image-2',
      imageModelEnv: 'OPENAI_IMAGE_MODEL',
      supportsWebSearch: false,
      allowWorkspaceKey: true,
      keyUrl: 'https://platform.openai.com/api-keys',
      docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    },
    gemini: {
      id: 'gemini',
      label: 'Google Gemini',
      description: 'Gemini models. The only provider here with live Google Search grounding for trends.',
      keyEnv: 'GEMINI_API_KEY',
      otherEnv: [],
      modelEnv: 'GEMINI_MODEL',
      defaultModel: env('GEMINI_MODEL') || 'gemini-3.8-flash',
      suggestedModels: [
        'gemini-3.8-flash',
        'gemini-4-carbon',
        'gemini-4-argon',
        'gemini-4-hydrogen',
        'gemini-3.5-flash-lite',
      ],
      imageModel: env('GEMINI_IMAGE_MODEL') || 'gemini-3.1-flash-image',
      imageModelEnv: 'GEMINI_IMAGE_MODEL',
      supportsWebSearch: true,
      allowWorkspaceKey: true,
      keyUrl: 'https://aistudio.google.com/apikey',
      docsUrl: 'https://ai.google.dev/api/generate-content',
    },
    xai: {
      id: 'xai',
      label: 'xAI Grok',
      description: 'Grok models through the xAI API, and grok-imagine for pictures.',
      keyEnv: 'XAI_API_KEY',
      otherEnv: [],
      modelEnv: 'XAI_MODEL',
      defaultModel: env('XAI_MODEL') || 'grok-4.7',
      suggestedModels: ['grok-4.7', 'grok-4.6'],
      imageModel: env('XAI_IMAGE_MODEL') || 'grok-imagine-image',
      imageModelEnv: 'XAI_IMAGE_MODEL',
      supportsWebSearch: false,
      allowWorkspaceKey: true,
      keyUrl: 'https://console.x.ai',
      docsUrl: 'https://docs.x.ai/docs/api-reference',
    },
    custom: {
      id: 'custom',
      label: env('OPENAI_COMPATIBLE_LABEL') || 'Custom OpenAI-compatible endpoint',
      description:
        'Any server with an OpenAI-style /chat/completions API: OpenRouter, Groq, DeepSeek, Mistral, Together, Ollama, LM Studio, vLLM. Set by the server admin.',
      keyEnv: 'OPENAI_COMPATIBLE_API_KEY',
      otherEnv: ['OPENAI_COMPATIBLE_BASE_URL', 'OPENAI_COMPATIBLE_MODEL'],
      modelEnv: 'OPENAI_COMPATIBLE_MODEL',
      defaultModel: env('OPENAI_COMPATIBLE_MODEL'),
      suggestedModels: env('OPENAI_COMPATIBLE_MODEL') ? [env('OPENAI_COMPATIBLE_MODEL')] : [],
      imageModel: null,
      imageModelEnv: null,
      supportsWebSearch: false,
      allowWorkspaceKey: false,
      keyUrl: 'e.g. https://openrouter.ai/keys, https://console.groq.com/keys, https://platform.deepseek.com/api_keys',
      docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    },
  };
}

/** True when the server env has everything this provider needs. */
export function serverConfigured(id: ProviderId): boolean {
  switch (id) {
    case 'neon-gateway':
      // Neon injects the gateway credentials into every Neon Function, but inference only works once the
      // account has AI Gateway credits or a paid plan (otherwise HTTP 403). AI_GATEWAY_ENABLED=false
      // keeps it out of the provider list so the app does not route calls to a gateway that refuses them.
      return Boolean(
        env('NEON_AI_GATEWAY_TOKEN') &&
        env('NEON_AI_GATEWAY_BASE_URL') &&
        (process.env.AI_GATEWAY_ENABLED || '').trim().toLowerCase() !== 'false',
      );
    case 'gemini':
      return Boolean(env('GEMINI_API_KEY') || env('GOOGLE_API_KEY'));
    case 'custom':
      // The key is optional (local Ollama / LM Studio need none).
      return Boolean(env('OPENAI_COMPATIBLE_BASE_URL') && env('OPENAI_COMPATIBLE_MODEL'));
    default:
      return Boolean(env(providerCatalog()[id].keyEnv));
  }
}

function serverKey(id: ProviderId): string {
  if (id === 'gemini') return env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
  return env(providerCatalog()[id].keyEnv);
}

/** Builds an adapter for provider `id` with `apiKey` (server key when omitted). */
export function buildProvider(id: ProviderId, apiKey = serverKey(id), fetchImpl?: typeof fetch): LlmProvider {
  switch (id) {
    case 'gemini':
      return geminiProvider({ apiKey, fetchImpl });
    case 'anthropic':
      return anthropicProvider({ apiKey, fetchImpl });
    case 'openai':
      return openAiCompatibleProvider({
        id,
        apiKey,
        fetchImpl,
        baseUrl: env('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
        jsonMode: true,
        tokenParam: 'max_completion_tokens',
        imageBody: { size: '1024x1024', quality: 'medium', output_format: 'jpeg' },
      });
    case 'xai':
      return openAiCompatibleProvider({
        id,
        apiKey,
        fetchImpl,
        baseUrl: 'https://api.x.ai/v1',
        jsonMode: true,
        tokenParam: 'max_tokens',
        imageBody: { response_format: 'b64_json' },
      });
    case 'neon-gateway':
      return openAiCompatibleProvider({
        id,
        apiKey,
        fetchImpl,
        baseUrl: `${env('NEON_AI_GATEWAY_BASE_URL').replace(/\/+$/, '')}/v1`,
        jsonMode: false,
        tokenParam: 'max_tokens',
        imageBody: null,
      });
    case 'custom':
      return openAiCompatibleProvider({
        id,
        apiKey,
        fetchImpl,
        baseUrl: env('OPENAI_COMPATIBLE_BASE_URL'),
        jsonMode: env('OPENAI_COMPATIBLE_JSON_MODE') === 'true',
        tokenParam: 'max_tokens',
        imageBody: null,
      });
  }
}

/**
 * Server default text provider: AI_PROVIDER when it is set and configured, otherwise the first
 * configured provider in PROVIDER_ORDER, otherwise null (sample output).
 */
export function serverDefaultProvider(): ProviderId | null {
  const wanted = env('AI_PROVIDER') as ProviderId;
  if (wanted && PROVIDER_ORDER.includes(wanted) && serverConfigured(wanted)) return wanted;
  return PROVIDER_ORDER.find(serverConfigured) ?? null;
}

/** Server default image provider: AI_IMAGE_PROVIDER, else the first configured provider that makes images. */
export function serverDefaultImageProvider(): ProviderId | null {
  const cat = providerCatalog();
  const wanted = env('AI_IMAGE_PROVIDER') as ProviderId;
  const ok = (id: ProviderId) => Boolean(cat[id]?.imageModel) && serverConfigured(id);
  if (wanted && PROVIDER_ORDER.includes(wanted) && ok(wanted)) return wanted;
  return (['openai', 'gemini', 'xai'] as ProviderId[]).find(ok) ?? null;
}

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_ORDER as string[]).includes(v);
}
