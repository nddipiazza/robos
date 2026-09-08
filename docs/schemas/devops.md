---
title: DevOps & Cloud (robos.devops)
layout: default
parent: KGraph Schemas
nav_order: 5
has_children: true
permalink: /schemas/devops.html
---

# DevOps & Cloud (robos.devops)
{: .no_toc }

Cloud providers, CI/CD pipelines, container registries, OAuth apps, DNS domains, and secure GPG pass credentials.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `devops`
- **Ontology Namespace**: `robos.devops`
- **GitOps Package File**: `.robos/kgraphs/devops/package.jsonld`
- **Schemas Defined**: 13

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Data Pipeline** (`robos:DataPipeline`)]({{ '/schemas/devops/data-pipeline.html' | relative_url }}) | `urn:robos:shape:DataPipelineShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:pipelineEngine` | [View Schema &rarr;]({{ '/schemas/devops/data-pipeline.html' | relative_url }}) |
| [**Remote Execution Cluster** (`robos:RemoteExecutionCluster`)]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) | `urn:robos:shape:RemoteExecutionClusterShape` | `dcterms:title`, `robos:protocol`, `robos:provider`, `robos:executionEndpoint`, `robos:casEndpoint` | [View Schema &rarr;]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) |
| [**Kubernetes Cluster** (`robos:KubernetesCluster`)]({{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}) | `urn:robos:shape:KubernetesClusterShape` | `dcterms:title`, `robos:provider`, `robos:apiEndpoint`, `robos:clusterContext` | [View Schema &rarr;]({{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}) |
| [**Environment** (`robos:Environment`)]({{ '/schemas/devops/environment.html' | relative_url }}) | `urn:robos:shape:EnvironmentShape` | `dcterms:title`, `robos:environmentType`, `robos:tier` | [View Schema &rarr;]({{ '/schemas/devops/environment.html' | relative_url }}) |
| [**Git Ops Deployment** (`robos:GitOpsDeployment`)]({{ '/schemas/devops/git-ops-deployment.html' | relative_url }}) | `urn:robos:shape:GitOpsDeploymentShape` | `dcterms:title`, `robos:gitopsEngine`, `robos:sourceRepo`, `robos:targetCluster`, `robos:targetNamespace` | [View Schema &rarr;]({{ '/schemas/devops/git-ops-deployment.html' | relative_url }}) |
| [**CICDPipeline** (`robos:CICDPipeline`)]({{ '/schemas/devops/cicdpipeline.html' | relative_url }}) | `urn:robos:shape:CICDPipelineShape` | `dcterms:title`, `robos:platform`, `robos:workflowFile` | [View Schema &rarr;]({{ '/schemas/devops/cicdpipeline.html' | relative_url }}) |
| [**Kubernetes Namespace** (`robos:KubernetesNamespace`)]({{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}) | `urn:robos:shape:KubernetesNamespaceShape` | `dcterms:title`, `robos:namespaceName`, `robos:cluster` | [View Schema &rarr;]({{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}) |
| [**Kubernetes Deployment** (`robos:KubernetesDeployment`)]({{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}) | `urn:robos:shape:KubernetesDeploymentShape` | `dcterms:title`, `robos:namespace`, `robos:image` | [View Schema &rarr;]({{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}) |
| [**Kubernetes Service** (`robos:KubernetesService`)]({{ '/schemas/devops/kubernetes-service.html' | relative_url }}) | `urn:robos:shape:KubernetesServiceShape` | `dcterms:title`, `robos:serviceName`, `robos:serviceType`, `robos:namespace` | [View Schema &rarr;]({{ '/schemas/devops/kubernetes-service.html' | relative_url }}) |
| [**Kubernetes Ingress** (`robos:KubernetesIngress`)]({{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}) | `urn:robos:shape:KubernetesIngressShape` | `dcterms:title`, `robos:ingressName`, `robos:host`, `robos:namespace` | [View Schema &rarr;]({{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}) |
| [**Pipeline Stage** (`robos:PipelineStage`)]({{ '/schemas/devops/pipeline-stage.html' | relative_url }}) | `urn:robos:shape:PipelineStageShape` | `dcterms:title`, `robos:stageName`, `robos:pipeline` | [View Schema &rarr;]({{ '/schemas/devops/pipeline-stage.html' | relative_url }}) |
| [**Pipeline Job** (`robos:PipelineJob`)]({{ '/schemas/devops/pipeline-job.html' | relative_url }}) | `urn:robos:shape:PipelineJobShape` | `dcterms:title`, `robos:jobName`, `robos:stage` | [View Schema &rarr;]({{ '/schemas/devops/pipeline-job.html' | relative_url }}) |
| [**Pipeline Step** (`robos:PipelineStep`)]({{ '/schemas/devops/pipeline-step.html' | relative_url }}) | `urn:robos:shape:PipelineStepShape` | `dcterms:title`, `robos:stepName`, `robos:job` | [View Schema &rarr;]({{ '/schemas/devops/pipeline-step.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="DevOps & Cloud (robos.devops) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>DevOps & Cloud (robos.devops) (robos.devops)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>