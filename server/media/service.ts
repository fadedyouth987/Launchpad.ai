/**
 * Voice and talking-head video for AI influencers.
 *
 * Speech: ElevenLabs renders MP3 immediately (charged AI_VOICE_COST_CREDITS, refunded on failure).
 * Video: speech first, then D-ID animates the photo with that audio. D-ID works asynchronously, so the
 * video row stays 'processing' until a status check (the browser polling, or the minute scheduler)
 * sees it done and copies the MP4 into the database. Failed or timed-out renders are refunded once.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DEMO_MODE } from '../auth';
import { db } from '../db';
import { ApiError } from '../errors';
import { refundCredits, reserveCredits } from '../credits';
import { recordAudit } from '../audit';
import { textToSpeech, listVoices, cloneVoice, deleteVoice, elevenLabsConfigured, type Voice } from './elevenlabs';
import { createTalk, didConfigured, downloadResult, getTalk } from './did';

const cost = (name: string, fallback: number) => {
  const n = Number(process.env[name] ?? fallback);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};
export const VOICE_COST = cost('AI_VOICE_COST_CREDITS', 5);
/** Includes the speech it is made from. */
export const VIDEO_COST = cost('AI_VIDEO_COST_CREDITS', 60);
const VIDEO_TIMEOUT_MIN = 20;
/** Cloned voices per workspace (AI_VOICE_CLONE_LIMIT, default 5). */
export const MAX_CLONED_VOICES = cost('AI_VOICE_CLONE_LIMIT', 5);

/** Errors thrown after credits were reserved and then refunded (so the message may say so). */
export const refundedErrors = new WeakSet<object>();

export const voiceEnabled = () => !DEMO_MODE && elevenLabsConfigured();
export const videoEnabled = () => voiceEnabled() && didConfigured() && Boolean(signingSecret());

type Fetch = typeof fetch;

// ---------------------------------------------------------------- Signed public links (for D-ID)

function signingSecret(): string {
  return (
    process.env.MEDIA_URL_SECRET?.trim() ||
    process.env.AI_KEYS_ENCRYPTION_KEY?.trim() ||
    process.env.DID_API_KEY?.trim() ||
    ''
  );
}
const sign = (id: string, exp: number) =>
  createHmac('sha256', `media-url:${signingSecret()}`).update(`${id}.${exp}`).digest('base64url');

