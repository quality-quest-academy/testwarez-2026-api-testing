# Contract checks (KAN-12)

## Run

Use the repository's Node/npm versions and `npm ci`. The generated stage also
requires [uv](https://docs.astral.sh/uv/getting-started/installation/) (`uvx` on
PATH). No Docker, credentials, browser binaries or running developer stack are
needed. `uvx` manages Python 3.12 and the pinned Schemathesis **4.32.7** tool in an
isolated environment. Initial setup needs internet access to download the tool
and, if necessary, Python; test requests themselves are local only.

```sh
# Optional: download/check the tool before the bounded test run.
uvx --python 3.12 --from schemathesis==4.32.7 schemathesis --version

# Required generated checks for both APIs + deliberate response examples.
npm run test:contract

# Only the targeted examples, without Python/uvx (also included in npm run check).
npm run test:contract:examples
```

Playwright orchestrates the HTTP fixtures and invokes the **separate Schemathesis
CLI**; it does not replace generated testing with hand-written requests. The
exact invocation is printed by `tests/contract/generated.spec.ts`. A nonzero CLI
exit or an unavailable tool fails the test, rather than silently skipping it.
`npm run check` stays Python-free; run **both** `npm run check` and
`npm run test:contract` for the complete local gate. GitHub Actions runs this full
command in the required **Contracts** check, after a separate pinned-tool download
step. npm and uv downloads are cached, not generated test state.

## Controlled setup and generation budget

- Each test starts real Products and Orders Fastify listeners on ephemeral
  loopback ports, with independent fresh **in-memory SQLite** stores. Products
  gets its deterministic seed; Orders starts empty. Services use HTTP, never
  cross-database reads. Each test has its own NBP HTTP mock with the illustrative
  `4.3000` rate. No live NBP default, `.env`, fixed ports or Compose volumes are
  used. All apps/databases are closed after the test, including assertion failure.
- For generated Orders checks, a snapshot is created via HTTP before the CLI
  starts. `orders.toml` supplies that run's ID for `GET /orders/{orderId}` so the
  generated stage exercises successful history reads, not just unknown IDs.
  Unknown IDs remain covered by isolated API tests. Products dictionaries mix
  seeded and missing IDs while leaving room for other generated values.
- All **five Products operations** and **three Orders operations** are selected
  from the unmodified authored OpenAPI files. No endpoint is filtered out.
- Enabled phases: **examples + fuzzing**, with positive and negative generated
  data, seed **2026**, **one Schemathesis worker** per private API instance and
  at most **20 fuzzing examples per operation**. Explicit examples, probing and
  shrinking can add requests beyond that limit. Coverage and stateful exploration
  are deliberately disabled to keep this small required check bounded, not a
  stress/concurrency suite. Generation does not prove exhaustive coverage.
- Requests time out after **3 seconds**, with **zero retries**. The run stops
  after five failures; the harness kills the CLI after 100 seconds, below the
  120-second Playwright timeout. Pre-download the tool on a slow first setup.
- Hypothesis's example database and Schemathesis's cross-run cache are disabled.
  Adaptive error-feedback schema changes are also disabled. Previous runs cannot
  silently change the next required check. Seed/configuration/state make this
  reproducible; UUIDs, timestamps, ports and timing are not byte-for-byte fixed.
- PATCH is allowed to modify **only its test's disposable store**. Parallel
  Playwright tests never share state. Do not point these commands at a public or
  shared deployment: generated mutation requests are not read-only.

## What is checked

Selecting all eight operations is not exhaustive input, boundary, status or
sequence coverage. Increasing example counts does not automatically improve
business-rule coverage: generated contract checks complement explicit business
assertions, rather than replace them. The KAN-17 decision retains the current
bounded baseline; broader generation remains deferred.

Schemathesis checks:

1. No server errors.
2. Documented HTTP status codes.
3. Response content types.
4. Response headers, including required checkout `Location`.
5. Response bodies against their OpenAPI schemas, including formats.

