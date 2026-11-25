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


def _svf_process(
    samples: list[float],
    cutoff_hz: list[float] | float,
    q_val: list[float] | float = 2.0,
    mode: str = "bp",
) -> list[float]:
    """Unconditionally stable Cytomic trapezoidal 2-pole State-Variable Filter (lp/bp/hp)."""
    n = len(samples)
    out = [0.0] * n
    ic1eq = 0.0
    ic2eq = 0.0
    max_fc = SAMPLE_RATE * 0.44
    is_fc_list = isinstance(cutoff_hz, list)
    is_q_list = isinstance(q_val, list)
    for i in range(n):
        fc = cutoff_hz[i] if is_fc_list else cutoff_hz
        fc = max(25.0, min(max_fc, fc))
        qv = q_val[i] if is_q_list else q_val
        qv = max(0.5, min(16.0, qv))
        g = math.tan(math.pi * fc / SAMPLE_RATE)
        k = 1.0 / qv
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v0 = samples[i]
        v3 = v0 - ic2eq
        v1 = a1 * ic1eq + a2 * v3
        v2 = ic2eq + a2 * ic1eq + a3 * v3
        ic1eq = 2.0 * v1 - ic1eq
        ic2eq = 2.0 * v2 - ic2eq
        if mode == "lp":
            out[i] = v2
        elif mode == "hp":
            out[i] = v0 - k * v1 - v2
        else:
            out[i] = v1 * (k ** 0.55) * 1.9
    return out


def _svf_bp4(
    samples: list[float],
    cutoff_hz: list[float] | float,
    q_val: list[float] | float = 4.0,
) -> list[float]:
    """Cascaded 4-pole (-12 dB/oct skirts) resonant bandpass — eliminates broadband static hiss."""
    stage1 = _svf_process(samples, cutoff_hz, q_val, "bp")
    q2 = [max(1.2, q * 0.75) for q in q_val] if isinstance(q_val, list) else max(1.2, q_val * 0.75)
    return _svf_process(stage1, cutoff_hz, q2, "bp")


def _make_pink_noise(n: int, seed: int) -> list[float]:
    """Warm 1/f pink noise for organic flesh, fluid, soil, and turbulent air excitation."""
    rng = random.Random(seed)
    out = [0.0] * n
    b0 = b1 = b2 = 0.0
    for i in range(n):
        w = rng.uniform(-1.0, 1.0)
        b0 = 0.99765 * b0 + w * 0.0990460
        b1 = 0.96300 * b1 + w * 0.2965164
        b2 = 0.57000 * b2 + w * 0.1052691
        out[i] = _clamp((b0 + b1 + b2 + w * 0.1848) * 0.35)
    return out


def _random_walk_curve(n: int, knots: int, seed: int, lo: float, hi: float) -> list[float]:
    """Smoothly interpolated non-periodic organic curve (avoids robotic sine LFOs)."""
    rng = random.Random(seed)
    pts = [rng.uniform(lo, hi) for _ in range(max(2, knots))]
    out = [0.0] * n
    span = len(pts) - 1
    for i in range(n):
        pos = (i / max(1, n - 1)) * span
        idx = min(span - 1, int(pos))
        frac = pos - idx
        smooth = frac * frac * (3.0 - 2.0 * frac)
        out[i] = pts[idx] + (pts[idx + 1] - pts[idx]) * smooth
    return out


def _sticky_impulses(
    n: int,
    seed: int,
    min_gap_ms: float = 2.2,
    max_gap_ms: float = 11.0,
    decay_ms: float = 1.4,
) -> list[float]:
    """Irregular sticky cavitation / filament-snap / chitin-crackle impulse train."""
    rng = random.Random(seed)
    out = [0.0] * n
    idx = rng.randint(0, max(1, int(0.004 * SAMPLE_RATE)))
    decay_samples = max(1.0, decay_ms * 0.001 * SAMPLE_RATE)
    while idx < n:
        amp = rng.uniform(0.35, 1.0) * (1.0 if rng.random() < 0.55 else -0.85)
        span = min(n - idx, int(decay_samples * 4.5) + 2)
        for k in range(span):
            out[idx + k] += amp * math.exp(-k / decay_samples)
        gap = rng.uniform(min_gap_ms, max_gap_ms) * 0.001 * SAMPLE_RATE
        idx += max(2, int(gap))
    return out


