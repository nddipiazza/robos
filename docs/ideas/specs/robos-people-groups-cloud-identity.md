---
layout: default
nav_exclude: true
---

# Feature Spec: RobOS People & Groups — Multi-Cloud Identity & Guided OAuth Integrations

- **Status**: Draft
- **Created Date**: 2026-09-03
- **Target Component**: Desktop Apps (`packages/people-directory`, `packages/group-manager`, `packages/security-setup`, `packages/robos-preferences`)
- **Author/Idea Source**: User Idea

## 1. Overview & Vision
Modern software development involves collaboration across a distributed ecosystem of cloud identity providers, VCS hosts, issue trackers, and messaging tools. A single developer or team member frequently operates across multiple distinct cloud accounts (e.g., corporate Google Workspace, Microsoft Office 365, primary personal & work GitHub accounts, Slack workspaces, AWS IAM Identity Center, Linear, Zulip, etc.).

Currently, RobOS identity management is primarily centered around GitHub organization access and basic local configurations. 

This feature overhauls the **RobOS People Directory & Group Manager** suite into a unified, multi-cloud identity hub. It enables:
1. **Multi-Account Association Per User**: Seamlessly associate multiple cloud identities (Google, Office 365, GitHub, Slack, AWS, Linear, Zulip) to each RobOS user profile.
2. **Built-in Guided OAuth Setup**: Embedded OAuth 2.0 / PKCE / Device Flow authorization wizards that provide step-by-step instructions, redirect listener handling, and token verification directly inside the app.
3. **Cross-Service Team & Group Sync**: Aggregation of team memberships across GitHub teams, Slack user groups, Google Workspace groups, and AWS organizations.
4. **Secure Secret Management**: All tokens and refresh credentials are automatically encrypted via the RobOS GPG pass store or Linux Secret Service API.

## 2. User Stories & Use Cases
- **As a** developer using RobOS across multiple client or company organizations,
- **I want to** link my Office 365, Google, multiple GitHub accounts, Slack, Linear, and Zulip accounts in one place,
- **So that** RobOS desktop apps and AI agents can interact with the right context and permissions on my behalf.

- **As an** engineering manager or team lead,
- **I want to** view unified People & Group directories that display colleagues' associated Slack handles, GitHub usernames, Zulip streams, and cloud emails,
- **So that** AI agents and developers can automatically tag, assign, notify, and share assets with the correct team members.

- **As a** developer connecting a new provider (e.g., Slack or Office 365),
- **I want** an interactive, step-by-step OAuth setup wizard with clear instructions (e.g., required scopes, redirect URLs, client ID configuration),
- **So that** I don't have to fiddle with complex manual token generation or command-line configurations.

## 3. Key Capabilities & Scope

### 3.1 Multi-Cloud Account Associations
- Support unified user profile records mapping a core identity to multiple provider accounts:
  - **VCS**: GitHub (personal + enterprise accounts), GitLab, Gitea
  - **Productivity & Identity**: Google Workspace / Accounts, Microsoft 365 (Azure AD / Entra ID)
  - **Communication**: Slack (multi-workspace), Zulip, Discord
  - **Issue Tracking & Project Management**: Linear, Jira, GitHub Issues
  - **Cloud Infrastructure**: AWS IAM Identity Center / AWS SSO

### 3.2 Guided In-App OAuth Authorization Engine
- **Built-in Local Callback Server**: Ephemeral localhost redirect listener for OAuth 2.0 PKCE / authorization code flows.
- **Provider Connection Wizards**: Visual step-by-step guides for each provider:
  - Pre-filled permission presets (e.g., "Read-only team access", "Full agent automation").
  - Clear copy-paste buttons for redirect URIs and Client IDs where user app registration is required.
  - Device code flow support for headless or browser-isolated environments.
  - Live token validation and scope health indicators (showing green/amber/red status for active credentials).

### 3.3 People & Groups Directory Enhancement
- **People Directory (`packages/people-directory`)**:
  - Searchable directory of teammates showing consolidated cloud handles (GitHub, Slack, Email, Timezone, Status).
  - Quick action buttons: Open Slack DM, view GitHub activity, send email, or assign task.
