---
title: Core Platform
layout: default
parent: Schemas
nav_order: 1
has_children: true
permalink: /schemas/core-platform.html
---

# Core Platform (robos.platform)
{: .no_toc }

Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `core-platform` |
| Namespace | `robos.platform` |
| Package file | `.robos/kgraphs/core-platform/package.jsonld` |
| Classes documented | 23 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Build System]({{ '/schemas/core-platform/build-system.html' | relative_url }}) | `robos:BuildSystem` | `dcterms:title`, `robos:buildTool`, `robos:configFile` |
| [Database]({{ '/schemas/core-platform/database.html' | relative_url }}) | `robos:Database` | `dcterms:title`, `robos:engine`, `robos:databaseName`, `robos:host` |
| [NoSQL Database]({{ '/schemas/core-platform/nosql-database.html' | relative_url }}) | `robos:NoSQLDatabase` | `dcterms:title`, `robos:engine`, `robos:host` |
| [Search Index]({{ '/schemas/core-platform/search-index.html' | relative_url }}) | `robos:SearchIndex` | `dcterms:title`, `robos:engine` |
| [Search Cluster]({{ '/schemas/core-platform/search-cluster.html' | relative_url }}) | `robos:SearchCluster` | `dcterms:title`, `robos:engine` |
| [Message Broker]({{ '/schemas/core-platform/message-broker.html' | relative_url }}) | `robos:MessageBroker` | `dcterms:title`, `robos:brokerType`, `robos:endpoint` |
| [MCP Server]({{ '/schemas/core-platform/mcp-server.html' | relative_url }}) | `robos:MCPServer` | `dcterms:title`, `robos:transport` |
| [Context Source]({{ '/schemas/core-platform/context-source.html' | relative_url }}) | `robos:ContextSource` | `dcterms:title`, `robos:sourceType`, `robos:location` |
| [Prompt Strategy]({{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}) | `robos:PromptStrategy` | `dcterms:title`, `robos:strategyType`, `robos:engine` |
| [Database Schema]({{ '/schemas/core-platform/database-schema.html' | relative_url }}) | `robos:DatabaseSchema` | `dcterms:title`, `robos:schemaName`, `robos:database` |
| [Database Table]({{ '/schemas/core-platform/database-table.html' | relative_url }}) | `robos:DatabaseTable` | `dcterms:title`, `robos:tableName`, `robos:database` |
| [Database Column]({{ '/schemas/core-platform/database-column.html' | relative_url }}) | `robos:DatabaseColumn` | `dcterms:title`, `robos:columnName`, `robos:dataType`, `robos:table` |
| [Database Index]({{ '/schemas/core-platform/database-index.html' | relative_url }}) | `robos:DatabaseIndex` | `dcterms:title`, `robos:indexName`, `robos:table` |
| [NoSQL Collection]({{ '/schemas/core-platform/nosql-collection.html' | relative_url }}) | `robos:NoSQLCollection` | `dcterms:title`, `robos:collectionName`, `robos:database` |
| [Message Topic]({{ '/schemas/core-platform/message-topic.html' | relative_url }}) | `robos:MessageTopic` | `dcterms:title`, `robos:topicName`, `robos:broker` |
| [Consumer Group]({{ '/schemas/core-platform/consumer-group.html' | relative_url }}) | `robos:ConsumerGroup` | `dcterms:title`, `robos:groupId`, `robos:topic` |
| [MCP Tool]({{ '/schemas/core-platform/mcp-tool.html' | relative_url }}) | `robos:MCPTool` | `dcterms:title`, `robos:toolName`, `robos:mcpServer` |
| [MCP Resource]({{ '/schemas/core-platform/mcp-resource.html' | relative_url }}) | `robos:MCPResource` | `dcterms:title`, `robos:mcpServer` |
| [MCP Prompt]({{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}) | `robos:MCPPrompt` | `dcterms:title`, `robos:promptName`, `robos:mcpServer` |
| [Curriculum Definition]({{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}) | `robos:CurriculumDefinition` | `dcterms:title`, `robos:sourcePath`, `robos:evidence` |
| [Data Store]({{ '/schemas/core-platform/data-store.html' | relative_url }}) | `robos:DataStore` | `dcterms:title`, `robos:engine`, `robos:evidence` |
| [Broker Definition]({{ '/schemas/core-platform/broker-definition.html' | relative_url }}) | `robos:BrokerDefinition` | `dcterms:title`, `robos:brokerType`, `robos:evidence` |
| [Source Artifact]({{ '/schemas/core-platform/source-artifact.html' | relative_url }}) | `robos:SourceArtifact` | `dcterms:title`, `robos:sourcePath`, `robos:sourceKind`, `robos:inRepository`, `robos:evidence` |
