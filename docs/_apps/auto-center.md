---
title: "RobOS Auto Center"
package: auto-center
category: auto
icon: auto-center.svg
summary: "Owner vehicle care and invoice scans, private Git shop repairs, and source-backed recall remedies."
description: "Separate owner and maintenance center workspaces backed by KGraph."
---

Choose **Auto owner mode** to track your vehicles, service history, future maintenance by date or odometer, and repair-shop invoices. Import an image or PDF, review the locally extracted text, and save the original with its hash.

![Owner maintenance planning in Auto Center, using labeled test records](/assets/images/screenshots/auto-owner-maintenance.png)

Choose **Auto maintenance center mode** for customer vehicles and a repair queue from intake to completion. Changes and accepted invoices have private local Git history. Connecting and pushing to an existing GitHub remote requires the app to verify that repository is private. The two modes keep separate records and remember the selected workspace.

![Maintenance center with a test repair job and actual local Git history](/assets/images/screenshots/auto-maintenance-center.png)

**Center reports** opens in maintenance center mode. Vehicle cards track cars physically checked into the shop, with parking location, time held, repair status and collection controls. Profit cards show earned repair sales minus actual expenses for the selected day, Monday-start week and month. Record parts, actual labor cost, supplies and shared overhead with vendor/invoice references. Per-job reports show earned sales, direct costs, direct profit and margin; shared overhead reduces period profit. Costs and sales use earned/incurred dates, including unpaid items. Linked credits preserve corrections; missing-cost/sales warnings expose incomplete records. Separate payment cards show collections minus refunds. Additional reports cover balances, job statuses, technician workload, vehicle flow, turnaround and maintenance due dates. Expenses, earned sales, payments and stays are backed by the private shop KGraph and Git history.

![Center reports showing actual profit from labeled test entries](/assets/images/screenshots/auto-center-reports.png)

![Per-job direct profit and margins from labeled test entries](/assets/images/screenshots/auto-job-profit.png)

![Cars checked into the center, using labeled test vehicles](/assets/images/screenshots/auto-cars-at-center.png)

The public catalog includes vehicle configurations, diagnostic codes, and parsed NHTSA post-2010 recalls. Recall views link campaigns, published repair remedies, reported affected components and the original applicability rows. Inspect the exact source line, fields and SHA-256, reveal the cached archive, or follow the official source links. These are source reports, not VIN-specific recall status or verified replacement-part fitment.

![A published recall remedy and its source-backed components in Auto Center](/assets/images/screenshots/auto-bulk-recall-remedy.png)

Use **Sources & imports** to collect public data and prepare validated imports. Owner and shop documents stay in private local stores. See the [source, setup and coverage guide](https://github.com/nddipiazza/robos/blob/codex/robos-auto-center/packages/auto-center/README.md) for OCR dependencies, private Git setup and remaining scope.
