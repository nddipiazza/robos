# RobOS Point of Sale

An open-source cash register for retail shops, cafés and bars. Zero runtime dependencies (Node.js built-ins only; Electron is just the desktop shell), data kept in one JSON file on your own machine.

```bash
npm install
npm start                      # desktop app (Electron)
node serve.js                  # or: headless server on http://127.0.0.1:3410
node serve.js --host 0.0.0.0   # let shop tablets open /kiosk (trusted network only; there is no TLS)
npm test                       # unit + HTTP API end-to-end suites (node:test)
npm run test:e2e               # touch-driven browser suites (needs playwright-core and Chromium)
```

On first launch pick a sample business (clothing store, coffee shop or bar) or start empty. Sample PINs: owner `1111`, manager `2222`, cashier `3333`.

## Screens

| URL | Who | What |
|---|---|---|
| `/` | Staff (PIN) | Register, tabs, prep queue, orders/refunds, inventory, menu & catalog, cash, reports, team & API keys, settings |
| `/kiosk` | Customers | Self-checkout: menu, basket, tip, pay by card or at the counter |
| `/ready` | Customers | "Now ready" board for pick-up numbers |

All screens use large touch targets (56px minimum for buttons and inputs, 72px on the self-checkout) and an on-screen number pad for PINs, cash and quantities. Free-text fields (names, notes) use the device's own on-screen keyboard.

## Roles

| Role | Can additionally |
|---|---|
| Cashier | Sell, hold tabs, take cash/card, small discounts (default up to 10%), open/close their drawer within the over/short limit, work the prep queue |
| Manager | Refund, comp, void sent items, large discounts, paid in/out, receive and count stock, reports, **cash payment settings** |
| Admin | Menu and catalog, taxes, promo codes, team, API keys, settings, load samples |

A cashier can get a one-off approval by having a manager type their PIN (`managerPin` in the API).

## Open checkout API

Modelled on the Agentic Commerce Protocol checkout-session flow. Integer minor units (cents). Create an API key in *Team & API*, then:

```bash
curl -s -X POST http://127.0.0.1:3410/api/v1/checkout_sessions \
  -H "Authorization: Bearer $POS_KEY" -H "Content-Type: application/json" \
  -d '{"items":[{"id":"<item id | sku | barcode>","quantity":2}],"fulfillment_option_id":"takeout"}'
# POST   /api/v1/checkout_sessions/{id}            update items, buyer, fulfillment_option_id
# POST   /api/v1/checkout_sessions/{id}/complete   {"payment_data":{"token":"tok_...","provider":"mock"}}
# POST   /api/v1/checkout_sessions/{id}/cancel
# GET    /api/v1/checkout_sessions/{id}
```

The full contract is at `/api/openapi.json`. This is *modelled on* the protocol, not a certified implementation: check field-level compatibility before wiring a third-party agent to it.

### Card providers

Cash is built in. Cards go through a provider object `{ authorize({amount, currency, order, token, reference}), refund({reference, amount}) }`, sync or async. Two ship in the box: `manual` (a standalone terminal; the worker keys in its approval code) and `mock` (test gateway, no real charges, `tok_decline` declines). Add a real gateway by passing `providers: { stripe: {...} }` to `new PointOfSale(...)` and choosing it in *Settings > Card payments*. The app never sees or stores card numbers.

## Standards used

Integer cents and ISO 4217 currency codes; GS1 GTIN check digits for barcodes (UPC-A, EAN-8/13, GTIN-14); schema.org `Order` JSON-LD receipts (`/api/orders/{id}/receipt.jsonld`); plain-text receipts that print to ESC/POS thermal printers; CSV import/export; OpenAPI 3.1.

## What it does not do yet

Gift cards and loyalty, multi-location sync, employee time clocks, hardware drivers for cash drawers/printers/scanners (scanners that type into a text box work; printing uses the system print dialog), ESC/POS direct printing, and online ordering UI (the API is there). Tax is a flat rate per item; there is no jurisdiction lookup, so check your local rules before using it for real sales.

## Layout

```
lib/        pos.js (catalog, inventory, auth) · orders.js · cash.js · reports.js · checkout.js (kiosk + open API)
            providers.js · receipt.js · samples.js · server.js · openapi.js · money.js · gtin.js · store.js
renderer/   index.html (staff) · kiosk.html · ready.html · register.js · backoffice.js · common.js
tests/      *.api.test.js (HTTP, per business) · *.e2e.js (touch-driven Chromium, per business)
```
