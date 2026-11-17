/**
 * D-ID Talks: animates one photo so it speaks the given audio (a talking-head video).
 * Config: DID_API_KEY (from D-ID Studio > API, sent as `Authorization: Basic <key>`).
 * D-ID downloads the photo and audio from URLs, so both must be reachable from the internet: the API
 * hands D-ID short-lived signed links to its own /api/public/media endpoint (see mediaUrls.ts).
 */
export const didConfigured = () => Boolean(process.env.DID_API_KEY?.trim());
const BASE = 'https://api.d-id.com';

type Fetch = typeof fetch;

export class DidError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function fail(res: Response, what: string): Promise<DidError> {
  const body = (await res.json().catch(() => null)) as { description?: string; kind?: string; message?: string } | null;
  const detail = body?.description || body?.message || body?.kind || `HTTP ${res.status}`;
  if (res.status === 401) return new DidError('The server’s D-ID key was rejected.', 401);
  if (res.status === 402) return new DidError('The D-ID account is out of credits.', 402);
  if (res.status === 429) return new DidError('D-ID is busy. Try again in a minute.', 429);
  return new DidError(`D-ID ${what} failed: ${String(detail).slice(0, 300)}`, res.status);
}

const headers = () => ({ authorization: `Basic ${process.env.DID_API_KEY!.trim()}` });

/** Starts a render. Returns D-ID's talk id. */
export async function createTalk(
  opts: { imageUrl: string; audioUrl: string },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string> {
  const res = await fetchImpl(`${BASE}/talks`, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      source_url: opts.imageUrl,
      script: { type: 'audio', audio_url: opts.audioUrl },
      // stitch: render the animated face back into the full photo instead of a cropped head.
      config: { stitch: true },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await fail(res, 'video');
  const body = (await res.json()) as { id?: string };
  if (!body.id) throw new DidError('D-ID returned no job id.', 502);
  return body.id;
}

export type TalkStatus =
  { state: 'processing' } | { state: 'done'; resultUrl: string } | { state: 'failed'; error: string };

export async function getTalk(id: string, fetchImpl: Fetch = globalThis.fetch): Promise<TalkStatus> {
  const res = await fetchImpl(`${BASE}/talks/${encodeURIComponent(id)}`, {
    headers: { ...headers(), accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await fail(res, 'status check');
  const t = (await res.json()) as {
    status?: string;
    result_url?: string;
    error?: { description?: string; kind?: string } | string;
  };
  if (t.status === 'done' && t.result_url) return { state: 'done', resultUrl: t.result_url };
  if (t.status === 'error' || t.status === 'rejected') {
    const e = typeof t.error === 'string' ? t.error : t.error?.description || t.error?.kind || t.status;
    return { state: 'failed', error: `D-ID could not make the video: ${String(e).slice(0, 300)}` };
  }
  return { state: 'processing' };
}

/** Downloads the finished MP4 (D-ID's result links expire, so the file is copied to our database). */
export async function downloadResult(url: string, fetchImpl: Fetch = globalThis.fetch, maxBytes = 50 * 1024 * 1024) {
  if (!/^https:\/\//.test(url)) throw new DidError('Unexpected D-ID result URL.', 502);
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new DidError(`Could not download the D-ID video (HTTP ${res.status}).`, 502);
  const data = Buffer.from(await res.arrayBuffer());
  if (!data.length || data.length > maxBytes) throw new DidError('The D-ID video is empty or too large.', 502);
  return data;
}
