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


def gen_sentry_fire() -> list[float]:
    """A rising rush that bends down in pitch as the missile pulls away."""
    length = int(0.27 * SAMPLE_RATE)
    air = _one_pole_lp(_one_pole_hp(_make_noise(length, 906), 280.0), 1600.0)
    core_phase = 0.0
    overtone_phase = 0.0
    result = []
    for i, sample in enumerate(air):
        t = i / SAMPLE_RATE
        glide = (1.0 + math.tanh((t - 0.074) * 29.0)) * 0.5
        core_phase += math.tau * (366.0 - 181.0 * glide) / SAMPLE_RATE
        overtone_phase += math.tau * (746.0 - 352.0 * glide) / SAMPLE_RATE
        swell = math.sin(math.pi * min(1.0, t / 0.27) ** 0.55) ** 2
        tone = 0.31 * math.sin(core_phase) + 0.13 * math.sin(overtone_phase)
        tail = 0.040 * math.sin(core_phase * 3.0) * (1.0 - glide)
        result.append((tone + tail + sample * 0.11) * swell)
    return result


def gen_sentry_impact() -> list[float]:
    """A short, padded impact under the launch sound."""
    length = int(0.09 * SAMPLE_RATE)
    result = []
    phase = 0.0
    for i in range(length):
        t = i / SAMPLE_RATE
        phase += math.tau * (125.0 + 65.0 * math.exp(-t * 50.0)) / SAMPLE_RATE
        tone = math.sin(phase) + 0.20 * math.sin(phase * 2.0)
        result.append(tone * _env_ad(t, 0.009, 0.077, 2.5))
    return result


