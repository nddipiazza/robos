'use strict';

/**
 * RobOS DAW Studio — Human-Guided + Real-Music + Gemini Click Track Library
 * (`packages/daw-studio/lib/human-click-track.js`)
 *
 * Workflow & Architecture:
 *   1. Configurable Lead-In Countdown & Live Human Tap Capture (`HumanTapCaptureRecorder`):
 *      - Streams a chosen hardware audio channel (Focusrite Analog 1–8, ADAT 9–16, USB/PipeWire mic)
 *        via `pcm-capture.js` (plus optional keyboard/pad taps) while the target song plays in
 *        headphones, using `alignRecordedWavBuffer` (`earsStartWallMs` vs `firstSampleMicWallMs`)
 *        for sub-millisecond overdub latency compensation.
 *   2. Human Tap Extraction & Sensor Fusion (`extractHumanTapsFromWav`, `fuseHumanTapsWithMusic`):
 *      - Detects percussive stick/drum/clap tap transients + velocity accents (`accentRatio`).
 *      - Fuses the human's felt pulse, dynamic tempo trajectory, and bar accents with the real
 *        music's 3-band percussive onset flux & 6-band harmonic chord-change grid (`analyzeAudioBeatGrid`).
 *      - Eliminates half-time/double-time errors, removes constant human motor lead/lag bias, snaps
 *        every bar/section to true musical transients, and rewards longer tap coverage across the song.
 *   3. Gemini Master Tempo-Map & Metronome Producer (`generateHumanGuidedClickTrackForProject`):
 *      - Hands `human-tap-fusion.json` + `song-excerpt.wav` to Gemini (`robos-lib/ai-agent`) to
 *        confirm/refine time signature(s), dynamic tempo sections, downbeat phase, and (when set
 *        to `"gemini-choice"`) select the ideal cutting metronome instrument pair.
 *   4. Multi-Instrument Acoustic/Studio Metronome Synthesizer (`synthesizeInstrumentClickWav`):
 *      - 16 selectable studio percussion instruments (`METRONOME_INSTRUMENTS`), defaulting to
 *        **Closed Hi-Hat (`hihat-closed`)** on regular pulse beats and **Open Hi-Hat (`hihat-open`)**
 *        on the **transition beat**, complete with authentic acoustic hi-hat foot-chick choke physics!
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const {
  decodeWavMono,
  computeWaveformPeaks,
} = require('./drum-instruments');
const {
  makeWavHeader,
  startDiscreteCaptureSession,
} = require('./pcm-capture');
const {
  buildTrackFromWizard,
  alignRecordedWavBuffer,
} = require('./session-manager');
const {
  findAlignedReferenceTrack,
  assembleTrackTimelineMono,
  analyzeAudioBeatGrid,
} = require('./click-track-generator');

const ANALYSIS_RATE = 16000;
const HOP_SAMPLES = 80; // 5.0 ms frame resolution (200 Hz)
const ENV_RATE = ANALYSIS_RATE / HOP_SAMPLES;

const DEFAULT_BEAT_INSTRUMENT = 'hihat-closed';
const DEFAULT_TRANSITION_INSTRUMENT = 'hihat-open';
const DEFAULT_TRANSITION_PLACEMENT = 'turnaround'; // 'turnaround' | 'downbeat' | 'section'
const DEFAULT_START_COUNTDOWN_BEATS = 4;
const DEFAULT_COUNT_IN_BARS = 1;

/**
 * Curated list of 16 selectable studio metronome instruments.
 * Every voice has a deterministic, zero-pre-delay Sample-0 attack so beat timing is sub-ms exact.
 */
const METRONOME_INSTRUMENTS = [
  {
    id: 'hihat-closed',
    name: 'Closed Hi-Hat (Crisp Stick Chick)',
    shortLabel: 'Closed Hi-Hat',
    category: 'Hi-Hats & Cymbals',
    chokesOpenHat: true,
    isOpenHat: false,
    description: 'Tight 14" studio bronze closed hi-hat stick chick — articulate & zero ear fatigue (Default Beat).',
  },
  {
    id: 'hihat-open',
    name: 'Open Hi-Hat (Sizzle Bark + Choke)',
    shortLabel: 'Open Hi-Hat',
    category: 'Hi-Hats & Cymbals',
    chokesOpenHat: false,
    isOpenHat: true,
    description: '14" studio open hi-hat bark that rings across the transition beat and chokes shut on the next closed hat (Default Transition).',
  },
  {
    id: 'hihat-pedal',
    name: 'Pedal Foot Hi-Hat Chick',
    shortLabel: 'Pedal Hi-Hat',
    category: 'Hi-Hats & Cymbals',
    chokesOpenHat: true,
    isOpenHat: false,
    description: 'Warm, compact left-foot hi-hat cup chick — great for subdivisions or acoustic grooves.',
  },
  {
    id: 'ride-bow',
    name: '20" Studio Ride Cymbal (Bow Ping)',
    shortLabel: 'Ride Bow',
    category: 'Hi-Hats & Cymbals',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Defined wooden-tip stick ping over controlled 20" bronze ride shimmer.',
  },
  {
    id: 'ride-bell',
    name: 'Piercing Metal Ride Bell',
    shortLabel: 'Ride Bell',
    category: 'Hi-Hats & Cymbals',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'High-projection cast bronze ride bell that cuts effortlessly through dense distorted guitars & loud drums.',
  },
  {
    id: 'drumsticks',
    name: 'Hickory Drumsticks (Stick-on-Stick)',
    shortLabel: 'Drumsticks',
    category: 'Sticks & Shells',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Classic hickory 5B stick-on-stick count-off click.',
  },
  {
    id: 'sidestick',
    name: 'Snare Cross-Stick / Rim Click',
    shortLabel: 'Cross-Stick',
    category: 'Sticks & Shells',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Maple snare shell rim click with warm studio body.',
  },
  {
    id: 'cowbell-high',
    name: 'Studio Cowbell (High Pitch)',
    shortLabel: 'High Cowbell',
    category: 'Bells & Blocks',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Punchy studio steel cowbell accent that slices through any drum room.',
  },
  {
    id: 'cowbell-low',
    name: 'Studio Groove Cowbell (Low)',
    shortLabel: 'Low Cowbell',
    category: 'Bells & Blocks',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Deeper rock/funk mouth-struck cowbell pulse.',
  },
  {
    id: 'woodblock-high',
    name: 'Maple Woodblock (High Clave)',
    shortLabel: 'High Woodblock',
    category: 'Bells & Blocks',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Crisp high-pitched orchestral maple woodblock.',
  },
  {
    id: 'woodblock-low',
    name: 'Maple Woodblock (Low Body)',
    shortLabel: 'Low Woodblock',
    category: 'Bells & Blocks',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Warm lower-pitched maple studio woodblock.',
  },
  {
    id: 'tambourine',
    name: 'Studio Brass Tambourine',
    shortLabel: 'Tambourine',
    category: 'Percussion',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Crisp double-row brass jingle accent for energetic transitions.',
  },
  {
    id: 'shaker',
    name: 'Tight Studio Shaker',
    shortLabel: 'Shaker',
    category: 'Percussion',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Short, focused studio shaker pocket pulse.',
  },
  {
    id: 'clav-classic',
    name: 'Classic DAW Quartz / Urei Click',
    shortLabel: 'Classic Click',
    category: 'Studio Clicks',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Traditional Urei / Boss DB-90 studio electronic metronome tone.',
  },
  {
    id: 'snare-tight',
    name: 'Crisp Studio Snare Crack',
    shortLabel: 'Tight Snare',
    category: 'Sticks & Shells',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Tightly damped 14" snare crack for unmistakable transition cues.',
  },
  {
    id: 'kick-tight',
    name: 'Tight Triggered Kick Pulse',
    shortLabel: 'Tight Kick',
    category: 'Sticks & Shells',
    chokesOpenHat: false,
    isOpenHat: false,
    description: 'Punchy sub+beater kick pulse for chest-felt quarter-note lock.',
  },
];

const METRONOME_INSTRUMENT_MAP = Object.fromEntries(
  METRONOME_INSTRUMENTS.map(inst => [inst.id, inst])
);

const METRONOME_PRESETS = [
  {
    id: 'hihat-default',
    name: 'Closed Hi-Hat + Open Hi-Hat on Transition Beat (Default)',
    beatInstrument: 'hihat-closed',
    transitionInstrument: 'hihat-open',
    transitionPlacement: 'turnaround',
  },
  {
    id: 'gemini-choice',
    name: 'Gemini Smart Pick (Chooses Best Pair from List for Song)',
    beatInstrument: 'hihat-closed',
    transitionInstrument: 'hihat-open',
    transitionPlacement: 'turnaround',
    letGeminiChoose: true,
  },
  {
    id: 'ride-and-bell',
    name: '20" Ride Bow + Piercing Ride Bell on Transition',
    beatInstrument: 'ride-bow',
    transitionInstrument: 'ride-bell',
    transitionPlacement: 'downbeat',
  },
  {
    id: 'sticks-and-open-hat',
    name: 'Hickory Drumsticks + Open Hi-Hat on Transition',
    beatInstrument: 'drumsticks',
    transitionInstrument: 'hihat-open',
    transitionPlacement: 'turnaround',
  },
  {
    id: 'hihat-and-cowbell',
    name: 'Closed Hi-Hat + High Studio Cowbell Transition',
    beatInstrument: 'hihat-closed',
    transitionInstrument: 'cowbell-high',
    transitionPlacement: 'downbeat',
  },
  {
    id: 'sidestick-and-open-hat',
    name: 'Snare Cross-Stick + Open Hi-Hat on Transition',
    beatInstrument: 'sidestick',
    transitionInstrument: 'hihat-open',
    transitionPlacement: 'turnaround',
  },
  {
    id: 'woodblock-duo',
    name: 'Low + High Maple Studio Woodblocks',
    beatInstrument: 'woodblock-low',
    transitionInstrument: 'woodblock-high',
    transitionPlacement: 'downbeat',
  },
  {
    id: 'classic-urei',
    name: 'Classic DAW Quartz Click + High Woodblock',
    beatInstrument: 'clav-classic',
    transitionInstrument: 'woodblock-high',
    transitionPlacement: 'downbeat',
  },
];

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

function getHumanClickAnalysisRoot() {
  if (process.env.ROBOS_DAW_CLICK_DIR) return process.env.ROBOS_DAW_CLICK_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'human-click-analysis');
}

function parseJsonFromAgentText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try { return JSON.parse(candidate); } catch {}
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  return null;
}

