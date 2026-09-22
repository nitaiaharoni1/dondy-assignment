# COD Order Watch

An embedded Shopify app for seeing how many received orders are Cash-On-Delivery (COD).

## What it does

- Accepts signed `orders/create` webhook deliveries and stores one order per shop and Shopify order ID.
- Records delivery IDs and orders in the same database transaction so a retry cannot count an order twice.
- Verifies webhooks with Shopify's official SDK validator (no access-token refresh on the webhook path).
- Shows received-order count, COD count, COD percentage, order value by currency, and the latest 20 orders for the signed-in shop.
- Deletes the shop's orders, delivery receipts, installation record, and Shopify sessions on `app/uninstalled`.
- Starts empty: existing store orders are not imported.

## COD rule

Normalize payment gateway names by trimming and lowercasing. An order is COD when **any gateway contains `cash`**, or when **`financial_status` is `pending` and a gateway is exactly `manual`**. A pending card payment alone is not COD. This follows the assignment heuristic; some manual pending payments can be bank transfers, and a gateway name containing `cash` can produce a false positive. This is classification, not confirmation that cash was collected.

## Names

Folders are kebab-case: `app/orders`, `app/webhooks`, `app/dashboard`. Modules are kebab-case. A file that touches the database, Shopify admin, or a secret ends in `.server.ts`. React components that are not routes are PascalCase, such as `DashboardPage.tsx`. Files in `app/routes` keep React Router's flat-route names (`app._index.tsx`, `webhooks.orders.create.tsx`). ESLint rejects a file over 300 lines, a function over 50 lines, complexity over 8, or blocks nested more than 4 deep.

## Stack

Official Shopify React Router TypeScript template (React, Vite, Polaris web components, App Bridge, integrated Node server), Prisma + SQLite, Zod, decimal.js, Vitest. API version `2026-07`. Scope: `read_orders` only.

## Setup (about two minutes once Partner access exists)

Prerequisites on this machine when last checked: Node `22.22.1`, npm `10.9.4`, Shopify CLI `4.8.0`.

1. Create or choose a **development store** in the Shopify Partner Dashboard (not a production merchant store).
2. Enable **Protected customer data** access for development without requesting name, address, email, or phone. Keep scope at `read_orders`.
3. From this repo:

```bash
npm ci
cp .env.example .env   # values are overwritten by `shopify app dev` when linked
npm run setup          # prisma generate + migrate deploy (local SQLite)
```

4. Link the app to your Partner organization (fills `client_id` and local secrets):

```bash
npm run config:link
# or: shopify app init flow already done; then
npm run dev
```

5. Install the app on the development store when the CLI opens the install URL. Confirm the embedded admin page loads and subscriptions show `orders/create` and `app/uninstalled` with relative URIs.

Environment variables (set by Shopify CLI during `app dev`; never commit real values):

| Name                 | Purpose                                |
| -------------------- | -------------------------------------- |
| `SHOPIFY_API_KEY`    | Public app client id                   |
| `SHOPIFY_API_SECRET` | App secret for HMAC                    |
| `SHOPIFY_APP_URL`    | Current app / tunnel URL               |
| `SCOPES`             | Should include `read_orders`           |
| `DATABASE_URL`       | SQLite file, default `file:dev.sqlite` |

Database file is `prisma/dev.sqlite` (gitignored). Schema and migrations live under `prisma/`. Tests use a separate throwaway file, `prisma/test.sqlite`.

### Useful commands

```bash
npm run dev            # Shopify app + tunnel
npm run build          # production build
npm run typecheck
npm run lint
npm run format:check
npm run test           # Vitest, throwaway prisma/test.sqlite
```

Duplicate-delivery demo helper (fabricated payload, same webhook id twice):

```bash
SHOPIFY_API_SECRET=... SHOPIFY_APP_URL=https://CURRENT_TUNNEL \
npx tsx scripts/replay-webhook.ts \
  --url https://CURRENT_TUNNEL/webhooks/orders/create \
  --shop your-store.myshopify.com
```

Refresh the dashboard after webhooks; the open browser does not update by itself.

## Key decisions

