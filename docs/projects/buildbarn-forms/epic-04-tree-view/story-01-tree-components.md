---
nav_exclude: true
---

# Story 04-01: TreeView & TreeNode Components

**Epic:** [Tree View Navigation](epic.md)
**Status:** Complete
**Points:** 5

## Description

Build the `TreeView` and `TreeNode` React components that render a `TreeNodeData` hierarchy as an interactive, expandable/collapsible tree. The tree supports single-node selection, expand/collapse of branch nodes, and fires callbacks when the user selects a leaf node.

## Acceptance Criteria

- [ ] `TreeView` accepts `treeData: TreeNodeData` and renders the hierarchy
- [ ] Branch nodes have expand/collapse toggle (chevron icon)
- [ ] Leaf nodes are selectable; selected leaf is visually highlighted
- [ ] `onNodeSelect(path: string[])` callback fires when user clicks a leaf node
- [ ] `expandedNodes` and `selectedNode` can be controlled externally (optional props)
- [ ] Default behavior: branch nodes expanded by default; no node selected
- [ ] Icons render per node if `icon` is provided in `TreeNodeData`
- [ ] Tooltips render on hover if `tooltip` is provided in `TreeNodeData` (shows proto comment)
- [ ] `fieldCount` badge renders on leaf nodes showing how many fields the section has
- [ ] Tree renders efficiently for 100+ nodes (no perceptible lag)
- [ ] CSS uses Hermetiq dark theme

## TreeView Props

```typescript
interface TreeViewProps {
  treeData?: TreeNodeData;
  onNodeSelect?: (path: string[]) => void;
  selectedNode?: string;           // Node ID of currently selected node
  expandedNodes?: Set<string>;     // Set of expanded branch node IDs
  onExpandToggle?: (nodeId: string) => void;
  className?: string;
}
```

## Files

- `src/TreeView/TreeView.tsx`
- `src/TreeView/TreeNode.tsx`
- `src/TreeView/TreeView.css`
- `src/TreeView/icons.tsx`
- `src/TreeView/types.ts`
- `src/TreeView/index.ts`
