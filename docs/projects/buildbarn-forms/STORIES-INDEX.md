# Buildbarn Forms — Stories Index

Quick-reference index of all epics and stories across the `@hermetiq/buildbarn-forms` and `@hermetiq/buildbarn-forms-proto` project.

---

## Epic 01: buildbarn-forms-proto Package
[epic.md](epic-01-forms-proto-package/epic.md)

| Story | File |
|-------|------|
| 01-01: Proto generation pipeline (protoc + ts-proto) | [story-01-proto-generation.md](epic-01-forms-proto-package/story-01-proto-generation.md) |
| 01-02: Proto comment extraction (AST → JSON) | [story-02-comment-extraction.md](epic-01-forms-proto-package/story-02-comment-extraction.md) |
| 01-03: Package structure & exports | [story-03-package-structure.md](epic-01-forms-proto-package/story-03-package-structure.md) |
| 01-04: CI/CD pipeline & GitHub Packages publish | [story-04-ci-publish.md](epic-01-forms-proto-package/story-04-ci-publish.md) |
| 01-05: Version check automation | [story-05-version-check.md](epic-01-forms-proto-package/story-05-version-check.md) |
| 01-06: Git submodule update automation | [story-06-submodule-update.md](epic-01-forms-proto-package/story-06-submodule-update.md) |

---

## Epic 02: Forms Library Core
[epic.md](epic-02-forms-library-core/epic.md)

| Story | File |
|-------|------|
| 02-01: Package structure & build pipeline | [story-01-package-structure.md](epic-02-forms-library-core/story-01-package-structure.md) |
| 02-02: ProtoFormBuilder engine | [story-02-proto-form-builder.md](epic-02-forms-library-core/story-02-proto-form-builder.md) |
| 02-03: Form field components | [story-03-form-fields.md](epic-02-forms-library-core/story-03-form-fields.md) |
| 02-04: InfoTooltip (proto comment display) | [story-04-tooltips.md](epic-02-forms-library-core/story-04-tooltips.md) |
| 02-05: AuthorizerField (oneof specialization) | [story-05-authorizer-field.md](epic-02-forms-library-core/story-05-authorizer-field.md) |
| 02-06: Unit & integration tests | [story-06-tests.md](epic-02-forms-library-core/story-06-tests.md) |

---

## Epic 03: Jsonnet Editor
[epic.md](epic-03-jsonnet-editor/epic.md)

| Story | File |
|-------|------|
| 03-01: Monaco editor with Jsonnet language support | [story-01-monaco-jsonnet.md](epic-03-jsonnet-editor/story-01-monaco-jsonnet.md) |
| 03-02: Live Jsonnet preview (evaluate on type) | [story-02-live-preview.md](epic-03-jsonnet-editor/story-02-live-preview.md) |
| 03-03: Export config as Jsonnet / JSON / YAML | [story-03-export.md](epic-03-jsonnet-editor/story-03-export.md) |
| 03-04: Evaluator-agnostic prop interface *(not yet created)* | — |
| 03-05: Dev harness with real Buildbarn configs *(not yet created)* | — |

---

## Epic 04: Tree View
[epic.md](epic-04-tree-view/epic.md)

| Story | File |
|-------|------|
| 04-01: TreeView and TreeNode components | [story-01-tree-components.md](epic-04-tree-view/story-01-tree-components.md) |
| 04-02: schemaToTree utility *(not yet created)* | — |
| 04-03: Split-pane editor layout | [story-03-split-pane.md](epic-04-tree-view/story-03-split-pane.md) |
| 04-04: Accessibility (keyboard nav, ARIA) *(not yet created)* | — |
| 04-05: TreeContextMenu (right-click actions) *(not yet created)* | — |
| 04-06: Section-based rendering mode *(not yet created)* | — |

---

## Epic 05: MVP Integration
[epic.md](epic-05-mvp-integration/epic.md)

| Story | File |
|-------|------|
| 05-01: Install library in MVP, auth/registry setup | [story-01-install-library.md](epic-05-mvp-integration/story-01-install-library.md) |
| 05-02: Config browser (list & select config sets) | [story-02-config-browser.md](epic-05-mvp-integration/story-02-config-browser.md) |
| 05-03: Config editor page (form + Jsonnet view) | [story-03-config-editor.md](epic-05-mvp-integration/story-03-config-editor.md) |
| 05-04: Save config via SaveConfigSet gRPC *(not yet created)* | — |
| 05-05: Load config via GetConfigSet gRPC *(not yet created)* | — |
| 05-06: Jsonnet evaluation in browser | [story-06-jsonnet-eval.md](epic-05-mvp-integration/story-06-jsonnet-eval.md) |
| 05-07: Delete config with confirmation *(not yet created)* | — |
| 05-08: Version history viewer | [story-08-version-history.md](epic-05-mvp-integration/story-08-version-history.md) |
| 05-09: Error handling & toast notifications *(not yet created)* | — |

---

## Epic 06: Production Config Types
[epic.md](epic-06-production-config-types/epic.md)

| Story | File |
|-------|------|
| 06-01: Worker config schema *(not yet created)* | — |
| 06-02: Scheduler config schema *(not yet created)* | — |
| 06-03: Browser config schema *(not yet created)* | — |
| 06-04: Multi-file config set editor *(not yet created)* | — |
| 06-05: Production Jsonnet templates | [story-05-templates.md](epic-06-production-config-types/story-05-templates.md) |
| 06-06: ConfigMap YAML output (K8s format) | [story-06-configmap-yaml.md](epic-06-production-config-types/story-06-configmap-yaml.md) |
| 06-07: Advanced validation improvements *(not yet created)* | — |

---

## Epic 07: UX & Advanced Features
[epic.md](epic-07-ux-advanced-features/epic.md)

| Story | File |
|-------|------|
| 07-01: Drag-and-drop object palette | [story-01-drag-drop.md](epic-07-ux-advanced-features/story-01-drag-drop.md) |
| 07-02: Type-ahead search *(not yet created)* | — |
| 07-03: Visual diff viewer *(not yet created)* | — |
| 07-04: Advanced mode toggle (raw Jsonnet) *(not yet created)* | — |
| 07-05: Import existing Jsonnet/YAML configs *(not yet created)* | — |
| 07-06: Keyboard shortcuts *(not yet created)* | — |
| 07-07: MCP action integration (TreeView stubs) | [story-07-mcp-actions.md](epic-07-ux-advanced-features/story-07-mcp-actions.md) |