The explicit check list is intentional. This stage checks **response contract
conformance**, not every Schemathesis heuristic. It generates invalid requests
but does not claim to prove complete input rejection: business conflicts,
duplicate offer IDs, coercion rules and persistence effects have explicit
Playwright API tests. Enabling additional acceptance/rejection checks or broader
phases is a separate, reviewed expansion, not a way to reinterpret the contract.

Schemathesis already found a real defect during implementation: Products'
malformed-JSON 400 response used Fastify's default fields/code instead of the
documented `VALIDATION_ERROR` envelope. The response was fixed, not excluded from
generation or hidden by relaxing the schema. An isolated API regression covers
both Products body endpoints.

## Deliberate breaking examples and diagnostics

`tests/contract/responses.spec.ts` also obtains one real **409 OFFER_CHANGED**
response after updating a previously accepted offer through Products HTTP, then
validates its body against the authored Orders conflict schema. This focused
case uses the same private stores and mock NBP; it demonstrates an error-response
contract path missed by the historical generated run inspected in KAN-17. It does
not establish exhaustive conflict coverage or replace business/persistence
assertions. It runs in the existing targeted examples and full contract suites,
without a new CI gate or a larger generation budget.

The same file obtains actual successful HTTP responses, validates them, then
changes **copies in the test**, never production handlers.

The small case factories in `tests/contract/data/response-cases.ts` define the
mutations and expected diagnostics; labeled steps in the spec run the assertions:

| Response change | Why it fails |
| --- | --- |
| Offer `price: 89` | Money must be a decimal **string**, not a number |
| Offer `stock: "8"` | Stock must be an integer |
| Missing offer `version` | Required property is absent |
| Offer `productName: null` | String does not permit null |
| Order `total: 765.4` | Settlement money must be a string |
| Missing order `exchangeRateDate` | Required snapshot property is absent |

Each negative case **passes only if the validator rejects the broken response**
and reports the expected reason. These are not intentionally failing test suites.
Example output:

```text
products POST /offers/resolve 200: /0/price must be string ({"type":"string"})
products POST /offers/resolve 200: /0 must have required property 'version' ({"missingProperty":"version"})
orders POST /orders 201: /total must be string ({"type":"string"})
```

Read the service/operation/status, JSON instance path and expected constraint;
then fix the response producer or deliberately agree a contract change. The
body-only helper uses Swagger Parser + Ajv draft-04/formats for the JSON Schema
subset currently used here. It is **not** a general OpenAPI 3.0 validator (for
example, new `nullable` semantics would require revisiting it); Schemathesis
provides the separate HTTP-level generated checks.

CLI output is saved as `schemathesis.log` and attached to the Playwright result.
The log, JUnit XML and HTTP HAR reports
are saved under `test-results/generated-Schemathesis-*/schemathesis/`; these are
gitignored and replaced by later Playwright runs. In CI the isolated
`test-results/contracts/results/` directory holds these files and
`test-results/contracts/junit.xml` holds Playwright's report; subsequent suites do
not erase them. The `contract-results` artifact retains them for seven days.
On failure the full CLI output
includes the operation, schema constraint, actual response and reproducing curl
request. Fixture ports disappear after teardown: rerun the command against fresh
state rather than expecting an old curl URL to remain available. HAR files make
the generated requests/statuses inspectable; they are not live-provider evidence.

## Contract is not business correctness or consumer-driven testing

- **OpenAPI/schema checking** verifies the provider's documented wire format. An
  order with `total: "0.00"` still passes its schema even when the correct total
  is different; the targeted example demonstrates this limitation explicitly.
- **Business assertions** prove calculations, stale-offer handling, all-or-nothing
  persistence and sequential idempotency with known inputs. Existing isolated
  Playwright tests perform these checks; generated tests complement them.
- **Consumer-driven contract testing**, such as Pact, records a specific
  consumer's expectations and verifies the provider against those interactions.
  This repository does not implement it. A shared OpenAPI document is not Pact.
- Real APIs with **mock NBP** are controlled contract/integration evidence, not
  proof that the real NBP API is reachable or compatible today. Dedicated backend
  integration business scenarios belong to KAN-13; browser E2E belongs to KAN-14.
  No inventory reservation or high-concurrency idempotency guarantee is implied.
