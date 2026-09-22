# COD Order Watch

An embedded Shopify app for seeing how many received orders are Cash-On-Delivery (COD).

**Status: planning complete; application implementation has not started.** This repository currently contains the implementation design, delivery checklist, and verification plan. It is not a runnable app yet. No Shopify store installation, database migration, webhook delivery, build, or test has been performed for this project.

## Read the plan

| File | Purpose |
| --- | --- |
| [Requirements](docs/REQUIREMENTS.md) | Assignment acceptance criteria, scope, and important ambiguities |
| [Architecture](docs/ARCHITECTURE.md) | Stack decisions, data model, webhook transaction, security boundaries, and dashboard contract |
| [Implementation plan](PLAN.md) | Ordered tasks, dependencies, time budget, checkpoints, and intended commits |
| [Quality plan](docs/QUALITY.md) | Lint rules, meaningful tests, failure cases, security, and performance verification |
| [Demo guide](docs/DEMO.md) | Fifteen-minute walkthrough, duplicate-delivery demonstration, and scaling discussion |

## Proposed stack

Use Shopify's official React Router TypeScript template: React, Vite, Polaris web components, Shopify App Bridge, and its integrated Node server. Keep the template's Prisma and SQLite database. Add Zod for runtime payload validation, decimal.js for exact monetary conversion, and Vitest for focused tests.

This is the recommended default, pending a different stack preference. React, TypeScript, and Vite match the preferred frontend stack. Polaris is required by the assignment. Tailwind CSS and MobX are deferred because the first version has one read-only dashboard and no shared mutable client state. A separate NestJS/TypeORM backend would require additional Shopify authentication and session integration; the alternative is described in [Architecture](docs/ARCHITECTURE.md#stack-decision).

## Proposed behavior

- Accept signed `orders/create` deliveries and persist one order per shop and Shopify order ID.
- Record delivery IDs and orders in the same database transaction. A retry cannot count an order twice.
- Verify webhooks through Shopify's SDK without refreshing access tokens. Retry incomplete shop registration instead of silently dropping the order.
- Show received-order count, COD count, COD percentage, order value by currency, and the latest 20 orders for the signed-in shop.
- Delete the shop's orders, delivery receipts, installation record, and Shopify sessions on `app/uninstalled`.
- Start with an honest empty state. Existing store orders are not automatically imported.

## COD rule

Normalize payment gateway names by trimming and lowercasing. An order is COD when **any gateway contains `cash`**, or when **`financial_status` is `pending` and a gateway is exactly `manual`**. A pending card payment alone is not COD. This deliberately follows the assignment's heuristic; some manual pending payments can be bank transfers, and a gateway name containing `cash` can produce a false positive. This is classification, not confirmation that cash was collected.

## Setup and running

There are no install or run scripts yet. During implementation, this section must become a verified two-minute setup guide covering the development store, minimum `read_orders` scope, development customer-data access, local environment variables, database initialization, and `shopify app dev`.

The intended post-implementation commands are `npm ci`, the documented database setup command, and `npm run dev`. They must be verified against the generated project before they are presented as working instructions. No production deployment is required.

Read-only tooling checks on 2026-09-22 found Node `22.22.1`, npm `10.9.4`, and Shopify CLI `4.8.0` on the development machine. Dependency versions will be recorded by the implementation lockfile, not copied blindly from a moving upstream template.

## Actual time spent

Planning and setup count toward the assignment budget; estimates are not actual time. The first instrumented timestamp for this planning session is **2026-09-22 13:45:12 Asia/Jerusalem**. Initial assignment reading and environment inspection happened before that timestamp and were not timed, so the measured interval below is a lower bound, not a complete assignment total.

| Activity | Actual elapsed time | Evidence/status |
| --- | --- | --- |
| Initial reading and inspection before 13:45:12 | Unmeasured | Must be added by the candidate if known |
| Instrumented planning and repository setup | 11 minutes 38 seconds through final content review | 13:45:12 to 13:56:50 Asia/Jerusalem; final commit/push overhead excluded |
| Follow-up planning audit and corrections | 5 minutes 15 seconds through final content review | 13:59:26 to 14:04:41 Asia/Jerusalem; final commit/push overhead excluded |
| Application implementation | 0 minutes | Not started |
| Store setup, installation, and live demo | 0 minutes in this project session | Not performed |
| Builds and tests | 0 minutes | Not performed |

For subsequent work, record actual start/end times, breaks, and outcomes here. Do not restart the assignment clock when implementation begins. The target is 4.5 hours total, with a 5.5-hour hard cap, subject to the earlier submission deadline.

## Deliberate limits and next steps

This is a local development-store exercise. The proposed first version omits historical imports, `orders/updated`, refunds, cancellation adjustments, automatic tagging, background queues, deployment, and App Store distribution. It shows a snapshot of accepted create events, not an accounting ledger. Currency totals remain separate; there is no exchange-rate conversion.

With more time: PostgreSQL, a durable delivery queue, reconciliation against Shopify, lifecycle handling across reinstall generations, privacy workflows for distribution, retention controls, and measured load testing. See the design for the trade-offs and prerequisites. Compliance webhooks are not claimed as implemented, and a public source repository is not an App Store release.
