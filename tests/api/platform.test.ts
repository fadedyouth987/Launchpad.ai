// Cross-cutting behaviour: health, JSON errors, security headers, rate limiting.
import { describe, expect, it } from 'vitest';
import { api, fakeAi } from './helpers';

describe('platform', () => {
  it('health reports demo auth and what is connected', async () => {
    const r = await api(null).get('/api/health');
    expect(r.body).toMatchObject({
      status: 'ok',
      auth: 'demo-mode',
      integrations: { gemini: false, payments: false, database: false },
    });
  });

  it('unknown API routes, malformed and oversized JSON all get JSON errors (no HTML stack traces)', async () => {
    const a = api(null);
    const notFound = await a.get('/api/does-not-exist');
    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toBe('NOT_FOUND');
    const bad = await a.post('/api/generate').set('content-type', 'application/json').send('{"oops"');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_JSON');
    const big = await a.post('/api/generate').send({ prompt: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
    expect(big.body.error).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides x-powered-by', async () => {
    const r = await api(null).get('/api/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  it('rate-limits AI endpoints (AI_RATE_LIMIT_PER_MINUTE)', async () => {
    process.env.AI_RATE_LIMIT_PER_MINUTE = '3';
    const { aiRateLimiter } = await import('../../server/rateLimit');
    aiRateLimiter.reset();
    const { ai } = fakeAi(JSON.stringify({ topic: 'x' }));
    const a = api(ai);
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push((await a.post('/api/engagement/suggest-reply').send({ commentText: 'hi' })).status);
    expect(codes.slice(0, 3).every((c) => c !== 429)).toBe(true);
    expect(codes[3]).toBe(429);
    delete process.env.AI_RATE_LIMIT_PER_MINUTE;
    aiRateLimiter.reset();
  });
});
