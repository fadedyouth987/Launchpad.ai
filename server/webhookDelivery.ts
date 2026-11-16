import http from 'node:http';
import https from 'node:https';
import type { LookupFunction } from 'node:net';
import { createHmac } from 'node:crypto';
import ipaddr from 'ipaddr.js';

/** Real outbound delivery is opt-in: WEBHOOK_DELIVERY_ENABLED=true. Otherwise test sends are simulated. */
export const WEBHOOK_DELIVERY_ENABLED = process.env.WEBHOOK_DELIVERY_ENABLED === 'true';

export interface DeliveryResult {
  status: number;
  durationMs: number;
  bodyPreview: string;
}

/**
 * POSTs JSON to `url`, connecting ONLY to `address` (an IP that checkWebhookUrl already verified as
 * public). The hostname is still used for the Host header and TLS (SNI + certificate check), but DNS
 * is not consulted again, so a DNS-rebinding answer cannot redirect the request to an internal IP.
 * Redirects are not followed, a fresh connection is used (no keep-alive pool), the response is
 * capped and the whole request times out.
 */
export function deliverPinned(opts: {
  url: URL;
  address: string;
  payload: unknown;
  secret?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}): Promise<DeliveryResult> {
  const { url, address, payload, secret, timeoutMs = 5000, maxResponseBytes = 16 * 1024 } = opts;
  const family = ipaddr.parse(address).kind() === 'ipv6' ? 6 : 4;
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
    'user-agent': 'Launchpad-Webhooks/1.0',
  };
  // Receivers verify: HMAC-SHA256(secret, `${t}.${rawBody}`) == v1.
  if (secret)
    headers['x-launchpad-signature'] =
      `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

  const pinnedLookup: LookupFunction = (_host, options, cb) => {
    if ((options as { all?: boolean }).all)
      (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
    else cb(null, address, family);
  };

  const lib = url.protocol === 'https:' ? https : http;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      { method: 'POST', headers, lookup: pinnedLookup, agent: false, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          if (size < maxResponseBytes) chunks.push(c.subarray(0, maxResponseBytes - size));
          size += c.length;
          if (size > maxResponseBytes * 4) res.destroy();
        });
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            durationMs: Date.now() - started,
            bodyPreview: Buffer.concat(chunks).toString('utf8').slice(0, 500),
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error(`Timed out after ${timeoutMs} ms`)));
    req.on('error', reject);
    req.end(body);
  });
}
