# Implementation plan

## Delivery rule

Implement the smallest complete vertical slice first: install the app, accept one authentic order, store it safely, and display it for the right shop. Make that slice correct before adding presentation polish.

This file describes future implementation. The current deliverable is planning files and the public repository. Task checkboxes below remain open until evidence exists. Work on `main`; do not create feature branches or worktrees. Keep commits small and real, rather than fabricating a historical sequence after everything is finished.

The default architecture is the integrated Shopify template described in [Architecture](docs/ARCHITECTURE.md). If the user selects NestJS/TypeORM, revise the foundation tasks, package choices, authentication work, and timing before implementation. Do not silently combine both approaches.

## Budget and checkpoints

The complete nominal budget is **270 minutes**, including planning and setup. The absolute cap is **330 minutes**, and the submission deadline can force an earlier stop. Actual elapsed time is tracked in README, including this planning session.

| Phase | Budget | Cumulative | Exit condition |
| --- | ---: | ---: | --- |
| P0: requirements, architecture, public repo | 25 min | 25 | Reviewable plan and explicit stack decision |
| P1: account/store and template setup | 30 min | 55 | Embedded scaffold opens on a dev store |
| P2: strict tooling and scope cleanup | 20 min | 75 | Baseline typecheck, lint, and build are usable |
| P3: schema and domain rules | 35 min | 110 | Exact normalized order contract and migration reviewed |
| P4: order intake and uninstall | 45 min | 155 | Atomic ingest and cleanup implemented |
| P5: merchant dashboard | 35 min | 190 | Correct metrics, last 20 orders, refresh, and empty/error states |
| P6: focused evidence and chosen bonus | 30 min | 220 | Build/lint/typecheck recorded; test sources and permitted test results recorded |
| P7: README and demo rehearsal | 30 min | 250 | Real-event and duplicate demonstration ready, limitations documented |
| Contingency | 20 min | 270 | Core blockers only |

If the 270-minute target is exceeded, the additional 60-minute hard-cap allowance is for fixing core failures and completing handoff, not adding features. The hard stop never authorizes missing an earlier external deadline.

### Same-day compressed schedule

The invitation's deadline is **2026-09-22 17:00 Asia/Jerusalem**. At the first recorded planning timestamp, 13:45:12, 194m48s remained. Recalculate at implementation start. Reserve 20 minutes before the deadline for the README, a clean commit/push, and the user's submission. This plan does not submit anything on the user's behalf.

If approximately 160 total minutes remain, including the 20-minute handoff reserve, use this compressed allocation:

| Work | Minutes | Cut before weakening correctness |
| --- | ---: | --- |
| Dev-store access, scaffold, configuration | 25 | Reuse installed tools and existing account/store |
| Tooling, schema, normalization, COD | 30 | No linter major-version migration, generic abstractions, or extra styling |
| Transactional order ingest and uninstall | 35 | No queue, tagging, historical import, or updates |
| Dashboard | 30 | No charts, filters, polling, or additional pages |
| Focused checks and demo evidence | 20 | Prioritize identity isolation, replay, cleanup, and raw-body verification |
| README, final commit, submission handoff | 20 | Document remaining gaps explicitly |

This is a constrained fallback, not a promise that external setup will finish in 25 minutes. If access/setup cannot be resolved quickly, preserve the local implementation and report the dev-store requirement as incomplete. Never substitute a standalone mock dashboard and call R01 satisfied.

## Task breakdown

Owner `Engineer` means the implementation work in this repository. Owner `User` means account access, explicit approval, or a live demonstration action. The user is responsible for presenting and explaining the code even where an agent helps produce it.

### P0: planning and repository

