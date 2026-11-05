# Technical decisions

## What

This lab favors readable boundaries and repeatable examples over framework size.
These are current decisions, not an implementation changelog.

## Why

| Choice | Reason and tradeoff |
| --- | --- |
| Node 24.11.1 / npm 11.6.2, TypeScript, Fastify 5, ESM workspaces | One small application stack and a committed lockfile; strict NodeNext typing |
| Separate app factories and server entrypoints | Imports do not open sockets or load environment files; tests inject their own stores and URLs |
| Built-in `node:sqlite`, explicit SQL, no ORM | No native npm addon or extra database server; `DatabaseSync` is experimental in the pinned runtime |
| One database per service | Products owns catalog data; Orders gets offers only over HTTP, never through shared database access |
| Orders snapshot as JSON in one row | History needs immutable whole-order reads, not item-table queries; snapshot and successful-key inserts share a transaction |
| `decimal.js`, decimal strings on the wire | Exact money arithmetic; convert the combined subtotal once and round PLN half-up to two decimals |
| Vite + Vanilla TypeScript, `sessionStorage` | Small UI without a component framework; same-tab recovery, not durable or trusted cart storage |
| Direct browser indicative FX | Distinguishes indication from authoritative Orders pricing; depends on provider CORS when using live NBP |
| Local Fastify HTTP doubles | Exercise real dependency adapters without another mocking library; mock compatibility is not live-provider proof |
| Vitest units; Playwright HTTP/browser tests | Fast pure tests plus one consistent HTTP/assertion API; API tests never belong in Vitest |
| Separate Schemathesis CLI | Generated OpenAPI conformance complements explicit business tests; bounded generation is not exhaustive testing |
| Bruno for exploration | Versioned, readable requests with light checks; not a replacement for the automated regression strategy |
| GitHub Actions and disposable Compose stacks | Test container wiring without hosted previews, Testcontainers or Kubernetes |
| Zero blanket retries | Failures remain visible; isolation and bounded readiness address causes rather than conceal symptoms |

### Contract details worth preserving

- Both authored contracts use **OpenAPI 3.0.3**. Redocly uses recommended-strict
  rules with explicit exceptions for this unauthenticated local demo.
- `ConflictError` is a `oneOf` of complete closed schemas. This avoids a closed
  `allOf` base accidentally rejecting legitimate `changes` details.
- Resolved offers include `productName`, so Orders needs no extra catalog lookup.
  Batch resolution preserves request order and returns no partial success.
- OpenAPI `uniqueItems` cannot enforce unique `offerId` fields across different
  objects; Orders additionally enforces this in code.
- Swagger Parser + Ajv draft-04/formats support the schema subset used here, not
  every OpenAPI-only keyword. New semantics such as `nullable` need review.

### Deliberately small scope

Sequential idempotency fingerprints validated request fields in a fixed property
order; item-array order matters. Successful keys persist with the snapshot.
Failed attempts retain no successful key. No in-flight coordination, expiry or
high-concurrency guarantee is implemented. See [checkout rules](architecture.md).

No payment, authentication, reservation/decrement, supplier network services,
distributed transactions, Pact, hosted preview or broad UI regression framework
is included. Live-NBP smoke remains optional and unimplemented.

## How to run

Use the [README quickstart](../README.md#run-the-demo),
[test selections](test-strategy.md#how-to-run) and
[contract commands](contract-testing.md#how-to-run).
Operational configuration belongs in the [demo](demo.md) and
[frontend](frontend.md) guides, not this decision record.
