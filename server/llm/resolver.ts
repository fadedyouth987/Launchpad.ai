/**
 * Picks the provider, model and key for one AI call:
 *   1. the workspace's chosen provider/model (Settings > AI providers), when that provider is usable;
 *   2. otherwise the server default (AI_PROVIDER, or the first configured provider);
 *   3. otherwise null: routes return clearly labelled sample output and charge nothing.
 * A workspace key (saved by an owner/admin) is used before the server key for the same provider.
 */
import { DATABASE_CONFIGURED } from '../db';
import { DEMO_MODE } from '../auth';
import {
  buildProvider,
  PROVIDER_ORDER,
  providerCatalog,
  serverConfigured,
  serverDefaultImageProvider,
  serverDefaultProvider,
} from './catalog';
import {
  getAiSettings,
  listWorkspaceKeys,
  loadWorkspaceKey,
  type StoredKeyInfo,
  type WorkspaceAiSettings,
} from './settings';
import { keyStorageEnabled } from './secrets';
import type { LlmProvider, ProviderId } from './types';

export interface ResolvedAi {
  provider: ProviderId;
  label: string;
  model: string;
  keySource: 'server' | 'workspace' | 'test';
  supportsWebSearch: boolean;
  llm: LlmProvider;
  /** Set when the workspace's choice could not be used and the server default was used instead. */
  fallbackReason?: string;
}

export interface AiResolver {
  text(workspaceId: string | null): Promise<ResolvedAi | null>;
  image(workspaceId: string | null): Promise<ResolvedAi | null>;
  /** True when no provider can ever be used for any workspace (pure sample mode). */
  anyConfigured(): boolean;
  /** Fetch implementation used for workspace-key adapters (tests inject a mock). */
  fetchImpl?: typeof fetch;
}

const EMPTY_SETTINGS: WorkspaceAiSettings = {
  textProvider: null,
  textModel: null,
  imageProvider: null,
  imageModel: null,
  updatedAt: null,
  updatedBy: null,
};

export async function workspaceContext(workspaceId: string | null) {
  if (!workspaceId || (!DATABASE_CONFIGURED && !DEMO_MODE)) {
    return { settings: EMPTY_SETTINGS, keys: new Map<ProviderId, StoredKeyInfo>() };
  }
  try {
    const [settings, keys] = await Promise.all([getAiSettings(workspaceId), listWorkspaceKeys(workspaceId)]);
    return { settings, keys };
  } catch (err) {
    console.warn('[ai] could not read workspace AI settings, using server default:', (err as Error).message);
    return { settings: EMPTY_SETTINGS, keys: new Map<ProviderId, StoredKeyInfo>() };
  }
}

export function availability(id: ProviderId, keys: Map<ProviderId, StoredKeyInfo>) {
  const info = providerCatalog()[id];
  const workspaceKey = info.allowWorkspaceKey && keyStorageEnabled() && keys.has(id);
  return { server: serverConfigured(id), workspace: workspaceKey, usable: serverConfigured(id) || workspaceKey };
}

export function createAiResolver(fetchImpl?: typeof fetch): AiResolver {
  async function resolve(kind: 'text' | 'image', workspaceId: string | null): Promise<ResolvedAi | null> {
    const cat = providerCatalog();
    const { settings, keys } = await workspaceContext(workspaceId);
    const canDo = (id: ProviderId) => kind === 'text' || Boolean(cat[id].imageModel);
    const usable = (id: ProviderId) => canDo(id) && availability(id, keys).usable;

    const chosen = kind === 'text' ? settings.textProvider : settings.imageProvider;
    let provider: ProviderId | null = null;
    let fallbackReason: string | undefined;
    if (chosen && cat[chosen] && usable(chosen)) provider = chosen;
    else {
      if (chosen) fallbackReason = `${cat[chosen]?.label ?? chosen} is not configured; using the server default.`;
      const serverDefault = kind === 'text' ? serverDefaultProvider() : serverDefaultImageProvider();
      provider = serverDefault ?? PROVIDER_ORDER.find(usable) ?? null;
    }
    if (!provider) return null;

    const info = cat[provider];
    const chosenModel = kind === 'text' ? settings.textModel : settings.imageModel;
    const defaultModel = (kind === 'text' ? info.defaultModel : info.imageModel) || '';
    const model = provider === chosen && chosenModel ? chosenModel : defaultModel;
    if (!model) return null;

    const workspaceKey =
      workspaceId && availability(provider, keys).workspace ? await loadWorkspaceKey(workspaceId, provider) : null;
    if (!workspaceKey && !serverConfigured(provider)) return null;
    return {
      provider,
      label: info.label,
      model,
      keySource: workspaceKey ? 'workspace' : 'server',
      supportsWebSearch: info.supportsWebSearch,
      llm: workspaceKey
        ? buildProvider(provider, workspaceKey, fetchImpl)
        : buildProvider(provider, undefined, fetchImpl),
      ...(fallbackReason ? { fallbackReason } : {}),
    };
  }
  return {
    text: (ws) => resolve('text', ws),
    image: (ws) => resolve('image', ws),
    // Workspace keys may exist, so "configured" is true whenever key storage is on too.
    anyConfigured: () => PROVIDER_ORDER.some(serverConfigured),
    fetchImpl,
  };
}

/** A resolver that always returns one fixed provider (tests), or never returns one (null). */
export function fixedResolver(
  llm: LlmProvider | null,
  meta: Partial<Pick<ResolvedAi, 'provider' | 'label' | 'model' | 'supportsWebSearch'>> = {},
): AiResolver {
  const resolved = (): ResolvedAi | null =>
    llm
      ? {
          provider: meta.provider ?? 'gemini',
          label: meta.label ?? 'Google Gemini',
          model: meta.model ?? providerCatalog().gemini.defaultModel,
          keySource: 'test',
          supportsWebSearch: meta.supportsWebSearch ?? true,
          llm,
        }
      : null;
  return {
    text: async () => resolved(),
    image: async () => (llm?.generateImage ? resolved() : null),
    anyConfigured: () => Boolean(llm),
  };
}
