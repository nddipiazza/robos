---
title: "RobOS Group Manager"
package: group-manager
category: arch-planning
icon: group-manager.svg
summary: "Enterprise directory sync (Okta/SCIM/LDAP), company tenant onboarding, and Team Topologies."
---

Manage organizations, squads, enterprise directory sync, and user access control:
- **Enterprise Directory Sync**: Connects to Okta, Microsoft Entra ID (Azure AD), Google Workspace, and OpenLDAP via SCIM 2.0 and LDAP protocols.
- **Greenfield Startup Bootstrap**: Spin up brand-new tenants from scratch with root administrator setup, token vaulting, and automated VCS org provisioning.
- **Team Topologies**: First-class support for stream-aligned, platform, enablement, and complicated-subsystem squads saved to `.robos/teams.yaml`.
- **Active Identity Card**: Displays active signed-in user, roles, permissions, and company tenant status at all times.
- **Dedicated Guides**: [Existing Company Setup]({{ '/existing-company-setup.html' | relative_url }}) and [New Company Setup]({{ '/new-company-setup.html' | relative_url }}).
![RobOS Group Manager]({{ '/assets/images/screenshots/existing-company-directory-sync_frame.png' | relative_url }})
