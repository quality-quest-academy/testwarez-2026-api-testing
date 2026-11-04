# Test-quality audit (KAN-18)

## Scope and assessment

Reviewed the committed baseline `4e0d41c`: five unit files, four isolated API
files, the targeted/generated contract suites, backend integration, the single
browser journey, shared scenarios and their fixtures. Compose HTTP/browser
assertions were reviewed too; pipeline configuration and orchestration are outside
this change. The branch was subsequently rebased onto merged KAN-22 (`6fa9461`).
The purpose is a readable educational example, not a
general test framework or exhaustive production-hardening exercise.

| Area | Assessment and concrete examples |
| --- | --- |
| Assertions | Strong: `tests/api/orders.spec.ts` checks exact totals, replay body/Location, dependency calls and private write counts; `tests/unit/orders-database.test.ts` simulates key-insert failure to prove rollback. These checks remain explicit. |
| AAA/readability | Products health/catalog/resolution and the first frontend-cart unit mixed independent behaviours. They are now focused scenarios; invalid Orders inputs have individual names. Conflict/reconfirm, restart/history and sequential replay remain deliberate multi-step journeys. |
| Isolation/order | Private stores, ephemeral loopback ports and test-scoped data avoid shared mutation. Repeated IDs/keys are safe across independent tests. Static review found no required business-test ordering; this is not fresh execution evidence. |
| Ownership | Startup helpers could fail before returning cleanup; some teardown loops stopped on the first close error. Fixtures now register ownership as resources are acquired and attempt all cleanup in reverse order. |
| Test boundaries | Vitest covers units/schema tooling and low-level SQLite modules, not HTTP APIs. Playwright covers API/integration/browser and CLI orchestration; Schemathesis supplies bounded generated HTTP conformance checks. Mock NBP is not live-provider evidence. |
| Determinism | Controlled local dependencies, fixed illustrative rates, fresh data and zero runner retries are retained. The NBP delay tests timeout behaviour; the CLI watchdog is a time bound, not a synchronization sleep. |

## Implemented structure and fixes

- `tests/api/fixtures/` owns API startup, HTTP doubles and restarts. Test files
  contain scenarios/data/assertions, not service implementations or repeated
  lifecycle `try/finally`. The health fixture injects counted, rejecting fetch
  functions rather than relying on developer/live dependency defaults.
- `tests/helpers/resources.ts` contains the small shared ownership mechanism:
  setup/action resolves only on success, releases are awaited sequentially in
  reverse acquisition order, every cleanup is attempted, and labelled failures
  include directory deletion. A setup/action failure remains the cause/first
  error if cleanup also fails. Playwright separately records body assertion
  failures; fixture `use()` is not assumed to throw the body failure back.
- `tests/unit/resources.test.ts` specifies reverse-order cleanup, synchronous and
  asynchronous release errors, partial acquisition failure, original-error
  preservation, cleanup-only failure and successful return. These are pure unit
  examples using callbacks, not HTTP tests or proof of real resource release.
- `tests/api/resource-lifecycle.spec.ts` complements those units with real
  file-backed SQLite and loopback listeners. Controlled later-setup and HTTP
  assertion failures must preserve the original error, close the connection and
  listener, and delete the private directory. Expected failures are asserted as
  outcomes; an unexpected success or a different failure fails the test.
- `tests/helpers/backend.ts` explicitly starts real Products/Orders with separate
  private SQLite files and mock NBP for local integration/browser fixtures.
  Compose fixtures do not use it and cannot fall back to local apps.
- `tests/e2e/pages/shop-page.ts` is the one-screen Page Object Model. It owns
  locators/user actions, not API mutations, totals, traffic observation or the
  complete journey. Both local and Compose browser entry points reuse the same
  scenario. Business assertions stay in `tests/scenarios/browser-checkout.ts`.
- Browser shutdown uses Vite's `PreviewServer.close()`, rather than closing only
  its underlying HTTP server. Compose browser HTTP evidence is fixture-owned so
  diagnostics are still attempted on assertion failure, without a test-body
  `finally` that can replace the original failure.
