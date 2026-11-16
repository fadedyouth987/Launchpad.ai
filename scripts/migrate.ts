// Applies migrations/*.sql in order, once each, inside a transaction per file.
// Uses the DIRECT connection (DATABASE_URL_UNPOOLED); PgBouncer transaction pooling is not suitable
// for migrations. An advisory lock stops two deploys migrating at the same time.
//   npm run db:migrate                 (reads .env.local / .env)
//   ENV_FILE=.env.test.local npm run db:migrate
import fs from 'node:fs';
import path from 'node:path';

import '../server/loadEnv';

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL_UNPOOLED (direct connection) to run migrations.');
  if (!process.env.DATABASE_URL_UNPOOLED) console.warn('[migrate] DATABASE_URL_UNPOOLED not set; using DATABASE_URL.');
  const { createPool } = await import('../server/db');
  const pool = createPool(url, 1);
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727274001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const dir = path.resolve(process.cwd(), 'migrations');
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort();
    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file}: ${(err as Error).message}`);
      }
      console.log(`[migrate] applied ${file}`);
      applied++;
    }
    console.log(`[migrate] up to date (${files.length} migration(s), ${applied} applied now)`);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274001)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
