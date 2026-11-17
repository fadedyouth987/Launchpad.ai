import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export interface Health {
  auth: 'demo-mode' | 'neon' | 'not-configured';
  ai?: {
    defaultProvider: string | null;
    defaultImageProvider: string | null;
    providers: Record<string, boolean>;
    workspaceKeys: boolean;
  };
  integrations: {
    ai: boolean;
    gemini: boolean;
    imageGeneration?: boolean;
    database: boolean;
    payments: boolean;
    socialPublishing: boolean;
    voice?: boolean;
    video?: boolean;
    webhookDelivery: boolean;
  };
}

/** /api/health, fetched once. null while loading or if the server is unreachable. */
export function useHealth(): { health: Health | null; failed: boolean } {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((h: Health) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);
  return { health, failed };
}

export function modeLabel(health: Health | null): { label: string; tone: 'ok' | 'warn' } {
  if (!health) return { label: 'Checking connection…', tone: 'warn' };
  const ai = health.integrations.ai;
  if (health.auth !== 'neon') return { label: ai ? 'Demo data · AI on' : 'Demo mode', tone: 'warn' };
  return ai ? { label: 'AI connected', tone: 'ok' } : { label: 'AI not connected · samples only', tone: 'warn' };
}
