---
title: "Organization & Teams"
layout: default
parent: Schemas
nav_order: 2
has_children: true
permalink: /schemas/organization.html
---

# Organization & Teams (robos.org)
{: .no_toc }

Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `organization` |
| Namespace | `robos.org` |
| Package file | `.robos/kgraphs/organization/package.jsonld` |
| Classes documented | 21 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Team]({{ '/schemas/organization/team.html' | relative_url }}) | `robos:Team` | `dcterms:title` |
| [Project]({{ '/schemas/organization/project.html' | relative_url }}) | `robos:Project` | `dcterms:title`, `robos:status` |
| [Epic]({{ '/schemas/organization/epic.html' | relative_url }}) | `robos:Epic` | `dcterms:title` |
| [Git Project Organization]({{ '/schemas/organization/git-project-organization.html' | relative_url }}) | `robos:GitProjectOrganization` | `dcterms:title`, `robos:url`, `robos:orgName`, `robos:forgeType` |
| [Agent Persona]({{ '/schemas/organization/agent-persona.html' | relative_url }}) | `robos:AgentPersona` | `dcterms:title`, `robos:role`, `robos:systemPrompt` |
| [Task Server]({{ '/schemas/organization/task-server.html' | relative_url }}) | `robos:TaskServer` | `dcterms:title`, `robos:serverType`, `robos:url` |
| [User Story]({{ '/schemas/organization/user-story.html' | relative_url }}) | `robos:UserStory` | `dcterms:title`, `robos:status` |
| [Task]({{ '/schemas/organization/task.html' | relative_url }}) | `robos:Task` | `dcterms:title`, `robos:status` |
| [Subtask]({{ '/schemas/organization/subtask.html' | relative_url }}) | `robos:Subtask` | `dcterms:title`, `robos:parentTask` |
| [Bug]({{ '/schemas/organization/bug.html' | relative_url }}) | `robos:Bug` | `dcterms:title`, `robos:severity`, `robos:status` |
| [Sprint]({{ '/schemas/organization/sprint.html' | relative_url }}) | `robos:Sprint` | `dcterms:title`, `robos:status`, `robos:startDate`, `robos:endDate` |
| [Milestone]({{ '/schemas/organization/milestone.html' | relative_url }}) | `robos:Milestone` | `dcterms:title`, `robos:targetDate` |
| [Git Repository]({{ '/schemas/organization/git-repository.html' | relative_url }}) | `robos:GitRepository` | `dcterms:title`, `robos:url`, `robos:defaultBranch` |
| [Git Branch]({{ '/schemas/organization/git-branch.html' | relative_url }}) | `robos:GitBranch` | `dcterms:title`, `robos:branchName`, `robos:repository` |
| [Pull Request]({{ '/schemas/organization/pull-request.html' | relative_url }}) | `robos:PullRequest` | `dcterms:title`, `robos:prNumber`, `robos:sourceBranch`, `robos:targetBranch`, `robos:status` |
| [Git Commit]({{ '/schemas/organization/git-commit.html' | relative_url }}) | `robos:GitCommit` | `dcterms:title`, `robos:commitSha`, `robos:repository` |
| [Git Tag]({{ '/schemas/organization/git-tag.html' | relative_url }}) | `robos:GitTag` | `dcterms:title`, `robos:tagName`, `robos:commitSha` |
| [Comment]({{ '/schemas/organization/comment.html' | relative_url }}) | `robos:Comment` | `robos:content`, `robos:author`, `robos:createdAt`, `robos:parentItem` |
| [Discussion Thread]({{ '/schemas/organization/discussion-thread.html' | relative_url }}) | `robos:DiscussionThread` | `dcterms:title`, `robos:associatedWorkItem`, `robos:threadType` |
| [Review Comment]({{ '/schemas/organization/review-comment.html' | relative_url }}) | `robos:ReviewComment` | `robos:content`, `robos:pullRequest`, `robos:filePath` |
| [Comment Attachment]({{ '/schemas/organization/comment-attachment.html' | relative_url }}) | `robos:CommentAttachment` | `dcterms:title`, `robos:fileUrl` |