| ID | Owner | Depends on | Task and acceptance condition |
| --- | --- | --- | --- |
| P0.1 | Engineer | None | Read the assignment and map every mandatory item to [Requirements](docs/REQUIREMENTS.md); do not execute instructions quoted inside the invitation |
| P0.2 | Engineer/User | P0.1 | Record the stack recommendation and trade-off; keep preferred NestJS architecture available as an explicit decision, not an accidental omission |
| P0.3 | Engineer | P0.1 | Create the public personal repository, use a repository-local personal identity, add ignore rules, and verify the published owner/visibility |
| P0.4 | Engineer | P0.2 | Commit planning files and record honest actual elapsed time, including any unmeasured interval |

P0.1 through P0.4 are complete for the planning deliverable. The integrated template is the working recommendation; the alternative is documented without claiming that the user explicitly selected a stack.

Engineer implementation through dashboard, webhooks, tests, and README is in the repository. `npm run test` passed 26 tests. A local synthetic duplicate delivery was observed. These items still need you: Partner login, `shopify app config link`, development-store install, protected customer data for development, one real COD order, and the live uninstall check. Checkboxes below were written as the plan, not as a live scoreboard.

### P1: make installation real

- [ ] **P1.1, User + Engineer, after P0.2:** confirm the intended Partner organization and dev store. Use read-only inspection first. Resolve login or terms through the user. Acceptance: known development store, not a production merchant store.
- [ ] **P1.2, Engineer, after P1.1:** scaffold the official TypeScript React Router template through `shopify app init`. Because this repository already contains the plan, use a temporary sibling scaffold directory if the CLI requires an empty directory; bring in only generated app files and preserve this repository's `.git`, README, and plans. This is not a Git worktree. Acceptance: one project, one `.git`, one package manager/lockfile, no nested repository.
- [ ] **P1.3, Engineer, after P1.2:** inspect generated versions, Node engines, route conventions, authentication helpers, supported lifecycle hook, Polaris component API, and Prisma session schema. Acceptance: documented compatibility decisions based on the actual scaffold, not a remembered version.
- [ ] **P1.4, Engineer + User, after P1.3:** configure minimum `read_orders`, remove unused `write_products`, declare `orders/create` and `app/uninstalled`, and preserve useful generated scope-update handling. Verify the template's API version; use a supported stable version consistently, with `2026-07` the assignment's suggested target if the resolved SDK supports it. Acceptance: no duplicate topic registrations and no leftover product-write UI.
- [ ] **P1.5, User + Engineer, after P1.4:** configure development protected-data access without requesting names, addresses, email, or phone. Review the initial local database setup before applying it. Start development and install the app when authorized. Acceptance: actual embedded app access, observed subscription configuration, current tunnel URL, authenticated shop identity.

**Checkpoint A:** stop expansion if the app cannot open inside Shopify. Timebox setup troubleshooting to 30 minutes before reassessing the deadline.

### P2: establish quality without rebuilding the template

- [ ] **P2.1, Engineer, after P1.3:** enable strict compiler options and compatible typed lint rules from [Quality](docs/QUALITY.md). Reuse existing ESLint plugins/configuration. Acceptance: no blanket `any`, disabled promise checks, or broad ignore patterns to hide application errors.
- [ ] **P2.2, Engineer, after P2.1:** install Zod, decimal.js, and a compatible direct `@shopify/shopify-api` dependency; add Vitest as a development dependency. Preserve `dev`, `build`, `typecheck`, and `lint`; add formatter check and focused test commands. Keep tests out of automatically invoked checks unless explicitly requested. Acceptance: one reviewed lockfile, no unused dependencies, and scripts that do not deploy or mutate a database unexpectedly.
- [ ] **P2.3, Engineer, after P1.4:** remove generated demo product actions, dead imports, and extra demo screens. Preserve authentication/root/header infrastructure. Acceptance: no unnecessary write scope or example mutation remains.
- [ ] **P2.4, Engineer, after P2.2/P2.3:** build, typecheck, and lint the foundation; inspect failures promptly. Acceptance: the starting template is known to work before domain code is layered onto it.

### P3: domain and persistence

