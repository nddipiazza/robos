---
name: install-daw-instruments
description: Download and manage open-source drum kits, acoustic sample packs (CC0 / GPL), and Linux LV2/VST/LADSPA studio plugins for RobOS DAW Studio Sound Replacement into ~/.local/share/robos/daw-studio/instruments without ever committing .wav or .flac samples to Git.
---

# Install RobOS DAW Open-Source Instruments & Drum Kits

Download verified open-source drum kits and studio plugins for **RobOS DAW Studio** (`packages/daw-studio`) into the user's untracked local store (`~/.local/share/robos/daw-studio/instruments/`).

## Cardinal Rule — Never Commit Audio Sample Libraries to Git

- **NEVER** stage or commit `.wav`, `.flac`, `.ogg`, `.sf2`, or `.sfz` sample packs into the RobOS repository.
- All instrument packs MUST be installed into `~/.local/share/robos/daw-studio/instruments/drumkits/<kit-id>/` (overrideable in tests via `ROBOS_DAW_INSTRUMENTS_DIR`).

## Input

`$ARGUMENTS` — Subcommand and optional kit identifier:
- `list` — Show installed and available open-source drum kits and their local paths
- `install-defaults` — Download the default studio drum kits (`gm-rock-kit` + `tr-808-kit`)
- `install <kit-id | all>` — Download a specific kit (`gm-rock-kit`, `virtuosity-cc0`, `tr-808-kit`, or `all`)
- `install-sfz <github-org/repo> <kit-slug>` — Clone or extract an open-source SFZ / DrumGizmo kit from reliable open archives into `~/.local/share/robos/daw-studio/instruments/drumkits/<kit-slug>/`
- `install-lv2` — Install open-source Linux LV2 / LADSPA studio plugins (`lsp-plugins-lv2`, `calf-plugins`, `x42-plugins`, `avldrums.lv2`, `zam-plugins`, `dragonfly-reverb`, `drumgizmo`)

## Reliable Open-Source Instrument Archives

### 1. Built-In Verified Catalog (`packages/daw-studio/bin/daw-instruments.js`)
| Kit ID | Kit Name | License | Upstream Archive |
|--------|----------|---------|------------------|
| `gm-rock-kit` | Pearl DX 5pc Acoustic Studio Kit (26 multi-velocity `.wav` layers: Kick, Snare, Rimshot, Toms 1/2/Floor, Closed/Open Hats, Crash, Ride) | `GPL-3.0` | `https://github.com/hydrogen-music/hydrogen/tree/main/data/drumkits/GMRockKit` (Glen MacArthur / AVL) |
| `virtuosity-cc0` | Virtuosity Close-Miked Studio Drums (`.flac` close-mic kick, snare, high tom, overhead crash) | `CC0-1.0` | `https://github.com/sfzinstruments/virtuosity_drums` |
| `tr-808-kit` | Roland TR-808 Studio Emulation Kit (`.flac` sub kick, tight kick, snappy snare, toms, hats, cymbal) | `GPL-3.0` | `https://github.com/hydrogen-music/hydrogen/tree/main/data/drumkits/TR808EmulationKit` |

### 2. Extended Open-Source SFZ & Multi-Mic Drum Archives (GitHub `sfzinstruments`)
When the user asks for heavier multi-gigabyte studio kits (e.g. Metal, Jazz, Brush, Vintage), pull from the `sfzinstruments` organization into `~/.local/share/robos/daw-studio/instruments/drumkits/<kit-slug>/` and drop a `kit.json` manifest:
- **`sfzinstruments/DrumGizmo.MuldjordKit`** (`CC-BY-4.0`) — Tama Starclassic rock/metal studio kit with multi-velocity close mics
- **`sfzinstruments/DrumGizmo.DRSKit`** (`CC-BY-4.0`) — Acoustic studio jazz/rock kit
- **`sfzinstruments/SMDrums`** (`Freely redistributable`) — Deeply multi-sampled studio acoustic drum kit
- **`sfzinstruments/WilkinsonAudio.NakedDrums`** — Dry studio acoustic drums ideal for custom EQ & compression
- **`sfzinstruments/karoryfer.frankensnare`** (`CC0-1.0`) — Deeply velocity-layered studio snare pack
- **`x42/avldrums.lv2`** (`GPL-2.0+`) — Black Pearl & Red Zeppelin acoustic drum kits by Glen MacArthur

### 3. Open-Source Linux Studio Plugins (LV2 / VST3 / LADSPA)
On Ubuntu / Debian RobOS workstations:
```bash
sudo apt-get update && sudo apt-get install -y \
  lsp-plugins-lv2 \
  x42-plugins \
  avldrums.lv2 \
  calf-plugins \
  zam-plugins \
  dragonfly-reverb-lv2
```

## Procedure

1. **Inspect current installed instruments**:
   ```bash
   node packages/daw-studio/bin/daw-instruments.js list
   ```
2. **Install the default studio drum kits** (used automatically by RobOS DAW Studio's **Add Mic Wizard** Sound Replacement engine):
   ```bash
   node packages/daw-studio/bin/daw-instruments.js install all
   ```
3. **Add a custom open-source SFZ / archive kit** (optional):
   - Download or sparse-checkout `.wav` / `.flac` samples into `~/.local/share/robos/daw-studio/instruments/drumkits/<slug>/`.
   - Create an optional `kit.json` (`{ "name": "...", "author": "...", "license": "CC0-1.0", "sourceUrl": "https://..." }`). RobOS DAW Studio automatically discovers every folder under `drumkits/`!
4. **Verify Git cleanliness**:
   Run `git status --short` to ensure zero `.wav` or `.flac` sample files exist inside the repository working tree.

## Validation

- `~/.local/share/robos/daw-studio/instruments/drumkits/gm-rock-kit/kit.json` exists and lists SHA-256 verified sample files.
- `node packages/daw-studio/bin/daw-instruments.js list` shows `INSTALLED` for the requested kits.
- `git status --short` shows zero `.wav` or `.flac` audio sample files in the repository.