- **Bonus chosen:** a unit test with a fixed payload, a fixed test secret, and a pasted signature (`tests/webhooks.test.ts`). Not order tagging, compliance webhooks, or `orders/updated`.
- **Order and uninstall handlers do not call `authenticate.webhook()`.** That template helper can load and refresh an access token. These two routes check the raw body with `@shopify/shopify-api` `webhooks.validate`, then parse JSON. The generated `app/scopes_update` route still uses the template helper, because it updates the saved session scope.
- **The signature check is the SDK's `safeCompare`.** Equal-length values are compared with XOR across every byte (`timingSafeEqual` in `@shopify/shopify-api`). Different lengths return false without walking the bytes. This app does not implement its own compare.
- **Write, then answer.** The order and the delivery id commit in one database transaction. Success, a duplicate delivery, and an unknown shop return 200. A failed write returns 503 so Shopify retries. A bad signature returns 401. A bad payload returns 400.
- **`manual` means the whole gateway name,** after trim and lowercase, not a substring. `cash` is a substring, so "Cash on Delivery" matches even when the order is already paid.
- **Totals stay split by currency.** USD and JPY are not added together. Amounts are integer minor units (cents, yen, fils), not floating point.
- **Template:** the official React Router app, not a separate Next.js admin. Polaris on the page is the template's web components.

## Requirements

| Task item                                   | Where                                        | Status                                                     |
| ------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------- |
| Embedded app on a development store         | `npm run dev`                                | Not done. Needs your Partner login, then install           |
| `orders/create` in `shopify.app.toml`       | `uri = "/webhooks/orders/create"`            | Declared                                                   |
| Raw-body HMAC                               | `app/webhooks/authenticate.server.ts`        | SDK validator. Fixed signature test passes                 |
| Idempotent `X-Shopify-Webhook-Id`           | `app/orders/ingest.server.ts`                | Same delivery twice keeps one order. Local replay did this |
| 200 after a safe write                      | `app/routes/webhooks.orders.create.tsx`      | 200 after commit. 503 if the write fails                   |
| Stored fields and COD flag                  | `prisma/schema.prisma`, `app/orders/cod.ts`  | Tested                                                     |
| Polaris page: counts, share, value, last 20 | `app/routes/app._index.tsx`                  | Built. Not opened inside a store admin                     |
| This shop only                              | Dashboard loader uses the authenticated shop | Tested with two shops                                      |
| `app/uninstalled` deletes that shop's data  | `app/orders/shops.server.ts`                 | Tested, including a second call                            |
| README                                      | This file                                    | How to run, rule, decisions, time, limits                  |

## Deliberate limits

No historical import, no `orders/updated`, no refunds/cancellations, no automatic tagging, no background queue, no production deploy, no App Store release. Currency totals stay separate (no FX). Compliance webhooks are not claimed. Cross-install lifecycle races (delayed uninstall after reinstall) need extra production design.

With more time: PostgreSQL, durable intake queue, reconciliation, lifecycle generations, privacy workflows, retention, measured load tests.

## Actual time spent

Planning and setup count toward the assignment budget.

| Activity                                       | Actual elapsed time                                     | Evidence/status                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial reading and inspection before 13:45:12 | Unmeasured                                              | Add if known                                                                                                                                   |
| Instrumented planning and repository setup     | 11 minutes 38 seconds                                   | 13:45:12 to 13:56:50 Asia/Jerusalem                                                                                                            |
| Follow-up planning audit and corrections       | 5 minutes 15 seconds                                    | 13:59:26 to 14:04:41 Asia/Jerusalem                                                                                                            |
| Application, tests, and review                 | 42 minutes, 14:10 to 14:52 Asia/Jerusalem               | Commits `81537ba` through `3f48d63`                                                                                                            |
| Requirements check against the original task   | After 14:52 Asia/Jerusalem, see this commit's timestamp | README sections Key decisions and Requirements                                                                                                 |
| Store setup, installation, and live demo       | Not completed in-agent                                  | Needs Partner login / store install by the candidate                                                                                           |
| Builds, typecheck, lint, and tests             | Run during implementation and the follow-up test pass   | `npm run test` 30 passed. Local synthetic replay: first 200 in 38ms, duplicate 200 in 4ms, one COD order stored. Live Partner install not done |

## Plan docs

| File                                 | Purpose                |
| ------------------------------------ | ---------------------- |
| [Requirements](docs/REQUIREMENTS.md) | Acceptance criteria    |
| [Architecture](docs/ARCHITECTURE.md) | Design                 |
| [Implementation plan](PLAN.md)       | Task checklist         |
| [Quality plan](docs/QUALITY.md)      | Tests and verification |
| [Demo guide](docs/DEMO.md)           | 15-minute walkthrough  |
