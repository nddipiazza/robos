# Story 07-01: Drag-and-Drop Object Palette

**Epic:** [UX & Advanced Features](epic.md)
**Status:** Not started
**Points:** 8

## Description

Build a drag-and-drop object palette at the top of the config editor. The palette displays available proto message types as draggable tiles. When the user drags a tile into the Jsonnet editor, a Jsonnet snippet for that type (with sensible defaults) is inserted at the cursor position. The palette is contextual — it filters to only show types valid at the current cursor position.

This is Tim Potter's original UX vision for the editor.

## Acceptance Criteria

- [ ] Palette renders above the editor as a horizontal scrollable tile row
- [ ] Each tile shows the proto message type name and a brief description
- [ ] User can drag a tile and drop it onto the Monaco editor
- [ ] On drop, a valid Jsonnet snippet for the dragged type (with defaults) is inserted at the drop position
- [ ] Palette is contextual: when cursor is inside a known `oneof` field, only the valid `oneof` options are shown
- [ ] Palette is contextual: when cursor is inside a `repeated` field, shows the item type for that array
- [ ] Default palette (no cursor context): shows top-level `ApplicationConfiguration` fields
- [ ] Tiles have tooltip with the proto comment for that message type
- [ ] Palette can be collapsed to save screen space

## Contextual Filtering Logic

To determine the cursor context:
1. Parse the Monaco editor content to find the proto path at cursor
2. Look up the proto schema at that path
3. If it's a `oneof`: show all `oneof` options
4. If it's a `repeated`: show the item type
5. If it's an object with known fields: show all valid fields not yet present

Example contextual filtering:
```
Cursor inside: contentAddressableStorage.backend (oneof)
Palette shows: [local] [s3] [gcs] [grpc] [mirrored] [sharding] ...

Cursor inside: grpcServers (repeated ServerConfiguration)
Palette shows: [+ Add gRPC Server]

Cursor at root level
Palette shows: [grpcServers] [contentAddressableStorage] [actionCache] [global] ...
```

## Jsonnet Snippet Generation

Each proto message type needs a default snippet generator:
```typescript
function generateJsonnetSnippet(messageType: string, indent = 0): string {
  const schema = getSchemaForMessage(messageType);
  // Recursively generate defaults based on field types
  // Required fields get placeholder values
  // Optional fields may be omitted or get minimal defaults
}
```

## Files

- `src/components/ObjectPalette/ObjectPalette.tsx` (new)
- `src/components/ObjectPalette/ObjectPalette.css` (new)
- `src/utils/jsonnetSnippetGenerator.ts` (new)
- `src/utils/cursorContextResolver.ts` (new — Monaco cursor → proto path)
