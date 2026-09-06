---
nav_exclude: true
---

# Story: Enterprise VCS & Task Tracker Migration

**Epic:** Existing Company Setup in RobOS
**Points:** 5
**Status:** In Progress

## Description
Bulk import and discovery of enterprise repositories from GitHub Enterprise, GitLab Self-Managed, or Bitbucket Data Center, and connect enterprise Jira Cloud/Server or GitHub Projects.

## Tasks
- [x] Provide bulk repository importer discovering all repos under corporate orgs.
- [x] Connect Jira Cloud/Server REST API with token authentication and project mapping.
- [x] Connect GitHub Enterprise Projects / Issues and map backlogs into RobOS task graph.
- [x] Link repository URLs directly to team ownership in .robos/teams.yaml.
- [x] Auto-generate ~/.config/robos/git-projects.json with all imported enterprise workspaces.
