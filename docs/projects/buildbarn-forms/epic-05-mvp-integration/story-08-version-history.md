# Story 05-08: Version History Panel

**Epic:** [MVP Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Add a version history panel to the config editor page that shows the Git commit history for the selected config file. Users can browse previous versions, view the diff between any two versions, and roll back to a previous version.

## Acceptance Criteria

- [ ] Version history panel accessible from the config editor (via sidebar or tab)
- [ ] Panel shows a list of commits: author, date, commit message, short SHA
- [ ] Clicking a commit shows that version's content in a read-only preview
- [ ] Visual diff between any two versions (using `diff2html` or similar library)
- [ ] "Restore this version" button creates a new commit that reverts to the selected version's content
- [ ] Loading state and error state handled
- [ ] History fetched via `GetConfigSet` with version parameter OR a new `ListConfigVersions` gRPC RPC (coordinate with Tim Potter)
- [ ] At minimum: commits visible with timestamp and message; diff is stretch goal

## Implementation Notes

### Diff Display

Use `diff2html` for visual side-by-side or unified diff display:
```javascript
import Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

const diffHtml = Diff2Html.html(unifiedDiff, {
  drawFileList: false,
  matching: 'lines',
  outputFormat: 'side-by-side',
});
```

### Rollback Mechanism

Rollback is not a git revert — it creates a new commit with the content of the old version:
```
New commit: "Restore to version {short-sha}: {original-commit-message}"
Content: the Jsonnet source from the selected historical version
```

This keeps the Git history linear and auditable.

### Backend Requirement

Coordinate with Tim Potter (Go backend owner) on what history API is available:
- Option A: `GetConfigSet` accepts an optional `commitSha` parameter
- Option B: New `ListConfigVersions` RPC returning commit metadata
- Option C: The backend exposes Git log for a file path

## Files

- `MVP/src/components/BBConfigEditor/VersionHistoryPanel.js` (new)
- `MVP/src/components/BBConfigEditor/VersionHistoryPanel.css` (new)
