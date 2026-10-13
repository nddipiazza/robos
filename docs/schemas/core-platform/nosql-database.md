---
title: NoSQL Database
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 3
permalink: /schemas/core-platform/nosql-database.html
---

# robos:NoSQLDatabase
{: .no_toc }

Validation shape for `robos:NoSQLDatabase` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:NoSQLDatabase` |
| Also matches | `robos:CacheStore`, `robos:DocumentStore`, `robos:KeyValueStore` |
| Shape id | `urn:robos:shape:NoSQLDatabaseShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:DataStore`](https://schema.org/DataStore) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | NoSQL Database must have a title or display name. |
| `robos:engine` | `1..*` | - | NoSQL Database must declare engine (redis, mongodb, cassandra, dynamodb, elasticsearch). |
| `robos:host` | `1..*` | `xsd:string` | NoSQL Database must specify a host address or cluster endpoint. |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:db:acme-session-redis",
  "@type": [
    "oslc_am:Resource",
    "robos:NoSQLDatabase",
    "robos:CacheStore",
    "schema:DataStore"
  ],
  "dcterms:title": "Acme Distributed Session & Cache Store",
  "dcterms:description": "Redis cluster for distributed session state, token revocation, and rate limiting.",
  "robos:engine": "redis",
  "robos:host": "redis-cluster.internal.acme.corp",
  "robos:port": 6379,
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
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
