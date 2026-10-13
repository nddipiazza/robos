---
title: Doc String
layout: default
parent: "Testing, Quality & BDD (robos.testing)"
grand_parent: Schemas
nav_order: 17
permalink: /schemas/testing/doc-string.html
---

# robos:DocString
{: .no_toc }

Validation shape for `robos:DocString` nodes in the `testing` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:DocString` |
| Shape id | `urn:robos:shape:DocStringShape` |
| Package | [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) (`testing`) |
| Classification | Testing & behavior |
| Schema.org type | [`schema:Text`](https://schema.org/Text) |
| Domain standard | [Cucumber](https://cucumber.io/docs/gherkin/reference/#doc-strings) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `robos:content` | `1..*` | - | DocString must define text content. |
| `robos:step` | `1..*` | - | DocString must link to parent scenario step. |

## Example node

This node comes from `.robos/kgraphs/testing/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:docstring:checkout-payload",
  "@type": [
    "robos:DocString",
    "schema:Text"
  ],
  "robos:step": "urn:robos:step:checkout-payload-docstring",
  "robos:content": "{\n  \"cartId\": \"cart-9821\",\n  \"currency\": \"USD\",\n  \"paymentMethod\": \"credit_card\"\n}",
  "robos:contentType": "application/json",
  "robos:package": "testing",
  "robos:namespace": "robos.testing",
  "robos:refersFrom": "https://cucumber.io/docs/gherkin/reference/#doc-strings",
  "robos:schemaOrgType": "https://schema.org/Text",
  "robos:domainStandard": "https://cucumber.io/docs/gherkin/reference/#doc-strings"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
