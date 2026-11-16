import type express from 'express';
import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import { ApiError } from './errors';
import { workspaceIdSchema } from './schemas';

/** Returns the parsed body, or sends a 400 with the validation issues and returns null. */
export function parseBody<T>(schema: ZodType<T>, req: express.Request, res: express.Response): T | null {
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: 'INVALID_REQUEST',
      message: 'The request is missing fields or has invalid values.',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return null;
  }
  return parsed.data;
}

/** Logs full details server-side; the client gets a generic message and a reference id. */
export function sendServerError(
  res: express.Response,
  code: string,
  label: string,
  err: unknown,
  extra: { status?: number; message?: string; [k: string]: unknown } = {},
) {
  const ref = randomUUID().slice(0, 8);
  console.error(`[${label}] ref=${ref}`, err);
  const { status = 500, message = 'Something went wrong. Please try again.', ...fields } = extra;
  res.status(status).json({ error: code, message, ref, ...fields });
}

/** ApiError -> its status/code/message; anything else -> generic 500. */
export function sendApiError(res: express.Response, err: unknown, label: string) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  return sendServerError(res, 'INTERNAL_ERROR', label, err);
}

/** Workspace id from the x-workspace-id header, or sends a 400 and returns null. */
export function workspaceFromHeader(req: express.Request, res: express.Response): string | null {
  const parsed = workspaceIdSchema.safeParse(req.get('x-workspace-id'));
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_WORKSPACE_ID', message: 'A valid x-workspace-id header is required.' });
    return null;
  }
  return parsed.data;
}

/** Workspace id from the :workspaceId route param, or sends a 400 and returns null. */
export function workspaceFromParam(req: express.Request, res: express.Response): string | null {
  const parsed = workspaceIdSchema.safeParse(req.params.workspaceId);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_WORKSPACE_ID', message: 'Invalid workspace id.' });
    return null;
  }
  return parsed.data;
}

/** Wraps an async handler so thrown errors become JSON responses. */
export const handle =
  (label: string, fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch((err) => sendApiError(res, err, label));
  };
