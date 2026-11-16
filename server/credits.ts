import { randomUUID } from 'node:crypto';
import { DEMO_MODE } from './auth';
import { db, withTx } from './db';
import { demoLedger, demoWorkspaces } from './demoStore';
import { ApiError, forbidden } from './errors';
import { assertMember, WRITE_ROLES, type Role } from './workspaces';
import type { LedgerEntry } from '../src/types';

export { ApiError as CreditsError };

export async function getCredits(uid: string, workspaceId: string) {
  const ws = await assertMember(uid, workspaceId);
  return { creditsRemaining: ws.creditsRemaining, totalAllocated: ws.totalCreditsAllocated };
}

const insufficient = (amount: number, current: number) =>
  new ApiError(402, 'INSUFFICIENT_CREDITS', `Required ${amount} credits, but workspace has ${current} remaining.`);

/** Roles allowed to spend workspace credits. Viewers are read-only. */
export const SPEND_ROLES = WRITE_ROLES;
export const MAX_CREDIT_AMOUNT = 1_000_000;

function assertAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_CREDIT_AMOUNT) {
    throw new ApiError(400, 'INVALID_AMOUNT', `Credit amount must be a whole number from 1 to ${MAX_CREDIT_AMOUNT}.`);
  }
}

const viewerCannotSpend = () =>
  new ApiError(
    403,
    'ROLE_REQUIRED',
    'Viewers cannot spend workspace credits. Ask an owner or admin for the creator role.',
  );

/**
 * Atomically deducts `amount` credits (caller must be a member) and writes a ledger entry.
 * type 'reservation' with a negative amount; refundCredits() reverses it.
 */
export async function reserveCredits(
  uid: string,
  workspaceId: string,
  amount: number,
  opts: { assetId?: string; description?: string } = {},
) {
  assertAmount(amount);
  const description = opts.description || 'Credit reservation';
  if (DEMO_MODE) {
    const ws = demoWorkspaces.get(workspaceId);
    if (!ws) throw forbidden();
    if (ws.creditsRemaining < amount) throw insufficient(amount, ws.creditsRemaining);
    ws.creditsRemaining -= amount;
    const id = `ledg-${randomUUID()}`;
    demoLedger.unshift({
      id,
      workspaceId,
      type: 'reservation',
      description,
      amountCredits: -amount,
      resultingBalance: ws.creditsRemaining,
      timestamp: new Date().toISOString(),
      ...(opts.assetId ? { assetId: opts.assetId } : {}),
    });
    return { reservationId: id, newBalance: ws.creditsRemaining };
  }

  // One transaction: role check, conditional decrement (row lock serialises concurrent spends, and
  // the WHERE clause makes overspending impossible), ledger entry.
  return withTx(async (c) => {
    const member = await c.query('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
      workspaceId,
      uid,
    ]);
    if (!member.rows.length) throw forbidden();
    if (!SPEND_ROLES.includes(member.rows[0].role as Role)) throw viewerCannotSpend();
    const upd = await c.query(
      `UPDATE workspaces SET credits_remaining = credits_remaining - $2
        WHERE id = $1 AND credits_remaining >= $2 RETURNING credits_remaining`,
      [workspaceId, amount],
    );
    if (!upd.rows.length) {
      const cur = await c.query('SELECT credits_remaining FROM workspaces WHERE id = $1', [workspaceId]);
      throw insufficient(amount, Number(cur.rows[0]?.credits_remaining ?? 0));
    }
    const newBalance = Number(upd.rows[0].credits_remaining);
    const reservationId = `ledg-${randomUUID()}`;
    await c.query(
      `INSERT INTO ledger_entries (id, workspace_id, user_id, type, description, amount_credits, resulting_balance, asset_id)
       VALUES ($1, $2, $3, 'reservation', $4, $5, $6, $7)`,
      [reservationId, workspaceId, uid, description, -amount, newBalance, opts.assetId ?? null],
    );
    return { reservationId, newBalance };
  });
}

/**
 * Returns the credits of a failed operation and records a 'refund' ledger entry. Server-internal only.
 * Idempotent: the refund entry id is derived from the reservation id, so retrying a refund (or a
 * duplicate call) never credits the workspace twice. The reservation must exist, belong to this
 * workspace and be for the same amount.
 */
