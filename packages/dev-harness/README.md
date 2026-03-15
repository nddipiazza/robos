# RobOS Dev Harness

Runs RobOS Electron apps **from source** with a sandboxed `HOME` and stub CLI binaries — no SSH deploys needed.

## Usage

```bash
# List available apps
node packages/dev-harness/harness.js --list-apps

# List scenarios
node packages/dev-harness/harness.js --list-scenarios

# Launch an app with a scenario
node packages/dev-harness/harness.js --app git-login-manager --scenario ssh-not-on-github
node packages/dev-harness/harness.js --app git-login-manager --scenario no-gh-auth
node packages/dev-harness/harness.js --app git-login-manager --scenario scope-missing
node packages/dev-harness/harness.js --app git-login-manager --scenario all-broken
```

## How it works

1. **Sandbox home** — each run gets a fresh `run/<scenario>-home/` with pre-populated `.ssh/`, `.config/gh/`, `.gitconfig` matching the scenario
2. **Stub binaries** — `sandbox/bin/` contains fake `gh`, `ssh`, `git`, `ssh-keygen` that return scenario-appropriate responses without touching real credentials
3. **Isolated electron** — app runs from source directory; edits are live on next launch (no rsync)

## Scenarios

| Scenario | What it tests |
|---|---|
| `all-good` | All checks green — dismiss/healthy state |
| `no-gh-auth` | gh not authenticated — Login → flow |
| `no-ssh-key` | No SSH key — Generate Key → flow |
| `ssh-not-on-github` | Key exists, not uploaded — Add to GitHub → flow |
| `scope-missing` | gh token lacks scope — Re-auth → flow |
| `git-config-missing` | No git identity — Configure → flow |
| `all-broken` | Everything broken — stress test UI |

## Workflow rule

**Always develop using the harness. Only deploy to VM after the harness confirms the app works.**