def gen_mortar_fire() -> list[float]:
    """Emplaced Howitzer: chunky siege cannon crack, weighty low boom, steel breech cycle, and short outdoor tail."""
    dur = 0.66
    n = int(dur * SAMPLE_RATE)
    noise_a = _make_noise(n, 104)
    noise_b = _make_noise(n, 1043)
    noise_c = _make_noise(n, 1049)

    # Layer 1: Immediate chunky muzzle crack + 14ms ground-plane shock reflection
    snap_hi = _one_pole_hp(_one_pole_lp(noise_a, 7800.0), 1950.0)
    crack_mid = _one_pole_hp(_one_pole_lp(noise_a, 2850.0), 380.0)
    ground_slap = _one_pole_hp(_one_pole_lp(noise_b, 2150.0), 220.0)

    # Layer 2: Weighty dual-band low siege boom (upper-bass chest punch + deep cordite sub)
    sub_cordite = _one_pole_lp(_one_pole_lp(noise_b, 205.0), 205.0)
    chest_blast = _one_pole_hp(_one_pole_lp(noise_a, 590.0), 75.0)

    # Layer 3: Heavy steel breech recoil stop, hydro-pneumatic vent & cam lock-back
    steel_shear = _one_pole_hp(_one_pole_lp(noise_c, 5200.0), 1250.0)
    iron_clank = _one_pole_hp(_one_pole_lp(noise_c, 1750.0), 400.0)
    pneum_vent = _one_pole_hp(_one_pole_lp(noise_b, 4800.0), 1650.0)

    # Layer 4: Short outdoor battlefield shockwave dispersion tail
    tail_air = _one_pole_hp(_one_pole_lp(noise_c, 3400.0), 950.0)
    tail_roll_mid = _one_pole_hp(_one_pole_lp(noise_b, 1450.0), 290.0)
    tail_roll_low = _one_pole_hp(_one_pole_lp(_one_pole_lp(noise_c, 520.0), 520.0), 98.0)
    turb_slow = _one_pole_lp(_one_pole_lp(noise_a, 26.0), 20.0)
    turb_crack = _one_pole_lp(noise_c, 110.0)

    two_pi = 2.0 * math.pi
    out = [0.0] * n

    for i in range(n):
        t = i / SAMPLE_RATE

        # 1) Immediate chunky muzzle crack (0.000s - 0.052s)
        n_wave = (
            (1.0 - 2.1 * (t / 0.0036)) * (1.0 - t / 0.0036) * 1.28
            if t < 0.0036
            else 0.0
        )
        bark_phase = two_pi * (82.0 * t + (270.0 / 96.0) * (1.0 - math.exp(-t * 96.0)))
        snap_env = _env_ad(t, 0.0002, 0.024, 2.25)
        bark_env = _env_ad(t, 0.0004, 0.044, 1.95)
        direct_crack = (
            n_wave
            + snap_hi[i] * snap_env * 1.60
            + _soft_clip(math.sin(bark_phase) * 1.25 + crack_mid[i] * 2.50, 2.4) * bark_env * 0.98
        )

        # 14ms ground-bounce blast slap from elevated muzzle
        slap = 0.0
        t_slap = t - 0.014
        if t_slap >= 0.0:
            slap_env = _env_ad(t_slap, 0.0006, 0.036, 2.05)
            slap_phase = two_pi * (92.0 * t_slap + (145.0 / 85.0) * (1.0 - math.exp(-t_slap * 85.0)))
            slap = _soft_clip(ground_slap[i] * 2.20 + math.sin(slap_phase) * 0.85, 1.95) * slap_env * 0.64

        # 2) Weighty low siege boom (0.002s - 0.280s)
        chest_env = _env_ad(t, 0.0018, 0.145, 1.9)
        chest_phase = two_pi * (86.0 * t + (95.0 / 48.0) * (1.0 - math.exp(-t * 48.0)))
        sub_env = _env_ad(t, 0.0035, 0.270, 1.95)
        sub_phase = two_pi * (43.0 * t + (82.0 / 44.0) * (1.0 - math.exp(-t * 44.0)))

        chest_layer = (math.sin(chest_phase) * 0.70 + chest_blast[i] * 2.25) * chest_env
        gas_mod = 0.84 + 0.32 * math.sin(sub_phase)
        sub_layer = (
            math.sin(sub_phase) * 0.84
            + math.sin(sub_phase * 2.0) * 0.30
            + sub_cordite[i] * 4.15 * gas_mod
        ) * sub_env
        boom = _soft_clip(chest_layer * 0.78 + sub_layer * 0.92, 1.75)

        # 3) Mechanical breech & hydro-pneumatic recuperator layer (0.048s - 0.250s)
        mech = 0.0
        t_stop = t - 0.048
        if t_stop >= 0.0:
            stop_env = _env_ad(t_stop, 0.0004, 0.028, 2.35)
            stop_phase = two_pi * (128.0 * t_stop + (190.0 / 85.0) * (1.0 - math.exp(-t_stop * 85.0)))
            fm_stop = math.sin(two_pi * 1580.0 * t_stop) * 1.7 * math.exp(-t_stop * 140.0)
            cradle_slam = math.sin(stop_phase) * 0.55 + math.sin(two_pi * 630.0 * t_stop + fm_stop) * 0.35
            mech += (cradle_slam + iron_clank[i] * 1.65 + steel_shear[i] * 1.30) * stop_env * 0.44

        t_vent = t - 0.068
        if t_vent >= 0.0:
            vent_env = _env_ad(t_vent, 0.010, 0.155, 1.75)
            mech += (pneum_vent[i] * 1.05 + iron_clank[i] * 0.34) * vent_env * 0.28

        t_cam = t - 0.156
        if t_cam >= 0.0:
            cam_env = _env_ad(t_cam, 0.0004, 0.016, 2.5)
            fm_cam = math.sin(two_pi * 2240.0 * t_cam) * 1.5 * math.exp(-t_cam * 175.0)
            cam_click = math.sin(two_pi * 860.0 * t_cam + fm_cam) * 0.34
            mech += (cam_click + steel_shear[i] * 1.35 + iron_clank[i] * 1.10) * cam_env * 0.30

        t_lock = t - 0.192
        if t_lock >= 0.0:
            lock_env = _env_ad(t_lock, 0.0005, 0.028, 2.35)
            lock_phase = two_pi * (114.0 * t_lock + (155.0 / 82.0) * (1.0 - math.exp(-t_lock * 82.0)))
            fm_lock = math.sin(two_pi * 1840.0 * t_lock) * 1.4 * math.exp(-t_lock * 155.0)
            breech_seat = math.sin(lock_phase) * 0.60 + math.sin(two_pi * 535.0 * t_lock + fm_lock) * 0.28
            mech += (breech_seat + iron_clank[i] * 1.45 + steel_shear[i] * 0.92) * lock_env * 0.34

        # 4) Short outdoor artillery shockwave tail (0.024s - 0.660s)
        tail = 0.0
        t_tail = t - 0.024
        if t_tail >= 0.0:
            air_tex = _clamp(
                0.76 + 3.1 * abs(turb_slow[i]) + 0.80 * max(0.0, turb_crack[i]),
                0.42,
                1.62,
            )
            air_env = _env_ad(t_tail, 0.010, 0.175, 2.05)
            mid_env = _env_ad(t_tail, 0.022, 0.395, 1.95)
            low_env = _env_ad(t_tail, 0.035, 0.605, 2.15)
            tail = (
                tail_air[i] * air_env * 0.65
                + tail_roll_mid[i] * mid_env * 1.15
                + tail_roll_low[i] * low_env * 2.35
            ) * air_tex * 0.47

        mix = direct_crack * 0.96 + slap + boom * 0.76 + mech + tail
        front_punch = 1.0 + 0.27 * math.exp(-t * 52.0)
        out[i] = _soft_clip(mix * front_punch, 1.24)

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


