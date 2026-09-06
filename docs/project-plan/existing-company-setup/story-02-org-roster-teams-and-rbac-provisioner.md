---
nav_exclude: true
---

# Story: Org Roster, Teams & RBAC Provisioner

**Epic:** Existing Company Setup in RobOS
**Points:** 8
**Status:** In Progress

## Description
Enhance RobOS Group Manager (packages/group-manager) to model Team Topologies (Stream-Aligned, Platform, Enabling, Complicated Subsystem) and generate the declarative GitOps .robos/teams.yaml specification.

## Tasks
- [x] Add Team Topologies taxonomy (Stream-Aligned, Platform, Enabling, Complicated Subsystem) into Group Manager UI.
- [x] Implement two-way sync between ~/.config/robos/groups/ and .robos/teams.yaml.
- [x] Add role-based access control (Admin, Architect, Member, Observer) to workspace operations.
- [x] Provide visual team roster explorer with members, leads, and owned packages.
- [x] Validate team definition schema using Zod or JSON Schema.
