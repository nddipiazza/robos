'use strict';

/**
 * RobOS DAW Studio — Open-Source Metal Drum Instrument Manager & Transient Detector
 *
 * IMPORTANT: Never commit `.wav` or `.flac` sample libraries into git!
 * All open-source drum kits are downloaded on demand into the user's local
 * untracked store: `~/.local/share/robos/daw-studio/instruments/drumkits/<kit-id>/`
 * (or `$ROBOS_DAW_INSTRUMENTS_DIR/drumkits/<kit-id>/`).
 *
 * Curated 100% Metal-Viable Open-Source Multi-Velocity Drum Kit Catalog (15 Kits):
 *   1.  `muldjord-death-metal`     — Tama Superstar Death / Thrash Metal Kit (DrumGizmo / Sepulchrum, CC-BY-4.0)
 *   2.  `muldjord-triggered-metal` — Muldjord Extreme Metal Piezo-Triggered Double-Bass Kit (CC-BY-4.0 / CC0)
 *   3.  `wilkinson-modern-metal`   — Wilkinson Modern Metal Close-Mic + Sub-Kick Studio Kit (CC0-1.0)
 *   4.  `smdrums-heavy-metal`      — SMDrums Heavy Studio Metal Kit (CC0-1.0)
 *   5.  `smdrums-hybrid-metalcore` — SMDrums Hybrid Sample-Reinforced Metalcore Kit (CC0-1.0)
 *   6.  `salamander-prog-metal`    — Salamander Progressive & Heavy Metal Kit I (CC-BY-SA-3.0)
 *   7.  `salamander-thrash-metal`  — Salamander Thrash & Speed Metal Kit II (CC-BY-SA-3.0)
 *   8.  `avl-black-pearl-metal`    — AVL Black Pearl 5pc Heavy Metal Kit w/ Sabian AAX & Paiste 2002 (CC-BY-SA-4.0)
 *   9.  `avl-red-zeppelin-metal`   — AVL Red Zeppelin 26" Stoner / Doom / Heavy Metal Kit w/ Pork Pie Brass Snare (CC-BY-SA-4.0)
 *   10. `big-rusty-doom-sludge`    — Big Rusty 24" Undamped Doom & Sludge Metal Kit w/ 14"-22" Monster Toms (CC0-1.0)
 *   11. `big-rusty-djent-stack`    — Big Rusty Damped 24" Djent & Groove Metal Kit w/ 3-Layer Trash Stack (CC0-1.0)
 *   12. `drs-contact-metal`        — DRSKit Hard-Beater Contact Heavy Metal Kit (DrumGizmo, CC-BY-4.0)
 *   13. `sonor-power-metal`        — Sonor Force 3001 Power & Speed Metal Kit (Sam Greene, CC0-1.0)
 *   14. `frankensnare-brass-thrash`— Frankensnare 13" Brass & 14" Steel Rimshot Thrash / Hardcore Kit (CC0-1.0)
 *   15. `gm-rock-kit`              — Pearl DX 5pc Classic Heavy Metal / Hard Rock Studio Kit (Hydrogen, GPL-3.0)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const {
  scanDirectoryForPluginsAndSamples,
  buildCustomSampleKitFromDirectory,
  getCustomDirectorySampleKits,
} = require('./vst-directories');

const MULDJORD_BASE = 'https://raw.githubusercontent.com/sfzinstruments/DrumGizmo.MuldjordKit/master/DrumGizmo/MuldjordKit/Samples';
const WILKINSON_BASE = 'https://raw.githubusercontent.com/sfzinstruments/WilkinsonAudio.NakedDrums/master/Wilkinson%20Audio/Naked%20Drums/Samples';
const SMDRUMS_BASE = 'https://raw.githubusercontent.com/sfzinstruments/SMDrums/main/Samples';
const SALAMANDER_BASE = 'https://raw.githubusercontent.com/studiorack/salamander-drumkit/master/Samples';
const AVL_BASE = 'https://raw.githubusercontent.com/studiorack/avl-drumkits/main/Samples';
const BIG_RUSTY_BASE = 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.big-rusty-drums/main/Samples';
const DRS_BASE = 'https://raw.githubusercontent.com/sfzinstruments/DrumGizmo.DRSKit/master/DrumGizmo/DRSKit/Samples';
const SONOR_BASE = 'https://raw.githubusercontent.com/sfzinstruments/SamsSonor/master/Samples';
const FRANKEN_BASE = 'https://raw.githubusercontent.com/sfzinstruments/karoryfer.frankensnare/main/Samples';
const HYDROGEN_RAW_BASE = 'https://raw.githubusercontent.com/hydrogen-music/hydrogen/main/data/drumkits';

const OPEN_DRUMKIT_CATALOG = [
  // 1. Muldjord Death / Thrash Metal Kit
  {
    id: 'muldjord-death-metal',
    name: 'Muldjord Tama Superstar Death / Thrash Metal Kit',
    genreTag: 'DEATH / THRASH METAL',
    author: 'Lars Muldjord / DrumGizmo (Sepulchrum Sessions)',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://github.com/sfzinstruments/DrumGizmo.MuldjordKit',
    description: 'Recorded for Danish death/thrash band Sepulchrum on a Tama Superstar Hyper-Drive double-bass kit: Right & Left Kicks, Crack Snare, 4 Close Toms, 18" China, Dual Crashes, and Bell Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Tama Superstar Right Kick (Close)',
        layers: [
          { min: 0.0, max: 0.32, file: 'kick-r-soft.flac', url: `${MULDJORD_BASE}/KdrumR/6-KdrumR-KdrumR.flac` },
          { min: 0.32, max: 0.65, file: 'kick-r-med.flac', url: `${MULDJORD_BASE}/KdrumR/15-KdrumR-KdrumR.flac` },
          { min: 0.65, max: 0.86, file: 'kick-r-hard.flac', url: `${MULDJORD_BASE}/KdrumR/22-KdrumR-KdrumR.flac` },
          { min: 0.86, max: 1.0, file: 'kick-r-max.flac', url: `${MULDJORD_BASE}/KdrumR/27-KdrumR-KdrumR.flac` },
        ],
      },
      'kick-left': {
        label: 'Tama Double-Bass Left Kick (Close)',
        layers: [
          { min: 0.0, max: 0.4, file: 'kick-l-soft.flac', url: `${MULDJORD_BASE}/KdrumL/6-KdrumL-KdrumL.flac` },
          { min: 0.4, max: 0.78, file: 'kick-l-med.flac', url: `${MULDJORD_BASE}/KdrumL/15-KdrumL-KdrumL.flac` },
          { min: 0.78, max: 1.0, file: 'kick-l-max.flac', url: `${MULDJORD_BASE}/KdrumL/25-KdrumL-KdrumL.flac` },
        ],
      },
      snare: {
        label: 'Tama Death Metal Snare (Top Close)',
        layers: [
          { min: 0.0, max: 0.30, file: 'snare-soft.flac', url: `${MULDJORD_BASE}/Snare/12-Snare-Snare_top.flac` },
          { min: 0.30, max: 0.62, file: 'snare-med.flac', url: `${MULDJORD_BASE}/Snare/28-Snare-Snare_top.flac` },
          { min: 0.62, max: 0.85, file: 'snare-hard.flac', url: `${MULDJORD_BASE}/Snare/44-Snare-Snare_top.flac` },
          { min: 0.85, max: 1.0, file: 'snare-max.flac', url: `${MULDJORD_BASE}/Snare/56-Snare-Snare_top.flac` },
        ],
      },
      'snare-wires': {
        label: 'Tama Snare Wires (Bottom Close)',
        layers: [
          { min: 0.0, max: 0.55, file: 'snare-bot-med.flac', url: `${MULDJORD_BASE}/Snare/28-Snare-Snare_bottom.flac` },
          { min: 0.55, max: 1.0, file: 'snare-bot-max.flac', url: `${MULDJORD_BASE}/Snare/56-Snare-Snare_bottom.flac` },
        ],
      },
      'tom-rack': {
        label: 'Tama Hyper-Drive Tom 1 (High)',
        layers: [
          { min: 0.0, max: 0.45, file: 'tom1-soft.flac', url: `${MULDJORD_BASE}/Tom1/3-Tom1-Tom1.flac` },
          { min: 0.45, max: 0.8, file: 'tom1-med.flac', url: `${MULDJORD_BASE}/Tom1/6-Tom1-Tom1.flac` },
          { min: 0.8, max: 1.0, file: 'tom1-max.flac', url: `${MULDJORD_BASE}/Tom1/9-Tom1-Tom1.flac` },
        ],
      },
      'tom-mid': {
        label: 'Tama Hyper-Drive Tom 2 (Mid-High)',
        layers: [
          { min: 0.0, max: 0.45, file: 'tom2-soft.flac', url: `${MULDJORD_BASE}/Tom2/3-Tom2-Tom2.flac` },
          { min: 0.45, max: 0.8, file: 'tom2-med.flac', url: `${MULDJORD_BASE}/Tom2/7-Tom2-Tom2.flac` },
          { min: 0.8, max: 1.0, file: 'tom2-max.flac', url: `${MULDJORD_BASE}/Tom2/10-Tom2-Tom2.flac` },
        ],
      },
      'tom-mid-low': {
        label: 'Tama Hyper-Drive Tom 3 (Mid-Low)',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom3-med.flac', url: `${MULDJORD_BASE}/Tom3/5-Tom3-Tom3.flac` },
          { min: 0.5, max: 1.0, file: 'tom3-max.flac', url: `${MULDJORD_BASE}/Tom3/10-Tom3-Tom3.flac` },
        ],
      },
      'tom-floor': {
        label: 'Tama Hyper-Drive Floor Tom 4',
        layers: [
          { min: 0.0, max: 0.45, file: 'tom4-soft.flac', url: `${MULDJORD_BASE}/Tom4/4-Tom4-Tom4.flac` },
          { min: 0.45, max: 0.8, file: 'tom4-med.flac', url: `${MULDJORD_BASE}/Tom4/8-Tom4-Tom4.flac` },
          { min: 0.8, max: 1.0, file: 'tom4-max.flac', url: `${MULDJORD_BASE}/Tom4/11-Tom4-Tom4.flac` },
        ],
      },
      hihat: {
        label: 'Metal Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.45, file: 'hh-closed-soft.flac', url: `${MULDJORD_BASE}/HihatClosed/8-HihatClosed-Hihat.flac` },
          { min: 0.45, max: 0.8, file: 'hh-closed-med.flac', url: `${MULDJORD_BASE}/HihatClosed/16-HihatClosed-Hihat.flac` },
          { min: 0.8, max: 1.0, file: 'hh-closed-max.flac', url: `${MULDJORD_BASE}/HihatClosed/22-HihatClosed-Hihat.flac` },
        ],
      },
      'hihat-open': {
        label: 'Metal Barking Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-open-med.flac', url: `${MULDJORD_BASE}/HihatOpen/9-HihatOpen-Hihat.flac` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.flac', url: `${MULDJORD_BASE}/HihatOpen/18-HihatOpen-Hihat.flac` },
        ],
      },
      cymbal: {
        label: 'Right Heavy Crash Cymbal',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash-r-med.flac', url: `${MULDJORD_BASE}/CrashR/5-CrashR-OHR.flac` },
          { min: 0.5, max: 1.0, file: 'crash-r-max.flac', url: `${MULDJORD_BASE}/CrashR/10-CrashR-OHR.flac` },
        ],
      },
      'cymbal-china': {
        label: '18" Death/Thrash China Cymbal',
        layers: [
          { min: 0.0, max: 0.5, file: 'china-med.flac', url: `${MULDJORD_BASE}/China/5-China-OHL.flac` },
          { min: 0.5, max: 1.0, file: 'china-max.flac', url: `${MULDJORD_BASE}/China/10-China-OHL.flac` },
        ],
      },
      ride: {
        label: 'Heavy Metal Ride Bow',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-med.flac', url: `${MULDJORD_BASE}/RideR/5-RideR-RideR.flac` },
          { min: 0.5, max: 1.0, file: 'ride-max.flac', url: `${MULDJORD_BASE}/RideR/9-RideR-RideR.flac` },
        ],
      },
      'ride-bell': {
        label: 'Blast-Beat Piercing Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-bell-med.flac', url: `${MULDJORD_BASE}/RideRBell/4-RideRBell-RideR.flac` },
          { min: 0.5, max: 1.0, file: 'ride-bell-max.flac', url: `${MULDJORD_BASE}/RideRBell/8-RideRBell-RideR.flac` },
        ],
      },
    },
  },

  // 2. Muldjord Extreme Metal Piezo-Triggered Kit
  {
    id: 'muldjord-triggered-metal',
    name: 'Muldjord Extreme Metal Piezo-Triggered Double-Bass Kit',
    genreTag: 'TECH-DEATH / DEATHCORE TRIGGERED',
    author: 'DrumGizmo Muldjord Hardware Triggers + SMDrums Hybrid CC0',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://github.com/sfzinstruments/DrumGizmo.MuldjordKit',
    description: 'Hardware piezo kick trigger channels (Right & Left double-bass click for 240+ BPM blast beats) paired with razor-sharp triggered rimshot snare, 4 Tama Toms, China, and Bell Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Piezo Hardware Triggered Kick R (Click)',
        layers: [
          { min: 0.0, max: 0.4, file: 'trig-kick-r-soft.flac', url: `${MULDJORD_BASE}/KdrumR/10-KdrumR-Trigger.flac` },
          { min: 0.4, max: 0.75, file: 'trig-kick-r-med.flac', url: `${MULDJORD_BASE}/KdrumR/22-KdrumR-Trigger.flac` },
          { min: 0.75, max: 1.0, file: 'trig-kick-r-max.flac', url: `${MULDJORD_BASE}/KdrumR/27-KdrumR-Trigger.flac` },
        ],
      },
      'kick-left': {
        label: 'Piezo Hardware Triggered Kick L (Double-Bass)',
        layers: [
          { min: 0.0, max: 0.45, file: 'trig-kick-l-med.flac', url: `${MULDJORD_BASE}/KdrumL/12-KdrumL-Trigger.flac` },
          { min: 0.45, max: 1.0, file: 'trig-kick-l-max.flac', url: `${MULDJORD_BASE}/KdrumL/25-KdrumL-Trigger.flac` },
        ],
      },
      snare: {
        label: 'Extreme Blast Snare + Hybrid Crack',
        layers: [
          { min: 0.0, max: 0.4, file: 'trig-snare-med.flac', url: `${MULDJORD_BASE}/Snare/34-Snare-Snare_top.flac` },
          { min: 0.4, max: 0.78, file: 'trig-snare-hard.flac', url: `${MULDJORD_BASE}/Snare/48-Snare-Snare_top.flac` },
          { min: 0.78, max: 1.0, file: 'trig-snare-max.flac', url: `${MULDJORD_BASE}/Snare/56-Snare-Snare_top.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'Hybrid Sample-Reinforced Rimshot Bomb',
        layers: [
          { min: 0.0, max: 0.5, file: 'trig-rimshot-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD%20RimShot_Str_HyB1%20(Samples)/RR1/17_RimShot_Str_HyB1_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'trig-rimshot-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD%20RimShot_Str_HyB1%20(Samples)/RR1/32_RimShot_Str_HyB1_RR1.wav` },
        ],
      },
      'tom-rack': {
        label: 'Attack Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.flac', url: `${MULDJORD_BASE}/Tom1/6-Tom1-Tom1.flac` },
          { min: 0.5, max: 1.0, file: 'tom1-max.flac', url: `${MULDJORD_BASE}/Tom1/9-Tom1-Tom1.flac` },
        ],
      },
      'tom-mid': {
        label: 'Attack Mid Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.flac', url: `${MULDJORD_BASE}/Tom2/7-Tom2-Tom2.flac` },
          { min: 0.5, max: 1.0, file: 'tom2-max.flac', url: `${MULDJORD_BASE}/Tom2/10-Tom2-Tom2.flac` },
        ],
      },
      'tom-floor': {
        label: 'Attack Floor Tom 4',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom4-med.flac', url: `${MULDJORD_BASE}/Tom4/8-Tom4-Tom4.flac` },
          { min: 0.5, max: 1.0, file: 'tom4-max.flac', url: `${MULDJORD_BASE}/Tom4/11-Tom4-Tom4.flac` },
        ],
      },
      hihat: {
        label: 'Tight Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-closed-med.flac', url: `${MULDJORD_BASE}/HihatClosed/14-HihatClosed-Hihat.flac` },
          { min: 0.5, max: 1.0, file: 'hh-closed-max.flac', url: `${MULDJORD_BASE}/HihatClosed/22-HihatClosed-Hihat.flac` },
        ],
      },
      'hihat-open': {
        label: 'Open Hi-Hat',
        layers: [
          { min: 0.0, max: 1.0, file: 'hh-open-max.flac', url: `${MULDJORD_BASE}/HihatOpen/18-HihatOpen-Hihat.flac` },
        ],
      },
      cymbal: {
        label: 'Left & Right Crash Accent',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash-l-max.flac', url: `${MULDJORD_BASE}/CrashL/9-CrashL-OHL.flac` },
          { min: 0.5, max: 1.0, file: 'crash-r-max.flac', url: `${MULDJORD_BASE}/CrashR/10-CrashR-OHR.flac` },
        ],
      },
      'cymbal-china': {
        label: 'Breakdown China Accent',
        layers: [
          { min: 0.0, max: 0.5, file: 'china-med.flac', url: `${MULDJORD_BASE}/China/7-China-OHL.flac` },
          { min: 0.5, max: 1.0, file: 'china-max.flac', url: `${MULDJORD_BASE}/China/10-China-OHL.flac` },
        ],
      },
      'ride-bell': {
        label: 'Tech-Death Piercing Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-bell-med.flac', url: `${MULDJORD_BASE}/RideRBell/5-RideRBell-RideR.flac` },
          { min: 0.5, max: 1.0, file: 'ride-bell-max.flac', url: `${MULDJORD_BASE}/RideRBell/8-RideRBell-RideR.flac` },
        ],
      },
    },
  },

  // 3. Wilkinson Modern Metal Close-Mic + Sub-Kick Studio Kit
  {
    id: 'wilkinson-modern-metal',
    name: 'Wilkinson Modern Metal Close-Mic + Sub-Kick Kit',
    genreTag: 'MODERN METAL / PROG',
    author: 'Wilkinson Audio (Naked Drums Open Release)',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/WilkinsonAudio.NakedDrums',
    description: 'Modern metal direct close-mic studio shells: Inside Beater Kick, Dedicated Sub-Kick Low-End, Top Crack Snare + Rimshot, 5 Toms (Tom 1–5), Dual Wide Chinas, Crashes, and Close Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Inside Beater Kick (DI Kick In)',
        layers: [
          { min: 0.0, max: 0.35, file: 'kick-in-soft.flac', url: `${WILKINSON_BASE}/-Bottom_Black_D2_10_one-TEQT.flac` },
          { min: 0.35, max: 0.72, file: 'kick-in-med.flac', url: `${WILKINSON_BASE}/-Bottom_Black_D2_30_one-NLNF.flac` },
          { min: 0.72, max: 1.0, file: 'kick-in-max.flac', url: `${WILKINSON_BASE}/-Bottom_Black_D2_50_one-V4WI.flac` },
        ],
      },
      'kick-sub': {
        label: 'Dedicated Sub-Kick 50Hz Thump (DI Kick Sub)',
        layers: [
          { min: 0.0, max: 0.5, file: 'kick-sub-med.flac', url: `${WILKINSON_BASE}/-TopOne_Black_D2_20_one-PHDM.flac` },
          { min: 0.5, max: 1.0, file: 'kick-sub-max.flac', url: `${WILKINSON_BASE}/-TopOne_Black_D2_50_one-6FQE.flac` },
        ],
      },
      snare: {
        label: 'Modern Metal Snare Top (DI Snare 1)',
        layers: [
          { min: 0.0, max: 0.38, file: 'snare-top-soft.flac', url: `${WILKINSON_BASE}/-TopOne_Black_D2_20_one-9XTQ.flac` },
          { min: 0.38, max: 0.75, file: 'snare-top-med.flac', url: `${WILKINSON_BASE}/-TopOne_Black_D2_40_one-J3ZS.flac` },
          { min: 0.75, max: 1.0, file: 'snare-top-max.flac', url: `${WILKINSON_BASE}/-TopOne_Black_D2_50_one-TPAQ.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'Modern Metal Snare Rimshot Crack',
        layers: [
          { min: 0.0, max: 0.5, file: 'snare-rim-1.flac', url: `${WILKINSON_BASE}/TopOne_Black_D2_50_one-94P3.flac` },
          { min: 0.5, max: 1.0, file: 'snare-rim-2.flac', url: `${WILKINSON_BASE}/TopOne_Black_D2_50_two-UWYS.flac` },
        ],
      },
      'tom-rack': {
        label: 'Close-Mic Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.flac', url: `${WILKINSON_BASE}/-TopOne_D3_20_one-SPLR.flac` },
          { min: 0.5, max: 1.0, file: 'tom1-max.flac', url: `${WILKINSON_BASE}/-TopOne_D3_30_one-XPRP.flac` },
        ],
      },
      'tom-mid': {
        label: 'Close-Mic Rack Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.flac', url: `${WILKINSON_BASE}/-TopOne_D3_20_one-P2LC.flac` },
          { min: 0.5, max: 1.0, file: 'tom2-max.flac', url: `${WILKINSON_BASE}/-TopOne_D3_30_one-LMST.flac` },
        ],
      },
      'tom-mid-low': {
        label: 'Close-Mic Mid Tom 3',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom3-med.flac', url: `${WILKINSON_BASE}/-TopOne_D3_20_one-UKXC.flac` },
          { min: 0.5, max: 1.0, file: 'tom3-max.flac', url: `${WILKINSON_BASE}/-TopOne_D3_30_one-9BS2.flac` },
        ],
      },
      'tom-floor': {
        label: 'Close-Mic Floor Tom 4',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom4-med.flac', url: `${WILKINSON_BASE}/-TopOne_D3_20_one-N5ZE.flac` },
          { min: 0.5, max: 1.0, file: 'tom4-max.flac', url: `${WILKINSON_BASE}/-TopOne_D3_30_one-A4DQ.flac` },
        ],
      },
      'tom-floor-2': {
        label: 'Close-Mic Low Sub-Floor Tom 5',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom5-med.flac', url: `${WILKINSON_BASE}/-TopOne_D3_20_one-YM4F.flac` },
          { min: 0.5, max: 1.0, file: 'tom5-max.flac', url: `${WILKINSON_BASE}/-TopOne_D3_30_one-6AWO.flac` },
        ],
      },
      hihat: {
        label: 'Close-Mic Tight Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-closed-med.flac', url: `${WILKINSON_BASE}/HatMic_G2_20_one-LV5Z.flac` },
          { min: 0.5, max: 1.0, file: 'hh-closed-max.flac', url: `${WILKINSON_BASE}/HatMic_G2_30_one-12YE.flac` },
        ],
      },
      'hihat-open': {
        label: 'Close-Mic Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-open-med.flac', url: `${WILKINSON_BASE}/HatMic_A2_20_one-GU63.flac` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.flac', url: `${WILKINSON_BASE}/HatMic_A2_30_one-G62L.flac` },
        ],
      },
      cymbal: {
        label: 'Overhead Heavy Crash 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash1-med.flac', url: `${WILKINSON_BASE}/OH_D3_20_one-CX1I.flac` },
          { min: 0.5, max: 1.0, file: 'crash1-max.flac', url: `${WILKINSON_BASE}/OH_D3_30_one-W5TF.flac` },
        ],
      },
      'cymbal-china': {
        label: 'Wide China Cymbal 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'china1-med.flac', url: `${WILKINSON_BASE}/TopOne_D3_20_one-8RIQ.flac` },
          { min: 0.5, max: 1.0, file: 'china1-max.flac', url: `${WILKINSON_BASE}/TopOne_D3_30_one-4JH6.flac` },
        ],
      },
      'cymbal-china-2': {
        label: 'Wide China Cymbal 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'china2-med.flac', url: `${WILKINSON_BASE}/TopOne_D3_20_one-QTL8.flac` },
          { min: 0.5, max: 1.0, file: 'china2-max.flac', url: `${WILKINSON_BASE}/TopOne_D3_30_one-A8AP.flac` },
        ],
      },
      ride: {
        label: 'Close-Mic Ride Bow',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-med.flac', url: `${WILKINSON_BASE}/RideMic_D3_20_one-WPGL.flac` },
          { min: 0.5, max: 1.0, file: 'ride-max.flac', url: `${WILKINSON_BASE}/RideMic_D3_30_one-KDE4.flac` },
        ],
      },
      'ride-bell': {
        label: 'Close-Mic Ride Bell',
        layers: [
          { min: 0.0, max: 1.0, file: 'ride-bell-max.flac', url: `${WILKINSON_BASE}/RideMic_E3_10_one-A5YV.flac` },
        ],
      },
    },
  },

  // 4. SMDrums Heavy Studio Metal Kit
  {
    id: 'smdrums-heavy-metal',
    name: 'SMDrums Heavy Studio Metal Kit (6.5" Deep Snare & 4 Toms)',
    genreTag: 'HEAVY / GROOVE METAL',
    author: 'Suleiman & Tod / SMDrums',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/SMDrums',
    description: 'Full-bodied 24-bit stereo studio shells: Deep Punch Kick, 6.5" Metal Snare, Aggressive Rimshot, 4 Stereo Toms, Tight Hats, China Cymbal, 17" Crash, and 20" Ride Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'SMDrums Heavy Punch Kick',
        layers: [
          { min: 0.0, max: 0.35, file: 'kick-soft.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/08_Kik_Stereo_RR1.wav` },
          { min: 0.35, max: 0.72, file: 'kick-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/20_Kik_Stereo_RR1.wav` },
          { min: 0.72, max: 1.0, file: 'kick-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/32_Kik_Stereo_RR1.wav` },
        ],
      },
      snare: {
        label: '6.5" Deep Heavy Metal Snare',
        layers: [
          { min: 0.0, max: 0.35, file: 'snare-soft.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Snare65_Reg_Stereo/RR1/12_Snare65_Reg_Stereo_RR1.wav` },
          { min: 0.35, max: 0.72, file: 'snare-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Snare65_Reg_Stereo/RR1/24_Snare65_Reg_Stereo_RR1.wav` },
          { min: 0.72, max: 1.0, file: 'snare-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Snare65_Reg_Stereo/RR1/34_Snare65_Reg_Stereo_RR1.wav` },
        ],
      },
      'snare-rimshot': {
        label: 'SMDrums Crack Rimshot',
        layers: [
          { min: 0.0, max: 0.5, file: 'rimshot-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/RimShot_Stereo/RR1/05_RimShot_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'rimshot-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/RimShot_Stereo/RR1/10_RimShot_Stereo_RR1.wav` },
        ],
      },
      'tom-rack': {
        label: 'Stereo Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/13_Tom1_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom1-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/25_Tom1_Stereo_RR1.wav` },
        ],
      },
      'tom-mid': {
        label: 'Stereo Rack Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/16_Tom2_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom2-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/30_Tom2_Stereo_RR1.wav` },
        ],
      },
      'tom-mid-low': {
        label: 'Stereo Low-Mid Tom 3',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom3-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom3/RR1/14_Tom3_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom3-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom3/RR1/26_Tom3_Stereo_RR1.wav` },
        ],
      },
      'tom-floor': {
        label: 'Stereo Floor Tom 4',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom4-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/14_Tom4_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom4-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/26_Tom4_Stereo_RR1.wav` },
        ],
      },
      hihat: {
        label: 'Tight Center Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-tight-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/01%20Hat%20Tight%201/RR1/25_Hat_Tight_Cnt_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'hh-tight-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/01%20Hat%20Tight%201/RR1/49_Hat_Tight_Cnt_RR1.wav` },
        ],
      },
      'hihat-open': {
        label: 'Open Stereo Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-open-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/03%20Hat,%20Open/RR1/08_Hat_Open_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/03%20Hat,%20Open/RR1/14_Hat_Open_RR1.wav` },
        ],
      },
      cymbal: {
        label: '17" Edge Crash Cymbal',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash17-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/Crash%2017%20(Samples)/RR1/12_Crash_17in_L_edge_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'crash17-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/Crash%2017%20(Samples)/RR1/23_Crash_17in_L_edge_RR1.wav` },
        ],
      },
      'cymbal-china': {
        label: 'SMDrums Heavy China Cymbal',
        layers: [
          { min: 0.0, max: 0.5, file: 'china-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/China%20Cymbal%20(Samples)/RR1/03_China_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'china-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/China%20Cymbal%20(Samples)/RR1/05_China_RR1.wav` },
        ],
      },
      ride: {
        label: '20" Heavy Ride Tip',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride20-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20(Samples)/RR1/12_Ride_20in_R_Cnt_Tip_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'ride20-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20(Samples)/RR1/23_Ride_20in_R_Cnt_Tip_RR1.wav` },
        ],
      },
      'ride-bell': {
        label: '20" Piercing Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride20-bell-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20Bell%20(Samples)/RR1/12_Ride_Bell_20in_R_Tip_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'ride20-bell-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20Bell%20(Samples)/RR1/23_Ride_Bell_20in_R_Tip_RR1.wav` },
        ],
      },
    },
  },

  // 5. SMDrums Hybrid Metalcore Kit
  {
    id: 'smdrums-hybrid-metalcore',
    name: 'SMDrums Hybrid Sample-Reinforced Metalcore Kit',
    genreTag: 'METALCORE / HYBRID',
    author: 'SMDrums Hybrid Engineered Series',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/SMDrums',
    description: 'Mix-ready metalcore shells featuring SMDrums Hybrid-Layered Snares (HyB2 & HyB3), Hybrid Rimshot Bombs (HyB1), Hard-Hit Kick, 4 Toms, China, and 20" Ride Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Metalcore Hard-Hit Kick',
        layers: [
          { min: 0.0, max: 0.4, file: 'kick-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/17_Kik_Stereo_RR1.wav` },
          { min: 0.4, max: 0.78, file: 'kick-hard.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/26_Kik_Stereo_RR1.wav` },
          { min: 0.78, max: 1.0, file: 'kick-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/32_Kik_Stereo_RR1.wav` },
        ],
      },
      snare: {
        label: 'Hybrid Reinforced Snare (HyB2)',
        layers: [
          { min: 0.0, max: 0.38, file: 'snare-hyb2-soft.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD_Snr_Str_HyB2%20(Samples)/RR1/12_Snr_HyB2_RR1.wav` },
          { min: 0.38, max: 0.75, file: 'snare-hyb2-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD_Snr_Str_HyB2%20(Samples)/RR1/22_Snr_HyB2_RR1.wav` },
          { min: 0.75, max: 1.0, file: 'snare-hyb2-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD_Snr_Str_HyB2%20(Samples)/RR1/32_Snr_HyB2_RR1.wav` },
        ],
      },
      'snare-rimshot': {
        label: 'Hybrid Breakdown Rimshot (HyB1)',
        layers: [
          { min: 0.0, max: 0.5, file: 'rim-hyb1-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD%20RimShot_Str_HyB1%20(Samples)/RR1/17_RimShot_Str_HyB1_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'rim-hyb1-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD%20RimShot_Str_HyB1%20(Samples)/RR1/32_RimShot_Str_HyB1_RR1.wav` },
        ],
      },
      'snare-alt': {
        label: 'Hybrid Fat Snare (HyB3)',
        layers: [
          { min: 0.0, max: 0.5, file: 'snare-hyb3-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD_Snr_Str_HyB3%20(Samples)/RR1/20_Snr_HyB3_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'snare-hyb3-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/SMD_Snr_Str_HyB3%20(Samples)/RR1/32_Snr_HyB3_RR1.wav` },
        ],
      },
      'tom-rack': {
        label: 'Metalcore Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/18_Tom1_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom1-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/25_Tom1_Stereo_RR1.wav` },
        ],
      },
      'tom-mid': {
        label: 'Metalcore Mid Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/20_Tom2_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom2-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/30_Tom2_Stereo_RR1.wav` },
        ],
      },
      'tom-floor': {
        label: 'Metalcore Floor Tom 4',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom4-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/18_Tom4_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom4-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/26_Tom4_Stereo_RR1.wav` },
        ],
      },
      hihat: {
        label: 'Crispy Tight Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-tight-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/01%20Hat%20Tight%201/RR1/35_Hat_Tight_Cnt_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'hh-tight-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/01%20Hat%20Tight%201/RR1/49_Hat_Tight_Cnt_RR1.wav` },
        ],
      },
      'hihat-open': {
        label: 'Open Breakdown Hi-Hat',
        layers: [
          { min: 0.0, max: 1.0, file: 'hh-open-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Hi-Hat%20(Samples)/03%20Hat,%20Open/RR1/14_Hat_Open_RR1.wav` },
        ],
      },
      cymbal: {
        label: '17" Bright Crash',
        layers: [
          { min: 0.0, max: 1.0, file: 'crash17-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/Crash%2017%20(Samples)/RR1/23_Crash_17in_L_edge_RR1.wav` },
        ],
      },
      'cymbal-china': {
        label: 'Breakdown China Cymbal',
        layers: [
          { min: 0.0, max: 0.5, file: 'china-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/China%20Cymbal%20(Samples)/RR1/04_China_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'china-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/China%20Cymbal%20(Samples)/RR1/05_China_RR1.wav` },
        ],
      },
      'ride-bell': {
        label: '20" Metalcore Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-bell-med.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20Bell%20(Samples)/RR1/18_Ride_Bell_20in_R_Tip_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'ride-bell-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20Bell%20(Samples)/RR1/23_Ride_Bell_20in_R_Tip_RR1.wav` },
        ],
      },
    },
  },

  // 6. Salamander Progressive & Heavy Metal Kit I
  {
    id: 'salamander-prog-metal',
    name: 'Salamander Progressive & Heavy Metal Kit I',
    genreTag: 'PROG / HEAVY METAL',
    author: 'Alexander Holm (Salamander Drumkit)',
    license: 'CC-BY-SA-3.0',
    sourceUrl: 'https://github.com/studiorack/salamander-drumkit',
    description: 'Open-room progressive metal kit featuring Deep Metal Kick 1, Dynamic Snare 1, High & Low Toms, Semi-Open & Open Hats, China 1, Splash, Crashes, and Ride 1 Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Salamander Deep Metal Kick 1',
        layers: [
          { min: 0.0, max: 0.35, file: 'kick1-soft.flac', url: `${SALAMANDER_BASE}/kick_OH_P_1.flac` },
          { min: 0.35, max: 0.72, file: 'kick1-med.flac', url: `${SALAMANDER_BASE}/kick_OH_F_1.flac` },
          { min: 0.72, max: 1.0, file: 'kick1-max.flac', url: `${SALAMANDER_BASE}/kick_OH_FF_1.flac` },
        ],
      },
      snare: {
        label: 'Salamander Prog Snare 1',
        layers: [
          { min: 0.0, max: 0.35, file: 'snare1-soft.flac', url: `${SALAMANDER_BASE}/snare_OH_MP_1.flac` },
          { min: 0.35, max: 0.72, file: 'snare1-med.flac', url: `${SALAMANDER_BASE}/snare_OH_F_1.flac` },
          { min: 0.72, max: 1.0, file: 'snare1-max.flac', url: `${SALAMANDER_BASE}/snare_OH_FF_1.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'Salamander Cross-Stick / Rim Click',
        layers: [
          { min: 0.0, max: 1.0, file: 'snare-stick.flac', url: `${SALAMANDER_BASE}/snareStick_OH_F_1.flac` },
        ],
      },
      'tom-rack': {
        label: 'Salamander High Rack Tom',
        layers: [
          { min: 0.0, max: 0.4, file: 'hitom-soft.flac', url: `${SALAMANDER_BASE}/hiTom_OH_P_1.flac` },
          { min: 0.4, max: 0.78, file: 'hitom-med.flac', url: `${SALAMANDER_BASE}/hiTom_OH_F_1.flac` },
          { min: 0.78, max: 1.0, file: 'hitom-max.flac', url: `${SALAMANDER_BASE}/hiTom_OH_FF_1.flac` },
        ],
      },
      'tom-floor': {
        label: 'Salamander Low Floor Tom',
        layers: [
          { min: 0.0, max: 0.4, file: 'lotom-soft.flac', url: `${SALAMANDER_BASE}/loTom_OH_PP_1.flac` },
          { min: 0.4, max: 0.78, file: 'lotom-med.flac', url: `${SALAMANDER_BASE}/loTom_OH_MP_1.flac` },
          { min: 0.78, max: 1.0, file: 'lotom-max.flac', url: `${SALAMANDER_BASE}/loTom_OH_FF_1.flac` },
        ],
      },
      hihat: {
        label: 'Salamander Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-closed-soft.flac', url: `${SALAMANDER_BASE}/hihatClosed_OH_P_1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-closed-max.flac', url: `${SALAMANDER_BASE}/hihatClosed_OH_F_1.flac` },
        ],
      },
      'hihat-open': {
        label: 'Salamander Semi-Open & Open Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-semi-med.flac', url: `${SALAMANDER_BASE}/hihatSemiOpen2_OH_F_1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.flac', url: `${SALAMANDER_BASE}/hihatOpen_OH_FF_1.flac` },
        ],
      },
      cymbal: {
        label: 'Salamander Crash 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash1-soft.flac', url: `${SALAMANDER_BASE}/crash1_OH_P_1.flac` },
          { min: 0.5, max: 1.0, file: 'crash1-max.flac', url: `${SALAMANDER_BASE}/crash1_OH_FF_1.flac` },
        ],
      },
      'cymbal-china': {
        label: 'Salamander Trash China 1',
        layers: [
          { min: 0.0, max: 1.0, file: 'china1-max.flac', url: `${SALAMANDER_BASE}/china1_OH_FF_1.flac` },
        ],
      },
      'cymbal-splash': {
        label: 'Prog Accent Splash',
        layers: [
          { min: 0.0, max: 1.0, file: 'splash1-max.flac', url: `${SALAMANDER_BASE}/splash1_OH_F_1.flac` },
        ],
      },
      ride: {
        label: 'Salamander Ride 1 Bow',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride1-med.flac', url: `${SALAMANDER_BASE}/ride1_OH_MP_1.flac` },
          { min: 0.5, max: 1.0, file: 'ride1-max.flac', url: `${SALAMANDER_BASE}/ride1_OH_FF_1.flac` },
        ],
      },
      'ride-bell': {
        label: 'Salamander Ride 1 Bell',
        layers: [
          { min: 0.0, max: 1.0, file: 'ride1-bell.flac', url: `${SALAMANDER_BASE}/ride1Bell_OH_F_1.flac` },
        ],
      },
    },
  },

  // 7. Salamander Thrash & Speed Metal Kit II
  {
    id: 'salamander-thrash-metal',
    name: 'Salamander Thrash & Crossover Metal Kit II (Tight Kick 2 & High Snare 2)',
    genreTag: 'THRASH / CROSSOVER METAL',
    author: 'Alexander Holm (Salamander Shell Pack II)',
    license: 'CC-BY-SA-3.0',
    sourceUrl: 'https://github.com/studiorack/salamander-drumkit',
    description: 'High-attack thrash shell pack from the Salamander sessions: Tight Beater Kick 2, High-Pitched Crack Snare 2, Barking Semi-Open Hats, China 2, Crash 2/3, and Crash-Ride Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Salamander Tight Thrash Kick 2',
        layers: [
          { min: 0.0, max: 0.35, file: 'kick2-soft.flac', url: `${SALAMANDER_BASE}/kick2_OH_P_1.flac` },
          { min: 0.35, max: 0.72, file: 'kick2-med.flac', url: `${SALAMANDER_BASE}/kick2_OH_F_1.flac` },
          { min: 0.72, max: 1.0, file: 'kick2-max.flac', url: `${SALAMANDER_BASE}/kick2_OH_FF_1.flac` },
        ],
      },
      snare: {
        label: 'Salamander High-Crack Thrash Snare 2',
        layers: [
          { min: 0.0, max: 0.35, file: 'snare2-soft.flac', url: `${SALAMANDER_BASE}/snare2_OH_MP_1.flac` },
          { min: 0.35, max: 0.72, file: 'snare2-med.flac', url: `${SALAMANDER_BASE}/snare2_OH_F_1.flac` },
          { min: 0.72, max: 1.0, file: 'snare2-max.flac', url: `${SALAMANDER_BASE}/snare2_OH_FF_1.flac` },
        ],
      },
      'tom-rack': {
        label: 'High Attack Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'hitom-med.flac', url: `${SALAMANDER_BASE}/hiTom_OH_F_1.flac` },
          { min: 0.5, max: 1.0, file: 'hitom-max.flac', url: `${SALAMANDER_BASE}/hiTom_OH_FF_1.flac` },
        ],
      },
      'tom-floor': {
        label: 'Low Attack Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'lotom-med.flac', url: `${SALAMANDER_BASE}/loTom_OH_MP_1.flac` },
          { min: 0.5, max: 1.0, file: 'lotom-max.flac', url: `${SALAMANDER_BASE}/loTom_OH_FF_1.flac` },
        ],
      },
      hihat: {
        label: 'Barking Semi-Open Thrash Hats',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-semi4-soft.flac', url: `${SALAMANDER_BASE}/hihatSemiOpen4_OH_P_1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-semi4-max.flac', url: `${SALAMANDER_BASE}/hihatSemiOpen4_OH_F_1.flac` },
        ],
      },
      'hihat-open': {
        label: 'Wide Open Thrash Hats',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-open-med.flac', url: `${SALAMANDER_BASE}/hihatOpen_OH_F_1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.flac', url: `${SALAMANDER_BASE}/hihatOpen_OH_FF_1.flac` },
        ],
      },
      cymbal: {
        label: 'Thrash Dual Crash 2 & 3',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash2-max.flac', url: `${SALAMANDER_BASE}/crash2_OH_FF_1.flac` },
          { min: 0.5, max: 1.0, file: 'crash3-max.flac', url: `${SALAMANDER_BASE}/crash3_OH_FF_1.flac` },
        ],
      },
      'cymbal-china': {
        label: 'Salamander Fast China 2',
        layers: [
          { min: 0.0, max: 1.0, file: 'china2-max.flac', url: `${SALAMANDER_BASE}/china2_OH_FF_1.flac` },
        ],
      },
      ride: {
        label: 'Heavy Crash-Ride 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride2-med.flac', url: `${SALAMANDER_BASE}/ride2_OH_FF_1.flac` },
          { min: 0.5, max: 1.0, file: 'ride2-crash.flac', url: `${SALAMANDER_BASE}/ride2Crash_OH_FF_1.flac` },
        ],
      },
      'ride-bell': {
        label: 'Thrash D-Beat Ride 2 Bell + Cowbell',
        layers: [
          { min: 0.0, max: 1.0, file: 'ride2-bell.flac', url: `${SALAMANDER_BASE}/ride2Bell_OH_F_1.flac` },
        ],
      },
      cowbell: {
        label: 'Crossover Metal Cowbell',
        layers: [
          { min: 0.0, max: 0.5, file: 'cowbell-med.flac', url: `${SALAMANDER_BASE}/cowbell_MP_1.flac` },
          { min: 0.5, max: 1.0, file: 'cowbell-max.flac', url: `${SALAMANDER_BASE}/cowbell_FF_1.flac` },
        ],
      },
    },
  },

  // 8. AVL Black Pearl 5pc Heavy Metal Kit
  {
    id: 'avl-black-pearl-metal',
    name: 'AVL Black Pearl 5pc Heavy Metal Kit (Sabian AAX & Paiste 2002)',
    genreTag: 'HEAVY METAL / 5PC',
    author: 'Glen MacArthur (AVL Drumkits)',
    license: 'CC-BY-SA-4.0',
    sourceUrl: 'https://github.com/studiorack/avl-drumkits',
    description: '22" Pearl Heavy Kick, Pearl Crack Snare + Edge, Pearl 12"/13"/16" Toms, Sabian Rock Hi-Hats, Sabian AA 16" & AAX 17" Crashes, Sabian AAX 20" Ride Bell, and Paiste 2002 22".',
    defaultFor: [],
    pieces: {
      kick: {
        label: '22" Black Pearl Heavy Kick',
        layers: [
          { min: 0.0, max: 0.38, file: 'pearl22-kick-soft.flac', url: `${AVL_BASE}/36-Pearl22Kick-2.flac` },
          { min: 0.38, max: 0.75, file: 'pearl22-kick-med.flac', url: `${AVL_BASE}/36-Pearl22Kick-4.flac` },
          { min: 0.75, max: 1.0, file: 'pearl22-kick-max.flac', url: `${AVL_BASE}/36-Pearl22Kick-5.flac` },
        ],
      },
      snare: {
        label: 'Black Pearl Crack Snare Center',
        layers: [
          { min: 0.0, max: 0.38, file: 'pearl-snare-soft.flac', url: `${AVL_BASE}/38-PearlSnare2-2.flac` },
          { min: 0.38, max: 0.75, file: 'pearl-snare-med.flac', url: `${AVL_BASE}/38-PearlSnare2-4.flac` },
          { min: 0.75, max: 1.0, file: 'pearl-snare-max.flac', url: `${AVL_BASE}/38-PearlSnare2-5.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'Black Pearl Snare Edge / Rim',
        layers: [
          { min: 0.0, max: 0.5, file: 'pearl-snare-edge-med.flac', url: `${AVL_BASE}/40-PearlSnare2Edge-3.flac` },
          { min: 0.5, max: 1.0, file: 'pearl-snare-edge-max.flac', url: `${AVL_BASE}/40-PearlSnare2Edge-5.flac` },
        ],
      },
      'tom-rack': {
        label: 'Pearl 12" Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'pearl12-tom-med.flac', url: `${AVL_BASE}/45-Pearl12Tom-3.flac` },
          { min: 0.5, max: 1.0, file: 'pearl12-tom-max.flac', url: `${AVL_BASE}/45-Pearl12Tom-5.flac` },
        ],
      },
      'tom-mid': {
        label: 'Pearl 13" Rack Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'pearl13-tom-med.flac', url: `${AVL_BASE}/47-Pearl13Tom2-3.flac` },
          { min: 0.5, max: 1.0, file: 'pearl13-tom-max.flac', url: `${AVL_BASE}/47-Pearl13Tom2-5.flac` },
        ],
      },
      'tom-floor': {
        label: 'Pearl 16" Heavy Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'pearl16-tom-med.flac', url: `${AVL_BASE}/41-Pearl16FloorTom-3.flac` },
          { min: 0.5, max: 1.0, file: 'pearl16-tom-max.flac', url: `${AVL_BASE}/41-Pearl16FloorTom-5.flac` },
        ],
      },
      hihat: {
        label: 'Sabian Rock Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-hh-closed-med.flac', url: `${AVL_BASE}/42-SabianRockHatClosed-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-hh-closed-max.flac', url: `${AVL_BASE}/42-SabianRockHatClosed-5.flac` },
        ],
      },
      'hihat-open': {
        label: 'Sabian Rock Semi-Open & Swish Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-hh-semi.flac', url: `${AVL_BASE}/46-SabianRockHatSemiOpen-4.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-hh-swish.flac', url: `${AVL_BASE}/48-SabianRockHatSwish-5.flac` },
        ],
      },
      cymbal: {
        label: 'Sabian AAX 17" Heavy Crash',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-aax17-med.flac', url: `${AVL_BASE}/57-SabianAAX17Crash-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-aax17-max.flac', url: `${AVL_BASE}/57-SabianAAX17Crash-5.flac` },
        ],
      },
      'cymbal-heavy': {
        label: 'Paiste 2002 22" Power Crash/Ride',
        layers: [
          { min: 0.0, max: 0.5, file: 'paiste2002-med.flac', url: `${AVL_BASE}/60-Paiste2002-22-3.flac` },
          { min: 0.5, max: 1.0, file: 'paiste2002-max.flac', url: `${AVL_BASE}/60-Paiste2002-22-5.flac` },
        ],
      },
      ride: {
        label: 'Sabian AAX 20" Stage Ride',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-ride-med.flac', url: `${AVL_BASE}/51-SabianAAX20Ride-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-ride-max.flac', url: `${AVL_BASE}/51-SabianAAX20Ride-5.flac` },
        ],
      },
      'ride-bell': {
        label: 'Sabian AAX 20" Piercing Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-bell-med.flac', url: `${AVL_BASE}/53-SabianAAX20RideBell-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-bell-max.flac', url: `${AVL_BASE}/53-SabianAAX20RideBell-5.flac` },
        ],
      },
    },
  },

  // 9. AVL Red Zeppelin 26" Stoner / Doom / Heavy Metal Kit
  {
    id: 'avl-red-zeppelin-metal',
    name: 'AVL Red Zeppelin 26" Stoner / Doom Metal Kit (Pork Pie Brass Snare)',
    genreTag: 'STONER / DOOM 26"',
    author: 'Glen MacArthur (AVL Drumkits)',
    license: 'CC-BY-SA-4.0',
    sourceUrl: 'https://github.com/studiorack/avl-drumkits',
    description: 'Thunderous 26" Ludwig Kick, Pork Pie Brass/Metal Snare + Edge, Ludwig 14"/16"/18" Monster Toms, Sabian Rock Hats, Zildjian A 20" & K 17" Crashes, and 24" Megabell Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: '26" Ludwig Thunder Kick',
        layers: [
          { min: 0.0, max: 0.38, file: 'ludwig26-kick-soft.flac', url: `${AVL_BASE}/36-Ludwig26Kick-2.flac` },
          { min: 0.38, max: 0.75, file: 'ludwig26-kick-med.flac', url: `${AVL_BASE}/36-Ludwig26Kick-4.flac` },
          { min: 0.75, max: 1.0, file: 'ludwig26-kick-max.flac', url: `${AVL_BASE}/36-Ludwig26Kick-5.flac` },
        ],
      },
      snare: {
        label: 'Pork Pie Brass Heavy Snare',
        layers: [
          { min: 0.0, max: 0.38, file: 'porkpie-snare-soft.flac', url: `${AVL_BASE}/38-PorkpieSnare-2.flac` },
          { min: 0.38, max: 0.75, file: 'porkpie-snare-med.flac', url: `${AVL_BASE}/38-PorkpieSnare-4.flac` },
          { min: 0.75, max: 1.0, file: 'porkpie-snare-max.flac', url: `${AVL_BASE}/38-PorkpieSnare-5.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'Pork Pie Brass Edge / Rimshot',
        layers: [
          { min: 0.0, max: 0.5, file: 'porkpie-edge-med.flac', url: `${AVL_BASE}/40-PorkpieSnareEdge-3.flac` },
          { min: 0.5, max: 1.0, file: 'porkpie-edge-max.flac', url: `${AVL_BASE}/40-PorkpieSnareEdge-5.flac` },
        ],
      },
      'tom-rack': {
        label: 'Ludwig 14" Heavy Rack Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'ludwig14-tom-med.flac', url: `${AVL_BASE}/45-Ludwig14Tom-3.flac` },
          { min: 0.5, max: 1.0, file: 'ludwig14-tom-max.flac', url: `${AVL_BASE}/45-Ludwig14Tom-5.flac` },
        ],
      },
      'tom-mid': {
        label: 'Ludwig 16" Floor Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'ludwig16-tom-med.flac', url: `${AVL_BASE}/41-Ludwig16FloorTom-3.flac` },
          { min: 0.5, max: 1.0, file: 'ludwig16-tom-max.flac', url: `${AVL_BASE}/41-Ludwig16FloorTom-5.flac` },
        ],
      },
      'tom-floor': {
        label: 'Ludwig 18" Mammoth Floor Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'ludwig18-tom-med.flac', url: `${AVL_BASE}/43-Ludwig18FloorTom-3.flac` },
          { min: 0.5, max: 1.0, file: 'ludwig18-tom-max.flac', url: `${AVL_BASE}/43-Ludwig18FloorTom-5.flac` },
        ],
      },
      hihat: {
        label: 'Sabian Rock Heavy Closed Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-hh-med.flac', url: `${AVL_BASE}/42-SabianRockHatClosed-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-hh-max.flac', url: `${AVL_BASE}/42-SabianRockHatClosed-5.flac` },
        ],
      },
      'hihat-open': {
        label: 'Sabian Rock Swish Sloshy Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sabian-swish-med.flac', url: `${AVL_BASE}/48-SabianRockHatSwish-3.flac` },
          { min: 0.5, max: 1.0, file: 'sabian-swish-max.flac', url: `${AVL_BASE}/48-SabianRockHatSwish-5.flac` },
        ],
      },
      cymbal: {
        label: 'Zildjian A 20" Heavy Crash',
        layers: [
          { min: 0.0, max: 0.5, file: 'zildjian20-med.flac', url: `${AVL_BASE}/49-ZildjianA20Crash-3.flac` },
          { min: 0.5, max: 1.0, file: 'zildjian20-max.flac', url: `${AVL_BASE}/49-ZildjianA20Crash-5.flac` },
        ],
      },
      'cymbal-dark': {
        label: 'Zildjian K 17" Dark Crash',
        layers: [
          { min: 0.0, max: 0.5, file: 'zildjiank17-med.flac', url: `${AVL_BASE}/57-ZildjianK17Crash-3.flac` },
          { min: 0.5, max: 1.0, file: 'zildjiank17-max.flac', url: `${AVL_BASE}/57-ZildjianK17Crash-5.flac` },
        ],
      },
      ride: {
        label: 'Zildjian A 24" Heavy Ride Shank',
        layers: [
          { min: 0.0, max: 0.5, file: 'zildjian24-ride-med.flac', url: `${AVL_BASE}/59-ZildjianA24RideShank-3.flac` },
          { min: 0.5, max: 1.0, file: 'zildjian24-ride-max.flac', url: `${AVL_BASE}/59-ZildjianA24RideShank-5.flac` },
        ],
      },
      'ride-bell': {
        label: 'Zildjian A 24" Doom Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'zildjian24-bell-med.flac', url: `${AVL_BASE}/53-ZildjianA24RideBell-3.flac` },
          { min: 0.5, max: 1.0, file: 'zildjian24-bell-max.flac', url: `${AVL_BASE}/53-ZildjianA24RideBell-5.flac` },
        ],
      },
    },
  },

  // 10. Big Rusty 24" Doom & Sludge Metal Kit
  {
    id: 'big-rusty-doom-sludge',
    name: 'Big Rusty 24" Undamped Doom & Sludge Metal Kit (14"-22" Monster Toms)',
    genreTag: 'DOOM / SLUDGE METAL',
    author: 'Karoryfer Samples (Big Rusty Drums)',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums',
    description: 'Massive 24" Undamped Kick, 14" Rimshot Snare, colossal 14"/15"/18"/22" Toms, 18" Trash China, 3-Layer Stack, 17" Crash, and 22" Bell Ride for Doom, Post-Metal, and Sludge.',
    defaultFor: [],
    pieces: {
      kick: {
        label: '24" Undamped Doom Kick',
        layers: [
          { min: 0.0, max: 0.38, file: 'kick24-nodamp-soft.flac', url: `${BIG_RUSTY_BASE}/kick_24_nodamp/kick/kick/k_nodamp_vl2_rr1.flac` },
          { min: 0.38, max: 0.75, file: 'kick24-nodamp-med.flac', url: `${BIG_RUSTY_BASE}/kick_24_nodamp/kick/kick/k_nodamp_vl4_rr1.flac` },
          { min: 0.75, max: 1.0, file: 'kick24-nodamp-max.flac', url: `${BIG_RUSTY_BASE}/kick_24_nodamp/kick/kick/k_nodamp_vl6_rr1.flac` },
        ],
      },
      snare: {
        label: '14" Heavy Rimshot Sludge Snare',
        layers: [
          { min: 0.0, max: 0.38, file: 'snare-rim-soft.flac', url: `${BIG_RUSTY_BASE}/snare_14/rimshot/top/sn_rims_vl2_rr1.flac` },
          { min: 0.38, max: 0.75, file: 'snare-rim-med.flac', url: `${BIG_RUSTY_BASE}/snare_14/rimshot/top/sn_rims_vl4_rr1.flac` },
          { min: 0.75, max: 1.0, file: 'snare-rim-max.flac', url: `${BIG_RUSTY_BASE}/snare_14/rimshot/top/sn_rims_vl6_rr1.flac` },
        ],
      },
      'snare-center': {
        label: '14" Deep Center Snare',
        layers: [
          { min: 0.0, max: 0.5, file: 'snare-cnt-med.flac', url: `${BIG_RUSTY_BASE}/snare_14/center/top/sn_center_vl6_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'snare-cnt-max.flac', url: `${BIG_RUSTY_BASE}/snare_14/center/top/sn_center_vl10_rr1.flac` },
        ],
      },
      'tom-rack': {
        label: '14" Close-Mic Rack Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom14-med.flac', url: `${BIG_RUSTY_BASE}/tom_14/center/cl/t14_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom14-max.flac', url: `${BIG_RUSTY_BASE}/tom_14/center/cl/t14_vl6_rr1.flac` },
        ],
      },
      'tom-mid': {
        label: '15" Close-Mic Power Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom15-med.flac', url: `${BIG_RUSTY_BASE}/tom_15/center/cl/t15_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom15-max.flac', url: `${BIG_RUSTY_BASE}/tom_15/center/cl/t15_vl7_rr1.flac` },
        ],
      },
      'tom-floor': {
        label: '18" Close-Mic Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom18-med.flac', url: `${BIG_RUSTY_BASE}/tom_18/center/cl/t18_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom18-max.flac', url: `${BIG_RUSTY_BASE}/tom_18/center/cl/t18_vl8_rr1.flac` },
        ],
      },
      'tom-floor-2': {
        label: '22" Gong / Sub-Floor Monster Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom22-med.flac', url: `${BIG_RUSTY_BASE}/tom_22/center/cl/t22_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom22-max.flac', url: `${BIG_RUSTY_BASE}/tom_22/center/cl/t22_vl7_rr1.flac` },
        ],
      },
      hihat: {
        label: '14" Close-Mic Tight Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh14-tight-med.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'hh14-tight-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl8_rr1.flac` },
        ],
      },
      'hihat-open': {
        label: '14" Sloshy Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh14-open-med.flac', url: `${BIG_RUSTY_BASE}/hihat_14/open/cl/ht_open_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'hh14-open-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/open/cl/ht_open_vl6_rr1.flac` },
        ],
      },
      cymbal: {
        label: '17" Dark Sludge Crash',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash17-med.flac', url: `${BIG_RUSTY_BASE}/crash_17/cr/oh/cr_vl3_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'crash17-max.flac', url: `${BIG_RUSTY_BASE}/crash_17/cr/oh/cr_vl5_rr1.flac` },
        ],
      },
      'cymbal-china': {
        label: '18" Raw Trash China',
        layers: [
          { min: 0.0, max: 0.5, file: 'china18-med.flac', url: `${BIG_RUSTY_BASE}/china_18/cn/oh/cn_vl3_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'china18-max.flac', url: `${BIG_RUSTY_BASE}/china_18/cn/oh/cn_vl5_rr1.flac` },
        ],
      },
      'cymbal-stack': {
        label: '3-Layer Metal Cymbal Trash Stack',
        layers: [
          { min: 0.0, max: 0.5, file: 'stack3-med.flac', url: `${BIG_RUSTY_BASE}/stack_3_layer/ed/oh/st_ed_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'stack3-max.flac', url: `${BIG_RUSTY_BASE}/stack_3_layer/ed/oh/st_ed_vl6_rr1.flac` },
        ],
      },
      'ride-bell': {
        label: '22" Heavy Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride22-bell-med.flac', url: `${BIG_RUSTY_BASE}/ride_22/bl/oh/rd_bl_vl2_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'ride22-bell-max.flac', url: `${BIG_RUSTY_BASE}/ride_22/bl/oh/rd_bl_vl4_rr1.flac` },
        ],
      },
    },
  },

  // 11. Big Rusty Djent & Groove Metal Trash-Stack Kit
  {
    id: 'big-rusty-djent-stack',
    name: 'Big Rusty Damped 24" Djent & Groove Metal Kit (3-Layer Trash Stack)',
    genreTag: 'DJENT / GROOVE METAL',
    author: 'Karoryfer Samples (Damped & High-Tuned Configuration)',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums',
    description: 'Tightly damped 24" Punch Kick + Beater Click, High-Tension Tall Rimshot Snare, 14"/15"/18" Toms, 3-Layer Djent Trash Stack, 18" China, and 22" Bell Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: '24" Damped Tight Djent Kick',
        layers: [
          { min: 0.0, max: 0.38, file: 'kick24-damp-soft.flac', url: `${BIG_RUSTY_BASE}/kick_24/kick/kick/k_vl6_rr1.flac` },
          { min: 0.38, max: 0.75, file: 'kick24-damp-med.flac', url: `${BIG_RUSTY_BASE}/kick_24/kick/kick/k_vl10_rr1.flac` },
          { min: 0.75, max: 1.0, file: 'kick24-damp-max.flac', url: `${BIG_RUSTY_BASE}/kick_24/kick/kick/k_vl14_rr1.flac` },
        ],
      },
      'kick-click': {
        label: '24" Close Beater Click Attack',
        layers: [
          { min: 0.0, max: 0.5, file: 'kick24-click-med.flac', url: `${BIG_RUSTY_BASE}/kick_24/tc/cl/k_tc_vl2_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'kick24-click-max.flac', url: `${BIG_RUSTY_BASE}/kick_24/tc/cl/k_tc_vl3_rr1.flac` },
        ],
      },
      snare: {
        label: 'High-Tension Djent Rimshot Snare',
        layers: [
          { min: 0.0, max: 0.38, file: 'snare-tall-rim-soft.flac', url: `${BIG_RUSTY_BASE}/snare_14/trimshot/top/sn_tall_rims_vl2_rr1.flac` },
          { min: 0.38, max: 0.75, file: 'snare-tall-rim-med.flac', url: `${BIG_RUSTY_BASE}/snare_14/trimshot/top/sn_tall_rims_vl4_rr1.flac` },
          { min: 0.75, max: 1.0, file: 'snare-tall-rim-max.flac', url: `${BIG_RUSTY_BASE}/snare_14/trimshot/top/sn_tall_rims_vl5_rr1.flac` },
        ],
      },
      'snare-ghost': {
        label: 'High-Tension Ghost / Center Snare',
        layers: [
          { min: 0.0, max: 0.5, file: 'snare-tall-cnt-med.flac', url: `${BIG_RUSTY_BASE}/snare_14/tcenter/top/sn_tall_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'snare-tall-cnt-max.flac', url: `${BIG_RUSTY_BASE}/snare_14/tcenter/top/sn_tall_vl6_rr1.flac` },
        ],
      },
      'tom-rack': {
        label: '14" Djent Rack Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom14-med.flac', url: `${BIG_RUSTY_BASE}/tom_14/center/cl/t14_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom14-max.flac', url: `${BIG_RUSTY_BASE}/tom_14/center/cl/t14_vl6_rr1.flac` },
        ],
      },
      'tom-mid': {
        label: '15" Djent Mid Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom15-med.flac', url: `${BIG_RUSTY_BASE}/tom_15/center/cl/t15_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom15-max.flac', url: `${BIG_RUSTY_BASE}/tom_15/center/cl/t15_vl7_rr1.flac` },
        ],
      },
      'tom-floor': {
        label: '18" Djent Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom18-med.flac', url: `${BIG_RUSTY_BASE}/tom_18/center/cl/t18_vl6_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tom18-max.flac', url: `${BIG_RUSTY_BASE}/tom_18/center/cl/t18_vl8_rr1.flac` },
        ],
      },
      hihat: {
        label: 'Crispy Tight Groove Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-tight-med.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl6_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-tight-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl8_rr1.flac` },
        ],
      },
      'hihat-open': {
        label: 'Open Groove Hat',
        layers: [
          { min: 0.0, max: 1.0, file: 'hh-open-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/open/cl/ht_open_vl6_rr1.flac` },
        ],
      },
      'cymbal-stack': {
        label: '3-Layer Polyrhythm Djent Stack (Primary)',
        layers: [
          { min: 0.0, max: 0.5, file: 'stack3-med.flac', url: `${BIG_RUSTY_BASE}/stack_3_layer/ed/oh/st_ed_vl3_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'stack3-max.flac', url: `${BIG_RUSTY_BASE}/stack_3_layer/ed/oh/st_ed_vl6_rr1.flac` },
        ],
      },
      'cymbal-china': {
        label: '18" Breakdown China',
        layers: [
          { min: 0.0, max: 0.5, file: 'china18-med.flac', url: `${BIG_RUSTY_BASE}/china_18/cn/oh/cn_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'china18-max.flac', url: `${BIG_RUSTY_BASE}/china_18/cn/oh/cn_vl5_rr1.flac` },
        ],
      },
      cymbal: {
        label: '17" Accent Crash',
        layers: [
          { min: 0.0, max: 1.0, file: 'crash17-max.flac', url: `${BIG_RUSTY_BASE}/crash_17/cr/oh/cr_vl5_rr1.flac` },
        ],
      },
      'ride-bell': {
        label: '22" Djent Bell Ride',
        layers: [
          { min: 0.0, max: 1.0, file: 'ride22-bell-max.flac', url: `${BIG_RUSTY_BASE}/ride_22/bl/oh/rd_bl_vl4_rr1.flac` },
        ],
      },
    },
  },

  // 12. DRSKit Hard-Beater Contact Heavy Metal Kit
  {
    id: 'drs-contact-metal',
    name: 'DRSKit Hard-Beater Contact Heavy Metal Kit',
    genreTag: 'HARD-BEATER METAL',
    author: 'DrumGizmo DRSKit Team',
    license: 'CC-BY-4.0',
    sourceUrl: 'https://github.com/sfzinstruments/DrumGizmo.DRSKit',
    description: 'Recorded with hard plastic/wood beater contact pad on the kick (Front Resonance + Batter Beater Click), Rimshot & Center Snare, 3 Close Toms, Shank Crashes, and Bell Ride.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Hard-Beater Contact Kick (Front Punch)',
        layers: [
          { min: 0.0, max: 0.38, file: 'kick-contact-soft.flac', url: `${DRS_BASE}/Kdrum_with_contact/8-Kdrum_with_contact-Kdrum_front.flac` },
          { min: 0.38, max: 0.75, file: 'kick-contact-med.flac', url: `${DRS_BASE}/Kdrum_with_contact/16-Kdrum_with_contact-Kdrum_front.flac` },
          { min: 0.75, max: 1.0, file: 'kick-contact-max.flac', url: `${DRS_BASE}/Kdrum_with_contact/22-Kdrum_with_contact-Kdrum_front.flac` },
        ],
      },
      'kick-beater': {
        label: 'Hard-Beater Batter Click (Kdrum Back)',
        layers: [
          { min: 0.0, max: 0.5, file: 'kick-beater-med.flac', url: `${DRS_BASE}/Kdrum_with_contact/14-Kdrum_with_contact-Kdrum_back.flac` },
          { min: 0.5, max: 1.0, file: 'kick-beater-max.flac', url: `${DRS_BASE}/Kdrum_with_contact/22-Kdrum_with_contact-Kdrum_back.flac` },
        ],
      },
      snare: {
        label: 'DRSKit Close Metal Snare Top',
        layers: [
          { min: 0.0, max: 0.38, file: 'snare-soft.flac', url: `${DRS_BASE}/Snare/16-Snare-Snare_top.flac` },
          { min: 0.38, max: 0.75, file: 'snare-med.flac', url: `${DRS_BASE}/Snare/34-Snare-Snare_top.flac` },
          { min: 0.75, max: 1.0, file: 'snare-max.flac', url: `${DRS_BASE}/Snare/49-Snare-Snare_top.flac` },
        ],
      },
      'snare-rimshot': {
        label: 'DRSKit Aggressive Snare Rimshot',
        layers: [
          { min: 0.0, max: 0.5, file: 'snare-rim-med.flac', url: `${DRS_BASE}/Snare_rim/5-Snare_rim-Snare_top.flac` },
          { min: 0.5, max: 1.0, file: 'snare-rim-max.flac', url: `${DRS_BASE}/Snare_rim/10-Snare_rim-Snare_top.flac` },
        ],
      },
      'tom-rack': {
        label: 'DRSKit Close Tom 1 (High)',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.flac', url: `${DRS_BASE}/Tom1/14-Tom1-Tom1.flac` },
          { min: 0.5, max: 1.0, file: 'tom1-max.flac', url: `${DRS_BASE}/Tom1/24-Tom1-Tom1.flac` },
        ],
      },
      'tom-mid': {
        label: 'DRSKit Close Tom 2 (Mid)',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.flac', url: `${DRS_BASE}/Tom2/11-Tom2-Tom2.flac` },
          { min: 0.5, max: 1.0, file: 'tom2-max.flac', url: `${DRS_BASE}/Tom2/18-Tom2-Tom2.flac` },
        ],
      },
      'tom-floor': {
        label: 'DRSKit Close Tom 3 (Floor)',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom3-med.flac', url: `${DRS_BASE}/Tom3/11-Tom3-Tom3.flac` },
          { min: 0.5, max: 1.0, file: 'tom3-max.flac', url: `${DRS_BASE}/Tom3/18-Tom3-Tom3.flac` },
        ],
      },
      hihat: {
        label: 'DRSKit Closed Shank Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-closed-med.flac', url: `${DRS_BASE}/Hihat_closed/10-Hihat_closed-Hihat.flac` },
          { min: 0.5, max: 1.0, file: 'hh-closed-max.flac', url: `${DRS_BASE}/Hihat_closed/18-Hihat_closed-Hihat.flac` },
        ],
      },
      'hihat-open': {
        label: 'DRSKit Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-open-med.flac', url: `${DRS_BASE}/Hihat_open/8-Hihat_open-Hihat.flac` },
          { min: 0.5, max: 1.0, file: 'hh-open-max.flac', url: `${DRS_BASE}/Hihat_open/14-Hihat_open-Hihat.flac` },
        ],
      },
      cymbal: {
        label: 'Left & Right Shank Crashes',
        layers: [
          { min: 0.0, max: 0.5, file: 'crash-l-max.flac', url: `${DRS_BASE}/Crash_left_shank/11-Crash_left_shank-OHL.flac` },
          { min: 0.5, max: 1.0, file: 'crash-r-max.flac', url: `${DRS_BASE}/Crash_right_shank/10-Crash_right_shank-OHR.flac` },
        ],
      },
      ride: {
        label: 'Heavy Shank Ride',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-shank-med.flac', url: `${DRS_BASE}/Ride_shank/7-Ride_shank-Ride.flac` },
          { min: 0.5, max: 1.0, file: 'ride-shank-max.flac', url: `${DRS_BASE}/Ride_shank/12-Ride_shank-Ride.flac` },
        ],
      },
      'ride-bell': {
        label: 'DRSKit Tip Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'ride-bell-med.flac', url: `${DRS_BASE}/Ride_tip_bell/6-Ride_tip_bell-Ride.flac` },
          { min: 0.5, max: 1.0, file: 'ride-bell-max.flac', url: `${DRS_BASE}/Ride_tip_bell/10-Ride_tip_bell-Ride.flac` },
        ],
      },
    },
  },

  // 13. Sonor Force 3001 Power & Speed Metal Kit
  {
    id: 'sonor-power-metal',
    name: 'Sonor Force 3001 Power & Speed Metal Kit',
    genreTag: 'POWER / SPEED METAL',
    author: 'Sam Greene (SamsSonor)',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/SamsSonor',
    description: 'German Sonor Force 3001 shells: Punchy Double-Pedal Ready Kick, Crisp Snare, Attack-Click Toms, Clang Open Hats, Heavy Clang Crash, and Bright Power-Metal Ride Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Sonor Force 3001 Punch Kick',
        layers: [
          { min: 0.0, max: 0.35, file: 'sonor-kick-soft.flac', url: `${SONOR_BASE}/KickSamples%232.flac` },
          { min: 0.35, max: 0.72, file: 'sonor-kick-med.flac', url: `${SONOR_BASE}/KickSamples%235.flac` },
          { min: 0.72, max: 1.0, file: 'sonor-kick-max.flac', url: `${SONOR_BASE}/KickSamples%237.flac` },
        ],
      },
      snare: {
        label: 'Sonor Force 3001 Crack Snare',
        layers: [
          { min: 0.0, max: 0.35, file: 'sonor-snare-soft.flac', url: `${SONOR_BASE}/SnareSamples%233.flac` },
          { min: 0.35, max: 0.72, file: 'sonor-snare-med.flac', url: `${SONOR_BASE}/SnareSamples%236.flac` },
          { min: 0.72, max: 1.0, file: 'sonor-snare-max.flac', url: `${SONOR_BASE}/SnareSamples%239.flac` },
        ],
      },
      'snare-alt': {
        label: 'Sonor Right-Hand Power Snare',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-snare-rh-med.flac', url: `${SONOR_BASE}/SnareRightHand%236.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-snare-rh-max.flac', url: `${SONOR_BASE}/SnareRightHand%239.flac` },
        ],
      },
      'tom-rack': {
        label: 'Sonor High Rack Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-tomhi-med.flac', url: `${SONOR_BASE}/TomHigh%232.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-tomhi-max.flac', url: `${SONOR_BASE}/TomHigh%234.flac` },
        ],
      },
      'tom-click': {
        label: 'Sonor Attack-Click Tom Layer',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-tomclick-med.flac', url: `${SONOR_BASE}/TomClicks%232.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-tomclick-max.flac', url: `${SONOR_BASE}/TomClicks%234.flac` },
        ],
      },
      'tom-floor': {
        label: 'Sonor Low Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-tomlo-med.flac', url: `${SONOR_BASE}/TomLow%233.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-tomlo-max.flac', url: `${SONOR_BASE}/TomLow%236.flac` },
        ],
      },
      hihat: {
        label: 'Sonor Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-hh-med.flac', url: `${SONOR_BASE}/HHClosed%234.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-hh-max.flac', url: `${SONOR_BASE}/HHClosed%238.flac` },
        ],
      },
      'hihat-open': {
        label: 'Sonor Clang Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-hhopen-med.flac', url: `${SONOR_BASE}/HHOpenClang%232.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-hhopen-max.flac', url: `${SONOR_BASE}/HHOpenClang%234.flac` },
        ],
      },
      cymbal: {
        label: 'Power Metal Clang Crash',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-crash-med.flac', url: `${SONOR_BASE}/CrashClang%232.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-crash-max.flac', url: `${SONOR_BASE}/CrashClang%234.flac` },
        ],
      },
      ride: {
        label: 'Power Metal Gallop Ride',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-ride-med.flac', url: `${SONOR_BASE}/Ride%232.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-ride-max.flac', url: `${SONOR_BASE}/Ride%234.flac` },
        ],
      },
      'ride-bell': {
        label: 'Bright Power-Metal Ride Bell',
        layers: [
          { min: 0.0, max: 0.5, file: 'sonor-bell-med.flac', url: `${SONOR_BASE}/RideBell%231.flac` },
          { min: 0.5, max: 1.0, file: 'sonor-bell-max.flac', url: `${SONOR_BASE}/RideBell%233.flac` },
        ],
      },
    },
  },

  // 14. Frankensnare 13" Brass & 14" Steel Rimshot Thrash / Hardcore Kit
  {
    id: 'frankensnare-brass-thrash',
    name: 'Frankensnare 13" Brass & 14" Metal Rimshot Thrash / Hardcore Kit',
    genreTag: 'BRASS THRASH / HARDCORE',
    author: 'Karoryfer Frankensnare + CC0 Metal Shells',
    license: 'CC0-1.0',
    sourceUrl: 'https://github.com/sfzinstruments/karoryfer.frankensnare',
    description: 'High-cracking 13" Brass Piccolo Rimshot & 14" Metal Rimshot snares that slice through walls of thrash/hardcore distortion, paired with punch kick, toms, 18" China, and 20" Ride Bell.',
    defaultFor: [],
    pieces: {
      kick: {
        label: 'Thrash Tight Punch Kick',
        layers: [
          { min: 0.0, max: 0.45, file: 'thrash-kick-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/20_Kik_Stereo_RR1.wav` },
          { min: 0.45, max: 1.0, file: 'thrash-kick-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Kik_Stereo/RR1/32_Kik_Stereo_RR1.wav` },
        ],
      },
      snare: {
        label: '13" Brass Rimshot Crack Snare (Primary)',
        layers: [
          { min: 0.0, max: 0.35, file: 'brass13-rim-soft.flac', url: `${FRANKEN_BASE}/13b_rimshot/top/sn_vl2_rr1.flac` },
          { min: 0.35, max: 0.72, file: 'brass13-rim-med.flac', url: `${FRANKEN_BASE}/13b_rimshot/top/sn_vl4_rr1.flac` },
          { min: 0.72, max: 1.0, file: 'brass13-rim-max.flac', url: `${FRANKEN_BASE}/13b_rimshot/top/sn_vl6_rr1.flac` },
        ],
      },
      'snare-rimshot': {
        label: '14" Metal Shell Rimshot Bark',
        layers: [
          { min: 0.0, max: 0.45, file: 'metal14-rim-med.flac', url: `${FRANKEN_BASE}/14a_rimshot/top/sr_vl2_rr1.flac` },
          { min: 0.45, max: 1.0, file: 'metal14-rim-max.flac', url: `${FRANKEN_BASE}/14a_rimshot/top/sr_vl3_rr1.flac` },
        ],
      },
      'snare-tight': {
        label: '20-Strand Tight Hardcore Snare',
        layers: [
          { min: 0.0, max: 0.5, file: 'tight20-med.flac', url: `${FRANKEN_BASE}/20m_tight/top/sn_vl4_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'tight20-max.flac', url: `${FRANKEN_BASE}/20m_tight/top/sn_vl6_rr1.flac` },
        ],
      },
      'tom-rack': {
        label: 'Thrash Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom1-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/18_Tom1_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom1-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom1/RR1/25_Tom1_Stereo_RR1.wav` },
        ],
      },
      'tom-mid': {
        label: 'Thrash Mid Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom2-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/20_Tom2_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom2-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom2/RR1/30_Tom2_Stereo_RR1.wav` },
        ],
      },
      'tom-floor': {
        label: 'Thrash Floor Tom',
        layers: [
          { min: 0.0, max: 0.5, file: 'tom4-med.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/18_Tom4_Stereo_RR1.wav` },
          { min: 0.5, max: 1.0, file: 'tom4-max.wav', url: `${SMDRUMS_BASE}/SMDrum%20Stereo%20(Samples)/Toms_Stereo/Tom4/RR1/26_Tom4_Stereo_RR1.wav` },
        ],
      },
      hihat: {
        label: 'Tight D-Beat Closed Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'hh-tight-med.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl5_rr1.flac` },
          { min: 0.5, max: 1.0, file: 'hh-tight-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/tc/cl/ht_tc_vl8_rr1.flac` },
        ],
      },
      'hihat-open': {
        label: 'Barking Open Hardcore Hat',
        layers: [
          { min: 0.0, max: 1.0, file: 'hh-open-max.flac', url: `${BIG_RUSTY_BASE}/hihat_14/open/cl/ht_open_vl6_rr1.flac` },
        ],
      },
      cymbal: {
        label: '17" Fast Crash',
        layers: [
          { min: 0.0, max: 1.0, file: 'crash17-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Crash%20(Samples)/Crash%2017%20(Samples)/RR1/23_Crash_17in_L_edge_RR1.wav` },
        ],
      },
      'cymbal-china': {
        label: '18" Two-Step Breakdown China',
        layers: [
          { min: 0.0, max: 1.0, file: 'china18-max.flac', url: `${BIG_RUSTY_BASE}/china_18/cn/oh/cn_vl5_rr1.flac` },
        ],
      },
      'ride-bell': {
        label: '20" Hardcore Mosh Ride Bell',
        layers: [
          { min: 0.0, max: 1.0, file: 'ride20-bell-max.wav', url: `${SMDRUMS_BASE}/SMD%20Cymbals%20Stereo%20(Samples)/Ride%20(Samples)/Ride%2020%20Bell%20(Samples)/RR1/23_Ride_Bell_20in_R_Tip_RR1.wav` },
        ],
      },
    },
  },

  // 15. Pearl DX 5pc Classic Heavy Metal / Hard Rock Studio Kit
  {
    id: 'gm-rock-kit',
    name: 'Pearl DX 5pc Classic Heavy Metal / Hard Rock Kit',
    genreTag: 'CLASSIC HEAVY METAL',
    author: 'Glen MacArthur (AVL) & Sebastian Moors / Hydrogen',
    license: 'GPL-3.0',
    sourceUrl: 'https://github.com/hydrogen-music/hydrogen/tree/main/data/drumkits/GMRockKit',
    description: 'Traditional NWOBHM / Classic Heavy Metal 5-piece Pearl DX studio kit (4-layer Kick, Snare, Rimshot, Toms 1/2/Floor, Hats, Crash, and 24" Ride).',
    defaultFor: ['kick', 'snare', 'tom-rack', 'tom-floor', 'hihat', 'cymbal'],
    pieces: {
      kick: {
        label: 'Pearl DX Heavy Kick',
        layers: [
          { min: 0.0, max: 0.28, file: 'Kick-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Soft.wav` },
          { min: 0.28, max: 0.68, file: 'Kick-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Med.wav` },
          { min: 0.68, max: 0.86, file: 'Kick-Hard.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Hard.wav` },
          { min: 0.86, max: 1.0, file: 'Kick-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Kick-Hardest.wav` },
        ],
      },
      snare: {
        label: 'Pearl DX Studio Snare',
        layers: [
          { min: 0.0, max: 0.28, file: 'Snare-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Soft.wav` },
          { min: 0.28, max: 0.62, file: 'Snare-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Med.wav` },
          { min: 0.62, max: 0.84, file: 'Snare-Hard.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Hard.wav` },
          { min: 0.84, max: 1.0, file: 'Snare-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Snare-Hardest.wav` },
        ],
      },
      'snare-rimshot': {
        label: 'Pearl DX Snare Rimshot',
        layers: [
          { min: 0.0, max: 0.5, file: 'SnareRimshot-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/SnareRimshot-Med.wav` },
          { min: 0.5, max: 1.0, file: 'SnareRimshot-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/SnareRimshot-Hardest.wav` },
        ],
      },
      'tom-rack': {
        label: 'Pearl DX Rack Tom 1',
        layers: [
          { min: 0.0, max: 0.45, file: 'Tom1-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Soft.wav` },
          { min: 0.45, max: 0.8, file: 'Tom1-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Med.wav` },
          { min: 0.8, max: 1.0, file: 'Tom1-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom1-Hardest.wav` },
        ],
      },
      'tom-mid': {
        label: 'Pearl DX Rack Tom 2',
        layers: [
          { min: 0.0, max: 0.5, file: 'Tom2-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom2-Med.wav` },
          { min: 0.5, max: 1.0, file: 'Tom2-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Tom2-Hardest.wav` },
        ],
      },
      'tom-floor': {
        label: 'Pearl DX Floor Tom',
        layers: [
          { min: 0.0, max: 0.45, file: 'TomFloor-Soft.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Soft.wav` },
          { min: 0.45, max: 0.8, file: 'TomFloor-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Med.wav` },
          { min: 0.8, max: 1.0, file: 'TomFloor-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/TomFloor-Hardest.wav` },
        ],
      },
      hihat: {
        label: 'Pearl DX Closed Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'HatClosed-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatClosed-Med.wav` },
          { min: 0.5, max: 1.0, file: 'HatClosed-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatClosed-Hardest.wav` },
        ],
      },
      'hihat-open': {
        label: 'Pearl DX Open Hi-Hat',
        layers: [
          { min: 0.0, max: 0.5, file: 'HatOpen-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatOpen-Med.wav` },
          { min: 0.5, max: 1.0, file: 'HatOpen-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/HatOpen-Hardest.wav` },
        ],
      },
      cymbal: {
        label: 'Studio Heavy Crash Cymbal',
        layers: [
          { min: 0.0, max: 0.55, file: 'Crash-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Crash-Med.wav` },
          { min: 0.55, max: 1.0, file: 'Crash-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Crash-Hardest.wav` },
        ],
      },
      ride: {
        label: '24" Classic Metal Ride',
        layers: [
          { min: 0.0, max: 0.55, file: 'Ride-Med.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Ride-Med.wav` },
          { min: 0.55, max: 1.0, file: 'Ride-Hardest.wav', url: `${HYDROGEN_RAW_BASE}/GMRockKit/Ride-Hardest.wav` },
        ],
      },
    },
  },
];

function getInstrumentsRoot() {
  if (process.env.ROBOS_DAW_INSTRUMENTS_DIR) return process.env.ROBOS_DAW_INSTRUMENTS_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'instruments');
}

function getDrumkitsRoot() {
  return path.join(getInstrumentsRoot(), 'drumkits');
}

function fetchUrlBuffer(url, redirectsLeft = 4, retriesLeft = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'RobOS-DAW-Studio/0.2' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
        const nextUrl = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchUrlBuffer(nextUrl, redirectsLeft - 1, retriesLeft));
      }
      if (res.statusCode !== 200) {
        res.resume();
        if (retriesLeft > 0 && res.statusCode >= 500) {
          return setTimeout(() => {
            fetchUrlBuffer(url, redirectsLeft, retriesLeft - 1).then(resolve, reject);
          }, 400);
        }
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', (err) => {
      if (retriesLeft > 0) {
        return setTimeout(() => {
          fetchUrlBuffer(url, redirectsLeft, retriesLeft - 1).then(resolve, reject);
        }, 400);
      }
      reject(err);
    });
    req.setTimeout(25000, () => {
      req.destroy(new Error(`Timeout downloading ${url}`));
    });
  });
}

function inspectInstalledKits() {
  const root = getDrumkitsRoot();
  const catalogIds = new Set(OPEN_DRUMKIT_CATALOG.map(k => k.id));
  const results = OPEN_DRUMKIT_CATALOG.map(kit => {
    const kitDir = path.join(root, kit.id);
    const manifestPath = path.join(kitDir, 'kit.json');
    let installed = false;
    let sampleCount = 0;
    const pieces = {};

    for (const [pieceId, piece] of Object.entries(kit.pieces)) {
      const resolvedLayers = piece.layers.map(layer => {
        const fullPath = path.join(kitDir, layer.file);
        const exists = fs.existsSync(fullPath);
        if (exists) sampleCount++;
        return {
          ...layer,
          localPath: exists ? fullPath : null,
          exists,
        };
      });
      pieces[pieceId] = {
        id: pieceId,
        label: piece.label,
        ready: resolvedLayers.some(l => l.exists),
        layers: resolvedLayers,
      };
    }

    installed = fs.existsSync(manifestPath) || sampleCount > 0;
    return {
      id: kit.id,
      name: kit.name,
      genreTag: kit.genreTag || 'METAL STUDIO',
      author: kit.author,
      license: kit.license,
      sourceUrl: kit.sourceUrl,
      description: kit.description,
      installed,
      sampleCount,
      kitDir,
      pieces,
    };
  });

  // Also discover any custom kits placed in ~/.local/share/robos/daw-studio/instruments/drumkits/<id>/
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || catalogIds.has(entry.name)) continue;
      const kitDir = path.join(root, entry.name);
      const scan = scanDirectoryForPluginsAndSamples(kitDir, { maxDepth: 4 });
      if (!scan.sampleFiles.length) continue;
      let meta = { name: entry.name, genreTag: 'CUSTOM KIT', author: 'Custom Open Archive', license: 'User Installed', description: 'Custom local drumkit' };
      const manifestPath = path.join(kitDir, 'kit.json');
      if (fs.existsSync(manifestPath)) {
        try { meta = { ...meta, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) }; } catch {}
      }
      const built = buildCustomSampleKitFromDirectory({ path: kitDir, label: meta.name }, scan.sampleFiles);
      results.push({
        ...built,
        id: entry.name,
        name: meta.name,
        genreTag: meta.genreTag || 'CUSTOM KIT',
        author: meta.author,
        license: meta.license,
        sourceUrl: meta.sourceUrl || kitDir,
        description: meta.description,
        isCustomDirectory: false,
      });
    }
  }

  // Include all user-configured custom VST / Sample directories containing audio samples
  const seenIds = new Set(results.map(r => r.id));
  for (const customKit of getCustomDirectorySampleKits()) {
    if (seenIds.has(customKit.id)) continue;
    seenIds.add(customKit.id);
    results.push({
      ...customKit,
      genreTag: customKit.genreTag || 'LOCAL SAMPLE DIR',
    });
  }

  return {
    instrumentsRoot: getInstrumentsRoot(),
    drumkitsRoot: root,
    kits: results,
    anyInstalled: results.some(k => k.installed && k.sampleCount > 0),
  };
}

async function downloadOpenDrumkit(kitId = 'muldjord-death-metal', { onProgress, concurrency = 6 } = {}) {
  const kit = OPEN_DRUMKIT_CATALOG.find(k => k.id === kitId);
  if (!kit) {
    throw new Error(`Unknown drumkit "${kitId}". Available kits: ${OPEN_DRUMKIT_CATALOG.map(k => k.id).join(', ')}`);
  }

  const kitDir = path.join(getDrumkitsRoot(), kit.id);
  fs.mkdirSync(kitDir, { recursive: true });

  const downloads = [];
  const seenFiles = new Set();
  for (const [pieceId, piece] of Object.entries(kit.pieces)) {
    for (const layer of piece.layers) {
      if (seenFiles.has(layer.file)) continue;
      seenFiles.add(layer.file);
      downloads.push({ pieceId, ...layer });
    }
  }

  const hashes = {};
  let completed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < downloads.length) {
      const idx = cursor++;
      const item = downloads[idx];
      const dest = path.join(kitDir, item.file);
      if (!fs.existsSync(dest) || fs.statSync(dest).size < 64) {
        const buf = await fetchUrlBuffer(item.url);
        fs.writeFileSync(dest, buf);
        hashes[item.file] = crypto.createHash('sha256').update(buf).digest('hex');
      } else {
        const buf = fs.readFileSync(dest);
        hashes[item.file] = crypto.createHash('sha256').update(buf).digest('hex');
      }
      completed++;
      if (onProgress) {
        onProgress({ kitId: kit.id, completed, total: downloads.length, file: item.file });
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, downloads.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const manifest = {
    schema: 1,
    id: kit.id,
    name: kit.name,
    genreTag: kit.genreTag,
    author: kit.author,
    license: kit.license,
    sourceUrl: kit.sourceUrl,
    installedAt: new Date().toISOString(),
    files: hashes,
  };
  fs.writeFileSync(path.join(kitDir, 'kit.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return {
    ok: true,
    kitId: kit.id,
    kitDir,
    downloadedFiles: completed,
    status: inspectInstalledKits(),
  };
}

async function downloadAllOpenDrumkits({ onProgress } = {}) {
  const results = [];
  for (const kit of OPEN_DRUMKIT_CATALOG) {
    results.push(await downloadOpenDrumkit(kit.id, { onProgress }));
  }
  return {
    ok: true,
    results,
    status: inspectInstalledKits(),
  };
}

async function downloadDefaultOpenDrumkits({ onProgress } = {}) {
  const results = [];
  for (const id of ['muldjord-death-metal', 'wilkinson-modern-metal', 'smdrums-heavy-metal', 'gm-rock-kit']) {
    results.push(await downloadOpenDrumkit(id, { onProgress }));
  }
  return {
    ok: true,
    results,
    status: inspectInstalledKits(),
  };
}

/**
 * Parse RIFF WAV buffer and extract normalized mono samples + sampleRate.
 */
