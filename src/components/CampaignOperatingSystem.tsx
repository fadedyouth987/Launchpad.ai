import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Contact,
  Globe2,
  GripVertical,
  LockKeyhole,
  Mail,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  UserRoundCheck,
  WandSparkles,
  Workflow,
} from 'lucide-react';
import { apiJson } from '../lib/api';
import { newId } from '../lib/ids';
import { fetchCampaignOs, saveCampaignOs } from '../lib/workspaceApi';

type NodeStatus = 'ready' | 'running' | 'complete' | 'blocked';
type WorkflowNode = {
  id: string;
  type: string;
  title: string;
  description: string;
  x: number;
  y: number;
  status: NodeStatus;
  owner: string;
  output?: string;
};
type Campaign = {
  id: string;
  name: string;
  goal: string;
  audience: string;
  offer: string;
  status: string;
  createdAt: string;
  nodes: WorkflowNode[];
};
type Agent = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  memory: string[];
  active: boolean;
  lastRun?: string;
};
type Lead = { id: string; name: string; email: string; company: string; stage: string; score: number; source: string };
type Page = {
  id: string;
  name: string;
  type: 'landing' | 'website';
  headline: string;
  subheadline: string;
  cta: string;
  published: boolean;
};
type EmailFlow = { id: string; name: string; trigger: string; subject: string; body: string; enabled: boolean };
type Client = { id: string; name: string; contact: string; portalStatus: string; approvals: number };

const uid = newId;

const defaultNodes: WorkflowNode[] = [
  {
    id: 'n1',
    type: 'strategy',
    title: 'Campaign Strategy',
    description: 'Define the outcome, offer and success metrics.',
    x: 20,
    y: 30,
    status: 'complete',
    owner: 'Strategy Agent',
  },
  {
    id: 'n2',
    type: 'audience',
    title: 'Audience Research',
    description: 'Build ICP, objections and buying triggers.',
    x: 280,
    y: 30,
    status: 'ready',
    owner: 'Research Agent',
  },
  {
    id: 'n3',
    type: 'message',
    title: 'Messaging System',
    description: 'Create hooks, pillars and campaign narrative.',
    x: 540,
    y: 30,
    status: 'ready',
    owner: 'Creative Agent',
  },
  {
    id: 'n4',
    type: 'content',
    title: 'Content Production',
    description: 'Generate social, email and ad assets.',
    x: 280,
    y: 230,
    status: 'ready',
    owner: 'Content Agent',
  },
  {
    id: 'n5',
    type: 'approval',
    title: 'Client Approval',
    description: 'Route selected assets into the client portal.',
    x: 540,
    y: 230,
    status: 'blocked',
    owner: 'Approval Agent',
  },
  {
    id: 'n6',
    type: 'publish',
    title: 'Publish & Measure',
    description: 'Schedule, publish and report performance.',
    x: 800,
    y: 230,
    status: 'blocked',
    owner: 'Operator Agent',
  },
];

const initialState = {
  campaigns: [
    {
      id: 'cmp-demo',
      name: '30-Day Product Launch',
      goal: 'Generate qualified leads for a premium fitness product',
      audience: 'Gym-goers aged 24–44',
      offer: 'Free 7-day transformation plan',
      status: 'draft',
      createdAt: new Date().toISOString(),
      nodes: defaultNodes,
    },
  ] as Campaign[],
  agents: [
    {
      id: 'a1',
      name: 'Campaign Operator',
      role: 'Orchestrator',
      instructions: 'Plan, delegate, validate and advance campaign work only after required approvals.',
      memory: ['Brand tone: confident, clear, practical'],
      active: true,
    },
    {
      id: 'a2',
      name: 'Research Agent',
      role: 'Audience intelligence',
      instructions: 'Find audience pains, intent signals, objections and channel fit.',
      memory: [],
      active: true,
    },
    {
      id: 'a3',
      name: 'Creative Agent',
      role: 'Messaging and concepts',
      instructions: 'Create differentiated hooks and campaign concepts that obey brand rules.',
      memory: [],
      active: true,
    },
  ] as Agent[],
  leads: [
    {
      id: 'l1',
      name: 'Avery Stone',
      email: 'avery@example.com',
      company: 'Pulse Fitness',
      stage: 'Qualified',
      score: 86,
      source: 'Landing page',
    },
  ] as Lead[],
  pages: [
    {
      id: 'p1',
      name: 'Transformation Challenge',
      type: 'landing',
      headline: 'Build momentum in 7 days',
      subheadline: 'A practical plan made for busy people.',
      cta: 'Get the free plan',
      published: false,
    },
  ] as Page[],
  emails: [
    {
      id: 'e1',
      name: 'New lead nurture',
      trigger: 'Form submitted',
      subject: 'Your 7-day plan is ready',
      body: 'Hi {{first_name}}, here is the plan you requested…',
      enabled: true,
    },
  ] as EmailFlow[],
  clients: [
    { id: 'c1', name: 'Pulse Fitness', contact: 'avery@example.com', portalStatus: 'Active', approvals: 3 },
  ] as Client[],
};

