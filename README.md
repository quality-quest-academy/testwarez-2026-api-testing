# TestWarez 2026 — API Testing Strategy

A small educational monorepo showing why different API-testing levels exist:
exploratory requests, tests in code, OpenAPI checks, controlled dependencies and
data, and deliberate CI feedback. Clarity and repeatability come before features.

## Current state (KAN-14)

- The Products service owns a SQLite schema plus deterministic catalog, supplier
  and offer seed data, and implements its health, catalog, batch offer-resolution
  and demo-only offer-update endpoints. Playwright API tests start each Products
  app with a fresh temporary SQLite database.
- Two authored OpenAPI **3.0.3** contracts, linting and schema-example unit tests.
  Pinned Schemathesis checks both running APIs against fresh, private test data;
  targeted response-breakage examples explain actionable schema diagnostics.
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
- Playwright integration tests run both real APIs over HTTP with separate fresh
  SQLite files and the NBP mock. They verify multi-item checkout, stale price and
  version rejection, no partial writes, and explicit reconfirmation before retry.
- Vite + Vanilla TypeScript frontend shows supplier offers, a session-scoped
  multi-item cart and indicative PLN conversion. Conflicts refresh offers but
  require explicit acceptance and a separate checkout submission. Confirmation
  displays the authoritative Orders snapshot, not a browser-computed final price.
- One Chromium browser journey covers cart persistence, conflict review and
  checkout against real APIs, private SQLite files and the HTTP NBP mock.
- Project-local Playwright MCP is configured for later agent-driven exploration;
  exploration is separate from the automated regression gate.

`compose.yaml` runs Products, Orders, the deterministic NBP mock and frontend,
with separate named SQLite volumes and health checks. Bruno and CI remain later
tickets.

## Run the demo with Docker Compose

With Docker Desktop running, start the complete deterministic demo from a clean
checkout with:

```sh
docker compose --env-file .env.example up --build
```

Open **http://localhost:5173** for the UI. The services are available at `http://localhost:3001` (Products),
`http://localhost:3002` (Orders) and `http://localhost:3003` (NBP mock). Their
readiness endpoints are `/health`. Orders reaches Products and the mock only via
the Compose network; each API mounts its own named volume and only opens its own
SQLite file.

The browser fetches indicative FX directly from the local NBP mock. The UI host
forwards `/api/products/*` and `/api/orders/*` to the respective APIs; it does
not calculate final prices. No Jira credentials are needed by Compose.

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
Tests always override both URLs with local HTTP dependencies; they never call live NBP.
The app closes its database on shutdown. Orders never opens Products' database,
reserves inventory or decrements stock. Compose supplies the service URLs and
database paths through environment configuration.

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
Docker or Python are needed for these checks. Chromium is needed for browser E2E.

```sh
npm ci
npx playwright install chromium
npm run check
```

Individual commands:

| Command | What it checks |
| --- | --- |
| `npm run contracts:lint` | Both OpenAPI specs with Redocly recommended-strict rules |
| `npm run typecheck` | Root test/tooling code and all app workspaces |
| `npm run build:frontend` | Type-check and build the Vite UI |
| `npm run test:unit` | Vitest contract examples, persistence and exact-calculation units |
| `npm run test:api` | Playwright isolated Products, Orders and NBP HTTP tests |
| `npm run test:integration` | Real Products + Orders, separate fresh SQLite files, HTTP NBP mock |
| `npm run test:contract:examples` | Valid HTTP response bodies plus deliberately broken copies; no Python needed |
| `npm run test:contract` | Schemathesis-generated checks for both APIs plus targeted examples; requires `uvx` |
| `npm test` | Unit tests, then isolated API and backend integration tests |
| `npm run test:e2e` | One Chromium UI journey; builds privately, starts its own APIs/mock and fresh databases |
| `npm run dev:frontend` | Local UI development server (start backend services separately) |

