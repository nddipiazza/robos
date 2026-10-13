---
title: Git Project Organization
layout: default
parent: "Organization & Teams"
grand_parent: Schemas
nav_order: 4
permalink: /schemas/organization/git-project-organization.html
---

# robos:GitProjectOrganization
{: .no_toc }

Validation shape for `robos:GitProjectOrganization` nodes in the `organization` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:GitProjectOrganization` |
| Also matches | `robos:GitOrganization` |
| Shape id | `urn:robos:shape:GitProjectOrganizationShape` |
| Package | [Organization & Teams]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Organization & people |
| Schema.org type | [`schema:Organization`](https://schema.org/Organization) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Git Project Organization must have a title or display name. |
| `robos:url` | `1..*` | `xsd:anyURI` | Git Project Organization must specify forge URL (e.g. https://github.com/apache). |
| `robos:orgName` | `1..*` | `xsd:string` | Git Project Organization must specify organization handle/slug. |
| `robos:forgeType` | `1..*` | `xsd:string` | Git Project Organization must declare forge type (github, gitlab, bitbucket, etc.). |

## Example node

This node comes from `.robos/kgraphs/organization/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:git-org:acme",
  "@type": [
    "robos:GitProjectOrganization",
    "robos:GitOrganization",
    "schema:Organization",
    "oslc:Resource"
  ],
  "dcterms:title": "Acme",
  "dcterms:description": "Git Project Organization for acme.",
  "robos:orgName": "acme",
  "robos:url": "https://github.com/acme",
  "robos:forgeType": "github",
  "robos:visibility": "public",
  "robos:hasRepository": [
    "github.com/acme/rest-client"
  ],
  "robos:documentation": {
    "docsUrl": "https://github.com/acme",
    "docsPaths": [
      "docs/index.md",
      "README.md",
      "CONTRIBUTING.md"
    ],
    "license": "Apache-2.0"
  },
  "robos:agentRules": [],
  "robos:agentRulesDoc": "AGENTS.md",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:repoCount": 1,
  "robos:schemaOrgType": "https://schema.org/Organization",
  "robos:domainStandard": "https://schema.org/Organization"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
