// Admin tool: add credits to a workspace with a matching ledger entry (until a payment provider exists).
// Uses the same DATABASE_URL as the server (.env.local / .env, or ENV_FILE=...).
//   npm run credits:grant -- <workspaceId> <amount> "<reason>" [idempotencyKey]
import '../server/loadEnv';
import { grantCredits } from '../server/credits';
import { closeDb } from '../server/db';

async function main() {
  const [workspaceId, amountRaw, reason, idempotencyKey] = process.argv.slice(2);
  const amount = Number(amountRaw);
  if (!workspaceId || !reason || !Number.isInteger(amount)) {
    console.error('Usage: npm run credits:grant -- <workspaceId> <amount> "<reason>" [idempotencyKey]');
    process.exit(2);
  }
  const r = await grantCredits(workspaceId, amount, { reason, type: 'grant', idempotencyKey, actor: 'admin-cli' });
  console.log(
    r.duplicate
      ? `Already applied (${r.entryId}); balance ${r.newBalance}.`
      : `Granted ${amount} credits to ${workspaceId}; new balance ${r.newBalance} (ledger ${r.entryId}).`,
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
