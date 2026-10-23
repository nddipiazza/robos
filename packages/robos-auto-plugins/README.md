# RobOS Auto plugins

Each service a shop offers is a plugin: auto repair, towing, parts sales, tires, body work and so on. In Auto Center, **Admin → Services** lists them as "We do auto repair [x]", "We do towing [x]" and so on. Turning one on adds its menus, screens, intake questions, labor operations, report cards and billing to the app; turning it off hides them again and keeps its records. The choice is a `robos:ShopService` node in the shop KGraph, so it is backed up with the shop.

The host is `packages/auto-center/lib/plugins.js` (backend) and `packages/auto-center/renderer/plugins.js` (screens). Shared pieces stay in the core and every plugin can use them: customers and vehicles, the repair job model, **Checkout**, **Orders** and **Stock** (RobOS Orders and RobOS Inventory), **Center reports**, payments and private Git backup.

## The plugins

| Plugin | Offer | Status | What it does |
|---|---|---|---|
| `repair` | We do auto repair | Ready | Take the customer's call at the Front desk, quote and approve the work, and fix the car at the Mechanic bench, with Bluetooth OBD-II. |
| `tow` | We do towing | Ready | Take tow and roadside calls, quote them from your rates, dispatch a truck that can carry the vehicle, follow it to the drop-off, and bill the call at Checkout. |
| `parts-sales` | We do auto parts sales | Ready | Sell parts over the counter with RobOS Point of Sale: barcode scanning, cash drawer, card and cash payments, receipts and sales reports, in its own window. |
| `body` | We do body work | Starter | Dents, scratches, accident damage and paint. Adds a "Body or collision damage" intake with the insurance claim, and body labor operations. |
| `tires` | We do tires | Starter | New tires, flat repairs, rotations, balancing and seasonal swaps. Adds a "Tires" intake with the tire size and tire labor operations. |
| `alignment` | We do alignments | Starter | Four-wheel alignments and ADAS calibration. Adds a "Wheel alignment" intake and alignment labor operations. |
| `quick-lube` | We do oil changes | Starter | Oil changes and quick services while the customer waits. Adds an "Oil change" intake and quick-service labor operations. |
| `inspection` | We do state inspections | Starter | Safety inspections and emissions tests. Adds a "State inspection" intake and inspection labor operations. |
| `glass` | We do auto glass | Starter | Windshield chip repair and glass replacement with camera calibration. Adds a "Windshield or glass" intake and glass labor operations. |
| `exhaust` | We do exhaust work | Starter | Mufflers, pipes and catalytic converters. Adds an "Exhaust or muffler" intake and exhaust labor operations. |
| `ev` | We service EVs and hybrids | Starter | Electric and hybrid vehicles. Adds an "Electric or hybrid system" intake and EV labor operations. |
| `detailing` | We do detailing | Starter | Washes, interior cleaning, paint correction and coatings. Adds a "Detailing" intake and detailing labor operations. |
| `mobile` | We do mobile repairs | Starter | Repairs at the customer's home, work or roadside. Adds a "Service at your location" intake and call-out labor. |
| `keys` | We do keys and remotes | Starter | Spare keys, lost keys and remote programming. Adds a "Keys and remotes" intake and key labor operations. |
| `fleet` | We service fleets | Planned | Business customers with many vehicles, monthly invoicing and scheduled maintenance. |
| `loaners` | We lend courtesy cars | Planned | Lend a car while the customer's car is in the shop. |
| `car-sales` | We sell used cars | Planned | Buy, recondition and sell used vehicles. |
| `heavy-duty` | We service heavy trucks and RVs | Planned | Commercial trucks, buses and motorhomes. |

- **Ready:** full screens and workflows.
- **Starter:** adds its intake category and questions to the Front desk, and its labor operations to the type-ahead, so the repair desk can take that work today. Each one lists what it should do next under `roadmap`. Starters need auto repair.
- **Planned:** a manifest and a roadmap only. It is listed but cannot be turned on yet.

## Writing a plugin

A plugin is a folder with a `plugin.json`:

