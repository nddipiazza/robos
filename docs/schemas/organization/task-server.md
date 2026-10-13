---
title: Task Server
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/organization/task-server.html
---

# robos:TaskServer
{: .no_toc }

Validation shape for `robos:TaskServer` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:TaskServer` |
| Shape id | `urn:robos:shape:TaskServerShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Projects & work items |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Task Server must have a title or display name. |
| `robos:serverType` | `1..*` | - | Task Server must declare server type (jira, github). |
| `robos:url` | `1..*` | `xsd:anyURI` | Task Server must specify server URL. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:organization:task-server-sample",
  "@type": [
    "robos:TaskServer",
    "schema:SoftwareApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Task Server",
  "dcterms:description": "Placeholder node for robos:TaskServer.",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:url": "https://github.com/acme",
  "robos:serverType": "<serverType>",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://schema.org/SoftwareApplication",
  "robos:refersFrom": "https://schema.org/SoftwareApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
