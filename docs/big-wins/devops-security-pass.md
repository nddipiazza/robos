---
title: DevOps Security & Password Store
layout: default
parent: RobOS Big Wins
nav_order: 7
permalink: /big-wins/devops-security-pass.html
---

# Zero-Plaintext DevOps Integrations & GPG Password Store (`pass`)
{: .no_toc }

How RobOS protects multi-cloud developer infrastructure by eliminating plaintext credentials, encrypting secrets into the local UNIX password store (`pass`) with GPG, and referencing access paths via first-class Knowledge Graph nodes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Strategic Advantage: Ending Plaintext Secrets & Token Leakage

In modern cloud engineering and autonomous AI agent workflows, credential management is notorious for catastrophic security leaks:
- Developers store sensitive API tokens, AWS access keys, and database passwords in plaintext `.env` files, shell dotfiles, or hardcoded application configs.
- Autonomous AI agents reading repository files accidentally ingest sensitive secrets into LLM contexts or commit them to public Git histories.
- Proprietary SaaS credential managers lock teams into expensive subscriptions and store company secrets on third-party cloud servers.

**The RobOS Big Win:**

> **RobOS provides interactive onboarding wizards across 7 categories and 25+ cloud providers with zero plaintext credentials stored in the Knowledge Graph or Git repositories.**

All sensitive API keys, private certificates, and tokens are encrypted locally using **GPG** and stored directly into the standard **UNIX password store (`pass`)** at `~/.password-store/devops/`. The RobOS Knowledge Graph stores first-class **`robos:PassCredential` reference nodes** that declare the secure path to the credential without ever exposing the sensitive secret.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/devops-wizard-categories_frame.png' | relative_url }}" alt="DevOps Account Integrations Wizard in RobOS" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS DevOps Account Integrations Wizard</strong>: Guided connection wizards covering 7 infrastructure categories and 25+ cloud providers with zero plaintext secrets. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## The 7 Categories & 25+ Supported Providers

RobOS includes purpose-built onboarding wizards across 7 essential infrastructure domains:

| Category | Supported Cloud & Infrastructure Providers | Credentials Managed Securely |
|:---|:---|:---|
| **1. Source Control (VCS)** | GitHub, GitLab, Bitbucket, Gitea, AWS CodeCommit | Personal Access Tokens (PAT), Deploy Keys, OAuth App Secrets. |
| **2. Cloud Infrastructure** | AWS, Google Cloud (GCP), Microsoft Azure, OpenShift | AWS Access Keys / Secret Keys, GCP Service Account JSON, Azure Client Secrets. |
| **3. CI/CD & GitOps** | ArgoCD, Jenkins, GitHub Actions, GitLab CI, CircleCI | Admin API Tokens, Webhook Secrets, Deployer Keyrings. |
| **4. Package Registries** | JFrog Artifactory, Sonatype Nexus, Docker Hub, AWS ECR, npm | Docker Auth Configs, Maven Master Passwords, npm deploy tokens. |
| **5. Containers & Virt** | Kubernetes, Podman, Docker, VMware vSphere, OpenStack | `kubeconfig` client certificates, cluster CA certs, API server bearer tokens. |
| **6. OAuth & Identity** | Okta, Azure AD / Entra ID, OpenLDAP, Keycloak, Ping | SCIM Provisioning Tokens, LDAP Bind Passwords, Client Secrets. |
| **7. Domains & DNS** | GoDaddy, Amazon Route 53, Cloudflare, Namecheap | DNS Management API Keys, Zone Access Tokens, API Secrets. |

---

## Technical Architecture: GPG Encryption & First-Class KGraph References

```mermaid
graph TD
    subgraph UI [1. DevOps Integration Wizard (packages/devops)]
        Wizard[Guided 4-Step Connection Wizard]
        PromptUser[User Enters API Key / Token]
    end

    subgraph PassStore [2. Local UNIX Password Store (pass)]
        GPG[GPG Asymmetric Keyring Encryption]
        EncryptedFile["~/.password-store/devops/<category>/<provider>/<key>.gpg"]
    end

    subgraph KGraphStore [3. Modular KGraph Packages .robos/]
        DevOpsNode[robos:DevOpsIntegration Node]
        PassNode[robos:PassCredential Node<br/>Declares robos:passPath only]
        ZeroSecret[Zero Plaintext Secrets Committed to Git]
    end

    subgraph RuntimeUsage [4. Runtime Injection into Ephemeral Sandboxes]
        Agent[Autonomous Agent / Deployer]
        RuntimeInject[In-Memory Decryption at Runtime via pass]
    end

    Wizard --> PromptUser
    PromptUser --> GPG
    GPG --> EncryptedFile
    Wizard --> PassNode
    PassNode --> DevOpsNode
    PassNode -.-> ZeroSecret
    DevOpsNode --> RuntimeInject
    EncryptedFile --> RuntimeInject
    RuntimeInject --> Agent
```

### 1. Zero Plaintext in the Knowledge Graph
When a cloud integration is registered, RobOS creates a linked node in the Knowledge Graph declaring metadata (provider name, API endpoints, enabled regions) and links it to a `robos:PassCredential` reference node:

```json
{
  "@id": "urn:robos:integration:aws-production",
  "@type": "robos:DevOpsIntegration",
  "robos:category": "CloudInfrastructure",
  "robos:provider": "AWS",
  "robos:accountSlug": "acme-production-us-east-1",
  "robos:hasCredential": {
    "@id": "urn:robos:credential:aws-production-keys",
    "@type": "robos:PassCredential",
    "robos:passPath": "devops/cloud-infrastructure/aws/acme-production/access-key"
  }
}
```

Notice that **no password, token, or secret value appears anywhere in the JSON-LD document**. The file can be committed to public or private Git repositories with complete security confidence.

### 2. Standard UNIX Password Store (`pass`) Integration
RobOS relies on the battle-tested, open-source UNIX utility **`pass`**:
- Secrets are encrypted with your local GPG private master key (`gpg2`).
- Files are organized hierarchically: `~/.password-store/devops/<category>/<provider>/<account>/<key>.gpg`.
- Only the local authenticated developer or scoped ephemeral agent process can decrypt secrets into volatile memory at runtime.

### 3. Scoped Ephemeral Decryption
When an autonomous AI agent executes a build or deployment in an ephemeral RAM sandbox:
- The agent process requests credential injection via the RobOS security daemon.
- RobOS decrypts the secret into an environment variable directly within the agent's in-memory `tmpfs` space.
- The secret is never written to disk, never logged to stdout/stderr, and purged immediately upon process termination.

---

## Next Steps

- **[Explore All 10 RobOS Big Wins]({{ site.baseurl }}{% link big-wins.md %})**: Return to the Big Wins executive overview.
- **[Ephemeral In-Memory Sandboxes]({{ site.baseurl }}{% link big-wins/ephemeral-agent-sandboxes.md %})**: Learn how ephemeral Linux accounts isolate agents from host keys.
- **[KGraph-First App Generation & Modular Architecture]({{ site.baseurl }}{% link big-wins/kgraph-first-app-generation.md %})**: Read about the 6 standard namespaced package stores and 9 application archetypes.
- **[Existing Company Setup Guide]({{ site.baseurl }}{% link existing-company-setup.md %})**: Walk through configuring enterprise SSO and directory synchronization.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.

