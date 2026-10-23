---
title: "RobOS Auto Center"
package: auto-center
category: auto
icon: auto-center.svg
summary: "Owner vehicle care and invoice scans, repairs backed up to storage such as GitHub, and source-backed recall remedies."
description: "Separate owner and maintenance center workspaces backed by KGraph."
---

> **Running a shop?** Read the full lifecycle guide, from customer intake to a paid and returned car, with screenshots and video from the end-to-end tests: [rowbose.com/auto-center](https://rowbose.com/auto-center/).


<div style="aspect-ratio:16/9;margin:24px 0"><iframe src="https://www.youtube-nocookie.com/embed/VbGGa-et_B4" title="RobOS Auto Center: one repair from phone call to keys, with OBD-II codes read over Bluetooth" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="width:100%;height:100%;border:0"></iframe></div>

[Watch a complete repair, including reading the car over OBD-II, on YouTube](https://youtu.be/VbGGa-et_B4).

Choose **Vehicle owner** to track your vehicles, service history, future maintenance by date or odometer, and repair-shop invoices. Import an image or PDF, review the locally extracted text, and save the original with its hash.

![Owner maintenance planning in Auto Center, using labeled test records]({{ '/assets/images/screenshots/auto-owner-maintenance.png' | relative_url }})

Choose **Maintenance center** for customer vehicles and a repair queue from intake to completion. Changes and accepted invoices have private local Git history. Connecting and pushing to an existing GitHub remote requires the app to verify that repository is private. The two modes keep separate records and remember the selected workspace.

![Maintenance center with a test repair job and actual local Git history]({{ '/assets/images/screenshots/auto-maintenance-center.png' | relative_url }})

Each service a shop offers is a plugin you tick in **Admin → Services** ("What does your shop do?"). **Auto repair** (Front desk, Mechanic bench) is on from the start. **Towing** adds the Tow desk. **Auto parts sales** embeds RobOS Point of Sale as the parts counter. Starters for body work, tires, alignments, oil changes, inspections, glass, exhaust, EVs, detailing, mobile repairs and keys add their questions and labor to the repair desk. See [Choose your services](https://rowbose.com/auto-center/12-services/).

The **Orders** menu keeps suppliers, purchase orders and the parts on your shelves. Parts the mechanics request at the bench appear there to order or take from stock, and a received delivery puts each part on its repair ticket at the invoice cost. It is built on the shared RobOS Orders and RobOS Inventory components. See [Order parts and keep stock](https://rowbose.com/auto-center/11-orders/).

Shops that run tow trucks use the **Tow desk**: take a tow or roadside call (jump start, lockout, tire change, fuel, winch-out), quote it from the shop's rate card, dispatch a truck that can carry the vehicle and a free driver, and record each step to the drop-off. Vehicles dropped at the shop or yard are checked in, and tow invoices and payments go through **Checkout**. A Front desk intake for a car that must be towed can send the shop's own truck. See [Run a tow service](https://rowbose.com/auto-center/10-tow-desk/).

**Center reports** opens on **Shop floor** in maintenance center mode. Switch to **Profit & costs**, **Payments** or **Performance** for the other reports. Tabs support keyboard navigation, and the layout adapts to smaller windows. Vehicle cards track cars physically checked into the shop, with parking location, time held, repair status and collection controls. Profit cards show earned repair sales minus actual expenses for the selected day, Monday-start week and month. Record parts, actual labor cost, supplies and shared overhead with vendor/invoice references. Per-job reports show earned sales, direct costs, direct profit and margin; shared overhead reduces period profit. Costs and sales use earned/incurred dates, including unpaid items. Linked credits preserve corrections; missing-cost/sales warnings expose incomplete records. Separate payment cards show collections minus refunds. Additional reports cover balances, job statuses, technician workload, vehicle flow, turnaround and maintenance due dates. Expenses, earned sales, payments and stays are backed by the private shop KGraph and Git history.

![Shop floor with live workload and checked-in test vehicles]({{ '/assets/images/screenshots/auto-center-reports.png' | relative_url }})

![Profit and costs with per-job margins from labeled test entries]({{ '/assets/images/screenshots/auto-job-profit.png' | relative_url }})

![Cars checked into the center, using labeled test vehicles]({{ '/assets/images/screenshots/auto-cars-at-center.png' | relative_url }})

The public catalog includes vehicle configurations, diagnostic codes, and parsed NHTSA post-2010 recalls. Recall views link campaigns, published repair remedies, reported affected components and the original applicability rows. Inspect the exact source line, fields and SHA-256, reveal the cached archive, or follow the official source links. These are source reports, not VIN-specific recall status or verified replacement-part fitment.

![A published recall remedy and its source-backed components in Auto Center]({{ '/assets/images/screenshots/auto-bulk-recall-remedy.png' | relative_url }})

Use **Sources & imports** to collect public data and prepare validated imports. Owner and shop documents stay in private local stores. See the [source, setup and coverage guide](https://github.com/nddipiazza/robos/blob/codex/robos-auto-center/packages/auto-center/README.md) for OCR dependencies, private Git setup and remaining scope.
