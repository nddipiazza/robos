---
nav_exclude: true
---

# Story: Environment & dev-setup.sh Synthesizer

**Epic:** Existing App Import Wizard
**Points:** 8
**Status:** In Progress

## Description
Audit environment variable requirements from .env.example, check secrets vault availability, and synthesize a tailor-made dev-setup.sh runner script.

## Tasks
- [x] Extract required environment variables from .env.example, application.properties, or code.
- [x] Audit availability of secrets in RobOS pass-manager / vault.
- [x] Synthesize executable dev-setup.sh script tailored to the detected tech stack.
- [x] Detect or generate Dockerfile and .devcontainer/ configurations.
- [x] Make dev-setup.sh executable (chmod +x) and verify local execution.