def _wet_squelch_layer(
    n: int,
    seed: int,
    t_start: float,
    dur: float,
    f1_lo: float = 280.0,
    f1_hi: float = 1150.0,
    bubble_count: int = 12,
) -> list[float]:
    """Juicy Gnarl Brood wet squelch: gapped sticky globule bursts + 4-pole liquid formants + Minnaert bubbles."""
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 11)
    snaps = _sticky_impulses(n, seed + 23, 3.0, 12.5, 1.8)

    glob_gate = [0.04] * n
    num_globs = max(3, int(dur * 34.0))
    for g_idx in range(num_globs):
        gt = t_start + (g_idx / num_globs) * dur * 0.88 + rng.uniform(-0.004, 0.006)
        gdur = rng.uniform(0.014, 0.036)
        gamp = rng.uniform(0.55, 1.0) * (1.0 - 0.35 * (g_idx / num_globs))
        i0 = max(0, int(gt * SAMPLE_RATE))
        i1 = min(n, int((gt + gdur) * SAMPLE_RATE))
        for i in range(i0, i1):
            u = (i - i0) / max(1, i1 - i0)
            glob_gate[i] = max(glob_gate[i], (math.sin(math.pi * u) ** 1.3) * gamp)

    raw = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE - t_start
        if 0.0 <= t <= dur:
            raw[i] = (snaps[i] * 0.92 + pink[i] * 0.36) * glob_gate[i]

    knots = max(6, int(dur * 48.0))
    f1_curve = _random_walk_curve(n, knots, seed + 37, f1_lo, f1_hi)
    f2_curve = [min(6200.0, f * rng_mult) for f, rng_mult in zip(
        f1_curve, _random_walk_curve(n, knots, seed + 53, 1.95, 2.65)
    )]
    q1_curve = _random_walk_curve(n, max(4, knots // 2), seed + 71, 5.5, 9.5)
    q2_curve = _random_walk_curve(n, max(4, knots // 2), seed + 89, 4.5, 8.0)

    band1 = _svf_bp4(raw, f1_curve, q1_curve)
    band2 = _svf_bp4(raw, f2_curve, q2_curve)

    bubbles = [0.0] * n
    for _ in range(bubble_count):
        bt = t_start + (rng.random() ** 1.15) * max(0.01, dur * 0.90)
        bdur = rng.uniform(0.0048, 0.0125)
        bf0 = rng.uniform(320.0, 1380.0)
        chirp = rng.uniform(0.45, 0.95)
        bamp = rng.uniform(0.22, 0.48)
        i0 = max(0, int(bt * SAMPLE_RATE))
        i1 = min(n, int((bt + bdur) * SAMPLE_RATE))
        ph = 0.0
        for i in range(i0, i1):
            dt = (i - i0) / SAMPLE_RATE
            u = dt / bdur
            f_inst = bf0 * (1.0 + chirp * (u ** 1.8))
            ph += 2.0 * math.pi * f_inst / SAMPLE_RATE
            b_env = math.sin(math.pi * u) * math.exp(-u * 1.9)
            bubbles[i] += math.sin(ph) * b_env * bamp

    return [band1[i] * 1.15 + band2[i] * 0.82 + bubbles[i] for i in range(n)]


def _thorn_whiz_layer(
    n: int,
    seed: int,
    t_onset: float,
    dur: float,
    f_hi: float = 3400.0,
    f_lo: float = 480.0,
    pass_frac: float = 0.56,
    spin_hz: float = 28.0,
    sharpness: float = 7.0,
) -> list[float]:
    """Sleek aerodynamic thorn/spine whizzing past: Doppler air-whoosh + high-Q vortex edge whistle (zero synth sine)."""
    pink = _make_pink_noise(n, seed + 5)
    white = _make_noise(n, seed + 17)
    air_edge = [0.0] * n
    air_whoosh = [0.0] * n
    fc_edge = [1400.0] * n
    fc_whoosh = [900.0] * n
    q_edge = [9.5] * n

    for i in range(n):
        t = i / SAMPLE_RATE - t_onset
        if t < 0.0 or t > dur:
            continue
        u = t / max(1e-4, dur)
        s = (u - pass_frac) * sharpness
        doppler = 0.5 * (1.0 - s / math.sqrt(1.0 + s * s))
        f_cur = f_lo + (f_hi - f_lo) * doppler
        fc_edge[i] = f_cur
        fc_whoosh[i] = max(260.0, f_cur * 0.58)
        q_edge[i] = 8.5 + 4.5 * math.exp(-0.5 * (s * 0.6) ** 2)

        shimmer = 0.88 + 0.12 * math.sin(2.0 * math.pi * spin_hz * t)
        pass_peak = 1.0 / ((1.0 + (s * 0.58) ** 2) ** 0.85)
        win = (math.sin(math.pi * min(1.0, u)) ** 0.55) * shimmer * pass_peak
        air_edge[i] = (white[i] * 0.65 + pink[i] * 0.45) * win
        air_whoosh[i] = pink[i] * win

    whiz_edge = _svf_bp4(air_edge, fc_edge, q_edge)
    whiz_body = _svf_bp4(air_whoosh, fc_whoosh, 2.6)
    return [whiz_edge[i] * 3.4 + whiz_body[i] * 1.45 for i in range(n)]


def _chitin_snap_layer(n: int, t_hit: float, base_hz: float, seed: int, amp: float = 1.0) -> list[float]:
    """Crisp exoskeleton/bone crunch: staggered micro-fracture snaps through woody/chitin 4-pole modes."""
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 3)
    exc = [0.0] * n
    for sub_idx in range(3):
        sub_t = t_hit + sub_idx * rng.uniform(0.0035, 0.0065)
        sub_amp = amp * (1.0 if sub_idx == 0 else rng.uniform(0.45, 0.78))
        i0 = max(0, int(sub_t * SAMPLE_RATE))
        span = min(n - i0, int(0.016 * SAMPLE_RATE))
        for k in range(span):
            dt = k / SAMPLE_RATE
            exc[i0 + k] += pink[i0 + k] * math.exp(-dt * 260.0) * sub_amp * 2.2

    m1 = _svf_bp4(exc, base_hz, 4.6)
    m2 = _svf_bp4(exc, base_hz * 1.71, 5.4)
    m3 = _svf_bp4(exc, min(6800.0, base_hz * 2.63), 4.2)
    return [m1[i] * 1.05 + m2[i] * 0.90 + m3[i] * 0.65 for i in range(n)]


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


def gen_acid_spit(variant: int = 0) -> list[float]:
    """Caustic Spit (Bile Crawler / Locust / Spore Watch): wet gland squelch + barbed acid-spine whizzing past."""
    dur = 0.30 + 0.015 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 1050 + variant * 137

    squelch = _wet_squelch_layer(
        n, seed, 0.0, 0.055,
        f1_lo=330.0 + 35.0 * variant,
        f1_hi=1240.0 + 80.0 * variant,
        bubble_count=8 + variant,
    )
    valve_snap = _chitin_snap_layer(n, 0.003, 1140.0 + 110.0 * variant, seed + 41, amp=0.78)
    whiz_main = _thorn_whiz_layer(
        n, seed + 73,
        t_onset=0.036,
        dur=0.175,
        f_hi=3750.0 + 220.0 * (variant - 1),
        f_lo=520.0 + 40.0 * variant,
        pass_frac=0.58,
        spin_hz=30.0 + 5.0 * variant,
        sharpness=6.8,
    )
    whiz_second = _thorn_whiz_layer(
        n, seed + 109,
        t_onset=0.090,
        dur=0.150,
        f_hi=4050.0,
        f_lo=610.0,
        pass_frac=0.56,
        spin_hz=35.0,
        sharpness=7.2,
    ) if variant == 1 else [0.0] * n

    out = [0.0] * n
    for i in range(n):
        sample = squelch[i] * 1.08 + valve_snap[i] * 0.65 + whiz_main[i] * 1.52 + whiz_second[i] * 1.22
        out[i] = _soft_clip(sample, 1.75)
    return out


def gen_thorn_volley(variant: int = 0) -> list[float]:
    """Needle Volley / Venom Needles / Brood Talons (Blight Hurler / Needlewing / Brood Keeper): crisp chitin release + razor-sharp thorns whizzing by."""
    dur = 0.27 + 0.015 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 1520 + variant * 163

    # Snappy dorsal-groove chitin click + brief wet muscular contraction
    snap = _chitin_snap_layer(n, 0.001, 1420.0 + 130.0 * variant, seed, amp=0.92)
    sac_squeeze = _wet_squelch_layer(
        n, seed + 19, 0.0, 0.042,
        f1_lo=420.0,
        f1_hi=1480.0 + 90.0 * variant,
        bubble_count=6 + variant,
    )

    # Primary razor-sharp needle-thorn whizzing right past
    thorn1 = _thorn_whiz_layer(
        n, seed + 47,
        t_onset=0.022,
        dur=0.155,
        f_hi=4250.0 + 260.0 * variant,
        f_lo=640.0 + 45.0 * variant,
        pass_frac=0.56,
        spin_hz=34.0 + 6.0 * variant,
        sharpness=7.4,
    )
    # Rapid staggered second needle whizzing past ("fwhip-fwhip!")
    thorn2 = _thorn_whiz_layer(
        n, seed + 89,
        t_onset=0.068 + 0.008 * variant,
        dur=0.145,
        f_hi=4450.0 - 190.0 * variant,
        f_lo=580.0 + 35.0 * variant,
        pass_frac=0.55,
        spin_hz=39.0,
        sharpness=7.8,
    )

    out = [0.0] * n
    for i in range(n):
        sample = snap[i] * 0.78 + sac_squeeze[i] * 0.88 + thorn1[i] * 1.55 + thorn2[i] * 1.28
        out[i] = _soft_clip(sample, 1.75)
    return out


def gen_thorn_impale() -> list[float]:
    """Impaling Thorn (Thorn Watch): subterranean root-tentacle lash + heavy chitin spike impale."""
    dur = 0.34
    n = int(dur * SAMPLE_RATE)
    seed = 1790
    pink = _make_pink_noise(n, seed)

    # Shifting living-ground earth & muscular tentacle heave
    soil_exc = [pink[i] * _env_ad(i / SAMPLE_RATE, 0.006, 0.14, 1.8) for i in range(n)]
    soil = _svf_process(soil_exc, _random_walk_curve(n, 6, seed + 11, 95.0, 260.0), 2.3, "lp")
    lash_whiz = _thorn_whiz_layer(
        n, seed + 29,
        t_onset=0.018,
        dur=0.145,
        f_hi=2850.0,
        f_lo=420.0,
        pass_frac=0.52,
        spin_hz=24.0,
        sharpness=6.5,
    )
    # Heavy impaling chitin spike strike + visceral wet squelch at t=0.115
    impale_crunch = _chitin_snap_layer(n, 0.112, 620.0, seed + 53, amp=1.35)
    impale_squelch = _wet_squelch_layer(n, seed + 79, 0.108, 0.185, f1_lo=260.0, f1_hi=1180.0, bubble_count=12)

    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        thud = soil[i] * (1.2 + 0.9 * _env_ad(t - 0.11, 0.001, 0.12, 2.2))
        out[i] = _soft_clip(thud + lash_whiz[i] * 1.30 + impale_crunch[i] * 1.10 + impale_squelch[i] * 1.15, 1.8)
    return out


def gen_corrosive_lob(variant: int = 0) -> list[float]:
    """Corrosive Lob (Blight Hurler): deep wet bile-sac heave & squelch + heavy spiny pod whizzing overhead."""
    dur = 0.36 + 0.02 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 1260 + variant * 149
    pink = _make_pink_noise(n, seed)

    heave_exc = [pink[i] * _env_ad(i / SAMPLE_RATE, 0.008, 0.15, 1.7) for i in range(n)]
    heave_body = _svf_process(heave_exc, _random_walk_curve(n, 6, seed + 7, 95.0, 240.0), 2.8, "lp")
    squelch = _wet_squelch_layer(
        n, seed + 31, 0.004, 0.165,
        f1_lo=220.0 + 25.0 * variant,
        f1_hi=820.0 + 60.0 * variant,
        bubble_count=12 + variant * 2,
    )
    sac_pop = _chitin_snap_layer(n, 0.022 + 0.004 * variant, 520.0 + 45.0 * variant, seed + 59, amp=0.8)
    pod_whiz = _thorn_whiz_layer(
        n, seed + 83,
        t_onset=0.042,
        dur=0.23,
        f_hi=2350.0 + 150.0 * variant,
        f_lo=440.0 + 40.0 * variant,
        pass_frac=0.54,
        spin_hz=22.0 + 4.0 * variant,
        sharpness=6.0,
    )

    out = [0.0] * n
    for i in range(n):
        sample = heave_body[i] * 1.35 + squelch[i] * 1.15 + sac_pop[i] * 0.55 + pod_whiz[i] * 1.10
        out[i] = _soft_clip(sample, 1.65)
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

def gen_claw_slash(variant: int = 0) -> list[float]:
    """Razor Claws / Needle Claws (Skitterling / Broodling): scythe-talon whip, flesh tear, chitin crunch & wet squelch."""
    dur = 0.21 + 0.01 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 2010 + variant * 113

    talon_whip = _thorn_whiz_layer(
        n, seed,
        t_onset=0.0,
        dur=0.082,
        f_hi=3900.0 + 240.0 * variant,
        f_lo=640.0,
        pass_frac=0.42,
        spin_hz=32.0,
        sharpness=8.2,
    )
    snap1 = _chitin_snap_layer(n, 0.018, 820.0 + 90.0 * variant, seed + 19, amp=1.15)
    snap2 = _chitin_snap_layer(n, 0.042 + 0.006 * variant, 1240.0 - 80.0 * variant, seed + 37, amp=0.92)
    squelch = _wet_squelch_layer(
        n, seed + 61, 0.016, 0.145,
        f1_lo=340.0 + 35.0 * variant,
        f1_hi=1380.0 + 90.0 * variant,
        bubble_count=10 + variant,
    )
    pink = _make_pink_noise(n, seed + 83)
    flesh_thud = _svf_process(pink, 185.0, 1.9, "lp")
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        thud_env = _env_ad(t - 0.016, 0.001, 0.090, 2.3)
        sample = (
            talon_whip[i] * 1.10
            + snap1[i] * 1.05
            + snap2[i] * 0.85
            + squelch[i] * 1.20
            + flesh_thud[i] * thud_env * 1.05
        )
        out[i] = _soft_clip(sample, 1.75)
    return out


def gen_mandible_bite(variant: int = 0) -> list[float]:
    """Mandibles (Forager): hard insectoid chitin jaw clack-crunch & wet organic chomp squelch."""
    dur = 0.21 + 0.01 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 2220 + variant * 127

    jaw1 = _chitin_snap_layer(n, 0.002, 620.0 + 55.0 * variant, seed, amp=0.95)
    jaw2 = _chitin_snap_layer(n, 0.038 + 0.006 * variant, 840.0 - 45.0 * variant, seed + 29, amp=1.08)
    chomp_squelch = _wet_squelch_layer(
        n, seed + 53, 0.012, 0.145,
        f1_lo=290.0 + 25.0 * variant,
        f1_hi=960.0 + 75.0 * variant,
        bubble_count=8 + variant,
    )
    pink = _make_pink_noise(n, seed + 79)
    bite_body = _svf_process(pink, 210.0, 2.1, "lp")
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        b_env = _env_ad(t - 0.035, 0.001, 0.085, 2.4)
        sample = jaw1[i] * 0.95 + jaw2[i] * 1.05 + chomp_squelch[i] * 0.95 + bite_body[i] * b_env * 0.9
        out[i] = _soft_clip(sample, 1.7)
    return out


def gen_chitin_cleave(variant: int = 0) -> list[float]:
    """Plate Splitter / Chitin Blades (Carapace Bulwark): massive scythe-tusk air cleave + heavy carapace crush & gore squelch."""
    dur = 0.29 + 0.015 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 2640 + variant * 139
    pink = _make_pink_noise(n, seed)

    # Massive dual scythe-tusk air slice
    tusk_whip = _thorn_whiz_layer(
        n, seed + 13,
        t_onset=0.0,
        dur=0.125,
        f_hi=2450.0 + 160.0 * variant,
        f_lo=340.0,
        pass_frac=0.45,
        spin_hz=20.0,
        sharpness=6.8,
    )
    crush1 = _chitin_snap_layer(n, 0.028, 430.0 + 40.0 * variant, seed + 31, amp=1.4)
    crush2 = _chitin_snap_layer(n, 0.056, 670.0 - 35.0 * variant, seed + 49, amp=1.15)
    gore_squelch = _wet_squelch_layer(
        n, seed + 71, 0.025, 0.21,
        f1_lo=220.0,
        f1_hi=1080.0 + 70.0 * variant,
        bubble_count=14 + variant * 2,
    )
    heavy_body = _svf_process(pink, 135.0, 2.3, "lp")
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        h_env = _env_ad(t - 0.024, 0.002, 0.165, 2.0)
        sample = (
            tusk_whip[i] * 1.25
            + crush1[i] * 1.15
            + crush2[i] * 0.95
            + gore_squelch[i] * 1.20
            + heavy_body[i] * h_env * 1.45
        )
        out[i] = _soft_clip(sample, 1.85)
    return out


def gen_bio_melee_hit(variant: int = 0) -> list[float]:
    """Biological melee impact (Gnarl Brood claws/mandibles/tusks): meaty flesh puncture & wet squelch (no metal clang)."""
    dur = 0.17 + 0.01 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 2460 + variant * 103
    pink = _make_pink_noise(n, seed)
    thud = _svf_process(pink, 165.0 + 18.0 * variant, 2.2, "lp")
    puncture = _chitin_snap_layer(n, 0.001, 540.0 + 60.0 * variant, seed + 17, amp=0.75)
    squelch = _wet_squelch_layer(
        n, seed + 43, 0.003, 0.125,
        f1_lo=320.0,
        f1_hi=1120.0 + 80.0 * variant,
        bubble_count=6 + variant,
    )
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        t_env = _env_ad(t, 0.001, 0.105, 2.3)
        out[i] = _soft_clip(thud[i] * t_env * 1.35 + puncture[i] * 0.70 + squelch[i] * 0.95, 1.65)
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


def gen_thorn_impact(variant: int = 0) -> list[float]:
    """Needle/thorn target hit: crisp barbed spine thwack into armor/flesh + brief wet ichor splat."""
    dur = 0.16 + 0.01 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 2980 + variant * 107
    pink = _make_pink_noise(n, seed)
    thwack = _chitin_snap_layer(n, 0.001, 920.0 + 85.0 * variant, seed + 19, amp=1.05)
    splat = _wet_squelch_layer(
        n, seed + 41, 0.002, 0.115,
        f1_lo=380.0,
        f1_hi=1480.0 + 90.0 * variant,
        bubble_count=7 + variant,
    )
    body = _svf_process(pink, 210.0, 2.0, "lp")
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        b_env = _env_ad(t, 0.001, 0.065, 2.4)
        out[i] = _soft_clip(thwack[i] * 0.95 + splat[i] * 1.05 + body[i] * b_env * 0.85, 1.7)
    return out


def gen_acid_splat(variant: int = 0) -> list[float]:
    """Acid projectile impact: sharp spine/glob thwack + juicy wet acid splatter & crackling fizz."""
    dur = 0.26 + 0.015 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 3110 + variant * 131
    pink = _make_pink_noise(n, seed + 13)
    fizz_imp = _sticky_impulses(n, seed + 29, 2.0, 8.5, 0.9)

    thwack = _chitin_snap_layer(n, 0.001, 640.0 + 65.0 * variant, seed + 41, amp=0.88)
    wet_slap = _wet_squelch_layer(
        n, seed + 59, 0.002, 0.195,
        f1_lo=310.0 + 30.0 * variant,
        f1_hi=1420.0 + 95.0 * variant,
        bubble_count=16 + variant * 2,
    )
    sizzle_fc = [4200.0 - 1500.0 * (i / max(1, n - 1)) for i in range(n)]
    sizzle = _svf_bp4(fizz_imp, sizzle_fc, 2.8)
    body = _svf_process(pink, 185.0, 2.0, "lp")
    bub_mod = _random_walk_curve(n, 16, seed + 77, 0.35, 1.0)

    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        siz_env = _env_ad(t - 0.008, 0.006, 0.22, 1.9)
        b_env = _env_ad(t, 0.001, 0.080, 2.3)
        sample = (
            thwack[i] * 0.72
            + wet_slap[i] * 1.35
            + sizzle[i] * siz_env * bub_mod[i] * 0.38
            + body[i] * b_env * 0.90
        )
        out[i] = _soft_clip(sample, 1.7)
    return out


def gen_acid_splash(variant: int = 0) -> list[float]:
    """Blight Hurler / Sporeburst splash impact: heavy wet liquid splash, squelching globs & acid fizz."""
    dur = 0.45 + 0.02 * variant
    n = int(dur * SAMPLE_RATE)
    seed = 3340 + variant * 157
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 19)
    fizz_imp = _sticky_impulses(n, seed + 31, 1.6, 7.2, 0.95)

    burst_exc = [pink[i] * _env_ad(i / SAMPLE_RATE, 0.002, 0.14, 2.0) for i in range(n)]
    wet_body = _svf_process(burst_exc, _random_walk_curve(n, 7, seed + 43, 105.0, 250.0), 2.5, "lp")
    slosh_burst = _svf_bp4(
        [pink[i] * _env_ad(i / SAMPLE_RATE, 0.002, 0.11, 1.9) for i in range(n)],
        _random_walk_curve(n, 8, seed + 53, 420.0, 1450.0),
        3.8,
    )
    squelch_main = _wet_squelch_layer(
        n, seed + 67, 0.002, 0.29,
        f1_lo=240.0 + 25.0 * variant,
        f1_hi=1350.0 + 80.0 * variant,
        bubble_count=26 + variant * 3,
    )
    squelch_tail = _wet_squelch_layer(
        n, seed + 89, 0.065, 0.34,
        f1_lo=310.0,
        f1_hi=1580.0,
        bubble_count=20 + variant * 2,
    )

    droplets = [0.0] * n
    for _ in range(24):
        dt_on = 0.012 + (rng.random() ** 1.25) * 0.34
        ddur = rng.uniform(0.005, 0.015)
        df0 = rng.uniform(360.0, 1850.0)
        damp = rng.uniform(0.18, 0.42)
        i0 = max(0, int(dt_on * SAMPLE_RATE))
        i1 = min(n, int((dt_on + ddur) * SAMPLE_RATE))
        ph = 0.0
        for i in range(i0, i1):
            u = (i - i0) / max(1, i1 - i0)
            f_d = df0 * (1.0 + 0.72 * (u ** 1.65))
            ph += 2.0 * math.pi * f_d / SAMPLE_RATE
            droplets[i] += math.sin(ph) * math.sin(math.pi * u) * math.exp(-u * 1.85) * damp

    sizzle_fc = [4600.0 - 1900.0 * (i / max(1, n - 1)) for i in range(n)]
    sizzle = _svf_bp4(fizz_imp, sizzle_fc, 2.9)
    fizz_mod = _random_walk_curve(n, 24, seed + 109, 0.30, 1.0)

    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        siz_env = _env_ad(t - 0.012, 0.015, 0.39, 1.75)
        sample = (
            wet_body[i] * 1.15
            + slosh_burst[i] * 0.95
            + squelch_main[i] * 1.30
            + squelch_tail[i] * 0.95
            + droplets[i] * 1.05
            + sizzle[i] * siz_env * fizz_mod[i] * 0.42
        )
        out[i] = _soft_clip(sample, 1.75)
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
    """Monster unit death: guttural creature vocal rasp + carapace crack + wet ichor squelch thud."""
    dur = 0.36
    n = int(dur * SAMPLE_RATE)
    seed = 5020
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 7)

    # Irregular biological glottal pulse train with jitter (no pure sine sweep)
    glottal = [0.0] * n
    idx = int(0.004 * SAMPLE_RATE)
    while idx < int(0.24 * SAMPLE_RATE):
        t = idx / SAMPLE_RATE
        f0 = 255.0 * math.exp(-t * 5.8) + 62.0
        period = SAMPLE_RATE / f0
        jitter = rng.uniform(0.84, 1.18)
        amp = rng.uniform(0.65, 1.0) * _env_ad(t, 0.004, 0.22, 1.5)
        pulse_w = max(3, int(period * 0.28))
        for k in range(min(pulse_w, n - idx)):
            u = k / pulse_w
            glottal[idx + k] += amp * math.sin(math.pi * u) * (1.0 - 0.45 * u)
        idx += max(4, int(period * jitter))

    rasp_src = [glottal[i] * 1.15 + pink[i] * _env_ad(i / SAMPLE_RATE, 0.005, 0.21, 1.6) * 0.48 for i in range(n)]
    f1 = [740.0 * math.exp(-(i / SAMPLE_RATE) * 5.2) + 210.0 for i in range(n)]
    f2 = [1720.0 * math.exp(-(i / SAMPLE_RATE) * 5.8) + 520.0 for i in range(n)]
    formant1 = _svf_bp4(rasp_src, f1, 4.8)
    formant2 = _svf_bp4(rasp_src, f2, 5.4)

    crack = _chitin_snap_layer(n, 0.026, 560.0, seed + 31, amp=1.05)
    squelch = _wet_squelch_layer(n, seed + 59, 0.018, 0.27, f1_lo=240.0, f1_hi=1060.0, bubble_count=14)
    body_lp = _svf_process(pink, 145.0, 2.2, "lp")

    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        thud_env = _env_ad(t - 0.032, 0.003, 0.24, 1.9)
        vocal = formant1[i] * 1.35 + formant2[i] * 0.92
        out[i] = _soft_clip(vocal + crack[i] * 0.85 + squelch[i] * 1.10 + body_lp[i] * thud_env * 1.25, 1.75)
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


def _add_snare_stroke(
    buf: list[float],
    t_onset: float,
    vel: float,
    pitch_scale: float,
    seed: int,
    kind: str = "primary",
) -> None:
    """Synthesize an acoustic snare drum stroke (primary stick, buzz rebound, or rimshot accent)."""
    n = len(buf)
    is_accent = kind == "accent"
    is_buzz = kind == "buzz"
    dur = 0.22 if is_accent else (0.068 if is_buzz else 0.105)
    i0 = max(0, int(t_onset * SAMPLE_RATE))
    i1 = min(n, int((t_onset + dur) * SAMPLE_RATE))
    m = i1 - i0
    if m <= 8:
        return

    rng = random.Random(seed)
    white = [rng.uniform(-1.0, 1.0) for _ in range(m)]
    snaps = _sticky_impulses(m, seed + 17, 0.40, 1.85, 0.65)
    wire_src = [white[k] * 0.65 + snaps[k] * 0.55 for k in range(m)]

    # Crisp snare-bed crack (1.4-2.9 kHz) + bright steel snare-wire sizzle (3.5-8.8 kHz)
    snare_crack = _svf_process(wire_src, 2050.0 * pitch_scale, 1.35, "bp")
    snare_sizzle = _one_pole_hp(_one_pole_lp(wire_src, 9100.0), 3500.0)
    stick_snap = _svf_process(white, 3350.0 * pitch_scale, 2.1, "bp")
    shell_wood = _svf_process(white, 540.0 * pitch_scale, 3.0, "bp")

    f0_base = (186.0 if is_accent else 198.0) * pitch_scale
    ph1 = rng.uniform(0.0, 0.25)
    ph2 = rng.uniform(0.0, 0.40)
    wire_decay = 0.145 if is_accent else (0.048 if is_buzz else 0.072)
    body_gain = (0.56 if is_accent else (0.09 if is_buzz else 0.25)) * vel

    for k in range(m):
        t = k / SAMPLE_RATE
        f0 = f0_base + (78.0 if is_accent else 44.0) * math.exp(-t * 115.0)
        ph1 += math.tau * f0 / SAMPLE_RATE
        ph2 += math.tau * (f0 * 1.593) / SAMPLE_RATE

        head_f1 = math.sin(ph1) * math.exp(-t * (28.0 if is_accent else 54.0))
        head_f2 = 0.48 * math.sin(ph2) * math.exp(-t * 68.0)
        wood = shell_wood[k] * _env_ad(t, 0.0005, 0.028 if is_accent else 0.016, 2.2) * (0.42 if is_accent else 0.20) * vel
        head = (head_f1 + head_f2) * body_gain + wood

        rim = 0.0
        if is_accent:
            rim = (
                math.sin(math.tau * 1240.0 * pitch_scale * t) * 0.26
                + math.sin(math.tau * 2420.0 * pitch_scale * t) * 0.16
            ) * math.exp(-t * 120.0) * vel

        stick_env = _env_ad(t, 0.00025, 0.0075 if is_accent else 0.0045, 2.5)
        stick = stick_snap[k] * stick_env * (1.25 if is_accent else (0.55 if is_buzz else 0.92)) * vel

        wire_env = _env_ad(t - 0.0006, 0.0018, wire_decay, 1.75)
        rattle_mod = 1.0 + 0.22 * head_f1
        wires = (snare_crack[k] * 0.95 + snare_sizzle[k] * 1.38) * wire_env * rattle_mod * vel

        buf[i0 + k] += _soft_clip(head + rim + stick + wires, 1.25) * 0.82


def _synth_splash_cymbal(n: int, t_hit: float, seed: int) -> list[float]:
    """Synthesize a bright, fast-blooming 9-inch B20 bronze splash cymbal at t_hit."""
    rng = random.Random(seed)
    out = [0.0] * n
    i0 = max(0, int(t_hit * SAMPLE_RATE))
    m = n - i0
    if m <= 16:
        return out

    base_plate_hz = 690.0
    mode_ratios = (
        1.58, 1.97, 2.41, 2.89, 3.38, 3.92, 4.49, 5.08,
        5.71, 6.37, 7.06, 7.79, 8.55, 9.34, 10.17, 11.03,
        11.91, 12.78, 13.52,
    )
    modes = []
    for r in mode_ratios:
        freq = base_plate_hz * r * rng.uniform(0.989, 1.011)
        if freq > SAMPLE_RATE * 0.435:
            continue
        hi_frac = max(0.0, (freq - 1050.0) / 8400.0)
        decay_rate = 2.95 + 2.35 * (hi_frac ** 1.15) + rng.uniform(-0.15, 0.15)
        amp = (0.65 + 0.55 * math.sin(math.pi * min(1.0, hi_frac * 1.15))) * rng.uniform(0.82, 1.16)
        ph0 = rng.uniform(0.0, math.tau)
        mod_ratio = rng.choice((1.4142, 1.7321, 2.2361, 2.6180))
        modes.append((freq, decay_rate, amp, ph0, mod_ratio))

    modal_sum = [0.0] * m
    phases = [mi[3] for mi in modes]
    mod_phases = [rng.uniform(0.0, math.tau) for _ in modes]

    for k in range(m):
        t = k / SAMPLE_RATE
        chirp = 1.0 + 0.018 * math.exp(-t * 42.0)
        fm_depth = 1.65 * math.exp(-t * 28.0) + 0.24 * math.exp(-t * 4.5)
        bloom = 1.0 - math.exp(-t / 0.0022)
        s = 0.0
        for idx, (freq, decay_rate, amp, _, mod_ratio) in enumerate(modes):
            f_inst = freq * chirp
            mod_phases[idx] += math.tau * min(SAMPLE_RATE * 0.44, f_inst * mod_ratio * 0.33) / SAMPLE_RATE
            fm = fm_depth * math.sin(mod_phases[idx])
            phases[idx] += math.tau * f_inst / SAMPLE_RATE
            s += math.sin(phases[idx] + fm) * amp * math.exp(-t * decay_rate)
        modal_sum[k] = s * bloom * 0.068

    white_a = [rng.uniform(-1.0, 1.0) for _ in range(m)]
    white_b = [rng.uniform(-1.0, 1.0) for _ in range(m)]
    lattice_freqs = (811.0, 1237.0, 1789.0, 2543.0, 3467.0, 4639.0)
    lat_ph = [rng.uniform(0.0, math.tau) for _ in lattice_freqs]
    bronze_wash = [0.0] * m
    for k in range(m):
        for j, lf in enumerate(lattice_freqs):
            lat_ph[j] += math.tau * lf / SAMPLE_RATE
        r1 = math.tanh(2.4 * math.sin(lat_ph[0])) * math.tanh(2.4 * math.sin(lat_ph[3]))
        r2 = math.tanh(2.4 * math.sin(lat_ph[1])) * math.tanh(2.4 * math.sin(lat_ph[4]))
        r3 = math.tanh(2.4 * math.sin(lat_ph[2])) * math.tanh(2.4 * math.sin(lat_ph[5]))
        ring = (r1 + r2 + r3) * 0.34
        bronze_wash[k] = white_a[k] * (0.58 + 0.42 * ring) + ring * white_b[k] * 0.55

    splash_mid = _svf_process(bronze_wash, 3450.0, 1.35, "bp")
    splash_brilliance = _svf_process(bronze_wash, 6100.0, 1.25, "bp")
    splash_air = _one_pole_hp(_one_pole_lp(white_b, 9800.0), 5800.0)
    edge_chick = _svf_bp4(white_a, 4300.0, 3.6)

    raw_cymbal = [0.0] * m
    for k in range(m):
        t = k / SAMPLE_RATE
        bloom = (1.0 - math.exp(-t / 0.0020)) * (0.68 + 0.52 * math.exp(-t * 24.0))
        env_mid = bloom * math.exp(-t * 3.10)
        env_bril = bloom * math.exp(-t * 3.35)
        env_air = bloom * math.exp(-t * 3.80)
        sway = 1.0 + 0.08 * math.sin(math.tau * 7.2 * t) * (1.0 - math.exp(-t * 6.0))
        shoulder = edge_chick[k] * _env_ad(t, 0.0004, 0.022, 2.1) * 0.85

        shimmer = (
            splash_mid[k] * env_mid * 0.42
            + splash_brilliance[k] * env_bril * 0.72
            + splash_air[k] * env_air * 0.68
        )
        raw_cymbal[k] = (modal_sum[k] + shimmer + shoulder) * sway

    clean_cymbal = _svf_process(raw_cymbal, 920.0, 0.80, "hp")
    for k in range(m):
        out[i0 + k] = clean_cymbal[k]
    return out


def gen_mission_end() -> list[float]:
    """Mission end percussion sting: crescendoing military snare drum roll into a bright bronze splash cymbal crash."""
    dur = 2.05
    n = int(dur * SAMPLE_RATE)
    snare = [0.0] * n
    rng = random.Random(7411)

    t_cur = 0.010
    t_roll_end = 0.735
    stroke_idx = 0
    while t_cur < t_roll_end:
        prog = (t_cur - 0.010) / (t_roll_end - 0.010)
        vel = 0.30 + 0.54 * (prog ** 1.40)
        is_left = (stroke_idx % 2 == 0)
        hand_pitch = (0.988 if is_left else 1.012) + rng.uniform(-0.006, 0.006)
        t_hit = max(0.0, t_cur + rng.uniform(-0.0012, 0.0012))

        dt_hand = 0.056 - 0.010 * prog
        _add_snare_stroke(snare, t_hit, vel, hand_pitch, 8100 + stroke_idx * 31, kind="primary")
        _add_snare_stroke(snare, t_hit + dt_hand * 0.34, vel * 0.58, hand_pitch * 1.016, 8109 + stroke_idx * 31, kind="buzz")
        _add_snare_stroke(snare, t_hit + dt_hand * 0.66, vel * 0.34, hand_pitch * 1.028, 8117 + stroke_idx * 31, kind="buzz")

        t_cur += dt_hand
        stroke_idx += 1

    # Crisp flam pickup -> decisive accented snare hit + bright splash cymbal crash
    t_climax = 0.786
    _add_snare_stroke(snare, t_climax - 0.024, 0.56, 0.986, 9501, kind="primary")
    _add_snare_stroke(snare, t_climax, 0.98, 1.00, 9523, kind="accent")

    splash = _synth_splash_cymbal(n, t_climax + 0.005, 9613)

    dry = [snare[i] * 0.80 + splash[i] * 1.12 for i in range(n)]

    room_lp = _one_pole_lp(dry, 6400.0)
    taps = ((int(0.0115 * SAMPLE_RATE), 0.10), (int(0.0193 * SAMPLE_RATE), 0.068), (int(0.0317 * SAMPLE_RATE), 0.042))
    mixed = [0.0] * n
    for i in range(n):
        refl = 0.0
        for delay_s, tap_gain in taps:
            if i >= delay_s:
                refl += room_lp[i - delay_s] * tap_gain
        tail_fade = 1.0
        t = i / SAMPLE_RATE
        if t > dur - 0.18:
            tail_fade = max(0.0, (dur - t) / 0.18) ** 1.35
        mixed[i] = _soft_clip((dry[i] + refl) * tail_fade, 1.08)

    return _one_pole_hp(mixed, 32.0)


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
    """Sporeburst rupture: swollen acid-sac pop + heavy wet liquid splash, squelch & corrosive fizz."""
    dur = 0.50
    n = int(dur * SAMPLE_RATE)
    seed = 9061
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 11)
    fizz_imp = _sticky_impulses(n, seed + 23, 1.5, 6.8, 0.95)

    # Swollen membrane rupture snap + low-end organic fluid pressure pop (no pure sine sweep)
    sac_snap = _chitin_snap_layer(n, 0.001, 490.0, seed + 37, amp=1.25)
    pop_exc = [pink[i] * _env_ad(i / SAMPLE_RATE, 0.0015, 0.13, 2.1) for i in range(n)]
    pop_body = _svf_process(pop_exc, _random_walk_curve(n, 6, seed + 49, 88.0, 220.0), 2.8, "lp")

    squelch_core = _wet_squelch_layer(n, seed + 61, 0.003, 0.28, f1_lo=230.0, f1_hi=1420.0, bubble_count=28)
    squelch_tail = _wet_squelch_layer(n, seed + 83, 0.075, 0.36, f1_lo=320.0, f1_hi=1650.0, bubble_count=22)

    droplets = [0.0] * n
    for _ in range(26):
        dt_on = 0.015 + (rng.random() ** 1.2) * 0.38
        ddur = rng.uniform(0.005, 0.014)
        df0 = rng.uniform(380.0, 1920.0)
        damp = rng.uniform(0.20, 0.46)
        i0 = max(0, int(dt_on * SAMPLE_RATE))
        i1 = min(n, int((dt_on + ddur) * SAMPLE_RATE))
        ph = 0.0
        for i in range(i0, i1):
            u = (i - i0) / max(1, i1 - i0)
            f_d = df0 * (1.0 + 0.75 * (u ** 1.65))
            ph += 2.0 * math.pi * f_d / SAMPLE_RATE
            droplets[i] += math.sin(ph) * math.sin(math.pi * u) * math.exp(-u * 1.85) * damp

    sizzle = _svf_bp4(fizz_imp, [4800.0 - 2100.0 * (i / max(1, n - 1)) for i in range(n)], 3.0)
    fizz_mod = _random_walk_curve(n, 22, seed + 97, 0.32, 1.0)

    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        siz_env = _env_ad(t - 0.008, 0.012, 0.42, 1.8)
        sample = (
            sac_snap[i] * 0.95
            + pop_body[i] * 1.35
            + squelch_core[i] * 1.35
            + squelch_tail[i] * 0.95
            + droplets[i] * 1.05
            + sizzle[i] * siz_env * fizz_mod[i] * 0.44
        )
        out[i] = _soft_clip(sample, 1.80)
    return out


