import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleSlash, ExternalLink, KeyRound, PlugZap, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiErrorMessage, apiJson } from '../lib/api';
import { Button } from './ui/Button';
import { ErrorState, LoadingState } from './ui/States';

type ProviderId = 'neon-gateway' | 'anthropic' | 'openai' | 'gemini' | 'xai' | 'custom';

interface Provider {
  id: ProviderId;
  label: string;
  description: string;
  keyEnv: string;
  otherEnv: string[];
  modelEnv: string;
  defaultModel: string;
  suggestedModels: string[];
  imageModel: string | null;
  imageModelEnv: string | null;
  supportsWebSearch: boolean;
  allowWorkspaceKey: boolean;
  keyUrl: string;
  docsUrl: string;
  serverConfigured: boolean;
  workspaceKey: { last4: string; createdAt: string } | null;
  usable: boolean;
  canMakeImages: boolean;
}

interface Active {
  provider: ProviderId;
  label: string;
  model: string;
  keySource: 'server' | 'workspace' | 'test';
  supportsWebSearch: boolean;
  fallbackReason?: string;
}

interface Status {
  demo: boolean;
  canEdit: boolean;
  keyStorageEnabled: boolean;
  selected: {
    textProvider: ProviderId | null;
    textModel: string | null;
    imageProvider: ProviderId | null;
    imageModel: string | null;
    updatedAt: string | null;
  };
  active: { text: Active | null; image: Active | null };
  serverDefault: { text: ProviderId | null; image: ProviderId | null };
  costs: { generate: number; assist: number; image: number };
  providers: Provider[];
}

const pill = {
  ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  off: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
};
const card = 'rounded-2xl border border-line bg-surface p-5 shadow-sm';
const fieldLabel = 'block text-sm font-semibold text-ink';
const input =
  'mt-1 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60';

function ActiveLine({ title, a, empty }: { title: string; a: Active | null; empty: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">{title}</p>
      {a ? (
        <>
          <p className="mt-1 text-lg font-bold text-ink" data-testid={`active-${title.toLowerCase().split(' ')[0]}`}>
            {a.label} · <span className="font-mono text-base">{a.model}</span>
          </p>
          <p className="text-sm text-ink-muted">
            Key: {a.keySource === 'workspace' ? "this workspace's own key" : 'server key'}
            {title.startsWith('Text') &&
              (a.supportsWebSearch
                ? ' · live web search for trends'
                : ' · trends from model knowledge (no live search)')}
          </p>
          {a.fallbackReason && (
            <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-300">{a.fallbackReason}</p>
          )}
        </>
      ) : (
        <p
          className="mt-1 text-base font-semibold text-amber-800 dark:text-amber-300"
          data-testid={`active-${title.toLowerCase().split(' ')[0]}`}
        >
          {empty}
        </p>
      )}
    </div>
  );
}

