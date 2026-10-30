#!/usr/bin/env python3
"""
generate_sfx.py — Deterministic procedural WAV sound effect generator for RobOS RTS: Starfall Command.
Generates 16-bit 22050 Hz mono PCM .wav files in assets/audio/sfx/ for all unit weapons
(gunfire, melee strikes, artillery, beams, acid), abilities, shield hits, deaths, economy, and UI.
"""

from __future__ import annotations

import math
from pathlib import Path
import random
import struct
import wave

SAMPLE_RATE = 22050
SFX_DIR = Path(__file__).resolve().parent / "assets" / "audio" / "sfx"


def _clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _soft_clip(x: float, drive: float = 1.0) -> float:
    return math.tanh(x * drive)


def _env_ad(t: float, attack: float, decay: float, curve: float = 2.0) -> float:
    if t < 0.0:
        return 0.0
    if t < attack:
        return (t / max(1e-5, attack))
    rem = max(0.0, 1.0 - (t - attack) / max(1e-5, decay))
    return rem ** curve


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


def _save_wav(name: str, samples: list[float], gain: float = 0.9) -> Path:
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    path = SFX_DIR / f"{name}.wav"
    peak = max((abs(s) for s in samples), default=1.0)
    scale = (gain / peak) if peak > 1e-5 else 1.0
    fade_len = min(int(0.008 * SAMPLE_RATE), len(samples) // 4)
    pcm = bytearray()
    n = len(samples)
    for i, s in enumerate(samples):
        env = 1.0
        if i >= n - fade_len and fade_len > 0:
            env = (n - 1 - i) / fade_len
        val = int(_clamp(s * scale * env) * 32767.0)
        pcm.extend(struct.pack("<h", val))
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(bytes(pcm))
    return path


def _make_noise(n: int, seed: int) -> list[float]:
    rng = random.Random(seed)
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


# ---------------------------------------------------------------------------
# 1. Ranged Gunfire & Projectile Weapons
# ---------------------------------------------------------------------------

def gen_rifle_fire() -> list[float]:
    """R-9 Carbine: crisp double-tap kinetic rifle gunfire burst with supersonic crack and bolt snap."""
    dur = 0.24
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 101)
    crack_noise = _one_pole_hp(_one_pole_lp(noise, 4800.0), 650.0)
    body_noise = _one_pole_lp(noise, 1100.0)
    out = [0.0] * n
    for shot_offset, amp in ((0.0, 1.0), (0.068, 0.88)):
        for i in range(n):
            t = i / SAMPLE_RATE - shot_offset
            if t < 0.0:
                continue
            # Supersonic muzzle crack + punchy low-mid thump + metallic bolt click
            crack_env = _env_ad(t, 0.0008, 0.038, 2.4)
            body_env = _env_ad(t, 0.0012, 0.075, 2.1)
            tail_env = _env_ad(t, 0.003, 0.14, 2.8)
            freq = 95.0 + 340.0 * math.exp(-t * 65.0)
            thump = math.sin(2.0 * math.pi * freq * t) * body_env
            bolt = math.sin(2.0 * math.pi * 2450.0 * t) * _env_ad(t - 0.018, 0.0005, 0.012, 3.0) * 0.35
            sample = (crack_noise[i] * crack_env * 1.35 + body_noise[i] * tail_env * 0.75 + thump * 0.95 + bolt) * amp
            out[i] += _soft_clip(sample, 1.8)
    return out


