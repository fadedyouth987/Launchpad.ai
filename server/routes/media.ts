import express, { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { aiRateLimiter, dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { assertMember, assertRole, WRITE_ROLES } from '../workspaces';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { ElevenLabsError, MAX_TTS_CHARS } from '../media/elevenlabs';
import { DidError } from '../media/did';
import {
  addClonedVoice,
  createSpeech,
  deleteMedia,
  getMedia,
  getMediaContent,
  listMedia,
  refreshVideo,
  removeClonedVoice,
  startVideo,
  verifyMediaSignature,
  videoEnabled,
  voiceEnabled,
  VIDEO_COST,
  VOICE_COST,
  workspaceVoices,
} from '../media/service';

const mediaId = /^med-[A-Za-z0-9_-]{1,100}$/;
const voiceIdRe = /^[A-Za-z0-9_-]{1,100}$/;
const influencerId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .optional()
  .nullable();
const speechSchema = z
  .object({
    voiceId: z.string().regex(voiceIdRe),
    text: z.string().trim().min(1).max(MAX_TTS_CHARS),
    speed: z.number().min(0.5).max(2).optional(),
    influencerId,
  })
  .strict();
const videoSchema = speechSchema
  .extend({
    imageUrl: z
      .string()
      .min(1)
      .max(11 * 1024 * 1024),
  })
  .strict();
const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/webm',
  'audio/ogg',
];

const notConfigured = (what: 'voice' | 'video') =>
  new ApiError(
    503,
    what === 'voice' ? 'VOICE_NOT_CONFIGURED' : 'VIDEO_NOT_CONFIGURED',
    what === 'voice'
      ? 'AI voices are not set up on this server (ELEVENLABS_API_KEY).'
      : 'Talking videos are not set up on this server (ELEVENLABS_API_KEY, DID_API_KEY and AI_KEYS_ENCRYPTION_KEY or MEDIA_URL_SECRET).',
  );

/** Provider errors become 502s with the provider's (safe, user-facing) message. */
const providerError = (err: unknown) =>
  err instanceof ElevenLabsError || err instanceof DidError
    ? new ApiError(err.status === 400 ? 400 : 502, 'PROVIDER_FAILED', `${err.message} Your credits were refunded.`)
    : err;

/** This API's public origin, used to give D-ID download links. */
function apiBase(req: express.Request): string {
  const explicit = process.env.PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = req.get('host') || 'localhost';
  return `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`;
}

export function mediaRoutes(fetchImpl?: typeof fetch) {
  const r = Router();
  const base = '/workspaces/:workspaceId/media';

  // Voices this workspace can use, and whether voice/video are available.
  r.get(
    `${base}/voices`,
    requireAuth,
    handle('media/voices', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      const enabled = { voice: voiceEnabled(), video: videoEnabled() };
      const costs = { voice: VOICE_COST, video: VIDEO_COST };
      if (!enabled.voice) return res.json({ success: true, enabled, costs, standard: [], cloned: [] });
      const v = await workspaceVoices(ws, fetchImpl);
      res.json({ success: true, enabled, costs, standard: v.standard, cloned: v.cloned });
    }),
  );

  // Clone a voice from one sample (raw audio body). Owners/admins, with the speaker's consent.
  r.post(
    `${base}/voices/clone`,
    requireAuth,
    dataWriteRateLimiter,
    express.raw({ type: AUDIO_TYPES, limit: '11mb' }),
    handle('media/voices/clone', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!voiceEnabled()) throw notConfigured('voice');
      await assertRole(req.authContext!.uid, ws, ['owner', 'admin']);
      const name = String(req.query.name ?? '')
        .trim()
        .slice(0, 100);
      if (!name) throw new ApiError(400, 'NAME_REQUIRED', 'Give the voice a name.');
      if (req.query.consent !== 'yes') {
        throw new ApiError(400, 'CONSENT_REQUIRED', 'Confirm you have the speaker’s permission to clone this voice.');
      }
      const sample = req.body as Buffer;
      if (!Buffer.isBuffer(sample) || sample.length < 20_000) {
        throw new ApiError(
          400,
          'SAMPLE_REQUIRED',
          'Upload an audio sample (MP3, WAV or M4A, 30–60 seconds, under 10 MB).',
        );
      }
      const mimeType = (req.get('content-type') || 'audio/mpeg').split(';')[0];
      try {
        const voiceId = await addClonedVoice(ws, req.authContext!.uid, { name, sample, mimeType }, fetchImpl);
        await recordAudit({
          workspaceId: ws,
          uid: req.authContext!.uid,
          ip: req.ip,
          action: 'ai.voice.cloned',
          details: `Cloned voice "${name}" (${voiceId}). The member confirmed they have the speaker's permission.`,
        });
        res.status(201).json({ success: true, voice: { id: voiceId, name, category: 'cloned' } });
      } catch (err) {
        if (err instanceof ElevenLabsError) throw new ApiError(502, 'CLONE_FAILED', err.message);
        throw err;
      }
    }),
  );

  r.delete(
    `${base}/voices/:voiceId`,
    requireAuth,
    dataWriteRateLimiter,
    handle('media/voices/delete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertRole(req.authContext!.uid, ws, ['owner', 'admin']);
      const voiceId = String(req.params.voiceId);
      if (!voiceIdRe.test(voiceId) || !(await removeClonedVoice(ws, voiceId, fetchImpl))) {
        throw new ApiError(404, 'NOT_FOUND', 'Voice not found.');
      }
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'ai.voice.deleted',
        details: `Deleted cloned voice ${voiceId}.`,
      });
      res.json({ success: true });
    }),
  );

  r.post(
    `${base}/speech`,
    requireAuth,
    aiRateLimiter,
    handle('media/speech', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(speechSchema, req, res);
      if (!body) return;
      if (!voiceEnabled()) throw notConfigured('voice');
      try {
        const out = await createSpeech(req.authContext!.uid, ws, body, fetchImpl);
        res.json({ success: true, ...out, costCredits: VOICE_COST });
      } catch (err) {
        throw providerError(err);
      }
    }),
  );

  r.post(
    `${base}/videos`,
    requireAuth,
    aiRateLimiter,
    handle('media/videos', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      const body = parseBody(videoSchema, req, res);
      if (!body) return;
      if (!videoEnabled()) throw notConfigured('video');
      try {
        const out = await startVideo(req.authContext!.uid, ws, body, apiBase(req), fetchImpl);
        res.status(202).json({ success: true, ...out, costCredits: VIDEO_COST });
      } catch (err) {
        throw providerError(err);
      }
    }),
  );

  r.get(
    base,
    requireAuth,
    handle('media/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      const inf =
        typeof req.query.influencerId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(req.query.influencerId)
          ? req.query.influencerId
          : undefined;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, media: await listMedia(ws, inf) });
    }),
  );

  // One item; a processing video is checked with D-ID on the way (the browser polls this).
  r.get(
    `${base}/:mediaId`,
    requireAuth,
    handle('media/get', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      if (!mediaId.test(req.params.mediaId)) throw new ApiError(400, 'INVALID_ID', 'Invalid id.');
      let item = await getMedia(ws, req.params.mediaId);
      if (item?.status === 'processing') item = await refreshVideo(ws, item.id, fetchImpl);
      if (!item) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, media: item });
    }),
  );

  r.get(
    `${base}/:mediaId/content`,
    requireAuth,
    handle('media/content', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertMember(req.authContext!.uid, ws);
      if (!mediaId.test(req.params.mediaId)) throw new ApiError(400, 'INVALID_ID', 'Invalid id.');
      const m = await getMediaContent(ws, req.params.mediaId);
      if (!m) throw new ApiError(404, 'NOT_FOUND', 'Not found.');
      res.setHeader('Content-Type', m.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${req.params.mediaId}.${m.kind === 'video' ? 'mp4' : 'mp3'}"`,
      );
      res.send(m.data);
    }),
  );

  r.delete(
    `${base}/:mediaId`,
    requireAuth,
    dataWriteRateLimiter,
    handle('media/delete', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      await assertRole(req.authContext!.uid, ws, WRITE_ROLES);
      if (!mediaId.test(req.params.mediaId) || !(await deleteMedia(ws, req.params.mediaId))) {
        throw new ApiError(404, 'NOT_FOUND', 'Not found (or still rendering).');
      }
      res.json({ success: true });
    }),
  );

  // Signed, expiring link D-ID uses to download the photo and audio. Never serves videos.
  r.get('/public/media/:mediaId', async (req, res) => {
    const id = req.params.mediaId;
    const q = req.query as Record<string, string | undefined>;
    if (!mediaId.test(id) || !verifyMediaSignature(id, q.exp, q.sig)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    try {
      const m = await getMediaContent(null, id);
      if (!m || m.kind === 'video') return res.status(404).json({ error: 'NOT_FOUND' });
      res.setHeader('Content-Type', m.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.send(m.data);
    } catch {
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return r;
}
