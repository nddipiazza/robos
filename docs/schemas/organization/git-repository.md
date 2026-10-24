---
title: Git Repository
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 13
permalink: /schemas/organization/git-repository.html
description: "Validation shape for robos:GitRepository nodes in the organization package group."
---

# robos:GitRepository
{: .no_toc }

Validation shape for `robos:GitRepository` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:GitRepository` |
| Also matches | `robos:Repository` |
| Shape id | `urn:robos:shape:GitRepositoryShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Source control & artifacts |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Git Repository must have a title. |
| `robos:url` | `1..*` | `xsd:anyURI` | Git Repository must specify a repository URL. |
| `robos:defaultBranch` | `1..*` | `xsd:string` | Git Repository must declare its default branch. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:git-repository-sample",
  "@type": [
    "robos:GitRepository",
    "robos:Repository",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Repository",
  "dcterms:description": "Placeholder node for robos:GitRepository.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:url": "https://github.com/acme",
  "robos:defaultBranch": "main",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://schema.org/SoftwareSourceCode",
  "robos:refersFrom": "https://schema.org/SoftwareSourceCode"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