def gen_crown_lance() -> list[float]:
    """A low resonant capital beam with a sharp discharge and a falling tail."""
    duration = 0.56
    count = int(duration * SAMPLE_RATE)
    discharge = _one_pole_lp(_make_noise(count, 1081), 2800.0)
    phase = 0.0
    samples = []
    for i in range(count):
        time = i / SAMPLE_RATE
        pitch = 73.0 + 145.0 * math.exp(-time * 9.0)
        phase += 2.0 * math.pi * pitch / SAMPLE_RATE
        body = 0.7 * math.sin(phase) + 0.3 * math.sin(phase * 1.5) + 0.18 * math.sin(phase * 4.0)
        sustain = body * _env_ad(time, 0.022, 0.52, 1.75)
        crack = discharge[i] * _env_ad(time, 0.004, 0.09, 2.2)
        samples.append(_soft_clip(sustain + crack, 1.25))
    return samples


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


def gen_power_field(anchoring: bool) -> list[float]:
    """Two resonant pulses rising on anchor and falling on fold."""
    duration = 0.48
    phase = 0.0
    samples = []
    for i in range(int(duration * SAMPLE_RATE)):
        time = i / SAMPLE_RATE
        progress = time / duration
        pitch = 180.0 + 210.0 * (progress if anchoring else 1.0 - progress)
        phase += 2.0 * math.pi * pitch / SAMPLE_RATE
        chord = 0.65 * math.sin(phase) + 0.24 * math.sin(phase * 1.5) + 0.11 * math.sin(phase * 3.0)
        envelope = _env_ad(time, 0.014, 0.23) + 0.65 * _env_ad(time - 0.14, 0.02, 0.28)
        samples.append(chord * envelope)
    return samples


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


def gen_support_pulse(frequency: float, duration: float) -> list[float]:
    samples = []
    for index in range(int(SAMPLE_RATE * duration)):
        t = index / SAMPLE_RATE
        envelope = _env_ad(t, 0.045, duration - 0.045)
        chirp = 2 * math.pi * frequency * (t + t * t * 0.9)
        shimmer = math.sin(chirp * 1.51) * 0.24
        samples.append((math.sin(chirp) * 0.67 + shimmer) * envelope)
    return samples


def gen_volatile_burst() -> list[float]:
    """A short organic pop followed by acid hiss and scattered droplets."""
    duration = 0.52
    rng = random.Random(9061)
    noise = [rng.uniform(-1.0, 1.0) for _ in range(int(SAMPLE_RATE * duration))]
    hiss = _one_pole_hp(_one_pole_lp(noise, 5800), 640)
    thump = _one_pole_lp(noise, 290)
    samples = []
    for i, (sizzle, pressure) in enumerate(zip(hiss, thump)):
        t = i / SAMPLE_RATE
        pop = math.sin(2.0 * math.pi * (132 * t - 107 * t * t)) * math.exp(-25 * t)
        droplets = sum(math.exp(-((t - hit) / 0.011) ** 2) for hit in (0.058, 0.094, 0.141, 0.207))
        samples.append(0.65 * pop + pressure * math.exp(-19 * t) +
                       sizzle * (0.55 * math.exp(-5.5 * t) + 0.25 * droplets))
    return samples


