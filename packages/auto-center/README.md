# RobOS Auto Center

Auto Center is the first desktop app in the **RobOS Auto** family. It searches public automotive reference data, decodes a supplied VIN through NHTSA, and saves owner-entered vehicles and service records in a private local KGraph.

## Run

From the repository root:

```bash
python3 packages/auto-center/collect.py --vehicle 2015 Toyota Camry
node --max-old-space-size=8192 packages/auto-center/cli.js --apply
cd packages/auto-center
npm install
npm start
```

`--vehicle YEAR MAKE MODEL` is optional; it requests actual NHTSA model-level recall and complaint responses. The example is a public reference query, not a claim about a vehicle owned by the user. Collection caches successful sources; `--refresh` downloads them again. Failures remain visible in the manifest and cause a nonzero collector exit. Existing downloads remain available. Source downloads run sequentially with delays and bounded retries.

The UI's **Sources & imports** page collects sources, prepares a proposal, and shows changes, validation errors and download failures before **Apply reviewed import**. The CLI's `--apply` explicitly authorizes that import. Initial import and proposal verification can take several minutes and use substantial memory. This is a local desktop foundation, not a multi-user shop deployment.

## Storage and parsing

- `~/.robos/auto-scrape/raw/`: content-addressed original responses and archives.
- `~/.robos/auto-scrape/manifest.json`: source URL, retrieval time, license, status, size and SHA-256.
- `~/.robos/auto-scrape/derived/`: EPA CSV rows and diagnostic-code definitions, each separately hashed. Python reads diagnostic definitions with `ast.literal_eval`; downloaded Python is never executed.
- `~/.robos/auto-scrape/workspace/.robos/`: public reference KGraph packages and compatibility aggregate.
- `~/.config/robos/auto-center/.robos/`: private vehicles and service history, beneath a directory with mode `0700`.

Set `ROBOS_AUTO_CACHE` and `ROBOS_AUTO_PRIVATE` to use other roots. Personal records are never added to the repository or public reference import.

The domain mapper verifies source hashes, maps records to JSON-LD, runs RobOS's **OSLCGraphParser**, then uses **GraphWorkspace.propose/apply** with structural, reference and built-in cardinality validation. The existing generic resource importer targets software/infrastructure rather than automotive records; Auto Center supplies the domain mapping into the shared graph engine. Import identities are stable, source rows are retained, and subsequent imports preserve reviewed edits through the existing conflict mechanism. Raw archives and the manifest remain available for future KGraph Parse Portal/Tika ingestion; this app does not claim to run the remote Tika/Luxir pipeline.

EPA configurations and NHTSA models have separate source identities. Equal names do not establish equivalence. A NHTSA model has no inferred year; an EPA configuration has the year actually reported by EPA. EPA MPG values use source-specific properties because raw MPG is not Schema.org's volume-per-distance `fuelConsumption` quantity.

## Source coverage

