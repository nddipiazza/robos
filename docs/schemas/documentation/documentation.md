---
title: Documentation
layout: default
parent: "Documentation & Diagrams (robos.docs)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/documentation/documentation.html
description: "Validation shape for robos:Documentation nodes in the documentation package group."
---

# robos:Documentation
{: .no_toc }

Validation shape for `robos:Documentation` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Documentation` |
| Also matches | `robos:SystemDocumentation` |
| Shape id | `urn:robos:shape:DocumentationShape` |
| Package | [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:TechArticle`](https://schema.org/TechArticle) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Documentation must have a title. |
| `robos:targetEntity` | `1..*` | - | Documentation must specify the documented target entity identifier or URI. |
| `robos:docPath` | `1..*` | `xsd:string` | Documentation must specify its markdown artifact path. |
| `robos:gitopsFile` | `1..*` | `xsd:string` | Documentation must declare its GitOps file location (.robos/documentation.yaml). |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:documentation:robos-documentation",
  "@type": [
    "oslc_am:Resource",
    "robos:Documentation",
    "schema:TechArticle"
  ],
  "dcterms:description": "Living architecture specification for the RobOS Documentation application and GitOps catalog synchronization.",
  "dcterms:title": "RobOS Documentation Hub Architecture",
  "robos:category": "Applications",
  "robos:docPath": "docs/_apps/robos-documentation.md",
  "robos:domainStandard": "https://schema.org/TechArticle",
  "robos:gitopsFile": ".robos/documentation.yaml",
  "robos:lastUpdated": "2026-09-25T12:00:00.000Z",
  "robos:namespace": "robos.docs",
  "robos:package": "documentation",
  "robos:schemaOrgType": "https://schema.org/TechArticle",
  "robos:targetEntity": "urn:robos:app:robos-documentation"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
