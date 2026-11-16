import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db } from './db';
import { assertMember } from './workspaces';

/** Generated images: Postgres bytea (generated_images), or process memory in DEMO_MODE (last 20). */
export interface ImageMeta {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  mimeType: string;
  bytes: number;
  createdAt: string;
}

const demoImages: Array<ImageMeta & { workspaceId: string; data: Buffer }> = [];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function saveImage(
  uid: string,
  workspaceId: string,
  img: { prompt: string; provider: string; model: string; mimeType: string; data: Buffer },
): Promise<ImageMeta> {
  const meta: ImageMeta = {
    id: `img-${randomUUID()}`,
    prompt: img.prompt,
    provider: img.provider,
    model: img.model,
    mimeType: img.mimeType,
    bytes: img.data.length,
    createdAt: new Date().toISOString(),
  };
  if (DEMO_MODE) {
    demoImages.unshift({ ...meta, workspaceId, data: img.data });
    demoImages.splice(20);
    return meta;
  }
  await db().query(
    `INSERT INTO generated_images (id, workspace_id, user_id, prompt, provider, model, mime_type, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [meta.id, workspaceId, uid, img.prompt, img.provider, img.model, img.mimeType, img.data],
  );
  return meta;
}

export async function listImages(uid: string, workspaceId: string): Promise<ImageMeta[]> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE)
    return demoImages.filter((i) => i.workspaceId === workspaceId).map(({ data: _d, workspaceId: _w, ...m }) => m);
  const { rows } = await db().query(
    `SELECT id, prompt, provider, model, mime_type, octet_length(data) AS bytes, created_at
       FROM generated_images WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [workspaceId],
  );
  return rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    provider: r.provider,
    model: r.model,
    mimeType: r.mime_type,
    bytes: Number(r.bytes),
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function getImage(uid: string, workspaceId: string, id: string) {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) {
    const i = demoImages.find((x) => x.id === id && x.workspaceId === workspaceId);
    return i ? { mimeType: i.mimeType, data: i.data } : null;
  }
  const { rows } = await db().query(
    'SELECT mime_type, data FROM generated_images WHERE workspace_id = $1 AND id = $2',
    [workspaceId, id],
  );
  return rows.length ? { mimeType: rows[0].mime_type as string, data: rows[0].data as Buffer } : null;
}
