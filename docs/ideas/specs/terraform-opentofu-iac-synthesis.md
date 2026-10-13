---
title: "Proposal: OpenTofu and Terraform synthesis"
layout: default
nav_exclude: true
---

# Proposal: OpenTofu and Terraform synthesis
{: .no_toc }

Model cloud resources in the knowledge graph, generate OpenTofu or Terraform files from them, and show reviewers what a plan would change.
{: .fs-6 }

{: .important }
Proposal, not built. No cloud resource types, HCL generator or IaC app exists in the repository.

## Proposal

- Knowledge graph types for the infrastructure around a cluster. The spec names a base `robos:CloudResource` and subclasses such as `robos:VPC`, `robos:Subnet`, `robos:ManagedDatabase`, `robos:ObjectStorageBucket`, `robos:IAMRole`, `robos:KMSKey` and `robos:DNSZone`, with SHACL shapes.
- A generator that writes modular HCL under `.robos/terraform/modules/` and `.robos/terraform/environments/<env>/`.
- An agent step that runs `tofu plan` in a temporary `tmpfs` sandbox and reads the JSON plan before opening a pull request.
- A view in Dev Central that lists the resources a plan would add, change or destroy, shown before approval.
- Cloud credentials and remote state settings read from the `pass` store, not from files.
- The spec leaves open whether this lives in [Kube Studio]({{ '/apps/kube-studio/' | relative_url }}) or in a new `packages/iac-studio`.

![Declarative GitOps pipeline from a topology canvas through a Git store and a synthesis engine to cluster deployment]({{ '/assets/images/gitops-synthesis-pipeline.jpg' | relative_url }}){: .robos-zoomable-img }
*Concept diagram from the original design docs. The earlier spec reused this Kubernetes synthesis pipeline to illustrate the proposed OpenTofu generator; it does not show Terraform. The text on this page says what is built today.*

## What exists today

- [Dev Tools MCP]({{ '/apps/dev-tools-mcp/' | relative_url }}) lists `terraform` among the tools it can check for (`packages/dev-tools-mcp/server.js`).
- Task Planner has a template, "Plan to Create a Terraform / OpenTofu Cloud Infrastructure Stack" (`packages/task-planner/lib/default-templates.js`). It produces a plan, not infrastructure code.
- None of the `robos:` cloud resource types above exists in `packages/robos-graph` or `.robos`.

## Source

Raw note: [`ideas/inbox/terraform-opentofu-iac-synthesis.txt`](https://github.com/nddipiazza/robos/blob/main/docs/ideas/inbox/terraform-opentofu-iac-synthesis.txt). The earlier long spec is in the git history of this file.
