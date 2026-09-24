---
title: DevOps Security & Password Store
layout: default
parent: RobOS Main Wins
nav_order: 10
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

> **RobOS provides interactive onboarding wizards across categories and cloud providers with zero plaintext credentials stored in the Knowledge Graph or Git repositories.**

All sensitive API keys, private certificates, and tokens are encrypted locally using **GPG** and stored directly into the standard **UNIX password store (`pass`)** at `~/.password-store/devops/`. The RobOS Knowledge Graph stores first-class **`robos:PassCredential` reference nodes** that declare the secure path to the credential without ever exposing the sensitive secret.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/devops-wizard-categories_frame.png' | relative_url }}" alt="DevOps Account Integrations Wizard in RobOS" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS DevOps Account Integrations Wizard</strong>: Guided connection wizards covering infrastructure categories and cloud providers with zero plaintext secrets. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## The Categories & Supported Providers

RobOS includes purpose-built onboarding wizards across essential infrastructure domains:

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

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/devops-security-pass-pipeline.jpg' | relative_url }}" alt="DevOps Security with GPG Password Store Pipeline" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>DevOps Security & GPG Password Store Pipeline</strong>: Guided connection wizards encrypting tokens into UNIX <code>pass</code> with GPG, referenced by KGraph nodes with zero plaintext in Git. <em>(Click image to zoom full screen)</em>
  </div>
</div>

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

## Runtime LLM Prompt Security Guard (Gitleaks, TruffleHog, Presidio, OWASP LLM01)

While the GPG password store protects infrastructure credentials at rest, developers interacting with AI agents often inadvertently paste stack traces, terminal logs, or configuration snippets containing sensitive API keys, customer PII, or internal tokens into prompt fields. Autonomous agents receiving user instructions might also be subjected to prompt injection attacks or instruction override payloads.

To guarantee zero data leakage into LLM model contexts, RobOS equips the platform with an **OSS-Standard Prompt Security Guard**:

### Multi-Standard Open Source Alignment
- **Secret Detection (Gitleaks & TruffleHog)**: High-precision regex rules covering AWS access keys, GitHub Personal Access Tokens (classic `ghp_` and fine-grained `github_pat_`), GitLab tokens, Slack tokens, Stripe API keys, OpenAI (`sk-...`), Anthropic (`sk-ant-...`), Google Cloud API keys, asymmetric PEM private keys (`-----BEGIN RSA PRIVATE KEY-----`), JWTs, database connection URIs with masked passwords (`postgres://user:***@host/db`), and HTTP Basic Auth URLs.
- **Algorithmic Shannon Entropy**: Computes mathematical character entropy on candidate strings to catch high-entropy random secrets and cryptographic keys that don't match specific vendor prefixes.
- **PII Detection (Microsoft Presidio)**: Detects US Social Security Numbers, phone numbers, personal email addresses, RFC 1918 private IP addresses, and credit cards with **Luhn algorithm checksum validation**.
- **Prompt Injection Defense (OWASP LLM01)**: Intercepts system prompt overrides (`ignore previous instructions`), DAN/jailbreak patterns, and dangerous shell exfiltration commands (`cat ~/.ssh/id_rsa`, `pass show`, etc.).

### Multi-Tier Defense Fabric
1. **Interactive Shadow DOM UI (`<robos-ai-textarea>`)**:
   - Real-time debounced background scanning with visual security badge (`🛡️ Secure` or `⚠️ N Sensitive`).
   - Non-intrusive warning banner identifying detected risks.
   - 1-Click **"✦ Auto-Redact"** button that immediately masks sensitive values in place.
2. **Harness & Agent Router Interceptions**:
   - `AgentSession.start()` and `EmbeddedHarnessRouter.runTask()` intercept all prompts before transmission to Claude Code, GitHub Copilot CLI, Gemini CLI, or Antigravity.
   - In `redact` mode (default), sensitive values are automatically replaced with safe masks (`[REDACTED_AWS_ACCESS_KEY]`, `[REDACTED_CREDIT_CARD]`, etc.) while preserving prompt semantics.
   - In `block` mode, execution aborts with a `PromptSecurityError` and a security violation notice.
3. **Audit Logging & Preferences**:
   - Every scan detection and redaction event is logged to `~/.config/robos/prompt-security-audit.json`.
   - Desktop preferences (`packages/robos-preferences`) allow teams to configure enforcement policy (`redact`, `block`, `warn`, `audit-only`, `off`), entropy thresholds, and custom allowlists/blocklists.
4. **Knowledge Graph Registration**:
   - Registered as `urn:robos:security:prompt-security-guard` in `.robos/kgraphs/core-platform/package.jsonld` under OSLC Architecture Management.

---

## Next Steps

- **[Explore RobOS Main Wins]({{ site.baseurl }}{% link big-wins.md %})**: Return to the Main Wins executive overview.
- **[Ephemeral In-Memory Sandboxes]({{ site.baseurl }}{% link big-wins/ephemeral-agent-sandboxes.md %})**: Learn how ephemeral Linux accounts isolate agents from host keys.
- **[KGraph-First App Generation & Modular Architecture]({{ site.baseurl }}{% link big-wins/kgraph-first-app-generation.md %})**: Read about the standard namespaced package stores and application archetypes.
- **[Existing Company Setup Guide]({{ site.baseurl }}{% link existing-company-setup.md %})**: Walk through configuring enterprise SSO and directory synchronization.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.

