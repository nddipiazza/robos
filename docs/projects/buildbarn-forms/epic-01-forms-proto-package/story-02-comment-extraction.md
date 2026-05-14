# Story 01-02: Proto Comment Extraction

**Epic:** [buildbarn-forms-proto Package](epic.md)
**Status:** Complete
**Points:** 5

## Description

After proto generation, extract all JSDoc comments from the generated TypeScript files and compile them into a single `dist/proto-comments.json` file. This comment map is the runtime data source that powers proto-documentation tooltips in the `buildbarn-forms` form UI.

The extraction uses TypeScript's compiler API to walk the AST of every generated `.ts` file, finding interface declarations (proto messages) and their property declarations (proto fields), then capturing any leading JSDoc comments.

## Acceptance Criteria

- [ ] `scripts/extract-comments.ts` runs via `tsx` without errors
- [ ] Output is valid JSON written to `dist/proto-comments.json`
- [ ] All message-level comments are captured (interface-level JSDoc)
- [ ] All field-level comments are captured (property-level JSDoc)
- [ ] `oneof` variant comments are captured
- [ ] Empty comment strings are omitted from output (noise reduction)
- [ ] `npm run build` automatically runs comment extraction after TypeScript compile

## Output Schema

```typescript
interface CommentMap {
  [messageName: string]: {
    message?: string;     // Comment on the message/interface itself
    fields: {
      [fieldName: string]: string;  // Comment on each field/property
    };
  };
}
```

Example output:
```json
{
  "ApplicationConfiguration": {
    "message": "Top-level application configuration for a bb_storage instance.",
    "fields": {
      "grpcServers": "gRPC servers to spawn to listen for requests from clients.",
      "maximumMessageSizeBytes": "Maximum Protobuf message size to unmarshal.",
      "global": "Configuration shared across all Buildbarn services."
    }
  },
  "BlobAccessConfiguration": {
    "fields": {
      "backend": "The backend implementation. Exactly one must be set."
    }
  }
}
```

## Implementation Notes

The extraction script uses `typescript` package's compiler API:
- `ts.createProgram()` — parse all `.ts` files in `generated/`
- `ts.forEachChild()` — walk AST nodes
- `ts.isInterfaceDeclaration()` — find message types
- `ts.isPropertySignature()` — find field declarations
- `ts.getJSDocCommentsAndTags()` — extract JSDoc text

The output file is included in the npm package `files` array so consumers can load it at runtime.

## Files

- `scripts/extract-comments.ts` — extraction script (run with `tsx`)
- `dist/proto-comments.json` — generated output (committed to dist for publishing)
