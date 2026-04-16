# Story 20-02: Add /eval Interaction Helpers to snapshot.js

**Epic:** [Deep Test Coverage & Autonomous Verification](epic.md)
**Status:** Not started
**Points:** 5

## Description

Add helper functions to `packages/robos-test/lib/snapshot.js` that wrap the `POST /eval` endpoint on the debug server. Currently all tests are read-only (take a snapshot, assert on text). These helpers enable tests to interact with the UI.

### New Functions

```javascript
// Execute arbitrary JS in the renderer
async function evalJS(port, js)

// Click an element by CSS selector
async function evalClick(port, selector)

// Type text into an input (sets value + dispatches input/change events)
async function evalType(port, selector, text)

// Change a select element's value
async function evalSelect(port, selector, value)

// Poll snapshot until predicate returns true
async function evalWaitFor(port, predicateFn, timeoutMs = 10000, pollMs = 500)

// Convenience: wait for text to appear in DOM
async function waitForText(port, text, timeoutMs = 10000)
```

### Implementation

These wrap `POST http://localhost:{port}/eval` which executes JS via `win.webContents.executeJavaScript()` in the Electron main process (see `packages/robos-lib/dom-snapshot.js`).

`evalClick` dispatches a real click event. `evalType` sets `.value` and dispatches `input` + `change` events with `{bubbles: true}`. `evalWaitFor` polls `getSnapshot()` at 500ms intervals.

## Acceptance Criteria

- [ ] `evalJS(port, js)` sends POST to /eval and returns the result
- [ ] `evalClick(port, selector)` clicks an element; throws if not found
- [ ] `evalType(port, selector, text)` sets input value and dispatches events
- [ ] `evalSelect(port, selector, value)` changes select value and dispatches change
- [ ] `evalWaitFor(port, predicateFn, timeout)` polls until predicate passes; throws on timeout
- [ ] `waitForText(port, text, timeout)` convenience wrapper
- [ ] All functions exported from `lib/snapshot.js`
