'use strict';

/**
 * RobOS DAW Studio — Pro Sectional Step / Pre-Roll Punch-In & Auto-Crossfade Engine
 * (`packages/daw-studio/lib/step-recording.js`)
 *
 * Implements the studio "Pre-Roll Spot & Punch" (Step Recording) workflow used in
 * Pro Tools, REAPER, and Logic Pro:
 *   1. Record Section 1 (drums + video), stop playing at the end of the section while
 *      letting cymbals/chords ring out naturally, and stop recording.
 *   2. Click the cursor back a few bars earlier (while Section 1 & backing music are still
 *      playing) and press Record:
 *      - Section 1's recorded drums play in your headphones during the pre-roll so you lock
 *        into your own pocket and tempo.
 *      - You start playing right where you left off in Section 1.
 *   3. On Record Stop (`reconcileStepRecordingPass`):
 *      - Detects `firstMusicalEntrySec` across all armed mics simultaneously (preserving 100%
 *        multi-mic phase coherence across Kick, Snare, Toms, Overheads & Room mics).
 *      - Non-destructively trims Section 2's silent listening pre-roll (`offsetSec` + `startSec`)
 *        on both Audio AND Video tracks so Section 2 enters right as you start playing (never
 *        showing you sitting idle on camera while Section 1's drums are playing!).
 *      - Inspects Section 1's overlapping tail:
 *          * If Section 1 is a **Natural Cymbal / Room Ring-Out** (decaying energy with no fresh
 *            drum strikes), preserves Section 1's full cymbal ring-out tail with a smooth cosine
 *            decay layered organically over Section 2's attack!
 *          * If Section 1 still had **Active Drum/Instrument Hits** after your punch point,
 *            trims Section 1 to the splice point and applies a constant-power (`cos/sin`)
 *            Equal-Power Crossfade (`0.0 dB` energy dip, zero double-hit flams).
 */

const fs = require('fs');
const path = require('path');
const { decodeWavMono } = require('./drum-instruments');

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

function resolveClipVideoPath(clip) {
  if (!clip || clip.muted) return '';
  const cand = clip.videoFile || (clip.mediaKind === 'video' ? clip.sourceFile : '') || '';
  return (cand && fs.existsSync(cand)) ? path.resolve(cand) : '';
}

/**
 * Build a 64-sample Equal-Power Sine/Cosine curve (`Float32Array`) for `AudioParam.setValueCurveAtTime`.
 */
function buildEqualPowerFadeCurve(direction = 'in', peakGain = 1.0, points = 64) {
  const n = Math.max(8, points | 0);
  const out = new Float32Array(n);
  const g = Math.max(0.0001, Number(peakGain) || 1.0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const w = direction === 'out'
      ? Math.cos(0.5 * Math.PI * u)
      : Math.sin(0.5 * Math.PI * u);
    out[i] = Math.max(0.0001, g * w);
  }
  return out;
}

/**
 * Detect the exact offset (`entryOffsetSec` from Sample #0 of `wavBuffer`) when the musician
 * actually began playing after listening to pre-roll in their headphones.
 *
 * Only reports `detectedPreRoll: true` when there is at least `minPreRollSec` (default `0.22s`)
 * of relatively quiet room/listening floor followed by a clear musical transient (`>= 13.5 dB`
 * jump above the pre-roll listening floor).
 */
