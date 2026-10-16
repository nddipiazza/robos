---
title: Review Comment
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 20
permalink: /schemas/organization/review-comment.html
---

# robos:ReviewComment
{: .no_toc }

Validation shape for `robos:ReviewComment` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:ReviewComment` |
| Also matches | `robos:CodeReviewComment` |
| Shape id | `urn:robos:shape:ReviewCommentShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Comment`](https://schema.org/Comment) |
| Domain standard | [OSLC CORE](http://open-services.net/ns/core#Comment) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:content` | `1..*` | - | Review comment must have content. |
| `robos:pullRequest` | `1..*` | `URI (robos:PullRequest)` | Review comment must link to parent pull request. |
| `robos:filePath` | `1..*` | `xsd:string` | Review comment must specify code file path. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:review-comment-sample",
  "@type": [
    "robos:ReviewComment",
    "robos:CodeReviewComment",
    "schema:Comment",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Review Comment",
  "dcterms:description": "Placeholder node for robos:ReviewComment.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:content": "sample docstring content",
  "robos:pullRequest": "<pullRequest>",
  "robos:filePath": "<filePath>",
  "robos:schemaOrgType": "https://schema.org/Comment",
  "robos:domainStandard": "http://open-services.net/ns/core#Comment",
  "robos:refersFrom": "https://schema.org/Comment"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
