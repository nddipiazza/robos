---
title: Documentation Page
layout: default
parent: "Documentation & Diagrams"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/documentation/documentation-page.html
---

# robos:DocumentationPage
{: .no_toc }

Validation shape for `robos:DocumentationPage` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DocumentationPage` |
| Also matches | `robos:DocArticle` |
| Shape id | `urn:robos:shape:DocumentationPageShape` |
| Package | [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:TechArticle`](https://schema.org/TechArticle) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Documentation Page must have a title. |
| `robos:slug` | `1..*` | `xsd:string` | Documentation Page must declare a URL slug. |
| `robos:docPath` | `1..*` | `xsd:string` | Documentation Page must specify a relative markdown document path. |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:doc:acme-architecture-overview",
  "@type": [
    "robos:DocumentationPage",
    "oslc:Resource"
  ],
  "dcterms:title": "Acme Platform Architecture Overview",
  "dcterms:description": "Enterprise cloud platform architecture spanning payments, identity, checkout, and GitOps deployments.",
  "robos:slug": "acme-architecture-overview",
  "robos:docPath": "docs/architecture/overview.md",
  "robos:category": "architecture",
  "robos:sourceUrl": "https://confluence.acme.corp/display/ARCH#page-101",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/TechArticle",
  "robos:domainStandard": "https://schema.org/TechArticle"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
