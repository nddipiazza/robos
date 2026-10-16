---
title: Search Cluster
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/core-platform/search-cluster.html
---

# robos:SearchCluster
{: .no_toc }

Validation shape for `robos:SearchCluster` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:SearchCluster` |
| Shape id | `urn:robos:shape:SearchClusterShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:DataStore`](https://schema.org/DataStore) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Search Cluster must have a title or display name. |
| `robos:engine` | `1..*` | - | Search Cluster must declare its engine (luxir, solr, elasticsearch, opensearch). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:core-platform:search-cluster-sample",
  "@type": [
    "robos:SearchCluster",
    "schema:DataStore",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Search Cluster",
  "dcterms:description": "Placeholder node for robos:SearchCluster.",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:engine": "<engine>",
  "robos:schemaOrgType": "https://schema.org/DataStore",
  "robos:domainStandard": "https://schema.org/DataStore",
  "robos:refersFrom": "https://schema.org/DataStore"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
