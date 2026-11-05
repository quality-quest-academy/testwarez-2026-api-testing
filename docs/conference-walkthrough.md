# Conference walkthrough: five API-testing decisions

## What

A self-contained reading/rehearsal route for *“Kolekcja requestów to jeszcze nie
testy. 5 kroków do świadomej strategii API”*. Use the repository examples to explain
tradeoffs, not to showcase a large framework.

## Why

The talk must work **without a successful live demo**. Prepare local source files,
the excerpts below and selected screenshots before presenting. Commands are for
attendee reproduction or rehearsal, not mandatory on-stage execution.

## How to rehearse

Use the [README prerequisites](../README.md), then the [disposable demo](demo.md).
Run tests in a separate terminal; they own their data. Stop/clean the manual stack
before running Compose system checks because they use the same host ports.

### 1. Exploration is useful, but what makes it regression evidence?

- **Show:** Bruno requests 01–06 from [the demo sequence](demo.md#run-the-collection).
- **Observe:** creation, history and replay are different questions even when
  responses look similar. A green HTTP status alone does not establish correctness.
- **Compare:** [Orders API tests](../tests/api/orders.spec.ts) assert exact amounts,
  stored-row counts and dependency calls, including retry/failure behavior.
- **Limit:** Bruno's light checks support this story, not an exhaustive regression suite.

### 2. When do tests as code pay off?

```sh
npm run test:integration
```

- **Show:** [checkout and reconfirmation](../tests/integration/checkout.spec.ts).
- **Observe:** literal expected totals, explicit arrange/act/assert steps and fixtures
  that own fresh stores. The second stale variant changes stock/version but not price.
- **Limit:** real Products + Orders with mock NBP demonstrates HTTP integration,
  not container wiring, provider reachability or inventory reservation.

### 3. What can a contract catch—and miss?

```sh
npm run test:contract:examples
# After downloading the pinned tool as described in the contract guide:
npm run test:contract
```

- **Show:** [response examples](../tests/contract/responses.spec.ts): numeric price
  rejected; a real `OFFER_CHANGED` accepted; incorrect `"0.00"` total still schema-valid.
- **Observe:** request generation explores beyond hand-written examples; diagnostics
  identify operation, JSON path and violated constraint.
- **Limit:** all operations selected does not mean all statuses/sequences covered.
  Schema conformance is neither correct arithmetic nor consumer-driven contracts.

### 4. Is a fresh container enough isolation?

- **Show:** [private backend fixtures](../tests/helpers/backend.ts), then
  [Compose orchestration](../scripts/compose-system.mjs).
- **Observe:** separate Products/Orders files, new state per scenario, controlled
  FX and ownership-based cleanup. Containers with reused volumes are not fresh data.
- **Run:** the [Compose commands](test-strategy.md#compose-system-checks), including
  failure probes and fallback cleanup, with the manual stack stopped.
- **Limit:** ordinary cleanup probes do not prove safety after forced process/runner loss.

### 5. What does the pipeline tell us to do next?

- **Show:** [workflow groups](../.github/workflows/ci.yaml) and a run summary:
  Static → static consistency; Isolated → business evidence; Contracts → wire
  conformance; Compose system → runtime wiring plus the one browser journey.
- **Observe:** [the deliberately wrong-total PR](https://github.com/quality-quest-academy/testwarez-2026-api-testing/pull/2)
  failed Compose system and was blocked. Use it as historical failure evidence,
  not a claim about today's revision or still-available artifacts.
- **Limit:** uploaded artifacts are not successful check conclusions. Missing
  evidence, teardown failure or a red browser check cannot be ignored to merge.

## Offline presentation excerpts

These are **curated expected excerpts**, not a captured current CI run. UUIDs and
timestamps are intentionally omitted. Keep the explanatory limits on the slide.

```text
Fresh checkout: 201 Created
  subtotalEUR: "213.00", exchangeRate: "4.3000", total: "915.90"
Same key + same payload: 201, same ID/body/Location
Same successful key + changed quantity: 409 IDEMPOTENCY_KEY_REUSED

After offer-101 changes from 89.00/version 3 to 90.00/version 4:
  fresh key + old expectations: 409 OFFER_CHANGED
  explicit review + corrected expectations: 201, total: "924.50"

Schema: /0/price must be string          (numeric price rejected)
Schema: total "0.00" is valid           (business arithmetic can still be wrong)
CI: Required status check "Compose system" is failing.
```

Before the talk, save reviewed screenshots of Bruno's replay/conflict, a contract
diagnostic and a CI summary under ignored `exploration-reports/`. Copy approved
ones into your slide deck; exclude credentials, environment dumps, local databases,
personal profiles and private planning/tracker content. Source snippets and the
excerpts above remain a fallback even if screenshots or network access are unavailable.

## Repository link and QR preparation

Link: **https://github.com/quality-quest-academy/testwarez-2026-api-testing**

Use [the repository QR SVG](assets/repository-qr.svg) on the closing slide, alongside
the readable URL. To regenerate locally (no QR-upload service), from the repo root:

```sh
npx --yes --package qrcode@1.5.4 qrcode --type svg --error H --output docs/assets/repository-qr.svg https://github.com/quality-quest-academy/testwarez-2026-api-testing
```

Scan the exported slide from a second device, confirm the exact destination and
check intended attendee access before distributing it. Only the owner decides
repository visibility; publication is not required to finish these materials.
Code and documentation use the existing [MIT license](../LICENSE).
