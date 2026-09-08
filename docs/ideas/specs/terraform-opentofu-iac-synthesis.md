---
layout: default
nav_exclude: true
---

# Feature Spec: Terraform & OpenTofu Infrastructure as Code (IaC) Synthesis & Cloud Resource Studio

- **Status**: Draft
- **Created Date**: 2026-09-08
- **Target Component**: `packages/kube-studio` (or dedicated `packages/iac-studio`), `packages/devops`, `packages/robos-graph`, `packages/dev-central`, `.robos/terraform/` Git Store
- **Author/Idea Source**: User & Antigravity Agent

---

## 1. Overview & Vision

In the RobOS Knowledge Graph-First (KGraph-First) application generation paradigm, applications, microservices, and in-cluster workloads are automatically synthesized into Kubernetes StatefulSets, Deployments, and Helm charts. However, enterprise production software architectures rarely exist solely inside a Kubernetes cluster. Real-world applications fundamentally depend on cloud resources *underneath* and *around* Kubernetes:

- **Networking Foundations**: Virtual Private Clouds (VPCs), public/private subnets, internet gateways, NAT gateways, security groups, and transit gateways.
- **Managed Data Stores**: AWS RDS / Aurora PostgreSQL, Google Cloud SQL, Azure CosmosDB, Redis ElastiCache, and DynamoDB.
- **Object Storage & Contract Vaults**: AWS S3 buckets, Google Cloud Storage (GCS), and Azure Blob storage with lifecycle policies and CORS configurations.
- **Identity & Access Management (IAM)**: Workload Identity / IRSA IAM roles, service accounts, least-privilege policy attachments, and instance profiles.
- **Edge, Security & Routing**: AWS KMS customer-managed encryption keys, CloudFront CDNs, Route 53 DNS hosted zones, and ACM SSL/TLS certificates.

Currently, developers must switch away from RobOS to author, plan, and execute Infrastructure as Code (IaC) via third-party CLIs or external CI/CD pipelines. This breaks the single-source-of-truth vision of the RobOS Knowledge Graph.

### The Solution: KGraph-Driven OpenTofu & Terraform Synthesis

This feature extends RobOS with **first-class Infrastructure as Code (IaC) synthesis and execution** using **OpenTofu** (the open-source, MPL-2.0 fork of Terraform) and standard HashiCorp Terraform:

1. **First-Class Cloud Infrastructure Ontologies in KGraph**: Introduce cloud infrastructure nodes (`robos:VPC`, `robos:ManagedDatabase`, `robos:ObjectStorageBucket`, `robos:IAMRole`, `robos:DNSZone`) connected via semantic edges to microservices and databases.
2. **Automated HCL Code Synthesis**: RobOS synthesizes clean, modular, production-hardened OpenTofu/Terraform HCL manifests directly into the Git repository under `.robos/terraform/environments/<env>/` and `.robos/terraform/modules/`.
3. **In-Memory Ephemeral Sandbox Execution**: AI agents run `tofu plan` and `tofu apply` inside isolated RAM sandboxes (`tmpfs`), preventing host environment contamination.
4. **Visual Infrastructure Blast Radius in Dev Central**: Dev Central renders an interactive visual diff of proposed cloud infrastructure changes (Resources to Add, Change, or Destroy) before the lead architect approves deployment.
5. **Zero-Plaintext Credential Management**: Cloud provider credentials and API tokens are pulled seamlessly from the UNIX password store (`pass`) via GPG encryption.

---

## 2. User Stories & Use Cases

- **As a Cloud Architect / Tech Lead**, I want to define a new managed PostgreSQL database and an S3 asset vault on the RobOS visual architecture canvas and have RobOS synthesize validated OpenTofu/Terraform HCL into `.robos/terraform/`, so that infrastructure is version-controlled in Git alongside application code.
- **As an Autonomous AI Agent**, I want to execute `tofu plan` in an ephemeral RAM sandbox, parse the plan's JSON output, and check for misconfigured security groups or excessive IAM permissions before opening a pull request.
- **As a Lead Engineer / Reviewer**, I want to inspect a visual "Infrastructure Blast Radius" diagram in Dev Central showing exactly which cloud resources will be created, modified, or destroyed before approving a merge.
- **As a DevOps Engineer**, I want RobOS to manage remote state backends (AWS S3 + DynamoDB state locking, Google Cloud Storage, or Azure Blob) using existing GPG-encrypted credentials from `~/.password-store/devops/`.

---

## 3. Key Capabilities & Scope

### In Scope

- [ ] **First-Class KGraph Cloud Resource Ontology**:
  - `robos:CloudResource` base class inheriting from OSLC Architecture Management.
  - Subclasses: `robos:VPC`, `robos:Subnet`, `robos:ManagedDatabase` (PostgreSQL, MySQL, Redis), `robos:ObjectStorageBucket` (S3, GCS, Blob), `robos:IAMRole`, `robos:KMSKey`, `robos:DNSZone`.
  - Semantic edges: `robos:provisionsInVPC`, `robos:persistsToObjectStorage`, `robos:assumesRole`, `robos:encryptedWithKMS`.
  - Validation against W3C SHACL shapes (`CloudResourceShape`, `VPCShape`, `ManagedDBShape`).

