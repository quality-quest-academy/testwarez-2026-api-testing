# AGENTS.md

Notes for AI agents working in this repository.

## Implementation plan (read first)

`Implementation Plan.md` at the repo root is the **authoritative source of truth**
for scope, architecture, contracts, and ticket order (it is deliberately
gitignored — local-only, owner-controlled; never commit, publish, or quote
sensitive URLs from it outside this repo).

**Always consult the relevant sections of the plan before and while working on a
task, implementing a Jira ticket, or troubleshooting:**

- Domain model / API behavior → sections 4–8 (conceptual v0.2 contract baseline).
- Compose, persistence, test data → section 10.
- Test levels and required representative tests → section 11.
- CI strategy → section 12; ticket order/backlog → section 13.
- Agent rules and out-of-scope for MVP → sections 14–15.

Key rules from the plan: work one Jira ticket at a time (currently the project
starts at KAN-5); respect approved decisions (TypeScript + Fastify, Vite +
Vanilla TS frontend, Schemathesis required, GitHub Actions) and delegate only the
ticket-scoped choices it explicitly delegates; validate/lint contracts before
implementing endpoints; never couple services via direct cross-database access;
do not claim contracts, apps, mocks, tests, or CI exist before they do. Note that
the plan's KAN-5 first step mentions committing the plan to the repo — the owner
has instead chosen to keep it gitignored; follow the owner's choice.

## Repo state

KAN-5–15 provide npm workspaces, authored OpenAPI 3.0.3 contracts, Products
endpoints with seeded SQLite, an NBP HTTP adapter/mock, and Orders checkout with
private SQLite snapshots. Orders atomically persists successful idempotency keys
and replays sequential retries without dependency calls; changed payloads return
409. Failed attempts retain no successful-key record. High-concurrency guarantees
are not demonstrated. Compose provides standalone listeners, separate persistent
volumes and mock-NBP wiring. Contract tests use fresh in-memory stores and
loopback listeners, not developer volumes or live NBP.
Use Node 24.11.1 / npm 11.6.2, `npm ci`, `npx playwright install chromium`, then
`npm run check` (contract lint, TypeScript/UI build, unit/API/integration tests,
targeted contract examples and one browser E2E). Also run
`npm run test:contract` for the complete current gate; it requires `uvx` and manages
Python 3.12 / Schemathesis 4.32.7. See README.md, docs/decisions.md and
docs/contract-testing.md.

Vitest is **unit tests only** (`tests/unit/`). Use **Playwright for API tests**
(`tests/api/`), contract fixture/CLI orchestration (`tests/contract/`), integration
tests (`tests/integration/`), and browser E2E (`tests/e2e/`). Do not put API tests in Vitest.
`npm run test:integration` runs real Products/Orders HTTP listeners with separate
fresh temporary SQLite files and the NBP mock per test, proving multi-item
checkout and stale price/version rejection followed by explicit reconfirmation.
It is included in `npm test` / `npm run check`. Local integration tests do not
exercise Compose. GitHub Actions separately runs explicit container-targeted
tests with fresh projects/volumes for each scenario, serial execution and verified
teardown. The frontend
is Vite + Vanilla TS with sessionStorage cart state, explicit conflict review,
direct indicative FX and authoritative Orders confirmation. `npm run test:e2e`
builds privately and serves real UI assets against fresh real APIs/private SQLite
files and the HTTP NBP mock; no developer volumes or live NBP are used.

CI has four required groups: Static, Isolated, Contracts and Compose system
(including the single Chromium journey). Main requires an up-to-date PR, all
four checks from GitHub Actions, and has no routine administrator bypass. See
docs/test-strategy.md for commands, hosted evidence, scope and teardown limits;
.github/main-ruleset.json records the desired repository rule configuration.
Never weaken checks or use personal credentials in Actions. Local Compose system
commands require an explicit unique CI_IMAGE_TAG and free loopback ports; they
must not adopt/reset developer projects or fall back to local app fixtures.

## MCP servers

`opencode.jsonc` defines a Jira MCP server via `mcp-atlassian`
(pinned to 0.23.1, launched with `uvx`). It reads credentials from `.env` in the
repo root. Prerequisites: `uvx` installed and valid `JIRA_URL` / `JIRA_USERNAME`
/ `JIRA_API_TOKEN` in `.env`. Startup can take up to ~60s.

It also defines pinned Playwright MCP 0.0.84 for later local exploratory work,
using installed Edge, an isolated in-memory profile and loopback-only origin
guardrails. See `docs/frontend.md`. MCP is not the regression runner. Do not
access credentials, personal browser profiles, external sites or developer data
through browser tools. A broader exploratory session is a separate initiative.

## Secrets

**Never read, display, stage, or commit `.env`** — it contains real credentials
(gitignored). Work from `.env.example` only, and keep it in sync whenever new
variables are added. Likewise never read the GitHub token (see below).

## Git authentication

Push/pull uses Git Credential Manager with a fine-grained GitHub token stored in
Windows Credential Manager. **Agents never see or handle the token.** If
authentication fails (e.g. expired token), tell the user to replace it
themselves — agents never see it. Have the user run this in a PowerShell window
(any folder works):

```powershell
"protocol=https`nhost=github.com`nusername=github`n" | git credential reject 2>$null

$sec = Read-Host -AsSecureString "Paste your fine-grained GitHub token"
$b   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$t   = [Runtime.InteropServices.Marshal]::PtrToStringAuto($b)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)

"protocol=https`nhost=github.com`nusername=github`npassword=$t`n`n" | git credential approve

$t = $null; $b = $null; $sec = $null
```

Then verify with `git ls-remote origin` (no prompt = stored credential works).
Token scope for agents to remember: fine-grained PAT, this repository only,
**Contents: Read and write** — never embed it in remote URLs or config files.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
