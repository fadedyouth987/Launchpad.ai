// One CSP for both hosting setups (Express/helmet and the Cloudflare _headers file).
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { cspDirectives, cspHeaderValue, neonAuthOrigin } from '../../server/csp';
import { securityHeaders } from '../../server/security';

describe('CSP', () => {
  it('adds the API origin to connect-src only', () => {
    const d = cspDirectives(['https://api.example.run.app'], 'https://ep-x.neonauth.aws.neon.tech');
    expect(d['connect-src']).toContain('https://api.example.run.app');
    expect(d['connect-src']).toContain('https://ep-x.neonauth.aws.neon.tech');
    expect(d['frame-src']).toEqual(['https://ep-x.neonauth.aws.neon.tech']);
    expect(cspHeaderValue(d)).not.toMatch(/firebase|googleapis/);
    expect(d['script-src']).not.toContain('https://api.example.run.app');
    expect(cspHeaderValue(d)).toMatch(/connect-src 'self' https:\/\/api\.example\.run\.app /);
  });

  it('takes the Neon Auth origin from VITE_NEON_AUTH_URL or NEON_AUTH_BASE_URL (path dropped)', () => {
    expect(neonAuthOrigin({ NEON_AUTH_BASE_URL: 'https://a.neonauth.x.neon.tech/neondb/auth' })).toBe(
      'https://a.neonauth.x.neon.tech',
    );
    expect(neonAuthOrigin({})).toBeNull();
    expect(cspDirectives([], null)['frame-src']).toEqual(["'none'"]);
  });

  it('Express production headers use the same directives', async () => {
    const app = express();
    app.use(securityHeaders({ production: true }));
    app.get('/', (_q, s) => s.send('ok'));
    const csp = (await request(app).get('/')).headers['content-security-policy'] as string;
    for (const [k, v] of Object.entries(cspDirectives())) expect(csp).toContain(`${k} ${v.join(' ')}`);
  });
});
