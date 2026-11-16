import ipaddr from 'ipaddr.js';
import { lookup } from 'node:dns/promises';

/** Resolves a hostname to all of its IP addresses (A and AAAA). Injectable for tests. */
export type Resolver = (hostname: string) => Promise<string[]>;

export const systemResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((a) => a.address);

export type UrlCheckResult = { ok: true; url: URL; addresses: string[] } | { ok: false; code: string; reason: string };

const BLOCKED_HOST_SUFFIXES = ['localhost', '.localhost', '.local', '.internal', '.home.arpa'];

/**
 * True only for globally routable unicast addresses. Everything else — loopback, private (RFC1918),
 * link-local (incl. 169.254.169.254 cloud metadata), CGNAT, unspecified, multicast, broadcast,
 * reserved/documentation, IPv6 unique-local, and IPv6 forms that can embed an IPv4 address
 * (IPv4-mapped is unwrapped and re-checked; 6to4, Teredo, NAT64 are blocked) — is rejected.
 */
export function isPublicAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false;
  let addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv6' && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }
  return addr.range() === 'unicast';
}

/**
 * Validates an outbound webhook URL: parses it (WHATWG URL also normalises tricks like
 * http://2130706433/ or http://127.1/ to 127.0.0.1), allows only http/https without embedded
 * credentials, resolves DNS, and requires EVERY resolved address to be public.
 *
 * Delivery must connect to one of the returned `addresses` (deliverPinned in webhookDelivery.ts pins
 * the IP) instead of resolving again, otherwise DNS rebinding can bypass this check.
 */
export async function checkWebhookUrl(raw: string, resolve: Resolver = systemResolver): Promise<UrlCheckResult> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) {
    return { ok: false, code: 'INVALID_URL', reason: 'URL is missing or too long.' };
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, code: 'INVALID_URL', reason: 'Not a valid URL.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'UNSUPPORTED_SCHEME', reason: 'Only http and https URLs are allowed.' };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'CREDENTIALS_IN_URL', reason: 'URLs with embedded credentials are not allowed.' };
  }
  const host = url.hostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (!host) return { ok: false, code: 'INVALID_URL', reason: 'URL has no host.' };

  let addresses: string[];
  if (ipaddr.isValid(host)) {
    addresses = [host];
  } else {
    if (BLOCKED_HOST_SUFFIXES.some((s) => host === s.replace(/^\./, '') || host.endsWith(s))) {
      return { ok: false, code: 'BLOCKED_HOST', reason: `Host "${host}" is an internal name.` };
    }
    try {
      addresses = await resolve(host);
    } catch {
      return { ok: false, code: 'UNRESOLVABLE_HOST', reason: `Host "${host}" could not be resolved.` };
    }
    if (addresses.length === 0) {
      return { ok: false, code: 'UNRESOLVABLE_HOST', reason: `Host "${host}" has no addresses.` };
    }
  }

  const blocked = addresses.find((a) => !isPublicAddress(a));
  if (blocked) {
    return {
      ok: false,
      code: 'BLOCKED_ADDRESS',
      reason: `Target resolves to ${blocked}, which is a private, loopback, link-local or otherwise non-public address.`,
    };
  }
  return { ok: true, url, addresses };
}
