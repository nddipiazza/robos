---
title: Console App
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/applications/console-app.html
---

# robos:ConsoleApp
{: .no_toc }

Validation shape for `robos:ConsoleApp` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:ConsoleApp` |
| Shape id | `urn:robos:shape:ConsoleAppShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Console App must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Console App must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Console App must specify technology stack. |
| `robos:cliCommand` | `1..*` | `xsd:string` | Console App must declare executable CLI command name. |

## Example node

This node comes from `.robos/kgraphs/applications/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:console-app:rest-client",
  "@type": [
    "robos:ConsoleApp",
    "oslc_am:Resource",
    "c4:Container"
  ],
  "dcterms:title": "Rest Client CLI",
  "dcterms:description": "Command-line terminal tool providing automated workflows and administration for Rest Client.",
  "robos:repository": "github.com/acme/rest-client",
  "robos:technology": "Node.js 20 / TypeScript",
  "robos:cliCommand": "rest-client",
  "robos:subcommands": [
    {
      "name": "init",
      "description": "Initialize local workspace and credentials"
    },
    {
      "name": "deploy",
      "description": "Deploy artifacts to targeted cluster or environment"
    },
    {
      "name": "status",
      "description": "Inspect health and operational status"
    },
    {
      "name": "logs",
      "description": "Stream aggregated logs with live tail"
    },
    {
      "name": "rollback",
      "description": "Revert to previous revision"
    }
  ],
  "robos:globalFlags": [
    {
      "flag": "--verbose, -v",
      "description": "Enable verbose debug tracing"
    },
    {
      "flag": "--config, -c",
      "description": "Path to configuration manifest"
    },
    {
      "flag": "--output, -o",
      "description": "Output format (json, yaml, text)"
    }
  ],
  "robos:ownerTeam": "urn:robos:team:core-platform",
  "robos:hasProject": "urn:robos:project:enterprise-core",
  "robos:inOrganization": "urn:robos:git-org:acme",
  "robos:localPath": "/home/ndipiazza/source/robos/packages/rest-client",
  "robos:package": "applications",
  "robos:namespace": "robos.applications",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://schema.org/SoftwareApplication",
  "robos:command": "rest-client",
  "robos:commandName": "inspect"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