def gen_brood_hatch(frequency: float, duration: float, seed: int) -> list[float]:
    """Larva / Egg morph & hatch: wet embryonic membrane stretch, viscous squelch, and crisp chitin shell crack."""
    n = int(SAMPLE_RATE * duration)
    pink = _make_pink_noise(n, seed)
    f_lo = max(210.0, frequency * 1.35)
    f_hi = min(1550.0, frequency * 5.8)
    squelch = _wet_squelch_layer(n, seed + 17, 0.004, duration * 0.88, f1_lo=f_lo, f1_hi=f_hi, bubble_count=max(6, int(duration * 36)))
    crack_t = min(duration * 0.34, 0.072)
    shell_crack = _chitin_snap_layer(n, crack_t, max(520.0, frequency * 3.8), seed + 43, amp=0.92)
    warm_sac = _svf_process(pink, max(120.0, frequency * 0.95), 2.1, "lp")
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        swell = _env_ad(t, 0.018, max(0.06, duration - 0.022), 1.65)
        out[i] = _soft_clip(squelch[i] * 1.15 + shell_crack[i] * 0.85 + warm_sac[i] * swell * 0.95, 1.65)
    return out


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
    """Hatchling Pool / Bile Warren complete: bubbling nutrient-fluid churn & pulsing heart-sac throbs."""
    dur = 0.58 if hatchling_pool else 0.72
    n = int(dur * SAMPLE_RATE)
    seed = 8751 if hatchling_pool else 8752
    pink = _make_pink_noise(n, seed)
    pulse_starts = (0.0, 0.13, 0.24, 0.36) if hatchling_pool else (0.0, 0.18, 0.40)

    throb_exc = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        env = sum(_env_ad(t - onset, 0.022, 0.21, 1.7) for onset in pulse_starts)
        throb_exc[i] = pink[i] * env

    fc_lo = 105.0 if hatchling_pool else 78.0
    fc_hi = 250.0 if hatchling_pool else 175.0
    heart_throb = _svf_process(throb_exc, _random_walk_curve(n, 8, seed + 13, fc_lo, fc_hi), 2.8, "lp")
    pool_squelch = _wet_squelch_layer(
        n, seed + 37, 0.01, dur * 0.90,
        f1_lo=260.0 if hatchling_pool else 195.0,
        f1_hi=1280.0 if hatchling_pool else 940.0,
        bubble_count=20 if hatchling_pool else 26,
    )
    sac_snap = _chitin_snap_layer(n, pulse_starts[-1] + 0.02, 640.0 if hatchling_pool else 460.0, seed + 71, amp=0.65)
    return [_soft_clip(heart_throb[i] * 1.25 + pool_squelch[i] * 1.15 + sac_snap[i] * 0.55, 1.65) for i in range(n)]


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
    """Rupture Crawler: pressurized wet bile-glob shot, mortar launch, or corrosive bile splash."""
    if light:
        # Primary ranged attack (rupture_discharge): wet bile-duct squelch + barbed acid-glob whizzing past
        dur = 0.32
        n = int(dur * SAMPLE_RATE)
        seed = 3720
        squelch = _wet_squelch_layer(n, seed, 0.0, 0.068, f1_lo=260.0, f1_hi=1080.0, bubble_count=10)
        duct_snap = _chitin_snap_layer(n, 0.005, 860.0, seed + 29, amp=0.75)
        glob_whiz = _thorn_whiz_layer(
            n, seed + 53,
            t_onset=0.042,
            dur=0.195,
            f_hi=2950.0,
            f_lo=450.0,
            pass_frac=0.56,
            spin_hz=25.0,
            sharpness=6.5,
        )
        return [_soft_clip(squelch[i] * 1.15 + duct_snap[i] * 0.65 + glob_whiz[i] * 1.45, 1.75) for i in range(n)]

    if not impact:
        # Artillery mortar launch (rupture_launch): deep gut heave + thick wet suction pop + rising bile-meteor whoosh
        dur = 0.48
        n = int(dur * SAMPLE_RATE)
        seed = 3730
        pink = _make_pink_noise(n, seed)
        heave = _svf_process([pink[i] * _env_ad(i / SAMPLE_RATE, 0.010, 0.22, 1.8) for i in range(n)], 145.0, 2.6, "lp")
        squelch = _wet_squelch_layer(n, seed + 19, 0.008, 0.24, f1_lo=210.0, f1_hi=960.0, bubble_count=18)
        pop_snap = _chitin_snap_layer(n, 0.032, 540.0, seed + 41, amp=0.95)
        arc_whiz = _thorn_whiz_layer(
            n, seed + 67,
            t_onset=0.055,
            dur=0.31,
            f_hi=2450.0,
            f_lo=520.0,
            pass_frac=0.50,
            spin_hz=19.0,
            sharpness=5.6,
        )
        return [_soft_clip(heave[i] * 1.35 + squelch[i] * 1.25 + pop_snap[i] * 0.70 + arc_whiz[i] * 1.20, 1.75) for i in range(n)]

    # Artillery corrosive bile impact (rupture_impact): massive overhead acid meteor splash & sizzle
    dur = 0.62
    n = int(dur * SAMPLE_RATE)
    seed = 3710
    rng = random.Random(seed)
    pink = _make_pink_noise(n, seed + 11)
    fizz_imp = _sticky_impulses(n, seed + 23, 1.5, 6.5, 1.0)

    whistle_in = _thorn_whiz_layer(
        n, seed + 31,
        t_onset=0.0,
        dur=0.095,
        f_hi=2600.0,
        f_lo=580.0,
        pass_frac=0.68,
        spin_hz=26.0,
        sharpness=7.2,
    )
    impact_lp = _svf_process(
        [pink[i] * _env_ad(i / SAMPLE_RATE - 0.055, 0.002, 0.20, 2.0) for i in range(n)],
        _random_walk_curve(n, 8, seed + 43, 85.0, 215.0),
        2.7,
        "lp",
    )
    squelch1 = _wet_squelch_layer(n, seed + 59, 0.052, 0.34, f1_lo=220.0, f1_hi=1420.0, bubble_count=30)
    squelch2 = _wet_squelch_layer(n, seed + 79, 0.140, 0.42, f1_lo=300.0, f1_hi=1680.0, bubble_count=24)

    droplets = [0.0] * n
    for _ in range(30):
        dt_on = 0.065 + (rng.random() ** 1.2) * 0.46
        ddur = rng.uniform(0.005, 0.015)
        df0 = rng.uniform(340.0, 1950.0)
        damp = rng.uniform(0.20, 0.46)
        i0 = max(0, int(dt_on * SAMPLE_RATE))
        i1 = min(n, int((dt_on + ddur) * SAMPLE_RATE))
        ph = 0.0
        for i in range(i0, i1):
            u = (i - i0) / max(1, i1 - i0)
            f_d = df0 * (1.0 + 0.74 * (u ** 1.65))
            ph += 2.0 * math.pi * f_d / SAMPLE_RATE
            droplets[i] += math.sin(ph) * math.sin(math.pi * u) * math.exp(-u * 1.85) * damp

    sizzle = _svf_bp4(fizz_imp, [4700.0 - 2000.0 * (i / max(1, n - 1)) for i in range(n)], 2.9)
    fizz_mod = _random_walk_curve(n, 26, seed + 97, 0.35, 1.0)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        siz_env = _env_ad(t - 0.058, 0.014, 0.50, 1.75)
        sample = (
            whistle_in[i] * 1.05
            + impact_lp[i] * 1.40
            + squelch1[i] * 1.35
            + squelch2[i] * 0.95
            + droplets[i] * 1.05
            + sizzle[i] * siz_env * fizz_mod[i] * 0.44
        )
        out[i] = _soft_clip(sample, 1.80)
    return out


