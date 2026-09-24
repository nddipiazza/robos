---
title: Datasources Crawling Guide
layout: default
parent: KGraph Crawler
nav_order: 5
permalink: /kgraph-crawler/datasources-guide.html
---

# Datasources Crawling Guide
{: .no_toc }

Practical recipe-based guides for systematically crawling Git repositories, databases, message brokers, API contracts, cloud infrastructure, and documentation.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Overview: The Datasource Domains

The RobOS KGraph Crawler is designed to parse enterprise systems across primary datasource domains:

| # | Domain | Primary Targets | Extracted Entities | Target KGraph Package |
|:---|:---|:---|:---|:---|
| 1 | **Git Repositories** | GitHub, GitLab, Gitea, Monorepos | `robos:GitProjectOrganization`, `robos:Microservice`, `robos:FrontEndApp` | `services`, `applications`, `organization` |
| 2 | **Relational Databases** | PostgreSQL, MySQL, Oracle, Snowflake | `robos:Database`, `robos:DatabaseTable`, `robos:ColumnSchema` | `core-platform` |
| 3 | **NoSQL & Document Stores** | MongoDB, Redis, DynamoDB | `robos:NoSQLDatabase`, `robos:DocumentCollection` | `core-platform` |
| 4 | **Event Message Brokers** | Apache Kafka, RabbitMQ, Pulsar | `robos:MessageBroker`, `robos:KafkaTopic`, `robos:SchemaRegistry` | `core-platform` |
| 5 | **API Contracts & Stubs** | OpenAPI 3.1, Protobuf, GraphQL | `robos:OpenAPIContract`, `robos:ProtobufContract`, `robos:GraphQLContract` | `services` |
| 6 | **Cloud Infrastructure** | Kubernetes, Helm, Terraform, Docker | `robos:KubernetesCluster`, `robos:Environment`, `robos:CICDPipeline` | `devops` |
| 7 | **Architecture Docs** | Markdown, PDF, ADRs, Confluence | `robos:DocumentationPage`, `robos:ArchitectureDecisionRecord` | `documentation` |

---

## 2. Recipe 1: Crawling Git Repositories & Monorepos

### Goal
Scan a multi-project repository or git forge organization, identify all service submodules, and link them to their build tools and language runtimes.

### Command
```bash
robos crawler run \
  --iterator workspace \
  --path ~/source/enterprise-monorepo \
  --include "**/pom.xml,**/package.json,**/Cargo.toml,**/go.mod" \
  --emitter kgraph \
  --package-target services
```

### Generated KGraph Entity (`services/package.jsonld`)
```json
{
  "@id": "urn:robos:service:billing-engine",
  "@type": [
    "robos:Microservice",
    "schema:SoftwareApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Billing Engine Microservice",
  "dcterms:description": "High-throughput invoice computation and payment settlement service.",
  "robos:language": "Java 21",
  "robos:buildSystem": "Maven",
  "robos:repository": "github.com/enterprise/billing-engine",
  "robos:hasBuildDescriptor": "services/billing/pom.xml"
}
```

---

## 3. Recipe 2: Crawling Relational Databases (PostgreSQL / Oracle)

### Goal
Introspect a production or staging database schema, extracting table names, foreign key constraints, and column data types using secure UNIX `pass` credentials.

### Configuration (`crawl-postgres.yaml`)
```yaml
crawlId: postgres-catalog-crawl
iterator:
  type: dev.robos.tika.pipes.iterator.RobOSDataSourceIterator
  params:
    dataSourceId: urn:robos:db:orders-production
fetcher:
  type: dev.robos.tika.pipes.fetcher.RobOSDatabaseFetcher
  params:
    credentialUrn: urn:robos:pass:devops/databases/orders-prod
emitter:
  type: dev.robos.tika.pipes.emitter.RobOSKGraphEmitter
  params:
    targetPackage: core-platform
```

### Execution
```bash
robos crawler run --config crawl-postgres.yaml
```

