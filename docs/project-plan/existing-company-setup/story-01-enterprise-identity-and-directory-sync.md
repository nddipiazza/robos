---
nav_exclude: true
---

# Story: Enterprise Identity & Directory Synchronization

**Epic:** Existing Company Setup in RobOS
**Points:** 8
**Status:** In Progress

## Description
Ingest corporate user rosters from enterprise directory providers (Okta, Azure AD / Entra ID, LDAP, SAML 2.0 SCIM, GitHub Enterprise Teams) into RobOS local user profiles (~/.config/robos/people/<uid>.json).

## Tasks
- [x] Create directory sync connector supporting SCIM 2.0 and LDAP schemas.
- [x] Implement mapping of corporate identities to ~/.config/robos/people/<uid>.json.
- [x] Add automated synchronization cron or webhook listener for roster changes.
- [x] Support attribute mapping (email, full name, avatar, SSH public keys, GPG fingerprints).
- [x] Add audit log recording all imported user accounts and privilege grants.
