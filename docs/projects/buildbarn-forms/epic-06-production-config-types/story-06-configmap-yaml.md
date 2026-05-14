# Story 06-06: ConfigMap YAML Export

**Epic:** [Production Config Types](epic.md)
**Status:** Not started
**Points:** 3

## Description

Generate a Kubernetes ConfigMap YAML from a complete config set (all Jsonnet files for a project). This is the final deployment artifact — the ConfigMap is applied to the Kubernetes cluster and mounted into Buildbarn pods.

## Acceptance Criteria

- [ ] "Export ConfigMap" button available in config set editor
- [ ] Export evaluates all Jsonnet files in the config set
- [ ] Output is valid Kubernetes ConfigMap YAML
- [ ] ConfigMap `name` includes a deterministic hash of the content (e.g., `buildbarn-config-{sha256-prefix}`)
- [ ] ConfigMap `namespace` field configurable (default: `buildbarn`)
- [ ] Each config file appears as a key under `data:`
- [ ] Multi-line Jsonnet content uses YAML literal block scalar (`|`)
- [ ] Export is available as: copy to clipboard, download as `configmap.yaml`
- [ ] If any Jsonnet file fails evaluation, export is blocked with an error message

## ConfigMap Format

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: buildbarn-config-{hash}
  namespace: buildbarn
  labels:
    app: buildbarn
    managed-by: hermetiq
data:
  storage.jsonnet: |
    local common = import 'common.libsonnet';
    {
      contentAddressableStorage: {
        ...
      }
    }
  worker.jsonnet: |
    local common = import 'common.libsonnet';
    {
      ...
    }
  common.libsonnet: |
    {
      replicationFactor: 3,
    }
```

## Corresponding Pod Volume Mount

The exported ConfigMap is used in pod specs:
```yaml
volumes:
  - name: buildbarn-config
    configMap:
      name: buildbarn-config-{hash}
      items:
        - key: storage.jsonnet
          path: storage.jsonnet
        - key: common.libsonnet
          path: common.libsonnet
```

## Implementation Notes

```typescript
import yaml from 'js-yaml';
import { createHash } from 'crypto';  // or SubtleCrypto in browser

function generateConfigMap(
  configFiles: Record<string, string>,  // filename -> Jsonnet source
  namespace = 'buildbarn'
): string {
  const contentHash = createHash('sha256')
    .update(JSON.stringify(configFiles))
    .digest('hex')
    .slice(0, 8);

  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `buildbarn-config-${contentHash}`,
      namespace,
      labels: { app: 'buildbarn', 'managed-by': 'hermetiq' },
    },
    data: configFiles,
  };

  return yaml.dump(configMap, {
    lineWidth: 10000,
    quotingType: "'",
    forceQuotes: false,
  });
}
```

## Files

- `src/utils/configMapExport.ts` (new utility)
- Integration into `ConfigSetEditor` component (Epic 06, Story 04)
