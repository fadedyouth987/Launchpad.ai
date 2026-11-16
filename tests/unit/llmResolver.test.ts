// Server default provider selection from env, catalog status, and BYO-key encryption.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  providerCatalog,
  serverConfigured,
  serverDefaultImageProvider,
  serverDefaultProvider,
} from '../../server/llm/catalog';
import { createAiResolver } from '../../server/llm/resolver';
import { decryptSecret, encryptSecret, encryptionKeyProblem, keyStorageEnabled } from '../../server/llm/secrets';

afterEach(() => vi.unstubAllEnvs());

describe('server default provider', () => {
  it('is null (sample mode) with no keys', async () => {
    expect(serverDefaultProvider()).toBeNull();
    expect(serverDefaultImageProvider()).toBeNull();
    expect(await createAiResolver().text(null)).toBeNull();
    expect(createAiResolver().anyConfigured()).toBe(false);
  });

  it('ignores placeholder values', () => {
    vi.stubEnv('GEMINI_API_KEY', 'MY_GEMINI_API_KEY');
    expect(serverConfigured('gemini')).toBe(false);
  });

  it('picks the first configured provider, or AI_PROVIDER when that one is configured', async () => {
    vi.stubEnv('XAI_API_KEY', 'xai-test-key-1234');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test-1234');
    expect(serverDefaultProvider()).toBe('anthropic');
    vi.stubEnv('AI_PROVIDER', 'xai');
    expect(serverDefaultProvider()).toBe('xai');
    vi.stubEnv('AI_PROVIDER', 'openai'); // not configured -> ignored
    expect(serverDefaultProvider()).toBe('anthropic');
    const r = await createAiResolver().text(null);
    expect(r).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5-5', keySource: 'server' });
  });

  it('honours per-provider model env vars', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test-openai-1234');
    vi.stubEnv('OPENAI_MODEL', 'gpt-6-luna');
    expect(providerCatalog().openai.defaultModel).toBe('gpt-6-luna');
    expect((await createAiResolver().text(null))?.model).toBe('gpt-6-luna');
    expect(serverDefaultImageProvider()).toBe('openai');
  });

  it('custom endpoint needs a base URL and a model; the key is optional', () => {
    vi.stubEnv('OPENAI_COMPATIBLE_BASE_URL', 'http://localhost:11434/v1');
    expect(serverConfigured('custom')).toBe(false);
    vi.stubEnv('OPENAI_COMPATIBLE_MODEL', 'llama4');
    expect(serverConfigured('custom')).toBe(true);
    vi.stubEnv('OPENAI_COMPATIBLE_LABEL', 'Ollama');
    expect(providerCatalog().custom.label).toBe('Ollama');
  });

  it('the Neon AI Gateway needs both its token and base URL', () => {
    vi.stubEnv('NEON_AI_GATEWAY_TOKEN', 'tok');
    expect(serverConfigured('neon-gateway')).toBe(false);
    vi.stubEnv('NEON_AI_GATEWAY_BASE_URL', 'https://gw.example');
    expect(serverConfigured('neon-gateway')).toBe(true);
    expect(serverDefaultProvider()).toBe('neon-gateway'); // first in order when configured
    // Injected-but-unpaid gateway (403) can be switched off without removing Neon's variables.
    vi.stubEnv('AI_GATEWAY_ENABLED', 'false');
    expect(serverConfigured('neon-gateway')).toBe(false);
    expect(serverDefaultProvider()).toBe(null);
  });

  it('every provider in the catalog says where to get a key and which env vars to set', () => {
    for (const p of Object.values(providerCatalog())) {
      expect(p.keyEnv).toMatch(/^[A-Z_]+$/);
      expect(p.keyUrl.length).toBeGreaterThan(5);
      expect(p.label.length).toBeGreaterThan(2);
    }
  });
});

describe('workspace key encryption', () => {
  const KEY32 = Buffer.alloc(32, 7).toString('base64');

  it('is disabled without AI_KEYS_ENCRYPTION_KEY and reports a bad key', () => {
    expect(keyStorageEnabled()).toBe(false);
    vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', 'too-short');
    expect(keyStorageEnabled()).toBe(false);
    expect(encryptionKeyProblem()).toMatch(/32 bytes/);
  });

  it('round-trips with AES-GCM, binds the workspace/provider and hides the plaintext', () => {
    vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', KEY32);
    const blob = encryptSecret('sk-live-very-secret', 'ws-1:openai');
    expect(blob.startsWith('v1.')).toBe(true);
    expect(blob).not.toContain('very-secret');
    expect(decryptSecret(blob, 'ws-1:openai')).toBe('sk-live-very-secret');
    expect(() => decryptSecret(blob, 'ws-2:openai')).toThrow();
    expect(encryptSecret('same', 'a')).not.toBe(encryptSecret('same', 'a')); // random IV
  });

  it('accepts a 64-character hex key', () => {
    vi.stubEnv('AI_KEYS_ENCRYPTION_KEY', 'ab'.repeat(32));
    expect(keyStorageEnabled()).toBe(true);
  });
});
