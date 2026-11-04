# Test-quality audit (KAN-18)

## Scope and assessment

Reviewed the committed baseline `4e0d41c`: five unit files, four isolated API
files, the targeted/generated contract suites, backend integration, the single
browser journey, shared scenarios and their fixtures. Compose HTTP/browser
assertions were reviewed too; pipeline configuration and orchestration changes
are deferred to KAN-22. The purpose is a readable educational example, not a
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

1. **Required before completion:** execute the changed suites and verify real
   partial-startup/assertion-failure cleanup (listeners, SQLite and private
   directories), not just callback-level lifecycle units. User requested static
   checks only while another session is running; no services, browser, tests,
   Schemathesis or Compose were started for this implementation.
2. **Runtime diagnosis:** reassess the documented Windows/Node 24.11.1
   `UV_HANDLE_CLOSING` shutdown assertion with focused one-worker and parallel
   runs. Passing business assertions and parent exit 0 do not establish clean
   worker shutdown. Upstream Node issue 56645 is a related symptom report, not a
   proven root cause or proof that this pinned runtime is fixed. Do not hide the
   symptom using sleeps, retries, suppressed stderr or an unapproved pin change.
3. **Bounded follow-up:** Schemathesis interruption/descendant-process ownership
   is not solved by killing only its `uvx` launcher. No process-supervision
   framework or CI cancellation changes are introduced here.
4. **Optional teaching improvements:** use differing controlled indicative/final
   FX rates in the existing browser journey to distinguish authority, and add a
   few semantic adapter-response cases. Current equal rates and malformed-response
   examples are representative, not comprehensive demonstrations of those rules.

## Validation evidence

Only static validation is authorized for this iteration:

- `npm run typecheck` — passed for root tests/tooling and all app/mock workspaces.
- `npm run contracts:lint` — both authored contracts passed.
- `git diff --check` — passed; no helper declarations or lifecycle `try` blocks
  remain in `*.spec.ts` / `*.test.ts` files by static inspection.
- Runtime validation of all added/changed tests remains pending. No claim is made
  that the new fixture lifecycle, POM journey, SQLite regressions or Compose
  diagnostic path has passed execution. KAN-18 is not marked complete.
