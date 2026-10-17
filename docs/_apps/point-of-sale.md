---
title: "RobOS Point of Sale"
package: point-of-sale
category: point-of-sale
icon: point-of-sale.svg
summary: "Open-source cash register for shops, cafés and bars: touchscreen order entry, self-checkout, inventory, cash drawer controls and an open checkout API."
description: "A modern, self-hosted cash register that runs on any touchscreen. No subscription, no cloud account, no card-processing lock-in."
---

> **Running a business?** The full guide, from first sale to closing the drawer, with the tests behind it: [rowbose.com/point-of-sale](https://rowbose.com/point-of-sale/).

RobOS Point of Sale handles three kinds of business out of the box, each with a ready-made sample you can try on first launch and then edit into your own:

| Sample | What it shows |
|---|---|
| **Clothing store** | Sizes with their own barcodes and stock, scanning, promo codes, returns and exchanges, self-checkout by scanning a tag |
| **Coffee shop** | Drinks with required size and milk choices, recipes that use up beans and milk, a prep screen for the barista and kitchen, tips, self-checkout with an order-ready board |
| **Bar** | Open tabs, rounds sent to the bar, ID checks, happy-hour pricing, comps and voids with manager approval, split checks, tip-out |

## Screens

- **Register**: big touch tiles, an on-screen number pad, quick-tender cash buttons, discount, tip, split-by-person or by-item, and a printable receipt.
- **Tabs**: hold an order, pick it up later, or find a self-checkout order by its number.
- **Prep**: one screen per station (kitchen, barista, bar). Tap Start, Ready, Picked up. `/ready` shows a customer-facing "now ready" board.
- **Self-checkout** (`/kiosk`): a customer-facing menu with large buttons. Pays by card or "pay at the counter". Age-restricted items are never offered unattended.
- **Inventory**: receive deliveries, count the shelf (with a reason), import a CSV, low-stock warnings.
- **Menu & Catalog**: items, sizes, option groups, taxes, promo codes and happy-hour rules.
- **Cash**: open the drawer with a float, paid in / paid out, blind count by bill and coin, and an over/short Z-report. Administrators set cash rounding, quick-tender buttons, the largest tender accepted, and how much over/short a cashier may close without a manager.
- **Reports**: sales by category, tender and item; CSV export.

## Open checkout API

Websites and apps create checkout sessions with an API key (`Team & API` screen). The endpoints follow the shape of the open Agentic Commerce Protocol checkout flow (create, retrieve, update, complete, cancel), amounts are integer cents, and `Idempotency-Key` is honoured. The OpenAPI document is served at `/api/openapi.json`. Card payments go through a provider plug-in, so Stripe, Square, Adyen or a card-terminal bridge can be added without touching the register.

## Running it

```bash
cd packages/point-of-sale
npm install && npm start          # desktop app
node serve.js --host 0.0.0.0      # headless server for tablets on the shop network (use a trusted network)
npm test && npm run test:e2e      # API suites and touch-driven browser suites
```

Sample PINs: owner `1111`, manager `2222`, cashier `3333`. Change them before real use.
