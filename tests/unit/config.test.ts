// Production startup configuration checks.
import { describe, expect, it } from 'vitest';
import { checkConfig } from '../../server/config';

const AUTH = 'https://ep-x.neonauth.ap-southeast-2.aws.neon.tech/neondb/auth';
const prodCreds = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@ep-x-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require',
  NEON_AUTH_BASE_URL: AUTH,
  NEON_AUTH_JWKS_URL: `${AUTH}/.well-known/jwks.json`,
  TRUST_PROXY: '1',
  GEMINI_API_KEY: 'x',
};

describe('checkConfig', () => {
  it('accepts a complete production config', () => {
    expect(checkConfig(prodCreds)).toEqual({ errors: [], warnings: [] });
  });
  it('refuses DEMO_MODE in production unless explicitly overridden', () => {
    expect(checkConfig({ ...prodCreds, DEMO_MODE: 'true' }).errors.join()).toMatch(/DEMO_MODE/);
    const demo = { ...prodCreds, DEMO_MODE: 'true', ALLOW_DEMO_MODE_IN_PRODUCTION: 'true' };
    // A public demo must not carry a real Gemini key (anonymous visitors share one balance).
    expect(checkConfig(demo).errors.join()).toMatch(/AI provider quota/);
    expect(checkConfig({ ...demo, GEMINI_API_KEY: '' }).errors).toEqual([]);
  });
  it('checks the AI provider settings', () => {
    const bad = checkConfig({
      ...prodCreds,
      AI_PROVIDER: 'claude',
      AI_IMAGE_PROVIDER: 'anthropic',
      AI_KEYS_ENCRYPTION_KEY: 'short',
      OPENAI_COMPATIBLE_BASE_URL: 'ftp://x',
    }).errors.join('\n');
    expect(bad).toMatch(/AI_PROVIDER must be one of/);
    expect(bad).toMatch(/AI_IMAGE_PROVIDER must be/);
    expect(bad).toMatch(/AI_KEYS_ENCRYPTION_KEY must be 32 bytes/);
    expect(bad).toMatch(/OPENAI_COMPATIBLE_BASE_URL must be an http/);
    const ok = checkConfig({
      ...prodCreds,
      GEMINI_API_KEY: '',
      ANTHROPIC_API_KEY: 'sk-ant-x',
      AI_PROVIDER: 'anthropic',
      AI_KEYS_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    });
    expect(ok).toEqual({ errors: [], warnings: [] });
    const none = checkConfig({ ...prodCreds, GEMINI_API_KEY: '' });
    expect(none.warnings.join()).toMatch(/No AI provider key is set/);
    const custom = checkConfig({
      ...prodCreds,
      GEMINI_API_KEY: '',
      OPENAI_COMPATIBLE_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENAI_COMPATIBLE_MODEL: 'deepseek/deepseek-v4.1-flash',
    });
    expect(custom).toEqual({ errors: [], warnings: [] });
  });
  it('refuses production without Neon database/auth settings but only warns in development', () => {
    expect(checkConfig({ NODE_ENV: 'production' }).errors.join()).toMatch(/DATABASE_URL, NEON_AUTH_BASE_URL/);
    const { NEON_AUTH_JWKS_URL: _j, ...noJwks } = prodCreds;
    expect(checkConfig(noJwks).errors.join()).toMatch(/NEON_AUTH_JWKS_URL not set/);
    const dev = checkConfig({ NODE_ENV: 'development' });
    expect(dev.errors).toEqual([]);
    expect(dev.warnings.join()).toMatch(/neon deploy/);
  });
  it('rejects malformed values', () => {
    const { errors } = checkConfig({
      ...prodCreds,
      PORT: '70000',
      AI_GENERATION_COST_CREDITS: '-5',
      NEW_WORKSPACE_CREDITS: '1.5',
      DEMO_MODE: 'yes',
      DATABASE_DRIVER: 'mysql',
    });
    expect(errors).toHaveLength(5);
    expect(checkConfig({ ...prodCreds, DATABASE_URL: 'https://nope' }).errors.join()).toMatch(/postgres:\/\//);
    expect(checkConfig({ ...prodCreds, NEON_AUTH_JWKS_URL: 'http://plain' }).errors.join()).toMatch(/https/);
  });
  it('requires TLS to the database in production and warns about a direct (unpooled) URL', () => {
    const noTls = { ...prodCreds, DATABASE_URL: 'postgresql://u:p@ep-x-pooler.aws.neon.tech/neondb' };
    expect(checkConfig(noTls).errors.join()).toMatch(/sslmode=require/);
    const direct = { ...prodCreds, DATABASE_URL: 'postgresql://u:p@ep-x.aws.neon.tech/neondb?sslmode=require' };
    expect(checkConfig(direct).warnings.join()).toMatch(/-pooler/);
  });
});
