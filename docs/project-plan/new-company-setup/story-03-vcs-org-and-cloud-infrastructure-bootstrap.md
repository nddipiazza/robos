---
nav_exclude: true
---

# Story: Greenfield VCS Organization & Cloud Bootstrap

**Epic:** New Company Greenfield Setup in RobOS
**Points:** 5
**Status:** In Progress

## Description
Automated setup of GitHub Organization or internal Gitea instance with standardized branch protection rules (main protection, required PR reviews, signed commits).

## Tasks
- [x] Integrate GitHub Organization creation or connection flow via OAuth.
- [x] Optionally initialize local high-speed Gitea instance for air-gapped or private development.
- [x] Configure standard branch protection rules on default branch (mandatory PR reviews, linear history).
- [x] Provision default repository templates with .devcontainer and CI workflows.
- [x] Save organization VCS endpoints to RobOS config.
