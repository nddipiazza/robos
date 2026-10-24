---
title: Library
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/applications/library.html
description: "Validation shape for robos:Library nodes in the applications package group."
---

# robos:Library
{: .no_toc }

Validation shape for `robos:Library` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:Library` |
| Shape id | `urn:robos:shape:LibraryShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Libraries & build systems |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Library must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Library must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Library must specify technology stack. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:library-sample",
  "@type": [
    "robos:Library",
    "schema:SoftwareSourceCode",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Library",
  "dcterms:description": "Placeholder node for robos:Library.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:repository": "github.com/acme/sample-repo",
  "robos:technology": "Node.js / TypeScript",
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
