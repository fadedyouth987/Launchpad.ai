// Loads the Neon test branch settings before any server module reads process.env.
import '../../server/loadEnv';

if (!process.env.DATABASE_URL || !process.env.NEON_AUTH_BASE_URL) {
  throw new Error(
    'Postgres tests need a Neon branch: run `neon env pull --branch dev-test --file .env.test.local` (see HOW_TO_RUN.md).',
  );
}
if (process.env.NEON_BRANCH === 'production' && process.env.ALLOW_TESTS_ON_PRODUCTION !== 'true') {
  throw new Error('Refusing to run tests against the production branch. Use a dev branch (.env.test.local).');
}
