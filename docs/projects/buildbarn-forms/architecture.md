# Architecture: buildbarn-forms Ecosystem

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    dashboard.hermetiq.io (MVP)                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               BBConfigEditor.js (host page)             │    │
│  │                                                          │    │
│  │  ┌────────────────────────────────────────────────────┐ │    │
│  │  │           @hermetiq/buildbarn-forms (npm)          │ │    │
│  │  │                                                    │ │    │
│  │  │  ┌─────────────────────┐  ┌────────────────────┐  │ │    │
│  │  │  │  BuildBarnConfig-   │  │  ProtoFormBuilder  │  │ │    │
│  │  │  │  Editor             │  │  + TreeView        │  │ │    │
│  │  │  │  (JsonnetEditor)    │  │                    │  │ │    │
│  │  │  │                     │  │  ┌──────────────┐  │  │ │    │
│  │  │  │  ┌───────┬───────┐  │  │  │ @hermetiq/   │  │  │ │    │
│  │  │  │  │Monaco │ Live  │  │  │  │ buildbarn-   │  │  │ │    │
│  │  │  │  │Editor │Preview│  │  │  │ forms-proto  │  │  │ │    │
│  │  │  │  └───────┴───────┘  │  │  └──────────────┘  │  │ │    │
│  │  │  └─────────────────────┘  └────────────────────┘  │ │    │
│  │  └────────────────────────────────────────────────────┘ │    │
│  │                         │                                │    │
│  │                         │ gRPC-Web                       │    │
│  └─────────────────────────┼────────────────────────────────┘    │
└────────────────────────────┼────────────────────────────────────┘
                             │
          ┌──────────────────▼──────────────────────┐
          │   Hermetiq cloud-native (Go backend)    │
          │                                          │
          │   config_service.proto gRPC API          │
          │   ─────────────────────────────────────  │
          │   SaveConfigSet   → GitHub commit        │
          │   ListConfigSets  → GitHub file list     │
          │   GetConfigSet    → GitHub file read     │
          │   DeleteConfigSet → GitHub file delete   │
          └──────────────────┬──────────────────────┘
                             │
          ┌──────────────────▼──────────────────────┐
          │   GitHub: Hermetiq/bb-config repo       │
          │                                          │
          │   project-alpha/                         │
          │     storage.jsonnet                      │
          │     worker.jsonnet                       │
          │     common.libsonnet                     │
          │   project-beta/                          │
          │     ...                                  │
          └─────────────────────────────────────────┘
```

---

## Package Dependency Graph

```
@hermetiq/buildbarn-forms (v0.2.x)
  ├── @hermetiq/buildbarn-forms-proto (^0.2.3)  [runtime]
  ├── @monaco-editor/react (^4.7.0)             [runtime - editor]
  ├── react-hook-form (^7.69.0)                 [runtime - forms]
  ├── immer (^11.1.0)                            [runtime - state]
  ├── js-yaml (^4.1.1)                           [runtime - export]
  ├── @hanazuki/node-jsonnet (^3.0.1)            [runtime - eval]
  └── @fortawesome/fontawesome-free (^7.1.0)    [runtime - icons]

@hermetiq/buildbarn-forms-proto (v0.2.x)
  └── @bufbuild/protobuf (^2.10.2)              [runtime]
```

---

## @hermetiq/buildbarn-forms-proto — Build Pipeline

```
buildbarn/bb-storage (GitHub)
  └── pkg/proto/configuration/**/*.proto
          │
          ▼ (git submodule in buildbarn-forms-proto/proto/)
  buildbarn-forms-proto/proto/
          │
          ▼ scripts/generate-protos.sh
          │   protoc + ts-proto plugin
          │   --ts_proto_opt=oneof=unions
          │   --ts_proto_opt=comments=true
          │
          ▼ src/generated/**/*.ts
          │   (TypeScript with JSDoc from proto comments)
          │
          ▼ scripts/build.js
          │   (tsc compile to dist/)
          │
          ▼ scripts/extract-comments.ts
          │   (AST parse .ts files → extract JSDoc)
          │
          ▼ dist/
          │   ├── index.js / index.d.ts
          │   ├── proto-comments.json           ← comment map
          │   └── github.com/buildbarn/...      ← generated types
          │
          ▼ GitHub Actions → publish to GitHub Packages
