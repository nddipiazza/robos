#!/usr/bin/env python3
"""
generate_unit_voices.py — AI Voice Dialogue Generator for RobOS RTS: Starfall Command.

Synthesizes spoken dialogue lines for Starfall Command units across their interactions:
  - select   (clicked / selected in-game)
  - move     (ordered to move or gather)
  - attack   (ordered to attack or engaging an enemy with a witty line)
  - job_done (worker completes building a structure — 6 varieties)
  - ready    (unit finishes training at a production structure)

Uses Microsoft Edge Neural TTS (edge-tts) + ffmpeg to produce 16-bit 22050 Hz mono PCM
.wav files in assets/audio/voice/ with subtle tactical radio-comm styling, and exports
assets/audio/voice/manifest.json for RTSAudio.gd & RTSData.gd.
The generator keeps the shipped VoiceDesign recordings by default.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
from pathlib import Path
import random
import struct
import subprocess
import tempfile
import wave

SAMPLE_RATE = 22050
VOICE_DIR = Path(__file__).resolve().parent / "assets" / "audio" / "voice"

UNIT_VOICE_PROFILES: dict[str, dict] = {
    "shade_agent": {
        "unit_name": "Shade Agent",
        "voice": "en-US-GuyNeural",
        "rate": "-10%",
        "pitch": "-8Hz",
        "comm_filter": True,
        "lines": {
            "select": [
                {"id": "shade_agent_select_1", "text": "Shade on your frequency."},
                {"id": "shade_agent_select_2", "text": "Who are we watching?"},
                {"id": "shade_agent_select_3", "text": "I have a clear sightline."},
                {"id": "shade_agent_select_4", "text": "Comms are quiet."},
                {"id": "shade_agent_select_5", "text": "Waiting on the signal."},
            ],
            "move": [
                {"id": "shade_agent_move_1", "text": "Moving under cover."},
                {"id": "shade_agent_move_2", "text": "I'll take the flank."},
                {"id": "shade_agent_move_3", "text": "Crossing now."},
                {"id": "shade_agent_move_4", "text": "Changing position."},
            ],
            "attack": [
                {"id": "shade_agent_attack_1", "text": "Target in sight."},
                {"id": "shade_agent_attack_2", "text": "Hold for my shot."},
                {"id": "shade_agent_attack_3", "text": "Their shields are my problem."},
                {"id": "shade_agent_attack_4", "text": "I have the angle."},
                {"id": "shade_agent_attack_5", "text": "Sending one downrange."},
            ],
            "ready": [
                {"id": "shade_agent_ready_1", "text": "Shade Agent in position."},
                {"id": "shade_agent_ready_2", "text": "Canister rifle checked."},
            ],
        },
    },
    "spine_ambusher": {
        "unit_name": "Spine Ambusher",
        "voice": "en-US-ChristopherNeural",
        "rate": "-12%",
        "pitch": "-15Hz",
        "comm_filter": False,
        "lines": {
            "select": [
                {"id": "spine_ambusher_select_1", "text": "I hear their footfalls."},
                {"id": "spine_ambusher_select_2", "text": "The soil is soft here."},
                {"id": "spine_ambusher_select_3", "text": "Where will they cross?"},
                {"id": "spine_ambusher_select_4", "text": "My spines are set."},
                {"id": "spine_ambusher_select_5", "text": "Let them come closer."},
            ],
            "move": [
                {"id": "spine_ambusher_move_1", "text": "Taking a new position."},
                {"id": "spine_ambusher_move_2", "text": "I will wait there."},
                {"id": "spine_ambusher_move_3", "text": "Keep the crossing in sight."},
                {"id": "spine_ambusher_move_4", "text": "Scythes forward."},
            ],
            "attack": [
                {"id": "spine_ambusher_attack_1", "text": "Split their line."},
                {"id": "spine_ambusher_attack_2", "text": "The ground has teeth."},
                {"id": "spine_ambusher_attack_3", "text": "Let the spines rise."},
                {"id": "spine_ambusher_attack_4", "text": "They walked into it."},
                {"id": "spine_ambusher_attack_5", "text": "Straight through."},
            ],
            "ready": [
                {"id": "spine_ambusher_ready_1", "text": "Spine Ambusher grown."},
                {"id": "spine_ambusher_ready_2", "text": "Find me a choke point."},
            ],
        },
    },
    "rupture_crawler": {
        "unit_name": "Rupture Crawler",
        "voice": "en-US-TonyNeural",
        "rate": "-13%",
        "pitch": "-17Hz",
        "lines": {
            "select": [
                {"id": "rupture_crawler_select_1", "text": "Rupture Crawler awake."},
                {"id": "rupture_crawler_select_2", "text": "The sac is full."},
                {"id": "rupture_crawler_select_3", "text": "Find me a tight group."},
                {"id": "rupture_crawler_select_4", "text": "The ground will open."},
                {"id": "rupture_crawler_select_5", "text": "Gnarl charge ready."},
            ],
            "move": [
                {"id": "rupture_crawler_move_1", "text": "Crawling into range."},
                {"id": "rupture_crawler_move_2", "text": "I smell the crossing."},
                {"id": "rupture_crawler_move_3", "text": "Moving my sacs."},
                {"id": "rupture_crawler_move_4", "text": "Through the gap."},
            ],
            "attack": [
                {"id": "rupture_crawler_attack_1", "text": "Bile in the air."},
                {"id": "rupture_crawler_attack_2", "text": "Scatter while you can."},
                {"id": "rupture_crawler_attack_3", "text": "The barrier will melt."},
                {"id": "rupture_crawler_attack_4", "text": "Mark the landing."},
                {"id": "rupture_crawler_attack_5", "text": "The acid falls."},
            ],
            "ready": [
                {"id": "rupture_crawler_ready_1", "text": "The cocoon opens."},
                {"id": "rupture_crawler_ready_2", "text": "Rupture Crawler grown."},
            ],
        },
    },
    "duskblade": {
        "unit_name": "Duskblade",
        "voice": "en-US-DavisNeural",
        "rate": "-6%",
        "pitch": "-8Hz",
        "lines": {
            "select": [
                {"id": "duskblade_select_1", "text": "Duskblade ready."},
                {"id": "duskblade_select_2", "text": "I can pass unseen."},
                {"id": "duskblade_select_3", "text": "Where is the breach?"},
                {"id": "duskblade_select_4", "text": "The Veil holds."},
                {"id": "duskblade_select_5", "text": "Give me an opening."},
            ],
            "move": [
                {"id": "duskblade_move_1", "text": "Moving through the shadows."},
                {"id": "duskblade_move_2", "text": "I'll take the quiet route."},
                {"id": "duskblade_move_3", "text": "Crossing now."},
                {"id": "duskblade_move_4", "text": "I see the path."},
            ],
            "attack": [
                {"id": "duskblade_attack_1", "text": "One clean strike."},
                {"id": "duskblade_attack_2", "text": "I have their flank."},
                {"id": "duskblade_attack_3", "text": "They haven't seen me."},
                {"id": "duskblade_attack_4", "text": "The blade is out."},
                {"id": "duskblade_attack_5", "text": "I'll cut through."},
            ],
            "ready": [
                {"id": "duskblade_ready_1", "text": "Duskblade online."},
                {"id": "duskblade_ready_2", "text": "I walk unseen."},
            ],
        },
    },
    "lattice_archon": {
        "unit_name": "Lattice Archon",
        "voice": "en-US-GuyNeural",
        "rate": "-18%",
        "pitch": "-15Hz",
        "lines": {
            "select": [
                {"id": "lattice_archon_select_1", "text": "We are the Lattice."},
                {"id": "lattice_archon_select_2", "text": "Our charge is stable."},
                {"id": "lattice_archon_select_3", "text": "We stand together."},
                {"id": "lattice_archon_select_4", "text": "Where do we hold?"},
                {"id": "lattice_archon_select_5", "text": "The field is ours."},
            ],
            "move": [
                {"id": "lattice_archon_move_1", "text": "We move as one."},
                {"id": "lattice_archon_move_2", "text": "Our course is set."},
                {"id": "lattice_archon_move_3", "text": "We cross together."},
                {"id": "lattice_archon_move_4", "text": "We advance."},
            ],
            "attack": [
                {"id": "lattice_archon_attack_1", "text": "Feel the current."},
                {"id": "lattice_archon_attack_2", "text": "Their line breaks here."},
                {"id": "lattice_archon_attack_3", "text": "Discharge."},
                {"id": "lattice_archon_attack_4", "text": "We have them."},
                {"id": "lattice_archon_attack_5", "text": "Release the charge."},
            ],
            "ready": [
                {"id": "lattice_archon_ready_1", "text": "The Lattice is whole."},
                {"id": "lattice_archon_ready_2", "text": "The warp is complete."},
            ],
        },
    },
    "storm_scribe": {
        "unit_name": "Storm Scribe",
        "voice": "en-US-ChristopherNeural",
        "rate": "-8%",
        "pitch": "-5Hz",
        "lines": {
            "select": [
                {"id": "storm_scribe_select_1", "text": "Storm Scribe at your call."},
                {"id": "storm_scribe_select_2", "text": "The field is steady."},
                {"id": "storm_scribe_select_3", "text": "I can hear their energy."},
                {"id": "storm_scribe_select_4", "text": "Show me where they're gathering."},
                {"id": "storm_scribe_select_5", "text": "The Archive trained me for this."},
            ],
            "move": [
                {"id": "storm_scribe_move_1", "text": "I'll find the high ground."},
                {"id": "storm_scribe_move_2", "text": "Moving behind the line."},
                {"id": "storm_scribe_move_3", "text": "Keep the approach clear."},
                {"id": "storm_scribe_move_4", "text": "On my way."},
            ],
            "attack": [
                {"id": "storm_scribe_attack_1", "text": "Channeling now."},
                {"id": "storm_scribe_attack_2", "text": "Let them come closer."},
                {"id": "storm_scribe_attack_3", "text": "That's a crowded line."},
                {"id": "storm_scribe_attack_4", "text": "I'll drain their charge."},
                {"id": "storm_scribe_attack_5", "text": "Clear the field."},
            ],
            "ready": [
                {"id": "storm_scribe_ready_1", "text": "Storm Scribe ready."},
                {"id": "storm_scribe_ready_2", "text": "My channel is open."},
            ],
        },
    },
    "mirage_adept": {
        "unit_name": "Mirage Adept",
        "voice": "en-US-AriaNeural",
        "rate": "+3%",
        "pitch": "-3Hz",
        "lines": {
            "select": [
                {"id": "mirage_adept_select_1", "text": "Mirage Adept standing by."},
                {"id": "mirage_adept_select_2", "text": "The light bends with me."},
                {"id": "mirage_adept_select_3", "text": "Show me the approach."},
                {"id": "mirage_adept_select_4", "text": "Mirage here. I can scout ahead."},
                {"id": "mirage_adept_select_5", "text": "My glaive is charged."},
            ],
            "move": [
                {"id": "mirage_adept_move_1", "text": "Moving up."},
                {"id": "mirage_adept_move_2", "text": "I'll check the crossing."},
                {"id": "mirage_adept_move_3", "text": "On your signal."},
                {"id": "mirage_adept_move_4", "text": "Taking the flank."},
            ],
            "attack": [
                {"id": "mirage_adept_attack_1", "text": "Glaive out."},
                {"id": "mirage_adept_attack_2", "text": "Cutting through their line."},
                {"id": "mirage_adept_attack_3", "text": "I'll clear the light infantry."},
                {"id": "mirage_adept_attack_4", "text": "Found an opening."},
                {"id": "mirage_adept_attack_5", "text": "Watch the flank."},
            ],
            "ready": [
                {"id": "mirage_adept_ready_1", "text": "Mirage Adept ready."},
                {"id": "mirage_adept_ready_2", "text": "Transfer field online."},
            ],
        },
    },
    "bastion_walker": {
        "unit_name": "Bastion Walker",
        "voice": "en-US-GuyNeural",
        "rate": "-8%",
        "pitch": "-12Hz",
        "lines": {
            "select": [
                {"id": "bastion_walker_select_1", "text": "Bastion Walker standing by."},
                {"id": "bastion_walker_select_2", "text": "Phase coils stable."},
                {"id": "bastion_walker_select_3", "text": "I can hold this line."},
                {"id": "bastion_walker_select_4", "text": "Point me at their armor."},
                {"id": "bastion_walker_select_5", "text": "Bastion crew listening."},
            ],
            "move": [
                {"id": "bastion_walker_move_1", "text": "I'll take the front."},
                {"id": "bastion_walker_move_2", "text": "Moving at your pace."},
                {"id": "bastion_walker_move_3", "text": "Coming around."},
                {"id": "bastion_walker_move_4", "text": "Crossing now."},
            ],
            "attack": [
                {"id": "bastion_walker_attack_1", "text": "Focus their armor."},
                {"id": "bastion_walker_attack_2", "text": "Opening both emitters."},
                {"id": "bastion_walker_attack_3", "text": "They're in range."},
                {"id": "bastion_walker_attack_4", "text": "Put the shield to work."},
                {"id": "bastion_walker_attack_5", "text": "Hold steady. Firing."},
            ],
            "ready": [
                {"id": "bastion_walker_ready_1", "text": "Bastion Walker online."},
                {"id": "bastion_walker_ready_2", "text": "Phase cannons charged."},
            ],
        },
    },
    "rift_engine": {
        "unit_name": "Rift Engine",
        "voice": "en-US-AvaNeural",
        "rate": "-4%",
        "pitch": "-6Hz",
        "lines": {
            "select": [
                {"id": "rift_engine_select_1", "text": "Rift Engine online."},
                {"id": "rift_engine_select_2", "text": "Containment is steady."},
                {"id": "rift_engine_select_3", "text": "Show me the target."},
                {"id": "rift_engine_select_4", "text": "Which lane needs clearing?"},
                {"id": "rift_engine_select_5", "text": "I'll keep the core quiet."},
            ],
            "move": [
                {"id": "rift_engine_move_1", "text": "Moving the engine."},
                {"id": "rift_engine_move_2", "text": "Taking the long way."},
                {"id": "rift_engine_move_3", "text": "Course set."},
                {"id": "rift_engine_move_4", "text": "Drifting into position."},
            ],
            "attack": [
                {"id": "rift_engine_attack_1", "text": "Nova away. Clear the lane."},
                {"id": "rift_engine_attack_2", "text": "Keep back from the blast."},
                {"id": "rift_engine_attack_3", "text": "Sending a pulse."},
                {"id": "rift_engine_attack_4", "text": "The core is out."},
                {"id": "rift_engine_attack_5", "text": "Stand clear."},
            ],
            "ready": [
                {"id": "rift_engine_ready_1", "text": "Rift Engine ready."},
                {"id": "rift_engine_ready_2", "text": "Containment checks passed."},
            ],
        },
    },
    "ridge_scout": {
        "unit_name": "Ridge Scout",
        "voice": "en-US-GuyNeural",
        "rate": "+8%",
        "pitch": "+4Hz",
        "lines": {
            "select": [
                {"id": "ridge_scout_select_1", "text": "Ridge Scout checking in."},
                {"id": "ridge_scout_select_2", "text": "Both nozzles green."},
                {"id": "ridge_scout_select_3", "text": "Where do you need eyes?"},
                {"id": "ridge_scout_select_4", "text": "I've got the high side."},
                {"id": "ridge_scout_select_5", "text": "Radio's good. Go ahead."},
            ],
            "move": [
                {"id": "ridge_scout_move_1", "text": "I'll take the ledge."},
                {"id": "ridge_scout_move_2", "text": "Cutting across."},
                {"id": "ridge_scout_move_3", "text": "I see the route."},
                {"id": "ridge_scout_move_4", "text": "Moving on your mark."},
            ],
            "attack": [
                {"id": "ridge_scout_attack_1", "text": "Caught them looking downhill."},
                {"id": "ridge_scout_attack_2", "text": "Two pistols. One problem."},
                {"id": "ridge_scout_attack_3", "text": "I'll clear the overlook."},
                {"id": "ridge_scout_attack_4", "text": "Their flank's wide open."},
                {"id": "ridge_scout_attack_5", "text": "Taking the shot."},
            ],
            "ready": [
                {"id": "ridge_scout_ready_1", "text": "Pack charged, pistols loaded."},
                {"id": "ridge_scout_ready_2", "text": "Ridge Scout ready to climb."},
            ],
        },
    },
    "sporeburst": {
        "unit_name": "Sporeburst",
        "voice": "en-US-ChristopherNeural",
        "rate": "+8%",
        "pitch": "-16Hz",
        "lines": {
            "select": [
                {"id": "sporeburst_select_1", "text": "I smell the front line."},
                {"id": "sporeburst_select_2", "text": "Keep the sac intact."},
                {"id": "sporeburst_select_3", "text": "The brood sends me."},
                {"id": "sporeburst_select_4", "text": "I hear your signal."},
                {"id": "sporeburst_select_5", "text": "The pressure builds."},
            ],
            "move": [
                {"id": "sporeburst_move_1", "text": "Low and fast."},
                {"id": "sporeburst_move_2", "text": "Scuttling through."},
                {"id": "sporeburst_move_3", "text": "I'll go around."},
                {"id": "sporeburst_move_4", "text": "Follow my trail."},
            ],
            "attack": [
                {"id": "sporeburst_attack_1", "text": "Right into the pack."},
                {"id": "sporeburst_attack_2", "text": "One burst is enough."},
                {"id": "sporeburst_attack_3", "text": "Their line is too tight."},
                {"id": "sporeburst_attack_4", "text": "I can reach them."},
                {"id": "sporeburst_attack_5", "text": "Let the pressure out."},
            ],
            "ready": [
                {"id": "sporeburst_ready_1", "text": "The shell is open."},
                {"id": "sporeburst_ready_2", "text": "Sporeburst ready."},
            ],
        },
    },
    "crownspire": {
        "unit_name": "Crownspire Dreadnought",
        "voice": "en-US-BrianNeural",
        "rate": "-8%",
        "pitch": "-11Hz",
        "lines": {
            "select": [
                {"id": "crownspire_select_1", "text": "Crownspire on station."},
                {"id": "crownspire_select_2", "text": "Lance crew standing by."},
                {"id": "crownspire_select_3", "text": "Command deck is yours."},
                {"id": "crownspire_select_4", "text": "Core pressure steady."},
                {"id": "crownspire_select_5", "text": "The fleet has its crown."},
            ],
            "move": [
                {"id": "crownspire_move_1", "text": "Helm, make the turn."},
                {"id": "crownspire_move_2", "text": "Course plotted."},
                {"id": "crownspire_move_3", "text": "Moving the formation."},
                {"id": "crownspire_move_4", "text": "Steady thrust ahead."},
            ],
            "attack": [
                {"id": "crownspire_attack_1", "text": "Lance crew, open the aperture."},
                {"id": "crownspire_attack_2", "text": "Let the big hull take it."},
                {"id": "crownspire_attack_3", "text": "Bring the main lens to bear."},
                {"id": "crownspire_attack_4", "text": "One beam should settle that."},
                {"id": "crownspire_attack_5", "text": "Their flagship is in our sights."},
            ],
            "ready": [
                {"id": "crownspire_ready_1", "text": "Crownspire has cleared the Waystone."},
                {"id": "crownspire_ready_2", "text": "Capital ship standing by."},
            ],
        },
    },
    "aegis_warden": {
        "unit_name": "Aegis Warden",
        "voice": "en-US-AndrewNeural",
        "rate": "-4%",
        "pitch": "-12Hz",
        "lines": {
            "select": [
                {"id": "aegis_warden_select_1", "text": "An aegis answers."},
                {"id": "aegis_warden_select_2", "text": "Where is the breach?"},
                {"id": "aegis_warden_select_3", "text": "Geometry is our shield."},
                {"id": "aegis_warden_select_4", "text": "Warden attuned."},
                {"id": "aegis_warden_select_5", "text": "I hold the threshold."},
            ],
            "move": [
                {"id": "aegis_warden_move_1", "text": "Mark the line."},
                {"id": "aegis_warden_move_2", "text": "I will take position."},
                {"id": "aegis_warden_move_3", "text": "Keeping the passage clear."},
                {"id": "aegis_warden_move_4", "text": "Through the aperture."},
            ],
            "support": [
                {"id": "aegis_warden_support_1", "text": "Barrier aligned."},
                {"id": "aegis_warden_support_2", "text": "The ground route is sealed."},
                {"id": "aegis_warden_support_3", "text": "Hold behind the field."},
                {"id": "aegis_warden_support_4", "text": "Concord geometry, locked."},
                {"id": "aegis_warden_support_5", "text": "That passage is ours."},
            ],
            "ready": [
                {"id": "aegis_warden_ready_1", "text": "The ward is attuned."},
                {"id": "aegis_warden_ready_2", "text": "Aegis Warden standing by."},
            ],
        },
    },
    "veilseeker": {
        "unit_name": "Veilseeker",
        "voice": "en-US-AndrewNeural",
        "rate": "-5%",
        "pitch": "-4Hz",
        "lines": {
            "select": [
                {"id": "veilseeker_select_1", "text": "Veilseeker standing by."},
                {"id": "veilseeker_select_2", "text": "Watching for distortions."},
                {"id": "veilseeker_select_3", "text": "Lens calibrated."},
                {"id": "veilseeker_select_4", "text": "Show me the blind spot."},
                {"id": "veilseeker_select_5", "text": "The aperture is clear."},
            ],
            "move": [
                {"id": "veilseeker_move_1", "text": "Shifting the sweep."},
                {"id": "veilseeker_move_2", "text": "Taking the next angle."},
                {"id": "veilseeker_move_3", "text": "Moving the lens."},
                {"id": "veilseeker_move_4", "text": "Surveying ahead."},
            ],
            "ready": [
                {"id": "veilseeker_ready_1", "text": "Veilseeker optics online."},
                {"id": "veilseeker_ready_2", "text": "Detection lattice ready."},
            ],
        },
    },
    "brood_keeper": {
        "unit_name": "Brood Keeper",
        "voice": "en-US-GuyNeural",
        "rate": "-9%",
        "pitch": "-22Hz",
        "lines": {
            "select": [
                {"id": "brood_keeper_select_1", "text": "I tend the young."},
                {"id": "brood_keeper_select_2", "text": "The nest stirs."},
                {"id": "brood_keeper_select_3", "text": "Keep close to the brood."},
                {"id": "brood_keeper_select_4", "text": "The eggs are warm."},
                {"id": "brood_keeper_select_5", "text": "I hear every hatchling."},
            ],
            "move": [
                {"id": "brood_keeper_move_1", "text": "I cross the ground."},
                {"id": "brood_keeper_move_2", "text": "Make room for the keeper."},
                {"id": "brood_keeper_move_3", "text": "I leave the clutch in your care."},
                {"id": "brood_keeper_move_4", "text": "I know that scent."},
            ],
            "attack": [
                {"id": "brood_keeper_attack_1", "text": "Away from my brood."},
                {"id": "brood_keeper_attack_2", "text": "Too close to the eggs."},
                {"id": "brood_keeper_attack_3", "text": "The nest has teeth."},
                {"id": "brood_keeper_attack_4", "text": "You woke the little ones."},
                {"id": "brood_keeper_attack_5", "text": "A warning you can taste."},
            ],
            "support": [
                {"id": "brood_keeper_support_1", "text": "A clutch for the nest."},
                {"id": "brood_keeper_support_2", "text": "Make space for the young."},
                {"id": "brood_keeper_support_3", "text": "These eggs need a moment."},
                {"id": "brood_keeper_support_4", "text": "The new clutch is seeded."},
                {"id": "brood_keeper_support_5", "text": "Soon you will hear their feet."},
            ],
            "ready": [
                {"id": "brood_keeper_ready_1", "text": "The keeper has hatched."},
                {"id": "brood_keeper_ready_2", "text": "I will watch the nest."},
            ],
        },
    },
    "farsight_wisp": {
        "unit_name": "Farsight Wisp",
        "voice": "en-US-EmmaNeural",
        "rate": "+6%",
        "pitch": "+8Hz",
        "lines": {
            "select": [
                {"id": "farsight_wisp_select_1", "text": "Farsight Wisp online."},
                {"id": "farsight_wisp_select_2", "text": "Sending back a clear image."},
                {"id": "farsight_wisp_select_3", "text": "I am ready to look ahead."},
                {"id": "farsight_wisp_select_4", "text": "A little light for the road."},
                {"id": "farsight_wisp_select_5", "text": "Where does the mist end?"},
            ],
            "move": [
                {"id": "farsight_wisp_move_1", "text": "Survey course set."},
                {"id": "farsight_wisp_move_2", "text": "Gliding to the marker."},
                {"id": "farsight_wisp_move_3", "text": "Crossing the ridge."},
                {"id": "farsight_wisp_move_4", "text": "I will take a look."},
            ],
            "ready": [
                {"id": "farsight_wisp_ready_1", "text": "Farsight Wisp launched."},
                {"id": "farsight_wisp_ready_2", "text": "Scout link is live."},
            ],
        },
    },
    "lumen_carrier": {
        "unit_name": "Lumen Carrier",
        "voice": "en-US-AvaNeural",
        "rate": "-4%",
        "pitch": "-9Hz",
        "lines": {
            "select": [
                {"id": "lumen_carrier_select_1", "text": "Lumen Carrier, listening."},
                {"id": "lumen_carrier_select_2", "text": "The lattice is standing by."},
                {"id": "lumen_carrier_select_3", "text": "Where shall I anchor?"},
                {"id": "lumen_carrier_select_4", "text": "Core stable. Field on call."},
                {"id": "lumen_carrier_select_5", "text": "I can bridge the dark."},
            ],
            "move": [
                {"id": "lumen_carrier_move_1", "text": "Moving the core."},
                {"id": "lumen_carrier_move_2", "text": "Route set."},
                {"id": "lumen_carrier_move_3", "text": "On my way to the line."},
                {"id": "lumen_carrier_move_4", "text": "Carrying the light forward."},
            ],
            "ready": [
                {"id": "lumen_carrier_ready_1", "text": "Lumen Carrier assembled."},
                {"id": "lumen_carrier_ready_2", "text": "Field core online."},
            ],
        },
    },
    "prospector": {
        "unit_name": "Prospector",
        "voice": "en-US-GuyNeural",
        "rate": "+3%",
        "pitch": "-12Hz",
        "lines": {
            "select": [
                {"id": "prospector_select_1", "text": "Prospector ready."},
                {"id": "prospector_select_2", "text": "Hopper empty."},
                {"id": "prospector_select_3", "text": "Mineral scan online."},
                {"id": "prospector_select_4", "text": "Drill waiting for coordinates."},
                {"id": "prospector_select_5", "text": "Collection rig standing by."},
            ],
            "move": [
                {"id": "prospector_move_1", "text": "Rolling out."},
                {"id": "prospector_move_2", "text": "Deposit marked."},
                {"id": "prospector_move_3", "text": "Route acquired."},
                {"id": "prospector_move_4", "text": "Retracting drill."},
            ],
            "ready": [
                {"id": "prospector_ready_1", "text": "Prospector on the ground."},
                {"id": "prospector_ready_2", "text": "Mining rig deployed."},
            ],
        },
    },
    "triage_specialist": {
        "unit_name": "Triage Specialist",
        "voice": "en-US-AvaNeural",
        "rate": "+4%",
        "pitch": "+0Hz",
        "lines": {
            "select": [
                {"id": "triage_specialist_select_1", "text": "Triage ready."},
                {"id": "triage_specialist_select_2", "text": "Who needs a patch?"},
                {"id": "triage_specialist_select_3", "text": "I've got clean hands and a full kit."},
                {"id": "triage_specialist_select_4", "text": "Keep the wounded close."},
                {"id": "triage_specialist_select_5", "text": "You're on my rounds."},
            ],
            "move": [
                {"id": "triage_specialist_move_1", "text": "On my way."},
                {"id": "triage_specialist_move_2", "text": "Moving the aid kit."},
                {"id": "triage_specialist_move_3", "text": "Keep a lane open."},
                {"id": "triage_specialist_move_4", "text": "I'll take the short route."},
            ],
            "support": [
                {"id": "triage_specialist_support_1", "text": "Hold still. This one's cold."},
                {"id": "triage_specialist_support_2", "text": "Save the war story for later."},
                {"id": "triage_specialist_support_3", "text": "Patch in place. Keep breathing."},
                {"id": "triage_specialist_support_4", "text": "You'll live to file the report."},
                {"id": "triage_specialist_support_5", "text": "Back on your feet, soldier."},
            ],
            "ready": [
                {"id": "triage_specialist_ready_1", "text": "Triage kit stocked."},
                {"id": "triage_specialist_ready_2", "text": "Your field specialist is ready."},
            ],
        },
    },
    "kestrel_interceptor": {
        "unit_name": "Kestrel Interceptor",
        "voice": "en-US-GuyNeural",
        "rate": "+5%",
        "pitch": "-8Hz",
        "lines": {
            "select": [
                {"id": "kestrel_interceptor_select_1", "text": "Kestrel on station."},
                {"id": "kestrel_interceptor_select_2", "text": "Sky looks clear from here."},
                {"id": "kestrel_interceptor_select_3", "text": "Flight lead listening."},
                {"id": "kestrel_interceptor_select_4", "text": "You have my wings."},
                {"id": "kestrel_interceptor_select_5", "text": "Pick a heading."},
            ],
            "move": [
                {"id": "kestrel_interceptor_move_1", "text": "Banking over."},
                {"id": "kestrel_interceptor_move_2", "text": "Vector received."},
                {"id": "kestrel_interceptor_move_3", "text": "Taking the high route."},
                {"id": "kestrel_interceptor_move_4", "text": "Crossing now."},
            ],
            "attack": [
                {"id": "kestrel_interceptor_attack_1", "text": "That bird's coming down."},
                {"id": "kestrel_interceptor_attack_2", "text": "Lock is solid."},
                {"id": "kestrel_interceptor_attack_3", "text": "Keep the sky clean."},
                {"id": "kestrel_interceptor_attack_4", "text": "You've got company up here."},
                {"id": "kestrel_interceptor_attack_5", "text": "Missile away. Mind the debris."},
            ],
            "ready": [
                {"id": "kestrel_interceptor_ready_1", "text": "Kestrel airborne."},
                {"id": "kestrel_interceptor_ready_2", "text": "Engines green. Ready to intercept."},
            ],
        },
    },
    "rampart_transport": {
        "unit_name": "Rampart Transport",
        "voice": "en-US-AriaNeural",
        "rate": "+1%",
        "pitch": "-10Hz",
        "lines": {
            "select": [
                {"id": "rampart_transport_select_1", "text": "Rampart on station."},
                {"id": "rampart_transport_select_2", "text": "Doors locked. I'm listening."},
                {"id": "rampart_transport_select_3", "text": "Six seats and a smooth flight."},
                {"id": "rampart_transport_select_4", "text": "Troop lift standing by."},
                {"id": "rampart_transport_select_5", "text": "Where are we dropping them?"},
            ],
            "move": [
                {"id": "rampart_transport_move_1", "text": "On that vector."},
                {"id": "rampart_transport_move_2", "text": "Taking the high route."},
                {"id": "rampart_transport_move_3", "text": "Banking to the drop zone."},
                {"id": "rampart_transport_move_4", "text": "Keep your straps tight."},
            ],
            "ready": [
                {"id": "rampart_transport_ready_1", "text": "Rampart cleared for lift."},
                {"id": "rampart_transport_ready_2", "text": "Cargo deck ready."},
            ],
        },
    },
    "drift_sac": {
        "unit_name": "Drift Sac",
        "voice": "en-US-ChristopherNeural",
        "rate": "-12%",
        "pitch": "-22Hz",
        "lines": {
            "select": [
                {"id": "drift_sac_select_1", "text": "I carry the brood."},
                {"id": "drift_sac_select_2", "text": "This one's drifting."},
                {"id": "drift_sac_select_3", "text": "The air feeds me."},
                {"id": "drift_sac_select_4", "text": "Keep the sharp ones away."},
                {"id": "drift_sac_select_5", "text": "The nest can grow."},
            ],
            "move": [
                {"id": "drift_sac_move_1", "text": "Following the warm air."},
                {"id": "drift_sac_move_2", "text": "Drifting over."},
                {"id": "drift_sac_move_3", "text": "I feel the current."},
                {"id": "drift_sac_move_4", "text": "The brood will see."},
            ],
            "ready": [
                {"id": "drift_sac_ready_1", "text": "The brood has room to grow."},
                {"id": "drift_sac_ready_2", "text": "Drift Sac rising."},
            ],
        },
    },
    "needlewing": {
        "unit_name": "Needlewing",
        "voice": "en-US-ChristopherNeural",
        "rate": "+12%",
        "pitch": "-3Hz",
        "lines": {
            "select": [
                {"id": "needlewing_select_1", "text": "Needlewing listens."},
                {"id": "needlewing_select_2", "text": "My wings itch."},
                {"id": "needlewing_select_3", "text": "Where do we sting?"},
                {"id": "needlewing_select_4", "text": "I smell bare skin."},
                {"id": "needlewing_select_5", "text": "The brood calls."},
            ],
            "move": [
                {"id": "needlewing_move_1", "text": "Gliding low."},
                {"id": "needlewing_move_2", "text": "Across the ridge."},
                {"id": "needlewing_move_3", "text": "The wind is mine."},
                {"id": "needlewing_move_4", "text": "Diving in."},
            ],
            "attack": [
                {"id": "needlewing_attack_1", "text": "The groundlings never look up."},
                {"id": "needlewing_attack_2", "text": "Sting and scatter."},
                {"id": "needlewing_attack_3", "text": "Give the dirt a little venom."},
                {"id": "needlewing_attack_4", "text": "Run. It makes this fun."},
                {"id": "needlewing_attack_5", "text": "I'll leave a mark."},
            ],
            "ready": [
                {"id": "needlewing_ready_1", "text": "Needles sharp."},
                {"id": "needlewing_ready_2", "text": "Needlewing in the air."},
            ],
        },
    },
    "carapace_bulwark": {
        "unit_name": "Carapace Bulwark",
        "voice": "en-US-GuyNeural",
        "rate": "-7%",
        "pitch": "-27Hz",
        "lines": {
            "select": [
                {"id": "carapace_bulwark_select_1", "text": "Carapace set."},
                {"id": "carapace_bulwark_select_2", "text": "Stand behind me."},
                {"id": "carapace_bulwark_select_3", "text": "The shell will hold."},
                {"id": "carapace_bulwark_select_4", "text": "Where is the breach?"},
                {"id": "carapace_bulwark_select_5", "text": "I have room for scars."},
            ],
            "move": [
                {"id": "carapace_bulwark_move_1", "text": "My weight is moving."},
                {"id": "carapace_bulwark_move_2", "text": "I will make a path."},
                {"id": "carapace_bulwark_move_3", "text": "Closing the gap."},
                {"id": "carapace_bulwark_move_4", "text": "Shell forward."},
            ],
            "attack": [
                {"id": "carapace_bulwark_attack_1", "text": "Your armor is thinner."},
                {"id": "carapace_bulwark_attack_2", "text": "Let me crack that open."},
                {"id": "carapace_bulwark_attack_3", "text": "That plate sounds hollow."},
                {"id": "carapace_bulwark_attack_4", "text": "Come closer. I can reach."},
                {"id": "carapace_bulwark_attack_5", "text": "One shell breaks today."},
            ],
            "ready": [
                {"id": "carapace_bulwark_ready_1", "text": "The shell has hardened."},
                {"id": "carapace_bulwark_ready_2", "text": "Bulwark standing."},
            ],
        },
    },
    "forager": {
        "unit_name": "Forager",
        "voice": "en-US-ChristopherNeural",
        "rate": "+6%",
        "pitch": "-18Hz",
        "lines": {
            "select": [
                {"id": "forager_select_1", "text": "The brood hears."},
                {"id": "forager_select_2", "text": "Claws at your service."},
                {"id": "forager_select_3", "text": "What shall grow here?"},
                {"id": "forager_select_4", "text": "Point me to the vein."},
                {"id": "forager_select_5", "text": "Always hungry. Always working."},
            ],
            "move": [
                {"id": "forager_move_1", "text": "Scuttling there."},
                {"id": "forager_move_2", "text": "I smell a seam."},
                {"id": "forager_move_3", "text": "Claws in motion."},
                {"id": "forager_move_4", "text": "The tunnels call."},
            ],
            "attack": [
                {"id": "forager_attack_1", "text": "I bite harder than I look."},
                {"id": "forager_attack_2", "text": "A brief interruption for lunch."},
                {"id": "forager_attack_3", "text": "Those teeth are not for show."},
                {"id": "forager_attack_4", "text": "Try chewing back."},
                {"id": "forager_attack_5", "text": "I'll take a small sample."},
            ],
            "job_done": [
                {"id": "forager_job_done_1", "text": "The brood has taken root."},
                {"id": "forager_job_done_2", "text": "Our new growth is ready."},
                {"id": "forager_job_done_3", "text": "The shell has hardened."},
                {"id": "forager_job_done_4", "text": "A new pulse in the colony."},
                {"id": "forager_job_done_5", "text": "One more place to call ours."},
            ],
            "ready": [
                {"id": "forager_ready_1", "text": "Fresh claws for the brood."},
                {"id": "forager_ready_2", "text": "Hatched and hungry."},
            ],
        },
    },
    "mote": {
        "unit_name": "Mote",
        "voice": "en-GB-SoniaNeural",
        "rate": "+4%",
        "pitch": "+12Hz",
        "lines": {
            "select": [
                {"id": "mote_select_1", "text": "Signal received."},
                {"id": "mote_select_2", "text": "Mote ready to align."},
                {"id": "mote_select_3", "text": "Awaiting coordinates."},
                {"id": "mote_select_4", "text": "All harmonics stable."},
                {"id": "mote_select_5", "text": "The Concord is listening."},
            ],
            "move": [
                {"id": "mote_move_1", "text": "Drifting into position."},
                {"id": "mote_move_2", "text": "Following the signal."},
                {"id": "mote_move_3", "text": "Course adjusted."},
                {"id": "mote_move_4", "text": "On the next harmonic."},
            ],
            "attack": [
                {"id": "mote_attack_1", "text": "I am rated for light demolition."},
                {"id": "mote_attack_2", "text": "Consider this a small correction."},
                {"id": "mote_attack_3", "text": "Your warranty has expired."},
                {"id": "mote_attack_4", "text": "Applying a pointed disagreement."},
                {"id": "mote_attack_5", "text": "An unexpected use of my toolkit."},
            ],
            "job_done": [
                {"id": "mote_job_done_1", "text": "The structure is aligned."},
                {"id": "mote_job_done_2", "text": "Summoning complete."},
                {"id": "mote_job_done_3", "text": "The pattern has stabilized."},
                {"id": "mote_job_done_4", "text": "The lattice is ready."},
                {"id": "mote_job_done_5", "text": "The Concord's reach extends."},
            ],
            "ready": [
                {"id": "mote_ready_1", "text": "Mote signal online."},
                {"id": "mote_ready_2", "text": "I have joined the lattice."},
            ],
        },
    },
    "pioneer": {
        "unit_name": "Pioneer",
        "voice": "en-US-BrianMultilingualNeural",
        "rate": "+8%",
        "pitch": "-3Hz",
        "comm_filter": True,
        "lines": {
            "select": [
                {"id": "pioneer_select_1", "text": "What's up, Commander?"},
                {"id": "pioneer_select_2", "text": "Talk to me, boss. Welding rig's hot."},
                {"id": "pioneer_select_3", "text": "Pioneer here. Whatcha need built?"},
                {"id": "pioneer_select_4", "text": "Yeah? Clock's ticking, point me at a job."},
                {"id": "pioneer_select_5", "text": "Arc torch is charged and ready. What's the plan?"},
                {"id": "pioneer_select_6", "text": "Need something bolted together, or taken apart?"},
            ],
            "move": [
                {"id": "pioneer_move_1", "text": "On my way."},
                {"id": "pioneer_move_2", "text": "You got it, chief."},
                {"id": "pioneer_move_3", "text": "Hauling gear over there now."},
                {"id": "pioneer_move_4", "text": "Copy that, rolling out."},
                {"id": "pioneer_move_5", "text": "Heading to the site."},
            ],
            "job_done": [
                {"id": "pioneer_job_done_1", "text": "Job's done! Not a bad weld if I say so myself."},
                {"id": "pioneer_job_done_2", "text": "All finished up, boss. What's next?"},
                {"id": "pioneer_job_done_3", "text": "Structure's online and solid as bedrock."},
                {"id": "pioneer_job_done_4", "text": "Construction complete. That'll hold through an orbital drop."},
                {"id": "pioneer_job_done_5", "text": "Another masterpiece off the checklist."},
                {"id": "pioneer_job_done_6", "text": "Wrapped it up! Ready for the next blueprint."},
            ],
            "attack": [
                {"id": "pioneer_attack_1", "text": "Guess this arc welder does overtime on hostiles!"},
                {"id": "pioneer_attack_2", "text": "Hold still, I'm gonna spot-weld your armor shut!"},
                {"id": "pioneer_attack_3", "text": "Nobody messes with the union! Eat plasma sparks!"},
                {"id": "pioneer_attack_4", "text": "This wasn't in my job description, but here we go!"},
                {"id": "pioneer_attack_5", "text": "Consider this an unscheduled demolition!"},
            ],
        },
    },
    "rifleman": {
        "unit_name": "Rifleman",
        "voice": "en-US-AndrewMultilingualNeural",
        "rate": "+10%",
        "pitch": "-2Hz",
        "comm_filter": True,
        "lines": {
            "select": [
                {"id": "rifleman_select_1", "text": "Rifle squad standing by. Where's the trouble?"},
                {"id": "rifleman_select_2", "text": "Magazines full, safeties off. Give the word."},
                {"id": "rifleman_select_3", "text": "Meridian Guard reporting. What's up, Commander?"},
                {"id": "rifleman_select_4", "text": "Eyes sharp, rifle ready."},
                {"id": "rifleman_select_5", "text": "Just point us toward the target."},
            ],
            "move": [
                {"id": "rifleman_move_1", "text": "Moving up, double time!"},
                {"id": "rifleman_move_2", "text": "Advancing to position."},
                {"id": "rifleman_move_3", "text": "Boots on the move, copy that."},
                {"id": "rifleman_move_4", "text": "Pushing forward!"},
                {"id": "rifleman_move_5", "text": "Solid copy, relocating now."},
            ],
            "attack": [
                {"id": "rifleman_attack_1", "text": "Say hello to three-round burst diplomacy!"},
                {"id": "rifleman_attack_2", "text": "Free lead delivery, no signature required!"},
                {"id": "rifleman_attack_3", "text": "Keep your heads down, or don't, makes my job easier!"},
                {"id": "rifleman_attack_4", "text": "Target locked! Let's ventilate 'em!"},
                {"id": "rifleman_attack_5", "text": "Hope they brought an umbrella for this hailstorm!"},
            ],
            "ready": [
                {"id": "rifleman_ready_1", "text": "Rifleman locked and loaded!"},
                {"id": "rifleman_ready_2", "text": "Fresh boots on the ground, Commander."},
            ],
        },
    },
    "breacher": {
        "unit_name": "Breacher",
        "voice": "en-US-ChristopherNeural",
        "rate": "+5%",
        "pitch": "-8Hz",
        "comm_filter": True,
        "lines": {
            "select": [
                {"id": "breacher_select_1", "text": "Breacher suit online. Point me at a wall, or a face."},
                {"id": "breacher_select_2", "text": "Heavy armor here. What needs smashing?"},
                {"id": "breacher_select_3", "text": "Concussion shells primed. What's the call?"},
                {"id": "breacher_select_4", "text": "You rang, Commander? Ready to crack some shells."},
                {"id": "breacher_select_5", "text": "Standing by with the big boomers."},
            ],
            "move": [
                {"id": "breacher_move_1", "text": "Heavy boots rolling out."},
                {"id": "breacher_move_2", "text": "Stomping over there now."},
                {"id": "breacher_move_3", "text": "Clear the lane, Breacher moving!"},
                {"id": "breacher_move_4", "text": "Copy that, advancing."},
            ],
            "attack": [
                {"id": "breacher_attack_1", "text": "Knock knock! I brought my own door!"},
                {"id": "breacher_attack_2", "text": "Let's slow their roll, permanently!"},
                {"id": "breacher_attack_3", "text": "Catch this concussion charge, ugly!"},
                {"id": "breacher_attack_4", "text": "Armor plating? Cute. Watch this!"},
                {"id": "breacher_attack_5", "text": "Time for a little high-velocity attitude adjustment!"},
            ],
            "ready": [
                {"id": "breacher_ready_1", "text": "Breacher suited up and ready to wreck!"},
                {"id": "breacher_ready_2", "text": "Heavy shock trooper reporting for duty."},
            ],
        },
    },
    "howitzer": {
        "unit_name": "Howitzer",
        "voice": "en-US-EmmaMultilingualNeural",
        "rate": "+8%",
        "pitch": "-2Hz",
        "comm_filter": True,
        "lines": {
            "select": [
                {"id": "howitzer_select_1", "text": "Artillery crew online. Give us coordinates."},
                {"id": "howitzer_select_2", "text": "Howitzer standing by. Want it loud or extra loud?"},
                {"id": "howitzer_select_3", "text": "Ballistics computer ready. What's on the menu?"},
                {"id": "howitzer_select_4", "text": "One-fifty-five millimeter problem solver at your service."},
                {"id": "howitzer_select_5", "text": "Reading you five-by-five, Commander."},
            ],
            "move": [
                {"id": "howitzer_move_1", "text": "Rolling the big gun into position."},
                {"id": "howitzer_move_2", "text": "Relocating artillery."},
                {"id": "howitzer_move_3", "text": "Adjusting firing vector."},
                {"id": "howitzer_move_4", "text": "On the move, Commander."},
            ],
            "attack": [
                {"id": "howitzer_attack_1", "text": "Sending very warm regards from thirty meters away!"},
                {"id": "howitzer_attack_2", "text": "Forecast for their grid square: one hundred percent shrapnel!"},
                {"id": "howitzer_attack_3", "text": "Special delivery! Catch it with your teeth!"},
                {"id": "howitzer_attack_4", "text": "Deleting that coordinate in three, two, one!"},
                {"id": "howitzer_attack_5", "text": "Nothing personal, just high-explosive physics!"},
            ],
            "ready": [
                {"id": "howitzer_ready_1", "text": "Howitzer crew rolled out and ready for fire missions!"},
                {"id": "howitzer_ready_2", "text": "Siege artillery online, Commander."},
            ],
        },
    },
}


def _one_pole_lp(samples: list[float], cutoff_hz: float) -> list[float]:
    rc = 1.0 / (2.0 * math.pi * max(20.0, cutoff_hz))
    dt = 1.0 / SAMPLE_RATE
    alpha = dt / (rc + dt)
    out = [0.0] * len(samples)
    y = 0.0
    for i, x in enumerate(samples):
        y = y + alpha * (x - y)
        out[i] = y
    return out


def _one_pole_hp(samples: list[float], cutoff_hz: float) -> list[float]:
    lp = _one_pole_lp(samples, cutoff_hz)
    return [x - l for x, l in zip(samples, lp)]


def _apply_tactical_comm_processing(raw_wav_path: Path, out_wav_path: Path, seed: int) -> None:
    """
    Reads a 16-bit 22050 Hz mono WAV file, trims leading/trailing silence,
    applies a subtle tactical helmet radio presence boost + soft limiter and
    tiny comm-squelch click at start/end, and writes a clean RIFF WAVE PCM file.
    """
    with wave.open(str(raw_wav_path), "rb") as wf:
        raw_bytes = wf.readframes(wf.getnframes())
    count = len(raw_bytes) // 2
    samples = [s / 32768.0 for (s,) in struct.iter_unpack("<h", raw_bytes[: count * 2])]

    # Trim leading and trailing near-silence
    threshold = 0.008
    start_idx = 0
    for i, s in enumerate(samples):
        if abs(s) > threshold:
            start_idx = max(0, i - int(0.015 * SAMPLE_RATE))
            break
    end_idx = len(samples)
    for i in range(len(samples) - 1, -1, -1):
        if abs(samples[i]) > threshold:
            end_idx = min(len(samples), i + int(0.025 * SAMPLE_RATE))
            break
    if end_idx > start_idx + 200:
        samples = samples[start_idx:end_idx]

    # Blend 72% full-spectrum natural voice + 28% band-passed comm presence (260Hz - 4200Hz)
    band = _one_pole_hp(_one_pole_lp(samples, 4200.0), 260.0)
    processed = [math.tanh((0.72 * s + 0.38 * b) * 1.25) for s, b in zip(samples, band)]

    # Subtle 12ms comm squelch tail click at end
    rng = random.Random(seed)
    tail_n = int(0.014 * SAMPLE_RATE)
    tail = []
    for i in range(tail_n):
        t = i / SAMPLE_RATE
        env = math.exp(-t * 220.0)
        click = (math.sin(2.0 * math.pi * 1650.0 * t) * 0.4 + rng.uniform(-1.0, 1.0) * 0.6) * env * 0.08
        tail.append(click)

    full = processed + tail
    peak = max((abs(x) for x in full), default=1.0)
    scale = (0.88 / peak) if peak > 1e-5 else 1.0

    pcm = bytearray()
    for x in full:
        v = max(-1.0, min(1.0, x * scale))
        pcm.extend(struct.pack("<h", int(v * 32767.0)))

    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav_path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(bytes(pcm))


async def _synthesize_one(
    sem: asyncio.Semaphore,
    ffmpeg_exe: str,
    line_id: str,
    text: str,
    voice: str,
    rate: str,
    pitch: str,
    force: bool = False,
) -> Path:
    out_wav = VOICE_DIR / f"{line_id}.wav"
    if out_wav.exists() and not force and out_wav.stat().st_size > 2000:
        return out_wav

    async with sem:
        import edge_tts

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
            tmp_mp3 = Path(tf.name)
        tmp_wav = tmp_mp3.with_suffix(".raw.wav")
        try:
            synthesized = False
            for attempt in range(4):
                try:
                    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                    await comm.save(str(tmp_mp3))
                    if tmp_mp3.exists() and tmp_mp3.stat().st_size > 200:
                        synthesized = True
                        break
                except Exception:
                    await asyncio.sleep(0.6 * (attempt + 1))

            if synthesized:
                subprocess.run(
                    [
                        ffmpeg_exe,
                        "-y",
                        "-i",
                        str(tmp_mp3),
                        "-ac",
                        "1",
                        "-ar",
                        str(SAMPLE_RATE),
                        "-sample_fmt",
                        "s16",
                        str(tmp_wav),
                    ],
                    check=True,
                    capture_output=True,
                )
            else:
                # Offline Windows SAPI fallback
                sapi_voice = "Microsoft Zira Desktop" if "Emma" in voice or "Ava" in voice else "Microsoft David Desktop"
                ps_cmd = (
                    "Add-Type -AssemblyName System.Speech; "
                    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
                    f"$s.SelectVoice('{sapi_voice}'); "
                    "$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, "
                    "[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, "
                    "[System.Speech.AudioFormat.AudioChannel]::Mono); "
                    f"$s.SetOutputToWaveFile('{str(tmp_wav)}', $fmt); "
                    f"$s.Speak({json.dumps(text)}); "
                    "$s.SetOutputToNull(); $s.Dispose()"
                )
                subprocess.run(["powershell", "-NoProfile", "-Command", ps_cmd], check=True, capture_output=True)

            _apply_tactical_comm_processing(tmp_wav, out_wav, abs(hash(line_id)) % 100000)
        finally:
            if tmp_mp3.exists():
                tmp_mp3.unlink()
            if tmp_wav.exists():
                tmp_wav.unlink()
    return out_wav


async def generate_all_voices(unit_filter: str | None = None, force: bool = False) -> dict:
    import imageio_ffmpeg

    add_airframe_voices()
    add_campaign_voices()
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    VOICE_DIR.mkdir(parents=True, exist_ok=True)
    sem = asyncio.Semaphore(2)
    tasks = []
    manifest_path = VOICE_DIR / "manifest.json"
    manifest: dict[str, dict] = (
        json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    )

    for unit_id, profile in UNIT_VOICE_PROFILES.items():
        if unit_filter and unit_id != unit_filter:
            continue
        if not force and manifest.get(unit_id, {}).get("voice") == "Qwen3-TTS VoiceDesign":
            continue
        manifest[unit_id] = {
            "unit_name": profile["unit_name"],
            "voice": profile["voice"],
            "categories": {},
        }
        for category, items in profile["lines"].items():
            manifest[unit_id]["categories"][category] = []
            for item in items:
                line_id = item["id"]
                text = item["text"]
                manifest[unit_id]["categories"][category].append(
                    {
                        "id": line_id,
                        "text": text,
                        "path": f"res://assets/audio/voice/{line_id}.wav",
                    }
                )
                tasks.append(
                    _synthesize_one(
                        sem,
                        ffmpeg_exe,
                        line_id,
                        text,
                        profile["voice"],
                        profile["rate"],
                        profile["pitch"],
                        force=force,
                    )
                )

    paths = await asyncio.gather(*tasks)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Synthesized {len(paths)} unit voice dialogue WAV files in {VOICE_DIR}")
    return manifest


def add_airframe_voices() -> None:
    aircraft = {
        "night_harrier": ("Night Harrier", "en-US-AvaNeural", "-3%", "-2Hz", {
            "select": ["Harrier on station.", "Pick a route below the radar."],
            "move": ["Keeping low.", "Swinging around the flank."],
            "attack": ["Both racks away.", "Clearing the ground below."],
            "ready": ["Harrier fueled and armed.", "Rocket racks checked."],
        }),
        "sky_sentry": ("Sky Sentry", "en-US-EricNeural", "-6%", "-4Hz", {
            "select": ["Sky Sentry overhead.", "I can cover that approach."],
            "move": ["Changing altitude.", "Shifting the patrol."],
            "attack": ["Tracking both contacts.", "Clear the marked ground."],
            "ready": ["Sky Sentry ready for patrol.", "Ventral cannon checked."],
        }),
        "watchkeeper": ("Watchkeeper", "en-US-EmmaNeural", "-4%", "+0Hz", {
            "select": ["Watchkeeper reading clear.", "What should I watch?"],
            "move": ["Moving the sensor sweep.", "Repositioning for a better return."],
            "attack": ["Tracking the signal.", "I'll shut down their weapons."],
            "ready": ["Watchkeeper's sensors are live.", "Telemetry is coming through."],
        }),
        "dreadnought": ("Dreadnought", "en-US-DavisNeural", "-13%", "-11Hz", {
            "select": ["Dreadnought bridge here.", "Bridge standing by."],
            "move": ["Bring us onto that heading.", "Helm, make way."],
            "attack": ["Fire the forward batteries.", "Charge the siege emitter."],
            "ready": ["Dreadnought cleared for departure.", "All batteries report ready."],
        }),
    }
    for unit_id, (name, voice, rate, pitch, categories) in aircraft.items():
        UNIT_VOICE_PROFILES[unit_id] = {
            "unit_name": name,
            "voice": voice,
            "rate": rate,
            "pitch": pitch,
            "comm_filter": True,
            "lines": {
                category: [
                    {"id": f"{unit_id}_{category}_{index}", "text": line}
                    for index, line in enumerate(lines, start=1)
                ]
                for category, lines in categories.items()
            },
        }

def add_campaign_voices() -> None:
    unit_id = "torchguard"
    categories = {
        "select": ["Torchguard standing by.", "Fuel pressure is good.", "Point me at the swarm.",
                   "I can clear that road.", "Both burners are ready."],
        "move": ["Moving up.", "Keeping the burners low.", "I'll take point.", "On that road."],
        "attack": ["Clear behind me.", "Burners on.", "I've got the close ones.", "Light them up.",
                   "Sweeping the lane."],
        "ready": ["Torchguard ready to deploy.", "Fuel topped off. Where's the convoy?"],
    }
    UNIT_VOICE_PROFILES[unit_id] = {
        "unit_name": "Torchguard",
        "voice": "en-US-DavisNeural",
        "rate": "-6%",
        "pitch": "-8Hz",
        "lines": {
            category: [{"id": f"{unit_id}_{category}_{index}", "text": line}
                       for index, line in enumerate(lines, start=1)]
            for category, lines in categories.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Synthesize RTS unit dialogue voice lines.")
    parser.add_argument("--unit", type=str, default=None, help="Optional single unit ID to generate")
    parser.add_argument("--force", action="store_true", help="Force re-synthesis of existing WAVs")
    args = parser.parse_args()
    asyncio.run(generate_all_voices(unit_filter=args.unit, force=args.force))


if __name__ == "__main__":
    main()
