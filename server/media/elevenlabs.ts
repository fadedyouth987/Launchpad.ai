/**
 * ElevenLabs: text-to-speech and instant voice cloning. Config: ELEVENLABS_API_KEY, optional
 * ELEVENLABS_MODEL (default eleven_multilingual_v2). Voice cloning needs a paid ElevenLabs plan.
 */
export const elevenLabsConfigured = () => Boolean(process.env.ELEVENLABS_API_KEY?.trim());
const model = () => process.env.ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2';
const BASE = 'https://api.elevenlabs.io';
export const MAX_TTS_CHARS = 2500;

type Fetch = typeof fetch;

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function fail(res: Response, what: string): Promise<ElevenLabsError> {
  const body = (await res.json().catch(() => null)) as {
    detail?: { message?: string; status?: string } | string;
  } | null;
  const detail =
    typeof body?.detail === 'string'
      ? body.detail
      : body?.detail?.message || body?.detail?.status || `HTTP ${res.status}`;
  if (res.status === 401) return new ElevenLabsError('The server’s ElevenLabs key was rejected.', 401);
  if (res.status === 429)
    return new ElevenLabsError('ElevenLabs is busy or the monthly character quota is used up.', 429);
  return new ElevenLabsError(`ElevenLabs ${what} failed: ${String(detail).slice(0, 300)}`, res.status);
}

const headers = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY!.trim() });

export interface Voice {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
}

/** Voices in the ElevenLabs account (standard voices plus any clones). */
export async function listVoices(fetchImpl: Fetch = globalThis.fetch): Promise<Voice[]> {
  const res = await fetchImpl(`${BASE}/v1/voices`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await fail(res, 'voice list');
  const body = (await res.json()) as {
    voices?: Array<{
      voice_id: string;
      name: string;
      category?: string;
      description?: string | null;
      preview_url?: string | null;
      labels?: Record<string, string>;
    }>;
  };
  return (body.voices ?? []).map((v) => ({
    id: v.voice_id,
    name: v.name,
    category: v.category || 'premade',
    description: (
      v.description ||
      [v.labels?.gender, v.labels?.accent, v.labels?.age, v.labels?.descriptive || v.labels?.description]
        .filter(Boolean)
        .join(', ')
    ).slice(0, 200),
    previewUrl: v.preview_url || '',
  }));
}

/** MP3 audio for `text` in `voiceId`. `speed` is clamped to ElevenLabs' 0.7–1.2 range. */
export async function textToSpeech(
  opts: { voiceId: string; text: string; speed?: number },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<Buffer> {
  const text = opts.text.trim();
  if (!text) throw new ElevenLabsError('Nothing to say: the script is empty.', 400);
  if (text.length > MAX_TTS_CHARS)
    throw new ElevenLabsError(`Script is too long (max ${MAX_TTS_CHARS} characters).`, 400);
  const speed = Math.min(1.2, Math.max(0.7, Number(opts.speed) || 1));
  const res = await fetchImpl(
    `${BASE}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { ...headers(), 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: model(),
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!res.ok) throw await fail(res, 'speech');
  const audio = Buffer.from(await res.arrayBuffer());
  if (!audio.length) throw new ElevenLabsError('ElevenLabs returned no audio.', 502);
  return audio;
}

/** Instant voice clone from one sample. Returns the new voice id. */
export async function cloneVoice(
  opts: { name: string; sample: Buffer; mimeType: string; description?: string },
  fetchImpl: Fetch = globalThis.fetch,
): Promise<string> {
  const form = new FormData();
  form.set('name', opts.name);
  form.set('remove_background_noise', 'true');
  if (opts.description) form.set('description', opts.description);
  const ext = opts.mimeType.includes('wav')
    ? 'wav'
    : opts.mimeType.includes('mp4') || opts.mimeType.includes('m4a')
      ? 'm4a'
      : 'mp3';
  form.append('files', new Blob([new Uint8Array(opts.sample)], { type: opts.mimeType }), `sample.${ext}`);
  const res = await fetchImpl(`${BASE}/v1/voices/add`, {
    method: 'POST',
    headers: headers(),
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw await fail(res, 'voice cloning');
  const body = (await res.json()) as { voice_id?: string };
  if (!body.voice_id) throw new ElevenLabsError('ElevenLabs returned no voice id.', 502);
  return body.voice_id;
}

export async function deleteVoice(voiceId: string, fetchImpl: Fetch = globalThis.fetch) {
  const res = await fetchImpl(`${BASE}/v1/voices/${encodeURIComponent(voiceId)}`, {
    method: 'DELETE',
    headers: headers(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok && res.status !== 404) throw await fail(res, 'voice delete');
}
