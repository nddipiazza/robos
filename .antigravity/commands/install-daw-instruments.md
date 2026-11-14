# Install RobOS DAW Open-Source Instruments (`/install-daw-instruments`)

Download and manage open-source drum kits (`gm-rock-kit`, `virtuosity-cc0`, `tr-808-kit`, `sfzinstruments/*`) and Linux LV2/VST studio plugins for **RobOS DAW Studio** Sound Replacement into `~/.local/share/robos/daw-studio/instruments/` without committing sample `.wav`/`.flac` files to Git.

## Quick Commands

```bash
# List installed and available open-source drum kits
node packages/daw-studio/bin/daw-instruments.js list

# Download all default open-source studio drum kits (Pearl DX + Virtuosity CC0 + TR-808)
node packages/daw-studio/bin/daw-instruments.js install all
```

Follow the full instructions in the `install-daw-instruments` skill (`SKILL.md`).
