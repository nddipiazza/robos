---
title: "RobOS Preferences for Android"
package: robos-preferences-android
category: core-desktop
icon: robos-preferences.svg
summary: "Signs in to Google Drive on an Android phone, opens your RobOS Config Sync backups and restores the settings phone apps use."
description: "RobOS Preferences for Android finds your RobOS Config Sync backups in Google Drive, opens passphrase backups and restores Smart Home settings to the phone."
permalink: /robos-preferences-android/
redirect_from:
  - /apps/robos-preferences-android/
landing: /phone/
---

RobOS Preferences for Android brings the settings your RobOS computers back up with [Config Sync](/config-management/) to your phone. It is built into the [RobOS phone](/phone/).

## How to use it

1. On your RobOS computer, open [Preferences](/robos-preferences/), go to **Config Sync & Sharing** and sync to Google Drive.
2. On the phone, open **Preferences** and tap **Sign in with Google**. Google's sign-in page opens in the phone's browser. When it says you are signed in, come back to Preferences.
3. Choose your backup. If it is protected with a passphrase, enter it.
4. **In this backup** lists each category and how many files it holds.
5. Under **Use on this phone**, tap **Restore to this phone** on the Smart Home card. Smart Home's lights, rooms, scenes and schedules are added to [Smart Home for Android](/smart-home-android/).

Other categories stay on your computers until a phone app can use them.

## How it works

- Sign-in works the same way as on the desktop: Google's public "rclone" OAuth client, a redirect to `127.0.0.1` on the phone, and PKCE.
- Passphrase backups are opened with scrypt and AES-256-GCM, matching `robos-lib/config-sync.js` on the desktop.
- Settings are handed to other apps through a content provider protected by the signature permission `com.robos.permission.MANAGE_SETTINGS`, so only apps signed with the same key can receive them.

## Source

The app lives in [`packages/robos-preferences-android`](https://github.com/nddipiazza/robos/tree/main/packages/robos-preferences-android).

```bash
cd packages/robos-preferences-android
./gradlew test
```