def gen_spine_line() -> list[float]:
    """Spine Ambusher: rumbling earth fissure + 5 staggered subterranean chitin spines erupting & whizzing."""
    dur = 0.52
    n = int(dur * SAMPLE_RATE)
    seed = 6130
    pink = _make_pink_noise(n, seed)
    gravel_imp = _sticky_impulses(n, seed + 11, 2.0, 7.5, 1.3)

    # Shifting soil & gravel rumble along the burrow line
    soil_env = [math.sin(math.pi * min(1.0, (i / SAMPLE_RATE) / 0.36)) ** 0.7 if (i / SAMPLE_RATE) < 0.36 else math.exp(-((i / SAMPLE_RATE) - 0.36) * 14.0) for i in range(n)]
    earth_lp = _svf_process([pink[i] * soil_env[i] for i in range(n)], _random_walk_curve(n, 8, seed + 19, 85.0, 210.0), 2.3, "lp")
    gravel_mid = _svf_bp4([gravel_imp[i] * soil_env[i] for i in range(n)], _random_walk_curve(n, 10, seed + 29, 480.0, 1350.0), 3.4)

    spines = [0.0] * n
    for idx_s in range(5):
        onset = 0.008 + idx_s * 0.048
        snap = _chitin_snap_layer(n, onset, 680.0 + idx_s * 115.0, seed + 41 + idx_s * 17, amp=1.05)
        whiz = _thorn_whiz_layer(
            n, seed + 131 + idx_s * 23,
            t_onset=onset + 0.006,
            dur=0.115,
            f_hi=3350.0 + idx_s * 180.0,
            f_lo=520.0 + idx_s * 35.0,
            pass_frac=0.48,
            spin_hz=30.0 + idx_s * 3.0,
            sharpness=7.5,
        )
        for i in range(n):
            spines[i] += snap[i] * 0.88 + whiz[i] * 0.92

    squelch = _wet_squelch_layer(n, seed + 271, 0.015, 0.34, f1_lo=280.0, f1_hi=1220.0, bubble_count=14)
    return [_soft_clip(earth_lp[i] * 1.15 + gravel_mid[i] * 0.55 + spines[i] + squelch[i] * 0.78, 1.80) for i in range(n)]


