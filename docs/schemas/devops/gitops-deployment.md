---
title: GitOps Deployment
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/devops/gitops-deployment.html
description: "Validation shape for robos:GitOpsDeployment nodes in the devops package group."
---

# robos:GitOpsDeployment
{: .no_toc }

Validation shape for `robos:GitOpsDeployment` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:GitOpsDeployment` |
| Also matches | `robos:ArgoCDApplication` |
| Shape id | `urn:robos:shape:GitOpsDeploymentShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [opengitops.dev](https://opengitops.dev/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | GitOps Deployment must have a title. |
| `robos:gitopsEngine` | `1..*` | - | GitOps Deployment must declare engine (argocd, flux). |
| `robos:sourceRepo` | `1..*` | - | GitOps Deployment must specify source Git repository. |
| `robos:targetCluster` | `1..*` | - | GitOps Deployment must link to target Kubernetes Cluster. |
| `robos:targetNamespace` | `1..*` | - | GitOps Deployment must specify target namespace. |

## Example node

This node comes from `.robos/kgraphs/devops/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:gitops:checkout-service-argocd",
  "@type": [
    "oslc_config:ConfigurationItem",
    "robos:GitOpsDeployment",
    "robos:ArgoCDApplication",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Billing & Checkout ArgoCD GitOps Application",
  "dcterms:description": "Declarative GitOps deployment application managing Kubernetes manifests via ArgoCD.",
  "robos:gitopsEngine": "argocd",
  "robos:sourceRepo": "https://github.com/acme/gitops-manifests",
  "robos:sourcePath": "charts/billing-api",
  "robos:targetCluster": "urn:robos:cluster:prod-us-east-eks",
  "robos:targetNamespace": "production",
  "robos:syncPolicy": "automated",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://opengitops.dev/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
