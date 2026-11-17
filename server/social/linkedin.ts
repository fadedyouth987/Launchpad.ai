/**
 * LinkedIn: "Sign In with LinkedIn using OpenID Connect" + "Share on LinkedIn" (self-serve products).
 * Scopes openid, profile, w_member_social: posts as the member who connected. Company pages need
 * LinkedIn's Community Management API approval and are not supported here.
 *
 * Config: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI (= <API URL>/api/social/linkedin/callback,
 * registered on the LinkedIn app), optional LINKEDIN_API_VERSION (YYYYMM; LinkedIn retires versions
 * after about a year, and a retired one fails with HTTP 426).
 *
 * Self-serve apps get no refresh token: access tokens last 60 days, then the member reconnects.
 */
import { ApiError } from '../errors';

export const LINKEDIN_SCOPES = 'openid profile w_member_social';
const DEFAULT_API_VERSION = '202608';
const MAX_COMMENTARY = 3000;

export const linkedinConfigured = () =>
  Boolean(
    process.env.LINKEDIN_CLIENT_ID?.trim() &&
    process.env.LINKEDIN_CLIENT_SECRET?.trim() &&
    process.env.LINKEDIN_REDIRECT_URI?.trim(),
  );

const apiVersion = () =>
  /^\d{6}$/.test(process.env.LINKEDIN_API_VERSION || '') ? process.env.LINKEDIN_API_VERSION! : DEFAULT_API_VERSION;

export function authorizeUrl(state: string): string {
  const u = new URL('https://www.linkedin.com/oauth/v2/authorization');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', process.env.LINKEDIN_CLIENT_ID!.trim());
  u.searchParams.set('redirect_uri', process.env.LINKEDIN_REDIRECT_URI!.trim());
  u.searchParams.set('state', state);
  u.searchParams.set('scope', LINKEDIN_SCOPES);
  return u.toString();
}

type Fetch = typeof fetch;

/** Error from LinkedIn, turned into a message an end user can act on. */
export class LinkedInError extends Error {
  constructor(
    message: string,
    public status: number,
    /** True when reconnecting the account is the fix (expired/revoked token, missing scope). */
    public reconnect = false,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<LinkedInError> {
  const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
  const detail = body?.message?.slice(0, 300) || `HTTP ${res.status}`;
  if (res.status === 401)
    return new LinkedInError('LinkedIn access expired or was revoked. Reconnect LinkedIn.', 401, true);
  if (res.status === 403)
    return new LinkedInError(
      `LinkedIn refused the request (${detail}). Reconnect LinkedIn to grant posting access.`,
      403,
      true,
    );
  if (res.status === 426)
    return new LinkedInError(
      `LinkedIn API version ${apiVersion()} is retired. The server admin must set LINKEDIN_API_VERSION to a current YYYYMM.`,
      426,
    );
  if (res.status === 429) return new LinkedInError('LinkedIn daily posting limit reached. Try again tomorrow.', 429);
  return new LinkedInError(`LinkedIn error: ${detail}`, res.status);
}

/** Exchanges the OAuth code for an access token. */
export async function exchangeCode(code: string, fetchImpl: Fetch = globalThis.fetch) {
  const res = await fetchImpl('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI!.trim(),
      client_id: process.env.LINKEDIN_CLIENT_ID!.trim(),
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!.trim(),
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string };
  if (!body.access_token) throw new LinkedInError('LinkedIn returned no access token.', 502);
  if (body.scope && !body.scope.split(/[ ,]/).includes('w_member_social')) {
    throw new LinkedInError('LinkedIn did not grant posting access (w_member_social).', 403, true);
  }
  return { accessToken: body.access_token, expiresIn: Number(body.expires_in) || 60 * 24 * 3600 };
}

/** The signed-in member (OpenID Connect userinfo). */
export async function fetchProfile(accessToken: string, fetchImpl: Fetch = globalThis.fetch) {
  const res = await fetchImpl('https://api.linkedin.com/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await readError(res);
  const p = (await res.json()) as { sub?: string; name?: string; picture?: string };
  if (!p.sub) throw new LinkedInError('LinkedIn returned no member id.', 502);
  return { id: p.sub, name: (p.name || 'LinkedIn member').slice(0, 200), picture: (p.picture || '').slice(0, 2048) };
}

const restHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
  'linkedin-version': apiVersion(),
  'x-restli-protocol-version': '2.0.0',
});

// "little text" format: these characters must be backslash-escaped or LinkedIn treats them as markup
// (and may silently cut the post at the first unescaped one).
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
export const escapeLittleText = (s: string) => s.replace(RESERVED, (c) => `\\${c}`);

/** Caption + hashtags as LinkedIn commentary. Hashtags become real (clickable) hashtags. */
export function buildCommentary(caption: string, hashtags: string[]): string {
  const tags = hashtags
    .map((h) => h.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, ''))
    .filter(Boolean)
    .slice(0, 30)
    .map((t) => `{hashtag|\\#|${t}}`);
  const body = escapeLittleText(caption.trim());
  const text = tags.length ? `${body}\n\n${tags.join(' ')}` : body;
  if (text.length > MAX_COMMENTARY) {
    throw new LinkedInError(`The post is too long for LinkedIn (${text.length} of ${MAX_COMMENTARY} characters).`, 400);
  }
  return text;
}