def gen_brood_air(kind: str) -> list[float]:
    """Biological flying Gnarl Brood weapons: Corrosion Spore, Caustic Spray, Broodling Launch, and Locust Wave."""
    if kind == "corrosion_spore":
        dur = 0.30
        n = int(dur * SAMPLE_RATE)
        seed = 4910
        squelch = _wet_squelch_layer(n, seed, 0.0, 0.065, f1_lo=310.0, f1_hi=1280.0, bubble_count=9)
        snap = _chitin_snap_layer(n, 0.003, 980.0, seed + 17, amp=0.72)
        whiz = _thorn_whiz_layer(
            n, seed + 43,
            t_onset=0.038,
            dur=0.185,
            f_hi=3150.0,
            f_lo=490.0,
            pass_frac=0.56,
            spin_hz=27.0,
            sharpness=6.6,
        )
        return [_soft_clip(squelch[i] * 1.15 + snap[i] * 0.60 + whiz[i] * 1.45, 1.70) for i in range(n)]

    if kind == "corrosion_spray":
        dur = 0.48
        n = int(dur * SAMPLE_RATE)
        seed = 4920
        fizz_imp = _sticky_impulses(n, seed + 13, 1.6, 6.2, 1.0)
        stream_squelch = _wet_squelch_layer(n, seed + 29, 0.0, 0.43, f1_lo=280.0, f1_hi=1480.0, bubble_count=28)
        sizzle = _svf_bp4(fizz_imp, _random_walk_curve(n, 14, seed + 53, 2400.0, 4600.0), 3.1)
        mod = _random_walk_curve(n, 18, seed + 71, 0.45, 1.0)
        out = [0.0] * n
        for i in range(n):
            env = _env_ad(i / SAMPLE_RATE, 0.015, 0.44, 1.6)
            out[i] = _soft_clip(stream_squelch[i] * 1.35 + sizzle[i] * env * mod[i] * 0.52, 1.70)
        return out

    if kind == "broodling_launch":
        # Brood Siege Flyer: heavy carapace heave + twin broodling pods hurled downward + wet impact
        dur = 0.52
        n = int(dur * SAMPLE_RATE)
        seed = 4930
        pink = _make_pink_noise(n, seed)
        wing_heave = _svf_process([pink[i] * _env_ad(i / SAMPLE_RATE, 0.008, 0.22, 1.8) for i in range(n)], 135.0, 2.4, "lp")
        jaw_snap1 = _chitin_snap_layer(n, 0.006, 540.0, seed + 19, amp=1.10)
        jaw_snap2 = _chitin_snap_layer(n, 0.092, 620.0, seed + 37, amp=0.95)
        pod1 = _thorn_whiz_layer(
            n, seed + 59,
            t_onset=0.022,
            dur=0.195,
            f_hi=3250.0,
            f_lo=460.0,
            pass_frac=0.55,
            spin_hz=28.0,
            sharpness=6.8,
        )
        pod2 = _thorn_whiz_layer(
            n, seed + 83,
            t_onset=0.105,
            dur=0.195,
            f_hi=3480.0,
            f_lo=510.0,
            pass_frac=0.55,
            spin_hz=31.0,
            sharpness=7.0,
        )
        squelch = _wet_squelch_layer(n, seed + 107, 0.010, 0.36, f1_lo=250.0, f1_hi=1160.0, bubble_count=18)
        return [_soft_clip(wing_heave[i] * 1.20 + jaw_snap1[i] * 0.85 + jaw_snap2[i] * 0.75 + pod1[i] * 1.35 + pod2[i] * 1.25 + squelch[i] * 1.05, 1.80) for i in range(n)]

    # kind == "locust_launch": Mireweaver spawning locust wave — rapid wet egg-pod pops + chittering wing-flutter
    dur = 0.58
    n = int(dur * SAMPLE_RATE)
    seed = 4940
    pink = _make_pink_noise(n, seed)
    pops = [0.0] * n
    for p_idx in range(5):
        onset = 0.008 + p_idx * 0.068
        snap = _chitin_snap_layer(n, onset, 760.0 + p_idx * 70.0, seed + 17 + p_idx * 13, amp=0.82)
        whiz = _thorn_whiz_layer(
            n, seed + 101 + p_idx * 19,
            t_onset=onset + 0.012,
            dur=0.11,
            f_hi=3100.0 + p_idx * 120.0,
            f_lo=680.0,
            pass_frac=0.50,
            spin_hz=44.0,
            sharpness=6.4,
        )
        for i in range(n):
            pops[i] += snap[i] * 0.78 + whiz[i] * 0.82

    squelch = _wet_squelch_layer(n, seed + 223, 0.005, 0.48, f1_lo=290.0, f1_hi=1360.0, bubble_count=24)
    wing_buzz = _svf_bp4(pink, _random_walk_curve(n, 16, seed + 251, 950.0, 2100.0), 3.6)
    out = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        flutter = (0.55 + 0.45 * math.sin(2.0 * math.pi * 38.0 * t)) * _env_ad(t - 0.04, 0.04, 0.48, 1.5)
        out[i] = _soft_clip(pops[i] + squelch[i] * 1.15 + wing_buzz[i] * flutter * 0.48, 1.75)
    return out


