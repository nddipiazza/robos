---
title: Dev Loop & Debugging Guide
layout: default
nav_order: 99
---

# RobOS Dev Loop & Debugging Guide
{: .no_toc }

How to work on RobOS apps day-to-day: edit on the host, deploy to the QEMU VM via SSH, restart the running app, inspect its X11 state, talk to its debug server, write a demo, ship a video. This is the runbook every developer (and every AI agent) should read before they start touching code.
{: .fs-5 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. The big picture

Two locations, one git repo, one VM:

- **Host**: where you edit code, run unit tests with the harness, generate demos, build the qcow2.
  Path: `~/source/github/nddipiazza/robos`.
- **VM (QEMU)**: where the apps actually run on a real GNOME desktop. The VM image is built from cloud-init in `infra/desktop/`. Every app is installed under `/usr/local/share/robos/<app-id>/`.

The dev loop is: edit on host → deploy to VM → restart app → inspect state.

Almost everything you'll need to do is one of:

1. **Make changes** on the host filesystem.
2. **Verify in isolation** with the test harness (no VM needed) — `node packages/robos-test/demos/<app>-demo.js`.
3. **Verify on the real desktop** by deploying to the running VM via SSH.
4. **Inspect** with the debug-server's `/snapshot` / `/eval` HTTP endpoints, plus `xdotool` / `xprop` / `wmctrl` for X11 state.

You almost never need to rebuild the qcow2 from scratch. Save that for when cloud-init itself changes.

## 2. Prerequisites

On your host:

| Tool | Why | Install (Ubuntu / Debian) |
|:-----|:----|:--------------------------|
| `git`, `gh` | repo + GitHub | `sudo apt install git gh` |
| `qemu-system-x86_64`, `qemu-img`, `/dev/kvm` access | VM | `sudo apt install qemu-system-x86 qemu-utils` |
| `ffmpeg` | demo recording + narration mux | `sudo apt install ffmpeg` |
| `xdotool`, `xprop`, `xwininfo`, `wmctrl` | window targeting | `sudo apt install x11-utils xdotool wmctrl` |
| `rsync` | per-app deploy | `sudo apt install rsync` |
| Node.js 20+ | harness, demos | `nvm install 20` |
| `piper-tts` + voice model | narration | see [model-problem/handoff.md](model-problem/handoff.md#narration-setup) |
| Python 3 + `jq` | sandbox stubs + scripting | `sudo apt install python3 jq` |

VM credentials: user `robos`, password `robos` (sudo NOPASSWD via cloud-init). SSH on host port 2224 (forwarded by `infra/desktop/run.sh`).

## 3. Repo layout

```
robos/
├── packages/                          # one dir per Electron app or shared lib
│   ├── <app-id>/                      # main.js, preload.js, renderer/, package.json, .desktop, icon.svg
│   ├── robos-lib/dom-snapshot/        # the debug-server library (more on this below)
│   ├── robos-icons/                   # icon registry (BUILTIN_APPS array — every app must be listed here)
│   ├── desktop-manager/main.js        # APP_REGISTRY + APP_BINS — every app must also be listed here
│   └── robos-test/
│       ├── lib/                       # harness.js, recorder.js, narrator.js, demo-runner.js, snapshot.js
│       ├── tests/<app>/e2e.test.js    # node --test
│       ├── demos/<app>-demo.js        # produces narrated YouTube-ready videos
│       ├── sandbox/bin/               # gh, claude, pass, ssh, … — fake binaries the harness drops on PATH
│       └── sandbox/data/              # canned JSON the stubs return
├── infra/desktop/                     # build.sh, run.sh, cloud-init/, gen-userdata.py
└── docs/                              # the docs site (you're reading one of them)
```

Whenever you touch an app, check the **registration checklist** in [`AGENTS.md`](https://github.com/nddipiazza/robos/blob/main/AGENTS.md): `desktop-manager/main.js` (APP_REGISTRY + APP_BINS) and `robos-icons/index.js` (BUILTIN_APPS) are easy to forget and break the launcher silently.

## 4. VM lifecycle

```bash
# Start the VM (auto-detects unprovisioned disk and attaches cloud-init ISO if needed)
infra/desktop/run.sh > /tmp/robos-vm-run.log 2>&1 &

# Stop
pkill -f 'qemu-system.*robos.qcow2'

# Snapshot the disk before risky work
cp infra/desktop/output/robos.qcow2 \
   infra/desktop/output/robos.qcow2.snap-$(date +%Y%m%d-%H%M%S)

# Revert to a snapshot
pkill -f 'qemu-system.*robos.qcow2'
cp infra/desktop/output/robos.qcow2.snap-XXXXX infra/desktop/output/robos.qcow2
```

Watch the boot:

```bash
tail -f /tmp/robos-gnome-serial.log
```

Wait-for-SSH-up:

```bash
for i in $(seq 1 60); do
  ssh -p 2224 -o ConnectTimeout=2 -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null robos@localhost true 2>/dev/null && break
  sleep 2
done
```

> **Tip:** Add `Host robos-vm` to `~/.ssh/config` so you don't repeat the flags. Or alias them — every example below uses the long flags so it works as-is for someone who hasn't.

## 5. SSH patterns

The boilerplate every command needs:

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost
```

For commands that need `sudo`, pipe the password through stdin (cloud-init configures NOPASSWD but not all paths use it):

```bash
ssh -p 2224 -o ... robos@localhost \
  'echo robos | sudo -S cp /tmp/x /usr/local/share/robos/<app>/main.js'
```

For background-launching a GUI app via SSH **always** use `setsid nohup` and redirect stdin/stdout, otherwise the SSH session ending kills the GUI:

```bash
ssh -p 2224 ... robos@localhost \
  'DISPLAY=:0 setsid nohup /usr/bin/electron /usr/local/share/robos/<app>/main.js \
    --no-sandbox --disable-gpu --disable-dev-shm-usage > /tmp/<app>.log 2>&1 < /dev/null &'
```

## 6. Deploying a single app to the running VM

This is the bread-and-butter loop. **Don't `sudo rm -rf` the entire app dir** — it nukes `node_modules/electron` and the next launch fails. Two patterns:

**Just-the-source-files (preferred):**

```bash
APP=desktop-widgets
rsync -az -e "ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
  --exclude='node_modules' --exclude='.git' \
  packages/$APP/ robos@localhost:/tmp/$APP/

ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost \
  "echo robos | sudo -S rsync -a --exclude='node_modules' /tmp/$APP/ /usr/local/share/robos/$APP/"
```

`rsync -a --exclude='node_modules'` on the inside means we don't blow away the existing `/usr/local/share/robos/<app>/node_modules/` that `npm install` populated during cloud-init.

**Just one file** (faster for iterating on `main.js`):

```bash
scp -P 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  packages/$APP/main.js robos@localhost:/tmp/$APP-main.js

ssh -p 2224 ... robos@localhost \
  "echo robos | sudo -S cp /tmp/$APP-main.js /usr/local/share/robos/$APP/main.js"
```

Then **restart the app** (next section).

## 7. Killing and relaunching an app

`pkill -9` plus a fresh launch covers 95% of cases:

```bash
ssh -p 2224 ... robos@localhost '
  pkill -9 -f "electron.*<app>" 2>/dev/null
  sleep 1
  DISPLAY=:0 setsid nohup /usr/bin/electron /usr/local/share/robos/<app> \
    --no-sandbox --disable-gpu --disable-dev-shm-usage > /tmp/<app>.log 2>&1 < /dev/null &
'
```

For apps with **single-instance locks** (most of them), if the lock-holder is dead but the lock file remains stale, the next launch quits silently. Stale lock cleanup:

```bash
ssh -p 2224 ... robos@localhost '
  rm -f ~/.config/Electron/Singleton* 2>/dev/null
  rm -f ~/.config/robos/electron/<app>/Singleton* 2>/dev/null
'
```

For apps with `keepAlive: true` in `desktop-manager`'s `APP_BINS`, the desktop-manager spawns them on its own. If you `pkill` them, desktop-manager will respawn the *old* binary on disk. Either:

- Deploy the new binary first, then `pkill` (desktop-manager spawns the new one).
- `pkill` desktop-manager too if you really want to control it manually.

## 8. Inspecting X11 windows

The single most useful diagnostic when an Electron app misbehaves on Linux. Window types, states, override-redirect, and stack order are all visible from `xprop` / `xwininfo` / `wmctrl`. Three windows that have bitten us:

```bash
ssh -p 2224 ... robos@localhost '
  # Find a window by title
  WID=$(DISPLAY=:0 xdotool search --name "RobOS Foo" 2>/dev/null | head -1)
  echo "WID=$WID"

  # Geometry, map state, override-redirect
  DISPLAY=:0 xwininfo -id $WID | grep -iE "Map State|Override|Width|Height|Position"

  # Type and state hints (this is the crucial diagnostic)
  DISPLAY=:0 xprop -id $WID _NET_WM_WINDOW_TYPE _NET_WM_STATE WM_CLASS _NET_WM_PID

  # Full stacking order, bottom → top
  DISPLAY=:0 xprop -root _NET_CLIENT_LIST_STACKING | sed "s/^.*= //" | tr "," "\n" | while read W; do
    W=$(echo $W | tr -d " ")
    [ -z "$W" ] && continue
    N=$(DISPLAY=:0 xdotool getwindowname "$W" 2>/dev/null)
    T=$(DISPLAY=:0 xprop -id "$W" _NET_WM_WINDOW_TYPE 2>/dev/null | sed "s/^.*= //")
    echo "  $W | $N | $T"
  done
'
```

Common signals:

| What you see | What it means | Fix |
|:-------------|:-------------|:----|
| `Override Redirect State: yes` | Electron took the window OUT of WM control. Caused by `transparent: true` + `focusable: false` + `type: 'desktop'` combos. WM-managed states like BELOW won't apply. | Drop `focusable: false` and `type: 'desktop'` (keeping `transparent: true` and `frame: false` is fine). |
| `_NET_WM_WINDOW_TYPE_NORMAL` when you wanted `_DESKTOP` | xprop set DESKTOP but Electron clobbered it back to NORMAL. | Set `type: 'desktop'` on the BrowserWindow constructor; xprop alone is racey. |
| Window appears in dash-to-panel even with `skipTaskbar: true` | Mutter ignored the hint. | Add `type: 'utility'` to the BrowserWindow, OR `wmctrl -ir $WID -b add,skip_taskbar,skip_pager` post-creation on a heartbeat. |
| Widget panel renders on top of every app window | Almost always override-redirect (see row 1). | See row 1. |
| App window stays at startup size despite display resize | Listen for `screen.on('display-metrics-changed', ...)` in main and call `win.setBounds(...)`. Electron doesn't do this automatically. |
| Two apps fight over the same Singleton lock | They share `~/.config/Electron/`. | `app.setName('robos-<app>')` and `app.setPath('userData', '~/.config/robos/electron/<app>')` BEFORE `requestSingleInstanceLock()`. |

## 9. The debug server (DOM snapshots and eval)

Every RobOS app's main.js loads `robos-lib/dom-snapshot` and starts an HTTP debug server on a port unique to the app (registered in `packages/robos-test/lib/harness.js` `PORT_MAP`). Endpoints:

| Path | Method | Returns | Use for |
|:-----|:-------|:--------|:--------|
| `/health` | GET | `{ ok: true }` | The harness pings this until the app is ready. |
| `/snapshot` | GET | JSON tree of the rendered DOM | Tests + inspecting state. |
| `/text-snapshot` | GET | flattened text of all visible nodes | Quick `assert.ok(text.includes(...))`. |
| `/eval` | POST | result of running the request body as JS in the renderer | Click buttons, fill inputs, call functions. |

How to talk to it from your host (the harness forwards via the QEMU port mapping if you're on the VM, but locally — when running `node packages/robos-test/demos/<app>-demo.js` — the debug server is on localhost):

```bash
# When running outside the harness — e.g., the app is already up
PORT=19133  # dev-central
curl -s http://localhost:$PORT/health
curl -s http://localhost:$PORT/text-snapshot | head -20
curl -s -X POST http://localhost:$PORT/eval \
  -H 'Content-Type: text/plain' \
  --data 'document.querySelectorAll(".tree-repo").length'
```

How to use it from a node script (preferred — `lib/snapshot.js` wraps it):

```js
const { getSnapshot, flatText, findById, evalJS, evalClick, waitForText }
  = require('./packages/robos-test/lib/snapshot.js');

const snap = await getSnapshot(19133);
const text = flatText(snap);
const n    = findById(snap, 'foo-button');
await evalClick(19133, '#foo-button');
await evalJS(19133, 'document.querySelectorAll(".thing").length');
await waitForText(19133, 'Loaded', 10000);
```

The debug server only starts if `robos-lib/dom-snapshot` is `require()`-able. Resolution order in every app's main.js:

```js
const libPaths = [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
  path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
  '/usr/local/share/robos/robos-lib/dom-snapshot',
].filter(Boolean);
```

The harness sets `ROBOS_LIB_PATH=packages/robos-lib` so unit tests don't need the VM. Apps deployed in the VM hit the third path. Make sure every new app's main.js follows this exact pattern — we got bitten when `dev-tools` only checked the VM path and the harness couldn't see it.

## 10. The test harness

```bash
node --test packages/robos-test/tests/<app>/e2e.test.js
node --test packages/robos-test/tests/**/unit.test.js
node packages/robos-test/run/index.js   # all tests
```

Key files:

- `lib/harness.js` — `launchApp(appId, scenario)` boots the Electron app under a sandboxed `$HOME` (`packages/robos-test/run/test-<id>-<ts>/`) with `PATH` prepended by `packages/robos-test/sandbox/bin/`. So `gh`, `claude`, `pass`, `ssh`, etc. all hit our stubs, not the real binaries.
- `lib/scenarios.js` — named scenarios passed to `launchApp`. Each is a JSON object; the harness writes parts of it into the sandbox `$HOME` before launch (e.g., `scenario.settings` becomes `~/.config/robos/settings.json`).
- `lib/snapshot.js` — DOM snapshot client. Helpers above.

Scenario `name` flows into `ROBOS_SCENARIO` env var, which the sandbox stubs read to vary their output. So `all-good` returns success-paths, `all-broken` returns failures, etc.

To add a new scenario, edit `scenarios.js`. To add a new fake response from the gh stub, edit `packages/robos-test/sandbox/bin/gh`.

## 11. The demo pipeline

Three shared modules:

- `lib/recorder.js` — `findWindowGeometry(title)` (xwininfo), `startRecording({ geometry, outPath })` (ffmpeg x11grab → vp9), `stopRecording(handle)`, `createCaptionTrack(rec)`, `writeVttFile(cues, path)`.
- `lib/narrator.js` — `synthesizeCue(text, outWav)` (piper), `getAudioDurationMs(path)` (ffprobe), `buildTimelineAudio(cues, outPath, totalMs)` (ffmpeg amix + adelay), `muxVideoAudio(video, audio, out, { captionPath })` (ffmpeg -c:v copy -c:a libopus + mov_text/webvtt).
- `lib/demo-runner.js` — wraps all of the above. Each `demos/<app>-demo.js` is a thin script: define a `SCRIPT` array of `{ narration, js, minHold }` cues, call `runDemo({ slug, appId, windowTitle, scenario, prelaunch, script })`.

What `runDemo` does:

1. Pre-synthesizes every narration cue with piper, measures the duration of each.
2. Launches the app via the harness in a sandbox HOME.
3. Calls `prelaunch(app)` if provided (typically writes seed JSON files to the sandbox HOME, then calls `evalJS(port, 'window.location.reload()')` so the renderer picks them up).
4. Waits `postSettle` ms.
5. Finds the window by title via `xwininfo`, starts ffmpeg x11grab on its geometry.
6. For each cue: runs the cue's `js`, records the elapsed time, sleeps for `max(minHold, audio_duration + 600ms)`.
7. Stops recording. Writes `.vtt`, builds the timeline audio, muxes to a final webm with embedded captions.

Outputs land in `packages/robos-test/run/demos/<slug>/`:

```
<slug>.webm           # silent screen capture
<slug>.vtt            # WebVTT captions
<slug>-audio.wav      # piper narration timeline
<slug>-final.webm     # the upload-ready file (VP9 + Opus + WebVTT)
cue-audio/cue-NN.wav  # per-cue piper output, inspectable
<slug>.md             # YouTube metadata (title, description, chapters, tags)
```

Pattern for clicks inside cues:

```js
const CLICK = (selector) => `
  (() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (el) el.click();
  })();
`;
```

For typewriter inputs: **fire and forget** — don't `await` inside the `evalJS` because `httpPost` has a 5s timeout. Wrap the async loop in an IIFE and return synchronously:

```js
const TYPE = (selector, text) => `
  (() => {
    (async () => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.focus(); el.value = '';
      for (const ch of ${JSON.stringify(text)}) {
        el.value += ch;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 55));
      }
    })();
    return 'typing-started';
  })();
`;
```

For mocking IPC results without modifying main.js, **inject HTML directly** into the rendered list elements after the IPC has resolved. We did this for git-projects' branches/commits tabs because real `git log` returns empty against fake `.git` dirs:

```js
function CLICK_PROJECT(id) {
  return `
    (() => {
      document.querySelector('.tree-repo[data-id="${id}"]').click();
      setTimeout(() => {
        document.getElementById('branches-list').innerHTML = '${MOCK_BRANCHES_HTML}';
        document.getElementById('commits-list').innerHTML  = '${MOCK_COMMITS_HTML}';
      }, 1100);
    })();
  `;
}
```

The 1100ms delay covers `selectProject`'s async fetches.

## 12. Sandbox stubs

`packages/robos-test/sandbox/bin/` contains scripts that fake CLIs. The harness prepends this dir to `PATH` so any spawn from an Electron app hits the stub instead of the real binary.

Existing stubs:

- `gh` — handles `auth status`, `issue list`, `issue view`, `pr list`, `pr view`, `pr diff`, `pr checks`, `run list`, `run view`, `repo list`, `org list`, `search repos`, `copilot`, `api user`, `api repos/<r>/deployments`, `extension list`, `--version`. Reads `$ROBOS_SCENARIO` and per-endpoint JSON fixtures from `packages/robos-test/sandbox/data/`.
- `claude` — returns a fake version string for provider-detection probes. Extend it with a session-streaming mode if you want to mock Claude output.
- `pass` — a real-ish `pass` clone that reads/writes the sandbox `~/.password-store/`.
- `gpg`, `gpgconf`, `gpg-connect-agent` — minimal stubs.
- `ssh`, `ssh-keygen`, `git` — enough to satisfy our apps.

To add a new fake response, edit the relevant stub and a JSON fixture under `sandbox/data/`. Run the e2e test that exercises the path; if it doesn't exist yet, write it.

## 13. Fixing a bug end-to-end (worked example)

Take the desktop-widgets-on-top bug we hit. The full loop:

```bash
# 1. Edit on host
$EDITOR packages/desktop-widgets/main.js

# 2. Quick sanity check via harness (no VM needed)
node packages/robos-test/demos/desktop-widgets-demo.js
# (or run an e2e test if one exists)

# 3. Deploy to running VM
scp -P 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  packages/desktop-widgets/main.js robos@localhost:/tmp/dw.js
ssh -p 2224 ... robos@localhost \
  "echo robos | sudo -S cp /tmp/dw.js /usr/local/share/robos/desktop-widgets/main.js"

# 4. Restart the app
ssh -p 2224 ... robos@localhost '
  pkill -9 -f "electron.*desktop-widgets" 2>/dev/null
  sleep 1
  DISPLAY=:0 setsid nohup /usr/bin/electron /usr/local/share/robos/desktop-widgets \
    --no-sandbox --disable-gpu --disable-dev-shm-usage > /tmp/dw.log 2>&1 < /dev/null &
'

# 5. Inspect — is it where we think it is?
ssh -p 2224 ... robos@localhost '
  WID=$(DISPLAY=:0 xdotool search --name "RobOS Desktop Widgets" 2>/dev/null | head -1)
  DISPLAY=:0 xprop -id $WID _NET_WM_WINDOW_TYPE _NET_WM_STATE
  DISPLAY=:0 xwininfo -id $WID | grep -iE "Override|Map State"
'

# 6. Iterate. When done, commit + push to main.
git add packages/desktop-widgets/main.js
git commit -m "desktop-widgets: …"
git push origin main
```

## 14. Common gotchas

| Symptom | Cause | Fix |
|:--------|:------|:----|
| App crashes on second invocation | No single-instance lock | `app.requestSingleInstanceLock()` in main.js + `app.on('second-instance', ...)` for toggle behavior. |
| Toggle behavior silently stops working | Stale Singleton lock in `~/.config/Electron/` from a different app | Give app its own `app.setName()` + `app.setPath('userData', '~/.config/robos/electron/<app>')` BEFORE the lock call. |
| App doesn't show up in launcher | Missing from `desktop-manager/main.js` `APP_REGISTRY` or `APP_BINS` | Add it. |
| App icon blank in launcher | Missing from `robos-icons/index.js` `BUILTIN_APPS` | Add it. |
| App fails to launch via desktop-manager keepAlive | `node_modules/electron` missing | Don't `sudo rm -rf` the whole package dir during deploy. Use `rsync --exclude='node_modules'`. If already wiped, re-`npm install` in the VM. |
| Harness can't find the app's debug port | `dom-snapshot` lookup only checks the VM path | Use the standard `ROBOS_LIB_PATH` → local dev → VM path resolution order. |
| `evalJS` times out at 5s | Cue contains `await new Promise(r => setTimeout(r, ...))` and the script is awaited | Wrap in fire-and-forget IIFE and `return` synchronously. |
| Captions visible in mp4/Firefox but not Chrome | Chrome doesn't render `mov_text` / `webvtt` subtitle tracks reliably inside webm/mp4 | Upload the `.vtt` separately to YouTube. |
| App's HTML title doesn't match what xwininfo finds | A copy-pasted `<title>` in `renderer/index.html` from another app | Fix the HTML title; document.title overrides BrowserWindow title at runtime. |
| Demo cues don't fire | Wrong CSS selector (renderer changed) | `curl http://localhost:<port>/snapshot \| jq` to see the actual DOM. |

## 15. When to commit, when to branch

**Always commit to `main`.** No feature branches. The repo is single-author + AI agents; PR review is solo; long-lived branches just create merge headaches and out-of-sync demo URLs.

Exceptions:

- A long-running risky migration where you want to bisect — fine to use a branch, but merge it the same day.
- Anything that another active agent (Copilot) is editing — coordinate on the same branch or wait.

Use Conventional Commits — `feat:`, `fix:`, `docs:`, `chore:`, `refactor:` — and keep them granular (one logical change per commit). The git log is the changelog; treat it like one.

## 16. Where to look when stuck

- **App misbehavior**: that app's `main.js` and `renderer/`. Then `xprop` on its window.
- **Harness or demo flakiness**: `packages/robos-test/lib/{harness,snapshot,recorder,narrator,demo-runner}.js`.
- **VM provisioning**: `infra/desktop/cloud-init/user-data` (it's the source of truth for everything that lands on a fresh VM).
- **Series production**: [`docs/model-problem/handoff.md`](model-problem/handoff.md), [`fixtures.md`](model-problem/fixtures.md), [`metadata-template.md`](model-problem/metadata-template.md).
- **Conventions you didn't know existed**: [`AGENTS.md`](https://github.com/nddipiazza/robos/blob/main/AGENTS.md). Read it once a quarter.
