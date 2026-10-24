---
title: Search Index
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/core-platform/search-index.html
description: "Validation shape for robos:SearchIndex nodes in the core-platform package group."
---

# robos:SearchIndex
{: .no_toc }

Validation shape for `robos:SearchIndex` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:SearchIndex` |
| Shape id | `urn:robos:shape:SearchIndexShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:DataStore`](https://schema.org/DataStore) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Search Index must have a title or display name. |
| `robos:engine` | `1..*` | - | Search Index must declare its engine (luxir, solr, elasticsearch, opensearch). |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:search:solr-enterprise-index",
  "@type": [
    "oslc_am:Resource",
    "robos:SearchIndex",
    "schema:DataStore"
  ],
  "dcterms:title": "Apache Solr Enterprise Search Index",
  "dcterms:description": "Production-grade Apache Solr search collection for faceted enterprise documentation and architectural index search.",
  "robos:engine": "solr",
  "robos:indexName": "enterprise_catalog",
  "robos:productionReady": true,
  "robos:status": "active",
  "robos:readiness": "production-ready",
  "robos:host": "solr.internal.acme.corp",
  "robos:port": 8983,
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:technology": "https://robos.dev/ns/technology#solr",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://schema.org/DataStore"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
