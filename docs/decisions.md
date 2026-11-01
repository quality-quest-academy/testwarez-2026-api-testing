# Bootstrap decisions (KAN-5)

## Runtime and workspace

- **Node.js 24 LTS, TypeScript, Fastify 5, ESM, npm workspaces.** Node 24.11.1 and
  npm 11.6.2 are the reproducible baseline; use `npm ci` and the committed lockfile.
  npm avoids another package-manager prerequisite. Strict shared TypeScript
  settings use NodeNext resolution; each service remains a separate package.
- App factories return independent Fastify instances without opening sockets or
  reading environment variables on import. There is intentionally no route,
  persistence initialization or server entrypoint yet. Later tickets add those
  concerns without coupling services through a shared business/data package.
- **Persistence choice for KAN-6/KAN-9: built-in `node:sqlite` `DatabaseSync`,
  explicit SQL, no ORM.** It avoids native npm addons and suits a small SQLite
  demo. This API is experimental in the pinned Node baseline; accept that tradeoff
  for this educational repository and pin the runtime. Each service owns its own
  schema, connection and file; tests must use fresh, isolated databases.
- **Money arithmetic choice: `decimal.js`**, to be installed when calculations
  arrive, not as an unused bootstrap dependency. Never compute money with binary
  floating point. Round the final PLN total half-up to two decimals.

## Runner split (owner-confirmed)

| Level | Runner | Reason |
| --- | --- | --- |
| Unit, including schema-tooling units | Vitest only | Fast direct function/schema checks; no HTTP service under test |
| Isolated API | Playwright Test + `APIRequestContext` | Real HTTP requests and readable assertions; no browser installation needed |
| Backend integration | Playwright Test + `APIRequestContext` | Same HTTP tooling against real Products/Orders with mock NBP |
| Generated OpenAPI testing | Schemathesis CLI (KAN-12) | Required complementary property-based API testing |
| One browser E2E | Playwright Test (KAN-14) | Browser UI flow with controlled downstream dependencies |

API tests must not be added to Vitest. Current API smoke tests start a fresh app
on a loopback ephemeral port per test and close it in `finally`; `/health` returns
404 deliberately until routes are implemented. They prove bootability and HTTP
reachability, **not** the promised health contract or business behavior. Update
these assertions when endpoint implementation lands.

Use Playwright's built-in assertions for API/browser tests and Vitest assertions
for units; no separate assertion library. Zero blanket retries. Future stateful
tests may run in parallel only with separate databases/stacks.

## HTTP test doubles

Use small local Fastify HTTP stub servers for isolated outbound dependency tests,
with injected base URLs and deterministic responses/timeouts. This exercises the
real HTTP adapter with no additional mocking library. The reusable NBP HTTP mock
is KAN-8 work; no mock service exists yet. Browser routing/mocking must not conceal
Orders' own NBP calls: integration/E2E will use a configurable mock base URL.
Real-NBP compatibility is a separate optional, non-blocking check.

## Contracts and validation

- Both specs are authored as OpenAPI 3.0.3. Redocly's recommended-strict rules validate
  references, structure and examples. Localhost URLs, deliberately unauthenticated
  local APIs and operations without client-input 4xx responses have documented
  rule exceptions in `redocly.yaml`; remaining recommended rules are errors.
- Swagger Parser validates and dereferences the documents. Ajv draft-04 plus
  formats validates authored request/response/schema/parameter examples and
  selected invalid values in Vitest. This small checker supports the JSON Schema
  subset currently used; it is **not** a general OpenAPI response validator.
  Revisit it if adding OpenAPI-only validation keywords. Runtime/generated
  contract tests remain KAN-12, not something this bootstrap claims to deliver.
- `ConflictError` uses `oneOf` over three complete closed object schemas. Valid
  `OFFER_CHANGED` errors require `changes`, including expected/current price and
  version. Regression units prove this property is accepted and malformed details
  are rejected; there is no unsafe closed-base `allOf` composition.
- The conceptual baseline leaves response envelopes/error details open. Batch
  resolution returns an array in request order or `404 NOT_FOUND` with missing
  `offerIds`. All Offer representations include `productName` so Orders can make
  the required historical snapshot without an extra Products lookup. Products
  still owns that name; Orders receives it over HTTP. Local validation errors use
  `VALIDATION_ERROR`. Unavailable checkout errors list affected `offerIds`.
- OpenAPI 3.0 `uniqueItems` cannot enforce uniqueness of one field across
  different objects. Checkout must additionally reject repeated `offerId` values
  in code, even if quantities/expectations differ. This is explicitly described
  in the schema; generated validation alone cannot prove it.
- EUR/PLN money is a nonnegative string with exactly two decimals; the positive
  FX rate is a string with four decimals. Numeric money, negative stock, absent
  required fields and malformed conflict details are rejected by unit checks.
- Successful sequential idempotency replay preserves the original 201 response
  and Location without new dependency calls. Failed attempts leave no successful
  key record. Atomic persistence is later work; high-concurrency guarantees,
  in-flight coordination and key TTL are not promised.

## Incremental delivery

KAN-5 adds no functional endpoints (including health), SQLite files, frontend,
Compose, provider mock, Bruno collection, generated Schemathesis execution or
GitHub Actions. Static and test commands run locally now. Follow the local
owner-controlled implementation plan and the selected Jira ticket, one ticket at
a time. Keep that plan gitignored; do not publish it or copy its sensitive links.

KAN-6/7 add Products data/routes; KAN-8 adds NBP integration and mock; KAN-9/10 add
Orders behavior; KAN-11 adds Compose; KAN-12/13 add contract/integration tests;
KAN-14 adds UI/E2E; KAN-15 adds CI; KAN-16 adds exploration and walkthrough docs.
