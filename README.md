# TestWarez 2026 — API Testing Strategy

A small educational monorepo showing why different API-testing levels exist:
exploratory requests, tests in code, OpenAPI checks, controlled dependencies and
data, and deliberate CI feedback. Clarity and repeatability come before features.

## Current state (KAN-5)

- Two TypeScript/Fastify app factories; **no endpoints, listeners or databases**
  are implemented yet. Tests start temporary listeners themselves.
- Two authored OpenAPI **3.0.3** contracts, linting and schema-example unit tests.
- Playwright API bootstrap smoke tests, TypeScript checks and npm workspaces.

The contracts describe **planned behavior**, not working APIs. There is no
frontend, NBP mock, Compose stack, Bruno collection, Schemathesis execution or CI
workflow yet. These arrive in later tickets.

## Local checks

Use Node.js **24.11.1** (see `.node-version`) and npm **11.6.2**. No credentials,
Docker, Python or browser binaries are needed for KAN-5 checks.

```sh
npm ci
npm run check
```

Individual commands:

| Command | What it checks |
| --- | --- |
| `npm run contracts:lint` | Both OpenAPI specs with Redocly recommended-strict rules |
| `npm run typecheck` | Root test/tooling code and both app workspaces |
| `npm run test:unit` | Vitest schema-tooling unit tests, including contract examples |
| `npm run test:api` | Playwright HTTP smoke tests against isolated temporary app listeners |
| `npm test` | Unit tests, then API tests |

No `start`/`dev` command exists yet: bootstrap does not deliver functional
services. Tests use no live external services and have no automatic retries.

## Target architecture and boundaries

```text
Browser (Vite + Vanilla TS, later)
  ├─ catalog/offers ──> Products API ──> private products.db (SQLite)
  ├─ checkout ────────> Orders API ────> private orders.db (SQLite)
  └─ indicative FX ──> NBP (read-only fallback if browser CORS requires it)
                         ^
Orders ── HTTP ──> Products + NBP (configurable HTTP mock in deterministic tests)
```

Products owns products, seeded suppliers and versioned EUR offers. Orders owns
checkout, immutable order snapshots and sequential successful-request
idempotency. Services never read each other's database. Orders re-fetches offers,
checks accepted prices/versions and stock, and computes the authoritative PLN
total with one NBP rate. Browser FX is indicative only. One missing/unavailable
item or stale offer prevents the whole order write; changed offers require
explicit reconfirmation. Money is represented as decimal strings.

| Path | Responsibility |
| --- | --- |
| `apps/products-api/` | Products Fastify factory; catalog persistence and endpoints later |
| `apps/orders-api/` | Orders Fastify factory; checkout persistence and endpoints later |
| `contracts/` | Independently readable Products and Orders OpenAPI contracts |
| `tests/unit/` | Vitest only: pure unit/schema-tooling tests |
| `tests/api/` | Playwright: isolated API tests (bootstrap smoke tests currently) |
| `docs/decisions.md` | Tool choices, contract details and deferred work |

Later boundaries: `apps/frontend/` for Vite + Vanilla TS; `mocks/nbp/` for the
provider test double; `tests/contract/` for Schemathesis and targeted API contract
checks; `tests/integration/` for cross-service Playwright API tests;
`tests/e2e/` for **one** Playwright browser flow; `bruno/` for exploration.
These are planned folders, not delivered functionality.

## Testing choices

**Vitest is for unit tests only. Playwright is for API tests and browser E2E.**
This keeps fast pure tests separate while using one HTTP-testing/assertion API
for isolated services, cross-service integration and browser journeys.
Schemathesis-generated tests are a separate required CLI stage in KAN-12;
schema checks do not replace business assertions or prove compatibility with
the real NBP provider. See [decisions](docs/decisions.md).

## Non-goals and safety

No payment, accounts/authentication, fulfillment, cancellation, inventory
reservation/decrement, distributed transactions, supplier network services,
high-concurrency idempotency protocol, hosted previews, Kubernetes, Pact or
Testcontainers. Stock validation is **not** a reservation guarantee.

The planned offer PATCH endpoint is demo administration only: disable or protect
it outside local/test environments. Standard tests will use controlled NBP data,
not the live provider. Repository publication remains the owner's decision.

Never commit credentials, `.env`, local databases or the owner-controlled local
implementation plan. Work one Jira ticket at a time; validate contracts before
implementing endpoints and keep them synchronized as each slice lands.
