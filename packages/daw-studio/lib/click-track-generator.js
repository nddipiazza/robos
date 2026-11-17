'use strict';

/**
 * RobOS DAW Studio — AI + DSP Beat-Locked & Multi-Tempo Click Track Generator
 *
 * Analyzes any audio/video/mic track's clips across the full song duration (up to 15 min)
 * using 200 Hz (5ms) 3-band percussive-enhanced onset flux (with rolling temporal median
 * harmonic suppression to strip sustained guitars/vocals), octave-reinforced pulse-contrast
 * comb correlation, and Viterbi piecewise-constant tempo-map segmentation with exact
 * beat-boundary handoffs.
 *
 * Automatically cross-references any time-aligned unseparated sibling stem in the session
 * (e.g. when generating a click track from a `Remove Drums` / `_mixed` drumless track),
 * consults the RobOS Agent (preferring Gemini / `antigravity` first) to verify meter and
 * half/double-time drummer feel, and synthesizes a sample-accurate click track with a
 * 1-measure count-off inserted directly below the source track.
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
 * Find an optional time-aligned full-mix sibling track in `project` when `sourceTrack`
 * is a drumless / separated stem (`separatedFromClipId` or `No Drums` / `mixed`), so beat
 * detection benefits from the original drum transients while placing the click under `sourceTrack`.
 */
