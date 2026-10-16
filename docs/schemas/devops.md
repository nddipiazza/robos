---
title: "DevOps & Cloud (robos.devops)"
layout: default
parent: Schemas
nav_order: 5
has_children: true
permalink: /schemas/devops.html
---

# DevOps & Cloud (robos.devops)
{: .no_toc }

Kubernetes clusters, environments, GitOps deployments, CI/CD pipelines, remote-execution clusters and data pipelines.
{: .fs-6 }

| | |
|---|---|
| Package id | `devops` |
| Namespace | `robos.devops` |
| Package file | `.robos/kgraphs/devops/package.jsonld` |
| Classes documented | 14 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Data Pipeline (`robos:DataPipeline`)]({{ '/schemas/devops/data-pipeline.html' | relative_url }}) | `urn:robos:shape:DataPipelineShape` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:pipelineEngine` |
| [Remote Execution Cluster (`robos:RemoteExecutionCluster`)]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) | `urn:robos:shape:RemoteExecutionClusterShape` | `dcterms:title`, `robos:protocol`, `robos:provider`, `robos:executionEndpoint`, `robos:casEndpoint` |
| [Kubernetes Cluster (`robos:KubernetesCluster`)]({{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}) | `urn:robos:shape:KubernetesClusterShape` | `dcterms:title`, `robos:provider`, `robos:apiEndpoint`, `robos:clusterContext` |
| [Environment (`robos:Environment`)]({{ '/schemas/devops/environment.html' | relative_url }}) | `urn:robos:shape:EnvironmentShape` | `dcterms:title`, `robos:environmentType`, `robos:tier` |
| [GitOps Deployment (`robos:GitOpsDeployment`)]({{ '/schemas/devops/gitops-deployment.html' | relative_url }}) | `urn:robos:shape:GitOpsDeploymentShape` | `dcterms:title`, `robos:gitopsEngine`, `robos:sourceRepo`, `robos:targetCluster`, `robos:targetNamespace` |
| [CI/CD Pipeline (`robos:CICDPipeline`)]({{ '/schemas/devops/cicd-pipeline.html' | relative_url }}) | `urn:robos:shape:CICDPipelineShape` | `dcterms:title`, `robos:platform`, `robos:workflowFile` |
| [Kubernetes Namespace (`robos:KubernetesNamespace`)]({{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}) | `urn:robos:shape:KubernetesNamespaceShape` | `dcterms:title`, `robos:namespaceName`, `robos:cluster` |
| [Kubernetes Deployment (`robos:KubernetesDeployment`)]({{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}) | `urn:robos:shape:KubernetesDeploymentShape` | `dcterms:title`, `robos:namespace`, `robos:image` |
| [Kubernetes Service (`robos:KubernetesService`)]({{ '/schemas/devops/kubernetes-service.html' | relative_url }}) | `urn:robos:shape:KubernetesServiceShape` | `dcterms:title`, `robos:serviceName`, `robos:serviceType`, `robos:namespace` |
| [Kubernetes Ingress (`robos:KubernetesIngress`)]({{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}) | `urn:robos:shape:KubernetesIngressShape` | `dcterms:title`, `robos:ingressName`, `robos:host`, `robos:namespace` |
| [Pipeline Stage (`robos:PipelineStage`)]({{ '/schemas/devops/pipeline-stage.html' | relative_url }}) | `urn:robos:shape:PipelineStageShape` | `dcterms:title`, `robos:stageName`, `robos:pipeline` |
| [Pipeline Job (`robos:PipelineJob`)]({{ '/schemas/devops/pipeline-job.html' | relative_url }}) | `urn:robos:shape:PipelineJobShape` | `dcterms:title`, `robos:jobName`, `robos:stage` |
| [Pipeline Step (`robos:PipelineStep`)]({{ '/schemas/devops/pipeline-step.html' | relative_url }}) | `urn:robos:shape:PipelineStepShape` | `dcterms:title`, `robos:stepName`, `robos:job` |
| [Environment Profile (`robos:EnvironmentProfile`)]({{ '/schemas/devops/environment-profile.html' | relative_url }}) | `robos:EnvironmentProfileShape` | `dcterms:title`, `robos:evidence` |
