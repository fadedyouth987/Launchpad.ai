// Credit logic (in-memory store used by DEMO_MODE; the Postgres path is covered by tests/db).
import { describe, expect, it } from 'vitest';
import { getCredits, listLedger, refundCredits, reserveCredits } from '../../server/credits';
import { DEMO_UID } from '../../server/auth';

const WS = 'ws-vantory-agency';

describe('credits', () => {
  it('reserve deducts and writes a reservation entry; refund restores and writes a refund entry', async () => {
    const { creditsRemaining: start } = await getCredits(DEMO_UID, WS);
    const { reservationId, newBalance } = await reserveCredits(DEMO_UID, WS, 40, { description: 'test' });
    expect(newBalance).toBe(start - 40);
    const refunded = await refundCredits(DEMO_UID, WS, 40, reservationId);
    expect(refunded.newBalance).toBe(start);
    const [refund, reservation] = await listLedger(DEMO_UID, WS);
    expect(reservation).toMatchObject({
      id: reservationId,
      type: 'reservation',
      amountCredits: -40,
      resultingBalance: start - 40,
    });
    expect(refund).toMatchObject({ type: 'refund', amountCredits: 40, resultingBalance: start });
  });

  it('refuses to go below zero (INSUFFICIENT_CREDITS, 402) and leaves the balance unchanged', async () => {
    const { creditsRemaining: start } = await getCredits(DEMO_UID, WS);
    await expect(reserveCredits(DEMO_UID, WS, start + 1)).rejects.toMatchObject({
      status: 402,
      code: 'INSUFFICIENT_CREDITS',
    });
    expect((await getCredits(DEMO_UID, WS)).creditsRemaining).toBe(start);
  });

  it('unknown workspaces are forbidden (403)', async () => {
    await expect(reserveCredits(DEMO_UID, 'ws-missing', 1)).rejects.toMatchObject({ status: 403 });
    await expect(getCredits(DEMO_UID, 'ws-missing')).rejects.toMatchObject({ status: 403 });
  });
});

describe('credit amount validation and refunds', () => {
  it.each([[-5], [0], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [10_000_000], ['15' as unknown as number]])(
    'rejects amount %s with 400 and leaves the balance alone',
    async (amount) => {
      const { creditsRemaining: start } = await getCredits(DEMO_UID, WS);
      await expect(reserveCredits(DEMO_UID, WS, amount)).rejects.toMatchObject({ status: 400, code: 'INVALID_AMOUNT' });
      expect((await getCredits(DEMO_UID, WS)).creditsRemaining).toBe(start);
    },
  );

  it('refunds a reservation exactly once, even when retried', async () => {
    const { creditsRemaining: start } = await getCredits(DEMO_UID, WS);
    const { reservationId } = await reserveCredits(DEMO_UID, WS, 7);
    const first = await refundCredits(DEMO_UID, WS, 7, reservationId);
    const again = await refundCredits(DEMO_UID, WS, 7, reservationId);
    expect(first).toMatchObject({ newBalance: start, alreadyRefunded: false });
    expect(again).toMatchObject({ newBalance: start, alreadyRefunded: true });
    expect((await getCredits(DEMO_UID, WS)).creditsRemaining).toBe(start);
    const refunds = (await listLedger(DEMO_UID, WS)).filter(
      (e) => e.type === 'refund' && e.id === `refund-${reservationId}`,
    );
    expect(refunds).toHaveLength(1);
  });

  it('refuses refunds that do not match a reservation (wrong id, amount or workspace)', async () => {
    const { reservationId } = await reserveCredits(DEMO_UID, WS, 3);
    await expect(refundCredits(DEMO_UID, WS, 3, 'ledg-made-up')).rejects.toMatchObject({ status: 400 });
    await expect(refundCredits(DEMO_UID, WS, 300, reservationId)).rejects.toMatchObject({ status: 400 });
    await expect(refundCredits(DEMO_UID, 'ws-acme-enterprise', 3, reservationId)).rejects.toMatchObject({
      status: 400,
    });
    await refundCredits(DEMO_UID, WS, 3, reservationId);
  });
});
