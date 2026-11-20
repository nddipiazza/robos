'use strict';

/**
 * RobOS DAW Studio — Meter-First AI + DSP Beat-Locked & Multi-Signature Click Track Generator
 *
 * Pipeline (Music-Signature-First Architecture):
 *   1. Multi-Band Feature Extraction (200 Hz / 5ms):
 *      - 3-band percussive onset flux (Sub/Kick <135 Hz, Snare/Mid 135–2600 Hz, High/Stick >2600 Hz)
 *        with rolling temporal median harmonic suppression.
 *      - 6-band octave-spaced tonal/harmonic chroma prefix sums to detect chord, bass-root, and
 *        riff changes right on bar boundaries (`harmonicChangeEnv`).
 *      - Sustained crash/accent & full-band groove-drop step-up envelopes (`crashAccent`, `dropStep`).
 *   2. Groove-Lock Entry Detection (`grooveStartFrame`):
 *      - Identifies where sustained rhythmic pulse locks in so rubato/ambient intros, YouTube
 *        lead-ins, or pickup fills never corrupt tempo or time-signature inference.
 *   3. Music Signature (Time Signature) Inference FIRST (`detectMeterAndLockDownbeat`):
 *      - Evaluates candidate meters (`4/4`, `3/4`, `6/8`, `5/4`, `7/8`, `2/4`) via beat-domain
 *        bar autocorrelation (Kick, Snare, Chord-Change, Onset), compound triplet vs duple
 *        subdivision analysis, and bar-folded downbeat contrast BEFORE placing metronome clicks.
 *   4. Asymmetric True Beat-1 Downbeat Phase Resolver:
 *      - Eliminates Beat-1-on-Beat-3 swaps by scoring Beat 1 (Kick + Bass/Chord Change + Crash +
 *        Hypermeter + Groove-Drop) asymmetrically against Beats 2 & 4 (Snare Backbeats) and Beat 3,
 *        with pickup-aware backward bar projection so 1-, 2-, or 3-beat pickups ("3 - 4 | 1!")
 *        count in naturally and land "1" dead on True Bar 1, Beat 1.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { decodeWavMono, computeWaveformPeaks } = require('./drum-instruments');
const { makeWavHeader } = require('./pcm-capture');
const { buildTrackFromWizard } = require('./session-manager');

const ANALYSIS_RATE = 16000;
const HOP_SAMPLES = 80; // 5.0 ms frame resolution (200 Hz envelope rate)
const ENV_RATE = ANALYSIS_RATE / HOP_SAMPLES; // 200 Hz

function getClickAnalysisRoot() {
  if (process.env.ROBOS_DAW_CLICK_DIR) return process.env.ROBOS_DAW_CLICK_DIR;
  const home = process.env.HOME || os.homedir();
  return path.join(home, '.local', 'share', 'robos', 'daw-studio', 'click-analysis');
}

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

function dbToGain(db) {
  return Math.pow(10, (Number(db) || 0) / 20);
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

function parseTimeSignatureString(sigStr) {
  const m = String(sigStr || '').trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (num >= 2 && num <= 15 && [2, 4, 8, 16].includes(den)) {
    return { beatsPerBar: num, noteValue: den };
  }
  return null;
}

/**
 * Write a compact 16-bit mono WAV buffer (used to hand a lightweight 16 kHz audio excerpt to Gemini).
 */
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
 * Find an optional time-aligned full-mix sibling track in `project` when `sourceTrack`
 * is a drumless / separated stem (`separatedFromClipId` or `No Drums` / `mixed`), so beat
 * detection benefits from the original drum transients while placing the click under `sourceTrack`.
 */
function findAlignedReferenceTrack(project, sourceTrack) {
  const tracks = project?.tracks || [];
  const srcClips = (sourceTrack?.clips || []).filter(c => !c.muted && c.wavFile && fs.existsSync(c.wavFile));
  if (!srcClips.length) return null;

  const primaryClip = srcClips[0];
  if (primaryClip.separatedFromClipId) {
    for (const tr of tracks) {
      if (tr.id === sourceTrack.id) continue;
      if ((tr.clips || []).some(c => c.id === primaryClip.separatedFromClipId && c.wavFile && fs.existsSync(c.wavFile))) {
        return tr;
      }
    }
  }

  const combinedLabel = `${sourceTrack.name || ''} ${primaryClip.name || ''}`;
  const looksDrumlessOrStem = /no\s*drums|drumless|_mixed\b|\bstem\b/i.test(combinedLabel);
  if (!looksDrumlessOrStem) return null;

  const s0 = Number(primaryClip.startSec) || 0;
  const d0 = Number(primaryClip.durationSec) || 0;
  if (d0 < 4) return null;

  for (const tr of tracks) {
    if (tr.id === sourceTrack.id || tr.armed) continue;
    if (/click/i.test(tr.name || '')) continue;
    for (const c of (tr.clips || [])) {
      if (!c.wavFile || !fs.existsSync(c.wavFile) || c.mediaKind === 'click') continue;
      if (/no\s*drums|drumless/i.test(`${tr.name || ''} ${c.name || ''}`)) continue;
      const cs = Number(c.startSec) || 0;
      const cd = Number(c.durationSec) || 0;
      if (Math.abs(cs - s0) <= 0.03 && Math.abs(cd - d0) <= 0.25) {
        return tr;
      }
    }
  }
  return null;
}

/**
 * Assemble all audible clips on `track` into a single timeline-aligned 16 kHz mono Float32Array
 * starting at `earliestStartSec` across the full song (up to `maxAnalysisSec = 900` = 15 minutes).
 */
function assembleTrackTimelineMono(track, { maxAnalysisSec = 900, referenceTrack = null } = {}) {
  const validClips = (track?.clips || [])
    .filter(c => !c.muted && c.wavFile && fs.existsSync(c.wavFile))
    .sort((a, b) => (Number(a.startSec) || 0) - (Number(b.startSec) || 0));

  if (!validClips.length) {
    throw new Error(`Track "${track?.name || 'Unknown'}" has no audible audio regions to analyze.`);
  }

  let earliestStartSec = Infinity;
  let latestEndSec = 0;
  for (const c of validClips) {
    const s = Math.max(0, Number(c.startSec) || 0);
    const d = Math.max(0.05, Number(c.durationSec) || 0);
    if (s < earliestStartSec) earliestStartSec = s;
    if (s + d > latestEndSec) latestEndSec = s + d;
  }

  const fullSpanSec = Math.max(0.25, latestEndSec - earliestStartSec);
  const analysisSpanSec = Math.min(maxAnalysisSec, fullSpanSec);
  const totalOutSamples = Math.max(320, Math.ceil(analysisSpanSec * ANALYSIS_RATE));
  const mono16k = new Float32Array(totalOutSamples);

  const mixClipsIntoBuffer = (clipsList, targetBuf, weight = 1.0, ignoreClipMute = false) => {
    for (const clip of clipsList) {
      if (!ignoreClipMute && clip.muted) continue;
      if (!clip.wavFile || !fs.existsSync(clip.wavFile)) continue;
      const clipStart = Math.max(0, Number(clip.startSec) || 0);
      const relStartSec = clipStart - earliestStartSec;
      if (relStartSec >= analysisSpanSec || relStartSec < -0.5) continue;

      const wavBuf = fs.readFileSync(clip.wavFile);
      const decoded = decodeWavMono(wavBuf);
      if (!decoded.samples.length) continue;

      const srcSr = decoded.sampleRate || 48000;
      const clipOffSec = Math.max(0, Number(clip.offsetSec) || 0);
      const maxClipDur = Math.max(0.04, decoded.durationSec - clipOffSec);
      const clipDurSec = Math.min(
        maxClipDur,
        Number(clip.durationSec) > 0 ? Number(clip.durationSec) : maxClipDur,
        analysisSpanSec - Math.max(0, relStartSec)
      );
      if (clipDurSec <= 0.02) continue;

      const gainLin = weight * dbToGain(Number(clip.gainDb) || 0);
      const outStartIdx = Math.max(0, Math.floor(relStartSec * ANALYSIS_RATE));
      const outFrames = Math.min(totalOutSamples - outStartIdx, Math.floor(clipDurSec * ANALYSIS_RATE));
      const ratio = srcSr / ANALYSIS_RATE;
      const srcOffsetFrames = clipOffSec * srcSr;
      const stepSpan = Math.max(1, Math.floor(ratio));

      for (let i = 0; i < outFrames; i++) {
        const srcBase = Math.floor(srcOffsetFrames + i * ratio);
        let acc = 0;
        let cnt = 0;
        for (let k = 0; k < stepSpan && (srcBase + k) < decoded.samples.length; k++) {
          acc += decoded.samples[srcBase + k];
          cnt++;
        }
        if (cnt > 0) {
          targetBuf[outStartIdx + i] += (acc / cnt) * gainLin;
        }
      }
    }
  };

  if (referenceTrack && Array.isArray(referenceTrack.clips) && referenceTrack.clips.length > 0) {
    mixClipsIntoBuffer(validClips, mono16k, 0.35, false);
    mixClipsIntoBuffer(referenceTrack.clips, mono16k, 0.75, true);
  } else {
    mixClipsIntoBuffer(validClips, mono16k, 1.0, false);
  }

  let peak = 0;
  for (let i = 0; i < mono16k.length; i++) {
    const a = Math.abs(mono16k[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0.0002) {
    const norm = 0.9 / peak;
    for (let i = 0; i < mono16k.length; i++) mono16k[i] *= norm;
  }

  return {
    mono16k,
    sampleRate: ANALYSIS_RATE,
    earliestStartSec,
    latestEndSec,
    fullSpanSec,
    analysisSpanSec,
    peakLinear: peak,
    usedReferenceTrack: referenceTrack ? referenceTrack.name : null,
    clipNames: validClips.map(c => c.name || path.basename(c.wavFile || '')),
  };
}

/**
 * Fast rolling temporal median filter (window = `2 * halfWin + 1` frames) to suppress
 * horizontal sustained harmonic energy while preserving vertical drum/pluck transients.
 */
function suppressSustainedHarmonics(energyArr, halfWin = 12, suppressRatio = 0.78) {
  const n = energyArr.length;
  const out = new Float32Array(n);
  const scratch = new Float32Array(halfWin * 2 + 1);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(n - 1, i + halfWin);
    let len = 0;
    for (let j = lo; j <= hi; j++) scratch[len++] = energyArr[j];
    for (let a = 1; a < len; a++) {
      const v = scratch[a];
      let b = a - 1;
      while (b >= 0 && scratch[b] > v) {
        scratch[b + 1] = scratch[b];
        b--;
      }
      scratch[b + 1] = v;
    }
    const med = scratch[len >> 1];
    const diff = energyArr[i] - suppressRatio * med;
    out[i] = diff > 0 ? diff : 0;
  }
  return out;
}

function meanCenteredLagCorrelation(arr, lag) {
  const n = arr.length;
  if (lag <= 0 || lag >= n - 2) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += arr[i];
  mean /= n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i + lag < n; i++) {
    const a = arr[i] - mean;
    const b = arr[i + lag] - mean;
    num += a * b;
    denA += a * a;
    denB += b * b;
  }
  const den = Math.sqrt(denA * denB);
  return den > 1e-8 ? num / den : 0;
}

function percentile90(arr) {
  if (!arr.length) return 1;
  const copy = Array.from(arr).sort((a, b) => a - b);
  return copy[Math.min(copy.length - 1, Math.floor(copy.length * 0.90))] || 1e-6;
}

/**
 * Meter-First Beat, Time-Signature & Downbeat Analyzer.
 *
 * 1. Extracts percussive bands + 6-band harmonic pitch-profile prefix sums.
 * 2. Finds `grooveStartFrame` so unmeasured intros / pickups don't distort meter inference.
 * 3. Detects the **Music Time Signature** (`4/4`, `3/4`, `6/8`, `5/4`, `7/8`, `2/4`) FIRST
 *    on each section (or whole song), THEN resolves the exact **True Bar-1 Downbeat Phase**
 *    without Beat-1 / Beat-3 inversion.
 */
