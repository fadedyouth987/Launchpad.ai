import type express from 'express';

/**
 * Strict CORS for the API when the web app is hosted on another origin (e.g. Cloudflare in front of
 * Cloud Run). Only exact origins listed in ALLOWED_ORIGINS get CORS headers; everyone else gets none,
 * so browsers block the response. Auth is a bearer token (no cookies), so credentials are not allowed.
 */
export const CORS_ALLOWED_HEADERS = ['Authorization', 'Content-Type', 'x-workspace-id'];
export const CORS_ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

/** Parses a comma-separated origin list. Throws on anything that is not a bare http(s) origin. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`"${value}" is not a valid origin (expected e.g. https://app.example.com).`);
      }
      const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
        throw new Error(`"${value}" must use https (http is only allowed for localhost).`);
      }
      if (url.origin !== value.replace(/\/+$/, '') || url.pathname !== '/' || url.search || url.hash) {
        throw new Error(`"${value}" must be an origin only (scheme://host[:port]), without a path.`);
      }
      return url.origin;
    });
}

export function corsMiddleware(allowed: string[]): express.RequestHandler {
  const allow = new Set(allowed);
  return (req, res, next) => {
    const origin = req.get('origin');
    res.vary('Origin');
    const permitted = Boolean(origin && allow.has(origin));
    if (permitted) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    }
    if (req.method === 'OPTIONS' && origin && req.get('access-control-request-method')) {
      if (!permitted) {
        return res.status(403).json({ error: 'CORS_ORIGIN_NOT_ALLOWED', message: 'This origin may not call the API.' });
      }
      res.setHeader('Access-Control-Allow-Methods', CORS_ALLOWED_METHODS.join(', '));
      res.setHeader('Access-Control-Allow-Headers', CORS_ALLOWED_HEADERS.join(', '));
      res.setHeader('Access-Control-Max-Age', '600');
      return res.status(204).end();
    }
    next();
  };
}
