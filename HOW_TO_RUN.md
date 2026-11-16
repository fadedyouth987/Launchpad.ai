# Launchpad.ai — how to run

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env
```

## Local demo (no sign-in)

Set `DEMO_MODE="true"` in `.env`, then:

```bash
npm run dev          # http://localhost:3000
```

In demo mode the API does not require sign-in and credits use in-memory sample balances
for the two seeded demo workspaces. Never enable it on a deployed server.

Optional: set any AI provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, the Neon AI
Gateway or an OpenAI-compatible endpoint; see [AI providers](#ai-providers)) to turn on real AI. Without one the
app returns labelled sample output.

## Sign-in

The web app shows a sign-in screen before anything else. Signed-in users load their workspaces
from the server (`GET /api/me/workspaces`); a user with none is offered "Create your first
workspace". With `DEMO_MODE=true` the sign-in screen also offers "Continue with demo workspace".

## Real mode: Neon (Postgres + Neon Auth)

Data lives in Lakebase Postgres on Neon and users sign in with Neon Auth (managed Better Auth).
The project is linked by `neon.ts` / `.neon`: Neon project `odd-surf-26973335` (`launchpad-ai`, AWS
`ap-southeast-1`, Singapore), branch `production`. (Neon Functions are not available in Sydney
`ap-southeast-2`, so the earlier Sydney project `lucky-paper-89514604` is no longer used.)

```bash
npm i -g neon@latest
neon deploy                      # applies neon.ts (Auth on) and writes .env.local for the linked branch
npm run db:migrate               # creates/updates tables (migrations/*.sql) over DATABASE_URL_UNPOOLED
npm run dev                      # http://localhost:3000
```

`.env.local` gets `DATABASE_URL` (pooled, `-pooler` host; used by the app), `DATABASE_URL_UNPOOLED`
(direct; migrations only), `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL`. It is gitignored; never
commit it. The web build exposes only `NEON_AUTH_BASE_URL` to the browser (as `VITE_NEON_AUTH_URL`).

How it fits together:

- The browser signs up / signs in with `@neon/auth` directly against `NEON_AUTH_BASE_URL` (email +
  password, Google, password reset). Its session is held by Neon Auth; the SDK hands out a short-lived
  JWT (EdDSA, about 15 minutes) that `src/lib/api.ts` sends as `Authorization: Bearer <JWT>`.
- The API verifies the JWT against `NEON_AUTH_JWKS_URL` (signature, `iss`/`aud` = the auth origin,
  `exp`, `sub`; banned users rejected). The browser never talks to Postgres.
- Authorization is per workspace in Postgres (`workspace_members.role`): every read checks
  membership; viewers cannot spend credits or edit; owners/admins manage members, webhooks, legal hold
  and GDPR erase. Users themselves are in Neon Auth's `neon_auth."user"` table (names/emails for member
  lists and audit actors).
- Without `DATABASE_URL`/`NEON_AUTH_*` and without `DEMO_MODE`, protected endpoints return
  `503 AUTH_NOT_CONFIGURED`.

Tables (see `migrations/001_init.sql`): `workspaces` (balance with `CHECK (credits_remaining >= 0)`),
`workspace_members`, `ledger_entries` (append-only; `reservation_id UNIQUE` makes refunds
one-per-reservation), `audit_logs`, `influencers`, `campaign_os_states`, `campaign_assets`,
`webhook_endpoints`, `webhook_secrets`.

### Neon Auth settings (Neon console > project > Auth)

- **Trusted domains**: `localhost` is allowed by default. Every deployed web origin must be added, e.g.
  `neon neon-auth domain add https://launchpad-web.nexgen-studio.workers.dev` (already done for the
  `production` branch). Each branch has its own Auth instance and its own domain list.
- **Email**: Neon's shared email sender is for development. For production, configure your own SMTP
  provider (verification and password-reset mail) under Auth > Email.
