---
title: "RobOS Tax"
package: robos-tax
category: "libraries"
component_type: component
permalink: /robos-tax/
redirect_from:
  - /apps/robos-tax/
summary: "Public US tax KGraph vocabulary (`robos.tax`) and JSON Schema 2020-12 household data contracts with zero runtime financial storage."
description: "Public US tax ontology and JSON Schema 2020-12 contracts in packages/robos-tax for RobOS Household: W-2 and 1099-INT form field definitions pinned by tax year and IRS revision."
related:
  - /household/
  - /family-finances/
  - /schemas/
---

`packages/robos-tax` defines the public `robos.tax` Knowledge Graph vocabulary and JSON Schema 2020-12 data contracts used by [RobOS Household](/household/) (walkthrough at [Family Finances](/family-finances/)). The package contains only public schema definitions and synthetic validation fixtures—never personal household records or tax filings.

## Package contents

- **`kgraph/package.jsonld`**: Loadable JSON-LD KGraph catalog (`robos.tax` namespace) mapping Schema.org terms (`robos:refersFrom`) and 2025 IRS W-2 and 1099-INT box definitions with pinned revision citations.
- **`household.schema.json`**: JSON Schema 2020-12 contracts for private household ledgers, split transactions, tax documents, and `Household.approvedCloudProviderId` references to [RobOS Cloud Accounts](/cloud-accounts/).
- **`tests/`**: Offline synthetic schema and structure validation tests (`npm test`, backed by Node.js and Python `unittest` + `jsonschema`).

## Design boundaries

Every form field identifier pins its tax year, jurisdiction, and authoritative IRS form revision so multi-year ledgers never conflate boxes across tax years. Persistent household records stay outside Git in local or encrypted private cloud storage.

Source: [`packages/robos-tax`](https://github.com/nddipiazza/robos/tree/main/packages/robos-tax).
