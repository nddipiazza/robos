---
title: Bug
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 10
permalink: /schemas/organization/bug.html
---

# robos:Bug
{: .no_toc }

Validation shape for `robos:Bug` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Bug` |
| Also matches | `robos:Defect`, `oslc_cm:Defect` |
| Shape id | `urn:robos:shape:BugShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [OSLC CM](http://open-services.net/ns/cm#ChangeRequest) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Bug must have a title. |
| `robos:severity` | `1..*` | `xsd:string` | Bug must declare severity level. |
| `robos:status` | `1..*` | `xsd:string` | Bug must declare lifecycle status. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:bug-sample",
  "@type": [
    "robos:Bug",
    "robos:Defect",
    "oslc_cm:Defect",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Bug",
  "dcterms:description": "Placeholder node for robos:Bug.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:severity": "major",
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
