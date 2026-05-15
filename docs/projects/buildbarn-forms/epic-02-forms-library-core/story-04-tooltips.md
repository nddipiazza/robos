---
nav_exclude: true
---

# Story 02-04: Proto Comment Tooltip System

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 5

## Description

Wire the proto comment data from `@hermetiq/buildbarn-forms-proto`'s `proto-comments.json` into the form UI so that every field label shows an ⓘ tooltip containing the corresponding proto documentation comment. This surfaces Buildbarn's authoritative proto docs inline in the editor without leaving the page.

## Acceptance Criteria

- [ ] `getFieldComment(messageName, fieldName)` returns the comment string or `undefined`
- [ ] `getMessageComment(messageName)` returns the message-level comment string or `undefined`
- [ ] `formatFieldWithComment(fieldName, comment)` returns a display-ready label string
- [ ] `ProtoFormBuilder` renders `<InfoTooltip text={field.comment} />` next to every field label when `comment` is present in the schema
- [ ] Tooltip renders correctly for all field types: scalar, nested message, repeated, oneof, map
- [ ] Tooltip shows full proto comment text (may be multi-line)
- [ ] If a field has no comment, no tooltip icon is shown (not an empty tooltip)
- [ ] `protoComments.ts` utility functions are exported from `src/index.ts`
- [ ] Unit tests verify comment extraction returns correct strings

## Implementation

### protoComments.ts utility functions

```typescript
// Import the comment map from the proto package
import protoComments from '@hermetiq/buildbarn-forms-proto/dist/proto-comments.json';

/**
 * Returns the JSDoc comment for a specific field within a message type.
 * Returns undefined if no comment exists.
 */
export function getFieldComment(
  messageName: string,
  fieldName: string
): string | undefined {
  return protoComments[messageName]?.fields?.[fieldName];
}

/**
 * Returns the JSDoc comment for the message type itself.
 */
export function getMessageComment(messageName: string): string | undefined {
  return protoComments[messageName]?.message;
}

/**
 * Formats a field name as a display label with optional comment hint.
 */
export function formatFieldWithComment(
  fieldName: string,
  comment?: string
): string {
  const label = fieldName
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return comment ? `${label}` : label;
}
```

### ProtoFormBuilder integration

In `ProtoFormBuilder.tsx`, the field label rendering uses:
```tsx
function FieldLabel({ field }: { field: ProtoFieldMetadata }) {
  return (
    <label htmlFor={field.name} className="field-label">
      {field.label}
      {field.comment && <InfoTooltip text={field.comment} />}
    </label>
  );
}
```

### mapProtoFieldsToFormFields

The `fieldTypeMapper.ts` utility `mapProtoFieldsToFormFields(messageType, data)` automatically enriches generated schema fields with comments from the comment map:
```typescript
// For each field in the schema, look up its proto comment
const comment = getFieldComment(messageType, field.name);
return { ...field, comment };
```

## Files

- `src/utils/protoComments.ts` — utility functions
- `src/utils/protoComments.test.ts` — unit tests
- `src/components/InfoTooltip.tsx` — tooltip rendering component
- `src/ProtoFormBuilder/ProtoFormBuilder.tsx` — integration point
- `src/ProtoFormBuilder/fieldTypeMapper.ts` — comment enrichment
