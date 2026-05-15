---
nav_exclude: true
---

# Story 16-08: Cross-App Workflow Tests

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 5

## Description

Tests that span multiple apps, verifying end-to-end workflows. These test the integration between apps, not just individual app behavior.

### Example Tests

1. **Install tool → appears in App Launcher**
   - Open Dev Tools → install VS Code → close Dev Tools
   - Open App Launcher → search "Code" → verify VS Code appears with correct icon

2. **Task → Workspace → IDE**
   - Create task in Task Manager → assign to self
   - Workspace Manager provisions workspace (clone, branch, install)
   - IDE opens with the correct project
   - Verify via IDE Bridge MCP that project is loaded

3. **Notification flow**
   - Trigger an action that sends a notification (e.g., install completes)
   - Verify toast appears (via Toast Daemon debug server)
   - Open Notifications app → verify notification in history

4. **MCP tool call → UI update**
   - Call robos_tasks_create via MCP
   - Open Task Manager → verify new task appears in the board

### Multi-App Launch

```javascript
const { test, launch } = require('robos-test');

test('Install tool appears in App Launcher', async (t) => {
  const devTools = await launch('dev-tools');
  
  // Install jq
  await devTools.click('.tool-card[data-tool-id="jq"] .tool-btn.install');
  await devTools.waitForText('.status-badge', 'Installed');
  await devTools.close();
  
  // Check App Launcher
  const launcher = await launch('app-launcher');
  await launcher.type('#search-input', 'jq');
  // jq doesn't have a .desktop file, so this tests the boundary
  await launcher.close();
});
```

## Acceptance Criteria

- [ ] At least 3 cross-app workflow tests
- [ ] Tests clean up after themselves (uninstall what they installed)
- [ ] Multi-app launch works without port conflicts
- [ ] Tests document which apps they depend on
