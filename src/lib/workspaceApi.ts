import { apiErrorMessage, apiFetch, apiJson } from './api';
import type { AIInfluencer, AuditLog, CampaignAsset } from '../types';

/** Client for server-owned workspace data: influencers, campaign assets, Campaign OS and the audit log. */
const base = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

export async function fetchInfluencers(workspaceId: string): Promise<AIInfluencer[] | string> {
  const r = await apiJson<{ influencers: AIInfluencer[] }>(`${base(workspaceId)}/influencers`);
  return r.ok && Array.isArray(r.data.influencers)
    ? r.data.influencers
    : apiErrorMessage(r, 'Could not load influencers.');
}

/** Returns null on success, or an error message. */
export async function saveInfluencer(workspaceId: string, influencer: AIInfluencer): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/influencers/${encodeURIComponent(influencer.id)}`, {
    method: 'PUT',
    json: { ...influencer, workspaceId },
  });
  return r.ok ? null : apiErrorMessage(r, 'Could not save the influencer.');
}

export async function fetchAuditLogs(workspaceId: string): Promise<AuditLog[] | string> {
  const r = await apiJson<{ entries: AuditLog[] }>(`${base(workspaceId)}/audit-logs`);
  return r.ok && Array.isArray(r.data.entries) ? r.data.entries : apiErrorMessage(r, 'Could not load the audit log.');
}

export async function postAuditEvent(
  workspaceId: string,
  event: { action: string; details: string; severity?: 'info' | 'warning' },
): Promise<AuditLog | null> {
  const r = await apiJson<{ entry: AuditLog }>(`${base(workspaceId)}/audit-logs`, { json: event });
  return r.ok && r.data.entry ? r.data.entry : null;
}

export async function fetchCampaignOs<T>(workspaceId: string): Promise<{ state: T | null } | string> {
  const r = await apiJson<{ state: T | null }>(`${base(workspaceId)}/campaign-os`);
  return r.ok ? { state: r.data.state ?? null } : apiErrorMessage(r, 'Could not load Campaign OS data.');
}

export async function saveCampaignOs<T>(workspaceId: string, state: T): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/campaign-os`, { method: 'PUT', json: { state } });
  return r.ok ? null : apiErrorMessage(r, 'Could not save Campaign OS changes.');
}

/** Downloads the server-side GDPR export as a JSON file. Returns null on success or an error message. */
export async function downloadWorkspaceExport(workspaceId: string, slug: string): Promise<string | null> {
  try {
    const res = await apiFetch(`${base(workspaceId)}/export`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return apiErrorMessage({ ok: false, status: res.status, data }, 'Could not create the export.');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `launchpad-export-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return null;
  } catch (err) {
    return (err as Error)?.message || 'Network error';
  }
}

export async function eraseWorkspaceData(workspaceId: string, confirmSlug: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/erase`, { json: { confirmSlug } });
  return r.ok ? null : apiErrorMessage(r, 'Could not erase workspace data.');
}

export async function setLegalHold(workspaceId: string, active: boolean): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/legal-hold`, { method: 'PUT', json: { active } });
  return r.ok ? null : apiErrorMessage(r, 'Could not change legal hold.');
}

export async function setMemberRole(workspaceId: string, memberId: string, role: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/members/${encodeURIComponent(memberId)}/role`, {
    method: 'PUT',
    json: { role },
  });
  return r.ok ? null : apiErrorMessage(r, 'Could not change the role.');
}

/** Removes a member (owner/admin; only the owner can remove an admin). */
export async function removeMember(workspaceId: string, memberId: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
  return r.ok ? null : apiErrorMessage(r, 'Could not remove the member.');
}

// Campaign assets (stored in Postgres through the API; viewers read only, writers create and edit,
// the creator or an owner/admin deletes).
export async function fetchCampaignAssets(workspaceId: string): Promise<CampaignAsset[] | string> {
  const r = await apiJson<{ assets: CampaignAsset[] }>(`${base(workspaceId)}/campaign-assets`);
  return r.ok && Array.isArray(r.data.assets) ? r.data.assets : apiErrorMessage(r, 'Could not load campaign assets.');
}

/**
 * Creates or updates one asset and returns the status it was saved with (the server sends a writer's
 * content edit to an approved post back to 'pending_review'). Throws with a readable message on failure.
 */
export async function saveCampaignAsset(workspaceId: string, asset: CampaignAsset): Promise<CampaignAsset['status']> {
  const { userId: _u, createdAt: _c, ...fields } = asset as CampaignAsset & { userId?: string; createdAt?: string };
  const r = await apiJson<{ status?: CampaignAsset['status'] }>(
    `${base(workspaceId)}/campaign-assets/${encodeURIComponent(asset.id)}`,
    { method: 'PUT', json: { ...fields, workspaceId } },
  );
  if (!r.ok) throw new Error(apiErrorMessage(r, 'Could not save the campaign asset.'));
  return r.data.status ?? asset.status;
}

export async function deleteCampaignAsset(workspaceId: string, assetId: string): Promise<void> {
  const r = await apiJson(`${base(workspaceId)}/campaign-assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(apiErrorMessage(r, 'Could not delete the campaign asset.'));
}
