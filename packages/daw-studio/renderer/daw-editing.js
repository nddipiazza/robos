'use strict';

/**
 * RobOS DAW Studio — Non-Destructive Multi-Track & Multi-Take Editing Engine
 *
 * Pure state/DSP editing primitives shared between Renderer (`window.DawEditing`)
 * and Node.js test suite (`module.exports`).
 *
 * Supports:
 *   - Multi-selection with Click, Ctrl/Cmd+Click, and Shift+Click range selection
 *     (for both Studio Tracks and Timeline Takes/Clips, preserving multi-mic phase alignment)
 *   - Undo / Redo snapshot history stack (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
 *   - Pre-FX Track Input Gain (`track.gainDb`, -24..+24 dB) & Auto-Normalize
 *   - Per-Take Clip Gain (`clip.gainDb`), Fade-In/Out, Mute, Split (`S` / `Ctrl+B`),
 *     Left/Right Edge Trim (`offsetSec` / `durationSec`), Drag Move, Copy/Cut/Paste/Duplicate
 *   - Track Reorder, Duplicate (with or without takes), Color, Phase Invert, Batch Arm/Mute/Solo
 */

(function initDawEditing(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.DawEditing = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function createDawEditing() {
  const STUDIO_COLORS = [
    '#ef4444', // Kick Red
    '#f97316', // Snare Orange
    '#eab308', // Tom Gold
    '#22c55e', // Floor Green
    '#06b6d4', // Overhead Cyan
    '#3b82f6', // Room Blue
    '#a855f7', // Guitar Purple
    '#ec4899', // Vocal Magenta
  ];

  function clamp(min, max, val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function cloneDeep(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  }

  function dbToGain(db) {
    const d = Number(db) || 0;
    if (d <= -72) return 0;
    return Math.pow(10, d / 20);
  }

  function gainToDb(gain) {
    const g = Number(gain);
    if (!Number.isFinite(g) || g <= 0.00025) return -Infinity;
    return 20 * Math.log10(g);
  }

  function formatDb(db) {
    if (!Number.isFinite(db) || db <= -70) return '-∞ dB';
    const rounded = Number(db.toFixed(1));
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} dB`;
  }

  // ─── Undo / Redo History Stack ────────────────────────────────────────────

  class UndoHistoryStack {
    constructor(maxDepth = 50) {
      this.maxDepth = maxDepth;
      this.undoStack = [];
      this.redoStack = [];
    }

    clear() {
      this.undoStack = [];
      this.redoStack = [];
    }

    pushSnapshot(project, label = 'Edit') {
      if (!project) return;
      this.undoStack.push({
        label,
        snapshot: cloneDeep(project),
      });
      if (this.undoStack.length > this.maxDepth) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    canUndo() {
      return this.undoStack.length > 0;
    }

    canRedo() {
      return this.redoStack.length > 0;
    }

    undo(currentProject) {
      if (!this.undoStack.length) return null;
      const prev = this.undoStack.pop();
      if (currentProject) {
        this.redoStack.push({
          label: prev.label,
          snapshot: cloneDeep(currentProject),
        });
      }
      return { project: prev.snapshot, label: prev.label };
    }

    redo(currentProject) {
      if (!this.redoStack.length) return null;
      const next = this.redoStack.pop();
      if (currentProject) {
        this.undoStack.push({
          label: next.label,
          snapshot: cloneDeep(currentProject),
        });
      }
      return { project: next.snapshot, label: next.label };
    }
  }

  // ─── Selection Engines (Click, Ctrl+Click, Shift+Click, Ctrl+A) ───────────

  function applyTrackClickSelection(tracks, selectedTrackIds, anchorTrackId, clickedId, mods = {}) {
    const list = Array.isArray(tracks) ? tracks : [];
    const next = new Set(selectedTrackIds || []);
    const isToggle = Boolean(mods.ctrlKey || mods.metaKey);
    const isRange = Boolean(mods.shiftKey);

    if (isRange && anchorTrackId && list.some(t => t.id === anchorTrackId)) {
      const i1 = list.findIndex(t => t.id === anchorTrackId);
      const i2 = list.findIndex(t => t.id === clickedId);
      if (i1 !== -1 && i2 !== -1) {
        if (!isToggle) next.clear();
        const lo = Math.min(i1, i2);
        const hi = Math.max(i1, i2);
        for (let i = lo; i <= hi; i++) next.add(list[i].id);
        return { selectedTrackIds: next, anchorTrackId };
      }
    }

    if (isToggle) {
      if (next.has(clickedId)) next.delete(clickedId);
      else next.add(clickedId);
      return { selectedTrackIds: next, anchorTrackId: clickedId };
    }

    next.clear();
    next.add(clickedId);
    return { selectedTrackIds: next, anchorTrackId: clickedId };
  }

  function findClipWithTrack(project, clipId) {
    const tracks = project?.tracks || [];
    for (let ti = 0; ti < tracks.length; ti++) {
      const clips = tracks[ti].clips || [];
      for (let ci = 0; ci < clips.length; ci++) {
        if (clips[ci].id === clipId) {
          return { track: tracks[ti], trackIndex: ti, clip: clips[ci], clipIndex: ci };
        }
      }
    }
    return null;
  }

  function applyClipClickSelection(project, selectedClipIds, anchorClipId, clickedClipId, mods = {}) {
    const next = new Set(selectedClipIds || []);
    const isToggle = Boolean(mods.ctrlKey || mods.metaKey);
    const isRange = Boolean(mods.shiftKey);

    if (isRange && anchorClipId) {
      const a = findClipWithTrack(project, anchorClipId);
      const b = findClipWithTrack(project, clickedClipId);
      if (a && b) {
        if (!isToggle) next.clear();
        const minTrack = Math.min(a.trackIndex, b.trackIndex);
        const maxTrack = Math.max(a.trackIndex, b.trackIndex);
        const aStart = Number(a.clip.startSec) || 0;
        const aEnd = aStart + (Number(a.clip.durationSec) || 0);
        const bStart = Number(b.clip.startSec) || 0;
        const bEnd = bStart + (Number(b.clip.durationSec) || 0);
        const minSec = Math.min(aStart, bStart) - 0.01;
        const maxSec = Math.max(aEnd, bEnd) + 0.01;

        for (let ti = minTrack; ti <= maxTrack; ti++) {
          for (const c of (project.tracks[ti]?.clips || [])) {
            const cs = Number(c.startSec) || 0;
            const ce = cs + (Number(c.durationSec) || 0);
            if (ce >= minSec && cs <= maxSec) {
              next.add(c.id);
            }
          }
        }
        return { selectedClipIds: next, anchorClipId };
      }
    }

    if (isToggle) {
      if (next.has(clickedClipId)) next.delete(clickedClipId);
      else next.add(clickedClipId);
      return { selectedClipIds: next, anchorClipId: clickedClipId };
    }

    next.clear();
    next.add(clickedClipId);
    return { selectedClipIds: next, anchorClipId: clickedClipId };
  }

  function selectAllInProject(project) {
    const trackIds = new Set();
    const clipIds = new Set();
    for (const t of (project?.tracks || [])) {
      trackIds.add(t.id);
      for (const c of (t.clips || [])) {
        clipIds.add(c.id);
      }
    }
    return { selectedTrackIds: trackIds, selectedClipIds: clipIds };
  }

  // ─── Clip / Take Non-Destructive Editing ──────────────────────────────────

  function ensureClipSourceMetadata(clip) {
    if (clip.offsetSec === undefined) clip.offsetSec = 0;
    if (clip.gainDb === undefined) clip.gainDb = 0;
    if (clip.fadeInSec === undefined) clip.fadeInSec = 0;
    if (clip.fadeOutSec === undefined) clip.fadeOutSec = 0;
    if (clip.muted === undefined) clip.muted = false;
    const dur = Number(clip.durationSec) || 0;
    if (!clip.sourceDurationSec || clip.sourceDurationSec < clip.offsetSec + dur) {
      clip.sourceDurationSec = Number((clip.offsetSec + dur).toFixed(4));
    }
    if (!Array.isArray(clip.sourcePeaks) && Array.isArray(clip.peaks) && clip.peaks.length) {
      clip.sourcePeaks = [...clip.peaks];
    }
    if (!Array.isArray(clip.sourceTransients) && Array.isArray(clip.transients)) {
      const off = Number(clip.offsetSec) || 0;
      clip.sourceTransients = clip.transients.map(h => ({
        ...h,
        sourceTimeSec: Number(((Number(h.timeSec) || 0) + off).toFixed(4)),
      }));
    }
    return clip;
  }

  function recomputeVisibleClipWindow(clip) {
    ensureClipSourceMetadata(clip);
    const srcDur = Math.max(0.05, Number(clip.sourceDurationSec) || Number(clip.durationSec) || 1);
    const off = clamp(0, srcDur - 0.04, Number(clip.offsetSec) || 0);
    const dur = clamp(0.04, srcDur - off, Number(clip.durationSec) || (srcDur - off));
    clip.offsetSec = Number(off.toFixed(4));
    clip.durationSec = Number(dur.toFixed(4));

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

    clip.fadeInSec = clamp(0, dur * 0.5, Number(clip.fadeInSec) || 0);
    clip.fadeOutSec = clamp(0, dur * 0.5, Number(clip.fadeOutSec) || 0);
    return clip;
  }

  function splitClipAtTime(clip, splitTimeSec) {
    ensureClipSourceMetadata(clip);
    const start = Number(clip.startSec) || 0;
    const dur = Number(clip.durationSec) || 0;
    const end = start + dur;
    if (splitTimeSec <= start + 0.04 || splitTimeSec >= end - 0.04) {
      return null;
    }

    const leftDur = Number((splitTimeSec - start).toFixed(4));
    const rightDur = Number((end - splitTimeSec).toFixed(4));
    const origOffset = Number(clip.offsetSec) || 0;

    const leftClip = cloneDeep(clip);
    leftClip.durationSec = leftDur;
    leftClip.fadeOutSec = Math.max(leftClip.fadeOutSec || 0, Math.min(0.008, leftDur * 0.2));
    recomputeVisibleClipWindow(leftClip);

    const rightClip = cloneDeep(clip);
    rightClip.id = uid('clip');
    rightClip.name = `${clip.name.replace(/\s+\(Part \d+\)$/i, '')} (Part 2)`;
    rightClip.startSec = Number(splitTimeSec.toFixed(4));
    rightClip.offsetSec = Number((origOffset + leftDur).toFixed(4));
    rightClip.durationSec = rightDur;
    rightClip.fadeInSec = Math.max(0, Math.min(0.008, rightDur * 0.2));
    recomputeVisibleClipWindow(rightClip);

    return [leftClip, rightClip];
  }

  function splitClipsInProject(project, { selectedClipIds, selectedTrackIds, splitTimeSec }) {
    const newClipIds = [];
    let splitCount = 0;
    const hasClipSel = selectedClipIds && selectedClipIds.size > 0;
    const hasTrackSel = selectedTrackIds && selectedTrackIds.size > 0;

    for (const track of (project?.tracks || [])) {
      if (!hasClipSel && hasTrackSel && !selectedTrackIds.has(track.id)) continue;
      const nextClips = [];
      for (const clip of (track.clips || [])) {
        const eligible = hasClipSel ? selectedClipIds.has(clip.id) : true;
        if (!eligible) {
          nextClips.push(clip);
          continue;
        }
        const parts = splitClipAtTime(clip, splitTimeSec);
        if (parts) {
          nextClips.push(parts[0], parts[1]);
          newClipIds.push(parts[1].id);
          splitCount++;
        } else {
          nextClips.push(clip);
        }
      }
      track.clips = nextClips;
    }
    return { splitCount, newClipIds };
  }

  function moveClipsByDelta(project, targetClipIds, deltaSec) {
    if (!targetClipIds || !targetClipIds.size) return 0;
    let minStart = Infinity;
    const matched = [];
    for (const track of (project?.tracks || [])) {
      for (const clip of (track.clips || [])) {
        if (targetClipIds.has(clip.id)) {
          const s = Number(clip.startSec) || 0;
          if (s < minStart) minStart = s;
          matched.push(clip);
        }
      }
    }
    if (!matched.length) return 0;
    // Clamp delta equally across all selected clips so multi-mic drum phase lock never slips at t=0!
    const safeDelta = Math.max(-minStart, Number(deltaSec) || 0);
    for (const clip of matched) {
      clip.startSec = Number(Math.max(0, (Number(clip.startSec) || 0) + safeDelta).toFixed(4));
    }
    return matched.length;
  }

  const END_TIME_MATCH_TOLERANCE_SEC = 0.15;

  function clipEndSec(clip) {
    return (Number(clip?.startSec) || 0) + (Number(clip?.durationSec) || 0);
  }

  function clipOverlapRatio(a, b) {
    const a0 = Number(a?.startSec) || 0;
    const a1 = clipEndSec(a);
    const b0 = Number(b?.startSec) || 0;
    const b1 = clipEndSec(b);
    const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const minDur = Math.max(0.01, Math.min(a1 - a0, b1 - b0));
    return overlap / minDur;
  }

  /**
   * Returns selectedClipIds if non-empty; otherwise collects all clips belonging
   * to selectedTrackIds so keyboard/menu clip actions operate on selected tracks seamlessly.
   */
  function getEffectiveSelectedClipIds(project, selectedClipIds, selectedTrackIds) {
    const explicitClips = selectedClipIds instanceof Set ? selectedClipIds : new Set(selectedClipIds || []);
    if (explicitClips.size > 0) return new Set(explicitClips);
    const selTracks = selectedTrackIds instanceof Set ? selectedTrackIds : new Set(selectedTrackIds || []);
    const derived = new Set();
    if (selTracks.size > 0) {
      for (const tr of (project?.tracks || [])) {
        if (!selTracks.has(tr.id)) continue;
        for (const c of (tr.clips || [])) derived.add(c.id);
      }
    }
    return derived;
  }

  /**
   * Resolves all linked clips across selected tracks / selected clips when the user
   * clicks, drags, trims, or right-clicks `anchorClipId` on one of the selected tracks.
   *
   * - mode === 'right': matches clips on selected tracks with identical ending times (±toleranceSec)
   * - mode === 'left':  matches clips on selected tracks with identical start times (±toleranceSec)
   * - mode === 'move' | 'edit': matches co-timed / overlapping takes across selected tracks
   */
  function resolveLinkedClipsForOperation(
    project,
    {
      selectedTrackIds,
      selectedClipIds,
      anchorClipId,
      mode = 'edit',
      toleranceSec = END_TIME_MATCH_TOLERANCE_SEC,
    } = {}
  ) {
    if (!anchorClipId) {
      return getEffectiveSelectedClipIds(project, selectedClipIds, selectedTrackIds);
    }
    const found = findClipWithTrack(project, anchorClipId);
    if (!found) {
      return getEffectiveSelectedClipIds(project, selectedClipIds, selectedTrackIds);
    }

    const anchorClip = found.clip;
    const anchorTrack = found.track;
    const anchorStart = Number(anchorClip.startSec) || 0;
    const anchorEnd = clipEndSec(anchorClip);

    const selTracks = selectedTrackIds instanceof Set ? selectedTrackIds : new Set(selectedTrackIds || []);
    const selClips = selectedClipIds instanceof Set ? selectedClipIds : new Set(selectedClipIds || []);
    const inSelectedTrackGroup = selTracks.has(anchorTrack.id) && selTracks.size > 1;
    const inSelectedClipGroup = selClips.has(anchorClip.id) && selClips.size > 1;

    if (!inSelectedTrackGroup && !inSelectedClipGroup) {
      return new Set([anchorClip.id]);
    }

    // Gather candidate clips from selected tracks and/or explicitly selected clips
    const candidates = [];
    for (const tr of (project?.tracks || [])) {
      const trackEligible = inSelectedTrackGroup && selTracks.has(tr.id);
      for (const c of (tr.clips || [])) {
        if (c.id === anchorClip.id) continue;
        if (trackEligible || (inSelectedClipGroup && selClips.has(c.id))) {
          candidates.push(c);
        }
      }
    }

    const linked = new Set([anchorClip.id]);
    for (const c of candidates) {
      const cs = Number(c.startSec) || 0;
      const ce = clipEndSec(c);
      if (mode === 'right') {
        if (Math.abs(ce - anchorEnd) <= toleranceSec) linked.add(c.id);
      } else if (mode === 'left') {
        if (Math.abs(cs - anchorStart) <= toleranceSec) linked.add(c.id);
      } else {
        if (
          Math.abs(cs - anchorStart) <= toleranceSec ||
          Math.abs(ce - anchorEnd) <= toleranceSec ||
          clipOverlapRatio(c, anchorClip) >= 0.5
        ) {
          linked.add(c.id);
        }
      }
    }

    // Fallback: if user explicitly Ctrl+Clicked distinct clips (not via multi-track selection)
    // with non-matching edges, still trim/edit all explicitly selected clips relatively.
    if (linked.size === 1 && inSelectedClipGroup && !inSelectedTrackGroup) {
      for (const id of selClips) linked.add(id);
    }

    return linked;
  }

  function trimClipEdge(clip, edge, deltaSec) {
    ensureClipSourceMetadata(clip);
    const srcDur = Number(clip.sourceDurationSec) || Number(clip.durationSec) || 1;
    const origStart = Number(clip.startSec) || 0;
    const origOff = Number(clip.offsetSec) || 0;
    const origDur = Number(clip.durationSec) || 0.1;

    if (edge === 'left') {
      const minDelta = Math.max(-origStart, -origOff);
      const maxDelta = origDur - 0.05;
      const d = clamp(minDelta, maxDelta, deltaSec);
      clip.startSec = Number((origStart + d).toFixed(4));
      clip.offsetSec = Number((origOff + d).toFixed(4));
      clip.durationSec = Number((origDur - d).toFixed(4));
    } else if (edge === 'right') {
      const maxDur = srcDur - origOff;
      clip.durationSec = Number(clamp(0.05, maxDur, origDur + deltaSec).toFixed(4));
    }
    recomputeVisibleClipWindow(clip);
    return clip;
  }

  /**
   * Trims all clips in `targetClipIds` non-destructively from `initialClipsMap` snapshots,
   * preserving exact shared end times on right-edge trims and sample-accurate multi-mic
   * phase lock on left-edge trims.
   */
  function trimClipsBatch(
    project,
    initialClipsMap,
    targetClipIds,
    edge,
    deltaSec,
    {
      anchorClipId = null,
      snapBpm = 120,
      snapEnabled = false,
      toleranceSec = END_TIME_MATCH_TOLERANCE_SEC,
    } = {}
  ) {
    const ids = targetClipIds instanceof Set ? targetClipIds : new Set(targetClipIds || []);
    if (!ids.size) return 0;

    const entries = [];
    for (const tr of (project?.tracks || [])) {
      for (const clip of (tr.clips || [])) {
        if (!ids.has(clip.id)) continue;
        const initSnap = initialClipsMap instanceof Map ? initialClipsMap.get(clip.id) : initialClipsMap?.[clip.id];
        if (initSnap) {
          Object.assign(clip, cloneDeep(initSnap));
        }
        ensureClipSourceMetadata(clip);
        entries.push({
          clip,
          initStart: Number(clip.startSec) || 0,
          initOff: Number(clip.offsetSec) || 0,
          initDur: Number(clip.durationSec) || 0.1,
          initEnd: clipEndSec(clip),
          initSrcDur: Math.max(0.05, Number(clip.sourceDurationSec) || Number(clip.durationSec) || 1),
        });
      }
    }
    if (!entries.length) return 0;

    const anchorEntry = entries.find(e => e.clip.id === anchorClipId) || entries[0];

    if (edge === 'right') {
      let desiredEnd = anchorEntry.initEnd + (Number(deltaSec) || 0);
      if (snapEnabled) {
        desiredEnd = snapTimeToBeatGrid(desiredEnd, snapBpm, true);
      }
      const rawDelta = desiredEnd - anchorEntry.initEnd;

      const alignedGroup = entries.filter(e => Math.abs(e.initEnd - anchorEntry.initEnd) <= toleranceSec);
      const relativeGroup = entries.filter(e => Math.abs(e.initEnd - anchorEntry.initEnd) > toleranceSec);

      if (alignedGroup.length > 0) {
        let minAllowedEnd = 0.05;
        let maxAllowedEnd = Infinity;
        for (const e of alignedGroup) {
          minAllowedEnd = Math.max(minAllowedEnd, e.initStart + 0.05);
          maxAllowedEnd = Math.min(maxAllowedEnd, e.initStart + (e.initSrcDur - e.initOff));
        }
        const sharedEnd = minAllowedEnd <= maxAllowedEnd
          ? clamp(minAllowedEnd, maxAllowedEnd, desiredEnd)
          : desiredEnd;
        for (const e of alignedGroup) {
          const targetDur = sharedEnd - e.initStart;
          trimClipEdge(e.clip, 'right', targetDur - e.initDur);
        }
      }

      for (const e of relativeGroup) {
        trimClipEdge(e.clip, 'right', rawDelta);
      }
    } else if (edge === 'left') {
      let desiredStart = anchorEntry.initStart + (Number(deltaSec) || 0);
      if (snapEnabled) {
        desiredStart = snapTimeToBeatGrid(desiredStart, snapBpm, true);
      }
      const rawDelta = desiredStart - anchorEntry.initStart;

      const alignedGroup = entries.filter(e => Math.abs(e.initStart - anchorEntry.initStart) <= toleranceSec);
      const relativeGroup = entries.filter(e => Math.abs(e.initStart - anchorEntry.initStart) > toleranceSec);

      if (alignedGroup.length > 0) {
        let minDelta = -Infinity;
        let maxDelta = Infinity;
        for (const e of alignedGroup) {
          minDelta = Math.max(minDelta, Math.max(-e.initStart, -e.initOff));
          maxDelta = Math.min(maxDelta, e.initDur - 0.05);
        }
        const uniformDelta = minDelta <= maxDelta ? clamp(minDelta, maxDelta, rawDelta) : rawDelta;
        for (const e of alignedGroup) {
          trimClipEdge(e.clip, 'left', uniformDelta);
        }
      }

      for (const e of relativeGroup) {
        trimClipEdge(e.clip, 'left', rawDelta);
      }
    }

    return entries.length;
  }

  function duplicateClipsInProject(project, targetClipIds) {
    if (!targetClipIds || !targetClipIds.size) return [];
    let minStart = Infinity;
    let maxEnd = 0;
    for (const track of (project?.tracks || [])) {
      for (const clip of (track.clips || [])) {
        if (targetClipIds.has(clip.id)) {
          const s = Number(clip.startSec) || 0;
          const e = s + (Number(clip.durationSec) || 0);
          if (s < minStart) minStart = s;
          if (e > maxEnd) maxEnd = e;
        }
      }
    }
    if (!Number.isFinite(minStart)) return [];
    const spanSec = Math.max(0.1, maxEnd - minStart);
    const createdIds = [];

    for (const track of (project?.tracks || [])) {
      const additions = [];
      for (const clip of (track.clips || [])) {
        if (!targetClipIds.has(clip.id)) continue;
        const copy = cloneDeep(clip);
        copy.id = uid('clip');
        copy.startSec = Number(((Number(clip.startSec) || 0) + spanSec).toFixed(4));
        additions.push(copy);
        createdIds.push(copy.id);
      }
      if (additions.length) track.clips.push(...additions);
    }
    return createdIds;
  }

  function copyClipsFromProject(project, targetClipIds) {
    if (!targetClipIds || !targetClipIds.size) return null;
    const entries = [];
    let minStart = Infinity;
    let baseTrackIdx = Infinity;

    const tracks = project?.tracks || [];
    for (let ti = 0; ti < tracks.length; ti++) {
      for (const clip of (tracks[ti].clips || [])) {
        if (!targetClipIds.has(clip.id)) continue;
        const s = Number(clip.startSec) || 0;
        if (s < minStart) minStart = s;
        if (ti < baseTrackIdx) baseTrackIdx = ti;
        entries.push({
          trackId: tracks[ti].id,
          trackIndex: ti,
          clip: cloneDeep(clip),
        });
      }
    }
    if (!entries.length) return null;
    return {
      minStartSec: minStart,
      baseTrackIdx,
      entries,
    };
  }

  function pasteClipsIntoProject(project, clipboard, pasteAtSec = 0, anchorTrackId = null) {
    if (!clipboard || !Array.isArray(clipboard.entries) || !clipboard.entries.length) return [];
    const tracks = project?.tracks || [];
    if (!tracks.length) return [];

    const anchorIdx = anchorTrackId ? tracks.findIndex(t => t.id === anchorTrackId) : -1;
    const createdIds = [];

    for (const item of clipboard.entries) {
      let destTrack = tracks.find(t => t.id === item.trackId);
      if (clipboard.entries.length === 1 && anchorIdx !== -1) {
        destTrack = tracks[anchorIdx];
      } else if (!destTrack) {
        const relIdx = clamp(0, tracks.length - 1, (anchorIdx !== -1 ? anchorIdx : 0) + (item.trackIndex - clipboard.baseTrackIdx));
        destTrack = tracks[relIdx];
      }
      if (!destTrack) continue;
      if (!Array.isArray(destTrack.clips)) destTrack.clips = [];
      const copy = cloneDeep(item.clip);
      copy.id = uid('clip');
      const relSec = (Number(item.clip.startSec) || 0) - clipboard.minStartSec;
      copy.startSec = Number(Math.max(0, pasteAtSec + relSec).toFixed(4));
      destTrack.clips.push(copy);
      createdIds.push(copy.id);
    }
    return createdIds;
  }

  function deleteClipsFromProject(project, targetClipIds) {
    if (!targetClipIds || !targetClipIds.size) return 0;
    let removed = 0;
    for (const track of (project?.tracks || [])) {
      const before = (track.clips || []).length;
      track.clips = (track.clips || []).filter(c => !targetClipIds.has(c.id));
      removed += before - track.clips.length;
    }
    return removed;
  }

  function normalizeClipGain(clip, targetPeakDb = -3.0) {
    const measuredPeak = Number(clip?.peakDb);
    if (!Number.isFinite(measuredPeak) || measuredPeak <= -80) return 0;
    clip.gainDb = Number(clamp(-24, 24, targetPeakDb - measuredPeak).toFixed(1));
    return clip.gainDb;
  }

  // ─── Track Editing & Track Gain Operations ────────────────────────────────

  function normalizeTrackGain(track, targetPeakDb = -6.0) {
    let maxPeak = -96;
    for (const c of (track?.clips || [])) {
      const pk = Number(c.peakDb);
      if (Number.isFinite(pk) && pk > maxPeak) maxPeak = pk;
    }
    if (maxPeak <= -80) {
      track.gainDb = 0;
      return 0;
    }
    track.gainDb = Number(clamp(-24, 24, targetPeakDb - maxPeak).toFixed(1));
    return track.gainDb;
  }

  function duplicateTracksInProject(project, trackIds, { includeClips = true } = {}) {
    const ids = trackIds instanceof Set ? trackIds : new Set(trackIds || []);
    if (!ids.size) return [];
    const nextTracks = [];
    const createdTrackIds = [];

    for (const track of (project?.tracks || [])) {
      nextTracks.push(track);
      if (!ids.has(track.id)) continue;
      const copy = cloneDeep(track);
      copy.id = uid('trk');
      copy.name = `${track.name} (Copy)`;
      copy.clips = includeClips
        ? (copy.clips || []).map(c => ({ ...c, id: uid('clip') }))
        : [];
      nextTracks.push(copy);
      createdTrackIds.push(copy.id);
    }
    project.tracks = nextTracks;
    return createdTrackIds;
  }

  function deleteTracksFromProject(project, trackIds) {
    const ids = trackIds instanceof Set ? trackIds : new Set(trackIds || []);
    if (!ids.size) return 0;
    const before = (project?.tracks || []).length;
    project.tracks = (project?.tracks || []).filter(t => !ids.has(t.id));
    return before - project.tracks.length;
  }

  function reorderTrackInProject(project, trackId, deltaOrTargetIdx, { isAbsoluteIndex = false } = {}) {
    const tracks = project?.tracks || [];
    const fromIdx = tracks.findIndex(t => t.id === trackId);
    if (fromIdx === -1) return false;
    const toIdx = isAbsoluteIndex
      ? clamp(0, tracks.length - 1, deltaOrTargetIdx)
      : clamp(0, tracks.length - 1, fromIdx + deltaOrTargetIdx);
    if (fromIdx === toIdx) return false;
    const [moved] = tracks.splice(fromIdx, 1);
    tracks.splice(toIdx, 0, moved);
    return true;
  }

  /**
   * Moves one or more selected tracks up (-1) or down (+1) together while preserving
   * relative track order across all selected tracks.
   */
  function reorderTracksBatch(project, trackIds, direction = -1) {
    const tracks = project?.tracks || [];
    const ids = trackIds instanceof Set ? trackIds : new Set(trackIds || []);
    if (!ids.size || tracks.length <= 1) return false;
    let movedAny = false;
    if (direction < 0) {
      for (let i = 1; i < tracks.length; i++) {
        if (ids.has(tracks[i].id) && !ids.has(tracks[i - 1].id)) {
          const tmp = tracks[i - 1];
          tracks[i - 1] = tracks[i];
          tracks[i] = tmp;
          movedAny = true;
        }
      }
    } else if (direction > 0) {
      for (let i = tracks.length - 2; i >= 0; i--) {
        if (ids.has(tracks[i].id) && !ids.has(tracks[i + 1].id)) {
          const tmp = tracks[i + 1];
          tracks[i + 1] = tracks[i];
          tracks[i] = tmp;
          movedAny = true;
        }
      }
    }
    return movedAny;
  }

  /**
   * Gangs continuous numeric mixer parameters (gainDb, volume, pan) across all selected tracks
   * relative to `startValuesMap` so dragging any selected track slider adjusts all selected tracks.
   */
  function adjustTracksNumericBatch(project, startValuesMap, targetTrackIds, prop, delta, min, max, precision = 2) {
    const ids = targetTrackIds instanceof Set ? targetTrackIds : new Set(targetTrackIds || []);
    let changed = 0;
    for (const tr of (project?.tracks || [])) {
      if (!ids.has(tr.id)) continue;
      const base = startValuesMap instanceof Map
        ? (startValuesMap.get(tr.id) ?? (Number(tr[prop]) || 0))
        : (Number(tr[prop]) || 0);
      const val = clamp(min, max, base + (Number(delta) || 0));
      tr[prop] = Number(val.toFixed(precision));
      changed++;
    }
    return changed;
  }

  function selectAllTracksOnly(project) {
    return {
      selectedTrackIds: new Set((project?.tracks || []).map(t => t.id)),
      selectedClipIds: new Set(),
    };
  }

  function selectAllClipsOnly(project) {
    const clipIds = new Set();
    for (const t of (project?.tracks || [])) {
      for (const c of (t.clips || [])) clipIds.add(c.id);
    }
    return {
      selectedTrackIds: new Set(),
      selectedClipIds: clipIds,
    };
  }

  function invertTrackSelection(project, currentSelectedTrackIds) {
    const cur = currentSelectedTrackIds instanceof Set ? currentSelectedTrackIds : new Set(currentSelectedTrackIds || []);
    const next = new Set();
    for (const t of (project?.tracks || [])) {
      if (!cur.has(t.id)) next.add(t.id);
    }
    return next;
  }

  function setTracksPropertyBatch(project, targetTrackIds /* Set | 'all' */, prop, value) {
    let changed = 0;
    const isAll = targetTrackIds === 'all';
    const ids = isAll ? null : (targetTrackIds instanceof Set ? targetTrackIds : new Set(targetTrackIds || []));
    for (const t of (project?.tracks || [])) {
      if (!isAll && !ids.has(t.id)) continue;
      if (prop === 'phaseInvert') {
        t.fx = { ...(t.fx || {}), phaseInvert: Boolean(value) };
      } else {
        t[prop] = value;
      }
      changed++;
    }
    return changed;
  }

  function trimClipsToPlayhead(project, targetClipIds, edge /* 'left' | 'right' */, playheadSec, selectedTrackIds = null) {
    const ids = targetClipIds instanceof Set ? targetClipIds : new Set(targetClipIds || []);
    const selTracks = selectedTrackIds instanceof Set ? selectedTrackIds : new Set(selectedTrackIds || []);
    let trimmed = 0;
    for (const tr of (project?.tracks || [])) {
      if (ids.size === 0 && selTracks.size > 0 && !selTracks.has(tr.id)) continue;
      for (const clip of (tr.clips || [])) {
        if (ids.size > 0 && !ids.has(clip.id)) continue;
        const start = Number(clip.startSec) || 0;
        const end = start + (Number(clip.durationSec) || 0);
        if (playheadSec <= start + 0.04 || playheadSec >= end - 0.04) continue;
        if (edge === 'left') {
          trimClipEdge(clip, 'left', playheadSec - start);
        } else {
          trimClipEdge(clip, 'right', playheadSec - end);
        }
        trimmed++;
      }
    }
    return trimmed;
  }

  function snapTimeToBeatGrid(timeSec, bpm = 120, enabled = false, subdivision = 2) {
    const t = Math.max(0, Number(timeSec) || 0);
    if (!enabled) return Number(t.toFixed(4));
    const safeBpm = clamp(30, 300, Number(bpm) || 120);
    const gridSec = (60 / safeBpm) / Math.max(1, subdivision);
    return Number((Math.round(t / gridSec) * gridSec).toFixed(4));
  }

  function encodeStereoFloat32ToWavBytes(left, right, sampleRate = 48000) {
    const frames = Math.min(left.length, right.length);
    const numChannels = 2;
    const bytesPerSample = 2;
    const dataBytes = frames * numChannels * bytesPerSample;
    const buf = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buf);
    const writeAscii = (off, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
    };
    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, 16, true);
    writeAscii(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (let i = 0; i < frames; i++) {
      const l = Math.max(-1, Math.min(1, left[i] || 0));
      const r = Math.max(-1, Math.min(1, right[i] || 0));
      view.setInt16(offset, Math.round(l * 32767), true);
      view.setInt16(offset + 2, Math.round(r * 32767), true);
      offset += 4;
    }
    return new Uint8Array(buf);
  }

  return {
    STUDIO_COLORS,
    END_TIME_MATCH_TOLERANCE_SEC,
    clamp,
    cloneDeep,
    uid,
    dbToGain,
    gainToDb,
    formatDb,
    clipEndSec,
    UndoHistoryStack,
    applyTrackClickSelection,
    findClipWithTrack,
    applyClipClickSelection,
    getEffectiveSelectedClipIds,
    resolveLinkedClipsForOperation,
    selectAllInProject,
    selectAllTracksOnly,
    selectAllClipsOnly,
    invertTrackSelection,
    setTracksPropertyBatch,
    adjustTracksNumericBatch,
    ensureClipSourceMetadata,
    recomputeVisibleClipWindow,
    splitClipAtTime,
    splitClipsInProject,
    moveClipsByDelta,
    trimClipEdge,
    trimClipsBatch,
    trimClipsToPlayhead,
    duplicateClipsInProject,
    copyClipsFromProject,
    pasteClipsIntoProject,
    deleteClipsFromProject,
    normalizeClipGain,
    normalizeTrackGain,
    duplicateTracksInProject,
    deleteTracksFromProject,
    reorderTrackInProject,
    reorderTracksBatch,
    snapTimeToBeatGrid,
    encodeStereoFloat32ToWavBytes,
  };
});
