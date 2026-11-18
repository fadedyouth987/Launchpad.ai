import { apiErrorMessage, apiJson } from './api';

/** Client for direct social publishing (LinkedIn): connected accounts, publish history, publish now. */
const base = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}`;

export interface SocialAccount {
  id: string;
  provider: 'linkedin';
  displayName: string;
  avatarUrl: string;
  tokenExpiresAt: string | null;
  expired: boolean;
  connectedAt: string;
}

export interface SocialPost {
  id: string;
  assetId: string;
  provider: string;
  status: 'publishing' | 'published' | 'failed';
  externalUrl: string | null;
  error: string | null;
  attempts: number;
  updatedAt: string;
}

export async function fetchSocialAccounts(
  workspaceId: string,
): Promise<{ available: { linkedin: boolean }; accounts: SocialAccount[] } | string> {
  const r = await apiJson<{ available: { linkedin: boolean }; accounts: SocialAccount[] }>(
    `${base(workspaceId)}/social/accounts`,
  );
  return r.ok ? r.data : apiErrorMessage(r, 'Could not load connected accounts.');
}

export async function fetchSocialPosts(workspaceId: string): Promise<SocialPost[] | string> {
  const r = await apiJson<{ posts: SocialPost[] }>(`${base(workspaceId)}/social/posts`);
  return r.ok ? r.data.posts : apiErrorMessage(r, 'Could not load publish history.');
}

/** Returns the LinkedIn sign-in URL to send the browser to, or an error message. */
export async function startLinkedInConnect(workspaceId: string): Promise<{ url: string } | string> {
  const r = await apiJson<{ url?: string }>(`${base(workspaceId)}/social/linkedin/connect`, { json: {} });
  return r.ok && r.data.url ? { url: r.data.url } : apiErrorMessage(r, 'Could not start LinkedIn sign-in.');
}

export async function disconnectSocialAccount(workspaceId: string, accountId: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/social/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  });
  return r.ok ? null : apiErrorMessage(r, 'Could not disconnect the account.');
}

/** Posts an approved/scheduled asset now (or retries a failed post). */
export async function publishAssetNow(
  workspaceId: string,
  assetId: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const r = await apiJson<{ url?: string }>(
    `${base(workspaceId)}/campaign-assets/${encodeURIComponent(assetId)}/publish`,
    { json: {} },
  );
  if (r.ok && r.data.url) return { ok: true, url: r.data.url };
  // Refusals and LinkedIn failures both carry a code in `error` and the reason in `message`.
  return { ok: false, message: apiErrorMessage(r, 'Publishing failed.') };
}

/**
 * Finishes a LinkedIn sign-in after LinkedIn sends the browser back. The server saves the account only
 * if the signed-in member is the one who started the connection.
 */
export async function completeLinkedInConnect(workspaceId: string, pending: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/social/linkedin/complete`, { json: { pending } });
  return r.ok ? null : apiErrorMessage(r, 'Could not finish connecting LinkedIn.');
}
