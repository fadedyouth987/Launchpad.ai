import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  authorizeUrl,
  buildCommentary,
  escapeLittleText,
  exchangeCode,
  LinkedInError,
  publishPost,
} from '../../server/social/linkedin';
import { makeState, readState } from '../../server/social/service';
import { createApp } from '../../server/app';

const KEY = 'a'.repeat(64);

afterEach(() => vi.unstubAllEnvs());

function stubLinkedIn() {
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'cid');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'csecret');
  vi.stubEnv('LINKEDIN_REDIRECT_URI', 'https://api.example.com/api/social/linkedin/callback');
}

describe('LinkedIn text', () => {
  it('escapes every "little text" reserved character', () => {
    expect(escapeLittleText('a(b)[c]{d}<e>@f#g*h_i~j|k\\l')).toBe(
      'a\\(b\\)\\[c\\]\\{d\\}\\<e\\>\\@f\\#g\\*h\\_i\\~j\\|k\\\\l',
    );
  });

  it('turns hashtags into LinkedIn hashtag markup and strips junk', () => {
    expect(buildCommentary('Launch day (finally)!', ['#AI', 'Growth Hacks', '##', '#co-op'])).toBe(
      'Launch day \\(finally\\)!\n\n{hashtag|\\#|AI} {hashtag|\\#|GrowthHacks} {hashtag|\\#|coop}',
    );
    expect(buildCommentary('Just text', [])).toBe('Just text');
  });

  it('rejects posts over 3,000 characters', () => {
    expect(() => buildCommentary('x'.repeat(3001), [])).toThrow(LinkedInError);
  });
});

describe('LinkedIn API calls', () => {
  it('builds the sign-in URL with the posting scope', () => {
    stubLinkedIn();
    const u = new URL(authorizeUrl('st'));
    expect(u.origin + u.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(u.searchParams.get('scope')).toBe('openid profile w_member_social');
    expect(u.searchParams.get('redirect_uri')).toBe('https://api.example.com/api/social/linkedin/callback');
    expect(u.searchParams.get('state')).toBe('st');
  });

  it('refuses a token that lacks w_member_social', async () => {
    stubLinkedIn();
    const f = (async () =>
      Response.json({ access_token: 't', expires_in: 100, scope: 'openid,profile' })) as typeof fetch;
    await expect(exchangeCode('c', f)).rejects.toMatchObject({ reconnect: true });
  });

  it('posts text + image: initializeUpload, PUT bytes, then /rest/posts with the image urn', async () => {
    const calls: Array<{ url: string; method: string; headers: Headers; body: unknown }> = [];
    const f = (async (url: string | URL, init: RequestInit = {}) => {
      const u = String(url);
      calls.push({ url: u, method: init.method || 'GET', headers: new Headers(init.headers), body: init.body });
      if (u.includes('initializeUpload'))
        return Response.json({ value: { uploadUrl: 'https://upload.linkedin.test/img1', image: 'urn:li:image:C1' } });
      if (u.startsWith('https://upload.linkedin.test')) return new Response(null, { status: 201 });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:777' } });
    }) as typeof fetch;
    const out = await publishPost(
      {
        accessToken: 'tok',
        memberId: 'abc123',
        caption: 'Hello',
        hashtags: ['#Launch'],
        image: { mimeType: 'image/png', data: Buffer.from([1, 2, 3]), altText: 'Alt' },
      },
      f,
    );
    expect(out).toEqual({ postId: 'urn:li:share:777', url: 'https://www.linkedin.com/feed/update/urn:li:share:777/' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.linkedin.com/rest/images?action=initializeUpload',
      'https://upload.linkedin.test/img1',
      'https://api.linkedin.com/rest/posts',
    ]);
    const post = calls[2];
    expect(post.headers.get('authorization')).toBe('Bearer tok');
    expect(post.headers.get('linkedin-version')).toMatch(/^\d{6}$/);
    expect(post.headers.get('x-restli-protocol-version')).toBe('2.0.0');
    expect(JSON.parse(String(post.body))).toMatchObject({
      author: 'urn:li:person:abc123',
      commentary: 'Hello\n\n{hashtag|\\#|Launch}',
      visibility: 'PUBLIC',
      lifecycleState: 'PUBLISHED',
      content: { media: { id: 'urn:li:image:C1', altText: 'Alt' } },
    });
  });

  it('maps LinkedIn errors to actionable messages', async () => {
    const reply = (status: number) => (async () => Response.json({ message: 'nope' }, { status })) as typeof fetch;
    const args = { accessToken: 't', memberId: 'm', caption: 'x', hashtags: [] };
    await expect(publishPost(args, reply(401))).rejects.toMatchObject({ status: 401, reconnect: true });
    await expect(publishPost(args, reply(426))).rejects.toThrow(/LINKEDIN_API_VERSION/);
    await expect(publishPost(args, reply(429))).rejects.toThrow(/limit/);
  });
});

describe('OAuth state', () => {
  it('round-trips, and rejects tampering, the wrong provider and expiry', () => {
    vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', KEY);
    const s = makeState('ws_1', 'user_1', 'linkedin');
    expect(readState(s, 'linkedin')).toEqual({ workspaceId: 'ws_1', uid: 'user_1' });
    const bad = s.slice(0, -4) + (s.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => readState(bad, 'linkedin')).toThrow(/Invalid/);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(() => readState(s, 'linkedin')).toThrow(/expired/);
    vi.useRealTimers();
  });
});

describe('publish scheduler endpoint', () => {
  it('needs CRON_SECRET (or a Neon trigger call on Neon Functions)', async () => {
    const app = createApp({ ai: null });
    expect((await request(app).post('/api/internal/publish-due')).status).toBe(401);
    // The Neon header alone is not enough outside Neon Functions (anyone could send it there).
    expect((await request(app).post('/api/internal/publish-due').set('x-neon-trigger-invocation-id', 'x')).status).toBe(
      401,
    );
    vi.stubEnv('CRON_SECRET', 'a-long-enough-cron-secret');
    expect(
      (await request(app).post('/api/internal/publish-due').set('authorization', 'Bearer wrong-secret-value!!')).status,
    ).toBe(401);
    const ok = await request(app)
      .post('/api/internal/publish-due')
      .set('authorization', 'Bearer a-long-enough-cron-secret');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ success: true, checked: 0 });
  });

  it('reports LinkedIn as not configured in demo mode', async () => {
    const r = await request(createApp({ ai: null })).get('/api/workspaces/ws-acme-enterprise/social/accounts');
    expect(r.body).toMatchObject({ available: { linkedin: false }, accounts: [] });
  });
});
