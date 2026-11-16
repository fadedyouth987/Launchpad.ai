/**
 * AI entry point. The real provider layer lives in server/llm/ (Anthropic, OpenAI, Gemini, xAI,
 * Neon AI Gateway, any OpenAI-compatible endpoint). This file keeps the small Gemini-SDK-shaped
 * client interface that tests inject (`createApp({ ai })`) and adapts it to the provider interface.
 */
import type { LlmProvider, LlmRequest } from './llm/types';

export interface AiClient {
  models: {
    generateContent(req: { model: string; contents: unknown; config?: Record<string, unknown> }): Promise<{
      text?: string;
      candidates?: Array<{
        groundingMetadata?: Record<string, unknown> & {
          webSearchQueries?: string[];
          groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
        };
      }>;
    }>;
  };
}

/** Wraps a Gemini-shaped client (tests) as an LlmProvider. */
export function llmFromClient(ai: AiClient): LlmProvider {
  return {
    async generate(req: LlmRequest, model: string) {
      const response = await ai.models.generateContent({
        model,
        contents: req.contents,
        config: {
          systemInstruction: req.system,
          ...(req.json && !req.webSearch ? { responseMimeType: 'application/json' } : {}),
          ...(req.webSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      const meta = response.candidates?.[0]?.groundingMetadata;
      return {
        text: response.text || '',
        ...(req.webSearch && meta
          ? {
              grounding: { webSearchQueries: meta.webSearchQueries ?? [], groundingChunks: meta.groundingChunks ?? [] },
            }
          : {}),
      };
    },
  };
}
