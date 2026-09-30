---
title: "7. The Review Theater & Running Your Creations"
layout: default
parent: For Non-Developers
grand_parent: Training
nav_order: 7
permalink: /training/for-non-developers/07-review-theater-and-running-apps.html
---

# Module 7: The Review Theater & Running Your Creations
{: .no_toc }

Step 4 of the lifecycle: How to verify autonomous agent work in the PR Review Theater using 1080p video proof-of-work and knowledge checks, and how to install and run your creations as desktop apps, web URLs, or game executables.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Quality Gate: Why You Never Blindly Approve

In the traditional software world, "Code Review" meant an exhausted senior engineer squinting at 800 lines of colored green and red diffs on GitHub, getting a headache, and typing: *"LGTM ("Looks good to me") 🚢"*.

Two hours later, the app crashes in production because nobody actually ran the code.

In RobOS, **blind rubber-stamping is physically impossible.**

When an autonomous AI agent finishes building a task, it submits its work to the **PR Review Theater** (`packages/pr-review`). The Review Theater turns review into an interactive, multi-modal governance flight simulator where you verify real proof-of-work before anything merges into your main branch.

---

## The Review Theater Journey

Let's step through the review workflow captured in our automated E2E tests:

### 1. The Pull Request Queue

When you open the Review Theater, all pending pull requests from your AI agents and human teammates appear in a clean, prioritized dashboard:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/pr-review-theater-01-queue.png' | relative_url }}" alt="PR Review Theater Pull Request Queue" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.1: The PR Review Theater queue showing pending pull requests and health status.</em></p>
</div>

Select a PR (e.g. `PR #14: Add Rotating QR Code Escrow Check-in`) to enter the review experience.

---

### 2. Stage 1: The 60-Second Knowledge Check

Before showing you raw technical diffs, the agent teaches you what it changed:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/pr-review-theater-03-stage1-elearning.png' | relative_url }}" alt="Reviewer Knowledge Check Quiz" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.2: Interactive knowledge check quiz verifying understanding before approval.</em></p>
</div>

- You read a quick bulleted summary of the changes.
- You answer a simple 2-question scenario quiz (e.g., *"What happens if a musician scans the QR code 6 hours after doors close?"*).
- Passing the quiz unlocks the **Approve** button and records a verified certificate to the Knowledge Graph!

---

### 3. Stage 3: Semantic Diff & Blast-Radius Inspector

Next, you inspect the files that were modified:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/pr-review-theater-06-stage3-diff-viewer.png' | relative_url }}" alt="In-App Semantic Diff Viewer" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.3: Semantic in-app file diff viewer with syntax highlighting and inline commenting.</em></p>
</div>

Unlike raw text diffs, RobOS highlights the **semantic blast radius**: which database tables, API routes, or character scenes were impacted, and whether any upstream contracts were touched.

---

### 4. Stage 5: 1080p Video Proof-of-Work

This is the crown jewel of RobOS governance. You don't have to guess if the code works—**you can watch it work**:

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/pr-review-theater-08-stage5-video.png' | relative_url }}" alt="1080p Video Proof of Work Playback" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.4: 1080p narrated video proof-of-work showing the feature executing end-to-end.</em></p>
</div>

- The video player plays an automated 1080p screen recording of the app executing inside the virtual framebuffer.
- On-screen captions and Piper TTS audio narrate every action: clicking the buttons, triggering the QR code, moving Sir Caleb, or disarming the dungeon trap.

---

### 5. Stage 6: Final Signoff & Atomic Merge

With the tests green, knowledge check passed, and video verified, you click **Sign Off &amp; Merge**.

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/pr-review-theater-09-stage6-signoff.png' | relative_url }}" alt="Final Signoff and Atomic Merge" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.5: Final signoff screen executing atomic git merge and updating living documentation.</em></p>
</div>

RobOS merges the branch, updates the Knowledge Graph, and cleans up the sandbox.

---

## How to Run & Distribute Your Creation

Now that your feature is merged, how do you and other people actually use it?

### Option A: Installed as a Native Desktop App
If you built a desktop tool or game editor:
- RobOS automatically generates a FreeDesktop `.desktop` entry.
- A 48×48 Lucide SVG icon is registered in the desktop shell.
- You can find it instantly by opening the **App Launcher** (`Super` key or panel icon):

<div style="margin: 1.5rem 0;">
  <img src="{{ '/assets/images/screenshots/app-launcher.png' | relative_url }}" alt="RobOS App Launcher Search Grid" class="robos-zoomable-img" style="display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid #30363d;" />
  <p style="text-align: center; color: #8b949e; font-size: 0.85rem; margin-top: 0.5rem;"><em>Screenshot 7.6: Your new app appears directly in the searchable RobOS App Launcher grid.</em></p>
</div>

You can right-click the icon to **Pin to Taskbar** or **Add to Desktop**.

---

### Option B: Running Web Apps in Google Chrome
If you built a web application like `getemgigs.com`:
- **Local Development**: Click **Run Dev Server** in Git Projects. Your default browser (Google Chrome) launches directly to `http://localhost:3000`.
- **Public Cloud URL**: With one click in **Kube Studio** or Vercel GitOps, your app deploys to the cloud (e.g. `https://www.getemgigs.com`) accessible from any smartphone, tablet, or laptop in the world.

---

### Option C: Playing Godot Games
If you built a video game like `crpg-realm`:
- **Native Game Run**: Click **Play Game** to boot the Godot 4.3 runtime engine and play with full 60 FPS graphics, spatial audio, and mouse controls.
- **Web Export (HTML5)**: Export with one click to HTML5 WASM to let friends play your game directly in any web browser without installing anything!

---

## Congratulations, Lead Architect! 🎓

You have completed the entire **For Non-Developers** training course!

Let's review the incredible superpowers you now possess:
1. **You direct autonomous AI coding agents** instead of wrestling with syntax errors.
2. **You curate Knowledge Graph context** so agents build the right things on the first try.
3. **You break down features visually in Task Planner** with DAG milestone graphs.
4. **You supervise agent execution in disposable sandboxes** with live breakpoint debugging.
5. **You govern quality through the PR Review Theater** with 1080p video proofs and knowledge checks.
6. **You run and ship real, working web applications and playable video games!**

---

### What's Next?
- Jump into **[RobOS Projects]({{ '/projects/' | relative_url }})** to explore the deep engine specifications for **The Gig Bandit** and **Tactical cRPG Realm**.
- Visit our **[Discord Community](https://discord.gg/6PjxzkHujE)** to share what you're building!
- Check back soon for **Track 2: Systems Architects &amp; Dual-State Knowledge Graph Modeling**!
