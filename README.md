# TestWarez 2026 — API Testing Strategy

A small educational monorepo showing why different API-testing levels exist:
exploratory requests, tests in code, OpenAPI checks, controlled dependencies and
data, and deliberate CI feedback. Clarity and repeatability come before features.

## Current state (KAN-11)

- The Products service owns a SQLite schema plus deterministic catalog, supplier
  and offer seed data, and implements its health, catalog, batch offer-resolution
  and demo-only offer-update endpoints. Playwright API tests start each Products
  app with a fresh temporary SQLite database.
- Two authored OpenAPI **3.0.3** contracts, linting and schema-example unit tests.
- Playwright API bootstrap smoke tests, TypeScript checks and npm workspaces.
- Orders has a configurable NBP EUR/PLN HTTP adapter and `mocks/nbp/` provides a
  deterministic table-A response plus timeout and unavailable modes.
- Orders implements `/health`, `POST /orders` and `GET /orders/{orderId}` with
  private SQLite snapshots, one Products batch request and one NBP rate per new
  checkout. Decimal calculations produce `213.00 EUR × 4.3000 = 915.90 PLN`.
  Historical reads never call dependencies, including after reopening the file.
  Successful idempotency keys are stored atomically with orders. Sequential
  retries replay the original response without dependency calls; changed payloads
  under the same key return `409 IDEMPOTENCY_KEY_REUSED`. Conflicts and dependency
  failures leave no order or successful-key record, allowing a corrected retry.

`compose.yaml` runs Products, Orders and the deterministic NBP mock with separate
named SQLite volumes and health checks. There is no frontend, Bruno collection,
Schemathesis execution or CI workflow yet. These arrive in later tickets.

## Run the backend with Docker Compose

With Docker Desktop running, start the complete deterministic backend from a clean
checkout with:

```sh
docker compose up --build
```

The services are available at `http://localhost:3001` (Products),
`http://localhost:3002` (Orders) and `http://localhost:3003` (NBP mock). Their
readiness endpoints are `/health`. Orders reaches Products and the mock only via
the Compose network; each API mounts its own named volume and only opens its own
SQLite file.

Stopping the stack with `docker compose down` preserves the seeded Products data
and any created Orders. To intentionally delete both databases and recreate the
deterministic Products seed on the next startup, run:

```sh
docker compose down -v
```

`down -v` permanently destroys the demo volumes, including all saved orders and
idempotency records.

## Products test data reset

KAN-6 exposes `openProductsDatabase(filename)` for the next endpoint slice. An
empty SQLite file is initialized and seeded automatically; reopening an existing
file never duplicates the seed. To reset a local Products database, stop every
process using it, delete that database file and its optional `-wal`/`-shm` files,
then open it again. For example, if KAN-7 uses `products.db` in the repository
root on PowerShell:

```powershell
Remove-Item products.db, products.db-wal, products.db-shm -Force -ErrorAction SilentlyContinue
```

The service/Compose database location is deliberately deferred to the tickets
that add that configuration. Do not delete a data volume unless a full reset is
intended.

## Orders persistence and configuration

`buildApp` in `apps/orders-api/src/app.ts` accepts `database`, `products` and `nbp`
options. Supply `openOrdersDatabase(filename)` for durable storage and
`products: { baseUrl }` / `nbp: { baseUrl }` for dependency HTTP configuration
(both clients also accept `timeoutMs`). Without options, Orders uses an empty
in-memory database, Products at `http://localhost:3001` and the live NBP URL.
Tests always override both URLs with local HTTP stubs; they never call live NBP.
The app closes its database on shutdown. Orders never opens Products' database,
reserves inventory or decrements stock. Compose and environment wiring are later.

An existing Orders file is reopened without reseeding or rewriting history. To
reset it, stop all processes using it and delete **only that Orders database file**
and its optional `-wal`/`-shm` files. This permanently deletes saved orders and
their idempotency records.

### Sequential checkout retries

- A new key creates an order and returns `201` plus `Location`.
- After success, the same key and payload return the original `201` body and
  `Location`, even after a restart or changes/failures in Products or NBP.
- A changed payload with a successful key returns `409 IDEMPOTENCY_KEY_REUSED`.
  JSON object property order/formatting is ignored; item array order matters.
- Request validation happens first. Failed attempts retain no successful-key
  record, so the key can be retried after fixing the cart or dependency.

The stored immutable order is the replay body; its ID determines `Location`.
This demonstrates **sequential** retries only: no in-flight duplicate coordination,
high-concurrency guarantees, key expiry or cleanup are implemented.

## Local checks

Use Node.js **24.11.1** (see `.node-version`) and npm **11.6.2**. No credentials,
Docker, Python or browser binaries are needed for these checks.

```sh
npm ci
npm run check
```

Individual commands:

| Command | What it checks |
| --- | --- |
| `npm run contracts:lint` | Both OpenAPI specs with Redocly recommended-strict rules |
| `npm run typecheck` | Root test/tooling code and both app workspaces |
| `npm run test:unit` | Vitest contract examples, persistence and exact-calculation units |
| `npm run test:api` | Playwright isolated Products, Orders and NBP HTTP tests |
| `npm test` | Unit tests, then API tests |

No `start`/`dev` command exists yet: KAN-7 exposes the Products app factory and
KAN-8 exposes the NBP mock factory for tests, but neither chooses a persistent
listener configuration. Tests use no live external services and have no automatic
retries.

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
| `apps/products-api/` | Products Fastify factory, catalog persistence and endpoints |
| `apps/orders-api/` | Orders Fastify factory, HTTP clients, calculations and snapshots |
| `mocks/nbp/` | Configurable NBP table-A EUR/PLN HTTP test double and fixture |
| `contracts/` | Independently readable Products and Orders OpenAPI contracts |
| `tests/unit/` | Vitest only: pure unit/schema-tooling tests |
| `tests/api/` | Playwright: isolated API tests with temporary stores and HTTP stubs |
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