function detectFirstMusicalEntryInWav(wavBuffer, {
  minPreRollSec = 0.22,
  windowSec = 0.004,
} = {}) {
  if (!wavBuffer || wavBuffer.length <= 44) {
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
  }
  const { samples, sampleRate, durationSec } = decodeWavMono(wavBuffer);
  if (!samples.length || durationSec < minPreRollSec + 0.15) {
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
  }

  const winSamples = Math.max(24, Math.floor(sampleRate * windowSec));
  const numWins = Math.floor(samples.length / winSamples);
  if (numWins < 20) {
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
  }

  const winPeaks = new Float32Array(numWins);
  let globalMax = 0;
  for (let w = 0; w < numWins; w++) {
    const s0 = w * winSamples;
    const s1 = Math.min(samples.length, s0 + winSamples);
    let pk = 0;
    for (let i = s0; i < s1; i++) {
      const a = Math.abs(samples[i]);
      if (a > pk) pk = a;
    }
    winPeaks[w] = pk;
    if (pk > globalMax) globalMax = pk;
  }

  if (globalMax <= 0.0015) {
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
  }

  const minPreRollWins = Math.max(4, Math.floor(minPreRollSec / windowSec));
  if (numWins <= minPreRollWins + 8) {
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
  }

  // Measure peak & 85th-percentile amplitude during the initial `minPreRollSec` window
  const initSlice = Array.from(winPeaks.subarray(0, minPreRollWins)).sort((a, b) => a - b);
  const initMax = initSlice[initSlice.length - 1] || 0;
  const initP85 = initSlice[Math.floor(initSlice.length * 0.85)] || 0;

  // If the musician was ALREADY playing loudly inside the first `minPreRollSec` (within 9 dB of global max),
  // there is no silent pre-roll to trim — keep Sample #0!
  if (initMax >= Math.max(0.025, globalMax * 0.35)) {
    const pDb = Number((20 * Math.log10(Math.min(1, initMax))).toFixed(1));
    return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: pDb, entryPeakDb: pDb };
  }

  // Entry threshold: must clearly exceed initial listening room noise/headphone bleed (`>= 4.8x` p85 = +13.6 dB)
  // AND reach at least 18% of the take's peak musical dynamics (or -36 dBFS).
  const entryThresh = Math.max(
    initP85 * 4.8,
    initMax * 2.4,
    Math.min(0.016, globalMax * 0.22),
    0.003
  );

  for (let w = minPreRollWins; w < numWins; w++) {
    if (winPeaks[w] >= entryThresh) {
      // Walk back up to 2 windows (8ms) to catch the very start of the stick/pick transient
      let onsetW = w;
      while (onsetW > 1 && winPeaks[onsetW - 1] >= entryThresh * 0.35 && winPeaks[onsetW - 1] <= winPeaks[onsetW]) {
        onsetW--;
      }
      const entrySec = Number(((onsetW * winSamples) / sampleRate).toFixed(4));
      const floorDb = initP85 <= 0.000015 ? -96 : Number((20 * Math.log10(initP85)).toFixed(1));
      const hitDb = Number((20 * Math.log10(Math.min(1, winPeaks[w]))).toFixed(1));
      return {
        detectedPreRoll: entrySec >= minPreRollSec,
        entryOffsetSec: entrySec,
        preRollFloorDb: floorDb,
        entryPeakDb: hitDb,
      };
    }
  }

  return { detectedPreRoll: false, entryOffsetSec: 0, preRollFloorDb: -96, entryPeakDb: -96 };
}

/**
 * Determine whether an existing clip's audio *after* `spliceTimelineSec` is a natural
 * decaying cymbal/chord/room ring-out (no new percussive drum hits!) vs active playing.
 */
