---
title: Prompt Strategy
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 9
permalink: /schemas/core-platform/prompt-strategy.html
description: "Validation shape for robos:PromptStrategy nodes in the core-platform package group."
---

# robos:PromptStrategy
{: .no_toc }

Validation shape for `robos:PromptStrategy` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:PromptStrategy` |
| Also matches | `robos:PromptOptimizer`, `robos:PromptCompiler`, `robos:AIPromptTechnique` |
| Shape id | `urn:robos:shape:PromptStrategyShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:Intangible`](https://schema.org/Intangible) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Prompt Strategy must have a title or display name. |
| `robos:strategyType` | `1..*` | - | Prompt Strategy must declare strategy type (compression, teleprompter-optimization, few-shot-compilation). |
| `robos:engine` | `1..*` | - | Prompt Strategy must declare optimization engine (caveman, dspy, standard). |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:agent:strategy:caveman-compression",
  "@type": [
    "oslc_am:Resource",
    "robos:PromptStrategy",
    "robos:AIPromptTechnique",
    "schema:Intangible"
  ],
  "dcterms:title": "Caveman Algorithmic Prompt Compression",
  "dcterms:description": "Heuristic token pruning removing conversational boilerplate and filler tokens to achieve 40-60% prompt compaction on high-frequency Tier 1 & Tier 2 tasks.",
  "robos:strategyType": "compression",
  "robos:engine": "caveman",
  "robos:targetTiers": [
    "tier1",
    "tier2"
  ],
  "robos:mode": "standard",
  "robos:enabled": true,
  "robos:parameters": {
    "stripFillers": true,
    "terseDirectives": true,
    "preserveCodeBlocks": true,
    "preservePaths": true
  },
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:schemaOrgType": "https://schema.org/Intangible",
  "robos:domainStandard": "https://schema.org/Intangible"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