def gen_breach_charge() -> list[float]:
    """Breach Charges: heavy concussive grenade launcher thump + armor-shattering slow impact."""
    dur = 0.36
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 102)
    lp_noise = _one_pole_lp(noise, 900.0)
    mid_noise = _one_pole_hp(_one_pole_lp(noise, 2600.0), 350.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        # Tube launch thump at t=0
        launch_env = _env_ad(t, 0.002, 0.13, 1.9)
        f_launch = 68.0 + 190.0 * math.exp(-t * 32.0)
        launch = math.sin(2.0 * math.pi * f_launch * t) * launch_env
        # Concussive impact pulse at t=0.085
        ti = t - 0.085
        imp = 0.0
        if ti >= 0.0:
            imp_env = _env_ad(ti, 0.001, 0.24, 2.0)
            f_imp = 52.0 + 220.0 * math.exp(-ti * 24.0)
            sub = math.sin(2.0 * math.pi * f_imp * ti)
            metallic = math.sin(2.0 * math.pi * (620.0 * math.exp(-ti * 8.0)) * ti) * 0.4
            imp = (sub * 1.1 + lp_noise[i] * 0.9 + mid_noise[i] * 0.5 + metallic) * imp_env
        out[i] = _soft_clip(launch * 0.9 + mid_noise[i] * _env_ad(t, 0.001, 0.06, 2.2) * 0.55 + imp, 1.7)
    return out


def gen_autocannon_fire() -> list[float]:
    """Twin Autocannon: dual heavy mechanical 30mm cannon thud-thud with metallic breech clack."""
    dur = 0.32
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 103)
    blast_noise = _one_pole_lp(noise, 1800.0)
    clack_noise = _one_pole_hp(_one_pole_lp(noise, 5200.0), 1200.0)
    out = [0.0] * n
    for shot_offset, pitch_mult in ((0.0, 1.0), (0.095, 0.94)):
        for i in range(n):
            t = i / SAMPLE_RATE - shot_offset
            if t < 0.0:
                continue
            env = _env_ad(t, 0.001, 0.14, 2.0)
            freq = (74.0 + 240.0 * math.exp(-t * 42.0)) * pitch_mult
            boom = math.sin(2.0 * math.pi * freq * t)
            overtone = math.sin(2.0 * math.pi * freq * 2.4 * t) * 0.35
            clack = clack_noise[i] * _env_ad(t, 0.0005, 0.025, 2.6) * 0.8
            out[i] += _soft_clip((boom * 1.1 + overtone + blast_noise[i] * 0.85) * env + clack, 1.85)
    return out


def gen_mortar_fire() -> list[float]:
    """Emplaced Mortar: deep siege artillery cannon blast with incoming whistle and heavy shell impact."""
    dur = 0.52
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 104)
    low_blast = _one_pole_lp(noise, 650.0)
    crackle = _one_pole_hp(_one_pole_lp(noise, 3400.0), 400.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        # Initial cannon discharge boom
        env1 = _env_ad(t, 0.002, 0.28, 1.8)
        f1 = 46.0 + 180.0 * math.exp(-t * 22.0)
        cannon = (math.sin(2.0 * math.pi * f1 * t) * 1.2 + low_blast[i] * 1.1 + crackle[i] * 0.55) * env1
        # Brief artillery shell whistle
        whistle_env = _env_ad(t - 0.04, 0.02, 0.16, 1.5)
        f_whistle = 1150.0 - 520.0 * max(0.0, t - 0.04) * 4.0
        whistle = math.sin(2.0 * math.pi * max(300.0, f_whistle) * t) * whistle_env * 0.22
        # Secondary impact rumble
        t2 = t - 0.14
        impact = 0.0
        if t2 >= 0.0:
            env2 = _env_ad(t2, 0.003, 0.35, 1.7)
            f2 = 38.0 + 130.0 * math.exp(-t2 * 16.0)
            impact = (math.sin(2.0 * math.pi * f2 * t2) * 1.15 + low_blast[i] * 1.2 + crackle[i] * 0.45) * env2
        out[i] = _soft_clip(cannon + whistle + impact, 1.9)
    return out


def gen_acid_spit() -> list[float]:
    """Caustic Spit (Bile Crawler): pressurized organic spit launch + wet caustic sizzle."""
    dur = 0.28
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 105)
    sizzle = _one_pole_hp(_one_pole_lp(noise, 5600.0), 1400.0)
    wet = _one_pole_hp(_one_pole_lp(noise, 1800.0), 300.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        # Organic pitch-swept spit ("pff-twip")
        spit_env = _env_ad(t, 0.004, 0.11, 2.0)
        f = 220.0 + 680.0 * math.sin(min(1.0, t / 0.09) * math.pi)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        spit_tone = math.sin(phase + 0.6 * math.sin(2.0 * math.pi * 38.0 * t)) * spit_env * 0.65
        # Caustic sizzle tail
        siz_env = _env_ad(t - 0.03, 0.01, 0.22, 1.8)
        mod = 0.65 + 0.35 * math.sin(2.0 * math.pi * 55.0 * t)
        out[i] = _soft_clip(spit_tone + wet[i] * spit_env * 0.8 + sizzle[i] * siz_env * mod * 0.95, 1.5)
    return out


def gen_corrosive_lob() -> list[float]:
    """Corrosive Lob (Blight Hurler): deep organic mortar launch + bubbling corrosive splash burst."""
    dur = 0.40
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 106)
    bub_noise = _one_pole_lp(noise, 1400.0)
    hiss_noise = _one_pole_hp(_one_pole_lp(noise, 4800.0), 1100.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        # Guttural bio-launch thud
        l_env = _env_ad(t, 0.005, 0.16, 1.9)
        fl = 85.0 + 160.0 * math.exp(-t * 18.0)
        launch = math.sin(2.0 * math.pi * fl * t + 0.8 * math.sin(2.0 * math.pi * 28.0 * t)) * l_env
        # Splash burst at t=0.09
        ts = t - 0.09
        splash = 0.0
        if ts >= 0.0:
            s_env = _env_ad(ts, 0.004, 0.28, 1.7)
            bubble_mod = math.sin(2.0 * math.pi * (18.0 + 35.0 * ts) * ts)
            splash = (bub_noise[i] * (0.8 + 0.4 * bubble_mod) + hiss_noise[i] * 0.85) * s_env
        out[i] = _soft_clip(launch * 0.95 + bub_noise[i] * l_env * 0.5 + splash, 1.6)
    return out


def gen_needler_fire() -> list[float]:
    """Lattice Needlers (Skirmisher): crystalline pulse laser dart with harmonic resonance."""
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 107)
    sparkle = _one_pole_hp(noise, 3200.0)
    out = [0.0] * n
    phase1 = 0.0
    phase2 = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.19, 2.2)
        f1 = 360.0 + 1850.0 * math.exp(-t * 36.0)
        f2 = f1 * 1.498  # fifth harmonic interval
        phase1 += 2.0 * math.pi * f1 / SAMPLE_RATE
        phase2 += 2.0 * math.pi * f2 / SAMPLE_RATE
        crystal = (math.sin(phase1) * 0.75 + math.sin(phase2) * 0.45) * env
        transient = sparkle[i] * _env_ad(t, 0.0005, 0.025, 2.5) * 0.55
        out[i] = _soft_clip(crystal + transient, 1.4)
    return out


