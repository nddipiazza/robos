---
title: "Data Sources Explorer"
package: data-sources
category: databases-streams
icon: data-sources.svg
summary: "Connects to Google Drive, OneDrive, SFTP, FTP and local folders, and keeps a catalog of S3, Dropbox, WebDAV and database entries that do not connect yet."
description: "Data Sources stores storage and database entries in ~/.config/robos/data-sources.json. Google Drive, OneDrive, SFTP and FTP entries open real connections for testing, browsing, uploads and downloads; S3, Dropbox, WebDAV and database entries only record the entry."
related:
  - /apps/cloud-accounts/
  - /apps/audio-player/
---

Data Sources Explorer (`packages/data-sources`) is where you register the storage and databases other RobOS apps use. Google Drive, OneDrive, SFTP and FTP entries are real connections: the app signs in, lists folders, and uploads and downloads files. The other entry types are a catalog only.

{: .important }
S3, Dropbox and WebDAV entries never contact the provider. They read and write the entry's local folder under `~/.robos/cloud-mounts/<id>/`, and the connection test reports "Connected" with the provider's API name whatever the credentials are. For PostgreSQL, MySQL / MariaDB, SQLite / DuckDB, MongoDB and Redis entries, **Test Database Handshake** waits about 150 ms and reports "Connected". Nothing connects to a database.

## Storage drivers

The client lives in `packages/data-sources/lib/remote-storage.js`. Other apps load it too, for example [Audio Player]({{ '/apps/audio-player/' | relative_url }}) for streaming music from a linked folder.

| Driver | How it connects |
|---|---|
| Google Drive | Drive REST API v3, with an OAuth access token (refreshed with the refresh token), a service account JSON key or an API key. A local GVFS or `rclone` mount can be used instead. |
| Microsoft OneDrive | Microsoft Graph, with an OAuth token from the browser login. |
| SFTP | `ssh2-sftp-client`, with a password or a private key file. |
| FTP / FTPS | `basic-ftp`, with explicit TLS when enabled. |
| Local / NAS Folder Mount | A folder on disk. |
| Amazon S3 / R2 / MinIO, Dropbox, Nextcloud / WebDAV | Not connected; see the note above. |

For the connected drivers, **Run Connection Test** really connects (SFTP and FTP list the configured path, for example) and records the status and latency on the entry. A Google Drive or OneDrive entry without a token reports "Login Required", and saving one shows a sign-in toast.

## Sign in to Google Drive or OneDrive

**Log in with Browser** starts a small HTTP server on `127.0.0.1` and opens the provider's consent page in your browser. The tokens it receives are saved on the entry. If you don't supply your own OAuth client, the app uses its built-in client IDs. You can also paste an OAuth access token into the form.

## Browse and move files

Select a storage entry to browse its folders. You can create a folder, upload files, download a file into the entry's local folder under `~/.robos/cloud-mounts/<id>/`, and open that folder in the file manager.

**Link Folder** writes a `.robos-cloud-manifest.json` index of up to 500 files into the local folder and adds the folder to `~/.config/robos/cloud-folders.json`. It does not download the files. A Google Drive entry can link several folders, and each one gets its own subfolder.

## Where the data lives

- Entries, including OAuth tokens and secrets, are saved as plain JSON in `~/.config/robos/data-sources.json` with file mode 0600.
- After each save, the app asks [Cloud Accounts]({{ '/apps/cloud-accounts/' | relative_url }}) to import the entries, so a Google Drive sign-in here also shows up there.
- A new install starts empty. The sample entries in `main.js` (an Acme Petshop PostgreSQL database, an S3 vault and so on) are loaded only by the test harness.
- Setting `ROBOS_GRAPH_ROOT` switches the app to a read-only view of the data-store nodes (databases, message brokers, topics, tables) in that knowledge graph workspace. Saving, deleting and the live panels are disabled in that mode.

## Run it

Launch **Data Sources** from the desktop or [App Launcher]({{ '/apps/app-launcher/' | relative_url }}), or run:

```bash
scripts/dev-launch.sh data-sources
```

Source: [`packages/data-sources`](https://github.com/nddipiazza/robos/tree/main/packages/data-sources).
