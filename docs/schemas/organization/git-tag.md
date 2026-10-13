---
title: Git Tag
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 17
permalink: /schemas/organization/git-tag.html
---

# robos:GitTag
{: .no_toc }

Validation shape for `robos:GitTag` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GitTag` |
| Shape id | `urn:robos:shape:GitTagShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Source control & artifacts |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Git Tag must have a title. |
| `robos:tagName` | `1..*` | `xsd:string` | Git Tag must specify tag name. |
| `robos:commitSha` | `1..*` | `xsd:string` | Git Tag must link to target commit SHA. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:git-tag-sample",
  "@type": [
    "robos:GitTag",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Tag",
  "dcterms:description": "Placeholder node for robos:GitTag.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:tagName": "v1.0.0",
  "robos:commitSha": "4a8f9c1b2e3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://schema.org/SoftwareSourceCode",
  "robos:refersFrom": "https://schema.org/SoftwareSourceCode"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
