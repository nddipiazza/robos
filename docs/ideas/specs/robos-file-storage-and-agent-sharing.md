---
title: "Proposal: cloud file storage and sharing"
layout: default
nav_exclude: true
---

# Proposal: cloud file storage and sharing
{: .no_toc }

A desktop app for browsing cloud object storage, plus MCP tools that let an agent upload a file and share it with people from the People Directory.
{: .fs-6 }

{: .important }
Proposal, not built. There is no `packages/file-storage` and no file storage MCP server in the repository.

## Proposal

- A new app, `packages/file-storage`, with a file browser for several providers. The spec lists S3-compatible stores (including R2 and MinIO), Google Cloud Storage, Azure Blob, Google Drive, OneDrive and WebDAV or SFTP.
- Provider credentials stored in the GPG-backed `pass` store, not in plain files.
- An MCP server, `robos-file-storage-mcp`, with tools to list, upload and download files, create a signed share link, and share with a user or group. For example, an agent could be asked to upload benchmark results to a team bucket and share them with a named person.
- Recipient lookup through [People Directory]({{ '/apps/people-directory/' | relative_url }}) and [Group Manager]({{ '/apps/group-manager/' | relative_url }}), and a desktop notification to the recipient.

The Drive and OneDrive providers depend on the OAuth work in [linked accounts and guided OAuth]({{ '/ideas/specs/robos-people-groups-cloud-identity.html' | relative_url }}).

## What exists today

- [Data Sources]({{ '/apps/data-sources/' | relative_url }}) has an "Amazon S3 / MinIO" connection type (`packages/data-sources/main.js`). Nothing in it lists, uploads or shares objects.
- No package lists a cloud storage SDK (`@aws-sdk`, `@google-cloud/storage`, `@azure/storage`) in its `package.json`.
- People Directory and Group Manager exist, but neither can resolve a person to a cloud account.

## Source

Raw note: [`ideas/inbox/robos-file-storage-and-agent-sharing.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/robos-file-storage-and-agent-sharing.txt). The earlier long spec is in the git history of this file.
