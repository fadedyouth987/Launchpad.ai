import { z } from 'zod';

export const workspaceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,128}$/, 'Invalid workspace id')
  // Ids of the form __name__ stay reserved (kept from the Firestore era; existing clients rely on it).
  .refine((id) => !/^__.*__$/.test(id), 'Invalid workspace id');

export const createWorkspaceSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();

export const createWebhookSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    url: z.string().min(1).max(2048),
    description: z.string().trim().max(200).optional(),
  })
  .strict();
