---
title: User Story
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/organization/user-story.html
---

# robos:UserStory
{: .no_toc }

Validation shape for `robos:UserStory` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:UserStory` |
| Also matches | `robos:Story` |
| Shape id | `urn:robos:shape:UserStoryShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:Action`](https://schema.org/Action) |
| Domain standard | [OSLC CM](http://open-services.net/ns/cm#ChangeRequest) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | User Story must have a title. |
| `robos:status` | `1..*` | `xsd:string` | User Story must have a status. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:user-story-sample",
  "@type": [
    "robos:UserStory",
    "robos:Story",
    "schema:Action",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample User Story",
  "dcterms:description": "Placeholder node for robos:UserStory.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:status": "active",
  "robos:schemaOrgType": "https://schema.org/Action",
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