- `tests/helpers/orders-assertions.ts` shares the private-store count assertion;
  unit database fixtures and schema-example helpers own their respective setup.
  Expected business amounts remain literal independent oracles, not calculated
  using production code.
- Products persistence now has a changed-offer reopen regression. Fresh SQLite
  schemas explicitly reject fractional stock/version values; prior lower-bound
  checks alone allowed `1.5` despite `INTEGER` column declarations. Existing
  demo databases are not automatically migrated or destroyed; see README reset
  guidance. Database constructors close their connections if initialization fails.
- Schemathesis invocation mechanics live outside the spec, retaining the pinned
  tool, seed, phases, checks, example budget and zero retries. Watchdog expiry is
  named in the output; it is not reported as successful execution.

## Remaining recommendations and limits

1. **Runtime diagnosis:** the documented Windows/Node 24.11.1
   `UV_HANDLE_CLOSING` shutdown assertion reproduced after passing parallel
   integration assertions; the command returned 0. A separate one-worker run was
   clean. This reproduces the pre-existing symptom, not a new business failure
   or proof of clean parallel shutdown. Upstream Node issue 56645 is related
   evidence, not a proven root cause. No sleeps, retries, suppressed stderr,
   default worker changes or runtime-pin changes were used to hide it.
2. **Bounded follow-up:** Schemathesis interruption/descendant-process ownership
   is not solved by killing only its `uvx` launcher. No process-supervision
   framework or CI cancellation changes are introduced here.
3. **Optional teaching improvements:** use differing controlled indicative/final
   FX rates in the existing browser journey to distinguish authority, and add a
   few semantic adapter-response cases. Current equal rates and malformed-response
   examples are representative, not comprehensive demonstrations of those rules.

## Validation evidence

Initial implementation was static-only at the owner's request. After KAN-22
merged, runtime validation was authorized and completed locally on Windows,
Node 24.11.1 / npm 11.6.2, with a private `npm ci` installation in this worktree:

| Command | Observed result |
| --- | --- |
| `npm run check` | Passed: contract lint, root/workspace TypeScript, frontend build, 53 units, 77 isolated API tests (including both real cleanup probes), three integration scenarios, two targeted contract examples and one Chromium journey. Parallel integration printed the known shutdown assertion described above. |
| `npm run test:contract` | Passed four Playwright orchestration/example tests; all five Products and three Orders operations selected; 67 Products and 24 Orders generated cases passed. Generation counts are separate from orchestration counts. |
| `npm run test:integration -- --workers=1 --output test-results/kan18-integration-single` | All three scenarios passed without the shutdown assertion in this diagnostic run. Not an automatic retry or a change to the default gate. |
| `npm run test:compose:build` | Built explicitly tagged images using `CI_IMAGE_TAG=local-kan18-20261104-2309`. |
| `npm run test:compose:failures` | Both probes verified their specific expected failure and successful resource removal; these are not passing business scenarios. |
| `npm run test:compose:system` | All three backend scenarios and the shared POM browser journey passed against fresh containers/volumes. |
| `npm run test:compose:cleanup` | All six manifest-owned projects verified removed again; original and fallback cleanup records each contain zero errors. |
| `git diff --check` | Passed. Refactored scenario files have no helper declarations or lifecycle `try` blocks; KAN-22's separate summary-tooling units are unchanged. |

Compose evidence is scoped under `test-results/compose/`. Browser HTTP evidence
records direct mock FX 200, rejected checkout 409 and explicitly resubmitted
checkout 201. Developer data, volumes, credentials and live NBP were not used.
No new business/fixture/POM regression was observed. Representative failure
cleanup is now exercised with real resources, but forced process termination
and all possible partial-startup positions are not exhaustively covered.

PR/hosted required checks and owner approval remain separate delivery gates;
local passing tests alone do not mark KAN-18 complete.
