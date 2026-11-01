# Frontend and browser tooling (KAN-14)

## Start locally

```sh
docker compose --env-file .env.example up --build
```

Open **http://localhost:5173**. Products, Orders and mock NBP use ports 3001,
3002 and 3003. Named development volumes persist between restarts; the README
documents the explicit, destructive full reset. Do not use developer volumes for
state-changing automated tests or exploration unless the owner approves it.

For UI development with the backend in Compose:

```sh
docker compose --env-file .env.example up --build products-api orders-api nbp-mock
npm ci
npm run dev:frontend
```

The last command runs in another terminal, with the UI again at port 5173.
Vite serves the local lab; its preview server is **not production hosting**.
Demo PATCH administration is unauthenticated. Do not expose this stack publicly.

### Configuration and browser CORS

The frontend host forwards `/api/products/*` and `/api/orders/*` to the two APIs.
This is local serving configuration, not a pricing service or API gateway. It
avoids adding browser-specific CORS behavior to the business APIs. The browser
uses **a direct cross-origin GET** for indicative FX, not this forwarding path.

Optional **process environment** (also listed in `.env.example`):

| Variable | Default | When used |
| --- | --- | --- |
| `FRONTEND_PRODUCTS_URL` | `http://localhost:3001` | Dev/preview server startup; Compose uses the internal service URL |
| `FRONTEND_ORDERS_URL` | `http://localhost:3002` | Dev/preview server startup; Compose uses the internal service URL |
| `FRONTEND_FX_URL` | `http://localhost:3003/api/exchangerates/rates/a/eur/` | Dev startup or **build time**; embedded in browser assets |

Vite's `envDir: false` disables dotenv loading, especially the repository's
credential-bearing root `.env`. Set frontend variables in the process shell,
not in that file. For example, to try live indicative FX in PowerShell:

```powershell
$env:FRONTEND_FX_URL = 'https://api.nbp.pl/api/exchangerates/rates/a/eur/'
npm run dev:frontend
# After stopping the server:
Remove-Item Env:FRONTEND_FX_URL
```

This changes only the browser's indication, not Orders' configured FX authority.
For a container build, override the frontend Dockerfile's `FRONTEND_FX_URL` build
argument; changing a running container's environment does not rewrite assets.
The default browser URL assumes the browser runs on the same machine as Compose.

**Verification on 2026-11-01:** Chromium, from a local Vite HTTP origin, read
the live NBP table-A EUR response with HTTP 200 and response type `cors`.
The local mock explicitly returns `Access-Control-Allow-Origin: *` for its
read-only FX route; the automated Chromium journey verifies a readable indication
through this direct path. No indicative backend fallback was necessary. This
one-off live check is not a required test or a promise about future NBP CORS
policy. If live FX fails, the UI marks the indication unavailable and leaves
Orders checkout independent. Revisit the approved read-only fallback if CORS
changes; do not make browser pricing authoritative.

## Cart, conflicts and retries

- `sessionStorage` keeps cart expectations and any uncertain checkout attempt
  across reloads in the same tab. Closing the tab loses them. Storage is not a
  trusted pricing source, and malformed saved state is rejected.
- Cart lines use offer IDs, quantities and the accepted EUR price/version.
  Decimal arithmetic is used only for display. No final amount or FX rate is
  sent to Orders; confirmation displays its returned immutable snapshot.
- A 409 blocks checkout and refreshes the catalog without changing accepted
  expectations. The UI shows old and current price/version/stock. Missing or
  insufficient offers must be removed or quantities adjusted. **Accept current
  offers** updates expectations but does not submit; **Place order** is a separate
  action. Failed refreshes leave acceptance disabled until a successful refresh.
- While submitting, cart edits and duplicate clicks are disabled. After an
  uncertain response/network failure (or a server failure), the same key and
  exact payload are retained; **Retry same checkout** is the only submission
  path until it resolves. Reload preserves this lock. This uses Orders' minimal
  sequential idempotency, not a high-concurrency protocol.
- If sessionStorage is unavailable, the UI warns: retries work in memory, but
  do not reload or close the tab during an uncertain checkout. Losing browser
  state can lose the ability to recover an order whose response was lost.
- There is no payment, reservation or stock decrement. A changed indicative FX
  rate alone does not cause a conflict.

## Automated browser regression

```sh
npm ci
npx playwright install chromium
npm run test:e2e
```

On Linux, `npx playwright install --with-deps chromium` also installs required OS
libraries. `npm run check` includes the browser gate; `npm test` remains the
browser-free unit/API/backend-integration selection.

The **one** Chromium scenario starts real Products/Orders listeners with separate
fresh temporary SQLite files, a real HTTP NBP mock, and a private Vite build and
preview server on ephemeral loopback ports. It never loads `.env`, touches Compose
volumes, or calls live NBP. It verifies unavailable-offer UI, multi-item cart and
reload persistence, a stale-version conflict requiring explicit review, then
catalog → cart → checkout → authoritative confirmation. Refresh/acceptance do not
automatically re-submit. A demo PATCH is test-data arrangement, not duplicated
API assertions. API suites remain responsible for the broader conflict,
calculation, persistence and idempotency matrix; pure cart transitions have
Vitest unit tests. No blanket retries or sleeps.

Failure screenshots and traces are retained in `test-results/`. A trace can be
opened with `npx playwright show-trace <path-to-trace.zip>`. Run test commands
sequentially: Playwright selections share the default output directory. Local
browser fixtures are not a substitute for Compose CI orchestration (KAN-15).

## Playwright MCP: later exploratory work

The owner-approved scope extension configures **`@playwright/mcp@0.0.84`** in
`opencode.jsonc`. It does not install a second regression runner or create an
exploratory test report. The exploratory session is a **separate initiative**.

Prerequisites: Node/npm, OpenCode V2, and **Microsoft Edge installed**. MCP uses
Edge (`--browser msedge`); the automated E2E independently uses Playwright's
downloaded Chromium. Pinning the MCP package avoids silently changing its tool
API. Its internal Playwright version is separate from `@playwright/test`.

1. Start an owner-approved disposable local stack. The normal development stack
   persists data; use a different Compose project and free ports/overrides when
   testing destructive scenarios. Do not reset existing volumes without approval.
2. Run `opencode mcp list` from the repository, or open `/mcps` in OpenCode. The
   `playwright` server should be connected. Reconnect it if an existing session
   has not picked up the new config. First startup may download the pinned npm
   package. Jira's credential setup is independent of Playwright.
3. In the later initiative, ask the agent to navigate to the approved loopback
   frontend URL using the Playwright tools. Use accessibility snapshots and
   inspect browser console/network evidence. Record observations separately from
   regression assertions; do not claim exploratory observations are CI coverage.
4. Close the MCP browser when done. `--isolated` keeps its profile in memory;
   closing discards browser state, **not backend database state**. Screenshots and
   other MCP output go to ignored `test-results/mcp/`; review before sharing.

Only loopback HTTP origins are allowed by default, WebMCP page tools are disabled,
and no personal profile, extension, credentials file or remote debugging session
is attached. These are **guardrails, not a security boundary**: redirects and
code-evaluation capabilities require agent permission discipline. Do not read
`.env`, tokens, local secret files or authenticated personal tabs through browser
tools. Do not loosen origin/file restrictions or explore external services as
part of this setup. The default local mock FX URL works with this policy; live
NBP probing is deliberately separate from MCP's local-only configuration.

Setup smoke verification: the configured MCP connected, launched isolated Edge,
and read the Compose frontend catalog and mock indication with no browser console
errors. This verifies installation/connectivity only, not an exploratory session.