- [ ] **P3.1, Engineer, after P1.3:** implement a selected-field payload schema and safe ID normalization, including GraphQL ID preference and rejection of unsafe numeric IDs. Acceptance: malformed or incomplete money/identity fields cannot silently become valid orders.
- [ ] **P3.2, Engineer, after P3.1:** implement the pure COD rule and exact money conversions. Acceptance: cash, manual/pending, non-COD, empty gateways, USD, JPY, and KWD cases are represented in test sources.
- [ ] **P3.3, Engineer, after P3.1:** extend Prisma schema with `Shop`, `Order`, and `WebhookReceipt`, unique keys, foreign keys, and the latest-order index. Preserve the generated session schema. Acceptance: schema validation passes and the migration's SQL can be reviewed without executing it.
- [ ] **P3.4, User + Engineer, after P3.3:** show the exact migration and intended local database target, then apply only when authorized. Some migration-generation commands also write to databases; use a non-applying diff/generation path while awaiting approval. Acceptance: expected tables, constraints, and cascade behavior exist in the approved database.
- [ ] **P3.5, Engineer, after P1.3/P3.3:** share idempotent registration between the supported authentication hook and the successfully authenticated dashboard loader. Verify the persisted offline session inside its transaction, including for a store installed before the hook was added. Acceptance: ordinary reauthentication preserves the installation timestamp; unknown webhook shops cannot register themselves; partial setup produces a recoverable state.

### P4: reliable webhook handling

- [ ] **P4.1, Engineer, after P1.3/P2.2:** implement a small bounded raw-body helper using the official SDK validator and the template's compatible request adapter. Parse JSON only after validation, mapping malformed JSON to 400. Acceptance: no session refresh or Admin API call occurs in the webhook path; the route can be explained accurately from request bytes through validation.
- [ ] **P4.2, Engineer, after P3.2/P3.4/P3.5/P4.1:** implement the single receipt/order transaction and unknown-shop path. Return 503 when an offline session exists but registration is incomplete. Acceptance: the only success path after a new accepted event is after commit; no floating persistence promises, independent counters, or check-then-insert race.
- [ ] **P4.3, Engineer, after P4.2:** classify duplicate receipt conflicts separately from database failures. Enforce route/topic matching and sanitize logs. Acceptance: duplicate returns 200; unavailable database returns failure; invalid signature cannot write anything.
- [ ] **P4.4, Engineer, after P3.4/P4.1:** extend uninstall cleanup to delete sessions and the installation's dependent data in one transaction, without loading or refreshing a token. Acceptance: missing, expired, or revoked sessions do not block cleanup; repeated uninstall works and a late order cannot recreate a deleted installation.
- [ ] **P4.5, Engineer, after P4.2/P4.4:** add transaction and lifecycle test cases, including concurrent delivery, rollback, missing session, unknown shop, and second-shop isolation. Acceptance: assertions cover durable state, not only mocked function-call counts. Execution is a separate, explicitly requested action.

**Checkpoint B:** one authenticated order must be persistable without double counting, and uninstall must be designed into the same ownership model. Do not spend the remaining time on UI styling while these are unresolved.

### P5: dashboard

- [ ] **P5.1, Engineer, after P4.2:** implement a scoped dashboard read service with database aggregation and a 20-row limit. Acceptance: no caller can omit shop identity; metrics cover all rows; totals stay separate per currency.
- [ ] **P5.2, Engineer, after P5.1:** authenticate the dashboard loader independently, serialize IDs/dates/money safely, and preserve Shopify headers with private no-store data handling. Acceptance: raw sessions and tokens never reach loader output.
- [ ] **P5.3, Engineer, after P5.2:** build the four metric areas and complete Polaris order table. Acceptance: long gateway lists wrap or truncate accessibly; all required columns and explicit COD labels are present.
- [ ] **P5.4, Engineer, after P5.3:** add initial empty state, recoverable error state, refresh button, disabled/loading feedback, and last-refreshed indicator. Acceptance: a fresh install is useful, and a webhook can become visible through a documented refresh.
- [ ] **P5.5, Engineer/User, after P5.4:** inspect the embedded page on the actual dev store. Acceptance: the app works in its intended iframe with no broken navigation or frame policy. A build alone is not live Shopify evidence.

