# RobOS Auto Center

Auto Center is the first desktop app in the **RobOS Auto** family. It has separate Auto owner and Auto maintenance center modes, searches public automotive and recall data, and stores private vehicle records in KGraph.

## Run

From the repository root:

```bash
python3 packages/auto-center/collect.py --vehicle 2015 Toyota Camry
node --max-old-space-size=8192 packages/auto-center/cli.js --apply
node --max-old-space-size=8192 packages/auto-center/recalls-cli.js --apply
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
- `~/.robos/auto-scrape/recalls/builds/`: immutable bulk-recall builds, a SQLite search/source-row index, and partitioned KGraph workspaces. `recalls/current.json` selects the fully applied build.
- `~/.config/robos/auto-center/.robos/`: owner vehicles, history, plans and reviewed invoices.
- `~/.config/robos/auto-center/shop/`: separate customer/shop KGraph, accepted invoice originals and local Git history.
- Each private store is beneath a directory with mode `0700`; accepted invoice files have mode `0600`.

Set `ROBOS_AUTO_CACHE` and `ROBOS_AUTO_PRIVATE` to use other roots. Personal records are never added to the repository or public reference import.

The domain mapper verifies source hashes, maps records to JSON-LD, runs RobOS's **OSLCGraphParser**, then uses **GraphWorkspace.propose/apply** with structural, reference and built-in cardinality validation. The existing generic resource importer targets software/infrastructure rather than automotive records; Auto Center supplies the domain mapping into the shared graph engine. Import identities are stable, source rows are retained, and subsequent imports preserve reviewed edits through the existing conflict mechanism. The bulk recall mapper uses the same graph parser and proposal/apply engine, partitioned by campaign to bound proposal size. All partitions must pass validation and apply before an atomic active-build switch. The SQLite index only locates records; detail views read the KGraph nodes. Raw archives remain available; this app does not run the remote Tika/Luxir pipeline.

EPA configurations and NHTSA models have separate source identities. Equal names do not establish equivalence. A NHTSA model has no inferred year; an EPA configuration has the year actually reported by EPA. EPA MPG values use source-specific properties because raw MPG is not Schema.org's volume-per-distance `fuelConsumption` quantity.

## Source coverage

| Source | Download and parsing |
|---|---|
| [Schema.org automotive vocabulary](https://schema.org/docs/automotive.html) | Complete current JSON-LD vocabulary cached; selected vehicle terms mapped to graph entries. This is vocabulary, not a vehicle registry. |
| [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/) | Full available make/model lists and vehicle-variable dictionary. Covers manufacturer submissions for US-regulated vehicles, including motorcycle/truck/trailer makes and models; does not represent every vehicle worldwide. |
| [EPA fuel economy](https://www.fueleconomy.gov/feg/download.shtml) | Complete available vehicle CSV archive; configurations, engines, transmissions, fuel and MPG mapped. Primarily US light-duty vehicles. |
| [NHTSA recalls and complaints](https://www.nhtsa.gov/nhtsa-datasets-and-apis) | Optional model/year queries parsed. Campaign-level reports do not establish VIN-specific applicability, completed repairs or accident history. Complaints are reports, not confirmed diagnoses. |
| [NHTSA bulk recalls](https://static.nhtsa.gov/odi/ffdd/rcl/FLAT_RCL_POST_2010.zip) | Post-2010 archive parsed into campaigns, remedy variants, reported affected components and every applicability row. Exact archive member, physical line, NHTSA record ID, raw fields and row/archive SHA-256 are retained. The dictionary remains linked. |
| [python-OBD](https://github.com/brendan-w/python-OBD) | Diagnostic code definitions and GPL license cached; code descriptions mapped with upstream license metadata. These describe codes, not repair procedures. |

The NHTSA datasets overview page returned HTTP 403 during the initial collection. Its failure is recorded; successful API responses and bulk downloads were imported independently. Downloads are snapshots, not a background synchronization service.

## Schema and implemented workflows

`schema.js` exports standard JSON-LD RDFS classes and SHACL cardinality shapes; `.robos/kgraphs/auto/schema.jsonld` is the repository copy. `packages/robos-graph/lib/auto-shapes.js` integrates equivalent cardinality rules with RobOS's existing validator. These are minimum-field rules, not comprehensive automotive semantic validation.

The ontology extends Schema.org Vehicle, Brand, ProductModel, AutoRepair, Product, Service, Order, Invoice, OwnershipInfo, Schedule, QuantitativeValue and related types. It describes vehicle identity/configuration, parts/fitment, shops, service records, schedules, repair orders, estimates, invoices, odometer readings, registration, ownership, accidents, inspections, diagnostics and recalls. **Implemented:** public reference and bulk-recall imports, source inspection, VIN decoding, owner vehicles/service history, date/odometer maintenance plans, invoice OCR and review, customer vehicles, a repair work queue and private shop Git history. Parts inventory, verified fitment, appointment scheduling, invoice issuance/payment processing and authorized history-provider imports need separate workflows.

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
node --test --test-concurrency=1 packages/auto-center/tests/electron.e2e.js packages/auto-center/tests/modes.e2e.js
```

