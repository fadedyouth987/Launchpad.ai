/**
 * Workspace events delivered to the workspace's webhook receivers (Security & Webhooks page), signed
 * with each receiver's secret. This is how approved/scheduled/published posts reach Zapier, Make,
 * n8n, Buffer or your own service. Requires WEBHOOK_DELIVERY_ENABLED=true; every URL is re-checked
 * against the SSRF rules and the connection is pinned to the checked IP (deliverPinned).
 */
import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db } from './db';
import { checkWebhookUrl } from './urlSafety';
import { deliverPinned } from './webhookDelivery';
import { recordAudit } from './audit';
import type { CampaignAsset } from '../src/types';

export const ASSET_EVENTS: Record<string, string> = {
  pending_review: 'approval.requested',
  approved: 'asset.approved',
  scheduled: 'asset.scheduled',
  published: 'asset.published',
  rejected: 'asset.rejected',
};

export const deliveryEnabled = () => process.env.WEBHOOK_DELIVERY_ENABLED === 'true';

export interface EventDelivery {
  endpointId: string;
  status: number | 'failed' | 'blocked';
}

/** Sends `event` to every active receiver of the workspace subscribed to it. Never throws. */
export async function emitWorkspaceEvent(
  workspaceId: string,
  uid: string,
  event: string,
  data: Record<string, unknown>,
): Promise<EventDelivery[]> {
  if (!deliveryEnabled() || DEMO_MODE) return [];
  let rows: Array<{ id: string; url: string; secret: string }> = [];
  try {
    rows = (
      await db().query(
        `SELECT e.id, e.url, s.secret FROM webhook_endpoints e JOIN webhook_secrets s ON s.endpoint_id = e.id
          WHERE e.workspace_id = $1 AND e.status = 'active' AND $2 = ANY(e.events) LIMIT 20`,
        [workspaceId, event],
      )
    ).rows;
  } catch (err) {
    console.warn('[webhooks] could not load receivers:', (err as Error).message);
    return [];
  }
  if (!rows.length) return [];
  const payload = { id: `evt_${randomUUID()}`, event, createdAt: new Date().toISOString(), workspaceId, data };
  const results = await Promise.all(
    rows.map(async (r): Promise<EventDelivery> => {
      try {
        const check = await checkWebhookUrl(r.url);
        if (!check.ok) return { endpointId: r.id, status: 'blocked' };
        const out = await deliverPinned({
          url: check.url,
          address: check.addresses[0],
          payload,
          secret: r.secret,
          timeoutMs: 5000,
        });
        return { endpointId: r.id, status: out.status };
      } catch {
        return { endpointId: r.id, status: 'failed' };
      }
    }),
  );
  await recordAudit({
    workspaceId,
    uid,
    action: 'webhook.event.delivered',
    details: `${event} -> ${results.map((r) => `${r.endpointId}: ${r.status}`).join(', ')}`,
    severity: results.every((r) => typeof r.status === 'number' && r.status < 300) ? 'info' : 'warning',
  });
  return results;
}

/** Event for an asset save, when its status changed into one of ASSET_EVENTS. */
export function assetEventFor(previousStatus: string | null, asset: CampaignAsset): string | null {
  if (previousStatus === asset.status) return null;
  return ASSET_EVENTS[asset.status] ?? null;
}

export function assetEventData(asset: CampaignAsset) {
  return {
    asset: {
      id: asset.id,
      title: asset.title,
      platform: asset.platform,
      status: asset.status,
      caption: asset.caption,
      hashtags: asset.hashtags,
      imagePrompt: asset.imagePrompt,
      scheduledTime: asset.scheduledTime ?? null,
      imagePath: asset.imageId ? `/api/workspaces/${asset.workspaceId}/images/${asset.imageId}` : null,
    },
  };
}
