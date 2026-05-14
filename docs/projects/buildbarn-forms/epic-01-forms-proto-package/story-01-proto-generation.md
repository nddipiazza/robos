# Story 01-01: Proto Generation Pipeline

**Epic:** [buildbarn-forms-proto Package](epic.md)
**Status:** Complete
**Points:** 5

## Description

Set up the full proto-to-TypeScript compilation pipeline using `protoc` and `ts-proto`. The pipeline clones `buildbarn/bb-storage` as a git submodule, resolves all proto import dependencies (googleapis, opentelemetry, remote-apis), and generates TypeScript types with JSDoc comments preserved from proto source.

The generated types use `ts-proto`'s `oneof=unions` mode, which represents `oneof` fields as tagged union types — critical for accurately modeling `BlobAccessConfiguration.backend` and similar discriminated unions.

## Acceptance Criteria

- [ ] `generate-protos.sh` script runs to completion without errors
- [ ] All proto files under `pkg/proto/configuration/` are compiled
- [ ] Generated TypeScript files land in `src/generated/` mirroring proto import paths
- [ ] `oneof` fields are rendered as TypeScript discriminated unions
- [ ] Proto field comments appear as JSDoc on generated interface properties
- [ ] `npm run proto:generate` is documented in README
- [ ] Script fails fast with clear error messages if `protoc` is not installed

## Implementation Notes

Proto import paths follow the Buildbarn convention:
```
github.com/buildbarn/bb-storage/pkg/proto/configuration/bb_storage/bb_storage.proto
```
The submodule must be checked out at `proto/` with a symlink structure so protoc can resolve these paths with `-I proto`.

External dependencies (resolved via additional `-I` flags):
- `proto/external/googleapis/` — for `google.api.*` protos
- `proto/external/opentelemetry-proto/` — for `opentelemetry.*` protos
- `proto/external/remote-apis/` — for `build.bazel.remote.execution.v2.*` protos
- `/usr/include` — for system proto includes

Key `ts-proto` options:
```bash
--ts_proto_opt=esModuleInterop=true
--ts_proto_opt=outputServices=false
--ts_proto_opt=oneof=unions
--ts_proto_opt=useOptionals=messages
--ts_proto_opt=exportCommonSymbols=false
```

## Files

- `scripts/generate-protos.sh` — main generation script
- `proto/` — git submodule pointing to bb-storage proto directory
