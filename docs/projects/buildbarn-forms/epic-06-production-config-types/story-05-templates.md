# Story 06-05: Config Templates (Starter Configs)

**Epic:** [Production Config Types](epic.md)
**Status:** Not started
**Points:** 5

## Description

Provide pre-filled config templates that give users a sensible starting point for common Buildbarn deployment scenarios. Instead of starting from a blank form, users select a template and immediately have a working base config that they can customize.

## Acceptance Criteria

- [ ] Template selector UI appears in "New Config" mode (before the editor opens)
- [ ] At minimum 3 templates available: Production Storage, Development Storage, Worker
- [ ] Stretch: Full Stack template (all configs bundled)
- [ ] Template preview shows a summary of what the template includes
- [ ] Selecting a template pre-fills the config editor with the template Jsonnet
- [ ] Templates are defined in code (not fetched from server) for reliability
- [ ] "Start from blank" option available alongside templates

## Templates to Define

### Production Storage Template
Based on Tim Potter's production config. Key values:
```jsonnet
{
  contentAddressableStorage: {
    backend: {
      local: {
        keyLocationMapInMemory: { entries: 2000000 },
        oldBlocks: 6,
        currentBlocks: 24,
        newBlocks: 2,
        blocksOnBlockDevice: {
          spareBlocks: 3,
          dataIntegrityValidationCache: { cacheSize: 1024 },
        },
      },
    },
    getAuthorizer: { allow: {} },
    putAuthorizer: { allow: {} },
    findMissingAuthorizer: { allow: {} },
  },
  actionCache: {
    backend: {
      local: {
        keyLocationMapInMemory: { entries: 100000 },
        oldBlocks: 8,
        currentBlocks: 16,
        newBlocks: 4,
      },
    },
    getAuthorizer: { allow: {} },
    putAuthorizer: { allow: {} },
    findMissingAuthorizer: { allow: {} },
  },
  grpcServers: [{
    listenAddresses: [':8980'],
    maximumMessageSizeBytes: 16777216,
  }],
}
```

### Development Storage Template
Smaller sizes for local dev:
```jsonnet
{
  contentAddressableStorage: {
    backend: {
      local: {
        keyLocationMapInMemory: { entries: 100000 },
        oldBlocks: 2,
        currentBlocks: 8,
        newBlocks: 1,
      },
    },
    getAuthorizer: { allow: {} },
    putAuthorizer: { allow: {} },
    findMissingAuthorizer: { allow: {} },
  },
}
```

### Worker Template
Standard OCI-executor worker config (structure depends on bb_worker.proto).

## Template Selector UX

```
┌─────────────────────────────────────────────┐
│ Start from a template (or start blank)      │
├─────────────────────────────────────────────┤
│ [Production Storage]  [Dev Storage]         │
│ Sensible production   Minimal local         │
│ defaults, 2M entries  dev setup             │
│                                             │
│ [Worker]             [Full Stack]           │
│ Standard OCI worker   All configs           │
│ configuration         bundled together      │
├─────────────────────────────────────────────┤
│              [Start from blank]             │
└─────────────────────────────────────────────┘
```

## Files

- `src/templates/storageProduction.jsonnet.ts` (template string)
- `src/templates/storageDev.jsonnet.ts`
- `src/templates/worker.jsonnet.ts`
- `src/templates/fullStack.jsonnet.ts`
- `src/templates/index.ts` (exports template registry)
- `src/components/TemplateSelector/TemplateSelector.tsx` (new UI component)
