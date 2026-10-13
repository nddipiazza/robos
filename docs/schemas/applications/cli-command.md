---
title: CLI Command
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 9
permalink: /schemas/applications/cli-command.html
---

# robos:CLICommand
{: .no_toc }

Validation shape for `robos:CLICommand` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:CLICommand` |
| Shape id | `urn:robos:shape:CLICommandShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | CLI Command must have a title. |
| `robos:commandName` | `1..*` | `xsd:string` | CLI Command must declare command name. |
| `robos:app` | `1..*` | `URI (robos:FrontEndApp \| robos:DesktopApp \| robos:ConsoleApp)` | CLI Command must link to parent console application. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:applications:cli-command-sample",
  "@type": [
    "robos:CLICommand",
    "schema:SoftwareApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample CLI Command",
  "dcterms:description": "Placeholder node for robos:CLICommand.",
  "robos:package": "applications",
  "robos:namespace": "robos.apps",
  "robos:commandName": "validate",
  "robos:app": "urn:robos:app:dev-central",
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