export async function refundCredits(uid: string, workspaceId: string, amount: number, reservationId: string) {
  assertAmount(amount);
  const description = `Refund for failed generation (${reservationId})`;
  const refundId = `refund-${reservationId}`;
  const mismatch = () => new ApiError(400, 'INVALID_REFUND', 'Refund does not match a reservation in this workspace.');
  if (DEMO_MODE) {
    const ws = demoWorkspaces.get(workspaceId);
    if (!ws) throw forbidden();
    const reservation = demoLedger.find((e) => e.id === reservationId);
    if (
      !reservation ||
      reservation.workspaceId !== workspaceId ||
      reservation.type !== 'reservation' ||
      reservation.amountCredits !== -amount
    )
      throw mismatch();
    if (demoLedger.some((e) => e.id === refundId)) return { newBalance: ws.creditsRemaining, alreadyRefunded: true };
    ws.creditsRemaining += amount;
    demoLedger.unshift({
      id: refundId,
      workspaceId,
      type: 'refund',
      description,
      amountCredits: amount,
      resultingBalance: ws.creditsRemaining,
      timestamp: new Date().toISOString(),
    });
    return { newBalance: ws.creditsRemaining, alreadyRefunded: false };
  }
  return withTx(async (c) => {
    // Lock the workspace row first: concurrent refunds of the same reservation queue here.
    const ws = await c.query('SELECT credits_remaining FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    if (!ws.rows.length) throw forbidden();
    const current = Number(ws.rows[0].credits_remaining);
    const r = await c.query('SELECT workspace_id, type, amount_credits FROM ledger_entries WHERE id = $1', [
      reservationId,
    ]);
    const res = r.rows[0];
    if (
      !res ||
      res.workspace_id !== workspaceId ||
      res.type !== 'reservation' ||
      Number(res.amount_credits) !== -amount
    )
      throw mismatch();
    // reservation_id is UNIQUE: a second refund of the same reservation inserts nothing.
    const ins = await c.query(
      `INSERT INTO ledger_entries (id, workspace_id, user_id, type, description, amount_credits, resulting_balance, reservation_id)
       VALUES ($1, $2, $3, 'refund', $4, $5, $6, $7) ON CONFLICT DO NOTHING RETURNING id`,
      [refundId, workspaceId, uid, description, amount, current + amount, reservationId],
    );
    if (!ins.rows.length) return { newBalance: current, alreadyRefunded: true };
    await c.query('UPDATE workspaces SET credits_remaining = credits_remaining + $2 WHERE id = $1', [
      workspaceId,
      amount,
    ]);
    return { newBalance: current + amount, alreadyRefunded: false };
  });
}

/**
 * Adds credits to a workspace (admin tooling / a future payment webhook) and records the matching
 * ledger entry in the same transaction. Not exposed over HTTP. `idempotencyKey` (e.g. a payment id)
 * makes retries safe: the same key never credits twice.
 */
export async function grantCredits(
  workspaceId: string,
  amount: number,
  opts: { reason: string; type?: 'grant' | 'topup' | 'purchase'; idempotencyKey?: string; actor?: string },
) {
  assertAmount(amount);
  const type = opts.type ?? 'grant';
  if (DEMO_MODE) throw new ApiError(400, 'NOT_AVAILABLE_IN_DEMO', 'Granting credits is not available in demo mode.');
  const entryId = opts.idempotencyKey
    ? `${type}-${opts.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200)}`
    : `${type}-${randomUUID()}`;
  return withTx(async (c) => {
    const ws = await c.query('SELECT credits_remaining FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId]);
    if (!ws.rows.length) throw new ApiError(404, 'NOT_FOUND', `Workspace ${workspaceId} not found.`);
    const current = Number(ws.rows[0].credits_remaining);
    const ins = await c.query(
      `INSERT INTO ledger_entries (id, workspace_id, user_id, type, description, amount_credits, resulting_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING RETURNING id`,
      [entryId, workspaceId, opts.actor ?? 'system', type, opts.reason, amount, current + amount],
    );
    if (!ins.rows.length) {
      const prev = await c.query('SELECT workspace_id FROM ledger_entries WHERE id = $1', [entryId]);
      if (prev.rows[0]?.workspace_id !== workspaceId)
        throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'That idempotency key was used for another workspace.');
      return { entryId, newBalance: current, duplicate: true };
    }
    await c.query(
      `UPDATE workspaces SET credits_remaining = credits_remaining + $2,
              total_credits_allocated = total_credits_allocated + $2 WHERE id = $1`,
      [workspaceId, amount],
    );
    return { entryId, newBalance: current + amount, duplicate: false };
  });
}

/** Most recent ledger entries for a workspace the caller belongs to. */
export async function listLedger(uid: string, workspaceId: string, limit = 50): Promise<LedgerEntry[]> {
  await assertMember(uid, workspaceId);
  if (DEMO_MODE) return demoLedger.filter((e) => e.workspaceId === workspaceId).slice(0, limit);
  const { rows } = await db().query(
    `SELECT id, created_at, type, description, amount_credits, resulting_balance, asset_id
       FROM ledger_entries WHERE workspace_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((e) => ({
    id: e.id,
    workspaceId,
    timestamp: new Date(e.created_at).toISOString(),
    type: e.type,
    description: String(e.description ?? ''),
    amountCredits: Number(e.amount_credits),
    resultingBalance: Number(e.resulting_balance),
    ...(e.asset_id ? { assetId: e.asset_id } : {}),
  }));
}
