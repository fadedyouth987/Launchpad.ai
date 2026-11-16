import { defineConfig } from 'vitest/config';

// npm test        -> unit + API tests (in-memory DEMO_MODE store, fake AI client; no network)
// npm run test:db -> Postgres + Neon Auth tests against a Neon dev branch (.env.test.local; never production)
// Tests never use real provider/payment/email keys from the shell; tests stub the ones they need.
const NO_PROVIDER_KEYS = {
  ANTHROPIC_API_KEY: '',
  OPENAI_API_KEY: '',
  XAI_API_KEY: '',
  GOOGLE_API_KEY: '',
  NEON_AI_GATEWAY_TOKEN: '',
  NEON_AI_GATEWAY_BASE_URL: '',
  AI_GATEWAY_ENABLED: '',
  OPENAI_COMPATIBLE_BASE_URL: '',
  OPENAI_COMPATIBLE_MODEL: '',
  OPENAI_COMPATIBLE_API_KEY: '',
  AI_PROVIDER: '',
  AI_IMAGE_PROVIDER: '',
  AI_KEYS_ENCRYPTION_KEY: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  RESEND_API_KEY: '',
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
          environment: 'node',
          env: {
            DEMO_MODE: 'true',
            GEMINI_API_KEY: '',
            NODE_ENV: 'test',
            ...NO_PROVIDER_KEYS,
          },
        },
      },
      {
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          setupFiles: ['tests/db/setup.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
          env: {
            DEMO_MODE: 'false',
            GEMINI_API_KEY: '',
            NODE_ENV: 'test',
            ...NO_PROVIDER_KEYS,
            // Pricing under test (see tests/db/pricing.test.ts).
            AI_GENERATION_COST_CREDITS: '15',
            AI_ASSIST_COST_CREDITS: '5',
            NEW_WORKSPACE_CREDITS: '40',
            MAX_WORKSPACES_PER_USER: '3',
            AI_RATE_LIMIT_PER_MINUTE: '1000',
            DATA_WRITE_RATE_LIMIT_PER_MINUTE: '1000',
          },
        },
      },
    ],
  },
});