function decodeWavMono(buffer) {
  if (!buffer || buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    return { sampleRate: 48000, samples: new Float32Array(0) };
  }
  let offset = 12;
  let sampleRate = 48000;
  let channels = 1;
  let bitsPerSample = 16;
  let audioFormat = 1;
  let dataStart = 44;
  let dataLen = Math.max(0, buffer.length - 44);

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ' && offset + 24 <= buffer.length) {
      audioFormat = buffer.readUInt16LE(offset + 8);
      channels = Math.max(1, buffer.readUInt16LE(offset + 10));
      sampleRate = buffer.readUInt32LE(offset + 12) || 48000;
      bitsPerSample = buffer.readUInt16LE(offset + 22) || 16;
    } else if (chunkId === 'data') {
      dataStart = offset + 8;
      dataLen = Math.min(chunkSize, buffer.length - dataStart);
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  const bytesPerSample = Math.max(2, Math.floor(bitsPerSample / 8));
  const frameBytes = bytesPerSample * channels;
  const totalFrames = Math.floor(dataLen / frameBytes);
  const out = new Float32Array(totalFrames);

  for (let i = 0; i < totalFrames; i++) {
    const base = dataStart + i * frameBytes;
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const p = base + ch * bytesPerSample;
      let v = 0;
      if (audioFormat === 3 && bytesPerSample === 4) v = buffer.readFloatLE(p);
      else if (bytesPerSample === 2) v = buffer.readInt16LE(p) / 32768;
      else if (bytesPerSample === 3) {
        const b0 = buffer[p], b1 = buffer[p + 1], b2 = buffer[p + 2];
        const int24 = (b2 & 0x80) ? ((b2 << 16) | (b1 << 8) | b0) - 0x1000000 : ((b2 << 16) | (b1 << 8) | b0);
        v = int24 / 8388608;
      } else if (bytesPerSample === 4) v = buffer.readInt32LE(p) / 2147483648;
      sum += v;
    }
    out[i] = sum / channels;
  }

  return { sampleRate, channels, bitsPerSample, samples: out, durationSec: totalFrames / sampleRate };
}

