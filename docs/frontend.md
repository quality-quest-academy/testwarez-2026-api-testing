# Frontend

## What

Vite + Vanilla TypeScript displays supplier offers, a same-tab multi-item cart,
indicative PLN conversion and the authoritative Orders confirmation.

## Why

The UI demonstrates boundaries rather than a full storefront:

- `sessionStorage` preserves accepted EUR prices/versions and uncertain attempts
  across reloads, not tab closure. Malformed saved state is rejected.
- Browser FX is indicative only; checkout sends IDs, quantities, expected
  prices/versions and a key—not a final amount or exchange rate.
- A conflict refreshes offers **without accepting them**. Review old/current
  values, adjust unavailable lines, choose **Accept current offers**, then separately
  **Place order**. Failed refresh keeps acceptance disabled.
- An uncertain/network/5xx result retains the exact payload/key and locks cart
  edits. **Retry same checkout** recovers via sequential idempotency, including
  after reload. If storage is unavailable, the warning means recovery is only
  in memory: do not reload/close during an uncertain attempt.
- No payment, reservation or stock decrement occurs. A changed indicative FX
  rate alone does not cause a checkout conflict.

## How to run

Use the [Compose quickstart](../README.md#run-the-demo) for the whole demo.
For UI development, start only the backends from the repository root:

```sh
docker compose --env-file .env.example up --build products-api orders-api nbp-mock
```

In another terminal, with the [Node/npm baseline](../README.md#run-the-tests):

```sh
npm ci
npm run dev:frontend
```

Open **http://localhost:5173**. Vite dev/preview is local lab serving, not production
hosting. Use [disposable exploration](demo.md) before mutating data you want to keep.

### Configuration and CORS

The UI host forwards `/api/products/*` and `/api/orders/*` to the APIs; it does not
price orders or implement a gateway. Indicative FX uses a **direct cross-origin GET**.

| Process variable | Default | Applied |
| --- | --- | --- |
| `FRONTEND_PRODUCTS_URL` | `http://localhost:3001` | Dev/preview startup; Compose uses its service URL |
| `FRONTEND_ORDERS_URL` | `http://localhost:3002` | Dev/preview startup; Compose uses its service URL |
| `FRONTEND_FX_URL` | `http://localhost:3003/api/exchangerates/rates/a/eur/` | Dev startup or **asset build time** |

Set variables in the shell, not root `.env`; Vite `envDir: false` disables dotenv
loading. Changing a running container's FX environment does not rewrite assets;
override its Docker build argument instead. The browser runs on the Docker host.

Optional manual live-indication check (PowerShell; outside deterministic tests):

```powershell
$env:FRONTEND_FX_URL = 'https://api.nbp.pl/api/exchangerates/rates/a/eur/'
npm run dev:frontend
# After stopping the server:
Remove-Item Env:FRONTEND_FX_URL
```

This does not change Orders' FX configuration. A local Chromium/live-NBP CORS check
succeeded on 2026-11-01; it is not a future compatibility promise. The mock permits
read-only FX CORS and the automated journey checks that path. No backend indicative
proxy is implemented. Unavailable indication does not block Orders; reassess a
read-only fallback if live CORS policy changes.

### Browser regression

```sh
npx playwright install chromium
npm run test:e2e
```

The single journey builds private UI assets and runs real APIs with separate fresh
SQLite files and mock NBP. It checks unavailable offers, reload, explicit stale-offer
review and final confirmation. API tests own the broader business matrix. Current
indicative/final fixture rates match; this is not differing-rate coverage.
`npm run check` includes it; `npm test` is browser-free. For failure traces and
container execution see [test strategy](test-strategy.md).

[Optional agent-driven browser exploration](browser-exploration.md) is separate
from this regression test.
