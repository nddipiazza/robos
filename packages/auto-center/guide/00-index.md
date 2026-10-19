---
title: Replace your shop system with Auto Center
summary: A step-by-step tutorial for a shop owner moving to RobOS Auto Center.
minutes: 0
---
Auto Center runs a repair shop from the first phone call to the keys going back. Each person gets their own menu: the **front desk** takes the call, the **mechanic** does the work, **checkout** collects the money, and the **owner** sets it all up. Every change is saved and backed up to a private GitHub repository, so you never lose a customer's history.

This tutorial is written for **you, the owner**. It takes you from nothing to a shop that runs on Auto Center, in the order you will do things. Plan on **about two hours of setup**, then a week of running your old system alongside the new one.

::video[One whole repair, from the first call to the keys going back.]

## The path

1. **[Before you start](1-before-you-start/)**: what it replaces, what you need and a tour of the menus.
2. **[Set up your shop](2-set-up-your-shop/)**: your shop details and your team.
3. **[Bring in your data](3-bring-in-your-data/)**: import customers, vehicles and parts.
4. **[Take the customer's call](4-front-desk/)**: the Front desk intake wizard, estimates and approvals.
5. **[The mechanic bench](5-mechanic-bench/)**: tickets, parts requests and hours.
6. **[Check the customer out](6-checkout/)**: invoice, payment and keys.
7. **[Protect your data](7-protect-your-data/)**: backups and restoring to a new computer.
8. **[Run the shop day to day](8-run-the-shop/)**: a daily routine, reports and awkward cases.
9. **[Switch over from your old system](9-switch-over/)**: the plan, and what is not included yet.

## At a glance

A repair moves through five stages, and each stage has an owner:

| Stage | Who | Menu |
|---|---|---|
| 1. Take the call and open a ticket | Front desk | Front desk |
| 2. Quote the work and get approval | Front desk | Front desk |
| 3. Fix the car | Mechanic | Mechanic bench |
| 4. Invoice and take payment | Checkout | Checkout |
| 5. Hand back the keys | Checkout | Checkout |

## Before you commit

Auto Center is a desktop tool for one shop on one computer. It records texts, emails and payments but does not send or charge them, and it has no printable invoice, appointment calendar or sales tax yet. The full list is on [Switch over from your old system](9-switch-over/). Read it before you decide.

Every page in this tutorial is built from end-to-end tests that drive the real app, and every screenshot comes from those runs. See [How we know it works](tests/).
