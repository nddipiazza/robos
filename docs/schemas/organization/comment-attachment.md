---
title: Comment Attachment
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 21
permalink: /schemas/organization/comment-attachment.html
---

# robos:CommentAttachment
{: .no_toc }

Validation shape for `robos:CommentAttachment` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CommentAttachment` |
| Also matches | `robos:Attachment` |
| Shape id | `urn:robos:shape:CommentAttachmentShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:MediaObject`](https://schema.org/MediaObject) |
| Domain standard | [OSLC CORE](http://open-services.net/ns/core#Attachment) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Comment attachment must have a title or filename. |
| `robos:fileUrl` | `1..*` | `xsd:anyURI` | Comment attachment must specify file URL or path. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:comment-attachment-sample",
  "@type": [
    "robos:CommentAttachment",
    "robos:Attachment",
    "schema:MediaObject",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Comment Attachment",
  "dcterms:description": "Placeholder node for robos:CommentAttachment.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:fileUrl": "<fileUrl>",
  "robos:schemaOrgType": "https://schema.org/MediaObject",
  "robos:domainStandard": "http://open-services.net/ns/core#Attachment",
  "robos:refersFrom": "https://schema.org/MediaObject"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