```

### proto-comments.json Format
```json
{
  "ApplicationConfiguration": {
    "message": "Top-level application configuration for bb_storage",
    "fields": {
      "grpcServers": "gRPC servers to spawn to listen for requests from clients.",
      "maximumMessageSizeBytes": "Maximum Protobuf message size to unmarshal.",
      "global": "Optional global configuration shared across all services."
    }
  },
  "BlobAccessConfiguration": {
    "message": "Configuration for blob access backends.",
    "fields": {
      "backend": "The underlying backend implementation (local, S3, GCS, gRPC, etc.)"
    }
  }
}
```

---

## @hermetiq/buildbarn-forms — Component Architecture

### Component Hierarchy

```
BuildBarnConfigEditor
  └── JsonnetEditor
        ├── [left] Monaco Editor (jsonnet syntax highlighting)
        └── [right] Preview Panel
              ├── Tab: JSON Preview (raw evaluated output)
              └── Tab: Field Tree View
                    └── TreeView
                          └── TreeNode[]

ProtoFormBuilder (form-based editing, separate from JsonnetEditor)
  ├── Schema → field array
  ├── [field: string]    → TextInput
  ├── [field: number]    → NumberInput
  ├── [field: boolean]   → Checkbox
  ├── [field: enum]      → <select>
  ├── [field: message]   → recursive ProtoFormBuilder (collapsible)
  ├── [field: repeated]  → array manager + per-item ProtoFormBuilder
  ├── [field: oneof]     → type selector + dynamic ProtoFormBuilder
  └── [field: map]       → key/value pair manager
  
  Each field label → InfoTooltip (proto comment from proto-comments.json)
```

### Directory Structure (buildbarn-forms/src/)

```
src/
├── index.ts                       # Public API exports
├── protoTypes.ts                  # Re-exports from buildbarn-forms-proto
├── setupTests.tsx                 # Jest test setup
│
├── BuildBarnConfigEditor/         # Top-level editor component
│   ├── BuildBarnConfigEditor.tsx  # Wraps JsonnetEditor
│   ├── BuildBarnConfigEditor.test.tsx
│   ├── BuildBarnConfigEditor.css
│   └── index.ts
│
├── JsonnetEditor/                 # Monaco-based Jsonnet editor
│   ├── JsonnetEditor.tsx          # Two-panel editor + live preview
│   ├── JsonnetEditor.css
│   └── index.ts
│
├── ProtoFormBuilder/              # Dynamic form generator from proto schema
│   ├── ProtoFormBuilder.tsx       # Main form engine (~750 lines)
│   ├── ProtoFormBuilder.test.tsx
│   ├── ProtoFormBuilder.css
│   ├── AuthorizerField.tsx        # Custom authorizer UI
│   ├── AuthorizerField.css
│   ├── fieldTypeMapper.ts         # Proto field → form field mapping + validation
│   ├── types.ts                   # TypeScript type definitions
│   ├── README.md
│   └── index.ts
│
├── TreeView/                      # Navigation tree component
│   ├── TreeView.tsx               # Root tree component
│   ├── TreeNode.tsx               # Individual tree node
│   ├── TreeContextMenu.tsx        # Right-click context menu
│   ├── TreeContextMenu.css
│   ├── TreeView.css
│   ├── icons.tsx                  # Tree icon set
│   ├── types.ts                   # TreeNodeData, TreeViewProps, etc.
│   └── index.ts
│
├── components/                    # Reusable form field components
│   ├── FormFields.tsx             # TextInput, NumberInput, Checkbox, FormField
│   ├── FormFields.css
│   ├── InfoTooltip.tsx            # Hover tooltip for proto documentation
│   ├── Tooltip/                   # Generic tooltip component
│   │   ├── Tooltip.tsx
│   │   ├── Tooltip.css
│   │   └── index.ts
│   └── index.ts
│
└── utils/
    ├── protoComments.ts           # Comment extraction from proto-comments.json
    ├── protoComments.test.ts
    ├── protoFieldUtils.ts         # Proto field utility functions
    ├── protoTypeInference.ts      # Type inference from runtime proto data
    ├── schemaToTree.ts            # Convert ProtoFormSchema → TreeNodeData
    └── pathNavigation.ts          # Tree path utilities
```

---

## Key Data Flows

### 1. Form → Jsonnet Generation Flow

```
User fills form fields
     │
     ▼
ProtoFormBuilder.onChange(formData: object)
     │
     ▼ (host app serializes to Jsonnet)
JSON.stringify(formData, null, 2)
  or jsonnet template rendering
     │
     ▼
JsonnetEditor displays generated Jsonnet
     │
     ▼ evaluateJsonnet(src) [async, host-supplied]
     │
     ▼
