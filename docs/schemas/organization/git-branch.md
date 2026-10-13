---
title: Git Branch
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 14
permalink: /schemas/organization/git-branch.html
---

# robos:GitBranch
{: .no_toc }

Validation shape for `robos:GitBranch` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GitBranch` |
| Shape id | `urn:robos:shape:GitBranchShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Source control & artifacts |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Git Branch must have a title or display name. |
| `robos:branchName` | `1..*` | `xsd:string` | Git Branch must specify branch name. |
| `robos:repository` | `1..*` | `xsd:string` | Git Branch must link to parent repository. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:git-branch-sample",
  "@type": [
    "robos:GitBranch",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Git Branch",
  "dcterms:description": "Placeholder node for robos:GitBranch.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:branchName": "feat/new-feature",
  "robos:repository": "github.com/acme/sample-repo",
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
