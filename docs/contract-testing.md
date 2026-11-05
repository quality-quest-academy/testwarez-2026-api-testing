# Contract checks

## What

Two authored **OpenAPI 3.0.3** documents describe the Products and Orders HTTP
boundaries. Contract lint, targeted response examples and generated Schemathesis
requests provide different feedback; none replaces business assertions.

## Why

- Schemathesis checks documented status codes, content types, required headers
  (including checkout `Location`), response schemas/formats and no server errors.
  Its explicit check list is response conformance, not every acceptance heuristic.
- [Targeted examples](../tests/contract/responses.spec.ts) validate real successful
  bodies and a real `409 OFFER_CHANGED`, then reject **copies** with numeric money,
  string stock, missing required fields or forbidden null. Production handlers
  are never broken for this demonstration. Expected rejection makes the test pass.
- A wrong total such as `"0.00"` still satisfies the schema. Exact totals,
  no-partial-write behavior and retries need [business tests](../tests/api/orders.spec.ts).
- A shared OpenAPI document is not consumer-driven contract testing. The optional
  [Pact example](pact.md) separately checks Orders' expectations against Products.
  Controlled mock NBP checks do not prove live-provider compatibility.

Generation previously found Products' malformed-JSON error using Fastify's default
envelope instead of `VALIDATION_ERROR`. The handler was fixed and an API regression
added; the schema was not weakened to conceal the mismatch.

## How to run

After `npm ci` with the [pinned Node/npm versions](../README.md#run-the-tests),
install [uv](https://docs.astral.sh/uv/getting-started/installation/) for `uvx`:

```sh
# Download Python/tool before the bounded test invocation (recommended first run).
uvx --python 3.12 --from schemathesis==4.32.7 schemathesis --version
npm run test:contract

# Targeted examples only; no Python/uvx needed, also included in npm run check.
npm run test:contract:examples
```

No Docker, browser binaries, credentials or existing stack is required. `uvx`
manages Python 3.12 and Schemathesis **4.32.7**. Initial downloads need internet;
test requests stay local. Playwright owns fixtures and invokes the **separate CLI**;
missing tooling or a nonzero exit fails rather than skips. The required CI
**Contracts** group runs the full command after a pinned-tool download step.

### Controlled setup and limits

| Setting | Current baseline |
| --- | --- |
| State | Per-test real Products/Orders listeners on ephemeral loopback ports; separate fresh in-memory SQLite stores; seeded Products, empty Orders; HTTP mock NBP at 4.3000 |
| Selected operations | All five Products and three Orders operations from the unmodified specs |
| History | A snapshot created over HTTP supplies the generated Orders history ID |
| Generation | Examples + positive/negative fuzzing; seed 2026; one CLI worker per API; max 20 fuzzing examples per operation |
| Bounds | 3-second requests, zero retries, stop after five failures; 100-second launcher watchdog below 120-second Playwright timeout |
| Cross-run state | Hypothesis database, Schemathesis cache and adaptive schema changes disabled |
| Deferred | Coverage/stateful phases, broader generation and stress/concurrency testing |

Explicit examples, probing and shrinking can add requests beyond the fuzzing
budget. Seed/configuration/state make runs reproducible, not byte-identical
(IDs, timestamps, ports and timing vary). Dictionaries mix known/missing Products
IDs; successful Orders history is deliberately reached. Selecting every operation
does **not** demonstrate every status, boundary or sequence; the focused conflict
example addresses a path missed by a historical generated run.

All apps/stores close after tests. Generated PATCH mutates only disposable state:
**never retarget these commands at a shared or public deployment**. No developer
files, volumes, `.env` or live NBP are used.

### Read a failure

```text
products POST /offers/resolve 200: /0/price must be string ({"type":"string"})
products POST /offers/resolve 200: /0 must have required property 'version' ({"missingProperty":"version"})
orders POST /orders 201: /total must be string ({"type":"string"})
```

These are illustrative expected diagnostics from deliberately changed copies.
Read **operation/status → JSON instance path → constraint**. Fix the producer or
agree an intentional contract change; do not loosen the schema just to get green.
The body-only Swagger Parser/Ajv draft-04 helper supports the current schema subset,
not all OpenAPI semantics (for example, new `nullable` use needs review).

Full CLI output includes constraints, actual responses and reproducing curl
requests. Logs, JUnit and HAR live under
`test-results/generated-Schemathesis-*/schemathesis/` locally. CI keeps them in
`test-results/contracts/results/`, with Playwright JUnit alongside, uploaded as
`contract-results` for seven days. Local Playwright runs replace their output;
save needed diagnostics first. HAR records generated traffic, not live-provider evidence.
Fixture ports disappear on teardown: rerun against fresh state rather than using
an old curl URL.

**Process limit:** the watchdog kills the `uvx` launcher, not a demonstrated
cross-platform descendant-process supervisor. Forced interruption can leave child
processes; ordinary teardown tests do not prove cancellation safety.