/**
 * Downsample mono samples into compact peak envelope array for fast canvas rendering & project JSON persistence.
 */
function computeWaveformPeaks(buffer, numBuckets = 240) {
  const { samples, durationSec, sampleRate } = decodeWavMono(buffer);
  if (!samples.length) return { peaks: [], peakDb: -96, durationSec: 0, sampleRate };
  const bucketSize = Math.max(1, Math.floor(samples.length / numBuckets));
  const peaks = [];
  let globalPeak = 0;
  for (let b = 0; b < numBuckets; b++) {
    const start = b * bucketSize;
    if (start >= samples.length) break;
    const end = Math.min(samples.length, start + bucketSize);
    let max = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > max) max = a;
    }
    if (max > globalPeak) globalPeak = max;
    peaks.push(Number(max.toFixed(5)));
  }
  const peakDb = globalPeak <= 0.000015 ? -96 : Number((20 * Math.log10(globalPeak)).toFixed(1));
  return { peaks, peakDb, durationSec: Number(durationSec.toFixed(3)), sampleRate };
}

function measureWindowPeakStats(samples, sampleRate, gainLin = 1) {
  const windowSamples = Math.max(32, Math.floor(sampleRate * 0.004)); // 4ms attack window
  const windowPeaks = [];
  const windowPeakIndices = [];
  let maxPeak = 0;

  for (let i = 0; i < samples.length; i += windowSamples) {
    const end = Math.min(samples.length, i + windowSamples);
    let peak = 0;
    let peakIdx = i;
    for (let j = i; j < end; j++) {
      const a = Math.abs(samples[j]) * gainLin;
      if (a > peak) {
        peak = a;
        peakIdx = j;
      }
    }
    if (peak > maxPeak) maxPeak = peak;
    windowPeaks.push(peak);
    windowPeakIndices.push(peakIdx);
  }

  if (!windowPeaks.length) {
    return { windowSamples, windowPeaks, windowPeakIndices, maxPeak: 0, noiseFloor: 0 };
  }
  const sorted = [...windowPeaks].sort((a, b) => a - b);
  const noiseFloor = sorted[Math.floor(sorted.length * 0.5)] || 0;
  return { windowSamples, windowPeaks, windowPeakIndices, maxPeak, noiseFloor };
}

