/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Neon Auth endpoint (NEON_AUTH_BASE_URL from `neon env pull`); vite.config.ts fills it in from .env.local. */
  readonly VITE_NEON_AUTH_URL?: string;
  /** API origin when the web app is hosted separately (e.g. Cloudflare -> Cloud Run). Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
}
