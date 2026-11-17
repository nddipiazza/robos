'use strict';

/**
 * RobOS DAW Studio — AI + DSP Beat-Locked Click Track Generator
 *
 * Analyzes any audio/video/mic track's clips using a 200 Hz (5ms) dual-band onset
 * flux envelope + 0.02-BPM fractional comb-pulse phase correlator, consults the
 * RobOS Agent (preferring Gemini / `antigravity` first) to resolve musical meter,
 * half/double-time feel, and downbeat phrasing, and synthesizes a sample-accurate
 * studio click track with a 1-measure count-off inserted directly below the source track.
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
 * Assemble all audible clips on `track` into a single timeline-aligned 16 kHz mono Float32Array
 * starting at `earliestStartSec` (up to `maxAnalysisSec` for fast analysis).
 */
function assembleTrackTimelineMono(track, { maxAnalysisSec = 150 } = {}) {
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

  for (const clip of validClips) {
    const clipStart = Math.max(0, Number(clip.startSec) || 0);
    const relStartSec = clipStart - earliestStartSec;
    if (relStartSec >= analysisSpanSec) continue;

    const wavBuf = fs.readFileSync(clip.wavFile);
    const decoded = decodeWavMono(wavBuf);
    if (!decoded.samples.length) continue;

    const srcSr = decoded.sampleRate || 48000;
    const clipOffSec = Math.max(0, Number(clip.offsetSec) || 0);
    const maxClipDur = Math.max(0.04, decoded.durationSec - clipOffSec);
    const clipDurSec = Math.min(
      maxClipDur,
      Number(clip.durationSec) > 0 ? Number(clip.durationSec) : maxClipDur,
      analysisSpanSec - relStartSec
    );
    if (clipDurSec <= 0.02) continue;

    const gainLin = dbToGain((Number(clip.gainDb) || 0) + (Number(track.gainDb) || 0));
    const outStartIdx = Math.max(0, Math.floor(relStartSec * ANALYSIS_RATE));
    const outFrames = Math.min(totalOutSamples - outStartIdx, Math.floor(clipDurSec * ANALYSIS_RATE));
    const ratio = srcSr / ANALYSIS_RATE;
    const srcOffsetFrames = clipOffSec * srcSr;

    // Anti-aliased box-average downsampling into 16 kHz analysis timeline
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
        mono16k[outStartIdx + i] += (acc / cnt) * gainLin;
      }
    }
  }

  // Normalize analysis signal peak to 0.9 for consistent flux thresholds across quiet/loud stems
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
    clipNames: validClips.map(c => c.name || path.basename(c.wavFile || '')),
  };
}

/**
 * Compute 200 Hz dual-band (low kick/bass <175 Hz + mid/high transient >175 Hz) onset flux,
 * precision 0.02-BPM comb-pulse tempo candidates, and exact Measure 1 Beat 1 downbeat timestamp.
 */
