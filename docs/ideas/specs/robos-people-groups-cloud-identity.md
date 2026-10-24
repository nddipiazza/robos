---
title: "Proposal: linked accounts and guided OAuth"
layout: default
nav_exclude: true
description: "Let one person in People Directory link several cloud accounts, and connect each provider through a guided OAuth setup inside RobOS."
---

# Proposal: linked accounts and guided OAuth
{: .no_toc }

Let one person in People Directory link several cloud accounts, and connect each provider through a guided OAuth setup inside RobOS.
{: .fs-6 }

{: .important }
Proposal, not built. People Directory has no linked accounts and no package implements an OAuth flow.

## Proposal

- Several provider accounts on one person: GitHub (personal and enterprise), GitLab, Gitea, Google Workspace, Microsoft 365, Slack, Zulip, Discord, Linear, Jira and AWS IAM Identity Center.
- A guided connection screen per provider: required scopes, the redirect URL to register, copy buttons for client IDs, and a status check that shows whether a token is still valid.
- A local redirect listener for the authorization-code flow with PKCE, and a device-code flow for headless machines.
- Tokens stored in the GPG-backed `pass` store or the Linux Secret Service, not in plain files.
- [People Directory]({{ '/apps/people-directory/' | relative_url }}) and [Group Manager]({{ '/apps/group-manager/' | relative_url }}) would show each person's handles and match teams across providers, for example a GitHub team with a Slack user group.

Cloud file sharing in [cloud file storage and sharing]({{ '/ideas/specs/robos-file-storage-and-agent-sharing.html' | relative_url }}) would use this to find the right account for a recipient.

## What exists today

- People Directory stores people and imports LDIF (`pd-save-person`, `pd-import-ldif` in `packages/people-directory/main.js`). It has no per-provider accounts.
- No code in `packages` implements PKCE (`code_challenge`) or a device-code flow.
- Agents Manager builds an OAuth authorize URL for some MCP servers and opens it (`getOAuthUrlForServer` in `packages/agents-manager/renderer/app.js`). It uses fixed client IDs such as `robos_client_app` and does not run a redirect listener.

## Source

Raw note: [`ideas/inbox/robos-people-groups-cloud-identity.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/robos-people-groups-cloud-identity.txt). The earlier long spec is in the git history of this file.