/** A link D-ID can fetch for one hour, without a login. */
export function signedMediaUrl(apiBase: string, id: string, ttlSec = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${apiBase.replace(/\/+$/, '')}/api/public/media/${id}?exp=${exp}&sig=${sign(id, exp)}`;
}

export function verifyMediaSignature(id: string, exp: string | undefined, sig: string | undefined): boolean {
  if (!signingSecret() || !exp || !sig || !/^\d{1,12}$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(id, Number(exp)));
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- Media rows

export interface MediaItem {
  id: string;
  kind: 'audio' | 'video' | 'image';
  status: 'processing' | 'ready' | 'failed';
  influencerId: string | null;
  script: string;
  voiceId: string | null;
  provider: string;
  mimeType: string | null;
  bytes: number;
  error: string | null;
  costCredits: number;
  createdAt: string;
  url: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toItem = (r: any): MediaItem => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  influencerId: r.influencer_id,
  script: r.script,
  voiceId: r.voice_id,
  provider: r.provider,
  mimeType: r.mime_type,
  bytes: Number(r.bytes ?? 0),
  error: r.error,
  costCredits: Number(r.cost_credits),
  createdAt: new Date(r.created_at).toISOString(),
  url: r.status === 'ready' ? `/api/workspaces/${r.workspace_id}/media/${r.id}/content` : null,
});

const COLS = `id, workspace_id, kind, status, influencer_id, script, voice_id, provider, mime_type,
  coalesce(octet_length(data), 0) AS bytes, error, cost_credits, created_at`;

export async function listMedia(workspaceId: string, influencerId?: string): Promise<MediaItem[]> {
  if (DEMO_MODE) return [];
  const { rows } = await db().query(
    `SELECT ${COLS} FROM generated_media WHERE workspace_id = $1 AND kind IN ('audio', 'video')
       AND ($2::text IS NULL OR influencer_id = $2) ORDER BY created_at DESC LIMIT 50`,
    [workspaceId, influencerId ?? null],
  );
  return rows.map(toItem);
}

export async function getMedia(workspaceId: string, id: string): Promise<MediaItem | null> {
  const { rows } = await db().query(`SELECT ${COLS} FROM generated_media WHERE workspace_id = $1 AND id = $2`, [
    workspaceId,
    id,
  ]);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function getMediaContent(workspaceId: string | null, id: string) {
  const { rows } = await db().query(
    `SELECT mime_type, data, kind FROM generated_media WHERE id = $1 AND status = 'ready' AND ($2::text IS NULL OR workspace_id = $2)`,
    [id, workspaceId],
  );
  return rows[0] ? { mimeType: rows[0].mime_type as string, data: rows[0].data as Buffer, kind: rows[0].kind } : null;
}

export async function deleteMedia(workspaceId: string, id: string): Promise<boolean> {
  const r = await db().query(
    `DELETE FROM generated_media WHERE workspace_id = $1 AND id = $2 AND status <> 'processing'`,
    [workspaceId, id],
  );
  return Boolean(r.rowCount);
}

async function insertMedia(m: {
  workspaceId: string;
  uid: string;
  kind: 'audio' | 'video' | 'image';
  status: 'processing' | 'ready';
  influencerId?: string | null;
  script?: string;
  voiceId?: string | null;
  provider: string;
  providerJobId?: string | null;
  sourceMediaId?: string | null;
  mimeType?: string | null;
  data?: Buffer | null;
  costCredits?: number;
  reservationId?: string | null;
}): Promise<string> {
  const id = `med-${randomUUID()}`;
  await db().query(
    `INSERT INTO generated_media (id, workspace_id, user_id, kind, status, influencer_id, script, voice_id, provider,
       provider_job_id, source_media_id, mime_type, data, cost_credits, reservation_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      m.workspaceId,
      m.uid,
      m.kind,
      m.status,
      m.influencerId ?? null,
      (m.script ?? '').slice(0, 5000),
      m.voiceId ?? null,
      m.provider,
      m.providerJobId ?? null,
      m.sourceMediaId ?? null,
      m.mimeType ?? null,
      m.data ?? null,
      m.costCredits ?? 0,
      m.reservationId ?? null,
    ],
  );
  return id;
}

// ---------------------------------------------------------------- Voices

let voiceCache: { at: number; voices: Voice[] } | null = null;

/** Standard ElevenLabs voices plus this workspace's own clones (never other workspaces' clones). */
export async function workspaceVoices(workspaceId: string, fetchImpl?: Fetch) {
  if (!voiceCache || Date.now() - voiceCache.at > 10 * 60_000) {
    voiceCache = { at: Date.now(), voices: await listVoices(fetchImpl) };
  }
  const own = (await db().query('SELECT voice_id, name FROM workspace_voices WHERE workspace_id = $1', [workspaceId]))
    .rows as Array<{ voice_id: string; name: string }>;
  const ownIds = new Set(own.map((v) => v.voice_id));
  // Which of the account's voices are some workspace's clone (only those ids, not the whole table).
  const allCloned = new Set(
    (
      await db().query('SELECT voice_id FROM workspace_voices WHERE voice_id = ANY($1::text[])', [
        voiceCache.voices.map((v) => v.id),
      ])
    ).rows.map((r) => r.voice_id as string),
  );
  const standard = voiceCache.voices.filter(
    (v) => !allCloned.has(v.id) && ['premade', 'professional', 'generated', 'famous'].includes(v.category),
  );
  return {
    standard,
    cloned: own.map((v) => ({
      id: v.voice_id,
      name: v.name,
      category: 'cloned',
      description: 'Cloned for this workspace',
      previewUrl: voiceCache!.voices.find((x) => x.id === v.voice_id)?.previewUrl ?? '',
    })),
    isAllowed: (id: string) => ownIds.has(id) || standard.some((v) => v.id === id),
  };
}

