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

No application code yet — config-only. There are no build, test, or lint commands;
do not invent or run any. Target layout and commands will be defined per the plan
as KAN-5+ tickets land.

## Jira MCP server

`opencode.jsonc` defines the only tooling: a Jira MCP server via `mcp-atlassian`
(pinned to 0.23.1, launched with `uvx`). It reads credentials from `.env` in the
repo root. Prerequisites: `uvx` installed and valid `JIRA_URL` / `JIRA_USERNAME`
/ `JIRA_API_TOKEN` in `.env`. Startup can take up to ~60s.

## Secrets

**Never read, display, stage, or commit `.env`** — it contains real credentials
(gitignored). Work from `.env.example` only, and keep it in sync whenever new
variables are added. Likewise never read the GitHub token (see below).

## Git authentication

Push/pull uses Git Credential Manager with a fine-grained GitHub token stored in
Windows Credential Manager. **Agents never see or handle the token.** If
authentication fails (e.g. expired token), tell the user to replace it using the
PowerShell procedure in `ai-artifacts/AGENT.md` — do not attempt to do it
yourself. Verify with `git ls-remote origin`.

## Commits

Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`.
