---
title: "Organization & Teams (robos.org)"
layout: default
parent: Schemas
nav_order: 2
has_children: true
permalink: /schemas/organization.html
description: "Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments."
---

# Organization & Teams (robos.org)
{: .no_toc }

Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments.
{: .fs-6 }

| | |
|---|---|
| Package id | `organization` |
| Namespace | `robos.org` |
| Package file | `.robos/kgraphs/organization/package.jsonld` |
| Classes documented | 21 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Team (`robos:Team`)]({{ '/schemas/organization/team.html' | relative_url }}) | `urn:robos:shape:TeamShape` | `dcterms:title` |
| [Project (`robos:Project`)]({{ '/schemas/organization/project.html' | relative_url }}) | `urn:robos:shape:ProjectShape` | `dcterms:title`, `robos:status` |
| [Epic (`robos:Epic`)]({{ '/schemas/organization/epic.html' | relative_url }}) | `urn:robos:shape:EpicShape` | `dcterms:title` |
| [Git Project Organization (`robos:GitProjectOrganization`)]({{ '/schemas/organization/git-project-organization.html' | relative_url }}) | `urn:robos:shape:GitProjectOrganizationShape` | `dcterms:title`, `robos:url`, `robos:orgName`, `robos:forgeType` |
| [Agent Persona (`robos:AgentPersona`)]({{ '/schemas/organization/agent-persona.html' | relative_url }}) | `urn:robos:shape:AgentPersonaShape` | `dcterms:title`, `robos:role`, `robos:systemPrompt` |
| [Task Server (`robos:TaskServer`)]({{ '/schemas/organization/task-server.html' | relative_url }}) | `urn:robos:shape:TaskServerShape` | `dcterms:title`, `robos:serverType`, `robos:url` |
| [User Story (`robos:UserStory`)]({{ '/schemas/organization/user-story.html' | relative_url }}) | `urn:robos:shape:UserStoryShape` | `dcterms:title`, `robos:status` |
| [Task (`robos:Task`)]({{ '/schemas/organization/task.html' | relative_url }}) | `urn:robos:shape:TaskShape` | `dcterms:title`, `robos:status` |
| [Subtask (`robos:Subtask`)]({{ '/schemas/organization/subtask.html' | relative_url }}) | `urn:robos:shape:SubtaskShape` | `dcterms:title`, `robos:parentTask` |
| [Bug (`robos:Bug`)]({{ '/schemas/organization/bug.html' | relative_url }}) | `urn:robos:shape:BugShape` | `dcterms:title`, `robos:severity`, `robos:status` |
| [Sprint (`robos:Sprint`)]({{ '/schemas/organization/sprint.html' | relative_url }}) | `urn:robos:shape:SprintShape` | `dcterms:title`, `robos:status`, `robos:startDate`, `robos:endDate` |
| [Milestone (`robos:Milestone`)]({{ '/schemas/organization/milestone.html' | relative_url }}) | `urn:robos:shape:MilestoneShape` | `dcterms:title`, `robos:targetDate` |
| [Git Repository (`robos:GitRepository`)]({{ '/schemas/organization/git-repository.html' | relative_url }}) | `urn:robos:shape:GitRepositoryShape` | `dcterms:title`, `robos:url`, `robos:defaultBranch` |
| [Git Branch (`robos:GitBranch`)]({{ '/schemas/organization/git-branch.html' | relative_url }}) | `urn:robos:shape:GitBranchShape` | `dcterms:title`, `robos:branchName`, `robos:repository` |
| [Pull Request (`robos:PullRequest`)]({{ '/schemas/organization/pull-request.html' | relative_url }}) | `urn:robos:shape:PullRequestShape` | `dcterms:title`, `robos:prNumber`, `robos:sourceBranch`, `robos:targetBranch`, `robos:status` |
| [Git Commit (`robos:GitCommit`)]({{ '/schemas/organization/git-commit.html' | relative_url }}) | `urn:robos:shape:GitCommitShape` | `dcterms:title`, `robos:commitSha`, `robos:repository` |
| [Git Tag (`robos:GitTag`)]({{ '/schemas/organization/git-tag.html' | relative_url }}) | `urn:robos:shape:GitTagShape` | `dcterms:title`, `robos:tagName`, `robos:commitSha` |
| [Comment (`robos:Comment`)]({{ '/schemas/organization/comment.html' | relative_url }}) | `urn:robos:shape:CommentShape` | `robos:content`, `robos:author`, `robos:createdAt`, `robos:parentItem` |
| [Discussion Thread (`robos:DiscussionThread`)]({{ '/schemas/organization/discussion-thread.html' | relative_url }}) | `urn:robos:shape:DiscussionThreadShape` | `dcterms:title`, `robos:associatedWorkItem`, `robos:threadType` |
| [Review Comment (`robos:ReviewComment`)]({{ '/schemas/organization/review-comment.html' | relative_url }}) | `urn:robos:shape:ReviewCommentShape` | `robos:content`, `robos:pullRequest`, `robos:filePath` |
| [Comment Attachment (`robos:CommentAttachment`)]({{ '/schemas/organization/comment-attachment.html' | relative_url }}) | `urn:robos:shape:CommentAttachmentShape` | `dcterms:title`, `robos:fileUrl` |