def gen_brood_hatch(frequency: float, duration: float, seed: int) -> list[float]:
    """Soft tissue movement with a short shell crack and falling pitch."""
    count = int(SAMPLE_RATE * duration)
    noise = _one_pole_lp(_make_noise(count, seed), 1850.0)
    samples = []
    for index, grain in enumerate(noise):
        t = index / SAMPLE_RATE
        pitch = math.sin(math.tau * frequency * (t - 0.9 * t * t))
        swell = _env_ad(t, 0.035, duration - 0.035)
        crack = math.exp(-((t - 0.075) / 0.018) ** 2)
        samples.append(pitch * swell * 0.42 + grain * (0.58 * crack + 0.23 * swell))
    return samples


def gen_ridge_pistols() -> list[float]:
    count = int(0.24 * SAMPLE_RATE)
    noise = _one_pole_hp(_make_noise(count, 4829), 900.0)
    samples = []
    for index, grain in enumerate(noise):
        time = index / SAMPLE_RATE
        sound = 0.0
        for onset in (0.0, 0.038):
            pulse = time - onset
            body = math.sin(math.tau * (260.0 * pulse - 390.0 * pulse * pulse))
            sound += (0.65 * grain + 0.35 * body) * _env_ad(pulse, 0.001, 0.075)
        samples.append(_soft_clip(sound, 1.6))
    return samples


def gen_ridge_charge_throw() -> list[float]:
    samples = []
    for index, grain in enumerate(_make_noise(int(0.23 * SAMPLE_RATE), 1055)):
        time = index / SAMPLE_RATE
        flick = _env_ad(time, 0.003, 0.033)
        swish = _env_ad(time - 0.025, 0.036, 0.13)
        samples.append(grain * (0.55 * flick + 0.28 * swish) + math.sin(math.tau * 920.0 * time) * flick * 0.21)
    return _one_pole_hp(samples, 240.0)


def gen_ridge_charge_impact() -> list[float]:
    count = int(0.45 * SAMPLE_RATE)
    noise = _one_pole_lp(_make_noise(count, 1081), 1400.0)
    samples = []
    for index, grain in enumerate(noise):
        time = index / SAMPLE_RATE
        crack = _env_ad(time, 0.002, 0.095)
        thump = math.sin(math.tau * (104.0 * time - 63.0 * time * time))
        samples.append(_soft_clip(grain * crack * 1.1 + thump * _env_ad(time, 0.009, 0.38) * 0.72))
    return samples


def gen_gnarl_tech_ready(hatchling_pool: bool) -> list[float]:
    length = 0.58 if hatchling_pool else 0.72
    pulse_starts = (0.0, 0.13, 0.22, 0.31) if hatchling_pool else (0.0, 0.17, 0.40)
    cutoff = 820.0 if hatchling_pool else 480.0
    rng_seed = 8751 if hatchling_pool else 8752
    noise = _one_pole_lp(_make_noise(int(length * SAMPLE_RATE), rng_seed), cutoff)
    samples = []
    for index, grain in enumerate(noise):
        time = index / SAMPLE_RATE
        sound = 0.0
        for count, onset in enumerate(pulse_starts):
            pulse = time - onset
            pitch = 140.0 + count * 47.0 if hatchling_pool else 85.0 + count * 15.0
            chamber = math.sin(math.tau * (pitch * pulse - 130.0 * pulse * pulse))
            sound += (0.57 * chamber + 0.55 * grain) * _env_ad(pulse, 0.024, 0.22)
        samples.append(_soft_clip(sound, 1.3))
    return samples


