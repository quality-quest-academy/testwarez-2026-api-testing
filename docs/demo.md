# Demo and Bruno exploration

## What

The local demo runs Products, Orders, frontend and mock NBP. The small
[Bruno collection](../bruno/) follows one numbered HTTP story, with light checks
and runtime-only captured values. No credentials, live NBP or database inspection
is needed.

## Why

A request collection helps discover fields, conflicts and retries. It does not
replace isolated business assertions, schema generation or CI. Manual exploration
mutates state, so use a disposable project rather than reset development data.

## How to run

For ordinary persistent use, follow the [README quickstart](../README.md#run-the-demo).
Ports bind to **127.0.0.1 only**: UI 5173, Products 3001, Orders 3002, mock NBP 3003.
Each backend has `/health`. Never tunnel or publicly expose the unauthenticated lab.

### Disposable exploration

Run from the repository root with Docker Compose v2. Ensure all four host ports
are free; do not stop someone else's stack. A new project isolates volume names,
**not ports**. Keep the project variable in this terminal for cleanup.

```powershell
$demoProject = 'tw-explore-' + [guid]::NewGuid().ToString('N')
docker compose --env-file .env.example -p $demoProject up --build --wait --wait-timeout 90
```

POSIX shell equivalent: set `demoProject=tw-explore-$(date +%s)-$$` and use
`"$demoProject"` with the same Compose commands. Never reuse/adopt an existing
project. Use this same explicit project for every stop/reset command below.

Fresh Products data includes offer-101 (`89.00`, version 3, stock 8), offer-205
(`35.00`, version 2, stock 12) and unavailable offer-102. NBP supplies invented
rate `4.3000`, date `2026-10-21`; Orders starts empty.

### Run the collection

Install [Bruno desktop](https://docs.usebruno.com/get-started/bruno-basics/download)
and **open the existing `bruno/` folder as a collection** (do not import OpenAPI).
Select **Local**, keep the Safe JavaScript sandbox, then send requests **01–12 in
order in the same session**. Inspect each response before continuing. Request 07
changes Products; request 10 is the explicit decision to accept reviewed values
and submit, not an automatic retry triggered by a conflict.

Alternatively, with Node 24.11.1/npm 11.6.2, replay the whole scripted story from
another terminal. This pinned CLI needs no global installation or repository
dependency and uses the Safe sandbox:

```sh
cd bruno
npx --yes --package @usebruno/cli@4.3.0 bru run --env Local --sandbox safe --bail --noproxy
cd ..
```

Run from `bruno/`, not the repository root. No `.env` is needed; do not copy one
into the collection or enable secret managers. Initial CLI download needs internet.
Do not use parallel execution or repeat iterations against mutated state.

| Request | Expected observation |
| --- | --- |
| 01 Catalog | `200`, two products with supplier offers; one unavailable offer |
| 02 Capture accepted offers | `200`; captures current expectations and two fresh keys, asserts fresh seed |
| 03 Create order | `201`, `213.00 EUR × 4.3000 = 915.90 PLN`; captures ID/body/Location |
| 04 Read snapshot | `200`, same stored body |
| 05 Replay successful checkout | `201`, identical body/Location under the same key |
| 06 Change payload under successful key | `409 IDEMPOTENCY_KEY_REUSED` |
| 07 Change offer | `200`, offer-101 becomes `90.00`, version 4 |
| 08 Submit stale expectations | `409 OFFER_CHANGED`, old/new price and version, using the other key |
| 09 Review current offers | `200`; captures reviewed values without submitting an order |
| 10 Accept reviewed cart and submit | `201`, `215.00 EUR → 924.50 PLN`; reuses the failed key |
| 11 Unavailable offer | `409 OFFER_UNAVAILABLE` |
| 12 Invalid quantity | `400 VALIDATION_ERROR` |

Runtime captures are not written to the versioned environment. Requests 03–10
depend on earlier captures; reopening Bruno loses them. For another full run,
recreate the disposable data and start at 01. A failed seed assertion means
**stop and reset your disposable project**, not change expected results.

Replaying a successful key never checks current offers. A stale-cart scenario
therefore needs a different key. Restoring a price does not restore its version;
PATCH increments versions only on a real change. Dependency-failure exploration
is shown in the [automated API cases](../tests/api/orders.spec.ts), not a runtime
mock-control endpoint (none exists).

### Stop or deliberately reset

From the repository root in the terminal that owns `$demoProject`:

```powershell
# Stop but retain this project's data:
docker compose --env-file .env.example -p $demoProject down

# DESTRUCTIVE: delete ONLY this disposable project's databases and saved keys:
docker compose --env-file .env.example -p $demoProject down --volumes --remove-orphans
```

To repeat, run its startup command again, then 01–12. Finish with destructive
cleanup when the disposable session is over. For the ordinary default project,
`docker compose --env-file .env.example down -v` permanently deletes **all its
Products/Orders data and idempotency records**; never use it as routine teardown.

Products seeds missing records idempotently; reopening does not restore changed
offers. Orders reopens history without reseeding. For explicitly configured local
SQLite files, stop all owning processes before deleting only the intended database
and optional `-wal`/`-shm` companions. New Products stores reject fractional
stock/version values; old schemas are not silently migrated or reset.

### Troubleshooting

- Port busy: identify its owner; choose a safe time instead of killing another stack.
- Stale seed/version: reset only your disposable project, then restart at 01.
- Missing captures: start at 01 in the same Bruno session; do not invent IDs/keys.
- Starting services outside Compose: listeners use `PORT`, `PRODUCTS_DATABASE_PATH`,
  `ORDERS_DATABASE_PATH`, `PRODUCTS_BASE_URL` and `NBP_BASE_URL`. Default file paths
  are `/data/*.db`; Orders' standalone NBP default is **live NBP**, unlike Compose.
  Use explicitly configured paths/URLs. App factories default to in-memory stores;
  tests override dependencies with private local HTTP listeners.
