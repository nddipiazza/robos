---
title: Project
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/organization/project.html
---

# robos:Project
{: .no_toc }

Validation shape for `robos:Project` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:Project` |
| Shape id | `urn:robos:shape:ProjectShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Project`](https://schema.org/Project) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Project must have a title / name. |
| `robos:status` | `1..*` | `xsd:string` | Project must declare a lifecycle status. |

## Example node

This node comes from `.robos/kgraphs/organization/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:project:robos-kgraph-parse-portal",
  "@type": [
    "robos:Project",
    "schema:Project"
  ],
  "dcterms:title": "RobOS Kgraph Parse Portal",
  "dcterms:description": "Heavy-scale connectors webapp & headless parsing portal fronting Luxir search index, Hermetiq Buildbarn Helm charts (RBE), and Apache Tika 4.0 streaming tika-grpc.",
  "robos:status": "active",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:schemaOrgType": "https://schema.org/Project",
  "robos:domainStandard": "https://schema.org/Project",
  "robos:refersFrom": "https://schema.org/Project",
  "robos:repository": "github.com/nddipiazza/robos",
  "robos:ownerTeam": "urn:robos:team:core-platform",
  "robos:hasApplication": [
    "urn:robos:app:kgraph-parse-portal"
  ]
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
