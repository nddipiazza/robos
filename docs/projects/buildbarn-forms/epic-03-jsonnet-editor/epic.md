---
nav_exclude: true
---

# Jsonnet Editor

**Status:** Complete (v0.2.6)
**Priority:** High
**Repository:** `Hermetiq/buildbarn-forms`
**Package:** `@hermetiq/buildbarn-forms`
**Dependencies:** forms-proto, core library

The `JsonnetEditor` component provides a Monaco-based two-panel Jsonnet editing experience: the left panel is a full Monaco code editor with custom Jsonnet syntax highlighting; the right panel is a live preview that evaluates the Jsonnet as you type and displays the result as formatted JSON. A third tab in the preview panel shows the `TreeView` navigation over the evaluated JSON structure.

The editor is intentionally **evaluator-agnostic** — it accepts an `evaluateJsonnet` async function as a prop, so the library has no server dependency. The host application supplies the evaluator (e.g., `@hanazuki/node-jsonnet`, a backend endpoint, or a WASM implementation).

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Monaco editor with Jsonnet syntax highlighting](story-01-monaco-jsonnet.md) | Complete | 5 |
| 02 | [Live JSON preview panel](story-02-live-preview.md) | Complete | 3 |
| 03 | [JSON & YAML export](story-03-export.md) | Complete | 2 |
| 04 | [Evaluator-agnostic prop interface](story-04-evaluator-prop.md) | Complete | 2 |
| 05 | [Dev harness with real Buildbarn configs](story-05-dev-harness.md) | Complete | 3 |

## Technical Context

### Jsonnet Syntax Highlighting

Monaco does not have built-in Jsonnet support. Custom tokenization rules must be registered using Monaco's `languages.setMonarchTokensProvider` API. Tokens to highlight:
- Keywords: `local`, `function`, `if`, `then`, `else`, `import`, `importstr`, `error`, `in`, `self`, `super`, `null`, `true`, `false`
- String literals (single and double quoted)
- Comments (`//`, `#`, `/* */`)
- Numbers
- Operators

### Live Preview Debouncing

The preview panel re-evaluates Jsonnet 300ms after the last keystroke (debounced). This prevents excessive evaluation calls during rapid typing. Evaluation errors are caught and displayed as red error messages in the preview panel.

### Field Tree View (Preview Tab)

When the user switches to the "Field Tree" tab in the preview panel, the evaluated JSON is rendered as a navigable `TreeView`. Each node in the JSON hierarchy appears as a tree node. Leaf values are displayed inline. Branch nodes (objects and arrays) are expandable/collapsible.

The tree also renders **MCP action stubs** for future integration:
- `+ Add field` button on object/array nodes (disabled — future MCP action)
- `✕ Remove` button per field (disabled — future MCP action)
- `OneOf type selector` on `{ $case, <fieldName> }` objects (disabled — future MCP action)

These stubs define the integration points for MCP-powered config manipulation.
