---
title: Milestone
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 12
permalink: /schemas/organization/milestone.html
---

# robos:Milestone
{: .no_toc }

Validation shape for `robos:Milestone` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Milestone` |
| Shape id | `urn:robos:shape:MilestoneShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Milestone must have a title. |
| `robos:targetDate` | `1..*` | `xsd:date` | Milestone must declare a target delivery date. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:milestone-sample",
  "@type": [
    "robos:Milestone",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Milestone",
  "dcterms:description": "Placeholder node for robos:Milestone.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:targetDate": "2026-11-01",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "https://schema.org/Action",
  "robos:refersFrom": "https://schema.org/Action"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
