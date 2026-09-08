---
title: Organization & Teams (robos.org)
layout: default
parent: KGraph Schemas
nav_order: 2
has_children: true
permalink: /schemas/organization.html
---

# Organization & Teams (robos.org)
{: .no_toc }

People, developer profiles, team topologies, and cross-team communication channels.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `organization`
- **Ontology Namespace**: `robos.org`
- **GitOps Package File**: `.robos/kgraphs/organization/package.jsonld`
- **Schemas Defined**: 17

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Team** (`robos:Team`)]({{ '/schemas/organization/team.html' | relative_url }}) | `urn:robos:shape:TeamShape` | `dcterms:title` | [View Schema &rarr;]({{ '/schemas/organization/team.html' | relative_url }}) |
| [**Project** (`robos:Project`)]({{ '/schemas/organization/project.html' | relative_url }}) | `urn:robos:shape:ProjectShape` | `dcterms:title`, `robos:status` | [View Schema &rarr;]({{ '/schemas/organization/project.html' | relative_url }}) |
| [**Epic** (`robos:Epic`)]({{ '/schemas/organization/epic.html' | relative_url }}) | `urn:robos:shape:EpicShape` | `dcterms:title` | [View Schema &rarr;]({{ '/schemas/organization/epic.html' | relative_url }}) |
| [**Git Project Organization** (`robos:GitProjectOrganization`)]({{ '/schemas/organization/git-project-organization.html' | relative_url }}) | `urn:robos:shape:GitProjectOrganizationShape` | `dcterms:title`, `robos:url`, `robos:orgName`, `robos:forgeType` | [View Schema &rarr;]({{ '/schemas/organization/git-project-organization.html' | relative_url }}) |
| [**Agent Persona** (`robos:AgentPersona`)]({{ '/schemas/organization/agent-persona.html' | relative_url }}) | `urn:robos:shape:AgentPersonaShape` | `dcterms:title`, `robos:role`, `robos:systemPrompt` | [View Schema &rarr;]({{ '/schemas/organization/agent-persona.html' | relative_url }}) |
| [**Task Server** (`robos:TaskServer`)]({{ '/schemas/organization/task-server.html' | relative_url }}) | `urn:robos:shape:TaskServerShape` | `dcterms:title`, `robos:serverType`, `robos:url` | [View Schema &rarr;]({{ '/schemas/organization/task-server.html' | relative_url }}) |
| [**User Story** (`robos:UserStory`)]({{ '/schemas/organization/user-story.html' | relative_url }}) | `urn:robos:shape:UserStoryShape` | `dcterms:title`, `robos:status` | [View Schema &rarr;]({{ '/schemas/organization/user-story.html' | relative_url }}) |
| [**Task** (`robos:Task`)]({{ '/schemas/organization/task.html' | relative_url }}) | `urn:robos:shape:TaskShape` | `dcterms:title`, `robos:status` | [View Schema &rarr;]({{ '/schemas/organization/task.html' | relative_url }}) |
| [**Subtask** (`robos:Subtask`)]({{ '/schemas/organization/subtask.html' | relative_url }}) | `urn:robos:shape:SubtaskShape` | `dcterms:title`, `robos:parentTask` | [View Schema &rarr;]({{ '/schemas/organization/subtask.html' | relative_url }}) |
| [**Bug** (`robos:Bug`)]({{ '/schemas/organization/bug.html' | relative_url }}) | `urn:robos:shape:BugShape` | `dcterms:title`, `robos:severity`, `robos:status` | [View Schema &rarr;]({{ '/schemas/organization/bug.html' | relative_url }}) |
| [**Sprint** (`robos:Sprint`)]({{ '/schemas/organization/sprint.html' | relative_url }}) | `urn:robos:shape:SprintShape` | `dcterms:title`, `robos:status`, `robos:startDate`, `robos:endDate` | [View Schema &rarr;]({{ '/schemas/organization/sprint.html' | relative_url }}) |
| [**Milestone** (`robos:Milestone`)]({{ '/schemas/organization/milestone.html' | relative_url }}) | `urn:robos:shape:MilestoneShape` | `dcterms:title`, `robos:targetDate` | [View Schema &rarr;]({{ '/schemas/organization/milestone.html' | relative_url }}) |
| [**Git Repository** (`robos:GitRepository`)]({{ '/schemas/organization/git-repository.html' | relative_url }}) | `urn:robos:shape:GitRepositoryShape` | `dcterms:title`, `robos:url`, `robos:defaultBranch` | [View Schema &rarr;]({{ '/schemas/organization/git-repository.html' | relative_url }}) |
| [**Git Branch** (`robos:GitBranch`)]({{ '/schemas/organization/git-branch.html' | relative_url }}) | `urn:robos:shape:GitBranchShape` | `dcterms:title`, `robos:branchName`, `robos:repository` | [View Schema &rarr;]({{ '/schemas/organization/git-branch.html' | relative_url }}) |
| [**Pull Request** (`robos:PullRequest`)]({{ '/schemas/organization/pull-request.html' | relative_url }}) | `urn:robos:shape:PullRequestShape` | `dcterms:title`, `robos:prNumber`, `robos:sourceBranch`, `robos:targetBranch`, `robos:status` | [View Schema &rarr;]({{ '/schemas/organization/pull-request.html' | relative_url }}) |
| [**Git Commit** (`robos:GitCommit`)]({{ '/schemas/organization/git-commit.html' | relative_url }}) | `urn:robos:shape:GitCommitShape` | `dcterms:title`, `robos:commitSha`, `robos:repository` | [View Schema &rarr;]({{ '/schemas/organization/git-commit.html' | relative_url }}) |
| [**Git Tag** (`robos:GitTag`)]({{ '/schemas/organization/git-tag.html' | relative_url }}) | `urn:robos:shape:GitTagShape` | `dcterms:title`, `robos:tagName`, `robos:commitSha` | [View Schema &rarr;]({{ '/schemas/organization/git-tag.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Organization & Teams (robos.org) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Organization & Teams (robos.org) (robos.org)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>