function analyzeAudioBeatGrid(mono16k, {
  earliestStartSec = 0,
  hintBpm = null,
} = {}) {
  const numFrames = Math.max(1, Math.floor(mono16k.length / HOP_SAMPLES));
  const lowEnergy = new Float32Array(numFrames);
  const highEnergy = new Float32Array(numFrames);

  // 1-pole crossover @ 175 Hz separating kick/bass fundamentals from snare/strum/hihat attacks
  const alpha = 1 - Math.exp((-2 * Math.PI * 175) / ANALYSIS_RATE);
  let lp = 0;
  for (let f = 0; f < numFrames; f++) {
    const base = f * HOP_SAMPLES;
    let lSq = 0;
    let hSq = 0;
    for (let i = 0; i < HOP_SAMPLES; i++) {
      const x = mono16k[base + i] || 0;
      lp += alpha * (x - lp);
      const hp = x - lp;
      lSq += lp * lp;
      hSq += hp * hp;
    }
    lowEnergy[f] = Math.sqrt(lSq / HOP_SAMPLES);
    highEnergy[f] = Math.sqrt(hSq / HOP_SAMPLES);
  }

  const lowFlux = new Float32Array(numFrames);
  const highFlux = new Float32Array(numFrames);
  const rawOnset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const lf = Math.max(0, Math.log1p(45 * lowEnergy[f]) - Math.log1p(45 * lowEnergy[f - 1]));
    const hf = Math.max(0, Math.log1p(45 * highEnergy[f]) - Math.log1p(45 * highEnergy[f - 1]));
    lowFlux[f] = lf;
    highFlux[f] = hf;
    rawOnset[f] = 1.25 * lf + 1.0 * hf;
  }

  // Subtract local moving floor (0.35s = 70 frames) & lightly smooth with [0.25, 0.5, 0.25]
  const onsetEnv = new Float32Array(numFrames);
  const halfWin = 35;
  let runningSum = 0;
  for (let i = 0; i < Math.min(numFrames, halfWin); i++) runningSum += rawOnset[i];
  const novelty = new Float32Array(numFrames);
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

  // Find p95 onset strength and first genuine musical onset timestamp
  const sortedEnv = Array.from(onsetEnv).sort((a, b) => a - b);
  const p95 = sortedEnv[Math.floor(sortedEnv.length * 0.95)] || 0.01;
  const maxEnv = sortedEnv[sortedEnv.length - 1] || 0.01;
  const firstOnsetThresh = Math.max(p95 * 0.30, maxEnv * 0.10, 0.005);

  let firstOnsetFrame = 0;
  for (let i = 0; i < numFrames; i++) {
    if (onsetEnv[i] >= firstOnsetThresh) {
      // Walk back up to 3 frames (15ms) to exact rising foot of the attack
      while (i > 0 && onsetEnv[i - 1] > firstOnsetThresh * 0.35 && onsetEnv[i - 1] <= onsetEnv[i]) {
        i--;
      }
      firstOnsetFrame = i;
      break;
    }
  }
  const firstMusicalOnsetSec = Number((earliestStartSec + firstOnsetFrame / ENV_RATE).toFixed(4));

  // Extract strong onset peaks for agent telemetry
  const strongHitTimesSec = [];
  const minPeakGapFrames = 18; // 90 ms
  let lastPeakFrame = -minPeakGapFrames;
  for (let i = 1; i < numFrames - 1; i++) {
    if (
      onsetEnv[i] >= p95 * 0.55 &&
      onsetEnv[i] >= onsetEnv[i - 1] &&
      onsetEnv[i] >= onsetEnv[i + 1] &&
      (i - lastPeakFrame) >= minPeakGapFrames
    ) {
      strongHitTimesSec.push(Number((earliestStartSec + i / ENV_RATE).toFixed(3)));
      lastPeakFrame = i;
      if (strongHitTimesSec.length >= 36) break;
    }
  }

  // Helper: evaluate fractional comb-pulse score + optimal beat phase for any BPM
  const evalPulseComb = (bpm) => {
    const periodFrames = (60 / bpm) * ENV_RATE;
    const phaseStep = 0.5; // 2.5 ms phase resolution
    let bestScore = -1;
    let bestPhaseFrames = 0;

    for (let ph = 0; ph < periodFrames; ph += phaseStep) {
      // Align search starting near firstOnsetFrame
      const startK = Math.max(0, Math.floor((firstOnsetFrame - ph) / periodFrames));
      let sum = 0;
      let count = 0;
      for (let pos = ph + startK * periodFrames; pos < numFrames - 2; pos += periodFrames) {
        const idx = Math.floor(pos);
        const frac = pos - idx;
        // Linear interpolation + +/-1 frame (5ms) micro-window tolerance
        const center = onsetEnv[idx] * (1 - frac) + onsetEnv[idx + 1] * frac;
        const neighbor = Math.max(onsetEnv[Math.max(0, idx - 1)], onsetEnv[Math.min(numFrames - 1, idx + 1)]) * 0.78;
        sum += Math.max(center, neighbor);
        count++;
      }
      const avgScore = count > 0 ? sum / Math.pow(count, 0.88) : 0;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestPhaseFrames = ph;
      }
    }
    return { bpm, rawScore: bestScore, bestPhaseFrames, periodFrames };
  };

  // Stage 1: Coarse scan 68..186 BPM (0.5 BPM step) combining autocorrelation + comb score + perceptual prior
  const coarseCandidates = [];
  for (let bpm = 68; bpm <= 186; bpm += 0.5) {
    const period = (60 / bpm) * ENV_RATE;
    const lag1 = Math.round(period);
    const lag2 = Math.round(period * 2);
    const lag4 = Math.round(period * 4);
    let ac1 = 0;
    let ac2 = 0;
    let ac4 = 0;
    let n1 = 0;
    for (let i = firstOnsetFrame; i + lag1 < numFrames; i += 2) {
      ac1 += onsetEnv[i] * onsetEnv[i + lag1];
      if (i + lag2 < numFrames) ac2 += onsetEnv[i] * onsetEnv[i + lag2];
      if (i + lag4 < numFrames) ac4 += onsetEnv[i] * onsetEnv[i + lag4];
      n1++;
    }
    const normAc = n1 > 0 ? (ac1 + 0.55 * ac2 + 0.30 * ac4) / n1 : 0;
    // Ellis standard perceptual rock/pop/metal tempo prior centered around 122 BPM
    const logDist = Math.log2(bpm / 122);
    const prior = Math.exp(-0.5 * Math.pow(logDist / 0.62, 2));
    coarseCandidates.push({ bpm, score: normAc * (0.65 + 0.35 * prior) });
  }
  coarseCandidates.sort((a, b) => b.score - a.score);

  // Pick top 4 distinct tempo peaks (> 4 BPM apart) for fine 0.02-BPM comb refinement
  const distinctPeaks = [];
  if (Number.isFinite(hintBpm) && hintBpm >= 45 && hintBpm <= 240) {
    distinctPeaks.push(hintBpm);
  }
  for (const c of coarseCandidates) {
    if (distinctPeaks.every(p => Math.abs(p - c.bpm) > 4.5)) {
      distinctPeaks.push(c.bpm);
      if (distinctPeaks.length >= 4) break;
    }
  }

  const refinedCandidates = [];
  for (const seedBpm of distinctPeaks) {
    let bestFine = null;
    const lo = Math.max(50, seedBpm - 1.6);
    const hi = Math.min(220, seedBpm + 1.6);
    for (let b = lo; b <= hi + 0.001; b += 0.05) {
      const curBpm = Number(b.toFixed(2));
      const res = evalPulseComb(curBpm);
      const logDist = Math.log2(curBpm / 122);
      const prior = Math.exp(-0.5 * Math.pow(logDist / 0.68, 2));
      const weighted = res.rawScore * (0.72 + 0.28 * prior);
      if (!bestFine || weighted > bestFine.weightedScore) {
        bestFine = { ...res, weightedScore: weighted };
      }
    }
    // Ultra-fine 0.01 BPM polish around bestFine
    if (bestFine) {
      const center = bestFine.bpm;
      for (let b = center - 0.06; b <= center + 0.0601; b += 0.01) {
        const curBpm = Number(b.toFixed(2));
        const res = evalPulseComb(curBpm);
        const logDist = Math.log2(curBpm / 122);
        const prior = Math.exp(-0.5 * Math.pow(logDist / 0.68, 2));
        const weighted = res.rawScore * (0.72 + 0.28 * prior);
        if (weighted > bestFine.weightedScore) {
          bestFine = { ...res, weightedScore: weighted };
        }
      }
      // Snap to clean integer BPM if within 0.08 BPM and >= 99.2% of score (since studio masters are almost always integer BPM!)
      const nearestInt = Math.round(bestFine.bpm);
      if (Math.abs(bestFine.bpm - nearestInt) <= 0.08) {
        const intEval = evalPulseComb(nearestInt);
        if (intEval.rawScore >= bestFine.rawScore * 0.992) {
          bestFine = { ...intEval, bpm: nearestInt, weightedScore: bestFine.weightedScore };
        }
      }
      refinedCandidates.push(bestFine);
    }
  }
  refinedCandidates.sort((a, b) => b.weightedScore - a.weightedScore);

  const lockPhaseForBpmAndMeter = (targetBpm, beatsPerBar = 4) => {
    // Polish BPM within +/-0.8 BPM around targetBpm for tightest comb lock
    let locked = evalPulseComb(targetBpm);
    for (let b = targetBpm - 0.75; b <= targetBpm + 0.751; b += 0.02) {
      const cur = Number(b.toFixed(2));
      if (cur < 40 || cur > 260) continue;
      const ev = evalPulseComb(cur);
      if (ev.rawScore > locked.rawScore * 1.008) {
        locked = ev;
      }
    }
    const nearestInt = Math.round(locked.bpm);
    if (Math.abs(locked.bpm - nearestInt) <= 0.12) {
      const intEv = evalPulseComb(nearestInt);
      if (intEv.rawScore >= locked.rawScore * 0.982) locked = { ...intEv, bpm: nearestInt };
    }

    const periodFrames = locked.periodFrames;
    const ph = locked.bestPhaseFrames;

    // Collect all beat grid frames >= firstOnsetFrame - 0.12*periodFrames
    const beatFrames = [];
    const firstK = Math.max(0, Math.ceil((firstOnsetFrame - periodFrames * 0.15 - ph) / periodFrames));
    for (let k = firstK; ; k++) {
      const pos = ph + k * periodFrames;
      if (pos >= numFrames - 1) break;
      beatFrames.push(pos);
    }

    // Score each bar-phase offset (0 .. beatsPerBar-1) using kick/bass downbeat + snare backbeat accents
    const barScores = new Array(beatsPerBar).fill(0);
    for (let m = 0; m < beatsPerBar; m++) {
      let s = 0;
      let n = 0;
      for (let bi = m; bi < beatFrames.length; bi += beatsPerBar) {
        const f0 = Math.round(beatFrames[bi]);
        s += 1.45 * (lowFlux[f0] || 0) + 0.75 * (highFlux[f0] || 0);
        // Backbeat reinforcement on beat 3 (m + 2) in 4/4
        if (beatsPerBar === 4 && bi + 2 < beatFrames.length) {
          const fBack = Math.round(beatFrames[bi + 2]);
          s += 0.95 * (highFlux[fBack] || 0);
        }
        n++;
      }
        const openingBonus = m === 0 ? 1.38 : 1.0;
      barScores[m] = n > 0 ? (s / n) * openingBonus : 0;
    }

    // Default to m = 0 (first grid beat of the music = Bar 1 Beat 1 so the 1-bar count-off precedes the music cleanly),
    // unless a pickup/anacrusis makes a later bar phase overwhelmingly stronger (> 25% higher even after openingBonus).
    let bestBarOffset = 0;
    for (let m = 1; m < beatsPerBar; m++) {
      if (barScores[m] > barScores[bestBarOffset] * 1.25) bestBarOffset = m;
    }

    const downbeatFramePos = beatFrames.length > bestBarOffset
      ? beatFrames[bestBarOffset]
      : (ph + firstK * periodFrames);
    const firstDownbeatSec = Number((earliestStartSec + downbeatFramePos / ENV_RATE).toFixed(4));

    return {
      bpm: Number(locked.bpm.toFixed(2)),
      beatsPerBar,
      firstDownbeatSec,
      firstMusicalOnsetSec,
      barPhaseScores: barScores.map(v => Number(v.toFixed(4))),
      combConfidence: Number(clamp(0.45, 0.99, locked.rawScore / Math.max(0.02, p95 * 1.4)).toFixed(2)),
    };
  };

  const primary = refinedCandidates[0] || evalPulseComb(hintBpm || 120);
  const defaultLock = lockPhaseForBpmAndMeter(primary.bpm, 4);

  return {
    ...defaultLock,
    topTempoCandidates: refinedCandidates.slice(0, 4).map(c => ({
      bpm: Number(c.bpm.toFixed(2)),
      score: Number(c.weightedScore.toFixed(4)),
    })),
    strongHitTimesSec,
    lockPhaseForBpmAndMeter,
  };
}