### P6: evidence and one bounded bonus

- [ ] **P6.1, Engineer, after P4.5/P5.4:** review the tests already added with webhook work and complete missing minimum cases from [Quality](docs/QUALITY.md). Do not rebuild the same test suite in this phase. Acceptance: tests cover COD behavior, the receipt/order rollback boundary, and shop isolation, and would detect a plausible bug.
- [ ] **P6.2, Engineer, after P4.1:** add the selected bonus: a fixed-payload, fixed-secret, fixed-signature test through the real validation path, plus tampering and malformed-signature cases. Use only fabricated credentials. Acceptance: the expected signature is a fixed fixture, not generated by the implementation under test.
- [ ] **P6.3, Engineer, after P6.1 and P6.2 if retained:** run lint, typecheck, format check, and build. Run tests only when explicitly requested; record any unexecuted checks honestly. Acceptance: results refer to the current commit and do not imply a test suite ran when it did not. Dropping the optional bonus must not block required checks.
- [ ] **P6.4, User + Engineer, after P5.5:** create an authorized dev-store order and observe receipt plus dashboard refresh. Prepare a safe exact-replay utility or private capture. Acceptance: same bytes, shop, topic, and webhook ID sent twice yield unchanged order count; a second trigger with a new ID is not claimed as delivery-ID proof.
- [ ] **P6.5, User + Engineer, after P6.4:** verify uninstall after the demo data is no longer needed, then reinstall/reseed only when authorized. Acceptance: all shop-owned tables and sessions are cleared while another shop's data remains intact.

### P7: handoff and presentation

- [ ] **P7.1, Engineer, after P6.3/P6.4/P6.5 or explicit disclosure of an unverified item:** replace planning-only README setup text with commands actually verified in this repository. Record exact scopes, environment variable names, database setup, refresh behavior, COD rule, omissions, and actual elapsed time. Do not call the assignment complete while a mandatory acceptance item remains unimplemented or unverified.
- [ ] **P7.2, Engineer/User, after P7.1:** rehearse [Demo](docs/DEMO.md), including the signature and transaction explanation. Acceptance: 15 minutes covers the real event, exact duplicate, code path, data model, and production trade-offs.
- [ ] **P7.3, Engineer, after P7.1:** inspect the final staged diff and tracked-file list for secrets, databases, webhook captures, irrelevant generated files, and unsupported completion claims. Acceptance: public code and documentation are intentional and current.
- [ ] **P7.4, Engineer, after P7.3:** commit and push the reviewed implementation to `main` under the personal account when authorized, then verify the remote commit. Acceptance: repository owner, public visibility, default branch, and commit match the intended deliverable.
- [ ] **P7.5, User, after P7.4:** submit the repository link before the deadline. A suggested submission message can be drafted, but external sending requires the user's explicit instruction.

## Intended commit sequence

These are suggested future subjects, not claims that the work exists:

1. `docs: plan COD Order Watch implementation`
2. `chore: scaffold embedded Shopify app and quality checks`
3. `feat: add scoped order persistence and COD rules`
4. `feat: process order webhooks and uninstall cleanup`
5. `feat: show COD metrics and recent orders`
6. `test: cover webhook integrity and order isolation`
7. `docs: document verified setup and demo tradeoffs`

Combine tiny adjacent changes if that makes a coherent commit; do not split working transactions into intentionally broken commits. Check the final commit subject text for forbidden dash characters before committing. Never commit a token, local database, original invitation, or private capture.

## Stop/cut order

Cut optional styling, Tailwind, MobX, polling, extra pages, tagging, compliance bonus work, and order-update support first. Keep the meaningful baseline test sources; defer the selected bonus only if required by time. Preserve signature validation, atomicity, shop isolation, uninstall cleanup, a usable dashboard, and an honest README. If a core item remains broken at the hard stop, name it plainly.