function analyzeAudioBeatGrid(mono16k, {
  earliestStartSec = 0,
  hintBpm = null,
  hintTimeSignature = null,
} = {}) {
  const numFrames = Math.max(1, Math.floor(mono16k.length / HOP_SAMPLES));
  const rawSub = new Float32Array(numFrames);   // < 135 Hz: Kick & Bass fundamentals
  const rawMid = new Float32Array(numFrames);   // 135..2400 Hz: Snare body, Toms, Guitar/Vocal body
  const rawHigh = new Float32Array(numFrames);  // > 2400 Hz: Stick snap, Hi-Hat, Crash, Pick attack
  const totalRms = new Float32Array(numFrames);

  // 6-band octave-spaced tonal filterbank (<100, 100-200, 200-400, 400-800, 800-1600, >1600 Hz)
  // stored directly as prefix sums `(numFrames + 1) * 6` for O(1) chord/riff change queries!
  const chromaPrefix = new Float64Array((numFrames + 1) * 6);
  const rmsPrefix = new Float64Array(numFrames + 1);
  const subPrefix = new Float64Array(numFrames + 1);
  const hiMidPrefix = new Float64Array(numFrames + 1);

  const a135 = 1 - Math.exp((-2 * Math.PI * 135) / ANALYSIS_RATE);
  const a2400 = 1 - Math.exp((-2 * Math.PI * 2400) / ANALYSIS_RATE);
  const c100 = 1 - Math.exp((-2 * Math.PI * 100) / ANALYSIS_RATE);
  const c200 = 1 - Math.exp((-2 * Math.PI * 200) / ANALYSIS_RATE);
  const c400 = 1 - Math.exp((-2 * Math.PI * 400) / ANALYSIS_RATE);
  const c800 = 1 - Math.exp((-2 * Math.PI * 800) / ANALYSIS_RATE);
  const c1600 = 1 - Math.exp((-2 * Math.PI * 1600) / ANALYSIS_RATE);

  let lp135_1 = 0, lp135_2 = 0, lp2400 = 0;
  let p100 = 0, p200 = 0, p400 = 0, p800 = 0, p1600 = 0;

  for (let f = 0; f < numFrames; f++) {
    const base = f * HOP_SAMPLES;
    let sSq = 0, mSq = 0, hSq = 0, totSq = 0;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;

    for (let i = 0; i < HOP_SAMPLES; i++) {
      const x = mono16k[base + i] || 0;
      totSq += x * x;

      lp135_1 += a135 * (x - lp135_1);
      lp135_2 += a135 * (lp135_1 - lp135_2);
      lp2400 += a2400 * (x - lp2400);
      const sub = lp135_2;
      const high = x - lp2400;
      const mid = lp2400 - lp135_2;
      sSq += sub * sub;
      mSq += mid * mid;
      hSq += high * high;

      p100 += c100 * (x - p100);
      p200 += c200 * (x - p200);
      p400 += c400 * (x - p400);
      p800 += c800 * (x - p800);
      p1600 += c1600 * (x - p1600);
      const v0 = p100;
      const v1 = p200 - p100;
      const v2 = p400 - p200;
      const v3 = p800 - p400;
      const v4 = p1600 - p800;
      const v5 = x - p1600;
      b0 += v0 * v0;
      b1 += v1 * v1;
      b2 += v2 * v2;
      b3 += v3 * v3;
      b4 += v4 * v4;
      b5 += v5 * v5;
    }

    const rSub = Math.sqrt(sSq / HOP_SAMPLES);
    const rMid = Math.sqrt(mSq / HOP_SAMPLES);
    const rHigh = Math.sqrt(hSq / HOP_SAMPLES);
    const rTot = Math.sqrt(totSq / HOP_SAMPLES);
    rawSub[f] = rSub;
    rawMid[f] = rMid;
    rawHigh[f] = rHigh;
    totalRms[f] = rTot;

    rmsPrefix[f + 1] = rmsPrefix[f] + rTot;
    subPrefix[f + 1] = subPrefix[f] + rSub;
    hiMidPrefix[f + 1] = hiMidPrefix[f] + (0.6 * rMid + 0.8 * rHigh);

    const pOff = (f + 1) * 6;
    const prevOff = f * 6;
    chromaPrefix[pOff + 0] = chromaPrefix[prevOff + 0] + Math.sqrt(b0 / HOP_SAMPLES);
    chromaPrefix[pOff + 1] = chromaPrefix[prevOff + 1] + Math.sqrt(b1 / HOP_SAMPLES);
    chromaPrefix[pOff + 2] = chromaPrefix[prevOff + 2] + Math.sqrt(b2 / HOP_SAMPLES);
    chromaPrefix[pOff + 3] = chromaPrefix[prevOff + 3] + Math.sqrt(b3 / HOP_SAMPLES);
    chromaPrefix[pOff + 4] = chromaPrefix[prevOff + 4] + Math.sqrt(b4 / HOP_SAMPLES);
    chromaPrefix[pOff + 5] = chromaPrefix[prevOff + 5] + Math.sqrt(b5 / HOP_SAMPLES);
  }

  const rangeMean = (prefix, i0, i1) => {
    const a = clamp(0, numFrames, Math.floor(i0));
    const b = clamp(a, numFrames, Math.ceil(i1));
    return b > a ? (prefix[b] - prefix[a]) / (b - a) : 0;
  };

  // Strip sustained notes (~125ms median window) to isolate percussive attacks
  const percSub = suppressSustainedHarmonics(rawSub, 12, 0.72);
  const percMid = suppressSustainedHarmonics(rawMid, 12, 0.80);
  const percHigh = suppressSustainedHarmonics(rawHigh, 12, 0.82);

  const lowFlux = new Float32Array(numFrames);
  const snareFlux = new Float32Array(numFrames);
  const highFlux = new Float32Array(numFrames);
  const rawOnset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const sf = Math.max(0, Math.log1p(55 * percSub[f]) - Math.log1p(55 * percSub[f - 1]));
    const mf = Math.max(0, Math.log1p(45 * percMid[f]) - Math.log1p(45 * percMid[f - 1]));
    const hf = Math.max(0, Math.log1p(45 * percHigh[f]) - Math.log1p(45 * percHigh[f - 1]));
    lowFlux[f] = sf;
    snareFlux[f] = 0.72 * mf + 0.48 * hf;
    highFlux[f] = 0.65 * mf + 0.55 * hf;
    rawOnset[f] = 1.55 * sf + 1.15 * mf + 0.70 * hf;
  }

  // Local moving floor subtraction (0.35s = 70 frames) + 3-tap smoothing
  const onsetEnv = new Float32Array(numFrames);
  const novelty = new Float32Array(numFrames);
  const halfWin = 35;
  let runningSum = 0;
  for (let i = 0; i < Math.min(numFrames, halfWin); i++) runningSum += rawOnset[i];
  for (let i = 0; i < numFrames; i++) {
    const addIdx = i + halfWin;
    const remIdx = i - halfWin - 1;
    if (addIdx < numFrames) runningSum += rawOnset[addIdx];
    if (remIdx >= 0) runningSum -= rawOnset[remIdx];
    const winCount = Math.min(numFrames - 1, i + halfWin) - Math.max(0, i - halfWin) + 1;
    const localMean = runningSum / Math.max(1, winCount);
    novelty[i] = Math.max(0, rawOnset[i] - localMean * 0.85);
  }
  for (let i = 1; i < numFrames - 1; i++) {
    onsetEnv[i] = 0.25 * novelty[i - 1] + 0.5 * novelty[i] + 0.25 * novelty[i + 1];
  }

  const onsetPrefix = new Float64Array(numFrames + 1);
  for (let i = 0; i < numFrames; i++) onsetPrefix[i + 1] = onsetPrefix[i] + onsetEnv[i];

  const sortedEnv = Array.from(onsetEnv).sort((a, b) => a - b);
  const p95 = sortedEnv[Math.floor(sortedEnv.length * 0.95)] || 0.01;
  const maxEnv = sortedEnv[sortedEnv.length - 1] || 0.01;
  const firstOnsetThresh = Math.max(p95 * 0.14, maxEnv * 0.04, 0.003);

  let firstOnsetFrame = 0;
  for (let i = 0; i < numFrames; i++) {
    if (onsetEnv[i] >= firstOnsetThresh) {
      while (i > 0 && onsetEnv[i - 1] > firstOnsetThresh * 0.35 && onsetEnv[i - 1] <= onsetEnv[i]) {
        i--;
      }
      firstOnsetFrame = i;
      break;
    }
  }
  const firstMusicalOnsetSec = Number((earliestStartSec + firstOnsetFrame / ENV_RATE).toFixed(4));

  // Detect `grooveStartFrame`: skip past unmeasured ambient/rubato pads at the very start of long tracks
  // while keeping `grooveStartFrame === firstOnsetFrame` whenever rhythmic music starts right away.
  let grooveStartFrame = firstOnsetFrame;
  const totalDurSec = (numFrames - firstOnsetFrame) / ENV_RATE;
  if (totalDurSec >= 18) {
    const winF = Math.round(4.0 * ENV_RATE);
    const stepF = Math.round(1.0 * ENV_RATE);
    const winStats = [];
    for (let f0 = firstOnsetFrame; f0 + winF <= numFrames; f0 += stepF) {
      const f1 = f0 + winF;
      const rmsM = rangeMean(rmsPrefix, f0, f1);
      const onsM = rangeMean(onsetPrefix, f0, f1);
      let bestNormAc = 0;
      let selfSq = 0;
      for (let i = f0; i < f1; i += 2) selfSq += onsetEnv[i] * onsetEnv[i];
      if (selfSq > 1e-6) {
        for (let lag = 68; lag <= 250; lag += 4) { // ~48..176 BPM lags at 200 Hz
          let s = 0;
          for (let i = f0; i + lag < f1; i += 2) s += onsetEnv[i] * onsetEnv[i + lag];
          const c = s / selfSq;
          if (c > bestNormAc) bestNormAc = c;
        }
      }
      winStats.push({ f0, rmsM, onsM, clarity: bestNormAc });
    }
    if (winStats.length >= 6) {
      const activeWins = winStats.filter(w => w.rmsM > 0.01);
      if (activeWins.length >= 4) {
        const medRms = activeWins.map(w => w.rmsM).sort((a, b) => a - b)[activeWins.length >> 1] || 0.05;
        const medOns = activeWins.map(w => w.onsM).sort((a, b) => a - b)[activeWins.length >> 1] || 0.01;
        const maxSkipFrame = firstOnsetFrame + Math.round(Math.min(32, totalDurSec * 0.28) * ENV_RATE);
        for (const w of winStats) {
          if (w.f0 >= maxSkipFrame) {
            grooveStartFrame = w.f0;
            break;
          }
          // Groove is established once energy AND percussive pulse density reach steady musical levels
          if (w.rmsM >= medRms * 0.42 && w.onsM >= medOns * 0.45 && w.clarity >= 0.16) {
            grooveStartFrame = w.f0 === winStats[0].f0 ? firstOnsetFrame : w.f0;
            break;
          }
        }
      }
    }
  }

  // Strong transient peaks for agent telemetry
  const strongHitTimesSec = [];
  const minPeakGapFrames = 18;
  let lastPeakFrame = -minPeakGapFrames;
  for (let i = 1; i < numFrames - 1; i++) {
    if (
      onsetEnv[i] >= p95 * 0.52 &&
      onsetEnv[i] >= onsetEnv[i - 1] &&
      onsetEnv[i] >= onsetEnv[i + 1] &&
      (i - lastPeakFrame) >= minPeakGapFrames
    ) {
      strongHitTimesSec.push(Number((earliestStartSec + i / ENV_RATE).toFixed(3)));
      lastPeakFrame = i;
      if (strongHitTimesSec.length >= 40) break;
    }
  }

  // O(1) Harmonic / Chord-Root Change across any beat boundary `f0`
  const medianRmsGlobal = rangeMean(rmsPrefix, grooveStartFrame, numFrames) || 0.05;
  const evalHarmonicChangeAtFrame = (f0, periodFrames) => {
    const w = clamp(12, 95, Math.round(periodFrames * 0.85));
    const a0 = clamp(0, numFrames - 1, Math.round(f0 - w));
    const a1 = clamp(a0 + 1, numFrames, Math.round(f0 - 1));
    const b0 = clamp(0, numFrames - 1, Math.round(f0 + 1));
    const b1 = clamp(b0 + 1, numFrames, Math.round(f0 + w));
    const lenA = Math.max(1, a1 - a0);
    const lenB = Math.max(1, b1 - b0);

    let dot = 0, nA = 0, nB = 0;
    for (let k = 0; k < 6; k++) {
      const va = (chromaPrefix[a1 * 6 + k] - chromaPrefix[a0 * 6 + k]) / lenA;
      const vb = (chromaPrefix[b1 * 6 + k] - chromaPrefix[b0 * 6 + k]) / lenB;
      dot += va * vb;
      nA += va * va;
      nB += vb * vb;
    }
    const magA = Math.sqrt(nA);
    const magB = Math.sqrt(nB);
    if (magB < medianRmsGlobal * 0.12) return 0;
    if (magA < medianRmsGlobal * 0.08) {
      // Musical entry out of near-silence: reward proportional to incoming tonal weight
      return clamp(0, 1.0, magB / (medianRmsGlobal * 1.4));
    }
    const cosSim = clamp(0, 1, dot / (magA * magB + 1e-9));
    const energyWeight = clamp(0.25, 1.25, magB / (medianRmsGlobal + 1e-6));
    return (1 - cosSim) * energyWeight;
  };

  const localPeak = (arr, centerFrame, radius = 2) => {
    const c = clamp(0, numFrames - 1, Math.round(centerFrame));
    let mx = arr[c] || 0;
    for (let d = -radius; d <= radius; d++) {
      const idx = clamp(0, numFrames - 1, c + d);
      const wt = d === 0 ? 1.0 : (Math.abs(d) === 1 ? 0.92 : 0.78);
      const v = (arr[idx] || 0) * wt;
      if (v > mx) mx = v;
    }
    return mx;
  };

  /**
   * Evaluate On-Beat minus Off-Beat Pulse Contrast + Subdivision Reinforcement on `[startFrame, endFrame)`.
   * Supports both duple/eighth (`0.5 * P`) and compound triplet (`0.333 * P, 0.667 * P`) subdivisions!
   */
  const evalRangePulseComb = (bpm, startFrame = grooveStartFrame, endFrame = numFrames) => {
    const periodFrames = (60 / bpm) * ENV_RATE;
    const phaseStep = 0.5; // 2.5 ms phase resolution
    let bestContrast = -1e9;
    let bestPerBeatContrast = 0;
    let bestRawSum = 0;
    let bestPhaseFrames = 0;
    let bestDupleSub = 0;
    let bestTripletSub = 0;

    for (let ph = 0; ph < periodFrames; ph += phaseStep) {
      const startK = Math.max(0, Math.ceil((startFrame - ph) / periodFrames));
      let onSum = 0;
      let offSum = 0;
      let dupleSum = 0;
      let tripSum = 0;
      let count = 0;

      for (let pos = ph + startK * periodFrames; pos < endFrame - 2; pos += periodFrames) {
        const idx = Math.floor(pos);
        const frac = pos - idx;
        const center = onsetEnv[idx] * (1 - frac) + onsetEnv[idx + 1] * frac;
        const neighbor = Math.max(
          onsetEnv[Math.max(startFrame, idx - 1)],
          onsetEnv[Math.min(endFrame - 1, idx + 1)]
        ) * 0.80;
        onSum += Math.max(center, neighbor);

        const qPos = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.25));
        const qPos3 = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.75));
        offSum += 0.5 * (onsetEnv[qPos] + onsetEnv[qPos3]);

        const halfPos = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.5));
        dupleSum += onsetEnv[halfPos];

        const tPos1 = Math.min(endFrame - 1, Math.round(pos + periodFrames / 3));
        const tPos2 = Math.min(endFrame - 1, Math.round(pos + (2 * periodFrames) / 3));
        tripSum += 0.5 * (onsetEnv[tPos1] + onsetEnv[tPos2]);
        count++;
      }

      if (count > 0) {
        const subBoost = Math.max(dupleSum - offSum, (tripSum - offSum) * 0.95, 0);
        const num = (onSum - 0.50 * offSum) + 0.18 * subBoost;
        const normDen = Math.pow(count, 0.92);
        const contrast = num / normDen;
        if (contrast > bestContrast) {
          bestContrast = contrast;
          bestPerBeatContrast = num / count;
          bestRawSum = onSum / normDen;
          bestPhaseFrames = ph;
          bestDupleSub = dupleSum / count;
          bestTripletSub = tripSum / count;
        }
      }
    }
    return {
      bpm,
      rawScore: Math.max(0, bestContrast),
      perBeatContrast: Math.max(0, bestPerBeatContrast),
      onBeatAvg: bestRawSum,
      bestPhaseFrames,
      periodFrames,
      dupleSubAvg: bestDupleSub,
      tripletSubAvg: bestTripletSub,
    };
  };

  /**
   * Core Music-Signature-First & Asymmetric Downbeat Phase Resolver!
   *
   * Given locked beat positions `beatFrames` on `[segStartFrame, segEndFrame)`:
   *   Step A: If `forcedMeter` is null, infer the **Music Time Signature** (`4/4`, `3/4`, `6/8`,
   *           `5/4`, `7/8`, `2/4`) from beat-domain bar autocorrelation + subdivision feel +
   *           bar-folded downbeat contrast BEFORE choosing where Beat 1 lands.
   *   Step B: Score every candidate bar phase `m in [0 .. beatsPerBar - 1]` with asymmetric
   *           Beat-1 (Kick + Harmonic Chord Change + Crash + Hypermeter + Groove-Drop) vs
   *           Backbeat (Snare on 2 & 4 in 4/4, Beat 4 in 6/8) so Beat 1 NEVER lands on Beat 3!
   */
  const detectMeterAndResolveDownbeat = (
    beatFrames,
    lockedComb,
    segStartFrame,
    segEndFrame,
    { forcedBeatsPerBar = null, forcedNoteValue = null, isFirstSegment = false } = {}
  ) => {
    const N = beatFrames.length;
    const periodFrames = lockedComb.periodFrames;
    const ph = lockedComb.bestPhaseFrames;

    if (N === 0) {
      const bpb = forcedBeatsPerBar || 4;
      const nv = forcedNoteValue || 4;
      const fb = ph + Math.max(0, Math.ceil((segStartFrame - ph) / periodFrames)) * periodFrames;
      return {
        beatsPerBar: bpb,
        noteValue: nv,
        timeSignature: `${bpb}/${nv}`,
        subdivision: 'quarter',
        downbeatFramePos: fb,
        barPhaseScores: new Array(bpb).fill(0),
        meterCandidates: [{ timeSignature: `${bpb}/${nv}`, beatsPerBar: bpb, noteValue: nv, score: 1 }],
      };
    }

    // Build per-beat musical feature vectors across all beats in this segment
    const rawL = new Float32Array(N);
    const rawS = new Float32Array(N);
    const rawH = new Float32Array(N);
    const rawC = new Float32Array(N);
    const rawDrop = new Float32Array(N);
    const rawO = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      const bf = beatFrames[i];
      rawL[i] = localPeak(lowFlux, bf, 2);
      rawS[i] = localPeak(snareFlux, bf, 2);
      rawH[i] = evalHarmonicChangeAtFrame(bf, periodFrames);
      rawO[i] = localPeak(onsetEnv, bf, 2);

      // Crash / long-sustain accent right after `bf`
      const preHi = rangeMean(hiMidPrefix, bf - periodFrames * 0.6, bf - 2);
      const postHi = rangeMean(hiMidPrefix, bf + 2, bf + periodFrames * 0.65);
      rawC[i] = (localPeak(highFlux, bf, 2) + 0.4 * rawL[i]) * Math.max(0, postHi - 0.78 * preHi);

      // Groove-entry / structural "Drop" step-up: full-bar energy+bass after `bf` vs 2 beats before `bf`
      const prevBarE = rangeMean(rmsPrefix, bf - periodFrames * 2.0, bf - 3) + 1.25 * rangeMean(subPrefix, bf - periodFrames * 2.0, bf - 3);
      const nextBarE = rangeMean(rmsPrefix, bf, bf + periodFrames * 3.5) + 1.25 * rangeMean(subPrefix, bf, bf + periodFrames * 3.5);
      rawDrop[i] = Math.max(0, nextBarE - 1.18 * prevBarE);
    }

    const scaleL = Math.max(percentile90(rawL), 1e-4);
    const scaleS = Math.max(percentile90(rawS), 1e-4);
    const scaleH = Math.max(percentile90(rawH), 1e-4);
    const scaleC = Math.max(percentile90(rawC), 1e-5);
    const scaleDrop = Math.max(percentile90(rawDrop), 1e-4);
    const scaleO = Math.max(percentile90(rawO), 1e-4);

    const bL = new Float32Array(N);
    const bS = new Float32Array(N);
    const bH = new Float32Array(N);
    const bC = new Float32Array(N);
    const bDrop = new Float32Array(N);
    const bO = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      bL[i] = clamp(0, 1.6, rawL[i] / scaleL);
      bS[i] = clamp(0, 1.6, rawS[i] / scaleS);
      bH[i] = clamp(0, 1.6, rawH[i] / scaleH);
      bC[i] = scaleC > 1e-4 ? clamp(0, 1.6, rawC[i] / scaleC) : 0;
      bDrop[i] = scaleDrop > 2e-3 ? clamp(0, 1.8, rawDrop[i] / scaleDrop) : 0;
      bO[i] = clamp(0, 1.6, rawO[i] / scaleO);
    }

    // Helper: Score all `K` bar phases `[0 .. K-1]` for a specific meter `(K, noteValue)`
    const scorePhasesForMeter = (K, noteValue = 4) => {
      const roleL = new Float64Array(K);
      const roleS = new Float64Array(K);
      const roleH = new Float64Array(K);
      const roleC = new Float64Array(K);
      const roleO = new Float64Array(K);
      const roleDropMax = new Float64Array(K);
      const roleCnt = new Int32Array(K);

      for (let i = 0; i < N; i++) {
        const r = i % K;
        // Weight steady groove beats slightly higher than ultra-quiet tail/fadeout beats
        const eWt = clamp(0.35, 1.25, (bO[i] + bL[i] + bS[i]) * 0.65);
        roleL[r] += bL[i] * eWt;
        roleS[r] += bS[i] * eWt;
        roleH[r] += bH[i] * eWt;
        roleC[r] += bC[i] * eWt;
        roleO[r] += bO[i] * eWt;
        if (bDrop[i] > roleDropMax[r]) roleDropMax[r] = bDrop[i];
        roleCnt[r]++;
      }
      for (let r = 0; r < K; r++) {
        const c = Math.max(1, roleCnt[r]);
        roleL[r] /= c;
        roleS[r] /= c;
        roleH[r] /= c;
        roleC[r] /= c;
        roleO[r] /= c;
      }

      // Check whether Beat 0 of `beatFrames` is ALREADY a full-power groove hit (vs a lighter pickup/fill)
      const firstBeatBarE = rangeMean(rmsPrefix, beatFrames[0], beatFrames[0] + periodFrames * 0.9);
      const medGrooveBarE = rangeMean(rmsPrefix, beatFrames[0], beatFrames[Math.min(N - 1, Math.max(0, N - 1))]) || 0.05;
      const startsAtFullGroove = firstBeatBarE >= medGrooveBarE * 0.72 && bL[0] >= 0.55;

      const phaseScores = new Array(K).fill(0);
      for (let m = 0; m < K; m++) {
        const r0 = m; // Candidate Beat 1
        let score = 0;

        if (K === 4) {
          const r1 = (m + 1) % 4; // Beat 2 (Backbeat Snare)
          const r2 = (m + 2) % 4; // Beat 3 (Half-bar Kick or Half-time Snare)
          const r3 = (m + 3) % 4; // Beat 4 (Backbeat Snare / Fill into Beat 1)

          // Asymmetric Beat 1 vs Beat 3 + Snare Backbeats on 2 & 4:
          // Beat 1 gets decisive priority on Kick/Bass (`roleL`), Chord/Riff Root Change (`roleH`),
          // Crash/Phrase Sustain (`roleC`), and Structural Groove-Drop (`roleDropMax`)!
          const beat1Score =
            1.70 * roleL[r0] +
            1.55 * roleH[r0] +
            1.30 * roleC[r0] +
            0.85 * roleDropMax[r0] +
            0.42 * roleO[r0];
          const backbeatScore =
            0.92 * 0.5 * (roleS[r1] + roleS[r3]) -
            0.30 * 0.5 * (roleH[r1] + roleH[r3]) -
            0.18 * 0.5 * (roleL[r1] + roleL[r3]);
          const beat3Score =
            0.52 * roleL[r2] +
            0.34 * roleS[r2] +
            0.22 * roleH[r2] +
            0.15 * roleO[r2];

          // 2-bar & 4-bar Hypermeter tie-breaker between `m` (Beat 1) and `r2` (Beat 3):
          // Phrase crashes & chord changes every 8 or 16 beats land on Beat 1, not Beat 3!
          let hyperDiff = 0;
          let hyperCnt = 0;
          for (let i = m; i < N; i += 4) {
            const j = i + 2;
            if (j < N) {
              hyperDiff += (bH[i] + bC[i] + 0.5 * bL[i]) - (bH[j] + bC[j] + 0.5 * bL[j]);
              hyperCnt++;
            }
          }
          const hyperBonus = hyperCnt > 0 ? 0.35 * (hyperDiff / hyperCnt) : 0;

          score = beat1Score + backbeatScore + beat3Score + hyperBonus;
        } else if (K === 6 && noteValue === 8) {
          // 6/8 Compound Meter: Beat 1 (`m`) = Kick + Chord + Crash; Beat 4 (`m+3`) = Snare Backbeat;
          // Beats 2, 3, 5, 6 = lighter eighth-note subdivisions!
          const rMid = (m + 3) % 6;
          const weakAvg = (
            roleO[(m + 1) % 6] + roleO[(m + 2) % 6] + roleO[(m + 4) % 6] + roleO[(m + 5) % 6]
          ) * 0.25;
          const weakHarm = (
            roleH[(m + 1) % 6] + roleH[(m + 2) % 6] + roleH[(m + 4) % 6] + roleH[(m + 5) % 6]
          ) * 0.25;
          score =
            1.75 * roleL[r0] +
            1.60 * roleH[r0] +
            1.30 * roleC[r0] +
            0.85 * roleDropMax[r0] +
            0.95 * roleS[rMid] +
            0.35 * roleL[rMid] -
            0.45 * weakAvg -
            0.40 * weakHarm;
        } else if (K === 3) {
          // 3/4 Triple Meter: Strong Downbeat on 1 (`m`), lighter accompaniment on 2 & 3
          const r1 = (m + 1) % 3;
          const r2 = (m + 2) % 3;
          score =
            1.75 * roleL[r0] +
            1.60 * roleH[r0] +
            1.30 * roleC[r0] +
            0.85 * roleDropMax[r0] +
            0.45 * roleO[r0] +
            0.25 * (roleS[r1] + roleS[r2]) -
            0.45 * 0.5 * (roleL[r1] + roleL[r2]) -
            0.45 * 0.5 * (roleH[r1] + roleH[r2]);
        } else {
          // General Meter (2/4, 5/4, 7/8, etc.): Strongest Bass + Harmonic Change + Crash + Drop on Beat 1 (`m`)
          let otherL = 0, otherH = 0;
          for (let q = 1; q < K; q++) {
            otherL += roleL[(m + q) % K];
            otherH += roleH[(m + q) % K];
          }
          otherL /= Math.max(1, K - 1);
          otherH /= Math.max(1, K - 1);
          score =
            1.75 * roleL[r0] +
            1.65 * roleH[r0] +
            1.30 * roleC[r0] +
            0.85 * roleDropMax[r0] +
            0.45 * roleO[r0] -
            0.45 * otherL -
            0.45 * otherH;
        }

        // Gentle tie-breaker (ONLY 3%, NEVER 67%!) when Beat 0 is already a full-power groove downbeat
        if (isFirstSegment && m === 0 && startsAtFullGroove) {
          score *= 1.03;
        }
        phaseScores[m] = Math.max(0, score);
      }

      let bestOffset = 0;
      for (let m = 1; m < K; m++) {
        if (phaseScores[m] > phaseScores[bestOffset] * 1.008) {
          bestOffset = m;
        }
      }

      const sortedPh = [...phaseScores].sort((a, b) => b - a);
      const meanOthers = K > 1
        ? (phaseScores.reduce((acc, v) => acc + v, 0) - sortedPh[0]) / (K - 1)
        : 0;
      const phaseContrast = sortedPh[0] > 1e-6
        ? (sortedPh[0] - meanOthers) / (sortedPh[0] + 0.35)
        : 0;

      return {
        beatsPerBar: K,
        noteValue,
        bestOffset,
        phaseScores,
        bestScore: sortedPh[0],
        phaseContrast,
      };
    };

    // ─── STEP A: Detect Music Time Signature FIRST (unless caller explicitly forced a meter) ───
    let chosenBpb = forcedBeatsPerBar;
    let chosenNv = forcedNoteValue || (chosenBpb === 6 || chosenBpb === 7 ? 8 : 4);
    let chosenSubdivision = 'quarter';
    let meterCandidates = [];

    if (!chosenBpb) {
      if (N < 8) {
        chosenBpb = 4;
        chosenNv = 4;
      } else {
        const barCorr = (lag) => {
          if (lag >= N - 2) return 0;
          return (
            0.34 * meanCenteredLagCorrelation(bL, lag) +
            0.30 * meanCenteredLagCorrelation(bS, lag) +
            0.22 * meanCenteredLagCorrelation(bH, lag) +
            0.14 * meanCenteredLagCorrelation(bO, lag)
          );
        };

        const r2 = barCorr(2);
        const r3 = barCorr(3);
        const r4 = barCorr(4);
        const r5 = barCorr(5);
        const r6 = barCorr(6);
        const r7 = barCorr(7);
        const r8 = barCorr(8);
        const r10 = barCorr(10);
        const r12 = barCorr(12);
        const r14 = barCorr(14);

        const p4 = scorePhasesForMeter(4, 4);
        const p3 = scorePhasesForMeter(3, 4);
        const p6 = scorePhasesForMeter(6, 8);
        const p5 = N >= 12 ? scorePhasesForMeter(5, 4) : null;
        const p7 = N >= 14 ? scorePhasesForMeter(7, lockedComb.bpm >= 112 ? 8 : 4) : null;

        const tripletRatio = lockedComb.tripletSubAvg / Math.max(lockedComb.dupleSubAvg + 1e-4, lockedComb.onBeatAvg * 0.12 + 1e-4);
        const compoundFeel = (lockedComb.bpm >= 48 && lockedComb.bpm <= 108 && tripletRatio >= 1.28 && lockedComb.tripletSubAvg > lockedComb.onBeatAvg * 0.22);

        const s4_4 = 0.52 * Math.max(0, r4) + 0.28 * Math.max(0, r8) + 0.22 * Math.max(0, r2) + 0.42 * p4.phaseContrast + 0.11;
        const s3_4 = 0.56 * Math.max(0, r3) + 0.30 * Math.max(0, r6) + 0.44 * p3.phaseContrast - 0.16 * Math.max(0, r4 - r3);
        const s6_8 = 0.52 * Math.max(0, r6) + 0.30 * Math.max(0, r3) + 0.20 * Math.max(0, r12) + 0.46 * p6.phaseContrast + (compoundFeel ? 0.24 : 0) - 0.14 * Math.max(0, r4 - r6);
        const s5_4 = p5 ? (0.58 * Math.max(0, r5) + 0.30 * Math.max(0, r10) + 0.45 * p5.phaseContrast) : 0;
        const s7_8 = p7 ? (0.58 * Math.max(0, r7) + 0.30 * Math.max(0, r14) + 0.45 * p7.phaseContrast) : 0;

        meterCandidates = [
          { timeSignature: '4/4', beatsPerBar: 4, noteValue: 4, score: Number(s4_4.toFixed(4)), barCorr: Number(r4.toFixed(3)) },
          { timeSignature: '6/8', beatsPerBar: 6, noteValue: 8, score: Number(s6_8.toFixed(4)), barCorr: Number(r6.toFixed(3)) },
          { timeSignature: '3/4', beatsPerBar: 3, noteValue: 4, score: Number(s3_4.toFixed(4)), barCorr: Number(r3.toFixed(3)) },
          ...(p5 ? [{ timeSignature: '5/4', beatsPerBar: 5, noteValue: 4, score: Number(s5_4.toFixed(4)), barCorr: Number(r5.toFixed(3)) }] : []),
          ...(p7 ? [{ timeSignature: `7/${p7.noteValue}`, beatsPerBar: 7, noteValue: p7.noteValue, score: Number(s7_8.toFixed(4)), barCorr: Number(r7.toFixed(3)) }] : []),
        ].sort((a, b) => b.score - a.score);

        // Select non-4/4 signature when its harmonic + percussive bar periodicity genuinely dominates 4/4!
        chosenBpb = 4;
        chosenNv = 4;

        if (compoundFeel && s4_4 < s6_8 + 0.10) {
          // Dotted-quarter pulse (e.g. 68 BPM) with unmistakable 3-eighth compound subdivisions -> 6/8!
          chosenBpb = 2;
          chosenNv = 8;
          chosenSubdivision = 'triplet';
        } else {
          const top = meterCandidates[0];
          if (top.beatsPerBar === 7 && r7 >= 0.18 && s7_8 > s4_4 * 1.15 && s7_8 >= s3_4 * 1.06) {
            chosenBpb = 7;
            chosenNv = p7.noteValue;
          } else if (top.beatsPerBar === 5 && r5 >= 0.18 && s5_4 > s4_4 * 1.15 && s5_4 >= s3_4 * 1.06) {
            chosenBpb = 5;
            chosenNv = 4;
          } else if ((top.beatsPerBar === 6 || top.beatsPerBar === 3) && Math.max(r3, r6) >= 0.14 && Math.max(s6_8, s3_4) > s4_4 * 1.10) {
            // Decide between 6/8 (2-group compound with backbeat on 4) vs 3/4 (pure 3-beat waltz/triple)
            if (s6_8 >= s3_4 * 0.98 && lockedComb.bpm >= 96) {
              chosenBpb = 6;
              chosenNv = 8;
            } else {
              chosenBpb = 3;
              chosenNv = 4;
            }
          }
        }
      }
    }

    // ─── STEP B: Lock Exact Bar-1 Downbeat Phase on the Detected Time Signature ───
    const finalPhaseEval = scorePhasesForMeter(chosenBpb, chosenNv);
    const bestBarOffset = finalPhaseEval.bestOffset;

    let downbeatFramePos = N > bestBarOffset
      ? beatFrames[bestBarOffset]
      : beatFrames[0];

    if (isFirstSegment) {
      const measureFrames = chosenBpb * periodFrames;
      const grooveBeatMean = rangeMean(onsetPrefix, segStartFrame, segEndFrame);
      const refRmsMean = Math.max(rangeMean(rmsPrefix, segStartFrame, segEndFrame), medianRmsGlobal * 0.85);

      // Project backward by exact integer measures ONLY while earlier bars contain genuine beat-locked
      // musical pulses (`onBeatAvg > offBeatAvg * 1.18`) and real musical level — stops cleanly before
      // 1/2/3-beat pickups AND stops before unpulsed rubato/sleigh-bell/ambient intros!
      while (downbeatFramePos - measureFrames >= firstOnsetFrame - periodFrames * 0.18) {
        const candPos = downbeatFramePos - measureFrames;
        const barRms = rangeMean(rmsPrefix, candPos, downbeatFramePos);
        let onBeatHitSum = 0;
        let offBeatHitSum = 0;
        for (let b = 0; b < chosenBpb; b++) {
          const bCenter = candPos + b * periodFrames;
          onBeatHitSum += localPeak(onsetEnv, bCenter, 2);
          offBeatHitSum += 0.5 * (
            onsetEnv[clamp(0, numFrames - 1, Math.round(bCenter + periodFrames * 0.25))] +
            onsetEnv[clamp(0, numFrames - 1, Math.round(bCenter + periodFrames * 0.75))]
          );
        }
        const onBeatAvg = onBeatHitSum / chosenBpb;
        const offBeatAvg = offBeatHitSum / chosenBpb;
        if (
          barRms >= refRmsMean * 0.30 &&
          onBeatAvg >= grooveBeatMean * 0.35 &&
          onBeatAvg > offBeatAvg * 1.18
        ) {
          downbeatFramePos = candPos;
        } else {
          break;
        }
      }
    }

    const displayTimeSignature = (chosenBpb === 2 && chosenNv === 8 && chosenSubdivision === 'triplet')
      ? '6/8'
      : `${chosenBpb}/${chosenNv}`;

    return {
      beatsPerBar: chosenBpb,
      noteValue: chosenNv,
      timeSignature: displayTimeSignature,
      subdivision: chosenSubdivision,
      bestBarOffset,
      downbeatFramePos,
      barPhaseScores: finalPhaseEval.phaseScores.map(v => Number(v.toFixed(4))),
      meterCandidates,
    };
  };

  /**
   * Polish BPM to 0.02 BPM, detect Time Signature FIRST (unless forced), & lock 2.5ms downbeat phase.
   */
  const lockSegmentGrid = (
    seedBpm,
    segStartFrame,
    segEndFrame,
    { forcedBeatsPerBar = null, forcedNoteValue = null, isFirstSegment = false } = {}
  ) => {
    const analysisStart = isFirstSegment ? grooveStartFrame : segStartFrame;
    let locked = evalRangePulseComb(seedBpm, analysisStart, segEndFrame);
    const searchRadius = 1.4;
    for (let b = seedBpm - searchRadius; b <= seedBpm + searchRadius + 0.001; b += 0.1) {
      const cur = Number(b.toFixed(2));
      if (cur < 42 || cur > 250) continue;
      const ev = evalRangePulseComb(cur, analysisStart, segEndFrame);
      if (ev.rawScore > locked.rawScore * 1.004) locked = ev;
    }
    const fineCenter = locked.bpm;
    for (let b = fineCenter - 0.14; b <= fineCenter + 0.1401; b += 0.02) {
      const cur = Number(b.toFixed(2));
      if (cur < 42 || cur > 250) continue;
      const ev = evalRangePulseComb(cur, analysisStart, segEndFrame);
      if (ev.rawScore > locked.rawScore * 1.002) locked = ev;
    }

    const nearestInt = Math.round(locked.bpm);
    if (Math.abs(locked.bpm - nearestInt) <= 0.18) {
      const intEv = evalRangePulseComb(nearestInt, analysisStart, segEndFrame);
      if (intEv.rawScore >= locked.rawScore * 0.962) {
        locked = { ...intEv, bpm: nearestInt };
      }
    }

    const periodFrames = locked.periodFrames;
    const ph = locked.bestPhaseFrames;
    const minAnchorFrame = isFirstSegment ? Math.max(0, analysisStart - periodFrames * 0.15) : segStartFrame;
    const firstK = Math.max(0, Math.ceil((minAnchorFrame - ph) / periodFrames));
    const beatFrames = [];
    for (let k = firstK; ; k++) {
      const pos = ph + k * periodFrames;
      if (pos >= segEndFrame - 1) break;
      beatFrames.push(pos);
    }

    let meterAndPhase = detectMeterAndResolveDownbeat(
      beatFrames,
      locked,
      analysisStart,
      segEndFrame,
      { forcedBeatsPerBar, forcedNoteValue, isFirstSegment }
    );

    // Simple-Quarter vs Eighth-Pulse Meter Disambiguator (`3/4` vs `6/8`, `7/4` vs `7/8`, `5/4` vs `5/8`):
    // At half-tempo B (e.g. 75 BPM or 70 BPM), two bars of 7/8 (= 14 eighths) look like one bar of 7/4 (= 7 quarters),
    // and one bar of 6/8 (= 6 eighths at 2*B) looks like 3/4 (= 3 quarters at B), EXCEPT the true 6/8 backbeat (slot 3)
    // or second 7/8 / 5/8 bar downbeat (slot 7 or slot 5) lands on an ODD eighth-note (an off-beat at tempo B!).
    if (!forcedBeatsPerBar && [3, 5, 7].includes(meterAndPhase.beatsPerBar) && locked.bpm <= 108 && locked.bpm * 2 <= 215) {
      const K = meterAndPhase.beatsPerBar;
      const doubleBpm = Number((locked.bpm * 2).toFixed(2));
      const doubleComb = evalRangePulseComb(doubleBpm, analysisStart, segEndFrame);
      const dPeriod = doubleComb.periodFrames;
      const dPh = doubleComb.bestPhaseFrames;
      const dMinAnchor = isFirstSegment ? Math.max(0, analysisStart - dPeriod * 0.15) : segStartFrame;
      const dFirstK = Math.max(0, Math.ceil((dMinAnchor - dPh) / dPeriod));
      const dBeatFrames = [];
      for (let k = dFirstK; ; k++) {
        const pos = dPh + k * dPeriod;
        if (pos >= segEndFrame - 1) break;
        dBeatFrames.push(pos);
      }

      if (K === 3 && dBeatFrames.length >= 12) {
        const cand68 = detectMeterAndResolveDownbeat(
          dBeatFrames,
          doubleComb,
          analysisStart,
          segEndFrame,
          { forcedBeatsPerBar: 6, forcedNoteValue: 8, isFirstSegment }
        );
        const mOff = cand68.bestBarOffset;
        let e0 = 0, e3 = 0, e24 = 0, bars = 0;
        for (let bi = mOff; bi + 5 < dBeatFrames.length; bi += 6) {
          e0 += localPeak(lowFlux, dBeatFrames[bi], 2) + localPeak(onsetEnv, dBeatFrames[bi], 2);
          e3 += localPeak(snareFlux, dBeatFrames[bi + 3], 2) + localPeak(onsetEnv, dBeatFrames[bi + 3], 2);
          e24 += 0.5 * (
            localPeak(snareFlux, dBeatFrames[bi + 2], 2) + localPeak(onsetEnv, dBeatFrames[bi + 2], 2) +
            localPeak(snareFlux, dBeatFrames[bi + 4], 2) + localPeak(onsetEnv, dBeatFrames[bi + 4], 2)
          );
          bars++;
        }
        if (bars >= 2 && e3 > e24 * 1.22 && (e0 / bars) > 0.02) {
          locked = doubleComb;
          beatFrames.length = 0;
          beatFrames.push(...dBeatFrames);
          meterAndPhase = cand68;
        }
      } else if ((K === 7 || K === 5) && dBeatFrames.length >= K * 3) {
        const candOdd8 = detectMeterAndResolveDownbeat(
          dBeatFrames,
          doubleComb,
          analysisStart,
          segEndFrame,
          { forcedBeatsPerBar: K, forcedNoteValue: 8, isFirstSegment }
        );
        // In true K/8 (7/8 or 5/8), EVERY K eighth-notes (both even bars 0, 2K AND odd bars K, 3K!) has a strong downbeat!
        const mOff = candOdd8.bestBarOffset;
        let oddBarDownbeats = 0, weakSlots = 0, oddCnt = 0;
        for (let barIdx = 0; mOff + barIdx * K + (K - 1) < dBeatFrames.length; barIdx++) {
          if (barIdx % 2 === 1) {
            const bf = dBeatFrames[mOff + barIdx * K];
            oddBarDownbeats += localPeak(lowFlux, bf, 2) + evalHarmonicChangeAtFrame(bf, dPeriod) + localPeak(onsetEnv, bf, 2);
            const wf = dBeatFrames[mOff + barIdx * K + 1];
            weakSlots += localPeak(lowFlux, wf, 2) + evalHarmonicChangeAtFrame(wf, dPeriod) + localPeak(onsetEnv, wf, 2);
            oddCnt++;
          }
        }
        if (oddCnt >= 2 && oddBarDownbeats > weakSlots * 1.35) {
          locked = doubleComb;
          beatFrames.length = 0;
          beatFrames.push(...dBeatFrames);
          meterAndPhase = candOdd8;
        }
      }
    }

    const downbeatFramePos = meterAndPhase.downbeatFramePos;

    return {
      bpm: Number(locked.bpm.toFixed(2)),
      beatsPerBar: meterAndPhase.beatsPerBar,
      noteValue: meterAndPhase.noteValue,
      timeSignature: meterAndPhase.timeSignature,
      subdivision: meterAndPhase.subdivision,
      phaseFrames: ph,
      periodFrames,
      firstBeatFrame: beatFrames[0] ?? downbeatFramePos,
      downbeatFramePos,
      firstDownbeatSec: Number((earliestStartSec + downbeatFramePos / ENV_RATE).toFixed(4)),
      trueDownbeatSec: Number((earliestStartSec + downbeatFramePos / ENV_RATE).toFixed(4)),
      barPhaseScores: meterAndPhase.barPhaseScores,
      meterCandidates: meterAndPhase.meterCandidates,
      rawScore: locked.rawScore,
      perBeatContrast: locked.perBeatContrast,
      combConfidence: Number(clamp(0.45, 0.99, locked.onBeatAvg / Math.max(0.02, p95 * 1.35)).toFixed(2)),
    };
  };

  const parsedHintSig = parseTimeSignatureString(hintTimeSignature);

  // ─── Stage 1: Global Constant-Tempo Candidates (on established groove) ─────
  const coarseCandidates = [];
  for (let bpm = 68; bpm <= 186; bpm += 0.5) {
    const period = (60 / bpm) * ENV_RATE;
    let ac = 0;
    // Include BOTH duple/quadruple (2x, 4x, 8x) AND triple/odd (3x, 6x, 7x) bar lags so non-4/4 music isn't penalized!
    for (const [mult, wt] of [[1, 1.0], [2, 0.72], [3, 0.52], [4, 0.58], [6, 0.42]]) {
      const lag = period * mult;
      const li = Math.floor(lag);
      const fr = lag - li;
      if (grooveStartFrame + li + 2 >= numFrames) continue;
      let sum = 0;
      let cnt = 0;
      for (let i = grooveStartFrame; i + li + 1 < numFrames; i += 2) {
        const interp = onsetEnv[i + li] * (1 - fr) + onsetEnv[i + li + 1] * fr;
        sum += onsetEnv[i] * interp;
        cnt++;
      }
      if (cnt > 0) ac += wt * (sum / cnt);
    }
    const logDist = Math.log2(bpm / 124);
    const prior = 0.74 + 0.26 * Math.exp(-0.5 * Math.pow(logDist / 0.65, 2));
    coarseCandidates.push({ bpm, score: ac * prior });
  }
  coarseCandidates.sort((a, b) => b.score - a.score);

  const distinctPeaks = [];
  if (Number.isFinite(hintBpm) && hintBpm >= 45 && hintBpm <= 240) {
    distinctPeaks.push(hintBpm);
  }
  for (const c of coarseCandidates) {
    if (distinctPeaks.every(p => Math.abs(p - c.bpm) > 3.5)) {
      distinctPeaks.push(c.bpm);
      if (distinctPeaks.length >= 6) break;
    }
  }

  const refinedCandidates = [];
  for (const seed of distinctPeaks) {
    const locked = lockSegmentGrid(seed, firstOnsetFrame, numFrames, {
      forcedBeatsPerBar: parsedHintSig?.beatsPerBar || null,
      forcedNoteValue: parsedHintSig?.noteValue || null,
      isFirstSegment: true,
    });
    const logDist = Math.log2(locked.bpm / 124);
    const prior = 0.76 + 0.24 * Math.exp(-0.5 * Math.pow(logDist / 0.68, 2));
    refinedCandidates.push({
      ...locked,
      weightedScore: locked.rawScore * prior,
    });
  }
  refinedCandidates.sort((a, b) => b.weightedScore - a.weightedScore);

  const uniqueRefined = [];
  for (const rc of refinedCandidates) {
    if (uniqueRefined.every(u => Math.abs(u.bpm - rc.bpm) > 0.6)) {
      uniqueRefined.push(rc);
    }
  }

  // ─── Stage 2: Sliding Tempogram + Viterbi Multi-Tempo & Multi-Meter Segmentation ───
  const activeDurationSec = (numFrames - grooveStartFrame) / ENV_RATE;
  let detectedSegments = null;

  if (!hintBpm && activeDurationSec >= 26) {
    const candBpms = [];
    for (let b = 72; b <= 180; b += 0.5) candBpms.push(b);
    const B = candBpms.length;
    const priorArr = candBpms.map(b => 0.78 + 0.22 * Math.exp(-0.5 * Math.pow(Math.log2(b / 124) / 0.65, 2)));

    const stepSec = 2.0;
    const winSec = 12.0;
    const centersSec = [];
    for (let tc = (grooveStartFrame / ENV_RATE) + 2.5; tc < (numFrames / ENV_RATE) - 2.0; tc += stepSec) {
      centersSec.push(tc);
    }

    if (centersSec.length >= 8) {
      const T = centersSec.length;
      const obs = new Float32Array(T * B);
      const rowScratch = new Float32Array(B);

      for (let ti = 0; ti < T; ti++) {
        const tc = centersSec[ti];
        const i0 = Math.max(0, Math.floor((tc - winSec * 0.5) * ENV_RATE));
        const i1 = Math.min(numFrames, Math.ceil((tc + winSec * 0.5) * ENV_RATE));
        const L = i1 - i0;
        let rmsSq = 0;
        for (let i = i0; i < i1; i++) rmsSq += onsetEnv[i] * onsetEnv[i];
        const rms = Math.sqrt(rmsSq / Math.max(1, L)) + 1e-6;

        for (let bi = 0; bi < B; bi++) {
          const bpm = candBpms[bi];
          const per = (60 * ENV_RATE) / bpm;
          let ac = 0;
          for (const [mult, wt] of [[0.5, 0.26], [1, 1.0], [2, 0.75], [3, 0.52], [4, 0.62], [6, 0.42]]) {
            const lag = per * mult;
            const li = Math.floor(lag);
            if (li + 2 >= L) continue;
            const fr = lag - li;
            let sum = 0;
            let cnt = 0;
            for (let k = 0; k + li + 1 < L; k += 2) {
              const a = onsetEnv[i0 + k];
              const bVal = onsetEnv[i0 + k + li] * (1 - fr) + onsetEnv[i0 + k + li + 1] * fr;
              sum += a * bVal;
              cnt++;
            }
            if (cnt > 0) ac += wt * (sum / (cnt * rms * rms));
          }
          const val = ac * priorArr[bi];
          obs[ti * B + bi] = val;
          rowScratch[bi] = val;
        }

        const sortedRow = Array.from(rowScratch).sort((a, b) => a - b);
        const med = sortedRow[B >> 1];
        const rowMax = sortedRow[B - 1] || 0;
        const absDevs = sortedRow.map(v => Math.abs(v - med)).sort((a, b) => a - b);
        const scale = Math.max(absDevs[B >> 1] * 1.4826, (rowMax - med) / 4.5, 1e-5);
        for (let bi = 0; bi < B; bi++) {
          obs[ti * B + bi] = clamp(-1.0, 6.0, (obs[ti * B + bi] - med) / scale) / 6.0;
        }
      }

      const dp = new Float32Array(T * B);
      const back = new Int32Array(T * B);
      for (let bi = 0; bi < B; bi++) dp[bi] = obs[bi];
      const jumpPenalty = 1.65;

      for (let ti = 1; ti < T; ti++) {
        const prevOff = (ti - 1) * B;
        const curOff = ti * B;
        let bestPrevIdx = 0;
        let bestPrevVal = dp[prevOff];
        for (let bi = 1; bi < B; bi++) {
          if (dp[prevOff + bi] > bestPrevVal) {
            bestPrevVal = dp[prevOff + bi];
            bestPrevIdx = bi;
          }
        }
        const switchScore = bestPrevVal - jumpPenalty;
        for (let bi = 0; bi < B; bi++) {
          const stayScore = dp[prevOff + bi];
          if (stayScore >= switchScore) {
            dp[curOff + bi] = stayScore + obs[curOff + bi];
            back[curOff + bi] = bi;
          } else {
            dp[curOff + bi] = switchScore + obs[curOff + bi];
            back[curOff + bi] = bestPrevIdx;
          }
        }
      }

      const pathIdx = new Int32Array(T);
      let bestEndIdx = 0;
      const lastOff = (T - 1) * B;
      for (let bi = 1; bi < B; bi++) {
        if (dp[lastOff + bi] > dp[lastOff + bestEndIdx]) bestEndIdx = bi;
      }
      pathIdx[T - 1] = bestEndIdx;
      for (let ti = T - 2; ti >= 0; ti--) {
        pathIdx[ti] = back[(ti + 1) * B + pathIdx[ti + 1]];
      }

      const rawSegs = [];
      let curBpm = candBpms[pathIdx[0]];
      let segStartRelSec = grooveStartFrame / ENV_RATE;
      for (let ti = 1; ti < T; ti++) {
        const nextBpm = candBpms[pathIdx[ti]];
        if (nextBpm !== curBpm) {
          const boundRelSec = 0.5 * (centersSec[ti - 1] + centersSec[ti]);
          rawSegs.push({ startRelSec: segStartRelSec, endRelSec: boundRelSec, seedBpm: curBpm });
          segStartRelSec = boundRelSec;
          curBpm = nextBpm;
        }
      }
      rawSegs.push({ startRelSec: segStartRelSec, endRelSec: numFrames / ENV_RATE, seedBpm: curBpm });

      const mergedSegs = [];
      for (const s of rawSegs) {
        const dur = s.endRelSec - s.startRelSec;
        if (mergedSegs.length > 0 && (dur < 8.0 || Math.abs(mergedSegs[mergedSegs.length - 1].seedBpm - s.seedBpm) <= 1.5)) {
          mergedSegs[mergedSegs.length - 1].endRelSec = s.endRelSec;
        } else {
          mergedSegs.push({ ...s });
        }
      }
      if (mergedSegs.length > 1 && (mergedSegs[0].endRelSec - mergedSegs[0].startRelSec) < 8.0) {
        mergedSegs[1].startRelSec = mergedSegs[0].startRelSec;
        mergedSegs.shift();
      }

      if (mergedSegs.length >= 2) {
        const lockedSegs = mergedSegs.map((ms, idx) => {
          const f0 = idx === 0 ? firstOnsetFrame : Math.max(0, Math.floor(ms.startRelSec * ENV_RATE));
          const f1 = Math.min(numFrames, Math.ceil(ms.endRelSec * ENV_RATE));
          let bestLock = lockSegmentGrid(ms.seedBpm, f0, f1, {
            forcedBeatsPerBar: parsedHintSig?.beatsPerBar || null,
            forcedNoteValue: parsedHintSig?.noteValue || null,
            isFirstSegment: idx === 0,
          });

          const threeQuarterSeed = ms.seedBpm * 0.75;
          if (threeQuarterSeed >= 76 && threeQuarterSeed <= 145) {
            const altLock = lockSegmentGrid(threeQuarterSeed, f0, f1, {
              forcedBeatsPerBar: parsedHintSig?.beatsPerBar || null,
              forcedNoteValue: parsedHintSig?.noteValue || null,
              isFirstSegment: idx === 0,
            });
            const altDouble = evalRangePulseComb(altLock.bpm * 2, idx === 0 ? grooveStartFrame : f0, f1);
            const curDouble = evalRangePulseComb(bestLock.bpm * 2, idx === 0 ? grooveStartFrame : f0, f1);
            if (altLock.rawScore >= bestLock.rawScore * 0.85 && altDouble.rawScore > curDouble.rawScore * 1.18) {
              bestLock = altLock;
            }
          }
          return {
            startFrame: f0,
            endFrame: f1,
            ...bestLock,
          };
        });

        const dedupLocked = [];
        for (const seg of lockedSegs) {
          const prev = dedupLocked[dedupLocked.length - 1];
          if (prev && Math.abs(prev.bpm - seg.bpm) <= 0.8 && prev.beatsPerBar === seg.beatsPerBar) {
            const reLocked = lockSegmentGrid(prev.bpm, prev.startFrame, seg.endFrame, {
              forcedBeatsPerBar: parsedHintSig?.beatsPerBar || null,
              forcedNoteValue: parsedHintSig?.noteValue || null,
              isFirstSegment: dedupLocked.length === 1,
            });
            dedupLocked[dedupLocked.length - 1] = {
              startFrame: prev.startFrame,
              endFrame: seg.endFrame,
              ...reLocked,
            };
          } else {
            dedupLocked.push(seg);
          }
        }

        if (dedupLocked.length >= 2) {
          // Refine transition boundaries WITHOUT destroying `right.downbeatFramePos` bar-1 phase!
          for (let k = 0; k < dedupLocked.length - 1; k++) {
            const left = dedupLocked[k];
            const right = dedupLocked[k + 1];
            const coarseFrame = right.startFrame;
            const winFrames = Math.round(5.5 * ENV_RATE);
            const searchLo = Math.max(left.startFrame + Math.round(left.periodFrames * 4), coarseFrame - winFrames);
            const searchHi = Math.min(right.endFrame - Math.round(right.periodFrames * 4), coarseFrame + winFrames);

            if (searchHi > searchLo) {
              let bestSplitFrame = coarseFrame;
              let bestCombinedScore = -1e9;
              const rightMeasureFrames = right.beatsPerBar * right.periodFrames;
              const startRightK = Math.ceil((searchLo - right.phaseFrames) / right.periodFrames);

              for (let rk = startRightK; ; rk++) {
                const candFrame = right.phaseFrames + rk * right.periodFrames;
                if (candFrame > searchHi) break;

                const lastLeftK = Math.floor((candFrame - 1 - left.phaseFrames) / left.periodFrames);
                const lastLeftFrame = left.phaseFrames + lastLeftK * left.periodFrames;
                const gapFrames = candFrame - lastLeftFrame;
                const minAllowedGap = 0.55 * Math.min(left.periodFrames, right.periodFrames);
                if (gapFrames < minAllowedGap) continue;

                let scoreL = 0;
                for (let lk = Math.ceil((searchLo - left.phaseFrames) / left.periodFrames); lk <= lastLeftK; lk++) {
                  const idx = clamp(0, numFrames - 1, Math.round(left.phaseFrames + lk * left.periodFrames));
                  scoreL += onsetEnv[idx];
                }
                let scoreR = 0;
                for (let rki = rk; ; rki++) {
                  const pos = right.phaseFrames + rki * right.periodFrames;
                  if (pos > searchHi) break;
                  const idx = clamp(0, numFrames - 1, Math.round(pos));
                  scoreR += onsetEnv[idx];
                }

                // Strongly prefer splitting right on a true Bar-1 downbeat of `right`'s locked meter!
                const barMod = Math.abs(((candFrame - right.downbeatFramePos) % rightMeasureFrames + rightMeasureFrames) % rightMeasureFrames);
                const isRightBarDownbeat = Math.min(barMod, rightMeasureFrames - barMod) <= right.periodFrames * 0.25;
                const cIdx = clamp(0, numFrames - 1, Math.round(candFrame));
                const downbeatBonus = (isRightBarDownbeat ? 0.55 : 0.10) * (lowFlux[cIdx] + highFlux[cIdx]) + (isRightBarDownbeat ? 0.18 : 0);
                const total = scoreL + scoreR + downbeatBonus;
                if (total > bestCombinedScore) {
                  bestCombinedScore = total;
                  bestSplitFrame = candFrame;
                }
              }

              left.endFrame = Math.round(bestSplitFrame);
              right.startFrame = Math.round(bestSplitFrame);
              right.firstBeatFrame = bestSplitFrame;
              // CRITICAL: Preserve `right.downbeatFramePos` modulo `rightMeasureFrames` so Beat 1 in `right`
              // NEVER shifts onto Beat 3 even if the transition happens on a pickup beat!
              const stepsFromTrueDownbeat = Math.ceil((bestSplitFrame - right.downbeatFramePos - right.periodFrames * 0.2) / rightMeasureFrames);
              const alignedDownbeatFrame = right.downbeatFramePos + stepsFromTrueDownbeat * rightMeasureFrames;
              right.downbeatFramePos = alignedDownbeatFrame;
              right.trueDownbeatSec = Number((earliestStartSec + alignedDownbeatFrame / ENV_RATE).toFixed(4));
              right.firstDownbeatSec = Number((earliestStartSec + bestSplitFrame / ENV_RATE).toFixed(4));
            }
          }

          const bestConst = uniqueRefined[0];
          const constTotalScore = bestConst
            ? evalRangePulseComb(bestConst.bpm, grooveStartFrame, numFrames).perBeatContrast * (numFrames - grooveStartFrame)
            : 0;
          let multiTotalScore = 0;
          for (const seg of dedupLocked) {
            multiTotalScore += (seg.perBeatContrast || 0) * (seg.endFrame - seg.startFrame);
          }

          if (multiTotalScore > constTotalScore * 1.16) {
            detectedSegments = dedupLocked.map((seg, idx) => ({
              index: idx,
              startSec: Number((earliestStartSec + seg.startFrame / ENV_RATE).toFixed(4)),
              endSec: Number((earliestStartSec + seg.endFrame / ENV_RATE).toFixed(4)),
              bpm: seg.bpm,
              beatsPerBar: seg.beatsPerBar,
              noteValue: seg.noteValue,
              timeSignature: seg.timeSignature,
              subdivision: seg.subdivision,
              firstDownbeatSec: seg.firstDownbeatSec,
              trueDownbeatSec: seg.trueDownbeatSec ?? seg.firstDownbeatSec,
              combConfidence: seg.combConfidence,
            }));

            for (const seg of detectedSegments) {
              if (uniqueRefined.every(u => Math.abs(u.bpm - seg.bpm) > 0.6)) {
                uniqueRefined.push({
                  bpm: seg.bpm,
                  weightedScore: seg.combConfidence,
                });
              }
            }
          }
        }
      }
    }
  }

  const lockPhaseForBpmAndMeter = (targetBpm, beatsPerBar = null, noteValue = null) => {
    const locked = lockSegmentGrid(targetBpm, firstOnsetFrame, numFrames, {
      forcedBeatsPerBar: beatsPerBar ? clamp(2, 15, Math.round(Number(beatsPerBar))) : null,
      forcedNoteValue: noteValue || null,
      isFirstSegment: true,
    });
    return {
      bpm: locked.bpm,
      beatsPerBar: locked.beatsPerBar,
      noteValue: locked.noteValue,
      timeSignature: locked.timeSignature,
      subdivision: locked.subdivision,
      firstDownbeatSec: locked.firstDownbeatSec,
      trueDownbeatSec: locked.trueDownbeatSec,
      firstMusicalOnsetSec,
      grooveStartSec: Number((earliestStartSec + grooveStartFrame / ENV_RATE).toFixed(4)),
      barPhaseScores: locked.barPhaseScores,
      meterCandidates: locked.meterCandidates,
      combConfidence: locked.combConfidence,
    };
  };

  /**
   * Re-lock an array of multi-tempo / multi-meter segments while preserving per-segment
   * detected time signature and true downbeat phase!
   */
  const lockSegmentsForPlan = (segmentSpecs, fallbackBeatsPerBar = null, fallbackNoteValue = null) => {
    const out = [];
    for (let i = 0; i < segmentSpecs.length; i++) {
      const spec = segmentSpecs[i];
      const f0 = i === 0
        ? firstOnsetFrame
        : clamp(0, numFrames - 2, Math.round((spec.startSec - earliestStartSec) * ENV_RATE));
      const f1 = i === segmentSpecs.length - 1
        ? numFrames
        : clamp(f0 + 20, numFrames, Math.round((spec.endSec - earliestStartSec) * ENV_RATE));
      const forcedBpb = spec.beatsPerBar
        ? clamp(2, 15, Math.round(Number(spec.beatsPerBar)))
        : (fallbackBeatsPerBar ? clamp(2, 15, Math.round(Number(fallbackBeatsPerBar))) : null);
      const forcedNv = spec.noteValue || fallbackNoteValue || null;

      const locked = lockSegmentGrid(Number(spec.bpm) || 120, f0, f1, {
        forcedBeatsPerBar: forcedBpb,
        forcedNoteValue: forcedNv,
        isFirstSegment: i === 0,
      });
      out.push({
        index: i,
        startFrame: f0,
        endFrame: f1,
        startSec: Number((earliestStartSec + f0 / ENV_RATE).toFixed(4)),
        endSec: Number((earliestStartSec + f1 / ENV_RATE).toFixed(4)),
        bpm: locked.bpm,
        beatsPerBar: locked.beatsPerBar,
        noteValue: locked.noteValue,
        timeSignature: locked.timeSignature,
        subdivision: locked.subdivision,
        phaseFrames: locked.phaseFrames,
        periodFrames: locked.periodFrames,
        downbeatFramePos: locked.downbeatFramePos,
        firstDownbeatSec: i === 0 ? locked.firstDownbeatSec : Number((earliestStartSec + f0 / ENV_RATE).toFixed(4)),
        trueDownbeatSec: locked.trueDownbeatSec,
        combConfidence: locked.combConfidence,
      });
    }

    for (let k = 0; k < out.length - 1; k++) {
      const left = out[k];
      const right = out[k + 1];
      const coarseFrame = right.startFrame;
      const winFrames = Math.round(4.5 * ENV_RATE);
      const searchLo = Math.max(left.startFrame + Math.round(left.periodFrames * 4), coarseFrame - winFrames);
      const searchHi = Math.min(right.endFrame - Math.round(right.periodFrames * 4), coarseFrame + winFrames);

      if (searchHi > searchLo) {
        let bestSplitFrame = coarseFrame;
        let bestScore = -1e9;
        const rightMeasureFrames = right.beatsPerBar * right.periodFrames;
        const startRK = Math.ceil((searchLo - right.phaseFrames) / right.periodFrames);
        for (let rk = startRK; ; rk++) {
          const candFrame = right.phaseFrames + rk * right.periodFrames;
          if (candFrame > searchHi) break;
          const lastLeftK = Math.floor((candFrame - 1 - left.phaseFrames) / left.periodFrames);
          const lastLeftFrame = left.phaseFrames + lastLeftK * left.periodFrames;
          const minGap = 0.55 * Math.min(left.periodFrames, right.periodFrames);
          if ((candFrame - lastLeftFrame) < minGap) continue;

          let sL = 0;
          for (let lk = Math.ceil((searchLo - left.phaseFrames) / left.periodFrames); lk <= lastLeftK; lk++) {
            sL += onsetEnv[clamp(0, numFrames - 1, Math.round(left.phaseFrames + lk * left.periodFrames))];
          }
          let sR = 0;
          for (let rki = rk; ; rki++) {
            const p = right.phaseFrames + rki * right.periodFrames;
            if (p > searchHi) break;
            sR += onsetEnv[clamp(0, numFrames - 1, Math.round(p))];
          }
          const barMod = Math.abs(((candFrame - right.downbeatFramePos) % rightMeasureFrames + rightMeasureFrames) % rightMeasureFrames);
          const isRightBarDownbeat = Math.min(barMod, rightMeasureFrames - barMod) <= right.periodFrames * 0.25;
          const cIdx = clamp(0, numFrames - 1, Math.round(candFrame));
          const tot = sL + sR + (isRightBarDownbeat ? 0.55 : 0.10) * (lowFlux[cIdx] + highFlux[cIdx]) + (isRightBarDownbeat ? 0.18 : 0);
          if (tot > bestScore) {
            bestScore = tot;
            bestSplitFrame = candFrame;
          }
        }
        left.endSec = Number((earliestStartSec + bestSplitFrame / ENV_RATE).toFixed(4));
        right.startSec = left.endSec;
        right.firstDownbeatSec = left.endSec;
        const steps = Math.ceil((bestSplitFrame - right.downbeatFramePos - right.periodFrames * 0.2) / rightMeasureFrames);
        const alignedDownbeat = right.downbeatFramePos + steps * rightMeasureFrames;
        right.trueDownbeatSec = Number((earliestStartSec + alignedDownbeat / ENV_RATE).toFixed(4));
      }
    }
    return out;
  };

  const primarySeed = detectedSegments ? detectedSegments[0].bpm : (uniqueRefined[0]?.bpm || hintBpm || 120);
  const defaultLock = lockPhaseForBpmAndMeter(
    primarySeed,
    parsedHintSig?.beatsPerBar || (detectedSegments ? detectedSegments[0].beatsPerBar : null),
    parsedHintSig?.noteValue || (detectedSegments ? detectedSegments[0].noteValue : null)
  );

  return {
    ...defaultLock,
    isMultiTempo: Array.isArray(detectedSegments) && detectedSegments.length >= 2,
    segments: detectedSegments,
    topTempoCandidates: uniqueRefined.slice(0, 6).map(c => ({
      bpm: Number(c.bpm.toFixed(2)),
      timeSignature: c.timeSignature || '4/4',
      score: Number((c.weightedScore || 0).toFixed(4)),
    })),
    strongHitTimesSec,
    lockPhaseForBpmAndMeter,
    lockSegmentsForPlan,
  };
}

