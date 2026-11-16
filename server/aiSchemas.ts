import { z } from 'zod';

// Keep these in sync with the options offered in the UI components.
export const PLATFORMS = ['instagram', 'tiktok', 'linkedin', 'twitter', 'facebook'] as const;
export const STYLE_PRESETS = [
  'Tech Minimalist',
  'Luxury Editorial',
  'Bold Cyberpunk',
  'Corporate Modern',
  'Vibrant Youth',
] as const;
export const TREND_CATEGORIES = [
  'AI, Tech & Digital Marketing',
  'B2B SaaS & Enterprise',
  'E-Commerce & DTC Brands',
  'Fintech & Web3',
  'Creative Design & WebGL',
] as const;
export const BRAND_TONES = [
  'Professional & Helpful',
  'Friendly & Enthusiastic',
  'Witty & Modern',
  'Tech Expert & Direct',
] as const;

export const generateSchema = z
  .object({
    workspaceId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .refine((id) => !/^__.*__$/.test(id)),
    purpose: z.enum(['studio', 'influencer']).default('studio'),
    prompt: z.string().trim().min(1).max(2000),
    platform: z.enum(PLATFORMS).default('linkedin'),
    stylePreset: z.enum(STYLE_PRESETS).default('Tech Minimalist'),
  })
  .strict();

export const trendsSchema = z
  .object({
    category: z.enum(TREND_CATEGORIES).default('AI, Tech & Digital Marketing'),
    platform: z.enum([...PLATFORMS, 'all']).default('all'),
  })
  .strict();

export const suggestReplySchema = z
  .object({
    commentText: z.string().trim().min(1).max(2000),
    postCaption: z.string().max(2000).optional(),
    platform: z.enum(PLATFORMS).default('linkedin'),
    brandTone: z.enum(BRAND_TONES).default('Professional & Helpful'),
  })
  .strict();

export const workflowSchema = z
  .object({
    brief: z.string().trim().min(1).max(4000),
  })
  .strict();

const shortText = (n: number) => z.string().trim().max(n).default('');
export const runStepSchema = z
  .object({
    campaign: z
      .object({ name: shortText(200), goal: shortText(1000), audience: shortText(1000), offer: shortText(1000) })
      .strict(),
    step: z
      .object({ title: z.string().trim().min(1).max(200), description: shortText(1000), owner: shortText(100) })
      .strict(),
    previous: z
      .array(z.object({ title: z.string().trim().max(200), output: z.string().trim().max(1500) }).strict())
      .max(8)
      .default([]),
  })
  .strict();
