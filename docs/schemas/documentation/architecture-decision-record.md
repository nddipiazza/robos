---
title: Architecture Decision Record
layout: default
parent: "Documentation & Diagrams (robos.docs)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/documentation/architecture-decision-record.html
description: "Validation shape for robos:ArchitectureDecisionRecord nodes in the documentation package group."
---

# robos:ArchitectureDecisionRecord
{: .no_toc }

Validation shape for `robos:ArchitectureDecisionRecord` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:ArchitectureDecisionRecord` |
| Also matches | `robos:ADR` |
| Shape id | `urn:robos:shape:ArchitectureDecisionRecordShape` |
| Package | [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:TechArticle`](https://schema.org/TechArticle) |
| Domain standard | [adr.github.io](https://adr.github.io/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Architecture Decision Record must have a title. |
| `robos:status` | `1..*` | `xsd:string` | Architecture Decision Record must declare status (proposed, accepted, superseded, etc.). |
| `robos:context` | `1..*` | `xsd:string` | Architecture Decision Record must provide architectural context and problem statement. |
| `robos:decision` | `1..*` | `xsd:string` | Architecture Decision Record must state the architectural decision. |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:adr:001-modular-kgraph",
  "@type": [
    "oslc_am:Resource",
    "robos:ArchitectureDecisionRecord",
    "robos:ADR",
    "schema:TechArticle"
  ],
  "dcterms:title": "ADR-001: Modular Namespaced Knowledge Graph Architecture",
  "robos:adrNumber": "ADR-001",
  "robos:status": "accepted",
  "robos:context": "Monolithic JSON-LD knowledge graph files cause merge conflicts in multi-repo and multi-team environments.",
  "robos:decision": "Adopt modular, namespaced package stores (.robos/kgraphs/<pkg>/package.jsonld) with git-tag versioning and aggregated backward compatibility.",
  "robos:consequences": "Eliminates team collisions, isolates domains, and allows fine-grained GitOps diffing.",
  "robos:date": "2026-03-15",
  "robos:hasFlowDiagram": "urn:robos:diagram:order-lifecycle-flow",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/TechArticle",
  "robos:domainStandard": "https://adr.github.io/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
