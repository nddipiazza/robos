# RobOS Agent Task Runner

Work ticket opens the agent conversation and a launch dialog. Task Planner uses
that same dialog for drafting and implementing plans. The user selects the model,
RAM (2/4/8/16 GiB), CPU limit, and GitHub repositories associated with the ticket.
Choose Codex or AGY (Antigravity). Model suggestions follow the selected provider. There is no host workspace picker.

Build the runtime once:

```
docker -H unix:///var/run/docker.sock build -t robos-agent-task-runner:local packages/robos-agent-task-runner
```

Set ROBOS_DOCKER_HOST to use a different Docker endpoint. The runner requires the
selected provider executable (ROBOS_CODEX_PATH or ROBOS_AGY_PATH), its existing login,
and GitHub CLI authentication. Runtime failures are displayed, never replaced
with host execution or simulated profiles.

Each session has a unique container with UID 15000, read-only root, dropped
capabilities, no privilege escalation, memory/CPU/PID limits, private process and
network namespaces, a tmpfs home, and Xvfb :99. No host home, Docker socket, source
checkout, SSH directory, or GPG directory is mounted. Only the selected provider binary (plus codex-code-mode-host for Codex)
is mounted read-only. Repository clones and build files live inside tmpfs.

The selected provider authentication and GitHub token are copied over stdin into the
session's temporary home. They are not short-lived credentials and are accessible
to the agent in that session. They are excluded from artifact export. No claim of
credential brokerage or token narrowing is made by this implementation.

Codex and AGY JSON events stream into the existing agent conversation UI. Implementation requires a saved plan from Task Planner. Human plan approval is
needed only when the task explicitly requires plan signoff. The agent may
create a draft PR, but cannot approve/merge it through this workflow. PR Review
Theater remains the human review handoff.

Before removal, repository directories are exported under
`~/.config/robos/work-tasks/<task-id>/sessions/<session-id>/repos`. Transcripts are
kept with the task. Failed exports retain the named sandbox for recovery; do not
remove it until its work has been recovered. Session memory is released when the
container is removed. Stop terminates the agent process, then attempts export.

Container support was verified on Linux. macOS requires a working Docker runtime
and Linux-compatible provider binaries; it has not been verified. The image includes Node.js, native build tools, Xvfb, and Chromium's Linux
libraries/fonts. Install the browser version matched to the repository with
`npx playwright install chromium`; no root dependency installation is needed.
Each container has 512 MiB of shared memory for browser rendering. Additional
language SDKs and live display mirroring are not provisioned by this image.

The authenticated GitHub token is exposed to the agent as `GH_TOKEN` and
`NODE_AUTH_TOKEN` for repositories whose `.npmrc` references that variable.
Private GitHub Packages also requires the token's `read:packages` permission;
repository access alone is insufficient. Refresh GitHub CLI access on the host
with `gh auth refresh --hostname github.com --scopes read:packages` if needed.
Do not put credentials in the image or exported repository files.

Browser readiness is not full-stack readiness: sandbox localhost is isolated.
Application backends, Gitea, and other test services must be provisioned separately
inside the session or a deliberately configured test environment. The runner does
not mount the host Docker socket or silently connect tests to production.
Package publication is a separate release action, not a validation prerequisite;
validate consumer integration with a locally packed candidate package first.

Codex and AGY use nested terminal sandboxes. Docker seccomp, AppArmor, and
masked-system-path restrictions are disabled for this container to permit nested
user namespaces and proc mounts. The outer non-root identity, read-only root,
dropped capabilities, private namespaces, resource limits, and absence of host
data mounts remain enforced. This is not Docker privileged mode.

AGY login starts in **RobOS Agents → Antigravity → Open AGY Terminal**. Sign in
there, then return to Task Runner. RobOS reads only AGY’s saved login from the
desktop keyring (Linux requires python3-dbus). Inside containers, AGY expects its
`antigravity-oauth-token` file; RobOS writes that login into the session’s tmpfs
home. Host plugins, MCP configuration, conversations, and permission settings are
not imported. The sandbox has its own repository read/write and terminal rules.
AGY permission denials and native error results fail the run even if its process
exits zero. No empty response is accepted as a completed plan.

Recoverable errors remain in the output. Only a terminated failed job marks the
current workflow stage red. The failed stage is retained if execution stops. A new
launch or successful completion clears the active error; session history retains
the original error messages.

Additional private registries can use repository-scoped secret references in
`~/.config/robos/settings.json` under `registry_secret_bindings`:

```json
[{"repository":"https://github.com/example/app","environment":"REGISTRY_NPM_TOKEN","provider":"google-secret-manager","project":"example-dev","secret":"registry-npm-token"}]
```

Only bindings matching selected repositories are loaded, using the host's existing
gcloud identity. Values travel over stdin into the session's RAM-backed home and
are excluded from repository export. An unavailable secret stops provisioning with
an actionable login/access error. GitHub credentials cannot be overridden by these
bindings. Registry URLs and placeholder variables remain in the repository's npm
configuration; no secret values belong in that configuration or in this settings file.

The shared `robos-lib/registry-credentials` loader is available to other RobOS apps.
It also accepts password-store references with `provider: "pass"` and `entry`.
Only the first line of a password-store entry is used; notes are not credentials.
