// ElevenLabs + D-ID against Postgres: credits, refunds, clone isolation, async video, signed links.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/app';
import { closeDb, db } from '../../server/db';
import { refreshProcessingVideos } from '../../server/media/service';
import { addMember, as as asUser, balanceOf, createUser, type TestUser } from './helpers';

vi.stubEnv('ELEVENLABS_API_KEY', 'el-test');
vi.stubEnv('DID_API_KEY', 'did-test');
vi.stubEnv('MEDIA_URL_SECRET', 'media-secret');
vi.stubEnv('PUBLIC_API_URL', 'https://api.example.com');

let talkState: 'started' | 'done' | 'error' = 'started';
let ttsFails = false;
const calls: string[] = [];
const fakeFetch = (async (url: string | URL, init: RequestInit = {}) => {
  const u = String(url);
  calls.push(`${init.method || 'GET'} ${u}`);
  if (u.endsWith('/v1/voices'))
    return Response.json({
      voices: [
        { voice_id: 'std1', name: 'Rachel', category: 'premade' },
        { voice_id: 'clone-x', name: 'Other WS clone', category: 'cloned' },
      ],
    });
  if (u.endsWith('/v1/voices/add')) return Response.json({ voice_id: `clone-${Date.now()}` });
  if (u.includes('/v1/text-to-speech/'))
    return ttsFails ? Response.json({ detail: 'boom' }, { status: 500 }) : new Response(new Uint8Array(2000).fill(7));
  if (u.endsWith('/talks') && init.method === 'POST')
    return Response.json({ id: `tlk_${Date.now()}` }, { status: 201 });
  if (u.includes('/talks/'))
    return Response.json(
      talkState === 'done'
        ? { status: 'done', result_url: 'https://results.d-id.test/v.mp4' }
        : talkState === 'error'
          ? { status: 'error', error: { description: 'No face detected' } }
          : { status: 'started' },
    );
  if (u.startsWith('https://results.d-id.test/')) return new Response(new Uint8Array(5000).fill(9));
  return Response.json({});
}) as typeof fetch;

const app = createApp({ ai: null, mediaFetch: fakeFetch });
const as = (u: TestUser) => asUser(app, u);
let owner: TestUser, creator: TestUser, viewer: TestUser, otherOwner: TestUser;
let WS: string, OTHER: string;
const m = (ws: string, p = '') => `/api/workspaces/${ws}/media${p}`;

beforeAll(async () => {
  [owner, creator, viewer, otherOwner] = await Promise.all(
    ['owner', 'creator', 'viewer', 'other'].map((l) => createUser(`media-${l}`)),
  );
  WS = (await as(owner).post('/api/workspaces').send({ name: 'Media Co' })).body.workspace.id;
  OTHER = (await as(otherOwner).post('/api/workspaces').send({ name: 'Other Co' })).body.workspace.id;
  await addMember(WS, creator.uid, 'creator');
  await addMember(WS, viewer.uid, 'viewer');
  await db().query('UPDATE workspaces SET credits_remaining = 1000 WHERE id = $1', [WS]);
  // Another workspace's clone must never be visible here.
  await db().query(
    "INSERT INTO workspace_voices (workspace_id, voice_id, name, consent_by) VALUES ($1, 'clone-x', 'Other', 'u')",
    [OTHER],
  );
});
afterAll(() => closeDb());

describe('voices', () => {
  it('lists standard voices but not other workspaces’ clones; cloning needs owner/admin and consent', async () => {
    const v = await as(creator).get(m(WS, '/voices'));
    expect(v.body.enabled).toEqual({ voice: true, video: true });
    expect(v.body.standard.map((x: { id: string }) => x.id)).toEqual(['std1']);
    const sample = Buffer.alloc(30_000, 1);
    const clone = (u: TestUser, q: string) =>
      as(u)
        .post(m(WS, `/voices/clone?${q}`))
        .set('content-type', 'audio/mpeg')
        .send(sample);
    expect((await clone(creator, 'name=Mine&consent=yes')).status).toBe(403);
    expect((await clone(owner, 'name=Mine')).body.error).toBe('CONSENT_REQUIRED');
    const ok = await clone(owner, 'name=Mine&consent=yes');
    expect(ok.status).toBe(201);
    const after = await as(creator).get(m(WS, '/voices'));
    expect(after.body.cloned.map((x: { name: string }) => x.name)).toEqual(['Mine']);
    expect((await as(otherOwner).get(m(OTHER, '/voices'))).body.cloned.map((x: { id: string }) => x.id)).toEqual([
      'clone-x',
    ]);
    // Using another workspace's clone is refused.
    expect((await as(owner).post(m(WS, '/speech')).send({ voiceId: 'clone-x', text: 'hi' })).body.error).toBe(
      'UNKNOWN_VOICE',
    );
  });
});

