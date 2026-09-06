---
nav_exclude: true
---

# Story: App Identity, Metadata & Team Ownership Step

**Epic:** New App Development Wizard
**Points:** 5
**Status:** In Progress

## Description
Collect app name, package identifier (URN urn:robos:<archetype>:<slug>), category, icon, and bind ownership directly to a team defined in .robos/teams.yaml.

## Tasks
- [x] Form step collecting App Name, Slug, Description, and Category.
- [x] Auto-generate standardized URN (urn:robos:<archetype>:<slug>).
- [x] Provide Lucide-style SVG icon selector and color picker.
- [x] Fetch and populate team ownership dropdown from .robos/teams.yaml.
- [x] Validate identifier uniqueness against existing packages.
