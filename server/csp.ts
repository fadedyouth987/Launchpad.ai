/**
 * Content-Security-Policy directives shared by the Express server (helmet) and the Cloudflare
 * static-assets build (scripts/write-web-headers.ts), so both hosting setups send the same policy.
 * Sources allowed:
 *  - scripts/styles from this origin (inline style attributes are needed by motion/recharts)
 *  - images from https (sample images, OAuth profile photos), data: and blob:
 *  - the Neon Auth origin (sign-in API calls and the SDK's OAuth iframe)
 *  - `apiOrigins`: the API server when the web app is hosted on a different origin
 */
export function neonAuthOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.VITE_NEON_AUTH_URL || env.NEON_AUTH_BASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function cspDirectives(apiOrigins: string[] = [], authOrigin = neonAuthOrigin()): Record<string, string[]> {
  const auth = authOrigin ? [authOrigin] : [];
  return {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...apiOrigins, ...auth],
    'frame-src': auth.length ? auth : ["'none'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'script-src-attr': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
}

/** Serialises directives into a header value. */
export function cspHeaderValue(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}
