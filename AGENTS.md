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

Key rules from the plan: work one Jira ticket at a time; respect approved
decisions (TypeScript + Fastify, Vite +
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

## Delivery workflow

- Inspect `git status` and fetch current remote state before choosing a branch;
  preserve existing work. Start ticket-scoped work on a branch from current
  `origin/main`, not directly on `main`. Use Conventional Commits below.
- Run the relevant local checks; the full local gate is `npm run check` plus
  `npm run test:contract`. Pre-download the pinned Schemathesis tool before its
  bounded invocation when needed. Local fixtures do not prove Compose wiring.
- When remote delivery is authorized, push the ticket branch and open a PR.
  Keep it up to date with `main` without discarding others' changes. All four
  required checks must pass for the latest revision, including documentation-only
  changes; new commits require new checks. Do not push directly to `main`.
- Investigate failures using scoped artifacts. Never bypass rules, weaken/remove
  required checks, add blanket retries or use an administrator merge override to
  finish a ticket. Uploaded artifacts alone do not prove check success; during
  a GitHub incident, report the blocker and wait for actual check conclusions.
- Merge normally only when authorized and the required checks are green; verify
  the resulting `main`-push run. Report run/PR links, acceptance evidence and
  limitations before marking the ticket complete. Merge-rule administration is
  separately owner-authorized work: read actual settings first and preserve
  unrelated protections; the versioned ruleset JSON is not automatically applied.

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

Use existing Git Credential Manager authentication or the owner's authenticated
GitHub CLI. **Agents never see or handle tokens or inspect credential stores.**
Verify read access with `git ls-remote origin` and repository capabilities with
`gh api`; read/admin flags do not prove workflow-write permission.

If the saved Git helper cannot write workflows but the owner has authorized the
CLI, use it for that command only, without changing persistent Git configuration:

```powershell
git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push -u origin HEAD
```

For an OAuth `workflow`-scope rejection, ask the owner to run
`gh auth refresh --hostname github.com --scopes workflow` and complete GitHub
authorization themselves. Never request a pasted token or pass personal/admin
authentication into Actions. Permission changes beyond the task require approval.

For expired fine-grained credentials, have the owner replace them themselves in
a PowerShell window (any folder works; agents never run this token-handling code):

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
Fine-grained PAT permissions: this repository only, **Contents: Read and write**;
**Workflows: Read and write** only when editing workflow files, and
**Administration: Read and write** only for explicitly authorized rule setup.
Never embed credentials in remote URLs, config files or Actions secrets.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