The Electron test requires collected/imported public data, the existing `robos-test` Playwright dependency, Electron and a display. It uses an isolated private graph and clearly labeled test service entries; screenshots show the actual Auto Center screens. It checks catalog search, record details, persistent garage/service entry, source inspection and schema/software views.


## Owner and maintenance center modes

Choose **Auto owner mode** to maintain your garage, service history, reviewed repair invoices and future maintenance plans. Plans are explicit date or odometer targets supplied by you; no OEM interval is inferred. Marking a plan complete does not fabricate a performed-service record. Use the service form to record work actually done.

Choose **Auto maintenance center mode** for a separate customer-vehicle store and repair work queue. Jobs move through received, diagnosing, awaiting approval, in progress, ready and closed. Each shop record change gets a local Git snapshot; accepted invoice originals are tracked with the graph. Mode selection survives restart. Modes are single-user workspaces, not authentication roles.

**Private GitOps:** the app initializes the shop's local Git repository and commits only its graph and accepted documents. Git operations use a local app identity without hooks or signing; no credentials are written into the graph. The UI can connect an existing GitHub `owner/repository` after `gh repo view` verifies it is private. Privacy is checked again before each push, and public remotes are refused. No remote is created or connected automatically. A push failure leaves the local records and commits intact. Filesystem permissions and a private repository provide access boundaries; the store is not encrypted and does not implement multi-user authorization.

## Invoice scans

**Scan & track invoices** accepts PDF, PNG or JPEG files. Text PDFs use Poppler; images and image-only PDFs use local Tesseract OCR. Scanned PDFs support up to ten pages. Review and correct the extracted text, choose a vehicle, and enter the verified date, total and currency before saving. No invoice is sent to an external OCR or AI service. The original file is retained under a content-hash name and can be opened from its invoice record. Unaccepted scans remain in the private pending-invoice directory and are excluded from shop Git snapshots.

On Ubuntu, install `tesseract-ocr`, `tesseract-ocr-eng` and `poppler-utils`. The VM provisioner includes them. This workstation also supports a user-local Tesseract installation under `~/.robos/tools/ocr`; missing tools produce an actionable error. Tests use visibly labeled synthetic invoice images and run actual OCR.

## Bulk recall operations

Use **Sources & imports → Parse archive & prepare recall import**, review its counts, then apply it. The CLI command above performs the same validated import with explicit `--apply`. Imports retain immutable builds and review receipts, so a complete archive requires several GiB of disk space. An interrupted import leaves the prior active build in place. A prepared build can be resumed with:

```bash
node packages/auto-center/recalls-cli.js --apply-reviewed recalls/builds/BUILD REVIEW_ID
```

The build's `review.json` contains its review ID. Every source row must have the dictionary's expected fields and a unique NHTSA record ID. Raw and derived hash checks reject changed inputs, plans and partitions. Remedy variants remain distinct; manufacturer part-number strings are preserved verbatim and never split into invented part identities. Affected-component records are source assertions, not a deduplicated replacement-parts catalog.

