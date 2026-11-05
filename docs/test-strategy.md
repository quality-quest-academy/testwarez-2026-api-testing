# Test strategy and CI

## What

The suite uses several kinds of evidence instead of treating all green requests
as equivalent. Most business assertions live below the browser.

| Level / command | Real components and controlled state | Proves / does not prove |
| --- | --- | --- |
| `test:unit` | Pure functions, schema tooling, low-level SQLite modules; Vitest | Calculation/cart/persistence units, not HTTP behavior |
| `test:api` | One API with private stores and local HTTP doubles; Playwright | Business rules, private-write counts, dependency calls; not real cross-service wiring |
| `test:integration` | Real Products + Orders, separate fresh SQLite files, HTTP mock NBP | Checkout and stale-cart rejection/reconfirmation across HTTP; not containers |
| `test:contract:examples` | Real private APIs; valid/conflict bodies and mutated response copies | Selected schema diagnostics; not complete status or business coverage |
| `test:contract` | Above plus separate pinned Schemathesis CLI | Bounded generated HTTP conformance; not exhaustive inputs, sequences or consumer-driven contracts |
| `test:e2e` | One Chromium journey, real UI/APIs, private files, mock NBP | Cart reload, explicit conflict review, authoritative confirmation; not a broad browser matrix |
| `test:compose:system` | Published container HTTP, new projects/volumes per scenario | Container readiness, dependency/proxy/FX wiring; not private row/call counts |

## Why: five decisions

| Decision | Readable example |
| --- | --- |
| Exploration versus regression | [Bruno requests](../bruno/) versus [Orders assertions](../tests/api/orders.spec.ts) |
| Tests as code | [Backend checkout](../tests/integration/checkout.spec.ts), fixtures and explicit literal expected amounts |
| Contracts | [Valid and deliberately broken bodies](../tests/contract/responses.spec.ts), including a real `OFFER_CHANGED` response |
| Data and environments | [Private backend fixture](../tests/helpers/backend.ts) versus [container-only fixtures](../tests/compose/fixtures.ts) |
| CI feedback | [Four required groups](../.github/workflows/ci.yaml), readable summaries and scoped failure artifacts |

Fixtures own resource acquisition and reverse-order cleanup, attempting every
release even after failure. [Lifecycle probes](../tests/api/resource-lifecycle.spec.ts)
exercise real listeners/files. The small [shop page object](../tests/e2e/pages/shop-page.ts)
owns UI actions/locators; assertions remain in the shared
[browser scenario](../tests/scenarios/browser-checkout.ts), reused locally and in Compose.

## How to run

After the [README prerequisites](../README.md#run-the-tests):

```sh
npm run test:api
npm run test:integration
npm run test:contract:examples
```

Choose a command from the table for focused feedback. `npm test` selects units,
API and local integration only. **`npm run check` plus `npm run test:contract`**
is the complete Docker-free local gate. These selections create/close their own
fixtures, never use developer volumes or live NBP, and need no manual reset.
Run selections sequentially: local Playwright commands share an output directory.

### Compose system checks

With Docker running and ports **3001–3003 and 5173 free**, from PowerShell:

```powershell
$env:CI_IMAGE_TAG = 'local-' + [guid]::NewGuid().ToString('N')
npm run test:compose:build
npm run test:compose:failures
npm run test:compose:system
# Manifest-scoped fallback, including after interruption:
npm run test:compose:cleanup
Remove-Item Env:CI_IMAGE_TAG
```

On POSIX shells use `export CI_IMAGE_TAG=local-$(date +%s)-$$` and
`unset CI_IMAGE_TAG`. Use a new lowercase tag per run. Never overlap stacks:
project names isolate resources, **not fixed host ports**.

The orchestrator rejects pre-existing project resources. Images build once;
three backend scenarios and the shared browser journey each get new volumes.
Tests target the frontend container's published API forwarding paths (FX goes
directly to the mock). Missing target configuration fails: there is no fallback
to local app factories. Commands explicitly use `.env.example`, not `.env`.

The failure probes verify a specific browser assertion failure and partial
startup with Orders exit 42. They pass only when the intended failure,
diagnostics and successful removal are recorded—not when business tests fail
unexpectedly. Diagnostics precede project-scoped teardown; fallback cleanup is
reported separately. No global Docker prune or developer-volume deletion occurs.
Runner loss/forced termination cannot guarantee in-process cleanup or upload.

## CI feedback and diagnostics

Every PR and main push runs all four blocking groups, with no path filters:
**Static** (lint/types/UI build), **Isolated** (units/API/local integration),
**Contracts**, and **Compose system** (including the browser).

- Open the run's job summary, then the failing step and scoped artifact:
  `isolated-results`, `contract-results` or `compose-results` (seven-day retention).
  Static has logs/outcomes, not a runtime-test artifact. A missing report is not a pass.
- Contract orchestration tests, Schemathesis operation cases and generated
  requests are different measures; do not add them into one test count.
- Browser traces/screenshots and Compose logs help distinguish assertions from
  startup/cleanup failures. Open a trace with `npx playwright show-trace <trace.zip>`.
- Bounded health-driven readiness, pre-downloaded tools, fresh stores and serial
  Compose runs avoid shared-state failures. There are no blanket retries.
- `CI=true` rejects focused tests in Playwright and Vitest; Compose always rejects
  them. Download caches never contain mutable test state.

The [desired main rules](../.github/main-ruleset.json) require an up-to-date PR,
all four GitHub Actions checks, no force push/deletion and no routine admin bypass.
The JSON does not apply itself; rule administration needs separate owner approval.
Actions uses disposable hosted runners, read-only contents permission, no persisted
checkout credentials and no personal secrets or privileged PR-target workflow.

Historical examples: a [green main run](https://github.com/quality-quest-academy/testwarez-2026-api-testing/actions/runs/41875593189)
and a [deliberately wrong-total PR](https://github.com/quality-quest-academy/testwarez-2026-api-testing/pull/2)
that was blocked by Compose system. These are dated evidence, not current-head
results; artifacts alone never establish check success. Use the current PR checks.

### Known runtime caveat

Windows/Node 24.11.1 has printed `UV_HANDLE_CLOSING` after passing parallel
integration assertions with exit 0. A one-worker diagnostic was clean:
`npm run test:integration -- --workers=1`. Related
[Node issue 56645](https://github.com/nodejs/node/issues/56645) is not a proven root
cause. Do not interpret exit 0 as clean shutdown or hide the symptom with retries.

## Strategy checklist

- [ ] Name the risk and the cheapest level that can detect it.
- [ ] State which components are real and which are doubled.
- [ ] Own data, keys and teardown; avoid required ordering between independent tests.
- [ ] Assert business outcomes with independent oracles, not production calculations.
- [ ] Keep schema, business, browser and container evidence distinct.
- [ ] Read failure artifacts and actual check conclusions; never bypass a red gate.
- [ ] State limits: mock NBP is not live compatibility, stock checks are not
  reservation, and sequential retries are not concurrency guarantees.
