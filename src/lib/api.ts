import { getApiToken } from './auth';

/**
 * Origin of the API server, e.g. "https://launchpad-api-xxxx.a.run.app" when the web app is hosted
 * separately (Cloudflare). Empty = same origin (Express serves both, or the Vite dev server).
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

/** Absolute URL for an API path ("/api/..."); other URLs are returned unchanged. */
export function apiUrl(path: string): string {
  return API_BASE_URL && path.startsWith('/api/') ? `${API_BASE_URL}${path}` : path;
}

/**
 * fetch() wrapper for calls to this app's own /api endpoints (same origin or VITE_API_BASE_URL).
 * Attaches the signed-in user's Neon Auth JWT as `Authorization: Bearer <token>`
 * so the server can verify who is calling. When nobody is signed in, the request is
 * sent without a token (the server rejects it with 401 unless DEMO_MODE=true).
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  // /api/health is public; skip the token lookup so the sign-in screen does not wait on Neon Auth.
  const token = input === '/api/health' ? null : await getApiToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // Bearer tokens only: no cookies are sent, so cross-origin calls need no credentialed CORS.
  return fetch(apiUrl(input), { ...init, headers, credentials: 'omit' });
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T & { error?: string; message?: string };
}

/** Window event fired with { workspaceId, newBalance } whenever an API response reports a new balance. */
export const CREDITS_EVENT = 'launchpad:credits-changed';

/** JSON helper around apiFetch. Never throws for HTTP errors; network errors become status 0. */
export async function apiJson<T = Record<string, unknown>>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<ApiResult<T>> {
  const { json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  try {
    const res = await apiFetch(path, {
      ...rest,
      headers,
      ...(json !== undefined ? { method: rest.method ?? 'POST', body: JSON.stringify(json) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    // Any response that reports a new credit balance (a charge or a refund) updates the header balance.
    const workspaceId = headers.get('x-workspace-id') || (json as { workspaceId?: unknown } | undefined)?.workspaceId;
    if (typeof data?.newBalance === 'number' && typeof workspaceId === 'string' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: { workspaceId, newBalance: data.newBalance } }));
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { error: 'NETWORK_ERROR', message: (err as Error)?.message || 'Network error' } as ApiResult<T>['data'],
    };
  }
}

/** Human-readable message for a failed ApiResult. */
export function apiErrorMessage(r: ApiResult<unknown>, fallback = 'Something went wrong. Please try again.'): string {
  if (r.status === 401) return 'Please sign in again.';
  if (r.status === 429) return 'Too many requests. Please wait a minute and try again.';
  return r.data?.message || fallback;
}