Search the catalog by campaign number, make/model/year applicability, component or reported part number. Select a result to read the campaign, published remedy and reported components, then **View selected source row** to inspect the original named fields, line and hashes. **Reveal cached source archive** locates the exact downloaded ZIP; the official URL may serve a newer snapshot. A saved owner's or customer's vehicle can find exact make/model/year source rows. No match is evidence only about that snapshot and exact spelling; it does not establish VIN recall status or repair completion.


## Center reports

**Auto maintenance center mode → Center reports** is the shop landing page. It reports your private shop data without assuming that a registered vehicle is physically present or that a scanned invoice is income.

- **Cars currently held:** cards show explicitly checked-in vehicles, customer notes, plate, location/bay, check-in time, calendar days on site, expected ready date, active repair jobs and technicians. Use the check-in form or explicitly select the physical check-in checkbox during repair intake. Collection closes the vehicle stay; closing a repair job does not release the vehicle. Repeated check-ins cannot create overlapping stays.
- **Payments this day/week/month:** recorded receipts less recorded refunds, in the selected currency. Weeks start Monday; months start on the first. The business-date selector changes profit, cash and completion periods. Vehicle cards, backlog and balances remain live. The display names the machine's local shop time zone. Calendar boundaries and job timestamps use that zone; payment dates are the business dates you enter.
- **Workload and performance:** current job statuses, open jobs by technician, arrivals and collections by period, currently closed jobs with recorded closing times, average recorded turnaround, average received payment, overdue maintenance by date and plans due within seven days. Mileage-only plans are listed as needing an odometer check. Existing closed jobs without a recorded timestamp are excluded from period and turnaround counts rather than assigned invented dates. Reopened jobs are excluded until closed again.
- **Balances:** enter a customer charge total and currency on a repair job. The report shows outstanding billed balances and customer credits separately. Jobs without a charge total are counted as unbilled, rather than treated as zero-price work.

**Record a payment already received** is a local ledger entry, not a payment processor or invoice issuer. Payments link to a repair job. Refunds link to an original receipt, require a reason and cannot exceed its unrefunded amount. Entries are not silently overwritten; corrections use linked refunds. Submission identifiers prevent a repeated submit from duplicating the transaction. Currencies are separate and a job's recorded payments cannot be relabeled with another billing currency. Charge totals can be corrected through the repair job and are preserved in private Git history.

**Expenses and actual profit:** record parts used, actual labor cost, supplies, subcontractors, rent, utilities, insurance, equipment, fees and other expenses. Link direct costs to a repair job, or leave the job blank for shared overhead. Save vendor/invoice/source references with each entry. Record earned repair sales separately from payments, excluding sales tax. Effective dates are when sales are earned or costs incurred, even if unpaid. Payment deposits and refunds never automatically change earned sales; use a sales credit when a refund also reduces revenue. Scanned invoices are never automatically posted, avoiding double counting.

Profit cards show earned sales minus recorded actual expenses for the selected day, Monday-start week and month. Per-job profit shows cumulative earned sales less direct costs through the selected date; shared overhead reduces period profit separately and is not arbitrarily allocated to jobs. Category totals show monthly expenses net of supplier credits. Open-job costs are included when incurred. Inventory purchases become job costs when consumed; do not enter both purchase and consumption as expenses. These are recorded operating results before income tax, financing and owner distributions, not a full accounting or inventory system. Review missing sales/cost coverage before treating totals as complete.

Financial entries (`robos:ShopFinanceEntry`, based on Schema.org MonetaryAmount) are immutable. A correction or supplier credit references the original entry, preserves its job/category/currency, cannot predate it and cannot exceed the remaining original amount. Use a linked credit and replacement entry for corrections. Submission identifiers prevent duplicates on retries. Job billing/status changes do not rewrite recorded earned sales. Amounts and aggregations use exact integer cents; currencies are never combined or converted. Reports exclude invalid ledger entries and show a warning.

Vehicle stays (`robos:VehicleStay`, based on Schema.org Event), payments (`robos:ShopPayment`, based on PayAction), expenses and earned sales (`robos:ShopFinanceEntry`), job billing and completion timestamps live in the shop KGraph and receive local Git snapshots. Reports are read-only calculations over those records. Invalid manually edited financial/stay records and legacy timestamp gaps are surfaced in the dashboard's data-quality note.
