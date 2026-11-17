import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { dataWriteRateLimiter } from '../rateLimit';
import { handle, parseBody, workspaceFromParam } from '../http';
import { recordAudit } from '../audit';
import { ApiError } from '../errors';
import { createApiKey, listApiKeys, revokeApiKey, roleForScopes, SCOPES } from '../apiKeys';
import { OPENAPI } from '../openapi';

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z
      .array(z.enum(SCOPES as [string, ...string[]]))
      .min(1)
      .max(3),
    expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .strict();

/** Managing keys needs a signed-in owner/admin: a key can never create or revoke keys. */
const sessionOnly = (req: Parameters<typeof requireAuth>[0]) => {
  if (req.authContext?.apiKey) throw new ApiError(403, 'API_KEY_NOT_ALLOWED', 'API keys cannot manage API keys.');
};

export function apiKeyRoutes() {
  const r = Router();

  r.get('/v1/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(OPENAPI);
  });

  // Who am I (for integrations to test their key).
  r.get(
    '/v1/key',
    requireAuth,
    handle('v1/key', async (req, res) => {
      const k = req.authContext?.apiKey;
      if (!k) throw new ApiError(400, 'NOT_AN_API_KEY', 'Call this with an API key.');
      res.json({
        success: true,
        key: {
          id: k.id,
          name: k.name,
          workspaceId: k.workspaceId,
          scopes: k.scopes,
          role: roleForScopes(k.scopes as never),
        },
      });
    }),
  );

  r.get(
    '/workspaces/:workspaceId/api-keys',
    requireAuth,
    handle('api-keys/list', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      sessionOnly(req);
      res.json({ success: true, keys: await listApiKeys(req.authContext!.uid, ws) });
    }),
  );

  r.post(
    '/workspaces/:workspaceId/api-keys',
    requireAuth,
    dataWriteRateLimiter,
    handle('api-keys/create', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      sessionOnly(req);
      const body = parseBody(createSchema, req, res);
      if (!body) return;
      const out = await createApiKey(req.authContext!.uid, ws, {
        name: body.name,
        scopes: body.scopes as never,
        expiresInDays: body.expiresInDays ?? null,
      });
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'api_key.created',
        details: `Created API key "${body.name}" (${out.record.prefix}…) with ${out.record.scopes.join(', ')}.`,
        severity: 'warning',
      });
      res.status(201).json({ success: true, key: out.key, apiKey: out.record });
    }),
  );

  r.delete(
    '/workspaces/:workspaceId/api-keys/:keyId',
    requireAuth,
    dataWriteRateLimiter,
    handle('api-keys/revoke', async (req, res) => {
      const ws = workspaceFromParam(req, res);
      if (!ws) return;
      sessionOnly(req);
      const keyId = String(req.params.keyId);
      if (!/^[0-9a-f-]{36}$/.test(keyId)) throw new ApiError(400, 'INVALID_ID', 'Invalid key id.');
      const gone = await revokeApiKey(req.authContext!.uid, ws, keyId);
      if (!gone) throw new ApiError(404, 'NOT_FOUND', 'API key not found.');
      await recordAudit({
        workspaceId: ws,
        uid: req.authContext!.uid,
        ip: req.ip,
        action: 'api_key.revoked',
        details: `Revoked API key "${gone.name}" (${gone.prefix}…).`,
        severity: 'warning',
      });
      res.json({ success: true });
    }),
  );

  return r;
}
