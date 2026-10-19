# robos.tax

Public schema package for **RobOS Household**. This package contains no household
data or financial documents. A separate [synthetic browser sandbox](../household/README.md)
now exercises imports, PDF review and a federal estimate. Production storage,
scanned OCR and filing remain unimplemented. See [the app specification](../../docs/ideas/specs/robos-household.md).

- `kgraph/package.jsonld`: independently loadable public KGraph package, namespace
  `robos.tax`; domain terms and selected 2025 form/field definitions with IRS sources.
- `household.schema.json`: JSON Schema 2020-12 contracts for future private graph
  instances. These contracts describe data; they do not enforce authorization,
  cryptography, tax eligibility, accounting invariants, or filing readiness.
- `tests/`: synthetic in-memory validation examples. Requires Node.js and Python `jsonschema`
  (`python3 -m pip install -r requirements-dev.txt`); run `npm test`.

The catalog passes RobOS's structural checks. Custom tax classes do not have built-in
SHACL shapes/classification mappings; instance validation here uses JSON Schema.

The initial field catalog is **partial**, covering key W-2 boxes and 1099-INT boxes
for 2025. Repeated state/local W-2 rows, box 12 codes, identity/address blocks and
additional forms require later definitions. Catalog presence is not calculation,
extraction or filing support. Every field ID includes year, jurisdiction and form.
Pin the authoritative form revision before extending it; never apply it to another
year just because the label matches.

Select storage through the existing **RobOS cloud providers app's approved-provider
registry**; do not introduce a second approval list. `Household.approvedCloudProviderId`
references that registry. Its API binding is an implementation prerequisite and is
not provided by this schema package.

All persistent instance records—including extracted text, indexes, audit records,
dependents, and bank transactions—must live in a verified private cloud vault.
Do not import instances through the Git-backed RobOS graph store or save them in
local config. The JSON-LD catalog contains only public definitions, not instances.

The package is staged outside the live `.robos/kgraphs/` catalog because the current
workspace's package files and compatibility aggregate disagree. It is **not yet
registered** with KGraph Explorer. After that baseline is reconciled, import only
`kgraph/package.jsonld` through the reviewed graph proposal/apply workflow and add
its catalog entry. Never use that workflow for household instance records.

Upstream vocabulary: Schema.org (`robos:refersFrom` on each term). Authoritative form
sources: [2025 W-2](https://www.irs.gov/pub/irs-prior/fw2--2025.pdf) and
[1099-INT](https://www.irs.gov/pub/irs-prior/f1099int--2024.pdf), revision January
2024, applicable catalog year 2025. These are public form references, not a complete
tax-law ruleset or the IRS's MeF XML schemas.
