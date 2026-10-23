---
title: Order parts and keep stock
summary: Keep your suppliers, order the parts the mechanics ask for, receive deliveries, and track the parts on your shelves.
minutes: 15
---
The **Orders** menu is for whoever buys the parts. It has three tabs: **Orders**, **Stock** and **Suppliers**. Parts the mechanics request at the bench show up here, so nothing gets forgotten, and every part ends up on its repair ticket at what you actually paid.

## Set up your suppliers and stock

On **Suppliers**, add each supplier you buy from, with their phone, email and your account number.

On **Stock**, add the parts you keep on the shelf: the name, the part number (SKU), how many you have now, and a **reorder point**. When the count reaches the reorder point, the item is marked **Low**. Add how many you usually reorder, the last cost, the usual supplier and the shelf or bin.

::shot[add-a-supplier-and-a-stock-item|5|A stock item at its reorder point is marked Low]

> **Good to know.** Stock you do not track is fine. You can order any part, including one-off parts for a single car, without adding it to Stock.

## Order what the mechanics asked for

When a mechanic presses **Request a part** on the [Mechanic bench](../5-mechanic-bench/), the part appears at the top of **Orders** under **Parts the mechanics asked for**, with the ticket, the car and who asked. Urgent requests come first.

::shot[order-a-part-a-mechanic-asked-for|5|A part request from the bench, waiting to be ordered]

Tick the parts you are buying from the same supplier, enter the price if you know it, choose the supplier and press **Add ticked parts to an order**. They go onto that supplier's draft order, such as **PO-0001**. The mechanic sees the part as *ordered*.

## Place the order

A draft collects lines until you are ready. Add more lines from Stock or by description, then choose how you placed it (phone, email, website or in person), enter the supplier's order number and when it is due, and press **Place order**.

::shot[order-a-part-a-mechanic-asked-for|9|A placed order, ready to receive the delivery]

## Receive the delivery

When the parts arrive, open the order under **Waiting for delivery**. Enter how many of each line arrived and the price on the supplier's invoice, then press **Receive delivery**. A partial delivery is fine: the order stays open for the rest.

- A part ordered for a ticket goes onto that ticket at the invoice price. The mechanic sees it as *received*, and its cost appears on the job.
- A stock item is added to Stock, and its last cost is updated.

> **Safety net.** A part on a purchase order can only be received from **Orders**, not marked received at the bench. That way the delivery, the stock and the ticket always agree.

If something will not come, open **Cancel order**, or **Close the rest of the order** after a partial delivery, and give the reason. Any part requests on the cancelled lines go back to **Parts the mechanics asked for**, so you can order them elsewhere.

## Take a part from the shelf

If a requested part is in Stock, its row shows **Take from stock**. One click takes it off the shelf and puts it on the ticket at its last cost. You can also use **Use on a repair ticket** on any stock item.

::shot[take-a-requested-part-from-stock|8|After taking a part from stock, the count goes down]

## Keep stock right

- **Running low.** Items at or below their reorder point, counting what is already on order, are listed at the top of **Orders**. Press **Add to draft orders** to put them on each supplier's draft.
- **Count.** After a shelf count, enter the number you counted and a reason. The difference is recorded, not overwritten.
- **Receive without an order.** For a part bought at the counter, add it straight to Stock.
- **Stock history.** Every change is listed with its date, the order or ticket, and who did it.

::shot[running-low-turns-into-a-draft-order|1|Running low, with how many to order from each supplier]

## Good to know

- Stock value is the count times the last price you paid. It is not FIFO or average costing.
- Receiving an order does not record an expense in **Center reports**. Parts become job costs when they go onto a ticket, so the same part is never counted twice. Record supplier bills as expenses only for parts you do not track this way.
- The Orders, Stock and Suppliers screens are shared RobOS components (RobOS Orders and RobOS Inventory), so other RobOS apps can use the same screens.

## You are ready when

- [ ] Your main suppliers are on the **Suppliers** tab
- [ ] The parts you keep on the shelf are on **Stock**, with reorder points
- [ ] You have ordered and received a test part request, and seen it on the ticket

Back to the start: [the tutorial index](../).
