---
layout: default
nav_exclude: true
---

# Feature Spec: Search Studio — First-Class OpenSearch, Elasticsearch, Solr, Vector & Log Analytics Support

- **Status**: Draft
- **Created Date**: 2026-09-08
- **Target Component**: New RobOS Native App `packages/search-studio` (`Search Studio`), `packages/robos-graph`, `packages/data-sources`, `packages/dev-central`, `.robos/` Git Store
- **Author/Idea Source**: User & Antigravity Agent

---

## 1. Overview & Vision

In contemporary enterprise software architecture, nearly every organization relies on dedicated search engines and asynchronous log aggregation clusters:
- **Asynchronous Log Ingestion & Telemetry**: Microservices stream structured JSON logs asynchronously via Fluent Bit, Logstash, Vector, or OpenTelemetry collectors into **OpenSearch** or **Elasticsearch** clusters.
- **Enterprise Full-Text Search**: Critical business features (product catalogs, legal search, customer service portals) depend on inverted-index search engines such as **OpenSearch**, **Elasticsearch**, or **Apache Solr**.
- **Dense Vector Search & AI Embeddings**: Modern AI-driven features (RAG pipelines, semantic similarity, recommendation engines) store embeddings in vector databases and k-NN engines (**OpenSearch k-NN**, **Elasticsearch dense_vector**, **Qdrant**, **Milvus**, **pgvector**).

Currently, RobOS provides first-class developer applications for relational databases (**Relational DB Manager**) and document/key-value stores (**NoSQL DB Manager**), but **lacks first-class support for search engines, vector databases, and asynchronous log analytics**. Developers and architects are forced to switch out of RobOS to browse web dashboards (Kibana, OpenSearch Dashboards, Cerebro, Solr Admin UI) or write ad-hoc `curl` scripts to inspect indices, query mappings, and tail logs. Furthermore, the RobOS Knowledge Graph does not formally model search clusters, index schemas, or asynchronous log streams.

### The Solution: First-Class KGraph Ontologies & The "Search Studio" Desktop App

This feature introduces two transformative additions to RobOS:

1. **First-Class Knowledge Graph Search & Log Ontologies**: Introduce `robos:SearchCluster`, `robos:SearchIndex`, `robos:LogAnalyticsSink`, and `robos:VectorStore` into the RobOS ontology and Modular KGraph Packages (`services` and `core-platform`). Semantic edges link microservices to their log sinks (`robos:streamsLogsTo`) and search indices (`robos:queriesIndex`, `robos:indexesDocument`).
2. **Search Studio (`packages/search-studio`)**: A dedicated, dark-themed RobOS desktop application providing an all-in-one console for OpenSearch, Elasticsearch, Apache Solr, and vector stores. Developers can inspect cluster health, browse index mappings, run Query DSL / Lucene queries in a Monaco editor with sub-millisecond telemetry, tail live asynchronous log streams with trace ID filtering, and test k-NN vector embeddings.

---

## 2. User Stories & Use Cases

- **As a Backend Engineer / Architect**, I want to declare an OpenSearch cluster and an application log index pattern (`logs-order-service-*`) in the RobOS Knowledge Graph, so that my microservice's async logging pipeline is explicitly modeled and validated against architecture contracts.
- **As a Developer Debugging Microservice Errors**, I want to open **Search Studio**, connect to our local or staging OpenSearch cluster, and tail incoming asynchronous application logs in real-time with regex filtering on `level: ERROR` and trace IDs.
- **As a Search Engineer**, I want to inspect OpenSearch / Elasticsearch / Solr index mappings, check shard allocations, test custom analyzers, and execute complex Query DSL / Lucene queries in a Monaco editor with instant JSON/table formatting and execution latency metrics.
- **As an AI / RAG Engineer**, I want to query a vector store (OpenSearch k-NN, Qdrant, Milvus) directly within Search Studio, inspecting cosine similarity scores and vector payloads side-by-side with full-text search results.
- **As a System Architect**, I want to click "Discover from Cluster" in Search Studio to inspect an existing live OpenSearch/Elasticsearch domain and automatically generate validated KGraph package nodes for all discovered indices, aliases, and log pipelines.

---

## 3. Key Capabilities & Scope

### In Scope

#### 3.1 First-Class KGraph Ontologies & Declarative Schemas
- **Ontology Classes**:
  - `robos:SearchCluster`: Represents the search engine cluster (Engine: `OpenSearch`, `Elasticsearch`, `Solr`, `Qdrant`, `Milvus`, `pgvector`; endpoints, version, node topology).
  - `robos:SearchIndex`: Represents an index or collection (primary/replica shards, mapping fields, tokenizers, analyzers, dense vector dimensions).
  - `robos:LogAnalyticsSink`: Represents an asynchronous log destination (log pipeline, buffer, index pattern, retention period, rotation policy).
  - `robos:VectorStore`: Represents vector database collections with metric type (cosine, dot product, euclidean) and embedding dimension.
