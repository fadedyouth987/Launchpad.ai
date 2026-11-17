import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2, ExternalLink } from 'lucide-react';
import { API_BASE_URL, apiErrorMessage, apiJson } from '../lib/api';

type Scope = 'read' | 'write' | 'publish';
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: Scope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

const SCOPE_INFO: Record<Scope, { label: string; detail: string }> = {
  read: { label: 'Read', detail: 'View posts, influencers, images, media, credits and publishing history.' },
  write: {
    label: 'Write',
    detail: 'Create and edit drafts, generate with AI, images, voice and video (spends credits).',
  },
  publish: { label: 'Publish', detail: 'Approve, schedule and publish posts (including posting to LinkedIn).' },
};

/** Settings > API keys: owners/admins create and revoke workspace keys for other apps. */
export const ApiKeys: React.FC<{ workspaceId: string; canManage: boolean; signedIn: boolean }> = ({
  workspaceId,
  canManage,
  signedIn,
}) => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['read', 'write']);
  const [expires, setExpires] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const apiBase = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  const load = useCallback(async () => {
    if (!canManage) return;
    const r = await apiJson<{ keys: ApiKey[] }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/api-keys`);
    if (r.ok) setKeys(r.data.keys);
    else setError(apiErrorMessage(r, 'Could not load API keys.'));
  }, [workspaceId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await apiJson<{ key: string }>(`/api/workspaces/${encodeURIComponent(workspaceId)}/api-keys`, {
      json: { name: name.trim(), scopes, expiresInDays: expires ? Number(expires) : null },
    });
    setBusy(false);
    if (!r.ok) return setError(apiErrorMessage(r, 'Could not create the key.'));
    setNewKey(r.data.key);
    setName('');
    void load();
  };

  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke "${k.name}"? Apps using it stop working immediately.`)) return;
    const r = await apiJson(`/api/workspaces/${encodeURIComponent(workspaceId)}/api-keys/${k.id}`, {
      method: 'DELETE',
    });
    if (!r.ok) setError(apiErrorMessage(r));
    void load();
  };

  const toggle = (s: Scope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  const input =
    'mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';
  const example = `curl -H "Authorization: Bearer lp_live_..." \\\n  ${apiBase}/api/workspaces/${workspaceId}/campaign-assets`;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-300" /> API keys
        </h3>
        <p className="text-sm text-slate-300">
          Let other apps (Zapier, Make, n8n, your own scripts) work with this workspace. A key only works for this
          workspace, follows the same credit and approval rules as people, and everything it does is in the audit log
          under its name. Keep keys secret: never put them in a website or a public repository.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <a
            href={`${apiBase}/api/v1/openapi.json`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 font-semibold"
          >
            API description (OpenAPI) <ExternalLink className="w-3 h-3" />
          </a>
          <span className="text-slate-500">Import it into Postman, Insomnia, Make or Zapier.</span>
        </div>
        <pre className="text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-x-auto text-slate-300">
          {example}
        </pre>
      </div>

      {!signedIn ? (
        <p className="text-sm text-slate-300">API keys need a signed-in account (not available in the demo).</p>
      ) : !canManage ? (
        <p className="text-sm text-slate-300">Only the workspace owner and admins can manage API keys.</p>
      ) : (
        <>
          {newKey && (
            <div role="status" className="rounded-2xl bg-emerald-950 border border-emerald-800 p-4 space-y-2">
              <p className="text-sm font-bold text-emerald-200">Copy your new key now. It will not be shown again.</p>
              <div className="flex items-center gap-2">
                <code
                  className="flex-1 break-all rounded bg-slate-950 p-2 text-xs text-emerald-100"
                  data-testid="new-api-key"
                >
                  {newKey}
                </code>
                <button
                  onClick={() => navigator.clipboard?.writeText(newKey)}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
                  aria-label="Copy key"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => setNewKey(null)} className="text-xs text-emerald-300 hover:text-emerald-200">
                I&apos;ve saved it
              </button>
            </div>
          )}

          <form onSubmit={create} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h4 className="text-sm font-bold text-white">Create a key</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="key-name" className="block text-sm font-semibold text-slate-200">
                  Name
                </label>
                <input
                  id="key-name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Zapier, Reporting script"
                  className={input}
                />
              </div>
              <div>
                <label htmlFor="key-expiry" className="block text-sm font-semibold text-slate-200">
                  Expires
                </label>
                <select id="key-expiry" value={expires} onChange={(e) => setExpires(e.target.value)} className={input}>
                  <option value="">Never</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                  <option value="365">In 1 year</option>
                </select>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-slate-200">Permissions</legend>
              {(Object.keys(SCOPE_INFO) as Scope[]).map((s) => (
                <label key={s} className="flex items-start gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} className="mt-1" />
                  <span>
                    <strong className="text-slate-100">{SCOPE_INFO[s].label}</strong>: {SCOPE_INFO[s].detail}
                  </span>
                </label>
              ))}
            </fieldset>
            {error && (
              <p role="alert" className="text-sm font-semibold text-rose-300">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy || !name.trim() || !scopes.length}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create key'}
            </button>
          </form>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
            <h4 className="text-sm font-bold text-white">Active keys ({keys.length})</h4>
            {keys.length === 0 ? (
              <p className="text-sm text-slate-400">No keys yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {keys.map((k) => (
                  <li key={k.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">
                        {k.name} <code className="text-xs text-slate-400">{k.prefix}…</code>
                      </p>
                      <p className="text-xs text-slate-400">
                        {k.scopes.map((s) => SCOPE_INFO[s].label).join(', ')} · created{' '}
                        {new Date(k.createdAt).toLocaleDateString()} ·{' '}
                        {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'never used'}
                        {k.expiresAt ? ` · expires ${new Date(k.expiresAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => revoke(k)}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-rose-900 text-slate-300 shrink-0"
                      aria-label={`Revoke ${k.name}`}
                      title="Revoke"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
