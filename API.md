# Launchpad API (for integrations)

Other apps (Zapier, Make, n8n, your own scripts) can work with a Launchpad workspace using an **API key**.

## 1. Create a key

Settings → **API Keys** (workspace owners and admins). Pick a name and permissions, optionally an expiry, and
copy the key: it is shown **once** (`lp_live_…`). Only a hash is stored; revoke a key at any time from the same page.

| Permission | Lets the key…                                                                       |
| ---------- | ----------------------------------------------------------------------------------- |
| `read`     | view posts, influencers, images, voice clips/videos, credits and publishing history |
| `write`    | create and edit drafts, generate with AI, images, voice and video (spends credits)  |
| `publish`  | approve, schedule and publish posts (including posting to LinkedIn)                 |

A key works for **one workspace**, follows the same credit, approval and rate-limit rules as people, and everything
it does appears in the audit log as `API key "<name>"`. Keys cannot manage members, billing, webhooks, settings,
other keys, or erase data.

## 2. Call the API

Send the key as a bearer token. Base URL: your API host + `/api` (the Neon Function URL).

```bash
curl -H "Authorization: Bearer lp_live_YOUR_KEY" https://YOUR_API_HOST/api/v1/key
```

```bash
curl -H "Authorization: Bearer lp_live_YOUR_KEY" https://YOUR_API_HOST/api/workspaces/WORKSPACE_ID/campaign-assets
```

Generate a LinkedIn post with AI:

```bash
curl -X POST -H "Authorization: Bearer lp_live_YOUR_KEY" -H "Content-Type: application/json" \
  -d '{"workspaceId":"WORKSPACE_ID","prompt":"Announce our spring webinar","platform":"linkedin"}' \
  https://YOUR_API_HOST/api/generate
```

Publish an approved LinkedIn post now:

```bash
curl -X POST -H "Authorization: Bearer lp_live_YOUR_KEY" \
  https://YOUR_API_HOST/api/workspaces/WORKSPACE_ID/campaign-assets/POST_ID/publish
```

The full list of endpoints, with request and response shapes, is the OpenAPI description at
`GET /api/v1/openapi.json` (no key needed). Import it into Postman, Insomnia, Make ("HTTP" module) or Zapier
("Webhooks by Zapier" / API request).

## Errors

`401` invalid/revoked/expired key · `402` not enough credits · `403` the key's permissions (or keys in general)
cannot do this · `409` conflict (e.g. post not approved) · `429` rate limited (per key) · `502` the network
(LinkedIn) refused the post (`PUBLISH_FAILED`). Bodies are `{ "error": "CODE", "message": "…" }`.

Publishing answers `409` with one of `PLATFORM_NOT_SUPPORTED`, `NOT_APPROVED`, `NO_ACCOUNT`,
`LINKEDIN_NOT_CONFIGURED`, `ALREADY_PUBLISHED`, `IN_PROGRESS` or `FAILED_NEEDS_RETRY`.

A `write` key that changes the text, hashtags, image, title or network of an approved or scheduled post saves it
as `pending_review` (the response's `status` says so): it needs approval again before it goes out.

## Getting events back

Use webhooks (Settings → Security & Webhooks) to be told when posts are submitted, approved, scheduled or published,
instead of polling.
