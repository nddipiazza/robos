---
title: Web Route
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 8
permalink: /schemas/applications/web-route.html
---

# robos:WebRoute
{: .no_toc }

Validation shape for `robos:WebRoute` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:WebRoute` |
| Shape id | `urn:robos:shape:WebRouteShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:WebPage`](https://schema.org/WebPage) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Web Route must have a title. |
| `robos:routePath` | `1..*` | `xsd:string` | Web Route must specify route path (e.g. /dashboard). |
| `robos:app` | `1..*` | `URI (robos:FrontEndApp \| robos:DesktopApp \| robos:ConsoleApp)` | Web Route must link to parent application. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:web-route-sample",
  "@type": [
    "robos:WebRoute",
    "schema:WebPage",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Web Route",
  "dcterms:description": "Placeholder node for robos:WebRoute.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:routePath": "/dashboard",
  "robos:app": "urn:robos:app:dev-central",
  "robos:schemaOrgType": "https://schema.org/WebPage",
  "robos:domainStandard": "https://schema.org/WebPage",
  "robos:refersFrom": "https://schema.org/WebPage"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
