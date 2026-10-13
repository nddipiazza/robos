---
title: Data Model
layout: default
parent: "Services & Contracts"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/services/data-model.html
---

# robos:DataModel
{: .no_toc }

Validation shape for `robos:DataModel` nodes in the `services` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DataModel` |
| Also matches | `robos:SchemaModel`, `robos:DomainEntity` |
| Shape id | `urn:robos:shape:DataModelShape` |
| Package | [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Contracts & data models |
| Schema.org type | [`schema:Class`](https://schema.org/Class) |
| Domain standard | [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Data Model must have a title. |
| `robos:modelName` | `1..*` | `xsd:string` | Data Model must specify entity/model name. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:services:data-model-sample",
  "@type": [
    "robos:DataModel",
    "robos:SchemaModel",
    "robos:DomainEntity",
    "schema:Class",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Data Model",
  "dcterms:description": "Placeholder node for robos:DataModel.",
  "robos:package": "services",
  "robos:namespace": "robos.services",
  "robos:modelName": "SampleModel",
  "robos:schemaOrgType": "https://schema.org/Class",
  "robos:domainStandard": "https://spec.openapis.org/oas/v3.1.0",
  "robos:refersFrom": "https://schema.org/Class"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
