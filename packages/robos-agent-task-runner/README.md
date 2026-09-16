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
Application backends, Gitea, and other test services are provided by an optional
service environment profile (below), or started inside the session when appropriate. The runner does
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

## Change-scoped validation

The default policy is shared by Task Planner, task/review-fix prompts, sandbox
execution and workflow generation. Select the smallest check justified by the
actual diff, reuse applicable existing results, and stop when sufficient checks
pass. A prose-only README change does not trigger dependency installation, app
builds, service startup or e2e. Executable docs/configuration still need checks for
the behavior they affect. Explicit acceptance criteria and enforced CI gates remain
in force. See `../robos-agent-client/validation-policy.js`.

## Service environments

The launch dialog can provision a repository-specific environment on the session's
private Docker network. **None** is the default: documentation and small unit-test
changes do not incur full-stack startup. The host coordinates Docker; neither
Codex nor AGY gets a Docker socket. Candidate applications run inside the agent
container and reach services by their manifest names.

Register organization-owned profiles under `sandbox_environments` in
`~/.config/robos/settings.json`:

```json
{
  "id": "example-local",
  "title": "Example local stack",
  "description": "Disposable backend and database for integration tests",
  "repository": "https://github.com/example/development",
  "revision": "<full 40-character reviewed commit SHA>",
  "manifest": "sandbox/environment.json",
  "repositories": ["https://github.com/example/app"]
}
```

The version-1 JSON manifest declares `sources` (named GitHub repositories pinned
to commit SHAs), `services`, `agentEnvironment`, and agent `instructions`.
`@profile/` paths refer to the profile repository; `@name/` paths refer to a declared
source. All sources are fetched into this session's owned staging directory.
No developer checkout is reused. Service fields are a deliberately limited Compose
subset: image/build, command/entrypoint, environment, user/working_dir, healthcheck,
depends_on, volumes, memoryMb/cpus, init and networkDisabled. A build declares
`context` and a relative `dockerfile`. Volume objects declare `source`, `target`
and `readOnly`: source paths must be read-only, other names create disposable
session-owned volumes. Host ports, devices, host networking, privileged containers,
external volumes, arbitrary Compose extensions and writable source mounts are rejected.

The initial source build may take several minutes; Docker reuses image layers on
later sessions. Start waits for health checks and successful initialization jobs.
The conversation shows provisioning progress and fails before launching the agent
if services cannot start. Startup logs and pinned source provenance are saved in
the session's `environment` directory. Never place production credentials in a
manifest, command, service log, build argument or source file. Existing registry
secret bindings are supplied only to the agent, not infrastructure image builds.

At completion, RobOS stops remaining processes in the agent container before
exporting its repositories and evidence. It preserves bounded service logs under
`evidence/environment`, disconnects the agent, and removes only the exact Compose
project's containers, network and disposable data volumes. Images/build cache and
pinned source snapshots remain reusable/inspectable. If cleanup fails, the task
records `cleanup-required` with its project name; inspect the stored compose.json
and cleanup-resources.json before retrying that exact project's teardown.

Linux is verified first; Docker-backed macOS support still requires verification.
