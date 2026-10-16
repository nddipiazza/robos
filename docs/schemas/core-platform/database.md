---
title: Database
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/core-platform/database.html
---

# robos:Database
{: .no_toc }

Validation shape for `robos:Database` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Database` |
| Also matches | `robos:RelationalDatabase` |
| Shape id | `urn:robos:shape:DatabaseShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Data stores & messaging |
| Schema.org type | [`schema:DataStore`](https://schema.org/DataStore) |
| Domain standard | [www.iso.org](https://www.iso.org/standard/63555.html) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Database must have a title or display name. |
| `robos:engine` | `1..*` | - | Database must declare its engine (postgresql, mysql, sqlite, oracle, etc.). |
| `robos:databaseName` | `1..*` | - | Database must specify a logical database name. |
| `robos:host` | `1..*` | `xsd:string` | Database must specify a host address or service DNS. |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:db:db-9wv0p",
  "@type": [
    "oslc_am:Resource",
    "robos:Database",
    "robos:RelationalDatabase"
  ],
  "dcterms:title": "DB Database (acme_db)",
  "dcterms:description": "Imported undefined database connection postgresql://admin:secret@db.internal:5432/acme_db",
  "robos:databaseName": "acme_db",
  "robos:engine": "postgresql",
  "robos:host": "db.internal",
  "robos:port": 5432,
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
