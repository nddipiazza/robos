---
title: Comment
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 18
permalink: /schemas/organization/comment.html
description: "Validation shape for robos:Comment nodes in the organization package group."
---

# robos:Comment
{: .no_toc }

Validation shape for `robos:Comment` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Comment` |
| Also matches | `robos:WorkItemComment`, `robos:DiscussionComment` |
| Shape id | `urn:robos:shape:CommentShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Comment`](https://schema.org/Comment) |
| Domain standard | [OSLC CORE](http://open-services.net/ns/core#Comment) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:content` | `1..*` | - | Comment must have content. |
| `robos:author` | `1..*` | - | Comment must specify an author. |
| `robos:createdAt` | `1..*` | `xsd:dateTime` | Comment must specify creation timestamp. |
| `robos:parentItem` | `1..*` | `URI (robos:DiscussionThread \| robos:Task \| robos:PullRequest \| robos:Comment)` | Comment must link to parent work item, pull request, or thread. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:comment-sample",
  "@type": [
    "robos:Comment",
    "robos:WorkItemComment",
    "robos:DiscussionComment",
    "schema:Comment",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Comment",
  "dcterms:description": "Placeholder node for robos:Comment.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:content": "sample docstring content",
  "robos:author": "<author>",
  "robos:createdAt": "<createdAt>",
  "robos:parentItem": "<parentItem>",
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
