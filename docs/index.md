---
layout: home
title: Home
nav_order: 1
---

# RobOS Documentation

**RobOS** is an AI-powered Software Delivery Lifecycle Operating System built on Ubuntu. Every part of the desktop experience is purpose-built for software engineers and their daily workflow — picking up Jira tickets, writing code, reviewing PRs, and shipping.

---

## Quick Navigation

| Section | Description |
|---------|-------------|
| [What We Built](what-we-built) | Full project overview — OS stack, architecture, and all components |
| [Boot Splash](boot-splash) | How the two-phase ROBOS ASCII splash screen works |
| [App Development](app-development) | Guide for building Electron apps on RobOS |
| [IntelliJ Plugin](intellij-plugin) | RobOS IntelliJ plugin IPC API reference |
| [RobOS App Suite](robos-app-suite/) | Documentation for every app in the suite |

---

## Core Concepts

- **Virtual Desktops = Tickets** — each open Jira ticket gets its own GNOME virtual desktop, pre-loaded with everything needed to work the issue
- **MCP-powered** — Model Context Protocol servers connect Claude to Jira, GitHub, IDEs, VPNs, and more
- **Ambient AI** — a voice agent, camera-based focus tracker, and calendar integration make the OS an active participant in the developer's day
- **Role-aware** — Developer, Dev Manager, and Feature Reviewer modes tailor the experience to the task at hand

---

## Getting Started

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Ubuntu 22.04+
pnpm install
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, JIRA_*, GITHUB_TOKEN in .env
pnpm --filter "./packages/mcp-servers/**" build
pnpm --filter sprint-daemon dev
```
