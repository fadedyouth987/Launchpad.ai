import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { aiRateLimiter } from '../rateLimit';
import { refundCredits, reserveCredits, SPEND_ROLES } from '../credits';
import { assertMember, assertRole } from '../workspaces';
import { workspaceIdSchema } from '../schemas';
import {
  generateSchema,
  trendsSchema,
  suggestReplySchema,
  workflowSchema,
  runStepSchema,
  PLATFORMS,
} from '../aiSchemas';
import { parseBody, sendApiError, sendServerError, workspaceFromHeader } from '../http';
import type { AiResolver, ResolvedAi } from '../llm/resolver';
import type { LlmRequest } from '../llm/types';
import { SYSTEM, userTurn } from '../prompts';
import { sampleReplies, sampleTrends } from '../samples';
import { recordAudit } from '../audit';

/** Credits charged per successful AI generation (charged before calling the provider, refunded on failure). Same for every provider. */
export const GENERATION_COST = Math.max(1, Math.floor(Number(process.env.AI_GENERATION_COST_CREDITS) || 15));

/**
 * Credits charged per AI assist call (trends, reply suggestions, workflow drafts) when an AI provider
 * is connected. 0 makes them free (they still need workspace membership and a non-viewer role).
 */
const assistCostEnv = Number(process.env.AI_ASSIST_COST_CREDITS ?? 5);
export const ASSIST_COST = Number.isFinite(assistCostEnv) ? Math.max(0, Math.floor(assistCostEnv)) : 5;

type Charge = { workspaceId: string; reservationId: string | null; newBalance?: number };

/**
 * Charges ASSIST_COST to the x-workspace-id workspace before an AI assist call. Sends the error
 * response (400/403/402) and returns null when the call must not proceed.
 */
async function chargeAssist(req: Request, res: Response, label: string, description: string): Promise<Charge | null> {
  const workspaceId = workspaceFromHeader(req, res);
  if (!workspaceId) return null;
  const uid = req.authContext!.uid;
  try {
    if (ASSIST_COST === 0) {
      await assertRole(uid, workspaceId, SPEND_ROLES);
      return { workspaceId, reservationId: null };
    }
    const r = await reserveCredits(uid, workspaceId, ASSIST_COST, { description });
    return { workspaceId, reservationId: r.reservationId, newBalance: r.newBalance };
  } catch (err) {
    sendApiError(res, err, label);
    return null;
  }
}

/** Refunds a failed assist call. Never throws; a failed refund is logged and audited as critical. */
async function refundAssist(uid: string, charge: Charge, label: string) {
  if (!charge.reservationId) return { refunded: false, newBalance: charge.newBalance };
  try {
    const { newBalance } = await refundCredits(uid, charge.workspaceId, ASSIST_COST, charge.reservationId);
    return { refunded: true, newBalance };
  } catch (refundErr) {
    console.error(`[${label}] REFUND FAILED for reservation ${charge.reservationId}`, refundErr);
    await recordAudit({
      workspaceId: charge.workspaceId,
      uid,
      action: 'billing.refund.failed',
      severity: 'critical',
      details: `Refund of ${ASSIST_COST} credits failed for reservation ${charge.reservationId}.`,
    });
    return { refunded: false, newBalance: charge.newBalance };
  }
}

const trendItem = z.object({
  topic: z.string().min(1).max(300),
  hotnessScore: z.coerce.number().min(0).max(100).catch(85),
  summary: z.string().max(2000).catch(''),
  suggestedHashtags: z.array(z.string().max(80)).max(10).catch([]),
  suggestedHook: z.string().max(500).catch(''),
  suggestedPlatform: z.enum(PLATFORMS).catch('linkedin'),
});
const replyResult = z.object({
  sentiment: z.enum(['positive', 'neutral', 'question', 'constructive', 'negative']).catch('neutral'),
  suggestedReplies: z.array(z.string().min(1).max(1000)).min(1).max(5),
  suggestedAction: z.enum(['approve', 'edit_recommended', 'escalate_to_human']).catch('edit_recommended'),
});

