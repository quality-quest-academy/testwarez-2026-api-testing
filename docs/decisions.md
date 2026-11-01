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
  key record. Atomic persistence is implemented in KAN-10; high-concurrency guarantees,
  in-flight coordination and key TTL are not promised.

## Products persistence and seed (KAN-6)

- `apps/products-api/src/database.ts` owns the Products SQLite schema and its
  deterministic seed. It uses `products`, `suppliers`, and `offers` tables with
  foreign keys and database checks for EUR, nonnegative stock and positive
  versions.
- `openProductsDatabase(filename)` initializes an empty file and runs the
  idempotent seed on every open. Stable seed IDs prevent duplicates after a
  restart. `prod-001` has offers from Alpha and Beta, including Beta's
  unavailable (`stock: 0`) offer.
- This ticket deliberately adds no routes, listener, default data-file location
  or environment configuration. KAN-7 will consume this service-owned data
  layer; KAN-11 will choose the container data path and volume.

## Products endpoints (KAN-7)

- `buildApp` accepts an optional service-owned `ProductsDatabase`; when omitted,
  it creates a seeded in-memory SQLite database. The application closes that
  database with its Fastify instance. This keeps imports free of environment
  configuration and lets isolated API tests provide a distinct temporary file.
- Products routes map their public HTTP data to joined product/supplier/offer
  records. Batch resolution preserves caller order and returns no partial result
  when one or more offer IDs are missing. PATCH increments the offer version once
  only when price or stock actually changes.
- Fastify route schemas enforce the OpenAPI request constraints. Validation
  failures use the contract's `VALIDATION_ERROR` response shape.

## NBP adapter and mock (KAN-8)

- `NbpClient` is an Orders-owned HTTP boundary. Its base URL is injected rather
  than read from the environment, defaulting to the real `https://api.nbp.pl`.
  KAN-9 can inject configuration at its service composition point; standard tests
  inject the local mock URL and never call the live provider.
- The adapter requests NBP's last-published table-A EUR endpoint, validates the
  response shape it needs, and returns a four-decimal rate string and effective
  date. It distinguishes timeout, unavailable upstream and invalid upstream data
  for a future Orders route to map to `DEPENDENCY_UNAVAILABLE`.
- `mocks/nbp` is a small Fastify workspace with the illustrative NBP fixture. Its
  success, delayed-response and 503 modes deliberately exercise the real adapter
  over HTTP. Compose wiring and a live-NBP compatibility smoke remain later work.

## Orders checkout and snapshots (KAN-9)

- Orders owns a separate `node:sqlite` database. `openOrdersDatabase(filename)`
  creates an empty store or reopens existing history. `buildApp` defaults to an
  in-memory store and closes the supplied store on shutdown, like Products.
- One `orders` row stores an entire JSON snapshot, including ordered line items.
  A single SQLite INSERT is atomic for the complete cart; no partially written
  order/items are possible. There is no update route. Historical GET only reads
  this snapshot and never resolves current offers or FX. Separate item tables
  would add joins without a query requirement in this small demo.
- `ProductsClient` is Orders-owned, with no imports from Products persistence.
  One HTTP batch call resolves all requested IDs in order. The adapter validates
  the fields used at checkout and rejects unusable responses. Products and NBP
  URLs/timeouts are injected through app options, not read on import.
- `decimal.js` now implements exact line/subtotal arithmetic and final PLN
  half-up rounding. Precision scales with input size because the Money contract
  does not bound the number of integer digits. Do not round converted lines;
  convert the combined EUR subtotal once with one NBP rate.
- Request validation rejects coercion, extra body fields and duplicate offer IDs.
  Minimal stale-price/version and availability guards prevent accepting an
  unsafe cart in this increment. Dependency errors map to 503; the full conflict,
  failure/no-partial-write coverage remains KAN-10.
- **Idempotency is not implemented by KAN-9.** The required header is validated,
  but repeats can create duplicates. KAN-10 must persist successful-key records
  atomically with order creation and demonstrate all three sequential behaviors.
  The existing contract documents that target; it does not prove it exists yet.
- Playwright tests use temporary Orders files and local Products/NBP HTTP stubs.
  They demonstrate totals, final-only rounding, input rejection, immutable history
  after dependency changes, and history after reopening the database with
  unreachable dependency URLs. They are not real-Products integration tests.

## Orders conflicts, failures and sequential retries (KAN-10)

- `idempotency_records` stores a unique key, SHA-256 request fingerprint and a
  foreign key to the immutable order snapshot. Both INSERTs use one explicit
  SQLite transaction; a failed key write rolls back the order. Existing Orders
  files gain the table on open without rewriting their history. Pre-KAN-10 orders
  have no retained keys and cannot retroactively support replay.
- Fingerprints serialize validated request fields in a fixed object-property
  order. JSON whitespace/property order do not change identity; item array order
  does. This preserves the ordered response items without a generic JSON
  canonicalization dependency. Price, version, quantity and offer ID all matter.
- Validate requests (including duplicate offer IDs) before key lookup. A successful
  key is checked before either HTTP dependency: identical payload replays the
  stored order with 201 and its original Location; changed payload returns
  `409 IDEMPOTENCY_KEY_REUSED`. Failed validation, conflicts and dependency errors
  retain no successful record. A different key creates a fresh checkout.
- Existing offer guards now have explicit Playwright coverage for stale price,
  stale version, insufficient/zero stock and Products 404 mapped to
  `409 OFFER_UNAVAILABLE`. Reject the whole cart and skip FX for these conflicts;
  changed offers include expected/current values for reconfirmation.
- Products/NBP failures (HTTP errors, unusable data, invalid JSON, disconnected
  connections and timeouts) return 503 with neither order nor key persisted.
  HTTP timeouts cover body consumption, not just receipt of headers. Tests use
  controlled unfinished responses, not sleeps, for both timeout phases.
- Playwright proves sequential replay, payload conflicts, retry after failure,
  distinct keys and restart persistence using isolated SQLite and HTTP stubs.
  Vitest persistence units inject a key-write failure to prove rollback and retry.
  This is not cross-service integration or a high-concurrency demonstration.
- No in-flight duplicate coordination, key TTL/cleanup or high-concurrency
  guarantees are implemented. A database uniqueness constraint prevents retained
  duplicate keys, but concurrent requests are not promised a replay/conflict
  protocol. Stock validation remains neither reservation nor decrement.

## Incremental delivery

KAN-5 adds no functional endpoints (including health), SQLite files, frontend,
Compose, provider mock, Bruno collection, generated Schemathesis execution or
GitHub Actions. Static and test commands run locally now. Follow the local
owner-controlled implementation plan and the selected Jira ticket, one ticket at
a time. Keep that plan gitignored; do not publish it or copy its sensitive links.

KAN-6/7 add Products data/routes; KAN-8 adds NBP integration and mock; KAN-9/10 add
Orders behavior; KAN-11 adds Compose; KAN-12/13 add contract/integration tests;
KAN-14 adds UI/E2E; KAN-15 adds CI; KAN-16 adds exploration and walkthrough docs.
