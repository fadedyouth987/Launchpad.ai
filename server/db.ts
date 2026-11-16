import pg from 'pg';
import { Pool as NeonPool, neonConfig, types as neonTypes } from '@neondatabase/serverless';
import ws from 'ws';

/**
 * Lakebase Postgres (Neon) connection.
 *
 * DATABASE_URL is the POOLED connection string (host contains "-pooler", PgBouncer in transaction
 * mode): right for an Express server that may run several Cloud Run instances. Every query here is
 * either a single statement or an explicit BEGIN…COMMIT on one checked-out client, and nothing
 * relies on session state (no SET, LISTEN, or named prepared statements), so transaction pooling
 * is safe. Migrations use DATABASE_URL_UNPOOLED (scripts/migrate.ts).
 *
 * DATABASE_DRIVER:
 *   pg       (default) node-postgres over TCP 5432. Use on Cloud Run.
 *   neon-ws  Neon serverless driver over WebSockets (port 443), same Pool API. Only for networks
 *            that block outbound 5432 (e.g. some sandboxes/CI).
 */
export const DATABASE_CONFIGURED = Boolean(process.env.DATABASE_URL);
export const DATABASE_DRIVER = process.env.DATABASE_DRIVER === 'neon-ws' ? 'neon-ws' : 'pg';

export type Db = pg.Pool;
export type DbClient = pg.PoolClient;

// Postgres bigint (int8) -> JS number. Balances are capped far below 2^53 by the app.
pg.types.setTypeParser(20, (v) => Number(v));
neonTypes.setTypeParser(20, (v: string) => Number(v)); // the serverless driver bundles its own type registry

let pool: Db | null = null;

export function createPool(connectionString: string, max = Number(process.env.DATABASE_POOL_MAX) || 10): Db {
  const options = { connectionString, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 };
  if (DATABASE_DRIVER === 'neon-ws') {
    neonConfig.webSocketConstructor = ws;
    return new NeonPool(options) as unknown as Db;
  }
  return new pg.Pool(options);
}

export function db(): Db {
  if (pool) return pool;
  if (!DATABASE_CONFIGURED) throw new Error('DATABASE_URL is not configured');
  pool = createPool(process.env.DATABASE_URL as string);
  // An idle client losing its connection (e.g. compute suspended) must not crash the process.
  pool.on('error', (err) => console.warn('[db] idle client error:', err.message));
  return pool;
}

export async function closeDb() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** Runs fn inside BEGIN/COMMIT on one client; rolls back on any error. */
export async function withTx<T>(fn: (c: DbClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
