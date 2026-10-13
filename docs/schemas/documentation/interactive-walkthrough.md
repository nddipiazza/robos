---
title: Interactive Walkthrough
layout: default
parent: "Documentation & Diagrams (robos.docs)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/documentation/interactive-walkthrough.html
---

# robos:InteractiveWalkthrough
{: .no_toc }

Validation shape for `robos:InteractiveWalkthrough` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:InteractiveWalkthrough` |
| Shape id | `urn:robos:shape:InteractiveWalkthroughShape` |
| Package | [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:Guide`](https://schema.org/Guide) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Interactive Walkthrough must have a title. |
| `robos:slug` | `1..*` | `xsd:string` | Interactive Walkthrough must declare a unique slug. |
| `robos:targetApp` | `1..*` | `xsd:string` | Interactive Walkthrough must link to a target RobOS application or component. |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:walkthrough:remote-execution",
  "@type": [
    "oslc_am:Resource",
    "robos:InteractiveWalkthrough",
    "schema:Guide"
  ],
  "dcterms:title": "Remote Execution Studio Interactive Guided Tour",
  "robos:slug": "remote-execution-studio-tour",
  "dcterms:description": "Guided developer walkthrough on inspecting REAPI distributed build clusters, Bazel configurations, and cache metrics.",
  "robos:targetApp": "remote-execution-studio",
  "robos:walkthroughPath": "docs/big-wins/remote-execution-studio.md",
  "robos:videoPath": "assets/videos/walkthroughs/re-studio-demo.mp4",
  "robos:stepsCount": 7,
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/Guide",
  "robos:domainStandard": "https://schema.org/Guide",
  "robos:tooltip": "Interactive Guided Tour for Remote Execution Studio"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
