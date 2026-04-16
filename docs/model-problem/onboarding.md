---
title: "Phase 3: Onboarding"
layout: default
parent: The Model Problem
nav_order: 3
---

# Phase 3: Developer Onboarding
{: .no_toc }

Alex joins the team and goes from zero to productive in 3 minutes.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 3.1 — First Login

Alex logs into the RobOS VM for the first time. The **Security Setup** app launches automatically:

<img src="{{ '/assets/images/icons/security-setup.svg' | relative_url }}" alt="Security Setup" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Security Setup**

![Security Setup]({{ '/assets/images/screenshots/security-setup.png' | relative_url }})

| Step | What Happens |
|:-----|:-------------|
| 1. GPG Key | Alex creates a GPG keypair for the encrypted password store |
| 2. SSH Key | Ed25519 key generated, public key copied to clipboard |
| 3. GitHub SSH | SSH key registered with GitHub via `gh ssh-key add` |
| 4. GitHub CLI | `gh auth login` flow completes, token stored securely |
| 5. Pass Store | Password store initialized with the new GPG key |

---

## 3.2 — Project Onboarding

Alex opens **Git Projects** and sees the two repos Jordan configured. Clicking **"Set Up"** on `buildbarn-forms` triggers the automated onboarding sequence:

### Step 1: Secrets Distribution
RobOS checks that Alex has the required secrets from `ROBOS.md`. Missing secrets are distributed from the Pass Manager (GPG-encrypted with Alex's key):
- `GITHUB_TOKEN` — GitHub personal access token
- `JIRA_API_TOKEN` — Jira API token for status sync

### Step 2: Software Installation
<img src="{{ '/assets/images/icons/dev-tools.svg' | relative_url }}" alt="Dev Tools" style="width: 32px; height: 32px; vertical-align: middle;"> **Dev Tools** reads the prerequisites from `ROBOS.md`:
- Node.js 20 — already installed ✓
- protoc 25 — not found → installs automatically with streaming progress
- GitHub CLI — already authenticated ✓

### Step 3: Repository Clone & Install
```
Cloning https://github.com/Hermetiq/buildbarn-forms → ~/projects/buildbarn-forms
Cloning https://github.com/Hermetiq/buildbarn-forms-proto → ~/projects/buildbarn-forms-proto
Running: npm install (buildbarn-forms)
Running: npm run proto:generate
```

### Step 4: Startup Script Verification
```
Running: npm run dev
✓ Storybook dev server started on http://localhost:6006
```

### Step 5: Test Script Verification
```
Running: npm test → ✓ 47 tests passing
Running: npm run test:e2e → ✓ 12 component tests passing
```

**Total onboarding time: ~3 minutes**, mostly waiting for `npm install`.

---

## 3.3 — Onboarding Complete

<img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" alt="Dev Central" style="width: 32px; height: 32px; vertical-align: middle;"> **App: Dev Central**

![Dev Central]({{ '/assets/images/screenshots/dev-central.png' | relative_url }})

Alex's dashboard now shows:
- **Sprint Board**: 10 stories in the BBF epic, BBF-1 is "ready to start"
- **Git Projects**: 2 repos cloned and healthy
- **Tools**: All prerequisites installed
- **Secrets**: All project secrets available

Alex is ready to start coding.
