# Record a Narrated Demo Video of a RobOS App

Capture a full narrated walkthrough demo of a RobOS Electron app, suitable for YouTube.
Produces a final WebM/MP4 video with neural voice-over narration (Piper TTS) and WebVTT captions.

## Input

$ARGUMENTS — `<app-id>` optionally followed by a free-form description of what to demonstrate, e.g.:
- `git-projects` — use the default demo script for that app
- `git-projects "focus on the AI Prompt and GitHub Org features"` — customise the demo scope

## Prerequisites

- VM must be running (`/start-vm`)
- `piper` binary installed at `/usr/local/bin/piper` (wrapper that sets `LD_LIBRARY_PATH` + `--espeak-data`)
- Piper model at `/usr/local/share/robos/robos-test/models/en_US-lessac-medium.onnx`
- Display must not sleep — disable DPMS before recording:
  ```bash
  PAT_UID=$(ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost 'id -u pat')
  ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "
    sudo -u pat DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${PAT_UID}/bus \
      gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
    sudo -u pat DISPLAY=:0 XAUTHORITY=/run/user/${PAT_UID}/gdm/Xauthority \
      xset -dpms && xset s off && xset s noblank
  "
  ```

## Toolchain

| Tool | Purpose |
|------|---------|
| `piper` | Neural TTS narration (en_US-lessac-medium voice) |
| `ffmpeg` | Screen recording (x11grab) + audio mux |
| `xwininfo` | Window geometry for cropping |
| `robos-test demo-runner` | Orchestrates TTS → record → mux pipeline |

## Recording Architecture

```
packages/robos-test/demos/<app-id>-demo.js
    │
    ├── Pre-synthesize all narration cues with piper (en_US-lessac-medium)
    ├── Launch app via harness.js (Electron, sandbox disabled)
    ├── findWindowGeometry() → ffmpeg x11grab recording starts
    ├── Execute SCRIPT steps: evalJS() / click / fill, minHold per cue
    ├── stopRecording() → <slug>.webm
    ├── buildTimelineAudio() → <slug>-audio.wav (cues placed at real timestamps)
    ├── writeVttFile() → <slug>.vtt (WebVTT captions)
    └── muxVideoAudio() → <slug>-final.webm
```

Output lands in:
```
/usr/local/share/robos/robos-test/run/demos/<app-id>/
  <app-id>.webm           — silent screen capture
  <app-id>-audio.wav      — narration timeline
  <app-id>.vtt            — WebVTT captions
  <app-id>-final.webm     — final narrated video  ← this is the deliverable
  cue-audio/cue-NN.wav    — per-cue audio (Piper output)
```

## Steps

### 1. Check/create the demo script

If `packages/robos-test/demos/<app-id>-demo.js` already exists, use it.

Otherwise create it following the shape of `git-projects-demo.js`:

```js
'use strict';
const { runDemo } = require('../lib/demo-runner');
const scenarios  = require('../lib/scenarios');

const SCRIPT = [
  {
    narration: 'Opening sentence describing the app.',
    js: null,          // optional JS to evalJS into the renderer
    minHold: 5000,     // ms to hold this scene before advancing
  },
  // ... more cues
];

runDemo({
  slug: '<app-id>',
  appId: '<app-id>',
  windowTitle: 'RobOS <App Name>',
  scenario: scenarios['all-good'],
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
```

**SCRIPT tips:**
- `narration` — one sentence or two max; Piper speaks at ~150 wpm
- `js` — evaluated in the renderer via the debug HTTP server; use `null` for observe-only cues
- `minHold` — set to `Math.max(cue_audio_duration_ms + 500, desired_scene_ms)`
- Helper: `CLICK(selector)` → `(() => { document.querySelector(sel)?.click(); })()`

### 2. Deploy robos-test to VM

