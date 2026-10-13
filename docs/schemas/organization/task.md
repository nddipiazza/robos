---
title: Task
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/organization/task.html
---

# robos:Task
{: .no_toc }

Validation shape for `robos:Task` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:Task` |
| Also matches | `oslc_cm:ChangeRequest`, `robos:WorkItem` |
| Shape id | `urn:robos:shape:TaskShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [OSLC CM](http://open-services.net/ns/cm#ChangeRequest) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Task must have a title. |
| `robos:status` | `1..*` | `xsd:string` | Task must declare a lifecycle status. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:task-sample",
  "@type": [
    "robos:Task",
    "oslc_cm:ChangeRequest",
    "robos:WorkItem",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Task",
  "dcterms:description": "Placeholder node for robos:Task.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:status": "active",
  "robos:schemaOrgType": "https://schema.org/Action",
  "robos:domainStandard": "http://open-services.net/ns/cm#ChangeRequest",
  "robos:refersFrom": "http://open-services.net/ns/cm#ChangeRequest"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
