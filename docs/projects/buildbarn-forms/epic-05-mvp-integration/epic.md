---
nav_exclude: true
---

# MVP Integration

**Status:** Not started
**Priority:** High — delivers user-facing value in dashboard.hermetiq.io
**Repository:** `Hermetiq/MVP`
**File to replace:** `MVP/src/components/BBConfigEditor.js` (placeholder)
**Dependencies:** Epic 01, 02, 03, 04 (library must be published)

Integrate `@hermetiq/buildbarn-forms` into the Hermetiq MVP React dashboard. The existing `BBConfigEditor.js` is a placeholder marked for replacement. This epic wires the library's components to the Go gRPC backend (`config_service.proto`), enabling real save/load of Buildbarn configs to/from the GitHub `bb-config` repository.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Install library & configure .npmrc](story-01-install-library.md) | Not started | 1 |
| 02 | [Config set browser (list view)](story-02-config-browser.md) | Not started | 5 |
| 03 | [Config editor page (editor view)](story-03-config-editor.md) | Not started | 5 |
| 04 | [Save config to GitHub via gRPC](story-04-save-grpc.md) | Not started | 5 |
| 05 | [Load config from GitHub via gRPC](story-05-load-grpc.md) | Not started | 5 |
| 06 | [Jsonnet evaluation endpoint](story-06-jsonnet-eval.md) | Not started | 3 |
| 07 | [Delete config with confirmation](story-07-delete-config.md) | Not started | 2 |
| 08 | [Version history panel](story-08-version-history.md) | Not started | 5 |
| 09 | [Error handling & user feedback (toasts)](story-09-error-handling.md) | Not started | 3 |

## Technical Context

### MVP Stack
- React (JavaScript, not TypeScript)
- React Context for state management
- Stytch for authentication (already handled)
- gRPC-Web for backend communication (grpc-web generated clients in `src/grpc-web/`)

### gRPC API (implemented by Tim Potter)
**Proto:** `MVP/src/grpc-web/proto/config_service.proto`
**Client:** `MVP/src/grpc-web/config_service_pb.js` + `config_service_grpc_web_pb.js`

```protobuf
service ConfigService {
  rpc SaveConfigSet(SaveConfigSetRequest)   returns (SaveConfigSetResponse);
  rpc ListConfigSets(ListConfigSetsRequest) returns (ListConfigSetsResponse);
  rpc GetConfigSet(GetConfigSetRequest)     returns (GetConfigSetResponse);
  rpc DeleteConfigSet(DeleteConfigSetRequest) returns (DeleteConfigSetResponse);
}
```

### Config Storage Layout (Hermetiq/bb-config)
```
bb-config/
  {projectId}/
    storage.jsonnet
    worker.jsonnet
    scheduler.jsonnet
    browser.jsonnet
    common.libsonnet
```

### Jsonnet Evaluation
The MVP needs a backend endpoint for `evaluateJsonnet`. Options:
- Reuse the existing Go backend (add an evaluate RPC to `config_service.proto`)
- Add a lightweight Node.js Express/Vite endpoint using `@hanazuki/node-jsonnet`

The `BuildBarnConfigEditor` and `JsonnetEditor` components accept an `evaluateJsonnet` prop, so the MVP just needs to wire this to whichever endpoint is chosen.

### Authentication Flow
Users are already authenticated via Stytch before reaching the config editor. Project-level access control is handled by the existing MVP permission model. The Go backend uses the Stytch session token to enforce per-project access.
