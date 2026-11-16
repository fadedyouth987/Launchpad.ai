/**
 * Encryption for workspace-supplied ("bring your own") provider API keys.
 * AES-256-GCM with a server key from AI_KEYS_ENCRYPTION_KEY (32 bytes, base64 or 64 hex chars).
 * The workspace id and provider are bound in as associated data, so a ciphertext copied to another
 * workspace or provider row does not decrypt. Plaintext keys are never logged or returned to clients.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function masterKey(): Buffer | null {
  const raw = process.env.AI_KEYS_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

/** True when workspace keys can be stored (a valid AI_KEYS_ENCRYPTION_KEY is set). */
export function keyStorageEnabled(): boolean {
  return masterKey() !== null;
}

/** Problem with AI_KEYS_ENCRYPTION_KEY, for startup config checks. */
export function encryptionKeyProblem(): string | null {
  if (!process.env.AI_KEYS_ENCRYPTION_KEY?.trim()) return null;
  return masterKey() ? null : 'AI_KEYS_ENCRYPTION_KEY must be 32 bytes (base64, or 64 hex characters).';
}

export function encryptSecret(plaintext: string, aad: string): string {
  const key = masterKey();
  if (!key) throw new Error('AI_KEYS_ENCRYPTION_KEY is not configured');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(blob: string, aad: string): string {
  const key = masterKey();
  if (!key) throw new Error('AI_KEYS_ENCRYPTION_KEY is not configured');
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('unrecognised secret format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
}
