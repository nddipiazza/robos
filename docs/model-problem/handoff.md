---
title: Operations Runbook (Handoff)
parent: Video Production Plan
grand_parent: The Model Problem
layout: default
nav_order: 1
---

# Model Problem — Operations Runbook
{: .no_toc }

This is the runbook for producing every episode of the Model Problem video series. Anyone — human, GitHub Copilot, Claude, future you — should be able to start at the top, follow the commands, and end with a YouTube link. No questions, no judgment calls.

If a step here disagrees with [`video-plan.md`](video-plan.md), the plan wins; tell whoever's maintaining this doc to fix it.
{: .fs-5 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Prerequisites

You need these on your **host** machine (where the recording happens):

| Tool | Why | Install |
|:-----|:----|:--------|
| `git` | obvious | `sudo apt install git` |
| `gh` | GitHub repo + PR work outside the VM | `sudo apt install gh && gh auth login` |
| `ffmpeg` | screen capture + final mux | `sudo apt install ffmpeg` |
| `xwininfo`, `xdotool`, `wmctrl` | window targeting | `sudo apt install x11-utils xdotool wmctrl` |
| `qemu-system-x86_64` + `/dev/kvm` access | run the VM | `sudo apt install qemu-system-x86 qemu-utils` |
| Node.js 20+ | run the narration pipeline | `nvm install 20` or distro packages |
| `piper` (the TTS binary) + the `en_US-lessac-medium` voice files | narration | See [Narration setup](#narration-setup) below |
| `node ~/.local/bin/...` access on `PATH` | for piper | `export PATH=$HOME/.local/bin:$PATH` |

You need these **accounts/secrets**:

| Account / secret | Used by | How to acquire |
|:------------------|:--------|:---------------|
| GitHub PAT (classic, scopes: `repo`, `workflow`, `admin:public_key`) | Dana, Jordan, Alex push, Jordan wires CI | `gh auth login --scopes repo,workflow,admin:public_key` then export the token |
| Atlassian API token for `nddipiazza@hermetiq.com` (or whichever owner of `robos-acme.atlassian.net`) | Task Servers connecting to Jira | https://id.atlassian.com/manage-profile/security/api-tokens |
| YouTube channel `@RobOS-e5i` access | uploading the videos | already authenticated in your browser |

Both secrets must end up in **Dana's pass store** in the VM, named:
- `robos-acme-inc/jira-token`
- `acme/github-pat`

How they get there is in [F2](fixtures.md#f2-github-repos).

---

## One-time setup

Before recording the first video, run these once. Each links to its full procedure in [`fixtures.md`](fixtures.md).

| # | Step | Doc |
|:-:|:-----|:----|
| 1 | Patch `infra/desktop/cloud-init/user-data` to add the four users | [F1](fixtures.md#f1-acme-fresh-vm-snapshot) |
| 2 | Confirm the two real GitHub repos exist + push base commit | [F2](fixtures.md#f2-github-repos) |
| 3 | Confirm the Jira project `KAN` exists at `https://robos-acme.atlassian.net/` and the API token is in your local pass | [F3](fixtures.md#f3-jira-project) |
| 4 | Build the fresh `acme-fresh` qcow2 (`build.sh && run.sh --firstboot`) and let cloud-init finish | [F1](fixtures.md#f1-acme-fresh-vm-snapshot) |
| 5 | SSH in once and verify the four users + their pass stores + Security Setup completion | [F1 verify](fixtures.md#f1-verify) |
| 6 | Snapshot the qcow2 with `qemu-img convert` so every video can revert to a known-clean baseline | [F1 snapshot](fixtures.md#f1-snapshot) |

After this, every per-video session reverts the VM to the snapshot, then layers the per-video fixtures (F4-F8) on top.

---

## Per-episode loop

Steps are in order. **Don't skip and don't reorder.**

### 1. Pick the episode and revert the VM

```bash
# From the host
cd ~/source/github/nddipiazza/robos

# Stop any running VM
pkill -f 'qemu-system.*robos.qcow2' 2>/dev/null

# Revert to the clean acme-fresh snapshot
cp infra/desktop/output/robos.qcow2.acme-fresh-snapshot infra/desktop/output/robos.qcow2

# Boot
infra/desktop/run.sh > /tmp/robos-vm-run.log 2>&1 &

# Wait for SSH
for i in $(seq 1 60); do
  ssh -p 2224 -o ConnectTimeout=2 -o StrictHostKeyChecking=no robos@localhost true 2>/dev/null && break
  sleep 2
done
```

### 2. Apply per-video fixtures

Each video doc (`videos/NN-*.md`) lists the fixtures it needs. Run only those. Most engineering videos need at least F5–F7.

```bash
# Example for video 06 (Pat — epic breakdown):
bash docs/model-problem/scripts/apply-fixture.sh F4

# Example for video 09 (P1 hero):
bash docs/model-problem/scripts/apply-fixture.sh F5 F6 F7 F8
```

If `apply-fixture.sh` doesn't exist yet for a fixture, follow the manual steps in [`fixtures.md`](fixtures.md). Then add the script — Copilot/whoever-comes-after thanks you.

### 3. Log in as the protagonist

Switch the VM's auto-login to the right user before recording, or use the LightDM picker:

```bash
ssh -p 2224 robos@localhost \
  "echo robos | sudo -S sed -i 's/^autologin-user=.*/autologin-user=dana/' /etc/lightdm/lightdm.conf"
ssh -p 2224 robos@localhost "echo robos | sudo -S systemctl restart lightdm"
```

(Replace `dana` with whichever protagonist the per-video doc names.)

If the VM is already at the desktop logged in as a different user, log out via the GNOME menu in the VM, then pick the protagonist on LightDM. Don't fight the auto-login config mid-session.

### 4. Recording

Full-screen capture from the host targeting the QEMU display. The QEMU window must be visible on `:0.0`.

```bash
# Output goes to packages/robos-test/run/demos/model-problem/<NN>-<slug>/
NUM=01
SLUG=dana-setup
OUT_DIR=packages/robos-test/run/demos/model-problem/${NUM}-${SLUG}
mkdir -p "$OUT_DIR"
RAW="$OUT_DIR/raw.webm"

# Detect screen resolution
SIZE=$(xdpyinfo | awk '/dimensions:/ { print $2 }')

ffmpeg -y -hide_banner -loglevel warning \
  -f x11grab -framerate 30 -video_size "$SIZE" -i :0.0 \
  -c:v libvpx-vp9 -b:v 3M -deadline realtime -cpu-used 6 -pix_fmt yuv420p \
  "$RAW" > /tmp/robos-rec.log 2>&1 &

echo "$!" > /tmp/robos-rec.pid
echo "Recording into $RAW (pid $(cat /tmp/robos-rec.pid))"
```

Then perform the scene list from `videos/NN-*.md` inside the VM. When done:

```bash
kill -INT "$(cat /tmp/robos-rec.pid)"
# wait up to ~10s for ffmpeg to finalize
for i in $(seq 1 10); do
  kill -0 "$(cat /tmp/robos-rec.pid)" 2>/dev/null || break
  sleep 1
done

ls -lh "$RAW"
ffprobe -v error -show_entries format=duration "$RAW"
```

If you flubbed a scene, do another take. The narration pipeline doesn't care whether your raw footage is 1 take or 5; you'll trim it in your editor before the narration step.

### 5. Trim raw footage (optional)

If you need to clean up, do it in any video editor (Kdenlive, DaVinci Resolve, OBS) and export to `$OUT_DIR/trimmed.mp4` (h264 + aac). The narration pipeline accepts mp4 or webm.

If you don't need to trim, skip this step — the narrator script will use `raw.webm` as-is.

### 6. Narration

Each per-video doc has a `Narration cues` table. Convert it to the JS array shape the narrator expects, then run:

```bash
SOURCE=$(ls "$OUT_DIR"/trimmed.mp4 "$OUT_DIR"/raw.webm 2>/dev/null | head -1)

node packages/robos-test/demos/narrate-source.js \
  --source "$SOURCE" \
  --slug "$SLUG" \
  --cues "$OUT_DIR/cues.json" \
  --out "$OUT_DIR/narrated.mp4" \
  --vtt "$OUT_DIR/captions.vtt"
```

> [!note]
> `narrate-source.js` is a thin wrapper around the existing `lib/narrator.js` we already use for the install video. If it doesn't exist yet, model it on `packages/robos-test/demos/robos-install-narrate.js` — same pattern, different cue source.

### 7. YouTube metadata

Copy [`metadata-template.md`](metadata-template.md) into `$OUT_DIR/youtube.md` and fill in:

- Title (use the per-video doc's title verbatim)
- Description (template, fill blanks)
- Chapters (regenerate from `cues.json` start times — the template has the format)
- Tags
- Playlist (`RobOS Model Problem`)
- End screen reference (link to previous and next episode in the series)

### 8. Upload

Web UI is fastest for one-offs:

1. https://studio.youtube.com → Create → Upload video → pick `$OUT_DIR/narrated.mp4`.
2. Paste title, description, tags from `youtube.md`.
3. Upload `captions.vtt` separately as English subtitles.
4. Set Visibility = Unlisted, Playlist = `RobOS Model Problem`.
5. Set thumbnail (optional; YouTube auto-pick is fine for first cut).
6. Wait for HD processing (~5–15 min). Test playback on the watch page.
7. Flip to Public when you're happy.

If you'd rather automate, the `gh`-style API path is:

```bash
# Requires google API credentials and the youtube-upload tool;
# leaving this stubbed because the manual UI path is faster and we're
# only doing 16 videos.
```

### 9. Update docs

```bash
# 1. Tick the row in video-plan.md status board (turn ⬜ → ✅)
# 2. Add the URL to that row
# 3. Add the embed somewhere appropriate:
#    - Setup arc (videos 01-08): nowhere on home page
#    - Hero (video 09): home page replaces install video
#    - Master cut (video 20): home page replaces hero
#    - All others: docs/model-problem/ embedded in their phase doc

# Then:
git add docs/model-problem/video-plan.md docs/index.md  # (or whatever you touched)
git commit -m "docs: publish video NN — <title>"
git push origin main
```

---

## Narration setup (one-time)

```bash
# piper-tts via pip --user
pip3 install --user --break-system-packages piper-tts

# Voice model
mkdir -p ~/source/github/nddipiazza/robos/packages/robos-test/models
cd ~/source/github/nddipiazza/robos/packages/robos-test/models
curl -fsSL -o en_US-lessac-medium.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -fsSL -o en_US-lessac-medium.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Verify
echo "Hello from RobOS." | piper -m en_US-lessac-medium --data-dir . -f /tmp/test.wav
ffprobe -v error -show_entries format=duration /tmp/test.wav
```

---

## Naming conventions

Hold these tight; the `metadata-template.md` and any future automation depend on them.

- **Output dirs**: `packages/robos-test/run/demos/model-problem/NN-slug/` where `NN` is zero-padded 2-digit, `slug` matches the doc filename.
- **YouTube titles**: starts with `RobOS Model Problem · NN —` then the per-video doc's title. Example: `RobOS Model Problem · 01 — Dana Sets Up RobOS for Acme`.
- **Playlist**: `RobOS Model Problem` (singular, capitalized).
- **Hashtags**: every description ends with `#RobOS #ModelProblem #BuildbarnForms` plus one phase-specific tag.

---

## Troubleshooting

**The recording is all black.**
You started ffmpeg before the QEMU window was visible, or ffmpeg captured the wrong display. Confirm `xdpyinfo` shows the right size, confirm the QEMU window is on `:0.0`, restart ffmpeg.

**Piper is slow / output stutters.**
Voice model not loaded into memory. First synthesis takes a few seconds; subsequent ones are fast. Pre-synthesize all cues in a loop before muxing.

**`apply-fixture.sh F1` fails because the snapshot doesn't exist.**
Re-run the one-time setup. The snapshot file `robos.qcow2.acme-fresh-snapshot` lives next to `robos.qcow2` in `infra/desktop/output/`.

**`gh` errors: "auth required"** while running fixtures.
Run `gh auth login` on the host first. The fixtures don't try to authenticate automatically.

**The Jira API token expired.**
Issue a new one at https://id.atlassian.com/manage-profile/security/api-tokens, drop it into your local `pass insert robos-acme-inc/jira-token`, then re-deploy F1 (the cloud-init user-data has Dana's pass-store entry baked in; you'll need to update and rebuild).

**Mid-recording, you click an Install button you shouldn't have.**
Stop the recording. Some app demos in this codebase will do real things if you click real buttons. Better to take it again than to dig out from a half-installed package.
