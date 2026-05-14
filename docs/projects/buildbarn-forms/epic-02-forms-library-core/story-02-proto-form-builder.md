# Story 02-02: ProtoFormBuilder Engine

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 8

## Description

Implement the `ProtoFormBuilder` component — the heart of the library. Given a `ProtoFormSchema` (a descriptor defining a protobuf message and its fields), `ProtoFormBuilder` renders a complete, validated, accessible form UI. It handles all proto field types recursively, supports custom component injection via a registry, and emits typed form data on submit and on every change.

## Acceptance Criteria

- [ ] Renders all proto field types: `string`, `number`, `boolean`, `enum`, `message`, `repeated`, `oneof`, `map`
- [ ] Nested `message` fields render as collapsible sections with their own `ProtoFormBuilder`
- [ ] `repeated` fields render an array manager: add button, remove per-item button, each item its own `ProtoFormBuilder`
- [ ] `oneof` fields render a type selector (dropdown) followed by a dynamic form for the selected variant
- [ ] `map` fields render key/value pair entries (add/remove pairs)
- [ ] `onSubmit` prop fires with fully typed form data when form is submitted
- [ ] `onChange` prop fires after every field change (for live preview)
- [ ] `initialValues` prop pre-populates the form
- [ ] `customComponents` registry prop allows host app to override specific field renderers
- [ ] Field-level validation messages are displayed beneath each field
- [ ] Proto comment tooltips render on every field label (if `comment` present in schema)
- [ ] `ProtoFormBuilder` is fully self-contained and has no Buildbarn-specific logic

## ProtoFormSchema Type

```typescript
interface ProtoFormSchema {
  messageType: string;   // e.g., 'ApplicationConfiguration'
  fields: ProtoFieldMetadata[];
}

interface ProtoFieldMetadata {
  name: string;
  type: ProtoFieldType;  // 'string' | 'number' | 'boolean' | 'enum' | 'message' | 'repeated' | 'oneof' | 'map'
  label: string;
  comment?: string;       // Proto JSDoc comment → shown as tooltip
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  messageType?: string;           // For 'message' fields
  nestedFields?: ProtoFieldMetadata[];  // For 'message' fields
  enumValues?: { value: string | number; label: string }[];  // For 'enum' fields
  itemType?: ProtoFieldMetadata;  // For 'repeated' fields
  oneOfOptions?: ProtoFieldMetadata[];  // For 'oneof' fields
  mapKeyType?: ProtoFieldType;    // For 'map' fields
  mapValueType?: ProtoFieldMetadata;   // For 'map' fields
  validation?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
  };
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}
```

## ProtoFormBuilder Props

```typescript
interface ProtoFormBuilderProps {
  schema: ProtoFormSchema;
  initialValues?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  onChange?: (data: Record<string, unknown>) => void;
  customComponents?: CustomComponentRegistry;
  readOnly?: boolean;
  className?: string;
}
```

## Field Rendering Logic (fieldTypeMapper.ts)

`fieldTypeMapper.ts` handles:
- **Type mapping:** proto field type → React component
- **Validation rules:** proto field constraints → `react-hook-form` validation rules
- **Default values:** sensible defaults per field type (empty string, 0, false, [], {})
- **Label formatting:** `snake_case` field name → `Title Case With Spaces`
- **`mapProtoFieldsToFormFields()`** — utility to generate a schema from a live proto type using `@hermetiq/buildbarn-forms-proto` runtime type metadata

## Implementation Notes

- State is managed by `react-hook-form` using `useFieldArray` for `repeated` fields and controlled inputs for everything else.
- Immutable updates via `immer` for complex nested state changes.
- Recursive rendering: `message` fields instantiate a child `ProtoFormBuilder` connected to the parent's form context.
- `oneof` variant selection: when the user changes the type selector, the entire sub-form for the previous type is unmounted (clearing its values from the form state) and the new type's sub-form mounts.

## Files

- `src/ProtoFormBuilder/ProtoFormBuilder.tsx` (~750 lines)
- `src/ProtoFormBuilder/fieldTypeMapper.ts` (~200 lines)
- `src/ProtoFormBuilder/types.ts` (~80 lines)
- `src/ProtoFormBuilder/ProtoFormBuilder.css`
- `src/ProtoFormBuilder/ProtoFormBuilder.test.tsx`
