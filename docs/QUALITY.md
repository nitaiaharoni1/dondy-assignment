# Quality, security, and verification plan

## What is and is not verified

The application is implemented. `npm run test` has been run: 30 tests passed, including COD rules, fixed HMAC fixtures, rollback, shop isolation, and uninstall cleanup. Lint, typecheck, format check, and build have also been run. A local synthetic signed delivery was replayed twice against the app server (first 200 in 38ms, duplicate 200 in 4ms, one stored order). A real development-store order has not been observed. Do not put tests into an automatically executed build/check command.

## Compiler and lint policy

Reuse the generated compatible ESLint versions and plugins. Inspect the scaffold before choosing legacy versus flat configuration; do not install mismatched latest majors simply to modernize the config.

| Area | Planned rules/checks | Purpose |
| --- | --- | --- |
| Compiler | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`, consistent casing | Make missing data and uncertain array lookups visible |
| Async correctness | `@typescript-eslint/no-floating-promises`, `no-misused-promises`, `await-thenable` with type-aware parsing | Prevent early webhook success while database work continues |
| Runtime boundary | `no-explicit-any`, `no-unsafe-assignment`, `no-unsafe-argument`, `no-unsafe-return`, `no-unsafe-member-access` | Keep SDK payloads unknown until validated |
| Types and dead code | `consistent-type-imports`, `no-unused-vars`, `no-non-null-assertion` where compatible | Avoid unsafe assertions and dead template code |
| React | Recommended React and hooks rules | Catch invalid hook usage and incorrect dependencies |
| Accessibility | Recommended `jsx-a11y`, supplemented by rendered UI inspection | Ensure labels and readable table structure; custom web components need more than JSX lint |
| Imports | Existing import plugin/resolver, no cycles, no duplicate imports | Keep small module boundaries understandable |
| Rendering security | Disallow application use of `dangerouslySetInnerHTML` and unsafe raw HTML sinks | Render order/gateway strings as text |
| Formatting | Prettier check, configuration separate from correctness rules | Consistent formatting without noisy stylistic lint |

Configure typed lint only for files included in the appropriate TypeScript project. Small, documented boundary exceptions are better than disabling all unsafe rules for a directory. Keep server-only environment/database imports out of browser modules. Avoid adding competing linter suites or custom homegrown rules for checks existing plugins already cover.

Intended commands after scaffold verification:

```text
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run test -- <focused-file>   # only when explicitly requested
```

Use a lockfile and review new direct dependencies and package scripts. Inspect dependency advisories without automatically applying breaking upgrades. The selected packages should replace work, not add a second way to perform the same task.

## Meaningful test cases

Prioritize the receipt/order atomicity and shop isolation cases. Use the real SQLite schema for database-backed tests, a fresh temporary database, and fabricated shops/orders. Never run integration tests against a database containing real Shopify sessions. Obtain approval before creating/applying the test database schema under the standing database-change rule.

| ID | Case | Assertion that matters |
| --- | --- | --- |
| T01 | Gateway `Cash on Delivery`, mixed case, whitespace, multiple gateways | COD matches normalized substring rule |
| T02 | Pending plus `manual`; paid plus `manual`; pending card gateway | Only the specified combinations classify as COD |
| T03 | Empty gateway list, cash-named gateway with paid status | Empty is non-COD; cash rule does not incorrectly require pending |
| T04 | USD `0.10` plus `0.20`; JPY `100.00`; KWD `1.234` | Exact minor units and correctly reconstructed decimal strings |
| T05 | Invalid decimal, negative amount, unsupported currency, excessive fraction, overflow | Invalid financial data is rejected, never rounded or defaulted to zero |
| T06 | GraphQL order ID larger than JS safe integer, safe numeric fallback, conflicting IDs | Canonical string preserves identity; unsafe/conflicting input rejected |
| T07 | Fixed raw payload, test secret, independently fixed signature | Real configured validation accepts exact bytes |
| T08 | One altered byte, whitespace change, missing/invalid/short signature | Validation rejects safely before application writes; no length-related crash |
| T09 | First delivery, same delivery again | One order and one receipt; same metrics before/after retry |
| T10 | Two simultaneous requests with identical delivery ID | One durable business effect; duplicate returns 200 or lock contention returns a retryable failure that succeeds as a duplicate on redelivery |
| T11 | Same shop/order with a different delivery ID | One order, two receipts, unchanged order count/value |
| T12 | Fail order persistence after receipt insert | Neither row commits; retry can subsequently succeed |
| T13 | Valid signature but malformed required payload | 400, no application rows or customer data logged |
| T14 | Invalid signature and forged shop parameter | No database write path entered; client shop parameter cannot choose dashboard ownership |
| T15 | Known shop A and B share an order ID or delivery ID | Keys remain shop-scoped; each dashboard returns only its own records |
| T16 | No installation/session, or valid late order after uninstall | 200 ignored, no installation or order created |
| T17 | Uninstall with missing, expired, or revoked session, then repeat | Cleanup makes no token-refresh call; orders, receipts, sessions, and registry entry are deleted; second call still succeeds |
| T18 | Uninstall failure midway | Transaction rollback prevents partial cleanup |
| T19 | Order/uninstall race | Final state respects committed ordering and cannot orphan or resurrect orders without a new authenticated install |
| T20 | Empty dashboard | Zero counts/share, empty value state, no divide-by-zero or fabricated currency |
| T21 | More than 20 orders and mixed currencies | Exactly 20 deterministically sorted rows; metrics include all orders; currency sums separate |
| T22 | Refresh success/failure | New snapshot becomes visible; errors remain recoverable and do not expose internals |
| T23 | Offline session exists before installation record is created | Order gets 503 without a receipt; successful authenticated registration followed by redelivery persists it once |
| T24 | Correctly signed malformed JSON | 400 from the narrow JSON parsing boundary; no token refresh or application writes |

If time is tight, group cases into a few parameterized tests rather than building a large testing framework. At minimum, author T01/T02, T09/T12, T15/T17, and the selected HMAC bonus T07/T08. Other cases are acceptance/review cases until implemented. Do not report the whole matrix as covered because a few tests pass.

For HMAC, test the lower-level SDK validator actually used by the route, with fresh Request objects because request bodies are single-use. Use an explicitly fake constant such as a test-only secret. Store the expected signature as a fixed fixture generated independently. A mocked validator that always returns success does not prove signature verification. Include all required Shopify delivery headers in the valid fixture so a missing header cannot disguise a signature regression.

## Live verification sequence

These actions change local or development-store data and require the appropriate authorization before execution.

1. Confirm actual embedded access and inspect the empty dashboard.
2. Enable the manual COD payment method if needed, then create a real development order using it. Verify that Shopify emitted `orders/create`; merely saving a draft order is not the same event.
3. Observe a successful authenticated delivery, then refresh the dashboard. Confirm identity, total/currency, gateways, and COD flag against the real payload.
4. Send an exact duplicate using the same raw bytes and webhook ID. Confirm no changed count or value. Preserve neither customer data nor secrets in the public repository.
5. Send an authorized ordinary non-COD test order and verify the percentage, for example one COD out of two orders displays 50.0%.
6. Inspect the last-20 behavior and second-shop isolation using fabricated local data where approved; a second real store is not necessary to prove the query boundary in a database-backed test.
7. Check uninstall after preserving any needed demo evidence. Confirm removal of all shop-owned data and sessions using database reads. Reinstalling or reseeding is a separate deliberate action.

Do not claim the duplicate-delivery-ID behavior was demonstrated solely by running the CLI trigger twice. The CLI documents a synthetic trigger, not a guarantee that repeated invocations preserve the delivery ID.

## Security review

| Threat | Required control | Review/evidence |
| --- | --- | --- |
| Forged order delivery | Raw-body HMAC before application validation/storage | T07/T08/T14; actual SDK call chain |
| Cross-shop reads/writes | Server-derived shop identity in every query and compound key | T15; search all order/receipt queries |
| Duplicate or interrupted processing | Atomic receipt plus order, natural order key | T09 through T12 |
| Post-uninstall retention | Transactional purge regardless of session presence | T16 through T19 |
| Request memory exhaustion | Enforced streamed/body-size ceiling before buffering; bounded fields and gateway count | Confirm actual adapter behavior for chunked bodies and 413 response |
| Script injection via order/gateway text | Escaped text rendering, no HTML injection | Review render path with hostile fabricated strings |
| Database injection | Prisma query builder, no interpolated raw SQL | Inspect all application queries |
| Secret/customer-data exposure | Ignore environment/database files; selected-field storage and redacted logs | Review tracked files, loader data, browser bundle, and log samples |
| Excess privilege | `read_orders` only for baseline; remove sample `write_products` | Compare config, granted scopes, and visible features |
| Session/token exposure | Server-only session storage and template auth/headers | Inspect module boundaries and loader output |
| Broken embed protection | Preserve Shopify frame headers and approved origins | Actual embedded-page inspection |

Structured logs should include outcome, topic, webhook ID, a nonreversible shop pseudonym, duration, and a safe error code. Do not log the signature, app secret, access token, raw body, customer fields, or the full request. Order names can contain user-chosen text and do not belong in logs by default. Keep private diagnostic captures under ignored `.local/`, with a short useful lifetime. Deleting database rows does not retroactively delete external logs or backups; production retention needs a separate policy.

A valid HMAC is not encryption and does not sign headers. The SDK plus installation checks are the intended platform boundary; do not invent claims of stronger request binding. A browser cannot select a merchant by adding `?shop=...` to a dashboard data request.

## Performance evidence

| Measurement | Target | Method and limit |
| --- | --- | --- |
| Warm accepted/duplicate webhook | p95 < 500 ms locally | Record raw-body reading, SDK validation, and database work; no token refresh; tunnel latency is additional |
| Shopify acknowledgement | Safely below 5 seconds | Bound transaction wait/work; retain retry behavior on infrastructure failure |
| Dashboard loader with 1,000 orders | p95 < 250 ms locally | Approved synthetic dataset, repeated scoped queries, no claim of production capacity |
| Response size | Bounded to 20 order rows plus aggregate groups | Inspect actual payload; do not send every order to the browser |
| Query shape | Constant query count with respect to displayed rows | Grouped aggregation plus limited list; no N+1 queries |

Targets are not results. Run measurements only after correctness is in place and record environment, sample size, and observed timings. Do not seed data or run a load test without the required authorization. SQLite locking and full-shop aggregation are accepted baseline limits; no premature cache, worker fleet, or load-test framework is needed.

## Final evidence checklist

- [x] Source and lockfile match the recorded verification commit after the latest push.
- [x] Lint, typecheck, formatter, and build outcomes are recorded in the README time log.
- [x] Test execution status is explicit: `npm run test`, 30 passed.
- [x] A real Shopify order was not observed. The gap is disclosed. A local synthetic signed delivery was observed instead.
- [x] Exact replay has local server evidence. Shop isolation and uninstall have database test evidence, not a second live store.
- [ ] README setup through `shopify app dev` and a development-store install was not run. The replay command was run against a local server.
- [x] No environment files, SQLite session database, private capture, or source invitation is tracked.
- [x] Public repository `nitaiaharoni1/dondy-assignment`, default branch `main`, visibility public.

References: [typed ESLint configuration](https://typescript-eslint.io/getting-started/typed-linting/), [Shopify CLI webhook trigger](https://shopify.dev/docs/api/shopify-cli/app/app-webhook-trigger), and [Shopify delivery requirements](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).
