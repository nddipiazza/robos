---
title: Kubernetes Namespace
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 7
permalink: /schemas/devops/kubernetes-namespace.html
---

# robos:KubernetesNamespace
{: .no_toc }

Validation shape for `robos:KubernetesNamespace` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:KubernetesNamespace` |
| Shape id | `urn:robos:shape:KubernetesNamespaceShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:AdministrativeArea`](https://schema.org/AdministrativeArea) |
| Domain standard | [Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Kubernetes Namespace must have a title. |
| `robos:namespaceName` | `1..*` | `xsd:string` | Kubernetes Namespace must specify namespace name. |
| `robos:cluster` | `1..*` | `URI (robos:KubernetesCluster)` | Kubernetes Namespace must link to parent cluster. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:kubernetes-namespace-sample",
  "@type": [
    "robos:KubernetesNamespace",
    "schema:AdministrativeArea",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Kubernetes Namespace",
  "dcterms:description": "Placeholder node for robos:KubernetesNamespace.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:namespaceName": "sample-namespace",
  "robos:cluster": "urn:robos:cluster:prod-us-east-eks",
  "robos:schemaOrgType": "https://schema.org/AdministrativeArea",
  "robos:domainStandard": "https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/",
  "robos:refersFrom": "https://schema.org/AdministrativeArea"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