/** First JSON value (object or array) in a model response, or null. */
function extractJson(text: string, kind: 'object' | 'array'): unknown {
  const match = kind === 'array' ? text.match(/\[[\s\S]*\]/) : text.match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(match ? match[0] : text);
  } catch {
    return null;
  }
}

const layout = (i: number) => ({ x: 20 + (i % 3) * 260, y: 30 + Math.floor(i / 3) * 180 });

const TEMPLATE_WORKFLOW = [
  ['strategy', 'Campaign Strategy', 'Translate the brief into goals, offer, KPIs and constraints.', 'Strategy Agent'],
  ['audience', 'Audience Research', 'Define ICP, pains, objections, intent and channel behaviour.', 'Research Agent'],
  ['message', 'Messaging System', 'Create positioning, hooks, pillars and calls to action.', 'Creative Agent'],
  [
    'identity',
    'Visual & Identity Direction',
    'Apply brand rules and any locked influencer identity recipe.',
    'Creative Agent',
  ],
  ['content', 'Content Production', 'Generate channel-specific content and creative briefs.', 'Content Agent'],
  ['page', 'Landing Experience', 'Build the conversion page, form and tracking plan.', 'Web Agent'],
  ['email', 'Lead Nurture', 'Create trigger-based email follow-up sequences.', 'Email Agent'],
  ['approval', 'Approval Gate', 'Route assets to internal and client approval before publishing.', 'Approval Agent'],
  ['publish', 'Publish & Measure', 'Schedule approved work, capture leads and report results.', 'Campaign Operator'],
] as const;

const NODE_TYPES = [
  'strategy',
  'audience',
  'message',
  'identity',
  'content',
  'page',
  'email',
  'approval',
  'publish',
] as const;
const aiNode = z.object({
  type: z.enum(NODE_TYPES).catch('content'),
  title: z.string().min(1).max(120),
  description: z.string().max(1000).catch(''),
  owner: z.string().max(80).catch('Campaign Operator'),
});

/** "Anthropic Claude · claude-sonnet-5-5" (+ "(workspace key)"), shown to users as the engine. */
export function engineLabel(ai: ResolvedAi) {
  return `${ai.label} · ${ai.model}${ai.keySource === 'workspace' ? ' (workspace key)' : ''}`;
}

const SAMPLE_NOTE = 'no AI provider is configured';

async function run(ai: ResolvedAi, req: LlmRequest) {
  return ai.llm.generate(req, ai.model);
}

