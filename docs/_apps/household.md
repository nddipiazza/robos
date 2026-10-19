---
title: "RobOS Household"
package: household
category: household
icon: household.svg
summary: "Family financial-year sandbox: six account types, statement reconciliation, spending categories, split purchases, PDF tax review and local federal tax estimates."
description: "A runnable browser prototype for an invented family's financial year, from January statements and everyday spending to February tax preparation."
---

> **Looking for the full walkthrough?** See the step-by-step visual guide with E2E screenshots of a family's financial year from January to tax season: [rowbose.com/family-finances](https://rowbose.com/family-finances/).

RobOS Household is a development lifecycle sandbox (`packages/household`) that exercises a synthetic family's financial year across five recurring workspaces:

| Workspace | What it does |
|---|---|
| **Family** | Onboards adults, dependents, dated placement records and residency nights without requiring logins for children. |
| **Accounts** | Imports CSV statements across checking, savings, credit card, car loan, investment and cash accounts, reconciling every closing balance against statement totals and preventing duplicate imports. |
| **Spending** | Aggregates annual spending, cash income and charitable donations across categories (excluding transfers and loan principal), with support for category corrections and split transactions. |
| **Taxes** | Extracts text and coordinates from W-2 and 1099-INT PDFs via PDF.js, blocks calculation until critical fields are reviewed and approved, and calls TenForty / OpenTaxSolver locally for a federal estimate and preparation checklist. |
| **Privacy & storage** | Enforces an in-memory session boundary (`/dev/shm` for temporary engine files, zero `localStorage` or `sessionStorage`), locks production imports until the approved cloud-provider contract is connected, and keeps IRS electronic submission disabled. |

## Running it

```bash
cd packages/household
npm ci
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
npm test
npm run test:e2e
npm start
```

The service listens on `127.0.0.1:4317`. See the [full product specification]({{ '/ideas/specs/robos-household.html' | relative_url }}) and the [public walkthrough](https://rowbose.com/family-finances/).
