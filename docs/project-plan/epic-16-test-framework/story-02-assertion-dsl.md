# Story 16-02: Test Assertion DSL (DOM Matchers, Text Snapshots)

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 5

## Description

Rich assertion helpers for testing RobOS app UI state.

### Text Snapshot Matchers

```javascript
// Assert element exists
t.assertElement('#search-input');
t.assertElement('.tool-card[data-tool-id="docker"]');

// Assert text content
t.assertText('.tool-name', 'Docker');
t.assertText('.status-badge', 'Installed');

// Assert element has class
t.assertClass('.category-btn:first-child', 'active');

// Assert element count
t.assertCount('.tool-card', 19);
t.assertCountGreaterThan('.app-card', 5);

// Assert visibility
t.assertVisible('#log-panel');
t.assertHidden('#empty-state');
```

### Snapshot Matching (like Playwright's toMatchAriaSnapshot)

```javascript
// Match against a snapshot pattern (subset matching)
await t.assertSnapshotContains(`
  div#tool-list
    div.tool-card
      div.tool-name "Docker"
      span.status-badge.status-installed "Installed"
`);

// Full snapshot comparison (saved to __snapshots__/)
await t.assertSnapshotMatch('dev-tools-all-tab');
```

### Wait Helpers

```javascript
// Wait for element to appear
await t.waitForElement('.status-badge.status-installed');

// Wait for text to change
await t.waitForText('#log-output', 'completed successfully');

// Wait for element count
await t.waitForCount('.tool-card', 19);
```

## Acceptance Criteria

- [ ] All matchers work against text snapshots (fast) and JSON snapshots (precise)
- [ ] Snapshot files saved/compared like Jest snapshots
- [ ] Wait helpers have configurable timeout with clear error on timeout
- [ ] Matchers produce readable error messages on failure
