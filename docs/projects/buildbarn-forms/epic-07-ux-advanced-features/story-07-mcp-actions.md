# Story 07-07: MCP Action Integration (TreeView Stubs)

**Epic:** [UX & Advanced Features](epic.md)
**Status:** Not started
**Points:** 8

## Description

Activate the MCP (Model Context Protocol) action stubs that are already present in `TreeView` and `TreeContextMenu`. These stubs represent integration points where AI agent tools can programmatically modify Buildbarn Jsonnet configs. When wired up, they allow both human users (via right-click context menu) and AI agents (via MCP tool calls) to add, remove, or change config sections without hand-editing Jsonnet.

## Background

The MCP action stubs were pre-built as disabled UI elements to mark future integration points:
- **`+ Add field`** button on object/array nodes in the tree
- **`✕ Remove`** button per field (on hover)
- **`OneOf type selector`** on `{ $case, <fieldName> }` objects

These are already rendered in the `TreeContextMenu` component as disabled menu items. This story wires them to real functionality.

## Acceptance Criteria

- [ ] `TreeView` accepts an `onMCPAction` callback prop
- [ ] `onMCPAction` is called with `{ action: 'add' | 'remove' | 'switchOneof', path: string[], payload?: unknown }` when a context menu action is triggered
- [ ] Host app (MVP `ConfigEditorPage`) handles `onMCPAction` callbacks by:
  - `add`: opens a type picker dialog (for `oneof`/`repeated`) then inserts the new item at the path
  - `remove`: shows a confirmation dialog then removes the item at the path
  - `switchOneof`: opens a type picker dialog then replaces the current `oneof` variant
- [ ] All actions are reflected in the Jsonnet editor (editor content updates to show the change)
- [ ] Actions are reversible via "Undo" (Ctrl+Z in Monaco editor)
- [ ] MCP tool server can call the same action handlers programmatically (the `onMCPAction` interface is MCP-compatible)

## MCP Tool Interface

The `onMCPAction` interface is designed to be callable by an MCP tool server:

```typescript
interface MCPAction {
  action: 'add' | 'remove' | 'switchOneof';
  path: string[];           // e.g., ['contentAddressableStorage', 'backend']
  messageType?: string;     // For 'add': the proto message type to insert
  variant?: string;         // For 'switchOneof': the new variant name
}

// MCP tool call example:
// Tool: buildbarn_config_add_section
// Input: { path: ["grpcServers"], messageType: "ServerConfiguration" }
```

## Implementation Notes

The core Jsonnet mutation logic (insert/remove/replace at path) must be implemented in `src/utils/jsonnetAstMutator.ts`. This utility:
1. Parses the Jsonnet source (using a Jsonnet parser or regex-based approach)
2. Locates the insertion/removal point by path
3. Generates the new Jsonnet with the mutation applied
4. Returns the updated Jsonnet string for the editor

## Files

- `src/utils/jsonnetAstMutator.ts` (new)
- `src/TreeView/TreeView.tsx` (add `onMCPAction` prop)
- `src/TreeView/TreeContextMenu.tsx` (wire stubs to callbacks)
- `src/TreeView/types.ts` (add `MCPAction` type)