def gen_prism_beam() -> list[float]:
    """Prism Beams (Spire Walker): sweeping thermal prism beam chord + high-energy plasma sear."""
    dur = 0.38
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 108)
    sear = _one_pole_hp(_one_pole_lp(noise, 4500.0), 900.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.012, 0.34, 1.6)
        sweep = 1.0 + 0.18 * math.sin(2.0 * math.pi * 6.5 * t)
        # Rich harmonic prism triad (220, 330, 440, 660 Hz with FM shimmer)
        fm = 0.45 * math.sin(2.0 * math.pi * 48.0 * t)
        c1 = math.sin(2.0 * math.pi * 220.0 * sweep * t + fm)
        c2 = math.sin(2.0 * math.pi * 330.0 * sweep * t - fm) * 0.7
        c3 = math.sin(2.0 * math.pi * 554.37 * sweep * t) * 0.5
        c4 = math.sin(2.0 * math.pi * 880.0 * sweep * t) * 0.35
        beam = (c1 + c2 + c3 + c4) * 0.45 + sear[i] * 0.55
        out[i] = _soft_clip(beam * env, 1.5)
    return out


# ---------------------------------------------------------------------------
# 2. Melee Attack Strike & Worker Weapons
# ---------------------------------------------------------------------------

def gen_claw_slash() -> list[float]:
    """Razor Claws (Skitterling): fast slashing melee swipe + sharp armor/flesh strike impact."""
    dur = 0.19
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 201)
    swipe = _one_pole_hp(_one_pole_lp(noise, 5200.0), 950.0)
    thud_noise = _one_pole_lp(noise, 850.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        # Fast whoosh-rip sweep
        sw_env = _env_ad(t, 0.003, 0.095, 2.0)
        f_rip = 1400.0 * math.exp(-t * 22.0) + 180.0
        phase += 2.0 * math.pi * f_rip / SAMPLE_RATE
        rip = math.sin(phase) * _env_ad(t, 0.001, 0.055, 2.4) * 0.65
        # Strike impact at t=0.022
        ti = t - 0.022
        hit = 0.0
        if ti >= 0.0:
            h_env = _env_ad(ti, 0.0008, 0.11, 2.3)
            f_hit = 110.0 + 260.0 * math.exp(-ti * 48.0)
            hit = (math.sin(2.0 * math.pi * f_hit * ti) * 0.95 + thud_noise[i] * 0.85) * h_env
        out[i] = _soft_clip(swipe[i] * sw_env * 1.1 + rip + hit, 1.75)
    return out


def gen_mandible_bite() -> list[float]:
    """Mandibles (Forager): snapping chitin mandible bite & crunch strike."""
    dur = 0.18
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 202)
    crunch = _one_pole_hp(_one_pole_lp(noise, 3600.0), 600.0)
    out = [0.0] * n
    for snap_t, amp in ((0.0, 0.9), (0.032, 1.0)):
        for i in range(n):
            t = i / SAMPLE_RATE - snap_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.0007, 0.08, 2.5)
            f = 150.0 + 520.0 * math.exp(-t * 55.0)
            click = math.sin(2.0 * math.pi * f * t)
            out[i] += _soft_clip((click * 0.9 + crunch[i] * 0.95) * env * amp, 1.65)
    return out


