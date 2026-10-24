---
title: Team
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/organization/team.html
description: "Validation shape for robos:Team nodes in the organization package group."
---

# robos:Team
{: .no_toc }

Validation shape for `robos:Team` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Team` |
| Shape id | `urn:robos:shape:TeamShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Organization & people |
| Schema.org type | [`schema:ProjectTeam`](https://schema.org/ProjectTeam) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Team must have a display name. |

## Example node

This node comes from `.robos/kgraphs/organization/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:team:core-platform",
  "@type": [
    "robos:Team",
    "schema:ProjectTeam"
  ],
  "dcterms:title": "Core Platform & Infrastructure",
  "robos:topology": "platform",
  "robos:lead": "urn:robos:person:sconnor",
  "robos:hasMember": [
    "urn:robos:person:sconnor",
    "urn:robos:person:marcus-wright"
  ],
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:schemaOrgType": "https://schema.org/ProjectTeam",
  "robos:domainStandard": "https://schema.org/ProjectTeam"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
