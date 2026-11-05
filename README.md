# TestWarez 2026 — API Testing Strategy

A small educational repository about **choosing API tests deliberately**, not
building a production shop. Explore requests, compare tests in code with OpenAPI
checks, control data and dependencies, and see how CI combines the evidence.

The example is a multi-item EUR cart checked out in PLN. Products owns supplier
offers; Orders validates the cart and saves the final price. The browser's FX
conversion is only indicative.

```text
Browser ──> Products API ──> products.db
        └─> Orders API ────> orders.db
               └── HTTP ──> Products + NBP mock
Browser ── indicative FX ──> NBP mock
```

## Run the demo

Clone [the repository](https://github.com/quality-quest-academy/testwarez-2026-api-testing)
and run this from its root with Docker Desktop / Docker Compose v2 available:

```sh
docker compose --env-file .env.example up --build
```

Open **http://localhost:5173**. Products, Orders and mock NBP are on ports
3001, 3002 and 3003; each has `/health`. No credentials or host Node installation
are needed for Compose. Initial builds need internet access.

This is an **unauthenticated, loopback-only lab**, including a price-changing
PATCH endpoint. Do not expose it on a LAN, through a tunnel or on the public web.
`docker compose --env-file .env.example down` stops it but preserves data.
For safe disposable exploration and destructive reset instructions, see
[the demo guide](docs/demo.md).

## Run the tests

Use **Node 24.11.1**, **npm 11.6.2**, and [uv](https://docs.astral.sh/uv/getting-started/installation/)
(`uvx` on PATH for generated contracts):

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:contract
```

On Linux use `npx playwright install --with-deps chromium`. These commands start
their own private fixtures: no Compose, credentials or live NBP required.
Initial npm/browser/Python/tool downloads need internet access.

`check` covers lint, types, UI build, units, API/integration tests, targeted
contract examples and one browser journey. `test:contract` adds pinned
Schemathesis generation. Container wiring is a separate
[Compose system check](docs/test-strategy.md#compose-system-checks).

## Explore and learn

| Start here | What you will find |
| --- | --- |
| [Presentation slides (PDF, 68 MiB)](docs/conference-slides.pdf) | Original Polish slide deck for the talk |
| [Demo and Bruno](docs/demo.md) | Setup, numbered requests, expected results and reset |
| [Conference walkthrough](docs/conference-walkthrough.md) | Five decisions, runnable examples and offline presentation notes |
| [Test strategy](docs/test-strategy.md) | Test selection, CI evidence and a strategy checklist |
| [Contract checks](docs/contract-testing.md) | Schema failures, generation limits and diagnostics |
| [Architecture](docs/architecture.md) | Checkout rules, data ownership and intentional limitations |
| [Decisions](docs/decisions.md) | Stack choices and tradeoffs |
| [Frontend](docs/frontend.md) | UI development, FX configuration and retries |
| [Browser exploration](docs/browser-exploration.md) | Optional agent tooling, separate from regression coverage |

Most business coverage is at API level; Vitest is units only. Controlled NBP
tests do not prove live-provider compatibility. Stock is not reserved or
decremented, and idempotency demonstrates sequential retries—not concurrency
hardening. There are no payments, accounts or fulfillment.

## License

[MIT](LICENSE) · Quality Quest Academy ·
[Repository](https://github.com/quality-quest-academy/testwarez-2026-api-testing)
