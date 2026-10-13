---
title: Requirement
layout: default
parent: "Services & Contracts"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/services/requirement.html
---

# oslc_rm:Requirement
{: .no_toc }

Validation shape for `oslc_rm:Requirement` nodes in the `services` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `oslc_rm:Requirement` |
| Shape id | `urn:robos:shape:RequirementShape` |
| Package | [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) (`services`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| Domain standard | [OSLC RM](http://open-services.net/ns/rm#Requirement) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Requirement must have a title. |
| `robos:featureFile` | `1..*` | `xsd:string` | Requirement must link to a Gherkin .feature file. |

## Example node

This node comes from `.robos/kgraphs/crpg/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:crpg:feature:character-creation",
  "@type": [
    "robos:GherkinFeature",
    "robos:BDDFeature",
    "oslc_rm:Requirement",
    "schema:DigitalDocument"
  ],
  "dcterms:title": "Character Creation and Class Archetype Selection",
  "dcterms:description": "Player selects hero class and name to awaken with proper D&D 5e starting stats.",
  "robos:featureFile": "games/crpg-realm/tests/e2e/features/01_character_creation.feature",
  "robos:testsGame": "urn:robos:crpg:game:realm-of-heroes",
  "robos:hasScenario": [
    "urn:robos:crpg:scenario:create-fighter-vance"
  ],
  "robos:package": "crpg",
  "robos:namespace": "robos.crpg"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