def gen_concord_resonance(notes: tuple[float, ...], sweep: float) -> list[float]:
    """Layer clean resonances with staggered attacks."""
    duration = 0.55 + 0.075 * (len(notes) - 1)
    samples = []
    for index in range(int(duration * SAMPLE_RATE)):
        time = index / SAMPLE_RATE
        sound = 0.0
        for layer, frequency in enumerate(notes):
            pulse = time - layer * 0.075
            phase = math.tau * frequency * (pulse + sweep * pulse * pulse)
            resonance = math.sin(phase) + 0.24 * math.sin(phase * 2.003)
            sound += resonance * _env_ad(pulse, 0.065, 0.48) / len(notes)
        samples.append(sound)
    return samples


def gen_canticle_storm() -> list[float]:
    """A six-second electrical storm with a distinct opening strike and fading crackle."""
    rng = random.Random(587)
    samples = []
    low_noise = 0.0
    for index in range(6 * SAMPLE_RATE):
        time = index / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        low_noise = low_noise * 0.88 + noise * 0.12
        wind_down = min(1.0, (6.0 - time) / 0.7)
        strike = math.exp(-10.0 * time)
        crackle = math.exp(-29.0 * ((time + 0.08) % 0.43))
        hum = math.sin(math.tau * (84.0 * time + 3.0 * math.sin(time * 1.2)))
        samples.append(wind_down * (hum * (0.10 + 0.21 * strike) + low_noise * (0.52 + 0.8 * strike) + noise * crackle * 0.22))
    return samples


def gen_rupture_bile(impact: bool, light: bool = False) -> list[float]:
    """A pressurized wet launch or a short bubbling acid impact."""
    duration = 0.32 if light else (0.65 if impact else 0.49)
    rng = random.Random(371 if impact else (372 if light else 373))
    fluid = 0.0
    samples = []
    for index in range(int(duration * SAMPLE_RATE)):
        time = index / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        fluid = fluid * 0.83 + noise * 0.17
        tone = math.sin(math.tau * (130.0 * time + (-90.0 if impact else 120.0) * time * time))
        envelope = _env_ad(time, 0.012, duration - 0.012)
        samples.append(envelope * (0.35 * tone + fluid * 1.2 + noise * (0.22 if impact else 0.08)))
    return samples


def gen_spine_line() -> list[float]:
    """Five rising chitin strikes with a low bed of shifting soil."""
    rng = random.Random(613)
    samples = []
    earth = 0.0
    for index in range(int(0.52 * SAMPLE_RATE)):
        time = index / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        earth = 0.90 * earth + 0.10 * noise
        strike = 0.0
        for number in range(5):
            phase = time - 0.038 * number
            if 0.0 <= phase < 0.2:
                strike += math.exp(-24.0 * phase) * (noise * 0.25 + math.sin(math.tau * (82 + 12 * number) * phase) * 0.4)
        samples.append((strike + earth * 0.35) * min(1.0, (0.52 - time) * 8.0))
    return samples


def gen_brood_air(kind: str) -> list[float]:
    """Layer chitin clicks and a resonant air pulse for flying Brood weapons."""
    duration, frequency, clicks, seed = {
        "corrosion_spore": (0.29, 210.0, 2, 491),
        "corrosion_spray": (0.48, 128.0, 5, 492),
        "broodling_launch": (0.54, 103.0, 2, 493),
        "locust_launch": (0.61, 174.0, 7, 494),
    }[kind]
    rng = random.Random(seed)
    samples = []
    resonance = 0.0
    for index in range(int(duration * SAMPLE_RATE)):
        time = index / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        resonance = resonance * 0.85 + noise * 0.15
        pulse = sum(math.exp(-33.0 * (time - 0.041 * onset)) for onset in range(clicks) if time >= 0.041 * onset)
        sweep = math.sin(math.tau * (frequency * time - 38.0 * time * time + 0.3 * math.sin(time * 39.0)))
        samples.append(_env_ad(time, 0.008, duration - 0.008) * (0.34 * sweep + pulse * (0.28 * noise + 0.36 * resonance)))
    return samples


