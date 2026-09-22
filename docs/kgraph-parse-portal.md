---
title: RobOS Kgraph Parse Portal
layout: default
nav_order: 10
permalink: /kgraph-parse-portal.html
---

# RobOS Kgraph Parse Portal
{: .no_toc }

Heavy-scale connectors web application and headless parsing portal fronting a high-performance **Luxir C++ search index**, contextual MIME disambiguation, and **Apache Tika 4.0 streaming `tika-grpc`**.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## What is the RobOS Kgraph Parse Portal?

The **RobOS Kgraph Parse Portal** (`packages/kgraph-parse-portal`) is the industrial-strength resource ingestion gateway and connectors engine for the RobOS Dual-State SDLC Knowledge Graph. It allows developers, platform architects, and autonomous AI agents to point at **any web resource or Linux filesystem location** and extract a validated, SHACL-compliant Knowledge Graph package in W3C RDF JSON-LD 1.1 format.

It supersedes preliminary crawler drafts by fusing three cutting-edge infrastructure layers:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-parse-portal-architecture.jpg' | relative_url }}" alt="RobOS KGraph Parse Portal Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS KGraph Parse Portal Architecture</strong>: Three-phase ingestion pipeline featuring universal Linux filesystem ingestion, contextual MIME disambiguation, Apache Tika 4.0 streaming gRPC, and Luxir C++ search indexing into the Dual-State Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## Core Pillars & Architectural Foundations

### 1. Universal Linux Filesystem Ingestion
In RobOS, **any file on a Linux operating system finds itself represented in the Knowledge Graph in a meaningful, evidence-backed way**. The portal crawls directory trees and system roots, attaching cryptographically verifiable `robos:evidence` to every extracted node:
- **Repository context**: Git repository name or filesystem root.
- **Relative path**: Normalized path within the workspace.
- **Line number**: Defaulting to `1` or AST declaration line.
- **Working tree status**: `clean` vs `modified`.
- **Cryptographic SHA-256**: Real-time hash generated from file content.

#### Linux System Virtual Nodes
Beyond regular source files, the portal classifies Linux operating system primitives:
- **ELF Executables & Dynamic Shared Libraries**: Detected via `\x7fELF` magic headers (`robos:BinaryExecutable`, `robos:SharedLibrary`).
- **Systemd Unit Files**: Mapped into `robos:SystemdService`.
- **Unix Domain IPC Sockets**: Mapped into `robos:LinuxSocket`.
- **Named Pipes (FIFO)**: Mapped into `robos:LinuxNamedPipe`.
- **Block & Character Devices**: `/dev/sd*`, `/dev/nvme*`, and tty nodes represented as `robos:LinuxDeviceNode`.

---

### 2. Contextual MIME & Archetype Disambiguation Engine
A standard MIME type such as `application/json` or `text/yaml` conveys zero architectural intent on its own. The Kgraph Parse Portal features a disambiguation engine that inspects path context, file names, dependencies, and AST heuristics:

| Raw Pattern | Raw MIME | Disambiguated Meaning | Target RobOS Shape |
|:---|:---|:---|:---|
| `package.json` | `application/json` | Node.js Manifest & Scripts | `robos:SourceArtifact` |
| `tsconfig.json` | `application/json` | TypeScript Compiler Config | `robos:SourceArtifact` |
| `openapi.yaml` / `.json` | `text/yaml` | REST API Contract | `robos:Contract` (`protocol: OpenAPI`) |
| `*.proto` | `text/x-protobuf` | Microservice RPC Protocol | `robos:ProtobufContract` |
| `*.graphql` / `*.gql` | `application/graphql`| GraphQL Schema Contract | `robos:GraphQLContract` |
| `Chart.yaml` | `application/x-yaml` | Helm Chart Definition | `robos:GitOpsDeployment` |
| `values.yaml` | `application/x-yaml` | Helm Deployment Values | `robos:GitOpsDeployment` |
| `*.service` | `text/plain` | Linux Systemd Daemon Unit | `robos:SystemdService` |
| `.feature` | `text/x-gherkin` | BDD Feature Specification | `robos:GherkinFeature` |
| `README.md` | `text/markdown` | Architecture Overview Page | `robos:DocumentationPage` |
| `ADR-*.md` | `text/markdown` | Architecture Decision Record | `robos:ArchitectureDecisionRecord` |
| `MODULE.bazel` | `text/plain` | Bazel Monorepo Workspace | `robos:BuildSystem` |
| `project.godot` | `text/plain` | Godot 4 Game Engine | `robos:PCGame` |

#### Directory Archetype Detection
When pointed at any directory, the classifier automatically discovers the root build system:
- **Maven**: Detected via `pom.xml` (`robos:Microservice`, `language: Java`).
- **Gradle**: Detected via `build.gradle`, `build.gradle.kts`, `settings.gradle`.
- **Cargo**: Detected via `Cargo.toml` (`language: Rust`).
- **Go Modules**: Detected via `go.mod` (`language: Go`).
- **Python**: Detected via `pyproject.toml`, `setup.py`, `Pipfile`.
- **Node.js**: Automatically differentiates between Electron apps, React/Next.js SPAs, Vue/Nuxt apps, and Express/Fastify services.
- **Bazel & Buck2**: Detected via `MODULE.bazel` or `.buckconfig`.

