import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleDashed, RefreshCw, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';

type Health = {
  status: string;
  version: string;
  mode: 'ai-connected' | 'demo';
  ai?: { defaultProvider: string | null; defaultImageProvider: string | null };
  integrations: Record<string, boolean | string>;
};

type Check = { name: string; url: string; ok: boolean; status: number; latencyMs: number; note: string };
type State = 'works' | 'key' | 'missing';

// What each part of the product really does in this build. Items that depend on a server key show
// "Needs key" until the server reports the integration as connected. Kept next to the UI so it is
// updated together with the features it describes.
function capabilities(h: Health | null): { area: string; state: State; detail: string }[] {
  const on = (k: string) => h?.integrations?.[k] === true;
  const ai = on('ai');
  return [
    {
      area: 'Sign-in',
      state: 'works',
      detail:
        'Neon Auth (email + password, Google). Every API call carries a short-lived JWT the server verifies; data is tied to workspace membership.',
    },
    {
      area: 'Data storage',
      state: 'works',
      detail:
        'Workspaces, members, invites, credits, ledger, audit log, campaign assets, images, influencers and Campaign OS are stored in Postgres (Neon). Demo sessions stay in server memory.',
    },
    {
      area: 'AI copy, trends, replies, workflows',
      state: ai ? 'works' : 'key',
      detail: ai
        ? `Live with ${h?.ai?.defaultProvider ?? 'the configured provider'} (Claude, GPT, Gemini, Grok, Neon AI Gateway or any OpenAI-compatible endpoint; pick in Settings → AI Providers). Trends use live web search with Gemini only.`
        : 'No server AI key: output is labelled sample text and free. Set a provider key on the server or add a workspace key in Settings → AI Providers.',
    },
    {
      area: 'AI image generation',
      state: on('imageGeneration') ? 'works' : 'key',
      detail:
        'OpenAI, Gemini or Grok images, stored in Postgres. Needs OPENAI_API_KEY, GEMINI_API_KEY or XAI_API_KEY (or a workspace key).',
    },
    {
      area: 'Campaign OS',
      state: ai ? 'works' : 'key',
      detail:
        'Plans are saved per workspace. "Run step with AI" drafts each step with your provider; you can also mark steps done by hand.',
    },
    {
      area: 'Credits and top-ups',
      state: on('payments') ? 'works' : 'key',
      detail: on('payments')
        ? 'Charged and refunded on the server. Top-ups go through Stripe Checkout; the signed webhook adds credits once.'
        : 'Charged and refunded on the server. Top-ups need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    },
    {
      area: 'Team invitations',
      state: 'works',
      detail: on('email')
        ? 'Invites are emailed through Resend and accepted with a matching signed-in email.'
        : 'Invite links are created and can be copied; emailing them needs RESEND_API_KEY and EMAIL_FROM.',
    },
    {
      area: 'Webhooks',
      state: on('webhookDelivery') ? 'works' : 'key',
      detail: on('webhookDelivery')
        ? 'Signed (HMAC-SHA256) POSTs for approval and publishing events, with SSRF checks. Use them to hand posts to Zapier, Make or Buffer.'
        : 'Built, but sending is switched off on this server, so test sends are simulated and events are not delivered. Set WEBHOOK_DELIVERY_ENABLED=true (it is on by default on the deployed API).',
    },
    {
      area: 'Analytics',
      state: 'works',
      detail:
        'Real workspace numbers (assets, approvals, schedule, AI usage, credits). Reach and engagement figures from social networks are not collected yet.',
    },
    {
      area: 'Direct social posting',
      state: on('socialPublishing') ? 'works' : 'key',
      detail: on('socialPublishing')
        ? 'LinkedIn: connect a profile on the Publisher page; approved posts scheduled for LinkedIn are posted automatically each minute (with their image). Other networks get signed webhooks for Zapier, Make or Buffer.'
        : 'LinkedIn posting is built but needs LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI and AI_KEYS_ENCRYPTION_KEY. Other networks get signed webhooks.',
    },
    {
      area: 'Paid plans',
      state: on('payments') ? 'works' : 'key',
      detail: on('payments')
        ? 'Monthly Starter, Professional and Enterprise plans through Stripe Billing. Each paid month adds the plan’s credits; upgrades are prorated; card, invoices and cancelling are handled in the Stripe billing portal. Member limits (3 / 10 / unlimited) are enforced on invitations.'
        : 'Monthly plans through Stripe Billing are built but need STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    },
    {
      area: 'Voice and video avatars',
      state: on('voice') ? 'works' : 'key',
      detail: on('video')
        ? 'ElevenLabs voices (standard or cloned with consent) and D-ID talking-head videos from the influencer photo, on the AI Influencers > Voice tab.'
        : on('voice')
          ? 'ElevenLabs voices work. Talking-head videos also need DID_API_KEY.'
          : 'Built, but needs ELEVENLABS_API_KEY (voices) and DID_API_KEY (talking videos).',
    },
  ];
}

const CHECKS = [
  { url: '/api/health', name: 'Server is responding' },
  { url: '/api/billing/credits/check', name: 'Credit balance endpoint' },
  { url: '/api/ai/providers', name: 'AI provider status' },
  { url: '/api/features/ai_asset_studio', name: 'Feature flag endpoint' },
];

const stateStyle = {
  works: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  key: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  missing: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};
const stateLabel = { works: 'Works', key: 'Needs key', missing: 'Not built' };

export const SystemStatus: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [health, setHealth] = useState<Health | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const results: Check[] = [];
    for (const c of CHECKS) {
      const start = performance.now();
      try {
        const res = await apiFetch(c.url, { headers: { 'x-workspace-id': workspaceId } });
        const latencyMs = Math.round(performance.now() - start);
        if (c.url === '/api/health' && res.ok) setHealth(await res.json());
        results.push({
          ...c,
          ok: res.ok,
          status: res.status,
          latencyMs,
          note: res.ok ? 'OK' : `Failed (HTTP ${res.status})`,
        });
      } catch (err) {
        results.push({
          ...c,
          ok: false,
          status: 0,
          latencyMs: Math.round(performance.now() - start),
          note: `Unreachable: ${(err as Error)?.message || 'network error'}`,
        });
      }
    }
    setChecks(results);
    setRunning(false);
  }, [workspaceId]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const passed = checks.filter((c) => c.ok).length;

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2">
            {health && (
              <span
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${health.mode === 'demo' ? stateStyle.key : stateStyle.works}`}
              >
                {health.mode === 'demo'
                  ? 'Sample mode: no server AI key'
                  : `AI connected: ${health.ai?.defaultProvider ?? 'provider'}`}
              </span>
            )}
          </div>
          <p className="text-ink-subtle dark:text-slate-400 text-xs mt-1">
            Live checks against this server, and a plain list of what is real, simulated, or not built yet.
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={running}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Checking…' : 'Re-run checks'}
        </button>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Endpoint checks</h3>
          {checks.length > 0 && (
            <span
              className={`text-xs font-bold ${passed === checks.length ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600'}`}
            >
              {passed}/{checks.length} passing
            </span>
          )}
        </div>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {checks.map((c) => (
            <div key={c.url} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                {c.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-500" />
                )}
                <span className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</span>
                <code className="text-ink-subtle">{c.url}</code>
              </div>
              <span className={c.ok ? 'text-ink-subtle' : 'text-rose-600 font-semibold'}>
                {c.note} · {c.latencyMs}ms
              </span>
            </div>
          ))}
          {checks.length === 0 && (
            <div className="py-3 text-xs text-ink-subtle flex items-center gap-2">
              <CircleDashed className="w-4 h-4 animate-spin" />
              Running checks…
            </div>
          )}
        </div>
      </section>

      {health && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Integrations reported by the server</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(health.integrations)
              .filter(([, on]) => typeof on === 'boolean')
              .map(([name, on]) => (
                <span
                  key={name}
                  className={`text-2xs font-bold px-2.5 py-1 rounded-full ${on ? stateStyle.works : stateStyle.missing}`}
                >
                  {name}: {on ? 'connected' : 'not connected'}
                </span>
              ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">What works in this build</h3>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {capabilities(health).map((c) => (
            <div
              key={c.area}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_90px_1fr] items-start gap-x-4 gap-y-1 py-2.5 text-xs"
            >
              <span className="font-semibold text-slate-800 dark:text-slate-100">{c.area}</span>
              <span className={`justify-self-start text-2xs font-bold px-2 py-0.5 rounded-full ${stateStyle[c.state]}`}>
                {stateLabel[c.state]}
              </span>
              <span className="col-span-2 sm:col-span-1 text-ink-subtle dark:text-slate-400">{c.detail}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
