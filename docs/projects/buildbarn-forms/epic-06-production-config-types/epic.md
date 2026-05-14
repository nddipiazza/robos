# Epic 06: Production Config Types

**Status:** Not started
**Priority:** Medium — needed for production usefulness beyond storage configs
**Repository:** `Hermetiq/buildbarn-forms`
**Dependencies:** Epic 02 (core library), Epic 04 (tree view split-pane for navigation)

Extend the library to support all major Buildbarn configuration types beyond storage: worker, scheduler, and browser. Add config templates (pre-filled starting points), ConfigMap YAML export (the Kubernetes-ready output format), and frontend validation improvements.

## Stories

| # | Story | Status | Points |
|---|-------|--------|--------|
| 01 | [Worker config schema & form](story-01-worker-config.md) | Not started | 5 |
| 02 | [Scheduler config schema & form](story-02-scheduler-config.md) | Not started | 3 |
| 03 | [Browser (frontend proxy) config schema & form](story-03-browser-config.md) | Not started | 3 |
| 04 | [Config set editor (multi-file tabs)](story-04-config-set-editor.md) | Not started | 5 |
| 05 | [Config templates (starter configs)](story-05-templates.md) | Not started | 5 |
| 06 | [ConfigMap YAML export](story-06-configmap-yaml.md) | Not started | 3 |
| 07 | [Advanced validation improvements](story-07-validation.md) | Not started | 3 |

## Technical Context

### Config Type Mapping

| Config File | Proto Message | Use |
|-------------|--------------|-----|
| `storage.jsonnet` | `ApplicationConfiguration` (bb_storage.proto) | Blob storage + action cache |
| `worker.jsonnet` | `ApplicationConfiguration` (bb_worker.proto) | Build executors |
| `scheduler.jsonnet` | `ApplicationConfiguration` (bb_scheduler.proto) | Job scheduling |
| `browser.jsonnet` | `ApplicationConfiguration` (bb_browser.proto) | Frontend proxy |
| `common.libsonnet` | n/a (shared Jsonnet library) | Cross-file constants |

### ConfigMap YAML Output

The final deliverable is a Kubernetes ConfigMap:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: buildbarn-config-{hash}
  namespace: buildbarn
data:
  storage.jsonnet: |
    ...
  worker.jsonnet: |
    ...
  common.libsonnet: |
    ...
```

### Templates

Templates are pre-filled config objects representing common setups:
- **Production Storage** — sensible production defaults (2M entries, 6/24/2 block layout)
- **Development Storage** — smaller sizes for local dev/testing
- **Worker** — standard worker with OCI executor
- **Full Stack** — all configs in one bundle, wired together
