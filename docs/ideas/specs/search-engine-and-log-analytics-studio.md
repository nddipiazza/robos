---
title: "Proposal: Search Studio"
layout: default
nav_exclude: true
---

# Proposal: Search Studio
{: .no_toc }

A desktop app for working with search engines, log indexes and vector stores, next to the existing database managers.
{: .fs-6 }

{: .important }
Proposal, not built. There is no `packages/search-studio` in the repository.

## Proposal

- A new app, `packages/search-studio`, that connects to OpenSearch, Elasticsearch, Solr and vector stores (the spec names Qdrant, Milvus and pgvector).
- Cluster health, index mappings and shard allocation.
- A query editor for the Query DSL or Lucene syntax, with timing for each run.
- A live log tail with level and trace ID filters.
- A vector playground that shows similarity scores next to full-text results.
- Two new knowledge graph types, `robos:LogAnalyticsSink` and `robos:VectorStore`, and edges such as `robos:streamsLogsTo`, `robos:queriesIndex` and `robos:indexesDocument` from a service to its index or sink, validated by SHACL shapes.
- A "Discover from Cluster" action that reads a live cluster and writes the matching graph nodes.

![Search Studio app with a cluster navigator, index matrix, query console and log streamer, backed by graph packages and the password store, over OpenSearch, Elastic, Solr and vector databases]({{ '/assets/images/search-studio-architecture.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The text on this page says what is built today.*

## What exists today

- [DB Manager]({{ '/apps/db-manager/' | relative_url }}) (relational) and [NoSQL DB Manager]({{ '/apps/nosql-manager/' | relative_url }}) (MongoDB and Redis) cover other data stores.
- [Search Indexer]({{ '/apps/search-index/' | relative_url }}) (`packages/search-index`) indexes files and symbols for @-mentions. It is unrelated to search clusters.
- The knowledge graph already defines `robos:SearchCluster` and `robos:SearchIndex` with SHACL shapes (`packages/robos-graph/lib/shacl-validator.js`, `.robos/ontology.jsonld`). The cluster shape requires an engine: `luxir`, `solr`, `elasticsearch` or `opensearch`.
- `robos:LogAnalyticsSink`, `robos:VectorStore` and the three edges above are not defined anywhere in `packages` or `.robos`.

## Source

Raw note: [`ideas/inbox/search-engine-and-log-analytics-studio.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/search-engine-and-log-analytics-studio.txt). The earlier long spec is in the git history of this file.
