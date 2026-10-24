---
title: "Core Platform (robos.platform)"
layout: default
parent: Schemas
nav_order: 1
has_children: true
permalink: /schemas/core-platform.html
description: "Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations."
---

# Core Platform (robos.platform)
{: .no_toc }

Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations.
{: .fs-6 }

| | |
|---|---|
| Package id | `core-platform` |
| Namespace | `robos.platform` |
| Package file | `.robos/kgraphs/core-platform/package.jsonld` |
| Classes documented | 23 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Build System (`robos:BuildSystem`)]({{ '/schemas/core-platform/build-system.html' | relative_url }}) | `urn:robos:shape:BuildSystemShape` | `dcterms:title`, `robos:buildTool`, `robos:configFile` |
| [Database (`robos:Database`)]({{ '/schemas/core-platform/database.html' | relative_url }}) | `urn:robos:shape:DatabaseShape` | `dcterms:title`, `robos:engine`, `robos:databaseName`, `robos:host` |
| [NoSQL Database (`robos:NoSQLDatabase`)]({{ '/schemas/core-platform/nosql-database.html' | relative_url }}) | `urn:robos:shape:NoSQLDatabaseShape` | `dcterms:title`, `robos:engine`, `robos:host` |
| [Search Index (`robos:SearchIndex`)]({{ '/schemas/core-platform/search-index.html' | relative_url }}) | `urn:robos:shape:SearchIndexShape` | `dcterms:title`, `robos:engine` |
| [Search Cluster (`robos:SearchCluster`)]({{ '/schemas/core-platform/search-cluster.html' | relative_url }}) | `urn:robos:shape:SearchClusterShape` | `dcterms:title`, `robos:engine` |
| [Message Broker (`robos:MessageBroker`)]({{ '/schemas/core-platform/message-broker.html' | relative_url }}) | `urn:robos:shape:MessageBrokerShape` | `dcterms:title`, `robos:brokerType`, `robos:endpoint` |
| [MCP Server (`robos:MCPServer`)]({{ '/schemas/core-platform/mcp-server.html' | relative_url }}) | `urn:robos:shape:MCPServerShape` | `dcterms:title`, `robos:transport` |
| [Context Source (`robos:ContextSource`)]({{ '/schemas/core-platform/context-source.html' | relative_url }}) | `urn:robos:shape:ContextSourceShape` | `dcterms:title`, `robos:sourceType`, `robos:location` |
| [Prompt Strategy (`robos:PromptStrategy`)]({{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}) | `urn:robos:shape:PromptStrategyShape` | `dcterms:title`, `robos:strategyType`, `robos:engine` |
| [Database Schema (`robos:DatabaseSchema`)]({{ '/schemas/core-platform/database-schema.html' | relative_url }}) | `urn:robos:shape:DatabaseSchemaShape` | `dcterms:title`, `robos:schemaName`, `robos:database` |
| [Database Table (`robos:DatabaseTable`)]({{ '/schemas/core-platform/database-table.html' | relative_url }}) | `urn:robos:shape:DatabaseTableShape` | `dcterms:title`, `robos:tableName`, `robos:database` |
| [Database Column (`robos:DatabaseColumn`)]({{ '/schemas/core-platform/database-column.html' | relative_url }}) | `urn:robos:shape:DatabaseColumnShape` | `dcterms:title`, `robos:columnName`, `robos:dataType`, `robos:table` |
| [Database Index (`robos:DatabaseIndex`)]({{ '/schemas/core-platform/database-index.html' | relative_url }}) | `urn:robos:shape:DatabaseIndexShape` | `dcterms:title`, `robos:indexName`, `robos:table` |
| [NoSQL Collection (`robos:NoSQLCollection`)]({{ '/schemas/core-platform/nosql-collection.html' | relative_url }}) | `urn:robos:shape:NoSQLCollectionShape` | `dcterms:title`, `robos:collectionName`, `robos:database` |
| [Message Topic (`robos:MessageTopic`)]({{ '/schemas/core-platform/message-topic.html' | relative_url }}) | `urn:robos:shape:MessageTopicShape` | `dcterms:title`, `robos:topicName`, `robos:broker` |
| [Consumer Group (`robos:ConsumerGroup`)]({{ '/schemas/core-platform/consumer-group.html' | relative_url }}) | `urn:robos:shape:ConsumerGroupShape` | `dcterms:title`, `robos:groupId`, `robos:topic` |
| [MCP Tool (`robos:MCPTool`)]({{ '/schemas/core-platform/mcp-tool.html' | relative_url }}) | `urn:robos:shape:MCPToolShape` | `dcterms:title`, `robos:toolName`, `robos:mcpServer` |
| [MCP Resource (`robos:MCPResource`)]({{ '/schemas/core-platform/mcp-resource.html' | relative_url }}) | `urn:robos:shape:MCPResourceShape` | `dcterms:title`, `robos:mcpServer` |
| [MCP Prompt (`robos:MCPPrompt`)]({{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}) | `urn:robos:shape:MCPPromptShape` | `dcterms:title`, `robos:promptName`, `robos:mcpServer` |
| [Curriculum Definition (`robos:CurriculumDefinition`)]({{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}) | `robos:CurriculumDefinitionShape` | `dcterms:title`, `robos:sourcePath`, `robos:evidence` |
| [Data Store (`robos:DataStore`)]({{ '/schemas/core-platform/data-store.html' | relative_url }}) | `robos:DataStoreShape` | `dcterms:title`, `robos:engine`, `robos:evidence` |
| [Broker Definition (`robos:BrokerDefinition`)]({{ '/schemas/core-platform/broker-definition.html' | relative_url }}) | `robos:BrokerDefinitionShape` | `dcterms:title`, `robos:brokerType`, `robos:evidence` |
| [Source Artifact (`robos:SourceArtifact`)]({{ '/schemas/core-platform/source-artifact.html' | relative_url }}) | `robos:SourceArtifactShape` | `dcterms:title`, `robos:sourcePath`, `robos:sourceKind`, `robos:inRepository`, `robos:evidence` |
