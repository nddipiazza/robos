---
name: record-demo
description: Capture a fully automated, narrated walkthrough video of a RobOS app with neural TTS narration (Piper) and WebVTT captions.
---

# Record a Narrated Demo Video of a RobOS App

Capture a full narrated walkthrough demo of a RobOS Electron app, suitable for YouTube. Produces a final WebM/MP4 video with neural voice-over narration (Piper TTS) and WebVTT captions.

## Input

$ARGUMENTS — `<app-id>` optionally followed by a free-form description of what to demonstrate.

## Prerequisites

- VM must be running (`/start-vm`)
- `piper` binary installed at `/usr/local/bin/piper`
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

## Steps

### 0. Verify selectors and keep demos short
- Target **2–3 minutes total** (120–180 seconds)
- Max **12–15 cues** per demo
- `minHold` per cue: **2000–5000 ms**
- If a cue shows AI/network results, **inject mock HTML** with `js:` rather than waiting.

### 1. Check or create demo script
Follow template in `packages/robos-test/demos/<app-id>-demo.js`.

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

### 3. Run demo on VM as pat
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

### 4. Fetch deliverables
```bash
scp -P 2224 -o StrictHostKeyChecking=no "robos@localhost:/usr/local/share/robos/robos-test/run/demos/<app-id>/<app-id>-final.webm" ~/demos/<app-id>-demo.webm
scp -P 2224 -o StrictHostKeyChecking=no "robos@localhost:/usr/local/share/robos/robos-test/run/demos/<app-id>/<app-id>.vtt" ~/demos/<app-id>-demo.vtt
```
