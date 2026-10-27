---
title: "RobOS Cloud Accounts"
package: cloud-accounts
category: security-vault
icon: cloud-accounts.svg
summary: "One list of your cloud accounts, shared with Data Sources and Google Calendar; Google accounts can sign in through the browser and be written into Thunderbird."
description: "Cloud Accounts keeps Google, Microsoft, Nextcloud, Dropbox and S3 accounts in ~/.config/robos/cloud-accounts.json and keeps them in step with Data Sources. Only Google accounts have a sign-in flow, a token check and Thunderbird setup."
related:
  - /apps/data-sources/
  - /apps/google-calendar/
  - /apps/robos-preferences/
  - /apps/dev-central/
---

The window in `packages/cloud-accounts` sits on top of two shared modules, `packages/robos-lib/cloud-accounts.js` and `packages/robos-lib/thunderbird-google.js`. The account registry lives in the first one, so [RobOS Preferences]({{ '/apps/robos-preferences/' | relative_url }}), [RobOS Google Calendar]({{ '/apps/google-calendar/' | relative_url }}) and [Data Sources]({{ '/apps/data-sources/' | relative_url }}) read and write the same accounts.

## Supported providers

| Provider | Services listed for it | What the app can do |
|---|---|---|
| Google Workspace / Google | Drive, Calendar (CalDAV), Contacts (CardDAV), Gmail (IMAP/SMTP) | Browser sign-in, token check, service toggles, Thunderbird setup |
| Microsoft 365 / OneDrive | OneDrive, Outlook Calendar | Track by email |
| Nextcloud / WebDAV / CalDAV | WebDAV files, CalDAV, CardDAV | Track by username |
| Dropbox | Storage | Track by email |
| Amazon S3 / Cloudflare R2 / MinIO | Buckets | Track by username |

The **Add / Link Account** form only asks for a provider, an email or username, and a label. It has no field for a password, token or access key, so a hand-added account is tracked but not signed in: it shows **Login Required**. An account counts as signed in only when a credential is stored for it, either OAuth tokens on the account or, for an account imported from Data Sources, a token, password, API key, service-account key or local mount on the Data Sources entry. Those Data Sources secrets stay in `data-sources.json`; the account only records that they exist. An account saved by an older version with a **Connected** flag but no credential also shows **Login Required** now.

To sign a Google account in, use **+ Sign in with Google**. The other providers have no sign-in here; one only shows **Connected** once a Data Sources entry with credentials for it is imported. **Verify** on a non-Google account makes no network call. It says whether a credential is stored and, if one is, that it was not checked against the provider.

## Where data is stored

- `~/.config/robos/cloud-accounts.json` holds the accounts, the default account id, and any OAuth access and refresh tokens. It is plain JSON written with mode `0600`; tokens are not encrypted.
- `~/.config/robos/data-sources.json` is read every time the list loads. Entries with driver `gdrive`, `onedrive`, `webdav`, `dropbox` or `s3` are imported as accounts, and their tokens and folders are merged in. Saving a Google or Microsoft account writes its email and tokens back to matching `gdrive`/`onedrive` entries. Adding one from the form, or signing in with Google, creates a new Data Sources entry if none matches.
- `~/.config/robos/electron/cloud-accounts/` is the Electron profile for the window.

Because [RobOS Audio Player]({{ '/apps/audio-player/' | relative_url }}) reads its Drive and OneDrive credentials from `data-sources.json`, tokens from a sign-in here reach it through that file.

## Google sign-in

**+ Sign in with Google** starts a small HTTP server on `127.0.0.1:53682` (or a random port if that one is busy) and opens your browser on it. You go to Google's consent page with offline access; the code comes back to the local server, which exchanges it for tokens, reads your email from the Drive API, and saves the account. The flow gives up after 180 seconds.

With the built-in OAuth client the request only asks for the Google Drive scope. Calendar, Contacts and Gmail scopes are requested only when the account has its own OAuth client id stored. **Re-authenticate / Upgrade OAuth Scopes** runs the same flow for the selected account, so with the built-in client it also asks only for Drive.

**Verify Token & Endpoints** calls the Drive `about` endpoint, refreshes the access token on a 401 if a refresh token is stored, then tries to list your calendars. Contacts is not called; the result just shows the CardDAV URL. A Google account with no stored token fails Verify with **Login Required** and no request is made.

## Services and Thunderbird

For a Google account the detail pane has a card per service with an **Enabled** checkbox. The checkbox is saved on the account in `cloud-accounts.json`. Only the Thunderbird setup (here and in Google Calendar) reads it; Data Sources and Audio Player do not. The "used by" chips on each card are fixed labels, and one of them names a File Explorer app that is not in the suite.

**Sync to Thunderbird Calendar** writes a block marked `// >>> ROBOS-GOOGLE-INTEGRATION-START (<email>)` into `user.js` in every Thunderbird profile under `~/.thunderbird` and `~/snap/thunderbird/common/.thunderbird`. If no profile exists, it creates `robos001.default-release` and a `profiles.ini`. The block adds the Google CalDAV calendar and CardDAV address book for the enabled services, plus Gmail IMAP and SMTP with OAuth2 if Gmail is enabled. Running it again replaces the block for that email and leaves your other prefs alone. No tokens are written to Thunderbird; it asks you to sign in to Google itself. This app does not install Thunderbird; Google Calendar does that.

## Other actions

- **Set as Default** marks the account other apps get when they ask for an account without naming one. If none is set, the first signed-in Google account is used.
- **Remove** deletes the account from `cloud-accounts.json` without asking. It does not touch `data-sources.json` or Thunderbird, so an account that came from Data Sources comes back on the next refresh.
- **Open Google Calendar & Thunderbird** and **Open Data Sources** start those apps, using a wrapper in `~/.local/bin` if there is one.

[Dev Central]({{ '/apps/dev-central/' | relative_url }}) and Google Calendar have buttons that open this app, and Preferences has a Cloud Accounts section with the same list and Google sign-in.

## Run it

Open **RobOS Cloud Accounts** from the desktop or the [App Launcher]({{ '/apps/app-launcher/' | relative_url }}). Only one window runs at a time. From a checkout:

```bash
scripts/dev-launch.sh cloud-accounts
```

Source: [`packages/cloud-accounts`](https://github.com/nddipiazza/robos/tree/main/packages/cloud-accounts). The registry's tests are in `packages/robos-lib/cloud-accounts.test.cjs` and `packages/robos-test/tests/cloud-accounts/unit.test.js`.
