---
title: Agent Skill
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/learning/agent-skill.html
---

# robos:AgentSkill
{: .no_toc }

Validation shape for `robos:AgentSkill` nodes in the `learning` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:AgentSkill` |
| Shape id | `robos:AgentSkillShape` |
| Package | [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:HowTo`](https://schema.org/HowTo) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Agent skill needs a title. |
| `robos:skillName` | `1..*` | - | Agent skill needs its declared name. |
| `robos:sourcePath` | `1..*` | - | Agent skill needs its instruction file. |
| `robos:inRepository` | `1..*` | - | Agent skill needs its repository reference. |
| `robos:evidence` | `1..*` | - | Agent skill needs source evidence. |

## Example node

This node comes from `.robos/kgraphs/learning/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:source:import-skill",
  "@type": [
    "robos:AgentSkill",
    "schema:HowTo"
  ],
  "dcterms:title": "Evidence-backed graph import skill",
  "robos:package": "learning",
  "robos:sourcePath": "plugins/robos/skills/import-company-kgraph/SKILL.md",
  "robos:sourceKind": "implementation",
  "robos:inRepository": {
    "@id": "urn:robos:source:workspace"
  },
  "robos:evidence": [
    {
      "repository": "robos",
      "path": "plugins/robos/skills/import-company-kgraph/SKILL.md",
      "line": 1
    }
  ],
  "robos:skillName": "import-company-kgraph",
  "robos:uses": {
    "@id": "urn:robos:source:source-extractor"
  },
  "robos:namespace": "robos.learning"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
