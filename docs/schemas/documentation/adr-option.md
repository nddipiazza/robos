---
title: ADR Option
layout: default
parent: "Documentation & Diagrams"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/documentation/adr-option.html
---

# robos:ADROption
{: .no_toc }

Validation shape for `robos:ADROption` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:ADROption` |
| Shape id | `urn:robos:shape:ADROptionShape` |
| Package | [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:ChooseAction`](https://schema.org/ChooseAction) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | ADR Option must have a title. |
| `robos:adr` | `1..*` | `URI (robos:ArchitectureDecisionRecord)` | ADR Option must link to parent Architecture Decision Record. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:documentation:adr-option-sample",
  "@type": [
    "robos:ADROption",
    "schema:ChooseAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample ADR Option",
  "dcterms:description": "Placeholder node for robos:ADROption.",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:adr": "urn:robos:adr:001-modular-kgraph",
  "robos:schemaOrgType": "https://schema.org/ChooseAction",
  "robos:domainStandard": "https://schema.org/ChooseAction",
  "robos:refersFrom": "https://schema.org/ChooseAction"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
