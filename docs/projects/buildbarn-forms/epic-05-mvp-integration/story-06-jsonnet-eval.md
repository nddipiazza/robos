---
nav_exclude: true
---

# Story 05-06: Jsonnet Evaluation Endpoint

**Epic:** [MVP Integration](epic.md)
**Status:** Not started
**Points:** 3

## Description

Add a backend endpoint that evaluates Jsonnet snippets. The `BuildBarnConfigEditor` component requires an `evaluateJsonnet` async function prop. This story delivers the server-side implementation that the MVP wires to that prop.

## Acceptance Criteria

- [ ] `POST /api/evaluate-jsonnet` endpoint accepts `{ jsonnet: string, importDir?: string }` and returns `{ result: string }` (evaluated JSON as a string) or `{ error: string }`
- [ ] Evaluation uses `@hanazuki/node-jsonnet` (Node.js bindings for the official Jsonnet library)
- [ ] `importDir` parameter allows resolving Jsonnet `import` statements for multi-file configs (e.g., `import 'common.libsonnet'`)
- [ ] Endpoint is protected by MVP authentication middleware (Stytch session required)
- [ ] Evaluation errors (Jsonnet syntax errors, import not found) return HTTP 400 with the error message
- [ ] Evaluation is sandboxed — no file system access outside the provided `importDir`
- [ ] Response time is <500ms for typical configs

## Implementation Options

**Option A: Node.js Express endpoint (standalone)**
```typescript
import { Jsonnet } from '@hanazuki/node-jsonnet';

app.post('/api/evaluate-jsonnet', async (req, res) => {
  const { jsonnet, importDir } = req.body;
  const jn = new Jsonnet();
  if (importDir) jn.addJpath(importDir);
  try {
    const result = await jn.evaluateSnippet(jsonnet);
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});
```

**Option B: Add evaluate RPC to config_service.proto (Go backend)**
```protobuf
rpc EvaluateJsonnet(EvaluateJsonnetRequest) returns (EvaluateJsonnetResponse);

message EvaluateJsonnetRequest {
  string source = 1;
  string import_dir = 2;
}

message EvaluateJsonnetResponse {
  string result = 1;
  string error = 2;
}
```

**Recommendation:** Option A is faster to ship and keeps the Go backend focused on storage operations. Option B is cleaner long-term. Decide based on MVP backend deployment constraints.

## Frontend Wiring

```javascript
// In ConfigEditorPage.js
const evaluateJsonnet = useCallback(async (src) => {
  const res = await fetch('/api/evaluate-jsonnet', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${stytchSession.token}`,
    },
    body: JSON.stringify({ jsonnet: src }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(error);
  }
  const { result } = await res.json();
  return result;
}, [stytchSession]);

return (
  <BuildBarnConfigEditor
    value={jsonnetSource}
    onChange={setJsonnetSource}
    evaluateJsonnet={evaluateJsonnet}
  />
);
```
