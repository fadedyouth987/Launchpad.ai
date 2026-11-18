import { apiErrorMessage, apiFetch, apiJson } from './api';

/** Client for AI voices (ElevenLabs) and talking-head videos (D-ID). */
const base = (workspaceId: string) => `/api/workspaces/${encodeURIComponent(workspaceId)}/media`;

export interface VoiceOption {
  id: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
}

export interface MediaItem {
  id: string;
  kind: 'audio' | 'video';
  status: 'processing' | 'ready' | 'failed';
  influencerId: string | null;
  script: string;
  voiceId: string | null;
  error: string | null;
  costCredits: number;
  createdAt: string;
  url: string | null;
}

export interface VoicesResponse {
  enabled: { voice: boolean; video: boolean };
  costs: { voice: number; video: number };
  standard: VoiceOption[];
  cloned: VoiceOption[];
}

export async function fetchVoices(workspaceId: string): Promise<VoicesResponse | string> {
  const r = await apiJson<VoicesResponse>(`${base(workspaceId)}/voices`);
  return r.ok ? r.data : apiErrorMessage(r, 'Could not load voices.');
}

/** Uploads a voice sample to clone. The caller must have confirmed the speaker's consent. */
export async function cloneVoice(workspaceId: string, name: string, file: File): Promise<VoiceOption | string> {
  try {
    const res = await apiFetch(`${base(workspaceId)}/voices/clone?name=${encodeURIComponent(name)}&consent=yes`, {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'audio/mpeg' },
      body: file,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.voice) return data.voice as VoiceOption;
    return apiErrorMessage({ ok: false, status: res.status, data }, 'Voice cloning failed.');
  } catch {
    return 'Network error while uploading the sample.';
  }
}

export async function deleteClonedVoice(workspaceId: string, voiceId: string): Promise<string | null> {
  const r = await apiJson(`${base(workspaceId)}/voices/${encodeURIComponent(voiceId)}`, { method: 'DELETE' });
  return r.ok ? null : apiErrorMessage(r, 'Could not delete the voice.');
}

export async function createSpeech(
  workspaceId: string,
  body: { voiceId: string; text: string; speed?: number; influencerId?: string | null },
): Promise<{ media: MediaItem } | string> {
  const r = await apiJson<{ media: MediaItem }>(`${base(workspaceId)}/speech`, {
    json: body,
    headers: { 'x-workspace-id': workspaceId }, // lets the header balance update after the charge
  });
  return r.ok ? r.data : apiErrorMessage(r, 'Could not generate speech.');
}

export async function createVideo(
  workspaceId: string,
  body: { voiceId: string; text: string; speed?: number; imageUrl: string; influencerId?: string | null },
): Promise<{ media: MediaItem } | string> {
  const r = await apiJson<{ media: MediaItem }>(`${base(workspaceId)}/videos`, {
    json: body,
    headers: { 'x-workspace-id': workspaceId },
  });
  return r.ok ? r.data : apiErrorMessage(r, 'Could not start the video.');
}

export async function fetchMediaItem(workspaceId: string, id: string): Promise<MediaItem | string> {
  const r = await apiJson<{ media: MediaItem }>(`${base(workspaceId)}/${encodeURIComponent(id)}`);
  return r.ok ? r.data.media : apiErrorMessage(r, 'Could not load the item.');
}

export async function fetchMediaList(workspaceId: string): Promise<MediaItem[] | string> {
  const r = await apiJson<{ media: MediaItem[] }>(base(workspaceId));
  return r.ok ? r.data.media : apiErrorMessage(r, 'Could not load media.');
}
