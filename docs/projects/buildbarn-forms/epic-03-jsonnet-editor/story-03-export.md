---
nav_exclude: true
---

# Story 03-03: JSON & YAML Export

**Epic:** [Jsonnet Editor](epic.md)
**Status:** Complete
**Points:** 2

## Description

Add export buttons to the preview panel so users can copy or download the evaluated configuration in their preferred format: raw JSON or Kubernetes-friendly YAML.

## Acceptance Criteria

- [ ] "Copy JSON" button copies the evaluated JSON to clipboard
- [ ] "Download JSON" button downloads a file named `config.json`
- [ ] "Copy YAML" button copies the evaluated JSON converted to YAML to clipboard
- [ ] "Download YAML" button downloads a file named `config.yaml`
- [ ] Buttons are disabled when there is no successful evaluation (error state or loading)
- [ ] YAML conversion uses `js-yaml` (`js-yaml.dump()`)
- [ ] Clipboard copy shows a brief "Copied!" confirmation feedback

## Implementation Notes

```typescript
import yaml from 'js-yaml';

function handleCopyYaml(jsonStr: string) {
  const obj = JSON.parse(jsonStr);
  const yamlStr = yaml.dump(obj, { indent: 2, lineWidth: 120 });
  navigator.clipboard.writeText(yamlStr);
}

function handleDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

## Files

- `src/JsonnetEditor/JsonnetEditor.tsx` — export button implementations