/**
 * Synthesize a crisp, studio-grade 16-bit PCM WAV click track supporting constant-BPM,
 * odd/compound time signatures (`4/4`, `3/4`, `6/8`, `5/4`, `7/8`), and multi-section
 * tempo/meter maps, preceded by a 1-measure stick count-off in the opening time signature!
 */
function synthesizeAlignedClickWav({
  bpm = 120,
  beatsPerBar = 4,
  noteValue = 4,
  countInBars = 1,
  firstDownbeatSec = 2.0,
  songEndSec = 16.0,
  subdivision = 'quarter',
  segments = null,
  sampleRate = 48000,
} = {}) {
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

  const clipStartSec = Math.max(0, Number((openSeg.firstDownbeatSec - countInBars * openMeasureSec).toFixed(4)));
  const finalEndSec = Math.max(songEndSec, activeSegments[activeSegments.length - 1].endSec);
  const totalDurationSec = Math.max(openMeasureSec * 2, (finalEndSec - clipStartSec) + openBeatSec * 0.5);
  const totalFrames = Math.ceil(totalDurationSec * sampleRate);
  const floatBuf = new Float32Array(totalFrames);
  const transients = [];

  const renderClickEvent = (absSec, {
    isCountIn = false,
    isDownbeat = false,
    isSecondaryAccent = false,
    isSectionChange = false,
    isSubdivision = false,
  } = {}) => {
    const relSec = absSec - clipStartSec;
    if (relSec < -0.001 || relSec >= totalDurationSec - 0.035) return;
    const startSample = Math.max(0, Math.round(relSec * sampleRate));

    if (isSubdivision) {
      const subFrames = Math.min(totalFrames - startSample, Math.floor(0.024 * sampleRate));
      for (let i = 0; i < subFrames; i++) {
        const t = i / sampleRate;
        const attack = Math.min(1, i / Math.max(1, sampleRate * 0.0008));
        floatBuf[startSample + i] += attack * 0.24 * Math.sin(2 * Math.PI * 660 * t) * Math.exp(-130 * t);
      }
      return;
    }

    const clickDurSec = isCountIn || isSectionChange ? 0.056 : (isDownbeat ? 0.048 : 0.036);
    const clickFrames = Math.min(totalFrames - startSample, Math.floor(clickDurSec * sampleRate));
    const fPrimary = isCountIn
      ? (isDownbeat ? 1567.98 : (isSecondaryAccent ? 1318.51 : 1174.66))
      : isSectionChange
        ? 1479.98
        : isDownbeat
          ? 1318.51  // E6 unmistakable bright Bar-1 Downbeat ("1")
          : isSecondaryAccent
            ? 1108.73 // C#6 secondary compound accent (e.g. Beat 4 in 6/8)
            : 880.00; // A5 regular beat click
    const fBody = fPrimary * 0.5;
    const amp = isCountIn
      ? (isDownbeat ? 0.86 : 0.74)
      : isSectionChange
        ? 0.84
        : isDownbeat
          ? 0.80
          : isSecondaryAccent
            ? 0.64
            : 0.54;
    const decayRate = isCountIn || isSectionChange ? 68 : (isDownbeat ? 80 : 98);

    for (let i = 0; i < clickFrames; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, i / Math.max(1, sampleRate * 0.0008));
      const stickSnap = Math.exp(-950 * t) * Math.sin(2 * Math.PI * 3100 * t) * ((isCountIn || isSectionChange) ? 0.55 : 0.35);
      const tone = (0.72 * Math.sin(2 * Math.PI * fPrimary * t) + 0.28 * Math.sin(2 * Math.PI * fBody * t)) * Math.exp(-decayRate * t);
      floatBuf[startSample + i] += attack * amp * (tone + stickSnap);
    }

    transients.push({
      timeSec: Number(Math.max(0, relSec).toFixed(4)),
      peakDb: Number((20 * Math.log10(amp)).toFixed(1)),
      velocity: (isDownbeat || isSectionChange) ? 0.95 : (isSecondaryAccent ? 0.82 : 0.70),
    });
  };

  // 1. Render 1-measure stick count-off in the detected opening time signature right before Beat 1
  const countInBeats = countInBars * openSeg.beatsPerBar;
  const openTrip = openSeg.subdivision === 'triplet';
  for (let cb = 0; cb < countInBeats; cb++) {
    const absSec = openSeg.firstDownbeatSec - (countInBeats - cb) * openBeatSec;
    const barPos = cb % openSeg.beatsPerBar;
    renderClickEvent(absSec, {
      isCountIn: true,
      isDownbeat: barPos === 0,
      isSecondaryAccent: openSeg.beatsPerBar === 6 && openSeg.noteValue === 8 && barPos === 3,
    });
    if (openTrip) {
      renderClickEvent(absSec + openBeatSec / 3, { isSubdivision: true });
      renderClickEvent(absSec + (2 * openBeatSec) / 3, { isSubdivision: true });
    }
  }

  // 2. Render phase-locked beats across every tempo/meter section (anchored to `trueDownbeatSec`!)
  let lastClickAbsSec = -999;
  for (let si = 0; si < activeSegments.length; si++) {
    const seg = activeSegments[si];
    const beatSec = 60 / seg.bpm;
    const addEighthGhost = seg.subdivision === 'eighth' && seg.bpm <= 92;
    const addTripletGhost = seg.subdivision === 'triplet';
    const segEndLimit = si < activeSegments.length - 1
      ? activeSegments[si + 1].firstDownbeatSec - beatSec * 0.42
      : finalEndSec + beatSec * 0.25;

    for (let b = 0; ; b++) {
      const absSec = seg.firstDownbeatSec + b * beatSec;
      if (absSec > segEndLimit) break;
      if (absSec - lastClickAbsSec < beatSec * 0.40) continue;

      // Measure position relative to `seg.trueDownbeatSec` so Beat 1 NEVER drifts onto Beat 3!
      const relBeatIdx = Math.round((absSec - seg.trueDownbeatSec) / beatSec);
      const barPos = ((relBeatIdx % seg.beatsPerBar) + seg.beatsPerBar) % seg.beatsPerBar;
      const isDownbeat = barPos === 0;
      const isSecondaryAccent = (seg.beatsPerBar === 6 && seg.noteValue === 8 && barPos === 3);
      const isSectionChange = si > 0 && isDownbeat && (absSec - seg.firstDownbeatSec) < beatSec * seg.beatsPerBar;

      renderClickEvent(absSec, { isDownbeat, isSecondaryAccent, isSectionChange });
      lastClickAbsSec = absSec;

      if (addTripletGhost) {
        if (absSec + beatSec / 3 <= segEndLimit) renderClickEvent(absSec + beatSec / 3, { isSubdivision: true });
        if (absSec + (2 * beatSec) / 3 <= segEndLimit) renderClickEvent(absSec + (2 * beatSec) / 3, { isSubdivision: true });
      } else if (addEighthGhost && absSec + beatSec * 0.5 <= segEndLimit) {
        renderClickEvent(absSec + beatSec * 0.5, { isSubdivision: true });
      }
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
  };
}

