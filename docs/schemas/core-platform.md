---
title: Core Platform (robos.core)
layout: default
parent: KGraph Schemas
nav_order: 1
has_children: true
permalink: /schemas/core-platform.html
---

# Core Platform (robos.core)
{: .no_toc }

Foundational architectural graph, system roots, and platform configuration.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `core-platform`
- **Ontology Namespace**: `robos.platform`
- **GitOps Package File**: `.robos/kgraphs/core-platform/package.jsonld`
- **Schemas Defined**: 21

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Build System** (`robos:BuildSystem`)]({{ '/schemas/core-platform/build-system.html' | relative_url }}) | `urn:robos:shape:BuildSystemShape` | `dcterms:title`, `robos:buildTool`, `robos:configFile` | [View Schema &rarr;]({{ '/schemas/core-platform/build-system.html' | relative_url }}) |
| [**Database** (`robos:Database`)]({{ '/schemas/core-platform/database.html' | relative_url }}) | `urn:robos:shape:DatabaseShape` | `dcterms:title`, `robos:engine`, `robos:databaseName`, `robos:host` | [View Schema &rarr;]({{ '/schemas/core-platform/database.html' | relative_url }}) |
| [**NoSQL Database** (`robos:NoSQLDatabase`)]({{ '/schemas/core-platform/nosql-database.html' | relative_url }}) | `urn:robos:shape:NoSQLDatabaseShape` | `dcterms:title`, `robos:engine`, `robos:host` | [View Schema &rarr;]({{ '/schemas/core-platform/nosql-database.html' | relative_url }}) |
| [**Message Broker** (`robos:MessageBroker`)]({{ '/schemas/core-platform/message-broker.html' | relative_url }}) | `urn:robos:shape:MessageBrokerShape` | `dcterms:title`, `robos:brokerType`, `robos:endpoint` | [View Schema &rarr;]({{ '/schemas/core-platform/message-broker.html' | relative_url }}) |
| [**MCP Server** (`robos:MCPServer`)]({{ '/schemas/core-platform/mcp-server.html' | relative_url }}) | `urn:robos:shape:MCPServerShape` | `dcterms:title`, `robos:transport`, `robos:toolsProvided` | [View Schema &rarr;]({{ '/schemas/core-platform/mcp-server.html' | relative_url }}) |
| [**Context Source** (`robos:ContextSource`)]({{ '/schemas/core-platform/context-source.html' | relative_url }}) | `urn:robos:shape:ContextSourceShape` | `dcterms:title`, `robos:sourceType`, `robos:location` | [View Schema &rarr;]({{ '/schemas/core-platform/context-source.html' | relative_url }}) |
| [**Prompt Strategy** (`robos:PromptStrategy`)]({{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}) | `urn:robos:shape:PromptStrategyShape` | `dcterms:title`, `robos:strategyType`, `robos:engine` | [View Schema &rarr;]({{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}) |
| [**Database Schema** (`robos:DatabaseSchema`)]({{ '/schemas/core-platform/database-schema.html' | relative_url }}) | `urn:robos:shape:DatabaseSchemaShape` | `dcterms:title`, `robos:schemaName`, `robos:database` | [View Schema &rarr;]({{ '/schemas/core-platform/database-schema.html' | relative_url }}) |
| [**Database Table** (`robos:DatabaseTable`)]({{ '/schemas/core-platform/database-table.html' | relative_url }}) | `urn:robos:shape:DatabaseTableShape` | `dcterms:title`, `robos:tableName`, `robos:database` | [View Schema &rarr;]({{ '/schemas/core-platform/database-table.html' | relative_url }}) |
| [**Database Column** (`robos:DatabaseColumn`)]({{ '/schemas/core-platform/database-column.html' | relative_url }}) | `urn:robos:shape:DatabaseColumnShape` | `dcterms:title`, `robos:columnName`, `robos:dataType`, `robos:table` | [View Schema &rarr;]({{ '/schemas/core-platform/database-column.html' | relative_url }}) |
| [**Database Index** (`robos:DatabaseIndex`)]({{ '/schemas/core-platform/database-index.html' | relative_url }}) | `urn:robos:shape:DatabaseIndexShape` | `dcterms:title`, `robos:indexName`, `robos:table` | [View Schema &rarr;]({{ '/schemas/core-platform/database-index.html' | relative_url }}) |
| [**NoSQL Collection** (`robos:NoSQLCollection`)]({{ '/schemas/core-platform/nosql-collection.html' | relative_url }}) | `urn:robos:shape:NoSQLCollectionShape` | `dcterms:title`, `robos:collectionName`, `robos:database` | [View Schema &rarr;]({{ '/schemas/core-platform/nosql-collection.html' | relative_url }}) |
| [**Message Topic** (`robos:MessageTopic`)]({{ '/schemas/core-platform/message-topic.html' | relative_url }}) | `urn:robos:shape:MessageTopicShape` | `dcterms:title`, `robos:topicName`, `robos:broker` | [View Schema &rarr;]({{ '/schemas/core-platform/message-topic.html' | relative_url }}) |
| [**Consumer Group** (`robos:ConsumerGroup`)]({{ '/schemas/core-platform/consumer-group.html' | relative_url }}) | `urn:robos:shape:ConsumerGroupShape` | `dcterms:title`, `robos:groupId`, `robos:topic` | [View Schema &rarr;]({{ '/schemas/core-platform/consumer-group.html' | relative_url }}) |
| [**MCP Tool** (`robos:MCPTool`)]({{ '/schemas/core-platform/mcp-tool.html' | relative_url }}) | `urn:robos:shape:MCPToolShape` | `dcterms:title`, `robos:toolName`, `robos:mcpServer` | [View Schema &rarr;]({{ '/schemas/core-platform/mcp-tool.html' | relative_url }}) |
| [**MCP Resource** (`robos:MCPResource`)]({{ '/schemas/core-platform/mcp-resource.html' | relative_url }}) | `urn:robos:shape:MCPResourceShape` | `dcterms:title`, `robos:uriTemplate`, `robos:mcpServer` | [View Schema &rarr;]({{ '/schemas/core-platform/mcp-resource.html' | relative_url }}) |
| [**MCP Prompt** (`robos:MCPPrompt`)]({{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}) | `urn:robos:shape:MCPPromptShape` | `dcterms:title`, `robos:promptName`, `robos:mcpServer` | [View Schema &rarr;]({{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}) |
| [**Curriculum Definition** (`robos:CurriculumDefinition`)]({{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}) | `robos:CurriculumDefinitionShape` | `dcterms:title`, `robos:sourcePath`, `robos:evidence` | [View Schema &rarr;]({{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}) |
| [**Data Store** (`robos:DataStore`)]({{ '/schemas/core-platform/data-store.html' | relative_url }}) | `robos:DataStoreShape` | `dcterms:title`, `robos:engine`, `robos:evidence` | [View Schema &rarr;]({{ '/schemas/core-platform/data-store.html' | relative_url }}) |
| [**Broker Definition** (`robos:BrokerDefinition`)]({{ '/schemas/core-platform/broker-definition.html' | relative_url }}) | `robos:BrokerDefinitionShape` | `dcterms:title`, `robos:brokerType`, `robos:evidence` | [View Schema &rarr;]({{ '/schemas/core-platform/broker-definition.html' | relative_url }}) |
| [**Source Artifact** (`robos:SourceArtifact`)]({{ '/schemas/core-platform/source-artifact.html' | relative_url }}) | `robos:SourceArtifactShape` | `dcterms:title`, `robos:sourcePath`, `robos:sourceKind`, `robos:inRepository`, `robos:evidence` | [View Schema &rarr;]({{ '/schemas/core-platform/source-artifact.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Core Platform (robos.core) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Core Platform (robos.core) (robos.platform)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>