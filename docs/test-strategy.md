# Test selection and CI (KAN-15)

## Required feedback

`.github/workflows/ci.yaml` runs for every pull request and push to `main`, without
path filters. All four named jobs are blocking, including the browser journey:

| Check | Selection | Proves / does not prove |
| --- | --- | --- |
| Static | Both OpenAPI specs, all TypeScript, Vite build | Authored contracts and static/build consistency, not running behavior |
| Isolated | Vitest units; Playwright API and existing local integration suites | Business behavior, private-store counts, dependency-call counts; not container wiring |
| Contracts | Targeted valid/broken response examples and full pinned Schemathesis | HTTP/schema conformance with bounded generation, not exhaustive business correctness or consumer-driven contracts |
| Compose system | Three backend scenarios and one shared Chromium journey on real containers | Container startup, ports, proxy/dependency wiring and public HTTP behavior; not private row/call counts or live NBP compatibility |

Choose `npm run test:unit`, `test:api`, `test:integration`, `test:contract:examples`,
`test:contract`, or `test:e2e` for focused local feedback. All these commands remain
Docker-free. `npm run check` plus `npm run test:contract` is the complete local
gate. Vitest is units only; Playwright drives HTTP and browser tests; Schemathesis
is a separate pinned CLI. Live NBP smoke is deferred and must remain optional,
separate and non-blocking. Bruno/conference walkthrough are KAN-16.

## Explicit Compose execution

With Docker running and the fixed loopback ports 3001–3003 and 5173 free:

```powershell
$env:CI_IMAGE_TAG = 'local-kan15-unique-run-id'
npm run test:compose:build
npm run test:compose:failures
npm run test:compose:system
# Fallback after interruption; limited to the recorded owned projects:
npm run test:compose:cleanup
```

Use a **new lowercase tag for each run**. On Linux set/export `CI_IMAGE_TAG` in
the shell. CI uses run ID + run attempt. Images build once with explicit tags
from `compose.ci.yaml`; all subsequent projects use `--no-build --pull never`.
Only npm/uv download caches are enabled initially; no Docker cache, larger runner
or paid service is needed. Timings below determine whether more caching is useful.

Each backend scenario (multi-item success, stale price/version, stale version-only)
and the browser journey gets a distinct project, network and **new** Products and
Orders volumes. The manifest is written before startup. The orchestrator rejects
pre-existing project resources instead of adopting them. Scenarios run serially,
with one Playwright worker and zero retries: project names isolate resources,
**not fixed host ports**. Never overlap stacks on the same host. No developer
project, store or reset/inspection API is used.

`docker compose --env-file .env.example` is explicit in every command. The real
`.env` is neither loaded nor copied. All published ports remain host-loopback-only.
Orders uses Compose service-name URLs for Products and mock NBP; frontend proxy
URLs also use service names. Browser FX is embedded at image build time as the
runner-accessible `http://127.0.0.1:3003/api/exchangerates/rates/a/eur/`.

Tests in `tests/compose/` have no app-factory/database fixture. Missing target
configuration fails rather than silently starting local services. All business
requests go through the published frontend container/proxy; only indicative FX
goes directly to the published mock. `ready.log` maps healthy container IDs,
images and ports; per-API mount records identify separate project volumes. The
browser attaches request URLs/statuses including direct mock FX and authoritative
Orders success. Fresh seed expectations plus resource creation records show each
mutation starts from fresh state. HTTP tests deliberately do **not** claim the
local suite's private row/dependency-count evidence.

## Reliability, reporting and teardown

- Ubuntu 24.04, pinned Node/npm baseline, action commit revisions and uv 0.9.9.
  Python 3.12/Schemathesis 4.32.7 download before the bounded generated invocation.
- Job limits: 10 minutes for Static/Isolated/Contracts; 20 for Compose. Compose
  readiness is `up --wait --wait-timeout 90` (120-second command bound), driven
  by health checks, not arbitrary sleeps. Playwright scenarios have 30-second
  limits (90-second process bound). Image build bound: 10 minutes.
- No blanket retries, `continue-on-error`, hidden local fallback or live NBP in
  deterministic tests. Only superseded PR runs are cancelled; main runs finish.
- Scoped seven-day artifacts contain JUnit, test output, Schemathesis logs/JUnit/HAR,
  failure traces/screenshots and per-project Compose state/logs. Console and job
  summaries are the primary readable feedback; no reporting platform is needed.
  Output directories are separate for units, API, local integration, contracts,
  each Compose scenario and each lifecycle probe.
- `finally` captures diagnostics **before** `down --volumes --remove-orphans`, even
  after partial startup. Removal is verified using exact project labels for
  containers, volumes and networks; any cleanup error fails the command. Workflow
  `always()` fallback repeats project-scoped cleanup without overwriting original
  failure logs. No global prune/delete or developer-volume cleanup.
- `test:compose:failures` expects two specific failures: a real browser assertion
  and Orders exiting 42 after Products/mock started. Each underlying command
  must fail in the expected phase; the probe passes only when that failure is
  recorded, diagnostics exist and owned resources are removed. Normal scenario
  failures are never converted to successes. This continuously tests ordinary
  failure handling rather than trusting YAML inspection.
- Runner loss, forced termination or cancellation during teardown cannot guarantee
  in-process cleanup/artifact upload. GitHub-hosted runners are disposable. Local
  users can rerun manifest-scoped fallback cleanup while Docker remains available.

Flake risks include cold network downloads, Docker startup and browser/runtime
behavior. Bounded readiness, explicit pre-download, serial mutable stacks and
isolated local databases reduce them; none justify automatic test retries.
Generated checks are bounded, not exhaustive. Mock NBP does not prove live-provider
compatibility. Stock validation is not reservation; idempotency coverage is
sequential, not a high-concurrency guarantee.

## Public repository safety and merge gate

Only disposable GitHub-hosted runners execute PR code. Workflow permission is
`contents: read`; checkout does not persist credentials. No personal PAT, Jira
credential, Actions secret, self-hosted runner, `pull_request_target`, public
preview or developer data is needed. Artifacts are scoped test diagnostics, never
whole workspaces, databases, environment dumps or exploratory reports. Personal
admin authentication is used only locally for repository setup.

Repository merge-rule configuration and observed run evidence are recorded below
after successful hosted runs. Required checks must be sourced from GitHub Actions,
strict/up-to-date, apply to administrators without routine bypass, require PRs
but no approving review, and prevent branch deletion and force pushes.

## Hosted verification evidence

Pending the first hosted run; implementation is not complete until this section
records successful PR/main runs, enforced rules, deliberately blocked failure and
passing recovery, cleanup evidence and measured timings.