def gen_light_blade_strike() -> list[float]:
    """Light Blades (Sunblade): twin plasma/light-blade saber slash & resonant clash."""
    dur = 0.28
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 203)
    saber_hiss = _one_pole_hp(_one_pole_lp(noise, 4800.0), 800.0)
    out = [0.0] * n
    for swing_t, base_f, amp in ((0.0, 260.0, 1.0), (0.078, 310.0, 0.92)):
        phase = 0.0
        for i in range(n):
            t = i / SAMPLE_RATE - swing_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.002, 0.17, 2.0)
            # Doppler plasma blade pitch sweep + metallic energy clash
            f = base_f + 620.0 * math.exp(-t * 28.0)
            phase += 2.0 * math.pi * f / SAMPLE_RATE
            hum = math.sin(phase + 0.7 * math.sin(phase * 2.0)) * 0.75
            clash_ring = math.sin(2.0 * math.pi * (base_f * 4.2) * t) * _env_ad(t, 0.0006, 0.065, 2.6) * 0.45
            sample = (hum + clash_ring + saber_hiss[i] * 0.65) * env * amp
            out[i] += _soft_clip(sample, 1.6)
    return out


def gen_arc_welder() -> list[float]:
    """Arc Welder (Pioneer): short-range industrial electrical arc snap and buzzing weld strike."""
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 204)
    spark = _one_pole_hp(noise, 2400.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.19, 1.9)
        # 120 Hz transformer buzz + harmonics + erratic spark crackle
        buzz = math.tanh(3.5 * math.sin(2.0 * math.pi * 120.0 * t + 0.5 * math.sin(2.0 * math.pi * 780.0 * t))) * 0.5
        gate = 1.0 if math.sin(2.0 * math.pi * 43.0 * t) > -0.2 else 0.25
        snap = math.sin(2.0 * math.pi * (1800.0 * math.exp(-t * 40.0)) * t) * _env_ad(t, 0.0005, 0.03, 2.8) * 0.8
        out[i] = _soft_clip((buzz + spark[i] * gate * 0.85) * env + snap, 1.6)
    return out


def gen_mote_spark() -> list[float]:
    """Mote Spark (Mote): high crystalline electrostatic zap strike."""
    dur = 0.18
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 205)
    zap_noise = _one_pole_hp(noise, 3000.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.0008, 0.16, 2.3)
        f = 580.0 + 1600.0 * math.exp(-t * 45.0) + 120.0 * math.sin(2.0 * math.pi * 65.0 * t)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        tone = math.sin(phase) * 0.7 + math.sin(phase * 1.5) * 0.35
        out[i] = _soft_clip((tone + zap_noise[i] * 0.45) * env, 1.45)
    return out


def gen_melee_hit() -> list[float]:
    """General melee strike impact: punchy close-combat physical thud + armor clang."""
    dur = 0.16
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 206)
    thud = _one_pole_lp(noise, 950.0)
    clang = _one_pole_hp(_one_pole_lp(noise, 3800.0), 900.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.0007, 0.14, 2.4)
        f = 82.0 + 240.0 * math.exp(-t * 50.0)
        body = math.sin(2.0 * math.pi * f * t) * 1.05
        metal = (math.sin(2.0 * math.pi * 780.0 * t) + 0.6 * math.sin(2.0 * math.pi * 1240.0 * t)) * _env_ad(t, 0.0005, 0.05, 2.8) * 0.35
        out[i] = _soft_clip((body + thud[i] * 0.8 + clang[i] * 0.45) * env + metal, 1.75)
    return out


# ---------------------------------------------------------------------------
# 3. Combat Impacts, Splash & Shield Sounds
# ---------------------------------------------------------------------------

