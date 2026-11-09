---
title: "RobOS Preferences for Android"
package: robos-preferences-android
category: core-desktop
icon: robos-preferences.svg
summary: "Prototype RobOS Mobile app that signs in to Google Drive on Android, opens Config Sync backups and restores settings to mobile apps."
description: "RobOS Preferences for Android is a RobOS Mobile prototype for Android 11+ phones that opens RobOS Config Sync backups in Google Drive and restores Smart Home settings."
permalink: /robos-preferences-android/
redirect_from:
  - /apps/robos-preferences-android/
landing: /mobile/
---

RobOS Preferences for Android brings the settings your RobOS computers back up with [Config Sync](/config-management/) onto an Android phone. Part of [RobOS Mobile](/mobile/), it runs right now as a prototype on any Android 11+ phone via `adb install` (without wiping the device) and is also pre-installed in the prototype LineageOS 24 OS image.

## How to use it

1. On your RobOS computer, open [Preferences](/robos-preferences/), go to **Config Sync & Sharing** and sync to Google Drive.
2. On your phone, open **RobOS Preferences** and tap **Sign in with Google**. Google's sign-in page opens in the phone's browser. When it says you are signed in, return to Preferences.
3. Choose your backup. If it is protected with a passphrase, enter it.
4. **In this backup** lists each category and how many files it holds.
5. Under **Use on this phone**, tap **Restore to this phone** on the Smart Home card. Smart Home's lights, rooms, scenes and schedules are added to [Smart Home for Android](/smart-home-android/).

Other categories stay untouched in your backup until mobile prototypes support them.

## How it works

- Sign-in works the same way as on the desktop: Google's public "rclone" OAuth client, a loopback redirect to `127.0.0.1` on the phone, and PKCE.
- Passphrase backups are opened with scrypt and AES-256-GCM, matching `robos-lib/config-sync.js` on the desktop.
- Settings are handed to other apps through a content provider protected by the signature permission `com.robos.permission.MANAGE_SETTINGS`, so only apps signed with the same key (such as debug APKs built on the same computer, or the prebuilt OS image) can receive them.

## Build, install and test

The app lives in [`packages/robos-preferences-android`](https://github.com/nddipiazza/robos/tree/main/packages/robos-preferences-android) and runs on Android 11 (API 30) or later:

```bash
cd packages/robos-preferences-android
./gradlew test
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
