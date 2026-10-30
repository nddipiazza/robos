---
name: create-rts-unit
description: Create or update a playable RTS unit in RobOS RTS (Starfall Command), including unit stats, weapon definitions, procedural combat SFX, and AI-synthesized voice dialogue audio for unit selection, movement, job completion, and witty attack callouts.
---

# Create Playable RTS Unit (`create-rts-unit`)

Create or update a playable RTS unit in **RobOS RTS: Starfall Command** (`games/robos-rts`), complete with:
1. **Deterministic 64Hz Simulation Stats & Weapons** (`scripts/engine/RTSData.gd` & `scripts/engine/SimEngine.gd`)
2. **3D Procedural Mesh & Visual Silhouette** (`scripts/RTSWorld3D.gd` & `scripts/RTSIcons.gd`)
3. **Weapon & Ability Combat SFX** (`generate_sfx.py` -> `assets/audio/sfx/<sfx>.wav`)
4. **Interactive Voice Dialogue & Spoken Audio** (`generate_unit_voices.py` -> `assets/audio/voice/<unit>_<category>_<n>.wav`)

---

## Required Dialogue & Audio Interactions for Playable Units

Every playable character unit (especially Meridian Guard human units) MUST include multi-line voice dialogue and generated `.wav` audio across its core gameplay interactions:

| Interaction Category | Trigger Event | Minimum Varieties | Example (`pioneer` Worker) |
| :--- | :--- | :---: | :--- |
| **`select`** | Player clicks or box-selects the unit | **5+** | *"What's up, Commander?"*, *"Talk to me, boss. Welding rig's hot."* |
| **`move`** | Player issues a move, gather, or reposition order | **4+** | *"On my way."*, *"You got it, chief."* |
| **`job_done`** | Worker completes constructing a structure | **5+** | *"Job's done! Not a bad weld if I say so myself."* |
| **`attack`** | Player orders an attack or unit engages an enemy | **5+** | *"Hold still, I'm gonna spot-weld your armor shut!"* |
| **`ready`** | Unit finishes training at a production building | **2+** | *"Rifleman locked and loaded!"* |

---

## Step-by-Step Procedure

### Step 1: Define Unit Stats, Weapon SFX & Dialogues in `RTSData.gd`
Add or update the unit entry in `games/robos-rts/scripts/engine/RTSData.gd` with `"weapon"` (`"sfx"`, `"attack_type"`) and `"dialogues"`:

```gdscript
"pioneer": {
	"id": "pioneer",
	"name": "Pioneer",
	"faction": FACTION_HUMANS,
	"is_structure": false,
	"is_worker": true,
	"weapon": {
		"name": "Arc Welder",
		"damage": 5.0,
		"range": 1.6,
		"period": 1.07,
		"sfx": "arc_welder",
		"attack_type": "melee"
	},
	"dialogues": {
		"select": [
			{"id": "pioneer_select_1", "text": "What's up, Commander?"},
			{"id": "pioneer_select_2", "text": "Talk to me, boss. Welding rig's hot."},
			# ... 5+ varieties
		],
		"move": [
			{"id": "pioneer_move_1", "text": "On my way."},
			# ... 4+ varieties
		],
		"job_done": [
			{"id": "pioneer_job_done_1", "text": "Job's done! Not a bad weld if I say so myself."},
			# ... 5+ varieties
		],
		"attack": [
			{"id": "pioneer_attack_1", "text": "Guess this arc welder does overtime on hostiles!"},
			# ... 5+ witty varieties
		]
	}
}
```

### Step 2: Add Voice Persona & Lines to `generate_unit_voices.py`
Register the unit's neural voice profile (`voice`, `rate`, `pitch`, and `lines`) in `games/robos-rts/generate_unit_voices.py` and run the generator:

```bash
python3 games/robos-rts/generate_unit_voices.py --unit <unit_id>
```

This synthesizes 16-bit 22050 Hz mono PCM `.wav` files in `games/robos-rts/assets/audio/voice/` with tactical radio-comm filtering and updates `games/robos-rts/assets/audio/voice/manifest.json`.

### Step 3: Add Weapon & Ability SFX to `generate_sfx.py`
Ensure the unit's weapon `"sfx"` and any active ability `"sfx"` have procedural generators in `games/robos-rts/generate_sfx.py`, then regenerate:

```bash
python3 games/robos-rts/generate_sfx.py
```

### Step 4: Verify Runtime Wiring in `RTSAudio.gd` & Unit Tests
`RTSAudio.gd` automatically loads all `.wav` files from `assets/audio/sfx/` and `assets/audio/voice/manifest.json` via direct RIFF `WAVE` parsing (no `.import` files required) and triggers:
- `RTSAudio.play_unit_dialogue(unit_type, "select")` when clicked/selected in `RTSMain.gd`
- `RTSAudio.play_unit_dialogue(unit_type, "move")` on move/harvest orders in `RTSMain.gd`
- `RTSAudio.play_unit_dialogue(unit_type, "attack")` on attack orders in `RTSMain.gd` and combat engagement in `SimEngine.gd`
- `RTSAudio.play_unit_dialogue(worker_type, "job_done")` when structure construction completes in `SimEngine.gd`
- `RTSAudio.play_unit_dialogue(unit_type, "ready")` when unit production completes in `SimEngine.gd`

Run the headless Godot verification suite to confirm all streams load and trigger with zero errors:

```bash
godot --headless --path games/robos-rts --script tests/test_audio_sfx.gd
```
