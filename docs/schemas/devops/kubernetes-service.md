---
title: Kubernetes Service
layout: default
parent: "DevOps & Cloud"
grand_parent: Schemas
nav_order: 9
permalink: /schemas/devops/kubernetes-service.html
---

# robos:KubernetesService
{: .no_toc }

Validation shape for `robos:KubernetesService` nodes in the `devops` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:KubernetesService` |
| Shape id | `urn:robos:shape:KubernetesServiceShape` |
| Package | [DevOps & Cloud]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:Service`](https://schema.org/Service) |
| Domain standard | [Kubernetes](https://kubernetes.io/docs/concepts/services-networking/service/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Kubernetes Service must have a title. |
| `robos:serviceName` | `1..*` | `xsd:string` | Kubernetes Service must specify service name. |
| `robos:serviceType` | `1..*` | `xsd:string` | Kubernetes Service must declare service type. |
| `robos:namespace` | `1..*` | `URI (robos:KubernetesNamespace)` | Kubernetes Service must link to namespace. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:devops:kubernetes-service-sample",
  "@type": [
    "robos:KubernetesService",
    "schema:Service",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Kubernetes Service",
  "dcterms:description": "Placeholder node for robos:KubernetesService.",
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:serviceName": "sample-service",
  "robos:serviceType": "ClusterIP",
  "robos:schemaOrgType": "https://schema.org/Service",
  "robos:domainStandard": "https://kubernetes.io/docs/concepts/services-networking/service/",
  "robos:refersFrom": "https://schema.org/Service"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
