import { describe, expect, it } from 'vitest';
import { assertCanInvite, assertCanJoin, memberLimits, seatUsage, type SeatUsage } from '../../server/memberLimits';

const usage = (over: Partial<SeatUsage>): SeatUsage => ({
  plan: 'starter',
  planName: 'Starter',
  limit: 3,
  members: 1,
  pendingInvites: 0,
  ...over,
});
const fakeDb = (row: Record<string, unknown>) => ({ query: async () => ({ rows: [row] }) }) as never;

describe('member limits', () => {
  it('parses PLAN_MEMBER_LIMITS (0 = unlimited) and ignores junk', () => {
    expect(memberLimits('starter:3,professional:10,enterprise:0')).toEqual({
      starter: 3,
      professional: 10,
      enterprise: null,
    });
    expect(memberLimits('starter:5,gold:9,professional:-1')).toEqual({
      starter: 5,
      professional: 10,
      enterprise: null,
    });
  });

  it('invitations count members + open invitations', () => {
    expect(() => assertCanInvite(usage({ members: 2, pendingInvites: 0 }))).not.toThrow();
    expect(() => assertCanInvite(usage({ members: 2, pendingInvites: 1 }))).toThrow(/Starter plan allows 3 members/);
    expect(() => assertCanInvite(usage({ members: 50, limit: null, plan: 'enterprise' }))).not.toThrow();
  });

  it('accepting counts members only', () => {
    expect(() => assertCanJoin(usage({ members: 2, pendingInvites: 5 }))).not.toThrow();
    expect(() => assertCanJoin(usage({ members: 3 }))).toThrow(/full/);
  });

  it('uses the active subscription plan, falls back to Starter after it ends, else the plan column', async () => {
    const active = await seatUsage(
      fakeDb({ plan: 'starter', sub_plan: 'professional', sub_status: 'active', members: 4, pending: 1 }),
      'w',
    );
    expect(active).toMatchObject({ plan: 'professional', limit: 10, members: 4, pendingInvites: 1 });
    const ended = await seatUsage(
      fakeDb({ plan: 'enterprise', sub_plan: 'enterprise', sub_status: 'canceled', members: 4, pending: 0 }),
      'w',
    );
    expect(ended).toMatchObject({ plan: 'starter', limit: 3 });
    const manual = await seatUsage(
      fakeDb({ plan: 'enterprise', sub_plan: null, sub_status: null, members: 40, pending: 0 }),
      'w',
    );
    expect(manual).toMatchObject({ plan: 'enterprise', limit: null });
  });
});