/**
 * Compute non-destructive smart input gain staging (dB) for quiet hardware mic takes
 * that have genuine transient/musical signal (>= 15 dB SNR above the preamp noise floor)
 * so playback is immediately audible without boosting empty room hiss.
 */
function computeSmartAutoGainDb(buffer, { targetPeakDb = -9.0, maxBoostDb = 36.0 } = {}) {
  const { samples, sampleRate } = decodeWavMono(buffer);
  if (!samples.length) return 0;
  const { maxPeak, noiseFloor } = measureWindowPeakStats(samples, sampleRate, 1.0);
  if (maxPeak <= 0.00055) return 0; // <= -65 dBFS: treat as room silence
  const maxDb = 20 * Math.log10(maxPeak);
  if (maxDb >= -18.0) return 0; // Already at healthy studio level

  const effNoise = Math.max(0.000015, noiseFloor);
  const noiseDb = 20 * Math.log10(effNoise);
  const snrDb = maxDb - noiseDb;
  if (snrDb < 15.0) return 0; // Insufficient SNR; never boost steady background hum/hiss

  const desiredBoost = targetPeakDb - maxDb;
  const maxNoiseSafeBoost = Math.max(0, -42.0 - noiseDb);
  const boostDb = Math.max(0, Math.min(maxBoostDb, desiredBoost, maxNoiseSafeBoost));
  return Number(boostDb.toFixed(1));
}

