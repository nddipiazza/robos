---
title: "KGraph Parse Portal"
package: kgraph-parse-portal
category: apis-testing
icon: kgraph-parse-portal.svg
summary: "Crawls a folder into knowledge-graph nodes, classifies files by type, parses documents through Apache Tika when available, and indexes the result for search."
description: "KGraph Parse Portal is an Electron window plus an HTTP API and CLI. Tika, Luxir and Buildbarn are optional: without a Tika or Luxir server it falls back to built-in classification and an in-memory index."
related:
  - /kgraph-parse-portal.html
---

KGraph Parse Portal turns files into knowledge-graph nodes. The [KGraph parse portal]({{ '/kgraph-parse-portal.html' | relative_url }}) page in the docs describes how it fits into ingestion; this page covers the app.

## Tabs

| Tab | What you do |
|---|---|
| **Filesystem Crawler & Ingestion** | Enter a path, **Max Depth** and a **Target Package** (core-platform, applications, services, devops, organization, learning, documentation), click **Scan & Extract Nodes**, review the JSON-LD, then **Commit to RobOS KGraph**. You can also paste one document and click **Parse Document via Tika gRPC** |
| **MIME & Archetype Disambiguation** | Type a file name and click **Classify File** to see its semantic type, SHACL class, MIME type and role |
| **Luxir Search Explorer** | Search what has been indexed, filtered by type |
| **Direct Luxir CLI** | A console for the Luxir CLI and REST access |
| **Hermetiq Buildbarn RBE** | Check a Buildbarn endpoint (default `127.0.0.1:8980`), generate Helm values and an install command for the Hermetiq chart `oci://ghcr.io/hermetiq/buildbarn`, and register the cluster as a graph node |
| **Documentation & Living Specs** | Reference text |

## Optional back ends

| Service | Setting | If it is missing |
|---|---|---|
| Apache Tika 4.0 gRPC | `ROBOS_TIKA_GRPC_ENDPOINT`, default `localhost:50051` | The portal checks the port with a socket probe and falls back to its own extraction: text files are read as UTF-8, PDFs and binaries get a placeholder string, and source files get symbols (classes, functions, protobuf messages and services and so on) found with regular expressions. The result is labeled `tika-offline-engine` |
| Luxir search engine | `ROBOS_LUXIR_ENDPOINT`, default `http://127.0.0.1:8983` | Nodes are indexed in an in-memory map instead, which is lost on exit |

Commit writes nodes to the SDLC knowledge graph store (`SDLCKnowledgeGraphStore` in `packages/robos-graph`, file `.robos/knowledge-graph.jsonld` in the checkout), if it can be loaded, and indexes them.

## HTTP API and CLI

The portal serves `/health` (also `/api/v1/status`), `POST /api/v1/parse`, `/crawl` and `/ingest`, `GET /api/v1/search`, `GET /api/v1/rbe/status`, and `POST /api/v1/rbe/values` and `/rbe/register-cluster`. The port comes from `ROBOS_PARSE_PORT`: `node server.js` defaults to 19192, and the Electron app defaults to 19193. `contracts/openapi.yaml` and `contracts/tika-service.proto` hold the specifications.

```bash
node packages/kgraph-parse-portal/server.js
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js status
node packages/kgraph-parse-portal/bin/luxir-portal-cli.js search "tika" --type robos:Contract
```

The CLI also has `inspect <doc-id>` and `curl <query>`, and `--json` for machine output. It queries a running portal on 19192 or 19193 and otherwise indexes its own folder in-process. Run the window with `electron packages/kgraph-parse-portal`.

Source: [`packages/kgraph-parse-portal`](https://github.com/nddipiazza/robos/tree/main/packages/kgraph-parse-portal).
