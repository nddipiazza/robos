# Epic 07: UX & Advanced Features

**Status:** Not started
**Priority:** Low-Medium — polish and power-user features after core flows are stable
**Repository:** `Hermetiq/buildbarn-forms` + `Hermetiq/MVP`
**Dependencies:** Epics 01–06

These are the features that take the editor from "functional" to "delightful" — drag-and-drop object building, type-ahead search, visual diffs, rollback, and an advanced mode for power users who want to write Jsonnet directly.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Drag-and-drop object palette](story-01-drag-drop.md) | Not started | 8 |
| 02 | [Type-ahead search across proto schemas](story-02-typeahead.md) | Not started | 5 |
| 03 | [Visual diff viewer (diff2html)](story-03-diff-viewer.md) | Not started | 3 |
| 04 | [Advanced mode toggle (raw Jsonnet editing)](story-04-advanced-mode.md) | Not started | 3 |
| 05 | [Import existing Jsonnet/YAML configs](story-05-import.md) | Not started | 5 |
| 06 | [Keyboard shortcuts & power-user bindings](story-06-shortcuts.md) | Not started | 2 |
| 07 | [MCP action integration (TreeView stubs)](story-07-mcp-actions.md) | Not started | 8 |

## Technical Context

### Drag-and-Drop Object Palette (Tim Potter's Vision)

The original UX vision from Tim Potter is a **drag-and-drop object palette** at the top of the editor. Available proto message types are shown as draggable tiles. The user drags a tile into the live Jsonnet editor (or form view) to add that configuration section with sensible defaults.

The palette is contextual: when the cursor is inside a `oneof backend` block, only the valid backend types (`local`, `s3`, `gcs`, `grpc`, etc.) are shown.

This requires:
1. Tracking the cursor position in the Monaco editor
2. Determining which proto `oneof` or `repeated` field the cursor is within
3. Filtering the palette to only valid types at that position
4. On drop, generating a Jsonnet snippet for the dragged type (with defaults) and inserting at cursor

### MCP Action Integration

The `TreeContextMenu` and `TreeView` already contain disabled stubs for MCP-powered actions:
- **Add field** — would call an MCP tool to insert a new field into the Jsonnet AST
- **Remove** — would call an MCP tool to delete a node from the Jsonnet AST
- **Switch OneOf** — would call an MCP tool to replace one `oneof` variant with another

When the MCP integration is built, these stubs become live actions that let AI agents manipulate configs programmatically, or let the host app inject custom action handlers.

### Type-Ahead Search

A global search bar that lets users type a proto field name or message name and jump directly to that section in the tree/form. Useful for large configs where a user knows the field they want to edit but doesn't want to navigate the tree manually.

Search index is built at page load by walking the `ProtoFormSchema` and indexing all field names, labels, and message types with their tree paths.
