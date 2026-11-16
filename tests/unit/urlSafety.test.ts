// Unit tests for webhook URL validation. Run with: npm test (Vitest)
import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { checkWebhookUrl, isPublicAddress, type Resolver } from '../../server/urlSafety';

// Deterministic fake DNS.
const dns: Record<string, string[]> = {
  'example10.com': ['93.184.215.14'],
  'api.acme.com': ['203.0.114.10', '2606:4700::6810:84e5'],
  'rebind.example.com': ['93.184.215.14', '10.0.0.5'], // one private answer is enough to block
  'metadata.example.com': ['169.254.169.254'],
  'v6private.example.com': ['fd12:3456::1'],
};
const resolver: Resolver = async (h) => {
  if (!(h in dns)) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  return dns[h];
};
const check = (u: string) => checkWebhookUrl(u, resolver);

describe('checkWebhookUrl blocks', () => {
  const blocked: [string, string][] = [
    ['http://127.0.0.1:8080/admin', 'BLOCKED_ADDRESS'],
    ['http://localhost/', 'BLOCKED_HOST'],
    ['http://LOCALHOST./', 'BLOCKED_HOST'],
    ['http://foo.localhost/', 'BLOCKED_HOST'],
    ['http://metadata.google.internal/', 'BLOCKED_HOST'],
    ['http://169.254.169.254/latest/meta-data/', 'BLOCKED_ADDRESS'],
    ['http://2130706433/', 'BLOCKED_ADDRESS'], // decimal 127.0.0.1
    ['http://127.1/', 'BLOCKED_ADDRESS'],
    ['http://0x7f.0.0.1/', 'BLOCKED_ADDRESS'],
    ['http://017700000001/', 'BLOCKED_ADDRESS'], // octal
    ['http://0.0.0.0/', 'BLOCKED_ADDRESS'],
    ['http://10.0.0.1/', 'BLOCKED_ADDRESS'],
    ['http://172.20.0.1/', 'BLOCKED_ADDRESS'], // old blocklist only covered 172.16.x
    ['http://172.31.255.255/', 'BLOCKED_ADDRESS'],
    ['http://192.168.1.1/', 'BLOCKED_ADDRESS'],
    ['http://100.64.0.1/', 'BLOCKED_ADDRESS'], // CGNAT
    ['http://224.0.0.1/', 'BLOCKED_ADDRESS'],
    ['http://[::1]/', 'BLOCKED_ADDRESS'],
    ['http://[::]/', 'BLOCKED_ADDRESS'],
    ['http://[::ffff:127.0.0.1]/', 'BLOCKED_ADDRESS'], // IPv4-mapped
    ['http://[::ffff:a00:1]/', 'BLOCKED_ADDRESS'], // IPv4-mapped 10.0.0.1
    ['http://[fe80::1]/', 'BLOCKED_ADDRESS'],
    ['http://[fc00::1]/', 'BLOCKED_ADDRESS'],
    ['http://[2002:7f00:1::]/', 'BLOCKED_ADDRESS'], // 6to4 wrapping 127.0.0.1
    ['http://[64:ff9b::7f00:1]/', 'BLOCKED_ADDRESS'], // NAT64 wrapping 127.0.0.1
    ['http://rebind.example.com/', 'BLOCKED_ADDRESS'],
    ['http://metadata.example.com/', 'BLOCKED_ADDRESS'],
    ['http://v6private.example.com/', 'BLOCKED_ADDRESS'],
    ['http://does-not-exist.example/', 'UNRESOLVABLE_HOST'],
    ['ftp://example10.com/', 'UNSUPPORTED_SCHEME'],
    ['file:///etc/passwd', 'UNSUPPORTED_SCHEME'],
    ['javascript:alert(1)', 'UNSUPPORTED_SCHEME'],
    ['gopher://example10.com/', 'UNSUPPORTED_SCHEME'],
    ['http://user:pass@example10.com/', 'CREDENTIALS_IN_URL'],
    ['not a url', 'INVALID_URL'],
    ['', 'INVALID_URL'],
  ];
  for (const [url, code] of blocked) {
    it(`${url || '(empty)'} -> ${code}`, async () => {
      const r = await check(url);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.code, code);
    });
  }
});

describe('checkWebhookUrl allows public targets', () => {
  for (const url of [
    'https://example10.com/hook', // old substring blocklist wrongly blocked this ("10.")
    'https://api.acme.com/v1/vantory-events',
    'http://8.8.8.8/',
    'https://[2001:4860:4860::8888]/',
    'https://example10.com:8443/hook',
  ]) {
    it(url, async () => {
      const r = await check(url);
      assert.equal(r.ok, true, JSON.stringify(r));
    });
  }
});

describe('isPublicAddress', () => {
  it('rejects garbage', () => assert.equal(isPublicAddress('not-an-ip'), false));
  it('accepts public v4/v6', () => {
    assert.equal(isPublicAddress('1.1.1.1'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
  });
});
