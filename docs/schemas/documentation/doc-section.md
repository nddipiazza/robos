---
title: Doc Section
layout: default
parent: "Documentation & Diagrams"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/documentation/doc-section.html
---

# robos:DocSection
{: .no_toc }

Validation shape for `robos:DocSection` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DocSection` |
| Shape id | `urn:robos:shape:DocSectionShape` |
| Package | [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:Article`](https://schema.org/Article) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Documentation Section must have a title. |
| `robos:sectionId` | `1..*` | `xsd:string` | Documentation Section must specify section identifier or anchor. |
| `robos:docPage` | `1..*` | `URI (robos:DocumentationPage)` | Documentation Section must link to parent documentation page. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:documentation:doc-section-sample",
  "@type": [
    "robos:DocSection",
    "schema:Article",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Doc Section",
  "dcterms:description": "Placeholder node for robos:DocSection.",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:sectionId": "overview",
  "robos:docPage": "urn:robos:doc:architecture-overview",
  "robos:schemaOrgType": "https://schema.org/Article",
  "robos:domainStandard": "https://schema.org/Article",
  "robos:refersFrom": "https://schema.org/Article"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
