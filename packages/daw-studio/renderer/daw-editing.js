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

  return {
    STUDIO_COLORS,
    clamp,
    cloneDeep,
    uid,
    dbToGain,
    gainToDb,
    formatDb,
    UndoHistoryStack,
    applyTrackClickSelection,
    findClipWithTrack,
    applyClipClickSelection,
    selectAllInProject,
    ensureClipSourceMetadata,
    recomputeVisibleClipWindow,
    splitClipAtTime,
    splitClipsInProject,
    moveClipsByDelta,
    trimClipEdge,
    duplicateClipsInProject,
    copyClipsFromProject,
    pasteClipsIntoProject,
    deleteClipsFromProject,
    normalizeClipGain,
    normalizeTrackGain,
    duplicateTracksInProject,
    deleteTracksFromProject,
    reorderTrackInProject,
  };
});