- **Group Manager (`packages/group-manager`)**:
  - Unified view of teams across platforms (e.g., matching a GitHub Team `@frontend-core` with Slack user group `@frontend-devs`).
  - Cross-provider membership audit (identifying orphaned accounts or missing team members).

### 3.4 MCP Agent Context Integration
- Expose people and group resolution tools to RobOS AI agents via Model Context Protocol (MCP):
  - `resolve_user_identity({ query })` -> returns linked GitHub, Slack, Email, Zulip handles.
  - `list_team_members({ teamName })` -> returns members with linked provider accounts.

### Out of Scope
- Acting as a primary identity provider (IdP) or hosting SAML identity servers (RobOS integrates with existing providers).
- Automated provisioning of enterprise licenses on third-party SaaS platforms.

## 4. Architectural & System Integration

- **Impacted Packages/Apps**:
  - `packages/group-manager` (expanded team aggregation across cloud providers)
  - `packages/people-directory` (rich multi-identity user profiles)
  - `packages/security-setup` / `packages/robos-preferences` (OAuth credential setup & refresh token manager)
  - `packages/robos-lib` (shared identity schema, OAuth listener helper, token storage abstractions)
  - `packages/mcp-manager` / MCP server tools
- **IPC / Endpoints Required**:
  - `ipcMain.handle('identity:list-accounts')`
  - `ipcMain.handle('identity:start-oauth-flow', { provider, scopes, clientId })`
  - `ipcMain.handle('identity:link-account', { userId, provider, accountData })`
  - `ipcMain.handle('identity:test-provider-connection', { providerId })`
  - `ipcMain.handle('identity:list-people', { search, filters })`
  - `ipcMain.handle('identity:list-groups', { provider })`
- **UI/UX Considerations**:
  - Consistent RobOS dark theme (`#0d1117`, cyan accent `#00bcd4`).
  - Provider badge chips with official SVG branding icons (Google, Microsoft 365, Slack, GitHub, Linear, Zulip, AWS).
  - Modal wizard with visual step breadcrumbs, loading spinners during callback capture, and instant test confirmation.
- **Data & Configuration Storage**:
  - Metadata & account links: `~/.config/robos/identities/profiles.json` and `groups.json`.
  - Sensitive tokens / refresh keys: Encrypted via `pass` in `~/.password-store/robos/oauth/<provider>/`.

## 5. Proposed Implementation Plan

1. **Phase 1: Shared Cloud Identity Core & Secure OAuth Engine (`robos-lib`)**
   - Implement OAuth 2.0 PKCE / Authorization Code / Device Code helper with local callback listener in `robos-lib`.
   - Implement encrypted token storage and automatic refresh token rotation.
   - Define unified `RobOSUserIdentity` and `RobOSGroup` schemas.

2. **Phase 2: Provider Connectors & Guided UI Wizards**
   - Build guided setup flows for Google, Microsoft 365, GitHub, Slack, Linear, Zulip, and AWS.
   - Add status diagnostic panel showing connection health, token expiry, and granted scopes.

3. **Phase 3: Overhaul People Directory & Group Manager Apps**
   - Refresh `people-directory` UI to display consolidated multi-account cards and fast filter by group/provider.
   - Refresh `group-manager` to manage cross-platform team mappings and permissions.

4. **Phase 4: MCP Tool Integration**
   - Expose identity resolution and group membership query tools to AI agents via MCP.

## 6. Acceptance Criteria
- [ ] Users can link multiple distinct accounts for GitHub, Google, Office 365, Slack, Linear, Zulip, and AWS.
- [ ] In-app OAuth setup wizard guides the user through authorization without requiring terminal commands or manual token juggling.
- [ ] People Directory displays consolidated teammate profiles with linked cloud accounts and direct action buttons.
- [ ] Group Manager displays synchronized team memberships across GitHub, Slack, and cloud providers.
- [ ] RobOS AI agents can resolve user identities and team memberships via MCP tools.
- [ ] All OAuth tokens and refresh keys are securely encrypted at rest.