def gen_shield_hit() -> list[float]:
    """Aegis Shield deflection: crystalline energy barrier shimmer & phase ripple."""
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 301)
    shimmer = _one_pole_hp(noise, 3500.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.20, 2.1)
        f1 = 920.0 - 280.0 * math.exp(-t * 25.0)
        f2 = 1380.0 + 320.0 * math.sin(2.0 * math.pi * 28.0 * t)
        ring = math.sin(2.0 * math.pi * f1 * t) * 0.65 + math.sin(2.0 * math.pi * f2 * t) * 0.45
        out[i] = _soft_clip((ring + shimmer[i] * 0.35) * env, 1.35)
    return out


def gen_explosion_splash() -> list[float]:
    """Splash detonation for artillery / heavy area damage."""
    dur = 0.46
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 302)
    rumble = _one_pole_lp(noise, 550.0)
    debris = _one_pole_hp(_one_pole_lp(noise, 2800.0), 400.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.002, 0.43, 1.75)
        f = 42.0 + 150.0 * math.exp(-t * 18.0)
        sub = math.sin(2.0 * math.pi * f * t) * 1.2
        out[i] = _soft_clip((sub + rumble[i] * 1.15 + debris[i] * 0.55) * env, 1.85)
    return out


# ---------------------------------------------------------------------------
# 4. Unit Abilities & Mode Transforms
# ---------------------------------------------------------------------------

def gen_surge_activate() -> list[float]:
    """Surge Injector: pneumatic injector hiss + rising adrenaline synth pulse."""
    dur = 0.32
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 401)
    hiss = _one_pole_hp(_one_pole_lp(noise, 6500.0), 1800.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        hiss_env = _env_ad(t, 0.002, 0.14, 2.0)
        tone_env = _env_ad(t - 0.03, 0.015, 0.26, 1.7)
        f = 280.0 + 620.0 * min(1.0, max(0.0, (t - 0.03) / 0.22))
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        synth = (math.sin(phase) + 0.4 * math.sin(phase * 2.0)) * tone_env * 0.55
        out[i] = _soft_clip(hiss[i] * hiss_env * 0.9 + synth, 1.45)
    return out


def gen_charge_activate() -> list[float]:
    """Sunblade Rush: psionic speed-burst whoosh + resonant zeal chord."""
    dur = 0.30
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 402)
    whoosh = _one_pole_hp(_one_pole_lp(noise, 3200.0), 400.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.008, 0.27, 1.8)
        f = 220.0 + 440.0 * math.sin(min(1.0, t / 0.25) * math.pi * 0.5)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        chord = (math.sin(phase) * 0.6 + math.sin(phase * 1.5) * 0.45) * env
        out[i] = _soft_clip(chord + whoosh[i] * env * 0.65, 1.45)
    return out


def gen_phase_step() -> list[float]:
    """Skirmisher Phase Step: dimensional teleport warp-out / warp-in shimmer."""
    dur = 0.34
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 403)
    shimmer = _one_pole_hp(noise, 2800.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.005, 0.32, 1.7)
        # V-shaped warp frequency: folds down then blooms up into high harmonic chord
        norm = t / dur
        f = 880.0 - 540.0 * math.sin(norm * math.pi) + 420.0 * (norm ** 2)
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        warp = math.sin(phase) * 0.65 + math.sin(phase * 1.498) * 0.4 + math.sin(phase * 2.0) * 0.25
        out[i] = _soft_clip((warp + shimmer[i] * 0.3) * env, 1.4)
    return out


def gen_siege_transform() -> list[float]:
    """Howitzer Emplace / Mobilize: hydraulic servo whine + heavy mechanical lock clank."""
    dur = 0.38
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 404)
    mech = _one_pole_hp(_one_pole_lp(noise, 3000.0), 350.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        # Servo whine
        s_env = _env_ad(t, 0.01, 0.24, 1.5)
        f_servo = 180.0 + 260.0 * min(1.0, t / 0.22)
        phase += 2.0 * math.pi * f_servo / SAMPLE_RATE
        servo = (math.sin(phase) + 0.5 * math.sin(phase * 2.0)) * s_env * 0.45
        # Heavy lock clank at t=0.20
        tc = t - 0.20
        clank = 0.0
        if tc >= 0.0:
            c_env = _env_ad(tc, 0.001, 0.16, 2.2)
            f_c = 95.0 + 280.0 * math.exp(-tc * 45.0)
            clank = (math.sin(2.0 * math.pi * f_c * tc) * 1.0 + math.sin(2.0 * math.pi * 640.0 * tc) * 0.45 + mech[i] * 0.8) * c_env
        out[i] = _soft_clip(servo + mech[i] * s_env * 0.25 + clank, 1.65)
    return out


def gen_silo_gate() -> list[float]:
    """Provision Silo Retract / Extend: pneumatic heavy gate slide and latch."""
    dur = 0.30
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 405)
    pneum = _one_pole_lp(noise, 1200.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.005, 0.28, 1.8)
        f = 130.0 - 45.0 * (t / dur)
        latch = math.sin(2.0 * math.pi * 420.0 * t) * _env_ad(t - 0.16, 0.001, 0.06, 2.5) * 0.5
        out[i] = _soft_clip((math.sin(2.0 * math.pi * f * t) * 0.65 + pneum[i] * 0.7) * env + latch, 1.5)
    return out


