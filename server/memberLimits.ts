/**
 * Member limits per plan (PLAN_MEMBER_LIMITS="starter:3,professional:10,enterprise:0", 0 = unlimited).
 *
 * The plan that counts: an active Stripe subscription's plan; a workspace whose subscription has ended
 * falls back to Starter; a workspace that never subscribed uses its `plan` column (so a plan set by an
 * administrator still applies). The owner counts as a member.
 *
 * Limits only block NEW seats: creating an invitation counts members + open invitations, accepting one
 * counts members. Nobody is ever removed (e.g. after a downgrade, extra members stay; new invites are
 * refused until the workspace is back under the limit).
 */
import type { DbClient } from './db';
import { ApiError } from './errors';
import type { PlanId } from './subscriptions';

const DEFAULT = 'starter:3,professional:10,enterprise:0';
const NAMES: Record<PlanId, string> = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };

/** Seat limit per plan; null = unlimited. */
export function memberLimits(raw = process.env.PLAN_MEMBER_LIMITS || DEFAULT): Record<PlanId, number | null> {
  const out: Record<PlanId, number | null> = { starter: 3, professional: 10, enterprise: null };
  for (const part of raw.split(',')) {
    const [plan, n] = part.trim().split(':');
    const v = Number(n);
    if (!(plan in out) || !Number.isSafeInteger(v) || v < 0 || v > 100_000) continue;
    out[plan as PlanId] = v === 0 ? null : v;
  }
  return out;
}

export interface SeatUsage {
  plan: PlanId;
  planName: string;
  limit: number | null;
  members: number;
  pendingInvites: number;
}

type Queryable = Pick<DbClient, 'query'>;

export async function seatUsage(c: Queryable, workspaceId: string): Promise<SeatUsage> {
  const { rows } = await c.query(
    `SELECT w.plan,
            s.plan AS sub_plan, s.status AS sub_status,
            (SELECT count(*)::int FROM workspace_members m WHERE m.workspace_id = w.id AND m.user_id NOT LIKE 'apikey\\_%') AS members,
            (SELECT count(*)::int FROM workspace_invites i
              WHERE i.workspace_id = w.id AND i.accepted_at IS NULL AND i.expires_at > now()) AS pending
       FROM workspaces w LEFT JOIN workspace_subscriptions s ON s.workspace_id = w.id
      WHERE w.id = $1`,
    [workspaceId],
  );
  const r = rows[0];
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Workspace not found.');
  const active = ['active', 'trialing', 'past_due'].includes(r.sub_status);
  const plan: PlanId = r.sub_status ? (active ? r.sub_plan : 'starter') : r.plan;
  return {
    plan,
    planName: NAMES[plan] ?? plan,
    limit: memberLimits()[plan] ?? null,
    members: Number(r.members),
    pendingInvites: Number(r.pending),
  };
}

const upgradeHint = (u: SeatUsage) =>
  u.plan === 'enterprise' ? '' : ' Upgrade the plan in Billing > Plans to add more people.';

/** Throws 409 MEMBER_LIMIT if one more invitation would go over the plan's seats. */
export function assertCanInvite(u: SeatUsage) {
  if (u.limit === null) return;
  const used = u.members + u.pendingInvites;
  if (used >= u.limit) {
    throw new ApiError(
      409,
      'MEMBER_LIMIT',
      `The ${u.planName} plan allows ${u.limit} members, and ${u.members} member${u.members === 1 ? '' : 's'} plus ${u.pendingInvites} open invitation${u.pendingInvites === 1 ? '' : 's'} already use them. Revoke an open invitation or remove a member on the Team page.${upgradeHint(u)}`,
    );
  }
}

/** Throws 409 MEMBER_LIMIT if the workspace is already full (checked when an invitation is accepted). */
export function assertCanJoin(u: SeatUsage) {
  if (u.limit !== null && u.members >= u.limit) {
    throw new ApiError(
      409,
      'MEMBER_LIMIT',
      `This workspace is full: its ${u.planName} plan allows ${u.limit} members. Ask the workspace owner to upgrade the plan or free up a seat, then open the link again.`,
    );
  }
}
