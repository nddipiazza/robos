# Create a RobOS App Test

Generate a test for a RobOS Electron app using the robos-test framework.

## Input

$ARGUMENTS — `<app-id> <description of what to test>`

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

  // 1. Verify initial state
  const initial = await app.textSnapshot();
  // t.assertContains(initial, '...');

  // 2. Perform action
  // await app.click('<selector>');
  // await app.type('<selector>', '<text>');
  // await app.eval('<js>');

  // 3. Wait for result
  // await t.waitForElement('<selector>');
  // await t.waitForText('<selector>', '<expected>');

  // 4. Assert final state
  const result = await app.textSnapshot();
  // t.assertContains(result, '...');

  await app.close();
});
```

### How to fill in the template

1. Read the app's renderer HTML and JS to understand selectors and UI structure
2. Identify the DOM elements involved in the feature being tested
3. Use `app.textSnapshot()` to assert on the DOM tree structure
4. Use `app.click(selector)` for button clicks (uses `document.querySelector`)
5. Use `app.type(selector, text)` for text input
6. Use `t.waitForText(selector, text)` for async operations (installs, network calls)
7. Use `app.screenshot()` to capture state for debugging

### Debug server ports (from robos-lib/snapshot-cli.js)

- app-launcher: 19100
- dev-tools: 19122
- (other apps: see port registry)

### Running tests

```bash
# SSH port forward if needed
ssh -L 19100:localhost:19100 -L 19122:localhost:19122 -p 2224 robos@localhost -N &

# Run the test
node tests/<app-id>/<test-name>.test.js
```

## Validation

- [ ] Test file created at correct path
- [ ] Test uses launch() and close() correctly
- [ ] Assertions match the feature being tested
- [ ] Selectors verified against actual renderer HTML
