---
title: "Onboarding Your App in App Wizard"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 2
permalink: /training/for-non-developers/02-onboarding-your-app.html
---

# Onboarding Your App in App Wizard
{: .no_toc }

How to pick an application archetype, configure team identity, define data contracts, and let RobOS scaffold the complete project into the Knowledge Graph.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Starting with a Clean Slate (No Blank Page Syndrome)

Starting a new software project is usually terrifying for non-developers. Where do you even begin? Do you create a GitHub repository? What folder structure should you use? Which build tools, test runners, and linting rules are needed?

In RobOS, you never start with a blank folder. You start in the **RobOS App Wizard** (`packages/app-wizard`).

The App Wizard is an interactive visual stepping engine that asks you a few simple questions, generates the complete multi-file project skeleton, sets up all Git repositories, and registers the project into the SDLC Knowledge Graph.

---

## The Archetype Comparison Matrix

Before opening the wizard, decide which archetype matches your product vision:

| Archetype | Flagship Example | Under the Hood Tech | Best Suited For |
|:---|:---|:---|:---|
| **Web Application (SPA/SSR)** | **`getemgigs.com`** | Next.js 15, React 19, TailwindCSS, Neon Postgres | SaaS products, marketplaces, customer portals, mobile-first web apps |
| **PC Video Game** | **`crpg-realm`** | Godot 4.3, GL Compatibility, 2.5D Isometric, D&D 5e SRD | 2D/3D video games, tactical RPGs, dungeon crawlers, simulations |
| **Desktop Tool** | **`app-launcher`** | Electron, Vanilla JS, Lucide icons, native IPC bridge | Internal developer tools, admin utilities, offline dashboards |
| **Microservice Backend** | **`billing-api`** | Node.js, Go, or Python with OpenAPI 3.1 &amp; Protobuf gRPC | High-performance data pipelines, transaction processors, APIs |

---

## The App Onboarding Flow

Let's walk through the screens captured during our automated E2E test runs.

### Choose Your Application Archetype

When you open App Wizard from the desktop or App Launcher, the first screen presents the **Archetype Selector**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }}" alt="App Wizard Archetype Selection Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Selecting your project archetype in the App Wizard.</em></p>
</div>

- Review the available archetype cards.
- For a website or marketplace, select **Web Application (Next.js)**.
- For a role-playing game or tactical simulator, select **PC Video Game (Godot 4)**.
- Click **Next: Identity &amp; Team**.

---

### Configure App Identity & Team Ownership

Every great project needs an identity and an owner. In this step, you provide the human-readable name, a machine identifier (slug), a brief description, and assign the owning squad from your organization's directory.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-identity-team_frame.png' | relative_url }}" alt="App Identity and Team Assignment" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Defining project metadata, repository namespace, and squad ownership.</em></p>
</div>

| Form Field | What to Enter (Example: Web App) | What to Enter (Example: Game) |
|:---|:---|:---|
| **Display Name** | The Gig Bandit &amp; Get 'Em Gigs | Tactical cRPG Realm of Heroes |
| **Project Slug** | `getemgigs` | `crpg-realm` |
| **Owning Squad** | Band Experience Squad (`squad:band-exp`) | Game Core Engineering (`squad:game-core`) |
| **Description** | Reciprocal buddy gig escrow &amp; venue booking | Party-based tactical isometric RPG in Godot 4 |

> [!TIP]
> **Why Team Ownership Matters**: In RobOS, autonomous agents route pull requests, issue notifications, and compliance policies based on the team topology. Assigning an owning squad ensures that tasks, notifications, and code reviews are organized neatly and never get lost in a generic inbox.

---

### Define Contracts & Schemas

In traditional development, frontends and backends constantly get out of sync because someone changed a database column without telling the UI team. RobOS eliminates this by making **Contract Specifications** first-class citizens.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-contract-spec_frame.png' | relative_url }}" alt="App Contract Specifications" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Declaring data contracts, API protocols, and schema shapes.</em></p>
</div>

Here you specify:
- The data protocols your app uses (REST OpenAPI 3.1, Protobuf gRPC, or GraphQL).
- Key entity models (e.g. `Band`, `Gig`, `EscrowAgreement`, or `HeroPlayer`, `InventoryItem`, `QuestDAG`).
- Don't worry if you don't know the exact schema yet—RobOS provides starter templates you can visually modify later.

---

### Review the Scaffolding Blueprint

Before touching any disk or Git files, RobOS generates a comprehensive **Scaffolding Blueprint**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-scaffold-blueprint_frame.png' | relative_url }}" alt="Scaffolding Blueprint Preview" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Reviewing generated file trees, dependency manifests, and Knowledge Graph nodes.</em></p>
</div>

The blueprint previews:
- Every file and directory that will be generated (e.g. `package.json`, `tailwind.config.js`, starter components).
- The Git repository initialization script.
- The exact Knowledge Graph nodes (`robos:FrontEndApp`, `schema:VideoGame`, etc.) being registered.

Click **Generate Project** to execute the blueprint.

---

### Scaffolding Complete & Registered in Knowledge Graph

In seconds, RobOS scaffolds the codebase, creates the local Git repository, builds the initial branch, and registers the application into `.robos/kgraphs/applications/package.jsonld`.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-scaffold-complete_frame.png' | relative_url }}" alt="Scaffolding Complete Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Application successfully bootstrapped and ready for planning.</em></p>
</div>

---

## Under the Hood: What Did RobOS Actually Write?

You don't need to edit this by hand, but here is what RobOS created in the background:

```json
{
  "@id": "urn:robos:app:getemgigs",
  "@type": ["oslc_am:Resource", "schema:WebApplication", "robos:FrontEndApp"],
  "dcterms:title": "The Gig Bandit & Get 'Em Gigs",
  "dcterms:description": "Reciprocal buddy gig escrow & venue booking web app.",
  "robos:repository": "github.com/nddipiazza/thegigbandit",
  "robos:technology": "Next.js 15 / React 19 / TailwindCSS",
  "robos:ownerSquad": "urn:robos:org:squad:band-exp",
  "robos:runtimeEnvironment": "Vercel Serverless Edge",
  "robos:database": "urn:robos:db:neon-postgres"
}
```

Look at how clear and structured that is!
- Any AI agent that works on this project now knows **exactly** what tech stack to use (Next.js 15, not an outdated React 16).
- It knows which database is connected (Neon Postgres).
- It knows which squad owns it.
- **The AI never has to hallucinate basic facts.**

---

## What About Existing Code? (The Ingestion Wizard)

What if you already have an existing project on GitHub that you want to bring into RobOS?

The App Wizard includes an **Import / Ingestion Wizard** that scans any local folder or Git repository:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/import-app-source-select_frame.png' | relative_url }}" alt="Brownfield App Ingestion Source Select" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Importing an existing codebase into RobOS.</em></p>
</div>

The Ingestion engine reads your `package.json`, `project.godot`, or backend routes, automatically infers the architecture, and creates Knowledge Graph nodes so agents immediately understand your existing system.

---

## Hands-On Lab: Onboarding Your First Sandbox App

To complete this module, let's execute your first onboarding:
- Open **App Wizard** from the desktop panel or App Launcher.
- Select **PC Video Game (Godot 4)**.
- Name it `my-first-rpg` and assign it to `Game Core Engineering`.
- Leave the default starter contracts enabled.
- Click **Generate Project**.
- When the success screen appears, click **Open in Task Planner**!

---

Proceed to **[Visual Project &amp; Task Planning]({{ '/training/for-non-developers/03-visual-task-planning.html' | relative_url }})** to learn how to break your dream features into visual, bite-sized tasks!
