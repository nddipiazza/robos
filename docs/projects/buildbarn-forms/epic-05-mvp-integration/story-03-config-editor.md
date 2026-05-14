# Story 05-03: Config Editor Page (Editor View)

**Epic:** [MVP Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Build the main config editor page that wraps `BuildBarnConfigEditor` (and optionally `FormBuilderWithTree`) from `@hermetiq/buildbarn-forms`. The page supports both "new config" and "edit existing config" modes. It wires the editor's `evaluateJsonnet` prop to a backend endpoint, manages config name input, and provides a Save button that calls the gRPC backend.

## Acceptance Criteria

- [ ] Page renders `BuildBarnConfigEditor` with the current Jsonnet source
- [ ] "New Config" mode: blank editor with configName input field
- [ ] "Edit" mode: editor pre-populated with the loaded config's Jsonnet
- [ ] Config name is validated (no spaces, alphanumeric + hyphens/underscores only)
- [ ] `evaluateJsonnet` prop wired to `/api/evaluate-jsonnet` endpoint (or gRPC evaluate RPC)
- [ ] Save button disabled when: no config name, or unsaved changes not yet present, or save in progress
- [ ] Save button triggers `SaveConfigSet` gRPC call with configName, content, commitMessage
- [ ] Commit message input displayed before Save (required, non-empty)
- [ ] Successful save shows toast notification and updates URL/breadcrumb
- [ ] Navigation breadcrumb: Dashboard > Config Management > {configName}
- [ ] "Back to list" link navigates to `ConfigSetBrowser`
- [ ] CSS uses Hermetiq dark theme; components styled to match MVP design system

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ ← Config Management   |  storage.jsonnet                    │
│                           ──────────────────────────────    │
│ Commit message: [_______________________________]  [Save]   │
├─────────────────────────────────────────────────────────────┤
│                BuildBarnConfigEditor                         │
│   ┌──────────────────────┬──────────────────────────────┐   │
│   │ Jsonnet Editor       │ Preview                      │   │
│   │ (Monaco)             │ [JSON] [Field Tree]          │   │
│   │                      │                              │   │
│   │ local storage = ...  │ {                            │   │
│   │                      │   "contentAddressable...     │   │
│   └──────────────────────┴──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Files

- `MVP/src/components/BBConfigEditor/ConfigEditorPage.js` (replaces placeholder)
- `MVP/src/components/BBConfigEditor/ConfigEditorPage.css`
- `MVP/src/components/BBConfigEditor/index.js` (router entry point)