# ---------------------------------------------------------------------------
# 5. Unit & Structure Destruction Sounds
# ---------------------------------------------------------------------------

def gen_unit_death_human() -> list[float]:
    """Human unit death: brief comms static burst + armor drop thud."""
    dur = 0.30
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 501)
    static = _one_pole_hp(_one_pole_lp(noise, 3800.0), 900.0)
    thud = _one_pole_lp(noise, 600.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        st_env = _env_ad(t, 0.001, 0.09, 2.2)
        th_env = _env_ad(t - 0.03, 0.002, 0.24, 1.9)
        f = 75.0 + 140.0 * math.exp(-max(0.0, t - 0.03) * 28.0)
        body = math.sin(2.0 * math.pi * f * max(0.0, t - 0.03)) * th_env * 0.9
        out[i] = _soft_clip(static[i] * st_env * 0.75 + (thud[i] * 0.8 + body) * th_env, 1.6)
    return out


def gen_unit_death_monster() -> list[float]:
    """Monster unit death: descending organic screech + wet thud."""
    dur = 0.32
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 502)
    wet = _one_pole_lp(noise, 1300.0)
    out = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.003, 0.29, 1.8)
        f = 540.0 * math.exp(-t * 8.5) + 75.0
        phase += 2.0 * math.pi * f / SAMPLE_RATE
        screech = math.sin(phase + 0.9 * math.sin(2.0 * math.pi * 34.0 * t)) * 0.75
        out[i] = _soft_clip((screech + wet[i] * 0.65) * env, 1.55)
    return out


def gen_unit_death_alien() -> list[float]:
    """Alien unit death: crystalline core shatter + fading harmonic vaporize."""
    dur = 0.34
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 503)
    shatter = _one_pole_hp(noise, 2600.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.32, 1.9)
        f1 = 760.0 * math.exp(-t * 5.0)
        f2 = 1140.0 * math.exp(-t * 6.5)
        tones = math.sin(2.0 * math.pi * f1 * t) * 0.6 + math.sin(2.0 * math.pi * f2 * t) * 0.45
        out[i] = _soft_clip((tones + shatter[i] * _env_ad(t, 0.001, 0.12, 2.4) * 0.7) * env, 1.5)
    return out


def gen_structure_destroyed() -> list[float]:
    """Structure destroyed: deep multi-stage collapse explosion + low rumble."""
    dur = 0.68
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 504)
    rumble = _one_pole_lp(noise, 480.0)
    crackle = _one_pole_hp(_one_pole_lp(noise, 2600.0), 350.0)
    out = [0.0] * n
    for stage_t, f0, amp in ((0.0, 52.0, 1.0), (0.14, 42.0, 0.95), (0.29, 35.0, 0.85)):
        for i in range(n):
            t = i / SAMPLE_RATE - stage_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.003, 0.42, 1.65)
            f = f0 + 130.0 * math.exp(-t * 16.0)
            boom = math.sin(2.0 * math.pi * f * t) * 1.15
            out[i] += _soft_clip((boom + rumble[i] * 1.1 + crackle[i] * 0.5) * env * amp, 1.85)
    return out


# ---------------------------------------------------------------------------
# 6. Economy, Production & Tactical UI Sounds
# ---------------------------------------------------------------------------

