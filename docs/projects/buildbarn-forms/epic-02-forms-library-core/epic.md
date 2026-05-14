# Epic 02: buildbarn-forms Core Library

**Status:** Substantially complete (v0.2.6 published)
**Priority:** High — core library consumed by all integration work
**Repository:** `Hermetiq/buildbarn-forms`
**Package:** `@hermetiq/buildbarn-forms`
**Dependencies:** Epic 01 (forms-proto must be published first)

The `@hermetiq/buildbarn-forms` React library is the primary deliverable. It provides the `ProtoFormBuilder` engine, form field components, tooltip infrastructure, and the package toolchain for building, testing, linting, and publishing.

This epic covers the complete library core: structure, components, proto-comment tooltips, testing, and publishing. The Jsonnet editor, tree view, and MVP integration are handled in their own epics.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Package structure & build toolchain](story-01-package-structure.md) | Complete | 3 |
| 02 | [ProtoFormBuilder engine](story-02-proto-form-builder.md) | Complete | 8 |
| 03 | [Form field components](story-03-form-fields.md) | Complete | 5 |
| 04 | [Proto comment tooltip system](story-04-tooltips.md) | Complete | 5 |
| 05 | [AuthorizerField custom component](story-05-authorizer-field.md) | Complete | 3 |
| 06 | [Test suite (>50% coverage)](story-06-tests.md) | Complete | 5 |
| 07 | [CI/CD publish pipeline](story-07-ci-publish.md) | Complete | 3 |
| 08 | [protoTypes re-export module](story-08-proto-types-reexport.md) | Complete | 2 |

## Technical Context

### Core Engine: ProtoFormBuilder

The `ProtoFormBuilder` takes a `ProtoFormSchema` (a descriptor of a protobuf message and its fields) and renders a fully functional form. The schema is hand-authored by the host app or generated programmatically from `@hermetiq/buildbarn-forms-proto` types.

**Supported field types:**
- `string` → `TextInput`
- `number` → `NumberInput`
- `boolean` → `Checkbox`
- `enum` → `<select>` dropdown
- `message` → nested collapsible `ProtoFormBuilder` (recursive)
- `repeated` → array with add/remove, each item a `ProtoFormBuilder`
- `oneof` → type selector dropdown + dynamic form for selected variant
- `map` → key/value pair manager

**State management:** `react-hook-form` (controlled inputs, field arrays, validation).

**Key design principle:** `ProtoFormBuilder` is a _dumb_ renderer — it does not know about Buildbarn specifically. Any protobuf-shaped schema will work.

### Form Field Components

All form fields share:
- Hermetiq dark theme styling (CSS variables: `--bg-primary`, `--bg-card`, `--accent: #00bcd4`)
- `label` prop for display name
- `tooltip` prop for proto comment hover documentation
- `error` prop for validation messages
- Accessible labels and ARIA attributes