export const AiSettings: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ textProvider: '', textModel: '', imageProvider: '', imageModel: '' });
  const [liveModels, setLiveModels] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [test, setTest] = useState<string>('');

  const load = useCallback(async () => {
    const r = await apiJson<Status>('/api/ai/providers', { headers: { 'x-workspace-id': workspaceId } });
    if (!r.ok) return setError(apiErrorMessage(r, 'Could not load AI provider settings.'));
    setError('');
    setStatus(r.data);
    setForm({
      textProvider: r.data.selected.textProvider ?? '',
      textModel: r.data.selected.textModel ?? '',
      imageProvider: r.data.selected.imageProvider ?? '',
      imageModel: r.data.selected.imageModel ?? '',
    });
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <ErrorState title="AI provider settings" message={error} onRetry={load} />;
  if (!status) return <LoadingState label="Loading AI providers…" />;

  const byId = Object.fromEntries(status.providers.map((p) => [p.id, p])) as Record<ProviderId, Provider>;
  const defaultLabel = (id: ProviderId | null) => (id ? byId[id].label : 'none configured, sample output');
  const textInfo = form.textProvider ? byId[form.textProvider as ProviderId] : null;
  const imageInfo = form.imageProvider ? byId[form.imageProvider as ProviderId] : null;
  const modelOptions = (p: Provider | null, kind: 'text' | 'image') =>
    p
      ? [
          ...new Set([...(kind === 'text' ? p.suggestedModels : [p.imageModel || '']), ...(liveModels[p.id] || [])]),
        ].filter(Boolean)
      : [];

  const loadModels = async (id: ProviderId) => {
    setBusy(`models-${id}`);
    const r = await apiJson<{ models: string[]; live: boolean; note?: string }>(`/api/ai/providers/${id}/models`, {
      headers: { 'x-workspace-id': workspaceId },
    });
    setBusy('');
    if (r.ok) {
      setLiveModels((m) => ({ ...m, [id]: r.data.models }));
      setNotice({
        tone: r.data.live ? 'ok' : 'error',
        text: r.data.live
          ? `Loaded ${r.data.models.length} models from ${byId[id].label}.`
          : r.data.note || 'Live list unavailable.',
      });
    } else setNotice({ tone: 'error', text: apiErrorMessage(r) });
  };

  const save = async () => {
    setBusy('save');
    const r = await apiJson(`/api/workspaces/${workspaceId}/ai-settings`, {
      method: 'PUT',
      json: {
        textProvider: form.textProvider || null,
        textModel: form.textProvider ? form.textModel.trim() || textInfo?.defaultModel || null : null,
        imageProvider: form.imageProvider || null,
        imageModel: form.imageProvider ? form.imageModel.trim() || imageInfo?.imageModel || null : null,
      },
    });
    setBusy('');
    setNotice(
      r.ok
        ? { tone: 'ok', text: 'Saved. New AI calls in this workspace use this choice.' }
        : { tone: 'error', text: apiErrorMessage(r) },
    );
    if (r.ok) load();
  };

  const runTest = async () => {
    setBusy('test');
    setTest('');
    const r = await apiJson<{
      ok: boolean;
      label?: string;
      model?: string;
      latencyMs?: number;
      reply?: string;
      message?: string;
    }>(`/api/workspaces/${workspaceId}/ai-test`, { json: {} });
    setBusy('');
    if (!r.ok) return setTest(`Test failed: ${apiErrorMessage(r)}`);
    setTest(
      r.data.ok
        ? `Connected: ${r.data.label} · ${r.data.model} answered "${(r.data.reply || '').trim()}" in ${r.data.latencyMs} ms.`
        : `Not working: ${r.data.message}${r.data.label ? ` (${r.data.label} · ${r.data.model})` : ''}`,
    );
  };

  const saveKey = async (id: ProviderId) => {
    setBusy(`key-${id}`);
    const r = await apiJson(`/api/workspaces/${workspaceId}/ai-keys/${id}`, {
      method: 'PUT',
      json: { apiKey: keys[id] || '' },
    });
    setBusy('');
    setKeys((k) => ({ ...k, [id]: '' }));
    setNotice(
      r.ok
        ? { tone: 'ok', text: `${byId[id].label} key saved (encrypted). It is never shown again.` }
        : { tone: 'error', text: apiErrorMessage(r) },
    );
    if (r.ok) load();
  };

  const removeKey = async (id: ProviderId) => {
    setBusy(`del-${id}`);
    const r = await apiJson(`/api/workspaces/${workspaceId}/ai-keys/${id}`, { method: 'DELETE' });
    setBusy('');
    setNotice(
      r.ok
        ? { tone: 'ok', text: `${byId[id].label} workspace key removed.` }
        : { tone: 'error', text: apiErrorMessage(r) },
    );
    if (r.ok) load();
  };

  return (
    <div className="space-y-6 w-full" data-testid="ai-settings">
      {notice && (
        <div
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${notice.tone === 'ok' ? pill.ok : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200'}`}
        >
          {notice.text}
        </div>
      )}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">In use right now</h2>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={RefreshCw} onClick={load}>
              Refresh
            </Button>
            {status.canEdit && (
              <Button variant="secondary" size="sm" icon={PlugZap} onClick={runTest} disabled={busy === 'test'}>
                {busy === 'test' ? 'Testing…' : 'Test connection'}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ActiveLine
            title="Text (copy, trends, replies, workflows)"
            a={status.active.text}
            empty="Sample mode: no AI provider is configured. Output is labelled sample text and is free."
          />
          <ActiveLine
            title="Images"
            a={status.active.image}
            empty="No image provider configured. Image generation is off."
          />
        </div>
        {test && (
          <p className="mt-3 text-sm font-semibold text-ink" role="status">
            {test}
          </p>
        )}
        <p className="mt-3 text-sm text-ink-muted">
          Cost per call, the same for every provider and key: copy {status.costs.generate} credits · trends / replies /
          workflow {status.costs.assist} credits · image {status.costs.image} credits. Failed calls are refunded. Sample
          output is free.
        </p>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold text-ink">Choose the provider for this workspace</h2>
        {!status.canEdit && (
          <p className="mt-1 text-sm font-semibold text-amber-800 dark:text-amber-300">
            Only workspace owners and admins can change this. You can see every setting below.
          </p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className={fieldLabel} htmlFor="ai-text-provider">
              Text provider
            </label>
            <select
              id="ai-text-provider"
              className={input}
              disabled={!status.canEdit}
              value={form.textProvider}
              onChange={(e) => setForm((f) => ({ ...f, textProvider: e.target.value, textModel: '' }))}
            >
              <option value="">Server default ({defaultLabel(status.serverDefault.text)})</option>
              {status.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.usable}>
                  {p.label}
                  {p.usable ? '' : ' (no key yet)'}
                </option>
              ))}
            </select>
            <label className={`${fieldLabel} mt-3`} htmlFor="ai-text-model">
              Text model
            </label>
            <input
              id="ai-text-model"
              className={input}
              list="ai-text-models"
              disabled={!status.canEdit || !form.textProvider}
              placeholder={
                textInfo ? `Default: ${textInfo.defaultModel || '(set a model)'}` : 'Uses the server default model'
              }
              value={form.textModel}
              onChange={(e) => setForm((f) => ({ ...f, textModel: e.target.value }))}
            />
            <datalist id="ai-text-models">
              {modelOptions(textInfo, 'text').map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {textInfo?.usable && (
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-brand-700 underline dark:text-brand-300"
                onClick={() => loadModels(textInfo.id)}
              >
                {busy === `models-${textInfo.id}` ? 'Loading models…' : `Load live model list from ${textInfo.label}`}
              </button>
            )}
          </div>
          <div>
            <label className={fieldLabel} htmlFor="ai-image-provider">
              Image provider
            </label>
            <select
              id="ai-image-provider"
              className={input}
              disabled={!status.canEdit}
              value={form.imageProvider}
              onChange={(e) => setForm((f) => ({ ...f, imageProvider: e.target.value, imageModel: '' }))}
            >
              <option value="">Server default ({defaultLabel(status.serverDefault.image)})</option>
              {status.providers
                .filter((p) => p.canMakeImages)
                .map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.usable}>
                    {p.label}
                    {p.usable ? '' : ' (no key yet)'}
                  </option>
                ))}
            </select>
            <label className={`${fieldLabel} mt-3`} htmlFor="ai-image-model">
              Image model
            </label>
            <input
              id="ai-image-model"
              className={input}
              list="ai-image-models"
              disabled={!status.canEdit || !form.imageProvider}
              placeholder={imageInfo ? `Default: ${imageInfo.imageModel}` : 'Uses the server default model'}
              value={form.imageModel}
              onChange={(e) => setForm((f) => ({ ...f, imageModel: e.target.value }))}
            />
            <datalist id="ai-image-models">
              {modelOptions(imageInfo, 'image').map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>
        {status.canEdit && (
          <div className="mt-4">
            <Button icon={Save} onClick={save} disabled={busy === 'save'}>
              {busy === 'save' ? 'Saving…' : 'Save AI settings'}
            </Button>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold text-ink">All providers</h2>
        <p className="mt-1 text-sm text-ink-muted">
          A provider is available when the server has its key (set by whoever runs Launchpad) or this workspace saved
          its own key.{' '}
          {status.keyStorageEnabled
            ? 'Workspace keys are encrypted on the server and never shown again after saving.'
            : status.demo
              ? 'Workspace keys are off in demo mode.'
              : 'Workspace keys are off on this server: the admin must set AI_KEYS_ENCRYPTION_KEY.'}
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {status.providers.map((p) => (
            <article key={p.id} className="rounded-xl border border-line p-4" data-testid={`provider-${p.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-ink">{p.label}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.usable ? pill.ok : pill.off}`}>
                  {p.usable ? 'Available' : 'Not configured'}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{p.description}</p>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="font-semibold text-ink">Server key</dt>
                <dd className="flex items-center gap-1 text-ink">
                  {p.serverConfigured ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <CircleSlash className="h-4 w-4 text-ink-subtle" aria-hidden />
                  )}
                  {p.serverConfigured ? 'Set' : 'Not set'} ·{' '}
                  <code className="text-xs">{[p.keyEnv, ...p.otherEnv].join(', ')}</code>
                </dd>
                {p.allowWorkspaceKey && (
                  <>
                    <dt className="font-semibold text-ink">Workspace key</dt>
                    <dd className="text-ink">
                      {p.workspaceKey
                        ? `Saved${p.workspaceKey.last4 ? ` (ends ${p.workspaceKey.last4})` : ''}`
                        : 'None'}
                    </dd>
                  </>
                )}
                <dt className="font-semibold text-ink">Default model</dt>
                <dd className="font-mono text-xs text-ink">
                  {p.defaultModel || '(set ' + p.modelEnv + ')'}{' '}
                  <span className="font-sans text-ink-subtle">· change with {p.modelEnv}</span>
                </dd>
                <dt className="font-semibold text-ink">Images</dt>
                <dd className="text-ink">
                  {p.imageModel ? <span className="font-mono text-xs">{p.imageModel}</span> : 'No'}
                </dd>
                <dt className="font-semibold text-ink">Live web search</dt>
                <dd className="text-ink">{p.supportsWebSearch ? 'Yes (Google Search grounding for trends)' : 'No'}</dd>
                <dt className="font-semibold text-ink">Get a key</dt>
                <dd className="text-ink break-words">
                  {p.keyUrl.startsWith('https://') ? (
                    <a
                      className="inline-flex items-center gap-1 font-semibold text-brand-700 underline dark:text-brand-300"
                      href={p.keyUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {p.keyUrl.replace('https://', '')} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : (
                    p.keyUrl
                  )}
                </dd>
              </dl>
              {p.allowWorkspaceKey && status.canEdit && status.keyStorageEnabled && (
                <form
                  className="mt-3 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveKey(p.id);
                  }}
                >
                  <div className="min-w-[14rem] flex-1">
                    <label className="text-xs font-semibold text-ink" htmlFor={`key-${p.id}`}>
                      {p.workspaceKey ? 'Replace workspace key' : 'Add a workspace key'}
                    </label>
                    <input
                      id={`key-${p.id}`}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      className={input}
                      placeholder={`${p.label} API key`}
                      value={keys[p.id] || ''}
                      onChange={(e) => setKeys((k) => ({ ...k, [p.id]: e.target.value }))}
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center gap-2 rounded-control bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                    disabled={!keys[p.id] || busy === `key-${p.id}`}
                  >
                    <KeyRound className="h-4 w-4" aria-hidden /> {busy === `key-${p.id}` ? 'Checking…' : 'Save key'}
                  </button>
                  {p.workspaceKey && (
                    <Button
                      variant="danger"
                      icon={Trash2}
                      onClick={() => removeKey(p.id)}
                      disabled={busy === `del-${p.id}`}
                    >
                      Remove key
                    </Button>
                  )}
                </form>
              )}
              {!p.allowWorkspaceKey && (
                <p className="mt-3 text-xs text-ink-subtle">
                  Server admin only: set the env vars above on the API and redeploy.
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
