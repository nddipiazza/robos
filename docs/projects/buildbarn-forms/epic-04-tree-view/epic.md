---
nav_exclude: true
---

# Tree View Navigation

**Status:** Core complete; MCP stubs present (v0.2.6)
**Priority:** High
**Repository:** `Hermetiq/buildbarn-forms`
**Package:** `@hermetiq/buildbarn-forms`
**Dependencies:** core library, Jsonnet editor

The `TreeView` component provides hierarchical navigation for Buildbarn configuration structures. It solves the UX problem of deeply nested proto configs being hard to navigate in a flat vertical form — users can see the whole config tree at a glance and click to navigate to specific sections.

The tree renders two modes:
1. **JSON Tree Mode** (used in `JsonnetEditor` preview): renders the evaluated JSON object as an interactive tree.
2. **Schema Tree Mode** (used with `ProtoFormBuilder`): renders a `ProtoFormSchema` as a navigation tree; selecting a leaf node shows only that section's form fields in the adjacent form panel.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [TreeView & TreeNode components](story-01-tree-components.md) | Complete | 5 |
| 02 | [schemaToTree utility](story-02-schema-to-tree.md) | Complete | 3 |
| 03 | [Split-pane layout (tree + form)](story-03-split-pane.md) | Not started | 5 |
| 04 | [Keyboard navigation & accessibility](story-04-accessibility.md) | Not started | 3 |
| 05 | [TreeContextMenu with MCP action stubs](story-05-context-menu.md) | Complete | 3 |
| 06 | [ProtoFormBuilder section-based rendering](story-06-section-rendering.md) | Not started | 5 |

## Technical Context

### TreeNodeData Type

```typescript
interface TreeNodeData {
  id: string;                    // Unique, derived from path
  label: string;                 // Display name
  path: string[];                // Full path from root, e.g. ['contentAddressableStorage', 'backend', 'local']
  type: 'branch' | 'leaf';      // branch = expandable, leaf = selectable (shows form)
  children?: TreeNodeData[];     // Only for branch nodes
  fieldCount?: number;           // Number of form fields (leaf nodes only)
  icon?: React.ReactNode;
  tooltip?: string;              // Proto comment for this node
  metadata?: Record<string, unknown>;
}
```

### Branch vs Leaf Logic

A node is a **branch** if it represents an intermediate proto message that contains nested messages (e.g., `contentAddressableStorage.backend`). A node is a **leaf** if it represents a proto message whose fields are all scalars (strings, numbers, booleans, enums) — this is the form section the user edits.

### MCP Action Stubs

The `TreeContextMenu` component exposes right-click stubs that will eventually be wired to MCP tool calls:
- **Add field** — Add a new item to a repeated field
- **Remove** — Remove a node from the config
- **Switch OneOf type** — Change which variant of a `oneof` is active

These are currently rendered as disabled menu items marking the MCP integration points.
