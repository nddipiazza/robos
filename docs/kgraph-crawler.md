---
title: KGraph crawler
layout: default
parent: Build on RobOS
nav_order: 4
permalink: /kgraph-crawler.html
redirect_from:
  - /kgraph-crawler/architecture.html
  - /kgraph-crawler/pipes-iterators-fetchers.html
  - /kgraph-crawler/emitters-and-schema-inference.html
  - /kgraph-crawler/datasources-guide.html
description: "How to scan a local directory into knowledge graph nodes, what the nodes contain, and what the crawler does not do."
---

# KGraph crawler
{: .no_toc }

How to scan a local directory into knowledge graph nodes, what the nodes contain, and what the crawler does not do. Read this if you want to seed a graph from a checkout, or if you were looking for the Tika-based crawler described in older docs.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What the crawler is

The crawler is a filesystem scan. The code is `scanPathToGraphNodes` in `packages/kgraph-parse-portal/lib/fs-mime-classifier.js`. The [KGraph parse portal]({{ site.baseurl }}{% link kgraph-parse-portal.md %}) exposes it as two HTTP endpoints and two buttons in its window.

| Operation | Endpoint | Window button | Effect |
|:---|:---|:---|:---|
| Preview | `POST /api/v1/crawl` | **Scan & Extract Nodes** | Returns the nodes and adds them to the portal's in-memory search index. Writes nothing to the graph. |
| Commit | `POST /api/v1/ingest` | **Commit to RobOS KGraph** | Does the same, then calls `addNode` on the knowledge graph store for every node. |

For each directory the crawl detects a project type, creates one root node, then creates one node per file with a classification and a SHA-256 hash of the file. It does not read file contents into entities: an OpenAPI file becomes one `robos:Contract` node, not a set of endpoint nodes.

Not built yet: an earlier design described a `kgraph-crawler` package on Apache Tika Pipes, with iterators for Git forges, databases, Kafka and Kubernetes, credentials from the `pass` store, a `robos crawler` command, and automatic creation of new schema packages. None of that is in the repository. There is no `packages/kgraph-crawler` directory and no `robos crawler` command. The design note is on the [Ideas page]({{ '/ideas.html' | relative_url }}).

For other sources, use what exists:

| Source | Use today |
|:---|:---|
| Local Git checkouts | The [Company KGraph Import skill]({{ '/skills/import-company-kgraph.html' | relative_url }}), which builds a reviewable proposal from declarations in tracked files. |
| Databases, S3 buckets, Kafka topics | The [Data Sources Explorer]({{ '/apps/data-sources/' | relative_url }}) app. |
| Anything you can describe as nodes | `kgraph insert` from `packages/robos-graph/bin/kgraph-cli.js`, which runs the SHACL gate. See [Schemas]({{ site.baseurl }}{% link schemas.md %}). |

## Run a crawl

You need Node.js and a checkout of the RobOS repository. The server uses only Node built-ins, so there is nothing to install for the preview.

1. Start the server from the repository root.

   ```bash
   node packages/kgraph-parse-portal/server.js
   ```

   It prints `RobOS Kgraph Parse Portal Server listening on http://localhost:19192`. Set `ROBOS_PARSE_PORT` to use another port.

2. Preview a directory.

   ```bash
   curl -s -X POST http://localhost:19192/api/v1/crawl \
     -H 'Content-Type: application/json' \
     -d '{"directoryPath": "/path/to/repo", "maxDepth": 5, "package": "core-platform"}'
   ```

   The response has `ok`, `archetype`, `fileCount`, `nodeCount` and `nodes`. A path that does not exist returns HTTP 500 with `{"ok": false, "error": "Target path does not exist: ..."}`.

3. Commit the nodes by sending the same body to `/api/v1/ingest`. The response has `ok`, `committedToGraph`, `nodesCommitted`, `archetype` and `nodes`. Check `committedToGraph`: if the graph store cannot be loaded, the endpoint still answers `ok: true` with `committedToGraph: false` and `nodesCommitted: 0`.

4. Validate. The commit does not.

   ```bash
   node packages/robos-graph/bin/kgraph-cli.js validate core-platform
   ```

   Use the package id you sent as `package`.

Request fields, which are the same for both endpoints:

| Field | Default | Meaning |
|:---|:---|:---|
| `directoryPath` (or `path`) | Working directory of the server | Directory or single file to scan. |
| `maxDepth` | `8` | How many directory levels to visit. Entries directly under the root are level 1. |
| `repository` | Base name of the path | Written into each node's evidence and `robos:inRepository`. |
| `package` | `core-platform` | Written into each node's `robos:package`. The commit stores the node in that package. |

