# RobOS Orders

Suppliers and purchase orders for any RobOS app, built on [RobOS Inventory](../robos-inventory/README.md), plus a reusable **Orders / Stock / Suppliers** screen. Auto Center's **Orders** menu is the first app that uses it.

## Orders

An order moves through `draft → placed → partly-received → received`. A draft can be cancelled, a placed order with nothing received can be cancelled, and a partly received order can be **closed short**. Each change appends to the order's history.

```js
const { createOrders, createInventory, jsonStore } = require('../robos-orders');
const store = jsonStore('/path/orders.json'), inventory = createInventory({ store });
const orders = createOrders({ store, inventory, namespace: 'myapp', prefix: 'PO', onReceive: ({ order, received }) => [] });
const napa = orders.addSupplier({ name: 'NAPA Auto Parts', phone: '555-0170', account: 'A-1182' });
const po = orders.createOrder({ supplier: napa.id, lines: [{ item: padsId, qty: 4 }, { description: 'Shop rags', qty: 2, unitCost: '9.99' }] });
orders.placeOrder({ order: po.id, via: 'phone', reference: 'N-55120', expectedOn: '2026-10-25' });
orders.receive({ order: po.id, lines: [{ line: po.lines[0].id, qty: 3, unitCost: '29.00' }], by: 'Dan' });  // partly received
orders.reorderSuggestions();   // low-stock items not already covered by an open order
```

- A line for a **stock item** is received into inventory, with the order number on the movement.
- A line can also be **for** any record of the app (`for: id, forLabel: 'RO-0001'`). On delivery, the `onReceive` hook returns more edits, which are saved in the same commit. Auto Center uses this to turn a mechanic's part request into part usage on the repair job. `cancelOrder({ onCancel })` works the same way.
- `draftEdits({ ..., appendToDraft: true })` adds to the supplier's open draft instead of starting a new one, and returns the edits for the caller to commit with its own.
- Order numbers are `PREFIX-0001`, counted per store.

## The screen

`renderer/orders-ui.js` and `renderer/orders-ui.css` are plain files with no build step and no inline code, so they work under a strict `script-src 'self'` Content-Security-Policy:

```html
<link rel="stylesheet" href="../../robos-orders/renderer/orders-ui.css">
<script src="../../robos-orders/renderer/orders-ui.js"></script>
```

```js
RobosOrders.mount(root, {
  call: (op, input) => ipcInvoke('orders', { op, ...input }),   // your backend
  say: text => showMessage(text),
  extras: { orders: ctx => element, stock: ctx => element },    // app panels at the top of a tab
  itemActions: (item, ctx) => [elements],                       // extra buttons on each stock item
});
```

The backend answers `board` with `{ orders, suppliers, items (with onOrder), suggestions, summary, currency }` and handles `addSupplier`, `createOrder`, `addLine`, `removeLine`, `placeOrder`, `receive`, `cancelOrder`, `addItem`, `updateItem`, `adjust`, `receiveStock` and `movements` by calling the functions above. See `packages/auto-center/lib/parts-orders.js` for a complete backend in about 100 lines.

```bash
node --test packages/robos-orders/tests/*.test.js
```
