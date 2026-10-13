---
title: Mobile App
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/applications/mobile-app.html
---

# robos:MobileApp
{: .no_toc }

Validation shape for `robos:MobileApp` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:MobileApp` |
| Shape id | `urn:robos:shape:MobileAppShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:MobileApplication`](https://schema.org/MobileApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Mobile App must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Mobile App must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Mobile App must specify technology stack. |
| `robos:platform` | `1..*` | `xsd:string` | Mobile App must specify mobile platform(s). |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:mobile-app-sample",
  "@type": [
    "robos:MobileApp",
    "schema:MobileApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Mobile App",
  "dcterms:description": "Placeholder node for robos:MobileApp.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
  "robos:platform": "iOS / Android",
  "robos:schemaOrgType": "https://schema.org/MobileApplication",
  "robos:domainStandard": "https://schema.org/MobileApplication",
  "robos:refersFrom": "https://schema.org/MobileApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