```bash
scp -P 2224 -o StrictHostKeyChecking=no -r packages/robos-test/* robos@localhost:/tmp/robos-test-deploy/
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "
  sudo rm -rf /usr/local/share/robos/robos-test &&
  sudo cp -r /tmp/robos-test-deploy /usr/local/share/robos/robos-test &&
  sudo chmod -R a+rX /usr/local/share/robos/robos-test &&
  sudo bash -c 'cd /usr/local/share/robos/robos-test && npm install --quiet' &&
  sudo chmod -R a+rwX /usr/local/share/robos/robos-test/run/ &&
  rm -rf /tmp/robos-test-deploy
"
```

### 3. Run the demo on the VM as pat

```bash
PAT_UID=$(ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost 'id -u pat')
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "
  sudo rm -rf /usr/local/share/robos/robos-test/run/demos/<app-id>
  sudo -u pat \
    DISPLAY=:0 \
    XAUTHORITY=/run/user/${PAT_UID}/gdm/Xauthority \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${PAT_UID}/bus \
    HOME=/home/pat \
    node /usr/local/share/robos/robos-test/demos/<app-id>-demo.js \
    > /tmp/<app-id>-demo.log 2>&1 &
  echo PID: \$!
"
```

Monitor progress:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost 'tail -f /tmp/<app-id>-demo.log'
```

### 4. Copy output to host

```bash
scp -P 2224 -o StrictHostKeyChecking=no \
  "robos@localhost:/usr/local/share/robos/robos-test/run/demos/<app-id>/<app-id>-final.webm" \
  ~/demos/<app-id>-demo.webm
scp -P 2224 -o StrictHostKeyChecking=no \
  "robos@localhost:/usr/local/share/robos/robos-test/run/demos/<app-id>/<app-id>.vtt" \
  ~/demos/<app-id>-demo.vtt
```

### 5. Generate YouTube description markdown

Create `~/demos/<app-id>-youtube.md` with:

```markdown
# <App Name> — RobOS Demo

**Video title:** [RobOS] <App Name> Walkthrough — <tagline>

**Description:**
<2-3 paragraph description of what the demo shows>

**Chapters:**
0:00 Introduction
<derive from .vtt timestamps>

**Tags:** RobOS, developer tools, AI, open source, Linux, <app-specific tags>

**Thumbnail suggestion:** <describe a compelling thumbnail>
```

Derive chapter timestamps directly from the `.vtt` file (each cue start time = a chapter).

## Output

Report to the user:
- `~/demos/<app-id>-demo.webm` — final narrated video
- `~/demos/<app-id>-demo.vtt` — WebVTT captions
- `~/demos/<app-id>-youtube.md` — YouTube metadata

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Model file doesn't exist` | narrator.js uses short name; fix: model path = `path.join(dataDir, voice + '.onnx')` |
| `App not found: /usr/local/share/packages/...` | harness.js PACKAGES_DIR wrong; fix: fallback to sibling dir `path.resolve(__dirname, '../..')` |
| Display goes black during recording | Run `xset -dpms && xset s off` as pat before starting |
| `EACCES` on run/demos/ | Run `sudo chmod -R a+rwX /usr/local/share/robos/robos-test/run/` |
| Window not found by `xwininfo` | Check `windowTitle` matches exactly; app may not have settled yet (increase `postSettle`) |

## App-specific demo scripts

### git-projects

Script: `packages/robos-test/demos/git-projects-demo.js`  
14 cues, ~136 seconds.  
Output: `/usr/local/share/robos/robos-test/run/demos/git-projects/git-projects-final.webm`

**Scene summary:**
1. Overview of Git Projects (13s)
2. Sidebar tree explained (8s)
3. Click flagship project (3s)
4. Detail panel — commits tab (12s)
5. Branches tab (7s)
6. Secrets tab + AI (11s)
7. Dev Setup — instructions (13s)
8. Dev Setup — setup script (7s)
9. Dev Setup — test/start/e2e (8s)
10. Edit tab (9s)
11. Switch project (7s)
12. Uncloned project (8s)
13. Add project modal (8s)
14. Wrap-up (12s)