In the window, open the **Filesystem Crawler & Ingestion** tab. The fields are **Target Linux Filesystem Path:**, **Max Depth:** (default 5) and **Target Package:** (core-platform, applications, services, devops, organization, learning, documentation). The path field is pre-filled with a path from the author's machine, so replace it. The window does not send `repository`.

Scanning a single file returns one node and no archetype root.

## What a crawl produces

The root node has the id `urn:robos:source:<directory>-root`. Each file node has the id `urn:robos:file:<directory>:<path>`, where the path is lower-cased, every run of characters other than `a-z`, `0-9`, `_`, `.` and `-` becomes `-`, and leading dots are dropped. For example, `contracts/openapi.yaml` in `kgraph-parse-portal` becomes `urn:robos:file:kgraph-parse-portal:contracts-openapi.yaml`.

| Property | Value |
|:---|:---|
| `@type` | The semantic type, the target class, and `schema:CreativeWork`, with duplicates removed. |
| `dcterms:title`, `dcterms:description` | File name, and the semantic role with the MIME type. |
| `robos:package` | The `package` you sent. |
| `robos:mimeType`, `robos:semanticRole`, `robos:fileSize`, `robos:sourcePath` | From the classification and `stat`. |
| `robos:inProject` | Id of the root node. |
| `robos:evidence` | One entry: `repository`, `path`, `line`, `revision` and `sha256`. |

Some classes get extra properties.

| Class | Added properties |
|:---|:---|
| `robos:SourceArtifact` | `robos:sourceKind` (`manifest` for `package.json`, otherwise `implementation`), `robos:inRepository` |
| `robos:DocumentationPage` | `robos:slug`, `robos:docPath` |
| `robos:ProtobufContract` | `robos:specFile`, `robos:packageName`, `robos:rpcMethods`, `robos:protocol` (`gRPC/Protobuf`) |
| Other `robos:Contract` nodes | `robos:protocol`, `robos:specFile` |

The root node adds `robos:archetype`, `robos:sourceKind` (always `git-repository`), and `robos:buildSystem` and `robos:language` when the archetype defines them.

## How files are classified

Directory archetype comes from marker files in the root directory only. The first match wins.

| Marker | Archetype | Target class |
|:---|:---|:---|
| `MODULE.bazel`, `WORKSPACE`, `WORKSPACE.bazel` | `bazel-monorepo` | `robos:BuildSystem` |
| `.buckconfig`, `BUCK` | `buck2-monorepo` | `robos:BuildSystem` |
| `pom.xml` | `maven-java` | `robos:Microservice` |
| `build.gradle`, `build.gradle.kts`, `settings.gradle` | `gradle-jvm` | `robos:Microservice` |
| `Cargo.toml` | `cargo-rust` | `robos:Microservice` |
| `go.mod` | `go-module` | `robos:Microservice` |
| `pyproject.toml`, `setup.py`, `requirements.txt`, `Pipfile` | `python-project` | `robos:Microservice` |
| `package.json` with `electron` | `electron-desktop` | `robos:DesktopApp` |
| `package.json` with `next` or `react` | `react-web` | `robos:FrontEndApp` |
| `package.json` with `vue` or `nuxt` | `vue-web` | `robos:FrontEndApp` |
| `package.json` with `express`, `fastify` or `@nestjs/core` | `node-service` | `robos:Microservice` |
| Any other `package.json` | `node-library` | `robos:SourceArtifact` |
| `project.godot` | `godot-game` | `robos:PCGame` |
| `Chart.yaml`, `Chart.yml` | `helm-chart` | `robos:GitOpsDeployment` |
| `CMakeLists.txt`, `Makefile` | `c-cpp-project` | `robos:SourceArtifact` |
| `Dockerfile`, `docker-compose.yml`, `compose.yaml` | `docker-container` | `robos:ContainerImage` |
| Path under `/etc/systemd` or `/usr/lib/systemd` | `systemd-units` | `robos:SystemdService` |
| None of the above | `generic-directory` | `robos:SourceArtifact` |

For `package.json`, dependencies and devDependencies are checked in the order shown.

Each file is classified by the first rule that matches. The classifier reads the first 4096 bytes for content checks.

