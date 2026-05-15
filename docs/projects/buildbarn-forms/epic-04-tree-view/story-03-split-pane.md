---
nav_exclude: true
---

# Story 04-03: Split-Pane Layout (Tree + Form)

**Epic:** [Tree View Navigation](epic.md)
**Status:** Not started
**Points:** 5

## Description

Build a `FormBuilderWithTree` composite component that puts `TreeView` on the left and `ProtoFormBuilder` on the right in a resizable split-pane layout. When the user selects a leaf node in the tree, the right panel re-renders showing only that section's form fields.

## Acceptance Criteria

- [ ] `FormBuilderWithTree` renders tree in left pane and form section in right pane
- [ ] Pane widths are adjustable with a draggable divider
- [ ] When no node is selected, right pane shows a prompt: "Select a section in the tree to edit its fields"
- [ ] Clicking a leaf node in the tree shows the corresponding form fields in the right pane
- [ ] Form data is preserved when navigating between sections (the full form state is maintained even when only one section is visible)
- [ ] Tree and form pane scroll independently
- [ ] Layout is responsive: on narrow viewports, tree collapses to an icon-only sidebar with a toggle button

## FormBuilderWithTree Props

```typescript
interface FormBuilderWithTreeProps {
  schema: ProtoFormSchema;
  initialValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
  customComponents?: CustomComponentRegistry;
  defaultPanelWidth?: number;  // Tree panel width in px, default 280
}
```

## UX Wireframe

```
┌──────────────────────┬────────────────────────────────────────┐
│ Tree Navigator       │ Section Editor                          │
│ [280px]              │ [remaining width]                       │
├──────────────────────┼────────────────────────────────────────┤
│ ▼ CAS                │                                         │
│   ▼ Backend          │  Local Backend                          │
│     ● Local  ←select │  ─────────────────────────             │
│     ○ GRPC           │                                         │
│ ▼ ActionCache        │  [Path]          /storage-cas/...      │
│   ▼ Backend          │  [Cache Size]    800 MB                 │
│     ○ Local          │  [Max Get]       16                     │
│ ▶ BlobReplicator     │  [Old Blocks]    6                      │
│                      │  [New Blocks]    2                      │
│                      │  [Current Blk]   24                     │
└──────────────────────┴────────────────────────────────────────┘
```

## Implementation Notes

The form state is managed at the `FormBuilderWithTree` level. When the user selects a different tree node, only the visible form section changes; the underlying `react-hook-form` state remains intact for all sections. On submit, the full combined form data is emitted.

Path navigation: `src/utils/pathNavigation.ts` provides utilities for resolving a tree path (e.g., `['contentAddressableStorage', 'backend', 'local']`) to the corresponding subset of the schema and the corresponding subset of the form values.

## Files

- `src/FormBuilderWithTree/FormBuilderWithTree.tsx` (new component)
- `src/FormBuilderWithTree/FormBuilderWithTree.css`
- `src/FormBuilderWithTree/index.ts`
- `src/utils/pathNavigation.ts` (already exists, extend as needed)
