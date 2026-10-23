# RobOS Inventory

Stock items and a movement ledger that any RobOS app can reuse. Quantity on hand is the sum of an item's movements. Each movement is a dated **receive**, **issue** or **adjust** record with a reason, a reference and who did it, so nothing is overwritten. RobOS Orders receives purchase orders into it.

```js
const { createInventory, jsonStore } = require('../robos-inventory');       // or /usr/local/share/robos/robos-inventory
const inventory = createInventory({ store: jsonStore('/path/stock.json'), namespace: 'myapp', currency: 'USD' });
const pads = inventory.addItem({ name: 'Front brake pads', sku: 'BP-100', onHand: 3, reorderPoint: 2, reorderQty: 4, unitCost: '30.00' });
inventory.receive({ item: pads.id, qty: 4, unitCost: '28.50', referenceLabel: 'PO-0001' });
inventory.issue({ item: pads.id, qty: 1, referenceLabel: 'RO-0001' });   // refuses to go below zero unless allowNegative
inventory.adjust({ item: pads.id, counted: 5, reason: 'Shelf count' });
inventory.lowStock(); inventory.summary(); inventory.movements(pads.id);
```

## Stores

A store is `{ nodes(), commit(edits, message) }`. Records are JSON-LD nodes (`robos:InventoryItem`, `robos:StockMovement`), and `edits` use the `GraphWorkspace.propose()` format (`{ op: 'add', node }`, `{ op: 'update', id, set }`):

- **KGraph apps:** pass your workspace's commit. Auto Center's adapter is `{ nodes: () => workspace.read()['robos:nodes'], commit: (edits, m) => commit(service, edits, m) }`.
- **`jsonStore(file)`:** one JSON file, replaced atomically, mode `0600`.
- **`memoryStore()`:** for tests.

`movementEdits(input, kind)` returns the edits for a movement without saving them, so an app can save its own records in the same commit, such as a repair job's part usage.

## Rules

- Money is integer minor units (cents). Decimal strings such as `'12.50'` are accepted.
- Quantities may be fractional (litres, feet), up to three decimals.
- An adjustment needs a reason. A count that matches what is on hand is refused.
- Receiving at a new cost updates the item's last cost. Stock value is on hand × last cost; this is not FIFO or average costing.
- A retired item (`updateItem({ active: false })`) can still be counted, but not received or issued.

```bash
node --test packages/robos-inventory/tests/*.test.js
```
