import { z } from 'zod';

const id = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/)
  .refine((v) => !/^__.*__$/.test(v), 'Invalid id');
const str = (max: number) => z.string().max(max);
const httpsUrl = z
  .string()
  .max(2048)
  .refine((v) => v === '' || /^https:\/\//.test(v) || v.startsWith('data:image/'), 'Must be an https URL');

export const influencerSchema = z
  .object({
    id,
    workspaceId: id.optional(),
    name: str(80).min(1),
    handle: str(60).min(1),
    archetype: str(80),
    niche: str(120),
    bio: str(1000),
    avatarUrl: httpsUrl,
    locked: z.boolean(),
    faceEmbeddingHash: str(128),
    seed: z
      .number()
      .int()
      .min(0)
      .max(2 ** 32),
    loraWeights: z.object({
      faceConsistency: z.number().min(0).max(1),
      styleStrength: z.number().min(0).max(1),
      lightingModel: str(80),
    }),
    appearancePrompt: str(2000),
    negativePrompt: str(2000),
    voiceProfile: z.object({
      tone: str(80),
      pitch: z.number().min(-50).max(50),
      speed: z.number().min(0.25).max(4),
      accent: str(80),
      samplePhrase: str(500),
      // ElevenLabs voice chosen for this influencer.
      voiceId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,100}$/)
        .optional(),
      voiceName: str(100).optional(),
    }),
    postsGeneratedCount: z.number().int().min(0).max(1_000_000),
    avgEngagementRate: str(20),
    createdAt: str(40),
  })
  .strict();

const nodeStatus = z.enum(['ready', 'running', 'complete', 'blocked']);
const workflowNode = z.object({
  id,
  type: str(40),
  title: str(200),
  description: str(2000),
  owner: str(120),
  x: z.number().finite(),
  y: z.number().finite(),
  status: nodeStatus,
  output: str(4000).optional(),
});

/** Campaign OS workspace state (campaigns, agents, CRM leads, pages, email flows, client portals). */
export const campaignOsStateSchema = z.object({
  campaigns: z
    .array(
      z.object({
        id,
        name: str(200),
        goal: str(4000),
        audience: str(1000),
        offer: str(1000),
        status: str(40),
        createdAt: str(40),
        nodes: z.array(workflowNode).max(50),
      }),
    )
    .max(50),
  agents: z
    .array(
      z.object({
        id,
        name: str(120),
        role: str(200),
        instructions: str(4000),
        memory: z.array(str(1000)).max(100),
        active: z.boolean(),
        lastRun: str(40).optional(),
      }),
    )
    .max(50),
  leads: z
    .array(
      z.object({
        id,
        name: str(200),
        email: str(320),
        company: str(200),
        stage: str(60),
        score: z.number().min(0).max(100),
        source: str(120),
      }),
    )
    .max(1000),
  pages: z
    .array(
      z.object({
        id,
        name: str(200),
        type: z.enum(['landing', 'website']),
        headline: str(300),
        subheadline: str(1000),
        cta: str(120),
        published: z.boolean(),
      }),
    )
    .max(100),
  emails: z
    .array(
      z.object({
        id,
        name: str(200),
        trigger: str(200),
        subject: str(300),
        body: str(10000),
        enabled: z.boolean(),
      }),
    )
    .max(100),
  clients: z
    .array(
      z.object({
        id,
        name: str(200),
        contact: str(320),
        portalStatus: str(60),
        approvals: z.number().int().min(0).max(100000),
      }),
    )
    .max(200),
});
export type CampaignOsState = z.infer<typeof campaignOsStateSchema>;

/** Audit events reported by the browser. Actor, time and IP are always set by the server. */
export const clientAuditSchema = z
  .object({
    action: z.string().regex(/^[a-z0-9_.]{1,64}$/, 'action must be lowercase dotted, e.g. asset.status.approved'),
    details: str(1000).min(1),
    // "critical" is reserved for events the server records itself.
    severity: z.enum(['info', 'warning']).default('info'),
  })
  .strict();

// ---------- Campaign assets (previously written straight to Firestore; limits mirror the old rules) ----------
const optStr = (max: number) => z.string().max(max).optional();
const assetVersion = z
  .object({
    versionNumber: z.number().int().min(0).max(10_000),
    createdAt: str(100),
    createdBy: str(200),
    caption: str(2000),
    hashtags: z.array(str(100)).max(30),
    imagePrompt: str(1000),
    visualDirection: str(1000),
    costCredits: z.number().int().min(0).max(1_000_000),
  })
  .strict();
export const campaignAssetSchema = z
  .object({
    id,
    workspaceId: id.optional(),
    title: str(200).min(1),
    platform: z.enum(['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook']),
    status: z.enum(['draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published']),
    currentVersion: z.number().int().min(0).max(10_000),
    versions: z.array(assetVersion).max(50),
    caption: str(2000),
    hashtags: z.array(str(100)).max(30),
    imagePrompt: str(1000),
    visualDirection: str(1000),
    scheduledTime: optStr(100),
    approverId: optStr(128),
    decidedAt: optStr(100),
    rejectionReason: optStr(500),
    lockedBy: optStr(128),
    // Generated image (GET /api/workspaces/:id/images/:imageId).
    imageId: z
      .string()
      .regex(/^img-[A-Za-z0-9_-]{1,100}$/)
      .optional(),
    comments: z
      .array(
        z
          .object({
            id: str(128),
            authorName: str(200),
            authorAvatar: str(2048),
            text: str(2000),
            createdAt: str(100),
          })
          .strict(),
      )
      .max(500),
    // Server-owned fields: accepted from older clients but ignored.
    userId: optStr(128),
    createdAt: optStr(100),
  })
  .strict();