export async function addClonedVoice(
  workspaceId: string,
  uid: string,
  opts: { name: string; sample: Buffer; mimeType: string },
  fetchImpl?: Fetch,
) {
  // All workspaces share the server's ElevenLabs account and its voice slots, so each gets a few.
  const n = (await db().query('SELECT count(*)::int AS n FROM workspace_voices WHERE workspace_id = $1', [workspaceId]))
    .rows[0].n;
  if (n >= MAX_CLONED_VOICES) {
    throw new ApiError(
      409,
      'VOICE_LIMIT',
      `A workspace can have at most ${MAX_CLONED_VOICES} cloned voices. Delete one to add another.`,
    );
  }
  const voiceId = await cloneVoice({ ...opts, description: `Launchpad workspace ${workspaceId}` }, fetchImpl);
  try {
    await db().query(
      'INSERT INTO workspace_voices (workspace_id, voice_id, name, consent_by) VALUES ($1, $2, $3, $4)',
      [workspaceId, voiceId, opts.name, uid],
    );
  } catch (err) {
    // Do not leave an orphan voice taking a slot in the ElevenLabs account.
    await deleteVoice(voiceId, fetchImpl).catch(() => undefined);
    throw err;
  }
  voiceCache = null;
  return voiceId;
}

export async function removeClonedVoice(workspaceId: string, voiceId: string, fetchImpl?: Fetch): Promise<boolean> {
  const r = await db().query('DELETE FROM workspace_voices WHERE workspace_id = $1 AND voice_id = $2', [
    workspaceId,
    voiceId,
  ]);
  if (!r.rowCount) return false;
  await deleteVoice(voiceId, fetchImpl).catch((err) =>
    console.warn('[media] ElevenLabs voice delete failed (removed from workspace anyway):', (err as Error).message),
  );
  voiceCache = null;
  return true;
}

// ---------------------------------------------------------------- Speech and video

async function withRefund<T>(
  uid: string,
  workspaceId: string,
  amount: number,
  reservationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await refundCredits(uid, workspaceId, amount, reservationId).catch(async (refundErr) => {
      console.error('[media] REFUND FAILED', reservationId, (refundErr as Error).message);
      await recordAudit({
        workspaceId,
        uid,
        action: 'billing.refund.failed',
        severity: 'critical',
        details: `Refund of ${amount} credits failed for reservation ${reservationId}.`,
      });
    });
    if (err && typeof err === 'object') refundedErrors.add(err);
    throw err;
  }
}

/** Renders speech now. */
export async function createSpeech(
  uid: string,
  workspaceId: string,
  opts: { voiceId: string; text: string; speed?: number; influencerId?: string | null },
  fetchImpl?: Fetch,
) {
  const voices = await workspaceVoices(workspaceId, fetchImpl);
  if (!voices.isAllowed(opts.voiceId)) throw new ApiError(400, 'UNKNOWN_VOICE', 'That voice is not available here.');
  const res = await reserveCredits(uid, workspaceId, VOICE_COST, { description: 'AI Voice (ElevenLabs)' });
  return withRefund(uid, workspaceId, VOICE_COST, res.reservationId, async () => {
    const audio = await textToSpeech(opts, fetchImpl);
    const id = await insertMedia({
      workspaceId,
      uid,
      kind: 'audio',
      status: 'ready',
      influencerId: opts.influencerId,
      script: opts.text,
      voiceId: opts.voiceId,
      provider: 'elevenlabs',
      mimeType: 'audio/mpeg',
      data: audio,
      costCredits: VOICE_COST,
    });
    return { media: (await getMedia(workspaceId, id))!, newBalance: res.newBalance };
  });
}

