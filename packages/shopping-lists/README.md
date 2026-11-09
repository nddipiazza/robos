# RobOS Shopping Lists (`packages/shopping-lists`)

Part of the **RobOS Household & Personal Finance** suite alongside [RobOS Household](../household/README.md) and [`robos.tax`](../robos-tax/README.md).

RobOS Shopping Lists manages household shopping trips with **three pre-built store lists** out of the box—plus support for custom lists—designed so you can both **view your lists natively in Google Docs / Google Drive on your phone** and **add, adjust, check off, or remove items in a fast, form-like UI with buttons**:

1. **🥬 Grocery** — Produce, Dairy & Eggs, Bakery, Meat & Seafood, Pantry & Dry Goods, Frozen, Beverages, Snacks, Household
2. **🎯 Target** — Household Essentials, Personal Care & Beauty, Health & Pharmacy, Kitchen & Dining, Home & Storage, Kids & Pets, Electronics & Tech, Market & Snacks
3. **📦 Costco** — Kirkland Signature, Rotisserie & Deli, Bulk Produce, Meat & Poultry, Freezer Bulk, Pantry & Oils, Paper & Cleaning, Beverages & Cases, Bakery & Sweet

## Key Capabilities

- **Form-Like Item Controls & Bling**:
  - Structured item form with name, `[ − ] qty [ + ]` stepper, unit picker, automatic aisle classification, optional unit price (`$`), store/coupon note, and highlight badges (`🔥 Must Have`, `🏷️ Sale / Coupon`, `🌿 Organic`, `⭐ Store Brand / Fav`).
  - **1-Tap Quick-Add Staple Chips** tailored to Grocery, Target, and Costco (tapping an existing unchecked item increments its quantity).
  - Per-row circular check-off button (with animated progress ring & 100% completion celebration), inline `−` / `+` steppers, quick `Edit`, `🗑️ Remove`, `↩ Undo`, `🧹 Clear Checked`, and **Export Household CSV** for [RobOS Household](../household/README.md).
- **Viewable & Editable in Google Docs / Google Drive on Mobile**:
  - Uses your signed-in [RobOS Cloud Accounts](../cloud-accounts/) Google login (`robos-lib/cloud-accounts` + `robos-lib/google-drive-fetch`) to create/update a `RobOS Household Shopping Lists` folder in Google Drive containing **three native Google Docs** (`application/vnd.google-apps.document`) plus `shopping-lists.json`.
  - **Two-Way Google Docs Pull**: Check off items (`☐` → `☑` or `[x]`) or type new lines directly in the Google Docs mobile app and pull them back into RobOS.
  - **Serverless Google Drive Mobile Form (`Apps Script`)**: Automatically writes `Mobile-Form-Apps-Script/Code.gs` and `Index.html` into your Drive folder (also accessible via the in-app Setup modal). Deploying it in Google Drive gives you an interactive mobile form (`script.google.com`) that works over cellular 5G anywhere and embeds its link right at the top of each Google Doc.
- **Built-in Live Mobile Web Companion (`:19225`)**:
  - Serves a thumb-friendly mobile web app over Wi-Fi / [RobOS Private Networks](../private-networks/) with live Server-Sent Events (SSE) sync and offline SVG QR codes.

## Run & Test

```bash
# Launch desktop app
electron packages/shopping-lists --no-sandbox --disable-gpu --disable-dev-shm-usage

# Or run standalone mobile/web server on :19225
node packages/shopping-lists/serve.js

# Run unit & E2E tests
node --test packages/robos-test/tests/shopping-lists/unit.test.js
node --test packages/robos-test/tests/shopping-lists/e2e.test.js
```
