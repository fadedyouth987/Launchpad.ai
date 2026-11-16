// Workspace AI settings and bring-your-own keys in Postgres: owner/admin only, the key is stored
// encrypted, never returned, used before the server key, and removed on delete. Provider HTTP is mocked.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { createAiResolver } from '../../server/llm/resolver';
import { addMember, as as asUser, balanceOf, createUser, type TestUser } from './helpers';

vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));

const WORKSPACE_KEY = 'sk-workspace-owned-key-ABCD1234';
const seen: Array<{ url: string; auth: string | null; body: Record<string, unknown> | null }> = [];
const fakeFetch = (async (url: string | URL, init: RequestInit = {}) => {
  const u = String(url);
  const headers = new Headers(init.headers);
  seen.push({ url: u, auth: headers.get('authorization'), body: init.body ? JSON.parse(String(init.body)) : null });
  if (headers.get('authorization') === 'Bearer sk-rejected-key-0000')
    return Response.json({ error: { message: 'bad key' } }, { status: 401 });
  if (u.endsWith('/models')) return Response.json({ data: [{ id: 'gpt-6-luna' }] });
  return Response.json({
    choices: [
      { message: { content: '{"caption":"BYO caption","hashtags":[],"imagePrompt":"","visualDirection":""}' } },
    ],
  });
}) as typeof fetch;

const app = createApp({ aiResolver: createAiResolver(fakeFetch) });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, outsider: TestUser;
let WS: string;

beforeAll(async () => {
  [owner, creator, outsider] = await Promise.all(['owner', 'creator', 'outsider'].map((l) => createUser(`aip-${l}`)));
  const r = await as(owner).post('/api/workspaces').send({ name: 'BYOK Co' });
  WS = r.body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
});
afterAll(() => closeDb());

describe('workspace AI keys', () => {
  it('only owners/admins can save keys; members see status; outsiders get 403', async () => {
    expect((await as(creator).put(`/api/workspaces/${WS}/ai-keys/openai`).send({ apiKey: WORKSPACE_KEY })).status).toBe(
      403,
    );
    expect((await as(outsider).get('/api/ai/providers').set('x-workspace-id', WS)).status).toBe(403);
    const s = await as(creator).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(s.status).toBe(200);
    expect(s.body.canEdit).toBe(false);
    expect(s.body.keyStorageEnabled).toBe(true);
  });

  it('rejects a key the provider refuses, and server-only providers', async () => {
    const bad = await as(owner).put(`/api/workspaces/${WS}/ai-keys/openai`).send({ apiKey: 'sk-rejected-key-0000' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_API_KEY');
    const gw = await as(owner).put(`/api/workspaces/${WS}/ai-keys/neon-gateway`).send({ apiKey: 'whatever-1234' });
    expect(gw.body.error).toBe('KEY_NOT_ALLOWED');
  });

  it('stores the key encrypted and never returns it', async () => {
    const r = await as(owner).put(`/api/workspaces/${WS}/ai-keys/openai`).send({ apiKey: WORKSPACE_KEY });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ success: true, provider: 'openai', last4: '1234' });
    const row = (
      await db().query('SELECT key_ciphertext, key_last4 FROM workspace_ai_keys WHERE workspace_id = $1', [WS])
    ).rows[0];
    expect(row.key_ciphertext.startsWith('v1.')).toBe(true);
    expect(row.key_ciphertext).not.toContain('workspace-owned');
    for (const u of [owner, creator]) {
      const s = await as(u).get('/api/ai/providers').set('x-workspace-id', WS);
      expect(JSON.stringify(s.body)).not.toContain(WORKSPACE_KEY);
      expect(s.body.active.text).toMatchObject({ provider: 'openai', keySource: 'workspace' });
    }
    const ownerView = await as(owner).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(ownerView.body.providers.find((p: { id: string }) => p.id === 'openai').workspaceKey.last4).toBe('1234');
    const creatorView = await as(creator).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(creatorView.body.providers.find((p: { id: string }) => p.id === 'openai').workspaceKey.last4).toBe('');
    const audit = await db().query(
      `SELECT details FROM audit_logs WHERE workspace_id = $1 AND action = 'ai.key.save'`,
      [WS],
    );
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].details).not.toContain(WORKSPACE_KEY);
  });

  it('generation uses the workspace key, the chosen model, and charges credits', async () => {
    const save = await as(owner)
      .put(`/api/workspaces/${WS}/ai-settings`)
      .send({ textProvider: 'openai', textModel: 'gpt-6-luna' });
    expect(save.status).toBe(200);
    expect(
      (await as(creator).put(`/api/workspaces/${WS}/ai-settings`).send({ textProvider: null, textModel: null })).status,
    ).toBe(403);
    const before = await balanceOf(WS);
    const g = await as(creator).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(g.status).toBe(200);
    expect(g.body.data.caption).toBe('BYO caption');
    expect(g.body.data.aiEngine).toBe('OpenAI · gpt-6-luna (workspace key)');
    expect(seen.at(-1)).toMatchObject({
      url: 'https://api.openai.com/v1/chat/completions',
      auth: `Bearer ${WORKSPACE_KEY}`,
    });
    expect(seen.at(-1)!.body).toMatchObject({ model: 'gpt-6-luna' });
    expect(await balanceOf(WS)).toBe(before - 15);
  });

  it('deleting the key returns the workspace to sample mode (no server key in tests)', async () => {
    expect((await as(owner).delete(`/api/workspaces/${WS}/ai-keys/openai`)).status).toBe(200);
    expect((await as(owner).delete(`/api/workspaces/${WS}/ai-keys/openai`)).status).toBe(404);
    const s = await as(owner).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(s.body.active.text).toBeNull();
    const g = await as(owner).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(g.body.sample).toBe(true);
  });
});
