# Demo and technical review

## Before the call

Use the installed development store and keep `shopify app dev` running with the current tunnel. Check authentication, subscription destination, COD payment method, dashboard refresh, and a clean application build ahead of time. Do not begin the interview by upgrading dependencies or creating a Partner account.

Prepare one real COD order path and one fabricated signed delivery fixture. Keep secrets and any real capture local. Know whether metrics already contain previous orders so the expected deltas are clear. Make the repository's actual time log and limitations easy to find.

The live store steps below are not done. A local fallback was run: the same fabricated signed body was posted twice to a local server, both responses were 200, and one COD order remained. Say that clearly if the tunnel is down. It is not proof of an embedded Shopify install.

## Fifteen-minute agenda

| Time | Demonstration | What it proves |
| --- | --- | --- |
| 0:00 to 1:00 | Explain the app and current metric baseline | Clear scope: received order snapshots and COD heuristic |
| 1:00 to 4:00 | Create a real order with the manual COD method; observe delivery; refresh the embedded page | Shopify installation, authentic webhook, storage, and UI work together |
| 4:00 to 6:00 | Replay one signed delivery twice with the exact same webhook ID | Count/value stay unchanged; idempotency is visible |
| 6:00 to 9:00 | Walk through raw request verification and the receipt/order transaction | Signature check precedes trust; acknowledgement follows durable work |
| 9:00 to 11:00 | Show data model, scoped loader, and uninstall cleanup | Ownership, exact money, query bounds, and lifecycle behavior |
| 11:00 to 13:00 | Show focused test sources and their actual execution status; explain error paths | Honest verification and reasoning about failures |
| 13:00 to 15:00 | Discuss 10,000 merchants, deliberate omissions, and actual time | Appropriate trade-offs under the task's constraints |

Avoid a live uninstall in the middle of the order demonstration. If showing cleanup live, place it at the end and allow for reinstallation only if needed. Saved, redacted evidence of an earlier cleanup check is a useful fallback but should be labeled as such.

## Exact replay method

Preferred preparation is a small local utility that reads the app secret from environment, uses fabricated payload bytes, and accepts a fixed shop/topic/webhook ID. It signs the payload with Node's built-in HMAC implementation and sends the same request twice. It must not expose a signing endpoint in the app or bypass production validation. This utility is a delivery/demo tool, separate from the fixed-signature unit test.

Requirements for the utility:

- Require an explicit known development shop and destination URL; no production default.
- Check the destination against the expected current dev tunnel before sending a signed body.
- Keep raw bytes identical; do not parse and reserialize between requests.
- Set `Content-Type: application/json` and the same `X-Shopify-Webhook-Id`, HMAC, shop, API version, and topic headers on both sends.
- Use a fixed fabricated order identity, not a real customer's payload.
- Print status, duration, and ID only. Never print the secret or signature.
- Before a second run, either intentionally demonstrate another replay or choose a fresh event and order ID with clear expected results. Do not use a demo "reset database" button.

The CLI's `shopify app webhook trigger` is useful for sending synthetic events, but separate invocations may have different delivery IDs. An unchanged order count in that case can prove business-key deduplication while failing to exercise receipt-ID deduplication. Explain the distinction.

## Code walkthrough notes

**Why raw bytes matter:** the signature is computed from the received body. Parsing JSON and printing it again can change spaces, key order, and escaping. The logical object can look identical while its signature changes.

**Why the receipt and order share a transaction:** if the process crashes after saving the receipt but before saving the order, a separate receipt write would make retries skip missing work. One commit makes both durable together or neither.

**Why two uniqueness constraints:** delivery identity prevents repeating the same delivery; `(shop, orderId)` prevents two different delivery IDs from creating the same business order twice.

**Why await a short transaction:** there is no slow business work here. Returning 200 before an in-memory task finishes risks permanent loss after a crash. If processing becomes slow, introduce a durable queue and acknowledge durable enqueue.

**Why use the lower-level Shopify webhook validator:** the convenient template helper may refresh a token before returning. Order storage and uninstall cleanup do not need an Admin API token, so the official signature/header validator is sufficient. It also lets cleanup work after the token is revoked. This is reuse of Shopify's validation code, not custom cryptography.

**Why the dashboard refreshes explicitly:** a webhook changes the database, not an already-open browser. Refresh fetches a new authenticated snapshot without adding a second push-notification system.

**Why totals are separate by currency:** `USD 10` plus `EUR 10` is not a meaningful `20` without an exchange-rate policy. Integer minor units avoid binary floating-point money errors.

**Why not use every preferred package:** the official template already supplies the necessary application server and Shopify integration. The single read-only page has no shared mutable state requiring MobX, and Polaris supplies its visual system. If NestJS is selected, be prepared to justify the additional authentication/session plumbing.

## Likely questions

| Question | Answer to support with code |
| --- | --- |
| What if two copies arrive at once? | Database uniqueness and one transaction decide the winner, not a prior in-memory check |
| What if the database is unavailable? | Do not acknowledge lost work; return failure for Shopify retry and log a safe diagnostic |
| Can an unknown shop send orders? | A valid signature cannot create an installation. Ignore shops with neither registry entry nor session; retry incomplete registration when an offline session exists |
| What if the signature has the wrong length? | SDK validation rejects it safely; explain the actual comparison implementation of the installed version |
| What if the SDK session is gone at uninstall? | The selected validator does not load or refresh sessions; cleanup uses its validated shop context and works with missing or revoked tokens |
| Does a manual pending payment always mean cash? | No. It is the assignment's explicit heuristic and can misclassify other manual payments |
| Do the numbers update after refunds or cancellation? | Not in the create-only baseline; that is documented scope, not silently correct accounting |
| What prevents data leaking between merchants? | Authenticated server shop identity, mandatory scoped queries, compound keys, and isolation cases |
| Are all webhooks guaranteed to arrive? | No. Production needs reconciliation and observed delivery/error metrics |
| What happens after uninstall and reinstall? | Ordinary cleanup and late-order rejection are covered; delayed lifecycle events across generations require additional production design |

## For 10,000 merchants

Ask about actual order rate, burst shape, payload size, retention, and acceptable dashboard freshness before choosing infrastructure. A reasonable evolution is PostgreSQL plus durable intake and workers, with per-shop idempotency and fairness, reconciliation jobs, lifecycle-aware deletion, and observable retry/dead-letter handling. Add aggregate rollups based on measured query costs. Avoid promising that merely switching databases makes the system production-ready.

## Fallbacks and honest wording

If a tunnel or store is unavailable, show a local signed synthetic delivery and clearly state that the live Shopify path is currently unavailable. If tests were written but not executed, say so. If time ran out, identify the exact missing acceptance item. Never describe a mock, source walkthrough, or build as proof of a live end-to-end event.

The follow-up technical discussion is expected to add approximately ten minutes of Q&A. Keep the main demonstration within fifteen minutes so that discussion time remains useful.
