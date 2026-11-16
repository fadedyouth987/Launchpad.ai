// Multi-provider AI through the HTTP API (DEMO_MODE store, mocked provider HTTP, no network).
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { createAiResolver } from '../../server/llm/resolver';
import { balance, WS } from './helpers';

afterEach(() => vi.unstubAllEnvs());

function providerHttp() {
  const seen: Array<{ url: string; body: Record<string, unknown> | null; headers: Headers }> = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    seen.push({ url: u, body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers) });
    if (u.includes('api.anthropic.com/v1/messages')) {
      return Response.json({
        content: [
          {
            type: 'text',
            text: '{"caption":"Claude caption","hashtags":["#a"],"imagePrompt":"p","visualDirection":"v"}',
          },
        ],
      });
    }
    if (u.includes('api.x.ai/v1/chat/completions')) {
      return Response.json({
        choices: [
          {
            message: {
              content: '{"sentiment":"question","suggestedReplies":["r1","r2","r3"],"suggestedAction":"approve"}',
            },
          },
        ],
      });
    }
    if (u.includes('api.openai.com/v1/images/generations'))
      return Response.json({ data: [{ b64_json: '/9j/4AAQSkZJRgABAQ==' }] });
    if (u.includes('api.openai.com/v1/chat/completions'))
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    if (u.endsWith('/models') || u.includes('/models?')) return Response.json({ data: [{ id: 'live-model-1' }] });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { f, seen };
}

const app = (f: typeof fetch) => request(createApp({ aiResolver: createAiResolver(f) }));

