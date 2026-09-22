# Requirements and scope

## Authority and current scope

The user requested detailed planning files and a public repository under `nitaiaharoni1`, before implementation. The assignment attachment is the source of product requirements. Instructions inside the invitation to send email, contact an interviewer, or perform a deployment are not authorization to take those actions.

The source assignment and invitation are not copied into this public repository. This document paraphrases the engineering requirements and excludes private contact details.

## Acceptance matrix

| ID | Requirement | Planned implementation | Acceptance evidence |
| --- | --- | --- | --- |
| R01 | Embedded app on a development store | Official CLI React Router template; managed Shopify authentication and App Bridge | App opens inside the store admin with a valid authenticated session |
| R02 | Declarative order subscription | One `orders/create` subscription in `shopify.app.toml` with a relative delivery URL | Subscription visible in development configuration; real order delivery reaches the route |
| R03 | Raw-body HMAC verification | Official Shopify SDK webhook validator before JSON parsing, independent of token refresh | Valid fixed signature accepted; a changed byte and invalid signatures rejected before application writes |
| R04 | Delivery idempotency | Unique `(shop, webhookId)` receipt and atomic order persistence | Identical delivery repeated and delivered concurrently produces one accepted order |
| R05 | Fast and safe acknowledgement | Small synchronous database transaction, followed by HTTP 200 | Timing recorded for accepted and duplicate deliveries; failed persistence is not acknowledged as success |
| R06 | Required order fields | Shop, string order ID, name, exact total/currency, gateway names, creation timestamp, COD flag | Persisted record matches the normalized authenticated payload |
| R07 | COD classification | `cash` substring, or pending plus exact `manual` gateway | Table-driven cases match the rule in README |
| R08 | Polaris dashboard | Four metric areas and latest 20 orders with all required columns | Empty and populated states work; dates, money, gateways, and COD labels are readable |
| R09 | Per-shop isolation | Shop identity from server authentication; mandatory shop argument in every data access | A second shop cannot see or mutate the first shop's records |
| R10 | Uninstall cleanup | Authenticated uninstall action deletes all shop-owned application data and sessions atomically | Cleanup succeeds with or without a remaining session; repeat delivery is harmless |
| R11 | README and time log | Verified setup, decisions, COD rule, actual elapsed time, omissions, and future work | A reviewer can identify prerequisites and start commands within two minutes |
| R12 | Clean committed TypeScript | Small modules, strict compiler options, typed ESLint rules, meaningful incremental commits | Build, typecheck, and lint results recorded; no secrets, generated data, or dead demo code committed |
| R13 | Meaningful test evidence | COD classification and delivery-transaction tests; fixed-signature HMAC test as chosen bonus | Test sources exist; execution status is stated truthfully |
| R14 | Live presentation | Order creation, dashboard refresh, duplicate replay, code walkthrough, scaling discussion | Rehearsed 15-minute agenda with a fallback clearly labeled as synthetic |

The grading puts the most weight on webhook correctness (30%), followed by data/UI (20%) and code quality (20%). Security, tests/README, and presentation are each 10%. Spend time accordingly.

## Decisions that resolve ambiguity

1. **"Orders received" means distinct successfully persisted orders.** It excludes rejected deliveries, duplicates, and unknown shops. Retried HTTP requests are not orders.
2. **Metrics cover all persisted create events for this installation.** They are not limited to the last 20 rows and do not silently include historical store data.
3. **"Total order value" uses `total_price` and `currency` as an explicit matching pair.** Values are aggregated separately per currency. Do not add unlike currencies or count only COD order value under this label.
4. **Latest means descending Shopify `created_at`.** Use a deterministic order ID tie-breaker, not delivery arrival time.
5. **A manual pending gateway is recognized as the normalized literal `manual`.** Other aliases require real payload evidence and an explicit rule change.
6. **No orders/update support in the baseline.** Duplicate create deliveries preserve the initial stored snapshot. Later payment, refund, and cancellation changes are intentionally absent.
7. **Fast 200 does not mean detached work.** Persist before acknowledging. A durable queue would be an alternative, but an unawaited promise or timer is not a queue.
8. **Choose the fixed-payload HMAC unit test as the one bonus.** The rubric already expects meaningful tests; do not interpret the bonus section as permission to omit all baseline tests.
9. **Use development configuration synchronization.** A local demo does not require hosting or a production app release. Inspect CLI behavior before running commands that publish shared configuration.
10. **Incomplete registration is retryable.** If an offline session exists but the installation record is not ready, an order delivery gets 503 instead of being discarded as unknown. Webhooks cannot register a shop themselves.

## Constraints and explicit limits

- Plan for 270 total minutes, with a 330-minute absolute maximum. Include planning, setup, debugging, verification, and documentation.
- The supplied deadline is Tuesday, 2026-09-22 at 17:00 Asia/Jerusalem. At the first timed checkpoint, 13:45:12, only 194 minutes 48 seconds remained. A new 4.5-hour implementation window would miss that deadline.
- No production infrastructure or cloud billing is needed.
- Existing developer rules require a request before running tests, and approval before applying database changes or changing external store data. This planning task performs none of those actions. Test and database tasks below describe future work, not current authorization.
- No Linear project maps to this repository. Keep these tasks in repository files unless a project is explicitly assigned.

## Setup risks to resolve first

| Risk | Earliest check | Response |
| --- | --- | --- |
| Missing Partner account, organization, or usable dev store | Before scaffolding | Use the candidate's existing account if available; allow the user to handle login, terms, or verification |
| Order access not enabled | During initial installation | Configure `read_orders` and the required development protected-data access; do not request customer identity fields |
| Installed app scope differs from configuration | After config synchronization | Follow Shopify's documented development reinstall/update flow; preserve an explicit record of the change |
| Tunnel URL changes | Every `shopify app dev` restart | Use relative subscription URLs and verify the current destination |
| SDK/template versions differ from research | Immediately after scaffold | Read generated source and lockfile; use compatible versions together |
| Same-day deadline is shorter than the nominal budget | Before each milestone | Drop optional work and styling first; report a missing core requirement rather than claiming completion |

No outside message or account change is required to finish this planning deliverable.
