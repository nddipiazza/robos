---
title: Kubernetes Ingress
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 10
permalink: /schemas/devops/kubernetes-ingress.html
---

# robos:KubernetesIngress
{: .no_toc }

Validation shape for `robos:KubernetesIngress` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:KubernetesIngress` |
| Shape id | `urn:robos:shape:KubernetesIngressShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:EntryPoint`](https://schema.org/EntryPoint) |
| Domain standard | [Kubernetes](https://kubernetes.io/docs/concepts/services-networking/ingress/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Kubernetes Ingress must have a title. |
| `robos:ingressName` | `1..*` | `xsd:string` | Kubernetes Ingress must specify ingress name. |
| `robos:host` | `1..*` | `xsd:string` | Kubernetes Ingress must specify routing hostname. |
| `robos:namespace` | `1..*` | `URI (robos:KubernetesNamespace)` | Kubernetes Ingress must link to namespace. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:kubernetes-ingress-sample",
  "@type": [
    "robos:KubernetesIngress",
    "schema:EntryPoint",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Kubernetes Ingress",
  "dcterms:description": "Placeholder node for robos:KubernetesIngress.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:ingressName": "sample-ingress",
  "robos:host": "api.acme.internal",
  "robos:schemaOrgType": "https://schema.org/EntryPoint",
  "robos:domainStandard": "https://kubernetes.io/docs/concepts/services-networking/ingress/",
  "robos:refersFrom": "https://schema.org/EntryPoint"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