function encodeMono16Wav(samples, sampleRate = ANALYSIS_RATE) {
  const dataBytes = samples.length * 2;
  const header = makeWavHeader(dataBytes, sampleRate);
  const pcm = Buffer.allocUnsafe(dataBytes);
  for (let i = 0; i < samples.length; i++) {
    const s = clamp(-0.99, 0.99, samples[i]);
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  return Buffer.concat([header, pcm]);
}

/**
 * Deterministic hash noise in `[-1, 1]` for reproducible, zero-jitter percussion synthesis.
 */
function detNoise(sampleIdx, seed = 1) {
  let x = ((sampleIdx + 1) * 374761393 + seed * 668265263) | 0;
  x = (x ^ (x >>> 13)) | 0;
  x = Math.imul(x, 1274126177);
  x = (x ^ (x >>> 16)) >>> 0;
  return (x / 2147483647.5) - 1.0;
}

/**
 * 6-oscillator non-harmonic metallic bronze cymbal network (inspired by TR-808 / physical bronze modes)
 * mixed with high-passed sizzle air so Closed & Open Hi-Hats share a cohesive 14" cymbal pair timbre.
 */
function bronzeAlloyCluster(t, i, seed = 17) {
  const freqs = [296.3, 417.8, 561.4, 739.9, 987.7, 1318.5];
  let sqSum = 0;
  for (let k = 0; k < freqs.length; k++) {
    const ph = (t * freqs[k] * 6.9) % 1;
    sqSum += ph < 0.5 ? 1 : -1;
  }
  const metallic = sqSum / freqs.length;
  const n0 = detNoise(i, seed);
  const n1 = detNoise(Math.max(0, i - 1), seed);
  const n2 = detNoise(Math.max(0, i - 2), seed);
  const hpNoise = n0 - 1.35 * n1 + 0.48 * n2; // Crisp >5.5 kHz air sizzle
  return 0.46 * metallic + 0.54 * hpNoise;
}

/**
 * Synthesize a single zero-pre-delay percussion hit (`Float32Array`) for any instrument in `METRONOME_INSTRUMENTS`.
 */
function synthesizeMetronomeInstrumentHit(instrumentId, {
  sampleRate = 48000,
  velocity = 0.85,
  isAccent = false,
} = {}) {
  const resolvedId = METRONOME_INSTRUMENT_MAP[instrumentId] ? instrumentId : DEFAULT_BEAT_INSTRUMENT;
  const meta = METRONOME_INSTRUMENT_MAP[resolvedId];
  const vel = clamp(0.15, 1.15, Number(velocity) || 0.85);
  const accBoost = isAccent ? 1.14 : 1.0;

  let durSec = 0.065;
  switch (resolvedId) {
    case 'hihat-closed': durSec = isAccent ? 0.058 : 0.044; break;
    case 'hihat-open': durSec = 0.42; break;
    case 'hihat-pedal': durSec = 0.036; break;
    case 'ride-bow': durSec = 0.22; break;
    case 'ride-bell': durSec = 0.27; break;
    case 'drumsticks': durSec = 0.042; break;
    case 'sidestick': durSec = 0.055; break;
    case 'cowbell-high': durSec = 0.125; break;
    case 'cowbell-low': durSec = 0.145; break;
    case 'woodblock-high': durSec = 0.048; break;
    case 'woodblock-low': durSec = 0.054; break;
    case 'tambourine': durSec = 0.15; break;
    case 'shaker': durSec = 0.068; break;
    case 'clav-classic': durSec = 0.048; break;
    case 'snare-tight': durSec = 0.105; break;
    case 'kick-tight': durSec = 0.095; break;
  }

  const len = Math.max(32, Math.floor(durSec * sampleRate));
  const out = new Float32Array(len);
  const attackSamples = Math.max(1, Math.floor(sampleRate * 0.0006)); // 0.6 ms click-free instant attack

  let bpState1 = 0;
  let bpState2 = 0;

  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    const att = Math.min(1, i / attackSamples);
    let s = 0;

    if (resolvedId === 'hihat-closed') {
      const bronze = bronzeAlloyCluster(t, i, 19);
      const stickTip = Math.sin(2 * Math.PI * (isAccent ? 3150 : 2750) * t) * Math.exp(-780 * t);
      const decay = isAccent ? 82 : 108;
      s = (0.76 * bronze * Math.exp(-decay * t)) + (0.48 * stickTip);
    } else if (resolvedId === 'hihat-open') {
      // Paired cymbal wash: two slightly jostling bronze discs + bright sizzle bark
      const bronze = bronzeAlloyCluster(t, i, 31);
      const pairBeat = 1.0 + 0.22 * Math.sin(2 * Math.PI * 34 * t);
      const barkBody = Math.sin(2 * Math.PI * 1680 * t + 1.8 * Math.sin(2 * Math.PI * 710 * t)) * Math.exp(-26 * t);
      const stickShoulder = Math.sin(2 * Math.PI * 2450 * t) * Math.exp(-420 * t);
      const sustainEnv = 0.72 * Math.exp(-6.2 * t) + 0.28 * Math.exp(-18 * t);
      // Gentle tail fade over final 25ms so standalone open hits never click
      const tailFade = i > len - sampleRate * 0.025 ? (len - i) / (sampleRate * 0.025) : 1.0;
      s = ((0.68 * bronze * pairBeat * sustainEnv) + (0.26 * barkBody) + (0.34 * stickShoulder)) * tailFade;
    } else if (resolvedId === 'hihat-pedal') {
      const bronze = bronzeAlloyCluster(t, i, 43);
      const cupAir = Math.sin(2 * Math.PI * 1420 * t) * Math.exp(-220 * t);
      s = 0.64 * bronze * Math.exp(-135 * t) + 0.35 * cupAir;
    } else if (resolvedId === 'ride-bow') {
      const bronze = bronzeAlloyCluster(t, i, 57);
      const ping = (0.65 * Math.sin(2 * Math.PI * 2420 * t) + 0.35 * Math.sin(2 * Math.PI * 910 * t)) * Math.exp(-42 * t);
      const tip = Math.sin(2 * Math.PI * 3800 * t) * Math.exp(-850 * t);
      s = 0.38 * bronze * Math.exp(-14 * t) + 0.56 * ping + 0.32 * tip;
    } else if (resolvedId === 'ride-bell') {
      const bell1 = Math.sin(2 * Math.PI * 1488 * t);
      const bell2 = Math.sin(2 * Math.PI * 3018 * t);
      const bell3 = Math.sin(2 * Math.PI * 4685 * t);
      const bronze = bronzeAlloyCluster(t, i, 61);
      s = (0.52 * bell1 + 0.34 * bell2 + 0.18 * bell3) * Math.exp(-13.5 * t)
        + 0.22 * bronze * Math.exp(-24 * t)
        + 0.35 * Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-700 * t);
    } else if (resolvedId === 'drumsticks') {
      const wood1 = Math.sin(2 * Math.PI * 2180 * t) * Math.exp(-145 * t);
      const wood2 = Math.sin(2 * Math.PI * 3490 * t) * Math.exp(-210 * t);
      const crack = detNoise(i, 73) * Math.exp(-900 * t);
      s = 0.58 * wood1 + 0.38 * wood2 + 0.44 * crack;
    } else if (resolvedId === 'sidestick') {
      const rim = Math.sin(2 * Math.PI * 1190 * t) * Math.exp(-115 * t);
      const shell = Math.sin(2 * Math.PI * 435 * t) * Math.exp(-78 * t);
      const snap = (Math.sin(2 * Math.PI * 2680 * t) + 0.6 * detNoise(i, 89)) * Math.exp(-520 * t);
      s = 0.52 * rim + 0.34 * shell + 0.42 * snap;
    } else if (resolvedId === 'cowbell-high' || resolvedId === 'cowbell-low') {
      const f1 = resolvedId === 'cowbell-high' ? 587.33 : 440.0;
      const f2 = resolvedId === 'cowbell-high' ? 845.10 : 633.6;
      const p1 = Math.tanh(2.2 * Math.sin(2 * Math.PI * f1 * t));
      const p2 = Math.tanh(2.2 * Math.sin(2 * Math.PI * f2 * t));
      const strike = Math.sin(2 * Math.PI * (f2 * 2.4) * t) * Math.exp(-380 * t);
      const env = 0.55 * Math.exp(-48 * t) + 0.45 * Math.exp(-19 * t);
      s = (0.52 * p1 + 0.48 * p2) * env + 0.32 * strike;
    } else if (resolvedId === 'woodblock-high' || resolvedId === 'woodblock-low') {
      const f0 = resolvedId === 'woodblock-high' ? 1244.5 : 880.0;
      const tone = (0.78 * Math.sin(2 * Math.PI * f0 * t) + 0.22 * Math.sin(2 * Math.PI * (f0 * 2.38) * t)) * Math.exp(-105 * t);
      const knock = detNoise(i, 97) * Math.exp(-850 * t);
      s = 0.85 * tone + 0.28 * knock;
    } else if (resolvedId === 'tambourine') {
      const jingle = bronzeAlloyCluster(t, i, 109);
      // Double-strike jingle bounce at t=0 and t=18ms
      const env1 = Math.exp(-42 * t);
      const env2 = t >= 0.018 ? 0.62 * Math.exp(-32 * (t - 0.018)) : 0;
      const ring = (Math.sin(2 * Math.PI * 6450 * t) + 0.7 * Math.sin(2 * Math.PI * 8820 * t)) * 0.25 * (env1 + env2);
      s = 0.68 * jingle * (env1 + env2) + ring;
    } else if (resolvedId === 'shaker') {
      const n = detNoise(i, 127) - detNoise(Math.max(0, i - 1), 127);
      // Shaped grain envelope peaking quickly around 6ms
      const grainEnv = Math.sin(Math.PI * Math.min(1, t / durSec)) * Math.exp(-26 * t);
      s = 0.85 * n * grainEnv;
    } else if (resolvedId === 'snare-tight') {
      const pitch = 192 + 130 * Math.exp(-95 * t);
      const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-38 * t);
      const wires = detNoise(i, 139) * Math.exp(-34 * t);
      s = 0.56 * body + 0.58 * wires;
    } else if (resolvedId === 'kick-tight') {
      // Exact phase integration for punchy swept sub + 2 kHz beater click
      bpState1 += (54 + 145 * Math.exp(-62 * t)) / sampleRate;
      const sub = Math.sin(2 * Math.PI * bpState1) * Math.exp(-28 * t);
      const click = Math.sin(2 * Math.PI * 1950 * t) * Math.exp(-340 * t);
      s = 0.82 * sub + 0.42 * click;
    } else {
      // 'clav-classic': Classic Urei / DAW Click
      const fPrimary = isAccent ? 1318.51 : 880.0;
      const tone = (0.74 * Math.sin(2 * Math.PI * fPrimary * t) + 0.26 * Math.sin(2 * Math.PI * (fPrimary * 0.5) * t)) * Math.exp(-88 * t);
      const snap = Math.sin(2 * Math.PI * 3100 * t) * Math.exp(-950 * t) * 0.35;
      s = tone + snap;
    }

    bpState2 = s * att * vel * accBoost;
    out[i] = clamp(-0.98, 0.98, bpState2);
  }

  return {
    instrumentId: resolvedId,
    samples: out,
    chokesOpenHat: Boolean(meta.chokesOpenHat),
    isOpenHat: Boolean(meta.isOpenHat),
  };
}

/**
 * Render a full, sample-accurate 16-bit PCM WAV click track using selectable studio percussion
 * instruments (defaulting to Closed Hi-Hat + Open Hi-Hat on the transition beat, with authentic
 * acoustic hi-hat foot-chick choke physics!).
 */