def gen_brood_inject() -> list[float]:
    """Brood Keeper Spawn Larvae: wet ovipositor plunge, sticky clutch squelch & membrane pop (no synth chime)."""
    dur = 0.38
    n = int(dur * SAMPLE_RATE)
    seed = 7180
    pink = _make_pink_noise(n, seed)
    plunge_snap = _chitin_snap_layer(n, 0.008, 610.0, seed + 19, amp=0.78)
    squelch = _wet_squelch_layer(n, seed + 41, 0.004, 0.33, f1_lo=240.0, f1_hi=1280.0, bubble_count=20)
    sac_throb = _svf_process([pink[i] * _env_ad(i / SAMPLE_RATE, 0.015, 0.30, 1.7) for i in range(n)], 150.0, 2.3, "lp")
    return [_soft_clip(plunge_snap[i] * 0.72 + squelch[i] * 1.30 + sac_throb[i] * 1.05, 1.65) for i in range(n)]


def gen_burrow_shift() -> list[float]:
    """Gnarl Brood Burrow / Unburrow: rapid clawing earth dig, shifting gravel & carapace plate tuck (no synth chime)."""
    dur = 0.28
    n = int(dur * SAMPLE_RATE)
    seed = 7290
    pink = _make_pink_noise(n, seed)
    grit = _sticky_impulses(n, seed + 13, 1.8, 7.0, 1.2)
    earth = _svf_process([pink[i] * _env_ad(i / SAMPLE_RATE, 0.008, 0.24, 1.7) for i in range(n)], 185.0, 2.1, "lp")
    dig_scrape = _svf_bp4(
        [(grit[i] * 0.8 + pink[i] * 0.4) * _env_ad(i / SAMPLE_RATE, 0.006, 0.22, 1.6) for i in range(n)],
        _random_walk_curve(n, 9, seed + 31, 460.0, 1420.0),
        3.2,
    )
    claw1 = _chitin_snap_layer(n, 0.012, 720.0, seed + 53, amp=0.80)
    claw2 = _chitin_snap_layer(n, 0.068, 580.0, seed + 71, amp=0.75)
    claw3 = _chitin_snap_layer(n, 0.125, 490.0, seed + 89, amp=0.68)
    return [_soft_clip(earth[i] * 1.25 + dig_scrape[i] * 0.85 + (claw1[i] + claw2[i] + claw3[i]) * 0.78, 1.65) for i in range(n)]


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
    "acid_spit": (lambda: gen_acid_spit(0), 0.88),
    "acid_spit_2": (lambda: gen_acid_spit(1), 0.88),
    "acid_spit_3": (lambda: gen_acid_spit(2), 0.88),
    "thorn_volley": (lambda: gen_thorn_volley(0), 0.89),
    "thorn_volley_2": (lambda: gen_thorn_volley(1), 0.89),
    "thorn_volley_3": (lambda: gen_thorn_volley(2), 0.89),
    "thorn_impale": (gen_thorn_impale, 0.90),
    "corrosive_lob": (lambda: gen_corrosive_lob(0), 0.90),
    "corrosive_lob_2": (lambda: gen_corrosive_lob(1), 0.90),
    "corrosive_lob_3": (lambda: gen_corrosive_lob(2), 0.90),
    "needler_fire": (gen_needler_fire, 0.84),
    "prism_beam": (gen_prism_beam, 0.86),
    "crown_lance": (gen_crown_lance, 0.89),
    # Melee Strikes & Worker Weapons
    "claw_slash": (lambda: gen_claw_slash(0), 0.90),
    "claw_slash_2": (lambda: gen_claw_slash(1), 0.90),
    "claw_slash_3": (lambda: gen_claw_slash(2), 0.90),
    "mandible_bite": (lambda: gen_mandible_bite(0), 0.86),
    "mandible_bite_2": (lambda: gen_mandible_bite(1), 0.86),
    "mandible_bite_3": (lambda: gen_mandible_bite(2), 0.86),
    "chitin_cleave": (lambda: gen_chitin_cleave(0), 0.92),
    "chitin_cleave_2": (lambda: gen_chitin_cleave(1), 0.92),
    "chitin_cleave_3": (lambda: gen_chitin_cleave(2), 0.92),
    "bio_melee_hit": (lambda: gen_bio_melee_hit(0), 0.86),
    "bio_melee_hit_2": (lambda: gen_bio_melee_hit(1), 0.86),
    "bio_melee_hit_3": (lambda: gen_bio_melee_hit(2), 0.86),
    "light_blade_strike": (gen_light_blade_strike, 0.88),
    "arc_welder": (gen_arc_welder, 0.82),
    "mote_spark": (gen_mote_spark, 0.80),
    "melee_hit": (gen_melee_hit, 0.88),
    # Combat Impacts & Shields
    "shield_hit": (gen_shield_hit, 0.80),
    "explosion_splash": (gen_explosion_splash, 0.94),
    "thorn_impact": (lambda: gen_thorn_impact(0), 0.84),
    "thorn_impact_2": (lambda: gen_thorn_impact(1), 0.84),
    "thorn_impact_3": (lambda: gen_thorn_impact(2), 0.84),
    "acid_splat": (lambda: gen_acid_splat(0), 0.86),
    "acid_splat_2": (lambda: gen_acid_splat(1), 0.86),
    "acid_splat_3": (lambda: gen_acid_splat(2), 0.86),
    "acid_splash": (lambda: gen_acid_splash(0), 0.94),
    "acid_splash_2": (lambda: gen_acid_splash(1), 0.94),
    "acid_splash_3": (lambda: gen_acid_splash(2), 0.94),
    "volatile_burst": (gen_volatile_burst, 0.92),
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
    "rupture_discharge": (lambda: gen_rupture_bile(False, light=True), 0.85),
    "rupture_launch": (lambda: gen_rupture_bile(False), 0.86),
    "rupture_impact": (lambda: gen_rupture_bile(True), 0.94),
    "spine_line": (gen_spine_line, 0.88),
    "corrosion_spore": (lambda: gen_brood_air("corrosion_spore"), 0.85),
    "corrosion_spray": (lambda: gen_brood_air("corrosion_spray"), 0.82),
    "broodling_launch": (lambda: gen_brood_air("broodling_launch"), 0.90),
    "locust_launch": (lambda: gen_brood_air("locust_launch"), 0.86),
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
    "brood_inject": (gen_brood_inject, 0.68),
    "brood_larva_ready": (lambda: gen_brood_hatch(230, 0.18, 241), 0.34),
    "brood_egg_morph": (lambda: gen_brood_hatch(145, 0.36, 242), 0.55),
    "brood_egg_hatch": (lambda: gen_brood_hatch(185, 0.30, 243), 0.62),
    "burrow_shift": (gen_burrow_shift, 0.65),
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
    "mission_end": (gen_mission_end, 0.88),
}


def main() -> None:
    generated = []
    for name, (fn, gain) in GENERATORS.items():
        path = _save_wav(name, fn(), gain)
        generated.append(path)
    print(f"Generated {len(generated)} WAV sound effects in {SFX_DIR}")


if __name__ == "__main__":
    main()
