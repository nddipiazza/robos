---
title: Environment Profile
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 14
permalink: /schemas/devops/environment-profile.html
---

# robos:EnvironmentProfile
{: .no_toc }

Validation shape for `robos:EnvironmentProfile` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:EnvironmentProfile` |
| Shape id | `robos:EnvironmentProfileShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:DefinedTerm`](https://schema.org/DefinedTerm) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Environment profile needs a title. |
| `robos:evidence` | `1..*` | - | Environment profile needs source evidence. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:environment-profile-sample",
  "@type": [
    "robos:EnvironmentProfile",
    "schema:DefinedTerm",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Environment Profile",
  "dcterms:description": "Placeholder node for robos:EnvironmentProfile.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:evidence": "<evidence>",
  "robos:schemaOrgType": "https://schema.org/DefinedTerm",
  "robos:domainStandard": "https://schema.org/DefinedTerm",
  "robos:refersFrom": "https://schema.org/DefinedTerm"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
