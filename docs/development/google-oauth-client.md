---
title: Google OAuth client and Drive quota
layout: default
parent: Build on RobOS
nav_order: 11
description: "Why Google's sign-in page says rclone and RobOS's Google Drive calls get rate-limited with the default OAuth client, what the shared retry helper and the own-client option do about it, and the recommendation to register a RobOS-owned client."
---

# Google OAuth client and Drive quota
{: .no_toc }

This page covers why Google Drive calls from RobOS often fail with a rate-limit error, how the code handles it, and what we recommend changing. It is for contributors working on Cloud Accounts, Data Sources, Config Sync or any app that reads Google Drive.

## The problem

RobOS signs in to Google with rclone's public desktop OAuth client (`DEFAULT_GDRIVE_CLIENT_ID`, project `202264815644`, in `packages/robos-lib/cloud-accounts.js`). Drive's API quota is counted per Google Cloud project, so every rclone user in the world shares that client's per-minute quota. Most minutes it is used up. On 2026-10-29, 4 of 5 live calls got this answer:

```json
{ "error": { "code": 403, "status": "PERMISSION_DENIED",
  "message": "Quota exceeded for quota metric 'Queries' and limit 'Queries per minute' of service 'drive.googleapis.com' for consumer 'project_number:202264815644'.",
  "errors": [{ "domain": "usageLimits", "reason": "rateLimitExceeded" }] } }
```

The error is a 403 with status `PERMISSION_DENIED`, but the cause is quota, not access. Code that treats every 403 as "no access" tells users that a working account is broken.

## Why Google's sign-in page says "rclone"

Google's account chooser ("Choose an account to continue to rclone") and consent page ("rclone wants to access your Google Account") show the app name registered on the OAuth client's Google Cloud project. `DEFAULT_GDRIVE_CLIENT_ID` and `DEFAULT_GDRIVE_OBSCURED_SECRET` are rclone's public Drive client, copied from rclone's `backend/drive` (the secret is decrypted with rclone's `obscure` key, and the loopback port 53682 is rclone's too). The same client is duplicated in `packages/data-sources/lib/remote-storage.js`. RobOS cannot change that name in code: only the owner of project `202264815644` can. `DEFAULT_ONEDRIVE_CLIENT_ID` is rclone's OneDrive client, so Microsoft's sign-in page names rclone in the same way.

Every Google sign-in in RobOS goes through this client unless the account has its own: Preferences → Cloud Suite Accounts and Config Sync's "Back up to my Google Drive" (both through `startGoogleBrowserOAuth`), the Cloud Accounts and Google Calendar apps, and the Data Sources sign-in page.

What RobOS itself shows never says rclone: the account label is `Google (<email>)` (`normalizeAccountRecord`), and the Data Sources connection made at sign-in (`gdrive-google-<email-slug>`) takes that label as its name. Tokens go from Google straight to the loopback server on the user's computer; rclone's developers get no tokens or files, only aggregate request counts in their Cloud console.

The UI now says this where people sign in: a notice in Preferences → Cloud Suite Accounts, a one-line hint on Config Sync's Google Drive card, and, on each Google account row, which client it uses (`account.oauthClient` from `describeGoogleOAuthClient`).

## What the code does now

All Drive calls go through `packages/robos-lib/google-drive-fetch.js`:

- `driveFetch(url, init, opts)` retries 403 `rateLimitExceeded` / `userRateLimitExceeded`, 429 and 5xx with exponential backoff. It uses `Retry-After` when Google sends it, capped at 60 seconds. It does not retry 401; the caller refreshes the token.
- `classifyDriveError` / `readDriveError` return a `kind` (`rate_limited`, `no_access`, `not_found`, `scope`, `storage_full`, `auth`, `server`), so the message can say "Google Drive is rate-limiting requests right now" instead of "no access".
- `ROBOS_GDRIVE_API_BASE` points every caller at the mock Drive server (`packages/robos-test/lib/mock-gdrive-server.js`). Use `drive.failNext(n, { status, reason, retryAfter })` there to reproduce rate limiting in tests.

