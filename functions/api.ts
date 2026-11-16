// Neon Functions entry point: the same Express app as server.ts (createApp, CORS allowlist, rate
// limits, SSRF guard, security headers, JSON errors), exposed as a web-standard fetch handler.
// Declared in neon.ts as function "api"; deploy with `neon deploy --env .env.local`.
//
// Runtime notes (Neon Functions, Node.js 24):
// - DATABASE_URL (pooled), NEON_AUTH_BASE_URL and NEON_AUTH_JWKS_URL are injected by Neon.
// - node-postgres pool at module scope, small max, with attachDatabasePool() so an idle disconnect
//   is not an uncaughtException (DATABASE_POOL_MAX defaults to 5 here).
// - Module state (rate-limit counters) is per isolate; see HOW_TO_RUN.md "Rate limits".
import { attachDatabasePool } from '@neon/functions';
import { toFetchResponse, toReqRes } from 'fetch-to-node';
import type { Pool } from 'pg';
import { checkConfig } from '../server/config';

process.env.LAUNCHPAD_RUNTIME = 'neon-functions';
process.env.DATABASE_POOL_MAX ||= '5';
process.env.DATABASE_DRIVER ||= 'pg';

// Same startup checks as server.ts: a bad production config fails the isolate at boot instead of
// serving requests (the deploy's first request then returns 5xx and the logs say why).
const { errors, warnings } = checkConfig();
for (const w of warnings) console.warn(`[config] ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[config] ERROR: ${e}`);
  throw new Error('[config] Refusing to start. Fix the settings above (see .env.example).');
}

const [{ createApp }, { serverDefaultProvider }, { DEMO_MODE, AUTH_CONFIGURED }, { db, DATABASE_CONFIGURED }] =
  await Promise.all([
    import('../server/app'),
    import('../server/llm/catalog'),
    import('../server/auth'),
    import('../server/db'),
  ]);

if (DATABASE_CONFIGURED) attachDatabasePool(db() as unknown as Pool);

const app = createApp({});
// API only: the web app is on Cloudflare and calls this origin with CORS.
app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'This server only serves /api.' }));

console.log(
  `[function] Launchpad API ready (auth: ${DEMO_MODE ? 'DEMO_MODE' : AUTH_CONFIGURED ? 'Neon Auth' : 'not configured'}, ` +
    `AI default: ${serverDefaultProvider() ?? 'none (sample output)'}, CORS: ${process.env.ALLOWED_ORIGINS || '(none)'})`,
);

// No trustworthy client IP is available on Functions (X-Forwarded-For is client-controlled), so
// requests get a fixed placeholder address; per-user limits (uid from the verified JWT) still apply.
const PLACEHOLDER_SOCKET = Object.freeze({ remoteAddress: '0.0.0.0', encrypted: true });

// Express re-parents every req/res onto app.request/app.response, whose prototypes are Express's
// helper objects (res.json, req.get, …) on top of Node's own http.IncomingMessage/ServerResponse.
// Rebuild that chain once as: app.request -> Express helpers (copied) -> fetch-to-node classes, so
// the helpers run on the fetch-backed objects. Express's module-level prototypes are not mutated.
let prototypesLinked = false;
function relink(appProto: object, fetchBacked: object) {
  const expressHelpers = Object.getPrototypeOf(appProto) as object;
  const mixed = Object.create(Object.getPrototypeOf(fetchBacked), Object.getOwnPropertyDescriptors(expressHelpers));
  Object.setPrototypeOf(appProto, mixed);
}
function linkPrototypes(req: object, res: object) {
  if (prototypesLinked) return;
  relink(app.request, req);
  relink(app.response, res);
  prototypesLinked = true;
}

// Bodies are buffered (capped) so body-parser always sees a Content-Length, including for chunked
// uploads. The largest route accepts 1 MB; anything over MAX_BODY_BYTES is refused before Express.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
async function withBufferedBody(request: Request): Promise<Request | Response> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return request;
  const declared = Number(request.headers.get('content-length') || 0);
  const tooLarge = () =>
    Response.json({ error: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' }, { status: 413 });
  if (declared > MAX_BODY_BYTES) return tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return tooLarge();
    }
    chunks.push(value);
  }
  const headers = new Headers(request.headers);
  headers.set('content-length', String(size));
  headers.delete('transfer-encoding');
  return new Request(request.url, { method: request.method, headers, body: Buffer.concat(chunks) });
}

export default {
  async fetch(incoming: Request): Promise<Response> {
    const request = await withBufferedBody(incoming);
    if (request instanceof Response) return request;
    const { req, res } = toReqRes(request);
    linkPrototypes(req, res);
    // Express reads req.socket/req.connection (req.ip, req.protocol); fetch-to-node has no socket.
    Object.defineProperty(req, 'socket', { value: PLACEHOLDER_SOCKET, configurable: true });
    Object.defineProperty(req, 'connection', { value: PLACEHOLDER_SOCKET, configurable: true });
    app(req as never, res as never);
    return toFetchResponse(res);
  },
};
