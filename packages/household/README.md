# RobOS Household lifecycle sandbox

A runnable browser prototype for an invented family's financial year. This is not
the production Household app. It accepts only exact, allowlisted synthetic files
and keeps session records in memory. It never writes household records to Git,
local config, browser storage or a database. The OpenTaxSolver process uses
memory-backed `/dev/shm` for temporary files.

The existing RobOS cloud providers app must supply the approved-provider contract
before real-document intake can be implemented. No provider approval is simulated.
The static public walkthrough at `/family-finances/` contains synthetic screenshots;
it is not a hosted financial application.

## Run

Node 20.16+ and Python 3.12 are required (tested with Node 24). Install:

```sh
npm ci
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
npx playwright-core install chromium
npm test
npm run test:e2e
npm start
```

The service binds to `127.0.0.1:4317`. E2E uses an ephemeral port, generates all
fixture bytes in memory, uploads them through the real file controls, and writes
screenshots directly to `site/assets/family-finances/`. It uses no mocked backend,
parser, PDF renderer or tax-engine response. No external bank or IRS service is
called. Browser contexts have isolated sessions and CSRF tokens.

For manual file selection, fixture buffers are exported by `lib/fixtures.js`.
Do not substitute personal files; all non-fixture input is rejected.

## What is exercised

- A family of two adults and two children, dated placements and residency nights.
- Six account types and 318 CSV rows covering twelve months of take-home payroll,
  transfers, interest, everyday expenses, donations, quarterly bills and a refund.
- Stable-source-ID deduplication, statement-balance checks, category corrections,
  and a two-way purchase split that preserves the original amount.
- A simulated February 15, 2026 preparing the 2025 tax year.
- Actual PDF.js text extraction from two generated W-2 PDFs and one 1099-INT.
  A deliberately ambiguous text token requires manual correction. The GUI
  highlights the extracted field's source coordinates. This is not scanned OCR.
- Review gates, a real TenForty 2025.11/OpenTaxSolver calculation, and invalidation
  when a reviewed document changes.
- An explicit child-credit supplement for the fixed, confirmed family scenario.
  TenForty's `num_dependents` does not itself apply these credits. The supplement
  is based on the [IRS 2025 child-credit requirements](https://www.irs.gov/credits-deductions/individuals/child-tax-credit).
- A filing checklist with the submission control disabled. No IRS form or filing
  payload is generated. No return is transmitted or marked accepted.

Expected annual figures are independently specified in tests: $47,905 spending,
$92,688 net cash income, $71,483 closing net worth, $1,200 donations, $120,288 AGI,
$88,788 taxable income, $10,176 engine tax before credits, $4,400 modeled child credits,
and an $8,224 refund estimate before other credits. Other credits, including
dependent-care credits, state returns and general eligibility are unsupported.
This is not a complete return or a production tax-law implementation.

## Reuse and boundaries

Papa Parse handles CSV parsing, PDF.js handles extraction/rendering, pdf-lib
generates synthetic source documents, and TenForty invokes OpenTaxSolver. The
small ledger is limited to the fixed fixture format. OFX/QFX, real account linking,
scanned OCR, production membership, encrypted cloud persistence and e-file are
still planned. See [the full specification](../../docs/ideas/specs/robos-household.md)
and the public [robos.tax contracts](../robos-tax/README.md).

This browser sandbox is not registered as an installed Electron desktop app.
The live KGraph import remains pending the existing aggregate/package mismatch;
private instance records must never use that Git-backed store.
