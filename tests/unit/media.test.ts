import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { cloneVoice, ElevenLabsError, listVoices, textToSpeech } from '../../server/media/elevenlabs';
import { createTalk, downloadResult, getTalk } from '../../server/media/did';
import { signedMediaUrl, verifyMediaSignature } from '../../server/media/service';
import { createApp } from '../../server/app';

afterEach(() => vi.unstubAllEnvs());

type Call = { url: string; init: RequestInit };
const recorder = (reply: (url: string) => Response) => {
  const calls: Call[] = [];
  const f = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return reply(String(url));
  }) as typeof fetch;
  return { f, calls };
};

describe('ElevenLabs client', () => {
  it('text-to-speech sends the key, model, voice settings and clamps speed', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'el-key');
    const { f, calls } = recorder(
      () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'audio/mpeg' } }),
    );
    const audio = await textToSpeech({ voiceId: 'voice1', text: ' Hello there ', speed: 3 }, f);
    expect(audio.length).toBe(3);
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=mp3_44100_128');
    expect(new Headers(calls[0].init.headers).get('xi-api-key')).toBe('el-key');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      text: 'Hello there',
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.2 },
    });
  });

  it('rejects empty and over-long scripts before calling ElevenLabs', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    const { f, calls } = recorder(() => new Response('x'));
    await expect(textToSpeech({ voiceId: 'v', text: '  ' }, f)).rejects.toBeInstanceOf(ElevenLabsError);
    await expect(textToSpeech({ voiceId: 'v', text: 'x'.repeat(2501) }, f)).rejects.toThrow(/too long/);
    expect(calls).toHaveLength(0);
  });

  it('voice cloning uploads the sample as multipart and returns the voice id', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    const { f, calls } = recorder(() => Response.json({ voice_id: 'new-voice' }));
    const id = await cloneVoice({ name: 'Sophia', sample: Buffer.alloc(30_000), mimeType: 'audio/wav' }, f);
    expect(id).toBe('new-voice');
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/voices/add');
    const form = calls[0].init.body as FormData;
    expect(form.get('name')).toBe('Sophia');
    expect((form.get('files') as File).name).toBe('sample.wav');
  });

  it('lists voices and maps errors', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', 'k');
    const ok = recorder(() =>
      Response.json({
        voices: [
          { voice_id: 'a', name: 'Rachel', category: 'premade', labels: { gender: 'female', accent: 'american' } },
        ],
      }),
    );
    expect(await listVoices(ok.f)).toEqual([
      { id: 'a', name: 'Rachel', category: 'premade', description: 'female, american', previewUrl: '' },
    ]);
    const quota = recorder(() => Response.json({ detail: { status: 'quota_exceeded' } }, { status: 429 }));
    await expect(listVoices(quota.f)).rejects.toThrow(/quota/);
  });
});

describe('D-ID client', () => {
  it('creates a talk from a photo URL and an audio URL with Basic auth', async () => {
    vi.stubEnv('DID_API_KEY', 'user:secret');
    const { f, calls } = recorder(() => Response.json({ id: 'tlk_1', status: 'created' }, { status: 201 }));
    expect(await createTalk({ imageUrl: 'https://img/x.jpg', audioUrl: 'https://api/a.mp3' }, f)).toBe('tlk_1');
    expect(calls[0].url).toBe('https://api.d-id.com/talks');
    expect(new Headers(calls[0].init.headers).get('authorization')).toBe('Basic user:secret');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      source_url: 'https://img/x.jpg',
      script: { type: 'audio', audio_url: 'https://api/a.mp3' },
      config: { stitch: true },
    });
  });

  it('maps talk status: done, error, still processing', async () => {
    vi.stubEnv('DID_API_KEY', 'k');
    const done = recorder(() => Response.json({ status: 'done', result_url: 'https://r/v.mp4' }));
    expect(await getTalk('t', done.f)).toEqual({ state: 'done', resultUrl: 'https://r/v.mp4' });
    const err = recorder(() => Response.json({ status: 'error', error: { description: 'No face detected' } }));
    expect(await getTalk('t', err.f)).toMatchObject({ state: 'failed', error: expect.stringMatching(/No face/) });
    const busy = recorder(() => Response.json({ status: 'started' }));
    expect(await getTalk('t', busy.f)).toEqual({ state: 'processing' });
    const broke = recorder(() => Response.json({}, { status: 402 }));
    await expect(getTalk('t', broke.f)).rejects.toThrow(/out of credits/);
  });

  it('only downloads https results within the size limit', async () => {
    const { f } = recorder(() => new Response(new Uint8Array(10)));
    await expect(downloadResult('http://insecure/v.mp4', f)).rejects.toThrow();
    await expect(downloadResult('https://r/v.mp4', f, 5)).rejects.toThrow(/too large/);
    expect((await downloadResult('https://r/v.mp4', f)).length).toBe(10);
  });
});

describe('signed media links', () => {
  it('verify only an unexpired link for the same id', () => {
    vi.stubEnv('MEDIA_URL_SECRET', 'secret-1');
    const url = new URL(signedMediaUrl('https://api.example.com/', 'med-abc'));
    expect(url.pathname).toBe('/api/public/media/med-abc');
    const exp = url.searchParams.get('exp')!;
    const sig = url.searchParams.get('sig')!;
    expect(verifyMediaSignature('med-abc', exp, sig)).toBe(true);
    expect(verifyMediaSignature('med-other', exp, sig)).toBe(false);
    expect(verifyMediaSignature('med-abc', String(Number(exp) + 1), sig)).toBe(false);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 3600_000);
    expect(verifyMediaSignature('med-abc', exp, sig)).toBe(false);
    vi.useRealTimers();
    vi.stubEnv('MEDIA_URL_SECRET', 'secret-2');
    expect(verifyMediaSignature('med-abc', exp, sig)).toBe(false);
  });
});

describe('media endpoints (demo mode)', () => {
  const app = createApp({ ai: null });
  it('report voice/video as not configured and refuse to render', async () => {
    const v = await request(app).get('/api/workspaces/ws-acme-enterprise/media/voices');
    expect(v.body).toMatchObject({ enabled: { voice: false, video: false }, standard: [], cloned: [] });
    const s = await request(app)
      .post('/api/workspaces/ws-acme-enterprise/media/speech')
      .send({ voiceId: 'abc', text: 'hi' });
    expect(s.status).toBe(503);
    expect(s.body.error).toBe('VOICE_NOT_CONFIGURED');
  });

  it('the public media link needs a valid signature', async () => {
    expect((await request(app).get('/api/public/media/med-abc')).status).toBe(403);
    expect((await request(app).get('/api/public/media/med-abc?exp=9999999999&sig=nope')).status).toBe(403);
  });
});
