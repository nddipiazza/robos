---
title: "Proposal: eLearning authoring and team assignments"
layout: default
nav_exclude: true
redirect_from:
  - /ideas/specs/robos-elearning-creation-and-organization-ux-audit.html
---

# Proposal: eLearning authoring and team assignments
{: .no_toc }

Add course creation, folders and search, and per-team assignments and completion reports to the eLearning Hub.
{: .fs-6 }

{: .important }
Proposal, not built. This page replaces two older specs, an LMS proposal and a UX audit of the eLearning Hub.

## Proposal

The older LMS spec described a new app, `packages/robos-lms`. The eLearning Hub now provides the player, so the items below would extend [RobOS eLearning Hub]({{ '/apps/robos-elearning/' | relative_url }}) instead.

**Authoring**

- Create a course inside the app, either blank or generated from an application in the knowledge graph, instead of only opening courses made elsewhere.
- Edit chapters, lab steps and quiz questions with a form, not raw JSON-LD.
- A link picker for the services and contracts a course teaches.

**Organization**

- Folders or learning tracks, tags, and search in place of the single course dropdown.
- Drag and drop to reorder courses, modules and lab steps.

**Teams**

- Assign a course to a person or group from [People Directory]({{ '/apps/people-directory/' | relative_url }}) and [Group Manager]({{ '/apps/group-manager/' | relative_url }}), with a due date.
- A completion and score report per team, and overdue alerts.
- Export completion records as xAPI or SCORM events.
- Player extras: synchronized transcript highlighting for narrated lessons and playback speed control.

## What exists today

The hub (`packages/robos-elearning`) already does the following:

- Lists courses from the knowledge graph in one dropdown (`course-selector` in `renderer/index.html`).
- Shows lab steps and quiz questions with feedback.
- Issues and lists completion certificates (`elearning:issue-certificate`, `elearning:list-certificates` in `main.js`).
- Exports a course website and a slide archive.
- Saves an edited course to the knowledge graph and to `.robos/elearning.yaml` (`elearning:save-course`).

It has no create-course screen, no folders, no drag-and-drop ordering, and no assignment, SCORM or xAPI code.

## Source

Raw note: [`ideas/inbox/robos-learning-management-system.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/robos-learning-management-system.txt). The earlier LMS spec and UX audit are in the git history.