JSON preview renders evaluated output
```

### 2. Load Config → Form Population Flow

```
User selects config from list
     │
     ▼ MVP calls GetConfigSet gRPC
     │
     ▼ Returns Jsonnet string
     │
     ▼ Evaluate Jsonnet → JSON object
     │
     ▼ ProtoFormBuilder initialValues={parsedJson}
     │
     ▼ Form pre-populated with existing config values
```

### 3. Save Config Flow

```
User clicks Save
     │
     ▼ ProtoFormBuilder.onSubmit(formData)
     │
     ▼ Client-side validation (react-hook-form)
     │
     ▼ Serialize to Jsonnet string
     │
     ▼ MVP calls SaveConfigSet gRPC
     │   { projectId, configName, content, commitMessage }
     │
     ▼ Go backend writes file to GitHub
     │
     ▼ Confirmation toast to user
```

---

## Proto Comment System

### How Comments Flow from Proto to Tooltip

```
bb-storage/pkg/proto/configuration/bb_storage/bb_storage.proto
  ┌─────────────────────────────────────────────────────────┐
  │  message ApplicationConfiguration {                     │
  │    // gRPC servers to spawn to listen for requests.     │
  │    repeated ServerConfiguration grpc_servers = 4;       │
  │  }                                                       │
  └─────────────────────────────────────────────────────────┘
          │ protoc + ts-proto --ts_proto_opt=comments=true
          ▼
  generated/bb_storage/bb_storage.ts
  ┌─────────────────────────────────────────────────────────┐
  │  export interface ApplicationConfiguration {            │
  │    /** gRPC servers to spawn to listen for requests. */ │
  │    grpcServers: ServerConfiguration[];                   │
  │  }                                                       │
  └─────────────────────────────────────────────────────────┘
          │ scripts/extract-comments.ts (AST parse)
          ▼
  dist/proto-comments.json
  ┌─────────────────────────────────────────────────────────┐
  │  { "ApplicationConfiguration": {                        │
  │      "fields": {                                        │
  │        "grpcServers": "gRPC servers to spawn..."        │
  │      }                                                  │
  │    }                                                    │
  │  }                                                      │
  └─────────────────────────────────────────────────────────┘
          │ getFieldComment('ApplicationConfiguration', 'grpcServers')
          ▼
  ProtoFormBuilder field label
  ┌─────────────────────────────────────────────────────────┐
  │  gRPC Servers  ⓘ                                        │
  │                └── tooltip: "gRPC servers to spawn..."  │
  └─────────────────────────────────────────────────────────┘
```

---

## gRPC Backend API (config_service.proto)

Defined in: `MVP/src/grpc-web/proto/config_service.proto`
Implemented in: `cloud-native/bep-nats/bbconfig/` (Go, Tim Potter)

```protobuf
service ConfigService {
  rpc SaveConfigSet(SaveConfigSetRequest) returns (SaveConfigSetResponse);
  rpc ListConfigSets(ListConfigSetsRequest) returns (ListConfigSetsResponse);
  rpc GetConfigSet(GetConfigSetRequest) returns (GetConfigSetResponse);
  rpc DeleteConfigSet(DeleteConfigSetRequest) returns (DeleteConfigSetResponse);
}
```

Each project gets its own folder in `Hermetiq/bb-config`:
```
bb-config/
  <project-id>/
    storage.jsonnet
    worker.jsonnet
    scheduler.jsonnet
    browser.jsonnet
    common.libsonnet
```

---

## Kubernetes ConfigMap Output

Final deliverable is a Kubernetes ConfigMap for mounting into Buildbarn pods:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: buildbarn-config-bkbtg7t4d2
data:
  common.libsonnet: |
    # Common jsonnet library with shared settings
    {
      replicationFactor: 3,
      ...
    }
  storage.jsonnet: |
    local common = import 'common.libsonnet';
    {
      contentAddressableStorage: { ... },
      actionCache: { ... }
    }
  worker.jsonnet: |
    local common = import 'common.libsonnet';
    { buildDirectories: [...], ... }
```

Pods mount this ConfigMap:
```yaml
volumes:
  - name: buildbarn-config-bkbtg7t4d2
    configMap:
      name: buildbarn-config-bkbtg7t4d2
      items:
        - key: storage.jsonnet
          path: storage.jsonnet
        - key: common.libsonnet
          path: common.libsonnet
```

---

## Security & Auth

- **Authentication:** Handled by Hermetiq MVP (Stytch). Users are already logged in.
- **Authorization:** Project-level access (existing MVP permission model).
- **GitHub tokens:** Managed by Go backend service (never exposed to frontend).
- **Secrets:** Must NOT be stored in Buildbarn configs — use Kubernetes secrets instead.
- **Audit trail:** Every config change is a GitHub commit with author + message.
