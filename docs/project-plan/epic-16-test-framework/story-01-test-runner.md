# Story 16-01: robos-test Runner Library and CLI

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 8

## Description

Create packages/robos-test/ — the core test runner. Runs on the host machine, connects to the VM via SSH, launches apps, and drives them via their debug HTTP servers.

### API

```javascript
const { test, launch, expect } = require('robos-test');

test('App Launcher shows search bar', async (t) => {
  const app = await launch('app-launcher');
  
  const snapshot = await app.textSnapshot();
  t.assertContains(snapshot, 'input#search-input');
  
  await app.eval('document.getElementById("search-input").value = "terminal"');
  await app.waitFor(() => app.textSnapshot(), s => s.includes('Terminal'));
  
  const filtered = await app.textSnapshot();
  t.assertContains(filtered, 'Terminal');
  t.assertNotContains(filtered, 'Settings');
  
  await app.close();
});
```

### CLI

```bash
# Run all tests
npx robos-test

# Run tests for a specific app
npx robos-test --app app-launcher

# Run a specific test file
npx robos-test tests/app-launcher/smoke.test.js

# Run with screenshots on every step (for debugging)
npx robos-test --screenshot-every-step

# Run against a specific VM
npx robos-test --ssh-port 2224 --host localhost
```

### Core Features

- `launch(appId)` — SSH into VM, start Electron app, wait for debug server health
- `app.textSnapshot()` — GET /text-snapshot
- `app.jsonSnapshot()` — GET /snapshot (full DOM)
- `app.screenshot()` — GET /screenshot, save to disk
- `app.eval(js)` — POST /eval, execute JS in renderer
- `app.click(selector)` — eval `document.querySelector(sel).click()`
- `app.type(selector, text)` — eval to set input value and dispatch events
- `app.waitFor(fn, predicate, timeout)` — poll until predicate passes
- `app.close()` — kill the app process
- Auto-cleanup: kill app processes on test end even if test crashes
- Parallel test execution (different apps on different ports)

## Acceptance Criteria

- [ ] Can launch any RobOS app and interact via debug server
- [ ] Tests run from host machine against live VM
- [ ] Auto-cleanup on test failure (no orphan processes)
- [ ] Parallel execution for independent apps
- [ ] Clear pass/fail output with failure details
