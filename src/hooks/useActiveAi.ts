import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../lib/api';

export interface ActiveAi {
  provider: string;
  label: string;
  model: string;
  keySource: 'server' | 'workspace' | 'test';
  supportsWebSearch: boolean;
  fallbackReason?: string;
}

export interface ActiveAiState {
  text: ActiveAi | null;
  image: ActiveAi | null;
  costs: { generate: number; assist: number; image: number } | null;
  loaded: boolean;
  reload: () => void;
}

/** Which AI provider/model this workspace uses right now (GET /api/ai/providers). */
export function useActiveAi(workspaceId: string): ActiveAiState {
  const [state, setState] = useState<Omit<ActiveAiState, 'reload'>>({
    text: null,
    image: null,
    costs: null,
    loaded: false,
  });
  const load = useCallback(async () => {
    const r = await apiJson<{
      active: { text: ActiveAi | null; image: ActiveAi | null };
      costs: ActiveAiState['costs'];
    }>('/api/ai/providers', { headers: { 'x-workspace-id': workspaceId } });
    setState(
      r.ok
        ? { text: r.data.active.text, image: r.data.active.image, costs: r.data.costs, loaded: true }
        : { text: null, image: null, costs: null, loaded: true },
    );
  }, [workspaceId]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

export const aiName = (a: ActiveAi | null) => (a ? `${a.label} · ${a.model}` : 'Sample mode (no AI provider)');