- **Google sign-in**: Neon's shared Google credentials are for development; add your own Google OAuth
  client for production (redirect URI shown in the console).
- Session cookies are on the Neon Auth domain. Browsers that block third-party cookies (Safari,
  some privacy settings) can lose the session on reload; serving the app and auth under one site via a
  custom domain avoids this.

### Branches

Use a Neon branch per developer/test run instead of the production data:

```bash
neon branch create --name dev-test --no-secrets        # copy-on-write from production (expires per neon.ts)
neon env pull --branch dev-test --file .env.test.local   # its own DATABASE_URL and Neon Auth instance
ENV_FILE=.env.test.local npm run db:migrate
ENV_FILE=.env.test.local npm run dev
```

## Production build

```bash
npm ci
npm run build                 # client -> dist/public, server -> dist/server.cjs (+ map, never served)
NODE_ENV=production npm start
```

Or with Docker (multi-stage, runs as the unprivileged `node` user on port 8080):

```bash
docker build -t launchpad .
docker run -p 8080:8080 --env-file .env.production launchpad
```

In production the server **refuses to start** (exit 1, reason printed) when: `DATABASE_URL`,
`NEON_AUTH_BASE_URL` or `NEON_AUTH_JWKS_URL` is missing or malformed, `DATABASE_URL` lacks
`sslmode=require`, `DEMO_MODE=true` (unless `ALLOW_DEMO_MODE_IN_PRODUCTION=true` and no `GEMINI_API_KEY`),
or a numeric setting is not a valid whole number. It warns when `DATABASE_URL` is not the pooled
(`-pooler`) string.

- Liveness: `GET /api/health`. Readiness: `GET /api/ready` (200 only when Postgres answers `SELECT 1`
  within 5 s; 503 while draining).
- `SIGTERM` stops accepting connections, drains for up to 10 s, closes the Postgres pool, then exits.
- Set `TRUST_PROXY=1` behind one load balancer (automatic on Cloud Run).
- Hashed files under `/assets` are cached for a year; `index.html` is revalidated on every load.
- Run `npm run db:migrate` before starting a new version; the container does not migrate on boot.

## Deploy: API on Neon Functions + web app on Cloudflare (primary)

Everything server-side is on Neon in one region (AWS `ap-southeast-1`, Singapore): Postgres, Neon
Auth, and the Express API running as the Neon Function `api` (`functions/api.ts`, declared in
`neon.ts`). The web app (static files) is served by Cloudflare Workers static assets. The browser
signs in with Neon Auth and calls the function cross-origin with a Neon Auth JWT (no cookies to the API).

Live:

- Web: https://launchpad-web.nexgen-studio.workers.dev
- API: https://br-super-fire-az2ebof5-api.compute.c-3.ap-southeast-1.aws.neon.tech (`/api/health`, `/api/ready`)

### 1. API on Neon Functions

```bash
export PATH="$(npm prefix -g)/bin:$PATH"   # if `neon` was installed with npm i -g neon
npm run db:migrate                         # schema first (direct URL from .env.local)
npm run deploy:api                         # = neon deploy --env .env.local; prints the function URL
neon functions get api                     # invocation_url, status
neon logs query --branch production --source function --since 1h
```

How the function is set up:

- `functions/api.ts` builds the same app as `server.ts` (`createApp()`: security headers, CORS
  allowlist, rate limits, SSRF-guarded webhooks, JSON errors) and exposes it as a `fetch` handler via
  `fetch-to-node`. It runs the same startup checks; a bad production config fails the isolate at
  boot and the reason is in the function logs.
- Neon injects `DATABASE_URL` (pooled), `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL`. The API uses
  `node-postgres` over TCP with a module-scope pool (`DATABASE_POOL_MAX` 5 per isolate) and
  `attachDatabasePool()` from `@neon/functions`, as Neon recommends for this long-running runtime.