/**
 * End-to-end Meter-First RobOS Agent (Gemini-preferred) + DSP Click Track Generator.
 *
 * Step 1: Infers the music's Time Signature(s) (`4/4`, `3/4`, `6/8`, `5/4`, `7/8`) & Tempo Map.
 * Step 2: Consults Gemini / RobOS Agent to confirm meter, half/double-time feel, and prog odd meters.
 * Step 3: Resolves exact Bar-1 Downbeat phase (handling pickups & intros without Beat-1/Beat-3 swap)
 *         and synthesizes the sample-accurate studio metronome track right below `sourceTrackId`.
 */
async function generateAlignedClickTrackForProject(project, sourceTrackId, {
  preferredProvider = 'antigravity',
  aiAgentModule = null,
  onProgress = null,
  cliTimeoutMs = 32000,
  takesDir,
} = {}) {
  const tracks = project?.tracks || [];
  const sourceIdx = tracks.findIndex(t => t.id === sourceTrackId);
  if (sourceIdx === -1) {
    throw new Error('Source track not found in session.');
  }
  const sourceTrack = tracks[sourceIdx];
  const referenceTrack = findAlignedReferenceTrack(project, sourceTrack);

  if (onProgress) {
    onProgress({
      stage: 'dsp',
      percent: 25,
      message: referenceTrack
        ? `Analyzing time signature & downbeat phase from "${sourceTrack.name}" (+ drum reference "${referenceTrack.name}")...`
        : `Analyzing music time signature, bar accents & tempo map from "${sourceTrack.name}"...`,
    });
  }

  const combinedTitle = [sourceTrack.name, ...(sourceTrack.clips || []).map(c => c.name)].join(' ');
  const bpmNameMatch = combinedTitle.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/i);
  const nameHintBpm = bpmNameMatch ? Number(bpmNameMatch[1]) : null;
  const sigNameMatch = combinedTitle.match(/\b([2-9]|12)\s*\/\s*(4|8)\b/);
  const nameHintSig = sigNameMatch ? `${sigNameMatch[1]}/${sigNameMatch[2]}` : null;

  const assembled = assembleTrackTimelineMono(sourceTrack, { referenceTrack });
  const dspGrid = analyzeAudioBeatGrid(assembled.mono16k, {
    earliestStartSec: assembled.earliestStartSec,
    hintBpm: nameHintBpm,
    hintTimeSignature: nameHintSig,
  });

  let chosenBpm = dspGrid.bpm;
  let chosenBeatsPerBar = dspGrid.beatsPerBar || 4;
  let chosenNoteValue = dspGrid.noteValue || 4;
  let chosenTimeSignature = dspGrid.timeSignature || `${chosenBeatsPerBar}/${chosenNoteValue}`;
  let chosenSubdivision = dspGrid.subdivision || 'quarter';
  let chosenSegmentsPlan = dspGrid.isMultiTempo ? dspGrid.segments.map(s => ({ ...s })) : null;
  let agentProviderUsed = 'dsp-meter-comb-correlator';
  let agentReasoning = chosenSegmentsPlan
    ? `Detected ${chosenSegmentsPlan.length} sections (${chosenSegmentsPlan.map(s => `${s.bpm} BPM ${s.timeSignature || '4/4'}`).join(' -> ')}) with Bar-1 downbeat lock.`
    : `Detected ${chosenTimeSignature} time signature at ${dspGrid.bpm} BPM with Bar-1 downbeat locked at ${dspGrid.firstDownbeatSec.toFixed(3)}s.`;

  let aiAgent = aiAgentModule;
  if (!aiAgent && process.env.ROBOS_TEST !== '1') {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }

  if (aiAgent && typeof aiAgent.ask === 'function') {
    const workId = `click-${crypto.randomBytes(3).toString('hex')}`;
    const analysisDir = path.join(getClickAnalysisRoot(), workId);
    fs.mkdirSync(analysisDir, { recursive: true });

    try {
      const excerptAnchorSec = dspGrid.grooveStartSec ?? dspGrid.firstMusicalOnsetSec;
      const excerptOffsetSec = Math.max(0, (excerptAnchorSec - assembled.earliestStartSec) - 0.5);
      const exStartSample = Math.floor(excerptOffsetSec * ANALYSIS_RATE);
      const exLenSamples = Math.min(assembled.mono16k.length - exStartSample, ANALYSIS_RATE * 18);
      const excerptSlice = assembled.mono16k.subarray(exStartSample, exStartSample + Math.max(320, exLenSamples));
      fs.writeFileSync(path.join(analysisDir, 'track-excerpt.wav'), encodeMono16Wav(excerptSlice, ANALYSIS_RATE));

      const telemetry = {
        trackName: sourceTrack.name,
        referenceTrackUsed: assembled.usedReferenceTrack,
        clipNames: assembled.clipNames,
        earliestClipStartSec: assembled.earliestStartSec,
        latestClipEndSec: assembled.latestEndSec,
        firstMusicalOnsetSec: dspGrid.firstMusicalOnsetSec,
        grooveStartSec: dspGrid.grooveStartSec,
        dspDetectedTimeSignature: dspGrid.timeSignature,
        dspBeatsPerBar: dspGrid.beatsPerBar,
        dspNoteValue: dspGrid.noteValue,
        dspMeterCandidates: dspGrid.meterCandidates,
        isMultiTempo: dspGrid.isMultiTempo,
        detectedTempoSegments: dspGrid.segments || null,
        dspPrimaryBpm: dspGrid.bpm,
        dspFirstDownbeatSec: dspGrid.firstDownbeatSec,
        dspCombConfidence: dspGrid.combConfidence,
        topTempoCandidates: dspGrid.topTempoCandidates,
        halfTimeCandidateBpm: Number((dspGrid.bpm * 0.5).toFixed(2)),
        doubleTimeCandidateBpm: Number((dspGrid.bpm * 2.0).toFixed(2)),
        strongHitTimesSec: dspGrid.strongHitTimesSec,
        barPhaseScores: dspGrid.barPhaseScores,
      };
      fs.writeFileSync(path.join(analysisDir, 'beat-analysis.json'), JSON.stringify(telemetry, null, 2), 'utf8');

      const candidateProviders = [];
      const pushUnique = (id) => { if (id && !candidateProviders.includes(id)) candidateProviders.push(id); };
      pushUnique(preferredProvider || 'antigravity');
      pushUnique('antigravity');
      if (typeof aiAgent.getActiveProviderId === 'function') pushUnique(aiAgent.getActiveProviderId());
      for (const p of (aiAgent.PROVIDERS || [])) pushUnique(p.id);

      const prompt = [
        'You are an expert studio drummer, music-theory meter analyst, and tempo-map engineer.',
        `Determine the exact Music Time Signature(s) FIRST, then confirm the tempo plan for "${sourceTrack.name}" (${assembled.clipNames.join(', ')}).`,
        'In the current directory you have `beat-analysis.json` (containing `dspDetectedTimeSignature`, `dspMeterCandidates`, `isMultiTempo`, `detectedTempoSegments`, and `topTempoCandidates`) and `track-excerpt.wav`.',
        'Read `beat-analysis.json` (do NOT run shell commands) and determine:',
        '  1. Music Time Signature (`beatsPerBar` e.g. 4, 3, 6, 5, 7 and `noteValue` e.g. 4 or 8) — do NOT default to 4/4 if the song or section is in 6/8, 3/4, 7/8, or 5/4!',
        '  2. If `isMultiTempo` is true and `detectedTempoSegments` shows genuine section changes (e.g. prog rock/metal like Dream Theater or multi-section covers), preserve `segments` with each section\'s `beatsPerBar`, `noteValue`, and comfortable `bpm` (70-180 BPM).',
        '  3. Otherwise choose the single best musical `bpm`, `beatsPerBar`, `noteValue`, and `subdivision` (`"quarter"`, `"eighth"`, or `"triplet"`).',
        'Reply ONLY with raw JSON (no markdown fences):',
        '{"bpm":128.0,"beatsPerBar":4,"noteValue":4,"subdivision":"quarter","segments":null,"reasoning":"1 short sentence"}',
        '(If multi-section, set `"segments":[{"startSec":5.87,"endSec":28.8,"bpm":129,"beatsPerBar":6,"noteValue":8},...]`).',
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
            percent: 58,
            providerId,
            message: `Confirming music time signature & downbeat map with ${provDef?.name || providerId}...`,
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
          if (Array.isArray(parsed?.segments) && parsed.segments.length >= 2) {
            const validSegs = parsed.segments
              .filter(s => Number.isFinite(Number(s.bpm)) && Number(s.bpm) >= 45 && Number(s.bpm) <= 240)
              .map((s, idx) => {
                const dspSeg = dspGrid.segments?.[idx];
                const sBpb = Number(s.beatsPerBar) || dspSeg?.beatsPerBar || Number(parsed.beatsPerBar) || chosenBeatsPerBar;
                const sNv = [2, 4, 8, 16].includes(Number(s.noteValue))
                  ? Number(s.noteValue)
                  : (dspSeg?.noteValue || ([2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : 4));
                return {
                  startSec: Number(s.startSec) || 0,
                  endSec: Number(s.endSec) || assembled.latestEndSec,
                  bpm: Number(s.bpm),
                  beatsPerBar: clamp(2, 15, Math.round(sBpb)),
                  noteValue: sNv,
                };
              });
            if (validSegs.length >= 2) {
              chosenSegmentsPlan = validSegs;
              chosenBpm = validSegs[0].bpm;
              chosenBeatsPerBar = validSegs[0].beatsPerBar;
              chosenNoteValue = validSegs[0].noteValue;
              chosenTimeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;
              if (['quarter', 'eighth', 'triplet'].includes(parsed.subdivision)) {
                chosenSubdivision = parsed.subdivision;
              }
              agentProviderUsed = provDef?.name || res.provider || providerId;
              if (parsed.reasoning) agentReasoning = String(parsed.reasoning);
              break;
            }
          } else if (Number.isFinite(pBpm) && pBpm >= 45 && pBpm <= 240) {
            const agentBpb = clamp(2, 15, Math.round(Number(parsed.beatsPerBar) || chosenBeatsPerBar));
            const agentNv = [2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : chosenNoteValue;
            if (!dspGrid.isMultiTempo) {
              chosenSegmentsPlan = null;
              chosenBpm = pBpm;
              chosenBeatsPerBar = agentBpb;
              chosenNoteValue = agentNv;
              chosenTimeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;
            } else if (agentBpb !== 4 || agentNv !== 4) {
              // Propagate explicit non-4/4 meter guidance to segments that didn't already detect an odd meter
              chosenSegmentsPlan = chosenSegmentsPlan.map(s => (
                s.beatsPerBar === 4 && s.noteValue === 4
                  ? { ...s, beatsPerBar: agentBpb, noteValue: agentNv }
                  : s
              ));
              chosenBeatsPerBar = chosenSegmentsPlan[0].beatsPerBar;
              chosenNoteValue = chosenSegmentsPlan[0].noteValue;
              chosenTimeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;
            }
            if (['quarter', 'eighth', 'triplet'].includes(parsed.subdivision)) {
              chosenSubdivision = parsed.subdivision;
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

  if (onProgress) {
    onProgress({
      stage: 'synth',
      percent: 84,
      message: `Locking Bar-1 downbeat phase (${chosenTimeSignature}) & rendering studio metronome...`,
    });
  }

  let lockedSegments = null;
  let lockedBpm = chosenBpm;
  let firstDownbeatSec = dspGrid.firstDownbeatSec;
  let songEndSec = assembled.latestEndSec;

  if (Array.isArray(chosenSegmentsPlan) && chosenSegmentsPlan.length >= 2) {
    lockedSegments = dspGrid.lockSegmentsForPlan(chosenSegmentsPlan, chosenBeatsPerBar, chosenNoteValue);
    lockedBpm = lockedSegments[0].bpm;
    chosenBeatsPerBar = lockedSegments[0].beatsPerBar;
    chosenNoteValue = lockedSegments[0].noteValue;
    chosenTimeSignature = lockedSegments[0].timeSignature || `${chosenBeatsPerBar}/${chosenNoteValue}`;
    chosenSubdivision = lockedSegments[0].subdivision || chosenSubdivision;
    firstDownbeatSec = lockedSegments[0].firstDownbeatSec;
  } else {
    const finalLock = dspGrid.lockPhaseForBpmAndMeter(chosenBpm, chosenBeatsPerBar, chosenNoteValue);
    lockedBpm = finalLock.bpm;
    chosenBeatsPerBar = finalLock.beatsPerBar;
    chosenNoteValue = finalLock.noteValue;
    chosenTimeSignature = finalLock.timeSignature || `${chosenBeatsPerBar}/${chosenNoteValue}`;
    if (finalLock.subdivision === 'triplet') chosenSubdivision = 'triplet';
    firstDownbeatSec = finalLock.firstDownbeatSec;
  }

  const openBeatSec = 60 / lockedBpm;
  const openMeasureSec = chosenBeatsPerBar * openBeatSec;

  // Shift timeline forward if needed so the 1-measure count-off fits >= 00:00.100
  let timelineShiftSec = 0;
  if (firstDownbeatSec - openMeasureSec < 0.08) {
    timelineShiftSec = Number(((openMeasureSec - firstDownbeatSec) + 0.10).toFixed(4));
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
  const clickSynth = synthesizeAlignedClickWav({
    bpm: lockedBpm,
    beatsPerBar: chosenBeatsPerBar,
    noteValue: chosenNoteValue,
    countInBars: 1,
    firstDownbeatSec,
    songEndSec,
    subdivision: chosenSubdivision,
    segments: lockedSegments,
    sampleRate,
  });

  fs.mkdirSync(takesDir, { recursive: true });
  const clipId = `click-${crypto.randomBytes(4).toString('hex')}`;
  const wavFileName = lockedSegments
    ? `${clipId}-tempmap-${Math.round(lockedBpm)}bpm.wav`
    : `${clipId}-${Math.round(lockedBpm)}bpm.wav`;
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

  const clickTrack = buildTrackFromWizard({
    profileId: 'acoustic-inst',
    name: `Click (${trackLabelBpm} · ${displayMeterSummary})`,
    inputNodeName: '',
    inputLabel: `AI Click Track (${agentProviderUsed})`,
    armed: false,
  });
  clickTrack.shortLabel = 'Click';
  clickTrack.color = '#00d4ff';
  clickTrack.image = 'assets/icons/metronome.webp';
  clickTrack.volume = 0.85;
  clickTrack.pan = 0;
  if (tracks.some(t => t.soloed)) {
    clickTrack.soloed = true;
  }
  clickTrack.fx = {
    ...(clickTrack.fx || {}),
    openSourcePlugins: ['RobOS Precision Studio Metronome'],
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

  const clickClip = {
    id: clipId,
    name: lockedSegments
      ? `1-Bar Count + Tempo Map (${uniqueBpmSummary} BPM · ${displayMeterSummary})`
      : `1-Bar Count + Click (${fmtBpm(lockedBpm)} BPM ${chosenTimeSignature})`,
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

  tracks.splice(sourceIdx + 1, 0, clickTrack);
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
    countInStartSec: clickSynth.clipStartSec,
    firstDownbeatSec,
    timelineShiftSec,
    provider: agentProviderUsed,
    reasoning: agentReasoning,
  };
}

module.exports = {
  findAlignedReferenceTrack,
  assembleTrackTimelineMono,
  analyzeAudioBeatGrid,
  synthesizeAlignedClickWav,
  generateAlignedClickTrackForProject,
};