| Match | Semantic type | Target class |
|:---|:---|:---|
| Symlink, socket, named pipe, block or character device | `robos:LinuxSymlink`, `robos:LinuxSocket`, `robos:LinuxNamedPipe`, `robos:LinuxBlockDevice`, `robos:LinuxCharacterDevice` | `robos:SourceArtifact` |
| ELF magic bytes | `robos:BinaryExecutable`, or `robos:SharedLibrary` for `.so` files | `robos:SourceArtifact` |
| `package.json` | `robos:NodeManifest` | `robos:SourceArtifact` |
| `tsconfig.json` | `robos:TypeScriptConfig` | `robos:SourceArtifact` |
| `.jsonld`, or JSON containing `"@context"` and `"@type"` | `robos:LinkedDataDocument` | `robos:SourceArtifact` |
| JSON named or containing `openapi` or `swagger` | `robos:Contract` (protocol `OpenAPI`) | `robos:Contract` |
| `.schema.json`, or JSON containing `"$schema"` | `robos:JSONSchema` | `robos:SourceArtifact` |
| Other `.json` | `robos:DataDocument` | `robos:SourceArtifact` |
| `Chart.yaml` | `robos:HelmChartDefinition` | `robos:GitOpsDeployment` |
| `values.yaml` | `robos:HelmValues` | `robos:GitOpsDeployment` |
| Path containing `.github/workflows`, or `.gitlab-ci.yml` | `robos:CICDPipeline` | `robos:CICDPipeline` |
| YAML containing `apiVersion:` and `kind:` | `robos:KubernetesManifest` | `robos:GitOpsDeployment` |
| YAML named or containing `openapi` or `swagger` | `robos:Contract` (protocol `OpenAPI`) | `robos:Contract` |
| Other `.yaml`, `.yml` | `robos:ConfigurationFile` | `robos:SourceArtifact` |
| `.proto` | `robos:ProtobufContract` | `robos:Contract` |
| `.graphql`, `.gql` | `robos:GraphQLContract` | `robos:Contract` |
| `.feature` | `robos:GherkinFeature` | `robos:GherkinFeature` |
| `README.md` | `robos:DocumentationPage` | `robos:DocumentationPage` |
| `ADR-*.md`, or a path containing `/adr/` or `/decisions/` | `robos:ArchitectureDecisionRecord` | `robos:ArchitectureDecisionRecord` |
| Other `.md` | `robos:DocumentationPage` | `robos:DocumentationPage` |
| `.sh`, `.bash`, `.zsh`, or a `#!` line containing `sh` | `robos:ShellScript` | `robos:SourceArtifact` |
| `.service`, or text with `[Unit]` and `[Service]` | `robos:SystemdService` | `robos:SourceArtifact` |
| `.pdf` | `robos:DocumentationDocument` | `robos:DocumentationPage` |
| `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.py`, `.java`, `.rs`, `.go`, `.c`, `.cpp`, `.cc`, `.h`, `.hpp` | `robos:SourceArtifact` | `robos:SourceArtifact` |
| Anything else | `robos:SourceArtifact` (MIME `text/plain`) | `robos:SourceArtifact` |

## Limits and known problems

{: .warning }
Do not crawl a tree that contains a named pipe (FIFO). Hashing opens every non-directory entry for reading, so the crawl blocks until something writes to the pipe. A test directory with one named pipe never finished; the same directory without the pipe returned at once.

{: .note }
The crawl and commit paths do not run SHACL validation, and the output is not guaranteed to pass it. Crawling `packages/kgraph-parse-portal` and validating the result gives one violation: the `.feature` file becomes a `robos:GherkinFeature` node without the `robos:featureFile` property that `GherkinFeatureShape` requires. Run the `validate` command from step 4 after every commit.

- **Excluded names.** Any file or directory named `.git`, `.svn`, `.hg`, `node_modules`, `target`, `dist`, `build`, `.cache`, `__pycache__`, `.idea`, `.vscode` or `.DS_Store` is skipped at every depth. Other hidden files are included.
- **Symlinks** are recorded as `robos:LinuxSymlink` nodes and never followed.
- **Memory.** Each file is read whole to compute its hash, so a tree with very large files uses that much memory per file.
- **Placeholder values.** `robos:rpcMethods` is always `["Service.Invoke"]`, `line` in the evidence is always `1`, and `revision` is always `working-tree`. The crawl does not read Git state. The root node's `sha256` is the hash of the directory path string, not of any content.
- **Dangling reference.** `robos:inRepository` points at `urn:robos:source:<repository>`. The crawl does not create that node.
- **Re-runs.** Committing again replaces nodes with the same `@id`. Nodes for files you deleted stay in the graph.
- **Target store.** A commit writes to the graph store opened on `.robos/knowledge-graph.jsonld`, located two directories above the portal package. That is the checkout the portal runs from. There is no option to point it at another workspace.
- **No authentication.** See the warning on the [parse portal page]({{ site.baseurl }}{% link kgraph-parse-portal.md %}) about the server's network exposure.
