---
title: Run a tow service
summary: Take tow and roadside calls, quote them, send a truck, then bill the call at Checkout. For shops with their own trucks.
minutes: 20
---
If your shop runs its own tow trucks, the **Tow desk** handles the calls. It takes a tow or roadside call, quotes it from your rates while the caller is on the phone, sends a truck that can carry the vehicle, and follows the truck until the vehicle is dropped off. You bill the call at **Checkout**, the same way you bill a repair.

Skip this page if you do not tow. The Tow desk stays empty and nothing else changes.

## Set up your trucks and rates

Open **Admin → Tow trucks**.

1. **Add each truck** with a name, its type and its plate. The type matters:
   - A **flatbed** (rollback) carries the whole vehicle. Use it for all-wheel-drive, electric and damaged cars, and cars with a low front end.
   - A **wheel-lift** lifts two wheels and tows the car on the other two. It is quicker, but it damages an all-wheel-drive or electric drivetrain.
   - A **heavy-duty wrecker** can take anything, including a vehicle with a trailer.
2. **Enter your tow rates**: the hook-up fee, the price per loaded mile and how many miles the hook-up includes, a flat price for roadside help (jump start, lockout, tire change, fuel), winching per hour, an after-hours surcharge, and yard storage per day.
3. **Add your drivers** on the **Team** tab, with a role such as *Tow driver*. Any active team member can drive.

::shot[set-up-your-trucks-and-tow-rates|3|Admin → Tow trucks: your trucks and the rates every quote and tow invoice uses]

> **Good to know.** A call keeps the rates it was quoted with. If you change your rates in the afternoon, a call taken that morning is still invoiced at the morning's prices.

## Take the call

Press **Take a tow or roadside call** and follow the steps along the top: **Caller, Vehicle, Service, Pickup, Quote**.

1. **Caller.** Find them by phone number, email or name, or take a new caller's name and **callback number**. Get the number first, in case the call drops.
2. **Vehicle.** Pick their vehicle, or add it with its year, make and model so the driver knows what to look for.
3. **Service.** Choose **Tow**, **Jump start**, **Lockout**, **Flat tire change**, **Fuel delivery** or **Winch-out**, then answer the questions. They tell the driver which truck to bring.

::shot[a-stranded-driver-calls-for-a-tow|10|The questions for a tow: why, whether the wheels turn, the drivetrain, the keys and where the vehicle is]

4. **Pickup.** Enter where the vehicle is, with anything that helps the driver find it. For a tow, choose where it is going: **Our shop**, **Our storage yard** or **Another address**, and how many miles that is. Then choose **who pays**: the customer, a motor club, an insurer, the police or city, or a fleet account. For anyone but the customer, enter their name and the authorization or PO number they gave you.
5. **Quote.** Check the summary and read the quote back to the caller. Turn **After-hours call** on or off. It is set for you from the time of day, but you decide.

::shot[a-stranded-driver-calls-for-a-tow|16|The quote: hook-up plus the miles beyond those included]

Press **Take the call**. The call gets a number, such as **TW-0001**, and waits for a truck.

> **Safety net.** If the caller says the vehicle is in a highway lane or someone is in danger, the call is marked **Urgent** and goes to the top of the board. Tell them to stay well away from traffic, and to call 911 if anyone is hurt.

### Roadside help and motor clubs

A jump start, lockout, tire change or fuel delivery is charged at your roadside price. When a motor club such as AAA sends the job, choose **Motor club** under *Who pays* and enter its name and the authorization number. The invoice goes to them, not the customer.

::shot[a-jump-start-billed-to-a-motor-club|13|A jump start for a motor club member, quoted at the roadside price]

## Send a truck

The board lists every call under **Waiting for a truck**, **On the road** and **Ready to bill**, with your trucks along the top showing which are free.

On a waiting call, choose the **truck**, the **driver** and how many minutes away they are, and press **Dispatch**. The board shows when they should get there.

> **Safety net.** The Tow desk works out which truck the vehicle needs from the caller's answers. It will not send a wheel-lift to an all-wheel-drive, electric, damaged or lowered car, and it will not send a truck or driver who is already out on another call.