Callers: Config Sync (`config-sync-backends.js`), Cloud Accounts sign-in and Verify (`cloud-accounts.js`), Data Sources sign-in (`data-sources/main.js`), and `data-sources/lib/remote-storage.js`, which the Audio Player, Movie Player and File Explorer use for listing, streaming, downloading and uploading. PR Review's screenshot sharing uses it too.

Retries make the shared client usable, but they do not add quota. Busy minutes are still slow, and a long sync can still run out of retries.

## Recommendation

Do both. They fix different users.

### 1. Let users bring their own OAuth client ID (short term, shipped)

A personal Google Cloud project gets its own Drive quota (about 12,000 queries per minute per project by default), so rate limiting stops, and Google's pages show the app name the user registers (for example "RobOS").

What is in place:

1. **Preferences → Cloud Suite Accounts → "Use my own Google OAuth client"** takes a client ID and secret, with the setup steps, and calls `startGoogleBrowserOAuth({ clientId, clientSecret })`. A client ID without a secret is refused. "Go back to the built-in client" calls it with `useBuiltInClient: true`.
2. **The client is saved with the tokens it issued.** `startGoogleBrowserOAuth` stores `clientId` / `clientSecret` on the account (same `0600` file as the tokens), and `syncAccountToDataSources` copies them to the Drive data source whenever it copies a refresh token. A refresh token only works with the client that issued it, so before this a new account signed in with its own client failed its first refresh (`unauthorized_client`). Signing in again keeps the account's client; a refresh token from another client is never kept.
3. **With its own client, sign-in asks for Drive, Calendar and Contacts at once** (`useMultiScope`).

Still to do: point users to the section when rate limiting shows up (`checks.drive.rateLimited`, or Config Sync reporting rate limits).

Setting up the client (the user does this in Google Cloud Console; RobOS cannot): create a project, enable the Google Drive API (and the Calendar / People APIs if used), under Google Auth Platform set the app name to "RobOS", choose External and add yourself as a test user, then create an OAuth client of type *Desktop app*. The loopback redirect `http://127.0.0.1:<port>/` works with Desktop clients without registering it.

Drawbacks: the setup takes about 10 minutes and will lose non-technical users. In Testing mode Google shows "Google hasn't verified this app" (the user chooses Continue) and refresh tokens expire after 7 days. Publishing the app (In production) without verification stops the 7-day expiry but keeps the warning, and caps an app that asks for restricted scopes such as full `drive` at 100 users, which is fine for one person. Config Sync on several computers needs the same client on each, since every computer refreshes its own tokens.

### 2. Register a RobOS-owned OAuth client (long term)

This is the fix for everyone who will not set up their own project. RobOS gets its own Cloud project and quota, and the consent screen says "RobOS" instead of rclone's name.

- Scopes decide the cost. Full `drive` is a *restricted* scope: production use needs Google's OAuth verification plus an annual third-party security assessment (CASA), which takes weeks and costs money. `drive.file` (only files the app created or the user opened with it) is *non-sensitive*. It needs only brand verification. It covers the owner's side of Config Sync, because the app creates the vault folder and every file in it. Check the recipient's side before relying on it: a recipient would open a shared vault through the Google Picker, and it is not yet tested whether a folder picked that way grants access to the files already inside it. Calendar and Contacts scopes are *sensitive*, which means verification but no CASA.
- Suggested split: ship the RobOS client with `drive.file` plus the sensitive Calendar/Contacts scopes. Keep full-`drive` browsing (Data Sources, Audio Player and File Explorer reading arbitrary folders) on bring-your-own-client or the rclone client until verification is worth paying for.
- The client secret of a desktop app is not secret (Google treats installed-app secrets as public), so shipping it obscured in the binary, as is done for rclone's today, is acceptable.
- Ask Google for a quota increase on the project once real usage shows up in the Cloud console.

### 3. Keep rclone's client as the default

This is today's default and needs nothing from anyone. rclone's client is verified by Google for full `drive`, so users see no "unverified app" warning and tokens do not expire after 7 days. The costs: Google's pages say "rclone", Drive quota is shared with every rclone user (`driveFetch` retries make it slow under load, not broken), and rclone's maintainers can rotate or restrict the client at any time, which would sign every RobOS user out.

Until the RobOS-owned client ships, keep it as the default and offer option 1 to anyone who wants their own name and quota.
