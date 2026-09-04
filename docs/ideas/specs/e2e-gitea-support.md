---
layout: default
nav_exclude: true
---

# Feature Spec: Hermetic Gitea Git Forge for E2E Test Suite

- **Status**: Draft
- **Created Date**: 2026-09-03
- **Target Component**: Test Harness / Container E2E (`packages/robos-test`, `scripts/e2e-container.sh`)
- **Author/Idea Source**: User Idea

## 1. Overview & Vision
Currently, RobOS end-to-end (E2E) testing harnesses (`packages/robos-test`, `./scripts/e2e-container.sh`) test UI scenarios using mock data, local Git repositories, or simulated states. However, apps such as `git-projects`, `issue-manager`, `git-login-manager`, and `group-manager` interact with remote Git platforms (repositories, clone/push/pull operations, issues, pull requests, organization memberships, and OAuth workflows). Testing these against live GitHub APIs during automated or sandboxed CI/E2E runs introduces flakiness, network dependencies, API rate limiting, and security risks.

This feature introduces a lightweight, hermetic, container-native **Gitea Git Forge Service** integrated directly into the RobOS E2E test framework. Gitea will be spun up on-demand during test execution (or pre-bundled in the E2E Docker container), pre-seeded with test organizations, repositories, branches, issues, and users, allowing RobOS apps and AI agents to execute genuine Git remote operations, issue management, PR lifecycles, and webhook flows in a 100% offline, reproducible environment.

## 2. User Stories & Use Cases
- **As an** engineer working on RobOS apps (`git-projects`, `issue-manager`),
- **I want** E2E test suites to run against a fully functional, local Git forge (Gitea),
- **So that** I can test end-to-end Git cloning, commits, branch switching, pushing, issue tracker sync, and PR creation without relying on live GitHub network access or hitting API rate limits.

- **As a** CI/CD maintainer,
- **I want** hermetic, fast-booting test fixtures with pre-seeded users and repositories,
- **So that** E2E tests run consistently in isolated Docker containers with zero external credentials.

## 3. Key Capabilities & Scope
- [ ] **Containerized Gitea Test Service**:
  - Bundle a lightweight Gitea binary or container sidecar into the `robos-e2e` test environment.
  - Rapid zero-config ephemeral startup (SQLite backend, sub-second boot time).
- [ ] **Automated Seed Fixtures & Test Data Generator**:
  - Seed admin user, standard test user accounts (`robos-tester`, `agent-reviewer`), and test organizations (`test-org`).
  - Pre-populate sample repositories (with branches, commit histories, READMEs, and `.idea` run configurations).
  - Seed issues with labels, milestones, assignees, and pull requests to validate `issue-manager` Kanban boards.
- [ ] **Forge API Compatibility Layer / GitHub API Mirroring**:
  - Expose standard Git HTTP/SSH clone URLs (`http://localhost:3000/test-org/sample-repo.git`).
  - Utilize Gitea's GitHub-compatible REST APIs for issue listing, comments, PR creation, and user management.
- [ ] **E2E Test Harness Extensions (`packages/robos-test`)**:
  - Provide test utilities: `startTestForge()`, `stopTestForge()`, `seedForgeRepo(repoDef)`, `resetForgeState()`.
  - Configurable scenarios in `robos-test` to point RobOS apps to the local Gitea instance via environment variables (`ROBOS_GIT_FORGE_URL`, `ROBOS_GITHUB_API_BASE`).
- [ ] **AI Agent & Dev-Setup E2E Testing**:
  - Validate AI agent skills (e.g. `e2e-driven-dev`, repository clone & dev-setup provisioners) against genuine remote git endpoints in headless test runs.

### Out of Scope
- Replacing GitHub in production RobOS user environments (Gitea is utilized primarily for local/E2E/isolated testing).
- Hosting high-availability production Gitea clusters.

## 4. Architectural & System Integration
- **Impacted Packages/Apps**:
  - `packages/robos-test` (harness utilities and fixture seeders)
  - `scripts/e2e-container.sh` & `infra/docker/Dockerfile.e2e` (Gitea binary and configuration embedding)
  - `packages/git-projects`, `packages/issue-manager`, `packages/git-login-manager` (support configurable forge endpoint base URLs)
- **IPC / Endpoints Required**:
  - Local HTTP server on `http://127.0.0.1:3000` (or dynamic test port)
  - Gitea REST API: `/api/v1/repos/...`, `/api/v1/issues/...`, `/api/v1/user/...`
- **Data & Configuration Storage**:
  - Ephemeral SQLite database in `/tmp/robos-test-gitea/` (cleared between test runs)
  - Pre-configured `app.ini` optimized for instant startup and disabled telemetry/background cron jobs.

## 5. Proposed Implementation Plan
1. **Phase 1: Gitea Container & Fixture Integration**
   - Add Gitea binary or runner script to `packages/robos-test/fixtures/gitea/`.
   - Implement CLI helper in `robos-test` to launch, initialize admin user/token, and seed test repos.
2. **Phase 2: App Configurable Base URLs**
   - Ensure `git-login-manager`, `git-projects`, and `issue-manager` support custom Git and API hostnames (`ROBOS_GIT_FORGE_URL`).
3. **Phase 3: E2E Test Suite Suites Migration**
   - Write comprehensive E2E tests for repository cloning, branch pushing, issue board management, and multi-user interactions using the Gitea forge.
   - Integrate into `scripts/e2e-container.sh`.

## 6. Acceptance Criteria
- [ ] `./scripts/e2e-container.sh` can launch a local Gitea instance in under 3 seconds without external internet access.
- [ ] Test harness can programmatically seed repositories, pull requests, and issues before test execution.
- [ ] `packages/git-projects` and `packages/issue-manager` can clone, push, fetch, and manipulate issues against the local Gitea instance in automated tests.
- [ ] Full E2E test runs cleanly in isolated sandbox environments with 0 network egress.