::shot[an-all-wheel-drive-car-needs-a-flatbed|2|A wheel-lift cannot be sent for an all-wheel-drive car]

## Follow the call

Record each step as the driver reports in:

1. **Driver is at the vehicle** when they arrive.
2. Before the vehicle goes on the truck, the driver walks around it and notes any damage that is already there, then you press **Vehicle is on the truck**. Write *No visible damage* if there is none. This note protects you and the customer.
3. At the drop-off, enter the **loaded miles**, any winch time and where it is parked, and press **Dropped off**. For roadside help, press **Service done** instead.

::shot[follow-the-truck-to-the-drop-off|3|The driver notes the condition before towing]

A vehicle dropped at your shop or your yard is **checked in** automatically, so it shows on the shop floor in **Center reports**.

::shot[follow-the-truck-to-the-drop-off|6|Dropped off and ready to bill]

If the caller no longer needs you, open **Cancel this call** and give the reason. A call can be cancelled until the driver reaches the vehicle.

## Bill the call at Checkout

Press **Invoice at Checkout** on the call, or open **Checkout**, where finished tows are listed under **Tow calls to bill**. Checkout has four steps for a tow: **Pick a call, Tow invoice, Payment, Release**.

The tow invoice uses the rates the call was quoted with and the **miles actually driven**, plus the after-hours charge and any winching. For a vehicle in your yard, enter the **storage days**. Add an extra charge, such as a toll, with a note saying what it is for, then press **Issue tow invoice**.

::shot[bill-the-tow-at-checkout|6|The tow invoice step: what was done, and who pays]

Take payment exactly as for a repair. For a motor club or insurer, record their payment when it arrives; the authorization number goes on the payment.

**Release.** A vehicle in your yard is released to whoever collects it: check their ID, enter their name and press **Release vehicle and close call**. A vehicle towed to your shop stays checked in for its repair, so you simply press **Close tow call**.

::shot[bill-the-tow-at-checkout|12|The tow call is closed]

Tow payments and invoices count in **Center reports** alongside repairs. The shop floor shows open tow calls, and the performance tab shows tows completed this month and their loaded miles.

## A car that cannot be driven in

When a customer calls the **Front desk** and answers *No, it needs to be towed*, the confirm step asks **Send our tow truck?** Choose **Yes, send our truck** and enter where the car is. Opening the ticket also opens the tow call, linked to it. The car is checked in when the truck drops it off, and the repair ticket's history records its arrival.

::shot[a-car-that-cannot-be-driven-comes-in-on-our-tow-truck|11|The Front desk offers to send your truck]

::shot[a-car-that-cannot-be-driven-comes-in-on-our-tow-truck|15|The repair ticket and its tow call, waiting for a truck]

At checkout, the repair invoice reminds you if the tow that brought the car in still has a balance. The tow has its own invoice, so a motor club or insurer can pay for the tow while the customer pays for the repair.

## Change the questions

The tow call questions come from the shop knowledge graph, in `data/tow-form.jsonld`. To change them, copy that file to your shop data folder as `tow-form.jsonld` and edit the services and questions. **Admin → Tow trucks** lists the questions in use.

## What the Tow desk does not do yet

| You might expect | What happens today |
|---|---|
| Live truck locations on a map | Not included. The board shows each truck's status and ETA as you record it. |
| A driver app on a phone | Not included. The driver calls or radios in, and the desk records each step. |
| Look up mileage between addresses | Enter the miles from your map app or the truck's odometer. |
| Submit claims to motor clubs | Record the authorization number and the club's payment. Submit the claim on the club's own site. |
| Police rotation lists and impound paperwork | Not included. Bill the police or city as a fleet-style account. |

## You are ready when

- [ ] Your trucks and rates are set up under **Admin → Tow trucks**
- [ ] You have taken a test call, dispatched a truck and dropped the vehicle off
- [ ] You have billed a test tow at **Checkout** and closed the call

Back to the start: [the tutorial index](../).