const DATA_IMAGE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/** Starts a talking-head video. `apiBase` is this API's public origin (D-ID fetches the inputs from it). */
export async function startVideo(
  uid: string,
  workspaceId: string,
  opts: { voiceId: string; text: string; speed?: number; imageUrl: string; influencerId?: string | null },
  apiBase: string,
  fetchImpl?: Fetch,
) {
  if (/^https?:\/\/(localhost|127\.|\[::1\])/i.test(apiBase)) {
    throw new ApiError(
      400,
      'PUBLIC_URL_REQUIRED',
      'D-ID must download the photo and audio from this server, which is not reachable from the internet. Set PUBLIC_API_URL.',
    );
  }
  const voices = await workspaceVoices(workspaceId, fetchImpl);
  if (!voices.isAllowed(opts.voiceId)) throw new ApiError(400, 'UNKNOWN_VOICE', 'That voice is not available here.');

  // Resolve the photo before charging: https URLs go to D-ID as-is; uploads and generated images are
  // copied into a media row and served through a signed link.
  let image: { url?: string; mimeType?: string; data?: Buffer } = {};
  const gen = /^\/api\/workspaces\/[^/]+\/images\/(img-[A-Za-z0-9_-]{1,100})$/.exec(opts.imageUrl);
  const dataUrl = DATA_IMAGE.exec(opts.imageUrl);
  if (/^https:\/\//.test(opts.imageUrl)) image = { url: opts.imageUrl };
  else if (dataUrl) image = { mimeType: dataUrl[1], data: Buffer.from(dataUrl[2], 'base64') };
  else if (gen) {
    const row = (
      await db().query('SELECT mime_type, data FROM generated_images WHERE workspace_id = $1 AND id = $2', [
        workspaceId,
        gen[1],
      ])
    ).rows[0];
    if (!row || row.mime_type === 'image/gif') throw new ApiError(400, 'BAD_IMAGE', 'That image cannot be used.');
    image = { mimeType: row.mime_type, data: row.data };
  } else {
    throw new ApiError(
      400,
      'BAD_IMAGE',
      'The avatar must be an https image URL, an uploaded image or a generated image.',
    );
  }
  if (image.data && (image.data.length < 100 || image.data.length > 10 * 1024 * 1024)) {
    throw new ApiError(400, 'BAD_IMAGE', 'The avatar image must be under 10 MB.');
  }

  const res = await reserveCredits(uid, workspaceId, VIDEO_COST, {
    description: 'AI Talking video (ElevenLabs + D-ID)',
  });
  return withRefund(uid, workspaceId, VIDEO_COST, res.reservationId, async () => {
    const audio = await textToSpeech(opts, fetchImpl);
    const audioId = await insertMedia({
      workspaceId,
      uid,
      kind: 'audio',
      status: 'ready',
      influencerId: opts.influencerId,
      script: opts.text,
      voiceId: opts.voiceId,
      provider: 'elevenlabs',
      mimeType: 'audio/mpeg',
      data: audio,
    });
    let imageUrl = image.url;
    if (!imageUrl) {
      const imgId = await insertMedia({
        workspaceId,
        uid,
        kind: 'image',
        status: 'ready',
        provider: 'upload',
        mimeType: image.mimeType,
        data: image.data,
      });
      imageUrl = signedMediaUrl(apiBase, imgId);
    }
    const talkId = await createTalk({ imageUrl, audioUrl: signedMediaUrl(apiBase, audioId) }, fetchImpl);
    const id = await insertMedia({
      workspaceId,
      uid,
      kind: 'video',
      status: 'processing',
      influencerId: opts.influencerId,
      script: opts.text,
      voiceId: opts.voiceId,
      provider: 'd-id',
      providerJobId: talkId,
      sourceMediaId: audioId,
      costCredits: VIDEO_COST,
      reservationId: res.reservationId,
    });
    await recordAudit({
      workspaceId,
      uid,
      action: 'ai.video.started',
      details: `Started a talking-head video (${VIDEO_COST} credits, D-ID job ${talkId}).`,
    });
    return { media: (await getMedia(workspaceId, id))!, newBalance: res.newBalance };
  });
}

/**
 * Checks a processing video with D-ID and finishes it (store MP4) or fails it (refund once).
 * Concurrent checks are safe: only the one whose UPDATE matches status='processing' wins.
 */
export async function refreshVideo(workspaceId: string, id: string, fetchImpl?: Fetch): Promise<MediaItem | null> {
  const row = (
    await db().query(
      `SELECT user_id, provider_job_id, cost_credits, reservation_id, created_at FROM generated_media
        WHERE workspace_id = $1 AND id = $2 AND kind = 'video' AND status = 'processing'`,
      [workspaceId, id],
    )
  ).rows[0];
  if (!row) return getMedia(workspaceId, id);
  const fail = async (error: string) => {
    const upd = await db().query(
      `UPDATE generated_media SET status = 'failed', error = $3, updated_at = now()
        WHERE workspace_id = $1 AND id = $2 AND status = 'processing' RETURNING id`,
      [workspaceId, id, error.slice(0, 1000)],
    );
    if (upd.rowCount && row.reservation_id) {
      await refundCredits(row.user_id, workspaceId, Number(row.cost_credits), row.reservation_id).catch((err) =>
        console.error('[media] video refund failed', id, (err as Error).message),
      );
    }
  };
  try {
    const status = await getTalk(row.provider_job_id, fetchImpl);
    if (status.state === 'done') {
      const data = await downloadResult(status.resultUrl, fetchImpl);
      await db().query(
        `UPDATE generated_media SET status = 'ready', mime_type = 'video/mp4', data = $3, updated_at = now()
          WHERE workspace_id = $1 AND id = $2 AND status = 'processing'`,
        [workspaceId, id, data],
      );
    } else if (status.state === 'failed') {
      await fail(`${status.error} Your credits were refunded.`);
    }
  } catch (err) {
    // Network blips: leave it processing and try again next time (the timeout below still applies).
    console.warn('[media] video status check failed', id, (err as Error).message);
  }
  // The timeout applies whatever happened above (D-ID unreachable, the job gone, a download that keeps
  // failing): a video is never left processing, with its credits held, for longer than this. A no-op if
  // the video was finished above.
  if (Date.now() - new Date(row.created_at).getTime() > VIDEO_TIMEOUT_MIN * 60_000) {
    await fail(`D-ID did not finish within ${VIDEO_TIMEOUT_MIN} minutes. Your credits were refunded.`);
  }
  return getMedia(workspaceId, id);
}

/**
 * Background pass (minute scheduler): finishes videos nobody is watching. Least recently checked first,
 * so a slow job cannot hold the others back, and it stops starting checks once `budgetMs` has passed.
 */
export async function refreshProcessingVideos(fetchImpl?: Fetch, budgetMs = 25_000) {
  if (DEMO_MODE || !didConfigured()) return { checked: 0 };
  const until = Date.now() + budgetMs;
  const { rows } = await db().query(
    `SELECT workspace_id, id FROM generated_media WHERE status = 'processing' AND kind = 'video'
      ORDER BY updated_at LIMIT 20`,
  );
  let checked = 0;
  for (const r of rows) {
    if (Date.now() > until) break;
    // Mark it checked so the next pass starts with the others.
    await db().query('UPDATE generated_media SET updated_at = now() WHERE id = $1 AND status = $2', [
      r.id,
      'processing',
    ]);
    await refreshVideo(r.workspace_id, r.id, fetchImpl);
    checked++;
  }
  return { checked };
}
