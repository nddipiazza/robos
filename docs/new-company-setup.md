---
title: New Company Greenfield Setup
layout: default
nav_order: 6
---

# New Company Greenfield Setup in RobOS
{: .no_toc }

How greenfield startups and new software engineering organizations initialize RobOS from day one: 5-minute company bootstrap, initial root administrator provisioning, foundational team topologies, greenfield VCS organization setup, central AI provider model tiering, and starter C4 architecture.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Overview: The 5-Minute Startup Bootstrap

Starting a new software company traditionally involves weeks of friction: creating accounts on disparate platforms, copying `.env` secrets insecurely over chat, arguing about directory layouts, and manually writing boilerplate CI configurations.

RobOS changes this with a unified **Greenfield Company Bootstrap Wizard**. In under 5 minutes, a technical founder or founding engineer establishes:
1. **Company Identity & Root Admin**: Setting the organization domain, tenant metadata, and master administrator credentials.
2. **Foundational Team Topologies**: Structuring startup teams (Founding Core Engineering, Cloud Platform) directly into `.robos/teams.yaml`.
3. **Greenfield VCS Organization**: Connecting or creating a GitHub Organization or internal Gitea instance with standardized branch protection.
4. **Central AI Hub & Shared MCP Tools**: Centralizing LLM API keys (Anthropic Claude, Google Gemini/Antigravity, OpenAI) and configuring shared Model Context Protocol servers.
5. **Baseline Security & Starter Architecture**: Generating corporate cryptographic signing keys and an initial C4 Level 1 (System Context) Knowledge Graph.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/new-company-bootstrap.jpg' | relative_url }}" alt="Greenfield Startup Bootstrap Workflow" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Greenfield Startup Bootstrap Workflow</strong>: How the 5-minute interactive bootstrap activates root cryptographic signing, foundational team topologies, central AI provider hubs, and living C4 starter architecture. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## Step 1: Company Profile & Root Administrator Initialization

Starting a greenfield company begins with declaring who you are and defining your company tenant. In **Group Manager** (`packages/group-manager`), founders do this directly through the interactive **Greenfield Company Bootstrap Wizard**:

### 1. Interactive Bootstrap Wizard
1. **Inspect Identity State**: Group Manager displays an unlinked badge (`No Tenant / Unlinked`).
2. **Open Bootstrap Wizard**: Click **🚀 Bootstrap** in the sidebar.
3. **Configure Company & Root Administrator**:
   - **Company Legal Name**: `Acme Cloud Innovations`
   - **Domain Name / Slug**: `acmecloud.io`
   - **Root Administrator Full Name**: `Alex Rivera`
   - **Root Admin Corporate Email**: `alex@acmecloud.io`
   - **Root Admin Role**: `Chief Architect & VP Engineering`
4. **Execute Bootstrap**: Click **Bootstrap Organization & Activate Admin**.

### 2. Administrator Identity & Keyring Provisioning
RobOS immediately:
- Stores tenant configuration in `~/.config/robos/company.json`:
  ```json
  {
    "name": "Acme Cloud Innovations",
    "domain": "acmecloud.io",
    "slug": "acme-cloud",
    "founded": "2026",
    "createdAt": "2026-09-05T17:45:35Z"
  }
  ```
- Activates your root administrator identity in `~/.config/robos/identity.json` and `~/.config/robos/people/admin.json`:
  ```json
  {
    "uid": "admin",
    "displayName": "Alex Rivera",
    "name": "Alex Rivera",
    "email": "alex@acmecloud.io",
    "role": "Chief Architect & VP Engineering",
    "isRootAdmin": true,
    "company": "Acme Cloud Innovations",
    "team": "founding-core",
    "createdAt": "2026-09-05T17:45:35Z"
  }
  ```
- Sets global git author credentials (`git config --global user.name "Alex Rivera"` and `user.email "alex@acmecloud.io"`).
- Updates the active identity badge in the UI to **Alex Rivera · Chief Architect & VP Engineering · founding-core**.

---

## Step 2: Scaffolding Foundational Team Topologies & Knowledge Graph