For the complete current gate, run `npm run check` **and** `npm run test:contract`.
Install [uv](https://docs.astral.sh/uv/getting-started/installation/) for `uvx`;
it manages Python 3.12 and pinned Schemathesis 4.32.7. The contract command starts
and closes its own services: there is no need to start Compose first. Initial tool downloads
need internet; test requests never use live NBP. There are no automatic retries.
See [contract checks](docs/contract-testing.md) for generation limits, isolation,
diagnostics, artifacts and what schema checks cannot prove.

### Backend integration tests

```sh
npm run test:integration
```

No running Compose stack or manual reset is needed. Each test creates a private
temporary directory with separate `products.db` (automatically seeded) and
`orders.db` (empty), starts real Products/Orders and the NBP mock on ephemeral
loopback ports, and closes them and removes its files afterward, including on
failure. Tests never use developer databases, volumes, `.env` or public NBP.
They can run individually, in any order or in parallel with no shared mutable
state and no retries. `npm run check` includes them.

The scenarios read accepted cart prices/versions from Products over HTTP, then
verify `213.00 EUR × 4.3000 = 915.90 PLN` and retrieval of the saved order. Conflict
scenarios update Products through its demo PATCH endpoint (price + version, or
stock changing only the version), assert `409 OFFER_CHANGED` with current values,
zero Orders/idempotency writes and no FX lookup, then explicitly reconfirm and
successfully retry. Only the test harness inspects Orders' private store to prove
no partial writes; the services communicate exclusively over HTTP.

These are controlled backend integration tests, not proof of live-NBP
compatibility, browser behavior or container configuration. Local tests run the
real app factories/listeners in Playwright workers; Compose-based CI orchestration
remains KAN-15. See [decisions](docs/decisions.md#backend-integration-tests-kan-13).

On Windows with pinned Node 24.11.1, parallel workers have printed
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` at shutdown after all
tests passed (the command returned 0). This matches a reported
[Node shutdown issue](https://github.com/nodejs/node/issues/56645); it is not a
business assertion failure, but should not be mistaken for clean worker shutdown.
A diagnostic run with `npm run test:integration -- --workers=1` was clean.
The default remains parallel with zero retries; no sleeps or suppressed errors
were added to hide the runtime symptom.

## Target architecture and boundaries

```text
Browser (Vite + Vanilla TS)
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
| `apps/frontend/` | Vite + Vanilla TS catalog/cart, explicit review and Orders confirmation |
| `mocks/nbp/` | Configurable NBP table-A EUR/PLN HTTP test double and fixture |
| `contracts/` | Independently readable Products and Orders OpenAPI contracts |
| `tests/unit/` | Vitest only: pure unit/schema-tooling tests |
| `tests/api/` | Playwright: isolated API tests with temporary stores and HTTP stubs |
| `tests/contract/` | Schemathesis CLI orchestration/configuration and targeted response examples |
| `tests/integration/` | Playwright real Products/Orders checkout and stale-cart scenarios |
| `tests/e2e/` | One Chromium browser journey with real services and HTTP mock NBP |
| `docs/decisions.md` | Tool choices, contract details and deferred work |

`bruno/` for exploratory requests remains planned (KAN-16).

## Frontend and exploratory browser tooling

See [frontend and browser tooling](docs/frontend.md) for local development,
indicative FX configuration and verified browser/CORS behavior, conflict review,
checkout retry limitations and **Playwright MCP** setup. The MCP uses an isolated
Edge profile; it does not replace `npm run test:e2e`. An exploratory session is a
separate later initiative, not delivered test coverage.

## Testing choices

**Vitest is for unit tests only. Playwright is for API tests and browser E2E.**
This keeps fast pure tests separate while using one HTTP-testing/assertion API
for isolated services, cross-service integration and browser journeys.
Schemathesis-generated tests are a separate required CLI stage;
schema checks do not replace business assertions, implement consumer-driven
contracts or prove compatibility with the real NBP provider.
See [contract checks](docs/contract-testing.md) and [decisions](docs/decisions.md).

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
