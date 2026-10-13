---
title: "CI/CD Pipeline"
layout: default
parent: "DevOps & Cloud"
grand_parent: Schemas
nav_order: 6
permalink: /schemas/devops/cicd-pipeline.html
---

# robos:CICDPipeline
{: .no_toc }

Validation shape for `robos:CICDPipeline` nodes in the `devops` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:CICDPipeline` |
| Also matches | `robos:Pipeline` |
| Shape id | `urn:robos:shape:CICDPipelineShape` |
| Package | [DevOps & Cloud]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | CI/CD Pipeline must have a title. |
| `robos:platform` | `1..*` | `xsd:string` | CI/CD Pipeline must declare platform (github-actions, gitlab-ci, jenkins). |
| `robos:workflowFile` | `1..*` | - | CI/CD Pipeline must specify workflow file path (.github/workflows/...). |

## Example node

This node comes from `.robos/kgraphs/devops/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:pipeline:checkout-service-ci",
  "@type": [
    "oslc_qm:TestPlan",
    "robos:CICDPipeline",
    "robos:Pipeline",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Billing Service GitHub Actions CI/CD Pipeline",
  "dcterms:description": "Continuous integration pipeline executing lint, unit test, container build, and deployment.",
  "robos:platform": "github-actions",
  "robos:workflowFile": ".github/workflows/ci.yml",
  "robos:stages": [
    "lint",
    "test",
    "security-scan",
    "docker-build",
    "argocd-sync"
  ],
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
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