function classifyClipTailAsRingOut(prevClip, spliceTimelineSec) {
  const cStart = Number(prevClip?.startSec) || 0;
  const cOff = Math.max(0, Number(prevClip?.offsetSec) || 0);
  const cDur = Math.max(0.04, Number(prevClip?.durationSec) || 0);
  const cEnd = cStart + cDur;
  const tailDurSec = cEnd - spliceTimelineSec;

  if (tailDurSec <= 0.03) {
    return { isRingOut: false, tailDurationSec: Math.max(0, tailDurSec) };
  }

  // Fast check via detected drum transients if available on the clip
  if (Array.isArray(prevClip?.transients) && prevClip.transients.length > 0) {
    const freshHitsInTail = prevClip.transients.filter((h) => {
      const absSec = cStart + (Number(h.timeSec) || 0);
      return absSec > spliceTimelineSec + 0.085 && (Number(h.velocity) || 0) >= 0.35;
    });
    if (freshHitsInTail.length >= 1) {
      return { isRingOut: false, tailDurationSec: tailDurSec };
    }
  }

  // Inspect actual WAV envelope in `25 ms` frames across `[spliceTimelineSec + 0.07s .. cEnd]`
  if (prevClip?.wavFile && fs.existsSync(prevClip.wavFile)) {
    try {
      const buf = fs.readFileSync(prevClip.wavFile);
      const { samples, sampleRate } = decodeWavMono(buf);
      if (samples.length > 256) {
        const relStartSec = cOff + Math.max(0, (spliceTimelineSec + 0.07) - cStart);
        const relEndSec = cOff + cDur;
        const sStart = Math.floor(relStartSec * sampleRate);
        const sEnd = Math.min(samples.length, Math.floor(relEndSec * sampleRate));
        const frameLen = Math.max(64, Math.floor(sampleRate * 0.025)); // 25 ms RMS frames

        if (sEnd - sStart >= frameLen * 2) {
          let prevRms = 0;
          // Seed `prevRms` right before `spliceTimelineSec + 0.07`
          const seed0 = Math.max(0, sStart - frameLen * 2);
          if (sStart > seed0) {
            let sq = 0;
            for (let i = seed0; i < sStart; i++) sq += samples[i] * samples[i];
            prevRms = Math.sqrt(sq / (sStart - seed0));
          }

          let sharpAttackCount = 0;
          for (let pos = sStart; pos + frameLen <= sEnd; pos += frameLen) {
            let sq = 0;
            let pk = 0;
            for (let i = pos; i < pos + frameLen; i++) {
              const a = Math.abs(samples[i]);
              sq += a * a;
              if (a > pk) pk = a;
            }
            const rms = Math.sqrt(sq / frameLen);
            // A fresh drum strike jumps sharply (`>= 2.45x` previous RMS and peak `>= -31 dBFS = 0.028`),
            // whereas a ringing cymbal or guitar chord decays smoothly!
            if (pk >= 0.028 && rms > Math.max(0.008, prevRms * 2.45)) {
              sharpAttackCount++;
              if (sharpAttackCount >= 1) {
                return { isRingOut: false, tailDurationSec: tailDurSec };
              }
            }
            // Track upper decay envelope with slow release
            prevRms = Math.max(rms, prevRms * 0.86);
          }
          return { isRingOut: true, tailDurationSec: tailDurSec };
        }
      }
    } catch {}
  }

  // Fallback using `clip.peaks` if WAV wasn't read
  return { isRingOut: tailDurSec <= 4.0, tailDurationSec: tailDurSec };
}

/**
 * Ensure `sourcePeaks` and `sourceTransients` are cached on `clip`, then non-destructively
 * update `peaks` and `transients` to match `[clip.offsetSec, clip.offsetSec + clip.durationSec]`.
 */
function syncClipWindowMetadata(clip) {
  if (!clip) return clip;
  const off = Math.max(0, Number(clip.offsetSec) || 0);
  const dur = Math.max(0.04, Number(clip.durationSec) || 0.04);
  const srcDur = Math.max(off + dur, Number(clip.sourceDurationSec) || (off + dur));
  clip.sourceDurationSec = Number(srcDur.toFixed(4));
  clip.offsetSec = Number(off.toFixed(4));
  clip.durationSec = Number(dur.toFixed(4));

  if (!Array.isArray(clip.sourcePeaks) && Array.isArray(clip.peaks) && clip.peaks.length) {
    clip.sourcePeaks = [...clip.peaks];
  }
  if (!Array.isArray(clip.sourceTransients) && Array.isArray(clip.transients)) {
    clip.sourceTransients = clip.transients.map(h => ({
      ...h,
      sourceTimeSec: Number(h.sourceTimeSec !== undefined ? h.sourceTimeSec : (Number(h.timeSec) || 0)),
    }));
  }

  if (Array.isArray(clip.sourcePeaks) && clip.sourcePeaks.length) {
    const totalBins = clip.sourcePeaks.length;
    const i0 = Math.max(0, Math.floor((off / srcDur) * totalBins));
    const i1 = Math.min(totalBins, Math.max(i0 + 1, Math.ceil(((off + dur) / srcDur) * totalBins)));
    clip.peaks = clip.sourcePeaks.slice(i0, i1);
  }

  if (Array.isArray(clip.sourceTransients)) {
    clip.transients = clip.sourceTransients
      .filter(h => h.sourceTimeSec >= off - 0.002 && h.sourceTimeSec <= off + dur + 0.002)
      .map(h => ({
        timeSec: Number(Math.max(0, h.sourceTimeSec - off).toFixed(4)),
        peakDb: h.peakDb,
        velocity: h.velocity,
      }));
  }

  clip.fadeInSec = Number(clamp(0, dur * 0.49, Number(clip.fadeInSec) || 0).toFixed(4));
  clip.fadeOutSec = Number(clamp(0, dur * 0.49, Number(clip.fadeOutSec) || 0).toFixed(4));
  return clip;
}

