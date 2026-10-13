---
title: Kubernetes Cluster
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 3
permalink: /schemas/devops/kubernetes-cluster.html
---

# robos:KubernetesCluster
{: .no_toc }

Validation shape for `robos:KubernetesCluster` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:KubernetesCluster` |
| Also matches | `robos:K8sCluster` |
| Shape id | `urn:robos:shape:KubernetesClusterShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:ComputerPlatform`](https://schema.org/ComputerPlatform) |
| Domain standard | [Kubernetes](https://kubernetes.io/docs/concepts/overview/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Kubernetes Cluster must have a title or display name. |
| `robos:provider` | `1..*` | `xsd:string` | Kubernetes Cluster must declare provider (eks, gke, aks, minikube, k3s, on-prem). |
| `robos:apiEndpoint` | `1..*` | - | Kubernetes Cluster must specify API server endpoint URL. |
| `robos:clusterContext` | `1..*` | - | Kubernetes Cluster must specify kubeconfig context name. |

## Example node

This node comes from `.robos/kgraphs/devops/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:cluster:prod-us-east-eks",
  "@type": [
    "c4:DeploymentNode",
    "robos:KubernetesCluster",
    "robos:K8sCluster",
    "schema:ComputerPlatform"
  ],
  "dcterms:title": "Production US-East AWS EKS Cluster",
  "dcterms:description": "Primary Kubernetes multi-tenant production cluster in AWS us-east-1.",
  "robos:provider": "eks",
  "robos:apiEndpoint": "https://k8s-api.us-east-1.eks.amazonaws.com",
  "robos:clusterContext": "arn:aws:eks:us-east-1:123456789012:cluster/prod-us-east",
  "robos:namespaces": [
    "production",
    "ingress",
    "monitoring"
  ],
  "robos:inEnvironment": "urn:robos:env:production",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:schemaOrgType": "https://schema.org/ComputerPlatform",
  "robos:domainStandard": "https://kubernetes.io/docs/concepts/overview/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
