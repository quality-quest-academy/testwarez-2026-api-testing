# Architecture and checkout rules

## What

Two TypeScript/Fastify APIs own independent SQLite stores. Suppliers are seeded
records, not network services. NBP is the external FX boundary; the default demo
and deterministic tests use its local HTTP test double.

```text
Browser (Vite + Vanilla TS)
  ├─ catalog/offers ──> Products API ──> private products.db
  ├─ checkout ────────> Orders API ────> private orders.db
  └─ indicative FX ──> NBP mock
Orders ── HTTP ──> Products + NBP mock
```

## Why

Products owns product/supplier metadata and versioned EUR offers. Orders must
revalidate expectations and own the final conversion; the browser is not a trusted
pricing source. Neither service opens the other's database.

### Checkout

1. Read the catalog and accept specific offer IDs, quantities, EUR prices and versions.
2. Submit `POST /orders` with an `Idempotency-Key`.
3. Orders validates input and checks previously successful keys before dependencies.
4. A new attempt resolves all offers in **one Products HTTP batch**.
5. Missing/insufficient offers produce `409 OFFER_UNAVAILABLE`; stale price/version
   produces `409 OFFER_CHANGED` with expected/current values. Conflicts skip FX.
6. Otherwise fetch **one** last-published table-A EUR/PLN NBP rate for the whole cart.
7. Calculate and atomically save the immutable snapshot plus successful key;
   return `201` with `Location: /orders/{id}`.
8. Historical GET reads the snapshot only, even after restart or dependency changes.

An invalid request returns `400 VALIDATION_ERROR`; unusable Products/NBP returns
`503 DEPENDENCY_UNAVAILABLE`. Failed attempts write neither order nor successful
key. All-or-nothing applies to the **Orders database**, not a distributed stock transaction.

```text
subtotalEUR = sum(quantity × currentUnitPriceEUR)
totalPLN = round_half_up(subtotalEUR × exchangeRate, 2)
2 × 89.00 + 1 × 35.00 = 213.00 EUR
213.00 × 4.3000 = 915.90 PLN
```

Money is a two-decimal string; the positive exchange rate is a four-decimal string.
`decimal.js` computes the final-only rounding, not binary floating point.

### Sequential retries

| Request | Result |
| --- | --- |
| New key, valid cart | New order, `201` |
| Successful key, identical validated payload | Original `201` body/Location, no new dependency calls |
| Successful key, changed payload | `409 IDEMPOTENCY_KEY_REUSED` |
| Failed key, corrected cart/dependency | Can be retried; no retained successful-key record |

JSON formatting/object-property order is ignored; item-array order matters.
Validation precedes replay. There is no in-flight coordination, key expiry/cleanup
or demonstrated high-concurrency replay protocol.

### Intentional limits

Stock is checked, **not reserved or decremented**. Another checkout can race after
validation. No payments, accounts/authentication, fulfillment, cancellation,
distributed transactions or independent supplier services exist. The unauthenticated
offer PATCH endpoint is local demo administration only. Mock success is not proof
of real NBP reachability or compatibility; live smoke is not implemented.

## How to run and inspect

Start with the [demo](demo.md), then read the authored
[Products](../contracts/products.openapi.yaml) and
[Orders](../contracts/orders.openapi.yaml) contracts for exact fields/statuses.

| Path | Responsibility |
| --- | --- |
| `apps/products-api/` | Catalog, supplier offers, private seed/store |
| `apps/orders-api/` | HTTP clients, calculations, snapshots and successful keys |
| `apps/frontend/` | Catalog/cart, conflict review, indicative conversion |
| `mocks/nbp/` | NBP-shaped fixture plus factory-only controlled failure modes |
| `tests/` | [Separate evidence levels](test-strategy.md) |
| `bruno/` | Numbered exploratory HTTP requests |
