import { defineConfig } from '@neon/config/v1';

// Optional settings copied into the function only when set in the --env file (never as "", which
// Neon rejects). Unset = that feature stays off and the app says so in Settings and System Status.
const OPTIONAL_ENV = [
  // AI providers (any one turns on real AI; see .env.example)
  'AI_PROVIDER',
  'AI_IMAGE_PROVIDER',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_IMAGE_MODEL',
  'OPENAI_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_IMAGE_MODEL',
  'XAI_API_KEY',
  'XAI_MODEL',
  'XAI_IMAGE_MODEL',
  'NEON_AI_GATEWAY_TOKEN',
  'NEON_AI_GATEWAY_BASE_URL',
  'NEON_AI_GATEWAY_MODEL',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_MODEL',
  'OPENAI_COMPATIBLE_LABEL',
  'OPENAI_COMPATIBLE_JSON_MODE',
  'AI_KEYS_ENCRYPTION_KEY',
  'AI_GENERATION_COST_CREDITS',
  'AI_ASSIST_COST_CREDITS',
  'AI_IMAGE_COST_CREDITS',
  'NEW_WORKSPACE_CREDITS',
  // Payments (Stripe credit packs and monthly plans)
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CURRENCY',
  'CREDIT_PACKS',
  'PLAN_PRICES',
  'PUBLIC_APP_URL',
  // Direct social publishing (LinkedIn) and the publish scheduler
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_REDIRECT_URI',
  'LINKEDIN_API_VERSION',
  'CRON_SECRET',
  // AI voice (ElevenLabs) and talking-head video (D-ID)
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_MODEL',
  'DID_API_KEY',
  'MEDIA_URL_SECRET',
  'PUBLIC_API_URL',
  'AI_VOICE_COST_CREDITS',
  'AI_VIDEO_COST_CREDITS',
  // Email (Resend): invitation emails
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;
const optionalEnv = Object.fromEntries(
  OPTIONAL_ENV.flatMap((name) => (process.env[name] ? [[name, process.env[name] as string]] : [])),
);

export default defineConfig({
  // Declare your Neon services here
  auth: true,
  // The Express API (functions/api.ts) as a Neon Function. Neon injects DATABASE_URL (pooled),
  // DATABASE_URL_UNPOOLED, NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL; everything below is ours.
  // Deploy: `neon deploy --env .env.local` (provider keys and other secrets are read from that file).
  functions: {
    api: {
      name: 'Launchpad API',
      source: 'functions/api.ts',
      env: {
        NODE_ENV: 'production',
        SERVE_STATIC: 'false',
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'https://launchpad-web.nexgen-studio.workers.dev',
        // Signed webhooks (test sends + asset events) are sent for real; URLs pass the SSRF checks
        // and connections are pinned to the checked IP.
        WEBHOOK_DELIVERY_ENABLED: process.env.WEBHOOK_DELIVERY_ENABLED || 'true',
        // Neon injects NEON_AI_GATEWAY_TOKEN/BASE_URL into the function, but the gateway answers 403
        // until the Neon account has AI Gateway credits (or a paid plan). Off by default; set
        // AI_GATEWAY_ENABLED=true in .env.local and redeploy once credits are bought.
        AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED || 'false',
        ...optionalEnv,
      },
    },
  },
  // Every minute, publish scheduled posts whose time has come (POST /api/internal/publish-due; a no-op
  // when nothing is due or no LinkedIn account is connected). The call carries Neon's trigger header.
  triggers: {
    'publish-due': {
      type: 'schedule',
      function: 'api',
      cron: '* * * * *',
      functionPath: '/api/internal/publish-due',
    },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: '7d' };
    }
    // Existing branch: no changes
    return {};
  },
});
