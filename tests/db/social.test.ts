// LinkedIn publishing against Postgres: server-side approval, publish now, never-twice, scheduler.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { saveAccount, publishDue } from '../../server/social/service';
import { initialCampaignAssets } from '../../src/data/initialData';
import { addMember, as as asUser, createUser, type TestUser } from './helpers';

vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', 'b'.repeat(64));
vi.stubEnv('LINKEDIN_CLIENT_ID', 'cid');
vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'csecret');
vi.stubEnv('LINKEDIN_REDIRECT_URI', 'https://api.example.com/api/social/linkedin/callback');
vi.stubEnv('CRON_SECRET', 'test-cron-secret-123456');

let postCount = 0;
let failNext = false;
const linkedinFetch = (async (url: string | URL) => {
  if (String(url).endsWith('/rest/posts')) {
    if (failNext) {
      failNext = false;
      return Response.json({ message: 'boom' }, { status: 500 });
    }
    postCount++;
    return new Response(null, { status: 201, headers: { 'x-restli-id': `urn:li:share:${postCount}` } });
  }
  if (String(url).endsWith('/oauth/v2/accessToken')) {
    return Response.json({ access_token: 'tok-oauth', expires_in: 3600, scope: 'openid profile w_member_social' });
  }
  if (String(url).endsWith('/v2/userinfo')) return Response.json({ sub: 'member123', name: 'Test Member' });
  return Response.json({});
}) as typeof fetch;

const app = createApp({ ai: null, socialFetch: linkedinFetch });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, approver: TestUser;
let WS: string;

const asset = (id: string, extra: Record<string, unknown> = {}) => ({
  ...structuredClone(initialCampaignAssets[0]),
  id,
  platform: 'linkedin',
  imageId: undefined,
  ...extra,
});
const put = (u: TestUser, a: ReturnType<typeof asset>) =>
  as(u).put(`/api/workspaces/${WS}/campaign-assets/${a.id}`).send(a);
const statusOf = async (id: string) =>
  (await db().query("SELECT data->>'status' AS s FROM campaign_assets WHERE id = $1", [id])).rows[0]?.s;

beforeAll(async () => {
  [owner, creator, approver] = await Promise.all(['owner', 'creator', 'approver'].map((l) => createUser(`soc-${l}`)));
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Social Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
  await addMember(WS, approver.uid, 'approver');
});
afterAll(() => closeDb());

describe('server-side approval', () => {
  it('creators cannot approve or schedule; approvers can; writers can reschedule an approved post', async () => {
    const id = `asset-soc-${Date.now()}-a`;
    expect((await put(creator, asset(id, { status: 'pending_review' }))).status).toBe(201);
    const denied = await put(creator, asset(id, { status: 'scheduled', scheduledTime: new Date().toISOString() }));
    expect(denied.status).toBe(403);
    expect(denied.body.error).toBe('APPROVAL_REQUIRED');
    expect((await put(creator, asset(`${id}-new`, { status: 'approved' }))).status).toBe(403);
    expect((await put(approver, asset(id, { status: 'approved' }))).status).toBe(200);
    expect(
      (await put(creator, asset(id, { status: 'scheduled', scheduledTime: '2030-01-01T09:00:00.000Z' }))).status,
    ).toBe(200);
  });

  it("a writer's content edit to a cleared post sends it back for review; approvers' edits stay cleared", async () => {
    const id = `asset-soc-${Date.now()}-e`;
    const when = { status: 'scheduled' as const, scheduledTime: '2030-01-01T09:00:00.000Z' };
    expect((await put(approver, asset(id, when))).status).toBe(201);
    // Rescheduling alone keeps it cleared.
    const moved = await put(creator, asset(id, { ...when, scheduledTime: '2030-01-02T09:00:00.000Z' }));
    expect(moved.body.status).toBe('scheduled');
    // Changing the approved text does not: it is saved as pending review, so the scheduler skips it.
    const edited = await put(creator, asset(id, { ...when, caption: 'Unreviewed text' }));
    expect(edited.status).toBe(200);
    expect(edited.body.status).toBe('pending_review');
    const { rows } = await db().query("SELECT data->>'status' AS s FROM campaign_assets WHERE id = $1", [id]);
    expect(rows[0].s).toBe('pending_review');
    // An approver may edit a cleared post without losing the approval.
    expect((await put(approver, asset(id, { ...when, caption: 'Approved text' }))).body.status).toBe('scheduled');
  });

  it('a rejected post can only be cleared again by an approver', async () => {
    const id = `asset-soc-${Date.now()}-r`;
    expect((await put(creator, asset(id, { status: 'rejected' }))).status).toBe(201);
    const denied = await put(creator, asset(id, { status: 'approved' }));
    expect(denied.status).toBe(403);
    expect(await statusOf(id)).toBe('rejected');
    expect((await put(approver, asset(id, { status: 'approved' }))).body.status).toBe('approved');
  });
});