function synthesizeInstrumentClickWav({
  bpm = 120,
  beatsPerBar = 4,
  noteValue = 4,
  countInBars = DEFAULT_COUNT_IN_BARS,
  firstDownbeatSec = 2.0,
  songEndSec = 16.0,
  subdivision = 'quarter',
  segments = null,
  beatInstrument = DEFAULT_BEAT_INSTRUMENT,
  transitionInstrument = DEFAULT_TRANSITION_INSTRUMENT,
  transitionPlacement = DEFAULT_TRANSITION_PLACEMENT,
  sampleRate = 48000,
} = {}) {
  const safeCountInBars = clamp(0, 8, Math.round(Number.isFinite(Number(countInBars)) ? Number(countInBars) : DEFAULT_COUNT_IN_BARS));
  const resolvedBeatInst = METRONOME_INSTRUMENT_MAP[beatInstrument] ? beatInstrument : DEFAULT_BEAT_INSTRUMENT;
  const resolvedTransInst = METRONOME_INSTRUMENT_MAP[transitionInstrument] ? transitionInstrument : DEFAULT_TRANSITION_INSTRUMENT;
  const resolvedPlacement = ['turnaround', 'downbeat', 'section'].includes(transitionPlacement)
    ? transitionPlacement
    : DEFAULT_TRANSITION_PLACEMENT;

  const activeSegments = Array.isArray(segments) && segments.length > 0
    ? segments.map((s, idx) => {
        const startAnchor = Number.isFinite(Number(s.firstDownbeatSec))
          ? Number(s.firstDownbeatSec)
          : (idx === 0 ? firstDownbeatSec : Number(s.startSec) || firstDownbeatSec);
        return {
          bpm: clamp(40, 260, Number(s.bpm) || bpm || 120),
          beatsPerBar: clamp(2, 15, Math.round(Number(s.beatsPerBar) || beatsPerBar || 4)),
          noteValue: [2, 4, 8, 16].includes(Number(s.noteValue)) ? Number(s.noteValue) : noteValue,
          subdivision: s.subdivision || subdivision || 'quarter',
          firstDownbeatSec: startAnchor,
          trueDownbeatSec: Number.isFinite(Number(s.trueDownbeatSec)) ? Number(s.trueDownbeatSec) : startAnchor,
          endSec: idx === segments.length - 1
            ? Math.max(Number(s.endSec) || 0, songEndSec)
            : Number(s.endSec) || songEndSec,
        };
      })
    : [{
        bpm: clamp(40, 260, Number(bpm) || 120),
        beatsPerBar: clamp(2, 15, Math.round(Number(beatsPerBar) || 4)),
        noteValue: [2, 4, 8, 16].includes(Number(noteValue)) ? Number(noteValue) : 4,
        subdivision: subdivision || 'quarter',
        firstDownbeatSec,
        trueDownbeatSec: firstDownbeatSec,
        endSec: songEndSec,
      }];

  const openSeg = activeSegments[0];
  const openBeatSec = 60 / openSeg.bpm;
  const openMeasureSec = openSeg.beatsPerBar * openBeatSec;

  const clipStartSec = Math.max(0, Number((openSeg.firstDownbeatSec - safeCountInBars * openMeasureSec).toFixed(4)));
  const finalEndSec = Math.max(songEndSec, activeSegments[activeSegments.length - 1].endSec);
  const totalDurationSec = Math.max(openMeasureSec * 1.5, (finalEndSec - clipStartSec) + Math.max(0.5, openBeatSec * 0.6));
  const totalFrames = Math.ceil(totalDurationSec * sampleRate);
  const floatBuf = new Float32Array(totalFrames);
  const transients = [];

  // Pre-collect all scheduled beat & subdivision events so Open Hi-Hat hits know exact choke point
  const scheduledEvents = [];

  // 1. Count-In Bars before Song First Downbeat
  const countInBeats = safeCountInBars * openSeg.beatsPerBar;
  const openTrip = openSeg.subdivision === 'triplet';
  for (let cb = 0; cb < countInBeats; cb++) {
    const absSec = openSeg.firstDownbeatSec - (countInBeats - cb) * openBeatSec;
    const barPos = cb % openSeg.beatsPerBar;
    const isBarStart = barPos === 0;
    const isLastCountBeat = cb === countInBeats - 1;
    const isTurnaroundBeat = barPos === openSeg.beatsPerBar - 1;

    const useTransitionVoice = resolvedPlacement === 'downbeat'
      ? isBarStart
      : resolvedPlacement === 'section'
        ? isLastCountBeat
        : isTurnaroundBeat;

    scheduledEvents.push({
      absSec,
      instrumentId: useTransitionVoice ? resolvedTransInst : resolvedBeatInst,
      velocity: useTransitionVoice ? 0.94 : (isBarStart ? 0.88 : 0.74),
      isAccent: isBarStart || useTransitionVoice,
      isDownbeat: isBarStart,
      isTransitionBeat: useTransitionVoice,
      isCountIn: true,
      isSubdivision: false,
    });

    if (openTrip) {
      scheduledEvents.push({ absSec: absSec + openBeatSec / 3, instrumentId: 'hihat-pedal', velocity: 0.34, isSubdivision: true });
      scheduledEvents.push({ absSec: absSec + (2 * openBeatSec) / 3, instrumentId: 'hihat-pedal', velocity: 0.34, isSubdivision: true });
    }
  }

  // 2. Song Sections
  let lastClickAbsSec = -999;
  for (let si = 0; si < activeSegments.length; si++) {
    const seg = activeSegments[si];
    const beatSec = 60 / seg.bpm;
    const addEighthGhost = seg.subdivision === 'eighth' && seg.bpm <= 96;
    const addTripletGhost = seg.subdivision === 'triplet';
    const nextSegStart = si < activeSegments.length - 1 ? activeSegments[si + 1].firstDownbeatSec : null;
    const segEndLimit = nextSegStart !== null
      ? nextSegStart - beatSec * 0.42
      : finalEndSec + beatSec * 0.25;

    for (let b = 0; ; b++) {
      const absSec = seg.firstDownbeatSec + b * beatSec;
      if (absSec > segEndLimit) break;
      if (absSec - lastClickAbsSec < beatSec * 0.40) continue;

      const relBeatIdx = Math.round((absSec - seg.trueDownbeatSec) / beatSec);
      const barIdx = Math.floor(relBeatIdx / seg.beatsPerBar);
      const barPos = ((relBeatIdx % seg.beatsPerBar) + seg.beatsPerBar) % seg.beatsPerBar;
      const isDownbeat = barPos === 0;
      const isTurnaround = barPos === seg.beatsPerBar - 1;
      const isBeatBeforeNextSection = nextSegStart !== null && (absSec + beatSec > segEndLimit);
      const isSectionDownbeat = si > 0 && isDownbeat && (absSec - seg.firstDownbeatSec) < beatSec * 0.6;
      const isPhraseTurnaround = isTurnaround && (((barIdx + 1) % 4) === 0);

      let useTransitionVoice = false;
      if (resolvedPlacement === 'turnaround') {
        useTransitionVoice = isTurnaround || isBeatBeforeNextSection;
      } else if (resolvedPlacement === 'downbeat') {
        useTransitionVoice = isDownbeat || isSectionDownbeat;
      } else {
        // 'section': 4-bar phrase turnarounds + section boundaries
        useTransitionVoice = isPhraseTurnaround || isBeatBeforeNextSection || isSectionDownbeat;
      }

      const secondaryCompound = (seg.beatsPerBar === 6 && seg.noteValue === 8 && barPos === 3);
      const velocity = useTransitionVoice
        ? 0.95
        : isDownbeat
          ? 0.90
          : secondaryCompound
            ? 0.80
            : 0.70;

      scheduledEvents.push({
        absSec,
        instrumentId: useTransitionVoice ? resolvedTransInst : resolvedBeatInst,
        velocity,
        isAccent: isDownbeat || useTransitionVoice,
        isDownbeat,
        isTransitionBeat: useTransitionVoice,
        isCountIn: false,
        isSubdivision: false,
      });
      lastClickAbsSec = absSec;

      if (addTripletGhost) {
        if (absSec + beatSec / 3 <= segEndLimit) {
          scheduledEvents.push({ absSec: absSec + beatSec / 3, instrumentId: resolvedBeatInst, velocity: 0.34, isSubdivision: true });
        }
        if (absSec + (2 * beatSec) / 3 <= segEndLimit) {
          scheduledEvents.push({ absSec: absSec + (2 * beatSec) / 3, instrumentId: resolvedBeatInst, velocity: 0.34, isSubdivision: true });
        }
      } else if (addEighthGhost && absSec + beatSec * 0.5 <= segEndLimit) {
        scheduledEvents.push({ absSec: absSec + beatSec * 0.5, instrumentId: resolvedBeatInst, velocity: 0.36, isSubdivision: true });
      }
    }
  }

  scheduledEvents.sort((a, b) => a.absSec - b.absSec);

  // Cache rendered hits by `(instrumentId, quantizedVel, isAccent)` for blazing fast synthesis
  const hitCache = new Map();
  const getVoiceSamples = (instId, vel, isAcc) => {
    const qVel = Math.round(vel * 20) / 20;
    const key = `${instId}:${qVel}:${isAcc ? 1 : 0}`;
    let hit = hitCache.get(key);
    if (!hit) {
      hit = synthesizeMetronomeInstrumentHit(instId, { sampleRate, velocity: qVel, isAccent: isAcc });
      hitCache.set(key, hit);
    }
    return hit;
  };

  for (let ei = 0; ei < scheduledEvents.length; ei++) {
    const ev = scheduledEvents[ei];
    const relSec = ev.absSec - clipStartSec;
    if (relSec < -0.001 || relSec >= totalDurationSec - 0.025) continue;
    const startSample = Math.max(0, Math.round(relSec * sampleRate));

    const voice = getVoiceSamples(ev.instrumentId, ev.velocity, ev.isAccent);
    let maxCopySamples = Math.min(voice.samples.length, totalFrames - startSample);
    let chokeStartSample = -1;
    let chokeLenSamples = 0;

    // Authentic Hi-Hat Foot-Chick Choke: if this event is an Open Hi-Hat, find the next Closed/Pedal Hi-Hat
    // and smoothly damp the open ring right as the hi-hat cymbals clamp shut!
    if (voice.isOpenHat) {
      for (let nxt = ei + 1; nxt < scheduledEvents.length; nxt++) {
        const nextEv = scheduledEvents[nxt];
        const nextMeta = METRONOME_INSTRUMENT_MAP[nextEv.instrumentId];
        if (nextMeta?.chokesOpenHat && !nextEv.isSubdivision) {
          const nextSample = Math.round((nextEv.absSec - clipStartSec) * sampleRate);
          const deltaSamples = nextSample - startSample;
          if (deltaSamples > 0 && deltaSamples < maxCopySamples) {
            chokeLenSamples = Math.min(Math.floor(sampleRate * 0.014), Math.floor(deltaSamples * 0.35));
            chokeStartSample = Math.max(0, deltaSamples - chokeLenSamples);
            maxCopySamples = Math.min(maxCopySamples, deltaSamples + Math.floor(sampleRate * 0.004));
          }
          break;
        }
      }
    }

    for (let i = 0; i < maxCopySamples; i++) {
      let gain = 1.0;
      if (chokeStartSample >= 0 && i >= chokeStartSample) {
        const prog = clamp(0, 1, (i - chokeStartSample) / Math.max(1, chokeLenSamples + sampleRate * 0.004));
        gain = 0.5 * (1 + Math.cos(Math.PI * prog));
      }
      floatBuf[startSample + i] += voice.samples[i] * gain;
    }

    if (!ev.isSubdivision) {
      transients.push({
        timeSec: Number(Math.max(0, relSec).toFixed(4)),
        peakDb: Number((20 * Math.log10(Math.max(0.05, ev.velocity))).toFixed(1)),
        velocity: Number(ev.velocity.toFixed(3)),
        instrumentId: voice.instrumentId,
        isDownbeat: Boolean(ev.isDownbeat),
        isTransitionBeat: Boolean(ev.isTransitionBeat),
      });
    }
  }

  const dataBytes = totalFrames * 2;
  const header = makeWavHeader(dataBytes, sampleRate);
  const pcm = Buffer.allocUnsafe(dataBytes);
  for (let i = 0; i < totalFrames; i++) {
    const clamped = clamp(-0.98, 0.98, floatBuf[i]);
    pcm.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  return {
    wavBuffer: Buffer.concat([header, pcm]),
    clipStartSec,
    durationSec: Number((totalFrames / sampleRate).toFixed(3)),
    transients,
    totalBeats: transients.length,
    beatInstrument: resolvedBeatInst,
    transitionInstrument: resolvedTransInst,
    transitionPlacement: resolvedPlacement,
  };
}

/**
 * Render a quick 2-bar audition WAV so the user can preview their chosen metronome instruments right in the modal.
 */
function synthesizeMetronomePreviewWav({
  beatInstrument = DEFAULT_BEAT_INSTRUMENT,
  transitionInstrument = DEFAULT_TRANSITION_INSTRUMENT,
  transitionPlacement = DEFAULT_TRANSITION_PLACEMENT,
  bpm = 124,
  beatsPerBar = 4,
  noteValue = 4,
  sampleRate = 48000,
} = {}) {
  const safeBpm = clamp(60, 220, Number(bpm) || 124);
  const bpb = clamp(2, 12, Math.round(Number(beatsPerBar) || 4));
  const twoBarsSec = 2 * bpb * (60 / safeBpm);
  return synthesizeInstrumentClickWav({
    bpm: safeBpm,
    beatsPerBar: bpb,
    noteValue,
    countInBars: 0,
    firstDownbeatSec: 0.04,
    songEndSec: 0.04 + twoBarsSec - (60 / safeBpm) * 0.35,
    beatInstrument,
    transitionInstrument,
    transitionPlacement,
    sampleRate,
  });
}

/**
 * Extract human stick/drum/clap tap timestamps and accent velocities from an aligned mono WAV buffer
 * (plus any manual keyboard/UI taps).
 */
function extractHumanTapsFromWav(wavBuffer, {
  clipStartSec = 0,
  minIntervalMs = 140,
  manualTaps = [],
} = {}) {
  const extracted = [];

  if (wavBuffer && wavBuffer.length > 44) {
    const { samples, sampleRate } = decodeWavMono(wavBuffer);
    if (samples.length >= 256) {
      const winSamples = Math.max(24, Math.floor(sampleRate * 0.003)); // 3ms precision windows
      const numWins = Math.floor(samples.length / winSamples);
      const env = new Float32Array(numWins);
      const winPeakIdx = new Int32Array(numWins);
      let globalMax = 0;

      for (let w = 0; w < numWins; w++) {
        const s0 = w * winSamples;
        const s1 = Math.min(samples.length, s0 + winSamples);
        let pk = 0;
        let pkIdx = s0;
        let hfFlux = 0;
        for (let i = s0; i < s1; i++) {
          const a = Math.abs(samples[i]);
          if (a > pk) {
            pk = a;
            pkIdx = i;
          }
          if (i > s0) hfFlux += Math.abs(samples[i] - samples[i - 1]);
        }
        // Weight crisp stick/clap/transient attack edges slightly above steady room hum
        const combined = 0.70 * pk + 0.30 * Math.min(1.0, (hfFlux / (s1 - s0)) * 2.2);
        env[w] = combined;
        winPeakIdx[w] = pkIdx;
        if (combined > globalMax) globalMax = combined;
      }

      if (globalMax > 0.0008) {
        const sorted = Array.from(env).sort((a, b) => a - b);
        const noiseFloor = sorted[Math.floor(sorted.length * 0.50)] || 0.00005;
        const p96 = sorted[Math.floor(sorted.length * 0.96)] || globalMax;
        const snrRatio = globalMax / Math.max(0.00003, noiseFloor);

        if (snrRatio >= 3.2) {
          const thresh = Math.max(noiseFloor * 3.8, Math.min(p96 * 0.34, globalMax * 0.24), 0.0012);
          const minGapSamples = Math.floor((sampleRate * minIntervalMs) / 1000);
          let lastSample = -minGapSamples;

          for (let w = 1; w < numWins - 1; w++) {
            const cur = env[w];
            if (cur < thresh) continue;
            if (cur < env[w - 1] || cur < env[w + 1]) continue;

            // Walk back up to 2 windows to catch exact leading transient attack edge
            let onsetW = w;
            while (onsetW > 1 && env[onsetW - 1] >= cur * 0.48 && env[onsetW - 1] >= thresh * 0.65) {
              onsetW--;
            }
            const samplePos = winPeakIdx[onsetW];
            if (samplePos - lastSample < minGapSamples) {
              // Keep stronger peak if within refractory window
              if (extracted.length > 0 && cur > extracted[extracted.length - 1]._rawEnv) {
                const prev = extracted[extracted.length - 1];
                prev.timeSec = Number((clipStartSec + samplePos / sampleRate).toFixed(4));
                prev._rawEnv = cur;
                prev.peakDb = Number((20 * Math.log10(Math.min(1, cur))).toFixed(1));
              }
              continue;
            }

            extracted.push({
              timeSec: Number((clipStartSec + samplePos / sampleRate).toFixed(4)),
              peakDb: Number((20 * Math.log10(Math.min(1, cur))).toFixed(1)),
              velocity: clamp(0.25, 1.0, cur / Math.max(p96, globalMax * 0.75)),
              _rawEnv: cur,
              source: 'audio',
            });
            lastSample = samplePos;
          }
        }
      }
    }
  }

  // Merge manual taps (Spacebar / UI Tap Button) if any, deduplicating within 55 ms
  if (Array.isArray(manualTaps) && manualTaps.length > 0) {
    for (const mt of manualTaps) {
      const t = Number(mt?.timeSec ?? mt);
      if (!Number.isFinite(t) || t < 0) continue;
      const dup = extracted.some(e => Math.abs(e.timeSec - t) <= 0.055);
      if (!dup) {
        const vel = clamp(0.25, 1.0, Number(mt?.velocity) || (mt?.isAccent ? 0.98 : 0.76));
        extracted.push({
          timeSec: Number(t.toFixed(4)),
          peakDb: Number((20 * Math.log10(vel)).toFixed(1)),
          velocity: vel,
          _rawEnv: vel,
          isManualAccent: Boolean(mt?.isAccent),
          source: 'manual',
        });
      }
    }
  }

  extracted.sort((a, b) => a.timeSec - b.timeSec);

  // Compute local `accentRatio` (how strongly each tap stands out vs surrounding 7 taps)
  for (let i = 0; i < extracted.length; i++) {
    const lo = Math.max(0, i - 3);
    const hi = Math.min(extracted.length - 1, i + 3);
    const localVels = [];
    for (let j = lo; j <= hi; j++) localVels.push(extracted[j].velocity);
    localVels.sort((a, b) => a - b);
    const localMed = localVels[localVels.length >> 1] || 0.5;
    const ratio = extracted[i].isManualAccent
      ? Math.max(1.35, extracted[i].velocity / Math.max(0.1, localMed))
      : extracted[i].velocity / Math.max(0.1, localMed);
    extracted[i].accentRatio = Number(ratio.toFixed(3));
    delete extracted[i]._rawEnv;
  }

  return extracted;
}

/**
 * Live Single-Channel PipeWire Tap Recorder for the "Create Click Track" modal.
 * Streams real-time input levels + live tap detection + live BPM estimate while the user taps along!
 */
class HumanTapCaptureRecorder {
  constructor() {
    this.active = null;
  }

  isRecording() {
    return Boolean(this.active);
  }

  start({
    inputNodeName = '',
    inputLabel = 'Tap Input',
    sampleRate = 48000,
    onMeter = null,
  } = {}) {
    if (this.active) {
      throw new Error('Human tap recording is already active.');
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-human-tap-'));
    const wavFile = path.join(tmpDir, 'human-tap-guide.wav');
    const isManualOnly = !inputNodeName || inputNodeName === '__manual__';

    if (isManualOnly) {
      const startedAtMs = Date.now();
      this.active = {
        isManualOnly: true,
        inputNodeName: '__manual__',
        inputLabel: inputLabel || 'Keyboard / On-Screen Tap Pad',
        sampleRate,
        tmpDir,
        wavFile: null,
        startedAtMs,
        capture: null,
      };
      return {
        ok: true,
        isManualOnly: true,
        startedAtMs,
      };
    }

    let lastSpikeAtSec = -1;
    let rollingNoiseDb = -62;
    const liveTapTimes = [];

    const capture = startDiscreteCaptureSession([
      {
        id: 'human-tap',
        inputNodeName,
        wavFile,
      },
    ], {
      sampleRate,
      meterIntervalMs: 32,
      minFlushIntervalMs: 20,
      sliceDurationSec: 0.02,
      pwLatency: '10ms',
      onMeter: ({ elapsedSec, tracks }) => {
        const m = tracks?.[0];
        if (!m) return;
        const pk = Number(m.peakDb) || -96;
        if (pk < rollingNoiseDb + 6) {
          rollingNoiseDb = 0.92 * rollingNoiseDb + 0.08 * Math.max(-78, pk);
        }
        const spikeThreshDb = Math.max(-44, rollingNoiseDb + 13);
        let tapDetected = false;
        if (pk >= spikeThreshDb && (elapsedSec - lastSpikeAtSec) >= 0.16) {
          tapDetected = true;
          lastSpikeAtSec = elapsedSec;
          liveTapTimes.push(elapsedSec);
          if (liveTapTimes.length > 24) liveTapTimes.shift();
        }

        let liveBpm = null;
        if (liveTapTimes.length >= 3) {
          const iois = [];
          for (let i = Math.max(0, liveTapTimes.length - 9); i < liveTapTimes.length - 1; i++) {
            const dt = liveTapTimes[i + 1] - liveTapTimes[i];
            if (dt >= 0.22 && dt <= 1.6) iois.push(dt);
          }
          if (iois.length >= 2) {
            iois.sort((a, b) => a - b);
            const med = iois[iois.length >> 1];
            liveBpm = Number((60 / med).toFixed(1));
          }
        }

        if (onMeter) {
          try {
            onMeter({
              elapsedSec,
              peakDb: pk,
              maxPeakDb: m.maxPeakDb,
              tapDetected,
              liveTapCount: liveTapTimes.length,
              liveBpm,
            });
          } catch {}
        }
      },
    });

    this.active = {
      isManualOnly: false,
      inputNodeName,
      inputLabel,
      sampleRate,
      tmpDir,
      wavFile,
      startedAtMs: capture.startedAtMs,
      capture,
    };

    return {
      ok: true,
      isManualOnly: false,
      startedAtMs: capture.startedAtMs,
    };
  }

  async waitCaptureReady(timeoutMs = 260) {
    if (!this.active?.capture?.waitReady) return null;
    return this.active.capture.waitReady(timeoutMs);
  }

  getFirstSampleMicWallMs() {
    return this.active?.capture?.getFirstSampleMicWallMs?.() ?? null;
  }

  async cancel() {
    if (!this.active) return { ok: true, canceled: true };
    const cur = this.active;
    this.active = null;
    if (cur.capture) {
      try { await cur.capture.stop(); } catch {}
    }
    if (cur.tmpDir) {
      try { fs.rmSync(cur.tmpDir, { recursive: true, force: true }); } catch {}
    }
    return { ok: true, canceled: true };
  }

  async stop({
    punchStartSec = 0,
    earsStartWallMs = null,
    manualTaps = [],
  } = {}) {
    if (!this.active) {
      return { ok: false, error: 'No active human tap recording session.' };
    }
    const cur = this.active;
    this.active = null;

    let alignedBuffer = null;
    let clipStartSec = Number(punchStartSec) || 0;
    let trimmedSec = 0;

    try {
      if (cur.capture) {
        const firstSampleMicWallMs = cur.capture.getFirstSampleMicWallMs?.() ?? null;
        await cur.capture.stop();
        if (cur.wavFile && fs.existsSync(cur.wavFile)) {
          const rawBuf = fs.readFileSync(cur.wavFile);
          const aligned = alignRecordedWavBuffer(rawBuf, {
            punchStartSec: clipStartSec,
            sampleRate: cur.sampleRate,
            firstSampleMicWallMs,
            earsStartWallMs,
          });
          alignedBuffer = aligned.buffer;
          clipStartSec = aligned.clipStartSec;
          trimmedSec = aligned.trimmedSec;
        }
      }

      const taps = extractHumanTapsFromWav(alignedBuffer, {
        clipStartSec,
        manualTaps,
      });

      return {
        ok: true,
        inputNodeName: cur.inputNodeName,
        inputLabel: cur.inputLabel,
        sampleRate: cur.sampleRate,
        clipStartSec,
        trimmedSec,
        alignedBuffer,
        taps,
      };
    } finally {
      if (cur.tmpDir) {
        try { fs.rmSync(cur.tmpDir, { recursive: true, force: true }); } catch {}
      }
    }
  }
}

/**
 * Compute percussive onset envelope at `ENV_RATE = 200 Hz` (`5 ms`) for cross-correlating
 * human taps directly against the real song's drum/chord transients.
 */
function buildFastSongOnsetEnvelope(mono16k) {
  const numFrames = Math.max(1, Math.floor(mono16k.length / HOP_SAMPLES));
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const base = f * HOP_SAMPLES;
    let sq = 0;
    for (let i = 0; i < HOP_SAMPLES; i++) {
      const x = mono16k[base + i] || 0;
      sq += x * x;
    }
    energy[f] = Math.sqrt(sq / HOP_SAMPLES);
  }
  const onset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    onset[f] = Math.max(0, Math.log1p(40 * energy[f]) - Math.log1p(40 * energy[f - 1]));
  }
  return onset;
}

