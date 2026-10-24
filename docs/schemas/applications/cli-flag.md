---
title: CLI Flag
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 10
permalink: /schemas/applications/cli-flag.html
description: "Validation shape for robos:CLIFlag nodes in the applications package group."
---

# robos:CLIFlag
{: .no_toc }

Validation shape for `robos:CLIFlag` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CLIFlag` |
| Shape id | `urn:robos:shape:CLIFlagShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:PropertyValue`](https://schema.org/PropertyValue) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | CLI Flag must have a title. |
| `robos:flagName` | `1..*` | `xsd:string` | CLI Flag must declare flag name (e.g. --output). |
| `robos:command` | `1..*` | `URI (robos:CLICommand)` | CLI Flag must link to parent CLI command. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:cli-flag-sample",
  "@type": [
    "robos:CLIFlag",
    "schema:PropertyValue",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CLI Flag",
  "dcterms:description": "Placeholder node for robos:CLIFlag.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:flagName": "--output",
  "robos:command": "urn:robos:cli:validate",
  "robos:schemaOrgType": "https://schema.org/PropertyValue",
  "robos:domainStandard": "https://schema.org/PropertyValue",
  "robos:refersFrom": "https://schema.org/PropertyValue"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
