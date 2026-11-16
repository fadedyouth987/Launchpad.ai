import { Router } from 'express';
import { z } from 'zod';
import { DEMO_MODE, requireAuth } from '../auth';
import { aiRateLimiter, dataWriteRateLimiter } from '../rateLimit';
import { handle, workspaceFromHeader, workspaceFromParam, parseBody } from '../http';
import { assertMember, assertRole } from '../workspaces';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { userTurn } from '../prompts';
import {
  buildProvider,
  isProviderId,
  PROVIDER_ORDER,
  providerCatalog,
  serverDefaultImageProvider,
  serverDefaultProvider,
} from '../llm/catalog';
import { availability, workspaceContext, type AiResolver, type ResolvedAi } from '../llm/resolver';
import { keyStorageEnabled } from '../llm/secrets';
import { deleteWorkspaceKey, loadWorkspaceKey, saveAiSettings, saveWorkspaceKey } from '../llm/settings';
import { ProviderError, type ProviderId } from '../llm/types';
import { ASSIST_COST, GENERATION_COST } from './ai';
import { IMAGE_COST } from './images';

const ADMIN_ROLES = ['owner', 'admin'] as const;
const modelId = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:/@+-]{1,200}$/, 'Model ids use letters, digits and . _ : / @ + -');
const providerField = z
  .string()
  .nullable()
  .refine((v) => v === null || isProviderId(v), 'Unknown provider');

const settingsSchema = z
  .object({
    textProvider: providerField,
    textModel: modelId.nullable(),
    imageProvider: providerField.default(null),
    imageModel: modelId.nullable().default(null),
  })
  .strict();

const keySchema = z.object({ apiKey: z.string().trim().min(8).max(500).regex(/^\S+$/, 'No spaces') }).strict();

const summary = (ai: ResolvedAi | null) =>
  ai
    ? {
        provider: ai.provider,
        label: ai.label,
        model: ai.model,
        keySource: ai.keySource,
        supportsWebSearch: ai.supportsWebSearch,
        ...(ai.fallbackReason ? { fallbackReason: ai.fallbackReason } : {}),
      }
    : null;

// Live model lists, cached per provider+key source for 10 minutes (per instance).
const modelCache = new Map<string, { at: number; models: string[] }>();

/**
 * AI provider settings: which providers the server has keys for, which one this workspace uses,
 * workspace ("bring your own") keys, and a connection test. Keys are write-only: no endpoint ever
 * returns a key, only whether one is set (and its last 4 characters to owners/admins).
 */
