# RobOS Preferences for Android

Brings the settings your RobOS computers back up to Google Drive onto the RobOS phone.

1. Tap **Sign in with Google**. Google's sign-in page opens in the phone's browser (Firefox).
   Google names the app "rclone": RobOS uses the same open-source sign-in on the desktop.
2. When the page says you are signed in, tap **Back to RobOS Preferences**.
3. Choose your backup. If it has a passphrase, enter the one you chose on your computer.
4. Under **Use on this phone**, tap **Restore to this phone** for each app.

Today the phone uses the **Smart home & TVs** category: Smart Home gets your lights, rooms,
scenes and schedules. Lights already on the phone stay. Restoring only reads the backup;
nothing in Google Drive changes. Keys and passwords are not in backups, so Feit / Smart Life
lights still need their keys fetched on the phone (Add Feit or Smart Life lights).

## How it works

- `core/Google.kt`: the desktop's Google sign-in (`robos-lib/cloud-accounts.js`): the same
  public OAuth client, full Drive access, PKCE, and a server on 127.0.0.1 that receives
  Google's answer from the browser. The refresh token is kept in a file encrypted with an
  Android Keystore key.
- `core/Vault.kt`, `core/Scrypt.kt`: reads a Config Sync folder (`robos-lib/config-sync.js`):
  `robos-config.json` and gzipped blobs, AES-256-GCM with a scrypt key when it has a passphrase.
- Restored files go to the app that uses them through its `content://<package>.settings`
  provider, guarded by `com.robos.permission.MANAGE_SETTINGS` (signature level). Both apps
  must be signed with the same key: the image signs them with its test key, so sign builds
  you install with `adb` with it too.

## Build and test

```bash
./gradlew testDebugUnitTest   # checks the port against tools/export-golden.js output
./gradlew assembleRelease
```

`node tools/export-golden.js` rewrites the test data from the desktop code after
`config-sync.js` or its catalog changes.
