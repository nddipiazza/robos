---
nav_exclude: true
---

# Epic 01: buildbarn-forms-proto Package

**Status:** Complete (v0.2.4 published)
**Priority:** Foundational — blocks all other epics
**Repository:** `Hermetiq/buildbarn-forms-proto`
**Package:** `@hermetiq/buildbarn-forms-proto`

The `buildbarn-forms-proto` package is a standalone npm package containing generated JavaScript/TypeScript type definitions for all Buildbarn protobuf configuration schemas. It is the data layer that all form components, validators, and schema mappers depend on.

This epic covers the full lifecycle: proto generation, comment extraction, package structure, and CI/CD publishing.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Proto generation pipeline](story-01-proto-generation.md) | Complete | 5 |
| 02 | [Proto comment extraction](story-02-comment-extraction.md) | Complete | 5 |
| 03 | [Package structure & public API](story-03-package-structure.md) | Complete | 3 |
| 04 | [CI/CD publish pipeline](story-04-ci-publish.md) | Complete | 3 |
| 05 | [Version check & branch protection](story-05-version-check.md) | Complete | 2 |
| 06 | [Submodule update automation](story-06-submodule-update.md) | Not started | 3 |

## Technical Context

### Source Protos
Generated from `github.com/buildbarn/bb-storage/pkg/proto/configuration/` including:
- `bb_storage.proto` — `ApplicationConfiguration` top-level config
- `blobstore.proto` — `BlobAccessConfiguration`, `LocalBlobAccessConfiguration`, S3, GCS backends
- `grpc.proto` — `ServerConfiguration`, `ClientConfiguration`
- `builder.proto` — `SchedulerConfiguration`
- `global.proto` — `GlobalConfiguration`
- `auth.proto` — `AuthorizerConfiguration`, `JWTAuthorizerConfiguration`
- `tls.proto` — TLS client/server configuration
- Plus many more: `eviction`, `digest`, `jmespath`, `jwt`, `blockdevice`, etc.

### Toolchain
- `protoc` (system binary) + `ts-proto` protoc plugin
- Proto compiler options: `oneof=unions`, `useOptionals=messages`, `comments=true`
- External proto dependencies: `googleapis`, `opentelemetry-proto`, `remote-apis`
- Comment extraction: custom `tsx` script parsing TypeScript AST

### Package Size
~1.5 MB of generated protobuf JavaScript code. This is why it lives in a separate package from `buildbarn-forms` — to avoid bloating the main library bundle.