export function aiSettingsRoutes(resolver: AiResolver) {
  const r = Router();

  r.get(
    '/ai/providers',
    requireAuth,
    handle('ai/providers', async (req, res) => {
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      const ws = await assertMember(req.authContext!.uid, workspaceId);
      const canEdit = DEMO_MODE || ADMIN_ROLES.includes(ws.role as (typeof ADMIN_ROLES)[number]);
      const { settings, keys } = await workspaceContext(workspaceId);
      const cat = providerCatalog();
      const [text, image] = await Promise.all([resolver.text(workspaceId), resolver.image(workspaceId)]);
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        demo: DEMO_MODE,
        canEdit,
        keyStorageEnabled: keyStorageEnabled() && !DEMO_MODE,
        selected: settings,
        active: { text: summary(text), image: summary(image) },
        serverDefault: { text: serverDefaultProvider(), image: serverDefaultImageProvider() },
        // Credits per call; identical for every provider and key source. Sample output is free.
        costs: { generate: GENERATION_COST, assist: ASSIST_COST, image: IMAGE_COST },
        providers: PROVIDER_ORDER.map((id) => {
          const info = cat[id];
          const a = availability(id, keys);
          const k = keys.get(id);
          return {
            ...info,
            serverConfigured: a.server,
            workspaceKey: a.workspace && k ? (canEdit ? k : { last4: '', createdAt: k.createdAt }) : null,
            usable: a.usable,
            canMakeImages: Boolean(info.imageModel),
          };
        }),
      });
    }),
  );

  r.get(
    '/ai/providers/:provider/models',
    requireAuth,
    aiRateLimiter,
    handle('ai/models', async (req, res) => {
      const workspaceId = workspaceFromHeader(req, res);
      if (!workspaceId) return;
      await assertMember(req.authContext!.uid, workspaceId);
      const id = req.params.provider;
      if (!isProviderId(id)) throw new ApiError(404, 'NOT_FOUND', 'Unknown provider.');
      const cat = providerCatalog()[id];
      const { keys } = await workspaceContext(workspaceId);
      const a = availability(id, keys);
      if (!a.usable) {
        return res.json({ success: true, live: false, models: cat.suggestedModels, note: 'Provider not configured.' });
      }
      const resolved = a.workspace ? await keyedProvider(resolver, workspaceId, id) : null;
      const cacheKey = `${id}:${resolved ? workspaceId : 'server'}`;
      const hit = modelCache.get(cacheKey);
      if (hit && Date.now() - hit.at < 10 * 60_000) return res.json({ success: true, live: true, models: hit.models });
      const llm = resolved ?? buildProvider(id, undefined, resolver.fetchImpl);
      try {
        const models = ((await llm.listModels?.()) ?? []).slice(0, 500).sort();
        modelCache.set(cacheKey, { at: Date.now(), models });
        res.json({ success: true, live: true, models });
      } catch (err) {
        console.warn(`[ai/models] ${id}:`, (err as Error).message);
        res.json({
          success: true,
          live: false,
          models: cat.suggestedModels,
          note: 'Could not load the live model list.',
        });
      }
    }),
  );

  r.put(
    '/workspaces/:workspaceId/ai-settings',
    requireAuth,
    dataWriteRateLimiter,
    handle('ai-settings/save', async (req, res) => {
      const workspaceId = workspaceFromParam(req, res);
      if (!workspaceId) return;
      const body = parseBody(settingsSchema, req, res);
      if (!body) return;
      const uid = req.authContext!.uid;
      await assertRole(uid, workspaceId, [...ADMIN_ROLES]);
      const { keys } = await workspaceContext(workspaceId);
      const cat = providerCatalog();
      for (const [kind, p] of [
        ['text', body.textProvider],
        ['image', body.imageProvider],
      ] as const) {
        if (!p) continue;
        const id = p as ProviderId;
        if (!availability(id, keys).usable) {
          throw new ApiError(
            400,
            'PROVIDER_NOT_CONFIGURED',
            `${cat[id].label} has no API key on this server or workspace.`,
          );
        }
        if (kind === 'image' && !cat[id].imageModel) {
          throw new ApiError(400, 'NO_IMAGE_SUPPORT', `${cat[id].label} cannot generate images here.`);
        }
      }
      const saved = await saveAiSettings(uid, workspaceId, {
        textProvider: (body.textProvider as ProviderId | null) ?? null,
        textModel: body.textProvider ? body.textModel : null,
        imageProvider: (body.imageProvider as ProviderId | null) ?? null,
        imageModel: body.imageProvider ? body.imageModel : null,
      });
      await recordAudit({
        workspaceId,
        uid,
        ip: req.ip,
        action: 'ai.settings.update',
        details: `AI text provider: ${saved.textProvider ?? 'server default'}${saved.textModel ? ` (${saved.textModel})` : ''}; image provider: ${saved.imageProvider ?? 'server default'}${saved.imageModel ? ` (${saved.imageModel})` : ''}.`,
      });
      res.json({ success: true, settings: saved });
    }),
  );

  r.put(
    '/workspaces/:workspaceId/ai-keys/:provider',
    requireAuth,
    aiRateLimiter,
    handle('ai-keys/save', async (req, res) => {
      const workspaceId = workspaceFromParam(req, res);
      if (!workspaceId) return;
      const id = req.params.provider;
      if (!isProviderId(id)) throw new ApiError(404, 'NOT_FOUND', 'Unknown provider.');
      const body = parseBody(keySchema, req, res);
      if (!body) return;
      const uid = req.authContext!.uid;
      await assertRole(uid, workspaceId, [...ADMIN_ROLES]);
      if (DEMO_MODE) throw new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Saving API keys is not available in demo mode.');
      if (!providerCatalog()[id].allowWorkspaceKey) {
        throw new ApiError(400, 'KEY_NOT_ALLOWED', 'This provider is configured by the server admin only.');
      }
      if (!keyStorageEnabled()) {
        throw new ApiError(
          503,
          'KEY_STORAGE_DISABLED',
          'Saving workspace API keys is turned off on this server (AI_KEYS_ENCRYPTION_KEY is not set).',
        );
      }
      // Check the key with a free, read-only call (list models) before storing it.
      try {
        await buildProvider(id, body.apiKey, resolver.fetchImpl).listModels?.();
      } catch (err) {
        const status = err instanceof ProviderError ? err.status : 0;
        if (status === 401 || status === 403 || status === 400) {
          throw new ApiError(400, 'INVALID_API_KEY', `${providerCatalog()[id].label} rejected this key.`);
        }
        throw new ApiError(
          502,
          'KEY_CHECK_FAILED',
          `Could not reach ${providerCatalog()[id].label} to check the key. Try again.`,
        );
      }
      await saveWorkspaceKey(uid, workspaceId, id, body.apiKey);
      modelCache.delete(`${id}:${workspaceId}`);
      await recordAudit({
        workspaceId,
        uid,
        ip: req.ip,
        action: 'ai.key.save',
        details: `Saved a workspace API key for ${providerCatalog()[id].label}.`,
        severity: 'warning',
      });
      res.json({ success: true, provider: id, last4: body.apiKey.slice(-4) });
    }),
  );

  r.delete(
    '/workspaces/:workspaceId/ai-keys/:provider',
    requireAuth,
    dataWriteRateLimiter,
    handle('ai-keys/delete', async (req, res) => {
      const workspaceId = workspaceFromParam(req, res);
      if (!workspaceId) return;
      const id = req.params.provider;
      if (!isProviderId(id)) throw new ApiError(404, 'NOT_FOUND', 'Unknown provider.');
      const uid = req.authContext!.uid;
      await assertRole(uid, workspaceId, [...ADMIN_ROLES]);
      const deleted = await deleteWorkspaceKey(workspaceId, id);
      if (!deleted) return res.status(404).json({ error: 'NOT_FOUND', message: 'No workspace key for that provider.' });
      modelCache.delete(`${id}:${workspaceId}`);
      await recordAudit({
        workspaceId,
        uid,
        ip: req.ip,
        action: 'ai.key.delete',
        details: `Removed the workspace API key for ${providerCatalog()[id].label}.`,
        severity: 'warning',
      });
      res.json({ success: true });
    }),
  );

  // Connection test: one tiny call to the provider this workspace would use. Owner/admin only, not
  // charged (it spends a few provider tokens), AI rate limit applies.
  r.post(
    '/workspaces/:workspaceId/ai-test',
    requireAuth,
    aiRateLimiter,
    handle('ai-test', async (req, res) => {
      const workspaceId = workspaceFromParam(req, res);
      if (!workspaceId) return;
      await assertRole(req.authContext!.uid, workspaceId, [...ADMIN_ROLES]);
      const ai = await resolver.text(workspaceId);
      if (!ai) {
        return res.json({ success: false, ok: false, error: 'NO_PROVIDER', message: 'No AI provider is configured.' });
      }
      const started = Date.now();
      try {
        const out = await ai.llm.generate(
          {
            system: 'You are a connectivity check. Reply with the single word OK.',
            contents: userTurn('Reply with OK.', {}),
            maxOutputTokens: 1024,
          },
          ai.model,
        );
        res.json({
          success: true,
          ok: true,
          ...summary(ai),
          latencyMs: Date.now() - started,
          reply: out.text.slice(0, 200),
        });
      } catch (err) {
        console.warn('[ai-test]', (err as Error).message);
        const status = err instanceof ProviderError ? err.status : 0;
        res.json({
          success: true,
          ok: false,
          ...summary(ai),
          latencyMs: Date.now() - started,
          providerStatus: status,
          // The provider's own error text (API key scrubbed), shown to owners/admins for troubleshooting.
          detail: String((err as Error)?.message || '').slice(0, 300),
          message:
            status === 401 || status === 403
              ? 'The provider rejected the API key.'
              : status === 404
                ? 'The provider does not know this model id.'
                : status === 429
                  ? 'The provider rate-limited or has no credit on this key.'
                  : 'The provider call failed. Check the model id and key.',
        });
      }
    }),
  );

  return r;
}

async function keyedProvider(resolver: AiResolver, workspaceId: string, id: ProviderId) {
  const key = await loadWorkspaceKey(workspaceId, id);
  return key ? buildProvider(id, key, resolver.fetchImpl) : null;
}
