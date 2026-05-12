# Create a RobOS App Test

Generate a test for a RobOS Electron app using the robos-test framework.

## Input

$ARGUMENTS — `<app-id> <description of what to test>`

## CRITICAL: Verify selectors before writing any test

**Never write a test with guessed selectors.** Before writing a single assertion:

1. Read `packages/<app-id>/renderer/app.html` (or `index.html`) to find actual element IDs and classes
2. Read `packages/<app-id>/renderer/app.js` to understand event listeners and dynamic elements
3. Only use IDs/classes that **literally exist** in those files

Use `grep` to confirm each selector you intend to use:
```bash
grep -n 'id="btn-run"\|class="skill-chip"' packages/<app-id>/renderer/app.html
grep -n "getElementById('btn-run')\|querySelector('.skill-chip')" packages/<app-id>/renderer/app.js
```

If a selector isn't found, do NOT use it — adapt to what's actually there.

## What to create

### Test file

Create `tests/<app-id>/<slug>.test.js` where `<slug>` is derived from the description (lowercase, hyphens).

For smoke tests, use `tests/<app-id>/smoke.test.js`.
For regression tests, use `tests/<app-id>/regression-<bug-id>.test.js`.

### Template

```javascript
const { test, launch } = require('robos-test');

test('<app-id>: <description>', async (t) => {
  const app = await launch('<app-id>');

  // 1. Verify initial state — assert on text that MUST be present on load
  const initial = await app.textSnapshot();
  t.assertContains(initial, 'some text that is always in the DOM on load');

  // 2. Perform action — use ONLY selectors confirmed to exist in renderer HTML/JS
  await app.click('#btn-confirmed-id');       // confirmed: grep found this in app.html
  await app.type('#search-input', 'hello');  // confirmed: grep found this in app.html

  // 3. Wait for result — for async ops (network, IPC) use waitForText
  await t.waitForText('#status-element', 'expected text', { timeout: 5000 });

  // 4. Assert final state
  const result = await app.textSnapshot();
  t.assertContains(result, 'text that appears after the action');

  await app.close();
});
```

### How to fill in the template

1. **Read the renderer first** — grep actual IDs/classes from `packages/<app-id>/renderer/`
2. Each `app.click()`, `app.type()`, `app.eval()` must use a selector confirmed in step 1
3. Each `t.assertContains()` must assert on text that will actually be in the DOM
4. For operations that require AI/network, **do not call the real endpoint** — inject mock state via `app.eval()` instead
5. Keep tests fast: no `minHold`-style sleeps > 2000ms unless waiting for a real async IPC call
6. Use `app.screenshot()` at key steps to capture evidence when a test fails

### Mocking AI/network results in tests

When a feature normally requires an AI call or network request, mock it by injecting
the expected DOM state directly:

```javascript
// Instead of clicking "Run" and waiting for real AI response:
await app.eval(`
  document.getElementById('results-section').style.display = 'block';
  document.getElementById('results-summary').textContent = 'Mock summary';
  document.getElementById('steps-list').innerHTML = '<div class="step-item">Step 1 done</div>';
`);
const after = await app.textSnapshot();
t.assertContains(after, 'Mock summary');
```

### Demo scripts (record-demo skill) have the same rules

When writing a demo script cue that "runs" something, **never** set `minHold > 5000` while
waiting for a real AI/network call. Mock the result with a `js:` injection instead.
A demo video should be **2–3 minutes max** (12–15 cues at 2–5s each).

### Debug server ports (from robos-lib/snapshot-cli.js)

- app-launcher: 19100
- dev-central: 19101
- ai-prompt: 19140
- skills-manager: 19139
- (other apps: see packages/robos-lib/snapshot-cli.js PORT_REGISTRY)

### Running tests on the VM

```bash
# Port-forward the app's debug port
ssh -L <port>:localhost:<port> -p 2224 robos@localhost -N &

# Run the test (app must already be running on the VM desktop as pat)
node tests/<app-id>/<test-name>.test.js
```

## Validation checklist

- [ ] Every selector in the test was confirmed by grepping the renderer HTML/JS
- [ ] No test waits more than 2s for AI/network — mocked instead
- [ ] `t.assertContains` assertions match text that will actually be in the DOM
- [ ] Test has a clear pass/fail signal — it does NOT "just sit there" and time out silently
- [ ] Test file created at correct path in `tests/<app-id>/`
