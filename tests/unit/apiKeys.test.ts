import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Request } from 'express';
import { KEY_ROUTES, keyMayCall, roleForScopes } from '../../server/apiKeys';
import { OPENAPI } from '../../server/openapi';
import { createApp } from '../../server/app';

const req = (method: string, path: string) => ({ method, path }) as Request;

describe('API key permissions', () => {
  it('maps permissions to the matching member role (highest wins)', () => {
    expect(roleForScopes(['read'])).toBe('viewer');
    expect(roleForScopes(['read', 'write'])).toBe('creator');
    expect(roleForScopes(['publish'])).toBe('approver');
  });

  it('allows content endpoints and blocks admin ones', () => {
    expect(keyMayCall(req('GET', '/workspaces/ws1/campaign-assets'))).toBe(true);
    expect(keyMayCall(req('PUT', '/workspaces/ws1/campaign-assets/a1'))).toBe(true);
    expect(keyMayCall(req('POST', '/workspaces/ws1/campaign-assets/a1/publish'))).toBe(true);
    expect(keyMayCall(req('POST', '/generate'))).toBe(true);
    expect(keyMayCall(req('GET', '/workspaces/ws1/media/med-1/content'))).toBe(true);
    for (const [m, p] of [
      ['POST', '/workspaces'],
      ['GET', '/me/workspaces'],
      ['GET', '/workspaces/ws1/api-keys'],
      ['POST', '/workspaces/ws1/api-keys'],
      ['POST', '/workspaces/ws1/invites'],
      ['DELETE', '/workspaces/ws1/members/u1'],
      ['POST', '/billing/checkout'],
      ['POST', '/billing/subscribe'],
      ['POST', '/workspaces/ws1/webhooks'],
      ['POST', '/workspaces/ws1/erase'],
      ['GET', '/workspaces/ws1/export'],
      ['POST', '/workspaces/ws1/social/linkedin/connect'],
      ['POST', '/workspaces/ws1/media/voices/clone'],
      ['PUT', '/workspaces/ws1/ai-settings'],
    ] as const) {
      expect(keyMayCall(req(m, p)), `${m} ${p}`).toBe(false);
    }
  });

  it('the OpenAPI description documents every endpoint a key may call', () => {
    const documented = Object.entries(OPENAPI.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((m) => [m.toUpperCase(), path.replace(/\{[^}]+\}/g, 'x')] as const),
    );
    for (const [method, re] of KEY_ROUTES) {
      expect(
        documented.some(([m, p]) => m === method && re.test(p)),
        `${method} ${re}`,
      ).toBe(true);
    }
    for (const [m, p] of documented) expect(keyMayCall(req(m, p)), `${m} ${p}`).toBe(true);
  });

  it('serves the OpenAPI description publicly', async () => {
    const r = await request(createApp({ ai: null })).get('/api/v1/openapi.json');
    expect(r.status).toBe(200);
    expect(r.body.openapi).toBe('3.1.0');
  });
});
