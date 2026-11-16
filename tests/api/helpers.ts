import request from 'supertest';
import { createApp } from '../../server/app';
import type { AiClient } from '../../server/ai';

export const WS = 'ws-acme-enterprise';
export const OTHER_WS = 'ws-vantory-agency';

type Call = Parameters<AiClient['models']['generateContent']>[0];

/** Fake Gemini client: returns `reply` (or throws it if it is an Error) and records every call. */
export function fakeAi(reply: string | Error | ((call: Call) => string)) {
  const calls: Call[] = [];
  const ai: AiClient = {
    models: {
      async generateContent(call) {
        calls.push(call);
        if (reply instanceof Error) throw reply;
        return { text: typeof reply === 'function' ? reply(call) : reply };
      },
    },
  };
  return { ai, calls };
}

export function api(ai: AiClient | null = null) {
  return request(createApp({ ai }));
}

export async function balance(agent: ReturnType<typeof api>, ws = WS): Promise<number> {
  const r = await agent.get('/api/billing/credits/check').set('x-workspace-id', ws);
  return r.body.creditsRemaining;
}
