---
title: Choose your services
summary: Tick what your shop does, such as auto repair, towing, parts sales, tires or body work, and Auto Center adds the menus and questions for it.
minutes: 10
---
No two shops do the same things. One only fixes cars, another also tows and sells parts over the counter, a third is a tire and alignment shop. In Auto Center each of those services is a **plugin**, and you turn on the ones you offer.

## What does your shop do?

Open **Admin → Services**. Each line is a service, such as *We do auto repair*, *We do towing* or *We do tires*, with a short description. Tick the ones you offer.

::shot[see-what-your-shop-offers|1|Admin → Services: tick what your shop does]

A new shop starts with **auto repair** turned on. That gives you the **Front desk** and the **Mechanic bench**. **Orders**, **Checkout**, **Center reports** and **Admin** are always there, because every service uses them.

Services come in three kinds:

- **Ready** services have their own screens. They are **auto repair**, **towing** (the [Tow desk](../10-tow-desk/)) and **auto parts sales** (the Parts counter).
- **Starter** services add their kind of work to the repair desk: a problem type with its own questions on the Front desk, and their common labor operations in the estimate's type-ahead. There are starters for body work, tires, alignments, oil changes, state inspections, auto glass, exhaust, EVs and hybrids, detailing, mobile repairs, and keys and remotes. Starters need auto repair turned on.
- **Planned** services are listed with what they will do, but cannot be turned on yet: fleet accounts, loaner cars, used car sales, and heavy trucks and RVs.

Open **Coming next** on any service to see what is planned for it.

## A starter in action: tires

Tick **We do tires**. The next time a customer calls, **Tires** is one of the problems on the Front desk, and it asks what they need, the tire size from the sidewall, and how many tires.

::shot[turn-on-tires-and-take-a-tire-call|10|Tires on the Front desk, with its own questions]

The answers go on the ticket, so the mechanic and the parts person know exactly what to get. When you write the estimate, tire operations such as *Mount and balance (per tire)* and *Seasonal tire swap* appear as you type, with typical hours.

## Sell parts at the counter

Tick **We do auto parts sales** and a **Parts counter** menu appears. The counter is **RobOS Point of Sale**, the same register RobOS uses for shops and cafés. Press **Open the register** and it opens in its own window, with barcode scanning, card and cash payments, receipts, a cash drawer and its own back office.

::shot[sell-parts-at-the-counter-with-robos-point-of-sale|2|The parts counter opens RobOS Point of Sale in its own window]

The first time, it asks you to set it up: load the **Retail store** sample to look around, or add your own staff PINs, parts and prices in its back office. After that, the **Parts counter** page shows the day's counter sales, and so does **Center reports**.

::shot[sell-parts-at-the-counter-with-robos-point-of-sale|5|The day’s counter sales in Auto Center]

> **Good to know.** The register's data is kept in your shop folder and backed up with the rest of your records. For now the counter keeps its own stock and price list, separate from **Orders → Stock**, so a part sold at the counter does not come off the repair stock count. Sharing one stock count is the first item under *Coming next*.

## Turning a service off

Untick it. Its menus disappear and its questions leave the Front desk. Nothing is deleted: its records stay in your shop history, and they come back when you tick it again. Auto Center will not turn off auto repair while a starter that needs it is still on.

::shot[turn-off-a-service-you-do-not-offer|3|Towing turned off: the Tow desk menu is gone]

## For developers: write a plugin

Every service is a folder in `packages/robos-auto-plugins/` with a `plugin.json`. The manifest names its menus, screens, intake questions, labor operations, KGraph types and billing. Turning a starter into a full service, or adding a new one, does not change the core app. The [plugin README](https://github.com/nddipiazza/robos/blob/main/packages/robos-auto-plugins/README.md) has the manifest, the backend contract and the screen hooks. The tow plugin uses every hook and is the reference.

## You are ready when

- [ ] **Admin → Services** has a tick next to every service you offer, and none next to the ones you do not
- [ ] The Front desk shows the problem types for your services
- [ ] If you sell parts, you have opened the Parts counter and set up the register

Back to the start: [the tutorial index](../).
