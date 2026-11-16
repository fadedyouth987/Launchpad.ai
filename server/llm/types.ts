import type { Content } from '../prompts';

/** One text generation request, provider-neutral. */
export interface LlmRequest {
  /** Fixed system instruction (never contains user text). */
  system: string;
  /** User turn(s) built by prompts.userTurn(): task text plus fenced user fields. */
  contents: Content[];
  /** Ask for a JSON object (providers with a JSON mode use it; others rely on the prompt). */
  json?: boolean;
  /** Ask for live web search grounding. Only honoured by providers with supportsWebSearch. */
  webSearch?: boolean;
  /** Upper bound for output tokens (default 4096). */
  maxOutputTokens?: number;
}

export interface GroundingInfo {
  webSearchQueries: string[];
  groundingChunks: Array<{ web?: { uri?: string; title?: string } }>;
}

export interface LlmResult {
  text: string;
  /** Present only when the provider actually ran a web search for this answer. */
  grounding?: GroundingInfo;
}

export interface ImageResult {
  mimeType: string;
  /** Base64 image bytes (no data: prefix). */
  base64: string;
}

/** A provider bound to one API key. `model` is chosen per call. */
export interface LlmProvider {
  generate(req: LlmRequest, model: string): Promise<LlmResult>;
  /** Live model ids from the provider's /models endpoint. */
  listModels?(): Promise<string[]>;
  generateImage?(prompt: string, model: string): Promise<ImageResult>;
}

export type ProviderId = 'neon-gateway' | 'anthropic' | 'openai' | 'gemini' | 'xai' | 'custom';

/** Error from a provider HTTP call. The message never contains the API key. */
export class ProviderError extends Error {
  constructor(
    public provider: ProviderId,
    public status: number,
    message: string,
  ) {
    super(`[${provider}] ${message}`);
  }
}
