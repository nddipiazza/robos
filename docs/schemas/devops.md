---
title: "DevOps & Cloud"
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

| Detail | Value |
|---|---|
| Package id | `devops` |
| Namespace | `robos.devops` |
| Package file | `.robos/kgraphs/devops/package.jsonld` |
| Classes documented | 14 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Data Pipeline]({{ '/schemas/devops/data-pipeline.html' | relative_url }}) | `robos:DataPipeline` | `dcterms:title`, `robos:repository`, `robos:technology`, `robos:pipelineEngine` |
| [Remote Execution Cluster]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) | `robos:RemoteExecutionCluster` | `dcterms:title`, `robos:protocol`, `robos:provider`, `robos:executionEndpoint`, `robos:casEndpoint` |
| [Kubernetes Cluster]({{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}) | `robos:KubernetesCluster` | `dcterms:title`, `robos:provider`, `robos:apiEndpoint`, `robos:clusterContext` |
| [Environment]({{ '/schemas/devops/environment.html' | relative_url }}) | `robos:Environment` | `dcterms:title`, `robos:environmentType`, `robos:tier` |
| [GitOps Deployment]({{ '/schemas/devops/gitops-deployment.html' | relative_url }}) | `robos:GitOpsDeployment` | `dcterms:title`, `robos:gitopsEngine`, `robos:sourceRepo`, `robos:targetCluster`, `robos:targetNamespace` |
| [CI/CD Pipeline]({{ '/schemas/devops/cicd-pipeline.html' | relative_url }}) | `robos:CICDPipeline` | `dcterms:title`, `robos:platform`, `robos:workflowFile` |
| [Kubernetes Namespace]({{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}) | `robos:KubernetesNamespace` | `dcterms:title`, `robos:namespaceName`, `robos:cluster` |
| [Kubernetes Deployment]({{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}) | `robos:KubernetesDeployment` | `dcterms:title`, `robos:namespace`, `robos:image` |
| [Kubernetes Service]({{ '/schemas/devops/kubernetes-service.html' | relative_url }}) | `robos:KubernetesService` | `dcterms:title`, `robos:serviceName`, `robos:serviceType`, `robos:namespace` |
| [Kubernetes Ingress]({{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}) | `robos:KubernetesIngress` | `dcterms:title`, `robos:ingressName`, `robos:host`, `robos:namespace` |
| [Pipeline Stage]({{ '/schemas/devops/pipeline-stage.html' | relative_url }}) | `robos:PipelineStage` | `dcterms:title`, `robos:stageName`, `robos:pipeline` |
| [Pipeline Job]({{ '/schemas/devops/pipeline-job.html' | relative_url }}) | `robos:PipelineJob` | `dcterms:title`, `robos:jobName`, `robos:stage` |
| [Pipeline Step]({{ '/schemas/devops/pipeline-step.html' | relative_url }}) | `robos:PipelineStep` | `dcterms:title`, `robos:stepName`, `robos:job` |
| [Environment Profile]({{ '/schemas/devops/environment-profile.html' | relative_url }}) | `robos:EnvironmentProfile` | `dcterms:title`, `robos:evidence` |
