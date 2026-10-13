---
title: Kubernetes Deployment
layout: default
parent: "DevOps & Cloud"
grand_parent: Schemas
nav_order: 8
permalink: /schemas/devops/kubernetes-deployment.html
---

# robos:KubernetesDeployment
{: .no_toc }

Validation shape for `robos:KubernetesDeployment` nodes in the `devops` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:KubernetesDeployment` |
| Shape id | `urn:robos:shape:KubernetesDeploymentShape` |
| Package | [DevOps & Cloud]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Kubernetes Deployment must have a title. |
| `robos:namespace` | `1..*` | `URI (robos:KubernetesNamespace)` | Kubernetes Deployment must link to target namespace. |
| `robos:image` | `1..*` | `xsd:string` | Kubernetes Deployment must specify container image. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:kubernetes-deployment-sample",
  "@type": [
    "robos:KubernetesDeployment",
    "schema:SoftwareApplication",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Kubernetes Deployment",
  "dcterms:description": "Placeholder node for robos:KubernetesDeployment.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:image": "registry.acme.com/apps/sample:v1.0.0",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
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