---

## 4. Recipe 3: Crawling Apache Kafka Message Brokers

### Goal
Connect to an Apache Kafka cluster and Schema Registry to crawl topics, Avro/Protobuf event schemas, and producer/consumer lineage.

### Command
```bash
robos crawler run \
  --broker "kafka.internal:9092" \
  --schema-registry "http://schema-registry.internal:8081" \
  --credential "urn:robos:pass:devops/kafka/analytics-cluster" \
  --emitter kgraph
```

### Result in KGraph (`core-platform/package.jsonld`)
```json
{
  "@id": "urn:robos:kafka-topic:customer-events",
  "@type": [
    "robos:KafkaTopic",
    "robos:EventStream",
    "oslc:Resource"
  ],
  "dcterms:title": "Customer Events Stream",
  "robos:topicName": "prod.customer.events.v1",
  "robos:partitions": 12,
  "robos:replicationFactor": 3,
  "robos:schemaFormat": "AVRO",
  "robos:schemaVersion": 4,
  "robos:belongsToBroker": "urn:robos:message-broker:analytics-cluster"
}
```

---

## 5. Recipe 4: Crawling API Contracts (OpenAPI 3.1 & Protobuf)

### Goal
Parse API contracts across services, automatically mapping producer and consumer edges.

```bash
robos crawler run \
  --iterator workspace \
  --path ~/source/services \
  --include "**/*.proto,**/openapi.yaml,**/openapi.json" \
  --emitter kgraph
```

### Discovered Contract in KGraph (`services/package.jsonld`)
```json
{
  "@id": "urn:robos:contract:proto:shipping-v1",
  "@type": [
    "robos:ProtobufContract",
    "robos:APIContract",
    "oslc:Resource"
  ],
  "dcterms:title": "Shipping gRPC API Contract",
  "robos:contractPath": "contracts/shipping/v1/shipping.proto",
  "robos:packageName": "shipping.v1",
  "robos:methods": [
    "CalculateFreight",
    "DispatchConsignment",
    "TrackShipment"
  ]
}
```

---

## 6. Recipe 5: Crawling Kubernetes & Helm GitOps Manifests

### Goal
Parse live cluster deployments or GitOps repositories (ArgoCD / Flux) to synchronize `robos:KubernetesCluster` and `robos:GitOpsDeployment` nodes.

```bash
robos crawler run \
  --iterator workspace \
  --path ~/source/gitops-deployments \
  --include "**/Chart.yaml,**/values.yaml,**/deployment.yaml" \
  --emitter kgraph \
  --package-target devops
```

---

## 7. Recipe 6: Dynamic Schema Inference on Novel Data Sources

### Goal
Parse an unfamiliar domain data source (e.g. proprietary ML model registry or industrial sensor catalog). The crawler dynamically infers classes, generates SHACL shapes, and scaffolds a new schema package.

```bash
robos crawler run \
  --iterator datasource \
  --path ~/data/ml-weights-catalog \
  --infer-schemas \
  --auto-scaffold-package
```

### Automatic Package Output:
- **Created Package**: `.robos/kgraphs/machine-learning/package.jsonld`
- **Created Shape**: `.robos/kgraphs/machine-learning/ModelWeightShape.jsonld`
- **Updated Index**: `.robos/kgraph.yaml`
- **Living Docs**: `docs/schemas/machine-learning.md`

---

## 8. Summary Checklist for Crawler Operators

1. **Verify Credentials**: Ensure target credentials exist in UNIX `pass` (`pass show devops/...`).
2. **Launch tika-grpc**: Check that `tika-grpc` is responsive (`robos crawler daemon status`).
3. **Execute Crawl**: Run targeted crawl with `--include` and `--exclude` filters.
4. **Validate Graph**: Run `kgraph-validate` to confirm 0 SHACL shape violations.
5. **Diff Blast Radius**: Run `kgraph-diff` before committing package updates to Git.