describe('LinkedIn publishing', () => {
  beforeAll(async () => {
    await saveAccount({
      workspaceId: WS,
      provider: 'linkedin',
      externalId: 'member123',
      displayName: 'Test Member',
      avatarUrl: '',
      accessToken: 'tok',
      expiresInSec: 3600,
      uid: owner.uid,
    });
  });

  it('lists the account without the token', async () => {
    const r = await as(creator).get(`/api/workspaces/${WS}/social/accounts`);
    expect(r.body.available.linkedin).toBe(true);
    expect(r.body.accounts[0]).toMatchObject({ provider: 'linkedin', displayName: 'Test Member', expired: false });
    expect(JSON.stringify(r.body)).not.toContain('tok');
    const raw = (await db().query('SELECT token_ciphertext FROM social_accounts WHERE workspace_id = $1', [WS]))
      .rows[0];
    expect(raw.token_ciphertext).toMatch(/^v1\./);
  });

  it('publish now: approvers only, approved posts only, and never twice', async () => {
    const id = `asset-soc-${Date.now()}-p`;
    await put(owner, asset(id, { status: 'pending_review' }));
    expect((await as(creator).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`)).status).toBe(403);
    const notApproved = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(notApproved.body.error).toBe('NOT_APPROVED');
    await put(owner, asset(id, { status: 'approved' }));
    const before = postCount;
    const ok = await as(approver).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^https:\/\/www\.linkedin\.com\/feed\/update\/urn:li:share:/);
    expect(await statusOf(id)).toBe('published');
    const again = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(again.body.error).toBe('ALREADY_PUBLISHED');
    expect(postCount).toBe(before + 1);
  });

  it('a failed post is recorded and can be retried by hand', async () => {
    const id = `asset-soc-${Date.now()}-f`;
    await put(owner, asset(id, { status: 'approved' }));
    failNext = true;
    const fail = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(fail.status).toBe(502);
    expect(fail.body.status).toBe('failed');
    const posts = (await as(creator).get(`/api/workspaces/${WS}/social/posts`)).body.posts;
    expect(posts.find((p: { assetId: string }) => p.assetId === id)).toMatchObject({ status: 'failed' });
    const retry = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(retry.status).toBe(200);
    expect(
      (await as(creator).get(`/api/workspaces/${WS}/social/posts`)).body.posts.find(
        (p: { assetId: string }) => p.assetId === id,
      ),
    ).toMatchObject({
      status: 'published',
      attempts: 2,
    });
  });

  it('the scheduler posts due scheduled posts once, skips future ones, and concurrent runs do not double-post', async () => {
    const due = `asset-soc-${Date.now()}-due`;
    const later = `asset-soc-${Date.now()}-later`;
    await put(owner, asset(due, { status: 'scheduled', scheduledTime: new Date(Date.now() - 60_000).toISOString() }));
    await put(
      owner,
      asset(later, { status: 'scheduled', scheduledTime: new Date(Date.now() + 3_600_000).toISOString() }),
    );
    await Promise.all([publishDue({ fetchImpl: linkedinFetch }), publishDue({ fetchImpl: linkedinFetch })]);
    // Assert on this test's own asset only: the shared test branch may hold other workspaces' due posts.
    const rows = (await db().query('SELECT status, attempts FROM social_posts WHERE asset_id = $1', [due])).rows;
    expect(rows).toEqual([{ status: 'published', attempts: 1 }]);
    expect(await statusOf(due)).toBe('published');
    expect(await statusOf(later)).toBe('scheduled');
    // The HTTP endpoint needs the cron secret.
    expect((await request(app).post('/api/internal/publish-due')).status).toBe(401);
    const ok = await request(app)
      .post('/api/internal/publish-due')
      .set('authorization', 'Bearer test-cron-secret-123456');
    expect(ok.body.success).toBe(true);
  });

  it('LinkedIn sign-in is finished only by the member who started it', async () => {
    const start = await as(owner).post(`/api/workspaces/${WS}/social/linkedin/connect`);
    const state = new URL(start.body.url).searchParams.get('state')!;
    // A tampered state never reaches LinkedIn.
    const bad = await request(app).get(`/api/social/linkedin/callback?code=c&state=${state.slice(0, -4)}AAAA`);
    expect(bad.status).toBe(302);
    expect(bad.headers.location).toContain('reason=INVALID_STATE');
    // A non-string error parameter does not hang the request.
    expect((await request(app).get('/api/social/linkedin/callback?error[x]=1')).status).toBe(302);
    // The callback saves nothing; it hands the sealed result back to the web app.
    const cb = await request(app).get(`/api/social/linkedin/callback?code=c&state=${encodeURIComponent(state)}`);
    const back = new URL(cb.headers.location);
    expect(back.searchParams.get('social')).toBe('pending');
    const pending = back.searchParams.get('pending')!;
    // Someone else (e.g. the person a connect link was sent to) cannot finish it.
    const stolen = await as(creator).post(`/api/workspaces/${WS}/social/linkedin/complete`).send({ pending });
    expect(stolen.status).toBe(403);
    expect(stolen.body.error).toBe('NOT_YOUR_CONNECTION');
    const tampered = await as(owner)
      .post(`/api/workspaces/${WS}/social/linkedin/complete`)
      .send({ pending: pending.slice(0, -4) + 'AAAA' });
    expect(tampered.body.error).toBe('INVALID_STATE');
    const ok = await as(owner).post(`/api/workspaces/${WS}/social/linkedin/complete`).send({ pending });
    expect(ok.status).toBe(200);
    expect(ok.body.accounts[0]).toMatchObject({ provider: 'linkedin', externalId: 'member123' });
  });

  it('publishing a non-LinkedIn post answers with a code', async () => {
    const id = `asset-soc-${Date.now()}-ig`;
    await put(owner, asset(id, { status: 'approved', platform: 'instagram' }));
    const r = await as(owner).post(`/api/workspaces/${WS}/campaign-assets/${id}/publish`);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('PLATFORM_NOT_SUPPORTED');
  });

  it('owners can disconnect; creators cannot', async () => {
    const acc = (await as(owner).get(`/api/workspaces/${WS}/social/accounts`)).body.accounts[0];
    expect((await as(creator).delete(`/api/workspaces/${WS}/social/accounts/${acc.id}`)).status).toBe(403);
    expect((await as(owner).delete(`/api/workspaces/${WS}/social/accounts/${acc.id}`)).status).toBe(200);
    expect((await as(owner).get(`/api/workspaces/${WS}/social/accounts`)).body.accounts).toEqual([]);
  });
});