Early-stage startups often make the mistake of assigning everything to everyone, leading to unclear code ownership and messy permissions. RobOS establishes clear **Team Topologies** from the start:

```yaml
version: "1.0"
kind: TeamRoster
organization: "Acme Cloud Innovations"
domain: "acmecloud.io"
initializedAt: "2026-09-05T17:45:35Z"
teams:
  - id: founding-core
    name: Founding Core Engineering
    topology: stream-aligned
    lead: admin
    members:
      - id: admin
        name: Alex Rivera
        type: human
        role: Approver
  - id: cloud-platform
    name: Cloud Platform & Infrastructure
    topology: platform
    lead: admin
    members:
      - id: admin
        name: Alex Rivera
        type: human
        role: Approver
```

### Modular KGraph Packages Registration
The bootstrap engine simultaneously registers the organization root admin and founding squads into the **Modular KGraph Packages** (`organization` package):
```json
{
  "@id": "urn:robos:person:admin",
  "@type": ["oslc:Person", "robos:Developer"],
  "dcterms:title": "Alex Rivera",
  "robos:email": "alex@acmecloud.io",
  "robos:handle": "admin",
  "robos:role": "Chief Architect & VP Engineering",
  "robos:memberOf": "urn:robos:team:founding-core"
}
```
As the company scales and hires new engineers, additional stream-aligned teams (e.g., Mobile, Billing, Analytics) or platform teams are added to `.robos/teams.yaml` and the Knowledge Graph without altering security boundaries.

---

## Step 3: Greenfield VCS Organization Setup

RobOS connects to your Git hosting provider:
1. **GitHub Organization**: Connects via GitHub OAuth to create repositories and manage team permissions.
2. **Internal Gitea Instance**: For privacy-focused or air-gapped startups, RobOS can deploy an internal Gitea server with zero external dependencies.
3. **Automated Branch Protection**: Configures baseline branch protection rules on `main`:
   - Require pull request reviews before merging.
   - Require status checks to pass before merging.
   - Require cryptographically signed commits.

---

## Step 4: Central AI Provider & Shared MCP Registry

Individual API keys scattered across developer machines lead to billing headaches and security risks. RobOS centralizes AI model management:
- **Central Model Providers**: Configures shared corporate keys for:
  - **Anthropic Claude** (Claude Sonnet / Claude Opus)
  - **Google Gemini & Antigravity** (Gemini Flash / Gemini Pro)
  - **OpenAI** (GPT / Codex)
  - **Local Ollama** (offline DeepSeek, Llama)
- **Shared MCP Tool Registry**: Configures local Model Context Protocol servers:
  - `system-mcp`: OS and system resource management.
  - `task-manager-mcp`: Issue backlog and sprint DAG dispatching.
  - `workspace-manager-mcp`: Git worktree creation and repo orchestration.
  - `ide-bridge-mcp`: Breakpoint debugging and IDE communication.

---

## Step 5: Starter C4 Architecture & Knowledge Graph

RobOS automatically generates an initial **C4 Level 1 (System Context)** diagram in the **Modular KGraph Packages** (`core-platform`):
- **Users**: Target customers, administrators, and external API consumers.
- **Software System**: Acme Cloud Innovations platform boundary.
- **External Dependencies**: Payment providers, third-party auth, and cloud hosting.

This starter graph serves as the foundation for the visual architecture canvas in **Topology Studio** and ensures that as new microservices or frontend apps are created, they are automatically placed within the system context.

---

## E2E Walkthrough & Proof of Work

See the complete, live end-to-end walkthrough video, audio narration, and verification logs:
* [👉 **New Company Greenfield Setup Walkthrough Video & Proof-of-Work**]({{ site.baseurl }}{% link walkthroughs.md %}#step-18-new-company-setup--greenfield-startup-bootstrap)

---

## Next Steps

- **[Develop a New App Guide]({{ site.baseurl }}{% link new-app-wizard.md %})**: Scaffold a new application across 9 archetypes.
- **[RobOS Big Wins]({{ site.baseurl }}{% link big-wins.md %})**: Discover core architectural innovations and strategic advantages.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.