/**
 * Automatically reconcile & crossfade a newly recorded pass (`recordedClips` + `recordedVideoClips`)
 * against any overlapping earlier takes on the armed tracks!
 */
function reconcileStepRecordingPass(project, {
  punchStartSec = 0,
  recordedClips = [],
  recordedVideoClips = [],
  preAttackPadSec = 0.035,
  activeCrossfadeSec = 0.075,
  videoPreLeadSec = 0.12,
  videoCrossfadeSec = 0.18,
} = {}) {
  const tracks = project?.tracks || [];
  if (!tracks.length || (!recordedClips.length && !recordedVideoClips.length)) {
    return { blended: false };
  }

  const newClipIds = new Set([
    ...recordedClips.map(r => r.clip?.id),
    ...recordedVideoClips.map(r => r.clip?.id),
  ].filter(Boolean));

  // Check whether ANY armed audio or video track in this pass actually overlaps an existing unmuted clip!
  let hasAnyPriorOverlap = false;
  for (const item of [...recordedClips, ...recordedVideoClips]) {
    const tr = tracks.find(t => t.id === item.trackId);
    const nc = item.clip;
    if (!tr || !nc) continue;
    const nStart = Number(nc.startSec) || 0;
    const nEnd = nStart + (Number(nc.durationSec) || 0);
    const overlapsExisting = (tr.clips || []).some((old) => {
      if (!old || old.muted || newClipIds.has(old.id)) return false;
      const oStart = Number(old.startSec) || 0;
      const oEnd = oStart + (Number(old.durationSec) || 0);
      return oEnd > nStart + 0.02 && oStart < nEnd - 0.02;
    });
    if (overlapsExisting) {
      hasAnyPriorOverlap = true;
      break;
    }
  }

  if (!hasAnyPriorOverlap) {
    return { blended: false };
  }

  // Step 1: Detect the earliest musical entry across all newly recorded audio channels!
  // All armed mics are trimmed by the EXACT SAME `trimAudioSec` so multi-mic phase coherence is 100% preserved.
  let earliestEntryOffsetSec = null;
  let anyChannelHadPreRoll = false;
  let anyChannelImmediate = false;

  for (const item of recordedClips) {
    const nc = item.clip;
    if (!nc?.wavFile || !fs.existsSync(nc.wavFile)) continue;
    try {
      const buf = fs.readFileSync(nc.wavFile);
      const det = detectFirstMusicalEntryInWav(buf);
      if (det.detectedPreRoll && det.entryOffsetSec > 0) {
        anyChannelHadPreRoll = true;
        if (earliestEntryOffsetSec === null || det.entryOffsetSec < earliestEntryOffsetSec) {
          earliestEntryOffsetSec = det.entryOffsetSec;
        }
      } else if (det.entryPeakDb > -38) {
        // Channel started playing loudly right at `punchStartSec` (0s pre-roll)
        anyChannelImmediate = true;
      }
    } catch {}
  }

  const effectiveEntryOffsetSec = (!anyChannelImmediate && anyChannelHadPreRoll && earliestEntryOffsetSec !== null)
    ? earliestEntryOffsetSec
    : 0;

  const trimmedAudioLeadSec = Math.max(0, effectiveEntryOffsetSec - preAttackPadSec);
  const trimmedVideoLeadSec = Math.max(0, effectiveEntryOffsetSec - videoPreLeadSec);

  let splicedAudioTracks = 0;
  let splicedVideoTracks = 0;
  let preservedRingOutCount = 0;
  let activeXfadeCount = 0;
  let representativeSpliceSec = Number((punchStartSec + trimmedAudioLeadSec).toFixed(4));

  // Step 2: Reconcile Audio Clips (Trim Pre-Roll + Ring-Out Layering OR Equal-Power Crossfade)
  for (const item of recordedClips) {
    const tr = tracks.find(t => t.id === item.trackId);
    const newClip = item.clip;
    if (!tr || !newClip) continue;

    // Seed immutable source metadata before trimming
    syncClipWindowMetadata(newClip);

    const origNewStart = Number(newClip.startSec) || 0;
    const origNewDur = Number(newClip.durationSec) || 0;
    const safeTrim = Math.min(Math.max(0, origNewDur - 0.12), trimmedAudioLeadSec);

    if (safeTrim > 0.015) {
      newClip.startSec = Number((origNewStart + safeTrim).toFixed(4));
      newClip.offsetSec = Number(((Number(newClip.offsetSec) || 0) + safeTrim).toFixed(4));
      newClip.durationSec = Number((origNewDur - safeTrim).toFixed(4));
      syncClipWindowMetadata(newClip);
    }

    const nStart = Number(newClip.startSec) || 0;
    const nEnd = nStart + (Number(newClip.durationSec) || 0);
    representativeSpliceSec = nStart;

    for (const prevClip of (tr.clips || [])) {
      if (!prevClip || prevClip.muted || newClipIds.has(prevClip.id)) continue;
      syncClipWindowMetadata(prevClip);
      const pStart = Number(prevClip.startSec) || 0;
      const pDur = Number(prevClip.durationSec) || 0;
      const pEnd = pStart + pDur;

      // Case 1: Earlier take overlaps the start of `newClip` (Standard Step-Recording Splice!)
      if (pStart < nStart - 0.01 && pEnd > nStart + 0.01) {
        const ringCheck = classifyClipTailAsRingOut(prevClip, nStart + preAttackPadSec);
        if (ringCheck.isRingOut) {
          // Natural Cymbal / Guitar Ring-Out: keep Section 1's decay tail ringing smoothly over Section 2!
          const maxRingTail = Math.min(ringCheck.tailDurationSec, 3.5);
          const targetPrevEnd = Math.min(pEnd, nStart + maxRingTail);
          prevClip.durationSec = Number(Math.max(0.05, targetPrevEnd - pStart).toFixed(4));
          prevClip.fadeOutSec = Number(Math.min(prevClip.durationSec * 0.49, Math.max(0.18, maxRingTail * 0.85)).toFixed(4));
          prevClip.fadeShape = 'equal-power';
          prevClip.stepBlendMode = 'ringout-layer';
          syncClipWindowMetadata(prevClip);

          newClip.fadeInSec = Number(Math.min(newClip.durationSec * 0.35, 0.025).toFixed(4));
          newClip.fadeShape = 'equal-power';
          newClip.stepBlendMode = 'ringout-layer';
          syncClipWindowMetadata(newClip);
          preservedRingOutCount++;
        } else {
          // Active Playing Overlap: trim Section 1 to `nStart + xfade` and apply Equal-Power Crossfade!
          const xfade = Math.min(
            activeCrossfadeSec,
            Math.max(0.02, (nEnd - nStart) * 0.35),
            Math.max(0.02, (pEnd - nStart))
          );
          prevClip.durationSec = Number(Math.max(0.05, (nStart + xfade) - pStart).toFixed(4));
          prevClip.fadeOutSec = Number(xfade.toFixed(4));
          prevClip.fadeShape = 'equal-power';
          prevClip.stepBlendMode = 'equal-power-xfade';
          syncClipWindowMetadata(prevClip);

          newClip.fadeInSec = Number(xfade.toFixed(4));
          newClip.fadeShape = 'equal-power';
          newClip.stepBlendMode = 'equal-power-xfade';
          syncClipWindowMetadata(newClip);
          activeXfadeCount++;
        }
        splicedAudioTracks++;
      } else if (pStart >= nStart - 0.01 && pEnd > nEnd + 0.04 && pStart < nEnd - 0.01) {
        // Case 2: Punch-out into a later existing section (`newClip` ends inside a later `prevClip`)
        const xfade = Math.min(activeCrossfadeSec, Math.max(0.02, (nEnd - pStart)));
        const trimLater = Math.max(0, (nEnd - xfade) - pStart);
        if (trimLater > 0.01 && trimLater < pDur - 0.08) {
          prevClip.startSec = Number((pStart + trimLater).toFixed(4));
          prevClip.offsetSec = Number(((Number(prevClip.offsetSec) || 0) + trimLater).toFixed(4));
          prevClip.durationSec = Number((pDur - trimLater).toFixed(4));
        }
        prevClip.fadeInSec = Number(xfade.toFixed(4));
        prevClip.fadeShape = 'equal-power';
        newClip.fadeOutSec = Number(xfade.toFixed(4));
        newClip.fadeShape = 'equal-power';
        syncClipWindowMetadata(prevClip);
        syncClipWindowMetadata(newClip);
        splicedAudioTracks++;
      }
    }
  }

  // Step 3: Reconcile Camera / Video Clips (Trim Idle Pre-Roll + Mark Visual Cross-Dissolve!)
  let representativeVideoSpliceSec = null;
  for (const vItem of recordedVideoClips) {
    const tr = tracks.find(t => t.id === vItem.trackId);
    const newVid = vItem.clip;
    if (!tr || !newVid) continue;

    const origVStart = Number(newVid.startSec) || 0;
    const origVDur = Number(newVid.durationSec) || 0;
    const safeVidTrim = Math.min(Math.max(0, origVDur - 0.25), trimmedVideoLeadSec);

    if (safeVidTrim > 0.02) {
      newVid.startSec = Number((origVStart + safeVidTrim).toFixed(4));
      newVid.offsetSec = Number(((Number(newVid.offsetSec) || 0) + safeVidTrim).toFixed(4));
      newVid.durationSec = Number((origVDur - safeVidTrim).toFixed(4));
    }

    const vStart = Number(newVid.startSec) || 0;
    const vEnd = vStart + (Number(newVid.durationSec) || 0);
    representativeVideoSpliceSec = vStart;

    for (const prevVid of (tr.clips || [])) {
      if (!prevVid || prevVid.muted || newClipIds.has(prevVid.id)) continue;
      if (!resolveClipVideoPath(prevVid)) continue;
      const pvStart = Number(prevVid.startSec) || 0;
      const pvDur = Number(prevVid.durationSec) || 0;
      const pvEnd = pvStart + pvDur;

      if (pvStart < vStart - 0.02 && pvEnd > vStart + 0.02) {
        // Keep `videoCrossfadeSec` overlap tail on `prevVid` so multi-part MP4 export can render a real
        // visual cross-dissolve (`xfade`), while live DAW Video Output & Kdenlive cut cleanly at `vStart`!
        const vXfade = Math.min(videoCrossfadeSec, Math.max(0, pvEnd - vStart), Math.max(0.04, (vEnd - vStart) * 0.25));
        prevVid.durationSec = Number(Math.max(0.08, (vStart + vXfade) - pvStart).toFixed(4));
        newVid.videoCrossfadeSec = Number(vXfade.toFixed(4));
        newVid.stepBlendMode = 'video-dissolve';
        splicedVideoTracks++;
      }
    }
  }

  return {
    blended: splicedAudioTracks > 0 || splicedVideoTracks > 0 || trimmedAudioLeadSec > 0.02,
    audioSpliceSec: representativeSpliceSec,
    videoSpliceSec: representativeVideoSpliceSec,
    trimmedPreRollSec: Number(trimmedAudioLeadSec.toFixed(3)),
    splicedAudioTracks,
    splicedVideoTracks,
    preservedRingOutCount,
    activeXfadeCount,
    blendMode: preservedRingOutCount > 0 && activeXfadeCount === 0
      ? 'cymbal-ringout-preserved'
      : (activeXfadeCount > 0 ? 'equal-power-crossfade' : 'preroll-trimmed'),
  };
}

