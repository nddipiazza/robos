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
- **Viewable & Editable in Google Docs / Google Drive on Mobile (Clean 4-Column Timestamped Tables)**:
  - Uses your signed-in [RobOS Cloud Accounts](../cloud-accounts/) Google login (`robos-lib/cloud-accounts` + `robos-lib/google-drive-fetch`) to create/update a `RobOS Household Shopping Lists` folder in Google Drive containing **three native Google Docs** (`application/vnd.google-apps.document`) plus `shopping-lists.json`.
  - **Scannable 4-Column Table Layout (`ITEM & QTY` | `AISLE` | `EST.` | `ADDED`)**: Items in `🛒 Items To Buy` are sorted **Newest First** (`updatedAt || addedAt` descending) so items just added via `"Ok Nabu"` voice commands or the mobile form appear at Row #1 with their human-readable `ADDED` timestamp (`Nov 10, 2026, 11:48 AM`). Completed items sit in a separate `✅ Checked Off / In Cart` table at the bottom.
  - **Two-Way Google Docs Pull**: Check off items (`☐` → `☑` or `[x]`) or edit rows directly in the Google Docs mobile app and pull them back into RobOS (`parseGoogleDocText`).
- **Google-Gated Android PWA (`:19225`) & Outbound-Only HTTPS Tunnel (Zero Custom Android APK, Zero Tailscale Needed)**:
  - Serves an installable **Progressive Web App (PWA)** (`/manifest.webmanifest` + `/sw.js`) with live Server-Sent Events (SSE) sync and `fs.watchFile` disk reload so `"Ok Nabu"` voice additions appear on your phone screen immediately.
  - **Outbound-Only Cloudflare HTTPS Tunnel (`serve.js`)**: Automatically spawns `cloudflared tunnel --url http://127.0.0.1:19225` (outbound TLS/QUIC only — zero router port forwarding or inbound firewall ports) and embeds a **256-bit cryptographic capability link (`?auth=<64-hex-token>`)** at the top of your private Google Docs (`📱 Open Interactive Add/Remove Form`).
  - **Google Login Gate (`401 Unauthorized`)**: Unauthenticated visitors on the public tunnel URL see a `🔒 Protected by Google Login` screen (`401 Unauthorized`). Tapping the launch link inside your private Google Doc (which Google protects with your Google login) or signing in via `/auth/google` sets a 1-year `HttpOnly; Secure; SameSite=Lax` session cookie (`robos_shop_session`) on your Android phone.
- **"Ok Nabu" All-Day Voice Assistant & Whisper Phonetic Store Normalization**:
  - Speak *"Ok Nabu, add 2 gallons of whole milk and blueberries to my grocery list"* to your ESPHome / RobOS Voice satellite (`WakeWordDetector` → `NabuCommandRouter` → `SkillsExecutor` → `executeTextCommand`).
  - Includes `normalizeShoppingVoiceTranscript` (`lib/defaults.js`) to automatically correct `Xenova/whisper-tiny.en` phonetic store mishearings (e.g., `"the Mike Rotary list"`, `"my grodery list"` → `"my grocery list"`, `"cosco"` → `"costco"`) and immediately syncs the updated table to Google Docs.

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
