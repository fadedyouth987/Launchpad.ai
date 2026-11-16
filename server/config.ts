import { parseAllowedOrigins } from './cors';

/**
 * Startup configuration checks. In production, anything that would make the app insecure or
 * silently broken stops the process with a clear message; in development the same issues are
 * printed as warnings.
 */
export interface ConfigReport {
  errors: string[];
  warnings: string[];
}

const intVars: Array<[name: string, min: number, max: number]> = [
  ['PORT', 1, 65535],
  ['AI_GENERATION_COST_CREDITS', 1, 100_000],
  ['AI_ASSIST_COST_CREDITS', 0, 100_000],
  ['AI_IMAGE_COST_CREDITS', 1, 100_000],
  ['AI_REQUEST_TIMEOUT_MS', 1000, 600_000],
  ['NEW_WORKSPACE_CREDITS', 0, 1_000_000],
  ['MAX_WORKSPACES_PER_USER', 1, 1000],
  ['AI_RATE_LIMIT_PER_MINUTE', 1, 100_000],
  ['WEBHOOK_RATE_LIMIT_PER_MINUTE', 1, 100_000],
  ['DATA_WRITE_RATE_LIMIT_PER_MINUTE', 1, 100_000],
];

const AI_PROVIDERS = ['neon-gateway', 'anthropic', 'openai', 'gemini', 'xai', 'custom'];
const AI_KEY_VARS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'XAI_API_KEY',
  'NEON_AI_GATEWAY_TOKEN',
  'OPENAI_COMPATIBLE_API_KEY',
];

