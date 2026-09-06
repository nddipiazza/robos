---
nav_exclude: true
---

# Existing Company Setup in RobOS

**Status:** In Progress
**Priority:** High
**Dependencies:** Security & Auth, Task Management, Group Manager, Workspace Management

An enterprise onboarding and directory synchronization workflow allowing established engineering organizations to seamlessly set up RobOS. Includes automated identity roster ingestion (SAML, Okta, Active Directory, LDAP, GitHub Enterprise Teams), mapping corporate departments to Team Topologies (.robos/teams.yaml), connecting existing task tracking servers (Jira / GitHub Projects), bridging enterprise secrets vaults (HashiCorp Vault, AWS Secrets Manager, pass), and ingesting multi-cluster Kubernetes environments into Kube Studio.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Enterprise Identity & Directory Synchronization](story-01-enterprise-identity-and-directory-sync.md) | In Progress | 8 |
| 02 | [Org Roster, Teams & RBAC Provisioner](story-02-org-roster-teams-and-rbac-provisioner.md) | In Progress | 8 |
| 03 | [Enterprise VCS & Task Tracker Migration](story-03-enterprise-vcs-and-task-tracker-migration.md) | In Progress | 5 |
| 04 | [Shared Secrets Vault & Policy Governance](story-04-shared-secrets-vault-and-policy-governance.md) | In Progress | 5 |
| 05 | [Multi-Cluster & Infrastructure Ingestion](story-05-multi-cluster-and-infrastructure-ingestion.md) | In Progress | 5 |