def gen_workshop_cue(cue: str) -> list[float]:
    duration, pulses, frequency, color, seed = {
        "workshop_flame": (0.58, 5, 71.0, 850.0, 561),
        "sentinel_missile": (0.72, 1, 142.0, 4400.0, 562),
        "vortex_missile": (0.34, 1, 390.0, 3100.0, 563),
        "atlas_airburst": (0.49, 4, 216.0, 2850.0, 564),
        "atlas_precision": (0.59, 1, 86.0, 1700.0, 565),
        "harrier_rockets": (0.44, 2, 202.0, 3800.0, 566),
        "sky_airburst": (0.40, 2, 315.0, 5100.0, 567),
        "sky_defender_cannon": (0.68, 1, 119.0, 1850.0, 568),
        "bastion_railgun": (0.21, 1, 380.0, 3450.0, 569),
        "dreadnought_laser": (0.19, 1, 710.0, 1250.0, 570),
        "fortified_hub_cannon": (0.58, 2, 95.0, 1530.0, 571),
    }[cue]
    count = int(duration * SAMPLE_RATE)
    noise = _one_pole_lp(_make_noise(count, seed), color)
    samples = []
    for index, hiss in enumerate(noise):
        time = index / SAMPLE_RATE
        attack = 0.025 if cue == "workshop_flame" else 0.004
        pulse = sum(_env_ad(time - offset * 0.038, attack, duration * 0.53, 2.6) for offset in range(pulses))
        low = math.sin(math.tau * frequency * time * (1.1 - 0.65 * time / duration))
        samples.append(pulse * (0.42 * low + 1.2 * hiss))
    return samples


def gen_specter_cue(cue: str) -> list[float]:
    """Use distinct transients for the rifle, lock, EMP, and strike."""
    duration, start, end, cutoff, seed = {
        "shade_rifle": (0.27, 250.0, 67.0, 2700.0, 531),
        "shade_snipe_lock": (0.58, 290.0, 810.0, 1700.0, 532),
        "shade_snipe_fire": (0.51, 380.0, 52.0, 3300.0, 533),
        "shade_emp_launch": (0.31, 510.0, 170.0, 3700.0, 534),
        "shade_emp_burst": (0.62, 960.0, 68.0, 1250.0, 535),
        "shade_strike_warning": (0.82, 380.0, 540.0, 860.0, 536),
        "shade_strike_blast": (1.65, 112.0, 31.0, 740.0, 537),
        "watchkeeper_jam_launch": (0.38, 325.0, 1120.0, 2350.0, 574),
        "systems_jammer_impact": (0.53, 1020.0, 208.0, 1950.0, 575),
        "watchkeeper_armor_launch": (0.31, 360.0, 105.0, 3170.0, 576),
        "armor_breaker_impact": (0.81, 184.0, 45.0, 910.0, 577),
        "bastion_deploy": (0.49, 510.0, 125.0, 1640.0, 578),
        "dreadnought_beam": (1.28, 115.0, 940.0, 1480.0, 579),
        "dreadnought_beam_hit": (0.95, 282.0, 51.0, 1740.0, 580),
        "dreadnought_jump": (0.94, 84.0, 810.0, 1120.0, 581),
        "dreadnought_arrival": (0.78, 810.0, 65.0, 1520.0, 582),
        "sunseer_pulsar": (0.31, 1320.0, 515.0, 2750.0, 583),
        "sunseer_revelation": (0.62, 450.0, 1160.0, 1180.0, 584),
        "stasis_seed": (0.49, 345.0, 620.0, 1950.0, 585),
        "stasis_ward_detonate": (0.77, 1470.0, 155.0, 2450.0, 586),
    }[cue]
    count = int(duration * SAMPLE_RATE)
    noise = _one_pole_lp(_make_noise(count, seed), cutoff)
    phase = 0.0
    samples = []
    for index, hiss in enumerate(noise):
        time = index / SAMPLE_RATE
        progress = time / duration
        phase += math.tau * (start + (end - start) * progress) / SAMPLE_RATE
        tone = math.sin(phase) + 0.24 * math.sin(phase * 2.02)
        envelope = _env_ad(time, 0.008 if end > start else 0.002, duration * 0.96, 2.2)
        accent = 0.6 + 0.4 * math.cos(math.tau * progress * 3.0) if end > start else math.exp(-time * 17.0)
        samples.append(envelope * (tone * (0.5 + 0.35 * accent) + hiss * (0.25 + 1.25 * accent)))
    return samples


