---
title: Code Snippet
layout: default
parent: "Documentation & Diagrams"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/documentation/code-snippet.html
---

# robos:CodeSnippet
{: .no_toc }

Validation shape for `robos:CodeSnippet` nodes in the `documentation` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:CodeSnippet` |
| Also matches | `robos:CodeSample` |
| Shape id | `urn:robos:shape:CodeSnippetShape` |
| Package | [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}) (`documentation`) |
| Classification | Documentation & decisions |
| Schema.org type | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Code Snippet must have a title. |
| `robos:language` | `1..*` | `xsd:string` | Code Snippet must specify a programming language. |
| `robos:code` | `1..*` | `xsd:string` | Code Snippet must provide source code text. |

## Example node

This node comes from `.robos/kgraphs/documentation/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:snippet:shacl-custom-validation",
  "@type": [
    "oslc_am:Resource",
    "robos:CodeSnippet",
    "robos:CodeSample",
    "schema:SoftwareSourceCode"
  ],
  "dcterms:title": "SHACL Custom Shape Programmatic Validation",
  "robos:language": "javascript",
  "robos:code": "const { SHACLValidator } = require('robos-graph');\nconst validator = new SHACLValidator();\nconst report = validator.validate(graphStore.parser);\nconsole.log('Conforms:', report.conforms);",
  "dcterms:description": "Canonical example of running in-memory SHACL validation against a parsed OSLC knowledge graph.",
  "robos:package": "documentation",
  "robos:namespace": "robos.docs",
  "robos:schemaOrgType": "https://schema.org/SoftwareSourceCode",
  "robos:domainStandard": "https://schema.org/SoftwareSourceCode"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
