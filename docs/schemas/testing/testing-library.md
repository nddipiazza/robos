---
title: Testing Library
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 18
permalink: /schemas/testing/testing-library.html
description: "Validation shape for robos:TestingLibrary nodes in the testing package group."
---

# robos:TestingLibrary
{: .no_toc }

Validation shape for `robos:TestingLibrary` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:TestingLibrary` |
| Also matches | `robos:TestFramework` |
| Shape id | `urn:robos:shape:TestingLibraryShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Testing Library must have a title / name. |
| `robos:testingType` | `1..*` | `xsd:string` | Testing Library must declare testing paradigm (bdd, unit, e2e, contract, performance, mocking, api). |
| `robos:language` | `1..*` | `xsd:string` | Testing Library must declare target language ecosystem (polyglot, java, javascript, typescript, python, go, rust). |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:testing:cypress",
  "@type": [
    "robos:TestingLibrary",
    "robos:TestFramework",
    "oslc:Resource",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Cypress",
  "dcterms:description": "Fast, easy and reliable testing for anything that runs in a browser.",
  "robos:testingType": "e2e",
  "robos:language": "javascript",
  "robos:website": "https://www.cypress.io",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://schema.org/SoftwareApplication",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://schema.org/SoftwareApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