/**
 * Detect drum strike transients in a recorded WAV stem for Sound Replacement triggering.
 * Supports both absolute dBFS thresholds and adaptive crest-factor triggering on quiet
 * dynamic mic recordings where strikes sit >= 15.5 dB above the preamp noise floor.
 */
function detectDrumTransients(buffer, { thresholdDb = -28, minIntervalMs = 65, gainDb = 0 } = {}) {
  const { samples, sampleRate } = decodeWavMono(buffer);
  if (!samples.length) return [];

  const gainLin = Math.pow(10, (Number(gainDb) || 0) / 20);
  const thresholdLin = Math.pow(10, thresholdDb / 20);
  const { windowSamples, windowPeaks, windowPeakIndices, maxPeak, noiseFloor } = measureWindowPeakStats(samples, sampleRate, gainLin);
  if (!windowPeaks.length || maxPeak <= 0.0006) return [];

  const minGapSamples = Math.max(windowSamples, Math.floor((sampleRate * minIntervalMs) / 1000));
  const hasStrongCrest = maxPeak >= Math.max(0.0008, noiseFloor * 6.0);
  const useAdaptiveFloor = maxPeak < thresholdLin && hasStrongCrest;
  const effectiveThresholdLin = useAdaptiveFloor
    ? Math.max(noiseFloor * 5.0, maxPeak * 0.35)
    : thresholdLin;

  const hits = [];
  let lastHitSample = -minGapSamples;
  let prevEnv = 0;

  for (let w = 0; w < windowPeaks.length; w++) {
    const peak = windowPeaks[w];
    const peakIdx = windowPeakIndices[w];
    // Rising edge onset above threshold outside refractory window
    if (peak >= effectiveThresholdLin && peak > prevEnv * 1.25 && (peakIdx - lastHitSample) >= minGapSamples) {
      const peakDb = Number((20 * Math.log10(Math.min(1, peak))).toFixed(1));
      const normVel = useAdaptiveFloor
        ? Math.max(0.45, Math.min(0.96, 0.50 + 0.45 * (peak / Math.max(effectiveThresholdLin, maxPeak))))
        : Math.max(0.15, Math.min(1.0, (peakDb + 42) / 40));
      hits.push({
        timeSec: Number((peakIdx / sampleRate).toFixed(4)),
        peakDb,
        velocity: Number(normVel.toFixed(3)),
      });
      lastHitSample = peakIdx;
    }
    prevEnv = peak * 0.7 + prevEnv * 0.3;
  }

  return hits;
}

module.exports = {
  OPEN_DRUMKIT_CATALOG,
  getInstrumentsRoot,
  getDrumkitsRoot,
  inspectInstalledKits,
  downloadOpenDrumkit,
  downloadAllOpenDrumkits,
  downloadDefaultOpenDrumkits,
  decodeWavMono,
  computeWaveformPeaks,
  computeSmartAutoGainDb,
  detectDrumTransients,
};