export function aiRoutes(resolver: AiResolver) {
  const r = Router();

  /**
   * Provider for an assist call, using the x-workspace-id header's workspace settings when the
   * caller is a member (otherwise the server default). undefined = an error response was sent.
   */
  async function resolveFor(req: Request, _res: Response, label: string): Promise<ResolvedAi | null | undefined> {
    const ws = workspaceIdSchema.safeParse(req.get('x-workspace-id'));
    let workspaceId: string | null = null;
    if (ws.success) {
      try {
        await assertMember(req.authContext!.uid, ws.data);
        workspaceId = ws.data;
      } catch {
        workspaceId = null; // chargeAssist reports the membership error
      }
    }
    try {
      return await resolver.text(workspaceId);
    } catch (err) {
      console.error(`[${label}] could not resolve an AI provider:`, (err as Error).message);
      return null;
    }
  }

  // AI campaign copy. Sample output (no AI provider configured) is never charged.
  r.post('/generate', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(generateSchema, req, res);
    if (!body) return;
    const { workspaceId, purpose, prompt, platform, stylePreset } = body;
    const uid = req.authContext!.uid;

    let ai: ResolvedAi | null;
    try {
      await assertMember(uid, workspaceId);
      ai = await resolver.text(workspaceId);
    } catch (err) {
      return sendApiError(res, err, 'generate');
    }
    if (!ai) {
      return res.json({
        success: true,
        sample: true,
        costCredits: 0,
        data: {
          caption: `🚀 [${platform.toUpperCase()}] ${prompt}\n\nBuilt for high engagement using Launchpad's ${stylePreset} campaign engine! Scale your visual presence with zero friction.`,
          hashtags: ['#SaaSGrowth', '#AIMarketing', '#ContentStrategy', '#Launchpad', '#Automation'],
          imagePrompt: `A high-impact ${stylePreset} visual representing "${prompt}" with crisp typography, neon highlights, and dark slate textures.`,
          visualDirection: `${stylePreset}, 4K Resolution, High Contrast Slate & Cyan Color Scheme`,
          aiEngine: `Sample text: ${SAMPLE_NOTE} (not charged)`,
        },
      });
    }

    let reservation: { reservationId: string; newBalance: number };
    try {
      reservation = await reserveCredits(uid, workspaceId, GENERATION_COST, {
        description: `${purpose === 'influencer' ? 'AI Influencer Content' : 'AI Campaign Generation'} (${platform.toUpperCase()})`,
      });
    } catch (err) {
      return sendApiError(res, err, 'generate/reserve');
    }

    try {
      const response = await run(ai, {
        system: SYSTEM.generate,
        contents: userTurn(
          `Write one social media post for the platform "${platform}" in the visual style "${stylePreset}", about the brief below.`,
          { brief: prompt },
        ),
        json: true,
      });
      const parsed = extractJson(response.text || '', 'object') as Record<string, unknown> | null;
      if (!parsed || typeof parsed.caption !== 'string' || !parsed.caption.trim()) {
        throw new Error(`${ai.provider} response did not contain a caption`);
      }
      res.json({
        success: true,
        sample: false,
        costCredits: GENERATION_COST,
        reservationId: reservation.reservationId,
        newBalance: reservation.newBalance,
        data: {
          caption: parsed.caption,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).slice(0, 10) : [],
          imagePrompt: typeof parsed.imagePrompt === 'string' ? parsed.imagePrompt : '',
          visualDirection: typeof parsed.visualDirection === 'string' ? parsed.visualDirection : stylePreset,
          aiEngine: engineLabel(ai),
        },
        provider: ai.provider,
        model: ai.model,
        ...(ai.fallbackReason ? { fallbackReason: ai.fallbackReason } : {}),
      });
    } catch (err) {
      let refunded = false;
      let newBalance: number | undefined;
      try {
        ({ newBalance } = await refundCredits(uid, workspaceId, GENERATION_COST, reservation.reservationId));
        refunded = true;
      } catch (refundErr) {
        console.error(`[generate] REFUND FAILED for reservation ${reservation.reservationId}`, refundErr);
        await recordAudit({
          workspaceId,
          uid,
          action: 'billing.refund.failed',
          severity: 'critical',
          details: `Refund of ${GENERATION_COST} credits failed for reservation ${reservation.reservationId}.`,
        });
      }
      sendServerError(res, 'AI_GENERATION_FAILED', 'generate', err, {
        status: 502,
        message: refunded
          ? 'AI generation failed. Your credits were refunded.'
          : 'AI generation failed. Please contact support about a refund.',
        refunded,
        newBalance,
      });
    }
  });

  // Trend monitor. Live Google Search grounding when the provider supports it (Gemini); other
  // providers answer from model knowledge and the response says so (grounded: false).
  r.post('/trends', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(trendsSchema, req, res);
    if (!body) return;
    const { category, platform } = body;
    const ai = await resolveFor(req, res, 'trends');
    if (ai === undefined) return;
    if (!ai) {
      return res.json({
        success: true,
        sample: true,
        grounded: false,
        source: `Sample trends: ${SAMPLE_NOTE}`,
        trends: sampleTrends(category),
        timestamp: new Date().toISOString(),
      });
    }
    const charge = await chargeAssist(req, res, 'trends', `AI Trend Scan (${category})`);
    if (!charge) return;
    try {
      const response = await run(ai, {
        system: SYSTEM.trends,
        contents: userTurn(
          `${ai.supportsWebSearch ? 'Search for' : 'From what you know, list'} current emerging social media trends, viral topics and hashtags in the category below${platform === 'all' ? '' : `, focusing on ${platform}`}.`,
          { category },
        ),
        webSearch: ai.supportsWebSearch,
      });
      const raw = extractJson(response.text || '', 'array');
      const trends = Array.isArray(raw)
        ? raw
            .map((t) => trendItem.safeParse(t))
            .filter((p) => p.success)
            .map((p, i) => ({ id: `trend-${i + 1}`, category, ...p.data }))
        : [];
      if (!trends.length) throw new Error(`${ai.provider} trends response could not be parsed`);
      const meta = response.grounding;
      res.json({
        success: true,
        sample: false,
        grounded: Boolean(meta),
        source: meta
          ? `${engineLabel(ai)} with Google Search grounding`
          : `${engineLabel(ai)} (model knowledge, no live web search)`,
        provider: ai.provider,
        model: ai.model,
        groundingChunks: meta?.groundingChunks || [],
        webSearchQueries: meta?.webSearchQueries || [],
        trends,
        costCredits: ASSIST_COST,
        newBalance: charge.newBalance,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const refund = await refundAssist(req.authContext!.uid, charge, 'trends');
      sendServerError(res, 'TREND_FETCH_FAILED', 'trends', err, {
        status: 502,
        message: refund.refunded
          ? 'Could not fetch trends. Your credits were refunded.'
          : 'Could not fetch trends. Please try again.',
        ...refund,
      });
    }
  });

  // Reply suggestions for a social comment (the comment is third-party text).
  r.post('/engagement/suggest-reply', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(suggestReplySchema, req, res);
    if (!body) return;
    const { commentText, postCaption, platform, brandTone } = body;
    const ai = await resolveFor(req, res, 'suggest-reply');
    if (ai === undefined) return;
    if (!ai) {
      return res.json({
        success: true,
        sample: true,
        sentiment: 'positive',
        suggestedReplies: sampleReplies,
        suggestedAction: 'approve',
        source: `Sample replies: ${SAMPLE_NOTE}`,
      });
    }
    const charge = await chargeAssist(req, res, 'suggest-reply', `AI Reply Suggestions (${platform})`);
    if (!charge) return;
    try {
      const response = await run(ai, {
        system: SYSTEM.reply,
        contents: userTurn(
          `Classify the sentiment of the comment below, posted on a ${platform} post, and draft 3 replies in the brand tone "${brandTone}".`,
          { post_caption: postCaption || 'Social media marketing campaign', comment: commentText },
        ),
        json: true,
      });
      const parsed = replyResult.safeParse(extractJson(response.text || '', 'object'));
      if (!parsed.success) throw new Error(`${ai.provider} reply response could not be parsed`);
      res.json({
        success: true,
        ...parsed.data,
        sample: false,
        source: engineLabel(ai),
        provider: ai.provider,
        model: ai.model,
        costCredits: ASSIST_COST,
        newBalance: charge.newBalance,
      });
    } catch (err) {
      const refund = await refundAssist(req.authContext!.uid, charge, 'suggest-reply');
      sendServerError(res, 'REPLY_GEN_FAILED', 'suggest-reply', err, {
        status: 502,
        message: refund.refunded
          ? 'Could not draft replies. Your credits were refunded.'
          : 'Could not draft replies. Please try again.',
        ...refund,
      });
    }
  });

  // Campaign OS: brief -> editable workflow graph. Falls back to a labelled template.
  r.post('/campaigns/generate-workflow', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(workflowSchema, req, res);
    if (!body) return;
    const wsHeader = workspaceIdSchema.safeParse(req.get('x-workspace-id'));
    const template = TEMPLATE_WORKFLOW.map(([type, title, description, owner], i) => ({
      id: `node-${randomUUID()}`,
      type,
      title,
      description,
      owner,
      ...layout(i),
      status: i === 0 ? 'complete' : i > 6 ? 'blocked' : 'ready',
    }));
    const ai = await resolveFor(req, res, 'generate-workflow');
    if (ai === undefined) return;
    if (!ai) {
      const workspaceId = wsHeader.success ? wsHeader.data : 'unknown';
      return res.json({
        success: true,
        sample: true,
        workspaceId,
        source: 'deterministic-fallback',
        engine: `Template workflow: ${SAMPLE_NOTE}`,
        nodes: template,
      });
    }
    const charge = await chargeAssist(req, res, 'generate-workflow', 'AI Campaign Workflow Draft');
    if (!charge) return;
    const { workspaceId } = charge;
    const uid = req.authContext!.uid;
    try {
      const response = await run(ai, {
        system: SYSTEM.workflow,
        contents: userTurn('Create an ordered marketing campaign workflow for the brief below.', { brief: body.brief }),
        json: true,
      });
      const raw = extractJson(response.text || '', 'object') as { nodes?: unknown[] } | null;
      const nodes = (Array.isArray(raw?.nodes) ? raw.nodes : [])
        .map((n) => aiNode.safeParse(n))
        .filter((p) => p.success)
        .slice(0, 12)
        .map((p, i) => ({
          ...p.data,
          id: `node-${randomUUID()}`,
          ...layout(i),
          status: i === 0 ? 'complete' : p.data.type === 'approval' || p.data.type === 'publish' ? 'blocked' : 'ready',
        }));
      if (!nodes.length) throw new Error(`${ai.provider} workflow response had no usable nodes`);
      return res.json({
        success: true,
        workspaceId,
        sample: false,
        source: 'ai',
        engine: engineLabel(ai),
        provider: ai.provider,
        model: ai.model,
        nodes,
        costCredits: ASSIST_COST,
        newBalance: charge.newBalance,
      });
    } catch (error) {
      console.error(
        `[generate-workflow] ${ai.provider} error, using template:`,
        error instanceof Error ? error.message : error,
      );
      const refund = await refundAssist(uid, charge, 'generate-workflow');
      return res.json({
        success: true,
        workspaceId,
        source: 'fallback-after-ai-error',
        engine: `Template workflow: ${engineLabel(ai)} failed`,
        nodes: template,
        costCredits: 0,
        ...refund,
      });
    }
  });

  // Campaign OS: run one workflow step with the workspace's AI provider. The output is a draft for a
  // human to review; nothing external happens. Charged like other assists, refunded on failure.
  r.post('/campaigns/run-step', requireAuth, aiRateLimiter, async (req, res) => {
    const body = parseBody(runStepSchema, req, res);
    if (!body) return;
    const ai = await resolveFor(req, res, 'run-step');
    if (ai === undefined) return;
    if (!ai) {
      return res.json({
        success: true,
        sample: true,
        output: null,
        engine: `Not run: ${SAMPLE_NOTE}`,
        message: 'No AI provider is configured, so the step was not run. Mark it done yourself or connect a provider.',
      });
    }
    const charge = await chargeAssist(req, res, 'run-step', `AI Campaign Step (${body.step.title.slice(0, 60)})`);
    if (!charge) return;
    try {
      const fields: Record<string, string> = {
        campaign_name: body.campaign.name,
        goal: body.campaign.goal,
        audience: body.campaign.audience,
        offer: body.campaign.offer,
        step_title: body.step.title,
        step_required_output: body.step.description,
        step_owner: body.step.owner,
      };
      body.previous.forEach((p, i) => (fields[`previous_step_${i + 1}`] = `${p.title}\n${p.output}`));
      const out = await run(ai, {
        system: SYSTEM.step,
        contents: userTurn('Produce the deliverable for the campaign step described below.', fields),
        maxOutputTokens: 2048,
      });
      const output = out.text.trim().slice(0, 4000);
      if (!output) throw new Error(`${ai.provider} returned an empty step output`);
      res.json({
        success: true,
        sample: false,
        output,
        engine: engineLabel(ai),
        provider: ai.provider,
        model: ai.model,
        costCredits: ASSIST_COST,
        newBalance: charge.newBalance,
      });
    } catch (err) {
      const refund = await refundAssist(req.authContext!.uid, charge, 'run-step');
      sendServerError(res, 'STEP_RUN_FAILED', 'run-step', err, {
        status: 502,
        message: refund.refunded
          ? 'The AI step failed. Your credits were refunded.'
          : 'The AI step failed. Please try again.',
        ...refund,
      });
    }
  });

  return r;
}
