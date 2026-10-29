---
title: Google OAuth client and Drive quota
layout: default
parent: Build on RobOS
nav_order: 11
description: "Why RobOS's Google Drive calls get rate-limited with the default OAuth client, what the shared retry helper does about it, and the recommendation to let users bring their own client ID and to register a RobOS-owned client."
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

## What the code does now

All Drive calls go through `packages/robos-lib/google-drive-fetch.js`:

- `driveFetch(url, init, opts)` retries 403 `rateLimitExceeded` / `userRateLimitExceeded`, 429 and 5xx with exponential backoff. It uses `Retry-After` when Google sends it, capped at 60 seconds. It does not retry 401; the caller refreshes the token.
- `classifyDriveError` / `readDriveError` return a `kind` (`rate_limited`, `no_access`, `not_found`, `scope`, `storage_full`, `auth`, `server`), so the message can say "Google Drive is rate-limiting requests right now" instead of "no access".
- `ROBOS_GDRIVE_API_BASE` points every caller at the mock Drive server (`packages/robos-test/lib/mock-gdrive-server.js`). Use `drive.failNext(n, { status, reason, retryAfter })` there to reproduce rate limiting in tests.

Callers: Config Sync (`config-sync-backends.js`), Cloud Accounts sign-in and Verify (`cloud-accounts.js`), Data Sources sign-in (`data-sources/main.js`), and `data-sources/lib/remote-storage.js`, which the Audio Player, Movie Player and File Explorer use for listing, streaming, downloading and uploading. PR Review's screenshot sharing uses it too.

Retries make the shared client usable, but they do not add quota. Busy minutes are still slow, and a long sync can still run out of retries.

## Recommendation

Do both. They fix different users.

### 1. Let users bring their own OAuth client ID (short term)

A personal Google Cloud project gets its own Drive quota (about 12,000 queries per minute per project by default), so rate limiting stops. The account fields already exist (`clientId`, `clientSecret` on each Cloud Accounts record), and `refreshGoogleAccountToken` and `startGoogleAccountOAuth` already read them. Three things are missing:

1. **Save the client on sign-in.** `startGoogleAccountOAuth` uses `params.clientId`, but the `saveAccount` call after the token exchange does not store `clientId` / `clientSecret`. For a new account, the next token refresh then uses the rclone client. A refresh token only works with the client that issued it, so the refresh fails (`unauthorized_client`). Add both fields to that `saveAccount` call. Keep the secret in the same `0600` file as the tokens.
2. **Add an "Advanced: use my own Google client" section** to Preferences → Cloud Suite Accounts, with Client ID and Client secret fields. The section should include a short how-to: create a Cloud project, enable the Drive API, set up the OAuth consent screen (External, Testing mode, add yourself as a test user), and create a *Desktop app* OAuth client. The loopback redirect `http://127.0.0.1:<port>/` that RobOS uses works with Desktop clients without registering it.
3. **Point users to it when rate limiting shows up.** When `checks.drive.rateLimited` is true, or Config Sync reports rate limiting, the message should link to that section.

Cost: about a day of work, and nothing to run. Drawback: setting up a Cloud project takes 10 minutes and will lose non-technical users. Testing-mode refresh tokens expire after 7 days unless the user publishes the app, which for the `drive` scope means Google verification.

### 2. Register a RobOS-owned OAuth client (long term)

This is the fix for everyone who will not set up their own project. RobOS gets its own Cloud project and quota, and the consent screen says "RobOS" instead of rclone's name.

- Scopes decide the cost. Full `drive` is a *restricted* scope: production use needs Google's OAuth verification plus an annual third-party security assessment (CASA), which takes weeks and costs money. `drive.file` (only files the app created or the user opened with it) is *non-sensitive*. It needs only brand verification. It covers the owner's side of Config Sync, because the app creates the vault folder and every file in it. Check the recipient's side before relying on it: a recipient would open a shared vault through the Google Picker, and it is not yet tested whether a folder picked that way grants access to the files already inside it. Calendar and Contacts scopes are *sensitive*, which means verification but no CASA.
- Suggested split: ship the RobOS client with `drive.file` plus the sensitive Calendar/Contacts scopes. Keep full-`drive` browsing (Data Sources, Audio Player and File Explorer reading arbitrary folders) on bring-your-own-client or the rclone client until verification is worth paying for.
- The client secret of a desktop app is not secret (Google treats installed-app secrets as public), so shipping it obscured in the binary, as is done for rclone's today, is acceptable.
- Ask Google for a quota increase on the project once real usage shows up in the Cloud console.

Until one of these ships, keep the default as is: the rclone client with `driveFetch` retries is slow under load, but it works.