GENERATORS = {
    # Gunfire & Ranged Weapons
    "rifle_fire": (gen_rifle_fire, 0.90),
    "shade_rifle": (lambda: gen_specter_cue("shade_rifle"), 0.86),
    "shade_snipe_lock": (lambda: gen_specter_cue("shade_snipe_lock"), 0.70),
    "shade_snipe_fire": (lambda: gen_specter_cue("shade_snipe_fire"), 0.93),
    "shade_emp_launch": (lambda: gen_specter_cue("shade_emp_launch"), 0.82),
    "shade_emp_burst": (lambda: gen_specter_cue("shade_emp_burst"), 0.90),
    "shade_strike_warning": (lambda: gen_specter_cue("shade_strike_warning"), 0.76),
    "shade_strike_blast": (lambda: gen_specter_cue("shade_strike_blast"), 0.94),
    "workshop_flame": (lambda: gen_workshop_cue("workshop_flame"), 0.84),
    "harrier_rockets": (lambda: gen_workshop_cue("harrier_rockets"), 0.84),
    "sky_airburst": (lambda: gen_workshop_cue("sky_airburst"), 0.73),
    "sky_defender_cannon": (lambda: gen_workshop_cue("sky_defender_cannon"), 0.87),
    "bastion_railgun": (lambda: gen_workshop_cue("bastion_railgun"), 0.77),
    "dreadnought_laser": (lambda: gen_workshop_cue("dreadnought_laser"), 0.66),
    "fortified_hub_cannon": (lambda: gen_workshop_cue("fortified_hub_cannon"), 0.85),
    "watchkeeper_jam_launch": (lambda: gen_specter_cue("watchkeeper_jam_launch"), 0.80),
    "systems_jammer_impact": (lambda: gen_specter_cue("systems_jammer_impact"), 0.81),
    "watchkeeper_armor_launch": (lambda: gen_specter_cue("watchkeeper_armor_launch"), 0.82),
    "armor_breaker_impact": (lambda: gen_specter_cue("armor_breaker_impact"), 0.88),
    "bastion_deploy": (lambda: gen_specter_cue("bastion_deploy"), 0.77),
    "dreadnought_beam": (lambda: gen_specter_cue("dreadnought_beam"), 0.80),
    "dreadnought_beam_hit": (lambda: gen_specter_cue("dreadnought_beam_hit"), 0.92),
    "dreadnought_jump": (lambda: gen_specter_cue("dreadnought_jump"), 0.84),
    "dreadnought_arrival": (lambda: gen_specter_cue("dreadnought_arrival"), 0.82),
    "sunseer_pulsar": (lambda: gen_specter_cue("sunseer_pulsar"), 0.69),
    "sunseer_revelation": (lambda: gen_specter_cue("sunseer_revelation"), 0.77),
    "stasis_seed": (lambda: gen_specter_cue("stasis_seed"), 0.72),
    "stasis_ward_detonate": (lambda: gen_specter_cue("stasis_ward_detonate"), 0.84),
    "sentinel_missile": (lambda: gen_workshop_cue("sentinel_missile"), 0.92),
    "vortex_missile": (lambda: gen_workshop_cue("vortex_missile"), 0.83),
    "atlas_airburst": (lambda: gen_workshop_cue("atlas_airburst"), 0.86),
    "atlas_precision": (lambda: gen_workshop_cue("atlas_precision"), 0.90),
    "ridge_pistols": (gen_ridge_pistols, 0.85),
    "breach_charge": (gen_breach_charge, 0.92),
    "autocannon_fire": (gen_autocannon_fire, 0.92),
    "sentry_fire": (gen_sentry_fire, 0.38),
    "sentry_impact": (gen_sentry_impact, 0.17),
    "mortar_fire": (gen_mortar_fire, 0.95),
    "acid_spit": (gen_acid_spit, 0.85),
    "corrosive_lob": (gen_corrosive_lob, 0.88),
    "needler_fire": (gen_needler_fire, 0.84),
    "prism_beam": (gen_prism_beam, 0.86),
    "crown_lance": (gen_crown_lance, 0.89),
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
    "volatile_burst": (gen_volatile_burst, 0.88),
    "ridge_charge_throw": (gen_ridge_charge_throw, 0.75),
    "ridge_charge_impact": (gen_ridge_charge_impact, 0.88),
    "hatchling_pool_ready": (lambda: gen_gnarl_tech_ready(True), 0.80),
    "transit_start": (lambda: gen_concord_resonance((155, 234), 0.70), 0.55),
    "transit_ready": (lambda: gen_concord_resonance((310, 465, 620), -0.10), 0.60),
    "transit_mode_ready": (lambda: gen_concord_resonance((123, 246, 370, 494), 0.08), 0.62),
    "forge_relay_fire": (lambda: gen_concord_resonance((216, 465, 788), -0.83), 0.69),
    "bastion_phase_fire": (lambda: gen_concord_resonance((110, 146, 327), -0.51), 0.78),
    "bastion_barrier": (lambda: gen_concord_resonance((260, 392, 523), 0.36), 0.57),
    "rift_nova_launch": (lambda: gen_concord_resonance((140, 211, 610), 0.52), 0.67),
    "rift_nova_blast": (lambda: gen_concord_resonance((72, 197, 311), -0.63), 0.88),
    "mirage_glaive_fire": (lambda: gen_concord_resonance((220, 362, 937), -0.69), 0.70),
    "mirage_transfer": (lambda: gen_concord_resonance((170, 290, 551), 0.75), 0.60),
    "mirage_arrival": (lambda: gen_concord_resonance((220, 443, 662), -0.27), 0.58),
    "canticle_spark": (lambda: gen_concord_resonance((329, 493, 880), -0.46), 0.43),
    "scribe_feedback": (lambda: gen_concord_resonance((523, 261, 130), -0.65), 0.66),
    "canticle_storm": (gen_canticle_storm, 0.70),
    "duskblade_slash": (lambda: gen_concord_resonance((375, 506, 873), -0.95), 0.68),
    "archon_shockwave": (lambda: gen_concord_resonance((94, 141, 421, 666), -0.52), 0.77),
    "archon_warp": (lambda: gen_concord_resonance((114, 171, 228, 342), 0.73), 0.56),
    "archon_ready": (lambda: gen_concord_resonance((154, 231, 308, 462), -0.08), 0.57),
    "rupture_discharge": (lambda: gen_rupture_bile(False, light=True), 0.68),
    "rupture_launch": (lambda: gen_rupture_bile(False), 0.74),
    "rupture_impact": (lambda: gen_rupture_bile(True), 0.85),
    "spine_line": (gen_spine_line, 0.78),
    "corrosion_spore": (lambda: gen_brood_air("corrosion_spore"), 0.72),
    "corrosion_spray": (lambda: gen_brood_air("corrosion_spray"), 0.67),
    "broodling_launch": (lambda: gen_brood_air("broodling_launch"), 0.79),
    "locust_launch": (lambda: gen_brood_air("locust_launch"), 0.76),
    "bile_warren_ready": (lambda: gen_gnarl_tech_ready(False), 0.82),
    # Abilities & Mode Transforms
    "surge_activate": (gen_surge_activate, 0.85),
    "charge_activate": (gen_charge_activate, 0.85),
    "phase_step": (gen_phase_step, 0.86),
    "phase_barrier": (lambda: gen_support_pulse(315, 0.52), 0.60),
    "lattice_burst": (lambda: gen_support_pulse(180, 0.68), 0.70),
    "power_field_anchor": (lambda: gen_power_field(True), 0.78),
    "power_field_fold": (lambda: gen_power_field(False), 0.70),
    "siege_transform": (gen_siege_transform, 0.88),
    "silo_gate": (gen_silo_gate, 0.82),
    "vital_restore": (lambda: gen_support_pulse(360, 0.26), 0.50),
    "brood_inject": (lambda: gen_support_pulse(182, 0.39), 0.52),
    "brood_larva_ready": (lambda: gen_brood_hatch(230, 0.18, 241), 0.24),
    "brood_egg_morph": (lambda: gen_brood_hatch(145, 0.36, 242), 0.45),
    "brood_egg_hatch": (lambda: gen_brood_hatch(185, 0.30, 243), 0.51),
    "burrow_shift": (lambda: gen_support_pulse(118, 0.25), 0.48),
    "aegis_restore": (lambda: gen_support_pulse(530, 0.39), 0.56),
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
