---
title: "RobOS DAW Studio"
package: daw-studio
category: "core-desktop"
component_type: app
permalink: /daw-studio/
redirect_from:
  - /apps/daw-studio/
summary: "Multi-track Digital Audio Workstation, Focusrite & PipeWire Pro-Audio low-latency interface studio, Add Mic Wizard, open-source LV2/EQ chains, and drum sound replacement"
description: "Multi-track Digital Audio Workstation, Focusrite & PipeWire Pro-Audio low-latency interface studio, Add Mic Wizard, open-source LV2/EQ chains, and drum sound replacement"
icon: daw-studio.svg
---

Multi-track Linux Digital Audio Workstation with native **Focusrite Scarlett / Clarett+ + Behringer ADA8200 ADAT** 20-channel USB hardware control (`snd_usb_audio` + PipeWire Pro-Audio quantum scheduling), **DrumSet AI** multi-mic soundcheck, an interactive **Add Mic Wizard**, real-time 6 ms hot-swapped parametric EQ & dynamics chains, non-destructive **Drum Sound Replacement**, and **`From -> To` Multi-Format Mixdowns** (`MP3`, `FLAC`, `WAV 24-bit`, `M4A`, `OGG`, `Opus`, `AIFF`).

- **[Full RobOS DAW Studio Landing Page & Live Session Audio Exports (`/daw/`)](/daw/)**
- **[Engineering Blog: 20-Channel Linux Drum Tracking & Metal Kick Mid-Punch DSP](/blog/robos-daw-studio-linux-multitrack-drum-workstation/)**

## Key features

- **Preferences → Audio Devices**: Native USB pro-audio discovery (`1235:*` Focusrite Scarlett & Clarett+), PipeWire sample rate & quantum buffer latency tuning, and direct ALSA Scarlett preamp switching (`+48V` Phantom Power, `Air`, `-10dB Pad`, `Inst` Hi-Z).
- **Add Mic Wizard**: Visual studio microphone menu (Kick Inside, Kick Outside/Subkick, Snare Top, Snare Bottom Ø phase-inverted, Rack Toms 1–3, Floor Toms 1–2, Hi-Hat, Ride Spot, Accent Cymbal Spot, Overheads, Drum Room/Crush, Guitar Cab, Guitar Direct Hi-Z, Bass Cab/DI, Studio Vocal) with **Strike Instrument / Tap the Mic** multi-channel auto-detection across all analog, ADAT, and S/PDIF inputs, plus `+ Add & Setup Next Mic` for miking Kits of any size.
- **Automatic Open-Source DSP & Drum Sound Replacement**: Applies per-mic Noise Gate, High-Pass + 3-Band Parametric EQ, Compressor, and optional Drum Sound Replacement triggered on detected drum transients.
- **Open-Source Drum Archives via `/install-daw-instruments`**: Drum samples (`gm-rock-kit` Pearl DX GPL-3.0, `virtuosity-cc0` CC0-1.0, `tr-808-kit` GPL-3.0) download on demand to `~/.local/share/robos/daw-studio/instruments/` so `.wav`/`.flac` sample libraries are never committed to Git:

```bash
node packages/daw-studio/bin/daw-instruments.js install all
```

## Source and integration

The component lives in [`packages/daw-studio`](https://github.com/nddipiazza/robos/tree/main/packages/daw-studio).

Its entry point is [`main.js`](https://github.com/nddipiazza/robos/tree/main/packages/daw-studio/main.js).

## Run from source

```bash
scripts/source-shortcuts/node_modules/.bin/electron --no-sandbox scripts/source-shortcuts/source-host.cjs --app=daw-studio
```

## Validation

Run `npm test` from `packages/daw-studio`.