- **Semantic Edges**:
  - `robos:streamsLogsTo`: Connects `robos:Microservice` to `robos:LogAnalyticsSink`.
  - `robos:queriesIndex`: Connects `robos:Microservice` to `robos:SearchIndex`.
  - `robos:indexesDocument`: Connects `robos:DataPipeline` or worker to `robos:SearchIndex`.
- **W3C SHACL Validation**: Strict validation against `SearchClusterShape`, `SearchIndexShape`, and `LogSinkShape`.

#### 3.2 Search Studio Desktop App (`packages/search-studio`)
- **Multi-Cluster Navigator**:
  - Connect to multiple clusters simultaneously: local Docker/Kind clusters, AWS OpenSearch Service, Elastic Cloud, on-prem Apache Solr, or Qdrant/Milvus instances.
  - Authentication: Basic auth, API keys, AWS IAM SigV4 signing, and GPG password store (`pass`) integration.
  - Live cluster health indicators (🟢 Green, 🟡 Yellow, 🔴 Red) with node count, shard allocation stats, and memory heap pressure metrics.
- **Index, Alias & Shard Inspector**:
  - Searchable table of all indices: index name, aliases, health status, document count, storage footprint (bytes/GB), and primary/replica shard count.
  - Shard matrix view: Visual distribution of primary and replica shards across cluster nodes (inspired by Cerebro and Elasticsearch HQ).
- **Mapping & Schema Browser**:
  - Interactive collapsible JSON mapping tree.
  - Detailed field schema table: field name, type (`text`, `keyword`, `integer`, `date`, `geo_point`, `dense_vector`), analyzer, search_analyzer, and index options.
  - Vector configuration inspector: dimension size and index type (`hnsw`, `flat`).
- **Query DSL & Lucene Console**:
  - Dual-mode Monaco query editor:
    - **Query DSL / JSON Mode**: Auto-completes OpenSearch / Elasticsearch JSON query syntax (`bool`, `must`, `filter`, `match`, `term`, `range`, `aggs`).
    - **Lucene / Solr Mode**: Traditional query syntax (`title:"search" AND status:active`, `fq=category:books`).
    - **SQL Mode**: OpenSearch / Elasticsearch SQL plugin integration (`SELECT * FROM orders WHERE total > 100`).
  - Sub-millisecond execution scorecard (Total Hits, Query Time in ms, Shards Responded).
  - Dual-view results presentation: Formatted JSON tree with syntax highlighting, and tabular data grid with column sorting and export (CSV/JSON).
- **Real-Time Asynchronous Log Streamer & Tailer**:
  - Live tailing of asynchronous log streams (`tail -f` for OpenSearch/Elasticsearch index patterns).
  - Dynamic severity filtering: Toggle `ERROR`, `WARN`, `INFO`, `DEBUG`.
  - Full-text regex search and timestamp slider.
  - Trace ID click-through: Isolate all log lines sharing an OpenTelemetry `trace_id` or `correlation_id` across microservices.
- **Vector Similarity Playground**:
  - Visual k-NN query runner: Submit raw vector arrays or search phrases to inspect top-$k$ nearest neighbors with similarity score graphs.

#### 3.3 KGraph Synchronization & Auto-Discovery
- **Cluster Introspection**: 1-click scan queries `/_cat/indices` and `/_mapping` on an active cluster, generating clean JSON-LD nodes in `.robos/kgraphs/services/package.jsonld`.
- **GitOps Persistence**: Saves search engine configurations to `.robos/searches.yaml` and synchronizes with `.robos/topology.yaml`.

### Out of Scope (Initial Release)

- Building a new search engine from scratch (RobOS integrates with established open-source engines).
- Heavyweight multi-terabyte snapshot restore management (focus is developer testing, schema authoring, log tailing, and local cluster inspection).

---

## 4. Architectural & System Integration

### System Architecture Flow

```mermaid
graph TD
    subgraph UI [RobOS Desktop App: Search Studio (packages/search-studio)]
        Nav[Cluster Navigator<br/>OpenSearch / Elastic / Solr / Qdrant]
        IndexGrid[Index & Shard Matrix Explorer]
        MappingView[Schema & Field Mapping Browser]
        QueryConsole[Monaco Query DSL & Lucene Console]
        LogTailer[Live Async Log Streamer & Trace Filter]
        VectorPlay[Vector Similarity Playground]
    end

    subgraph KGraphStore [Modular KGraph Packages .robos/]
        KCluster[robos:SearchCluster Node]
        KIndex[robos:SearchIndex Node]
        KLogSink[robos:LogAnalyticsSink Node]
        Microservices[robos:Microservice Nodes]
    end

    subgraph ClusterConnections [External Search & Log Infrastructure]
        LocalOpenSearch[Local Kind / Docker OpenSearch]
        AWSOpenSearch[AWS OpenSearch Service]
        ElasticCloud[Elastic Cloud Cluster]
        SolrServer[Apache Solr Cluster]
        QdrantDB[Qdrant / Milvus Vector DB]
    end

    subgraph PasswordStore [UNIX Password Store]
        PassCreds[~/.password-store/devops/search-clusters/]
    end

    Nav --> PassCreds
    Nav --> LocalOpenSearch
    Nav --> AWSOpenSearch
    Nav --> ElasticCloud
    Nav --> SolrServer
    Nav --> QdrantDB

    LocalOpenSearch --> IndexGrid
    IndexGrid --> MappingView
    MappingView --> QueryConsole
    LocalOpenSearch --> LogTailer
    QdrantDB --> VectorPlay

    Nav -->|Auto-Discover & Sync| KCluster
    KCluster --> KIndex
    KCluster --> KLogSink
    Microservices -->|streamsLogsTo| KLogSink
    Microservices -->|queriesIndex| KIndex
```