type CampaignOsState = typeof initialState;

const NODE_STATUSES: NodeStatus[] = ['ready', 'running', 'complete', 'blocked'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const hasStringId = (v: unknown) => isObj(v) && isStr(v.id);

function isValidNode(n: unknown): n is WorkflowNode {
  return (
    isObj(n) &&
    isStr(n.id) &&
    isStr(n.type) &&
    isStr(n.title) &&
    isStr(n.description) &&
    isStr(n.owner) &&
    typeof n.x === 'number' &&
    typeof n.y === 'number' &&
    NODE_STATUSES.includes(n.status as NodeStatus)
  );
}

/** Shape check for data loaded from the server (it may be from an older version). The server validates too. */
function isValidState(v: unknown): v is CampaignOsState {
  if (!isObj(v)) return false;
  const lists = ['campaigns', 'agents', 'leads', 'pages', 'emails', 'clients'] as const;
  if (!lists.every((k) => Array.isArray(v[k]) && (v[k] as unknown[]).every(hasStringId))) return false;
  return (
    (v.campaigns as unknown[]).every(
      (c) => isObj(c) && isStr(c.name) && Array.isArray(c.nodes) && c.nodes.every(isValidNode),
    ) && (v.agents as unknown[]).every((a) => isObj(a) && Array.isArray(a.memory))
  );
}

const featureTabs = [
  ['operator', 'AI Campaign Operator', Rocket],
  ['workflow', 'Workflow Builder', Workflow],
  ['agents', 'Persistent Agents', Bot],
  ['identity', 'Identity Lock', LockKeyhole],
  ['crm', 'CRM', Contact],
  ['pages', 'Pages & Sites', Globe2],
  ['email', 'Email Automation', Mail],
  ['clients', 'Client Portals', Building2],
] as const;

export function CampaignOperatingSystem({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<(typeof featureTabs)[number][0]>('operator');
  // Mounted with key={workspaceId} by the parent, so switching workspace remounts and resets all of
  // this state. Data is saved per workspace on the server (PUT /api/workspaces/:id/campaign-os).
  const [state, setState] = useState<CampaignOsState>(() => structuredClone(initialState));
  const [loadStatus, setLoadStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const loaded = useRef(false);
  const skipNextSave = useRef(false);
  const [activeCampaignId, setActiveCampaignId] = useState(() => state.campaigns[0]?.id ?? '');
  const [brief, setBrief] = useState('Create a 30-day fitness campaign to promote my new protein product.');
  const [busy, setBusy] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<string[]>([
    'Campaign OS ready. Steps are tracked here; nothing is generated, sent or published automatically yet.',
  ]);

  // Load this workspace's saved state. Missing or invalid data falls back to the starter template.
  useEffect(() => {
    let cancelled = false;
    try {
      localStorage.removeItem(`launchpad-campaign-os-v1-${workspaceId}`);
    } catch {
      /* legacy browser-only copy */
    }
    fetchCampaignOs<unknown>(workspaceId).then((r) => {
      if (cancelled) return;
      if (typeof r === 'string') {
        setLoadStatus('error');
        setSaveError(r);
        return;
      }
      if (r.state !== null) {
        if (isValidState(r.state)) {
          skipNextSave.current = true;
          setState(r.state);
          setActiveCampaignId(r.state.campaigns[0]?.id ?? '');
        } else console.warn(`[campaign-os] discarding invalid saved state for ${workspaceId}`);
      }
      loaded.current = true;
      setLoadStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // Save changes (debounced). Nothing is saved until the initial load succeeded, so a failed load
  // can never overwrite the server copy with the template.
  useEffect(() => {
    if (!loaded.current) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setSaveStatus('saving');
    const t = setTimeout(() => {
      saveCampaignOs(workspaceId, state).then((err) => {
        setSaveStatus(err ? 'error' : 'saved');
        setSaveError(err);
      });
    }, 700);
    return () => clearTimeout(t);
  }, [state, workspaceId]);

  const campaign = state.campaigns.find((c) => c.id === activeCampaignId) || state.campaigns[0];
  const node = campaign?.nodes.find((n) => n.id === selectedNode);
  const progress = campaign
    ? Math.round((campaign.nodes.filter((n) => n.status === 'complete').length / campaign.nodes.length) * 100)
    : 0;

  const generateWorkflow = async () => {
    if (!brief.trim()) return;
    setBusy(true);
    const r = await apiJson<{ nodes?: WorkflowNode[]; source?: string; engine?: string }>(
      '/api/campaigns/generate-workflow',
      {
        headers: { 'x-workspace-id': workspaceId },
        json: { brief },
      },
    );
    let nodes: WorkflowNode[] = r.ok && Array.isArray(r.data.nodes) ? r.data.nodes.filter(isValidNode) : [];
    const source = !nodes.length
      ? 'built-in template (server unavailable)'
      : r.data.source === 'ai'
        ? `AI (${r.data.engine || 'server'})`
        : `built-in template (${r.data.engine || 'no AI available'})`;
    if (!nodes.length)
      nodes = defaultNodes.map((n, i) => ({
        ...n,
        id: uid('node'),
        title: i === 0 ? 'Campaign Brief' : n.title,
        status: i === 0 ? 'complete' : 'ready',
      }));
    const next: Campaign = {
      id: uid('cmp'),
      name: brief.split(/[.!?]/)[0].slice(0, 54) || 'New Campaign',
      goal: brief,
      audience: 'To be refined by Audience Research',
      offer: 'To be refined by Strategy Agent',
      status: 'draft',
      createdAt: new Date().toISOString(),
      nodes,
    };
    setState((s) => ({ ...s, campaigns: [next, ...s.campaigns] }));
    setActiveCampaignId(next.id);
    setSelectedNode(null);
    setTab('workflow');
    setRunLog((l) => [`Generated editable workflow (${source}) from brief: “${brief}”`, ...l]);
    setBusy(false);
  };

  const patchCampaign = (fn: (c: Campaign) => Campaign) =>
    setState((s) => ({ ...s, campaigns: s.campaigns.map((c) => (c.id === activeCampaignId ? fn(c) : c)) }));
  // "Run with AI": the workspace's AI provider drafts the step output (charged like other assists).
  const [aiRunning, setAiRunning] = useState<string | null>(null);
  const runNodeWithAi = async (id: string) => {
    const target = campaign.nodes.find((n) => n.id === id);
    if (!target) return;
    setAiRunning(id);
    const previous = campaign.nodes
      .filter((n) => n.id !== id && n.status === 'complete' && n.output)
      .slice(-8)
      .map((n) => ({ title: n.title.slice(0, 200), output: (n.output || '').slice(0, 1500) }));
    const r = await apiJson<{ output?: string | null; engine?: string; sample?: boolean; message?: string }>(
      '/api/campaigns/run-step',
      {
        headers: { 'x-workspace-id': workspaceId },
        json: {
          campaign: {
            name: campaign.name.slice(0, 200),
            goal: campaign.goal.slice(0, 1000),
            audience: campaign.audience.slice(0, 1000),
            offer: campaign.offer.slice(0, 1000),
          },
          step: {
            title: target.title.slice(0, 200),
            description: target.description.slice(0, 1000),
            owner: target.owner.slice(0, 100),
          },
          previous,
        },
      },
    );
    setAiRunning(null);
    if (r.ok && r.data.output) {
      const output = r.data.output;
      patchCampaign((c) => ({
        ...c,
        nodes: c.nodes.map((n) => (n.id === id ? { ...n, status: 'complete', output } : n)),
      }));
      setRunLog((l) => [`AI (${r.data.engine}) drafted “${target.title}”. Review the stored output.`, ...l]);
    } else {
      setRunLog((l) => [`“${target.title}” was not run: ${r.data.message || 'AI step failed.'}`, ...l]);
    }
  };

  // Mark a step done by hand (no AI).
  const runNode = (id: string) => {
    const at = new Date().toLocaleTimeString();
    patchCampaign((c) => ({
      ...c,
      nodes: c.nodes.map((n) =>
        n.id === id
          ? { ...n, status: 'complete', output: n.output || `Marked done by you at ${at}. No AI ran for this step.` }
          : n,
      ),
    }));
    const target = campaign.nodes.find((n) => n.id === id);
    setRunLog((l) => [`You marked “${target?.title}” as done (no AI execution).`, ...l]);
  };
  const addNode = () =>
    patchCampaign((c) => ({
      ...c,
      nodes: [
        ...c.nodes,
        {
          id: uid('node'),
          type: 'custom',
          title: 'New workflow step',
          description: 'Describe exactly what this step must produce.',
          x: 70 + c.nodes.length * 25,
          y: 380,
          status: 'ready',
          owner: 'Campaign Operator',
        },
      ],
    }));
  const deleteNode = (id: string) => patchCampaign((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== id) }));
  const updateNode = (id: string, patch: Partial<WorkflowNode>) =>
    patchCampaign((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

  const executeCampaign = () => {
    const next = campaign.nodes.find((n) => n.status !== 'complete' && n.status !== 'blocked');
    if (next) runNode(next.id);
    else setRunLog((l) => ['No open step left. Approval and publish steps stay blocked until you unblock them.', ...l]);
  };

  const summaryCards = useMemo<[string, string, React.ElementType][]>(
    () => [
      ['Workflow progress', `${progress}%`, Workflow],
      ['Active agents', String(state.agents.filter((a) => a.active).length), Bot],
      ['CRM leads', String(state.leads.length), Contact],
      ['Pending approvals', String(state.clients.reduce((a, c) => a + c.approvals, 0)), UserRoundCheck],
    ],
    [progress, state],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-indigo-600 dark:text-indigo-300">
              <BrainCircuit className="h-4 w-4" />
              Campaign Operating System
            </div>
            <h2 className="mt-2 text-2xl font-black">From one brief to a controlled campaign workflow</h2>
            <p className="mt-1 text-sm text-ink-subtle">
              Plan a campaign as editable steps and track progress. Step execution by AI is not connected yet.
            </p>
            <p
              data-testid="campaign-os-save-status"
              role="status"
              className={`mt-1 text-xs font-bold ${loadStatus === 'error' || saveStatus === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-ink-subtle'}`}
            >
              {loadStatus === 'loading'
                ? 'Loading saved data…'
                : loadStatus === 'error'
                  ? `Could not load saved data (${saveError}). Changes will not be saved.`
                  : saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'error'
                      ? `Not saved: ${saveError}`
                      : saveStatus === 'saved'
                        ? 'All changes saved to this workspace.'
                        : 'Saved to this workspace.'}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <select
              aria-label="Active campaign"
              value={activeCampaignId}
              onChange={(e) => setActiveCampaignId(e.target.value)}
              className="w-full min-w-0 truncate sm:w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-950"
            >
              {state.campaigns.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={executeCampaign}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl bg-indigo-600 px-4 py-2 text-sm font-extrabold text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark next step done
            </button>
          </div>
        </div>
        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {featureTabs.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-extrabold ${tab === id ? 'bg-surface text-ink dark:bg-white dark:text-slate-900' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'operator' && (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            {summaryCards.map(([label, value, Icon]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                <div className="mt-4 text-2xl font-black">{value}</div>
                <div className="text-xs font-bold text-ink-subtle">{label}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 font-black">
                <WandSparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                Generate a complete workflow
              </div>
              <textarea
                aria-label="Campaign brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={5}
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950"
              />
              <button
                disabled={busy}
                onClick={generateWorkflow}
                className="mt-3 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {busy ? 'Building workflow…' : 'Build campaign workflow'}
              </button>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="font-black">Operator activity</div>
              <div className="mt-3 space-y-3">
                {runLog.slice(0, 6).map((x, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    {x}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'workflow' && campaign && (
        <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-canvas shadow-sm">
            <div className="flex items-center justify-between border-b border-line px-4 py-3 text-ink">
              <div>
                <div className="text-sm font-black">{campaign.name}</div>
                <div className="text-2xs text-ink-subtle">Drag steps, edit details, then mark each step done.</div>
              </div>
              <button
                onClick={addNode}
                className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold"
              >
                <Plus className="h-3.5 w-3.5" />
                Add node
              </button>
            </div>
            <div className="relative h-[580px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,#334155_1px,transparent_0)] bg-[size:24px_24px]">
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {campaign.nodes.slice(0, -1).map((n, i) => {
                  const b = campaign.nodes[i + 1];
                  return (
                    <line
                      key={n.id}
                      x1={n.x + 210}
                      y1={n.y + 55}
                      x2={b.x}
                      y2={b.y + 55}
                      stroke="#6366f1"
                      strokeWidth="2"
                      strokeDasharray="5 6"
                    />
                  );
                })}
              </svg>
              {campaign.nodes.map((n) => (
                <div
                  key={n.id}
                  draggable
                  onDragStart={() => setDragging(n.id)}
                  onDragEnd={(e) => {
                    if (dragging)
                      updateNode(dragging, {
                        x: Math.max(0, e.clientX - e.currentTarget.parentElement!.getBoundingClientRect().left - 100),
                        y: Math.max(0, e.clientY - e.currentTarget.parentElement!.getBoundingClientRect().top - 40),
                      });
                    setDragging(null);
                  }}
                  onClick={() => setSelectedNode(n.id)}
                  style={{ left: n.x, top: n.y }}
                  className={`absolute w-[210px] cursor-grab rounded-2xl border bg-surface p-3 text-ink shadow-xl ${selectedNode === n.id ? 'border-indigo-400 ring-2 ring-indigo-500/30' : 'border-line-strong'}`}
                >
                  <div className="flex items-center justify-between">
                    <GripVertical className="h-4 w-4 text-ink-subtle" />
                    <span
                      className={`rounded-full px-2 py-0.5 text-2xs font-black uppercase ${n.status === 'complete' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' : n.status === 'running' ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300' : n.status === 'blocked' ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300' : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'}`}
                    >
                      {n.status}
                    </span>
                  </div>
                  <div className="mt-3 text-sm font-black">{n.title}</div>
                  <div className="mt-1 line-clamp-2 text-2xs text-ink-subtle">{n.description}</div>
                  <div className="mt-3 flex items-center justify-between text-2xs text-ink-subtle">
                    <span>{n.owner}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            {node ? (
              <div className="space-y-4">
                <div className="font-black">Node settings</div>
                <label className="block text-xs font-bold text-ink-subtle">
                  Title
                  <input
                    value={node.title}
                    onChange={(e) => updateNode(node.id, { title: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"
                  />
                </label>
                <label className="block text-xs font-bold text-ink-subtle">
                  Required output
                  <textarea
                    value={node.description}
                    onChange={(e) => updateNode(node.id, { description: e.target.value })}
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"
                  />
                </label>
                <label className="block text-xs font-bold text-ink-subtle">
                  Owner
                  <input
                    value={node.owner}
                    onChange={(e) => updateNode(node.id, { owner: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-transparent p-2.5 text-sm dark:border-slate-700"
                  />
                </label>
                {node.output && (
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                    <b>Stored output:</b> {node.output}
                  </div>
                )}
                <button
                  onClick={() => runNodeWithAi(node.id)}
                  disabled={aiRunning !== null}
                  data-testid="run-step-ai"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-extrabold text-white disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {aiRunning === node.id ? 'AI is drafting this step…' : 'Run step with AI'}
                </button>
                <button
                  onClick={() => runNode(node.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-extrabold text-white"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Mark step done
                </button>
                <button
                  onClick={() => deleteNode(node.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete node
                </button>
              </div>
            ) : (
              <div className="text-sm text-ink-subtle">Select a node to edit its purpose, owner and output.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <CrudPanel
          title="Persistent AI agents"
          subtitle="Agent definitions saved to this workspace. Agents do not run yet."
          onAdd={() =>
            setState((s) => ({
              ...s,
              agents: [
                ...s.agents,
                {
                  id: uid('agent'),
                  name: 'New Agent',
                  role: 'Specialist',
                  instructions: 'Define this agent’s exact responsibility.',
                  memory: [],
                  active: false,
                },
              ],
            }))
          }
        >
          {state.agents.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-black">{a.name}</div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-300">{a.role}</div>
                </div>
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      agents: s.agents.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)),
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-2xs font-black ${a.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-ink-subtle'}`}
                >
                  {a.active ? 'ACTIVE' : 'PAUSED'}
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-subtle">{a.instructions}</p>
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-2xs dark:bg-slate-950">
                <b>Memory:</b> {a.memory.length ? a.memory.join(' · ') : 'No memory stored yet.'}
              </div>
            </div>
          ))}
        </CrudPanel>
      )}

      {tab === 'identity' && <IdentityLock />}
      {tab === 'crm' && (
        <CrudPanel
          title="CRM pipeline"
          subtitle="Leads you add manually, saved to this workspace. Lead capture from pages is not connected yet."
          onAdd={() =>
            setState((s) => ({
              ...s,
              leads: [
                ...s.leads,
                {
                  id: uid('lead'),
                  name: 'New Lead',
                  email: 'lead@example.com',
                  company: 'New company',
                  stage: 'New',
                  score: 50,
                  source: 'Manual',
                },
              ],
            }))
          }
        >
          {state.leads.map((l) => (
            <div
              key={l.id}
              className="grid items-center gap-3 rounded-2xl border border-slate-200 p-4 text-sm md:grid-cols-[1fr_1fr_120px_80px] dark:border-slate-700"
            >
              <div>
                <b>{l.name}</b>
                <div className="text-xs text-ink-subtle">{l.email}</div>
              </div>
              <div>
                {l.company}
                <div className="text-xs text-ink-subtle">{l.source}</div>
              </div>
              <select
                aria-label={`Pipeline stage for ${l.name}`}
                value={l.stage}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    leads: s.leads.map((x) => (x.id === l.id ? { ...x, stage: e.target.value } : x)),
                  }))
                }
                className="rounded-lg border bg-transparent p-2 dark:border-slate-700"
              >
                <option>New</option>
                <option>Qualified</option>
                <option>Proposal</option>
                <option>Won</option>
              </select>
              <div className="font-black text-indigo-600 dark:text-indigo-300">{l.score}/100</div>
            </div>
          ))}
        </CrudPanel>
      )}
      {tab === 'pages' && (
        <CrudPanel
          title="Landing page & website builder"
          subtitle="Draft page copy. Publishing marks a page ready; hosting is not connected yet."
          onAdd={() =>
            setState((s) => ({
              ...s,
              pages: [
                ...s.pages,
                {
                  id: uid('page'),
                  name: 'New Page',
                  type: 'landing',
                  headline: 'A clear outcome-focused headline',
                  subheadline: 'Explain why the visitor should care.',
                  cta: 'Get started',
                  published: false,
                },
              ],
            }))
          }
        >
          {state.pages.map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex justify-between">
                <div>
                  <b>{p.name}</b>
                  <div className="text-xs text-ink-subtle">{p.type}</div>
                </div>
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      pages: s.pages.map((x) => (x.id === p.id ? { ...x, published: !x.published } : x)),
                    }))
                  }
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
                >
                  {p.published ? 'Ready · undo' : 'Mark ready'}
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-canvas p-6 text-ink">
                <div className="text-2xl font-black">{p.headline}</div>
                <p className="mt-2 text-sm text-ink-subtle">{p.subheadline}</p>
                <button className="mt-4 rounded-lg bg-white px-4 py-2 text-xs font-black text-slate-900">
                  {p.cta}
                </button>
              </div>
            </div>
          ))}
        </CrudPanel>
      )}
      {tab === 'email' && (
        <CrudPanel
          title="Email automation"
          subtitle="Draft email sequences. No emails are sent; an email provider is not connected yet."
          onAdd={() =>
            setState((s) => ({
              ...s,
              emails: [
                ...s.emails,
                {
                  id: uid('email'),
                  name: 'New sequence',
                  trigger: 'Lead created',
                  subject: 'A useful next step',
                  body: 'Hi {{first_name}}…',
                  enabled: false,
                },
              ],
            }))
          }
        >
          {state.emails.map((e) => (
            <div key={e.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="flex justify-between">
                <div>
                  <b>{e.name}</b>
                  <div className="text-xs text-ink-subtle">Trigger: {e.trigger}</div>
                </div>
                <button
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      emails: s.emails.map((x) => (x.id === e.id ? { ...x, enabled: !x.enabled } : x)),
                    }))
                  }
                  className={`rounded-full px-3 py-1 text-2xs font-black ${e.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-ink-subtle'}`}
                >
                  {e.enabled ? 'ENABLED' : 'DISABLED'}
                </button>
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950">
                <b>{e.subject}</b>
                <p className="mt-2 text-ink-subtle">{e.body}</p>
              </div>
            </div>
          ))}
        </CrudPanel>
      )}
      {tab === 'clients' && (
        <CrudPanel
          title="Client portals"
          subtitle="Client records and approval counts. Client logins are not built yet."
          onAdd={() =>
            setState((s) => ({
              ...s,
              clients: [
                ...s.clients,
                {
                  id: uid('client'),
                  name: 'New Client',
                  contact: 'client@example.com',
                  portalStatus: 'Invited',
                  approvals: 0,
                },
              ],
            }))
          }
        >
          {state.clients.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-2xl border border-slate-200 p-4 dark:border-slate-700"
            >
              <div>
                <b>{c.name}</b>
                <div className="text-xs text-ink-subtle">
                  {c.contact} · {c.portalStatus}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black">{c.approvals}</div>
                <div className="text-2xs font-bold text-ink-subtle">PENDING</div>
              </div>
            </div>
          ))}
        </CrudPanel>
      )}
    </div>
  );
}

function CrudPanel({
  title,
  subtitle,
  onAdd,
  children,
}: {
  title: string;
  subtitle: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black">{title}</h3>
          <p className="text-xs text-ink-subtle">{subtitle}</p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-extrabold text-white"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>
      <div className="mt-5 grid gap-3">{children}</div>
    </div>
  );
}

function IdentityLock() {
  const [locked, setLocked] = useState(true);
  const [seed, setSeed] = useState(483921);
  return (
    <div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 font-black">
          <LockKeyhole className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
          Identity Lock Profile
        </div>
        <div className="mt-5 aspect-[4/5] rounded-3xl bg-gradient-to-br from-indigo-200 via-purple-100 to-slate-200 p-5">
          <div className="flex h-full items-end rounded-2xl border border-white/70 bg-white/30 p-4">
            <div className="rounded-xl bg-white/90 p-3 text-xs text-slate-700">
              <b>Reference set required</b>
              <br />
              Upload consented images before training or generation.
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-black">Consistency controls</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Model ID" value="identity-v1-pulse" />
          <Field label="Locked seed" value={String(seed)} onChange={(v) => setSeed(Number(v) || 0)} />
          <Field label="Face adapter" value="IP-Adapter FaceID Plus v2" />
          <Field label="LoRA checkpoint" value="Not trained — reference workflow mode" />
        </div>
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <b>Truthful capability status:</b> this app can store identity recipes, seeds, prompts and model references.
          Actual LoRA training and image generation require a configured GPU worker such as ComfyUI plus consented
          training images.
        </div>
        <button
          onClick={() => setLocked(!locked)}
          className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold text-white ${locked ? 'bg-emerald-600' : 'bg-indigo-600'}`}
        >
          {locked ? <CheckCircle2 className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
          {locked ? 'Identity recipe locked' : 'Lock identity recipe'}
        </button>
      </div>
    </div>
  );
}
function Field({ label, value, onChange }: { label: string; value: string; onChange?: (v: string) => void }) {
  return (
    <label className="text-xs font-bold text-ink-subtle">
      {label}
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={!onChange}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-transparent p-2.5 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-200"
      />
    </label>
  );
}