/**
 * Build ordered, timeline-clipped video segments across ALL unmuted clips on a video track
 * within `[renderStartSec, renderEndSec]` so `Export MP4` stitches step-recorded multi-section
 * performances into a single continuous video with smooth visual cross-dissolves!
 */
function buildTrackVideoExportSegments(videoTrack, {
  renderStartSec = 0,
  renderEndSec = null,
  defaultCrossfadeSec = 0.18,
} = {}) {
  const rawClips = (videoTrack?.clips || []).filter(c => !c.muted && Boolean(resolveClipVideoPath(c)));
  if (!rawClips.length) return [];

  const rStart = Math.max(0, Number(renderStartSec) || 0);
  const maxClipEnd = rawClips.reduce((mx, c) => Math.max(mx, (Number(c.startSec) || 0) + (Number(c.durationSec) || 0)), 0);
  const rEnd = renderEndSec !== null && renderEndSec !== undefined
    ? Math.max(rStart + 0.05, Number(renderEndSec))
    : Math.max(rStart + 0.05, maxClipEnd);

  // Comping priority: later takes override earlier takes starting at the later take's `startSec`,
  // while preserving up to `crossfadeSec` of overlap tail on the outgoing take for smooth `xfade`!
  const ordered = [];
  for (let i = 0; i < rawClips.length; i++) {
    const c = rawClips[i];
    const vf = resolveClipVideoPath(c);
    const cStart = Math.max(0, Number(c.startSec) || 0);
    const cOff = Math.max(0, Number(c.offsetSec) || 0);
    const cDur = Math.max(0.05, Number(c.durationSec) || 0);
    const cEnd = cStart + cDur;
    if (cEnd <= rStart + 0.01 || cStart >= rEnd - 0.01) continue;

    const segStart = Math.max(rStart, cStart);
    const segEnd = Math.min(rEnd, cEnd);
    const into = segStart - cStart;
    ordered.push({
      clipId: c.id || `vclip-${i}`,
      videoFile: vf,
      timelineStartSec: Number(segStart.toFixed(4)),
      timelineEndSec: Number(segEnd.toFixed(4)),
      sourceOffsetSec: Number((cOff + into).toFixed(4)),
      durationSec: Number((segEnd - segStart).toFixed(4)),
      crossfadeInSec: Number((Number(c.videoCrossfadeSec) || defaultCrossfadeSec).toFixed(4)),
      priority: i,
    });
  }

  // Sort chronologically by `timelineStartSec` (and priority on ties), resolving full overwrites cleanly
  ordered.sort((a, b) => (a.timelineStartSec - b.timelineStartSec) || (a.priority - b.priority));

  const cleaned = [];
  for (const seg of ordered) {
    while (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      if (seg.timelineStartSec <= prev.timelineStartSec + 0.02 && seg.priority > prev.priority) {
        // Newer take completely covers the start of `prev` -> drop `prev`
        cleaned.pop();
        continue;
      }
      if (prev.timelineEndSec > seg.timelineStartSec) {
        // Clamp `prev`'s overlap tail to at most `xfade` so FFmpeg `xfade` dissolves right across `[seg.timelineStartSec, seg.timelineStartSec + xfade]`!
        const maxXfade = Math.min(
          seg.crossfadeInSec || defaultCrossfadeSec,
          Math.max(0, (prev.timelineEndSec - prev.timelineStartSec) * 0.40),
          Math.max(0, seg.durationSec * 0.40)
        );
        const clampedPrevEnd = Math.min(prev.timelineEndSec, seg.timelineStartSec + maxXfade);
        prev.timelineEndSec = Number(clampedPrevEnd.toFixed(4));
        prev.durationSec = Number(Math.max(0.05, prev.timelineEndSec - prev.timelineStartSec).toFixed(4));
        seg.effectiveXfadeSec = Number(Math.max(0, prev.timelineEndSec - seg.timelineStartSec).toFixed(4));
      } else {
        seg.effectiveXfadeSec = 0;
      }
      break;
    }
    if (cleaned.length === 0) seg.effectiveXfadeSec = 0;
    cleaned.push(seg);
  }

  return cleaned;
}

module.exports = {
  buildEqualPowerFadeCurve,
  detectFirstMusicalEntryInWav,
  classifyClipTailAsRingOut,
  syncClipWindowMetadata,
  reconcileStepRecordingPass,
  buildTrackVideoExportSegments,
};
