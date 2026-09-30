---
title: "2. Onboarding Your App in App Wizard"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 2
permalink: /training/for-non-developers/02-onboarding-your-app.html
---

# Module 2: Onboarding Your App in App Wizard
{: .no_toc }

Step 1 of the lifecycle: How to pick an application archetype, configure team identity, define data contracts, and let RobOS scaffold the complete project into the Knowledge Graph.
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

## Step-by-Step: The 5-Step App Onboarding Flow

Let's walk through the exact screens captured during our automated E2E test runs.

### Step 1: Choose Your Application Archetype

When you open App Wizard from the desktop or App Launcher, the first screen presents the **Archetype Selector**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }}" alt="App Wizard Archetype Selection Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.1: Selecting your project archetype in the App Wizard.</em></p>
</div>

RobOS provides battle-tested starter blueprints across multiple project types:
- **Web Application SPA/SSR**: Complete Next.js 15, React 19, TailwindCSS stack with API routing (used for **`getemgigs.com`**).
- **PC Video Game**: Complete Godot 4.3 project with 2.5D isometric geometry, character bodies, and RTwP combat (used for **`crpg-realm`**).
- **Desktop Electron Tool**: Vanilla JS, zero-dependency dark-themed native app for Linux, Mac, and Windows.
- **Microservice Backend**: Node.js, Go, or Python REST and gRPC services with OpenAPI specs.

Select your desired archetype and click **Next: Identity &amp; Team**.

---

### Step 2: Configure App Identity & Team Ownership

Every great project needs an identity and an owner. In Step 2, you provide the human-readable name, a machine identifier (slug), a brief description, and assign the owning squad from your organization's directory.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-identity-team_frame.png' | relative_url }}" alt="App Identity and Team Assignment" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.2: Defining project metadata, repository namespace, and squad ownership.</em></p>
</div>

Why does team ownership matter?
- In RobOS, autonomous agents route pull requests, issue notifications, and compliance policies based on the team topology.
- For example, if you are building the `getemgigs.com` web portal, assigning it to **Band Experience Squad** ensures that related task boards and notifications stay neatly organized.

---

### Step 3: Define Contracts & Schemas

In traditional development, frontends and backends constantly get out of sync because someone changed a database column without telling the UI team. RobOS eliminates this by making **Contract Specifications** first-class citizens.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-contract-spec_frame.png' | relative_url }}" alt="App Contract Specifications" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.3: Declaring data contracts, API protocols, and schema shapes.</em></p>
</div>

Here you specify:
- The data protocols your app uses (REST OpenAPI 3.1, Protobuf gRPC, or GraphQL).
- Key entity models (e.g. `Band`, `Gig`, `EscrowAgreement`, or `HeroPlayer`, `InventoryItem`, `QuestDAG`).
- Don't worry if you don't know the exact schema yet—RobOS provides starter templates you can visually modify later.

---

### Step 4: Review the Scaffolding Blueprint

Before touching any disk or Git files, RobOS generates a comprehensive **Scaffolding Blueprint**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-scaffold-blueprint_frame.png' | relative_url }}" alt="Scaffolding Blueprint Preview" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.4: Reviewing generated file trees, dependency manifests, and Knowledge Graph nodes.</em></p>
</div>

The blueprint previews:
1. Every file and directory that will be generated.
2. The Git repository initialization script.
3. The exact Knowledge Graph nodes (`robos:FrontEndApp`, `schema:VideoGame`, etc.) being registered.

Click **Generate Project** to execute the blueprint.

---

### Step 5: Scaffolding Complete & Registered in Knowledge Graph

In under three seconds, RobOS scaffolds the codebase, creates the local Git repository, builds the initial branch, and registers the application into `.robos/kgraphs/applications/package.jsonld`.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/new-app-scaffold-complete_frame.png' | relative_url }}" alt="Scaffolding Complete Screen" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.5: Application successfully bootstrapped and ready for planning.</em></p>
</div>

With one click on **Open in Task Planner**, you are ready to start planning your features!

---

## What About Existing Apps? (The Ingestion Wizard)

What if you already have an existing project on GitHub that you want to bring into RobOS?

The App Wizard includes an **Import / Ingestion Wizard** that scans any local folder or Git repository:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/import-app-source-select_frame.png' | relative_url }}" alt="Brownfield App Ingestion Source Select" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 2.6: Importing an existing codebase into RobOS.</em></p>
</div>

The Ingestion engine reads your `package.json`, `project.godot`, or backend routes, automatically infers the architecture, and creates Knowledge Graph nodes so agents immediately understand your existing system.

---

## Summary Checklist

| Action | Done Via | Outcome |
|:---|:---|:---|
| Select Project Archetype | App Wizard Step 1 | High-level technology stack configured |
| Assign Team &amp; Metadata | App Wizard Step 2 | Ownership and notification routing wired |
| Declare Data Contracts | App Wizard Step 3 | Schemas defined so AI never guesses |
| Execute Scaffolding | App Wizard Step 4 &amp; 5 | Git repository created &amp; Knowledge Graph node linked |

Now that your project foundation is laid, it's time to build your feature roadmap!

Proceed to **[Module 3: Visual Project &amp; Task Planning]({{ '/training/for-non-developers/03-visual-task-planning.html' | relative_url }})**!
