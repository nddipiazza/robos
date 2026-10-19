---
title: "Proposal: RobOS Household"
layout: default
nav_exclude: true
---

# RobOS Household

Family finances, accounting, and US taxes in one place.

**Production proposal; synthetic browser prototype implemented.** The public
`robos.tax` schema lives in `packages/robos-tax`. A runnable `packages/household`
sandbox now exercises CSV imports, PDF text review and a TenForty/OpenTaxSolver
federal estimate for a fixed invented family. It accepts no real records and has
no verified cloud adapter or filing service. [See the E2E screenshots](https://rowbose.com/family-finances/).
Research checked October 19, 2026.

## Overview and user stories

RobOS Household helps a person or family understand spending throughout the year
and prepare a return from reviewed records instead of entering everything again.
RobOS users can join a household without automatically gaining access to every
member's accounts or tax documents. A dependent can exist without a RobOS login.

- Create a household, invite existing RobOS users, and grant owner, adult, limited
  member, or time-limited tax reviewer access. Each adult controls private records.
- Record dependents, relationships, and dated custody/foster placements, residence
  periods, and nights per household, as confirmed by the user.
- Onboard checking, savings, credit cards, cash, loans, investments, recurring
  bills, and opening balances. Import historical statements before enabling sync.
- Import card/bank CSV, OFX, or QFX transactions, review duplicates, categorize
  spending, split purchases, reconcile statements, and link receipts.
- Track insurance, groceries, dining, water, utilities, housing, transportation,
  healthcare, childcare, education, subscriptions, debt, and donations. Support
  custom categories, refunds, reimbursements, and cash purchases.
- Upload W-2s, interest statements, and other tax documents; inspect highlighted
  source fields beside proposed values; correct and approve them.
- Open **File US taxes**, work through household and income questions, review
  eligible deductions and credits, and choose an available filing route.

## Existing code to evaluate

These are reuse candidates, not installed integrations. Pin a revision, verify
current tax-year coverage, test dependencies, and review licenses before adoption.

| Project | Reuse | Boundary |
|:---|:---|:---|
| [Actual Budget](https://github.com/actualbudget/actual) (MIT) | Transaction engine, imports, budgeting, rules, reconciliation | Preferred first finance spike. Its local persisted budget must be replaced or adapted to satisfy cloud-only persistence. [Bank-sync credentials are not covered by its E2EE](https://actualbudget.org/docs/advanced/bank-sync/). |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) (AGPL-3.0) | Alternative double-entry ledger and REST API | Compare against Actual before choosing one accounting engine; do not operate competing ledgers. Self-hosting alone does not prove storage privacy. |
| [UsTaxes](https://github.com/ustaxes/UsTaxes) (AGPL-3.0) | Interview, federal form calculations and PDF output | README lists 2025 and earlier coverage, with limited state support. Replace localStorage persistence; verify every supported scenario. Do not infer an e-file integration from the project's name. |
| [OpenTaxSolver](https://opentaxsolver.sourceforge.net/) | Independent calculation/PDF candidate | Supports preparing forms for mailing; inspect the downloaded distribution's license before redistribution. Do not treat it as an e-file transmitter. |
| [OCRmyPDF](https://github.com/ocrmypdf/OCRmyPDF) (MPL-2.0), [Tesseract](https://github.com/tesseract-ocr/tesseract) (Apache-2.0), [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) | OCR, word coordinates and document display | Reuse recognition and rendering; build the tax-field mapping and correction workflow. Run in an isolated, network-restricted worker with memory-only temporary files. |
| [Paperless-ngx](https://github.com/paperless-ngx/paperless-ngx) (GPL-3.0) | Document workflow reference | Its README warns that records are stored in plaintext. Its default storage does not meet this requirement. |
| [IRS Direct File](https://github.com/IRS-Public/direct-file) (CC0) | Historical interview and fact-graph design reference | Archived and explicitly marked unsuitable for production. Do not deploy this codebase as the tax service. |

Keep RobOS-specific work focused on household authorization, private persistence,
source-linked field review, tax-year schema mapping, and the filing workflow.
AGPL/GPL candidates need a distribution and modification plan consistent with their
licenses; a service boundary does not automatically remove obligations.

## Private cloud storage is mandatory

Use the existing **RobOS cloud providers app** as the authoritative registry of
approved storage providers, as directed by the user. Do not create a parallel approval
list or hardcode a new provider. Bind each household vault to its approved provider
ID and consume the registry's existing approval contract. The exact app/API path is
not present under that name in this checkout; resolve that integration before writing
the storage adapter. Existing DevOps provider connections are not a substitute for
this registry. No live provider approval or configuration was inspected in this change.

**Block onboarding of real financial records until an approved provider is selected
and its deployed storage implementation passes the privacy acceptance checks.**
Provider branding, a private bucket, HTTPS, or a compliance badge alone is insufficient.

All durable household data belongs in the verified private cloud boundary: source
documents, filenames and metadata, extracted text, field values, ledger entries,
receipts, identities, placements, graph instances, indexes, audit history, backups,
return PDFs, submission payloads, and acknowledgments. No GitOps for these records,
including encrypted copies. Source code, public IRS definitions and synthetic tests
may be versioned. Production schemas and code never contain household instance data.

Use client-side authenticated encryption with vetted libraries and household-controlled
keys. The storage operator must not receive decryption keys. Verify key recovery,
rotation, device revocation, per-member/per-document grants, encrypted metadata,
backup/restore, retention, and access revocation with actual negative-access tests.
Encrypt search indexes and database snapshots too. Record the reviewed threat model,
audit evidence, deployed version/configuration, tests and review date before calling
the deployment verified. Independent review must cover the deployed configuration;
no claim of absolute privacy is possible.

The application can decrypt in memory on an authorized device. It must disable disk
caches, localStorage/IndexedDB financial persistence, browser downloads, plaintext
logs, crash uploads, analytics, OS search indexing, and automatic RobOS snapshots or
prompt-history capture. OCR temporary storage must be memory-backed, with swap/core
dump controls checked. The default export saves inside the cloud vault; local export
is outside this requirement and must not silently become a fallback. Cloud outages
must block writes with a clear retry path, never fall back to a local file or Git.

Default extraction uses an isolated local worker. A remotely hosted OCR/LLM service
requires a separately verified confidential-processing boundary and explicit opt-in;
cloud encryption at rest does not protect documents while a remote service reads
them. Never send documents through the general agent router by default. Bank sync
also requires separate approval of the aggregator's data access and token custody.

## Document extraction and correction

1. Authenticate, authorize the household/document scope, and verify the vault policy.
2. Encrypt and store the original; detect duplicate uploads and corrected statements.
3. Prefer embedded PDF text; otherwise run OCR. Identify document type, tax year,
   revision, recipient and issuer. Ambiguous ownership or year requires review.
4. Map each proposed value to a form definition, box/line, document ID, page,
   normalized bounding rectangle, raw text, parser/version and confidence.
5. Show the original on the left and editable fields on the right. Selecting a field
   highlights its source box. Support repeated state/local rows and coded boxes.
6. Require explicit approval of every critical value, including identities, W-2 wages
   and withholding, and 1099 income. Missing values stay missing; never fill with zero.
   Confidence is a review hint, not proof of correctness. Keep the original and
   corrected values with reviewer/time; changing the source invalidates approval.
7. Check box totals, recipient consistency and duplicates. Recompute dependent results
   after any correction. No unresolved critical field may reach return generation.

Initial extraction target: W-2 and 1099-INT for tax year 2025. Broader document intake
can store unsupported forms, but clearly marks them for manual handling. Expand to
1099-DIV/B/R/NEC/MISC/K/G/SSA, 1098/E/T, 1095-A, K-1, 5498 and prior returns only
after form-specific mapping and real-format synthetic-document tests exist.

## Accounting and deduction tracking

Use one authoritative ledger with exact decimal/integer-minor-unit money. Credit
card payments and account-to-account transfers must not count as new spending.
Preserve import source rows, stable deduplication keys and corrections. An identical
amount/date is not sufficient to discard a legitimate second purchase. Split expenses
retain their original total; refunds and reimbursements link to the original purchase.

Expense categories and tax treatment are separate. A donation or medical transaction
can be a deduction candidate, but eligibility depends on year-specific law, evidence,
limits and the return. Record allowed/disallowed/review-needed, legal source,
jurisdiction, tax year and reviewer. Do not label routine food, utilities or insurance
as deductible solely because of their category. Preserve donation acknowledgments,
recipient, cash/noncash distinction, valuation and any goods/services received.

Placement is evidence, not a dependency decision. Model residence, relationship,
support, age/student/disability facts and any release separately; different benefits
can have different eligibility rules. [IRS Publication 501](https://www.irs.gov/publications/p501)
is a starting reference, not an implemented dependency calculator.

## Tax wizard and filing boundary

**File US taxes** opens: tax year/jurisdictions → household/filing status/dependents →
accounts/documents → income → deductions/credits → diagnostics → return preview →
filing route → signature/consent → submission status.

Every engine advertises supported years, states, forms and scenarios. Unsupported
income or eligibility questions block a complete-return claim and explain the missing
coverage. Pin form revisions, rules, engine build and calculation inputs; preserve a
calculation trace. Never reuse last year's thresholds for a new tax year.

First delivery prepares a reviewed PDF and a print/mail checklist inside the vault.
An external filing handoff must name the recipient, disclosed data, fees and privacy
boundary, and require consent. It is not an automatic upload or a claimed IRS API.
[IRS Free File](https://www.irs.gov/e-file-do-your-taxes-for-free) is a separate option
for eligible users; free filing does not imply open-source software.

Native e-file is a later milestone. It needs an authorized provider/transmitter path,
applicable federal/state testing, signatures/identity checks, duplicate-submission
controls, acknowledgments, rejection repair and amendments. See [provider enrollment](https://www.irs.gov/e-file-providers/become-an-authorized-e-file-provider)
and [IRS software testing](https://www.irs.gov/e-file-providers/how-tax-preparation-software-is-approved-for-electronic-filing).
Keep `prepared`, `transmitted`, `accepted`, and `rejected` separate. Only an actual
agency acknowledgment can mark a return accepted; payment is a separate action.

## KGraph and system integration

`packages/robos-tax` supplies the public `robos.tax` package: domain vocabulary,
JSON Schema instance contract, and a partial 2025 W-2/1099-INT field catalog with IRS
sources. It contains no tax formulas and is not an IRS MeF schema or certification.
Its README states catalog completeness and registration status.

Reuse People Directory identifiers for optional user links, never infer household
access from an organization or team. Household graph instances must use a new cloud
vault adapter. Do not pass them to `SDLCKnowledgeGraphStore`, `GraphWorkspace`,
`.robos/`, local config mirrors, global search, or the generic prompt audit logger.
Public form definitions may use ordinary graph tooling. Before registering this
package, repair the existing package/aggregate mismatch and review a graph proposal.

The eventual Electron app is `packages/household`, with context-isolated IPC. Main
process handlers enforce membership and object scope on every call, including import,
document review and return generation. UI filtering is not authorization. Register
the app with launcher/icons/installers only when it actually exists. Do not advertise
this proposal as an installed app.

## Delivery plan and acceptance criteria

| Order | Deliverable | Observable completion check |
|:---|:---|:---|
| 0 | Public tax vocabulary and specification (implemented) | Schema tests pass; package contains only definitions; limitations are explicit. |
| 1 | Approved cloud-provider integration and private vault adapter | Read approval from the existing cloud providers app; verify key custody and deployment evidence; unrelated user/operator cannot decrypt; restore/revocation/outage tests pass; no local durable record writes. |
| 2 | Household and permissions | Invite existing users; add dependents/placements; verify two households and restricted-member access through backend calls. |
| 3 | Reuse spike and ledger/imports | Choose Actual or Firefly; adapt persistence; reconcile CSV/OFX/QFX fixtures including duplicates, transfers, splits and refunds. |
| 4 | W-2/1099-INT review UI | Synthetic scans with rotated pages, bad OCR, missing boxes and corrected forms; source highlight and correction visible; critical-field gate enforced. |
| 5 | Year-specific preparation | Pin an engine; validate supported scenarios against published examples and independent expected results; unsupported cases block output. |
| 6 | Filing and annual maintenance | Print/mail first; e-file only after integration/testing; distinguish transmission/acceptance; tax-year updates and state coverage reviewed separately. |

UI milestones need real-app recorded walkthroughs with synthetic records and negative
authorization cases. Never use live household documents in repository fixtures,
screenshots or development evidence. Before implementation, create the normal reviewed
RobOS task plan; this specification does not claim linked issues or approval already exist.

The browser sandbox is an implementation spike, not completion of the production
milestones above. Its E2E test imports all six synthetic account statements, checks
balances and spending, corrects a category and purchase split, advances to February,
reviews the generated tax PDFs, invokes the actual engine, and checks the filing
boundary. Scanned OCR and general tax eligibility remain unsupported.