| Source | Download and parsing |
|---|---|
| [Schema.org automotive vocabulary](https://schema.org/docs/automotive.html) | Complete current JSON-LD vocabulary cached; selected vehicle terms mapped to graph entries. This is vocabulary, not a vehicle registry. |
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Full available make/model lists and vehicle-variable dictionary. Covers manufacturer submissions for US-regulated vehicles, including motorcycle/truck/trailer makes and models; does not represent every vehicle worldwide. |
| [EPA fuel economy](https://www.fueleconomy.gov/feg/download.shtml) | Complete available vehicle CSV archive; configurations, engines, transmissions, fuel and MPG mapped. Primarily US light-duty vehicles. |
| [NHTSA recalls and complaints](https://www.nhtsa.gov/nhtsa-datasets-and-apis) | Optional model/year queries parsed. Campaign-level reports do not establish VIN-specific applicability, completed repairs or accident history. Complaints are reports, not confirmed diagnoses. |
| [NHTSA bulk recalls](https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip) | Post-2010 archive and field dictionary cached. Archive contents are staged, not yet parsed into individual campaign/parts nodes. |
| [python-OBD](https://github.com/brendan-w/python-OBD) | Diagnostic code definitions and GPL license cached; code descriptions mapped with upstream license metadata. These describe codes, not repair procedures. |

The NHTSA datasets overview page returned HTTP 403 during the initial collection. Its failure is recorded; successful API responses and bulk downloads were imported independently. Downloads are snapshots, not a background synchronization service.

## Schema and implemented workflows

`schema.js` exports standard JSON-LD RDFS classes and SHACL cardinality shapes; `.robos/kgraphs/auto/schema.jsonld` is the repository copy. `packages/robos-graph/lib/auto-shapes.js` integrates equivalent cardinality rules with RobOS's existing validator. These are minimum-field rules, not comprehensive automotive semantic validation.

The ontology extends Schema.org Vehicle, Brand, ProductModel, AutoRepair, Product, Service, Order, Invoice, OwnershipInfo, Schedule, QuantitativeValue and related types. It describes vehicle identity/configuration, parts/fitment, shops, service records, schedules, repair orders, estimates, invoices, odometer readings, registration, ownership, accidents, inspections, diagnostics and recalls. **Only public catalog search/import, supplied-VIN decoding and local vehicle/service entry are implemented.** Parts inventory, fitment verification, shop scheduling, billing and authorized history-provider imports need their own workflows.

The existing repository has legacy package/aggregate discrepancies and unrelated invalid nodes. Auto's registration package was proposed, validated and applied independently before being published into the repository catalog; no claim is made that the entire legacy graph passes validation.

## Software worth evaluating

| Project | Fit |
|---|---|
| [LubeLogger](https://github.com/hargata/lubelog) — MIT | Vehicle maintenance, fuel and expenses for owners or small fleets. A useful reference for garage records. |
| [ERPNext](https://github.com/frappe/erpnext) — GPL-3.0 | Customers, inventory, purchasing, sales and accounting. Auto-shop workflows need configuration or development. |
| [Odoo Community](https://github.com/odoo/odoo) — LGPL-3.0 core | Fleet, repairs and inventory foundations. Check each module's edition/license and workshop suitability. |
| [python-OBD](https://github.com/brendan-w/python-OBD) — GPL-2.0-or-later | Diagnostic adapter integration and code definitions. Hardware/protocol coverage varies. |
| [OpenAuto](https://openauto.tech/) | Advertises open-source shop management. Its repository/license and maintenance status were not verified; treat as a research lead. |

No third-party software has been installed or integrated as a shop backend.

## History, plates, parts and repair procedures

[VIN decoding](https://vpic.nhtsa.dot.gov/api/) identifies manufacturer-reported attributes; it does not reveal previous owners, license plates, accident or service history. [NMVTIS](https://vehiclehistory.bja.ojp.gov/nmvtis_consumers) offers title/brand/odometer/salvage information through approved providers. It is not a free bulk owner-history feed or a complete accident/repair record.

The schema supports owner-provided plate, jurisdiction and ownership notes locally. There is no plate-to-person lookup or owner-identity scraper. No personal vehicle records were fabricated or downloaded for the garage.

Manufacturer repair manuals, maintenance schedules, torque values, labor times and verified parts fitment require source-specific access. [ACES](https://www.autocare.org/aces) is a useful fitment exchange standard; it does not itself grant access to every supplier catalog. Future imports should preserve supplier licenses, engine/trim/year applicability and supporting documents. Generic diagnostic codes and recall remedies must not be presented as complete repair instructions.

## Validation

```bash
node --test packages/auto-center/tests/*.test.js
node --test packages/auto-center/tests/electron.e2e.js
```

The Electron test requires collected/imported public data, the existing `robos-test` Playwright dependency, Electron and a display. It uses an isolated private graph and clearly labeled test service entries; screenshots show the actual Auto Center screens. It checks catalog search, record details, persistent garage/service entry, source inspection and schema/software views.
