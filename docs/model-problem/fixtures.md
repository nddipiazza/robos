---
title: Fixtures (F1–F8)
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 2
---

# Model Problem — Fixtures
{: .no_toc }

Concrete, executable build procedures for every fixture the video series depends on. If a step here doesn't work verbatim, fix it — don't work around it.
{: .fs-5 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## F1 — `acme-fresh` VM snapshot

A v0.0.5 RobOS VM with **four real Linux users** (`dana`, `pat`, `jordan`, `alex`) plus their pre-seeded RobOS state. This is the baseline every video reverts to.

### Build procedure

#### 1. Patch cloud-init to add the four users

Edit `infra/desktop/cloud-init/user-data`. The existing config provisions a single `robos` user. Add the four below it.

Find the `users:` block (top-level, around line ~30 of `gen-userdata.py` output). Add:

```yaml
users:
  # ... existing robos user stays as-is ...
  - name: dana
    groups: [sudo, docker]
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: dana   # debug-only, lockdown later
    sudo: ALL=(ALL) NOPASSWD:ALL
  - name: pat
    groups: [sudo, docker]
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: pat
    sudo: ALL=(ALL) NOPASSWD:ALL
  - name: jordan
    groups: [sudo, docker]
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: jordan
    sudo: ALL=(ALL) NOPASSWD:ALL
  - name: alex
    groups: [sudo, docker]
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: alex
    sudo: ALL=(ALL) NOPASSWD:ALL
```

In the same file, add a `runcmd` step that drops a starter pass-store entry for Dana — the Jira and GitHub tokens she'll use during recording.

```yaml
runcmd:
  # ... existing steps ...
  - |
    # Seed Dana's pass store with the API tokens we baked into the build
    su - dana -c '
      mkdir -p ~/.password-store/robos-acme-inc ~/.password-store/acme
      echo "$JIRA_TOKEN_FROM_BUILD" > ~/.password-store/robos-acme-inc/jira-token.gpg
      echo "$GITHUB_PAT_FROM_BUILD" > ~/.password-store/acme/github-pat.gpg
    '
```

> The `$JIRA_TOKEN_FROM_BUILD` and `$GITHUB_PAT_FROM_BUILD` placeholders need to come from environment variables injected by `build.sh` at image-build time. See [F2](#f2-github-repos) and [F3](#f3-jira-project) for how they get sourced from your local pass store on the host.

If `gen-userdata.py` is the source of truth (not user-data directly), update it instead so rebuilds don't drop the change. Verify by running `python3 infra/desktop/gen-userdata.py` and inspecting the diff in `output/user-data`.

#### 2. Update `build.sh` to source host secrets

Append to `infra/desktop/build.sh` before the cloud-init seed step:

```bash
# Pull tokens from the host's pass store and inject into cloud-init.
JIRA_TOKEN_FROM_BUILD="$(pass show robos-acme-inc/jira-token | head -1)"
GITHUB_PAT_FROM_BUILD="$(pass show acme/github-pat | head -1)"
[ -z "$JIRA_TOKEN_FROM_BUILD" ] && { echo "ERROR: pass entry robos-acme-inc/jira-token missing on host" >&2; exit 1; }
[ -z "$GITHUB_PAT_FROM_BUILD" ] && { echo "ERROR: pass entry acme/github-pat missing on host" >&2; exit 1; }
export JIRA_TOKEN_FROM_BUILD GITHUB_PAT_FROM_BUILD
envsubst < "$OUTPUT_DIR/user-data" > "$OUTPUT_DIR/user-data.expanded" && mv "$OUTPUT_DIR/user-data.expanded" "$OUTPUT_DIR/user-data"
```

Then make sure `envsubst` is available (`sudo apt install gettext-base`).

#### 3. Build + first-boot

```bash
cd ~/source/github/nddipiazza/robos
infra/desktop/build.sh
infra/desktop/run.sh --firstboot &
```

Cloud-init will run for 5–15 minutes. Tail `tail -f /tmp/robos-gnome-serial.log` to watch progress.

#### 4. F1 verify {#f1-verify}

When the LightDM login screen appears:

```bash
# from the host
ssh -p 2224 dana@localhost true && echo "dana OK"
ssh -p 2224 pat@localhost true && echo "pat OK"
ssh -p 2224 jordan@localhost true && echo "jordan OK"
ssh -p 2224 alex@localhost true && echo "alex OK"

ssh -p 2224 dana@localhost 'pass show robos-acme-inc/jira-token | head -c 8 && echo "  ← jira token present"'
ssh -p 2224 dana@localhost 'pass show acme/github-pat | head -c 8 && echo "  ← github pat present"'
```

Each user should be sudo-capable (`sudo -n true`), have an empty `~/.config/robos/`, and **not** have completed Security Setup yet (Video 08 shows Alex going through it; Dana goes through it inside Video 01's recording).

#### 5. F1 snapshot {#f1-snapshot}

```bash
cd infra/desktop/output
qemu-img convert -O qcow2 robos.qcow2 robos.qcow2.acme-fresh-snapshot
ls -lh robos.qcow2.acme-fresh-snapshot
```

This gives you the disk image to revert to before each recording. To revert:

```bash
pkill -f 'qemu-system.*robos.qcow2'
cp robos.qcow2.acme-fresh-snapshot robos.qcow2
infra/desktop/run.sh &
```

---

## F2 — GitHub repos

Two real public repos in the `nddipiazza` GitHub account. They serve as the codebase the team works on.

### Build procedure

```bash
# Run on the host. gh CLI must be authenticated as nddipiazza.
gh auth status

# Create the empty proto repo if it doesn't exist
gh repo view nddipiazza/buildbarn-forms-proto >/dev/null 2>&1 \
  || gh repo create nddipiazza/buildbarn-forms-proto --public \
       --description "Generated TypeScript types from Buildbarn protobuf schemas" \
       --homepage "https://nddipiazza.github.io/robos/" \
       --confirm

# Same for the forms repo
gh repo view nddipiazza/buildbarn-forms >/dev/null 2>&1 \
  || gh repo create nddipiazza/buildbarn-forms --public \
       --description "React component library for editing Buildbarn configurations" \
       --homepage "https://nddipiazza.github.io/robos/" \
       --confirm

# Push the existing local worktrees to the new remotes (if not already pushed)
cd ~/source/hermetiq/buildbarn-forms-proto
git remote get-url origin || git remote add origin https://github.com/nddipiazza/buildbarn-forms-proto.git
git push -u origin main

cd ~/source/hermetiq/buildbarn-forms
git remote get-url origin || git remote add origin https://github.com/nddipiazza/buildbarn-forms.git
git push -u origin main
```

### Generate a long-lived PAT for Dana's pass store

```bash
# Browser path, recommended:
#   https://github.com/settings/tokens/new
#   Scopes: repo, workflow, admin:public_key, write:packages
#   Expiration: 90 days
#   Description: "RobOS Model Problem — Dana"
#
# Then on the host:
echo "ghp_xxxxxxxxxxxxxxxxxxxxxxxx" | pass insert -m acme/github-pat
```

`pass show acme/github-pat` should now print the token. F1 step 2 will copy it into Dana's VM pass store at build time.

### Verify

```bash
gh repo view nddipiazza/buildbarn-forms      # public, exists, has main branch
gh repo view nddipiazza/buildbarn-forms-proto
pass show acme/github-pat | head -c 8 && echo "  ← token starts with this prefix"
```

---

## F3 — Jira project

A free-tier Jira Cloud project at `https://robos-acme.atlassian.net/`, project key `KAN`, with a workflow that matches the RobOS workflow Dana sets up in Video 01.

### Build procedure

#### 1. Confirm the Atlassian site exists

The site `robos-acme.atlassian.net` already exists per the project owner. If you're handing this off and the site is missing, sign up at https://www.atlassian.com/software/jira/free using the org owner's email.

#### 2. Confirm the API token

Browser: https://id.atlassian.com/manage-profile/security/api-tokens → Create API token → label it "RobOS Model Problem — Dana" → copy.

```bash
# On the host:
echo "your-jira-api-token-here" | pass insert -m robos-acme-inc/jira-token
pass show robos-acme-inc/jira-token | head -c 8 && echo "  ← jira token prefix"
```

#### 3. Confirm the project + workflow

The project key is `KAN`. The default Kanban template gives you statuses `To Do`, `In Progress`, `Done`. We need to match the RobOS workflow:

| RobOS state | Jira status |
|:------------|:------------|
| `backlog`     | `To Do`        |
| `in_progress` | `In Progress`  |
| `in_review`   | `In Review` *(new — add this)* |
| `staged`      | `Staged` *(new — add this)* |
| `deployed`    | `Done`         |

In the Jira UI: Project settings → Workflows → click the workflow → Edit → Add status → name `In Review` → repeat for `Staged`. Save and publish.

Verify via API:

```bash
TOKEN=$(pass show robos-acme-inc/jira-token | head -1)
curl -s -u "nddipiazza@hermetiq.com:$TOKEN" \
  "https://robos-acme.atlassian.net/rest/api/3/project/KAN/statuses" \
  | jq '.[] | .statuses[] | .name'
```

You should see all five statuses listed.

---

## F4 — Epic + stories

One epic and ten stories in the `KAN` project, authored as if Pat wrote them. Created in advance so Video 06 can show them being broken-down rather than typed live.

### Build procedure

The script `docs/model-problem/scripts/seed-jira.sh` (you may need to write this on first run; the spec is below) issues `POST /rest/api/3/issue` calls to create the epic and stories.

Spec — story titles + bodies — lives in `docs/model-problem/scripts/seed-jira-stories.json`. Write that file with this shape:

```json
[
  {
    "key": "EPIC",
    "summary": "Finish @hermetiq/buildbarn-forms",
    "description": "Ship the second half of the buildbarn-forms React library...",
    "type": "Epic"
  },
  {
    "key": "P1",
    "summary": "Proto Field Metadata API",
    "description": "Extend buildbarn-forms-proto to emit a runtime descriptor file...\n\n## Acceptance criteria\n- `dist/proto-descriptors.json` published\n- `getMessageFieldsMetadata()` exported\n- one round-trip test passes",
    "type": "Story",
    "epicLink": "EPIC"
  },
  {"key": "P2", "summary": "Default Value Generator", "description": "...", "type": "Story", "epicLink": "EPIC"},
  ... 8 more stories ...
]
```

Pull the story descriptions from each video's [`videos/NN-pX-*.md`](videos/) doc — the "real engineering work" section is your acceptance criteria.

The bash script:

```bash
#!/usr/bin/env bash
set -e
TOKEN=$(pass show robos-acme-inc/jira-token | head -1)
JSON=docs/model-problem/scripts/seed-jira-stories.json
EMAIL="nddipiazza@hermetiq.com"
PROJECT="KAN"
BASE="https://robos-acme.atlassian.net/rest/api/3"

# Issue type IDs vary per Jira install; query and store
curl -s -u "$EMAIL:$TOKEN" "$BASE/issuetype" | jq '.[] | {id, name}'
# Set EPIC_ID and STORY_ID based on the output above

# Create the epic
EPIC_KEY=$(curl -s -u "$EMAIL:$TOKEN" -X POST -H 'Content-Type: application/json' "$BASE/issue" \
  -d "{\"fields\":{\"project\":{\"key\":\"$PROJECT\"},\"summary\":\"...\",\"description\":\"...\",\"issuetype\":{\"id\":\"$EPIC_ID\"}}}" \
  | jq -r .key)
echo "Epic: $EPIC_KEY"

# Create each story, linking to the epic
for i in $(seq 1 10); do
  curl -s -u "$EMAIL:$TOKEN" -X POST -H 'Content-Type: application/json' "$BASE/issue" \
    -d "{\"fields\":{\"project\":{\"key\":\"$PROJECT\"},\"summary\":\"...\",\"description\":\"...\",\"issuetype\":{\"id\":\"$STORY_ID\"},\"customfield_10014\":\"$EPIC_KEY\"}}"
done
```

`customfield_10014` is the standard "Epic Link" custom field on free-plan Jira — verify with `curl ... /rest/api/3/field | jq '.[] | select(.name=="Epic Link")'` if the seed fails.

### Verify

```bash
TOKEN=$(pass show robos-acme-inc/jira-token | head -1)
curl -s -u "nddipiazza@hermetiq.com:$TOKEN" \
  "https://robos-acme.atlassian.net/rest/api/3/search?jql=project=KAN" \
  | jq '.issues | length'
# Should be 11 (1 epic + 10 stories)
```

In the UI: https://robos-acme.atlassian.net/jira/software/projects/KAN/list — should show all 11.

---

## F5 — `buildbarn-forms` worktree

Alex's home directory has a clone of `buildbarn-forms` at the rough-draft commit. This is what he picks up to start working.

### Build procedure

Inside the VM (run as alex):

```bash
sudo -u alex bash <<'EOSU'
set -e
mkdir -p ~/source/github.com/nddipiazza
cd ~/source/github.com/nddipiazza
git clone https://github.com/nddipiazza/buildbarn-forms.git
cd buildbarn-forms
# Pin to the rough-draft commit. Update the SHA below to whatever is current main.
git checkout -b model-problem-base $(git log --oneline | head -1 | awk '{print $1}')
EOSU
```

The exact base SHA may drift; update [`videos/08-alex-onboarding.md`](videos/08-alex-onboarding.md) and this fixture every time we re-cut the series.

---

## F6 — Local Verdaccio

Local npm registry running inside the VM, hosting `@hermetiq/buildbarn-forms-proto` so Alex can `npm install` without GitHub Packages auth.

### Build procedure

```bash
sudo -u alex bash <<'EOSU'
set -e

# Install verdaccio globally (one-time per VM build — bake into cloud-init for reproducibility)
sudo npm install -g verdaccio

# Start it as a user service
mkdir -p ~/.config/verdaccio
cat > ~/.config/verdaccio/config.yaml <<'EOF'
storage: ~/.local/share/verdaccio/storage
auth:
  htpasswd:
    file: ~/.config/verdaccio/htpasswd
uplinks: {}
packages:
  '@hermetiq/*':
    access: $all
    publish: $authenticated
    proxy: ~
listen: 0.0.0.0:4873
EOF

# Background it (or use systemd --user; whatever)
nohup verdaccio --config ~/.config/verdaccio/config.yaml > ~/.local/share/verdaccio.log 2>&1 &

# Wait for it
for i in $(seq 1 20); do
  curl -fsS http://localhost:4873/-/ping >/dev/null 2>&1 && break
  sleep 1
done

# Add a user
( echo alex; echo alex; echo alex@acme ) | npm adduser --registry http://localhost:4873/

# Publish buildbarn-forms-proto from a clone
cd ~/source/github.com/nddipiazza
git clone https://github.com/nddipiazza/buildbarn-forms-proto.git || true
cd buildbarn-forms-proto
npm install
npm run build
npm publish --registry http://localhost:4873/

# Verify
npm view --registry http://localhost:4873/ @hermetiq/buildbarn-forms-proto version
EOSU
```

### Configure each user's npm to use Verdaccio for `@hermetiq/*`

```bash
for u in dana pat jordan alex; do
  sudo -u "$u" bash -c 'npm config set @hermetiq:registry http://localhost:4873/'
done
```

---

## F7 — Canned AI output

Per-phase Claude prompts and their canned diff outputs. Stored under `packages/robos-test/sandbox/data/model-problem/<phase>/` so retakes produce identical code.

### Spec per phase

For each phase P1–P10, drop these files:

```
packages/robos-test/sandbox/data/model-problem/<phase>/
├── prompt.md           # The prompt Claude is asked
├── questionnaire.json  # Answers to the AI Questionnaire
├── diff.patch          # The exact diff that gets applied
└── quiz.json           # Quiz questions + the right answer
```

### How the harness consumes these

The `claude` sandbox stub in `packages/robos-test/sandbox/bin/claude` already returns a stubbed version-string. Extend it to handle a "stream a session" mode that reads the per-phase fixture and emits the diff line-by-line. The pattern is the same as the `gh copilot` stub at `packages/robos-test/sandbox/bin/gh` — see how that returns `workflows-generated.json` for a reference.

Detailed prompt and diff content for each phase is captured inline in each `videos/NN-pX-*.md` doc, in the "The real engineering work" section. The job is to translate that text into deterministic prompt + diff files and drop them in the right directory.

---

## F8 — CI + deploy mock

Stubbed `gh` responses for the build+publish flow that fires on every merge in episodes 05–14.

### Spec

The `gh` stub at `packages/robos-test/sandbox/bin/gh` already handles `run list`, `run view`, etc. Per-phase additions needed:

- A `run-NNNN.json` for each phase's CI run (success/failure as appropriate per the per-video script).
- A `release-NNNN.json` for any phase that bumps the version + tags a release.
- A `deployment-NNNN.json` for the final deploy event.

Drop them under `packages/robos-test/sandbox/data/model-problem/<phase>/`. The stub picks the right one based on `ROBOS_SCENARIO` or a per-phase override env var; spec the env var name (`ROBOS_MODEL_PROBLEM_PHASE`) and wire the stub.

---

## Summary

| Fixture | Status pre-handoff | Owner |
|:--------|:-------------------|:------|
| F1      | spec drafted, cloud-init patch + envsubst flow ready | next implementer |
| F2      | spec drafted, repos exist as of writing | next implementer (verify) |
| F3      | spec drafted, site exists, project KAN exists, statuses need adding | next implementer |
| F4      | spec drafted, seed script outline only — needs writing | next implementer |
| F5      | spec drafted, just `git clone` — trivial | next implementer |
| F6      | spec drafted, local Verdaccio path — likely two iterations to debug | next implementer |
| F7      | spec drafted, content per phase still to be written | next implementer (per-video) |
| F8      | spec drafted, content per phase still to be written | next implementer (per-video) |

If any of these fail when run verbatim, **fix the doc**, don't paper over.