def gen_harvest_hit() -> list[float]:
    """Very quiet sizzle of a mining drill contacting crystal."""
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 601)
    # Soft high-frequency fizz/sizzle (band-limited 2.4kHz - 6.2kHz) with gentle rapid flutter
    sizzle = _one_pole_hp(_one_pole_lp(noise, 6200.0), 2400.0)
    shimmer = _one_pole_hp(_one_pole_lp(noise, 3800.0), 1500.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        # Smooth fade-in and gentle taper so there is no click or chime
        env = math.sin(math.pi * min(1.0, t / dur)) ** 1.4
        flutter = 0.65 + 0.35 * math.sin(2.0 * math.pi * 58.0 * t)
        grain = sizzle[i] * 0.75 + shimmer[i] * 0.25
        out[i] = grain * env * flutter * 0.35
    return out


def gen_structure_complete() -> list[float]:
    """Structure complete: rising two-note tactical completion chord."""
    dur = 0.36
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for note_t, freq in ((0.0, 523.25), (0.12, 783.99)):
        for i in range(n):
            t = i / SAMPLE_RATE - note_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.004, 0.22, 1.9)
            out[i] += (math.sin(2.0 * math.pi * freq * t) * 0.65 + math.sin(2.0 * math.pi * freq * 2.0 * t) * 0.25) * env
    return out


def gen_unit_ready() -> list[float]:
    """Unit production complete: crisp tactical ready chime."""
    dur = 0.24
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for note_t, freq in ((0.0, 587.33), (0.08, 880.0)):
        for i in range(n):
            t = i / SAMPLE_RATE - note_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.002, 0.15, 2.1)
            out[i] += (math.sin(2.0 * math.pi * freq * t) * 0.6 + math.sin(2.0 * math.pi * freq * 1.5 * t) * 0.25) * env
    return out


def gen_ui_select() -> list[float]:
    """Soft, crisp HUD unit selection click."""
    dur = 0.07
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.0005, 0.06, 2.8)
        f = 740.0 + 420.0 * math.exp(-t * 80.0)
        out[i] = math.sin(2.0 * math.pi * f * t) * env * 0.7
    return out


def gen_ui_command_move() -> list[float]:
    """Clean affirmative tactical order confirmation beep."""
    dur = 0.11
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.10, 2.3)
        f = 660.0 + 220.0 * min(1.0, t / 0.04)
        out[i] = (math.sin(2.0 * math.pi * f * t) * 0.65 + math.sin(2.0 * math.pi * f * 2.0 * t) * 0.2) * env
    return out


def gen_ui_command_attack() -> list[float]:
    """Sharp double-tap tactical target-lock tone."""
    dur = 0.15
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for pulse_t, freq in ((0.0, 780.0), (0.055, 980.0)):
        for i in range(n):
            t = i / SAMPLE_RATE - pulse_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.001, 0.08, 2.5)
            out[i] += (math.sin(2.0 * math.pi * freq * t) * 0.65 + math.sin(2.0 * math.pi * freq * 1.5 * t) * 0.3) * env
    return out


def gen_ui_build_place() -> list[float]:
    """Solid mechanical blueprint anchor thud."""
    dur = 0.18
    n = int(dur * SAMPLE_RATE)
    noise = _make_noise(n, 601)
    mech = _one_pole_lp(noise, 1400.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = _env_ad(t, 0.001, 0.16, 2.2)
        f = 110.0 + 220.0 * math.exp(-t * 45.0)
        beep = math.sin(2.0 * math.pi * 620.0 * t) * _env_ad(t - 0.03, 0.001, 0.08, 2.4) * 0.35
        out[i] = _soft_clip((math.sin(2.0 * math.pi * f * t) * 0.8 + mech[i] * 0.5) * env + beep, 1.5)
    return out


def gen_ui_error() -> list[float]:
    """Low muted double-buzz for blocked commands / insufficient resources."""
    dur = 0.22
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for pulse_t, freq in ((0.0, 165.0), (0.09, 138.0)):
        for i in range(n):
            t = i / SAMPLE_RATE - pulse_t
            if t < 0.0 or t > 0.085:
                continue
            env = _env_ad(t, 0.002, 0.08, 1.8)
            raw = math.sin(2.0 * math.pi * freq * t) + 0.5 * math.sin(2.0 * math.pi * freq * 2.0 * t) + 0.3 * math.sin(2.0 * math.pi * freq * 3.0 * t)
            out[i] += _soft_clip(raw * env * 0.6, 1.5)
    return out


def gen_alert_under_attack() -> list[float]:
    """Urgent two-tone tactical warning klaxon."""
    dur = 0.44
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    for pulse_t, f0, f1 in ((0.0, 620.0, 480.0), (0.20, 660.0, 490.0)):
        phase = 0.0
        for i in range(n):
            t = i / SAMPLE_RATE - pulse_t
            if t < 0.0 or t > 0.19:
                continue
            env = _env_ad(t, 0.005, 0.18, 1.5)
            f = f0 + (f1 - f0) * (t / 0.19)
            phase += 2.0 * math.pi * f / SAMPLE_RATE
            wave_val = math.sin(phase) + 0.4 * math.sin(phase * 2.0) + 0.2 * math.sin(phase * 3.0)
            out[i] += _soft_clip(wave_val * env * 0.55, 1.5)
    return out


def gen_match_victory() -> list[float]:
    """Triumphant major fanfare chord (C5 -> E5 -> G5 -> C6)."""
    dur = 0.75
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    notes = ((0.0, 523.25), (0.11, 659.25), (0.22, 783.99), (0.34, 1046.50))
    for note_t, freq in notes:
        for i in range(n):
            t = i / SAMPLE_RATE - note_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.008, 0.40, 1.6)
            tone = math.sin(2.0 * math.pi * freq * t) * 0.5 + math.sin(2.0 * math.pi * freq * 2.0 * t) * 0.22
            out[i] += tone * env
    return [_soft_clip(x, 1.2) for x in out]