/**
 * Synthesize a crisp, studio-grade 16-bit PCM WAV click track starting exactly 1 full measure
 * BEFORE `firstDownbeatSec` (the 1-bar count-off!) through `endSec`.
 */
function synthesizeAlignedClickWav({
  bpm = 120,
  beatsPerBar = 4,
  countInBars = 1,
  firstDownbeatSec = 2.0,
  songEndSec = 16.0,
  subdivision = 'quarter',
  sampleRate = 48000,
} = {}) {
  const safeBpm = clamp(40, 260, Number(bpm) || 120);
  const safeBeats = clamp(2, 12, Math.round(Number(beatsPerBar) || 4));
  const beatSec = 60 / safeBpm;
  const measureSec = safeBeats * beatSec;

  const clipStartSec = Math.max(0, Number((firstDownbeatSec - countInBars * measureSec).toFixed(4)));
  const totalDurationSec = Math.max(measureSec * 2, (songEndSec - clipStartSec) + beatSec * 0.5);
  const totalFrames = Math.ceil(totalDurationSec * sampleRate);
  const floatBuf = new Float32Array(totalFrames);
  const transients = [];

  const totalBeats = Math.floor((totalDurationSec - 0.04) / beatSec);
  const countInBeats = countInBars * safeBeats;
  const addEighthGhost = subdivision === 'eighth' && safeBpm <= 88;

  for (let b = 0; b <= totalBeats; b++) {
    const isCountIn = b < countInBeats;
    const barBeatIdx = isCountIn ? (b % safeBeats) : ((b - countInBeats) % safeBeats);
    const isDownbeat = barBeatIdx === 0;
    const beatRelSec = (firstDownbeatSec - clipStartSec) + (b - countInBeats) * beatSec;
    if (beatRelSec < -0.001 || beatRelSec >= totalDurationSec - 0.035) continue;

    const startSample = Math.max(0, Math.round(beatRelSec * sampleRate));
    const clickDurSec = isCountIn ? 0.055 : (isDownbeat ? 0.046 : 0.036);
    const clickFrames = Math.min(totalFrames - startSample, Math.floor(clickDurSec * sampleRate));

    // Distinct Studio Stick/Cowbell Count-Off vs Urei/ProTools Woodblock Song Click
    const fPrimary = isCountIn
      ? (isDownbeat ? 1567.98 : 1174.66) // Count-Off: G6 accent, D6 stick count ("1 - 2 - 3 - 4!")
      : (isDownbeat ? 1318.51 : 880.00); // Song Click: E6 downbeat, A5 quarter beat
    const fBody = fPrimary * 0.5;
    const amp = isCountIn
      ? (isDownbeat ? 0.86 : 0.74)
      : (isDownbeat ? 0.78 : 0.56);
    const decayRate = isCountIn ? 68 : (isDownbeat ? 82 : 98);

    for (let i = 0; i < clickFrames; i++) {
      const t = i / sampleRate;
      const attack = Math.min(1, i / Math.max(1, sampleRate * 0.0008)); // 0.8ms ultra-crisp de-clicked attack
      const stickSnap = Math.exp(-950 * t) * Math.sin(2 * Math.PI * 3100 * t) * (isCountIn ? 0.55 : 0.35);
      const tone = (0.72 * Math.sin(2 * Math.PI * fPrimary * t) + 0.28 * Math.sin(2 * Math.PI * fBody * t)) * Math.exp(-decayRate * t);
      floatBuf[startSample + i] += attack * amp * (tone + stickSnap);
    }

    transients.push({
      timeSec: Number(Math.max(0, beatRelSec).toFixed(4)),
      peakDb: Number((20 * Math.log10(amp)).toFixed(1)),
      velocity: isDownbeat ? 0.95 : 0.72,
    });

    if (!isCountIn && addEighthGhost) {
      const subRelSec = beatRelSec + beatSec * 0.5;
      const subStart = Math.round(subRelSec * sampleRate);
      const subFrames = Math.min(totalFrames - subStart, Math.floor(0.024 * sampleRate));
      for (let i = 0; i < subFrames; i++) {
        const t = i / sampleRate;
        const attack = Math.min(1, i / Math.max(1, sampleRate * 0.0008));
        floatBuf[subStart + i] += attack * 0.22 * Math.sin(2 * Math.PI * 660 * t) * Math.exp(-130 * t);
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
 * End-to-end Gemini-preferred RobOS Agent + DSP Click Track Generator.
 * Inserts the new Click Track directly beneath `sourceTrackId` (`sourceIdx + 1`),
 * shifts session items forward if needed so the 1-measure count-off fits cleanly >= 00:00.100,
 * and locks every click to the exact detected beat phase.
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

  if (onProgress) {
    onProgress({ stage: 'dsp', message: `Extracting 5ms onset flux & beat phase from "${sourceTrack.name}"...` });
  }

  // Parse any explicit BPM hint in the track/clip filename (e.g. "Song_128bpm.mp3")
  const combinedTitle = [sourceTrack.name, ...(sourceTrack.clips || []).map(c => c.name)].join(' ');
  const bpmNameMatch = combinedTitle.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/i);
  const nameHintBpm = bpmNameMatch ? Number(bpmNameMatch[1]) : null;

  const assembled = assembleTrackTimelineMono(sourceTrack);
  const dspGrid = analyzeAudioBeatGrid(assembled.mono16k, {
    earliestStartSec: assembled.earliestStartSec,
    hintBpm: nameHintBpm,
  });

  let chosenBpm = dspGrid.bpm;
  let chosenBeatsPerBar = dspGrid.beatsPerBar || 4;
  let chosenNoteValue = 4;
  let chosenSubdivision = 'quarter';
  let agentProviderUsed = 'dsp-comb-correlator';
  let agentReasoning = `Locked ${dspGrid.bpm} BPM (${chosenBeatsPerBar}/4) with 1-measure count-off aligned to downbeat at ${dspGrid.firstDownbeatSec.toFixed(3)}s.`;

  // Consult RobOS Agent (preferring Gemini / `antigravity` first!) with audio excerpt + DSP telemetry
  let aiAgent = aiAgentModule;
  if (!aiAgent && process.env.ROBOS_TEST !== '1') {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }

  if (aiAgent && typeof aiAgent.ask === 'function') {
    const workId = `click-${crypto.randomBytes(3).toString('hex')}`;
    const analysisDir = path.join(getClickAnalysisRoot(), workId);
    fs.mkdirSync(analysisDir, { recursive: true });

    try {
      // Save compact 18s 16kHz excerpt starting right around the first musical onset for Gemini
      const excerptOffsetSec = Math.max(0, (dspGrid.firstMusicalOnsetSec - assembled.earliestStartSec) - 0.5);
      const exStartSample = Math.floor(excerptOffsetSec * ANALYSIS_RATE);
      const exLenSamples = Math.min(assembled.mono16k.length - exStartSample, ANALYSIS_RATE * 18);
      const excerptSlice = assembled.mono16k.subarray(exStartSample, exStartSample + Math.max(320, exLenSamples));
      fs.writeFileSync(path.join(analysisDir, 'track-excerpt.wav'), encodeMono16Wav(excerptSlice, ANALYSIS_RATE));

      const telemetry = {
        trackName: sourceTrack.name,
        clipNames: assembled.clipNames,
        earliestClipStartSec: assembled.earliestStartSec,
        latestClipEndSec: assembled.latestEndSec,
        firstMusicalOnsetSec: dspGrid.firstMusicalOnsetSec,
        dspPrimaryBpm: dspGrid.bpm,
        dspFirstDownbeatSec: dspGrid.firstDownbeatSec,
        dspCombConfidence: dspGrid.combConfidence,
        topTempoCandidates: dspGrid.topTempoCandidates,
        halfTimeCandidateBpm: Number((dspGrid.bpm * 0.5).toFixed(2)),
        doubleTimeCandidateBpm: Number((dspGrid.bpm * 2.0).toFixed(2)),
        strongHitTimesSec: dspGrid.strongHitTimesSec,
        barPhaseScores4_4: dspGrid.barPhaseScores,
      };
      fs.writeFileSync(path.join(analysisDir, 'beat-analysis.json'), JSON.stringify(telemetry, null, 2), 'utf8');

      const candidateProviders = [];
      const pushUnique = (id) => { if (id && !candidateProviders.includes(id)) candidateProviders.push(id); };
      pushUnique(preferredProvider || 'antigravity');
      pushUnique('antigravity');
      if (typeof aiAgent.getActiveProviderId === 'function') pushUnique(aiAgent.getActiveProviderId());
      for (const p of (aiAgent.PROVIDERS || [])) pushUnique(p.id);

      const prompt = [
        'You are an expert studio drummer, tempo-map engineer, and music producer.',
        `Generate a precision click-track tempo & meter plan for the track "${sourceTrack.name}" (${assembled.clipNames.join(', ')}).`,
        'In the current directory you have `beat-analysis.json` (5ms dual-band onset flux comb candidates, strong transient timestamps, and 4/4 bar-phase scores) and `track-excerpt.wav` (16kHz audio excerpt).',
        'Read `beat-analysis.json` (do NOT run shell commands) and determine:',
        '  1. The true musical drummer BPM (choose between standard, half-time, or double-time if appropriate so a drummer feels comfortable quarter-note clicks, typically 72-175 BPM).',
        '  2. Time signature (`beatsPerBar` e.g. 4, 3, 6, 5, 7 and `noteValue` e.g. 4 or 8).',
        '  3. `subdivision`: `"quarter"` (standard) or `"eighth"` (only for very slow ballads < 75 BPM).',
        'Reply ONLY with raw JSON (no markdown fences):',
        '{"bpm":120.0,"beatsPerBar":4,"noteValue":4,"subdivision":"quarter","reasoning":"1 short sentence"}',
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
            providerId,
            message: `Aligning click track & 1-measure count-off with ${provDef?.name || providerId}...`,
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
          if (Number.isFinite(pBpm) && pBpm >= 45 && pBpm <= 240) {
            chosenBpm = pBpm;
            chosenBeatsPerBar = clamp(2, 12, Math.round(Number(parsed.beatsPerBar) || 4));
            chosenNoteValue = [2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : 4;
            chosenSubdivision = parsed.subdivision === 'eighth' ? 'eighth' : 'quarter';
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

  // Re-run 2.5ms DSP fractional comb phase-lock around the chosen BPM & meter so every click hits transients dead-on!
  const finalLock = dspGrid.lockPhaseForBpmAndMeter(chosenBpm, chosenBeatsPerBar);
  const lockedBpm = finalLock.bpm;
  let firstDownbeatSec = finalLock.firstDownbeatSec;
  let songEndSec = assembled.latestEndSec;

  const beatSec = 60 / lockedBpm;
  const measureSec = chosenBeatsPerBar * beatSec;

  // Ensure there is room >= 0.08s on the timeline BEFORE `firstDownbeatSec` for the 1-measure count-off!
  let timelineShiftSec = 0;
  if (firstDownbeatSec - measureSec < 0.08) {
    timelineShiftSec = Number(((measureSec - firstDownbeatSec) + 0.10).toFixed(4));
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
  }

  const sampleRate = Number(project.sampleRate) || 48000;
  const clickSynth = synthesizeAlignedClickWav({
    bpm: lockedBpm,
    beatsPerBar: chosenBeatsPerBar,
    countInBars: 1,
    firstDownbeatSec,
    songEndSec,
    subdivision: chosenSubdivision,
    sampleRate,
  });

  fs.mkdirSync(takesDir, { recursive: true });
  const clipId = `click-${crypto.randomBytes(4).toString('hex')}`;
  const wavFileName = `${clipId}-${Math.round(lockedBpm)}bpm.wav`;
  const wavFilePath = path.join(takesDir, wavFileName);
  fs.writeFileSync(wavFilePath, clickSynth.wavBuffer);

  const numBuckets = Math.min(1200, Math.max(240, Math.round(clickSynth.durationSec * 8)));
  const peakInfo = computeWaveformPeaks(clickSynth.wavBuffer, numBuckets);

  const bpmDisplay = Number.isInteger(lockedBpm) ? String(lockedBpm) : lockedBpm.toFixed(1);
  const clickTrack = buildTrackFromWizard({
    profileId: 'acoustic-inst',
    name: `Click (${bpmDisplay} BPM · ${chosenBeatsPerBar}/${chosenNoteValue})`,
    inputNodeName: '',
    inputLabel: `AI Click Track (${agentProviderUsed})`,
    armed: false,
  });
  clickTrack.shortLabel = 'Click';
  clickTrack.color = '#00d4ff';
  clickTrack.image = 'assets/icons/metronome.webp';
  clickTrack.volume = 0.85;
  clickTrack.pan = 0;
  // Inherit solo state if existing tracks are soloed so the click track is immediately audible!
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
    name: `1-Bar Count + Click (${bpmDisplay} BPM ${chosenBeatsPerBar}/${chosenNoteValue})`,
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
  };
  clickTrack.clips.push(clickClip);

  // Insert Click Track DIRECTLY UNDERNEATH the source track (`sourceIdx + 1`)
  tracks.splice(sourceIdx + 1, 0, clickTrack);

  // Sync session BPM & Time Signature to the detected groove
  project.bpm = Number(lockedBpm.toFixed(2));
  project.timeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;

  return {
    ok: true,
    project,
    clickTrack,
    clickClip,
    bpm: project.bpm,
    timeSignature: project.timeSignature,
    countInStartSec: clickSynth.clipStartSec,
    firstDownbeatSec,
    timelineShiftSec,
    provider: agentProviderUsed,
    reasoning: agentReasoning,
  };
}

module.exports = {
  assembleTrackTimelineMono,
  analyzeAudioBeatGrid,
  synthesizeAlignedClickWav,
  generateAlignedClickTrackForProject,
};
