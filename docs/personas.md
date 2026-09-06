---
title: User Personas
layout: default
nav_order: 14
---

# User Personas & Real-World Workflows
{: .no_toc }

How RobOS transforms everyday work for engineering leads, software developers, DevOps engineers, and product managers.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Lead Architect / Tech Lead

### What You Care About
Keeping the big picture clean: ensuring new features don't break existing services, enforcing archetype contracts across services and frontends, maintaining clean API standards, and approving AI solution plans before code gets merged.

### Daily Applications
- **System Topology Studio**: Visually map services, check downstream impact (blast radius), and auto-generate Kubernetes deployment files.
- **RobOS App Wizard**: Scaffold greenfield applications and verify archetype standards across microservices, desktop apps, CLI tools, mobile apps, and data pipelines.
- **RobOS Group Manager**: Organize Team Topologies (stream-aligned, platform, enablement, and complicated-subsystem squads) and assign component ownership.
- **Contract Studio**: Review and validate API contracts (REST, gRPC, and event streams) with live mock servers.
- **Dev Central & PR Review Board**: Review AI solution plans, test edge cases, and approve pull requests with one click.

### Typical Workflow
1. **Design System Architecture**: Visually adds new services or databases on the interactive architecture canvas.
2. **Govern Archetypes & Teams**: Sets squad ownership in **Group Manager** and standardizes service scaffolding in **App Wizard**.
3. **Review AI Proposals**: When an AI agent picks up a task, the architect reviews the AI's proposed solution plan before any code is modified.
4. **Watch Video Proof & Approve**: Watches the 30-second narrated verification video and approves the pull request.

---

## 2. Software Engineer / Developer

### What You Care About
Shipping features and solving tricky bugs without wasting hours setting up test databases, configuring compilers, or writing repetitive boilerplate.

### Daily Applications
- **RobOS App Wizard**: Scaffold new components in seconds or import existing repositories with automatic stack detection.
- **Task Planner & Issue Board**: Pick up tasks with automatic Git workspace and devcontainer setup.
- **Git Projects**: Connect all your Git repos with one-click setup scripts (`dev-setup.sh`) and encrypted password management.
- **Developer Protocol Suite**: Fast database managers (Postgres, MySQL, Oracle, MongoDB, Redis) and the Git-backed REST client.
- **IDE & PR Review Bridge**: Optionally open projects and pull requests directly in IntelliJ IDEA or VS Code with full project context in tow, with interactive breakpoint debugging on demand.

### Typical Workflow
1. **Onboard & Scaffold**: Set up your company in **Group Manager** or scaffold/import codebases via **App Wizard**.
2. **Pick Up a Ticket**: Select a task; RobOS provisions the isolated workspace, starts background services, and prepares the dev environment.
3. **Review the AI's Fix & Plan**: Review the AI's proposed solution plan before authorizing code generation, using breakpoint debugging if runtime variable inspection is needed.
4. **Review PR in IDE or RobOS**: Review diffs and automated audits in the Agent Code Review Platform or inside your IDE (IntelliJ / VS Code) with full context in tow, then approve and merge with 1 click.

---

## 3. DevOps & Platform Engineer

### What You Care About
Keeping Kubernetes clusters stable, automating enterprise identity sync, preventing cloud cost waste, automating deployments, and connecting AI tools securely.

### Daily Applications
- **RobOS Group Manager**: Configure automated SCIM 2.0 and LDAP directory synchronization with Okta, Azure AD, and OpenLDAP.
- **Kube Studio**: Visual control room for Kubernetes clusters (Kind, AWS EKS, Google Cloud GKE, Azure AKS) with live container log streaming.
- **RobOS Data Sources**: Connect and manage company databases, AWS S3 storage buckets, and Kafka streaming topics.
- **MCP Manager**: Connect and authenticate AI tool servers (Claude Code, Google Antigravity, GitHub Copilot, Gemini) with secure OAuth login popups.
- **Deploy Tracker & CI Monitor**: Monitor live rollouts, team health metrics (DORA metrics), and automated failure diagnosis.

### Typical Workflow
1. **Directory & Cluster Setup**: Syncs corporate employee directories in **Group Manager** and connects Kubernetes clusters in **Kube Studio**.
2. **AI Tool Governance**: Configures secure tool bridges so AI assistants can safely query databases and trigger tests.
3. **Deployment Monitoring**: Watches automated deployments and streams real-time container logs.

---

## 4. Product Owner / Engineering Manager

### What You Care About
Turning user requirements into clear, actionable sprint tickets, managing team topologies and squad rosters, tracking real progress, and knowing what is shipping without micromanaging developers.

### Daily Applications
- **Dev Central**: High-level daily dashboard with sprint progress, PR health, blocker radar, and release timelines.
- **RobOS Group Manager**: Company tenant administration, team topology modeling, and active user roster verification.
- **Task Planner**: Type a feature idea in plain English; RobOS breaks it down into a step-by-step roadmap synced with GitHub Issues or Jira.
- **Deploy Tracker**: Real-time deployment timeline and team health metrics (Deployment Frequency, Lead Time, Change Failure Rate).

### Typical Workflow
1. **Manage Team Roster & Tenants**: Configures company departments, squads, and roles in **Group Manager**.
2. **Break Down Big Goals**: Types a high-level feature goal in plain English; RobOS generates a step-by-step task checklist ordered by prerequisites.
3. **Sprint & Blocker Oversight**: Monitors automated task movement and blocker radar on the Dev Central dashboard.
4. **Release Verification**: Inspects verified video walkthroughs before production rollouts.