def gen_match_defeat() -> list[float]:
    """Somber descending minor cadence (A4 -> F4 -> D4)."""
    dur = 0.70
    n = int(dur * SAMPLE_RATE)
    out = [0.0] * n
    notes = ((0.0, 440.0), (0.18, 349.23), (0.36, 293.66))
    for note_t, freq in notes:
        for i in range(n):
            t = i / SAMPLE_RATE - note_t
            if t < 0.0:
                continue
            env = _env_ad(t, 0.01, 0.34, 1.7)
            tone = math.sin(2.0 * math.pi * freq * t) * 0.55 + math.sin(2.0 * math.pi * freq * 1.5 * t) * 0.2
            out[i] += tone * env
    return [_soft_clip(x, 1.2) for x in out]


GENERATORS = {
    # Gunfire & Ranged Weapons
    "rifle_fire": (gen_rifle_fire, 0.90),
    "breach_charge": (gen_breach_charge, 0.92),
    "autocannon_fire": (gen_autocannon_fire, 0.92),
    "mortar_fire": (gen_mortar_fire, 0.95),
    "acid_spit": (gen_acid_spit, 0.85),
    "corrosive_lob": (gen_corrosive_lob, 0.88),
    "needler_fire": (gen_needler_fire, 0.84),
    "prism_beam": (gen_prism_beam, 0.86),
    # Melee Strikes & Worker Weapons
    "claw_slash": (gen_claw_slash, 0.88),
    "mandible_bite": (gen_mandible_bite, 0.84),
    "light_blade_strike": (gen_light_blade_strike, 0.88),
    "arc_welder": (gen_arc_welder, 0.82),
    "mote_spark": (gen_mote_spark, 0.80),
    "melee_hit": (gen_melee_hit, 0.88),
    # Combat Impacts & Shields
    "shield_hit": (gen_shield_hit, 0.80),
    "explosion_splash": (gen_explosion_splash, 0.94),
    # Abilities & Mode Transforms
    "surge_activate": (gen_surge_activate, 0.85),
    "charge_activate": (gen_charge_activate, 0.85),
    "phase_step": (gen_phase_step, 0.86),
    "siege_transform": (gen_siege_transform, 0.88),
    "silo_gate": (gen_silo_gate, 0.82),
    # Unit & Structure Destruction
    "unit_death_human": (gen_unit_death_human, 0.86),
    "unit_death_monster": (gen_unit_death_monster, 0.86),
    "unit_death_alien": (gen_unit_death_alien, 0.86),
    "structure_destroyed": (gen_structure_destroyed, 0.95),
    # Economy, Production & Tactical UI
    "harvest_hit": (gen_harvest_hit, 0.16),
    "structure_complete": (gen_structure_complete, 0.82),
    "unit_ready": (gen_unit_ready, 0.78),
    "ui_select": (gen_ui_select, 0.65),
    "ui_command_move": (gen_ui_command_move, 0.72),
    "ui_command_attack": (gen_ui_command_attack, 0.76),
    "ui_build_place": (gen_ui_build_place, 0.80),
    "ui_error": (gen_ui_error, 0.75),
    "alert_under_attack": (gen_alert_under_attack, 0.88),
    "match_victory": (gen_match_victory, 0.88),
    "match_defeat": (gen_match_defeat, 0.85),
}


def main() -> None:
    generated = []
    for name, (fn, gain) in GENERATORS.items():
        path = _save_wav(name, fn(), gain)
        generated.append(path)
    print(f"Generated {len(generated)} WAV sound effects in {SFX_DIR}")


if __name__ == "__main__":
    main()