- `neon.ts` sets `NODE_ENV=production`, `SERVE_STATIC=false` and `ALLOWED_ORIGINS` (default
  `https://launchpad-web.nexgen-studio.workers.dev`; override by putting `ALLOWED_ORIGINS=...` in
  `.env.local` before deploying).
- **AI, Stripe, email:** add the variables (see [AI providers](#ai-providers), [Payments](#payments-stripe)
  and [Team invitations](#team-invitations-email)) to `.env.local` and run `npm run deploy:api` again. Each optional
  variable in `OPTIONAL_ENV` in `neon.ts` is uploaded only when it is set (never as an empty value).
  Without an AI key, AI features return clearly labelled sample output and charge nothing.
- `WEBHOOK_DELIVERY_ENABLED` defaults to `true` on the function (real signed deliveries).
- After adding migrations, run `ENV_FILE=.env.local DATABASE_DRIVER=neon-ws npm run db:migrate` (or without the
  driver override where TCP 5432 is open).
- Request bodies are capped at 2 MB before Express (routes accept at most 1 MB).
- `TRUST_PROXY` must stay unset on Functions (the server refuses to start with it):
  `X-Forwarded-For` is not a trustworthy client IP there. Limits are per verified user id.
- The function URL is public; every data route requires a verified Neon Auth JWT, and per-workspace
  roles are enforced in Postgres.

### 2. Web app on Cloudflare (Workers static assets)

```bash
npx wrangler login                      # once, opens a browser (or set CLOUDFLARE_API_TOKEN)
VITE_API_BASE_URL=https://br-super-fire-az2ebof5-api.compute.c-3.ap-southeast-1.aws.neon.tech npm run deploy:web
```

`build:web` builds `dist/public` with the API URL and the Neon Auth URL (from `.env.local`) baked in
and writes `dist/public/_headers`: the same CSP as the server (`server/csp.ts`) with the API origin
and the Neon Auth origin in `connect-src`, HSTS, and one-year caching for hashed `/assets`.
`wrangler.jsonc` deploys `dist/public` as Worker `launchpad-web` with SPA fallback. Rebuild and
redeploy the web app whenever the function URL or the Neon project changes. Add a custom domain in the
Cloudflare dashboard (Workers > launchpad-web > Domains) if you have one, then add it to
`ALLOWED_ORIGINS` (redeploy the API) **and** to Neon Auth's trusted domains.

### Order of operations

1. `npm run deploy:api` (`neon deploy --env .env.local`: provisions Auth and the function, writes
   `.env.local`) and note the function URL.
2. `npm run db:migrate` (production branch).
3. `VITE_API_BASE_URL=<function URL> npm run deploy:web`.
4. Make sure the web origin is a Neon Auth trusted domain (`neon neon-auth domain list`).
5. Open the site, sign up, create a workspace, grant credits (`npm run credits:grant`).

## Alternative: API on Google Cloud Run (Docker)

The same server also runs as a container (`Dockerfile`, `server.ts`) on Cloud Run or any Docker
host, using the same Neon database and Auth. It needs a Google Cloud project with billing. Put Cloud
Run in `asia-southeast1` (Singapore) to stay next to the database. Deploy it with
`npm run deploy:api:cloudrun`, then build the web app with `VITE_API_BASE_URL=<Cloud Run URL>`.

### 1. API on Google Cloud Run

One-time setup (Google Cloud console or `gcloud`, signed in as a project owner):

1. Pick a Google Cloud project with **billing enabled** (Cloud Run, Cloud Build, Artifact Registry and
   Secret Manager need it; light usage stays within the free tiers).
2. Enable the APIs:
   ```bash
   gcloud config set project <PROJECT_ID>
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
     secretmanager.googleapis.com
   ```
3. Create a runtime service account (it needs no project roles; it only reads its secrets):
   ```bash
   gcloud iam service-accounts create launchpad-api --display-name "Launchpad API"
   SA=launchpad-api@<PROJECT_ID>.iam.gserviceaccount.com
   ```
4. Store the **pooled** `DATABASE_URL` from `.env.local` in Secret Manager (it is read from the file,
   never echoed):
   ```bash
   sed -n 's/^DATABASE_URL=//p' .env.local | tr -d '"\n' | gcloud secrets create launchpad-database-url --data-file=-
   gcloud secrets add-iam-policy-binding launchpad-database-url \
     --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
   ```
5. Store the Gemini key (skip to run without AI; deploy with `GEMINI_SECRET=`):
   ```bash
   printf '%s' 'YOUR_GEMINI_KEY' | gcloud secrets create launchpad-gemini-api-key --data-file=-
   gcloud secrets add-iam-policy-binding launchpad-gemini-api-key \
     --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
   ```

Deploy (runs `npm run db:migrate` from your machine first, then builds the `Dockerfile` with Cloud
Build; files listed in `.gcloudignore`, including all `.env*` files, are not uploaded):

```bash
PROJECT_ID=<PROJECT_ID> REGION=asia-southeast1 \
ALLOWED_ORIGINS=https://launchpad-web.nexgen-studio.workers.dev \
npm run deploy:api:cloudrun
```

The script runs `gcloud run deploy launchpad-api --source .` with:

| Setting  | Value                                                                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Env vars | `NODE_ENV=production`, `SERVE_STATIC=false`, `ALLOWED_ORIGINS`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` (public; from `.env.local`) (+ optional `AI_*`, `NEW_WORKSPACE_CREDITS`, `DATABASE_POOL_MAX`) |
| Secrets  | `DATABASE_URL` from `launchpad-database-url:latest`; `GEMINI_API_KEY` from `launchpad-gemini-api-key:latest`                                                                                             |
| Identity | `launchpad-api@<project>.iam.gserviceaccount.com`                                                                                                                                                        |
| Port     | Cloud Run sets `PORT` (8080); the server listens on it                                                                                                                                                   |
| Scaling  | `--max-instances 1` by default: rate limits are per instance until a Redis store is configured. Each instance opens up to `DATABASE_POOL_MAX` (10) pooled connections.                                   |

`TRUST_PROXY` is set automatically on Cloud Run. The server refuses to start if `ALLOWED_ORIGINS`
is missing or malformed in API-only mode. Check `https://<service-url>/api/health` and `/api/ready`.

## Pricing and credits

| Action                                                                      | Cost                                   | Notes                                                             |
| --------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| AI post generation (`POST /api/generate`)                                   | `AI_GENERATION_COST_CREDITS` (15)      | reserved before the provider is called, refunded once if it fails |
| AI assists: trend scan, reply suggestions, workflow draft, Campaign OS step | `AI_ASSIST_COST_CREDITS` (5, 0 = free) | same reserve/refund rules                                         |
| AI image (`POST /api/images/generate`)                                      | `AI_IMAGE_COST_CREDITS` (25)           | same reserve/refund rules                                         |
| Any AI call when no provider is configured                                  | free                                   | labelled sample output                                            |
| New workspace                                                               | +`NEW_WORKSPACE_CREDITS` (0)           | written as a `grant` ledger entry                                 |

- Only owners, admins, approvers and creators can spend; viewers are read-only. Short balance -> HTTP 402.
- Balances change only on the server, in one Postgres transaction that also writes the ledger entry, so the
  sum of a workspace's ledger always equals its balance. A reservation is a single conditional
  `UPDATE … SET credits_remaining = credits_remaining - n WHERE credits_remaining >= n`, so concurrent
  requests can never overspend; a refund is keyed to its reservation (`reservation_id UNIQUE`), so it can
  happen only once. The browser has no database access at all.
- Plans (starter/professional/enterprise) are labels only: no monthly allocation or member limits are applied.
- The same credit price applies whichever provider runs the call, and whether it uses the server key or a
  workspace key.
- Top-ups use Stripe Checkout when configured (see [Payments](#payments-stripe)). Admins can also add credits with
  `npm run credits:grant -- <workspaceId> <amount> "<reason>" [idempotencyKey]` (uses `DATABASE_URL` from `.env.local`).

## AI providers

Supported: Anthropic Claude, OpenAI, Google Gemini, xAI Grok, Neon AI Gateway and any OpenAI-compatible endpoint
(OpenRouter, Groq, DeepSeek, Ollama, ...). Calls are plain HTTPS from the server; keys never reach the browser.

| Provider          | Key variable                                                                             | Where to get it                             | Model variable (default)                                         |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| Anthropic Claude  | `ANTHROPIC_API_KEY`                                                                      | https://console.anthropic.com/settings/keys | `ANTHROPIC_MODEL` (claude-sonnet-5-5)                            |
| OpenAI            | `OPENAI_API_KEY`                                                                         | https://platform.openai.com/api-keys        | `OPENAI_MODEL` (gpt-6.1-sol), `OPENAI_IMAGE_MODEL` (gpt-image-2) |
| Google Gemini     | `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)                                                   | https://aistudio.google.com/apikey          | `GEMINI_MODEL` (gemini-3.8-flash), `GEMINI_IMAGE_MODEL`          |
| xAI Grok          | `XAI_API_KEY`                                                                            | https://console.x.ai                        | `XAI_MODEL` (grok-4.7), `XAI_IMAGE_MODEL` (grok-imagine-image)   |
| Neon AI Gateway   | `NEON_AI_GATEWAY_TOKEN` + `NEON_AI_GATEWAY_BASE_URL`                                     | Neon console > AI Gateway (paid plan)       | `NEON_AI_GATEWAY_MODEL`                                          |
| OpenAI-compatible | `OPENAI_COMPATIBLE_BASE_URL` + `OPENAI_COMPATIBLE_MODEL` (+ `OPENAI_COMPATIBLE_API_KEY`) | your endpoint                               | `OPENAI_COMPATIBLE_LABEL` names it in the UI                     |

- **Default:** `AI_PROVIDER` picks the server default; otherwise the first configured in the order gateway,
  anthropic, openai, gemini, xai, custom. `AI_IMAGE_PROVIDER` picks the image provider (openai, gemini or xai).
- **Settings > AI Providers** (owners/admins edit, everyone sees): every provider with its status, model and cost,
  the workspace's chosen text and image provider, a "Test" button (not charged) and workspace keys.
- **Workspace keys (BYOK)** for Anthropic, OpenAI, Gemini and xAI need `AI_KEYS_ENCRYPTION_KEY`
  (`openssl rand -base64 32`). A key is checked against the provider before saving, stored AES-256-GCM encrypted
  (bound to workspace and provider), never returned (only the last 4 characters are shown to owners/admins) and
  used ahead of the server key for that workspace. The gateway and custom endpoint are server-only.
- If the chosen provider stops working (key removed), the next usable provider is used and the response says so.
- Trend scans use live Google Search grounding with Gemini only; other providers label trends as model knowledge.

## Payments (Stripe)

1. Set `STRIPE_SECRET_KEY` (https://dashboard.stripe.com/apikeys; `sk_test_...` while testing).
2. In Stripe > Developers > Webhooks add the endpoint `<API URL>/api/billing/stripe/webhook` with events
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`; set its signing secret as
   `STRIPE_WEBHOOK_SECRET`.
3. Optional: `STRIPE_CURRENCY` (usd), `CREDIT_PACKS` (`credits:cents,...`, default `500:1900,1500:4900,5000:14900`),
   `PUBLIC_APP_URL` (return URL; defaults to the first `ALLOWED_ORIGINS` entry).

Top up (owner/admin) opens Stripe Checkout; the signed webhook adds the credits once (idempotency key
`stripe_<session id>`), after checking amount and currency against the pack. Test card: 4242 4242 4242 4242.

## Team invitations (email)

Owners and admins invite by email from the Team page (only the owner can invite admins). The link
`<app>/#invite=<token>` is valid 7 days and can be accepted only by a signed-in user with the same email.
With `RESEND_API_KEY` (https://resend.com/api-keys) and `EMAIL_FROM` (a domain verified in Resend) the invite is
emailed; otherwise copy the link from the Team page.

## Tests

```bash
npm test               # Vitest: unit + API tests (in-memory store, fake AI client, no network)
npm run test:db        # Vitest: real-mode tests on a Neon dev branch (Postgres + Neon Auth; see below)
npm run lint           # TypeScript typecheck + ESLint (must be clean)
npm run format         # Prettier (format:check in CI)
```

`test:db` reads `.env.test.local` (override with `ENV_FILE`), migrates that branch, then signs up real
throwaway users through its Neon Auth and exercises the API: JWT verification (forged, tampered and
`alg=none` tokens rejected), tenant isolation, roles, credit reservation/refund under concurrency,
campaign assets, influencers, Campaign OS, webhooks and GDPR export/erase. It refuses to run against
the `production` branch. On networks that block outbound port 5432 add `DATABASE_DRIVER=neon-ws`.

## Rate limits

AI endpoints (`AI_RATE_LIMIT_PER_MINUTE`, default 20), webhook URL checks (`WEBHOOK_RATE_LIMIT_PER_MINUTE`, default 30)
and workspace data writes (`DATA_WRITE_RATE_LIMIT_PER_MINUTE`, default 120) are limited per signed-in user
(per IP in demo mode). Counters are kept in process memory, which is right for one server instance.
On Neon Functions each isolate keeps its own counters (several isolates can run under load and an
evicted isolate starts from zero), so treat these limits as best-effort there; Neon also caps an
account at 100 concurrent invocations. For strict quotas, plug in a shared store as below.

For several instances, plug in a shared store. Install `rate-limit-redis` and `redis`, then pass a factory to
`createApp` in `server.ts`:

```ts
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();
const app = createApp({
  ai,
  rateLimitStore: (prefix) => new RedisStore({ prefix, sendCommand: (...args: string[]) => redis.sendCommand(args) }),
});
```

## Webhook delivery

"Test delivery" validates the URL (http/https only, DNS resolved, every address must be public) and, by default,
sends nothing. Set `WEBHOOK_DELIVERY_ENABLED=true` (the default on the Neon Function) to POST test events and real
asset events: `approval.requested`, `asset.approved`, `asset.scheduled`, `asset.published`, `asset.rejected`
(sent when a campaign asset changes status). Use them to hand posts to Zapier, Make or Buffer. The request connects only to the IP that
passed validation (the hostname is used for the Host header and TLS only), does not follow redirects, times out
after 5 s and caps the response. Signed deliveries carry `x-launchpad-signature: t=<unix>,v1=<hex>` where
`v1 = HMAC-SHA256(secret, "<t>.<raw body>")`.

## UI structure

- Pages, their sidebar section, one-line description, header actions, first-visit tip and backend requirements live in `src/navigation.tsx`. Add a page there and it shows up in the sidebar, breadcrumb, "Go to page" search (Ctrl/⌘ K) and page header.
- The current page is in the URL hash (`#/billing`), so Back, reload and shared links work.
- Design tokens (colours, type scale with a 14px body minimum, radii, shadows, sidebar widths) are in `src/index.css` under `@theme`; `.dark` overrides the colour tokens.
- Shared building blocks: `src/components/ui/` (Button, Dialog, States: Loading/Empty/Error/NotConnected, SafeImg) and `src/components/layout/` (PageHeader, PageFinder, ActivityMenu, AccountControls, GettingStarted).
- Dismissed tips, theme and sidebar collapse are remembered in localStorage.
