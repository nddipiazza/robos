# Story 31.06: App, Package & Runtime Manager (Devcontainers, Mise, Nix)

**Epic:** [RobOS — Agent-First Software Lifecycle OS](epic.md)  
**Status:** Done  
**Points:** 8  

---

## 1. Overview & Problem Statement

Software applications and microservices have complex runtime dependencies: language runtimes (Node 20, Java 21, Python 3.12, Go 1.22), database daemons, Redis caches, and environment variables. Without standardized runtime containerization, AI agents frequently break local environments or produce code that fails on other developer machines.

Story 31.06 delivers the **App, Package & Runtime Manager** (`packages/package-manager`), standardizing on **Development Containers (`.devcontainer`)**, **Mise**, and **Devenv/Nix** for reproducible environment isolation.

### Core Capabilities
- **Devcontainer Environment Specification**: Standardizes runtime isolation on `.devcontainer/devcontainer.json` and Docker Compose.
- **Polyglot Tool Versioning via Mise**: Automatically provisions Node.js, Java, Python, Go, and Rust runtimes.
- **Background Daemon Supervision**: Starts, stops, and restarts background databases, brokers, and microservices with automatic port binding.
- **Live Healthz Probing**: Sub-millisecond HTTP `/healthz` probing providing real-time green/red health telemetry.
- **Real-Time Log Streamer**: Live stdout/stderr container process logging.
- **GitOps Multi-Branch Versioning**: 2-way sync with `.robos/packages.yaml`.

---

## 2. Acceptance Criteria

- [x] All declared packages in `.robos/packages.yaml` can be inspected, started, stopped, and restarted from the GUI.
- [x] Devcontainer environments spin up using standard `.devcontainer/devcontainer.json` specifications.
- [x] Real-time stdout/stderr log streaming displays container events with timestamps.
- [x] Sub-millisecond `/healthz` probing verifies service health status.
- [x] Verified with unit and automated E2E tests (`packages/robos-test/tests/sdlc-graph/package-manager.test.js`) and persistent walkthrough archive in `~/.robos/development/walkthroughs/package-manager/`.