describe('speech', () => {
  it('charges once, stores MP3, refunds on failure, viewers cannot spend', async () => {
    const before = await balanceOf(WS);
    const r = await as(creator).post(m(WS, '/speech')).send({ voiceId: 'std1', text: 'Hello world' });
    expect(r.status).toBe(200);
    expect(r.body.media).toMatchObject({ kind: 'audio', status: 'ready' });
    expect(await balanceOf(WS)).toBe(before - 5);
    const file = await as(viewer).get(r.body.media.url);
    expect(file.headers['content-type']).toBe('audio/mpeg');
    expect(file.body.length).toBe(2000);
    expect((await as(viewer).post(m(WS, '/speech')).send({ voiceId: 'std1', text: 'x' })).status).toBe(403);
    ttsFails = true;
    const fail = await as(creator).post(m(WS, '/speech')).send({ voiceId: 'std1', text: 'Hello' });
    ttsFails = false;
    expect(fail.status).toBe(502);
    expect(fail.body.message).toMatch(/refunded/);
    expect(await balanceOf(WS)).toBe(before - 5);
  });
});

describe('talking video', () => {
  it('renders asynchronously: signed links for D-ID, then the MP4 is stored', async () => {
    talkState = 'started';
    const before = await balanceOf(WS);
    const start = await as(creator)
      .post(m(WS, '/videos'))
      .send({ voiceId: 'std1', text: 'Hi from Sophia', imageUrl: 'https://images.example.com/face.jpg' });
    expect(start.status).toBe(202);
    expect(start.body.media).toMatchObject({ kind: 'video', status: 'processing' });
    expect(await balanceOf(WS)).toBe(before - 60);
    // D-ID got our signed audio link, which works without a login (and only once signed).
    const talk = await db().query('SELECT source_media_id FROM generated_media WHERE id = $1', [start.body.media.id]);
    const audioId = talk.rows[0].source_media_id;
    expect((await request(app).get(`/api/public/media/${audioId}`)).status).toBe(403);
    const still = await as(viewer).get(m(WS, `/${start.body.media.id}`));
    expect(still.body.media.status).toBe('processing');
    talkState = 'done';
    const done = await as(viewer).get(m(WS, `/${start.body.media.id}`));
    expect(done.body.media.status).toBe('ready');
    const mp4 = await as(viewer).get(done.body.media.url);
    expect(mp4.headers['content-type']).toBe('video/mp4');
    expect(mp4.body.length).toBe(5000);
    // Public links never serve videos.
    expect((await request(app).get(`/api/public/media/${start.body.media.id}?exp=1&sig=x`)).status).toBe(403);
  });

  it('a rejected render is refunded exactly once (scheduler and poll racing)', async () => {
    talkState = 'started';
    const before = await balanceOf(WS);
    const start = await as(owner)
      .post(m(WS, '/videos'))
      .send({ voiceId: 'std1', text: 'Second', imageUrl: 'https://images.example.com/face.jpg' });
    expect(await balanceOf(WS)).toBe(before - 60);
    talkState = 'error';
    await Promise.all([refreshProcessingVideos(fakeFetch), as(owner).get(m(WS, `/${start.body.media.id}`))]);
    const item = (await as(owner).get(m(WS, `/${start.body.media.id}`))).body.media;
    expect(item.status).toBe('failed');
    expect(item.error).toMatch(/No face detected/);
    expect(await balanceOf(WS)).toBe(before);
  });

  it('rejects unusable photos before charging', async () => {
    const before = await balanceOf(WS);
    const r = await as(owner)
      .post(m(WS, '/videos'))
      .send({ voiceId: 'std1', text: 'x', imageUrl: 'http://insecure/x.jpg' });
    expect(r.body.error).toBe('BAD_IMAGE');
    expect(await balanceOf(WS)).toBe(before);
  });
});