/**
 * Core Sensor-Fusion Engine: fuses Human Tap Recording (`taps`) with the Real Music Audio (`mono16k` + `dspGrid`)
 * to lock felt BPM, dynamic tempo sections, systematic human motor offset, time signature, and True Beat-1 phase.
 */
function fuseHumanTapsWithMusic(taps, mono16k, {
  earliestStartSec = 0,
  latestEndSec = 16,
  hintTimeSignature = null,
} = {}) {
  const safeTaps = Array.isArray(taps)
    ? [...taps].filter(t => Number.isFinite(Number(t?.timeSec ?? t))).map(t => (
        typeof t === 'number'
          ? { timeSec: t, velocity: 0.8, accentRatio: 1.0, source: 'manual' }
          : {
              timeSec: Number(t.timeSec),
              velocity: clamp(0.1, 1.0, Number(t.velocity) || 0.8),
              accentRatio: Number(t.accentRatio) || 1.0,
              source: t.source || 'audio',
            }
      )).sort((a, b) => a.timeSec - b.timeSec)
    : [];

  const songSpanSec = Math.max(0.5, latestEndSec - earliestStartSec);

  // Step 1: Infer human-felt BPM from outlier-rejected inter-onset intervals (IOIs)
  let humanFeltBpm = null;
  let humanJitterMs = null;
  let tapCoverageRatio = 0;
  let coveredSpanSec = 0;
  const fundamentalIois = [];

  if (safeTaps.length >= 3) {
    const rawIois = [];
    for (let i = 0; i < safeTaps.length - 1; i++) {
      const dt = safeTaps[i + 1].timeSec - safeTaps[i].timeSec;
      if (dt >= 0.18 && dt <= 2.2) rawIois.push(dt);
    }

    if (rawIois.length >= 2) {
      const sortedRaw = [...rawIois].sort((a, b) => a - b);
      const roughMed = sortedRaw[sortedRaw.length >> 1];

      // Unwrap 2x/3x skipped-beat gaps and ignore accidental double-bounces
      for (const dt of rawIois) {
        const ratio = dt / roughMed;
        if (ratio >= 0.74 && ratio <= 1.32) {
          fundamentalIois.push(dt);
        } else if (ratio >= 1.72 && ratio <= 2.32) {
          fundamentalIois.push(dt * 0.5); // User skipped 1 beat; still gives exact 2-beat span!
        } else if (ratio >= 2.68 && ratio <= 3.35) {
          fundamentalIois.push(dt / 3);
        } else if (ratio >= 3.65 && ratio <= 4.35) {
          fundamentalIois.push(dt * 0.25);
        }
      }

      const pool = fundamentalIois.length >= 2 ? fundamentalIois : sortedRaw;
      const sortedPool = [...pool].sort((a, b) => a - b);
      // Trimmed mean around the interquartile core for sub-millisecond BPM stability
      const q1 = Math.floor(sortedPool.length * 0.20);
      const q3 = Math.max(q1 + 1, Math.ceil(sortedPool.length * 0.80));
      let sum = 0;
      for (let i = q1; i < q3; i++) sum += sortedPool[i];
      const coreMeanPeriod = sum / (q3 - q1);
      humanFeltBpm = clamp(42, 250, Number((60 / coreMeanPeriod).toFixed(2)));

      // Measure human timing jitter (MAD -> RMS ms)
      const diffsMs = pool.map(v => Math.abs(v - coreMeanPeriod) * 1000).sort((a, b) => a - b);
      humanJitterMs = Number((diffsMs[diffsMs.length >> 1] * 1.4826).toFixed(1));

      // Compute tap coverage across song (summing active tapped spans where gaps <= 4.5s)
      const beatPeriod = coreMeanPeriod;
      let activeSpan = 0;
      let segStart = safeTaps[0].timeSec;
      let segLast = safeTaps[0].timeSec;
      for (let i = 1; i < safeTaps.length; i++) {
        const t = safeTaps[i].timeSec;
        if (t - segLast <= Math.max(4.5, beatPeriod * 6)) {
          segLast = t;
        } else {
          activeSpan += (segLast - segStart) + beatPeriod;
          segStart = t;
          segLast = t;
        }
      }
      activeSpan += (segLast - segStart) + beatPeriod;
      coveredSpanSec = Number(Math.min(songSpanSec, activeSpan).toFixed(2));
      tapCoverageRatio = Number(clamp(0, 1, coveredSpanSec / songSpanSec).toFixed(3));
    }
  }

  // Step 2: Run full Meter-First Music Beat Grid seeded with `humanFeltBpm`!
  const dspGrid = analyzeAudioBeatGrid(mono16k, {
    earliestStartSec,
    hintBpm: humanFeltBpm,
    hintTimeSignature,
  });

  // Step 3: Cross-correlate human taps against the song's real percussive onset envelope within [-70ms, +70ms]
  // to estimate & remove constant human motor anticipation/reaction offset (`humanAsynchronyMs`)!
  let humanAsynchronyMs = 0;
  const onsetEnv = buildFastSongOnsetEnvelope(mono16k);
  if (safeTaps.length >= 4 && onsetEnv.length > 40) {
    let bestScore = -1;
    let bestShiftFrames = 0;
    // `shiftFrames > 0` means music transient occurs `shiftFrames` AFTER human tap (human tapped slightly early)
    for (let shift = -14; shift <= 14; shift++) { // +-70 ms at 5ms/frame
      let score = 0;
      for (const tap of safeTaps) {
        const f = Math.round((tap.timeSec - earliestStartSec) * ENV_RATE) + shift;
        if (f >= 1 && f < onsetEnv.length - 1) {
          const localMax = Math.max(onsetEnv[f - 1] * 0.85, onsetEnv[f], onsetEnv[f + 1] * 0.85);
          score += localMax * (0.6 + 0.4 * tap.velocity);
        }
      }
      // Subtle prior favoring small motor offset near 0ms when correlation is tied
      const prior = 1 - Math.abs(shift) * 0.006;
      if (score * prior > bestScore) {
        bestScore = score * prior;
        bestShiftFrames = shift;
      }
    }
    if (bestScore > 0) {
      humanAsynchronyMs = Number((bestShiftFrames * (1000 / ENV_RATE)).toFixed(1));
    }
  }

  const biasCorrectedTaps = safeTaps.map(t => ({
    ...t,
    correctedTimeSec: Number((t.timeSec + humanAsynchronyMs / 1000).toFixed(4)),
  }));

  // Step 4: Resolve Fused BPM (locking human's felt octave onto the music's sub-ms comb peak!)
  let fusedBpm = dspGrid.bpm;
  if (humanFeltBpm !== null) {
    // Find any high-scoring music comb candidate within +-7% of `humanFeltBpm` (or octave-shift dspGrid.bpm into human's octave!)
    let bestMatch = null;
    for (const cand of (dspGrid.topTempoCandidates || [])) {
      const relErr = Math.abs(cand.bpm - humanFeltBpm) / humanFeltBpm;
      if (relErr <= 0.075) {
        if (!bestMatch || cand.score > bestMatch.score) bestMatch = cand;
      }
    }

    if (bestMatch) {
      // Weight music's crystal-clear comb grid higher for sub-0.1 BPM precision while staying in human's exact felt octave!
      const musicWeight = dspGrid.combConfidence >= 0.22 ? 0.78 : 0.45;
      fusedBpm = Number((musicWeight * bestMatch.bpm + (1 - musicWeight) * humanFeltBpm).toFixed(2));
    } else {
      // Check if `dspGrid.bpm` is a clean 2x / 0.5x / 1.5x multiple of `humanFeltBpm`
      let octaveAdjustedDsp = dspGrid.bpm;
      if (Math.abs(dspGrid.bpm * 2 - humanFeltBpm) / humanFeltBpm <= 0.065) {
        octaveAdjustedDsp = dspGrid.bpm * 2;
      } else if (Math.abs(dspGrid.bpm * 0.5 - humanFeltBpm) / humanFeltBpm <= 0.065) {
        octaveAdjustedDsp = dspGrid.bpm * 0.5;
      }
      if (Math.abs(octaveAdjustedDsp - humanFeltBpm) / humanFeltBpm <= 0.065 && dspGrid.combConfidence >= 0.20) {
        fusedBpm = Number((0.75 * octaveAdjustedDsp + 0.25 * humanFeltBpm).toFixed(2));
      } else {
        // Music has rubato/ambient/drumless wash — trust the human's direct linear-regression beat grid!
        fusedBpm = humanFeltBpm;
      }
    }
  }

  // Refine steady BPM using global least-squares beat-index slope across all human taps when tap span >= 8s!
  if (biasCorrectedTaps.length >= 8) {
    const span = biasCorrectedTaps[biasCorrectedTaps.length - 1].correctedTimeSec - biasCorrectedTaps[0].correctedTimeSec;
    if (span >= 8.0) {
      const seedPeriod = 60 / fusedBpm;
      let cumulativeBeat = 0;
      const beatIndices = [0];
      let validSteps = 0;
      for (let i = 1; i < biasCorrectedTaps.length; i++) {
        const dt = biasCorrectedTaps[i].correctedTimeSec - biasCorrectedTaps[i - 1].correctedTimeSec;
        const stepBeats = Math.max(1, Math.round(dt / seedPeriod));
        if (Math.abs(dt - stepBeats * seedPeriod) <= seedPeriod * 0.34 && stepBeats <= 6) {
          validSteps++;
        }
        cumulativeBeat += stepBeats;
        beatIndices.push(cumulativeBeat);
      }
      if (validSteps >= (biasCorrectedTaps.length - 1) * 0.72 && cumulativeBeat >= 8) {
        // Ordinary least squares slope `d(time)/d(beat)` across the entire tapped performance
        const n = biasCorrectedTaps.length;
        let meanX = 0, meanY = 0;
        for (let i = 0; i < n; i++) {
          meanX += beatIndices[i];
          meanY += biasCorrectedTaps[i].correctedTimeSec;
        }
        meanX /= n;
        meanY /= n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
          const dx = beatIndices[i] - meanX;
          num += dx * (biasCorrectedTaps[i].correctedTimeSec - meanY);
          den += dx * dx;
        }
        if (den > 1e-6) {
          const regPeriod = num / den;
          const regBpm = 60 / regPeriod;
          if (Math.abs(regBpm - fusedBpm) / fusedBpm <= 0.045) {
            // Blend long-span human regression slope with DSP comb lock
            const wHuman = dspGrid.combConfidence >= 0.35 ? 0.35 : 0.72;
            fusedBpm = Number((wHuman * regBpm + (1 - wHuman) * fusedBpm).toFixed(2));
          }
        }
      }
    }
  }

  // Step 5: Sliding-window Tempo Trajectory across Human Taps (detects live tempo shifts / chorus speedups!)
  const localTempoWindows = [];
  if (biasCorrectedTaps.length >= 10) {
    const winSec = 8.0;
    const stepSec = 4.0;
    const tMin = biasCorrectedTaps[0].correctedTimeSec;
    const tMax = biasCorrectedTaps[biasCorrectedTaps.length - 1].correctedTimeSec;
    for (let wStart = tMin; wStart + 4.5 <= tMax; wStart += stepSec) {
      const wEnd = wStart + winSec;
      const sub = biasCorrectedTaps.filter(t => t.correctedTimeSec >= wStart && t.correctedTimeSec <= wEnd);
      if (sub.length < 5) continue;
      const iois = [];
      const baseP = 60 / fusedBpm;
      for (let i = 0; i < sub.length - 1; i++) {
        const dt = sub[i + 1].correctedTimeSec - sub[i].correctedTimeSec;
        const k = Math.max(1, Math.round(dt / baseP));
        if (k <= 3 && Math.abs(dt / k - baseP) <= baseP * 0.28) {
          iois.push(dt / k);
        }
      }
      if (iois.length >= 4) {
        iois.sort((a, b) => a - b);
        const wPeriod = iois[iois.length >> 1];
        localTempoWindows.push({
          startSec: Number(wStart.toFixed(2)),
          endSec: Number(Math.min(tMax, wEnd).toFixed(2)),
          bpm: Number((60 / wPeriod).toFixed(2)),
          tapCount: sub.length,
        });
      }
    }
  }

  // Coalesce `localTempoWindows` into discrete musical tempo segments if genuine tempo changes (>= 3.2 BPM shift) exist
  let humanDetectedSegments = null;
  if (localTempoWindows.length >= 3) {
    const bpms = localTempoWindows.map(w => w.bpm);
    const minB = Math.min(...bpms);
    const maxB = Math.max(...bpms);
    if (maxB - minB >= 3.5) {
      const groups = [];
      for (const w of localTempoWindows) {
        const prev = groups[groups.length - 1];
        if (prev && Math.abs(w.bpm - prev.bpmSum / prev.count) <= 2.6) {
          prev.endSec = w.endSec;
          prev.bpmSum += w.bpm;
          prev.count++;
          prev.bpm = Number((prev.bpmSum / prev.count).toFixed(2));
        } else {
          groups.push({
            startSec: groups.length === 0 ? earliestStartSec : w.startSec,
            endSec: w.endSec,
            bpmSum: w.bpm,
            count: 1,
            bpm: w.bpm,
          });
        }
      }
      // Keep segments that span at least ~6 seconds so single-fill jitter never fragments a steady song
      const merged = [];
      for (const g of groups) {
        if (merged.length > 0 && (g.endSec - g.startSec) < 5.5) {
          merged[merged.length - 1].endSec = g.endSec;
        } else {
          merged.push({ startSec: g.startSec, endSec: g.endSec, bpm: g.bpm });
        }
      }
      if (merged.length >= 2) {
        merged[merged.length - 1].endSec = Math.max(merged[merged.length - 1].endSec, latestEndSec);
        humanDetectedSegments = merged;
      }
    }
  }

  // Step 6: Human Accent Meter & Bar-Phase Scoring (did the user tap harder on Beat 1 / every K beats?)
  const humanAccentMeterHints = [];
  if (biasCorrectedTaps.length >= 8) {
    const periodSec = 60 / fusedBpm;
    const t0 = biasCorrectedTaps[0].correctedTimeSec;
    for (const K of [4, 3, 6, 5, 7]) {
      const roleAcc = new Float64Array(K);
      const roleCnt = new Int32Array(K);
      for (const tap of biasCorrectedTaps) {
        const beatIdx = Math.round((tap.correctedTimeSec - t0) / periodSec);
        const r = ((beatIdx % K) + K) % K;
        roleAcc[r] += tap.accentRatio;
        roleCnt[r]++;
      }
      let maxRole = 0, sumRole = 0, bestPhase = 0;
      for (let r = 0; r < K; r++) {
        const avg = roleCnt[r] > 0 ? roleAcc[r] / roleCnt[r] : 1.0;
        sumRole += avg;
        if (avg > maxRole) {
          maxRole = avg;
          bestPhase = r;
        }
      }
      const meanOther = K > 1 ? (sumRole - maxRole) / (K - 1) : 1.0;
      const contrast = Number((maxRole - meanOther).toFixed(4));
      if (contrast >= 0.10) {
        humanAccentMeterHints.push({
          beatsPerBar: K,
          noteValue: K === 6 || K === 7 ? 8 : 4,
          timeSignature: `${K}/${K === 6 || K === 7 ? 8 : 4}`,
          accentContrast: contrast,
          accentPhaseBeat: bestPhase,
        });
      }
    }
    humanAccentMeterHints.sort((a, b) => b.accentContrast - a.accentContrast);
  }

  // Combine meter inference: honor explicit hint, strong human accent periodicity, and music DSP meter analysis!
  let fusedBeatsPerBar = dspGrid.beatsPerBar || 4;
  let fusedNoteValue = dspGrid.noteValue || 4;
  if (!hintTimeSignature && humanAccentMeterHints.length > 0 && humanAccentMeterHints[0].accentContrast >= 0.22) {
    const topHumanMeter = humanAccentMeterHints[0];
    const dspAgree = (dspGrid.meterCandidates || []).find(c => c.beatsPerBar === topHumanMeter.beatsPerBar);
    if (dspAgree || dspGrid.combConfidence < 0.28) {
      fusedBeatsPerBar = topHumanMeter.beatsPerBar;
      fusedNoteValue = topHumanMeter.noteValue;
    }
  }
  const fusedTimeSignature = `${fusedBeatsPerBar}/${fusedNoteValue}`;

  // Step 7: Lock Exact Beat & Bar-1 Phase using BOTH Music Comb/Downbeat Resolver AND Human Tap Phase!
  const musicLock = dspGrid.lockPhaseForBpmAndMeter(fusedBpm, fusedBeatsPerBar, fusedNoteValue);
  let firstDownbeatSec = musicLock.firstDownbeatSec;

  if (biasCorrectedTaps.length >= 4) {
    const beatSec = 60 / musicLock.bpm;
    // Measure circular beat-phase offset between human bias-corrected taps and `musicLock.firstDownbeatSec`
    let sinSum = 0, cosSum = 0;
    for (const tap of biasCorrectedTaps) {
      const phaseRad = (2 * Math.PI * (tap.correctedTimeSec - firstDownbeatSec)) / beatSec;
      cosSum += Math.cos(phaseRad) * tap.velocity;
      sinSum += Math.sin(phaseRad) * tap.velocity;
    }
    const humanBeatPhaseOffsetSec = (Math.atan2(sinSum, cosSum) / (2 * Math.PI)) * beatSec;

    // If the music has soft/ambiguous transients (e.g. pad/vocal intro or drumless guitar wash),
    // blend or snap beat phase toward the human's direct tap grid!
    if (dspGrid.combConfidence < 0.18) {
      firstDownbeatSec = Number((firstDownbeatSec + humanBeatPhaseOffsetSec).toFixed(4));
      while (firstDownbeatSec - beatSec >= dspGrid.firstMusicalOnsetSec - 0.04) {
        firstDownbeatSec = Number((firstDownbeatSec - beatSec).toFixed(4));
      }
    }
  }

  const fusedSegments = humanDetectedSegments
    ? dspGrid.lockSegmentsForPlan(
        humanDetectedSegments.map(s => ({
          ...s,
          beatsPerBar: fusedBeatsPerBar,
          noteValue: fusedNoteValue,
        })),
        fusedBeatsPerBar,
        fusedNoteValue
      )
    : (dspGrid.isMultiTempo && safeTaps.length < 6 ? dspGrid.segments : null);

  const tapQualityTier = safeTaps.length === 0
    ? 'none'
    : tapCoverageRatio >= 0.70
      ? 'full'
      : tapCoverageRatio >= 0.25
        ? 'partial'
        : 'seed';

  return {
    tapCount: safeTaps.length,
    tapCoverageRatio,
    tapCoveragePct: Math.round(tapCoverageRatio * 100),
    coveredSpanSec,
    songSpanSec: Number(songSpanSec.toFixed(2)),
    tapQualityTier,
    humanFeltBpm,
    humanJitterMs,
    humanAsynchronyMs,
    humanAccentMeterHints,
    localTempoWindows,
    bpm: musicLock.bpm,
    beatsPerBar: musicLock.beatsPerBar,
    noteValue: musicLock.noteValue,
    timeSignature: fusedTimeSignature,
    subdivision: musicLock.subdivision || dspGrid.subdivision || 'quarter',
    firstDownbeatSec,
    isMultiTempo: Boolean(fusedSegments && fusedSegments.length >= 2),
    segments: fusedSegments,
    dspGrid,
    taps: biasCorrectedTaps,
  };
}

