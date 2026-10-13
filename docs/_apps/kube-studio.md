---
title: "Kube Studio & Cloud Navigator"
package: kube-studio
category: devops-cloud
icon: kube-studio.svg
summary: "A Kubernetes browser that runs real kubectl against a local Kind or Minikube cluster; remote clusters, Helm, ArgoCD and Vercel panels show sample data."
description: "Kube Studio lists namespaces and resources, deploys the bundled Acme Petshop manifests and streams pod logs on a local cluster through kubectl. EKS, GKE and AKS entries and the Helm, ArgoCD and Vercel tabs are fixed samples."
---

Kube Studio is split into parts that act on a real cluster and parts that only display examples. Which is which depends on the cluster you pick.

## Real and sample

| Part | Behavior |
|---|---|
| Clusters of type local (Kind) or Minikube | Real. Every action runs `kubectl` using `$KUBECONFIG` or `~/.kube/config` and the **current** context. The "Kubeconfig Context" field in the add dialog is stored but not passed to `kubectl` |
| Clusters of type AWS, GCP or Azure | Sample. The list starts with "Acme EKS Production", "Acme GKE Staging" and "Acme AKS Europe" as fixed entries, and resources shown for them are invented |
| **Helm Releases**, **ArgoCD GitOps**, **Vercel Deployments** tabs | Fixed sample data. Syncing an ArgoCD app only returns a success message |
| **AI Infrastructure CoPilot** | Canned replies chosen by keywords in your question (restart, deploy, helm, argocd, vercel) |

If `kubectl` fails on a local cluster, namespaces fall back to a sample list.

## What you do in it

- Choose a **Cluster** and **Namespace** in the header. **+ Add Cluster** registers an entry for Kind, Minikube, EKS, GKE or AKS.
- Browse **Pods**, **Deployments**, **Services** and **Ingresses** (`kubectl get <kind> -o json`). Pods have **Logs** (the last 100 lines, with **Copy**) and **YAML** buttons, and deployments have **YAML** and **Restart** (`kubectl rollout restart`). The package also has a scale handler (`kubectl scale`) that no button uses yet.
- **Knowledge Graph Deployable Applications** lists the bundled Petstore API, PostgreSQL, vaccine gateway and analytics database. **Deploy All Applications** and the per-app buttons run `kubectl apply -f` on the manifests in `packages/kube-studio/manifests/petshop-baseline` (`00-namespace.yaml` to `04-analytics-postgres.yaml`); undeploy deletes them. The default namespace is `acme-petshop-local`. A Helm chart for the same app is in `charts/acme-petshop`.
- **Auto-Deploy: KGraph main**, **Implement Next Task [PET-105]** and **Commit to KGraph main [PET-105]** are a scripted demo of task-to-deploy flow. The commit button applies the vaccine-gateway manifest and reports a "Knowledge Graph commit" message; no commit is made.

## Requirements

`kubectl` (the app prefers `~/.local/bin/kubectl`) and a reachable local cluster, for example Kind, to see anything real. If `ROBOS_GRAPH_ROOT` is set, the app becomes a read-only viewer of cluster declarations in that graph workspace and live operations are disabled.

```bash
electron packages/kube-studio
```

Source: [`packages/kube-studio`](https://github.com/nddipiazza/robos/tree/main/packages/kube-studio).
