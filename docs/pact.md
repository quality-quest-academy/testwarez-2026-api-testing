# Optional Pact example: Orders → Products

## What and why

One **consumer-driven contract** for `POST /offers/resolve`, alongside—not instead
of—the existing OpenAPI/Schemathesis checks. Orders is the consumer; Products is
the provider. No Pact Broker, hosted account, Docker or application changes.

```text
Real Orders ProductsClient → Pact mock Products
                                  ↓ generates
                         Orders-Products.json
                                  ↓ Pact verifier replays
                         Real Products HTTP API
                         + fresh in-memory SQLite
```

- **OpenAPI/Schemathesis:** does the API conform to its published specification?
- **Pact:** can Products satisfy the expectations exercised by this Orders consumer?

## Run

Use the [repository's Node/npm versions](../README.md#run-the-tests), then:

```sh
npm ci
npm run test:pact
```

Pact JS is pinned to **17.1.4**; npm installs its platform-specific native tooling.
The example has been checked locally on Windows x64 with Node 24.11.1. Initial
installation needs internet. No browser binary, Python, credentials, live NBP,
developer database or running Compose stack is required. Tests use ephemeral
loopback ports; this configuration disables Pact's runtime usage metrics.

This is an **optional standalone command**: it is not included in `npm test`,
`npm run check`, `npm run test:contract` or the required CI checks.

## Read the two tests

1. [Consumer test](../tests/pact/consumer.spec.ts): describe one offer-resolution
   request and a usable response, then call the **actual Orders `ProductsClient`**
   against Pact's mock. Pact checks the outgoing request and writes the contract
   only after the consumer interaction succeeds. No handwritten HTTP client stands
   in for the production adapter.
2. Open `test-results/pact/contracts/Orders-Products.json`: the request, provider
   state, response examples and matching rules are generated from that test—not
   manually authored or derived from OpenAPI.
3. [Provider test](../tests/pact/provider.spec.ts): start real Products with its own
   fresh seeded SQLite, confirm the state `offer-101 exists`, and run Pact's
   verifier against its real HTTP endpoint. The provider owns its seed; Orders
   never reads the Products database. The app/database close even on failure.

The [Playwright configuration](../playwright.pact.config.ts) makes provider
verification depend on consumer generation. Each normal run removes only this
example's previous pact file before regenerating it. A failed consumer blocks the
provider; a missing file or failed verification is an error, not a silent skip.
Contracts are outside Playwright's `results/` cleanup directory so both projects
can read them. Other test commands may clean the wider `test-results/` directory;
rerun Pact or save a copy before presenting. Do not run concurrent Pact commands
against the same checkout.

## What the contract asks for

```http
POST /offers/resolve
Content-Type: application/json

{"offerIds":["offer-101"]}
```

The response is an array containing that offer, with only the fields Orders needs:

| Field | Expectation |
| --- | --- |
| `id` | Exactly the requested `offer-101` |
| `productName` | Nonempty string |
| `price` | Nonnegative decimal **string** with exactly two fractional digits |
| `currency` | Exactly `EUR` |
| `stock`, `version` | Integers, with examples `8` and `3` |

Matchers let values such as the price change without making this a snapshot test.
Products also returns product/supplier metadata; additional response fields are
allowed because this consumer does not need them. The full public response model
still belongs to the [OpenAPI contract](../contracts/products.openapi.yaml).

## Presentation and limits

Show the consumer test → generated JSON → provider test, then the successful
verifier output. Expected excerpt (not a captured CI result):

```text
Verifying a pact between Orders and Products
  an Orders request to resolve one offer for checkout
     Given offer-101 exists
      has status code 200 (OK)
      has a matching body (OK)
2 passed
```

Save actual successful output and the generated JSON before the talk so it does
not depend on a live run. There is deliberately no broken-provider demonstration.

This proves **one exercised HTTP interaction**, not checkout arithmetic,
multi-offer ordering, missing-offer behavior, NBP compatibility or every runtime
validation constraint. For example, these integer matchers do not encode stock's
lower bound or version's positive/safe-integer requirements. Existing API,
integration and schema tests remain necessary. The Orders server is not running
in this example—its real outbound client is.

Sharing a freshly generated local file keeps this monorepo demo small. It does
not demonstrate broker publishing, version selection, `can-i-deploy`, deployment
gates or independently released service compatibility.