/**
 * End-to-End Human-Guided + Real-Music + Gemini Click Track Producer for a RobOS DAW Project.
 */
async function generateHumanGuidedClickTrackForProject(project, sourceTrackId, {
  taps = [],
  tapWavBuffer = null,
  tapWavPath = null,
  manualTaps = [],
  tapClipStartSec = 0,
  countInBars = DEFAULT_COUNT_IN_BARS,
  beatInstrument = DEFAULT_BEAT_INSTRUMENT,
  transitionInstrument = DEFAULT_TRANSITION_INSTRUMENT,
  transitionPlacement = DEFAULT_TRANSITION_PLACEMENT,
  letGeminiChooseInstruments = false,
  replaceExistingClickTracks = false,
  hintTimeSignature = null,
  preferredProvider = 'antigravity',
  aiAgentModule = null,
  onProgress = null,
  cliTimeoutMs = 34000,
  takesDir,
} = {}) {
  const tracks = project?.tracks || [];
  const sourceIdx = tracks.findIndex(t => t.id === sourceTrackId);
  if (sourceIdx === -1) {
    throw new Error('Target song track not found in session.');
  }
  const sourceTrack = tracks[sourceIdx];
  const referenceTrack = findAlignedReferenceTrack(project, sourceTrack);

  // Extract taps if WAV buffer/path or manual taps were supplied
  let resolvedTaps = Array.isArray(taps) && taps.length > 0 ? taps : null;
  if (!resolvedTaps) {
    let buf = tapWavBuffer;
    if (!buf && tapWavPath && fs.existsSync(tapWavPath)) {
      buf = fs.readFileSync(tapWavPath);
    }
    resolvedTaps = extractHumanTapsFromWav(buf, {
      clipStartSec: tapClipStartSec,
      manualTaps,
    });
  }

  if (onProgress) {
    onProgress({
      stage: 'fusion',
      percent: 28,
      message: resolvedTaps.length > 0
        ? `Fusing ${resolvedTaps.length} human taps with "${sourceTrack.name}" transients & harmonic bar grid...`
        : `Analyzing "${sourceTrack.name}" transients, meter & harmonic bar grid...`,
    });
  }

  const combinedTitle = [sourceTrack.name, ...(sourceTrack.clips || []).map(c => c.name)].join(' ');
  const sigNameMatch = combinedTitle.match(/\b([2-9]|12)\s*\/\s*(4|8)\b/);
  const effectiveHintSig = hintTimeSignature || (sigNameMatch ? `${sigNameMatch[1]}/${sigNameMatch[2]}` : null);

  const assembled = assembleTrackTimelineMono(sourceTrack, { referenceTrack });
  const fusion = fuseHumanTapsWithMusic(resolvedTaps, assembled.mono16k, {
    earliestStartSec: assembled.earliestStartSec,
    latestEndSec: assembled.latestEndSec,
    hintTimeSignature: effectiveHintSig,
  });

  let chosenBpm = fusion.bpm;
  let chosenBeatsPerBar = fusion.beatsPerBar;
  let chosenNoteValue = fusion.noteValue;
  let chosenTimeSignature = fusion.timeSignature;
  let chosenSubdivision = fusion.subdivision;
  let chosenSegmentsPlan = fusion.isMultiTempo ? fusion.segments.map(s => ({ ...s })) : null;
  let chosenBeatInst = METRONOME_INSTRUMENT_MAP[beatInstrument] ? beatInstrument : DEFAULT_BEAT_INSTRUMENT;
  let chosenTransInst = METRONOME_INSTRUMENT_MAP[transitionInstrument] ? transitionInstrument : DEFAULT_TRANSITION_INSTRUMENT;
  let chosenPlacement = ['turnaround', 'downbeat', 'section'].includes(transitionPlacement)
    ? transitionPlacement
    : DEFAULT_TRANSITION_PLACEMENT;

  let agentProviderUsed = fusion.tapCount > 0
    ? 'human-tap + dsp-comb-fusion'
    : 'dsp-meter-comb-correlator';
  let agentReasoning = fusion.tapCount > 0
    ? `Fused ${fusion.tapCount} human taps (${fusion.tapCoveragePct}% song coverage, ${fusion.humanJitterMs ?? 0} ms jitter removed) with real music transients at ${chosenBpm} BPM (${chosenTimeSignature}).`
    : `Locked ${chosenTimeSignature} time signature at ${chosenBpm} BPM from song transients.`;

  let aiAgent = aiAgentModule;
  if (!aiAgent && process.env.ROBOS_TEST !== '1') {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }

  if (aiAgent && typeof aiAgent.ask === 'function') {
    const workId = `hclick-${crypto.randomBytes(3).toString('hex')}`;
    const analysisDir = path.join(getHumanClickAnalysisRoot(), workId);
    fs.mkdirSync(analysisDir, { recursive: true });

    try {
      const excerptAnchorSec = fusion.dspGrid.grooveStartSec ?? fusion.dspGrid.firstMusicalOnsetSec;
      const excerptOffsetSec = Math.max(0, (excerptAnchorSec - assembled.earliestStartSec) - 0.5);
      const exStartSample = Math.floor(excerptOffsetSec * ANALYSIS_RATE);
      const exLenSamples = Math.min(assembled.mono16k.length - exStartSample, ANALYSIS_RATE * 18);
      const excerptSlice = assembled.mono16k.subarray(exStartSample, exStartSample + Math.max(320, exLenSamples));
      fs.writeFileSync(path.join(analysisDir, 'song-excerpt.wav'), encodeMono16Wav(excerptSlice, ANALYSIS_RATE));

      const telemetry = {
        trackName: sourceTrack.name,
        referenceTrackUsed: assembled.usedReferenceTrack,
        clipNames: assembled.clipNames,
        songDurationSec: fusion.songSpanSec,
        humanTapSummary: {
          tapCount: fusion.tapCount,
          tapCoveragePct: fusion.tapCoveragePct,
          tapQualityTier: fusion.tapQualityTier,
          humanFeltBpm: fusion.humanFeltBpm,
          humanJitterMs: fusion.humanJitterMs,
          humanMotorOffsetMs: fusion.humanAsynchronyMs,
          humanAccentMeterHints: fusion.humanAccentMeterHints,
          localTempoWindows: fusion.localTempoWindows,
          sampleTapTimesSec: fusion.taps.slice(0, 64).map(t => ({
            t: t.correctedTimeSec,
            vel: t.velocity,
            accent: t.accentRatio,
          })),
        },
        fusedEstimate: {
          bpm: fusion.bpm,
          timeSignature: fusion.timeSignature,
          beatsPerBar: fusion.beatsPerBar,
          noteValue: fusion.noteValue,
          subdivision: fusion.subdivision,
          firstDownbeatSec: fusion.firstDownbeatSec,
          isMultiTempo: fusion.isMultiTempo,
          segments: fusion.segments,
        },
        musicDspTelemetry: {
          dspPrimaryBpm: fusion.dspGrid.bpm,
          dspDetectedTimeSignature: fusion.dspGrid.timeSignature,
          dspCombConfidence: fusion.dspGrid.combConfidence,
          dspMeterCandidates: fusion.dspGrid.meterCandidates,
          topTempoCandidates: fusion.dspGrid.topTempoCandidates,
        },
        availableMetronomeInstruments: METRONOME_INSTRUMENTS.map(i => ({ id: i.id, name: i.name })),
        userSelectedInstruments: {
          letGeminiChooseInstruments: Boolean(letGeminiChooseInstruments),
          beatInstrument: chosenBeatInst,
          transitionInstrument: chosenTransInst,
          transitionPlacement: chosenPlacement,
        },
      };
      fs.writeFileSync(path.join(analysisDir, 'human-tap-fusion.json'), JSON.stringify(telemetry, null, 2), 'utf8');

      const candidateProviders = [];
      const pushUnique = (id) => { if (id && !candidateProviders.includes(id)) candidateProviders.push(id); };
      pushUnique(preferredProvider || 'antigravity');
      pushUnique('antigravity');
      if (typeof aiAgent.getActiveProviderId === 'function') pushUnique(aiAgent.getActiveProviderId());
      for (const p of (aiAgent.PROVIDERS || [])) pushUnique(p.id);

      const prompt = [
        'You are a world-class studio drum producer and tempo-map engineer.',
        `A musician tapped along to "${sourceTrack.name}" (${assembled.clipNames.join(', ')}) so you can combine their human feel with the real song's transients to build a best-in-class studio click track.`,
        'Read `human-tap-fusion.json` in the current directory (do NOT run shell commands):',
        '  1. Honor `humanTapSummary.humanFeltBpm` for half-time vs double-time pulse feel whenever `tapCount >= 4`, while using `fusedEstimate.bpm` / `musicDspTelemetry` for exact sub-0.1 BPM transient lock!',
        '  2. Determine the true `beatsPerBar` and `noteValue` (e.g. 4/4, 3/4, 6/8, 5/4, 7/8) from `humanAccentMeterHints`, `dspMeterCandidates`, and song style.',
        '  3. If `localTempoWindows` or `fusedEstimate.segments` show genuine tempo changes across sections, return `segments` (`[{"startSec":...,"endSec":...,"bpm":...,"beatsPerBar":...,"noteValue":...}]`); otherwise keep `"segments": null` for a rock-solid constant studio grid.',
        letGeminiChooseInstruments
          ? '  4. Since `letGeminiChooseInstruments` is true, pick `beatInstrument` and `transitionInstrument` from `availableMetronomeInstruments` (defaulting to `"hihat-closed"` and `"hihat-open"` unless ride-bell/cowbell/woodblock cuts better for this genre).'
          : `  4. Keep \`beatInstrument\`: "${chosenBeatInst}" and \`transitionInstrument\`: "${chosenTransInst}".`,
        'Reply ONLY with raw JSON (no markdown fences):',
        `{"bpm":${chosenBpm},"beatsPerBar":${chosenBeatsPerBar},"noteValue":${chosenNoteValue},"subdivision":"${chosenSubdivision}","segments":null,"beatInstrument":"${chosenBeatInst}","transitionInstrument":"${chosenTransInst}","transitionPlacement":"${chosenPlacement}","reasoning":"1 concise studio sentence"}`,
      ].join('\n');

      for (const providerId of candidateProviders) {
        const provDef = aiAgent.PROVIDER_MAP?.[providerId];
        if (provDef && typeof aiAgent.resolveBin === 'function') {
          const bin = aiAgent.resolveBin(provDef);
          const exists = (process.env.PATH || '').split(path.delimiter).some(d => {
            try { fs.accessSync(path.join(d, bin), fs.constants.X_OK); return true; } catch { return false; }
          });
          if (!exists) continue;
        }

        if (onProgress) {
          onProgress({
            stage: 'agent',
            percent: 62,
            providerId,
            message: `Refining human-guided click map & transition beats with ${provDef?.name || providerId}...`,
          });
        }

        const res = await aiAgent.ask(prompt, {
          providerId,
          allowApi: providerId !== 'antigravity',
          cwd: analysisDir,
          skipWritingPreamble: true,
          effort: 'low',
          cliTimeoutMs,
        });

        if (res?.ok && res.text) {
          const parsed = parseJsonFromAgentText(res.text);
          const pBpm = Number(parsed?.bpm);
          if (parsed && (Array.isArray(parsed.segments) || (Number.isFinite(pBpm) && pBpm >= 42 && pBpm <= 250))) {
            if (Array.isArray(parsed.segments) && parsed.segments.length >= 2) {
              const validSegs = parsed.segments
                .filter(s => Number.isFinite(Number(s.bpm)) && Number(s.bpm) >= 42 && Number(s.bpm) <= 250)
                .map((s, idx) => {
                  const baseSeg = fusion.segments?.[idx];
                  const sBpb = clamp(2, 15, Math.round(Number(s.beatsPerBar) || baseSeg?.beatsPerBar || Number(parsed.beatsPerBar) || chosenBeatsPerBar));
                  const sNv = [2, 4, 8, 16].includes(Number(s.noteValue))
                    ? Number(s.noteValue)
                    : (baseSeg?.noteValue || ([2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : chosenNoteValue));
                  return {
                    startSec: Number(s.startSec) || 0,
                    endSec: Number(s.endSec) || assembled.latestEndSec,
                    bpm: Number(s.bpm),
                    beatsPerBar: sBpb,
                    noteValue: sNv,
                  };
                });
              if (validSegs.length >= 2) {
                chosenSegmentsPlan = validSegs;
                chosenBpm = validSegs[0].bpm;
                chosenBeatsPerBar = validSegs[0].beatsPerBar;
                chosenNoteValue = validSegs[0].noteValue;
                chosenTimeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;
              }
            } else if (Number.isFinite(pBpm)) {
              // Guard: if human tapped >= 6 consistent beats, prevent any accidental 2x/0.5x agent hallucination away from human felt pulse
              let acceptedBpm = pBpm;
              if (fusion.tapCount >= 6 && fusion.humanFeltBpm) {
                const relDiff = Math.abs(acceptedBpm - fusion.bpm) / fusion.bpm;
                if (relDiff > 0.12) {
                  acceptedBpm = fusion.bpm;
                }
              }
              chosenSegmentsPlan = null;
              chosenBpm = acceptedBpm;
              chosenBeatsPerBar = clamp(2, 15, Math.round(Number(parsed.beatsPerBar) || chosenBeatsPerBar));
              chosenNoteValue = [2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : chosenNoteValue;
              chosenTimeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;
            }

            if (['quarter', 'eighth', 'triplet'].includes(parsed.subdivision)) {
              chosenSubdivision = parsed.subdivision;
            }
            if (letGeminiChooseInstruments) {
              if (METRONOME_INSTRUMENT_MAP[parsed.beatInstrument]) chosenBeatInst = parsed.beatInstrument;
              if (METRONOME_INSTRUMENT_MAP[parsed.transitionInstrument]) chosenTransInst = parsed.transitionInstrument;
              if (['turnaround', 'downbeat', 'section'].includes(parsed.transitionPlacement)) {
                chosenPlacement = parsed.transitionPlacement;
              }
            }
            agentProviderUsed = provDef?.name || res.provider || providerId;
            if (parsed.reasoning) agentReasoning = String(parsed.reasoning);
            break;
          }
        }
      }
    } finally {
      try { fs.rmSync(analysisDir, { recursive: true, force: true }); } catch {}
    }
  }

  const beatInstMeta = METRONOME_INSTRUMENT_MAP[chosenBeatInst] || METRONOME_INSTRUMENT_MAP[DEFAULT_BEAT_INSTRUMENT];
  const transInstMeta = METRONOME_INSTRUMENT_MAP[chosenTransInst] || METRONOME_INSTRUMENT_MAP[DEFAULT_TRANSITION_INSTRUMENT];

  if (onProgress) {
    onProgress({
      stage: 'synth',
      percent: 86,
      message: `Synthesizing ${beatInstMeta.shortLabel} + ${transInstMeta.shortLabel} click track (${chosenTimeSignature})...`,
    });
  }

  let lockedSegments = null;
  let lockedBpm = chosenBpm;
  let firstDownbeatSec = fusion.firstDownbeatSec;
  let songEndSec = assembled.latestEndSec;

  if (Array.isArray(chosenSegmentsPlan) && chosenSegmentsPlan.length >= 2) {
    lockedSegments = fusion.dspGrid.lockSegmentsForPlan(chosenSegmentsPlan, chosenBeatsPerBar, chosenNoteValue);
    lockedBpm = lockedSegments[0].bpm;
    chosenBeatsPerBar = lockedSegments[0].beatsPerBar;
    chosenNoteValue = lockedSegments[0].noteValue;
    chosenTimeSignature = lockedSegments[0].timeSignature || `${chosenBeatsPerBar}/${chosenNoteValue}`;
    firstDownbeatSec = lockedSegments[0].firstDownbeatSec;
  } else {
    const finalLock = fusion.dspGrid.lockPhaseForBpmAndMeter(chosenBpm, chosenBeatsPerBar, chosenNoteValue);
    lockedBpm = finalLock.bpm;
    chosenBeatsPerBar = finalLock.beatsPerBar;
    chosenNoteValue = finalLock.noteValue;
    chosenTimeSignature = finalLock.timeSignature || `${chosenBeatsPerBar}/${chosenNoteValue}`;
    if (finalLock.subdivision === 'triplet') chosenSubdivision = 'triplet';
    firstDownbeatSec = fusion.dspGrid.combConfidence < 0.18 && fusion.tapCount >= 4
      ? fusion.firstDownbeatSec
      : finalLock.firstDownbeatSec;
  }

  const safeCountInBars = clamp(0, 8, Math.round(Number.isFinite(Number(countInBars)) ? Number(countInBars) : DEFAULT_COUNT_IN_BARS));
  const openBeatSec = 60 / lockedBpm;
  const openCountInSec = safeCountInBars * chosenBeatsPerBar * openBeatSec;

  // Shift timeline forward if needed so the requested count-in bars fit cleanly >= 00:00.08
  let timelineShiftSec = 0;
  if (safeCountInBars > 0 && (firstDownbeatSec - openCountInSec) < 0.08) {
    timelineShiftSec = Number(((openCountInSec - firstDownbeatSec) + 0.10).toFixed(4));
    for (const tr of tracks) {
      for (const cl of (tr.clips || [])) {
        cl.startSec = Number(((Number(cl.startSec) || 0) + timelineShiftSec).toFixed(4));
      }
    }
    if (Array.isArray(project.markers)) {
      for (const mk of project.markers) {
        mk.timeSec = Number(((Number(mk.timeSec) || 0) + timelineShiftSec).toFixed(4));
      }
    }
    firstDownbeatSec = Number((firstDownbeatSec + timelineShiftSec).toFixed(4));
    songEndSec = Number((songEndSec + timelineShiftSec).toFixed(4));
    if (lockedSegments) {
      for (const seg of lockedSegments) {
        seg.startSec = Number((seg.startSec + timelineShiftSec).toFixed(4));
        seg.endSec = Number((seg.endSec + timelineShiftSec).toFixed(4));
        seg.firstDownbeatSec = Number((seg.firstDownbeatSec + timelineShiftSec).toFixed(4));
        if (Number.isFinite(seg.trueDownbeatSec)) {
          seg.trueDownbeatSec = Number((seg.trueDownbeatSec + timelineShiftSec).toFixed(4));
        }
      }
    }
  }

  const sampleRate = Number(project.sampleRate) || 48000;
  const clickSynth = synthesizeInstrumentClickWav({
    bpm: lockedBpm,
    beatsPerBar: chosenBeatsPerBar,
    noteValue: chosenNoteValue,
    countInBars: safeCountInBars,
    firstDownbeatSec,
    songEndSec,
    subdivision: chosenSubdivision,
    segments: lockedSegments,
    beatInstrument: chosenBeatInst,
    transitionInstrument: chosenTransInst,
    transitionPlacement: chosenPlacement,
    sampleRate,
  });

  fs.mkdirSync(takesDir, { recursive: true });
  const clipId = `click-${crypto.randomBytes(4).toString('hex')}`;
  const wavFileName = lockedSegments
    ? `${clipId}-human-tempmap-${Math.round(lockedBpm)}bpm.wav`
    : `${clipId}-human-${Math.round(lockedBpm)}bpm.wav`;
  const wavFilePath = path.join(takesDir, wavFileName);
  fs.writeFileSync(wavFilePath, clickSynth.wavBuffer);

  const numBuckets = Math.min(1600, Math.max(240, Math.round(clickSynth.durationSec * 8)));
  const peakInfo = computeWaveformPeaks(clickSynth.wavBuffer, numBuckets);

  const fmtBpm = (b) => (Number.isInteger(b) ? String(b) : b.toFixed(1));
  const uniqueBpmSummary = lockedSegments
    ? lockedSegments.map(s => fmtBpm(s.bpm)).join('→')
    : fmtBpm(lockedBpm);
  const trackLabelBpm = lockedSegments && lockedSegments.length > 3
    ? `${fmtBpm(lockedSegments[0].bpm)}→…→${fmtBpm(lockedSegments[lockedSegments.length - 1].bpm)} BPM (${lockedSegments.length} Sections)`
    : `${uniqueBpmSummary} BPM`;

  const uniqueSigs = lockedSegments
    ? [...new Set(lockedSegments.map(s => s.timeSignature || `${s.beatsPerBar}/${s.noteValue || 4}`))]
    : [chosenTimeSignature];
  const displayMeterSummary = uniqueSigs.length > 1
    ? uniqueSigs.slice(0, 3).join('·')
    : chosenTimeSignature;

  const instSummary = chosenBeatInst === chosenTransInst
    ? beatInstMeta.shortLabel
    : `${beatInstMeta.shortLabel} + ${transInstMeta.shortLabel}`;

  if (replaceExistingClickTracks) {
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (tracks[i].id === sourceTrackId) continue;
      const isClickTr = /^click\b/i.test(tracks[i].name || '')
        || (tracks[i].clips || []).every(c => c.mediaKind === 'click');
      if (isClickTr && (tracks[i].clips || []).length > 0) {
        tracks.splice(i, 1);
      }
    }
  }

  const updatedSourceIdx = tracks.findIndex(t => t.id === sourceTrackId);
  const insertAtIdx = updatedSourceIdx !== -1 ? updatedSourceIdx + 1 : tracks.length;

  const clickTrack = buildTrackFromWizard({
    profileId: 'acoustic-inst',
    name: `Click (${trackLabelBpm} · ${displayMeterSummary} · ${instSummary})`,
    inputNodeName: '',
    inputLabel: fusion.tapCount > 0
      ? `Human Tap (${fusion.tapCount} taps · ${fusion.tapCoveragePct}%) + ${agentProviderUsed}`
      : `AI Click Track (${agentProviderUsed})`,
    armed: false,
  });
  clickTrack.shortLabel = 'Click';
  clickTrack.color = '#00d4ff';
  clickTrack.image = 'assets/icons/metronome.webp';
  clickTrack.volume = 0.88;
  clickTrack.pan = 0;
  if (tracks.some(t => t.soloed)) {
    clickTrack.soloed = true;
  }
  clickTrack.fx = {
    ...(clickTrack.fx || {}),
    openSourcePlugins: [`RobOS Studio Metronome (${instSummary})`],
    phaseInvert: false,
    gate: { enabled: false, thresholdDb: -60 },
    eq: { enabled: false, hpfHz: 40, lowFreqHz: 100, lowGainDb: 0, midFreqHz: 800, midGainDb: 0, midQ: 1.2, highFreqHz: 8000, highGainDb: 0 },
    compressor: { enabled: false, thresholdDb: -18, ratio: 2, attackMs: 10, releaseMs: 80, makeupDb: 0 },
    drive: { enabled: false, amount: 0 },
    reverb: { enabled: false, type: 'plate', mix: 0, decaySec: 0.5, preDelayMs: 15, dampHz: 7000 },
  };
  clickTrack.soundReplacement = {
    ...(clickTrack.soundReplacement || {}),
    supported: false,
    enabled: false,
  };

  const countLabel = safeCountInBars === 0
    ? 'Click'
    : `${safeCountInBars}-Bar Count + Click`;

  const clickClip = {
    id: clipId,
    name: lockedSegments
      ? `${countLabel} (${uniqueBpmSummary} BPM · ${displayMeterSummary} · ${instSummary})`
      : `${countLabel} (${fmtBpm(lockedBpm)} BPM ${chosenTimeSignature} · ${instSummary})`,
    sourceFile: wavFilePath,
    mediaKind: 'click',
    wavFile: wavFilePath,
    relativeWavPath: path.join('takes', wavFileName),
    fileExists: true,
    startSec: clickSynth.clipStartSec,
    offsetSec: 0,
    durationSec: clickSynth.durationSec,
    sourceDurationSec: clickSynth.durationSec,
    peakDb: peakInfo.peakDb,
    gainDb: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    muted: false,
    peaks: peakInfo.peaks,
    transients: clickSynth.transients,
    clickMeta: {
      beatInstrument: chosenBeatInst,
      transitionInstrument: chosenTransInst,
      transitionPlacement: chosenPlacement,
      countInBars: safeCountInBars,
      humanTapCount: fusion.tapCount,
      humanTapCoveragePct: fusion.tapCoveragePct,
      humanFeltBpm: fusion.humanFeltBpm,
      humanJitterMs: fusion.humanJitterMs,
    },
    tempoSegments: lockedSegments
      ? lockedSegments.map(s => ({
          startSec: s.startSec,
          endSec: s.endSec,
          bpm: s.bpm,
          beatsPerBar: s.beatsPerBar,
          noteValue: s.noteValue || 4,
          timeSignature: s.timeSignature || `${s.beatsPerBar}/${s.noteValue || 4}`,
          trueDownbeatSec: s.trueDownbeatSec,
        }))
      : null,
  };
  clickTrack.clips.push(clickClip);

  if (lockedSegments && lockedSegments.length >= 2) {
    if (!Array.isArray(project.markers)) project.markers = [];
    project.markers = project.markers.filter(m => !String(m.name || '').startsWith('Tempo '));
    let nextNum = project.markers.reduce((mx, m) => Math.max(mx, Number(m.num) || 0), 0) + 1;
    for (const seg of lockedSegments) {
      const segSig = seg.timeSignature || `${seg.beatsPerBar}/${seg.noteValue || 4}`;
      project.markers.push({
        id: `mk-${crypto.randomBytes(3).toString('hex')}`,
        num: nextNum++,
        timeSec: seg.trueDownbeatSec ?? seg.firstDownbeatSec,
        name: `Tempo ${fmtBpm(seg.bpm)} BPM (${segSig})`,
        color: '#00d4ff',
      });
    }
  }

  tracks.splice(insertAtIdx, 0, clickTrack);
  project.bpm = Number(lockedBpm.toFixed(2));
  project.timeSignature = chosenTimeSignature;

  return {
    ok: true,
    project,
    clickTrack,
    clickClip,
    bpm: project.bpm,
    tempoSegments: clickClip.tempoSegments,
    timeSignature: displayMeterSummary,
    beatInstrument: chosenBeatInst,
    transitionInstrument: chosenTransInst,
    transitionPlacement: chosenPlacement,
    countInBars: safeCountInBars,
    countInStartSec: clickSynth.clipStartSec,
    firstDownbeatSec,
    timelineShiftSec,
    tapCount: fusion.tapCount,
    tapCoveragePct: fusion.tapCoveragePct,
    tapQualityTier: fusion.tapQualityTier,
    humanFeltBpm: fusion.humanFeltBpm,
    humanJitterMs: fusion.humanJitterMs,
    provider: agentProviderUsed,
    reasoning: agentReasoning,
  };
}

module.exports = {
  DEFAULT_BEAT_INSTRUMENT,
  DEFAULT_TRANSITION_INSTRUMENT,
  DEFAULT_TRANSITION_PLACEMENT,
  DEFAULT_START_COUNTDOWN_BEATS,
  DEFAULT_COUNT_IN_BARS,
  METRONOME_INSTRUMENTS,
  METRONOME_INSTRUMENT_MAP,
  METRONOME_PRESETS,
  synthesizeMetronomeInstrumentHit,
  synthesizeInstrumentClickWav,
  synthesizeMetronomePreviewWav,
  extractHumanTapsFromWav,
  fuseHumanTapsWithMusic,
  HumanTapCaptureRecorder,
  generateHumanGuidedClickTrackForProject,
};
