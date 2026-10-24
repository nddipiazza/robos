---
title: Pull Request
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 15
permalink: /schemas/organization/pull-request.html
description: "Validation shape for robos:PullRequest nodes in the organization package group."
---

# robos:PullRequest
{: .no_toc }

Validation shape for `robos:PullRequest` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:PullRequest` |
| Also matches | `robos:MergeRequest` |
| Shape id | `urn:robos:shape:PullRequestShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Source control & artifacts |
| Schema.org type | [`schema:UpdateAction`](https://schema.org/UpdateAction) |
| Domain standard | [OSLC CM](http://open-services.net/ns/cm#ChangeRequest) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Pull Request must have a title. |
| `robos:prNumber` | `1..*` | `xsd:integer` | Pull Request must specify PR number. |
| `robos:sourceBranch` | `1..*` | `xsd:string` | Pull Request must declare source branch. |
| `robos:targetBranch` | `1..*` | `xsd:string` | Pull Request must declare target branch. |
| `robos:status` | `1..*` | `xsd:string` | Pull Request must declare status (open, merged, closed). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:pull-request-sample",
  "@type": [
    "robos:PullRequest",
    "robos:MergeRequest",
    "schema:UpdateAction",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Pull Request",
  "dcterms:description": "Placeholder node for robos:PullRequest.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:prNumber": 142,
  "robos:sourceBranch": "feat/new-feature",
  "robos:targetBranch": "main",
  "robos:status": "active",
  "robos:schemaOrgType": "https://schema.org/UpdateAction",
  "robos:domainStandard": "http://open-services.net/ns/cm#ChangeRequest",
  "robos:refersFrom": "http://open-services.net/ns/cm#ChangeRequest"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