/** Uploads an image and returns its urn:li:image:... */
async function uploadImage(
  accessToken: string,
  owner: string,
  image: { mimeType: string; data: Buffer },
  fetchImpl: Fetch,
): Promise<string> {
  const init = await fetchImpl('https://api.linkedin.com/rest/images?action=initializeUpload', {
    method: 'POST',
    headers: { ...restHeaders(accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!init.ok) throw await readError(init);
  const v = ((await init.json()) as { value?: { uploadUrl?: string; image?: string } }).value;
  if (!v?.uploadUrl || !v.image) throw new LinkedInError('LinkedIn returned no image upload URL.', 502);
  const put = await fetchImpl(v.uploadUrl, {
    method: 'PUT',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': image.mimeType },
    body: new Uint8Array(image.data),
    signal: AbortSignal.timeout(60_000),
  });
  if (!put.ok) throw await readError(put);
  return v.image;
}

/** Publishes a post as the member. Returns the post URN and its public URL. */
export async function publishPost(
  opts: {
    accessToken: string;
    memberId: string;
    caption: string;
    hashtags: string[];
    image?: { mimeType: string; data: Buffer; altText?: string } | null;
  },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<{ postId: string; url: string }> {
  const author = `urn:li:person:${opts.memberId}`;
  const commentary = buildCommentary(opts.caption, opts.hashtags);
  if (!commentary.trim() && !opts.image) throw new LinkedInError('The post has no text.', 400);
  // GIF uploads go through a different LinkedIn flow; post those as text only.
  const image = opts.image && opts.image.mimeType !== 'image/gif' ? opts.image : null;
  const media = image ? await uploadImage(opts.accessToken, author, image, fetchImpl) : null;
  const res = await fetchImpl('https://api.linkedin.com/rest/posts', {
    method: 'POST',
    headers: { ...restHeaders(opts.accessToken), 'content-type': 'application/json' },
    body: JSON.stringify({
      author,
      commentary,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(media ? { content: { media: { id: media, altText: (image?.altText || '').slice(0, 300) } } } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw await readError(res);
  const postId = res.headers.get('x-restli-id') || res.headers.get('x-linkedin-id') || '';
  if (!postId) throw new LinkedInError('LinkedIn accepted the post but returned no id.', 502);
  const safeId = /^urn:li:[a-zA-Z]+:[0-9A-Za-z_-]+$/.test(postId) ? postId : encodeURIComponent(postId);
  return { postId, url: `https://www.linkedin.com/feed/update/${safeId}/` };
}

export const linkedinNotConfigured = () =>
  new ApiError(
    503,
    'LINKEDIN_NOT_CONFIGURED',
    'LinkedIn is not connected on this server (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI and AI_KEYS_ENCRYPTION_KEY).',
  );
