# Launchpad.ai — full smoke test

Live URLs

- Web app: https://launchpad-web.nexgen-studio.workers.dev
- API (Neon Function, Singapore): https://br-super-fire-az2ebof5-api.compute.c-3.ap-southeast-1.aws.neon.tech
- Neon project `launchpad-ai` (odd-surf-26973335), branch `production`

Legend: **[live]** works now with no extra keys · **[key]** needs the env var(s) shown, then `npm run deploy:api`.

## 0. Turn features on (optional keys)

Add to `.env.local` (never commit it), then run `npm run deploy:api`:

| Feature                                               | Variables                                                                                                                | Where to get them                                                                                                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude                                                | `ANTHROPIC_API_KEY`                                                                                                      | https://console.anthropic.com/settings/keys                                                                                                                               |
| OpenAI (text + images)                                | `OPENAI_API_KEY`                                                                                                         | https://platform.openai.com/api-keys                                                                                                                                      |
| Gemini (text + images + live web trends)              | `GEMINI_API_KEY`                                                                                                         | https://aistudio.google.com/apikey                                                                                                                                        |
| Grok (text + images)                                  | `XAI_API_KEY`                                                                                                            | https://console.x.ai                                                                                                                                                      |
| Any OpenAI-compatible (OpenRouter, Groq, DeepSeek...) | `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL`, optional `OPENAI_COMPATIBLE_LABEL` | the provider's console                                                                                                                                                    |
| Neon AI Gateway                                       | `AI_GATEWAY_ENABLED=true` (Neon injects the token/URL)                                                                   | buy AI Gateway credits or upgrade in the Neon console first; today it answers 403 "AI Gateway is not enabled on this account's current plan"                              |
| Pick defaults                                         | `AI_PROVIDER`, `AI_IMAGE_PROVIDER`                                                                                       | —                                                                                                                                                                         |
| Stripe top-ups                                        | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`                                                                             | https://dashboard.stripe.com/apikeys ; webhook endpoint `<API>/api/billing/stripe/webhook` with `checkout.session.completed` + `checkout.session.async_payment_succeeded` |
| Invite emails                                         | `RESEND_API_KEY`, `EMAIL_FROM`                                                                                           | https://resend.com/api-keys (verified domain)                                                                                                                             |

Already set on production: `AI_KEYS_ENCRYPTION_KEY` (workspace keys), `PUBLIC_APP_URL`, `WEBHOOK_DELIVERY_ENABLED=true`.

Quick checks: `curl <API>/api/ready` → `{"ready":true,"database":"ok"}`; `curl <API>/api/health` → `ai.providers`
shows which providers are on, `integrations.payments/email/webhookDelivery` the rest.

## 1. Account and workspace [live]

1. Open the web app → sign-in gate. Create account (name, email, password) → "Create your first workspace".
2. Name it → dashboard. Reload → still signed in. Sign out → gate. Wrong password → "Incorrect email or password".
3. Continue with Google (if enabled in Neon Auth) → signed in.
4. Forgot password → reset email from Neon Auth.

## 2. AI providers (Settings → AI Providers)

1. [live] Page lists Neon AI Gateway, Claude, OpenAI, Gemini, Grok and Custom with status, env var names, default model, image/web-search support and "Get a key" links. "In use right now" shows the active text and image provider, or "sample output".
2. [live] Without keys: Test connection → "No AI provider is configured". Asset Studio → Generate → output labelled **Sample**; no credits charged.
3. [live] Workspace key (owner/admin): paste an invalid key → "<Provider> rejected this key." (checked live, nothing stored). Paste a valid Claude/OpenAI/Gemini/Grok key → saved, shows only "…last4"; reload, key never shown again; Remove deletes it.
4. [key or workspace key] Choose the text provider + model and the image provider → Save → "In use right now" updates. Test connection → "OK" and latency (free).
5. Switch provider (e.g. Claude → Grok) and generate again: the asset's engine label shows the new provider and model; credits charged are the same (15 per post).

## 3. AI features (need a working provider; workspace needs credits)

Add test credits: `npm run credits:grant -- <workspaceId> 200 "Smoke test"` (or Stripe, section 5).

1. AI Asset Studio: Generate → real copy, engine label `Provider · model`, balance −15. Kill the key/force an error → "credits were refunded".
2. Generate image → image appears, −25 credits; it stays after reload (stored in Postgres). Needs an OpenAI, Gemini or Grok key.
3. AI Trend Monitor: scan → trends (live Google Search sources with Gemini; other providers say "model knowledge"), −5.
4. Smart Engagement: Suggest reply → −5.
5. Campaign OS: Generate workflow from a brief → editable steps (−5). Select a step → **Run step with AI** → stored output appears, −5. "Mark step done" still works without AI. Reload → saved.
6. Viewer role cannot spend (HTTP 403); a balance too low → HTTP 402 INSUFFICIENT_CREDITS.

## 4. Content pipeline and webhooks [live]

1. Studio → Submit to Approval Queue → asset in Approvals. Approve / Reject / Schedule / Publish in Approvals, Scheduler or Publisher.
2. Security & Webhooks: add an endpoint (e.g. a https://webhook.site URL or your Zapier/Make catch hook) → "Delivery live". Test delivery → request arrives with header `x-launchpad-signature: t=…,v1=…`.
3. Change an asset's status → the endpoint receives `approval.requested`, `asset.approved`, `asset.scheduled`, `asset.published` or `asset.rejected` with the asset data. Private/loopback URLs are refused.
4. Audit log shows each action; Download data export → JSON with workspace data (AI settings list provider names only, no keys).

## 5. Billing

1. [live] Ledger & Billing shows balance and ledger (grants, charges, refunds).
2. [key] Top up → packs (500 / 1500 / 5000 credits) → Stripe Checkout → test card 4242 4242 4242 4242 → back to the app with "Payment received by Stripe…"; balance and ledger show a `purchase` entry once (replayed webhooks do not double-credit). Without Stripe keys the Top up dialog says payments are not connected.

## 6. Team [live]

1. Team & Presence → Invite by email (role creator/approver/viewer; admins only by the owner) → copy the invite link (emailed too with Resend keys).
2. Open the link in a private window, sign up with **that** email → joined the workspace with the role. Another email → "This invitation is for <email>. Sign in with that email to accept it."
3. Revoke a pending invite → link stops working. Change a member's role / remove a member.

## 7. Analytics and status [live]

1. Campaign Analytics: counts by status and channel, approval rate, upcoming schedule, AI calls and credits for 7/30/90 days, all from real workspace data. Reach/engagement shows "not connected".
2. Security → System Status: endpoint checks pass; capability list shows Works / Needs key / Not built matching the keys you set.

## 8. Not built (by design for now)

Direct posting to social networks (use webhooks → Zapier/Make/Buffer), paid plan subscriptions, voice/video avatar rendering,
background jobs/retention purge.

## Automated checks (developer)

```
npm run lint && npm run format:check && npm test           # unit/API tests, providers mocked
DATABASE_DRIVER=neon-ws npm run test:db                     # Postgres tests on the dev-test branch
npm run build
npm run deploy:api
VITE_API_BASE_URL=https://br-super-fire-az2ebof5-api.compute.c-3.ap-southeast-1.aws.neon.tech npm run deploy:web
```
