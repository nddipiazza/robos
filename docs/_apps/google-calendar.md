---
title: "RobOS Google Calendar"
package: google-calendar
category: core-desktop
icon: google-calendar.svg
summary: "Installs Mozilla Thunderbird if needed and writes Google Calendar, Google Contacts and optional Gmail settings into its profile for a Google account from Cloud Accounts."
description: "RobOS Google Calendar installs Thunderbird with apt or the official Mozilla tarball and adds a user.js block with CalDAV, CardDAV and optional IMAP/SMTP settings for each Google account in RobOS Cloud Accounts. It stores no Google credentials in Thunderbird."
related:
  - /apps/cloud-accounts/
  - /apps/data-sources/
  - /apps/dev-central/
---

RobOS Google Calendar, in `packages/google-calendar`, sets up Mozilla Thunderbird as the calendar and contacts client for a Google account. It does not show your calendar itself. The work is done by the shared module `packages/robos-lib/thunderbird-google.js`; the app is a form around it.

## Where the account comes from

The app lists the Google accounts in `~/.config/robos/cloud-accounts.json`, the store kept by `packages/robos-lib/cloud-accounts.js` and managed in [RobOS Cloud Accounts]({{ '/apps/cloud-accounts/' | relative_url }}). Each time it reads that store, the module also imports Google Drive and OneDrive entries from `~/.config/robos/data-sources.json`, the file written by [Data Sources]({{ '/apps/data-sources/' | relative_url }}), so a Drive login made there shows up here. The default account is selected first.

**+ Sign in / Switch Google Account** starts a browser OAuth 2.0 sign-in through a loopback server on `127.0.0.1:53682` (or a random port if that one is taken). From this app it uses the built-in Google Drive desktop client and requests only the Drive scope, then saves the account and tokens back to `cloud-accounts.json` and `data-sources.json`. It does not request Calendar, Contacts or Gmail scopes. **Manage Cloud Accounts** opens the Cloud Accounts app.

## Installing Thunderbird

The app looks for Thunderbird at `~/.local/bin/thunderbird`, `~/.local/opt/thunderbird/thunderbird`, `/usr/bin/thunderbird`, `/snap/bin/thunderbird`, `/usr/local/bin/thunderbird`, then on `PATH`. If none is found, **Install & Configure Thunderbird** runs a bash script and streams its output to the provisioning log:

- If `sudo -n true` succeeds (passwordless sudo), it runs `apt-get update` and `apt-get install -y thunderbird`.
- Otherwise it downloads `thunderbird-latest-SSL` for linux64 from `download.mozilla.org`, extracts it to `~/.local/opt/thunderbird`, and writes a wrapper script at `~/.local/bin/thunderbird` that sets `MOZ_DISABLE_CONTENT_SANDBOX=1`.

The status card mentions snap, but the installer never installs the snap; it only detects one that is already there.

## What it writes

Settings go into `user.js` in the Thunderbird profile. The app reads `profiles.ini` under `~/.thunderbird` and `~/snap/thunderbird/common/.thunderbird`. If no profile exists, it creates `robos001.default-release` with a matching `profiles.ini` in both locations. It writes to every profile it finds, not only the default one.

Each account gets a block between `// >>> ROBOS-GOOGLE-INTEGRATION-START (<email>)` and `// <<< ROBOS-GOOGLE-INTEGRATION-END (<email>)`. Running it again replaces that block and keeps everything else in the file. The block contains:

| Service | Prefs | Endpoint |
|---|---|---|
| Google Calendar | `calendar.registry.<uuid>.*`, type `caldav`, offline cache on, `refreshInterval` from **Sync Interval** | `https://apidata.googleusercontent.com/caldav/v2/<email>/events` |
| Google Contacts | `ldap_2.servers.robos_gcontacts_<key>.*`, `dirType` 102, sync every 30 minutes | `https://www.googleapis.com/carddav/v1/principals/<email>/lists/default/` |
| Gmail (off by default) | `mail.account`, `mail.server`, `mail.smtpserver` entries, OAuth2 (`authMethod` 10) | `imap.gmail.com:993` (SSL), `smtp.gmail.com:465` |

It also sets an identity, `calendar.timezone.local` from the system time zone, and `calendar.list.sortOrder` listing every RobOS calendar in the file (the line is removed when no account has Calendar ticked). The calendar UUID is derived from the email address, so repeat runs update the same calendar instead of adding a new one. The right-hand pane previews the block before anything is written.

No access or refresh token is written into Thunderbird. Thunderbird has to complete its own Google sign-in the first time it connects to these endpoints.

After writing, the app marks the account in `cloud-accounts.json` with `thunderbirdConfigured`, `thunderbirdLastSyncedAt`, `thunderbirdProfilePath`, the calendar color, the sync interval (`calendarRefreshMinutes`) and the service toggles. When you pick an account, the form loads these stored values.

## Use it

1. Pick an account under **Active Google Account**.
2. Tick the services and set the calendar color and **Sync Interval (Minutes)**.
3. Click **Install & Configure Thunderbird**, or **Write Configuration to Thunderbird Profile** to write the profile without installing.
4. Click **Launch Thunderbird Calendar**, which starts Thunderbird with `--profile <default profile> -calendar`.

Both buttons configure the selected account and then run the configuration again for every Google account in Cloud Accounts. That second pass reuses each account's stored choices (services, calendar color and sync interval), so what you set for the selected account is what ends up in `user.js`. An account that has never been configured gets a 15-minute `refreshInterval`, the field's default. Unticking Google Calendar leaves that account's calendar out of the RobOS block. Thunderbird copies prefs from `user.js` into its own `prefs.js` when it starts, though, so a calendar it has already loaded stays in Thunderbird until you delete it there.

The "Discovered Calendars" box calls the Google Calendar API with the account's stored access token. Because sign-in from this app only grants the Drive scope, it usually shows just the primary calendar and a note.

## Run it

Open **RobOS Google Calendar** from the desktop or the [App Launcher]({{ '/apps/app-launcher/' | relative_url }}). From a checkout:

```bash
scripts/dev-launch.sh google-calendar
```

[Dev Central]({{ '/apps/dev-central/' | relative_url }}) can also open this app, and reads the calendars it configures from the Thunderbird profile.

Source: [`packages/google-calendar`](https://github.com/nddipiazza/robos/tree/main/packages/google-calendar) and [`packages/robos-lib/thunderbird-google.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-lib/thunderbird-google.js).