export function checkConfig(env: NodeJS.ProcessEnv = process.env): ConfigReport {
  const production = env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];
  const problem = (msg: string) => (production ? errors : warnings).push(msg);

  for (const [name, min, max] of intVars) {
    const raw = env[name];
    if (raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${name} must be a whole number between ${min} and ${max} (got "${raw}").`);
    }
  }
  for (const name of ['DEMO_MODE', 'WEBHOOK_DELIVERY_ENABLED', 'SERVE_STATIC']) {
    const raw = env[name];
    if (raw !== undefined && raw !== '' && raw !== 'true' && raw !== 'false') {
      errors.push(`${name} must be "true" or "false" (got "${raw}").`);
    }
  }
  if (
    env.TRUST_PROXY &&
    !/^(\d{1,2}|true|false|loopback|linklocal|uniquelocal|[\d.:/a-f, ]+)$/i.test(env.TRUST_PROXY)
  ) {
    errors.push(`TRUST_PROXY must be a hop count (e.g. 1) or an address list (got "${env.TRUST_PROXY}").`);
  }

  let origins: string[] = [];
  try {
    origins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  } catch (err) {
    errors.push(`ALLOWED_ORIGINS: ${(err as Error).message}`);
  }
  if (production && env.SERVE_STATIC === 'false' && !origins.length && !env.ALLOWED_ORIGINS) {
    errors.push(
      'SERVE_STATIC=false (API only) but ALLOWED_ORIGINS is empty: the separately hosted web app could not call the API. ' +
        'Set ALLOWED_ORIGINS=https://your-web-app.example.com.',
    );
  }
  if (production && origins.some((o) => o.startsWith('http://'))) {
    warnings.push('ALLOWED_ORIGINS contains an http://localhost origin in production.');
  }

  const demo = env.DEMO_MODE === 'true';
  if (demo && production && env.ALLOW_DEMO_MODE_IN_PRODUCTION !== 'true') {
    errors.push(
      'DEMO_MODE=true turns off sign-in for every API endpoint. Refusing to start with NODE_ENV=production ' +
        '(set ALLOW_DEMO_MODE_IN_PRODUCTION=true only for a public, throwaway demo).',
    );
  }

  const realValue = (v: string | undefined) => Boolean(v && v.trim() && !/^MY_[A-Z_]+$/.test(v.trim()));
  const providerKeys = AI_KEY_VARS.filter((n) => realValue(env[n]));
  if (demo && providerKeys.length) {
    // Demo visitors are anonymous and share one in-memory balance, so anyone could spend the provider quota.
    problem(
      `DEMO_MODE=true with ${providerKeys.join(', ')} set: anonymous visitors would use your AI provider quota. Unset one of them.`,
    );
  }
  if (env.AI_PROVIDER && !AI_PROVIDERS.includes(env.AI_PROVIDER)) {
    errors.push(`AI_PROVIDER must be one of ${AI_PROVIDERS.join(', ')} (got "${env.AI_PROVIDER}").`);
  }
  if (env.AI_IMAGE_PROVIDER && !['openai', 'gemini', 'xai'].includes(env.AI_IMAGE_PROVIDER)) {
    errors.push(`AI_IMAGE_PROVIDER must be openai, gemini or xai (got "${env.AI_IMAGE_PROVIDER}").`);
  }
  const encKey = env.AI_KEYS_ENCRYPTION_KEY?.trim();
  if (encKey) {
    const len = /^[0-9a-f]{64}$/i.test(encKey) ? 32 : Buffer.from(encKey, 'base64').length;
    if (len !== 32) errors.push('AI_KEYS_ENCRYPTION_KEY must be 32 bytes (base64, or 64 hex characters).');
  }
  for (const name of ['OPENAI_COMPATIBLE_BASE_URL', 'NEON_AI_GATEWAY_BASE_URL', 'OPENAI_BASE_URL']) {
    const v = env[name];
    if (!v) continue;
    let u: URL | null = null;
    try {
      u = new URL(v);
    } catch {
      u = null;
    }
    if (!u || !['https:', 'http:'].includes(u.protocol)) errors.push(`${name} must be an http(s) URL.`);
    else if (production && u.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)) {
      warnings.push(`${name} uses plain http in production; API keys would travel unencrypted.`);
    }
  }
  if (env.OPENAI_COMPATIBLE_BASE_URL && !env.OPENAI_COMPATIBLE_MODEL) {
    problem('OPENAI_COMPATIBLE_BASE_URL is set but OPENAI_COMPATIBLE_MODEL is not: the custom endpoint stays off.');
  }

  // ---------- Neon: Postgres + Neon Auth ----------
  const urlOk = (raw: string | undefined, protocols: string[]) => {
    try {
      return Boolean(raw) && protocols.includes(new URL(raw as string).protocol);
    } catch {
      return false;
    }
  };
  if (env.DATABASE_URL && !urlOk(env.DATABASE_URL, ['postgres:', 'postgresql:'])) {
    errors.push('DATABASE_URL must be a postgres:// connection string.');
  }
  if (env.DATABASE_URL_UNPOOLED && !urlOk(env.DATABASE_URL_UNPOOLED, ['postgres:', 'postgresql:'])) {
    errors.push('DATABASE_URL_UNPOOLED must be a postgres:// connection string.');
  }
  if (env.DATABASE_DRIVER && !['pg', 'neon-ws'].includes(env.DATABASE_DRIVER)) {
    errors.push(`DATABASE_DRIVER must be "pg" or "neon-ws" (got "${env.DATABASE_DRIVER}").`);
  }
  for (const name of ['NEON_AUTH_BASE_URL', 'NEON_AUTH_JWKS_URL']) {
    const v = env[name];
    if (v && !(urlOk(v, ['https:']) || (!production && urlOk(v, ['http:'])))) {
      errors.push(`${name} must be an https URL.`);
    }
  }
  if (!demo) {
    const missing = ['DATABASE_URL', 'NEON_AUTH_BASE_URL', 'NEON_AUTH_JWKS_URL'].filter((n) => !env[n]);
    if (missing.length) {
      problem(
        `${missing.join(', ')} not set: every signed-in API call would fail with 503. ` +
          'Run `neon deploy` (writes .env.local) or set them from Secret Manager.',
      );
    }
  }
  if (production && env.DATABASE_URL && urlOk(env.DATABASE_URL, ['postgres:', 'postgresql:'])) {
    const u = new URL(env.DATABASE_URL);
    if (/\.neon\.tech$/.test(u.hostname) && !u.hostname.includes('-pooler')) {
      warnings.push('DATABASE_URL is a direct (unpooled) Neon connection; use the -pooler URL for the app.');
    }
    if (!/sslmode=(require|verify-full|verify-ca)/.test(u.search) && !/localhost|127\.0\.0\.1/.test(u.hostname)) {
      errors.push('DATABASE_URL must use TLS (sslmode=require) in production.');
    }
  }
  const anyProvider =
    providerKeys.some((n) => n !== 'OPENAI_COMPATIBLE_API_KEY' && n !== 'NEON_AI_GATEWAY_TOKEN') ||
    (realValue(env.NEON_AI_GATEWAY_TOKEN) && realValue(env.NEON_AI_GATEWAY_BASE_URL)) ||
    (realValue(env.OPENAI_COMPATIBLE_BASE_URL) && realValue(env.OPENAI_COMPATIBLE_MODEL));
  if (!anyProvider) {
    warnings.push(
      'No AI provider key is set (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY, NEON_AI_GATEWAY_TOKEN or OPENAI_COMPATIBLE_BASE_URL): AI features return free, labelled sample output' +
        (encKey ? ' unless a workspace saves its own key.' : '.'),
    );
  }
  // Neon Functions: no trustworthy client IP (X-Forwarded-For is client-controlled), so TRUST_PROXY
  // must stay off there; per-user limits use the verified JWT subject.
  const onNeonFunctions = env.LAUNCHPAD_RUNTIME === 'neon-functions';
  if (onNeonFunctions && env.TRUST_PROXY) {
    errors.push(
      'TRUST_PROXY must not be set on Neon Functions (X-Forwarded-For is not a trustworthy client IP there).',
    );
  }
  if (onNeonFunctions && env.SERVE_STATIC !== 'false') {
    errors.push('On Neon Functions the server is API only: set SERVE_STATIC=false (and ALLOWED_ORIGINS).');
  }
  if (production && !env.TRUST_PROXY && !env.K_SERVICE && !onNeonFunctions) {
    warnings.push(
      'TRUST_PROXY is not set: behind a load balancer, rate limits will see the proxy IP. Set TRUST_PROXY=1.',
    );
  }
  return { errors, warnings };
}
