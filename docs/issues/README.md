---
layout: default
title: Issue registry
nav_exclude: true
---

# Issue registry

Issue specifications written by the `report-issue` skill from raw bug reports. This folder is a working record for contributors and agents, not user documentation.

## Layout

| Folder | Contents |
|:---|:---|
| `inbox/` | Raw report text, one `.txt` file per report. |
| `reported/` | One structured specification per defect, named `ISSUE-<number>-<slug>.md`. |

## Report an issue

Run the skill with the bug description, or with the path to a raw note:

```text
/report-issue <description or path to a file in docs/issues/inbox>
```

The skill is defined in `plugins/robos/skills/report-issue/SKILL.md`. It saves the raw text to `inbox/`, writes the specification to `reported/`, and adds a row to the table below.

## Reported issues

| Issue | Title | Status | Severity | Specification |
|:---|:---|:---|:---|:---|
| ISSUE-001 | Bypass Ubuntu 26.04 initial setup popups | Triaged | Medium | [spec](https://github.com/nddipiazza/robos/blob/main/docs/issues/reported/ISSUE-001-ubuntu-26-firstboot-popups.md) |
| ISSUE-002 | Switching to GNOME desktop reverts to Electron after 1 min | Triaged | High | [spec](https://github.com/nddipiazza/robos/blob/main/docs/issues/reported/ISSUE-002-gnome-desktop-reverts-electron.md) |
| ISSUE-003 | Display resize does not properly resize top taskbar | Triaged | Medium | [spec](https://github.com/nddipiazza/robos/blob/main/docs/issues/reported/ISSUE-003-display-resize-taskbar-width.md) |
| ISSUE-004 | Display resize does not reposition App Menu icon | Triaged | Medium | [spec](https://github.com/nddipiazza/robos/blob/main/docs/issues/reported/ISSUE-004-display-resize-app-menu-reposition.md) |
| ISSUE-005 | App Menu icon click does nothing | Triaged | High | [spec](https://github.com/nddipiazza/robos/blob/main/docs/issues/reported/ISSUE-005-app-menu-click-unresponsive.md) |

All five came from one raw note, [`inbox/desktop-ui-and-gnome-bugs.txt`](https://github.com/nddipiazza/robos/blob/main/docs/issues/inbox/desktop-ui-and-gnome-bugs.txt). The status and severity values are the ones recorded when the specifications were written; they have not been re-checked against the current code.
