// CORS allowlist for a separately hosted web app (Cloudflare -> Cloud Run).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { parseAllowedOrigins } from '../../server/cors';
import { checkConfig } from '../../server/config';

const WEB = 'https://launchpad.example.pages.dev';
const app = createApp({ ai: null, allowedOrigins: [WEB, 'http://localhost:5173'] });

describe('CORS allowlist', () => {
  it('answers preflight from an allowed origin with the methods and headers the app uses', async () => {
    const r = await request(app)
      .options('/api/generate')
      .set('Origin', WEB)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization, content-type, x-workspace-id');
    expect(r.status).toBe(204);
    expect(r.headers['access-control-allow-origin']).toBe(WEB);
    expect(r.headers['access-control-allow-headers']).toMatch(/Authorization/);
    expect(r.headers['access-control-allow-headers']).toMatch(/x-workspace-id/);
    expect(r.headers['access-control-allow-methods']).toMatch(/PUT/);
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
    expect(r.headers.vary).toMatch(/Origin/);
  });

  it('adds the allow-origin header to real responses from allowed origins only', async () => {
    const ok = await request(app).get('/api/health').set('Origin', WEB);
    expect(ok.status).toBe(200);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB);

    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const sameOrigin = await request(app).get('/api/health');
    expect(sameOrigin.status).toBe(200);
    expect(sameOrigin.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects preflight from origins not on the list, including look-alikes', async () => {
    for (const origin of [
      'https://evil.example',
      `${WEB}.evil.example`,
      'http://launchpad.example.pages.dev',
      'null',
    ]) {
      const r = await request(app)
        .options('/api/generate')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
      expect(r.status, origin).toBe(403);
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    }
  });

  it('parses ALLOWED_ORIGINS strictly', () => {
    expect(parseAllowedOrigins(` ${WEB}/ , http://localhost:5173`)).toEqual([WEB, 'http://localhost:5173']);
    expect(parseAllowedOrigins('')).toEqual([]);
    expect(() => parseAllowedOrigins('*')).toThrow();
    expect(() => parseAllowedOrigins('http://app.example.com')).toThrow(/https/);
    expect(() => parseAllowedOrigins('https://app.example.com/path')).toThrow(/origin only/);
  });

  it('startup checks: API-only production needs ALLOWED_ORIGINS; bad values fail', () => {
    const prod = {
      NODE_ENV: 'production',
      K_SERVICE: 'launchpad-api',
      GEMINI_API_KEY: 'x',
      DATABASE_URL: 'postgresql://u:p@ep-x-pooler.aws.neon.tech/neondb?sslmode=require',
      NEON_AUTH_BASE_URL: 'https://ep-x.neonauth.aws.neon.tech/neondb/auth',
      NEON_AUTH_JWKS_URL: 'https://ep-x.neonauth.aws.neon.tech/neondb/auth/.well-known/jwks.json',
    };
    expect(checkConfig({ ...prod, SERVE_STATIC: 'false' }).errors.join()).toMatch(/ALLOWED_ORIGINS is empty/);
    expect(checkConfig({ ...prod, SERVE_STATIC: 'false', ALLOWED_ORIGINS: WEB }).errors).toEqual([]);
    expect(checkConfig({ ...prod, ALLOWED_ORIGINS: '*' }).errors.join()).toMatch(/ALLOWED_ORIGINS/);
    expect(checkConfig({ ...prod, SERVE_STATIC: 'no' }).errors.join()).toMatch(/SERVE_STATIC/);
  });
});
