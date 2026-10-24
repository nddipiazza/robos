---
title: Environment
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/devops/environment.html
description: "Validation shape for robos:Environment nodes in the devops package group."
---

# robos:Environment
{: .no_toc }

Validation shape for `robos:Environment` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Environment` |
| Also matches | `robos:DeploymentEnvironment` |
| Shape id | `urn:robos:shape:EnvironmentShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:DeploymentEnvironment`](https://schema.org/DeploymentEnvironment) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Environment must have a title. |
| `robos:environmentType` | `1..*` | - | Environment must declare environment type (production, staging, development, test, sandbox). |
| `robos:tier` | `1..*` | - | Environment must declare SLA/criticality tier. |

## Example node

This node comes from `.robos/kgraphs/devops/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:env:production",
  "@type": [
    "oslc_am:Resource",
    "robos:Environment",
    "robos:DeploymentEnvironment",
    "schema:DeploymentEnvironment"
  ],
  "dcterms:title": "Production Environment",
  "dcterms:description": "High-availability production tier serving external customer traffic.",
  "robos:environmentType": "production",
  "robos:tier": "tier-1",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:schemaOrgType": "https://schema.org/DeploymentEnvironment",
  "robos:domainStandard": "https://schema.org/DeploymentEnvironment"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
