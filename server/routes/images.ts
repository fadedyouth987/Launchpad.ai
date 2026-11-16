import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { aiRateLimiter } from '../rateLimit';
import { refundCredits, reserveCredits } from '../credits';
import { assertMember } from '../workspaces';
import { workspaceIdSchema } from '../schemas';
import { handle, parseBody, sendApiError, sendServerError, workspaceFromParam } from '../http';
import { recordAudit } from '../audit';
import { getImage, listImages, MAX_IMAGE_BYTES, saveImage } from '../images';
import type { AiResolver } from '../llm/resolver';
import { engineLabel } from './ai';

/** Credits per generated image (charged before the provider call, refunded on failure). */
const imageCostEnv = Number(process.env.AI_IMAGE_COST_CREDITS ?? 25);
export const IMAGE_COST = Number.isFinite(imageCostEnv) && imageCostEnv >= 1 ? Math.floor(imageCostEnv) : 25;

const imageSchema = z.object({ workspaceId: workspaceIdSchema, prompt: z.string().trim().min(3).max(2000) }).strict();
const imageId = /^img-[A-Za-z0-9_-]{1,100}$/;
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * Image generation (OpenAI gpt-image, Gemini image models, xAI grok-imagine). With no image
 * provider configured the endpoint answers 503 AI_IMAGE_NOT_CONFIGURED and charges nothing.
 */
export function imageRoutes(resolver: AiResolver) {
  const r = Router();

  r.post('/images/generate', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(imageSchema, req, res);
    if (!body) return;
    const { workspaceId, prompt } = body;
    const uid = req.authContext!.uid;
    let ai;
    try {
      await assertMember(uid, workspaceId);
      ai = await resolver.image(workspaceId);
    } catch (err) {
      return sendApiError(res, err, 'images/generate');
    }
    if (!ai || !ai.llm.generateImage) {
      return res.status(503).json({
        error: 'AI_IMAGE_NOT_CONFIGURED',
        message:
          'No image provider is configured. Set OPENAI_API_KEY, GEMINI_API_KEY or XAI_API_KEY on the server, or save a workspace key in Settings > AI providers.',
      });
    }
    let reservation: { reservationId: string; newBalance: number };
    try {
      reservation = await reserveCredits(uid, workspaceId, IMAGE_COST, { description: `AI Image (${ai.label})` });
    } catch (err) {
      return sendApiError(res, err, 'images/reserve');
    }
    try {
      const out = await ai.llm.generateImage(prompt, ai.model);
      const data = Buffer.from(out.base64, 'base64');
      if (!data.length || data.length > MAX_IMAGE_BYTES) throw new Error(`image size ${data.length} out of range`);
      const mimeType = MIME.has(out.mimeType) ? out.mimeType : 'image/png';
      const meta = await saveImage(uid, workspaceId, {
        prompt,
        provider: ai.provider,
        model: ai.model,
        mimeType,
        data,
      });
      res.json({
        success: true,
        image: meta,
        url: `/api/workspaces/${workspaceId}/images/${meta.id}`,
        engine: engineLabel(ai),
        costCredits: IMAGE_COST,
        newBalance: reservation.newBalance,
      });
    } catch (err) {
      let refunded = false;
      let newBalance: number | undefined;
      try {
        ({ newBalance } = await refundCredits(uid, workspaceId, IMAGE_COST, reservation.reservationId));
        refunded = true;
      } catch (refundErr) {
        console.error(`[images] REFUND FAILED for reservation ${reservation.reservationId}`, refundErr);
        await recordAudit({
          workspaceId,
          uid,
          action: 'billing.refund.failed',
          severity: 'critical',
          details: `Refund of ${IMAGE_COST} credits failed for reservation ${reservation.reservationId}.`,
        });
      }
      sendServerError(res, 'AI_IMAGE_FAILED', 'images/generate', err, {
        status: 502,
        message: refunded ? 'Image generation failed. Your credits were refunded.' : 'Image generation failed.',
        refunded,
        newBalance,
      });
    }
  });

  r.get(
    '/workspaces/:workspaceId/images',
    requireAuth,
    handle('images/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, images: await listImages(req.authContext!.uid, ws), costCredits: IMAGE_COST });
    }),
  );

  r.get(
    '/workspaces/:workspaceId/images/:id',
    requireAuth,
    handle('images/get', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      if (!imageId.test(req.params.id)) return res.status(400).json({ error: 'INVALID_ID', message: 'Invalid id.' });
      const img = await getImage(req.authContext!.uid, ws, req.params.id);
      if (!img) return res.status(404).json({ error: 'NOT_FOUND', message: 'Image not found.' });
      res.setHeader('Content-Type', img.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `inline; filename="${req.params.id}.${img.mimeType.split('/')[1]}"`);
      res.send(img.data);
    }),
  );

  return r;
}
