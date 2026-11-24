#!/usr/bin/env python3
"""
generate_campaign_voices.py — Pre-generates all Flagship Hub, Console, Cutscene,
and Pre-Mission Movie character voice audio for RobOS RTS: Starfall Command.

Voice Profiles (matching shipped Starfall Command campaign recordings):
  - vale  (Captain Vale)       : Cloned from assets/audio/campaign/arrival.wav
  - sable (Pilot Sable)        : Cloned from assets/audio/campaign/siege.wav
  - aster (Dr. Aster)          : Cloned from assets/audio/campaign/evac_settlement.wav
  - rook  (Corporal Rook)      : Cloned from assets/audio/campaign/camp_siege.wav
  - vane  (Quartermaster Vane) : Qwen3-TTS VoiceDesign reference -> 0.6B-Base clone
  - vance (Anchor Kade Vance)  : Qwen3-TTS VoiceDesign reference -> 0.6B-Base clone
  - helm  (Starfall Helm)      : Qwen3-TTS VoiceDesign reference -> 0.6B-Base clone

Outputs 16-bit 22050 Hz mono PCM RIFF WAVE files in assets/audio/campaign/hub/
plus assets/audio/campaign/hub/manifest.json.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import wave
from pathlib import Path

import numpy as np
import scipy.signal
import torch
from qwen_tts import Qwen3TTSModel

SAMPLE_RATE = 22050
TARGET_RMS = 0.078
ROOT_DIR = Path(__file__).resolve().parent
CAMPAIGN_AUDIO_DIR = ROOT_DIR / "assets" / "audio" / "campaign"
HUB_AUDIO_DIR = CAMPAIGN_AUDIO_DIR / "hub"
HUB_DATA_GD = ROOT_DIR / "scripts" / "engine" / "RTSCampaignHubData.gd"

SECTORS = [
    ("01", "Vesper Gate Colony", "vale", "Lead Vale's squad through Vesper Gate and bring that Directorate relay down."),
    ("02", "White Ridge Excavation", "vale", "Build up our base, hold off the Directorate raids, and seize the artifact at White Ridge."),
    ("03", "Twilight Crossing", "sable", "Defend the bridges and keep the Colony Hub standing until my rescue ship arrives."),
    ("04", "Bracken Evacuation Corridor", "aster", "Escort Bracken's colonist trucks up the northern road to the evacuation ships."),
    ("05", "Ashfall Settlement", "vale", "Clear the infected settlement while we have daylight, and defend the barricades after dark."),
    ("06", "Redstone Tectonic Basin", "sable", "Stockpile crystal between lava surges, pull crews to high ground on my mark, and find the missing miners."),
    ("07", "Talion Sunken Temple", "vale", "Push to the sunken shrine ahead of the Brood and break the relic's Concord guardians."),
    ("08", "Sanctuary Orbital Ring", "aster", "Shatter all three orbital shield links so our interceptors can bring down the Purifier warship."),
    ("09", "Tarsus Freight Line", "rook", "Recover those abandoned Rail Skimmers and stop eight Directorate freight trains across the depot lines."),
    ("10", "Verdant Canopy", "aster", "Escort Pioneers to the jungle vents and bring seven Aether canisters safely back to the Hub."),
    ("11", "Aurelia Sealed Vault", "vale", "Reclaim the Helix laser drill and hold every approach while it cuts open the Concord vault."),
]

FRN_NEWS_REPORTS = [
    ("00", "Directorate forces have imposed a total communications blackout over Vesper Gate, as Captain Vale's renegade flotilla drops out of warp in high orbit."),
    ("01", "Breaking news from Vesper Gate: the central Directorate relay tower has fallen, and colonial resistance fighters are rallying to the Meridian Guard banner."),
    ("02", "Sources confirm a Directorate excavation at White Ridge has been overrun following a fierce raid, with an ancient Aurelian Concord relic reported missing."),
    ("03", "Pilot Sable has executed a daring twilight extraction at Dawn Reach, pulling the Meridian garrison out moments before Gnarl Brood swarms overran the outer bridges."),
    ("04", "Over fifty colonist transports have safely cleared the Bracken corridor tonight, escaping off-world despite relentless Gnarl Brood ambushes along the northern highway."),
    ("05", "Quarantine protocols have been lifted over Ashfall Haven after Meridian Guard containment teams completed a multi-day purge of the blighted districts."),
    ("06", "Tectonic instability has peaked across Redstone Basin, yet Meridian prospectors managed to haul out a record crystal stockpile between lethal magma surges."),
    ("07", "A Meridian strike team has recovered a second sunken relic on Talion, defeating ancient Concord war-constructs just ahead of advancing Brood packs."),
    ("08", "Celebrations are erupting across Sanctuary tonight after Kestrel squadrons shattered a Concord Purifier's shield links and brought the warship down in flames."),
    ("09", "Directorate supply lines on Tarsus are in ruins after Rail Skimmer outriders intercepted and destroyed eight armored freight trains across three depot tracks."),
    ("10", "Doctor Aster's science teams on Bel'Verdant have secured seven high-purity Aether canisters from the jungle vents despite heavy Aurelian air patrols."),
    ("11", "Historic bulletin from Aurelia Prime: the Helix laser drill has breached the sealed vault, breaking the Directorate's grip and uniting the free frontier."),
]

DESIGNED_SPEAKERS = {
    "vane": {
        "speaker_name": "Quartermaster Vane",
        "ref_text": "Welcome to Bay Seven, Commander. Every credit you pull off Directorate contracts goes straight into heavier steel and hotter barrels.",
        "instruct": (
            "Older burly chief ordnance engineer in his fifties with a gruff working-class rust-belt accent, "
            "deep gravelly baritone, warm smoky workshop rasp, grounded and proud when speaking about heavy armor and weapons."
        ),
    },
    "vance": {
        "speaker_name": "Anchor Kade Vance",
        "ref_text": "Breaking news from the Vesper sector tonight, as colonial resistance forces rally across the outer frontier.",
        "instruct": (
            "Polished male interstellar television news anchor in his forties, crisp authoritative broadcast baritone, "
            "clear neutral American network news delivery with steady dramatic urgency."
        ),
    },
    "helm": {
        "speaker_name": "Starfall Helm",
        "ref_text": "Entering Vesper Gate high orbit. Strike group cleared for atmospheric descent, all launch bays green.",
        "instruct": (
            "Calm composed female starship bridge navigation officer in her thirties, crisp clear mid-alto voice, "
            "steady military helm telemetry cadence."
        ),
    },
}

CLONED_EXISTING_SPEAKERS = {
    "vale": {
        "speaker_name": "Captain Vale",
        "ref_wav": CAMPAIGN_AUDIO_DIR / "arrival.wav",
        "ref_text": "Vesper Gate, this is Vale. We're taking the relay. Follow the road and clear the Directorate checkpoints.",
    },
    "sable": {
        "speaker_name": "Pilot Sable",
        "ref_wav": CAMPAIGN_AUDIO_DIR / "siege.wav",
        "ref_text": "I'm coming for you, but I need time to reach the outpost. Keep that Colony Hub standing and hold the line.",
    },
    "aster": {
        "speaker_name": "Dr. Aster",
        "ref_wav": CAMPAIGN_AUDIO_DIR / "evac_settlement.wav",
        "ref_text": "You made it. The trucks will head north as soon as we're loaded. Keep the road open.",
    },
    "rook": {
        "speaker_name": "Corporal Rook",
        "ref_wav": CAMPAIGN_AUDIO_DIR / "camp_siege.wav",
        "ref_text": "White Ridge militia calling. Directorate infantry are closing on our outpost. Anyone on this channel, we could use a hand.",
    },
}


def _clean_spoken_summary(text: str) -> str:
    s = text.strip()
    s = re.sub(r"\+(\d+)%", r"plus \1 percent", s)
    s = re.sub(r"(\d+)%", r"\1 percent", s)
    s = re.sub(r"\+(\d+(?:\.\d+)?)", r"plus \1", s)
    s = re.sub(r"\bHP\b", "hit points", s)
    s = re.sub(r"\bIFF\b", "I F F", s)
    s = re.sub(r"\bvs\b\.?", "versus", s)
    s = re.sub(r"\b330mm\b", "three thirty millimeter", s)
    return s


def _extract_hub_catalog_items() -> tuple[list[tuple[str, str, str]], list[tuple[str, str]], list[tuple[str, str]]]:
    src = HUB_DATA_GD.read_text(encoding="utf-8")

    # 1. Armory upgrades
    upg_pattern = re.compile(
        r'"id":\s*"([^"]+)",\s*"name":\s*"([^"]+)",\s*"cost":\s*\d+,\s*"glyph":\s*"[^"]+",\s*\n\s*"summary":\s*"([^"]+)"'
    )
    upgrades = upg_pattern.findall(src)

    # 2. Mercenaries
    merc_pattern = re.compile(r'"id":\s*"(merc_[^"]+)",\s*"name":\s*"([^"]+)"')
    mercs = merc_pattern.findall(src)

    # 3. Lab perks
    lab_pattern = re.compile(r'"id":\s*"((?:brood|concord)_t\d_[^"]+)",\s*"name":\s*"([^"]+)"')
    perks = lab_pattern.findall(src)

    return upgrades, mercs, perks


def build_voice_lines() -> list[dict]:
    upgrades, mercs, perks = _extract_hub_catalog_items()
    lines: list[dict] = []

    def add(cue_id: str, speaker: str, text: str) -> None:
        lines.append({"id": cue_id, "speaker": speaker, "text": text})

    # A. 11 Pre-Mission Movies (Orbit + Surface/Contact)
    for num, sector, contact_speaker, surface_line in SECTORS:
        add(f"intro_m{num}_orbit", "helm", f"Entering {sector} high orbit. Strike group cleared for atmospheric descent.")
        add(f"intro_m{num}_surface", contact_speaker, surface_line)

    # B. Cohesive 5-Shot 3D Opening Cinematic ("Cut the Signal: Vesper Gate") + Early Vesper Flyovers & Room Intros
    add("intro_open_1", "vance", "Frontier News Special Report: Directorate garrisons have locked down the Vesper Gate subspace relay. Martial curfew is now total, and all off-world distress calls have been silenced.")
    add("intro_open_2", "rook", "Don't buy the broadcast, Vale. They cut that relay so Vesper Gate can't call for help while Directorate convoys haul our people away.")
    add("intro_open_3", "vane", "Mark Four combat suit pressurized. Neosteel chestplate locked and sealed. Rifles are loaded and hot, suit's all yours, Captain.")
    add("intro_open_4", "vale", "Seal the visor. Six rifles, one drop. We smash their roadblock, free the convoy, and tear that Directorate relay to the ground. On the Rampart, move!")
    add("intro_open_5", "sable", "Touching down on the Vesper Gate highway! Directorate roadblock dead ahead, ramp is green, Captain, go, go, go!")

    add("cantina_early_1", "rook", "Welcome to the Vesper safehouse, Commander. Check the Job Board or hit Deploy whenever you're ready to roll out.")
    add("intro_vesper_01", "sable", "Skimming low under Directorate radar. Vesper Gate outskirts right ahead, prepare for combat drop.")
    add("intro_vesper_02", "sable", "Approaching the White Ridge excavation zone. Pioneers and base rigs are touching down at the staging camp.")
    add("intro_vesper_03", "sable", "Gnarl Brood signatures closing on Dawn Reach from every canyon! Hold that outpost until my Rampart can get back for extraction!")

    # Legacy 7-shot cues preserved in manifest
    add("intro_cine_1", "vane", " Reactor seals locked. Neosteel chestplate fused and pressurized. Bay Seven gantry is clear.")
    add("intro_cine_2", "vale", "Seal the visor. Three weeks in the dark is long enough. It's time Vesper Gate heard from us.")
    add("intro_cine_3", "sable", "Blast doors green! Armor columns rolling, Kestrel flight launching on my mark!")
    add("intro_cine_4", "helm", "Starfall task force clear of warp! Drop-group Alpha detaching for atmospheric entry!")
    add("intro_cine_5", "aster", "Long-range bioscans are spiking across the Rim. The Gnarl Brood is waking beneath every frontier colony!")
    add("intro_cine_6", "vance", "Caught between Directorate martial law, the Brood tide, and ancient Aurelian fleets, the outer worlds face extinction.")
    add("intro_cine_7", "vale", "Let them all come. Load the Ramparts, lock your rifles, and follow me. We're taking our worlds back!")

    add("prologue_1", "vale", "Three weeks ago the Directorate cut every subspace relay along the Rim and left the outer colonies in the dark.")
    add("prologue_2", "vance", "Directorate High Command insists the Vesper comms shutdown is routine maintenance, even as renegade flotillas gather in orbit.")
    add("prologue_3", "vale", "Prep the Ramparts. We break the relay at Vesper Gate first, then we bring every stranded colony home.")

    add("armory_intro_1", "vane", "Welcome to Bay Seven, Commander. Every credit you pull off Directorate contracts goes straight into heavier steel and hotter barrels.")
    add("armory_intro_2", "vane", "Step up to the Armory Console whenever you're ready to refit infantry suits, walkers, or starfighters.")
    add("cantina_intro_1", "rook", "Jukebox is warm, F R N is spinning propaganda on the screen, and the Rim's best mercenary crews are waiting at the holo-table.")
    add("lab_intro_1", "aster", "Gnarl Brood tissue adapts under fire, and Concord crystal matrices store immense harmonic energy. Bring me samples from the field and we will turn both to our advantage.")

    add("arc1_1", "vance", "Subspace traffic is pouring out of Vesper Gate tonight after Captain Vale's raiders toppled the central Directorate relay tower.")
    add("arc1_2", "vale", "With the blackout broken, we intercepted Directorate traffic from White Ridge. They've dug up an ancient artifact, and something else is waking up.")
    add("arc2_1", "sable", "Last Rampart is aboard, Commander! Dawn Reach has fallen to the Gnarl Brood. Distress beacons are lighting up all along the Bracken corridor.")
    add("arc2_2", "aster", "Doctor Aster here. Thousands of colonists at Bracken and Ashfall will be overrun unless we escort their convoys out immediately.")
    add("arc3_1", "sable", "Direct hit on the Concord Purifier core! Outer colony fleets are rallying to the Starfall's transponder.")
    add("arc3_2", "vale", "Only Tarsus, Bel'Verdant, and the sealed vault on Aurelia Prime stand between the Rim and lasting freedom.")
    add("arc4_1", "vale", "The vault seal is down, the Directorate line is broken, and the frontier worlds answer to no one but themselves.")
    add("arc4_2", "sable", "All colonies reporting clear skies, Commander. It was an honor flying the Ashfall Signal with you.")

    # C. Cantina Corporal Rook Cutscene (Intro + 11 per-sector lines)
    add("cantina_rook_1", "rook", "Half the frontier mercs on this deck owe Vale their lives. Put credits on the table and they'll drop into hell beside us.")
    for num, sector, _, _ in SECTORS:
        add(f"rook_sector_{num}", "rook", f"Next drop at {sector} won't be a parade. Hit Bay Seven for plating upgrades before we launch.")

    # D. Bridge Strategic Briefing (Vale lines for non-Vale mission cues + 11 Sable course lines)
    add("vale_bridge_03", "vale", "Gnarl Brood packs are converging on Dawn Reach. Hold those bridges until Sable's Rampart can pull everyone out.")
    add("vale_bridge_04", "vale", "Bracken's colonists are out of time. Get down to the highway and escort Doctor Aster's convoy to the evac ships.")
    add("vale_bridge_08", "vale", "A Concord Purifier warship is moving over the Sanctuary colonies. Crack its three shield links and clear the sky.")
    add("vale_bridge_10", "vale", "We need high-purity Aether from Bel'Verdant's jungle vents before we push on Aurelia Prime. Cover our Pioneers.")
    for num, sector, _, _ in SECTORS:
        add(f"sable_course_{num}", "sable", f"Course plotted for {sector}. Dropships are fueled and awaiting your launch order on the Mission Console.")

    # E. FRN Live Broadcasts (12 studio headlines + 11 orbital drone feeds)
    for stage_code, report_text in FRN_NEWS_REPORTS:
        add(f"frn_news_{stage_code}", "vance", report_text)
    for num, sector, _, _ in SECTORS:
        add(f"frn_drone_{num}", "vance", f"Orbital drone footage confirms heavy engagements across {sector} as Meridian Guard forces press deeper into the sector.")

    # F. All 48 Armory Upgrades (Quartermaster Vane)
    for upg_id, upg_name, upg_summary in upgrades:
        spoken_sum = _clean_spoken_summary(upg_summary)
        add(f"tech_{upg_id}", "vane", f"{upg_name} installed across the fleet. {spoken_sum}")

    # G. All 6 Mercenary Contracts (Corporal Rook)
    for merc_id, merc_name in mercs:
        add(f"hire_{merc_id}", "rook", f"{merc_name} just docked in Bay Seven. Their dropships are standing by on our Contract Post frequency.")

    # H. All 20 Laboratory Breakthroughs (Dr. Aster)
    for perk_id, perk_name in perks:
        add(f"lab_{perk_id}", "aster", f"Synthesis complete. {perk_name} is now integrated into all Meridian deployments.")

    # I. Interactive Hub Room Hotspots, Consoles, & Utility Buttons
    add("ui_armory_console", "vane", "Pulling up the Bay Seven schematics. Pick your hardware, Commander.")
    add("ui_armory_rail_skimmer", "vane", "Rail Skimmer hover-tank. Fast magnetic cushion and a heavy railgun that fires on the move.")
    add("ui_armory_torchguard", "vane", "Torchguard close-assault suit. Twin hypergolic burners built to clear infested lanes.")
    add("ui_armory_kestrel_interceptor", "vane", "Kestrel Interceptor. Twin-vector air superiority frame ready for missile pod refits.")
    add("ui_armory_warden_walker", "vane", "Warden Walker. All-terrain combat mech packing twin autocannons and escort missiles.")
    add("ui_armory_rampart_transport", "vane", "Rampart Dropship. Armored orbital transport that gets our squads in and out alive.")
    add("ui_armory_breacher", "vane", "Breacher shock armor. Concussive shells that crack heavy plating and stall enemy columns.")
    add("ui_cantina_board", "rook", "Contract board is live. Every mercenary company listed here is cleared for orbital drop.")
    add("ui_jukebox", "rook", "Now that's a classic frontier tune. Turn it up.")
    add("ui_lab_console", "aster", "Research console online. Select a xenobiology or relic tier to review.")
    add("ui_lab_brood", "aster", "Remarkable carapace density on this Gnarl Brood specimen. Let's put those samples to work.")
    add("ui_lab_concord", "aster", "The Aurelian relic is resonating cleanly. Ready to channel its harmonic lattice.")
    add("ui_mutators", "vale", "Tactical mutator matrix online. Adjust mission hazard parameters carefully.")
    add("ui_archive", "helm", "Accessing Starfall mission logs and sector broadcast archives.")
    add("ui_service_record", "helm", "Displaying Meridian Guard expedition service record and treasury status.")

    # Preserve any previously generated catalog cues from manifest.json
    manifest_p = HUB_AUDIO_DIR / "manifest.json"
    if manifest_p.exists():
        known_ids = {x["id"] for x in lines}
        prev = json.loads(manifest_p.read_text(encoding="utf-8")).get("cues", {})
        for cid, meta in prev.items():
            if cid not in known_ids:
                add(cid, meta["speaker"], meta["text"])

    return lines


def save_wav_22k(samples: np.ndarray, sr: int, path: Path) -> float:
    x = np.asarray(samples, dtype=np.float32).squeeze()
    if sr != SAMPLE_RATE:
        x = scipy.signal.resample_poly(x, SAMPLE_RATE, sr).astype(np.float32)

    abs_x = np.abs(x)
    idx = np.where(abs_x > 0.0035)[0]
    if len(idx) > 0:
        start = max(0, int(idx[0]) - int(0.05 * SAMPLE_RATE))
        end = min(len(x), int(idx[-1]) + int(0.10 * SAMPLE_RATE))
        x = x[start:end]

    # Gentle fade-in/out to prevent clicks
    fade_n = min(int(0.015 * SAMPLE_RATE), len(x) // 8)
    if fade_n > 1:
        x[:fade_n] *= np.linspace(0.0, 1.0, fade_n, dtype=np.float32)
        x[-fade_n:] *= np.linspace(1.0, 0.0, fade_n, dtype=np.float32)

    rms = float(np.sqrt(np.mean(x * x)) + 1e-8)
    x = x * (TARGET_RMS / rms)
    peak = float(np.max(np.abs(x)) + 1e-8)
    if peak > 0.80:
        x = np.tanh(x * (0.80 / peak) * 1.2) * 0.80

    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype(np.int16)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    return round(len(pcm) / float(SAMPLE_RATE), 3)


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return round(wf.getnframes() / float(wf.getframerate()), 3)


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate all Starfall Command campaign hub & cutscene voices.")
    parser.add_argument("--force", action="store_true", help="Re-synthesize even if WAV already exists")
    parser.add_argument("--batch-size", type=int, default=8, help="GPU batch size per speaker")
    args = parser.parse_args()

    HUB_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    ref_cache_dir = HUB_AUDIO_DIR / "_refs"
    ref_cache_dir.mkdir(parents=True, exist_ok=True)

    all_lines = build_voice_lines()
    print(f"Total campaign hub & cutscene voice lines to verify/generate: {len(all_lines)}")

    # Step 1: Ensure VoiceDesign references exist for Vane, Vance, and Helm
    missing_refs = [
        k for k in DESIGNED_SPEAKERS
        if args.force or not (ref_cache_dir / f"{k}_ref.wav").exists()
    ]
    if missing_refs:
        print(f"Synthesizing {len(missing_refs)} VoiceDesign speaker references on GPU...")
        design_model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
            device_map="cuda:0",
            dtype=torch.bfloat16,
        )
        texts = [DESIGNED_SPEAKERS[k]["ref_text"] for k in missing_refs]
        instructs = [DESIGNED_SPEAKERS[k]["instruct"] for k in missing_refs]
        wavs, sr = design_model.generate_voice_design(
            text=texts,
            instruct=instructs,
            language=["English"] * len(texts),
        )
        for k, w in zip(missing_refs, wavs):
            dur = save_wav_22k(w, sr, ref_cache_dir / f"{k}_ref.wav")
            print(f"  [ref] {k}_ref.wav ({dur:.2f}s)")
        del design_model
        torch.cuda.empty_cache()

    # Step 2: Group pending lines by speaker and clone with Qwen3-TTS-12Hz-0.6B-Base
    pending_by_speaker: dict[str, list[dict]] = {}
    for item in all_lines:
        out_path = HUB_AUDIO_DIR / f"{item['id']}.wav"
        if args.force or not out_path.exists() or out_path.stat().st_size < 2000:
            pending_by_speaker.setdefault(item["speaker"], []).append(item)

    if pending_by_speaker:
        total_pending = sum(len(v) for v in pending_by_speaker.values())
        print(f"Synthesizing {total_pending} voice lines across {len(pending_by_speaker)} character profiles...")
        t_start = time.time()
        clone_model = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
            device_map="cuda:0",
            dtype=torch.bfloat16,
        )

        done_count = 0
        for speaker_id, items in pending_by_speaker.items():
            if speaker_id in CLONED_EXISTING_SPEAKERS:
                ref_wav = CLONED_EXISTING_SPEAKERS[speaker_id]["ref_wav"]
                ref_text = CLONED_EXISTING_SPEAKERS[speaker_id]["ref_text"]
            else:
                ref_wav = ref_cache_dir / f"{speaker_id}_ref.wav"
                ref_text = DESIGNED_SPEAKERS[speaker_id]["ref_text"]

            prompt_list = clone_model.create_voice_clone_prompt(
                ref_audio=str(ref_wav),
                ref_text=ref_text,
            )

            bs = max(1, args.batch_size)
            for b_start in range(0, len(items), bs):
                batch = items[b_start : b_start + bs]
                b_texts = [x["text"] for x in batch]
                t_b = time.time()
                wavs, sr = clone_model.generate_voice_clone(
                    text=b_texts,
                    language=["English"] * len(batch),
                    voice_clone_prompt=prompt_list * len(batch),
                )
                for entry, w in zip(batch, wavs):
                    out_p = HUB_AUDIO_DIR / f"{entry['id']}.wav"
                    save_wav_22k(w, sr, out_p)
                done_count += len(batch)
                elapsed = time.time() - t_start
                print(
                    f"  [{done_count}/{total_pending}] speaker={speaker_id} "
                    f"batch={len(batch)} ({time.time() - t_b:.1f}s, total {elapsed:.1f}s)",
                    flush=True,
                )

    # Remove temporary _refs folder before writing manifest so only runtime assets remain
    if ref_cache_dir.exists():
        for f in ref_cache_dir.glob("*.wav"):
            f.unlink()
        try:
            ref_cache_dir.rmdir()
        except OSError:
            pass

    # Step 3: Write manifest.json with verified durations
    manifest = {
        "sample_rate": SAMPLE_RATE,
        "format": "pcm_s16le_mono",
        "profiles": {
            "vale": {"name": "Captain Vale", "source": "res://assets/audio/campaign/arrival.wav"},
            "sable": {"name": "Pilot Sable", "source": "res://assets/audio/campaign/siege.wav"},
            "aster": {"name": "Dr. Aster", "source": "res://assets/audio/campaign/evac_settlement.wav"},
            "rook": {"name": "Corporal Rook", "source": "res://assets/audio/campaign/camp_siege.wav"},
            "vane": {"name": "Quartermaster Vane", "source": "Qwen3-TTS VoiceDesign (Bay 07 Chief Engineer)"},
            "vance": {"name": "Anchor Kade Vance", "source": "Qwen3-TTS VoiceDesign (FRN Interstellar Anchor)"},
            "helm": {"name": "Starfall Helm", "source": "Qwen3-TTS VoiceDesign (MSV Starfall Navigation)"},
        },
        "cues": {},
    }
    for item in all_lines:
        wav_p = HUB_AUDIO_DIR / f"{item['id']}.wav"
        assert wav_p.exists() and wav_p.stat().st_size > 2000, f"Missing generated WAV: {wav_p}"
        manifest["cues"][item["id"]] = {
            "speaker": item["speaker"],
            "text": item["text"],
            "duration": wav_duration(wav_p),
            "path": f"res://assets/audio/campaign/hub/{item['id']}.wav",
        }

    manifest_path = HUB_AUDIO_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Successfully verified & exported {len(manifest['cues'])} WAV files + {manifest_path}")


if __name__ == "__main__":
    main()
