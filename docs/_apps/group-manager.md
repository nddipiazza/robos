---
title: "RobOS Group Manager"
package: group-manager
category: arch-planning
icon: group-manager.svg
summary: "Create and edit developer groups (members, repositories, software, onboarding steps, secrets, CI) and set up a sample company identity."
description: "Group Manager stores groups as JSON files under ~/.config/robos/groups. Its Sync Directory and Bootstrap buttons write built-in sample people and teams; they do not connect to Okta or LDAP."
---

Group Manager defines groups of developers and what each group needs: repositories, software, onboarding steps, secrets and CI environments. Other apps read the groups, for example [Git Projects]({{ '/apps/git-projects/' | relative_url }}) uses them for **Add Dev Group Repos**.

## Groups

Click **+** to add a group (a Group ID and Name are required). Select a group to edit it. Each group has these sections:

| Section | Holds |
|---|---|
| Members | People from `~/.config/robos/people/` assigned to the group |
| Git Projects | Repositories, picked from your Git Projects list or GitHub |
| Software Installations | Tools the group needs |
| Onboarding Steps | Steps for a new member |
| Secret Management | Secrets the group uses |
| CI Environments | CI settings |
| Workspaces | IDE project workspaces associated with the group |

Each group is one file, `~/.config/robos/groups/<id>.json`; the folder button under the list opens it. **Create with AI** drafts a group from a description using the agent chosen in the **Agent** menu. **Dev Console** opens `https://localhost:9090` in a window. That is the default address of Cockpit, the Linux server admin console, so it only works if Cockpit is installed and running.

## Identity and company setup

The identity card at the top of the sidebar shows the active user from `~/.config/robos/identity.json`, or "Not Identified".

{: .warning }
**Sync Directory** and **Bootstrap** do not call any directory service. **Sync Directory** takes the name, email, GitHub handle, company and team you enter and writes them as the active identity, adds three fixed sample colleagues (Marcus Wright, Kyle Reese, John Connor) to `~/.config/robos/people/`, creates three sample groups, **overwrites `.robos/teams.yaml` in the RobOS checkout**, and sets your global git `user.name` and `user.email`. It then reports "42 users" regardless of input. The provider menu (Okta SCIM, Entra ID, LDAP, GitHub Enterprise Teams) is recorded as a label only.

**Bootstrap** takes a company name, domain, slug and root administrator, then writes `~/.config/robos/company.json`, an `admin` person and identity file, two starter groups (`founding-core` and `cloud-platform`), a new `.robos/teams.yaml`, and the same global git identity.

Both also add the identity and teams to the SDLC knowledge graph. Commit or back up `.robos/teams.yaml` before using either. Saved groups keep members, workspaces and settings; the topology and lead given in the sample data appear only in `teams.yaml`.

For the intended company setup flows, see [Company setup]({{ '/existing-company-setup.html' | relative_url }}) and [New company]({{ '/new-company-setup.html' | relative_url }}).

Source: [`packages/group-manager`](https://github.com/nddipiazza/robos/tree/main/packages/group-manager).