- [ ] **Declarative HCL Synthesis Engine (`packages/iac-studio` or `packages/kube-studio`)**:
  - Code generator transforming KGraph cloud resource definitions into modular HCL (`.robos/terraform/`).
  - Standard multi-environment layout:
    ```
    .robos/terraform/
    ├── modules/
    │   ├── vpc/
    │   ├── rds-postgres/
    │   ├── s3-bucket/
    │   └── iam-workload-identity/
    └── environments/
        ├── dev/
        │   ├── main.tf
        │   ├── variables.tf
        │   └── backend.tf
        └── prod/
            ├── main.tf
            └── backend.tf
    ```
  - Native support for top tier cloud providers: AWS (`hashicorp/aws`), Google Cloud (`hashicorp/google`), and Azure (`hashicorp/azurerm`).

- [ ] **Ephemeral Sandbox Execution & Plan Parser**:
  - Runs `tofu init -upgrade` and `tofu plan -out=tfplan.binary` in isolated `tmpfs` RAM.
  - Generates JSON plan representation via `tofu show -json tfplan.binary`.
  - Classifies actions: `create`, `update`, `delete`, `replace`.

- [ ] **Visual Infrastructure Blast Radius & Review Panel in Dev Central**:
  - Interactive resource tree displaying changes color-coded: 🟢 Green (Add), 🟡 Yellow (Modify), 🔴 Red (Destroy).
  - Highlights high-risk operations (e.g. database recreation, VPC CIDR modification, S3 bucket deletion).
  - 1-click "Approve & Apply" executing `tofu apply tfplan.binary` with real-time log streaming.

- [ ] **Password Store (`pass`) Credential Injection**:
  - Pulls AWS access keys, GCP service account JSON, or Azure client secrets from `~/.password-store/devops/cloud-infrastructure/` at runtime without writing plaintext tokens to disk.

### Out of Scope (Initial Release)

- Proprietary SaaS IaC platforms (e.g., Terraform Cloud / Spacelift SaaS-only features; all workflows are 100% local, open-source, and Git-backed).
- Complex custom resource provider plugins written in C++/Go (standard OpenTofu registry providers are used).

---

## 4. Architectural & System Integration

### System Architecture Flow

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/gitops-synthesis-pipeline.jpg' | relative_url }}" alt="OpenTofu & Terraform IaC Synthesis Architecture" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>OpenTofu & Terraform IaC Synthesis Architecture</strong>: Visual cloud canvas synthesis to HCL, ephemeral tmpfs execution with GPG password store, and Dev Central blast-radius review. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### Impacted Packages & Components
- **`packages/kube-studio` / `packages/iac-studio`**: Adds visual "Cloud Infrastructure & IaC" explorer tab with resource inventory and terminal runner.
- **`packages/robos-graph`**: Ontology schema updates defining `robos:CloudResource` and SHACL shapes.
- **`packages/dev-central`**: Infrastructure blast radius viewer in pull request review platform.
- **`packages/devops`**: Cloud provider credential bindings and backend state configuration.
- **`plugins/robos/skills/`**: New agent skill `plan-iac` and `apply-iac` for autonomous agent execution.

### IPC Endpoints
- `ipcMain.handle('iac:synthesize-hcl', async (event, { env }) => { ... })`
- `ipcMain.handle('iac:run-plan', async (event, { env, provider }) => { ... })`
- `ipcMain.handle('iac:get-plan-summary', async (event, { env }) => { ... })`
- `ipcMain.handle('iac:run-apply', async (event, { env }) => { ... })`

---

## 5. Proposed Implementation Plan

1. **Phase 1: Knowledge Graph Ontology & SHACL Schema**
   - Register `robos:CloudResource`, `robos:VPC`, `robos:ManagedDatabase`, `robos:ObjectStorageBucket`, and `robos:IAMRole` in `packages/robos-graph/lib/oslc-parser.js`.
   - Add SHACL shape definitions in `packages/robos-graph/lib/shacl-validator.js`.

2. **Phase 2: HCL Synthesis Generator**
   - Create `packages/robos-graph/lib/hcl-generator.js` outputting idiomatic OpenTofu HCL.
   - Build starter modules for AWS (VPC, EKS, RDS, S3, IAM) and Google Cloud (VPC, GKE, Cloud SQL, GCS).
   - Standardize `.robos/terraform/` directory scaffolding.

3. **Phase 3: Sandbox Runner & Plan Parser**
   - Implement background runner executing `tofu plan -json` in an ephemeral RAM sandbox.
   - Parse plan output into categorized resource changes (Additions, Modifications, Deletions).

4. **Phase 4: Dev Central Review UI & Kube Studio Integration**
   - Add "Infrastructure Diff" tab in Dev Central PR review tool.
   - Add "Cloud & IaC" sub-view in Kube Studio showing active cloud resources alongside Kubernetes workloads.

5. **Phase 5: Agent Skills & Automated Verification**
   - Add `iac-plan` and `iac-apply` skills to the RobOS plugin marketplace.
   - Write automated E2E tests validating synthesis, plan parsing, and password store injection.

---

## 6. Acceptance Criteria

- [ ] RobOS visual architecture canvas supports adding cloud resources (`VPC`, `RDS`, `S3`, `IAM`).
- [ ] RobOS synthesizes valid OpenTofu/Terraform HCL manifests into `.robos/terraform/` with zero syntax errors.
- [ ] Ephemeral agent sandbox executes `tofu plan` without modifying host user dotfiles or leaving orphaned processes.
- [ ] Dev Central displays an interactive, color-coded Infrastructure Blast Radius showing planned additions, modifications, and deletions.
- [ ] Credentials for AWS/GCP/Azure are dynamically fetched from the GPG password store (`pass`) with zero plaintext secrets committed to Git.
- [ ] Verified with containerized headless E2E test suite.