### Impacted Packages & Registration Checklist
1. **New Package `packages/search-studio/`**:
   - `main.js`: Electron main process with connection pool and query engine.
   - `preload.js`: Context bridge exposing search APIs.
   - `renderer/`: UI components adhering to RobOS dark theme (`--bg-primary: #0d1117`, `--accent: #00bcd4`).
2. **Icon & Desktop Registration**:
   - Add `search-studio` icon to `packages/robos-icons/` (Magnifying glass with database nodes).
   - Register in `packages/desktop-manager/main.js` and App Launcher.
   - Add `search-studio.desktop` in `/usr/share/applications/`.
3. **Knowledge Graph Integration**:
   - Extend `packages/robos-graph/lib/oslc-parser.js` and `packages/robos-graph/lib/shacl-validator.js`.
4. **Data Sources & Task Planner**:
   - Link search cluster connections into `packages/data-sources`.
   - Add search engine task templates in `packages/task-planner`.

### IPC Endpoints
- `ipcMain.handle('search-studio:get-clusters', async () => { ... })`
- `ipcMain.handle('search-studio:connect-cluster', async (event, config) => { ... })`
- `ipcMain.handle('search-studio:get-indices', async (event, { clusterId }) => { ... })`
- `ipcMain.handle('search-studio:get-mapping', async (event, { clusterId, indexName }) => { ... })`
- `ipcMain.handle('search-studio:execute-query', async (event, { clusterId, indexName, queryJson, mode }) => { ... })`
- `ipcMain.handle('search-studio:tail-logs', async (event, { clusterId, indexPattern, filters }) => { ... })`
- `ipcMain.handle('search-studio:sync-to-kgraph', async (event, { clusterId, selectedIndices }) => { ... })`

---

## 5. Proposed Implementation Plan

1. **Phase 1: Knowledge Graph Search Ontology & SHACL Shapes**
   - Define `robos:SearchCluster`, `robos:SearchIndex`, `robos:LogAnalyticsSink`, and `robos:VectorStore` in `packages/robos-graph`.
   - Add SHACL shapes validating indices, mappings, and log sink definitions.

2. **Phase 2: Core Search Studio Electron App Scaffolding**
   - Scaffold `packages/search-studio` using vanilla JavaScript and Electron.
   - Implement OpenSearch / Elasticsearch REST client supporting basic auth, API keys, and AWS SigV4.
   - Connect to GPG password store (`pass`) for credential retrieval.

3. **Phase 3: Index Explorer, Mapping Browser & Query DSL Console**
   - Build index table with health badges, document counts, and shard counts.
   - Implement Monaco editor with JSON Query DSL auto-completion and SQL querying.
   - Implement tabular data grid and formatted JSON results viewer with sub-millisecond timer.

4. **Phase 4: Real-Time Asynchronous Log Streamer & Trace Filter**
   - Implement polling / SSE log streaming for index patterns (`logs-*`).
   - Add severity filters (ERROR, WARN, INFO) and trace ID isolation.

5. **Phase 5: Solr & Vector DB Adapters (Qdrant / Milvus)**
   - Add Solr query adapter (`/select?q=...`).
   - Add vector similarity query test view for dense vectors and k-NN indices.

6. **Phase 6: Desktop Integration & Automated E2E Verification**
   - Register `search-studio` across App Launcher, desktop manager, and icon registry.
   - Write automated E2E tests verifying cluster connection, index inspection, query execution, and KGraph sync.

---

## 6. Acceptance Criteria

- [ ] New native application `packages/search-studio` launches cleanly with RobOS dark theme and registered desktop icon.
- [ ] Connects successfully to OpenSearch and Elasticsearch clusters via HTTP/HTTPS with basic auth or API keys.
- [ ] Displays live cluster health status, node counts, index inventory, and shard allocations.
- [ ] Monaco Query DSL console executes queries, returning formatted JSON and sortable data tables with latency metrics.
- [ ] Real-time log streamer tails asynchronous application logs with severity toggles (ERROR, WARN) and trace ID filtering.
- [ ] 1-click sync introspects active search indices and creates validated `robos:SearchIndex` nodes in Modular KGraph Packages.
- [ ] Verified with containerized headless E2E test suite.
