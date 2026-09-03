---
nav_exclude: true
---

# Story: Desktop Manager — System Tray and IPC Hub

**Epic:** [System Services & Desktop Integration](epic.md)  
**Status:** Done  
**Points:** 8  

## Description

Central process that coordinates application lifecycles (launch, kill, restart keep-alive apps, watchdog supervision). Provides a high-performance Unix domain socket IPC hub (`/run/user/{uid}/robos-dm.sock` with `/tmp` safe fallback) for inter-app communication, notification dispatching, unread count polling, and process status inspection. `APP_REGISTRY` defines all known apps with categories and keep-alive watchdog flags.

## Acceptance Criteria

- [x] Integrates with other RobOS apps via Unix domain socket (`robos-dm.sock`) and Electron IPC
- [x] Follows RobOS dark theme (`--bg-primary: #0d1117`) and desktop conventions
- [x] Runs reliably as a background service with watchdog process supervision
- [x] Verified via headless containerized E2E test suite in Xvfb (`packages/robos-test/tests/desktop-manager/e2e.test.js`) with 100% pass rate.
