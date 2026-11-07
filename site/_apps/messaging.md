---
title: "RobOS Messaging"
package: messaging
category: household
component_type: app
permalink: /messaging/
icon: messaging.svg
summary: "One window for Messenger, Instagram, Snapchat, Signal and SMS, with an inbox RobOS agents can read and send from."
description: "RobOS Messaging puts Messenger, Instagram, Snapchat, Signal and your text messages in one window. Personal accounts sign in on each network's own website; connectors for Signal, SMS, Facebook Pages and Instagram business accounts let RobOS read and send messages itself."
related:
  - /smart-home/
  - /notifications/
---

RobOS Messaging (`packages/messaging`) puts your chats in one window: Messenger, Instagram, Snapchat, Signal and SMS. You can use it like a regular chat app, and you can let RobOS (its agents, scripts and the `robos-messaging` command) read and send messages for you on the networks that allow it.

![RobOS Messaging showing a Signal conversation in the inbox, with the five networks in the sidebar]({{ '/assets/images/screenshots/messaging-inbox.png' | relative_url }})

## Two ways to connect a network

Each network can be connected in up to two ways, and you can use both.

**Web sign-in** opens the network's own website inside RobOS Messaging, and you sign in with your normal personal account. Every network gets its own private browser storage, so Facebook never sees your Snapchat sign-in and the other way round. RobOS shows how many unread messages each one has and passes on its notifications. It does not read these chats or send anything itself.

**Connector** is a link RobOS can use on its own. Its conversations show up in the **Inbox**, and RobOS agents can read and answer them.

| Network | Web sign-in | Connector |
|---|---|---|
| Messenger | Your personal account | A Facebook Page you manage |
| Instagram | Your personal account | A business or creator account |
| Snapchat | Your personal account | None. Snapchat has no messaging API |
| Signal | None. Signal has no website | signal-cli, linked to your phone |
| SMS | Google Messages for Web | KDE Connect, for sending |

Why the difference: Meta lets outside apps read and send Messenger and Instagram messages only for business Pages and professional accounts, and Snapchat offers no way at all. For personal accounts the web sign-in is the way in.

## Setting up each network

Open a network in the sidebar. The **Web sign-in** tab has an **Open the web sign-in** button; the **Connector** tab lists the steps for that network.

### Snapchat, Messenger and Instagram (personal accounts)

Press **Open the web sign-in** and sign in as you would in a browser. You stay signed in until you press **Sign out**, which clears that network's cookies and storage from RobOS Messaging. Links and video calls open in your normal browser.

### Signal

Signal has no website, so RobOS links to your phone's Signal account the same way Signal Desktop does.

1. Install [signal-cli](https://github.com/AsamK/signal-cli) on the computer. It needs Java 21 or newer.
2. On the Signal page, press **Link this computer**. A QR code appears.
3. On your phone, open Signal, go to **Settings > Linked devices > Link new device** and scan the code.
4. Type your Signal number with its country code (for example `+15551234567`) and press **Connect**.

![The Signal connector after linking, showing the steps and the connected number]({{ '/assets/images/screenshots/messaging-signal.png' | relative_url }})

Messages arrive in the Inbox about once a minute, or when you press **Refresh**. Signal hands each message to a linked device only once, so RobOS Messaging keeps a copy on this computer.

### SMS

1. Install KDE Connect on the computer (`sudo apt install kdeconnect`) and on your Android phone (Google Play or F-Droid), and pair them.
2. On the phone, allow KDE Connect to send text messages.
3. On the SMS page, press **Find phones**, pick your phone and press **Connect**.

KDE Connect sends texts. To read them in RobOS Messaging, also turn on **Google Messages for Web** in the SMS page's Web sign-in tab and scan its QR code with the Messages app on your phone.

### A Facebook Page (Messenger connector)

1. Open [Meta for Developers](https://developers.facebook.com/apps/), create an app of type Business, and add the Messenger product.
2. Connect your Page and create a Page access token with the `pages_messaging`, `pages_read_engagement` and `pages_manage_metadata` permissions.
3. Paste the Page ID and the token into the Connector tab and press **Connect**.

Meta only lets a Page reply within 24 hours of the person's last message, and a Page cannot start a conversation. RobOS Messaging tells you when a reply is too late.

### An Instagram business or creator account

1. Switch the account to a professional account in the Instagram app.
2. In [Meta for Developers](https://developers.facebook.com/apps/), add the Instagram product with "API setup with Instagram login" and create a token with `instagram_business_basic` and `instagram_business_manage_messages`.
3. Paste the token into the Connector tab and press **Connect**.

## Letting RobOS read and send

Everything connected through a connector is available to the `robos-messaging` command, which RobOS agents and your own scripts can run. Add `--json` for output a program can read.

```bash
node packages/robos-lib/messaging-cli.js networks
node packages/robos-lib/messaging-cli.js refresh
node packages/robos-lib/messaging-cli.js conversations
node packages/robos-lib/messaging-cli.js read signal:+15551234567
node packages/robos-lib/messaging-cli.js send --conversation signal:+15551234567 "On my way"
node packages/robos-lib/messaging-cli.js send --network sms --to +15551234567 "Running late"
```

Chats you use through a web sign-in are not available to the command.

## Privacy

- Access tokens are saved in `~/.config/robos/messaging/secrets.json`, readable only by you. The window never receives them.
- Your messages are kept in `~/.config/robos/messaging/messages-cache.json`. Config Sync never copies either file, so they stay on this computer.
- Message text is always shown as plain text, so a message can never run code in the window.
- The web sign-ins can show notifications and copy to the clipboard. They cannot use your camera or microphone.
- Disconnecting a connector deletes its token and its conversations from this computer.
