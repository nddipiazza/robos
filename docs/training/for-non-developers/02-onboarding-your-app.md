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

Starting a new software project is usually terrifying for non-developers. Where do you even begin? Do you create a repository? What folder structure should you use? Which build tools, test runners, and linting rules are needed?

> [!NOTE]
> **What Are Git and GitHub? (A Friendly 30-Second Primer)**  
> If you have ever heard programmers talk about "Git" or "GitHub" and had no idea what they meant, think of it like this:
> - **GitHub is like Google Drive or Dropbox for software**: It is a secure cloud locker where project files live so you never lose your work and your team (and AI agents) can collaborate.
> - **Git is an automatic file time machine**: Every time an AI agent saves a task, Git records a snapshot. If something ever breaks, you can rewind time with one click back to any previous working state—just like checking the version history in Google Docs.
> - **In RobOS, you never have to learn Git commands**: RobOS operates the time machine and saves all project history automatically behind the scenes.

In RobOS, you never start with a blank folder. You start in the **RobOS App Wizard** (`packages/app-wizard`).

The App Wizard is an interactive visual stepping engine that asks you a few simple questions, generates the complete multi-file project skeleton, initializes your project history timeline, and registers the project into the Knowledge Graph.

---

## The Archetype Comparison Matrix

Before opening the wizard, decide which archetype matches your product vision:

| Archetype | Flagship Example | Under the Hood Tech | Best Suited For |
|:---|:---|:---|:---|
| **Web Application (Modern Web)** | **`getemgigs.com`** | Next.js 15, React 19, TailwindCSS, Neon Postgres | SaaS products, marketplaces, customer portals, mobile-first web apps |
| **PC Video Game** | **`crpg-realm`** | Godot Engine, 2.5D Isometric, Tabletop RPG Rules | 2D/3D video games, tactical RPGs, dungeon crawlers, simulations |
| **Desktop Tool** | **`app-launcher`** | Electron, Vanilla JS, Lucide icons, Desktop Window Bridge | Internal developer tools, admin utilities, offline dashboards |
| **Backend Data Engine** | **`billing-api`** | Behind-the-scenes service | High-performance data processing, payments, and background calculations |

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

In traditional software development, the visual screens (the "frontend") and the behind-the-scenes data engines (the "backend") constantly get out of sync because someone changed a database rule without telling the screen designers. RobOS eliminates this by making **Data Agreements (Contract Specifications)** first-class citizens.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-contract-spec_frame.png' | relative_url }}" alt="App Contract Specifications" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Declaring data agreements, communication protocols, and visual shapes.</em></p>
</div>

Here you specify:
- How your app communicates with data (web-standard REST APIs, GraphQL, or fast messaging protocols).
- Key information models (for example, `Band`, `Gig`, and `EscrowAgreement` for a music app, or `HeroPlayer`, `InventoryItem`, and `Quest` for a game).
- Don't worry if you don't know the exact details yet—RobOS provides ready-to-use starter templates you can visually customize anytime.

---

### Review the Scaffolding Blueprint

Before touching any disk or Git files, RobOS generates a comprehensive **Scaffolding Blueprint**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-scaffold-blueprint_frame.png' | relative_url }}" alt="Scaffolding Blueprint Preview" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Reviewing generated file trees, dependency manifests, and Knowledge Graph nodes.</em></p>
</div>

The blueprint previews:
- Every file and directory that will be generated (such as project configuration files, visual themes, and starter screens).
- The Git repository initialization script.
- The exact Knowledge Graph records (such as your visual app and data models) being registered.

Click **Generate Project** to execute the blueprint.

---

### Scaffolding Complete & Registered in Knowledge Graph

In seconds, RobOS scaffolds the codebase, creates the local Git repository, builds the initial branch, and registers the application into the RobOS Knowledge Graph catalog.

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

What if you already have an existing project in a folder on your computer or hosted online on GitHub that you want to bring into RobOS?

The App Wizard includes an **Import / Ingestion Wizard** that scans any local folder or project repository:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/import-app-source-select_frame.png' | relative_url }}" alt="Brownfield App Ingestion Source Select" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Importing an existing codebase into RobOS.</em></p>
</div>

The Ingestion engine reads your project configuration files (like `package.json` for web apps or `project.godot` for games), automatically infers the architecture, and registers Knowledge Graph records so agents immediately understand your existing system.

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
