import helmet from 'helmet';
import { cspDirectives } from './csp';

/**
 * Security headers (helmet). The Content-Security-Policy (see csp.ts) is applied in production only:
 * the Vite dev server injects inline scripts for hot reload.
 * COOP is "same-origin-allow-popups" so Google sign-in popups can report back to the app.
 */
export function securityHeaders({ production }: { production: boolean }) {
  return helmet({
    contentSecurityPolicy: production
      ? {
          useDefaults: true,
          directives: {
            ...cspDirectives(),
            // HTTPS is enforced with HSTS; upgrading would break plain-http local runs of the build.
            'upgrade-insecure-requests': null,
          },
        }
      : false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: production ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}
