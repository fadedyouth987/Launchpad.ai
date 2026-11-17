# Deployment status — read this first

_Last checked: 16 Nov 2026_

This repo is the source of truth for what is live. If you deploy from anywhere else
(a local folder, a zip, a builder tool), commit and push it here straight after.

## What is live

| Piece                        | Where                                                                                                 | Matches this repo? |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ |
| Web app (static, React/Vite) | Cloudflare Worker **`launchpad-web`** (`wrangler.jsonc`), last deployed 15 Nov 2026 15:40 UTC         | Yes                |
| API (Express)                | Neon Function (`neon.ts`, `npm run deploy:api`)                                                       | Yes                |
| Database                     | Neon project **`launchpad-ai`** (`odd-surf-26973335`, ap-southeast-1), migrations `001`–`003` applied | Yes                |

**Pending deploy (16–17 Nov), not live yet:**

1. **Monthly plans (Stripe Billing).** Migration `004_subscriptions.sql`; add the `customer.subscription.*` and
   `invoice.paid` events to the Stripe webhook; save the Stripe Customer portal once.
2. **LinkedIn posting + automatic scheduler.** Migration `005_social.sql`; create the LinkedIn app and set
   `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` (+ `AI_KEYS_ENCRYPTION_KEY`).
   `neon deploy` creates the every-minute `publish-due` trigger.
3. **AI voices + talking videos (ElevenLabs + D-ID).** Migration `006_media.sql`; set `ELEVENLABS_API_KEY`,
   `DID_API_KEY` and (optional) `PUBLIC_API_URL`.
4. **Member limits per plan** (3 / 10 / unlimited) on invitations, plus "Remove member" on the Team page. No
   migration. Existing workspaces never subscribed default to Starter: those already above 3 members keep them but
   cannot invite more until upgraded.
5. **API keys for integrations** (Settings > API Keys, read / write / publish). Migration `007_api_keys.sql`.
   Integrator guide: `API.md`; OpenAPI at `/api/v1/openapi.json`.
6. Also new: only owners/admins/approvers can approve or schedule posts (enforced by the API).

To ship: `npm run db:migrate` on **both** Neon projects, then `npm run deploy:api` and `npm run deploy:web`.
Details: `HOW_TO_RUN.md` → Payments, Social publishing, AI voices and talking videos, API keys.

Deploy commands: `npm run deploy:web` (Cloudflare), `npm run deploy:api` (Neon),
`npm run db:migrate` (database). See `HOW_TO_RUN.md`.

## Not in use — don't get these confused

- **Neon project `launchpad.AI`** (`lucky-paper-89514604`, ap-southeast-2): a second copy, **not**
  used by the live app. Brought up to date on 16 Nov 2026 (migrations `001`–`003`, schema identical
  to `launchpad-ai`), so it can serve as a spare/staging database. Any new migration must be run on
  both projects, or this one retired.
- **Firebase / Google AI Studio version**: the original July 2026 prototype (Firestore,
  `firebase-applet-config.json`, etc.). Replaced on 16 Nov 2026 by the version above; it
  is still in git history (commit `7ac74f0`) if ever needed.
- **`Launchpad.ai-fixed_1.zip` (14 Nov)**: an in-between Firebase version, never deployed
  to Cloudflare/Neon. Superseded.

## History

- 29–30 Jul 2026 — Firebase/AI Studio prototype pushed to GitHub.
- 14 Nov 2026 — Firebase version reworked (not pushed).
- 15 Nov 2026 — Rewritten for Cloudflare + Neon, deployed, migrations 001–003 applied (not pushed).
- 16 Nov 2026 — Deployed 15 Nov code (`Launchpad.ai-fixed_2.zip`) committed here so GitHub matches live.
- 16 Nov 2026 — Neon `launchpad.AI` brought up to date with migrations 002 and 003.