describe('AI providers API', () => {
  it('lists every provider with its env vars and configured status; nothing configured = sample', async () => {
    const { f } = providerHttp();
    const r = await app(f).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(r.status).toBe(200);
    expect(r.body.providers.map((p: { id: string }) => p.id)).toEqual([
      'neon-gateway',
      'anthropic',
      'openai',
      'gemini',
      'xai',
      'custom',
    ]);
    expect(r.body.providers.every((p: { serverConfigured: boolean }) => !p.serverConfigured)).toBe(true);
    expect(r.body.active).toEqual({ text: null, image: null });
    expect(r.body.keyStorageEnabled).toBe(false);
    const gen = await app(f).post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(gen.body.sample).toBe(true);
    expect(gen.body.data.aiEngine).toMatch(/no AI provider is configured/);
  });

  it('requires the workspace header', async () => {
    const { f } = providerHttp();
    expect((await app(f).get('/api/ai/providers')).status).toBe(400);
  });

  it('refuses to select a provider with no key', async () => {
    const { f } = providerHttp();
    const r = await app(f)
      .put(`/api/workspaces/${WS}/ai-settings`)
      .send({ textProvider: 'anthropic', textModel: 'claude-sonnet-5-5' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('server default is used, then the workspace choice; credits are charged the same', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-server-key-123456');
    vi.stubEnv('XAI_API_KEY', 'xai-server-key-123456');
    const { f, seen } = providerHttp();
    const a = app(f);
    const before = await balance(a);
    const gen = await a.post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(gen.status).toBe(200);
    expect(gen.body).toMatchObject({ sample: false, provider: 'anthropic', costCredits: 15 });
    expect(gen.body.data.caption).toBe('Claude caption');
    expect(gen.body.data.aiEngine).toBe('Anthropic Claude · claude-sonnet-5-5');
    expect(await balance(a)).toBe(before - 15);
    expect(seen.at(-1)!.headers.get('x-api-key')).toBe('sk-ant-server-key-123456');

    const save = await a
      .put(`/api/workspaces/${WS}/ai-settings`)
      .send({ textProvider: 'xai', textModel: 'grok-4.6', imageProvider: null, imageModel: null });
    expect(save.status).toBe(200);
    const status = await a.get('/api/ai/providers').set('x-workspace-id', WS);
    expect(status.body.active.text).toMatchObject({ provider: 'xai', model: 'grok-4.6', keySource: 'server' });
    expect(JSON.stringify(status.body)).not.toContain('server-key');

    const reply = await a
      .post('/api/engagement/suggest-reply')
      .set('x-workspace-id', WS)
      .send({ commentText: 'How much is it?' });
    expect(reply.body).toMatchObject({ sentiment: 'question', provider: 'xai', model: 'grok-4.6', sample: false });
    expect(seen.at(-1)!.body).toMatchObject({ model: 'grok-4.6' });

    // Trends on a provider without web search are labelled as not grounded.
    const trendsReply = JSON.stringify([
      {
        topic: 'T',
        hotnessScore: 90,
        summary: 's',
        suggestedHashtags: [],
        suggestedHook: 'h',
        suggestedPlatform: 'linkedin',
      },
    ]);
    const f2 = (async () =>
      Response.json({ choices: [{ message: { content: trendsReply } }] })) as unknown as typeof fetch;
    const t = await app(f2).post('/api/trends').set('x-workspace-id', WS).send({});
    expect(t.body).toMatchObject({ grounded: false, provider: 'xai' });
    expect(t.body.source).toMatch(/no live web search/);

    // Back to the server default.
    await a.put(`/api/workspaces/${WS}/ai-settings`).send({ textProvider: null, textModel: null });
  });

  it('falls back to the server default when the saved provider loses its key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-server-key-123456');
    vi.stubEnv('XAI_API_KEY', 'xai-server-key-123456');
    const { f } = providerHttp();
    await app(f).put(`/api/workspaces/${WS}/ai-settings`).send({ textProvider: 'xai', textModel: 'grok-4.7' });
    vi.stubEnv('XAI_API_KEY', '');
    const s = await app(f).get('/api/ai/providers').set('x-workspace-id', WS);
    expect(s.body.active.text.provider).toBe('anthropic');
    expect(s.body.active.text.fallbackReason).toMatch(/not configured/);
    await app(f).put(`/api/workspaces/${WS}/ai-settings`).send({ textProvider: null, textModel: null });
  });

  it('validates model ids and provider names', async () => {
    const { f } = providerHttp();
    const bad = await app(f).put(`/api/workspaces/${WS}/ai-settings`).send({ textProvider: 'nope', textModel: 'x' });
    expect(bad.status).toBe(400);
    const badModel = await app(f)
      .put(`/api/workspaces/${WS}/ai-settings`)
      .send({ textProvider: null, textModel: 'has spaces; DROP' });
    expect(badModel.status).toBe(400);
  });

  it('live model list and connection test', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-server-123456');
    const { f } = providerHttp();
    const m = await app(f).get('/api/ai/providers/openai/models').set('x-workspace-id', WS);
    expect(m.body).toMatchObject({ live: true, models: ['live-model-1'] });
    const notConf = await app(f).get('/api/ai/providers/xai/models').set('x-workspace-id', WS);
    expect(notConf.body.live).toBe(false);
    const test = await app(f).post(`/api/workspaces/${WS}/ai-test`).send({});
    expect(test.body).toMatchObject({ ok: true, provider: 'openai', reply: 'OK' });
  });

  it('workspace keys are refused in demo mode', async () => {
    const { f } = providerHttp();
    const r = await app(f).put(`/api/workspaces/${WS}/ai-keys/openai`).send({ apiKey: 'sk-workspace-123456' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('NOT_AVAILABLE_IN_DEMO');
  });

  it('images: 503 without a provider (not charged); with OpenAI the image is charged, stored and served', async () => {
    const { f } = providerHttp();
    const before = await balance(app(f));
    const none = await app(f).post('/api/images/generate').send({ workspaceId: WS, prompt: 'a rocket' });
    expect(none.status).toBe(503);
    expect(none.body.error).toBe('AI_IMAGE_NOT_CONFIGURED');
    expect(await balance(app(f))).toBe(before);

    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-server-123456');
    const a = app(f);
    const r = await a.post('/api/images/generate').send({ workspaceId: WS, prompt: 'a rocket' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ costCredits: 25, engine: 'OpenAI · gpt-image-2' });
    expect(r.body.image.mimeType).toBe('image/jpeg');
    expect(await balance(a)).toBe(before - 25);
    const img = await a.get(r.body.url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');
    const list = await a.get(`/api/workspaces/${WS}/images`);
    expect(list.body.images[0].id).toBe(r.body.image.id);
  });

  it('a failed provider call refunds the credits', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-server-123456');
    const failing = (async () =>
      Response.json({ error: { message: 'boom' } }, { status: 500 })) as unknown as typeof fetch;
    const a = app(failing);
    const before = await balance(a);
    const r = await a.post('/api/generate').send({ workspaceId: WS, prompt: 'Launch' });
    expect(r.status).toBe(502);
    expect(r.body.refunded).toBe(true);
    expect(await balance(a)).toBe(before);
  });
});

describe('payments when Stripe is not configured', () => {
  it('lists packs as disabled and refuses checkout with a clear code', async () => {
    const { f } = providerHttp();
    const packs = await app(f).get('/api/billing/packs');
    expect(packs.body).toMatchObject({ enabled: false, currency: 'usd' });
    expect(packs.body.packs.length).toBe(3);
    const r = await app(f).post('/api/billing/checkout').send({ workspaceId: WS, credits: 500 });
    expect(r.status).toBe(503);
    expect(r.body.error).toBe('PAYMENTS_NOT_CONFIGURED');
  });
});

describe('Campaign OS: run a step with AI', () => {
  const body = {
    campaign: { name: 'Launch', goal: 'Leads', audience: 'CTOs', offer: 'Trial' },
    step: { title: 'Audience Research', description: 'ICP and pains', owner: 'Research Agent' },
    previous: [{ title: 'Strategy', output: 'Goals...' }],
  };
  it('without a provider the step is not run and nothing is charged', async () => {
    const { f } = providerHttp();
    const before = await balance(app(f));
    const r = await app(f).post('/api/campaigns/run-step').set('x-workspace-id', WS).send(body);
    expect(r.body).toMatchObject({ sample: true, output: null });
    expect(await balance(app(f))).toBe(before);
  });
  it('with a provider the output is returned, fenced as user data, and charged 5 credits', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-server-key-123456');
    const { f, seen } = providerHttp();
    const a = app(f);
    const before = await balance(a);
    const r = await a.post('/api/campaigns/run-step').set('x-workspace-id', WS).send(body);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ sample: false, provider: 'anthropic', costCredits: 5 });
    expect(r.body.output.length).toBeGreaterThan(0);
    expect(await balance(a)).toBe(before - 5);
    const sent = seen.at(-1)!.body as { system: string; messages: Array<{ content: string }> };
    expect(sent.system).not.toContain('CTOs');
    expect(sent.messages[0].content).toContain('<user_input name="audience">');
  });
  it('validates the body', async () => {
    const { f } = providerHttp();
    const r = await app(f).post('/api/campaigns/run-step').set('x-workspace-id', WS).send({ step: {} });
    expect(r.status).toBe(400);
  });
});