```json
{
  "id": "tires",                       // the folder name
  "name": "Tires",
  "offer": "We do tires",              // the checkbox label in Admin → Services
  "summary": "New tires, flat repairs…",
  "status": "ready | starter | planned",
  "order": 41,                         // position in the Services list
  "defaultEnabled": false,             // auto repair is on for a new shop
  "requires": ["repair"],              // other plugins it needs
  "backend": "lib/index.js",           // optional
  "renderer": { "scripts": ["renderer/tires.js"], "styles": ["renderer/tires.css"] },
  "menus": [{ "view": "tires", "label": "Tire storage", "order": 35, "icon": "<svg path d>" }],
  "intake": "data/intake.jsonld",      // robos:IntakeCategory + robos:IntakeQuestion nodes for the Front desk
  "labor": "data/labor.json",          // [{ "name": "Mount and balance (per tire)", "hours": 0.3 }]
  "types": [["TireSet", "Product", ["robos:vehicle", "robos:tireSize"]]],   // KGraph types and their required properties
  "guide": "12-services",
  "roadmap": ["Seasonal tire storage with rack locations"]
}
```

Menus join the **Shop desk** between the core menus (Orders is 40, Checkout 50, Admin 60). Each menu gets an empty `<section id="view">`, and the plugin's scripts fill it when its menu is clicked. Types are registered with the Auto schema and its SHACL shapes when Auto Center starts, whether or not a shop has the plugin on, so records it wrote stay valid after it is turned off.

### Backend

`lib/index.js` exports a function that receives the core and returns the plugin's parts:

```js
module.exports = core => ({
  // core.workshop (customers, vehicles, repair jobs), core.shop (commit to the shop graph + Git, check-in),
  // core.importer (node, ref), core.reports (money and dates), core.host (this plugin host)
  actions: { storeTires: (service, input) => { … } },   // called from screens as window.auto.workshop({ action, input })
  billableTypes: ['robos:TireStorageJob'],                 // billed and paid like repair jobs: Checkout, payments, profit
  reportCards: (nodes, ctx) => [{ panel: 'floor' | 'performance', label, value, note }],
  jobLinks: (nodes, repairJob) => ({ … }),                 // shown on a repair job as job.links[pluginId]
  intakeAddons: { key: (service, { input, vehicle, answers, urgent, concern }) => ({ build, link, defersCheckIn, note, message }) },
});
```

An action belongs to the plugin that defines it. Calling it while the plugin is off is refused with "Turn on … in Admin → Services". Write records with `core.shop.commit(service, edits, message)`, so every change is validated, saved to the shop graph and committed to its private Git history. Keep a plugin's own files in `core.host.dataDir(service, id)`, which is backed up too.

### Screens

Scripts load once, the first time the plugin is on, under Auto Center's strict Content-Security-Policy (no inline code). They use the shared helpers in `window.workshopUI` and extend the shared screens through `window.autoPlugins.on(hook, pluginId, fn)`:

| Hook | Use |
|---|---|
| `frontDeskChoices` | an extra choice on the Front desk home (Tow: *Dispatch a tow truck*) |
| `intakeConfirm` | a block on the intake Confirm step that sets `s.addons[key]` for a backend `intakeAddons[key]` (Tow: *Send our tow truck?*) |
| `intakeDone`, `ticketNotices`, `repairInvoiceNotices` | notices and next steps around a repair ticket |
| `checkout` | a Checkout provider: `steps`, `load`, `pick`, `item`, `invoice`, `finish`, `paymentNotes` (see `auto-center/renderer/checkout.js`). Payment is shared. |
| `adminTabs` | a tab in Admin (Tow: *Tow trucks*) |

The tow plugin (`tow/`) uses every hook and is the reference. The parts-sales plugin (`parts-sales/`) shows the other way to bring in a whole app: it embeds RobOS Point of Sale, unchanged, on a loopback server and opens it with `service.ui.openWindow()`.

## Tests

```bash
node --test packages/robos-auto-plugins/*/tests/*.test.js   # plugin backends, through the real Auto Center service
node --test packages/auto-center/tests/plugins.test.js       # the host: manifests, turning services on and off, intake, labor
```

The Cucumber scenarios in `packages/auto-center/tests/e2e/features` drive the real app. `Given the shop offers "We do towing"` ticks the service in Admin → Services first.
