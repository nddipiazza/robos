---
title: Remote Execution Cluster
layout: default
parent: "DevOps & Cloud (robos.devops)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/devops/remote-execution-cluster.html
---

# robos:RemoteExecutionCluster
{: .no_toc }

Validation shape for `robos:RemoteExecutionCluster` nodes in the `devops` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:RemoteExecutionCluster` |
| Also matches | `robos:RemoteBuildCluster` |
| Shape id | `urn:robos:shape:RemoteExecutionClusterShape` |
| Package | [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) (`devops`) |
| Classification | Infrastructure & delivery |
| Schema.org type | [`schema:ComputerPlatform`](https://schema.org/ComputerPlatform) |
| Domain standard | [github.com](https://github.com/bazelbuild/remote-apis) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Remote Execution Cluster must have a title. |
| `robos:protocol` | `1..*` | `xsd:string` | Remote Execution Cluster must declare protocol standard (e.g. REAPI_v2). |
| `robos:provider` | `1..*` | `xsd:string` | Remote Execution Cluster must declare backend provider engine (e.g. buildbarn, nativelink, buildgrid). |
| `robos:executionEndpoint` | `1..*` | `xsd:anyURI` | Remote Execution Cluster must specify execution endpoint URI. |
| `robos:casEndpoint` | `1..*` | `xsd:anyURI` | Remote Execution Cluster must specify Content Addressable Storage (CAS) endpoint URI. |

## Example node

This node comes from `.robos/kgraphs/devops/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:remote-execution:acme-buildbarn-cluster",
  "@type": [
    "robos:RemoteExecutionCluster",
    "robos:RemoteBuildCluster",
    "oslc:Resource",
    "schema:ComputerPlatform"
  ],
  "dcterms:title": "Acme Production Buildbarn REAPI Cluster",
  "dcterms:description": "High-performance distributed remote execution & CAS caching cluster using Buildbarn suite.",
  "robos:protocol": "REAPI_v2",
  "robos:provider": "buildbarn",
  "robos:instanceName": "main",
  "robos:executionEndpoint": "grpc://re-execution.buildbarn.internal:8980",
  "robos:casEndpoint": "grpc://re-cas.buildbarn.internal:8980",
  "robos:actionCacheEndpoint": "grpc://re-cas.buildbarn.internal:8980",
  "robos:browserEndpoint": "http://re-browser.buildbarn.internal:7984",
  "robos:tlsEnabled": false,
  "robos:status": "active",
  "robos:workerPools": [
    {
      "name": "linux-x86_64-large",
      "osFamily": "linux",
      "isa": "x86-64",
      "containerImage": "docker://gcr.io/cloud-marketplace/google/debian11:latest",
      "concurrency": 64
    }
  ],
  "robos:cacheSettings": {
    "maxSizeBytes": "500GB",
    "retentionDays": 14,
    "evictionPolicy": "lru"
  },
  "robos:package": "devops",
  "robos:namespace": "robos.devops",
  "robos:schemaOrgType": "https://schema.org/ComputerPlatform",
  "robos:domainStandard": "https://github.com/bazelbuild/remote-apis"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
