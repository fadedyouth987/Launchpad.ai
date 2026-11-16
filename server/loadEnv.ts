import dotenv from 'dotenv';

// .env.local first (Neon writes DATABASE_URL, NEON_AUTH_* there), then .env. ENV_FILE picks one
// file instead (e.g. ENV_FILE=.env.test.local for the dev branch). Existing process env (Cloud Run,
// CI) is never overridden.
dotenv.config({ path: process.env.ENV_FILE ? [process.env.ENV_FILE] : ['.env.local', '.env'], quiet: true });