---

### 3. Apache Tika 4.0 Streaming `tika-grpc` Protocol
The portal interfaces with the **Apache Tika 4.0** streaming `tika-grpc` daemon running on `localhost:50051`. 
- **Zero-Copy Streaming**: Large files and multi-megabyte specifications stream across process boundaries over gRPC without clogging Node.js event loop memory.
- **AST Symbol Extraction**: Extracts classes, interfaces, RPC stubs, functions, methods, and message types for TypeScript, Python, Java, Go, Rust, and Protobuf.
- **Resilient Offline Fallback**: When running in offline or test environments where the external Tika daemon is not running, the portal seamlessly switches to an embedded offline polyglot engine without error.

---

### 4. Luxir C++ Hybrid Search Index Bridge
The portal bridges all parsed nodes directly into **Luxir**, the ultra-fast C++ search index embedded in RobOS. 
- **Sub-millisecond Search**: Full-text and faceted search across extracted AST symbols, paths, file sizes, MIME types, and SHACL classes.
- **Dual Indexing**: Writes documents both to the live C++ Luxir server (when online at port 8983) and a fast in-memory resilient fallback cache.

---

## REST API Reference

The Kgraph Parse Portal provides a REST API on port `19192` (configurable via `ROBOS_PARSE_PORT`):

### `GET /api/v1/status`
Returns daemon statuses, Tika gRPC connectivity, and Luxir index counts.

### `POST /api/v1/parse`
Parses a single document, code snippet, or file path.
```json
{
  "filePath": "petstore.proto",
  "content": "syntax = \"proto3\"; service PetService { rpc GetPet(Id) returns (Pet); }"
}
```

### `POST /api/v1/crawl`
Crawls a Linux directory recursively and returns extracted KGraph nodes.
```json
{
  "directoryPath": "/home/ndipiazza/source/robos/packages/kgraph-parse-portal",
  "maxDepth": 5,
  "package": "core-platform"
}
```

### `POST /api/v1/ingest`
Crawls a Linux directory and immediately commits all nodes to the RobOS Dual-State Knowledge Graph store via `SDLCKnowledgeGraphStore.addNode()`, guarded by the W3C SHACL shape validator.

### `GET /api/v1/search?q={query}&type={targetClass}`
Queries the Luxir search index.

## Direct CLI Access & Luxir Portal CLI

In addition to the Electron GUI and REST API, the portal includes a standalone CLI tool (`packages/kgraph-parse-portal/bin/luxir-portal-cli.js`) and an in-app interactive Tilix terminal console (`#tab-cli`):

```bash
# Query the Luxir index directly from the terminal
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js search "Contract"

# Search with faceted SHACL type filter
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js search "Contract" --type robos:Contract

# Inspect raw Luxir index JSON document by path or ID
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js inspect openapi.yaml

# Check Luxir C++ engine state (:8983) and indexed document distribution
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js status

# Direct REST query via cURL
curl -s "http://localhost:19192/api/v1/search?q=Contract" | jq .
```

---

## Visual Proof-of-Work & Evidence

The portal's capabilities have been verified through automated headless E2E BDD test runs in Xvfb virtual framebuffers with 1080p video walkthroughs and high-resolution terminal captures:

### 1. Direct CLI Search Query
Terminal execution querying the Luxir search index directly, returning indexed OpenAPI 3.1 contracts and gRPC Protobuf specifications with AST symbols, roles, and cryptographic SHA-256 evidence.
![Direct Luxir CLI Search Query](/assets/images/screenshots/09_luxir_cli_search_direct.png)

### 2. Direct Document Inspection
Inspecting the complete raw Luxir JSON index document for `openapi.yaml`, demonstrating indexed SHACL types, AST symbol hierarchies, MIME classifications, and content preview.
![Direct Luxir CLI Document Inspection](/assets/images/screenshots/10_luxir_cli_inspect_doc.png)

### 3. Direct REST API Execution via cURL
Querying the running KGraph Parse Portal REST gateway directly with cURL, demonstrating HTTP JSON payload responses with search scores, hit counts, and structured AST symbols.
![Direct cURL REST API Query](/assets/images/screenshots/11_luxir_curl_rest_direct.png)

### 4. Luxir Engine Status & Document Distribution
Status report displaying Luxir engine state (`READY`), endpoint (`:8983`), index name (`robos_kgraph`), and distribution across indexed SHACL types.
![Luxir Engine Status Report](/assets/images/screenshots/12_luxir_cli_status_engine.png)

---

## Running the Application

### Via RobOS App Launcher
Open the **App Launcher** (Super key or Panel grid) and select **KGraph Parse Portal**.

### Via Terminal
```bash
# Start the web and REST API server
node packages/kgraph-parse-portal/server.js

# Launch the full Electron desktop UI
electron packages/kgraph-parse-portal

# Use the direct Luxir CLI
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js status
```

