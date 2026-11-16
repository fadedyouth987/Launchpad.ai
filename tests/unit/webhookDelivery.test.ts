// deliverPinned connects to the validated IP only, never re-resolving DNS (DNS-rebinding safe).
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverPinned } from '../../server/webhookDelivery';

let server: http.Server;
let port = 0;
let lastRequest: { host?: string; signature?: string; body: string } = { body: '' };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastRequest = { host: req.headers.host, signature: req.headers['x-launchpad-signature'] as string, body };
      if (req.url === '/redirect') {
        res.writeHead(302, { location: 'http://169.254.169.254/' });
        return res.end();
      }
      res.end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});
afterAll(() => server.close());

describe('deliverPinned', () => {
  it('connects to the pinned address even when the hostname does not resolve', async () => {
    const r = await deliverPinned({
      url: new URL(`http://rebind.invalid:${port}/hook`),
      address: '127.0.0.1',
      payload: { a: 1 },
    });
    expect(r.status).toBe(200);
    expect(lastRequest.host).toBe(`rebind.invalid:${port}`);
  });

  it('signs the body with HMAC-SHA256 when a secret is given', async () => {
    await deliverPinned({
      url: new URL(`http://hook.invalid:${port}/`),
      address: '127.0.0.1',
      payload: { b: 2 },
      secret: 'whsec_test',
    });
    const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(lastRequest.signature || '') || [];
    expect(v1).toBe(createHmac('sha256', 'whsec_test').update(`${t}.${lastRequest.body}`).digest('hex'));
  });

  it('does not follow redirects', async () => {
    const r = await deliverPinned({
      url: new URL(`http://hook.invalid:${port}/redirect`),
      address: '127.0.0.1',
      payload: {},
    });
    expect(r.status).toBe(302);
  });

  it('times out', async () => {
    const slow = http.createServer(() => {});
    await new Promise<void>((r) => slow.listen(0, '127.0.0.1', () => r()));
    const p = (slow.address() as { port: number }).port;
    await expect(
      deliverPinned({ url: new URL(`http://slow.invalid:${p}/`), address: '127.0.0.1', payload: {}, timeoutMs: 300 }),
    ).rejects.toThrow(/Timed out/);
    slow.closeAllConnections();
    slow.close();
  });
});
