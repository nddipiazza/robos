---
layout: default
title: Ideas folder
nav_exclude: true
---

# Ideas folder

Proposals for RobOS features that are not built, or only partly built. The published index is the [Ideas page](https://rowbose.com/v1/ideas.html). The [Roadmap](https://rowbose.com/v1/roadmap.html) summarizes what is built, in progress and planned.

## Layout

| Folder | Contents |
|:---|:---|
| `inbox/` | Raw notes, one `.txt` file per idea. Some describe ideas that have since been built; the Roadmap says which. |
| `specs/` | One proposal per page. Each page is labelled "Proposal, not built" and has a "What exists today" section. |

## Proposals

| Proposal | Page |
|:---|:---|
| Dev Central as an agent review hub | [specs/dev-central-ai-agent-review-development.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/dev-central-ai-agent-review-development.md) |
| Agent Linux accounts and live agent desktops | [specs/ephemeral-agent-user-profiles.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/ephemeral-agent-user-profiles.md) |
| Gitea forge for E2E tests | [specs/e2e-gitea-support.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/e2e-gitea-support.md) |
| Local task server | [specs/local-open-source-task-server.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/local-open-source-task-server.md) |
| Prompt lineage in the knowledge graph | [specs/prompt-knowledge-graph-logging.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/prompt-knowledge-graph-logging.md) |
| Session context inspector | [specs/robos-session-context-waste-detector.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/robos-session-context-waste-detector.md) |
| Cloud file storage and sharing | [specs/robos-file-storage-and-agent-sharing.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/robos-file-storage-and-agent-sharing.md) |
| Linked accounts and guided OAuth | [specs/robos-people-groups-cloud-identity.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/robos-people-groups-cloud-identity.md) |
| eLearning authoring and team assignments | [specs/robos-learning-management-system.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/robos-learning-management-system.md) |
| Search Studio | [specs/search-engine-and-log-analytics-studio.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/search-engine-and-log-analytics-studio.md) |
| OpenTofu and Terraform synthesis | [specs/terraform-opentofu-iac-synthesis.md](https://github.com/nddipiazza/robos/blob/main/docs/ideas/specs/terraform-opentofu-iac-synthesis.md) |

## Add an idea

![A four-stage pipeline from raw notes in the inbox to structured specs, approved plans and verified implementations]({{ '/assets/images/ideas-issues-pipeline.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The steps below are what exists today.*

1. Write a rough note in `inbox/<name>.txt`.
2. Run the `create-feature-spec` skill on it: `/create-feature-spec docs/ideas/inbox/<name>.txt`. The skill is defined in `plugins/robos/skills/create-feature-spec/SKILL.md` and writes `specs/<name>.md`.
3. Add a row to the table above and to `docs/ideas.md`, then open a pull request.