function findAlignedReferenceTrack(project, sourceTrack) {
  const tracks = project?.tracks || [];
  const srcClips = (sourceTrack?.clips || []).filter(c => !c.muted && c.wavFile && fs.existsSync(c.wavFile));
  if (!srcClips.length) return null;

  const primaryClip = srcClips[0];
  // 1. Direct provenance link from `Remove Drums` (`separatedFromClipId`)
  if (primaryClip.separatedFromClipId) {
    for (const tr of tracks) {
      if (tr.id === sourceTrack.id) continue;
      if ((tr.clips || []).some(c => c.id === primaryClip.separatedFromClipId && c.wavFile && fs.existsSync(c.wavFile))) {
        return tr;
      }
    }
  }

  // 2. Heuristic match when source track/clip looks like a drumless or custom backing stem
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
 * horizontal sustained harmonic energy (distorted guitars, vocals, synth pads) while
 * preserving vertical drum/pluck transients.
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
    // Insertion sort on tiny 25-element scratch array (extremely fast in V8, zero allocations!)
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

/**
 * Compute 200 Hz 3-band percussive onset flux, detect whether the song has a constant BPM
 * or a multi-section tempo map (via MAD-standardized Viterbi dynamic programming), and lock
 * sub-5ms beat phases + bar downbeats across every section.
 */
function analyzeAudioBeatGrid(mono16k, {
  earliestStartSec = 0,
  hintBpm = null,
} = {}) {
  const numFrames = Math.max(1, Math.floor(mono16k.length / HOP_SAMPLES));
  const rawSub = new Float32Array(numFrames);   // < 135 Hz: Kick & Bass fundamentals
  const rawMid = new Float32Array(numFrames);   // 135..2400 Hz: Snare body, Toms, Plucks
  const rawHigh = new Float32Array(numFrames);  // > 2400 Hz: Stick snap, Hi-Hat, Pick attack

  const a135 = 1 - Math.exp((-2 * Math.PI * 135) / ANALYSIS_RATE);
  const a2400 = 1 - Math.exp((-2 * Math.PI * 2400) / ANALYSIS_RATE);
  let lp135_1 = 0;
  let lp135_2 = 0;
  let lp2400 = 0;

  for (let f = 0; f < numFrames; f++) {
    const base = f * HOP_SAMPLES;
    let sSq = 0;
    let mSq = 0;
    let hSq = 0;
    for (let i = 0; i < HOP_SAMPLES; i++) {
      const x = mono16k[base + i] || 0;
      lp135_1 += a135 * (x - lp135_1);
      lp135_2 += a135 * (lp135_1 - lp135_2);
      lp2400 += a2400 * (x - lp2400);
      const sub = lp135_2;
      const high = x - lp2400;
      const mid = lp2400 - lp135_2;
      sSq += sub * sub;
      mSq += mid * mid;
      hSq += high * high;
    }
    rawSub[f] = Math.sqrt(sSq / HOP_SAMPLES);
    rawMid[f] = Math.sqrt(mSq / HOP_SAMPLES);
    rawHigh[f] = Math.sqrt(hSq / HOP_SAMPLES);
  }

  // Strip sustained notes (~125ms median window) to isolate percussive attacks
  const percSub = suppressSustainedHarmonics(rawSub, 12, 0.72);
  const percMid = suppressSustainedHarmonics(rawMid, 12, 0.80);
  const percHigh = suppressSustainedHarmonics(rawHigh, 12, 0.82);

  const lowFlux = new Float32Array(numFrames);
  const highFlux = new Float32Array(numFrames);
  const rawOnset = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const sf = Math.max(0, Math.log1p(55 * percSub[f]) - Math.log1p(55 * percSub[f - 1]));
    const mf = Math.max(0, Math.log1p(45 * percMid[f]) - Math.log1p(45 * percMid[f - 1]));
    const hf = Math.max(0, Math.log1p(45 * percHigh[f]) - Math.log1p(45 * percHigh[f - 1]));
    lowFlux[f] = sf;
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

  /**
   * Evaluate razor-sharp On-Beat minus Off-Beat Pulse Contrast + Eighth-Note Subdivision
   * Reinforcement on any frame slice `[startFrame, endFrame)`.
   */
  const evalRangePulseComb = (bpm, startFrame = firstOnsetFrame, endFrame = numFrames) => {
    const periodFrames = (60 / bpm) * ENV_RATE;
    const phaseStep = 0.5; // 2.5 ms phase resolution
    let bestContrast = -1e9;
    let bestPerBeatContrast = 0;
    let bestRawSum = 0;
    let bestPhaseFrames = 0;

    for (let ph = 0; ph < periodFrames; ph += phaseStep) {
      const startK = Math.max(0, Math.ceil((startFrame - ph) / periodFrames));
      let onSum = 0;
      let offSum = 0;
      let subSum = 0;
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

        // Quarter-period off-beat (16th-note midpoint) suppresses 3:4 / 4:3 polyrhythmic false peaks
        const qPos = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.25));
        const qPos3 = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.75));
        offSum += 0.5 * (onsetEnv[qPos] + onsetEnv[qPos3]);

        // Eighth-note midpoint reinforces true duple/quadruple grooves over 4/3 triplet ghosts
        const halfPos = Math.min(endFrame - 1, Math.round(pos + periodFrames * 0.5));
        subSum += onsetEnv[halfPos];
        count++;
      }

      if (count > 0) {
        const num = (onSum - 0.52 * offSum) + 0.18 * Math.max(0, subSum - offSum);
        const normDen = Math.pow(count, 0.92);
        const contrast = num / normDen;
        if (contrast > bestContrast) {
          bestContrast = contrast;
          bestPerBeatContrast = num / count;
          bestRawSum = onSum / normDen;
          bestPhaseFrames = ph;
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
    };
  };

  /**
   * Polish BPM to 0.02 BPM & lock 2.5ms beat phase + bar downbeat within `[segStartFrame, segEndFrame)`.
   */
  const lockSegmentGrid = (seedBpm, segStartFrame, segEndFrame, beatsPerBar = 4, isFirstSegment = false) => {
    let locked = evalRangePulseComb(seedBpm, segStartFrame, segEndFrame);
    const searchRadius = 1.4;
    for (let b = seedBpm - searchRadius; b <= seedBpm + searchRadius + 0.001; b += 0.1) {
      const cur = Number(b.toFixed(2));
      if (cur < 42 || cur > 250) continue;
      const ev = evalRangePulseComb(cur, segStartFrame, segEndFrame);
      if (ev.rawScore > locked.rawScore * 1.004) locked = ev;
    }
    const fineCenter = locked.bpm;
    for (let b = fineCenter - 0.14; b <= fineCenter + 0.1401; b += 0.02) {
      const cur = Number(b.toFixed(2));
      if (cur < 42 || cur > 250) continue;
      const ev = evalRangePulseComb(cur, segStartFrame, segEndFrame);
      if (ev.rawScore > locked.rawScore * 1.002) locked = ev;
    }

    // Studio recordings and DAW tempo maps almost always use exact integer BPMs (e.g. 100, 129, 145)
    const nearestInt = Math.round(locked.bpm);
    if (Math.abs(locked.bpm - nearestInt) <= 0.18) {
      const intEv = evalRangePulseComb(nearestInt, segStartFrame, segEndFrame);
      if (intEv.rawScore >= locked.rawScore * 0.962) {
        locked = { ...intEv, bpm: nearestInt };
      }
    }

    const periodFrames = locked.periodFrames;
    const ph = locked.bestPhaseFrames;
    const minAnchorFrame = isFirstSegment ? Math.max(0, firstOnsetFrame - periodFrames * 0.15) : segStartFrame;
    const firstK = Math.max(0, Math.ceil((minAnchorFrame - ph) / periodFrames));
    const beatFrames = [];
    for (let k = firstK; ; k++) {
      const pos = ph + k * periodFrames;
      if (pos >= segEndFrame - 1) break;
      beatFrames.push(pos);
    }

    // Score bar downbeat phase (0 .. beatsPerBar-1) using kick/sub on Beat 1 + snare/mid on Beat 3
    const barScores = new Array(beatsPerBar).fill(0);
    for (let m = 0; m < beatsPerBar; m++) {
      let s = 0;
      let n = 0;
      for (let bi = m; bi < beatFrames.length; bi += beatsPerBar) {
        const f0 = clamp(0, numFrames - 1, Math.round(beatFrames[bi]));
        s += 1.55 * (lowFlux[f0] || 0) + 0.70 * (highFlux[f0] || 0);
        if (beatsPerBar === 4 && bi + 2 < beatFrames.length) {
          const fBack = clamp(0, numFrames - 1, Math.round(beatFrames[bi + 2]));
          s += 1.05 * (highFlux[fBack] || 0);
        }
        n++;
      }
      const openingBonus = (isFirstSegment && m === 0) ? 1.35 : 1.0;
      barScores[m] = n > 0 ? (s / n) * openingBonus : 0;
    }

    let bestBarOffset = 0;
    for (let m = 1; m < beatsPerBar; m++) {
      const reqRatio = isFirstSegment ? 1.24 : 1.04;
      if (barScores[m] > barScores[bestBarOffset] * reqRatio) {
        bestBarOffset = m;
      }
    }

    let downbeatFramePos = beatFrames.length > bestBarOffset
      ? beatFrames[bestBarOffset]
      : (ph + firstK * periodFrames);
    if (isFirstSegment) {
      const measureFrames = beatsPerBar * periodFrames;
      while (downbeatFramePos - measureFrames >= firstOnsetFrame - periodFrames * 0.22) {
        downbeatFramePos -= measureFrames;
      }
    }

    return {
      bpm: Number(locked.bpm.toFixed(2)),
      beatsPerBar,
      phaseFrames: ph,
      periodFrames,
      firstBeatFrame: beatFrames[0] ?? downbeatFramePos,
      downbeatFramePos,
      firstDownbeatSec: Number((earliestStartSec + downbeatFramePos / ENV_RATE).toFixed(4)),
      barPhaseScores: barScores.map(v => Number(v.toFixed(4))),
      rawScore: locked.rawScore,
      perBeatContrast: locked.perBeatContrast,
      combConfidence: Number(clamp(0.45, 0.99, locked.onBeatAvg / Math.max(0.02, p95 * 1.35)).toFixed(2)),
    };
  };

  // ─── Stage 1: Global Constant-Tempo Candidates ─────────────────────────────
  const coarseCandidates = [];
  for (let bpm = 68; bpm <= 186; bpm += 0.5) {
    const period = (60 / bpm) * ENV_RATE;
    let ac = 0;
    for (const [mult, wt] of [[1, 1.0], [2, 0.80], [4, 0.65], [8, 0.40]]) {
      const lag = period * mult;
      const li = Math.floor(lag);
      const fr = lag - li;
      if (firstOnsetFrame + li + 2 >= numFrames) continue;
      let sum = 0;
      let cnt = 0;
      for (let i = firstOnsetFrame; i + li + 1 < numFrames; i += 2) {
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
    const locked = lockSegmentGrid(seed, firstOnsetFrame, numFrames, 4, true);
    const logDist = Math.log2(locked.bpm / 124);
    const prior = 0.76 + 0.24 * Math.exp(-0.5 * Math.pow(logDist / 0.68, 2));
    refinedCandidates.push({
      ...locked,
      weightedScore: locked.rawScore * prior,
    });
  }
  refinedCandidates.sort((a, b) => b.weightedScore - a.weightedScore);

  // Deduplicate refined candidates that converged to the same BPM
  const uniqueRefined = [];
  for (const rc of refinedCandidates) {
    if (uniqueRefined.every(u => Math.abs(u.bpm - rc.bpm) > 0.6)) {
      uniqueRefined.push(rc);
    }
  }

  // ─── Stage 2: Sliding Tempogram + Viterbi Multi-Tempo Segmentation ─────────
  const activeDurationSec = (numFrames - firstOnsetFrame) / ENV_RATE;
  let detectedSegments = null;

  if (!hintBpm && activeDurationSec >= 26) {
    const candBpms = [];
    for (let b = 72; b <= 180; b += 0.5) candBpms.push(b);
    const B = candBpms.length;
    const priorArr = candBpms.map(b => 0.78 + 0.22 * Math.exp(-0.5 * Math.pow(Math.log2(b / 124) / 0.65, 2)));

    const stepSec = 2.0;
    const winSec = 12.0;
    const centersSec = [];
    for (let tc = (firstOnsetFrame / ENV_RATE) + 2.5; tc < (numFrames / ENV_RATE) - 2.0; tc += stepSec) {
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
          // Evaluate fundamental + bar multiples + eighth-note subdivision (0.5*per) to reject 4/3 triplet ghosts!
          for (const [mult, wt] of [[0.5, 0.28], [1, 1.0], [2, 0.85], [4, 0.75], [8, 0.42]]) {
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

        // Normalize frame observation by max(MAD, (peak - median)/4.5) so sparse clean drums never clip sub-harmonics to 1.0!
        const sortedRow = Array.from(rowScratch).sort((a, b) => a - b);
        const med = sortedRow[B >> 1];
        const rowMax = sortedRow[B - 1] || 0;
        const absDevs = sortedRow.map(v => Math.abs(v - med)).sort((a, b) => a - b);
        const scale = Math.max(absDevs[B >> 1] * 1.4826, (rowMax - med) / 4.5, 1e-5);
        for (let bi = 0; bi < B; bi++) {
          obs[ti * B + bi] = clamp(-1.0, 6.0, (obs[ti * B + bi] - med) / scale) / 6.0;
        }
      }

      // Viterbi piecewise-constant decoding (jumpPenalty requires >= 8-10s of decisive dominance to switch BPM)
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

      // Group contiguous runs & merge short blips (< 8s) or near-identical BPMs (<= 1.5 BPM)
      const rawSegs = [];
      let curBpm = candBpms[pathIdx[0]];
      let segStartRelSec = firstOnsetFrame / ENV_RATE;
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

      // Absorb any micro-segment < 8s into its neighbor
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

      // Disambiguate 4/3 triplet ghosts (e.g. 133.5 BPM when true pulse is 100.0 BPM!) inside each segment
      if (mergedSegs.length >= 2) {
        const lockedSegs = mergedSegs.map((ms, idx) => {
          const f0 = Math.max(0, Math.floor(ms.startRelSec * ENV_RATE));
          const f1 = Math.min(numFrames, Math.ceil(ms.endRelSec * ENV_RATE));
          let bestLock = lockSegmentGrid(ms.seedBpm, f0, f1, 4, idx === 0);

          // Check 3/4 ratio (e.g. 133.5 * 0.75 = 100.1 -> 100 BPM) if it has strong eighth-note (2x) support!
          const threeQuarterSeed = ms.seedBpm * 0.75;
          if (threeQuarterSeed >= 76 && threeQuarterSeed <= 145) {
            const altLock = lockSegmentGrid(threeQuarterSeed, f0, f1, 4, idx === 0);
            const altDouble = evalRangePulseComb(altLock.bpm * 2, f0, f1);
            const curDouble = evalRangePulseComb(bestLock.bpm * 2, f0, f1);
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

        // Re-merge if two adjacent segments polished to the same BPM (e.g. both -> 129 BPM)
        const dedupLocked = [];
        for (const seg of lockedSegs) {
          if (dedupLocked.length > 0 && Math.abs(dedupLocked[dedupLocked.length - 1].bpm - seg.bpm) <= 0.8) {
            const prev = dedupLocked[dedupLocked.length - 1];
            const reLocked = lockSegmentGrid(prev.bpm, prev.startFrame, seg.endFrame, 4, dedupLocked.length === 1);
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
          // Refine every transition boundary `k -> k+1` within +/- 5.5s to the exact beat handoff maximizing onset alignment!
          for (let k = 0; k < dedupLocked.length - 1; k++) {
            const left = dedupLocked[k];
            const right = dedupLocked[k + 1];
            const coarseFrame = right.startFrame;
            const winFrames = Math.round(5.5 * ENV_RATE);
            const searchLo = Math.max(left.startFrame + Math.round(left.periodFrames * 4), coarseFrame - winFrames);
            const searchHi = Math.min(right.endFrame - Math.round(right.periodFrames * 4), coarseFrame + winFrames);

            if (searchHi > searchLo) {
              // Precompute cumulative beat alignment on `left` grid vs `right` grid across [searchLo, searchHi]
              let bestSplitFrame = coarseFrame;
              let bestCombinedScore = -1e9;
              const startRightK = Math.ceil((searchLo - right.phaseFrames) / right.periodFrames);
              for (let rk = startRightK; ; rk++) {
                const candFrame = right.phaseFrames + rk * right.periodFrames;
                if (candFrame > searchHi) break;

                // Ensure last beat of `left` before `candFrame` isn't colliding (< 55% of beat period)
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
                // Bonus when `candFrame` lands on a strong bar downbeat / kick attack
                const cIdx = clamp(0, numFrames - 1, Math.round(candFrame));
                const downbeatBonus = 0.35 * (lowFlux[cIdx] + highFlux[cIdx]);
                const total = scoreL + scoreR + downbeatBonus;
                if (total > bestCombinedScore) {
                  bestCombinedScore = total;
                  bestSplitFrame = candFrame;
                }
              }

              left.endFrame = Math.round(bestSplitFrame);
              right.startFrame = Math.round(bestSplitFrame);
              right.downbeatFramePos = bestSplitFrame;
              right.firstBeatFrame = bestSplitFrame;
              right.firstDownbeatSec = Number((earliestStartSec + bestSplitFrame / ENV_RATE).toFixed(4));
            }
          }

          // Verify multi-segment map genuinely beats the single best constant BPM across the whole track (>= 16% per-beat contrast gain)
          const bestConst = uniqueRefined[0];
          const constTotalScore = bestConst
            ? evalRangePulseComb(bestConst.bpm, firstOnsetFrame, numFrames).perBeatContrast * (numFrames - firstOnsetFrame)
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
              firstDownbeatSec: seg.firstDownbeatSec,
              combConfidence: seg.combConfidence,
            }));

            // Ensure every multi-tempo BPM is also represented in topTempoCandidates for telemetry
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

  const lockPhaseForBpmAndMeter = (targetBpm, beatsPerBar = 4) => {
    const locked = lockSegmentGrid(targetBpm, firstOnsetFrame, numFrames, beatsPerBar, true);
    return {
      bpm: locked.bpm,
      beatsPerBar,
      firstDownbeatSec: locked.firstDownbeatSec,
      firstMusicalOnsetSec,
      barPhaseScores: locked.barPhaseScores,
      combConfidence: locked.combConfidence,
    };
  };

  /**
   * Re-lock an array of multi-tempo segments (e.g. after Gemini confirms/adjusts half/double-time or meter).
   */
  const lockSegmentsForPlan = (segmentSpecs, defaultBeatsPerBar = 4) => {
    const out = [];
    for (let i = 0; i < segmentSpecs.length; i++) {
      const spec = segmentSpecs[i];
      const f0 = i === 0
        ? firstOnsetFrame
        : clamp(0, numFrames - 2, Math.round((spec.startSec - earliestStartSec) * ENV_RATE));
      const f1 = i === segmentSpecs.length - 1
        ? numFrames
        : clamp(f0 + 20, numFrames, Math.round((spec.endSec - earliestStartSec) * ENV_RATE));
      const bpb = clamp(2, 12, Math.round(Number(spec.beatsPerBar) || defaultBeatsPerBar));
      const locked = lockSegmentGrid(Number(spec.bpm) || 120, f0, f1, bpb, i === 0);
      out.push({
        index: i,
        startFrame: f0,
        endFrame: f1,
        startSec: Number((earliestStartSec + f0 / ENV_RATE).toFixed(4)),
        endSec: Number((earliestStartSec + f1 / ENV_RATE).toFixed(4)),
        bpm: locked.bpm,
        beatsPerBar: bpb,
        phaseFrames: locked.phaseFrames,
        periodFrames: locked.periodFrames,
        firstDownbeatSec: i === 0 ? locked.firstDownbeatSec : Number((earliestStartSec + f0 / ENV_RATE).toFixed(4)),
        combConfidence: locked.combConfidence,
      });
    }

    // Refine exact beat handoff boundaries across adjacent segments
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
          const cIdx = clamp(0, numFrames - 1, Math.round(candFrame));
          const tot = sL + sR + 0.35 * (lowFlux[cIdx] + highFlux[cIdx]);
          if (tot > bestScore) {
            bestScore = tot;
            bestSplitFrame = candFrame;
          }
        }
        left.endSec = Number((earliestStartSec + bestSplitFrame / ENV_RATE).toFixed(4));
        right.startSec = left.endSec;
        right.firstDownbeatSec = left.endSec;
      }
    }
    return out;
  };

  const primarySeed = detectedSegments ? detectedSegments[0].bpm : (uniqueRefined[0]?.bpm || hintBpm || 120);
  const defaultLock = lockPhaseForBpmAndMeter(primarySeed, 4);

  return {
    ...defaultLock,
    isMultiTempo: Array.isArray(detectedSegments) && detectedSegments.length >= 2,
    segments: detectedSegments,
    topTempoCandidates: uniqueRefined.slice(0, 6).map(c => ({
      bpm: Number(c.bpm.toFixed(2)),
      score: Number((c.weightedScore || 0).toFixed(4)),
    })),
    strongHitTimesSec,
    lockPhaseForBpmAndMeter,
    lockSegmentsForPlan,
  };
}

/**
 * Synthesize a crisp, studio-grade 16-bit PCM WAV click track supporting BOTH
 * constant-BPM tracks and multi-section tempo-mapped songs, preceded by a 1-measure
 * stick count-off at the opening tempo!
 */
function synthesizeAlignedClickWav({
  bpm = 120,
  beatsPerBar = 4,
  countInBars = 1,
  firstDownbeatSec = 2.0,
  songEndSec = 16.0,
  subdivision = 'quarter',
  segments = null,
  sampleRate = 48000,
} = {}) {
  const activeSegments = Array.isArray(segments) && segments.length > 0
    ? segments.map((s, idx) => ({
        bpm: clamp(40, 260, Number(s.bpm) || bpm || 120),
        beatsPerBar: clamp(2, 12, Math.round(Number(s.beatsPerBar) || beatsPerBar || 4)),
        firstDownbeatSec: Number.isFinite(Number(s.firstDownbeatSec))
          ? Number(s.firstDownbeatSec)
          : (idx === 0 ? firstDownbeatSec : Number(s.startSec) || firstDownbeatSec),
        endSec: idx === segments.length - 1
          ? Math.max(Number(s.endSec) || 0, songEndSec)
          : Number(s.endSec) || songEndSec,
      }))
    : [{
        bpm: clamp(40, 260, Number(bpm) || 120),
        beatsPerBar: clamp(2, 12, Math.round(Number(beatsPerBar) || 4)),
        firstDownbeatSec,
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

  const renderClickEvent = (absSec, { isCountIn = false, isDownbeat = false, isSectionChange = false, isSubdivision = false } = {}) => {
    const relSec = absSec - clipStartSec;
    if (relSec < -0.001 || relSec >= totalDurationSec - 0.035) return;
    const startSample = Math.max(0, Math.round(relSec * sampleRate));

    if (isSubdivision) {
      const subFrames = Math.min(totalFrames - startSample, Math.floor(0.024 * sampleRate));
      for (let i = 0; i < subFrames; i++) {
        const t = i / sampleRate;
        const attack = Math.min(1, i / Math.max(1, sampleRate * 0.0008));
        floatBuf[startSample + i] += attack * 0.22 * Math.sin(2 * Math.PI * 660 * t) * Math.exp(-130 * t);
      }
      return;
    }

    const clickDurSec = isCountIn || isSectionChange ? 0.056 : (isDownbeat ? 0.046 : 0.036);
    const clickFrames = Math.min(totalFrames - startSample, Math.floor(clickDurSec * sampleRate));
    const fPrimary = isCountIn
      ? (isDownbeat ? 1567.98 : 1174.66) // Count-Off: G6 accent, D6 stick count ("1 - 2 - 3 - 4!")
      : isSectionChange
        ? 1479.98                        // Tempo-Section Change Downbeat: F#6 crisp bell/stick cue
        : (isDownbeat ? 1318.51 : 880.00); // Song Click: E6 downbeat, A5 quarter beat
    const fBody = fPrimary * 0.5;
    const amp = isCountIn
      ? (isDownbeat ? 0.86 : 0.74)
      : isSectionChange
        ? 0.84
        : (isDownbeat ? 0.78 : 0.56);
    const decayRate = isCountIn || isSectionChange ? 68 : (isDownbeat ? 82 : 98);

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
      velocity: (isDownbeat || isSectionChange) ? 0.95 : 0.72,
    });
  };

  // 1. Render 1-measure (or `countInBars`) stick count-off right before Segment 0's first downbeat
  const countInBeats = countInBars * openSeg.beatsPerBar;
  for (let cb = 0; cb < countInBeats; cb++) {
    const absSec = openSeg.firstDownbeatSec - (countInBeats - cb) * openBeatSec;
    renderClickEvent(absSec, {
      isCountIn: true,
      isDownbeat: (cb % openSeg.beatsPerBar) === 0,
    });
  }

  // 2. Render phase-locked beats across every tempo section
  let lastClickAbsSec = -999;
  for (let si = 0; si < activeSegments.length; si++) {
    const seg = activeSegments[si];
    const beatSec = 60 / seg.bpm;
    const addEighthGhost = subdivision === 'eighth' && seg.bpm <= 88;
    const segEndLimit = si < activeSegments.length - 1
      ? activeSegments[si + 1].firstDownbeatSec - beatSec * 0.42
      : finalEndSec + beatSec * 0.25;

    for (let b = 0; ; b++) {
      const absSec = seg.firstDownbeatSec + b * beatSec;
      if (absSec > segEndLimit) break;
      if (absSec - lastClickAbsSec < beatSec * 0.40) continue;

      const isDownbeat = (b % seg.beatsPerBar) === 0;
      const isSectionChange = si > 0 && b === 0;
      renderClickEvent(absSec, { isDownbeat, isSectionChange });
      lastClickAbsSec = absSec;

      if (addEighthGhost && absSec + beatSec * 0.5 <= segEndLimit) {
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
 * End-to-end Gemini-preferred RobOS Agent + DSP Multi-Tempo Click Track Generator.
 * Inserts the new Click Track directly beneath `sourceTrackId` (`sourceIdx + 1`),
 * shifts session items forward if needed so the 1-measure count-off fits cleanly >= 00:00.100,
 * and locks every click to the exact detected beat phase across constant or changing tempos!
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
      message: referenceTrack
        ? `Extracting percussive beat map from "${sourceTrack.name}" (+ full-drum reference "${referenceTrack.name}")...`
        : `Extracting full-song percussive beat & tempo map from "${sourceTrack.name}"...`,
    });
  }

  const combinedTitle = [sourceTrack.name, ...(sourceTrack.clips || []).map(c => c.name)].join(' ');
  const bpmNameMatch = combinedTitle.match(/\b(\d{2,3}(?:\.\d+)?)\s*bpm\b/i);
  const nameHintBpm = bpmNameMatch ? Number(bpmNameMatch[1]) : null;

  const assembled = assembleTrackTimelineMono(sourceTrack, { referenceTrack });
  const dspGrid = analyzeAudioBeatGrid(assembled.mono16k, {
    earliestStartSec: assembled.earliestStartSec,
    hintBpm: nameHintBpm,
  });

  let chosenBpm = dspGrid.bpm;
  let chosenBeatsPerBar = dspGrid.beatsPerBar || 4;
  let chosenNoteValue = 4;
  let chosenSubdivision = 'quarter';
  let chosenSegmentsPlan = dspGrid.isMultiTempo ? dspGrid.segments.map(s => ({ ...s })) : null;
  let agentProviderUsed = 'dsp-comb-correlator';
  let agentReasoning = chosenSegmentsPlan
    ? `Detected ${chosenSegmentsPlan.length} tempo sections (${chosenSegmentsPlan.map(s => `${s.bpm} BPM`).join(' -> ')}) with 1-bar count-off.`
    : `Locked ${dspGrid.bpm} BPM (${chosenBeatsPerBar}/4) with 1-measure count-off aligned to downbeat at ${dspGrid.firstDownbeatSec.toFixed(3)}s.`;

  let aiAgent = aiAgentModule;
  if (!aiAgent && process.env.ROBOS_TEST !== '1') {
    try { aiAgent = require('../../robos-lib/ai-agent'); } catch {}
  }

  if (aiAgent && typeof aiAgent.ask === 'function') {
    const workId = `click-${crypto.randomBytes(3).toString('hex')}`;
    const analysisDir = path.join(getClickAnalysisRoot(), workId);
    fs.mkdirSync(analysisDir, { recursive: true });

    try {
      const excerptOffsetSec = Math.max(0, (dspGrid.firstMusicalOnsetSec - assembled.earliestStartSec) - 0.5);
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
        isMultiTempo: dspGrid.isMultiTempo,
        detectedTempoSegments: dspGrid.segments || null,
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
        `Generate a precision click-track tempo & meter plan for "${sourceTrack.name}" (${assembled.clipNames.join(', ')}).`,
        'In the current directory you have `beat-analysis.json` (full-song percussive onset analysis, `isMultiTempo`, `detectedTempoSegments` if the arrangement changes tempo across sections, and `topTempoCandidates`) and `track-excerpt.wav`.',
        'Read `beat-analysis.json` (do NOT run shell commands) and determine:',
        '  1. If `isMultiTempo` is true and `detectedTempoSegments` shows genuine section tempo changes (such as a metal cover or prog arrangement switching e.g. 129 -> 145 -> 129 -> 100 -> 145 BPM), preserve `segments` (adjusting any segment by 0.5x or 2x only if needed for comfortable 75-175 BPM drummer feel, while keeping exact `startSec` / `endSec`).',
        '  2. Otherwise, choose the single best musical `bpm` (72-175 BPM comfortable drummer feel).',
        '  3. Time signature (`beatsPerBar` e.g. 4, 3, 6 and `noteValue` e.g. 4 or 8) and `subdivision` (`"quarter"` or `"eighth"`).',
        'Reply ONLY with raw JSON (no markdown fences):',
        '{"bpm":129.0,"beatsPerBar":4,"noteValue":4,"subdivision":"quarter","segments":null,"reasoning":"1 short sentence"}',
        '(If multi-tempo, set `"segments":[{"startSec":5.87,"endSec":28.8,"bpm":129,"beatsPerBar":4},...]`).',
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
            message: `Verifying tempo map & 1-measure count-off with ${provDef?.name || providerId}...`,
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
              .map(s => ({
                startSec: Number(s.startSec) || 0,
                endSec: Number(s.endSec) || assembled.latestEndSec,
                bpm: Number(s.bpm),
                beatsPerBar: clamp(2, 12, Math.round(Number(s.beatsPerBar) || Number(parsed.beatsPerBar) || 4)),
              }));
            if (validSegs.length >= 2) {
              chosenSegmentsPlan = validSegs;
              chosenBpm = validSegs[0].bpm;
              chosenBeatsPerBar = validSegs[0].beatsPerBar;
              chosenNoteValue = [2, 4, 8, 16].includes(Number(parsed.noteValue)) ? Number(parsed.noteValue) : 4;
              chosenSubdivision = parsed.subdivision === 'eighth' ? 'eighth' : 'quarter';
              agentProviderUsed = provDef?.name || res.provider || providerId;
              if (parsed.reasoning) agentReasoning = String(parsed.reasoning);
              break;
            }
          } else if (Number.isFinite(pBpm) && pBpm >= 45 && pBpm <= 240) {
            // If DSP found strong multi-tempo sections and the agent only returned a single scalar without explicitly rejecting segments,
            // keep DSP's multi-tempo segments unless the agent's scalar matches all segments
            if (!dspGrid.isMultiTempo) {
              chosenSegmentsPlan = null;
              chosenBpm = pBpm;
            }
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

  let lockedSegments = null;
  let lockedBpm = chosenBpm;
  let firstDownbeatSec = dspGrid.firstDownbeatSec;
  let songEndSec = assembled.latestEndSec;

  if (Array.isArray(chosenSegmentsPlan) && chosenSegmentsPlan.length >= 2) {
    lockedSegments = dspGrid.lockSegmentsForPlan(chosenSegmentsPlan, chosenBeatsPerBar);
    lockedBpm = lockedSegments[0].bpm;
    firstDownbeatSec = lockedSegments[0].firstDownbeatSec;
  } else {
    const finalLock = dspGrid.lockPhaseForBpmAndMeter(chosenBpm, chosenBeatsPerBar);
    lockedBpm = finalLock.bpm;
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
      }
    }
  }

  const sampleRate = Number(project.sampleRate) || 48000;
  const clickSynth = synthesizeAlignedClickWav({
    bpm: lockedBpm,
    beatsPerBar: chosenBeatsPerBar,
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

  const clickTrack = buildTrackFromWizard({
    profileId: 'acoustic-inst',
    name: `Click (${trackLabelBpm} · ${chosenBeatsPerBar}/${chosenNoteValue})`,
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
      ? `1-Bar Count + Tempo Map (${uniqueBpmSummary} BPM)`
      : `1-Bar Count + Click (${fmtBpm(lockedBpm)} BPM ${chosenBeatsPerBar}/${chosenNoteValue})`,
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
      ? lockedSegments.map(s => ({ startSec: s.startSec, endSec: s.endSec, bpm: s.bpm, beatsPerBar: s.beatsPerBar }))
      : null,
  };
  clickTrack.clips.push(clickClip);

  // Add helpful visual section markers on the ruler when multi-tempo sections are detected!
  if (lockedSegments && lockedSegments.length >= 2) {
    if (!Array.isArray(project.markers)) project.markers = [];
    // Remove previous auto-generated Tempo markers to avoid clutter when regenerating
    project.markers = project.markers.filter(m => !String(m.name || '').startsWith('Tempo '));
    let nextNum = project.markers.reduce((mx, m) => Math.max(mx, Number(m.num) || 0), 0) + 1;
    for (const seg of lockedSegments) {
      project.markers.push({
        id: `mk-${crypto.randomBytes(3).toString('hex')}`,
        num: nextNum++,
        timeSec: seg.firstDownbeatSec,
        name: `Tempo ${fmtBpm(seg.bpm)} BPM`,
        color: '#00d4ff',
      });
    }
  }

  tracks.splice(sourceIdx + 1, 0, clickTrack);
  project.bpm = Number(lockedBpm.toFixed(2));
  project.timeSignature = `${chosenBeatsPerBar}/${chosenNoteValue}`;

  return {
    ok: true,
    project,
    clickTrack,
    clickClip,
    bpm: project.bpm,
    tempoSegments: clickClip.tempoSegments,
    timeSignature: project.timeSignature,
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
