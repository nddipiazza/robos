---
title: Discussion Thread
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 19
permalink: /schemas/organization/discussion-thread.html
---

# robos:DiscussionThread
{: .no_toc }

Validation shape for `robos:DiscussionThread` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DiscussionThread` |
| Also matches | `robos:Conversation` |
| Shape id | `urn:robos:shape:DiscussionThreadShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Conversation`](https://schema.org/Conversation) |
| Domain standard | [OSLC CORE](http://open-services.net/ns/core#Discussion) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Discussion thread must have a title or topic. |
| `robos:associatedWorkItem` | `1..*` | `URI (robos:Project \| robos:Feature \| robos:Task \| robos:PullRequest)` | Discussion thread must associate with a work item or pull request. |
| `robos:threadType` | `1..*` | `xsd:string` | Discussion thread must declare thread type. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:discussion-thread-sample",
  "@type": [
    "robos:DiscussionThread",
    "robos:Conversation",
    "schema:Conversation",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Discussion Thread",
  "dcterms:description": "Placeholder node for robos:DiscussionThread.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:associatedWorkItem": "<associatedWorkItem>",
  "robos:threadType": "<threadType>",
  "robos:schemaOrgType": "https://schema.org/Conversation",
  "robos:domainStandard": "http://open-services.net/ns/core#Discussion",
  "robos:refersFrom": "https://schema.org/Conversation"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
