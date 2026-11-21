'use strict';

const DE = window.DawEditing;
const DI = window.DawIcons;

// ─── Studio & Hardware State ────────────────────────────────────────────────
let currentSnapshot = null;
let micProfiles = [];
let drumkitsStatus = { kits: [], anyInstalled: false };
let vstDirsStatus = { customDirectories: [], systemPaths: [], discoveredPlugins: [], totalCustomDirs: 0, totalPlugins: 0, totalCustomSamples: 0 };
let systemPlugins = [];
let currentProject = null;
let savedProjectsState = { projects: [], lastProjectId: null };
let selectedTrackId = null; // Active FX Inspector track (null = drawer closed)
let isDirty = false;

// DAW Editing, Multi-Selection & History State
const historyStack = new DE.UndoHistoryStack(50);
let selectedTrackIds = new Set();
let anchorTrackId = null;
let selectedClipIds = new Set();
let anchorClipId = null;
let clipClipboard = null;
let timelineZoom = 1.0;
let timelineOffsetSec = 0.0;
let middlePanDragState = null;
let rulerScrubState = null;
let timeSelection = null; // null | { fromSec: number, toSec: number }
let exportPrefs = {
  format: 'mp3',
  qualityByFormat: {
    mp4: 'stream_copy',
    mp3: '320k',
    wav: 'pcm_s24le',
    flac: '24bit',
    m4a: '256k',
    ogg: 'q8',
    opus: '192k',
    aiff: 'pcm_s24be',
  },
  sampleRate: 48000,
  normalize: true,
  edgeFade: true,
  excludeClick: true,
};
let isExportingMixdown = false;
let activeRecordStopPromise = null;
let activeDrumkitJobHandle = null;
let liveHeadphoneBoostDb = Number(localStorage.getItem('robos.daw.headphoneBoostDb')) || 0;
let activeLiveMasterBoostGains = new Set();

/**
 * Compute exact wall-clock millisecond timestamp when `playStartCtxTime` physically exits the
 * audio interface headphones, guarding against Linux Chromium/PulseAudio cork-epoch drift where
 * `getOutputTimestamp().contextTime` freezes while corked and lags `ctx.currentTime` by minutes.
 */
function computeReliableEarsStartWallMs(ctx, playStartCtxTime) {
  const nowPerf = performance.now();
  const nowCtx = ctx.currentTime;
  const ts = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null;
  if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
    const impliedDacLatSec = (nowCtx - ts.contextTime) - (nowPerf - ts.performanceTime) / 1000;
    if (impliedDacLatSec >= 0.001 && impliedDacLatSec <= 0.350) {
      return {
        earsStartWallMs: (performance.timeOrigin + ts.performanceTime) + (playStartCtxTime - ts.contextTime) * 1000,
        lockedByHwTs: true,
      };
    }
  }
  const dacOutLatSec = ((Number(ctx.baseLatency) || 0) + (Number(ctx.outputLatency) || 0))
    || ((Number(currentSnapshot?.clock?.latencyMs) || 42) / 1000);
  return {
    earsStartWallMs: (performance.timeOrigin + nowPerf) + (playStartCtxTime - nowCtx + dacOutLatSec) * 1000,
    lockedByHwTs: false,
  };
}

function runDawJob(spec, asyncFn) {
  const jobsApi = window.RobosJobs;
  if (jobsApi && typeof jobsApi.run === 'function') {
    return jobsApi.run(spec, asyncFn);
  }
  const noopHandle = {
    id: 'noop',
    update: () => {},
    step: () => {},
    complete: () => {},
    fail: () => {},
    cancel: () => {},
    getSnapshot: () => null,
  };
  return Promise.resolve().then(() => asyncFn(noopHandle));
}
let inlineRenamingTrackId = null;
let timelineDragState = null;
let hoverLinkedPreview = null; // { key: string, zone: string, clipIds: Set<string> }
let renameModalCallback = null;
let snapToGrid = false;
let loopPlayback = false;
let countInEnabled = false;
let activeMenubarKey = null;

// Live Mic Meter (Preferences -> Audio Devices)
let liveAudioCtx = null;
let liveMediaStream = null;
let liveRafId = null;

const DEFAULT_TIMELINE_SECONDS = 16;

// Playback & Recording Transport State
let studioAudioCtx = null;
let decodedBufferCache = new Map();
let isPlaying = false;
let isStartingPlayback = false;
let playbackLaunchSeq = 0;
let isRecording = false;
let isStartingRecording = false;
let isStoppingRecording = false;
let playheadSec = 0;
let playReturnAnchorSec = 0;
let playStartWallSec = 0;
let playStartOffsetSec = 0;
let playMaxDurationSec = DEFAULT_TIMELINE_SECONDS;
let activeScheduledNodes = [];
let activePlaybackPass = null; // { passGain, nodes, trackHandles: Map<trackId, handle> }
let playbackHotSwapSeq = 0;
let liveOverdubTrackHandles = new Map();
let transportRafId = null;
let liveRecLevels = {}; // trackId -> { peakDb, bytes }
let liveRecSession = null;
let liveRecRafId = null;
let rulerStaticCache = { key: '', canvas: null };
let trackStaticCache = new Map(); // trackId -> { key, canvas }
let waveformZoomDb = 0; // Non-destructive visual peak display zoom (REAPER Peak Display Gain)

function invalidateStaticTimelineCaches() {
  rulerStaticCache.key = '';
  trackStaticCache.clear();
}

// Add Mic Wizard State
let wizStep = 1;
let wizCategory = 'all';
let wizProfileId = 'kick-in';
let wizSelectedChannelName = '';
let wizChannelUserPicked = false;
let wizTapLevels = {};

// DrumSet AI Soundcheck Wizard State
let aiProviders = [];
let preferredAiProvider = 'antigravity';
let scStage = 'ready'; // 'ready' | 'recording' | 'analyzing' | 'results'
let scSelectedInputs = new Set();
let scArmedInputsList = [];
let scClassifications = [];
let scLastProviderLabel = '';

// Video Mode State (Video Inputs + Embedded / Standalone Pop-Out Video Output Monitor)
let discoveredVideoSources = [];
let selectedVideoOutputTrackId = '';
let videoDockOpen = false;
let videoDockWide = false;
let videoPopoutOpen = false;
let videoLiveCamEnabled = false;
let videoLiveSnapshotDataUrl = '';
let videoLiveSnapshotTimer = null;
let loadedEmbeddedVideoSrc = '';
let isSeekingEmbeddedVideo = false;
let pendingEmbeddedSeekSec = null;
let lastPopoutSyncAtMs = 0;
let lastPopoutClipKey = '';
let isCreatingLyricsTrack = false;
let embeddedKaraokeLineSig = '';
let activeVideoModalType = 'robos-ip-camera'; // 'robos-ip-camera' | 'v4l2' | 'custom'
let activeRobosProbedStatus = null;
let isSavingKdenlive = false;
const videoFilmstripCache = new Map(); // videoFile -> { status, img, tileCount, tileWidth, tileHeight, sourceDurationSec }

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimecode(sec) {
  const totalMs = Math.max(0, Math.round((Number(sec) || 0) * 1000));
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function parseTimecodeInput(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    return Math.max(0, Number(s));
  }
  const parts = s.split(':').map(p => p.trim());
  if (parts.length === 2) {
    const mins = Number(parts[0]);
    const secs = Number(parts[1]);
    if (Number.isFinite(mins) && Number.isFinite(secs) && mins >= 0 && secs >= 0) {
      return Math.max(0, mins * 60 + secs);
    }
  } else if (parts.length === 3) {
    const hrs = Number(parts[0]);
    const mins = Number(parts[1]);
    const secs = Number(parts[2]);
    if (Number.isFinite(hrs) && Number.isFinite(mins) && Number.isFinite(secs)) {
      return Math.max(0, hrs * 3600 + mins * 60 + secs);
    }
  }
  return null;
}

function hasActiveTimeSelection() {
  return Boolean(
    timeSelection &&
    Number.isFinite(timeSelection.fromSec) &&
    Number.isFinite(timeSelection.toSec) &&
    (timeSelection.toSec - timeSelection.fromSec) >= 0.02
  );
}

function formatShortClock(sec) {
  const safe = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(safe / 60);
  const rem = safe - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
}

function updateStatusBarTelemetry() {
  const tracks = currentProject?.tracks || [];
  const bpm = Math.max(20, Number(currentProject?.bpm) || 120);
  const beatsPerBar = Math.max(1, Math.round(Number(String(currentProject?.timeSignature || '4/4').split('/')[0]) || 4));
  const barSec = (60 / bpm) * beatsPerBar;

  // 1. Selection Length Panel (Timeline From->To range OR Selected Take span)
  const selPanel = document.getElementById('sb-panel-selection');
  const selValEl = document.getElementById('sb-selection-length');
  const selClearBtn = document.getElementById('btn-sb-clear-sel');
  if (selValEl) {
    if (hasActiveTimeSelection()) {
      const dur = Math.max(0, timeSelection.toSec - timeSelection.fromSec);
      const bars = barSec > 0 ? (dur / barSec) : 0;
      selValEl.textContent = `${formatTimecode(dur)} (${formatShortClock(timeSelection.fromSec)} -> ${formatShortClock(timeSelection.toSec)} · ${bars.toFixed(1)} bars)`;
      selPanel?.classList.add('sb-panel-selection-active');
      selClearBtn?.classList.remove('hidden');
    } else if (selectedClipIds.size > 0) {
      let minStart = Infinity;
      let maxEnd = 0;
      let count = 0;
      for (const tr of tracks) {
        for (const c of (tr.clips || [])) {
          if (!selectedClipIds.has(c.id)) continue;
          const s = Math.max(0, Number(c.startSec) || 0);
          const d = Math.max(0, Number(c.durationSec) || 0);
          if (s < minStart) minStart = s;
          if (s + d > maxEnd) maxEnd = s + d;
          count++;
        }
      }
      const span = count > 0 && Number.isFinite(minStart) ? Math.max(0, maxEnd - minStart) : 0;
      selValEl.textContent = count > 0
        ? `${formatTimecode(span)} (${count} take${count === 1 ? '' : 's'})`
        : '00:00.000';
      selPanel?.classList.toggle('sb-panel-selection-active', count > 0);
      selClearBtn?.classList.add('hidden');
    } else {
      selValEl.textContent = '00:00.000';
      selPanel?.classList.remove('sb-panel-selection-active');
      selClearBtn?.classList.add('hidden');
    }
  }

  // 2. Focused / Selected Track Length Panel
  const trkLenEl = document.getElementById('sb-track-length');
  if (trkLenEl) {
    const singleTrack = (selectedTrackId && tracks.find(t => t.id === selectedTrackId))
      || (selectedTrackIds.size === 1 ? tracks.find(t => selectedTrackIds.has(t.id)) : null);
    if (singleTrack) {
      const activeClips = (singleTrack.clips || []).filter(c => !c.muted);
      let audioSum = 0;
      let maxEnd = 0;
      for (const c of activeClips) {
        const s = Math.max(0, Number(c.startSec) || 0);
        const d = Math.max(0, Number(c.durationSec) || 0);
        audioSum += d;
        if (s + d > maxEnd) maxEnd = s + d;
      }
      const shortName = String(singleTrack.name || 'Track').slice(0, 18);
      trkLenEl.textContent = activeClips.length > 0
        ? `${shortName}: ${formatShortClock(audioSum)} (end ${formatShortClock(maxEnd)})`
        : `${shortName}: 00:00.00 (empty)`;
    } else if (selectedTrackIds.size > 1) {
      let selMaxEnd = 0;
      let selClips = 0;
      for (const tr of tracks) {
        if (!selectedTrackIds.has(tr.id)) continue;
        for (const c of (tr.clips || [])) {
          if (c.muted) continue;
          selClips++;
          const e = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0);
          if (e > selMaxEnd) selMaxEnd = e;
        }
      }
      trkLenEl.textContent = `${selectedTrackIds.size} sel · max ${formatShortClock(selMaxEnd)} (${selClips} takes)`;
    } else {
      const projEnd = DE.getProjectEndSec(currentProject);
      trkLenEl.textContent = tracks.length > 0 ? `Max ${formatShortClock(projEnd)}` : '00:00.00';
    }
  }

  // 3. Session Length Panel (Overall Arrangement Span + Bar Count)
  const sessLenEl = document.getElementById('sb-session-length');
  if (sessLenEl) {
    const projEnd = DE.getProjectEndSec(currentProject);
    const totalBars = projEnd > 0.01 && barSec > 0 ? Math.ceil(projEnd / barSec) : 0;
    sessLenEl.textContent = projEnd > 0.01
      ? `${formatShortClock(projEnd)} (${totalBars} bars @ ${bpm} BPM)`
      : `00:00.00 (${bpm} BPM)`;
  }

  // 4. Tracks / Armed / Takes Summary Panel
  const trkSumEl = document.getElementById('sb-tracks-summary');
  if (trkSumEl) {
    const armedCnt = tracks.filter(t => t.armed).length;
    const takeCnt = tracks.reduce((sum, t) => sum + ((t.clips || []).length), 0);
    trkSumEl.textContent = `${tracks.length} ch · ${armedCnt} armed · ${takeCnt} take${takeCnt === 1 ? '' : 's'}`;
  }

  // 5. Audio Engine Clock & Latency Panel
  const engEl = document.getElementById('sb-engine-summary');
  if (engEl) {
    const rateHz = Number(currentSnapshot?.clock?.effectiveRate) || Number(currentProject?.sampleRate) || 48000;
    const rateKhz = (rateHz / 1000).toFixed(1).replace(/\.0$/, '');
    const latMs = currentSnapshot?.clock?.latencyMs;
    engEl.textContent = latMs ? `${rateKhz} kHz · ${latMs} ms` : `${rateKhz} kHz`;
  }
}

function updateTimeSelectionPillUi() {
  const pill = document.getElementById('time-selection-pill');
  const txt = document.getElementById('time-selection-pill-text');
  if (pill && txt) {
    if (hasActiveTimeSelection()) {
      const dur = Math.max(0, timeSelection.toSec - timeSelection.fromSec);
      txt.textContent = `SELECTION LENGTH: ${formatTimecode(dur)} (${formatShortClock(timeSelection.fromSec)} -> ${formatShortClock(timeSelection.toSec)})`;
      pill.classList.remove('hidden');
    } else {
      pill.classList.add('hidden');
    }
  }
  updateStatusBarTelemetry();
}

function setTimeSelectionRange(aSec, bSec, { redraw = true } = {}) {
  const a = Math.max(0, Number(aSec) || 0);
  const b = Math.max(0, Number(bSec) || 0);
  const lo = Number(Math.min(a, b).toFixed(4));
  const hi = Number(Math.max(lo + 0.02, Math.max(a, b)).toFixed(4));
  timeSelection = { fromSec: lo, toSec: hi };
  updateTimeSelectionPillUi();
  if (redraw) drawAllTimelineCanvases();
  return timeSelection;
}

function setTimeSelectionFrom(fromSec) {
  const f = Math.max(0, Number((Number(fromSec) || 0).toFixed(4)));
  const curTo = hasActiveTimeSelection() ? timeSelection.toSec : null;
  const projEnd = Math.max(4, DE.getProjectEndSec(currentProject) || getBaseProjectSpanSec());
  const nextTo = (curTo !== null && curTo > f + 0.02) ? curTo : Math.max(projEnd, f + 4);
  const sel = setTimeSelectionRange(f, nextTo);
  showStatus(`Set 'From' -> ${formatTimecode(sel.fromSec)} (Range: ${formatTimecode(sel.fromSec)} -> ${formatTimecode(sel.toSec)})`);
  return sel;
}

function setTimeSelectionTo(toSec) {
  const t = Math.max(0.05, Number((Number(toSec) || 0).toFixed(4)));
  const curFrom = hasActiveTimeSelection() ? timeSelection.fromSec : 0;
  const nextFrom = curFrom < t - 0.02 ? curFrom : 0;
  const sel = setTimeSelectionRange(nextFrom, t);
  showStatus(`Set 'To' -> ${formatTimecode(sel.toSec)} (Range: ${formatTimecode(sel.fromSec)} -> ${formatTimecode(sel.toSec)})`);
  return sel;
}

function clearTimeSelection({ silent = false } = {}) {
  if (!timeSelection) return;
  timeSelection = null;
  updateTimeSelectionPillUi();
  drawAllTimelineCanvases();
  if (!silent) showStatus('Cleared timeline From -> To selection.');
}

function formatPan(pan) {
  const p = Number(pan) || 0;
  if (Math.abs(p) < 0.03) return 'C';
  return p < 0 ? `L${Math.round(Math.abs(p) * 100)}` : `R${Math.round(p * 100)}`;
}

function dbToPercent(db) {
  if (!Number.isFinite(db) || db <= -72) return 0;
  return Math.max(0, Math.min(100, ((db + 72) / 72) * 100));
}

/**
 * Perceptual hybrid dBFS + power visual amplitude curve matching the channel meter's
 * `-68 dBFS .. 0 dBFS` sensitivity range while keeping preamp noise floor (`<= -68 dBFS`)
 * razor-flat. Ensures quiet mic hits (e.g. `-48 dBFS` to `-30 dBFS`) visibly grow on both
 * live-streaming takes and saved regions whenever they register on the track meter.
 */
function waveformVisualAmp(linearPeak, gainLinear = 1, floorAmp = 0.012) {
  const raw = Math.max(0, Number(linearPeak) || 0);
  if (raw <= 0.00039) return floorAmp; // Gate raw ADC noise floor (<= -68.2 dBFS) before gain boost so silence stays 1px flat
  const zoomLin = waveformZoomDb === 0 ? 1 : DE.dbToGain(waveformZoomDb);
  const p = raw * gainLinear * zoomLin;
  if (p <= 0.00039) return floorAmp;
  const db = 20 * Math.log10(Math.min(1, p));
  if (db <= -68) return floorAmp;
  const normDb = Math.max(0, Math.min(1, (db + 68) / 68));
  return Math.max(floorAmp, Math.min(1, Math.pow(normDb, 1.42)));
}

function showStatus(message, isError = false) {
  const el = document.getElementById('status-banner');
  const dot = document.getElementById('sb-status-dot');
  if (el) {
    el.textContent = message;
    el.title = message;
    el.className = `sb-status-msg${isError ? ' error' : ''}`;
  }
  if (dot) {
    dot.className = `sb-status-dot${isError ? ' error' : ''}`;
  }
}

function markDirty(dirty = true) {
  isDirty = dirty;
  const badge = document.getElementById('project-save-state');
  if (!badge) return;
  if (!dirty && currentProject?.savedAt) {
    badge.textContent = 'SAVED';
    badge.className = 'save-badge saved';
  } else {
    badge.textContent = dirty ? 'MODIFIED' : 'NEW';
    badge.className = `save-badge${dirty ? ' dirty' : ''}`;
  }
}

function inputTier(node) {
  if (!node?.isFocusrite) return 3;
  const desc = String(node.description || '');
  if (/s\/pdif|spdif/i.test(desc)) return 2;
  if (/adat|direct/i.test(desc)) return 1;
  return 0; // Analog Mic/Line Inputs 1..8 first
}

function getOrderedInputs() {
  const inputs = Array.isArray(currentSnapshot?.inputs) ? [...currentSnapshot.inputs] : [];
  inputs.sort((a, b) => {
    const ta = inputTier(a);
    const tb = inputTier(b);
    if (ta !== tb) return ta - tb;
    const ma = String(a.description || '').match(/(\d+)/g);
    const mb = String(b.description || '').match(/(\d+)/g);
    const na = ma ? Number(ma[ma.length - 1]) : 999;
    const nb = mb ? Number(mb[mb.length - 1]) : 999;
    return na - nb;
  });
  return inputs;
}

function setMeterElementPercent(el, pct) {
  if (!el) return;
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  el.style.clipPath = `inset(0 ${(100 - clamped).toFixed(1)}% 0 0)`;
}

function getLiveRecordingElapsedSec(nowPerfMs = performance.now()) {
  if (!isRecording || !liveRecSession) return 0;
  if (Number.isFinite(liveRecSession.earsStartWallMs)) {
    const nowWallMs = performance.timeOrigin + nowPerfMs;
    return Math.max(0, (nowWallMs - liveRecSession.earsStartWallMs) / 1000);
  }
  return Math.max(0, (nowPerfMs - liveRecSession.startedPerfMs) / 1000);
}

function stopRecordingRafLoop() {
  if (liveRecRafId) {
    cancelAnimationFrame(liveRecRafId);
    liveRecRafId = null;
  }
}

function startRecordingRafLoop() {
  stopRecordingRafLoop();
  const tcEl = document.getElementById('transport-timecode');
  const meterElByTrack = new Map();
  for (const trkId of (liveRecSession?.tracks?.keys() || [])) {
    meterElByTrack.set(trkId, document.getElementById(`rec-meter-${trkId}`));
  }

  const step = (rafTimestamp) => {
    if (!isRecording || !liveRecSession) {
      liveRecRafId = null;
      return;
    }
    // Continuously lock earsStartWallMs to PipeWire/ALSA hardware DAC presentation clock (only when free of cork-epoch drift)
    const mon = liveRecSession.overdubMonitor;
    if (mon?.active && mon.ctx && mon.ctx.currentTime >= mon.playStartCtxTime + 0.06) {
      const probed = computeReliableEarsStartWallMs(mon.ctx, mon.playStartCtxTime);
      if (probed.lockedByHwTs) {
        if (!mon.lockedByHwTs || !Number.isFinite(liveRecSession.earsStartWallMs)) {
          liveRecSession.earsStartWallMs = probed.earsStartWallMs;
          mon.lockedByHwTs = true;
        } else {
          liveRecSession.earsStartWallMs = liveRecSession.earsStartWallMs * 0.85 + probed.earsStartWallMs * 0.15;
        }
      }
    }

    const nowPerf = typeof rafTimestamp === 'number' && rafTimestamp > 0 ? rafTimestamp : performance.now();
    const elapsed = getLiveRecordingElapsedSec(nowPerf);
    playheadSec = liveRecSession.startSec + elapsed;
    if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
    if (!middlePanDragState) ensurePlayheadInViewport(playheadSec);

    // Flush composited GPU channel meter clip-paths strictly on VSync (zero layout reflow)
    for (const [trkId, recState] of liveRecSession.tracks.entries()) {
      if (recState.meterDirty) {
        recState.meterDirty = false;
        const barEl = meterElByTrack.get(trkId) || document.getElementById(`rec-meter-${trkId}`);
        if (barEl) {
          meterElByTrack.set(trkId, barEl);
          setMeterElementPercent(barEl, dbToPercent(recState.peakDb));
        }
      }
    }

    drawAllTimelineCanvases();
    liveRecRafId = requestAnimationFrame(step);
  };
  liveRecRafId = requestAnimationFrame(step);
}

function getBaseProjectSpanSec() {
  let maxEnd = DEFAULT_TIMELINE_SECONDS;
  for (const t of (currentProject?.tracks || [])) {
    for (const c of (t.clips || [])) {
      const end = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0) + 2;
      if (end > maxEnd) maxEnd = end;
    }
  }
  if (isRecording && liveRecSession) {
    const recHead = liveRecSession.startSec + getLiveRecordingElapsedSec() + 3;
    if (recHead > maxEnd) {
      maxEnd = Math.ceil(recHead / 4) * 4;
    }
  }
  return Math.ceil(maxEnd);
}

function getTimelineDurationSec() {
  const base = getBaseProjectSpanSec();
  return Math.max(1.5, Number((base / Math.max(0.25, timelineZoom)).toFixed(2)));
}

function setTimelineOffsetSec(nextOffsetSec) {
  const maxOffset = Math.max(getBaseProjectSpanSec() * 3, timelineOffsetSec + 120);
  timelineOffsetSec = Number(DE.clamp(0, maxOffset, Number(nextOffsetSec) || 0).toFixed(4));
  drawAllTimelineCanvases();
}

function ensurePlayheadInViewport(headSec = playheadSec) {
  const span = getTimelineDurationSec();
  if (headSec > timelineOffsetSec + span * 0.94) {
    timelineOffsetSec = Number(Math.max(0, headSec - span * 0.15).toFixed(4));
  } else if (headSec < timelineOffsetSec) {
    timelineOffsetSec = Number(Math.max(0, headSec - span * 0.05).toFixed(4));
  }
}

function endMiddlePanDrag() {
  if (!middlePanDragState) return;
  middlePanDragState = null;
  document.body.classList.remove('panning-timeline');
}

function setTimelineZoom(nextZoom, { anchorRatio = null, resetOffset = false } = {}) {
  const prevSpan = getTimelineDurationSec();
  const maxZoom = Math.max(16.0, Math.min(128.0, Math.ceil(getBaseProjectSpanSec() / 2)));
  const clampedZoom = DE.clamp(0.25, maxZoom, Number(nextZoom) || 1.0);
  if (resetOffset) {
    timelineZoom = clampedZoom;
    timelineOffsetSec = 0;
  } else {
    const ratio = (typeof anchorRatio === 'number' && anchorRatio >= 0 && anchorRatio <= 1)
      ? anchorRatio
      : ((playheadSec >= timelineOffsetSec && playheadSec <= timelineOffsetSec + prevSpan)
        ? (playheadSec - timelineOffsetSec) / prevSpan
        : 0);
    const anchorTimeSec = timelineOffsetSec + ratio * prevSpan;
    timelineZoom = clampedZoom;
    const nextSpan = getTimelineDurationSec();
    timelineOffsetSec = Number(Math.max(0, anchorTimeSec - ratio * nextSpan).toFixed(4));
  }
  const zEl = document.getElementById('zoom-readout');
  if (zEl) zEl.textContent = `${Math.round(timelineZoom * 100)}%`;
  drawAllTimelineCanvases();
}

function pruneSelections() {
  const validTrackIds = new Set();
  const validClipIds = new Set();
  for (const t of (currentProject?.tracks || [])) {
    validTrackIds.add(t.id);
    for (const c of (t.clips || [])) validClipIds.add(c.id);
  }
  selectedTrackIds = new Set([...selectedTrackIds].filter(id => validTrackIds.has(id)));
  selectedClipIds = new Set([...selectedClipIds].filter(id => validClipIds.has(id)));
  if (anchorTrackId && !validTrackIds.has(anchorTrackId)) anchorTrackId = null;
  if (anchorClipId && !validClipIds.has(anchorClipId)) anchorClipId = null;
  if (selectedTrackId && !validTrackIds.has(selectedTrackId)) selectedTrackId = null;
}

function updateEditToolbarState() {
  const undoBtn = document.getElementById('btn-edit-undo');
  const redoBtn = document.getElementById('btn-edit-redo');
  if (undoBtn) {
    undoBtn.disabled = !historyStack.canUndo();
    const topLabel = historyStack.undoStack[historyStack.undoStack.length - 1]?.label;
    undoBtn.title = topLabel ? `Undo ${topLabel} (Ctrl+Z)` : 'Undo (Ctrl+Z)';
  }
  if (redoBtn) {
    redoBtn.disabled = !historyStack.canRedo();
    const redoLabel = historyStack.redoStack[historyStack.redoStack.length - 1]?.label;
    redoBtn.title = redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : 'Redo (Ctrl+Y)';
  }

  const tracks = currentProject?.tracks || [];
  const tCnt = selectedTrackIds.size;
  const cCnt = selectedClipIds.size;

  const pill = document.getElementById('selection-status-pill');
  if (pill) {
    if (!tCnt && !cCnt) {
      pill.textContent = '0 selected';
    } else {
      const parts = [];
      if (tCnt) parts.push(`${tCnt} track${tCnt === 1 ? '' : 's'}`);
      if (cCnt) parts.push(`${cCnt} take${cCnt === 1 ? '' : 's'}`);
      pill.textContent = parts.join(' · ');
    }
  }

  const selAllChk = document.getElementById('chk-select-all-tracks');
  if (selAllChk) {
    selAllChk.checked = tracks.length > 0 && tCnt === tracks.length;
    selAllChk.indeterminate = tCnt > 0 && tCnt < tracks.length;
  }

  const armBtn = document.getElementById('btn-quick-arm-sel');
  if (armBtn) {
    armBtn.innerHTML = `${DI.svg('record', 10, 'rec-glyph')}<span>${tCnt > 0 ? `Arm (${tCnt})` : 'Arm All'}</span>`;
  }
  const remBtn = document.getElementById('btn-quick-remove-tracks');
  if (remBtn) {
    remBtn.disabled = tCnt === 0;
    remBtn.innerHTML = `${DI.svg('trash', 11.5)}<span>${tCnt > 0 ? `Remove (${tCnt})` : 'Remove'}</span>`;
  }

  document.getElementById('btn-snap-grid')?.classList.toggle('active', snapToGrid);
  document.getElementById('btn-loop-toggle')?.classList.toggle('active', loopPlayback);

  const zEl = document.getElementById('zoom-readout');
  if (zEl) zEl.textContent = `${Math.round(timelineZoom * 100)}%`;
  updateStatusBarTelemetry();
}

async function syncProjectToMain(reanalyzeTrackIds = []) {
  if (!currentProject) return;
  const res = await window.robos.syncProject({
    project: currentProject,
    reanalyzeTrackIds,
  });
  if (res?.ok && res.project && reanalyzeTrackIds.length > 0) {
    currentProject = res.project;
    renderStudio();
    if (isPlaying || isRecording) {
      seamlessRefreshLiveAudio();
    }
  }
}

async function commitEdit(label, mutatorFn, { reanalyzeTrackIds = [], statusMsg = '' } = {}) {
  if (!currentProject) return;
  historyStack.pushSnapshot(currentProject, label);
  mutatorFn();
  pruneSelections();
  markDirty(true);
  renderStudio();
  if (statusMsg) showStatus(statusMsg);
  if (isPlaying || isRecording) {
    seamlessRefreshLiveAudio();
  }
  await syncProjectToMain(reanalyzeTrackIds);
}

async function performUndo() {
  if (isRecording) {
    showStatus('Stopping recording & queuing Undo...');
    await toggleRecording({ keepCursorAtStop: false });
  } else if (activeRecordStopPromise) {
    showStatus('Finishing recording render — Undo queued...');
    await activeRecordStopPromise;
  }
  const res = historyStack.undo(currentProject);
  if (!res) {
    showStatus('Nothing left to undo.');
    return;
  }
  currentProject = res.project;
  pruneSelections();
  markDirty(true);
  renderStudio();
  syncVideoOutputMonitor({ forcePush: true });
  if (isPlaying || isRecording) {
    seamlessRefreshLiveAudio();
  }
  showStatus(`Undo: ${res.label}`);
  await syncProjectToMain();
}

async function performRedo() {
  if (activeRecordStopPromise) {
    showStatus('Finishing recording render — Redo queued...');
    await activeRecordStopPromise;
  }
  const res = historyStack.redo(currentProject);
  if (!res) {
    showStatus('Nothing to redo.');
    return;
  }
  currentProject = res.project;
  pruneSelections();
  markDirty(true);
  renderStudio();
  syncVideoOutputMonitor({ forcePush: true });
  if (isPlaying || isRecording) {
    seamlessRefreshLiveAudio();
  }
  showStatus(`Redo: ${res.label}`);
  await syncProjectToMain();
}

// ─── Web Audio Engine & Open-Source Sample Playback ─────────────────────────

let activeStudioSinkInfo = { nodeName: '', deviceId: '', label: '' };

function getTargetStudioOutputEndpoint() {
  const outSel = document.getElementById('select-output-device');
  const selNodeName = outSel?.value || '';
  const outputs = Array.isArray(currentSnapshot?.outputs) ? currentSnapshot.outputs : [];
  if (selNodeName) {
    const found = outputs.find(o => o.name === selNodeName);
    if (found) return found;
  }
  if (currentSnapshot?.activeOutput) return currentSnapshot.activeOutput;
  return outputs.find(o => o.isFocusrite) || outputs[0] || null;
}

function ensureStudioAudioCtx() {
  if (!studioAudioCtx || studioAudioCtx.state === 'closed') {
    studioAudioCtx = new AudioContext();
    activeStudioSinkInfo = { nodeName: '', deviceId: '', label: '' };
  }
  if (studioAudioCtx.state === 'suspended') {
    studioAudioCtx.resume().catch(() => {});
  }
  return studioAudioCtx;
}

/**
 * Ensures `studioAudioCtx` is routed via Chromium `AudioContext.setSinkId()` directly
 * to the user's configured DAW Output Interface (e.g. Focusrite Scarlett 18i20) rather
 * than falling back to OS default laptop speakers.
 */
async function ensureRoutedStudioAudioCtx(forceRefresh = false) {
  const ctx = ensureStudioAudioCtx();
  if (typeof ctx.setSinkId !== 'function' || !navigator.mediaDevices?.enumerateDevices) {
    return ctx;
  }

  const targetOut = getTargetStudioOutputEndpoint();
  if (!targetOut) return ctx;

  if (
    !forceRefresh &&
    activeStudioSinkInfo.nodeName === targetOut.name &&
    activeStudioSinkInfo.deviceId &&
    ctx.sinkId === activeStudioSinkInfo.deviceId
  ) {
    return ctx;
  }

  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const audioOuts = devs.filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    const wantDesc = String(targetOut.description || '').trim();
    const wantLower = wantDesc.toLowerCase();

    let match = audioOuts.find(d => String(d.label || '').trim() === wantDesc)
      || audioOuts.find(d => String(d.label || '').trim().toLowerCase() === wantLower)
      || (wantLower ? audioOuts.find(d => String(d.label || '').toLowerCase().includes(wantLower) || wantLower.includes(String(d.label || '').toLowerCase())) : null);

    if (!match && targetOut.isFocusrite) {
      match = audioOuts.find(d => /line output 1\+2/i.test(d.label) && /scarlett|focusrite|clarett|vocaster/i.test(d.label))
        || audioOuts.find(d => /scarlett|focusrite|clarett|vocaster/i.test(d.label));
    }

    if (match && match.deviceId && ctx.sinkId !== match.deviceId) {
      await ctx.setSinkId(match.deviceId);
    }
    if (match) {
      activeStudioSinkInfo = {
        nodeName: targetOut.name,
        deviceId: match.deviceId,
        label: match.label || wantDesc,
      };
    }
  } catch {}

  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch {}
  }
  return ctx;
}

function base64ToArrayBuffer(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function loadDecodedAudio(filePath, bypassCache = false) {
  if (!filePath) return null;
  if (!bypassCache && decodedBufferCache.has(filePath)) {
    return decodedBufferCache.get(filePath);
  }
  const res = await window.robos.readAudioFile({ filePath });
  if (!res?.ok || !res.base64) return null;
  const ctx = ensureStudioAudioCtx();
  const ab = base64ToArrayBuffer(res.base64);
  const decoded = await ctx.decodeAudioData(ab);
  decodedBufferCache.set(filePath, decoded);
  return decoded;
}

function resolveDrumSamplePath(kitId, pieceId, velocity = 0.75) {
  const kits = drumkitsStatus?.kits || [];
  const kit = kits.find(k => k.id === kitId && k.installed) || kits.find(k => k.installed);
  if (!kit || !kit.pieces) return null;
  const piece = kit.pieces[pieceId] || Object.values(kit.pieces)[0];
  if (!piece || !Array.isArray(piece.layers)) return null;
  const readyLayers = piece.layers.filter(l => l.exists && l.localPath);
  if (!readyLayers.length) return null;

  const v = Math.max(0, Math.min(1, Number(velocity) || 0.75));
  const matched = readyLayers.find(l => v >= l.min && v <= l.max) || readyLayers[readyLayers.length - 1];
  return matched.localPath;
}

async function auditionDrumPiece(kitId, pieceId) {
  const samplePath = resolveDrumSamplePath(kitId, pieceId, 0.82);
  if (!samplePath) {
    showStatus(`Drum kit "${kitId}" is not installed yet — open Drum Kits to install it first.`, true);
    return;
  }
  try {
    const ctx = await ensureRoutedStudioAudioCtx();
    const audioBuf = await loadDecodedAudio(samplePath);
    if (!audioBuf) throw new Error('Could not decode drum sample');
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(ctx.destination);
    src.start();
    const outLabel = activeStudioSinkInfo.label || getTargetStudioOutputEndpoint()?.description || 'Studio Output';
    showStatus(`Auditioned ${kitId} / ${pieceId} -> ${outLabel}`);
  } catch (err) {
    showStatus(`Audition failed: ${err.message}`, true);
  }
}

function makeSoftClipCurve(amount = 0.2) {
  const k = Math.max(0, Number(amount) || 0) * 4.5;
  const n = 512;
  const curve = new Float32Array(n);
  const norm = Math.tanh(1 + k) || 1;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = k === 0 ? x : Math.tanh((1 + k) * x) / norm;
  }
  return curve;
}

const reverbImpulseWeakCache = new WeakMap();

function getOrCreateStudioReverbImpulse(ctx, revCfg = {}) {
  const type = revCfg.type === 'room' ? 'room' : 'plate';
  const decaySec = DE.clamp(0.25, 4.5, Number(revCfg.decaySec) || (type === 'plate' ? 1.25 : 0.95));
  const dampHz = DE.clamp(1800, 16000, Number(revCfg.dampHz) || (type === 'plate' ? 7400 : 6200));
  const sr = ctx.sampleRate || 48000;
  const cacheKey = `${type}:${decaySec.toFixed(2)}:${Math.round(dampHz)}:${sr}`;

  let ctxMap = reverbImpulseWeakCache.get(ctx);
  if (!ctxMap) {
    ctxMap = new Map();
    reverbImpulseWeakCache.set(ctx, ctxMap);
  }
  if (ctxMap.has(cacheKey)) return ctxMap.get(cacheKey);

  const length = Math.max(1024, Math.floor(sr * decaySec));
  const ir = ctx.createBuffer(2, length, sr);
  const left = ir.getChannelData(0);
  const right = ir.getChannelData(1);

  // Deterministic PRNG so offline renders & live playback produce identical lush stereo tails
  let seedL = type === 'plate' ? 0x9e3779b9 : 0x85ebca6b;
  let seedR = type === 'plate' ? 0xc2b2ae35 : 0x27d4eb2f;
  const randL = () => { seedL ^= seedL << 13; seedL ^= seedL >>> 17; seedL ^= seedL << 5; return ((seedL >>> 0) / 2147483648) - 1; };
  const randR = () => { seedR ^= seedR << 13; seedR ^= seedR >>> 17; seedR ^= seedR << 5; return ((seedR >>> 0) / 2147483648) - 1; };

  // Early studio room / plate reflections (decorrelated L/R)
  const earlyTapsMs = type === 'room'
    ? [[6.7, 0.42, 0.24], [11.3, -0.22, 0.40], [17.9, 0.31, -0.19], [24.3, -0.18, 0.29], [33.7, 0.21, 0.16]]
    : [[4.3, 0.34, -0.28], [8.9, -0.26, 0.33], [14.1, 0.24, 0.21]];
  for (const [ms, gL, gR] of earlyTapsMs) {
    const idx = Math.floor((ms / 1000) * sr);
    if (idx > 0 && idx < length) {
      left[idx] += gL;
      right[idx] += gR;
    }
  }

  // Progressive HF air-absorption low-pass state along the tail
  let lpL = 0;
  let lpR = 0;
  const baseCutoff = Math.min(0.45 * sr, dampHz);
  const normGain = type === 'plate' ? 0.34 : 0.30;

  for (let i = 0; i < length; i++) {
    const tNorm = i / length;
    // Fast initial build-up (3ms) so dry transient stays distinct, followed by natural 60dB exponential decay
    const buildIn = Math.min(1, i / Math.max(1, sr * 0.0035));
    const env = buildIn * Math.pow(1 - tNorm, type === 'plate' ? 2.6 : 3.1) * Math.exp(-3.8 * tNorm);
    // Tail darkens naturally over time like a real steel plate / wood studio room
    const dynFreq = Math.max(900, baseCutoff * (1 - 0.58 * tNorm));
    const alpha = 1 - Math.exp((-2 * Math.PI * dynFreq) / sr);

    lpL += alpha * (randL() - lpL);
    lpR += alpha * (randR() - lpR);
    left[i] += lpL * env * normGain;
    right[i] += lpR * env * normGain;
  }

  // Normalize discrete L2 convolution energy to -3 dB studio reference so mix=0.10 sits 20 dB below dry!
  let sumSq = 0;
  for (let i = 0; i < length; i++) {
    sumSq += 0.5 * (left[i] * left[i] + right[i] * right[i]);
  }
  const l2Norm = Math.sqrt(Math.max(1e-9, sumSq));
  const targetScale = 0.7071 / l2Norm;
  for (let i = 0; i < length; i++) {
    left[i] *= targetScale;
    right[i] *= targetScale;
  }

  ctxMap.set(cacheKey, ir);
  return ir;
}

function makeMasterCeilingCurve() {
  const n = 4096;
  const curve = new Float32Array(n);
  const knee = 0.78;
  const maxOut = 0.965; // -0.31 dBFS true sample ceiling
  const span = maxOut - knee;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const ax = Math.abs(x);
    if (ax <= knee) {
      curve[i] = x;
    } else {
      const sat = knee + span * Math.tanh((ax - knee) / span);
      curve[i] = x < 0 ? -sat : sat;
    }
  }
  return curve;
}

let cachedMasterCeilingCurve = null;
const cachedAirExciterCurves = new Map();

/**
 * Asymmetric studio triode + tape harmonic curve for high-frequency cymbal / air excitation.
 * Generates smooth 2nd & 3rd order harmonics from >= 5.8 kHz bronze transients (followed by
 * a 6.5 kHz post-HPF to eliminate DC offset and difference tones).
 */
function makeAirExciterCurve(drive = 2.6) {
  const safeDrive = DE.clamp(1.0, 6.0, Number(drive) || 2.6);
  const key = safeDrive.toFixed(2);
  if (cachedAirExciterCurves.has(key)) return cachedAirExciterCurves.get(key);

  const n = 4096;
  const curve = new Float32Array(n);
  const norm = Math.tanh(safeDrive) || 1;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    const odd = Math.tanh(safeDrive * x) / norm;
    const even = x * Math.abs(x) * 0.24 + (x * x - 0.5) * 0.16;
    curve[i] = DE.clamp(-0.99, 0.99, 0.80 * odd + 0.20 * even);
  }
  cachedAirExciterCurves.set(key, curve);
  return curve;
}

function createMasterDrumBus(ctx, destinationNode = ctx.destination) {
  const busTrim = ctx.createGain();
  busTrim.gain.value = DE.dbToGain(-1.5);

  // SSL-style 2-bus drum glue compressor (22ms attack lets stick & beater transients snap cleanly)
  const busGlue = ctx.createDynamicsCompressor();
  busGlue.threshold.value = -7.0;
  busGlue.knee.value = 6.0;
  busGlue.ratio.value = 2.6;
  busGlue.attack.value = 0.022;
  busGlue.release.value = 0.070;

  const glueMakeup = ctx.createGain();
  glueMakeup.gain.value = DE.dbToGain(1.2);

  // Live headphone / backing monitor boost (applied ONLY to real-time AudioContext, never offline exports)
  const isLiveCtx = typeof OfflineAudioContext === 'undefined' || !(ctx instanceof OfflineAudioContext);
  const monitorBoost = ctx.createGain();
  monitorBoost.gain.value = isLiveCtx ? DE.dbToGain(liveHeadphoneBoostDb) : 1.0;
  if (isLiveCtx) {
    activeLiveMasterBoostGains.add(monitorBoost);
    if (activeLiveMasterBoostGains.size > 12) {
      const oldest = activeLiveMasterBoostGains.values().next().value;
      activeLiveMasterBoostGains.delete(oldest);
    }
  }

  // True-peak zero-overshoot studio ceiling (-0.31 dBFS; 100% linear below -2.1 dBFS)
  const ceiling = ctx.createWaveShaper();
  if (!cachedMasterCeilingCurve) cachedMasterCeilingCurve = makeMasterCeilingCurve();
  ceiling.curve = cachedMasterCeilingCurve;

  busTrim.connect(busGlue);
  busGlue.connect(glueMakeup);
  glueMakeup.connect(monitorBoost);
  monitorBoost.connect(ceiling);
  ceiling.connect(destinationNode);
  return busTrim;
}

function buildTrackWebAudioChain(ctx, track, masterDestination = ctx.destination) {
  const inputGain = ctx.createGain();
  const trackGainLin = DE.dbToGain(Number(track.gainDb) || 0) * (track.fx?.phaseInvert ? -1 : 1);
  inputGain.gain.value = trackGainLin;
  let tail = inputGain;

  let hpfNode = null;
  let hpf2Node = null;
  let lowNode = null;
  let midNode = null;
  let punchNode = null;
  let presenceNode = null;
  let highNode = null;
  let lpfNode = null;
  let airShelfNode = null;
  let compNode = null;
  let excWetNode = null;
  let revWetNode = null;

  const eq = track.fx?.eq || {};
  if (eq.enabled !== false) {
    const hpfFreq = Number(eq.hpfHz) || 40;
    const steep24dB = Number(eq.hpfSlope) === 24;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hpfFreq;
    hpf.Q.value = 0.7071;
    tail.connect(hpf);
    tail = hpf;
    hpfNode = hpf;

    // Cascade 2nd Butterworth high-pass stage (24 dB/oct) for close cymbal/hi-hat rumble & sub-boom control
    if (steep24dB) {
      const hpf2 = ctx.createBiquadFilter();
      hpf2.type = 'highpass';
      hpf2.frequency.value = hpfFreq;
      hpf2.Q.value = 0.7071;
      tail.connect(hpf2);
      tail = hpf2;
      hpf2Node = hpf2;
    }

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = Number(eq.lowFreqHz) || 80;
    low.gain.value = Number(eq.lowGainDb) || 0;
    lowNode = low;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = Number(eq.midFreqHz) || 500;
    mid.Q.value = Number(eq.midQ) || 1.4;
    mid.gain.value = Number(eq.midGainDb) || 0;
    midNode = mid;

    tail.connect(low);
    low.connect(mid);
    tail = mid;

    // Optional lower-mid chest knock / note-body punch band (e.g. 950–1,150 Hz metal kick knock)
    if (Number.isFinite(Number(eq.punchFreqHz))) {
      const punch = ctx.createBiquadFilter();
      punch.type = 'peaking';
      punch.frequency.value = Number(eq.punchFreqHz);
      punch.Q.value = Number(eq.punchQ) || 0.85;
      punch.gain.value = Number(eq.punchGainDb) || 0;
      tail.connect(punch);
      tail = punch;
      punchNode = punch;
    }

    // Live-sweepable upper-mid beater / stick attack presence band (e.g. 1.9–4.6 kHz note definition)
    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = Number(eq.presenceFreqHz) || 2000;
    presence.Q.value = Number(eq.presenceQ) || 1.1;
    presence.gain.value = Number(eq.presenceGainDb) || 0;
    tail.connect(presence);
    tail = presence;
    presenceNode = presence;

    // Optional de-harsh / surgical notch stage (e.g. 2.95 kHz cymbal stick bite control)
    if (Number.isFinite(Number(eq.harshFreqHz)) && Math.abs(Number(eq.harshGainDb) || 0) >= 0.1) {
      const harsh = ctx.createBiquadFilter();
      harsh.type = 'peaking';
      harsh.frequency.value = Number(eq.harshFreqHz);
      harsh.Q.value = Number(eq.harshQ) || 1.8;
      harsh.gain.value = Number(eq.harshGainDb);
      tail.connect(harsh);
      tail = harsh;
    }

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = Number(eq.highFreqHz) || 5000;
    high.gain.value = Number(eq.highGainDb) || 0;
    highNode = high;

    tail.connect(high);
    tail = high;

    // Optional Butterworth high-cut / fizz roll-off stage (e.g. 4.6 kHz kick top-end bleed control)
    if (Number(eq.lpfHz) > 0) {
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = DE.clamp(1200, 20000, Number(eq.lpfHz));
      lpf.Q.value = 0.7071;
      tail.connect(lpf);
      tail = lpf;
      lpfNode = lpf;
    }

    // Optional Maag-style Ultra-Air Band (12.5–16 kHz studio cymbal glass & top-end sheen)
    if (Number.isFinite(Number(eq.airFreqHz)) && Math.abs(Number(eq.airGainDb) || 0) >= 0.1) {
      const airShelf = ctx.createBiquadFilter();
      airShelf.type = 'highshelf';
      airShelf.frequency.value = Number(eq.airFreqHz);
      airShelf.gain.value = Number(eq.airGainDb);
      tail.connect(airShelf);
      tail = airShelf;
      airShelfNode = airShelf;
    }
  }

  const compCfg = track.fx?.compressor || {};
  if (compCfg.enabled !== false) {
    const preCompNode = tail;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = Math.max(-60, Math.min(0, Number(compCfg.thresholdDb) || -18));
    comp.knee.value = Math.max(0, Math.min(30, Number(compCfg.kneeDb ?? 5)));
    comp.ratio.value = Math.max(1, Math.min(20, Number(compCfg.ratio) || 3.5));
    comp.attack.value = Math.max(0.001, (Number(compCfg.attackMs) || 10) / 1000);
    comp.release.value = Math.max(0.02, (Number(compCfg.releaseMs) || 110) / 1000);
    preCompNode.connect(comp);
    compNode = comp;
    let compOut = comp;

    const makeupDb = Number(compCfg.makeupDb) || 0;
    if (Math.abs(makeupDb) >= 0.05) {
      const makeupGain = ctx.createGain();
      makeupGain.gain.value = DE.dbToGain(makeupDb);
      comp.connect(makeupGain);
      compOut = makeupGain;
    }

    // Optional New-York style parallel compression blend (preserves 100% crisp stick attack + fat sustain)
    const parallelMix = DE.clamp(0, 1, Number(compCfg.parallelMix ?? 1));
    if (parallelMix < 0.99) {
      const sumNode = ctx.createGain();
      const wetCompGain = ctx.createGain();
      const dryTransGain = ctx.createGain();
      wetCompGain.gain.value = parallelMix;
      dryTransGain.gain.value = 1 - parallelMix;
      compOut.connect(wetCompGain);
      wetCompGain.connect(sumNode);
      preCompNode.connect(dryTransGain);
      dryTransGain.connect(sumNode);
      tail = sumNode;
    } else {
      tail = compOut;
    }
  }

  if (track.fx?.drive?.enabled && Number(track.fx.drive.amount) > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSoftClipCurve(track.fx.drive.amount);
    tail.connect(shaper);
    tail = shaper;
  }

  // Parallel 4x-Oversampled High-Frequency Harmonic Air Exciter (studio cymbal & overhead sizzle)
  const excCfg = track.fx?.airExciter || {};
  const excMix = DE.clamp(0, 1.0, Number(excCfg.mix) || 0);
  if (excCfg.enabled && excMix > 0.005) {
    const preExcNode = tail;
    const excFreq = DE.clamp(3500, 11000, Number(excCfg.freqHz) || 5800);

    const excHpf1 = ctx.createBiquadFilter();
    excHpf1.type = 'highpass';
    excHpf1.frequency.value = excFreq;
    excHpf1.Q.value = 0.7071;

    const excHpf2 = ctx.createBiquadFilter();
    excHpf2.type = 'highpass';
    excHpf2.frequency.value = excFreq;
    excHpf2.Q.value = 0.7071;

    const excPreDrive = ctx.createGain();
    excPreDrive.gain.value = 1.85;

    const excShaper = ctx.createWaveShaper();
    excShaper.curve = makeAirExciterCurve(Number(excCfg.drive) || 2.7);
    excShaper.oversample = '4x';

    // Strip DC / sub-difference products & lift >= 12.5 kHz studio air shimmer
    const excPostHpf = ctx.createBiquadFilter();
    excPostHpf.type = 'highpass';
    excPostHpf.frequency.value = Math.max(6200, excFreq);
    excPostHpf.Q.value = 0.7071;

    const excAirLift = ctx.createBiquadFilter();
    excAirLift.type = 'highshelf';
    excAirLift.frequency.value = 12500;
    excAirLift.gain.value = 4.5;

    const excWet = ctx.createGain();
    excWet.gain.value = excMix * 1.15;
    excWetNode = excWet;

    const excSum = ctx.createGain();
    preExcNode.connect(excSum);
    preExcNode.connect(excHpf1);
    excHpf1.connect(excHpf2);
    excHpf2.connect(excPreDrive);
    excPreDrive.connect(excShaper);
    excShaper.connect(excPostHpf);
    excPostHpf.connect(excAirLift);
    excAirLift.connect(excWet);
    excWet.connect(excSum);
    tail = excSum;
  }

  const dryBusGain = ctx.createGain();
  const srActive = Boolean(track.soundReplacement?.enabled);
  const anyClipHasTriggers = srActive && (track.clips || []).some(
    c => !c.muted && Array.isArray(c.transients) && c.transients.length > 0
  );
  const blend = srActive ? Math.max(0, Math.min(1, Number(track.soundReplacement?.blend ?? 0.75))) : 0;
  dryBusGain.gain.value = anyClipHasTriggers ? (1 - blend * 0.85) : 1.0;
  tail.connect(dryBusGain);

  const trackMixBus = ctx.createGain();
  trackMixBus.gain.value = Math.max(0, Math.min(1.5, Number(track.volume ?? 1.0)));

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, Number(track.pan) || 0));

  dryBusGain.connect(trackMixBus);
  trackMixBus.connect(panner);
  panner.connect(masterDestination);

  // Zero-latency parallel Stereo Plate / Studio Chamber Reverb send (Abbey Road 220Hz–7.4kHz filtered)
  const revCfg = track.fx?.reverb || {};
  const revMix = DE.clamp(0, 0.85, Number(revCfg.mix) || 0);
  if (revCfg.enabled && revMix > 0.005) {
    const preDelaySec = DE.clamp(0, 0.12, (Number(revCfg.preDelayMs ?? 20)) / 1000);
    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = preDelaySec;

    const revHpf = ctx.createBiquadFilter();
    revHpf.type = 'highpass';
    revHpf.frequency.value = DE.clamp(80, 900, Number(revCfg.lowCutHz) || 220);
    revHpf.Q.value = 0.7071;

    const revLpf = ctx.createBiquadFilter();
    revLpf.type = 'lowpass';
    revLpf.frequency.value = DE.clamp(1800, 16000, Number(revCfg.dampHz) || 7400);
    revLpf.Q.value = 0.7071;

    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = getOrCreateStudioReverbImpulse(ctx, revCfg);

    const revWet = ctx.createGain();
    revWet.gain.value = revMix;
    revWetNode = revWet;

    trackMixBus.connect(preDelay);
    preDelay.connect(revHpf);
    revHpf.connect(revLpf);
    revLpf.connect(convolver);
    convolver.connect(revWet);
    revWet.connect(masterDestination);
  }

  const liveHandle = {
    ctx,
    inputGain,
    hpfNode,
    hpf2Node,
    lowNode,
    midNode,
    punchNode,
    presenceNode,
    highNode,
    lpfNode,
    airShelfNode,
    compNode,
    excWetNode,
    hasExciterNode: Boolean(excWetNode),
    dryBusGain,
    trackMixBus,
    panner,
    revWetNode,
    hasReverbNode: Boolean(revWetNode),
  };

  return { inputGain, trackMixBus, srActive, blend, liveHandle };
}

function applyLiveTrackParamsInPlace(targetTrackIds = null) {
  if (!currentProject) return;
  const tracks = currentProject.tracks || [];
  let needsStructuralSwap = false;

  for (const track of tracks) {
    if (targetTrackIds && !targetTrackIds.has(track.id)) continue;
    const handles = [
      activePlaybackPass?.trackHandles?.get(track.id),
      liveOverdubTrackHandles?.get(track.id),
    ].filter(Boolean);
    if (!handles.length) continue;

    const gainLin = DE.dbToGain(Number(track.gainDb) || 0) * (track.fx?.phaseInvert ? -1 : 1);
    const vol = Math.max(0, Math.min(1.5, Number(track.volume ?? 1.0)));
    const pan = Math.max(-1, Math.min(1, Number(track.pan) || 0));
    const eq = track.fx?.eq || {};
    const comp = track.fx?.compressor || {};
    const exc = track.fx?.airExciter || {};
    const wantExc = Boolean(exc.enabled) && (Number(exc.mix) || 0) > 0.005;
    const rev = track.fx?.reverb || {};
    const wantRev = Boolean(rev.enabled) && (Number(rev.mix) || 0) > 0.005;

    for (const h of handles) {
      const tNow = h.ctx.currentTime;
      h.inputGain.gain.setTargetAtTime(gainLin, tNow, 0.008);
      h.trackMixBus.gain.setTargetAtTime(vol, tNow, 0.008);
      h.panner.pan.setTargetAtTime(pan, tNow, 0.008);

      if (h.hpfNode) h.hpfNode.frequency.setTargetAtTime(Number(eq.hpfHz) || 40, tNow, 0.010);
      if (h.hpf2Node) h.hpf2Node.frequency.setTargetAtTime(Number(eq.hpfHz) || 40, tNow, 0.010);
      if (h.lowNode) h.lowNode.gain.setTargetAtTime(Number(eq.lowGainDb) || 0, tNow, 0.010);
      if (h.midNode) h.midNode.gain.setTargetAtTime(Number(eq.midGainDb) || 0, tNow, 0.010);
      if (h.punchNode) h.punchNode.gain.setTargetAtTime(Number(eq.punchGainDb) || 0, tNow, 0.010);
      if (h.presenceNode) {
        h.presenceNode.frequency.setTargetAtTime(Number(eq.presenceFreqHz) || 2000, tNow, 0.010);
        h.presenceNode.gain.setTargetAtTime(Number(eq.presenceGainDb) || 0, tNow, 0.010);
      }
      if (h.highNode) h.highNode.gain.setTargetAtTime(Number(eq.highGainDb) || 0, tNow, 0.010);
      if (h.lpfNode && Number(eq.lpfHz) > 0) {
        h.lpfNode.frequency.setTargetAtTime(DE.clamp(1200, 20000, Number(eq.lpfHz)), tNow, 0.010);
      }
      if (h.airShelfNode) h.airShelfNode.gain.setTargetAtTime(Number(eq.airGainDb) || 0, tNow, 0.010);
      if (h.compNode) h.compNode.ratio.setTargetAtTime(Math.max(1, Math.min(20, Number(comp.ratio) || 3.5)), tNow, 0.012);

      if (wantExc !== h.hasExciterNode) {
        needsStructuralSwap = true;
      } else if (h.excWetNode) {
        h.excWetNode.gain.setTargetAtTime(DE.clamp(0, 1.0, Number(exc.mix) || 0) * 1.15, tNow, 0.010);
      }

      if (wantRev !== h.hasReverbNode) {
        needsStructuralSwap = true;
      } else if (h.revWetNode) {
        h.revWetNode.gain.setTargetAtTime(DE.clamp(0, 0.85, Number(rev.mix) || 0), tNow, 0.010);
      }
    }
  }

  if (needsStructuralSwap && (isPlaying || isRecording)) {
    seamlessRefreshLiveAudio();
  }
}

function destroyPlaybackPassImmediate(pass) {
  if (!pass) return;
  for (const node of (pass.nodes || [])) {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  }
  try { pass.passGain?.disconnect?.(); } catch {}
}

function buildAndSchedulePlaybackPass(ctx, playableTracks, startFrom, startWallTime, maxDuration, { fadeInDurSec = 0 } = {}) {
  const passGain = ctx.createGain();
  if (fadeInDurSec > 0.001) {
    passGain.gain.setValueAtTime(0.0001, startWallTime);
    passGain.gain.linearRampToValueAtTime(1.0, startWallTime + fadeInDurSec);
  } else {
    passGain.gain.setValueAtTime(1.0, startWallTime);
  }
  passGain.connect(ctx.destination);

  const nodes = [];
  const trackHandles = new Map();
  const masterBus = createMasterDrumBus(ctx, passGain);
  nodes.push(masterBus);

  for (const track of playableTracks) {
    const { inputGain, trackMixBus, srActive, blend, liveHandle } = buildTrackWebAudioChain(ctx, track, masterBus);
    nodes.push(inputGain, trackMixBus);
    trackHandles.set(track.id, liveHandle);

    for (const clip of (track.clips || [])) {
      if (clip.muted) continue;
      const clipStart = Number(clip.startSec) || 0;
      const clipOff = Math.max(0, Number(clip.offsetSec) || 0);
      const buf = decodedBufferCache.get(clip.wavFile);
      const clipDur = Math.max(0.04, Number(clip.durationSec) || (buf ? Math.max(0.04, buf.duration - clipOff) : 0));
      const clipEnd = clipStart + clipDur;

      if (buf && clipEnd > startFrom && clipOff < buf.duration) {
        const src = ctx.createBufferSource();
        src.buffer = buf;

        const clipGainNode = ctx.createGain();
        const clipGainLin = DE.dbToGain(Number(clip.gainDb) || 0);
        const fadeIn = Math.max(0, Number(clip.fadeInSec) || 0);
        const fadeOut = Math.max(0, Number(clip.fadeOutSec) || 0);

        if (clipStart >= startFrom) {
          const t0 = startWallTime + (clipStart - startFrom);
          const playDur = Math.min(clipDur, Math.max(0.01, buf.duration - clipOff));
          const tEnd = t0 + playDur;
          if (fadeIn > 0.002) {
            clipGainNode.gain.setValueAtTime(0.0001, t0);
            clipGainNode.gain.linearRampToValueAtTime(clipGainLin, t0 + Math.min(fadeIn, playDur));
          } else {
            clipGainNode.gain.setValueAtTime(clipGainLin, t0);
          }
          if (fadeOut > 0.002 && playDur > fadeOut) {
            clipGainNode.gain.setValueAtTime(clipGainLin, Math.max(t0 + Math.min(fadeIn, playDur), tEnd - fadeOut));
            clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
          }
          src.connect(clipGainNode).connect(inputGain);
          src.start(t0, clipOff, playDur);
        } else {
          const intoClip = startFrom - clipStart;
          const srcOffset = clipOff + intoClip;
          const playDur = Math.min(clipEnd - startFrom, Math.max(0.01, buf.duration - srcOffset));
          if (playDur > 0.01 && srcOffset < buf.duration) {
            const tEnd = startWallTime + playDur;
            clipGainNode.gain.setValueAtTime(clipGainLin, startWallTime);
            if (fadeOut > 0.002) {
              const fadeStartWall = Math.max(startWallTime, tEnd - fadeOut);
              clipGainNode.gain.setValueAtTime(clipGainLin, fadeStartWall);
              clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
            }
            src.connect(clipGainNode).connect(inputGain);
            src.start(startWallTime, srcOffset, playDur);
          }
        }
        nodes.push(src);
      }

      if (srActive && Array.isArray(clip.transients)) {
        const clipVelScale = clip.autoGainStaged ? 1.0 : DE.clamp(0.15, 1.4, DE.dbToGain((Number(clip.gainDb) || 0) * 0.25));
        for (const hit of clip.transients) {
          const absHitSec = clipStart + (Number(hit.timeSec) || 0);
          if (absHitSec < startFrom || absHitSec > clipEnd + 0.005) continue;
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          const srBuf = sp ? decodedBufferCache.get(sp) : null;
          if (!srBuf) continue;

          const hitSrc = ctx.createBufferSource();
          hitSrc.buffer = srBuf;
          const hitGain = ctx.createGain();
          hitGain.gain.value = blend * Math.max(0.25, Math.min(1.3, (Number(hit.velocity) || 0.8) * clipVelScale));
          hitSrc.connect(hitGain).connect(trackMixBus);
          hitSrc.start(startWallTime + (absHitSec - startFrom));
          nodes.push(hitSrc);
        }
      }
    }
  }

  if (currentProject?.metronome) {
    const bpm = Number(currentProject?.bpm) || 120;
    const tsParts = String(currentProject?.timeSignature || '4/4').split('/');
    const beatsPerBar = Math.max(1, Math.round(Number(tsParts[0]) || 4));
    const secPerBeat = 60 / bpm;
    const firstBeat = Math.ceil(startFrom / secPerBeat);
    const totalBeats = Math.min(firstBeat + 1200, Math.floor(maxDuration / secPerBeat));
    for (let b = firstBeat; b <= totalBeats; b++) {
      const beatSec = b * secPerBeat;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = (b % beatsPerBar === 0) ? 1180 : 840;
      const t0 = startWallTime + (beatSec - startFrom);
      g.gain.setValueAtTime(0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      osc.connect(g).connect(passGain);
      osc.start(t0);
      osc.stop(t0 + 0.05);
      nodes.push(osc);
    }
  }

  return { passGain, nodes, trackHandles };
}

/**
 * Seamlessly hot-swaps the running WebAudio graph in 6ms with an 8ms de-clicked micro-crossfade
 * at the exact sub-sample playhead position so Solo, Mute, Volume, EQ, Compression, Reverb,
 * Plugin Inserts, Sound Replacement, Metronome, and Clip edits take effect instantaneously
 * without interrupting playback or overdub monitoring.
 */
async function seamlessRefreshLiveAudio() {
  if (!currentProject) return;

  if (isRecording && liveRecSession) {
    const ctx = liveRecSession.overdubMonitor?.ctx || studioAudioCtx;
    if (!ctx || ctx.state === 'closed') return;
    const overdubEntries = await prepareOverdubBackingEntries(playheadSec);
    if (!isRecording || !liveRecSession) return;
    const nowElapsed = getLiveRecordingElapsedSec();
    const outLatSec = ((Number(ctx.baseLatency) || 0) + (Number(ctx.outputLatency) || 0)) || 0.042;
    const resumeAtSec = liveRecSession.startSec + nowElapsed + outLatSec + 0.015;
    stopOverdubMonitorPlayback();
    const nextMon = startOverdubMonitorPlayback(ctx, resumeAtSec, overdubEntries, { preserveSyncClock: true });
    if (liveRecSession.overdubMonitor) {
      liveRecSession.overdubMonitor.backingTrackCount = nextMon.backingTrackCount;
    }
    return;
  }

  if (!isPlaying) return;
  const mySeq = ++playbackHotSwapSeq;
  const ctx = await ensureRoutedStudioAudioCtx();
  if (!isPlaying || mySeq !== playbackHotSwapSeq) return;

  const tracks = currentProject?.tracks || [];
  const anySolo = tracks.some(t => t.soloed);
  const playableTracks = tracks.filter(t => anySolo ? t.soloed : !t.muted);

  for (const track of playableTracks) {
    for (const clip of (track.clips || [])) {
      if (clip.muted) continue;
      if (clip.wavFile && !decodedBufferCache.has(clip.wavFile)) {
        try { await loadDecodedAudio(clip.wavFile); } catch {}
      }
      if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
        for (const hit of clip.transients) {
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          if (sp && !decodedBufferCache.has(sp)) {
            try { await loadDecodedAudio(sp); } catch {}
          }
        }
      }
    }
  }
  if (!isPlaying || mySeq !== playbackHotSwapSeq) return;

  const fadeDur = 0.008;
  const tSplice = ctx.currentTime + 0.006;
  const exactResumeSec = playStartOffsetSec + Math.max(0, tSplice - playStartWallSec);
  const baseSpan = getBaseProjectSpanSec();
  const maxDuration = exactResumeSec >= baseSpan - 0.05 ? exactResumeSec + 8 : baseSpan;

  const prevPass = activePlaybackPass;
  const nextPass = buildAndSchedulePlaybackPass(ctx, playableTracks, exactResumeSec, tSplice, maxDuration, {
    fadeInDurSec: fadeDur,
  });

  if (prevPass?.passGain) {
    try {
      prevPass.passGain.gain.cancelScheduledValues(tSplice);
      prevPass.passGain.gain.setValueAtTime(1.0, tSplice);
      prevPass.passGain.gain.linearRampToValueAtTime(0.0001, tSplice + fadeDur);
    } catch {}
    setTimeout(() => destroyPlaybackPassImmediate(prevPass), 28);
  }

  activePlaybackPass = nextPass;
  activeScheduledNodes = nextPass.nodes;
  playStartWallSec = tSplice;
  playStartOffsetSec = exactResumeSec;
  playMaxDurationSec = maxDuration;
}

function isTrackLyrics(track) {
  if (!track) return false;
  if (track.trackKind === 'lyrics' || track.category === 'lyrics') return true;
  return (track.clips || []).some(c => c.mediaKind === 'lyrics' || Boolean(c.lyricsData?.lines?.length));
}

function isTrackVideoCapable(track) {
  if (!track) return false;
  if (track.trackKind === 'video' || track.category === 'video') return true;
  return (track.clips || []).some(c => Boolean(c.videoFile || (c.mediaKind === 'video' && c.sourceFile)));
}

function getVideoCapableTracks() {
  return (currentProject?.tracks || []).filter(t => isTrackVideoCapable(t) || isTrackLyrics(t));
}

const KARAOKE_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiNoteToLabel(midi) {
  const m = Math.max(0, Math.min(127, Math.round(Number(midi) || 60)));
  return `${KARAOKE_NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
}

function findActiveLyricsClipPayloadAtSec(sec, preferredTrackId = '') {
  const tracks = (currentProject?.tracks || []).filter(t => isTrackLyrics(t) && !t.muted);
  if (!tracks.length) return null;

  // Prefer explicitly selected lyrics track if chosen in VIEW TRACK, else bottom-most unmuted lyrics track
  const ordered = preferredTrackId
    ? [...tracks.filter(t => t.id === preferredTrackId), ...tracks.filter(t => t.id !== preferredTrackId)]
    : [...tracks].reverse();

  for (const tr of ordered) {
    const clips = (tr.clips || []).filter(c => !c.muted && Array.isArray(c.lyricsData?.lines) && c.lyricsData.lines.length > 0);
    for (let i = clips.length - 1; i >= 0; i--) {
      const c = clips[i];
      const start = Number(c.startSec) || 0;
      const dur = Math.max(0.1, Number(c.durationSec) || 0);
      if (sec >= start - 2.5 && sec <= start + dur + 0.5) {
        const baseStart = Number(c.lyricsData?.clipBaseStartSec);
        const timelineShiftSec = Number.isFinite(baseStart) ? (start - baseStart) : 0;
        return {
          id: c.id,
          trackId: tr.id,
          trackName: tr.name,
          title: c.songTitle || c.lyricsData?.title || tr.name.replace(/^Lyrics\s*[-—:]\s*/i, ''),
          artist: c.songArtist || c.lyricsData?.artist || '',
          startSec: start,
          durationSec: dur,
          timelineShiftSec,
          lines: c.lyricsData.lines,
        };
      }
    }
  }

  // If playhead is outside a lyrics clip region, still return the first lyrics clip on a Lyrics-only stage so the branded stage stays visible!
  const fallbackTr = ordered[0];
  const fallbackClip = (fallbackTr?.clips || []).find(c => !c.muted && Array.isArray(c.lyricsData?.lines) && c.lyricsData.lines.length > 0);
  if (fallbackClip) {
    const start = Number(fallbackClip.startSec) || 0;
    const baseStart = Number(fallbackClip.lyricsData?.clipBaseStartSec);
    return {
      id: fallbackClip.id,
      trackId: fallbackTr.id,
      trackName: fallbackTr.name,
      title: fallbackClip.songTitle || fallbackClip.lyricsData?.title || fallbackTr.name,
      artist: fallbackClip.songArtist || fallbackClip.lyricsData?.artist || '',
      startSec: start,
      durationSec: Math.max(0.1, Number(fallbackClip.durationSec) || 0),
      timelineShiftSec: Number.isFinite(baseStart) ? (start - baseStart) : 0,
      lines: fallbackClip.lyricsData.lines,
    };
  }
  return null;
}

function renderEmbeddedKaraokeFrame(lyrClip, curSec, hasOtherVideoVisual) {
  const bgEl = document.getElementById('embedded-karaoke-bg');
  const ovEl = document.getElementById('embedded-karaoke-overlay');
  const songEl = document.getElementById('vmon-karaoke-song');
  const dotsEl = document.getElementById('vmon-karaoke-dots');
  const curLineEl = document.getElementById('vmon-karaoke-current');
  const nextLineEl = document.getElementById('vmon-karaoke-next');
  const pitchEl = document.getElementById('vmon-karaoke-pitch');

  if (!lyrClip || !Array.isArray(lyrClip.lines) || !lyrClip.lines.length) {
    bgEl?.classList.add('hidden');
    ovEl?.classList.add('hidden');
    embeddedKaraokeLineSig = '';
    return false;
  }

  if (hasOtherVideoVisual) {
    bgEl?.classList.add('hidden');
    ovEl?.classList.remove('hidden', 'stage-mode');
    ovEl?.classList.add('over-video');
  } else {
    bgEl?.classList.remove('hidden');
    bgEl?.classList.toggle('playing', Boolean(isPlaying));
    ovEl?.classList.remove('hidden', 'over-video');
    ovEl?.classList.add('stage-mode');
  }

  const shift = Number(lyrClip.timelineShiftSec) || 0;
  const lines = lyrClip.lines;
  let activeIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const lStart = (Number(lines[i].startSec) || 0) + shift;
    const lEnd = (Number(lines[i].endSec) || (lStart + 2)) + shift;
    const nextStart = i + 1 < lines.length ? ((Number(lines[i + 1].startSec) || 0) + shift) : Infinity;
    const holdUntil = Math.min(lEnd + 0.65, nextStart - 0.05);
    if (curSec >= lStart - 2.2 && curSec <= Math.max(lEnd, holdUntil)) {
      activeIdx = i;
      if (curSec >= lStart - 0.15) break;
    }
  }
  if (activeIdx === -1) {
    activeIdx = lines.findIndex(l => ((Number(l.startSec) || 0) + shift) > curSec);
    if (activeIdx === -1) activeIdx = lines.length - 1;
  }

  const curLine = lines[activeIdx] || null;
  const nextLine = lines[activeIdx + 1] || null;
  if (songEl) {
    const hdr = lyrClip.artist ? `${lyrClip.title} — ${lyrClip.artist}` : (lyrClip.title || lyrClip.trackName || 'Karaoke');
    if (songEl.textContent !== hdr) songEl.textContent = hdr;
  }

  if (!curLine) {
    if (curLineEl) curLineEl.innerHTML = '';
    if (nextLineEl) nextLineEl.textContent = '';
    dotsEl?.classList.add('hidden');
    pitchEl?.classList.add('hidden');
    return !hasOtherVideoVisual;
  }

  const lineStart = (Number(curLine.startSec) || 0) + shift;
  const preSec = lineStart - curSec;
  if (dotsEl) {
    if (preSec > 0.05 && preSec <= 2.2) {
      dotsEl.classList.remove('hidden');
      const litCount = Math.min(4, Math.max(1, Math.ceil(((2.2 - preSec) / 2.2) * 4)));
      dotsEl.querySelectorAll('.rk-dot').forEach((d, idx) => d.classList.toggle('lit', idx < litCount));
    } else {
      dotsEl.classList.add('hidden');
    }
  }

  const words = Array.isArray(curLine.words) && curLine.words.length
    ? curLine.words
    : [{ text: curLine.text || '', startSec: curLine.startSec, endSec: curLine.endSec, midiNote: 60 }];

  const sig = `${lyrClip.id}:${activeIdx}:${words.length}`;
  if (embeddedKaraokeLineSig !== sig && curLineEl) {
    embeddedKaraokeLineSig = sig;
    curLineEl.innerHTML = words.map((w, wi) => `<span class="rk-word" data-wi="${wi}">${esc(w.text)}</span>`).join(' ');
  }

  let activeMidi = null;
  if (curLineEl) {
    const spans = curLineEl.querySelectorAll('.rk-word');
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      const ws = (Number(w.startSec) || 0) + shift;
      const we = Math.max(ws + 0.05, (Number(w.endSec) || (ws + 0.25)) + shift);
      const sp = spans[wi];
      if (!sp) continue;
      if (curSec >= we) {
        sp.classList.add('sung');
        sp.classList.remove('active');
        sp.style.setProperty('--kw-fill', '100%');
      } else if (curSec >= ws) {
        const pct = Math.max(0, Math.min(100, ((curSec - ws) / (we - ws)) * 100));
        sp.classList.remove('sung');
        sp.classList.add('active');
        sp.style.setProperty('--kw-fill', `${pct.toFixed(1)}%`);
        activeMidi = w.midiNote || 60;
      } else {
        sp.classList.remove('sung', 'active');
        sp.style.setProperty('--kw-fill', '0%');
      }
    }
  }

  if (nextLineEl) {
    const nextTxt = nextLine?.text || '';
    if (nextLineEl.textContent !== nextTxt) nextLineEl.textContent = nextTxt;
  }

  if (pitchEl) {
    if (activeMidi !== null) {
      pitchEl.classList.remove('hidden');
      pitchEl.textContent = `${midiNoteToLabel(activeMidi)} · MIDI ${activeMidi}`;
    } else {
      pitchEl.classList.add('hidden');
    }
  }

  return !hasOtherVideoVisual;
}

function resolveClipVideoFilePath(clip) {
  if (!clip) return '';
  return clip.videoFile || (clip.mediaKind === 'video' ? clip.sourceFile : '') || '';
}

function toLocalMediaUrl(filePath) {
  if (!filePath) return '';
  if (/^(file|https?|blob|data):/i.test(filePath)) return filePath;
  return `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
}

function formatShortFrameTimestamp(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function ensureVideoClipFilmstrip(videoFile) {
  const cleanPath = String(videoFile || '').trim();
  if (!cleanPath) return null;
  const existing = videoFilmstripCache.get(cleanPath);
  if (existing) return existing;

  const entry = {
    status: 'loading',
    img: null,
    tileCount: 0,
    tileWidth: 160,
    tileHeight: 90,
    sourceDurationSec: 0,
  };
  videoFilmstripCache.set(cleanPath, entry);

  if (typeof window.robos?.getVideoFilmstrip !== 'function') {
    entry.status = 'error';
    return entry;
  }

  window.robos.getVideoFilmstrip({ videoFile: cleanPath, maxTiles: 40, tileWidth: 160, tileHeight: 90 })
    .then((res) => {
      if (!res?.ok || !res.spriteFile || !res.tileCount) {
        entry.status = 'error';
        invalidateStaticTimelineCaches();
        drawAllTimelineCanvases();
        return;
      }
      const img = new Image();
      img.onload = () => {
        entry.status = 'ready';
        entry.img = img;
        entry.tileCount = Math.max(1, Number(res.tileCount) || 1);
        entry.tileWidth = Math.max(32, Number(res.tileWidth) || 160);
        entry.tileHeight = Math.max(24, Number(res.tileHeight) || 90);
        entry.sourceDurationSec = Math.max(0.1, Number(res.sourceDurationSec) || 1);
        invalidateStaticTimelineCaches();
        drawAllTimelineCanvases();
      };
      img.onerror = () => {
        entry.status = 'error';
        invalidateStaticTimelineCaches();
        drawAllTimelineCanvases();
      };
      img.src = toLocalMediaUrl(res.spriteFile);
    })
    .catch(() => {
      entry.status = 'error';
    });

  return entry;
}

function drawCinemaSprocketRails(ctx, startX, clipW, bodyTop, bodyH, viewW, isMuted, railTint = 'rgba(192, 132, 252, 0.48)') {
  const railH = 5.5;
  const visL = Math.max(0, startX);
  const visR = Math.min(viewW, startX + clipW);
  if (visR <= visL) return;

  ctx.fillStyle = 'rgba(6, 9, 15, 0.90)';
  ctx.fillRect(visL, bodyTop, visR - visL, railH);
  ctx.fillRect(visL, bodyTop + bodyH - railH, visR - visL, railH);

  ctx.fillStyle = isMuted ? 'rgba(148, 163, 184, 0.25)' : railTint;
  const holeStep = 14;
  const firstHoleIdx = Math.max(0, Math.floor((visL - startX) / holeStep));
  for (let hx = startX + 4 + firstHoleIdx * holeStep; hx < Math.min(viewW, startX + clipW - 5); hx += holeStep) {
    ctx.fillRect(hx, bodyTop + 1.5, 5.5, 2.5);
    ctx.fillRect(hx, bodyTop + bodyH - 4, 5.5, 2.5);
  }
}

function drawVideoFilmstripIntoClip(ctx, {
  track,
  clip,
  startX,
  clipW,
  regionTop,
  regionH,
  viewW,
  isMuted,
}) {
  const bodyTop = regionTop + 17;
  const bodyH = Math.max(24, regionH - 17);
  const thumbTop = bodyTop + 5.5;
  const thumbH = Math.max(16, bodyH - 11);
  const cellW = Math.max(48, Math.round(thumbH * (16 / 9)));
  const isDedicatedVideoTrack = track.trackKind === 'video';

  drawCinemaSprocketRails(ctx, startX, clipW, bodyTop, bodyH, viewW, isMuted);

  const visLeft = Math.max(0, startX);
  const visRight = Math.min(viewW, startX + clipW);
  if (visRight <= visLeft + 0.5) return;

  const vidPath = resolveClipVideoFilePath(clip);
  const film = vidPath ? ensureVideoClipFilmstrip(vidPath) : null;

  if (film?.status === 'ready' && film.img && film.tileCount >= 1) {
    const clipDurSec = Math.max(0.05, Number(clip.durationSec) || 1);
    const clipOffSec = Math.max(0, Number(clip.offsetSec) || 0);
    const srcDurSec = Math.max(
      0.05,
      clipOffSec + clipDurSec,
      Number(film.sourceDurationSec) || Number(clip.sourceDurationSec) || clipDurSec
    );
    const firstSlot = Math.max(0, Math.floor((visLeft - startX) / cellW));
    const lastSlot = Math.max(firstSlot, Math.floor((visRight - startX) / cellW));
    const prevAlpha = ctx.globalAlpha;
    const thumbAlpha = isDedicatedVideoTrack
      ? (isMuted ? 0.38 : 0.96)
      : (isMuted ? 0.20 : 0.38);

    for (let slot = firstSlot; slot <= lastSlot; slot++) {
      const cellX = startX + slot * cellW;
      const availW = Math.min(cellW, (startX + clipW) - cellX);
      if (availW <= 0.5 || cellX > viewW + 1 || cellX + availW < -1) continue;

      const relMidPx = slot * cellW + Math.min(cellW * 0.5, availW * 0.5);
      const sampleSec = clipOffSec + (relMidPx / Math.max(1, clipW)) * clipDurSec;
      const tileIdx = Math.max(
        0,
        Math.min(film.tileCount - 1, Math.floor((sampleSec / srcDurSec) * film.tileCount))
      );
      const sx = tileIdx * film.tileWidth;
      const sw = Math.max(1, film.tileWidth * (availW / cellW));

      ctx.globalAlpha = thumbAlpha;
      ctx.drawImage(
        film.img,
        sx,
        0,
        sw,
        film.tileHeight,
        cellX,
        thumbTop,
        availW,
        thumbH
      );

      // Crisp NLE inter-frame divider line
      if (slot > 0 && cellX >= -1 && cellX <= viewW + 1) {
        ctx.globalAlpha = isMuted ? 0.45 : 0.86;
        ctx.fillStyle = '#070a10';
        ctx.fillRect(Math.round(cellX), thumbTop, 1.2, thumbH);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(Math.round(cellX) + 1.2, thumbTop, 0.8, thumbH);
      }

      // Subtle frame timecode stamp on dedicated video tracks when cells are wide enough
      if (isDedicatedVideoTrack && !isMuted && availW >= 78) {
        const frameTimelineSec = (Number(clip.startSec) || 0) + (slot * cellW / Math.max(1, clipW)) * clipDurSec;
        const stamp = formatShortFrameTimestamp(frameTimelineSec);
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = 'rgba(6, 9, 15, 0.72)';
        ctx.fillRect(cellX + 3, thumbTop + thumbH - 13, 30, 10.5);
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 8.5px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(stamp, cellX + 5.5, thumbTop + thumbH - 4.8);
      }
    }

    if (!isDedicatedVideoTrack) {
      // Keep audio transients crystal-clear on hybrid audio+video tracks
      ctx.globalAlpha = isMuted ? 0.25 : 0.34;
      ctx.fillStyle = '#090d14';
      ctx.fillRect(visLeft, thumbTop, visRight - visLeft, thumbH);
    }
    ctx.globalAlpha = prevAlpha;
    return;
  }

  // Loading / fallback cinema frame cells before FFmpeg sprite finishes (or if file unavailable)
  ctx.fillStyle = isMuted ? 'rgba(30, 41, 59, 0.35)' : 'rgba(20, 16, 34, 0.72)';
  ctx.fillRect(visLeft, thumbTop, visRight - visLeft, thumbH);
  ctx.strokeStyle = isMuted ? 'rgba(148, 163, 184, 0.22)' : 'rgba(192, 132, 252, 0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const firstSlot = Math.max(1, Math.ceil((visLeft - startX) / cellW));
  for (let fx = startX + firstSlot * cellW; fx < Math.min(viewW, startX + clipW - 4); fx += cellW) {
    ctx.moveTo(Math.round(fx) + 0.5, thumbTop);
    ctx.lineTo(Math.round(fx) + 0.5, thumbTop + thumbH);
  }
  ctx.stroke();

  if (film?.status === 'loading' && clipW >= 120) {
    ctx.save();
    ctx.fillStyle = 'rgba(216, 180, 254, 0.78)';
    ctx.font = '600 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('Generating video filmstrip...', Math.max(visLeft + 8, startX + 8), thumbTop + thumbH / 2 + 3);
    ctx.restore();
  }
}

function captureLiveRecordingVideoThumbIfDue(recElapsedSec) {
  if (!liveRecSession || !isRecording) return;
  const nowMs = performance.now();
  if (liveRecSession.lastVideoThumbAtMs && nowMs - liveRecSession.lastVideoThumbAtMs < 1400) return;
  const liveImg = document.getElementById('embedded-video-live-img');
  if (!liveImg || !liveImg.complete || !liveImg.naturalWidth || !liveImg.naturalHeight) return;

  liveRecSession.lastVideoThumbAtMs = nowMs;
  if (!liveRecSession.videoThumbs) liveRecSession.videoThumbs = [];
  if (liveRecSession.videoThumbs.length >= 60) return;

  try {
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = 160;
    thumbCanvas.height = 90;
    const tctx = thumbCanvas.getContext('2d');
    tctx.drawImage(liveImg, 0, 0, 160, 90);
    liveRecSession.videoThumbs.push({
      relSec: Math.max(0, Number(recElapsedSec) || 0),
      canvas: thumbCanvas,
    });
  } catch {
    // Cross-origin MJPEG canvas taint fallback: safe no-op until recording stops and FFmpeg sprite loads
  }
}

function ensureSelectedVideoOutputTrack() {
  const vTracks = getVideoCapableTracks();
  if (!vTracks.length) {
    selectedVideoOutputTrackId = '';
    return null;
  }
  const found = vTracks.find(t => t.id === selectedVideoOutputTrackId);
  if (found) return found;
  const defaultTrack = vTracks.find(t => t.trackKind === 'video' && (t.clips || []).some(c => !c.muted))
    || vTracks.find(t => t.trackKind === 'video')
    || vTracks[0];
  selectedVideoOutputTrackId = defaultTrack.id;
  return defaultTrack;
}

function findActiveVideoClipAtSec(track, sec) {
  if (!track || track.muted) return null;
  const anySolo = (currentProject?.tracks || []).some(t => t.soloed);
  if (anySolo && !track.soloed && track.trackKind !== 'video') return null;
  const clips = (track.clips || []).filter(c => !c.muted && Boolean(resolveClipVideoFilePath(c)));
  // Prefer top/latest overlapping take (REAPER comping order)
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i];
    const start = Number(c.startSec) || 0;
    const dur = Math.max(0.04, Number(c.durationSec) || 0);
    if (sec >= start - 0.005 && sec < start + dur + 0.015) {
      return c;
    }
  }
  return null;
}

function getLiveStreamDirectMjpegUrl(track) {
  const vcfg = track?.videoConfig;
  if (!vcfg || !vcfg.streamUrl) return '';
  if (/^https?:/i.test(vcfg.streamUrl) && !vcfg.username) {
    if ((vcfg.isRobosAndroidCam || vcfg.sourceType === 'robos-ip-camera') && !/[?&](timestamp|osd|clean)=/i.test(vcfg.streamUrl)) {
      return `${vcfg.streamUrl}${vcfg.streamUrl.includes('?') ? '&' : '?'}timestamp=0`;
    }
    return vcfg.streamUrl;
  }
  return '';
}

function stopLiveCamSnapshotPolling() {
  if (videoLiveSnapshotTimer) {
    clearInterval(videoLiveSnapshotTimer);
    videoLiveSnapshotTimer = null;
  }
}

function ensureLiveCamSnapshotPolling(track) {
  const vcfg = track?.videoConfig;
  if (!vcfg || getLiveStreamDirectMjpegUrl(track)) {
    stopLiveCamSnapshotPolling();
    return;
  }
  if (videoLiveSnapshotTimer) return;
  const pullOnce = async () => {
    const activeTrk = ensureSelectedVideoOutputTrack();
    if (!activeTrk?.videoConfig || (!videoLiveCamEnabled && !isRecording) || (!videoDockOpen && !videoPopoutOpen)) {
      stopLiveCamSnapshotPolling();
      return;
    }
    try {
      const res = await window.robos?.captureVideoSnapshot?.({ videoConfig: activeTrk.videoConfig });
      if (res?.ok && res.dataUrl) {
        videoLiveSnapshotDataUrl = res.dataUrl;
        syncVideoOutputMonitor({ forcePush: true });
      }
    } catch {}
  };
  pullOnce();
  videoLiveSnapshotTimer = setInterval(pullOnce, 450);
}

function safeSeekEmbeddedVideo(videoEl, targetSec) {
  if (!videoEl) return;
  const clamped = Math.max(0, Number(targetSec) || 0);
  if (isSeekingEmbeddedVideo) {
    pendingEmbeddedSeekSec = clamped;
    return;
  }
  try {
    if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
      videoEl.currentTime = Math.min(Math.max(0, videoEl.duration - 0.01), clamped);
    } else {
      videoEl.currentTime = clamped;
    }
  } catch {}
}

function syncVideoOutputMonitor({ forcePush = false } = {}) {
  const dockEl = document.getElementById('embedded-video-dock');
  const topBtn = document.getElementById('btn-topbar-video-monitor');
  const vTracks = getVideoCapableTracks();
  const activeTrack = ensureSelectedVideoOutputTrack();

  topBtn?.classList.toggle('active', Boolean(videoDockOpen || videoPopoutOpen));
  if (dockEl) {
    dockEl.classList.toggle('hidden', !videoDockOpen || videoPopoutOpen);
    dockEl.classList.toggle('wide', Boolean(videoDockWide));
  }
  document.getElementById('btn-vmon-wide')?.classList.toggle('active', Boolean(videoDockWide));
  document.getElementById('btn-vmon-live-cam')?.classList.toggle('active', Boolean(videoLiveCamEnabled));

  // Populate embedded track dropdown
  const trackSel = document.getElementById('vmon-track-select');
  if (trackSel) {
    const optsHtml = vTracks.length
      ? vTracks.map(t => `<option value="${esc(t.id)}"${t.id === selectedVideoOutputTrackId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')
      : '<option value="">No Video Tracks in Session</option>';
    if (trackSel.innerHTML !== optsHtml) trackSel.innerHTML = optsHtml;
    if (selectedVideoOutputTrackId && trackSel.value !== selectedVideoOutputTrackId) {
      trackSel.value = selectedVideoOutputTrackId;
    }
  }

  const selectedIsLyricsOnly = Boolean(activeTrack && isTrackLyrics(activeTrack) && !isTrackVideoCapable(activeTrack));
  // If user selected a Lyrics track in VIEW TRACK, or if another video track is selected, resolve video clip (if any) + active karaoke lyrics!
  let videoSourceTrack = (!selectedIsLyricsOnly && activeTrack) ? activeTrack : null;
  if (!videoSourceTrack && !selectedIsLyricsOnly) {
    videoSourceTrack = (currentProject?.tracks || []).find(t => isTrackVideoCapable(t) && !t.muted) || null;
  }

  const activeClipRaw = (!isRecording && videoSourceTrack) ? findActiveVideoClipAtSec(videoSourceTrack, playheadSec) : null;
  const activeClipVideoFile = resolveClipVideoFilePath(activeClipRaw);
  const activeClipPayload = (activeClipRaw && activeClipVideoFile)
    ? {
      id: activeClipRaw.id,
      videoFile: activeClipVideoFile,
      startSec: Number(activeClipRaw.startSec) || 0,
      offsetSec: Number(activeClipRaw.offsetSec) || 0,
      durationSec: Number(activeClipRaw.durationSec) || 0,
    }
    : null;

  const activeLyricsPayload = findActiveLyricsClipPayloadAtSec(
    playheadSec,
    selectedIsLyricsOnly ? activeTrack.id : ''
  );

  const wantLiveFeed = Boolean(
    videoSourceTrack?.videoConfig &&
    !activeClipPayload &&
    (videoLiveCamEnabled || (isRecording && videoSourceTrack.armed))
  );
  const directMjpegUrl = wantLiveFeed ? getLiveStreamDirectMjpegUrl(videoSourceTrack) : '';
  if (wantLiveFeed && !directMjpegUrl && (videoDockOpen || videoPopoutOpen)) {
    ensureLiveCamSnapshotPolling(videoSourceTrack);
  } else {
    stopLiveCamSnapshotPolling();
  }

  // 1. Update Embedded Video Dock (when visible)
  const videoEl = document.getElementById('embedded-video-el');
  const liveImgEl = document.getElementById('embedded-live-img');
  const slateEl = document.getElementById('embedded-video-slate');
  const slateTitleEl = document.getElementById('vmon-slate-title');
  const slateSubEl = document.getElementById('vmon-slate-sub');
  const tcHudEl = document.getElementById('vmon-timecode');
  const modePill = document.getElementById('vmon-mode-pill');

  if (tcHudEl && (videoDockOpen && !videoPopoutOpen)) {
    tcHudEl.textContent = formatTimecode(playheadSec);
  }

  if (videoEl && liveImgEl && slateEl) {
    if (!videoDockOpen || videoPopoutOpen) {
      if (!videoEl.paused) videoEl.pause();
      if (liveImgEl.getAttribute('src')) liveImgEl.removeAttribute('src');
    } else if (activeClipPayload) {
      const srcUrl = toLocalMediaUrl(activeClipPayload.videoFile);
      if (loadedEmbeddedVideoSrc !== srcUrl) {
        loadedEmbeddedVideoSrc = srcUrl;
        videoEl.src = srcUrl;
        videoEl.load();
      }
      liveImgEl.classList.add('hidden');
      if (liveImgEl.getAttribute('src')) liveImgEl.removeAttribute('src');
      slateEl.classList.add('hidden');
      videoEl.classList.remove('hidden');

      const targetVidSec = activeClipPayload.offsetSec + Math.max(0, playheadSec - activeClipPayload.startSec);
      if (isPlaying) {
        if (modePill) { modePill.textContent = activeLyricsPayload ? 'VIDEO + KARAOKE' : 'PLAYING'; modePill.className = 'vmon-mode-pill playing'; }
        if (Math.abs((videoEl.currentTime || 0) - targetVidSec) > 0.085) {
          safeSeekEmbeddedVideo(videoEl, targetVidSec);
        }
        if (videoEl.paused) videoEl.play().catch(() => {});
      } else {
        if (modePill) { modePill.textContent = activeLyricsPayload ? 'SCRUB · KARAOKE' : 'SCRUB'; modePill.className = 'vmon-mode-pill'; }
        if (!videoEl.paused) videoEl.pause();
        if (Math.abs((videoEl.currentTime || 0) - targetVidSec) > 0.02) {
          safeSeekEmbeddedVideo(videoEl, targetVidSec);
        }
      }
      renderEmbeddedKaraokeFrame(activeLyricsPayload, playheadSec, true);
    } else if (wantLiveFeed && (directMjpegUrl || videoLiveSnapshotDataUrl)) {
      if (!videoEl.paused) videoEl.pause();
      videoEl.classList.add('hidden');
      slateEl.classList.add('hidden');
      liveImgEl.classList.remove('hidden');
      const liveSrc = directMjpegUrl || videoLiveSnapshotDataUrl;
      if (liveImgEl.getAttribute('src') !== liveSrc) {
        liveImgEl.setAttribute('src', liveSrc);
      }
      if (modePill) {
        modePill.textContent = isRecording ? 'REC CAM' : 'LIVE CAM';
        modePill.className = 'vmon-mode-pill live';
      }
      renderEmbeddedKaraokeFrame(activeLyricsPayload, playheadSec, true);
    } else {
      if (!videoEl.paused) videoEl.pause();
      videoEl.classList.add('hidden');
      liveImgEl.classList.add('hidden');
      if (liveImgEl.getAttribute('src')) liveImgEl.removeAttribute('src');

      // No other video playing: if a Lyrics Track is active, display RobOS Branded Dark Karaoke Stage!
      const showingKaraokeStage = renderEmbeddedKaraokeFrame(activeLyricsPayload, playheadSec, false);
      if (showingKaraokeStage) {
        slateEl.classList.add('hidden');
        if (modePill) {
          modePill.textContent = isPlaying ? 'KARAOKE LIVE' : 'KARAOKE STAGE';
          modePill.className = 'vmon-mode-pill karaoke';
        }
      } else {
        slateEl.classList.remove('hidden');
        if (modePill) {
          modePill.textContent = vTracks.length ? 'STANDBY' : 'NO VIDEO';
          modePill.className = 'vmon-mode-pill';
        }
        if (slateTitleEl) {
          slateTitleEl.textContent = vTracks.length ? 'No Video or Lyrics Region at Playhead' : 'No Video or Lyrics Tracks in Session';
        }
        if (slateSubEl) {
          slateSubEl.textContent = vTracks.length
            ? (videoSourceTrack?.videoConfig ? 'Move playhead onto a video take or click Live Cam to monitor camera.' : 'Move playhead over a video or lyrics region to preview.')
            : 'Click "Add Video" or right-click any music track -> "Create Lyrics Track".';
        }
      }
    }
  }

  // 2. Sync Standalone Pop-Out Video Output Window (throttled to 4 Hz during steady playback, 0ms on seeks/clip changes!)
  if (videoPopoutOpen && typeof window.robos?.syncVideoOutputWindow === 'function') {
    const nowMs = Date.now();
    const clipKey = `${selectedVideoOutputTrackId}:${activeClipPayload?.id || 'none'}:${activeLyricsPayload?.id || 'nolyr'}:${activeLyricsPayload?.timelineShiftSec || 0}:${isPlaying ? '1' : '0'}:${isRecording ? '1' : '0'}`;
    if (forcePush || clipKey !== lastPopoutClipKey || !isPlaying || (nowMs - lastPopoutSyncAtMs) >= 240) {
      lastPopoutClipKey = clipKey;
      lastPopoutSyncAtMs = nowMs;
      window.robos.syncVideoOutputWindow({
        isPlaying,
        isRecording,
        playheadSec,
        syncWallMs: nowMs,
        selectedVideoTrackId: selectedVideoOutputTrackId,
        videoTracks: vTracks.map(t => ({ id: t.id, name: isTrackLyrics(t) ? `[KARAOKE] ${t.name}` : t.name })),
        activeClip: activeClipPayload,
        activeLyricsClip: activeLyricsPayload,
        livePreviewUrl: directMjpegUrl,
        liveSnapshotDataUrl: wantLiveFeed ? videoLiveSnapshotDataUrl : '',
      });
    }
  }
}

async function toggleVideoOutputMonitor(forceTrackId = '') {
  if (forceTrackId) {
    selectedVideoOutputTrackId = forceTrackId;
    if (!videoDockOpen && !videoPopoutOpen) {
      videoDockOpen = true;
    }
    renderStudio();
    syncVideoOutputMonitor({ forcePush: true });
    return;
  }

  if (videoPopoutOpen) {
    await window.robos?.closeVideoOutputWindow?.();
    videoPopoutOpen = false;
    videoDockOpen = false;
  } else {
    videoDockOpen = !videoDockOpen;
  }
  renderStudio();
  syncVideoOutputMonitor({ forcePush: true });
}

async function popOutVideoOutputToAppWindow() {
  ensureSelectedVideoOutputTrack();
  videoPopoutOpen = true;
  videoDockOpen = false;
  syncVideoOutputMonitor({ forcePush: true });
  const vTracks = getVideoCapableTracks();
  const activeTrack = ensureSelectedVideoOutputTrack();
  const activeClipRaw = (!isRecording && activeTrack) ? findActiveVideoClipAtSec(activeTrack, playheadSec) : null;
  const activeClipVideoFile = resolveClipVideoFilePath(activeClipRaw);
  await window.robos?.openVideoOutputWindow?.({
    isPlaying,
    isRecording,
    playheadSec,
    syncWallMs: Date.now(),
    selectedVideoTrackId: selectedVideoOutputTrackId,
    videoTracks: vTracks.map(t => ({ id: t.id, name: t.name })),
    activeClip: (activeClipRaw && activeClipVideoFile) ? {
      id: activeClipRaw.id,
      videoFile: activeClipVideoFile,
      startSec: Number(activeClipRaw.startSec) || 0,
      offsetSec: Number(activeClipRaw.offsetSec) || 0,
      durationSec: Number(activeClipRaw.durationSec) || 0,
    } : null,
    livePreviewUrl: (videoLiveCamEnabled && activeTrack) ? getLiveStreamDirectMjpegUrl(activeTrack) : '',
    liveSnapshotDataUrl: videoLiveSnapshotDataUrl,
  });
  renderStudio();
}

function getRobosStreamPathForQuality(qualityPreset = 'hd-1080p') {
  return qualityPreset === 'low-360p' ? '/sub' : '/video';
}

function buildSelectedModalVideoConfig() {
  const qualityPreset = document.getElementById('vid-quality-select')?.value || 'hd-1080p';
  const username = String(document.getElementById('vid-auth-user')?.value || '').trim();
  const password = String(document.getElementById('vid-auth-pass')?.value || '');
  const srcSel = document.getElementById('vid-source-select');
  const val = srcSel?.value || '';

  if (activeVideoModalType === 'robos-ip-camera') {
    const found = val && val !== '__manual_robos__'
      ? discoveredVideoSources.find(s => s.id === val)
      : null;
    const rawHost = String(document.getElementById('vid-robos-host-input')?.value || found?.host || '').trim()
      .replace(/^https?:\/\//i, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    const port = Math.max(1, Math.min(65535, Number(document.getElementById('vid-robos-port-input')?.value || found?.port || 8080)));
    const baseUrl = rawHost ? `http://${rawHost}:${port}` : (found?.baseUrl || '');
    const streamPath = getRobosStreamPathForQuality(qualityPreset);
    const streamUrl = baseUrl ? `${baseUrl}${streamPath}` : (found?.streamUrl || '');
    const snapshotUrl = baseUrl ? `${baseUrl}/snapshot.jpg` : (found?.snapshotUrl || '');
    const shortName = activeRobosProbedStatus?.name || found?.shortName || (rawHost ? `RobOS IP Cam (${rawHost})` : 'RobOS IP Camera');

    return {
      ...(found || {}),
      id: found?.id || (rawHost ? `robos-cam:${rawHost}:${port}` : 'robos-cam:manual'),
      sourceType: 'robos-ip-camera',
      protocol: 'mjpeg',
      label: `${shortName} (RobOS IP Camera · ${rawHost ? `${rawHost}:${port}` : 'Wi-Fi HD'})`,
      shortName,
      host: rawHost,
      port,
      baseUrl,
      streamUrl,
      snapshotUrl,
      devicePath: '',
      username: username || found?.username || '',
      password: password || found?.password || '',
      isRobosAndroidCam: true,
      qualityPreset,
    };
  }

  if (val && val !== '__custom__') {
    const found = discoveredVideoSources.find(s => s.id === val);
    if (found) {
      return {
        ...found,
        qualityPreset,
        username: username || found.username || '',
        password: password || found.password || '',
      };
    }
  }

  const raw = String(document.getElementById('vid-custom-url-input')?.value || '').trim();
  const isDev = raw.startsWith('/dev/video');
  const isRobos = /:8080\/(video|sub)\b/i.test(raw);
  return {
    id: `custom:${raw}`,
    sourceType: isDev ? 'v4l2' : (isRobos ? 'robos-ip-camera' : 'ip-camera'),
    protocol: isDev ? 'v4l2' : (/^rtsps?:/i.test(raw) ? 'rtsp' : 'mjpeg'),
    label: raw || 'Custom Camera',
    shortName: isDev ? 'USB Webcam' : (isRobos ? 'RobOS IP Camera' : 'IP Camera'),
    streamUrl: isDev ? '' : raw,
    snapshotUrl: (!isDev && /^https?:/i.test(raw) && /\/(video|sub)\b/i.test(raw))
      ? raw.replace(/\/(video|sub)(\?.*)?$/i, '/snapshot.jpg$2')
      : '',
    devicePath: isDev ? raw : '',
    username,
    password,
    isRobosAndroidCam: isRobos,
    qualityPreset,
  };
}

function renderRobosTelemetryBar(statusObj) {
  const bar = document.getElementById('vid-robos-telemetry-bar');
  const txt = document.getElementById('vid-robos-telemetry-text');
  if (!bar || !txt) return;
  if (!statusObj) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const resStr = (statusObj.width && statusObj.height) ? `${statusObj.width}x${statusObj.height}` : 'HD';
  const battStr = (typeof statusObj.batteryPercent === 'number' && statusObj.batteryPercent >= 0)
    ? ` · Batt ${statusObj.batteryPercent}%${statusObj.charging ? ' (Chg)' : ''}`
    : '';
  const lensStr = statusObj.lensFacing ? ` · ${statusObj.lensFacing} Lens` : '';
  txt.textContent = `${statusObj.live ? 'LIVE' : 'STANDBY'} · ${statusObj.name || 'RobOS IP Cam'}${statusObj.model ? ` (${statusObj.model})` : ''} · ${resStr}${lensStr}${battStr}`;
}

function setVideoModalType(nextType) {
  activeVideoModalType = ['robos-ip-camera', 'v4l2', 'custom'].includes(nextType) ? nextType : 'robos-ip-camera';
  document.querySelectorAll('[data-vid-type]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.vidType === activeVideoModalType);
  });
  populateVideoModalSourcesDropdown();
}

function populateVideoModalSourcesDropdown() {
  const srcSel = document.getElementById('vid-source-select');
  const srcLbl = document.getElementById('vid-source-select-label');
  const robosPanel = document.getElementById('vid-robos-cam-panel');
  const customRow = document.getElementById('vid-custom-url-fields');
  const authRow = document.getElementById('vid-auth-fields');
  if (!srcSel) return;

  const robosCams = discoveredVideoSources.filter(s => s.isRobosAndroidCam || s.sourceType === 'robos-ip-camera');
  const v4l2Cams = discoveredVideoSources.filter(s => s.sourceType === 'v4l2' || Boolean(s.devicePath));
  const otherIpCams = discoveredVideoSources.filter(s => !s.isRobosAndroidCam && s.sourceType !== 'robos-ip-camera' && s.sourceType !== 'v4l2' && !s.devicePath);

  if (activeVideoModalType === 'robos-ip-camera') {
    if (srcLbl) srcLbl.textContent = 'Discovered RobOS IP Cameras (Android Wi-Fi / ONVIF :8080)';
    const opts = robosCams.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`);
    opts.push('<option value="__manual_robos__">Enter RobOS IP Camera Host / IP Address Manually...</option>');
    srcSel.innerHTML = opts.join('');

    robosPanel?.classList.remove('hidden');
    customRow?.classList.add('hidden');
    authRow?.classList.remove('hidden');

    const firstRobos = robosCams.find(s => s.id === srcSel.value) || null;
    const hostInp = document.getElementById('vid-robos-host-input');
    const portInp = document.getElementById('vid-robos-port-input');
    if (firstRobos) {
      if (hostInp) hostInp.value = firstRobos.host || '';
      if (portInp) portInp.value = String(firstRobos.port || 8080);
      activeRobosProbedStatus = firstRobos.robosStatus || null;
      renderRobosTelemetryBar(activeRobosProbedStatus);
      const nameInp = document.getElementById('vid-track-name-input');
      if (nameInp && firstRobos.shortName) nameInp.value = firstRobos.shortName;
    } else {
      renderRobosTelemetryBar(activeRobosProbedStatus);
      const nameInp = document.getElementById('vid-track-name-input');
      if (nameInp && (!nameInp.value || nameInp.value === 'Integrated Camera')) {
        nameInp.value = 'RobOS IP Cam 1';
      }
    }
    return;
  }

  robosPanel?.classList.add('hidden');

  if (activeVideoModalType === 'v4l2') {
    if (srcLbl) srcLbl.textContent = 'Local USB / V4L2 Capture Devices (/dev/video*)';
    srcSel.innerHTML = v4l2Cams.length
      ? v4l2Cams.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')
      : '<option value="__custom__">No /dev/video* webcam detected — enter device path below</option>';
    customRow?.classList.toggle('hidden', srcSel.value !== '__custom__');
    authRow?.classList.add('hidden');
    const firstV4l = v4l2Cams.find(s => s.id === srcSel.value);
    const nameInp = document.getElementById('vid-track-name-input');
    if (nameInp && firstV4l?.shortName) nameInp.value = firstV4l.shortName;
    return;
  }

  if (srcLbl) srcLbl.textContent = 'ONVIF LAN Cameras & Custom RTSP / HTTP Streams';
  const opts = otherIpCams.map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`);
  opts.push('<option value="__custom__">Custom Stream URL (rtsp://, http://, or /dev/video*)</option>');
  srcSel.innerHTML = opts.join('');
  customRow?.classList.toggle('hidden', srcSel.value !== '__custom__');
  authRow?.classList.remove('hidden');
  const firstOther = otherIpCams.find(s => s.id === srcSel.value);
  const nameInp = document.getElementById('vid-track-name-input');
  if (nameInp && firstOther?.shortName) nameInp.value = firstOther.shortName;
}

function populateVideoModalAudioInputsDropdown() {
  const audSel = document.getElementById('vid-audio-input-select');
  if (!audSel) return;
  const ordered = getOrderedInputs();
  audSel.innerHTML = ordered.length
    ? ordered.map(inp => `<option value="${esc(inp.name)}">${esc(inp.description)}</option>`).join('')
    : '<option value="">Default PipeWire Input</option>';
}

async function connectAndVerifyRobosIpCameraInModal() {
  const statusEl = document.getElementById('vid-modal-status');
  const host = String(document.getElementById('vid-robos-host-input')?.value || '').trim();
  const port = Number(document.getElementById('vid-robos-port-input')?.value) || 8080;
  const username = String(document.getElementById('vid-auth-user')?.value || '').trim();
  const password = String(document.getElementById('vid-auth-pass')?.value || '');
  if (!host) {
    if (statusEl) statusEl.textContent = 'Enter your RobOS IP Camera Wi-Fi IP address (e.g. 192.168.1.65) or click Scan Wi-Fi / LAN.';
    return;
  }
  if (statusEl) statusEl.textContent = `Connecting to RobOS IP Camera at ${host}:${port}...`;
  const res = await window.robos?.probeRobosIpCamera?.({ host, port, username, password });
  if (!res?.ok || !res.status) {
    renderRobosTelemetryBar(null);
    if (statusEl) statusEl.textContent = res?.error || `Could not reach RobOS IP Camera at ${host}:${port}`;
    return;
  }
  activeRobosProbedStatus = res.status;
  renderRobosTelemetryBar(res.status);
  if (res.source && !discoveredVideoSources.some(s => s.host === res.source.host && s.port === res.source.port)) {
    discoveredVideoSources = [res.source, ...discoveredVideoSources];
    populateVideoModalSourcesDropdown();
  }
  const nameInp = document.getElementById('vid-track-name-input');
  if (nameInp && res.status.name) nameInp.value = res.status.name;
  await refreshAddVideoModalPreview();
}

async function sendModalRobosCamControl(commandObj) {
  const vcfg = buildSelectedModalVideoConfig();
  if (!vcfg.host && !vcfg.baseUrl && !vcfg.streamUrl) return;
  const statusEl = document.getElementById('vid-modal-status');
  const res = await window.robos?.controlRobosIpCamera?.({ videoConfig: vcfg, command: commandObj });
  if (res?.ok) {
    if (res.status) {
      activeRobosProbedStatus = res.status;
      renderRobosTelemetryBar(res.status);
    }
    setTimeout(() => refreshAddVideoModalPreview().catch(() => {}), 320);
  } else if (statusEl) {
    statusEl.textContent = res?.error || 'Could not send remote camera command.';
  }
}

async function refreshAddVideoModalPreview() {
  const statusEl = document.getElementById('vid-modal-status');
  const imgEl = document.getElementById('vid-modal-preview-img');
  const phEl = document.getElementById('vid-modal-preview-placeholder');
  const vcfg = buildSelectedModalVideoConfig();
  if (!vcfg.streamUrl && !vcfg.devicePath) {
    if (statusEl) statusEl.textContent = 'Enter a RobOS IP Camera IP/Host or select a camera first.';
    return;
  }
  if (statusEl) statusEl.textContent = `Grabbing HD preview frame from ${vcfg.shortName || vcfg.label}...`;
  const res = await window.robos?.captureVideoSnapshot?.({ videoConfig: vcfg });
  if (res?.ok && res.dataUrl && imgEl) {
    imgEl.src = res.dataUrl;
    imgEl.classList.remove('hidden');
    phEl?.classList.add('hidden');
    if (statusEl) statusEl.textContent = `HD preview connected: ${vcfg.label}`;
  } else {
    imgEl?.classList.add('hidden');
    if (phEl) {
      phEl.classList.remove('hidden');
      phEl.textContent = res?.error || 'Could not grab preview frame — verify camera is streaming.';
    }
    if (statusEl) statusEl.textContent = res?.error || 'Camera preview unavailable.';
  }
}

async function openAddVideoModal({ scanLan = true, includeSubnetSweep = false, preferredType = 'robos-ip-camera' } = {}) {
  closeContextMenu();
  closeMenubarDropdown();
  const modal = document.getElementById('add-video-modal');
  if (!modal) return;

  populateVideoModalAudioInputsDropdown();
  document.getElementById('vid-modal-preview-img')?.classList.add('hidden');
  const phEl = document.getElementById('vid-modal-preview-placeholder');
  if (phEl) {
    phEl.classList.remove('hidden');
    phEl.textContent = 'Discovering RobOS IP Cameras & HD video inputs...';
  }
  // Always default to HD Quality (`hd-1080p`) and Optional Audio (`none` = Video Only)
  const qualSel = document.getElementById('vid-quality-select');
  if (qualSel && !includeSubnetSweep) qualSel.value = 'hd-1080p';
  const modeSel = document.getElementById('vid-audio-mode-select');
  if (modeSel && !includeSubnetSweep) modeSel.value = 'none';
  document.getElementById('vid-audio-interface-row')?.classList.add('hidden');
  modal.classList.remove('hidden');

  if (!includeSubnetSweep) {
    activeVideoModalType = preferredType || 'robos-ip-camera';
    document.querySelectorAll('[data-vid-type]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.vidType === activeVideoModalType);
    });
  }

  const statusEl = document.getElementById('vid-modal-status');
  if (statusEl) {
    statusEl.textContent = includeSubnetSweep
      ? 'Scanning Wi-Fi subnet & ONVIF for RobOS IP Cameras...'
      : 'Discovering RobOS IP Cameras & local webcams (HD Quality default)...';
  }
  const res = await window.robos?.discoverVideoSources?.({ scanLan, includeSubnetSweep });
  if (res?.ok && Array.isArray(res.sources)) {
    discoveredVideoSources = res.sources;
  }
  populateVideoModalSourcesDropdown();

  const robosCount = discoveredVideoSources.filter(s => s.isRobosAndroidCam || s.sourceType === 'robos-ip-camera').length;
  if (statusEl) {
    statusEl.textContent = robosCount > 0
      ? `Connected ${robosCount} RobOS IP Camera(s) on Wi-Fi (${discoveredVideoSources.length} total video sources · HD Quality default).`
      : `Found ${discoveredVideoSources.length} video source(s). Enter your phone's IP:8080 above or click Scan Wi-Fi / LAN.`;
  }
  if (phEl && !discoveredVideoSources.length) {
    phEl.textContent = 'Enter RobOS IP Camera IP (e.g. 192.168.1.65) and click Connect / Verify';
  }
  const vcfg = buildSelectedModalVideoConfig();
  if (vcfg.streamUrl || vcfg.devicePath) {
    refreshAddVideoModalPreview().catch(() => {});
  }
}

function closeAddVideoModal() {
  document.getElementById('add-video-modal')?.classList.add('hidden');
}

async function confirmAddVideoTrackFromModal() {
  const qualityPreset = document.getElementById('vid-quality-select')?.value || 'hd-1080p';
  const vcfg = buildSelectedModalVideoConfig();
  if (!vcfg.streamUrl && !vcfg.devicePath) {
    showStatus('Specify a RobOS IP Camera host/URL or V4L2 device path.', true);
    return;
  }
  const name = String(document.getElementById('vid-track-name-input')?.value || vcfg.shortName || 'RobOS IP Cam 1').trim();
  const audioMode = document.getElementById('vid-audio-mode-select')?.value || 'none';
  const audSel = document.getElementById('vid-audio-input-select');
  const inputNodeName = audioMode === 'interface' ? (audSel?.value || '') : '';
  const inputLabel = audioMode === 'interface' ? (audSel?.selectedOptions?.[0]?.textContent || '') : '';

  const prevSnap = currentProject ? DE.cloneDeep(currentProject) : null;
  await syncProjectToMain();
  const res = await window.robos?.addVideoTrack?.({
    name,
    videoConfig: vcfg,
    qualityPreset,
    audioMode,
    inputNodeName,
    inputLabel,
    armed: true,
  });
  if (!res?.ok || !res.project) {
    showStatus(`Failed to add video track: ${res?.error || 'Unknown error'}`, true);
    return;
  }

  if (prevSnap) historyStack.pushSnapshot(prevSnap, `Add Video Track (${name})`);
  currentProject = res.project;
  selectedTrackIds = new Set([res.track.id]);
  anchorTrackId = res.track.id;
  selectedVideoOutputTrackId = res.track.id;
  videoLiveCamEnabled = true;
  if (!videoPopoutOpen) videoDockOpen = true;

  closeAddVideoModal();
  markDirty(true);
  switchView('studio-stage');
  renderStudio();
  syncVideoOutputMonitor({ forcePush: true });
  const qBadge = res.track?.videoConfig?.qualityPreset === 'hd-720p' ? '720p HD' : (res.track?.videoConfig?.qualityPreset === 'hd-1080p' ? '1080p Full HD' : res.track?.videoConfig?.qualityPreset || 'HD');
  showStatus(`Added armed Video Track "${res.track.name}" (${qBadge} · ${audioMode === 'none' ? 'Video Only' : `Optional Audio: ${audioMode}`}) — Live Cam active in Video Output!`);
}

function seekPlayheadTo(targetSec, { updateReturnAnchor = true, ensureVisible = false } = {}) {
  if (isRecording) return;
  const clamped = Math.max(0, Number((Number(targetSec) || 0).toFixed(4)));
  playheadSec = clamped;
  if (updateReturnAnchor) {
    playReturnAnchorSec = clamped;
  }
  if (ensureVisible) {
    if (clamped === 0) timelineOffsetSec = 0;
    else ensurePlayheadInViewport(clamped);
  }
  const tcEl = document.getElementById('transport-timecode');
  if (tcEl) tcEl.textContent = formatTimecode(playheadSec);

  if (isPlaying) {
    const baseSpan = getBaseProjectSpanSec();
    playMaxDurationSec = clamped >= baseSpan - 0.05 ? clamped + 8 : baseSpan;
    if (studioAudioCtx && studioAudioCtx.state !== 'closed') {
      playStartWallSec = studioAudioCtx.currentTime;
      playStartOffsetSec = clamped;
    }
    drawAllTimelineCanvases();
    seamlessRefreshLiveAudio();
  } else {
    drawAllTimelineCanvases();
  }
  syncVideoOutputMonitor({ forcePush: true });
}

function stopPlayback({ returnToStart = true } = {}) {
  const wasPlaying = isPlaying;
  isPlaying = false;
  isStartingPlayback = false;
  playbackLaunchSeq++;
  playbackHotSwapSeq++;
  if (transportRafId) {
    cancelAnimationFrame(transportRafId);
    transportRafId = null;
  }
  if (activePlaybackPass) {
    destroyPlaybackPassImmediate(activePlaybackPass);
    activePlaybackPass = null;
  }
  for (const node of activeScheduledNodes) {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  }
  activeScheduledNodes = [];
  if (wasPlaying && returnToStart) {
    playheadSec = playReturnAnchorSec;
    const tcEl = document.getElementById('transport-timecode');
    if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
  }
  const playBtn = document.getElementById('btn-transport-play');
  if (playBtn) {
    playBtn.disabled = false;
    playBtn.classList.remove('playing', 'starting');
  }
  if (!isRecording) {
    const sub = document.getElementById('transport-substate');
    if (sub) sub.textContent = returnToStart ? 'READY' : 'PAUSED';
  }
  drawAllTimelineCanvases();
  syncVideoOutputMonitor({ forcePush: true });
}

async function startPlayback() {
  if (isRecording || isStartingRecording || isStartingPlayback) return;
  if (isPlaying) {
    stopPlayback();
    return;
  }

  isStartingPlayback = true;
  const myLaunchSeq = ++playbackLaunchSeq;
  const playBtn = document.getElementById('btn-transport-play');
  const sub = document.getElementById('transport-substate');
  if (playBtn) {
    playBtn.disabled = true;
    playBtn.classList.add('starting');
  }
  if (sub) sub.textContent = 'STARTING...';

  try {
    const tracks = currentProject?.tracks || [];
    const anySolo = tracks.some(t => t.soloed);
    const playableTracks = tracks.filter(t => anySolo ? t.soloed : !t.muted);

    const ctx = await ensureRoutedStudioAudioCtx();
    if (myLaunchSeq !== playbackLaunchSeq || isRecording || isStartingRecording) return;

    const projectEndSec = DE.getProjectEndSec(currentProject);
    if (projectEndSec > 0.05 && playheadSec >= projectEndSec - 0.02) {
      playheadSec = 0;
      const tcEl = document.getElementById('transport-timecode');
      if (tcEl) tcEl.textContent = formatTimecode(0);
    }
    const startFrom = playheadSec;
    playMaxDurationSec = getBaseProjectSpanSec();

    for (const track of playableTracks) {
      for (const clip of (track.clips || [])) {
        if (clip.muted) continue;
        if (clip.wavFile) {
          try { await loadDecodedAudio(clip.wavFile); } catch {}
        }
        if (myLaunchSeq !== playbackLaunchSeq || isRecording || isStartingRecording) return;
        if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
          for (const hit of clip.transients) {
            const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
            if (sp) {
              try { await loadDecodedAudio(sp); } catch {}
            }
          }
        }
      }
    }
    if (myLaunchSeq !== playbackLaunchSeq || isRecording || isStartingRecording) return;

    // Guarantee zero leftover playback pass before scheduling
    if (activePlaybackPass) {
      destroyPlaybackPassImmediate(activePlaybackPass);
      activePlaybackPass = null;
    }
    for (const node of activeScheduledNodes) {
      try { node.stop?.(); } catch {}
      try { node.disconnect?.(); } catch {}
    }
    activeScheduledNodes = [];

    const now = ctx.currentTime + 0.025;
    playReturnAnchorSec = startFrom;
    playStartWallSec = now;
    playStartOffsetSec = startFrom;
    isPlaying = true;
    isStartingPlayback = false;

    activePlaybackPass = buildAndSchedulePlaybackPass(ctx, playableTracks, startFrom, now, playMaxDurationSec);
    activeScheduledNodes = activePlaybackPass.nodes;

    if (playBtn) {
      playBtn.disabled = false;
      playBtn.classList.remove('starting');
      playBtn.classList.add('playing');
    }
    if (sub) sub.textContent = 'PLAYING';

    const tcEl = document.getElementById('transport-timecode');
    syncVideoOutputMonitor({ forcePush: true });
    const tick = () => {
      if (!isPlaying) return;
      playheadSec = playStartOffsetSec + Math.max(0, ctx.currentTime - playStartWallSec);
      if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
      if (!middlePanDragState) ensurePlayheadInViewport(playheadSec);
      drawAllTimelineCanvases();
      syncVideoOutputMonitor();
      if (loopPlayback && hasActiveTimeSelection() && playheadSec >= timeSelection.toSec) {
        seekPlayheadTo(timeSelection.fromSec, { updateReturnAnchor: false });
        transportRafId = requestAnimationFrame(tick);
        return;
      }
      if (playheadSec >= playMaxDurationSec) {
        if (loopPlayback) {
          const loopStart = hasActiveTimeSelection() ? timeSelection.fromSec : 0;
          stopPlayback({ returnToStart: false });
          playheadSec = loopStart;
          document.getElementById('transport-timecode').textContent = formatTimecode(loopStart);
          startPlayback();
          return;
        }
        playheadSec = 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(0);
        stopPlayback({ returnToStart: false });
        return;
      }
      transportRafId = requestAnimationFrame(tick);
    };
    tick();
  } finally {
    if (myLaunchSeq === playbackLaunchSeq && isStartingPlayback) {
      isStartingPlayback = false;
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.classList.remove('starting');
      }
      if (!isPlaying && !isRecording && sub) {
        sub.textContent = 'READY';
      }
    }
  }
}

// ─── Multi-Track Hardware Recording ─────────────────────────────────────────

async function playRecordCountInClicks(bpm = 120) {
  const ctx = await ensureRoutedStudioAudioCtx();
  const safeBpm = DE.clamp(40, 280, Number(bpm) || 120);
  const beatSec = 60 / safeBpm;
  const sub = document.getElementById('transport-substate');
  const now = ctx.currentTime + 0.05;

  for (let b = 0; b < 4; b++) {
    const t0 = now + b * beatSec;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = b === 0 ? 1240 : 880;
    g.gain.setValueAtTime(0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.06);
  }

  for (let b = 0; b < 4; b++) {
    if (sub) sub.textContent = `COUNT ${4 - b}...`;
    showStatus(`Count-in (${safeBpm} BPM): ${b + 1} / 4`);
    await new Promise(resolve => setTimeout(resolve, Math.round(beatSec * 1000)));
  }
}

let activeOverdubMonitorNodes = [];

function stopOverdubMonitorPlayback() {
  for (const node of activeOverdubMonitorNodes) {
    try { node.stop?.(); } catch {}
    try { node.disconnect?.(); } catch {}
  }
  activeOverdubMonitorNodes = [];
  liveOverdubTrackHandles.clear();
}

async function prepareOverdubBackingEntries(startFrom) {
  const tracks = currentProject?.tracks || [];
  const candidateTracks = tracks.filter(t => {
    if (t.muted) return false;
    const isBackingTrack = !t.armed || !t.inputNodeName;
    return isBackingTrack || (t.clips || []).some(c => Boolean(c.sourceFile || c.mediaKind));
  });
  const anyBackingSolo = candidateTracks.some(t => t.soloed);
  const entries = [];

  for (const track of candidateTracks) {
    if (anyBackingSolo && !track.soloed) continue;
    const isBackingTrack = !track.armed || !track.inputNodeName;
    const clipsToPlay = (track.clips || []).filter((c) => {
      if (c.muted || !c.wavFile) return false;
      const cStart = Number(c.startSec) || 0;
      const cDur = Math.max(0.04, Number(c.durationSec) || 0);
      if (cStart + cDur <= startFrom + 0.005) return false;
      return isBackingTrack || Boolean(c.sourceFile || c.mediaKind);
    });
    if (!clipsToPlay.length) continue;

    for (const clip of clipsToPlay) {
      try { await loadDecodedAudio(clip.wavFile); } catch {}
      if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
        for (const hit of clip.transients) {
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          if (sp) {
            try { await loadDecodedAudio(sp); } catch {}
          }
        }
      }
    }
    entries.push({ track, clips: clipsToPlay });
  }
  return entries;
}

function startOverdubMonitorPlayback(ctx, startFrom, overdubEntries, { preserveSyncClock = false } = {}) {
  stopOverdubMonitorPlayback();
  const useMetronome = Boolean(currentProject?.metronome);
  if (!overdubEntries.length && !useMetronome) {
    return { active: false, earsStartWallMs: preserveSyncClock ? (liveRecSession?.earsStartWallMs ?? null) : null, backingTrackCount: 0 };
  }

  const schedLeadSec = 0.020;
  const playStartCtxTime = ctx.currentTime + schedLeadSec;
  const masterBus = createMasterDrumBus(ctx);
  activeOverdubMonitorNodes.push(masterBus);

  // Silent clock-anchor oscillator keeps PipeWire output stream running continuously for exact getOutputTimestamp()
  const silentAnchorOsc = ctx.createOscillator();
  const silentAnchorGain = ctx.createGain();
  silentAnchorGain.gain.value = 0;
  silentAnchorOsc.connect(silentAnchorGain).connect(ctx.destination);
  silentAnchorOsc.start(playStartCtxTime);
  activeOverdubMonitorNodes.push(silentAnchorOsc, silentAnchorGain);

  for (const { track, clips } of overdubEntries) {
    const { inputGain, trackMixBus, srActive, blend, liveHandle } = buildTrackWebAudioChain(ctx, track, masterBus);
    activeOverdubMonitorNodes.push(inputGain, trackMixBus);
    if (liveHandle) liveOverdubTrackHandles.set(track.id, liveHandle);

    for (const clip of clips) {
      const clipStart = Number(clip.startSec) || 0;
      const clipOff = Math.max(0, Number(clip.offsetSec) || 0);
      const buf = decodedBufferCache.get(clip.wavFile);
      const clipDur = Math.max(0.04, Number(clip.durationSec) || (buf ? Math.max(0.04, buf.duration - clipOff) : 0));
      const clipEnd = clipStart + clipDur;

      if (buf && clipEnd > startFrom && clipOff < buf.duration) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const clipGainNode = ctx.createGain();
        const clipGainLin = DE.dbToGain(Number(clip.gainDb) || 0);
        const fadeIn = Math.max(0, Number(clip.fadeInSec) || 0);
        const fadeOut = Math.max(0, Number(clip.fadeOutSec) || 0);

        if (clipStart >= startFrom) {
          const t0 = playStartCtxTime + (clipStart - startFrom);
          const playDur = Math.min(clipDur, Math.max(0.01, buf.duration - clipOff));
          const tEnd = t0 + playDur;
          if (fadeIn > 0.002) {
            clipGainNode.gain.setValueAtTime(0.0001, t0);
            clipGainNode.gain.linearRampToValueAtTime(clipGainLin, t0 + Math.min(fadeIn, playDur));
          } else {
            clipGainNode.gain.setValueAtTime(clipGainLin, t0);
          }
          if (fadeOut > 0.002 && playDur > fadeOut) {
            clipGainNode.gain.setValueAtTime(clipGainLin, Math.max(t0 + Math.min(fadeIn, playDur), tEnd - fadeOut));
            clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
          }
          src.connect(clipGainNode).connect(inputGain);
          src.start(t0, clipOff, playDur);
        } else {
          const intoClip = startFrom - clipStart;
          const srcOffset = clipOff + intoClip;
          const playDur = Math.min(clipEnd - startFrom, Math.max(0.01, buf.duration - srcOffset));
          if (playDur > 0.01 && srcOffset < buf.duration) {
            const tEnd = playStartCtxTime + playDur;
            clipGainNode.gain.setValueAtTime(clipGainLin, playStartCtxTime);
            if (fadeOut > 0.002) {
              const fadeStartWall = Math.max(playStartCtxTime, tEnd - fadeOut);
              clipGainNode.gain.setValueAtTime(clipGainLin, fadeStartWall);
              clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
            }
            src.connect(clipGainNode).connect(inputGain);
            src.start(playStartCtxTime, srcOffset, playDur);
          }
        }
        activeOverdubMonitorNodes.push(src);
      }

      if (srActive && Array.isArray(clip.transients)) {
        const clipVelScale = clip.autoGainStaged ? 1.0 : DE.clamp(0.15, 1.4, DE.dbToGain((Number(clip.gainDb) || 0) * 0.25));
        for (const hit of clip.transients) {
          const absHitSec = clipStart + (Number(hit.timeSec) || 0);
          if (absHitSec < startFrom || absHitSec > clipEnd + 0.005) continue;
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          const srBuf = sp ? decodedBufferCache.get(sp) : null;
          if (!srBuf) continue;
          const hitSrc = ctx.createBufferSource();
          hitSrc.buffer = srBuf;
          const hitGain = ctx.createGain();
          hitGain.gain.value = blend * Math.max(0.25, Math.min(1.3, (Number(hit.velocity) || 0.8) * clipVelScale));
          hitSrc.connect(hitGain).connect(trackMixBus);
          hitSrc.start(playStartCtxTime + (absHitSec - startFrom));
          activeOverdubMonitorNodes.push(hitSrc);
        }
      }
    }
  }

  if (useMetronome) {
    const bpm = Number(currentProject?.bpm) || 120;
    const secPerBeat = 60 / bpm;
    const firstBeat = Math.ceil(startFrom / secPerBeat);
    const maxBeats = firstBeat + 600;
    for (let b = firstBeat; b <= maxBeats; b++) {
      const beatSec = b * secPerBeat;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = (b % 4 === 0) ? 1180 : 840;
      const t0 = playStartCtxTime + (beatSec - startFrom);
      g.gain.setValueAtTime(0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.05);
      activeOverdubMonitorNodes.push(osc);
    }
  }

  let earsStartWallMs = preserveSyncClock ? (liveRecSession?.earsStartWallMs ?? null) : null;
  let lockedByHwTs = false;
  if (!preserveSyncClock) {
    const probed = computeReliableEarsStartWallMs(ctx, playStartCtxTime);
    earsStartWallMs = probed.earsStartWallMs;
    lockedByHwTs = probed.lockedByHwTs;
  }

  return {
    active: true,
    ctx,
    playStartCtxTime,
    earsStartWallMs,
    lockedByHwTs,
    backingTrackCount: overdubEntries.length,
  };
}

async function abortCurrentRecording() {
  if (!isRecording) return false;
  const punchInStartSec = liveRecSession ? liveRecSession.startSec : 0;
  stopRecordingRafLoop();
  stopOverdubMonitorPlayback();
  const res = await window.robos.recordCancel();
  isRecording = false;
  liveRecSession = null;
  liveRecLevels = {};
  playheadSec = punchInStartSec;
  const tcEl = document.getElementById('transport-timecode');
  if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
  document.getElementById('btn-transport-record')?.classList.remove('recording');
  document.getElementById('header-rec-dot')?.classList.remove('recording');
  const sub = document.getElementById('transport-substate');
  if (sub) sub.textContent = 'ABORTED';
  drawAllTimelineCanvases();
  showStatus(`Aborted recording and discarded ${res?.deletedFiles ?? 0} incomplete WAV file(s) — cursor returned to ${formatTimecode(punchInStartSec)}.`);
  return true;
}

async function quickRetakeRecording() {
  if (isRecording) {
    const punchInStartSec = liveRecSession ? liveRecSession.startSec : 0;
    await abortCurrentRecording();
    playheadSec = punchInStartSec;
    await toggleRecording();
    showStatus(`Quick Retake: discarded incomplete pass and re-punched recording at ${formatTimecode(punchInStartSec)}.`);
    return;
  }
  // If stopped with newly recorded/selected clips, delete them (undoable) and punch back in at their start
  if (selectedClipIds.size > 0 && currentProject) {
    let minStart = Infinity;
    for (const tr of (currentProject.tracks || [])) {
      for (const c of (tr.clips || [])) {
        if (selectedClipIds.has(c.id)) {
          const s = Number(c.startSec) || 0;
          if (s < minStart) minStart = s;
        }
      }
    }
    await commitEdit('Retake Delete Previous Pass', () => {
      DE.deleteClipsFromProject(currentProject, selectedClipIds);
      selectedClipIds.clear();
    });
    if (Number.isFinite(minStart)) {
      playheadSec = minStart;
      const tcEl = document.getElementById('transport-timecode');
      if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
    }
  }
  await toggleRecording();
}

async function toggleRecording({ keepCursorAtStop = false } = {}) {
  if (isStoppingRecording || isStartingRecording) return;
  if (isPlaying || isStartingPlayback) stopPlayback({ returnToStart: false });

  if (isRecording) {
    const punchInStartSec = liveRecSession ? liveRecSession.startSec : 0;
    const stopEdgeSec = playheadSec;
    const earsStartWallMs = liveRecSession?.earsStartWallMs ?? null;
    const injectTestSignal = Boolean(document.getElementById('chk-test-groove')?.checked);

    // 0ms immediate transport stop on keydown — freeze clock, stop backing audio, disarm REC LED, and snap playhead immediately
    stopRecordingRafLoop();
    stopOverdubMonitorPlayback();
    isRecording = false;
    isStoppingRecording = true;
    if (liveRecSession) liveRecSession.stoppedEndSec = stopEdgeSec;
    playheadSec = keepCursorAtStop ? stopEdgeSec : punchInStartSec;
    const tcEl = document.getElementById('transport-timecode');
    if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
    document.getElementById('btn-transport-record')?.classList.remove('recording');
    document.getElementById('header-rec-dot')?.classList.remove('recording');
    const subEl = document.getElementById('transport-substate');
    if (subEl) subEl.textContent = 'READY';
    for (const trkId of (liveRecSession?.tracks?.keys() || [])) {
      setMeterElementPercent(document.getElementById(`rec-meter-${trkId}`), 0);
    }
    drawAllTimelineCanvases();

    const finalizeStopPromise = (async () => {
      let res = null;
      try {
        res = await window.robos.recordStop({ injectTestSignal, earsStartWallMs });
      } finally {
        isStoppingRecording = false;
        liveRecSession = null;
        liveRecLevels = {};
      }

      if (res?.ok && res.project) {
        if (currentProject) historyStack.pushSnapshot(currentProject, 'Record Multi-Track Take');
        currentProject = res.project;
        const vidRecorded = res.recordedVideoClips || [];
        selectedClipIds = new Set([
          ...(res.recordedClips || []).map(x => x.clip?.id),
          ...vidRecorded.map(x => x.clip?.id),
        ].filter(Boolean));
        if (vidRecorded.length > 0 && vidRecorded[0].trackId) {
          selectedVideoOutputTrackId = vidRecorded[0].trackId;
          videoLiveCamEnabled = false;
          if (!videoPopoutOpen) videoDockOpen = true;
        }
        // Invalidate any stale decoded cache for newly written takes
        for (const item of (res.recordedClips || [])) {
          if (item.clip?.wavFile) decodedBufferCache.delete(item.clip.wavFile);
        }
        markDirty(true);
        renderStudio();
        syncVideoOutputMonitor({ forcePush: true });
        const totalHits = (res.recordedClips || []).reduce((n, x) => n + (x.clip?.transients?.length || 0), 0);
        const vidSuffix = vidRecorded.length ? ` + ${vidRecorded.length} video track(s) (click "Export MP4" in Video Out to save video + audio)` : '';
        showStatus(`Recorded ${res.recordedClips.length} armed mic track(s)${vidSuffix}${totalHits ? ` — ${totalHits} drum transient(s) detected` : ''}.`);
      } else {
        drawAllTimelineCanvases();
        showStatus(`Recording stop error: ${res?.error || 'Unknown error'}`, true);
      }
      return res;
    })();
    activeRecordStopPromise = finalizeStopPromise;
    try {
      await finalizeStopPromise;
    } finally {
      if (activeRecordStopPromise === finalizeStopPromise) {
        activeRecordStopPromise = null;
      }
    }
    return;
  }

  const armed = (currentProject?.tracks || []).filter(t => t.armed);
  if (!armed.length) {
    showStatus('Arm at least one mic track [R] or open Add Mic Wizard before recording.', true);
    return;
  }

  isStartingRecording = true;
  const recBtn = document.getElementById('btn-transport-record');
  const playBtn = document.getElementById('btn-transport-play');
  if (recBtn) recBtn.disabled = true;
  if (playBtn) playBtn.disabled = true;

  try {
    const bpm = Number(document.getElementById('project-bpm-input')?.value) || Number(currentProject?.bpm) || 120;
    const punchTargetSec = playheadSec;

    // Pre-warm Studio Output AudioContext & pre-decode any backing tracks BEFORE spawning capture (0ms punch-in lag)
    const overdubEntries = await prepareOverdubBackingEntries(punchTargetSec);
    let studioCtx = null;
    if (overdubEntries.length > 0 || currentProject?.metronome || countInEnabled) {
      studioCtx = await ensureRoutedStudioAudioCtx();
    }

    if (countInEnabled) {
      await playRecordCountInClicks(bpm);
    }

    const injectTestSignal = Boolean(document.getElementById('chk-test-groove')?.checked);
    const res = await window.robos.recordStart({
      startSec: punchTargetSec,
      injectTestSignal,
      projectMeta: {
        name: document.getElementById('project-name-input')?.value,
        bpm,
      },
    });

    if (!res?.ok) {
      showStatus(res?.error || 'Could not start multi-track recording.', true);
      return;
    }

    const punchStartSec = Number(res.startSec) || 0;
    const overdubMonitor = studioCtx
      ? startOverdubMonitorPlayback(studioCtx, punchStartSec, overdubEntries)
      : { active: false, earsStartWallMs: null, backingTrackCount: 0 };

    const trackStatesMap = new Map();
    for (const tr of (res.tracks || [])) {
      trackStatesMap.set(tr.trackId, {
        trackId: tr.trackId,
        clipId: tr.clipId,
        name: `${tr.trackName || 'Track'} Take`,
        peaks: [],
        currentPeak: 0,
        peakDb: -96,
        maxPeakDb: -96,
        hitTimesSec: [],
        lastHitSec: -1,
        prevSlicePeak: 0,
      });
    }

    liveRecSession = {
      startSec: punchStartSec,
      startedPerfMs: performance.now(),
      firstSampleMicWallMs: Number.isFinite(res.firstSampleMicWallMs) ? res.firstSampleMicWallMs : null,
      earsStartWallMs: overdubMonitor.earsStartWallMs,
      overdubMonitor,
      ipcElapsedSec: 0,
      sliceDurationSec: Number(res.sliceDurationSec) || 0.02,
      tracks: trackStatesMap,
    };
    isRecording = true;
    document.getElementById('btn-transport-record')?.classList.add('recording');
    document.getElementById('header-rec-dot')?.classList.add('recording');
    document.getElementById('transport-substate').textContent = overdubMonitor.backingTrackCount > 0
      ? `REC (${res.armedCount} CH + PLAY)`
      : `REC (${res.armedCount} CH)`;
    drawAllTimelineCanvases();
    syncVideoOutputMonitor({ forcePush: true });
    startRecordingRafLoop();
    showStatus(
      overdubMonitor.backingTrackCount > 0
        ? `Recording ${res.armedCount} armed channel(s) synced to ${overdubMonitor.backingTrackCount} backing track(s) — press Space to stop.`
        : `Recording ${res.armedCount} armed channel(s) live via PipeWire (10ms low-latency waveform stream) — press Space to stop.`
    );
  } finally {
    isStartingRecording = false;
    if (recBtn) recBtn.disabled = false;
    if (playBtn) playBtn.disabled = false;
  }
}

// ─── Studio & Timeline Rendering ────────────────────────────────────────────

function renderStudio() {
  if (!currentProject) return;
  invalidateStaticTimelineCaches();

  const nameInput = document.getElementById('project-name-input');
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = currentProject.name || 'Untitled Session';
  }
  const bpmInput = document.getElementById('project-bpm-input');
  if (bpmInput && document.activeElement !== bpmInput) {
    bpmInput.value = currentProject.bpm || 120;
  }
  document.getElementById('btn-metronome-toggle')?.classList.toggle('active', Boolean(currentProject.metronome));
  markDirty(isDirty);
  pruneSelections();
  updateEditToolbarState();

  const tracks = currentProject.tracks || [];
  const tracksHeaderEl = document.getElementById('tracks-header-count');
  if (tracksHeaderEl) tracksHeaderEl.textContent = String(tracks.length);

  const emptyEl = document.getElementById('studio-empty-state');
  const wsEl = document.getElementById('tracks-workspace');
  if (tracks.length === 0) {
    emptyEl?.classList.remove('hidden');
    wsEl?.classList.add('hidden');
    document.getElementById('track-inspector-drawer')?.classList.add('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  wsEl?.classList.remove('hidden');

  const orderedInputs = getOrderedInputs();
  const listEl = document.getElementById('tracks-list');
  listEl.innerHTML = tracks.map((t, idx) => {
    const isSel = selectedTrackIds.has(t.id);
    const srOn = Boolean(t.soundReplacement?.enabled);
    const srPiece = t.soundReplacement?.pieceId || 'drum';
    const phaseOn = Boolean(t.fx?.phaseInvert);
    const gainDb = Number(t.gainDb) || 0;
    const chNumStr = String(idx + 1).padStart(2, '0');
    const inputOptions = orderedInputs.map(inp =>
      `<option value="${esc(inp.name)}"${inp.name === t.inputNodeName ? ' selected' : ''}>${esc(inp.description)}</option>`
    ).join('');

    const isVideoTrk = isTrackVideoCapable(t);
    const isLyricsTrk = isTrackLyrics(t);
    const isVisualOutTrk = isVideoTrk || isLyricsTrk;
    const isActiveVidOut = isVisualOutTrk && selectedVideoOutputTrackId === t.id && (videoDockOpen || videoPopoutOpen);
    const trackIconKey = isLyricsTrk
      ? 'lyrics'
      : isVideoTrk
        ? 'video'
        : (t.category === 'drums'
          ? 'drum'
          : (/guitar|bass/i.test(`${t.category || ''} ${t.profileId || ''}`) ? 'guitar' : 'mic'));
    const kindPillHtml = isLyricsTrk
      ? '<span class="lyrics-track-pill">LYRICS</span>'
      : (isVideoTrk ? '<span class="video-track-pill">VIDEO</span>' : '');
    const nameHtml = inlineRenamingTrackId === t.id
      ? `<input type="text" class="inline-rename-input" data-inline-rename="${esc(t.id)}" value="${esc(t.name)}" aria-label="Rename Track" />`
      : `<span class="track-name-label" data-name-dbl="${esc(t.id)}" title="${esc(t.name)} — Double-click to rename · Right-click for Track Menu">${esc(t.name)}</span>${kindPillHtml}`;

    const rightActionBtnHtml = isVisualOutTrk
      ? `<button type="button" class="trk-mini-btn strip-btn vid-view-btn ${isActiveVidOut ? 'active' : ''}" data-act="view-video" data-id="${esc(t.id)}" title="Open Karaoke / Video Output Monitor">${DI.svg('eye', 11)}<span>VIEW</span></button>`
      : `<button type="button" class="trk-mini-btn hw-trig ${srOn ? 'sr-on' : ''}" data-act="toggle-sr" data-id="${esc(t.id)}" title="Toggle Open-Source Drum Sound Replacement">${DI.badge('drum-replace', 12)}<span>${srOn ? esc(srPiece) : 'TRIG'}</span></button>`;

    const usesCameraOnlyInput = t.trackKind === 'video' && t.videoConfig?.audioMode !== 'interface';
    const midLineHtml = isLyricsTrk
      ? `
            <div class="track-mid-line">
              <span class="io-micro-tag">MIDI</span>
              <select class="track-input-select" disabled aria-label="MIDI Karaoke Lyrics Source">
                <option>${esc(t.clips?.[0]?.lyricsSource || t.inputLabel || 'SMF Format 1 Karaoke (.KAR)')}</option>
              </select>
            </div>`
      : usesCameraOnlyInput
        ? `
            <div class="track-mid-line">
              <span class="io-micro-tag">CAM</span>
              <select class="track-input-select" disabled aria-label="Video Camera Input">
                <option>${esc(t.inputLabel || t.videoConfig?.label || 'Video Camera')}</option>
              </select>
            </div>`
        : `
            <div class="track-mid-line">
              <span class="io-micro-tag">IN</span>
              <select class="track-input-select" data-act="input-change" data-id="${esc(t.id)}" aria-label="Track Hardware Input">
                ${inputOptions || `<option value="${esc(t.inputNodeName)}">${esc(t.inputLabel || 'Default Input')}</option>`}
              </select>
            </div>`;

    return `
      <div class="track-row ${isSel ? 'selected' : ''}" data-track-id="${esc(t.id)}">
        <div class="track-controls-col" data-track-strip="${esc(t.id)}">
          <div class="track-color-bar" style="background:${esc(t.color || '#00d4ff')}"></div>
          <div class="track-select-stack">
            <span class="track-index-num mono">${chNumStr}</span>
            <input type="checkbox" class="track-sel-chk" data-track-chk="${esc(t.id)}" ${isSel ? 'checked' : ''} title="Select Track for Batch Actions (Shift+Click for range)" aria-label="Select ${esc(t.name)}" />
          </div>
          <div class="track-meta-stack">
            <div class="track-top-line">
              <div class="track-title-group">
                <span class="track-tiny-icon" style="color:${esc(t.color || '#00d4ff')}">${DI.svg(trackIconKey, 13)}</span>
                ${nameHtml}
              </div>
              <div class="track-btn-strip">
                <button type="button" class="trk-mini-btn hw-rec ${t.armed ? 'arm-on' : ''}" data-act="arm" data-id="${esc(t.id)}" title="Record Arm Track (F7 / Shift+R · Ctrl+Click = Selected · Alt+Click = Exclusive)">R</button>
                <button type="button" class="trk-mini-btn hw-mon ${t.monitor ? 'mon-on' : ''}" data-act="mon" data-id="${esc(t.id)}" title="Toggle Input Monitoring (F8 / Alt+I · Ctrl+Click = Selected)">IN</button>
                <button type="button" class="trk-mini-btn hw-mute ${t.muted ? 'mute-on' : ''}" data-act="mute" data-id="${esc(t.id)}" title="Mute Track (F5 / M · Ctrl+Click = Selected · Alt+Click = Exclusive)">M</button>
                <button type="button" class="trk-mini-btn hw-solo ${t.soloed ? 'solo-on' : ''}" data-act="solo" data-id="${esc(t.id)}" title="Solo Track (F6 / Shift+S · Ctrl+Click = Selected · Alt+Click = Exclusive Solo)">S</button>
                <button type="button" class="trk-mini-btn hw-phase ${phaseOn ? 'phase-on' : ''}" data-act="phase" data-id="${esc(t.id)}" title="180° Phase Invert Ø (Alt+P · Drum Top/Bottom &amp; Overhead Polarity)">Ø</button>
                <button type="button" class="trk-mini-btn hw-fx ${selectedTrackId === t.id ? 'fx-on' : ''}" data-act="inspect" data-id="${esc(t.id)}" title="Open Channel Strip EQ / LV2 / Drum Replace Inspector">${DI.svg('faders', 10.5)}<span>FX</span></button>
                ${rightActionBtnHtml}
                <button type="button" class="trk-mini-btn hw-del" data-act="delete" data-id="${esc(t.id)}" title="Remove Track">&times;</button>
              </div>
            </div>
            ${midLineHtml}
            <div class="track-gain-line">
              <span class="fader-lbl">TRIM</span>
              <input type="range" class="track-gain-slider daw-fader" min="-24" max="36" step="0.5" value="${gainDb.toFixed(1)}" data-act="gain" data-id="${esc(t.id)}" title="Pre-FX Input Gain (-24 to +36 dB) · Double-click to reset 0.0 dB · Hold Ctrl to gang selected tracks" />
              <span class="mono gain-db-badge ${Math.abs(gainDb) >= 0.05 ? 'boosted' : ''}" id="gain-badge-${esc(t.id)}" data-act="gain-reset" data-id="${esc(t.id)}" title="Double-click to reset Track Gain to 0.0 dB">${DE.formatDb(gainDb)}</span>
              <span class="fader-lbl" style="margin-left:auto;">FADER</span>
              <input type="range" class="track-vol-slider daw-fader" style="width:68px;" min="0" max="1.4" step="0.02" value="${Number(t.volume ?? 1).toFixed(2)}" data-act="vol" data-id="${esc(t.id)}" title="Post-FX Fader Volume · Double-click to reset to 100%" />
              <span class="mono pan-badge" data-act="pan-reset" data-id="${esc(t.id)}" title="Double-click to center Pan">${formatPan(t.pan)}</span>
            </div>
            <div class="track-bot-line">
              <span class="mono region-count-lbl">${(t.clips?.length || 0)} RGN</span>
              <div class="track-live-meter" title="Live Channel Input Peak Meter (dBFS)">
                <div class="track-live-meter-fill" id="rec-meter-${esc(t.id)}" style="clip-path:inset(0 ${(100 - dbToPercent(liveRecLevels[t.id]?.peakDb ?? -96)).toFixed(1)}% 0 0)"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="track-lane-col" data-lane-track="${esc(t.id)}">
          <canvas class="track-wave-canvas" id="wave-canvas-${esc(t.id)}" height="102"></canvas>
        </div>
      </div>
    `;
  }).join('');

  if (inlineRenamingTrackId) {
    const inp = listEl.querySelector(`[data-inline-rename="${inlineRenamingTrackId}"]`);
    if (inp) {
      inp.focus();
      inp.select();
    }
  }

  bindTrackRowEvents();
  renderInspectorDrawer();
  syncVideoOutputMonitor();
  requestAnimationFrame(drawAllTimelineCanvases);
}

function getTargetTrackIdsForAction(clickedTrackId, ev) {
  if (ev?.altKey) {
    return new Set([clickedTrackId]);
  }
  const inMultiTrackSelection = selectedTrackIds.has(clickedTrackId) && selectedTrackIds.size > 1;
  if (inMultiTrackSelection || ((ev?.ctrlKey || ev?.metaKey) && selectedTrackIds.size > 0)) {
    const combined = new Set(selectedTrackIds);
    combined.add(clickedTrackId);
    return combined;
  }
  return new Set([clickedTrackId]);
}

function bindTrackRowEvents() {
  const listEl = document.getElementById('tracks-list');
  if (!listEl) return;

  // Inline track rename input commit / cancel
  listEl.querySelectorAll('[data-inline-rename]').forEach(inp => {
    const trackId = inp.dataset.inlineRename;
    let finished = false;
    const commitName = async (save) => {
      if (finished) return;
      finished = true;
      const nextName = inp.value.trim();
      inlineRenamingTrackId = null;
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (save && track && nextName && nextName !== track.name) {
        await commitEdit('Rename Track', () => {
          track.name = nextName;
        }, { statusMsg: `Renamed track to "${nextName}"` });
      } else {
        renderStudio();
      }
    };
    inp.addEventListener('click', ev => ev.stopPropagation());
    inp.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); commitName(true); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commitName(false); }
    });
    inp.addEventListener('blur', () => commitName(true));
  });

  // Double-click track title to inline rename
  listEl.querySelectorAll('[data-name-dbl]').forEach(lbl => {
    lbl.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      inlineRenamingTrackId = lbl.dataset.nameDbl;
      renderStudio();
    });
  });

  // Per-track multi-selection checkbox (additive toggle or Shift+Click range; clears take selection so track batch actions apply directly)
  listEl.querySelectorAll('[data-track-chk]').forEach(chk => {
    const trackId = chk.dataset.trackChk;
    chk.addEventListener('click', (ev) => {
      ev.stopPropagation();
      closeContextMenu();
      closeMenubarDropdown();
      selectedClipIds.clear();
      anchorClipId = null;
      const tracks = currentProject?.tracks || [];
      if (ev.shiftKey && anchorTrackId) {
        const next = DE.applyTrackClickSelection(tracks, selectedTrackIds, anchorTrackId, trackId, { shiftKey: true });
        selectedTrackIds = next.selectedTrackIds;
        anchorTrackId = next.anchorTrackId;
      } else {
        const next = new Set(selectedTrackIds);
        if (chk.checked) next.add(trackId);
        else next.delete(trackId);
        selectedTrackIds = next;
        anchorTrackId = trackId;
      }
      renderStudio();
    });
  });

  // Track strip Click / Ctrl+Click / Shift+Click selection & Right-Click Context Menu
  listEl.querySelectorAll('[data-track-strip]').forEach(strip => {
    const trackId = strip.dataset.trackStrip;

    strip.addEventListener('click', (ev) => {
      if (ev.target.closest('button, input, select')) return;
      closeContextMenu();
      closeMenubarDropdown();
      const tracks = currentProject?.tracks || [];
      const next = DE.applyTrackClickSelection(tracks, selectedTrackIds, anchorTrackId, trackId, ev);
      selectedTrackIds = next.selectedTrackIds;
      anchorTrackId = next.anchorTrackId;
      if (selectedTrackId !== null) {
        selectedTrackId = trackId;
      }
      renderStudio();
    });

    strip.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenubarDropdown();
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;
      if (!selectedTrackIds.has(trackId)) {
        selectedTrackIds = new Set([trackId]);
        anchorTrackId = trackId;
        renderStudio();
      }
      openTrackContextMenu(ev, track);
    });
  });

  // Track interactive controls
  listEl.querySelectorAll('[data-act]').forEach(el => {
    const act = el.dataset.act;
    const trackId = el.dataset.id;

    if (act === 'input-change') {
      el.addEventListener('click', ev => ev.stopPropagation());
      el.addEventListener('change', async () => {
        const optText = el.selectedOptions?.[0]?.textContent || el.value;
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        await commitEdit('Change Track Input', () => {
          track.inputNodeName = el.value;
          track.inputLabel = optText;
        });
      });
      return;
    }

    if (act === 'gain') {
      let dragSnapshotSaved = false;
      let startGainMap = null;
      let gangedIds = null;
      el.addEventListener('click', ev => ev.stopPropagation());
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        dragSnapshotSaved = false;
        startGainMap = new Map((currentProject?.tracks || []).map(t => [t.id, Number(t.gainDb) || 0]));
        gangedIds = getTargetTrackIdsForAction(trackId, ev);
      });
      el.addEventListener('input', (ev) => {
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        if (!dragSnapshotSaved) {
          historyStack.pushSnapshot(currentProject, 'Adjust Track Gain');
          dragSnapshotSaved = true;
          updateEditToolbarState();
        }
        const newVal = DE.clamp(-24, 36, Number(el.value) || 0);
        const origSelf = startGainMap ? (startGainMap.get(trackId) ?? 0) : (Number(track.gainDb) || 0);
        const delta = newVal - origSelf;
        const targetIds = gangedIds || getTargetTrackIdsForAction(trackId, ev);

        DE.adjustTracksNumericBatch(currentProject, startGainMap, targetIds, 'gainDb', delta, -24, 36, 1);
        track.gainDb = newVal;

        for (const t of (currentProject?.tracks || [])) {
          if (!targetIds.has(t.id)) continue;
          const gVal = Number(t.gainDb) || 0;
          const ob = document.getElementById(`gain-badge-${t.id}`);
          if (ob) {
            ob.textContent = DE.formatDb(gVal);
            ob.classList.toggle('boosted', Math.abs(gVal) >= 0.05);
          }
          if (t.id !== trackId) {
            const otherSlider = listEl.querySelector(`input[data-act="gain"][data-id="${t.id}"]`);
            if (otherSlider) otherSlider.value = gVal.toFixed(1);
          }
        }
        markDirty(true);
        applyLiveTrackParamsInPlace(targetIds);
        drawAllTimelineCanvases();
      });
      el.addEventListener('change', async () => {
        dragSnapshotSaved = false;
        gangedIds = null;
        renderInspectorDrawer();
        await syncProjectToMain();
      });
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const targetIds = getTargetTrackIdsForAction(trackId, ev);
        await commitEdit('Reset Track Gain', () => {
          DE.setTracksPropertyBatch(currentProject, targetIds, 'gainDb', 0);
        }, { statusMsg: `Reset input trim to 0.0 dB on ${targetIds.size} track(s)` });
      });
      return;
    }

    if (act === 'gain-reset') {
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const targetIds = getTargetTrackIdsForAction(trackId, ev);
        await commitEdit('Reset Track Gain', () => {
          DE.setTracksPropertyBatch(currentProject, targetIds, 'gainDb', 0);
        }, { statusMsg: `Reset input trim to 0.0 dB on ${targetIds.size} track(s)` });
      });
      return;
    }

    if (act === 'vol') {
      let volSnapSaved = false;
      let startVolMap = null;
      let gangedIds = null;
      el.addEventListener('click', ev => ev.stopPropagation());
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        volSnapSaved = false;
        startVolMap = new Map((currentProject?.tracks || []).map(t => [t.id, Number(t.volume ?? 1)]));
        gangedIds = getTargetTrackIdsForAction(trackId, ev);
      });
      el.addEventListener('input', (ev) => {
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        if (!volSnapSaved) {
          historyStack.pushSnapshot(currentProject, 'Adjust Track Volume');
          volSnapSaved = true;
          updateEditToolbarState();
        }
        const newVal = DE.clamp(0, 1.4, Number(el.value));
        const origSelf = startVolMap ? (startVolMap.get(trackId) ?? 1) : Number(track.volume ?? 1);
        const delta = newVal - origSelf;
        const targetIds = gangedIds || getTargetTrackIdsForAction(trackId, ev);

        DE.adjustTracksNumericBatch(currentProject, startVolMap, targetIds, 'volume', delta, 0, 1.4, 2);
        track.volume = newVal;

        for (const t of (currentProject?.tracks || [])) {
          if (!targetIds.has(t.id) || t.id === trackId) continue;
          const otherSlider = listEl.querySelector(`input[data-act="vol"][data-id="${t.id}"]`);
          if (otherSlider) otherSlider.value = Number(t.volume ?? 1).toFixed(2);
        }
        markDirty(true);
        applyLiveTrackParamsInPlace(targetIds);
      });
      el.addEventListener('change', async () => {
        volSnapSaved = false;
        gangedIds = null;
        await syncProjectToMain();
      });
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const targetIds = getTargetTrackIdsForAction(trackId, ev);
        await commitEdit('Reset Track Volume', () => {
          DE.setTracksPropertyBatch(currentProject, targetIds, 'volume', 1.0);
        });
      });
      return;
    }

    if (act === 'pan-reset') {
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const targetIds = getTargetTrackIdsForAction(trackId, ev);
        await commitEdit('Center Pan', () => {
          DE.setTracksPropertyBatch(currentProject, targetIds, 'pan', 0);
        });
      });
      return;
    }

    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      closeContextMenu();
      const tracks = currentProject?.tracks || [];
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;
      const batchIds = getTargetTrackIdsForAction(trackId, ev);

      if (act === 'arm') {
        await commitEdit('Toggle Record Arm', () => {
          if (ev.altKey) {
            const onlyThisArmed = track.armed && tracks.filter(t => t.armed).length === 1;
            for (const t of tracks) t.armed = onlyThisArmed ? false : (t.id === trackId);
          } else {
            const nextVal = !track.armed;
            for (const t of tracks) if (batchIds.has(t.id)) t.armed = nextVal;
          }
        });
      } else if (act === 'mon') {
        await commitEdit('Toggle Input Monitoring', () => {
          if (ev.altKey) {
            const onlyThisMon = track.monitor && tracks.filter(t => t.monitor).length === 1;
            for (const t of tracks) t.monitor = onlyThisMon ? false : (t.id === trackId);
          } else {
            const nextVal = !track.monitor;
            for (const t of tracks) if (batchIds.has(t.id)) t.monitor = nextVal;
          }
        });
      } else if (act === 'mute') {
        await commitEdit('Toggle Mute', () => {
          if (ev.altKey) {
            for (const t of tracks) t.muted = (t.id === trackId);
          } else {
            const nextVal = !track.muted;
            for (const t of tracks) if (batchIds.has(t.id)) t.muted = nextVal;
          }
        });
      } else if (act === 'solo') {
        await commitEdit('Toggle Solo', () => {
          if (ev.altKey) {
            const alreadyExclusive = track.soloed && tracks.filter(t => t.soloed).length === 1;
            for (const t of tracks) t.soloed = alreadyExclusive ? false : (t.id === trackId);
          } else {
            const nextVal = !track.soloed;
            for (const t of tracks) if (batchIds.has(t.id)) t.soloed = nextVal;
          }
        });
      } else if (act === 'phase') {
        await commitEdit('Toggle 180° Phase Invert', () => {
          const nextVal = !track.fx?.phaseInvert;
          for (const t of tracks) {
            if (!batchIds.has(t.id)) continue;
            t.fx = { ...(t.fx || {}), phaseInvert: nextVal };
          }
        });
      } else if (act === 'toggle-sr') {
        const nextEnabled = !track.soundReplacement?.enabled;
        const reanalyzeIds = [];
        await commitEdit('Toggle Sound Replacement', () => {
          for (const t of tracks) {
            if (!batchIds.has(t.id)) continue;
            t.soundReplacement = { ...(t.soundReplacement || {}), enabled: nextEnabled, supported: true };
            if (nextEnabled) reanalyzeIds.push(t.id);
          }
        }, { reanalyzeTrackIds: reanalyzeIds });
      } else if (act === 'view-video') {
        await toggleVideoOutputMonitor(trackId);
      } else if (act === 'inspect') {
        selectedTrackId = selectedTrackId === trackId ? null : trackId;
        if (!selectedTrackIds.has(trackId)) {
          selectedTrackIds = new Set([trackId]);
          anchorTrackId = trackId;
        }
        renderStudio();
      } else if (act === 'delete') {
        await commitEdit('Delete Track', () => {
          DE.deleteTracksFromProject(currentProject, batchIds);
        });
      }
    });
  });

  // Timeline Lane Mouse Selection, Multi-Track Linked Trimming, Dragging & Take Context Menu
  listEl.querySelectorAll('[data-lane-track]').forEach(lane => {
    const trackId = lane.dataset.laneTrack;

    lane.addEventListener('mousemove', (ev) => {
      if (timelineDragState) return;
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;
      const hit = hitTestLaneClip(track, lane, ev.clientX);
      if (!hit) {
        lane.style.cursor = 'crosshair';
        if (hoverLinkedPreview) {
          hoverLinkedPreview = null;
          drawAllTimelineCanvases();
        }
        return;
      }

      if (hit.zone === 'left-edge' || hit.zone === 'right-edge') {
        lane.style.cursor = 'ew-resize';
      } else {
        lane.style.cursor = 'grab';
      }

      const opMode = hit.zone === 'left-edge' ? 'left' : hit.zone === 'right-edge' ? 'right' : 'move';
      const linkedIds = DE.resolveLinkedClipsForOperation(currentProject, {
        selectedTrackIds,
        selectedClipIds,
        anchorClipId: hit.clip.id,
        mode: opMode,
      });
      const nextKey = linkedIds.size > 1 ? `${hit.zone}:${hit.clip.id}:${linkedIds.size}` : '';
      if ((hoverLinkedPreview?.key || '') !== nextKey) {
        hoverLinkedPreview = nextKey ? { key: nextKey, zone: hit.zone, clipIds: linkedIds } : null;
        drawAllTimelineCanvases();
      }
    });

    lane.addEventListener('mouseleave', () => {
      if (!timelineDragState && hoverLinkedPreview) {
        hoverLinkedPreview = null;
        drawAllTimelineCanvases();
      }
    });

    lane.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      closeContextMenu();
      const tracks = currentProject?.tracks || [];
      const track = tracks.find(t => t.id === trackId);
      if (!track) return;

      const rect = lane.getBoundingClientRect();
      const totalSec = getTimelineDurationSec();
      const hit = hitTestLaneClip(track, lane, ev.clientX);

      if (hit) {
        ev.preventDefault();
        hoverLinkedPreview = null;
        const isModifier = ev.ctrlKey || ev.metaKey || ev.shiftKey;
        const opMode = hit.zone === 'left-edge' ? 'left' : hit.zone === 'right-edge' ? 'right' : 'move';
        const inSelectedTrackGroup = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
        const inSelectedClipGroup = selectedClipIds.has(hit.clip.id) && selectedClipIds.size > 1;

        if (isModifier) {
          const next = DE.applyClipClickSelection(currentProject, selectedClipIds, anchorClipId, hit.clip.id, ev);
          selectedClipIds = next.selectedClipIds;
          anchorClipId = next.anchorClipId;
          selectedTrackIds.add(track.id);
        } else if (inSelectedTrackGroup || inSelectedClipGroup) {
          // Preserve multi-track / multi-clip selection and resolve all linked regions across selected tracks!
          selectedClipIds = DE.resolveLinkedClipsForOperation(currentProject, {
            selectedTrackIds,
            selectedClipIds,
            anchorClipId: hit.clip.id,
            mode: opMode,
          });
          anchorClipId = hit.clip.id;
        } else {
          selectedClipIds = new Set([hit.clip.id]);
          anchorClipId = hit.clip.id;
          selectedTrackIds = new Set([track.id]);
          anchorTrackId = track.id;
        }

        if (selectedTrackId !== null) selectedTrackId = track.id;

        if (hit.zone === 'body') {
          if (!isRecording && !isModifier) {
            const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
            const rawSec = timelineOffsetSec + ratio * totalSec;
            const clickedSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);
            seekPlayheadTo(clickedSec);
          }
          const targetClipIds = new Set(selectedClipIds);
          const initialStarts = new Map();
          for (const tr of tracks) {
            for (const c of (tr.clips || [])) {
              if (targetClipIds.has(c.id)) initialStarts.set(c.id, Number(c.startSec) || 0);
            }
          }
          timelineDragState = {
            mode: 'move',
            trackId: track.id,
            clipId: hit.clip.id,
            startX: ev.clientX,
            laneWidth: Math.max(1, rect.width),
            totalSec,
            pushedUndo: false,
            targetClipIds,
            initialStarts,
          };
        } else {
          const targetClipIds = DE.resolveLinkedClipsForOperation(currentProject, {
            selectedTrackIds,
            selectedClipIds,
            anchorClipId: hit.clip.id,
            mode: opMode,
          });
          selectedClipIds = new Set(targetClipIds);
          const initialClips = new Map();
          for (const tr of tracks) {
            for (const c of (tr.clips || [])) {
              if (targetClipIds.has(c.id)) initialClips.set(c.id, DE.cloneDeep(c));
            }
          }
          timelineDragState = {
            mode: opMode,
            trackId: track.id,
            clipId: hit.clip.id,
            startX: ev.clientX,
            laneWidth: Math.max(1, rect.width),
            totalSec,
            pushedUndo: false,
            targetClipIds,
            initialClips,
          };
        }
        updateEditToolbarState();
        renderInspectorDrawer();
        drawAllTimelineCanvases();
        return;
      }

      // Empty timeline space clicked -> move playhead & select track
      if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        selectedClipIds.clear();
        anchorClipId = null;
        selectedTrackIds = new Set([track.id]);
        anchorTrackId = track.id;
      } else {
        const next = DE.applyTrackClickSelection(tracks, selectedTrackIds, anchorTrackId, track.id, ev);
        selectedTrackIds = next.selectedTrackIds;
        anchorTrackId = next.anchorTrackId;
      }
      if (selectedTrackId !== null) selectedTrackId = track.id;

      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      const rawSec = timelineOffsetSec + ratio * totalSec;
      const clickedSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);
      renderStudio();
      seekPlayheadTo(clickedSec);
    });

    lane.addEventListener('dblclick', (ev) => {
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;
      const hit = hitTestLaneClip(track, lane, ev.clientX);
      if (hit) {
        ev.stopPropagation();
        openRenameModal('Rename Take', 'Take Label', hit.clip.name || 'Take', async (newName) => {
          await commitEdit('Rename Take', () => { hit.clip.name = newName; });
        });
      }
    });

    lane.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenubarDropdown();
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;
      const rect = lane.getBoundingClientRect();
      const clickTimeSec = timelineOffsetSec + Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width))) * getTimelineDurationSec();
      const hit = hitTestLaneClip(track, lane, ev.clientX);

      if (hit) {
        const inSelectedTrackGroup = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1;
        const inSelectedClipGroup = selectedClipIds.has(hit.clip.id) && selectedClipIds.size > 1;
        if (inSelectedTrackGroup || inSelectedClipGroup) {
          selectedClipIds = DE.resolveLinkedClipsForOperation(currentProject, {
            selectedTrackIds,
            selectedClipIds,
            anchorClipId: hit.clip.id,
            mode: 'edit',
          });
          anchorClipId = hit.clip.id;
          updateEditToolbarState();
          drawAllTimelineCanvases();
        } else if (!selectedClipIds.has(hit.clip.id)) {
          selectedClipIds = new Set([hit.clip.id]);
          anchorClipId = hit.clip.id;
          selectedTrackIds = new Set([track.id]);
          anchorTrackId = track.id;
          updateEditToolbarState();
          drawAllTimelineCanvases();
        }
        openTakeContextMenu(ev, track, hit.clip, clickTimeSec);
      } else {
        if (!selectedTrackIds.has(track.id)) {
          selectedTrackIds = new Set([track.id]);
          anchorTrackId = track.id;
          renderStudio();
        }
        openTimelineSpaceContextMenu(ev, track, clickTimeSec);
      }
    });
  });
}

function hitTestLaneClip(track, laneEl, clientX) {
  const rect = laneEl.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const x = clientX - rect.left;
  const totalSec = getTimelineDurationSec();
  const viewStart = timelineOffsetSec;
  const clips = track?.clips || [];
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i];
    const startX = (((Number(clip.startSec || 0)) - viewStart) / totalSec) * w;
    const clipW = Math.max(8, (Number(clip.durationSec || 1) / totalSec) * w);
    const endX = startX + clipW;
    if (x >= startX - 2 && x <= endX + 2) {
      const edgeZonePx = Math.min(10, Math.max(5, clipW * 0.18));
      let zone = 'body';
      if (x <= startX + edgeZonePx) zone = 'left-edge';
      else if (x >= endX - edgeZonePx) zone = 'right-edge';
      return { clip, zone, startX, clipW };
    }
  }
  return null;
}

function handleGlobalTimelineMouseMove(ev) {
  if (rulerScrubState) {
    if (typeof ev.buttons === 'number' && (ev.buttons & 1) === 0) {
      rulerScrubState = null;
      return;
    }
    const rulerEl = document.getElementById('timeline-ruler-wrap');
    const rect = rulerEl ? rulerEl.getBoundingClientRect() : rulerScrubState.rect;
    if (rect && rect.width > 10) {
      const dx = ev.clientX - rulerScrubState.startX;
      if (!rulerScrubState.moved && Math.abs(dx) >= 4) {
        rulerScrubState.moved = true;
      }
      if (rulerScrubState.moved) {
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const rawSec = timelineOffsetSec + ratio * getTimelineDurationSec();
        const curSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);
        setTimeSelectionRange(rulerScrubState.anchorSec, curSec);
      }
    }
    return;
  }
  if (middlePanDragState) {
    if (typeof ev.buttons === 'number' && ev.buttons > 0 && (ev.buttons & 4) === 0) {
      endMiddlePanDrag();
      return;
    }
    const dx = ev.clientX - middlePanDragState.startX;
    const deltaSec = (dx / middlePanDragState.laneWidth) * middlePanDragState.viewSpanSec;
    setTimelineOffsetSec(middlePanDragState.startOffsetSec - deltaSec);
    return;
  }
  if (!timelineDragState || !currentProject) return;
  const dx = ev.clientX - timelineDragState.startX;
  if (!timelineDragState.pushedUndo && Math.abs(dx) < 3) return;

  if (!timelineDragState.pushedUndo) {
    const cnt = timelineDragState.targetClipIds?.size || 1;
    historyStack.pushSnapshot(
      currentProject,
      timelineDragState.mode === 'move'
        ? `Move ${cnt} Region(s)`
        : `Trim ${cnt} Region(s)`
    );
    timelineDragState.pushedUndo = true;
    updateEditToolbarState();
  }

  let deltaSec = (dx / timelineDragState.laneWidth) * timelineDragState.totalSec;
  if (timelineDragState.mode === 'move') {
    for (const tr of (currentProject.tracks || [])) {
      for (const c of (tr.clips || [])) {
        if (timelineDragState.initialStarts.has(c.id)) {
          c.startSec = timelineDragState.initialStarts.get(c.id);
        }
      }
    }
    if (snapToGrid && !ev.altKey && timelineDragState.initialStarts.has(timelineDragState.clipId)) {
      const origPrimary = timelineDragState.initialStarts.get(timelineDragState.clipId);
      const snappedPrimary = DE.snapTimeToBeatGrid(origPrimary + deltaSec, currentProject.bpm || 120, true);
      deltaSec = snappedPrimary - origPrimary;
    }
    DE.moveClipsByDelta(currentProject, timelineDragState.targetClipIds || selectedClipIds, deltaSec);
  } else {
    DE.trimClipsBatch(
      currentProject,
      timelineDragState.initialClips,
      timelineDragState.targetClipIds,
      timelineDragState.mode,
      deltaSec,
      {
        anchorClipId: timelineDragState.clipId,
        snapBpm: currentProject.bpm || 120,
        snapEnabled: snapToGrid && !ev.altKey,
      }
    );
  }
  markDirty(true);
  drawAllTimelineCanvases();
}

async function handleGlobalTimelineMouseUp(ev) {
  if (rulerScrubState) {
    const snap = rulerScrubState;
    const rulerEl = document.getElementById('timeline-ruler-wrap');
    const rect = rulerEl ? rulerEl.getBoundingClientRect() : snap.rect;
    rulerScrubState = null;
    if (ev && rect && rect.width > 10) {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const rawSec = timelineOffsetSec + ratio * getTimelineDurationSec();
      const curSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);
      if (snap.moved) {
        const sel = setTimeSelectionRange(snap.anchorSec, curSec);
        seekPlayheadTo(sel.fromSec);
        showStatus(
          `Selected timeline range: From ${formatTimecode(sel.fromSec)} -> To ${formatTimecode(sel.toSec)} (${(sel.toSec - sel.fromSec).toFixed(2)}s)`
        );
      } else {
        seekPlayheadTo(curSec);
      }
    }
  }
  if (middlePanDragState && (!ev || ev.button === 1 || (typeof ev.buttons === 'number' && (ev.buttons & 4) === 0))) {
    endMiddlePanDrag();
  }
  if (!timelineDragState) return;
  const dragSnap = timelineDragState;
  const didEdit = dragSnap.pushedUndo;
  timelineDragState = null;
  if (didEdit) {
    const cnt = dragSnap.targetClipIds?.size || 1;
    const anchor = DE.findClipWithTrack(currentProject, dragSnap.clipId)?.clip;
    if (anchor) {
      if (dragSnap.mode === 'right') {
        const endT = (Number(anchor.startSec) || 0) + (Number(anchor.durationSec) || 0);
        showStatus(`Trimmed ${cnt} region${cnt > 1 ? 's across selected tracks' : ''} (end -> ${formatTimecode(endT)})`);
      } else if (dragSnap.mode === 'left') {
        showStatus(`Trimmed ${cnt} region${cnt > 1 ? 's across selected tracks' : ''} (start -> ${formatTimecode(anchor.startSec || 0)})`);
      } else {
        showStatus(`Moved ${cnt} region${cnt > 1 ? 's across selected tracks' : ''} (start -> ${formatTimecode(anchor.startSec || 0)})`);
      }
    }
    renderStudio();
    if (isPlaying || isRecording) {
      seamlessRefreshLiveAudio();
    }
    await syncProjectToMain();
  }
}

function pickBarGridStrides(pxPerBar) {
  const labelSteps = [1, 2, 4, 8, 16, 32, 64, 128, 256];
  const labelStride = labelSteps.find(s => s * pxPerBar >= 48) || 256;
  const tickSteps = [1, 2, 4, 8, 16, 32, 64, 128];
  const tickStride = tickSteps.find(s => s * pxPerBar >= 14) || labelStride;
  return { labelStride, tickStride: Math.min(labelStride, tickStride) };
}

function pickTimeRulerSteps(w, totalSec) {
  const majorCandidates = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const pxPerSec = w / Math.max(0.1, totalSec);
  const majorSec = majorCandidates.find(s => s * pxPerSec >= 68) || 600;
  let minorSec = majorSec / 2;
  if (majorSec === 5) minorSec = 1;
  else if (majorSec === 15) minorSec = 5;
  else if (majorSec === 30) minorSec = 10;
  else if (majorSec === 60) minorSec = 15;
  else if (majorSec === 120) minorSec = 30;
  else if (majorSec === 300) minorSec = 60;
  if (minorSec * pxPerSec < 12) minorSec = majorSec;
  return { majorSec, minorSec };
}

function formatRulerTimeLabel(sec, majorSec) {
  if (majorSec < 1) {
    return `${sec.toFixed(majorSec < 0.5 ? 2 : 1)}s`;
  }
  if (sec >= 60 || majorSec >= 15) {
    const whole = Math.round(sec);
    const mins = Math.floor(whole / 60);
    const rem = whole % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }
  return `${Math.round(sec)}s`;
}

function renderStaticRulerLayer(w, h, totalSec, secPerBeat, viewStart = 0, beatsPerBar = 4) {
  const viewEnd = viewStart + totalSec;
  const safeBeatsPerBar = Math.max(1, Math.round(Number(beatsPerBar) || 4));
  const secPerBar = secPerBeat * safeBeatsPerBar;
  const markersArr = Array.isArray(currentProject?.markers) ? currentProject.markers : [];
  const markersSig = markersArr.map(m => `${m.num}:${m.timeSec}:${m.name}`).join('|');
  const key = `${w}x${h}:${viewStart.toFixed(4)}:${totalSec}:${secPerBeat.toFixed(5)}:${safeBeatsPerBar}:${markersSig}`;
  if (rulerStaticCache.key === key && rulerStaticCache.canvas) {
    return rulerStaticCache.canvas;
  }
  const off = rulerStaticCache.canvas || document.createElement('canvas');
  if (off.width !== w) off.width = w;
  if (off.height !== h) off.height = h;
  const ctx = off.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Top Bars|Beats lane + bottom Timecode lane
  ctx.fillStyle = '#0d1016';
  ctx.fillRect(0, 0, w, 17);
  ctx.fillStyle = '#080b0f';
  ctx.fillRect(0, 17, w, 15);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.beginPath();
  ctx.moveTo(0, 16.5);
  ctx.lineTo(w, 16.5);
  ctx.stroke();

  // Adaptive Bars & Beats markers (never overlaps labels at any song length or zoom!)
  const pxPerBeat = (secPerBeat / totalSec) * w;
  const pxPerBar = (secPerBar / totalSec) * w;
  const { labelStride, tickStride } = pickBarGridStrides(pxPerBar);

  ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
  let lastBarLabelRightPx = -999;

  if (pxPerBeat >= 14) {
    // Zoomed in: draw individual beat ticks + bar labels
    const firstBeat = Math.max(0, Math.floor(viewStart / secPerBeat));
    const maxBeats = Math.ceil(viewEnd / secPerBeat) + 1;
    for (let beat = firstBeat; beat <= maxBeats; beat++) {
      const t = beat * secPerBeat;
      if (t > viewEnd + 0.01) break;
      const x = Math.round(((t - viewStart) / totalSec) * w) + 0.5;
      const isBar = beat % safeBeatsPerBar === 0;
      const barZeroIdx = Math.floor(beat / safeBeatsPerBar);
      const barNum = barZeroIdx + 1;

      if (isBar) {
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 17);
        ctx.stroke();
        const onStride = (barZeroIdx % labelStride) === 0;
        if (onStride && x >= -2 && x < w - 24 && x >= lastBarLabelRightPx + 6) {
          const lbl = barNum === 1 ? 'BAR 1' : String(barNum);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(lbl, x + 4, 12);
          lastBarLabelRightPx = x + 4 + ctx.measureText(lbl).width;
        }
      } else {
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, 17);
        ctx.stroke();
      }
    }
  } else {
    // Zoomed out on full-length songs: iterate bars at clean musical strides (1, 2, 4, 8, 16...)
    const firstBarIdx = Math.max(0, Math.floor(viewStart / secPerBar));
    const maxBarIdx = Math.ceil(viewEnd / secPerBar) + 1;
    for (let barZeroIdx = firstBarIdx; barZeroIdx <= maxBarIdx; barZeroIdx++) {
      const onLabel = (barZeroIdx % labelStride) === 0;
      const onTick = onLabel || (barZeroIdx % tickStride) === 0;
      if (!onTick) continue;
      const t = barZeroIdx * secPerBar;
      if (t > viewEnd + 0.01) break;
      const x = Math.round(((t - viewStart) / totalSec) * w) + 0.5;

      ctx.strokeStyle = onLabel ? '#334155' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, onLabel ? 0 : 8);
      ctx.lineTo(x, 17);
      ctx.stroke();

      if (onLabel && x >= -2 && x < w - 24 && x >= lastBarLabelRightPx + 8) {
        const barNum = barZeroIdx + 1;
        const lbl = barNum === 1 ? 'BAR 1' : String(barNum);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(lbl, x + 4, 12);
        lastBarLabelRightPx = x + 4 + ctx.measureText(lbl).width;
      }
    }
  }

  // Adaptive Timecode (M:SS / Seconds) sub-lane markers
  ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
  const { majorSec, minorSec } = pickTimeRulerSteps(w, totalSec);
  const firstTickIdx = Math.max(0, Math.floor(viewStart / minorSec));
  const maxTickIdx = Math.ceil(viewEnd / minorSec) + 1;
  let lastTimeLabelRightPx = -999;

  for (let ti = firstTickIdx; ti <= maxTickIdx; ti++) {
    const s = ti * minorSec;
    if (s > viewEnd + 0.001) break;
    const x = Math.round(((s - viewStart) / totalSec) * w) + 0.5;
    const isMajor = Math.abs((s / majorSec) - Math.round(s / majorSec)) < 0.001;
    ctx.strokeStyle = isMajor ? '#283446' : '#18202c';
    ctx.beginPath();
    ctx.moveTo(x, isMajor ? 18 : 24);
    ctx.lineTo(x, h);
    ctx.stroke();
    if (isMajor && x >= -2 && x < w - 34 && x >= lastTimeLabelRightPx + 10) {
      const lbl = formatRulerTimeLabel(s, majorSec);
      ctx.fillStyle = '#64748b';
      ctx.fillText(lbl, x + 3.5, 29);
      lastTimeLabelRightPx = x + 3.5 + ctx.measureText(lbl).width;
    }
  }

  // REAPER Project Markers (M1, M2, ...)
  if (markersArr.length) {
    ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (const m of markersArr) {
      const mx = (((Number(m.timeSec) || 0) - viewStart) / totalSec) * w;
      if (mx < -2 || mx > w + 2) continue;
      const tag = `${m.num}:${m.name || `M${m.num}`}`;
      const tw = Math.min(82, ctx.measureText(tag).width + 8);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, h);
      ctx.stroke();

      ctx.fillStyle = 'rgba(180, 83, 9, 0.94)';
      ctx.fillRect(mx, 1, tw, 13);
      ctx.fillStyle = '#fef3c7';
      ctx.fillText(tag, mx + 3.5, 10.5);
    }
  }

  rulerStaticCache = { key, canvas: off };
  return off;
}

function computeTrackStaticCacheKey(track, tIdx, w, h, totalSec, secPerBeat, viewStart = 0) {
  const isTrackSel = selectedTrackIds.has(track.id) ? 1 : 0;
  const srOn = track.soundReplacement?.enabled ? 1 : 0;
  let clipsSig = '';
  for (const c of (track.clips || [])) {
    const sel = selectedClipIds.has(c.id) ? 1 : 0;
    const hov = hoverLinkedPreview?.clipIds?.has(c.id) ? hoverLinkedPreview.zone : '';
    const drg = timelineDragState?.targetClipIds?.has(c.id) ? timelineDragState.mode : '';
    const vPath = resolveClipVideoFilePath(c);
    const fEntry = vPath ? videoFilmstripCache.get(vPath) : null;
    const filmSig = fEntry ? `${fEntry.status}:${fEntry.tileCount || 0}` : '';
    clipsSig += `|${c.id}:${c.startSec}:${c.offsetSec || 0}:${c.durationSec}:${c.gainDb || 0}:${c.fadeInSec || 0}:${c.fadeOutSec || 0}:${c.muted ? 1 : 0}:${c.peaks?.length || 0}:${c.transients?.length || 0}:${c.wordCount || 0}:${c.lyricsData?.lines?.length || 0}:${filmSig}:${sel}:${hov}:${drg}`;
  }
  return `${w}x${h}:${tIdx}:${viewStart.toFixed(4)}:${totalSec}:${secPerBeat.toFixed(4)}:${track.gainDb || 0}:${waveformZoomDb}:${track.color || ''}:${isTrackSel}:${srOn}${clipsSig}`;
}

function drawAllTimelineCanvases() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  const totalSec = getTimelineDurationSec();
  const viewStart = timelineOffsetSec;
  const viewEnd = viewStart + totalSec;
  const bpm = Number(currentProject.bpm) || 120;
  const tsParts = String(currentProject.timeSignature || '4/4').split('/');
  const beatsPerBar = Math.max(1, Math.round(Number(tsParts[0]) || 4));
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * beatsPerBar;

  // 1. Dual-Tier Pro-DAW Arrangement Ruler (Cached Static Grid + Sub-Pixel Playhead)
  const ruler = document.getElementById('timeline-ruler-canvas');
  if (ruler) {
    const w = ruler.clientWidth || 640;
    const h = 32;
    if (ruler.width !== w) ruler.width = w;
    if (ruler.height !== h) ruler.height = h;
    const ctx = ruler.getContext('2d');
    const staticRuler = renderStaticRulerLayer(w, h, totalSec, secPerBeat, viewStart, beatsPerBar);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(staticRuler, 0, 0);

    // Timeline From -> To Range Selection Locator Bar & Handles
    if (hasActiveTimeSelection()) {
      const sx0 = ((timeSelection.fromSec - viewStart) / totalSec) * w;
      const sx1 = ((timeSelection.toSec - viewStart) / totalSec) * w;
      if (sx1 >= -4 && sx0 <= w + 4) {
        const cx0 = Math.max(0, sx0);
        const cx1 = Math.min(w, sx1);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.20)';
        ctx.fillRect(cx0, 0, Math.max(1, cx1 - cx0), h);
        ctx.fillStyle = '#00d4ff';
        ctx.fillRect(cx0, 0, Math.max(1, cx1 - cx0), 3);

        // Left 'FROM' locator bracket & flag
        if (sx0 >= -8 && sx0 <= w + 8) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(sx0, 0);
          ctx.lineTo(sx0, h);
          ctx.stroke();
          ctx.fillStyle = '#00d4ff';
          ctx.beginPath();
          ctx.moveTo(sx0, 0);
          ctx.lineTo(sx0 + 8, 0);
          ctx.lineTo(sx0, 9);
          ctx.closePath();
          ctx.fill();
        }
        // Right 'TO' locator bracket & flag
        if (sx1 >= -8 && sx1 <= w + 8) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(sx1, 0);
          ctx.lineTo(sx1, h);
          ctx.stroke();
          ctx.fillStyle = '#00d4ff';
          ctx.beginPath();
          ctx.moveTo(sx1, 0);
          ctx.lineTo(sx1 - 8, 0);
          ctx.lineTo(sx1, 9);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Sub-pixel anti-aliased Playhead cap polygon + stem (no Math.round staircase judder)
    const px = ((playheadSec - viewStart) / totalSec) * w;
    if (px >= -8 && px <= w + 8) {
      ctx.fillStyle = '#00d4ff';
      ctx.beginPath();
      ctx.moveTo(px - 5.5, 0);
      ctx.lineTo(px + 5.5, 0);
      ctx.lineTo(px + 5.5, 5);
      ctx.lineTo(px, 11);
      ctx.lineTo(px - 5.5, 5);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, 10);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }

  // 2. Per-Track Pro Waveform + Transient Canvases (Cached Static Layer + 60/120fps Live Stream)
  const tracksArr = currentProject.tracks || [];
  for (let tIdx = 0; tIdx < tracksArr.length; tIdx++) {
    const track = tracksArr[tIdx];
    const canvas = document.getElementById(`wave-canvas-${track.id}`);
    if (!canvas) continue;
    const w = canvas.clientWidth || 640;
    const h = 102;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const destCtx = canvas.getContext('2d');

    const trackGainDb = Number(track.gainDb) || 0;
    const baseColor = track.color || '#00d4ff';
    const cacheKey = computeTrackStaticCacheKey(track, tIdx, w, h, totalSec, secPerBeat, viewStart);
    let cachedEntry = trackStaticCache.get(track.id);

    if (!cachedEntry || cachedEntry.key !== cacheKey) {
      const off = cachedEntry?.canvas || document.createElement('canvas');
      if (off.width !== w) off.width = w;
      if (off.height !== h) off.height = h;
      const ctx = off.getContext('2d');
      ctx.clearRect(0, 0, w, h);

      // Alternating studio charcoal lane tint
      ctx.fillStyle = tIdx % 2 === 0 ? '#0b0e14' : '#0d1118';
      ctx.fillRect(0, 0, w, h);

      // Subtle alternating bar-group shading + adaptive beat/bar gridlines
      const pxPerBar = (secPerBar / totalSec) * w;
      const pxPerBeat = (secPerBeat / totalSec) * w;
      const { labelStride, tickStride } = pickBarGridStrides(pxPerBar);
      const shadeSpanPx = labelStride * pxPerBar;
      if (shadeSpanPx >= 28) {
        let firstGroup = Math.max(0, Math.floor(viewStart / (secPerBar * labelStride)));
        if (firstGroup % 2 !== 0) firstGroup--;
        for (let g = firstGroup; g * labelStride * secPerBar < viewEnd; g += 2) {
          const bx = (((g * labelStride * secPerBar) - viewStart) / totalSec) * w;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
          ctx.fillRect(bx, 0, shadeSpanPx, h);
        }
      }

      if (pxPerBeat >= 14) {
        const firstBeat = Math.max(0, Math.floor(viewStart / secPerBeat));
        const maxBeats = Math.ceil(viewEnd / secPerBeat) + 1;
        for (let beat = firstBeat; beat <= maxBeats; beat++) {
          const t = beat * secPerBeat;
          if (t > viewEnd + 0.01) break;
          const x = Math.round(((t - viewStart) / totalSec) * w) + 0.5;
          const isBar = beat % beatsPerBar === 0;
          ctx.strokeStyle = isBar ? 'rgba(148, 163, 184, 0.13)' : 'rgba(148, 163, 184, 0.045)';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      } else {
        const firstBarIdx = Math.max(0, Math.floor(viewStart / secPerBar));
        const maxBarIdx = Math.ceil(viewEnd / secPerBar) + 1;
        for (let barIdx = firstBarIdx; barIdx <= maxBarIdx; barIdx++) {
          const isMajorBar = (barIdx % labelStride) === 0;
          if (!isMajorBar && (barIdx % tickStride) !== 0) continue;
          const t = barIdx * secPerBar;
          if (t > viewEnd + 0.01) break;
          const x = Math.round(((t - viewStart) / totalSec) * w) + 0.5;
          ctx.strokeStyle = isMajorBar ? 'rgba(148, 163, 184, 0.13)' : 'rgba(148, 163, 184, 0.05)';
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
      }

      // Center zero-crossing reference line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
      ctx.beginPath();
      ctx.moveTo(0, Math.round(h / 2) + 0.5);
      ctx.lineTo(w, Math.round(h / 2) + 0.5);
      ctx.stroke();

      // Draw recorded audio regions onto cached static layer
      for (const clip of (track.clips || [])) {
        const startX = (((Number(clip.startSec || 0)) - viewStart) / totalSec) * w;
        const clipW = Math.max(8, (Number(clip.durationSec || 1) / totalSec) * w);
        if (startX > w + 4 || startX + clipW < -4) continue;

        const isClipSel = selectedClipIds.has(clip.id);
        const isTrackSel = selectedTrackIds.has(track.id);
        const isHoverLinked = Boolean(hoverLinkedPreview?.clipIds?.has(clip.id));
        const isDragLinked = Boolean(timelineDragState?.targetClipIds?.has(clip.id));
        const isHighlighted = isClipSel || isHoverLinked || isDragLinked;
        const isMuted = Boolean(clip.muted);
        const clipGainDb = Number(clip.gainDb) || 0;
        const totalGainLinear = DE.dbToGain(trackGainDb + clipGainDb);
        const regionTop = 4;
        const regionH = h - 8;

        ctx.save();
        if (isMuted) ctx.globalAlpha = 0.4;

        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(startX, regionTop, clipW, regionH, 4);
        else ctx.rect(startX, regionTop, clipW, regionH);
        ctx.clip();

        ctx.fillStyle = isHighlighted ? 'rgba(16, 40, 58, 0.96)' : 'rgba(17, 24, 35, 0.94)';
        ctx.fillRect(startX, regionTop, clipW, regionH);

        ctx.fillStyle = isHighlighted
          ? 'rgba(0, 212, 255, 0.28)'
          : isTrackSel
            ? 'rgba(0, 212, 255, 0.14)'
            : 'rgba(30, 41, 59, 0.78)';
        ctx.fillRect(startX, regionTop, clipW, 17);
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = isMuted ? 0.25 : 0.32;
        ctx.fillRect(startX, regionTop, clipW, 2.5);
        ctx.globalAlpha = isMuted ? 0.4 : 1.0;

        const peaks = Array.isArray(clip.peaks) ? clip.peaks : [];
        const isVideoRegion = Boolean(clip.videoFile || clip.mediaKind === 'video' || track.trackKind === 'video');
        const isLyricsRegion = Boolean(clip.mediaKind === 'lyrics' || track.trackKind === 'lyrics' || clip.lyricsData?.lines?.length);
        if (isLyricsRegion && Array.isArray(clip.lyricsData?.lines)) {
          // Industry-standard DAW MIDI Lyric Piano-Roll Lane (0xFF 0x05 Word Events + Vocal MIDI Pitch Guide Bars)
          const bodyTop = regionTop + 19;
          const bodyH = Math.max(20, regionH - 22);
          const baseStart = Number(clip.lyricsData.clipBaseStartSec);
          const shift = Number.isFinite(baseStart) ? ((Number(clip.startSec) || 0) - baseStart) : 0;

          // Subtle horizontal pitch-staff reference lines
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.11)';
          ctx.lineWidth = 1;
          for (let r = 1; r <= 3; r++) {
            const ry = Math.round(bodyTop + (bodyH * r) / 4) + 0.5;
            ctx.beginPath();
            ctx.moveTo(startX, ry);
            ctx.lineTo(startX + clipW, ry);
            ctx.stroke();
          }

          ctx.font = '600 9.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          let lastLabelEndX = -999;
          for (const line of clip.lyricsData.lines) {
            const words = Array.isArray(line.words) ? line.words : [];
            for (const wObj of words) {
              const ws = (Number(wObj.startSec) || 0) + shift;
              const we = Math.max(ws + 0.06, (Number(wObj.endSec) || (ws + 0.25)) + shift);
              const wx = ((ws - viewStart) / totalSec) * w;
              const ww = Math.max(3, ((we - ws) / totalSec) * w);
              if (wx + ww < -2 || wx > w + 2) continue;

              const midi = DE.clamp(43, 81, Number(wObj.midiNote) || 60);
              const normPitch = (midi - 43) / (81 - 43);
              const noteY = bodyTop + (1 - normPitch) * (bodyH - 9);

              ctx.fillStyle = isMuted ? 'rgba(148, 163, 184, 0.35)' : 'rgba(245, 158, 11, 0.78)';
              ctx.fillRect(wx, noteY, Math.max(2.5, ww - 1), 6.5);
              ctx.fillStyle = isMuted ? '#94a3b8' : '#38bdf8';
              ctx.fillRect(wx, noteY, Math.min(3, ww), 6.5);

              if (wx > lastLabelEndX + 4 && ww >= 9) {
                const txt = String(wObj.text || '');
                ctx.fillStyle = isMuted ? '#94a3b8' : '#fef3c7';
                ctx.fillText(txt, wx + 1, Math.max(bodyTop + 8, noteY - 2.5));
                lastLabelEndX = wx + ctx.measureText(txt).width + 5;
              }
            }
          }
        }
        if (isVideoRegion) {
          drawVideoFilmstripIntoClip(ctx, {
            track,
            clip,
            startX,
            clipW,
            regionTop,
            regionH,
            viewW: w,
            isMuted,
          });
        }
        if (peaks.length) {
          const stepX = clipW / peaks.length;
          const barW = Math.max(1, stepX - (stepX > 2.2 ? 0.45 : 0.15));
          const isVidTrackWave = track.trackKind === 'video';
          const waveStripH = isVidTrackWave ? 20 : (regionH - 22);
          const midY = isVidTrackWave
            ? (regionTop + regionH - 6 - waveStripH / 2)
            : (regionTop + 17 + (regionH - 19) / 2);
          const maxAmpH = waveStripH / 2;

          if (isVidTrackWave) {
            const visL = Math.max(0, startX);
            const visR = Math.min(w, startX + clipW);
            if (visR > visL) {
              ctx.fillStyle = 'rgba(7, 10, 16, 0.72)';
              ctx.fillRect(visL, midY - maxAmpH - 1, visR - visL, waveStripH + 2);
            }
          }

          ctx.fillStyle = isMuted ? '#475569' : baseColor;
          ctx.globalAlpha = isMuted ? 0.35 : 0.54;
          for (let i = 0; i < peaks.length; i++) {
            const amp = waveformVisualAmp(peaks[i], totalGainLinear, 0.012);
            const bh = amp * maxAmpH;
            ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
          }

          ctx.fillStyle = isMuted ? '#94a3b8' : (isClipSel ? '#e0f2fe' : baseColor);
          ctx.globalAlpha = isMuted ? 0.4 : 0.92;
          for (let i = 0; i < peaks.length; i++) {
            const amp = Math.max(0.010, waveformVisualAmp(peaks[i], totalGainLinear, 0.010) * 0.68);
            const bh = amp * maxAmpH;
            ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
          }
          ctx.globalAlpha = isMuted ? 0.4 : 1.0;
        }

        const durSec = Math.max(0.05, Number(clip.durationSec) || 1);
        const fadeInPx = Math.min(clipW * 0.5, ((Number(clip.fadeInSec) || 0) / durSec) * clipW);
        const fadeOutPx = Math.min(clipW * 0.5, ((Number(clip.fadeOutSec) || 0) / durSec) * clipW);
        if (fadeInPx > 2) {
          ctx.fillStyle = 'rgba(7, 10, 15, 0.62)';
          ctx.beginPath();
          ctx.moveTo(startX, regionTop + 17);
          ctx.lineTo(startX + fadeInPx, regionTop + 17);
          ctx.lineTo(startX, regionTop + regionH);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(startX, regionTop + regionH);
          ctx.lineTo(startX + fadeInPx, regionTop + 17);
          ctx.stroke();
        }
        if (fadeOutPx > 2) {
          const endX = startX + clipW;
          ctx.fillStyle = 'rgba(7, 10, 15, 0.62)';
          ctx.beginPath();
          ctx.moveTo(endX, regionTop + 17);
          ctx.lineTo(endX - fadeOutPx, regionTop + 17);
          ctx.lineTo(endX, regionTop + regionH);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(endX - fadeOutPx, regionTop + 17);
          ctx.lineTo(endX, regionTop + regionH);
          ctx.stroke();
        }

        if (track.soundReplacement?.enabled && Array.isArray(clip.transients) && !isMuted) {
          for (const hit of clip.transients) {
            const hx = startX + ((Number(hit.timeSec) || 0) / durSec) * clipW;
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(hx, regionTop + 19);
            ctx.lineTo(hx, regionTop + regionH - 2);
            ctx.stroke();

            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(hx, regionTop + 18);
            ctx.lineTo(hx + 3.5, regionTop + 21.5);
            ctx.lineTo(hx, regionTop + 25);
            ctx.lineTo(hx - 3.5, regionTop + 21.5);
            ctx.closePath();
            ctx.fill();
          }
        }

        if ((isHighlighted || isTrackSel) && clipW > 20) {
          const activeEdge = isDragLinked
            ? timelineDragState.mode
            : (isHoverLinked ? (hoverLinkedPreview.zone === 'left-edge' ? 'left' : hoverLinkedPreview.zone === 'right-edge' ? 'right' : null) : null);
          ctx.fillStyle = activeEdge === 'left' ? '#38bdf8' : 'rgba(0, 212, 255, 0.75)';
          ctx.fillRect(
            startX + 1.5,
            activeEdge === 'left' ? regionTop + 2 : h / 2 - 10,
            activeEdge === 'left' ? 3.5 : 2.5,
            activeEdge === 'left' ? regionH - 4 : 20
          );
          ctx.fillStyle = activeEdge === 'right' ? '#38bdf8' : 'rgba(0, 212, 255, 0.75)';
          ctx.fillRect(
            startX + clipW - (activeEdge === 'right' ? 5 : 4),
            activeEdge === 'right' ? regionTop + 2 : h / 2 - 10,
            activeEdge === 'right' ? 3.5 : 2.5,
            activeEdge === 'right' ? regionH - 4 : 20
          );
        }

        ctx.fillStyle = isHighlighted ? '#ffffff' : '#dbeafe';
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        const muteTag = isMuted ? '[MUTE] ' : '';
        const gainTag = Math.abs(clipGainDb) >= 0.05 ? ` · ${DE.formatDb(clipGainDb)}` : '';
        const hitNote = track.soundReplacement?.enabled && clip.transients?.length
          ? ` · TRIG ${clip.transients.length}`
          : '';
        const metaBadge = (isVideoRegion && !peaks.length)
          ? (clip.videoWidth && clip.videoHeight ? `${clip.videoWidth}x${clip.videoHeight}` : 'HD MP4')
          : `${clip.peakDb ?? '—'} dB`;
        ctx.save();
        ctx.beginPath();
        ctx.rect(startX + 4, regionTop + 1, Math.max(4, clipW - 8), 16);
        ctx.clip();
        ctx.fillText(
          `${muteTag}${clip.name || 'Take'}  ${Number(clip.durationSec || 0).toFixed(1)}s · ${metaBadge}${gainTag}${hitNote}`,
          startX + 6,
          regionTop + 12.5
        );
        ctx.restore();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = isHighlighted ? '#38bdf8' : (isTrackSel ? 'rgba(56, 189, 248, 0.85)' : baseColor);
        ctx.globalAlpha = isMuted ? 0.35 : (isHighlighted ? 0.96 : (isTrackSel ? 0.82 : 0.65));
        ctx.lineWidth = isHighlighted ? 1.7 : (isTrackSel ? 1.3 : 1.0);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(startX + 0.5, regionTop + 0.5, Math.max(2, clipW - 1), regionH - 1, 4);
        else ctx.rect(startX + 0.5, regionTop + 0.5, Math.max(2, clipW - 1), regionH - 1);
        ctx.stroke();
        ctx.restore();
      }

      cachedEntry = { key: cacheKey, canvas: off };
      trackStaticCache.set(track.id, cachedEntry);
    }

    // GPU blit cached static grid + existing takes (0.02ms)
    destCtx.clearRect(0, 0, w, h);
    destCtx.drawImage(cachedEntry.canvas, 0, 0);
    const ctx = destCtx;

    // Translucent From -> To Time Selection Highlight Band across Track Lane
    if (hasActiveTimeSelection()) {
      const sx0 = ((timeSelection.fromSec - viewStart) / totalSec) * w;
      const sx1 = ((timeSelection.toSec - viewStart) / totalSec) * w;
      if (sx1 >= -2 && sx0 <= w + 2) {
        const cx0 = Math.max(0, sx0);
        const cx1 = Math.min(w, sx1);
        ctx.fillStyle = 'rgba(0, 212, 255, 0.085)';
        ctx.fillRect(cx0, 0, Math.max(1, cx1 - cx0), h);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
        ctx.lineWidth = 1.1;
        if (sx0 >= 0 && sx0 <= w) {
          ctx.beginPath();
          ctx.moveTo(sx0, 0);
          ctx.lineTo(sx0, h);
          ctx.stroke();
        }
        if (sx1 >= 0 && sx1 <= w) {
          ctx.beginPath();
          ctx.moveTo(sx1, 0);
          ctx.lineTo(sx1, h);
          ctx.stroke();
        }
      }
    }

    // Live Low-Latency Sub-Pixel Growing Waveform Region + Fluid MS Timer on Armed Tracks
    if ((isRecording || isStoppingRecording) && track.armed && liveRecSession) {
      const recStartSec = liveRecSession.startSec;
      const writeEdgeSec = isStoppingRecording && Number.isFinite(liveRecSession.stoppedEndSec)
        ? liveRecSession.stoppedEndSec
        : playheadSec;
      const recElapsedSec = Math.max(0, writeEdgeSec - recStartSec);
      const startX = ((recStartSec - viewStart) / totalSec) * w;
      const endX = ((writeEdgeSec - viewStart) / totalSec) * w;
      const clipW = Math.max(2, endX - startX);
      const regionTop = 4;
      const regionH = h - 8;
      const recState = liveRecSession?.tracks?.get(track.id) || null;
      const sliceDur = liveRecSession?.sliceDurationSec || 0.02;
      const totalGainLinear = DE.dbToGain(trackGainDb);
      const msReadout = formatTimecode(recElapsedSec);

      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(startX, regionTop, clipW, regionH, 4);
      else ctx.rect(startX, regionTop, clipW, regionH);
      ctx.clip();

      // Deep ruby-obsidian live take container
      ctx.fillStyle = 'rgba(34, 10, 16, 0.92)';
      ctx.fillRect(startX, regionTop, clipW, regionH);

      // Crimson studio header bar
      ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
      ctx.fillRect(startX, regionTop, clipW, 17);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(startX, regionTop, clipW, 2.5);

      if (track.trackKind === 'video') {
        captureLiveRecordingVideoThumbIfDue(recElapsedSec);
        const bodyTop = regionTop + 17;
        const bodyH = Math.max(24, regionH - 17);
        const thumbTop = bodyTop + 5.5;
        const thumbH = Math.max(16, bodyH - 11);
        const cellW = Math.max(48, Math.round(thumbH * (16 / 9)));
        drawCinemaSprocketRails(ctx, startX, clipW, bodyTop, bodyH, w, false, 'rgba(248, 113, 113, 0.55)');
        const liveThumbs = liveRecSession?.videoThumbs || [];
        if (liveThumbs.length > 0 && recElapsedSec > 0.05) {
          const visLeft = Math.max(0, startX);
          const visRight = Math.min(w, startX + clipW);
          const firstSlot = Math.max(0, Math.floor((visLeft - startX) / cellW));
          const lastSlot = Math.max(firstSlot, Math.floor((visRight - startX) / cellW));
          for (let slot = firstSlot; slot <= lastSlot; slot++) {
            const cellX = startX + slot * cellW;
            const availW = Math.min(cellW, (startX + clipW) - cellX);
            if (availW <= 0.5) continue;
            const targetRelSec = ((slot * cellW + availW * 0.5) / Math.max(1, clipW)) * recElapsedSec;
            let best = liveThumbs[0];
            for (const lt of liveThumbs) {
              if (Math.abs(lt.relSec - targetRelSec) <= Math.abs(best.relSec - targetRelSec)) best = lt;
            }
            if (best?.canvas) {
              ctx.globalAlpha = 0.88;
              ctx.drawImage(best.canvas, 0, 0, 160 * (availW / cellW), 90, cellX, thumbTop, availW, thumbH);
              ctx.globalAlpha = 1.0;
              if (slot > 0) {
                ctx.fillStyle = 'rgba(20, 6, 10, 0.85)';
                ctx.fillRect(Math.round(cellX), thumbTop, 1.2, thumbH);
              }
            }
          }
        }
      }

      // Time-anchored live streaming Dual-Layer Peak + Core Waveform (aligned for pre-roll latency)
      const rawPeaks = recState?.peaks || [];
      const preRollSec = (Number.isFinite(liveRecSession?.earsStartWallMs) && Number.isFinite(liveRecSession?.firstSampleMicWallMs))
        ? Math.max(0, (liveRecSession.earsStartWallMs - liveRecSession.firstSampleMicWallMs) / 1000)
        : 0;
      const skipSlices = Math.min(rawPeaks.length, Math.max(0, Math.round(preRollSec / sliceDur)));
      const peaks = skipSlices > 0 ? rawPeaks.slice(skipSlices) : rawPeaks;
      const curTipPeak = Number(recState?.currentPeak) || 0;
      const totalSlices = peaks.length + (curTipPeak > 0.00039 ? 1 : 0);
      if (totalSlices > 0) {
        const pxPerSlice = (sliceDur / totalSec) * w;
        const midY = regionTop + 17 + (regionH - 19) / 2;
        const maxAmpH = (regionH - 22) / 2;

        if (pxPerSlice >= 1.15) {
          const barW = Math.max(1.1, pxPerSlice - (pxPerSlice > 2.4 ? 0.35 : 0.1));
          ctx.fillStyle = '#f87171';
          ctx.globalAlpha = 0.58;
          for (let i = 0; i < totalSlices; i++) {
            const sx = startX + i * pxPerSlice;
            if (sx > endX + 0.5) break;
            if (sx + barW < 0) continue;
            const rawP = i < peaks.length ? peaks[i] : curTipPeak;
            const amp = waveformVisualAmp(rawP, totalGainLinear, 0.012);
            const bh = amp * maxAmpH;
            ctx.fillRect(sx, midY - bh, Math.min(barW, Math.max(0.8, endX - sx)), bh * 2);
          }

          ctx.fillStyle = '#fecaca';
          ctx.globalAlpha = 0.94;
          for (let i = 0; i < totalSlices; i++) {
            const sx = startX + i * pxPerSlice;
            if (sx > endX + 0.5) break;
            if (sx + barW < 0) continue;
            const rawP = i < peaks.length ? peaks[i] : curTipPeak;
            const amp = Math.max(0.010, waveformVisualAmp(rawP, totalGainLinear, 0.010) * 0.68);
            const bh = amp * maxAmpH;
            ctx.fillRect(sx, midY - bh, Math.min(barW, Math.max(0.8, endX - sx)), bh * 2);
          }
          ctx.globalAlpha = 1.0;
        } else {
          const px0 = Math.max(0, Math.floor(startX));
          const px1 = Math.min(w, Math.ceil(endX));
          for (let pass = 0; pass < 2; pass++) {
            ctx.fillStyle = pass === 0 ? '#f87171' : '#fecaca';
            ctx.globalAlpha = pass === 0 ? 0.58 : 0.94;
            const floorAmp = pass === 0 ? 0.012 : 0.010;
            for (let col = px0; col < px1; col++) {
              const tCol0 = (viewStart + (col / w) * totalSec) - recStartSec;
              const tCol1 = (viewStart + ((col + 1) / w) * totalSec) - recStartSec;
              const s0 = Math.max(0, Math.floor(tCol0 / sliceDur));
              const s1 = Math.min(totalSlices - 1, Math.ceil(tCol1 / sliceDur));
              if (s0 > s1) continue;
              let maxP = 0;
              for (let s = s0; s <= s1; s++) {
                const v = s < peaks.length ? peaks[s] : curTipPeak;
                if (v > maxP) maxP = v;
              }
              const baseAmp = waveformVisualAmp(maxP, totalGainLinear, floorAmp);
              const amp = pass === 0 ? baseAmp : Math.max(floorAmp, baseAmp * 0.68);
              const bh = amp * maxAmpH;
              ctx.fillRect(col, midY - bh, 1, bh * 2);
            }
          }
          ctx.globalAlpha = 1.0;
        }
      }

      // Live Drum Replacement Transient Diamonds as hits cross threshold
      if (track.soundReplacement?.enabled && Array.isArray(recState?.hitTimesSec)) {
        for (const hitRelSec of recState.hitTimesSec) {
          const hx = startX + (hitRelSec / totalSec) * w;
          if (hx < 0 || hx > endX) continue;
          ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hx, regionTop + 19);
          ctx.lineTo(hx, regionTop + regionH - 2);
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(hx, regionTop + 18);
          ctx.lineTo(hx + 3.2, regionTop + 21.2);
          ctx.lineTo(hx, regionTop + 24.4);
          ctx.lineTo(hx - 3.2, regionTop + 21.2);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Inside-region header label once region is wide enough to hold it cleanly
      const peakTxt = recState && recState.maxPeakDb > -90 ? `${recState.maxPeakDb.toFixed(1)} dB` : 'LIVE';
      const trigTxt = track.soundReplacement?.enabled && recState?.hitTimesSec?.length
        ? ` · TRIG ${recState.hitTimesSec.length}`
        : '';
      if (clipW >= 145) {
        ctx.fillStyle = '#ffe4e6';
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.fillText(
          `REC ${msReadout} · ${track.name || 'Track'} · ${peakTxt}${trigTxt}`,
          startX + 6,
          regionTop + 12.5
        );
      }
      ctx.restore();

      // Sub-pixel Crisp Crimson Region Border + Write-Head Edge
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.35;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(startX, regionTop + 0.5, clipW, regionH - 1, 4);
      else ctx.rect(startX, regionTop + 0.5, clipW, regionH - 1);
      ctx.stroke();

      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(endX, regionTop);
      ctx.lineTo(endX, regionTop + regionH);
      ctx.stroke();

      // Floating fluid millisecond HUD badge tracking smoothly beside write-head when region is <145px
      if (clipW < 145) {
        const badgeText = `REC ${msReadout}`;
        ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
        const tw = ctx.measureText(badgeText).width;
        const bw = tw + 12;
        const bh = 17;
        const bx = (endX + 7 + bw <= w - 4) ? (endX + 7) : Math.max(4, startX - bw - 6);
        const by = regionTop + 2;
        ctx.fillStyle = 'rgba(24, 8, 13, 0.92)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3.5);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#ffe4e6';
        ctx.fillText(badgeText, bx + 6, by + 11.8);
      }
      ctx.restore();
    }

    // Sub-pixel anti-aliased Playhead cursor line (no Math.round staircase judder)
    const px = ((playheadSec - viewStart) / totalSec) * w;
    if (px >= -1 && px <= w + 1) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }
}

let lastRenderedInspectorOpen = false;

function renderInspectorDrawer() {
  const drawer = document.getElementById('track-inspector-drawer');
  if (!drawer) return;
  const track = (currentProject?.tracks || []).find(t => t.id === selectedTrackId);
  if (!track) {
    lastRenderedInspectorOpen = false;
    drawer.classList.add('hidden');
    return;
  }
  const justOpened = !lastRenderedInspectorOpen;
  lastRenderedInspectorOpen = true;
  drawer.classList.remove('hidden');

  const eq = track.fx?.eq || {};
  const comp = track.fx?.compressor || {};
  const exc = track.fx?.airExciter || {};
  const rev = track.fx?.reverb || {};
  const sr = track.soundReplacement || {};
  const kits = drumkitsStatus?.kits || [];
  const activeKit = kits.find(k => k.id === sr.kitId) || kits[0];
  const piecesObj = activeKit?.pieces || {};

  const kitOpts = kits.map(k => {
    const genre = k.genreTag ? `[${k.genreTag}] ` : '';
    const tag = k.isCustomDirectory ? `[Custom · ${k.sampleCount} samples]` : (k.installed ? '[Ready]' : '[Install]');
    return `<option value="${esc(k.id)}"${k.id === sr.kitId ? ' selected' : ''}>${esc(genre)}${esc(k.name)} ${esc(tag)}</option>`;
  }).join('');
  const pieceOpts = Object.values(piecesObj).map(p =>
    `<option value="${esc(p.id)}"${p.id === sr.pieceId ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');

  const curPlugins = Array.isArray(track.fx?.openSourcePlugins) ? track.fx.openSourcePlugins : [];
  const availablePluginLabels = Array.from(new Set([
    ...(vstDirsStatus?.discoveredPlugins || []).map(p => `${p.name} (${p.format})`),
    'x42 Parametric EQ4 (LV2)',
    'LSP Gate Mono (LV2)',
    'LSP Compressor Mono (LV2)',
    'Calf Vintage Compressor (LV2)',
    'Dragonfly Room Reverb (LV2)',
    'Guitarix Tube Amp (LV2)',
  ])).filter(lbl => !curPlugins.includes(lbl));
  const insertPluginOpts = `<option value="">+ Add VST / LV2 / CLAP Insert...</option>` +
    availablePluginLabels.slice(0, 120).map(lbl => `<option value="${esc(lbl)}">${esc(lbl)}</option>`).join('');
  const pluginChipsHtml = curPlugins.map((lbl, idx) =>
    `<span class="plugin-chip"><span>${esc(lbl)}</span><button type="button" data-rm-plugin-idx="${idx}" title="Remove plugin from chain">×</button></span>`
  ).join('');

  const totalTransients = (track.clips || []).reduce((n, c) => n + (c.transients?.length || 0), 0);
  const gainDb = Number(track.gainDb) || 0;
  const gangedTargets = selectedTrackIds.has(track.id) && selectedTrackIds.size > 1
    ? (currentProject?.tracks || []).filter(t => selectedTrackIds.has(t.id))
    : [track];
  const gangedBadge = gangedTargets.length > 1
    ? `<span class="selection-status-pill mono" style="margin-left:8px;">GANGED: ${gangedTargets.length} CHANNELS</span>`
    : '';

  if (isTrackLyrics(track)) {
    const primaryClip = track.clips?.[0] || null;
    const editorVal = primaryClip?.lrcText || (primaryClip?.lyricsData?.lines || []).map(l => l.text).join('\n') || '';
    const karPathText = primaryClip?.karFile || 'Generated on save (.kar + .lrc)';
    drawer.innerHTML = `
      <div class="inspector-top">
        <div class="inspector-title-row">
          ${DI.svg('lyrics', 20)}
          <div>
            <strong>MIDI KARAOKE LYRICS INSPECTOR — ${esc(track.name)}</strong>
            <span class="hint" style="margin-left:10px;">Standard MIDI File Format 1 (<code>0xFF 0x05</code> Lyric Meta-Events) · ${primaryClip?.lineCount || 0} lines · ${primaryClip?.wordCount || 0} synced words</span>
          </div>
        </div>
        <div class="btn-cluster">
          <button type="button" class="btn btn-sm btn-primary" id="btn-insp-open-karaoke-stage">${DI.svg('eye', 12)}<span>Open Karaoke Video Display</span></button>
          <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-import-lyrics-file">${DI.svg('folder-open', 12)}<span>Import .KAR / .MID / .LRC...</span></button>
          <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-close">${DI.svg('close', 12)}<span>Close</span></button>
        </div>
      </div>
      <div class="lyrics-inspector-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span class="hint">Edit synced Enhanced LRC (<code>[mm:ss.xx] &lt;mm:ss.xx&gt;Word</code>) or paste plain multi-line lyrics to re-align to vocal phrases &amp; write <code>.kar</code>:</span>
          <span class="mono" style="font-size:10.5px;color:#fcd34d;">${esc(karPathText)}</span>
        </div>
        <textarea id="insp-lyrics-textarea" class="lyrics-editor-textarea" spellcheck="false" placeholder="[00:04.00] First karaoke line&#10;[00:08.00] Second karaoke line">${esc(editorVal)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;">
          <button type="button" class="btn btn-sm btn-primary" id="btn-insp-save-lyrics">${DI.svg('check', 12)}<span>Sync &amp; Write MIDI .KAR</span></button>
        </div>
      </div>
    `;

    document.getElementById('btn-insp-close')?.addEventListener('click', () => {
      selectedTrackId = null;
      renderStudio();
    });
    document.getElementById('btn-insp-open-karaoke-stage')?.addEventListener('click', () => {
      toggleVideoOutputMonitor(track.id);
    });
    document.getElementById('btn-insp-import-lyrics-file')?.addEventListener('click', async () => {
      const prevSnap = DE.cloneDeep(currentProject);
      const res = await window.robos.updateLyricsClip({
        trackId: track.id,
        clipId: primaryClip?.id || null,
        browseFile: true,
        project: currentProject,
      });
      if (res?.canceled) return;
      if (!res?.ok || !res.project) {
        showStatus(`Import .KAR / .LRC failed: ${res?.error || 'Unknown error'}`, true);
        return;
      }
      historyStack.pushSnapshot(prevSnap, 'Import MIDI Karaoke Lyrics');
      currentProject = res.project;
      invalidateStaticTimelineCaches();
      markDirty(true);
      renderStudio();
      syncVideoOutputMonitor({ forcePush: true });
      showStatus(`Imported karaoke lyrics (${res.clip?.lineCount || 0} lines · ${res.clip?.wordCount || 0} MIDI words) into "${track.name}"`);
    });
    document.getElementById('btn-insp-save-lyrics')?.addEventListener('click', async () => {
      const rawTxt = document.getElementById('insp-lyrics-textarea')?.value || '';
      const prevSnap = DE.cloneDeep(currentProject);
      const res = await window.robos.updateLyricsClip({
        trackId: track.id,
        clipId: primaryClip?.id || null,
        lyricsText: rawTxt,
        project: currentProject,
      });
      if (!res?.ok || !res.project) {
        showStatus(`Failed to rebuild MIDI .KAR lyrics: ${res?.error || 'Unknown error'}`, true);
        return;
      }
      historyStack.pushSnapshot(prevSnap, 'Edit MIDI Karaoke Lyrics');
      currentProject = res.project;
      invalidateStaticTimelineCaches();
      markDirty(true);
      renderStudio();
      syncVideoOutputMonitor({ forcePush: true });
      showStatus(`Updated MIDI .KAR & .LRC lyrics on "${track.name}" (${res.clip?.wordCount || 0} synced words)`);
    });
    if (justOpened) {
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    return;
  }

  const vcfgInsp = track.trackKind === 'video' ? (track.videoConfig || {}) : null;
  const curVidQual = vcfgInsp?.qualityPreset || 'hd-1080p';
  const curVidAudio = vcfgInsp?.audioMode || 'none';
  const isRobosVid = Boolean(vcfgInsp && (vcfgInsp.isRobosAndroidCam || vcfgInsp.sourceType === 'robos-ip-camera'));
  const videoInspectorBarHtml = vcfgInsp ? `
    <div class="lyrics-inspector-card" style="border-color:rgba(168, 85, 247, 0.42);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span class="video-track-pill" style="margin:0;">${isRobosVid ? 'ROBOS IP CAMERA' : 'VIDEO INPUT'}</span>
          <span class="mono" style="font-size:11px;color:#cbd5e1;">${esc(vcfgInsp.streamUrl || vcfgInsp.devicePath || vcfgInsp.label || '')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <label class="hint" for="insp-vid-quality">Quality:</label>
          <select id="insp-vid-quality" class="select" style="height:26px;font-size:11px;padding:1px 7px;width:auto;">
            <option value="hd-1080p" ${curVidQual === 'hd-1080p' ? 'selected' : ''}>1080p Full HD (Default)</option>
            <option value="hd-720p" ${curVidQual === 'hd-720p' ? 'selected' : ''}>720p HD</option>
            <option value="sd-480p" ${curVidQual === 'sd-480p' ? 'selected' : ''}>480p SD</option>
            <option value="low-360p" ${curVidQual === 'low-360p' ? 'selected' : ''}>360p Low (/sub)</option>
          </select>
          <label class="hint" for="insp-vid-audio">Audio (Optional):</label>
          <select id="insp-vid-audio" class="select" style="height:26px;font-size:11px;padding:1px 7px;width:auto;">
            <option value="none" ${curVidAudio === 'none' ? 'selected' : ''}>Video Only (No Audio)</option>
            <option value="interface" ${curVidAudio === 'interface' ? 'selected' : ''}>Paired Audio Interface Input</option>
            <option value="stream" ${curVidAudio === 'stream' ? 'selected' : ''}>Camera Stream Audio</option>
          </select>
          ${isRobosVid ? `
            <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-robos-flip" title="Flip RobOS IP Camera Back / Front Lens">Flip Lens</button>
            <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-robos-torch" title="Toggle Phone Flashlight">Light</button>
            <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-robos-notimestamp" title="Hide surveillance timestamp overlay on RobOS IP Camera">Hide Timestamp</button>
          ` : ''}
        </div>
      </div>
    </div>
  ` : '';

  drawer.innerHTML = `
    <div class="inspector-top">
      <div class="inspector-title-row">
        ${DI.badge('channel-fx', 22)}
        <div>
          <strong>CHANNEL INSERT &amp; TRIGGER RACK — ${esc(track.name)}</strong>${gangedBadge}
          <span class="hint" style="margin-left:10px;">Input: ${esc(track.inputLabel)} · Chain: ${(track.fx?.openSourcePlugins || []).map(esc).join(' → ')}</span>
        </div>
      </div>
      <div class="btn-cluster">
        <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-norm-gain" title="Auto-normalize Track Input Gain so peak hits -6 dBFS">${DI.svg('bolt', 12)}<span>Auto-Gain (-6 dB)</span></button>
        <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-clear-clips">${DI.svg('trash', 12)}<span>Clear Regions (${track.clips?.length || 0})</span></button>
        <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-close">${DI.svg('close', 12)}<span>Close</span></button>
      </div>
    </div>
    ${videoInspectorBarHtml}

    <div class="inspector-grid">
      <div class="rack-module">
        <div class="mini-heading">PREAMP TRIM · POLARITY · PARAMETRIC EQ · DYNAMICS</div>
        <div class="dsp-sliders">
          <div class="slider-row">
            <label>Input Trim (${DE.formatDb(gainDb)})</label>
            <input type="checkbox" id="insp-phase-on" title="180° Phase Invert (Ø)" ${track.fx?.phaseInvert ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-gain-db" min="-24" max="36" step="0.5" value="${gainDb}" />
          </div>
          <div class="slider-row">
            <label>High-Pass (${eq.hpfHz || 60} Hz${Number(eq.hpfSlope) === 24 ? ' · 24dB' : ''})</label>
            <input type="checkbox" id="insp-eq-on" ${eq.enabled !== false ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-eq-hpf" min="20" max="800" step="5" value="${eq.hpfHz || 60}" />
          </div>
          <div class="slider-row">
            <label>Low Shelf (${eq.lowGainDb ?? 0} dB @ ${eq.lowFreqHz || 80}Hz)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-low" min="-12" max="12" step="0.5" value="${eq.lowGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Low-Mid (${eq.midGainDb ?? 0} dB @ ${eq.midFreqHz || 500}Hz)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-mid" min="-12" max="12" step="0.5" value="${eq.midGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Mid Punch (${eq.presenceGainDb ?? 0} dB @ ${((Number(eq.presenceFreqHz) || 2000) / 1000).toFixed(2).replace(/\.?0+$/, '')}kHz)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-presence" min="-12" max="18" step="0.5" value="${eq.presenceGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>High Air (${eq.highGainDb ?? 0} dB${eq.lpfHz ? ` · LPF ${(Number(eq.lpfHz) / 1000).toFixed(1)}k` : (eq.airGainDb ? ` · +${eq.airGainDb}dB@14k` : '')})</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-high" min="-12" max="16" step="0.5" value="${eq.highGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Cymbal Air Sheen (${Math.round((exc.mix ?? 0) * 100)}% Exciter)</label>
            <input type="checkbox" id="insp-exc-on" title="4x-Oversampled Studio High-Frequency Harmonic Air Exciter" ${exc.enabled ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-exc-mix" min="0" max="100" step="2" value="${Math.round((exc.mix ?? 0) * 100)}" />
          </div>
          <div class="slider-row">
            <label>Compressor (${comp.ratio ?? 3.5}:1${comp.makeupDb ? ` · +${comp.makeupDb}dB` : ''})</label>
            <input type="checkbox" id="insp-comp-on" ${comp.enabled !== false ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-comp-ratio" min="1" max="12" step="0.5" value="${comp.ratio ?? 3.5}" />
          </div>
          <div class="slider-row">
            <label>Studio Reverb (${Math.round((rev.mix ?? 0) * 100)}% ${rev.type === 'room' ? 'Room' : 'Plate'})</label>
            <input type="checkbox" id="insp-rev-on" ${rev.enabled ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-rev-mix" min="0" max="60" step="2" value="${Math.round((rev.mix ?? 0) * 100)}" />
          </div>
          <div class="slider-row">
            <label>Stereo Pan (${formatPan(track.pan)})</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-pan" min="-1" max="1" step="0.05" value="${track.pan || 0}" />
          </div>
        </div>
        <div style="margin-top:9px;padding-top:8px;border-top:1px solid #1d2838;">
          <div class="control-inline" style="justify-content:space-between;">
            <span class="mini-heading" style="margin:0;">PLUGIN INSERT CHAIN</span>
            <select id="insp-add-plugin-sel" class="select" style="max-width:230px;height:26px;font-size:11px;padding:2px 6px;">${insertPluginOpts}</select>
          </div>
          <div class="plugin-chip-row">${pluginChipsHtml || '<span class="hint">No external inserts assigned</span>'}</div>
        </div>
      </div>

      <div class="rack-module">
        <div class="sr-card-header" style="margin-bottom:8px;">
          <div class="inspector-title-row">
            ${DI.badge('drum-replace', 22)}
            <div>
              <div class="mini-heading" style="margin:0;">DRUM TRANSIENT SOUND REPLACEMENT</div>
              <span class="hint">${totalTransients} detected transient trigger(s) across regions</span>
            </div>
          </div>
          <label class="toggle-pill">
            <input type="checkbox" id="insp-sr-on" ${sr.enabled ? 'checked' : ''} />
            <span>${sr.enabled ? 'ACTIVE' : 'BYPASS'}</span>
          </label>
        </div>

        <div class="form-row">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <label style="margin:0;">Drum / Sample Library</label>
            <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-manage-vst" style="height:22px;padding:0 7px;font-size:10.5px;">${DI.svg('folder', 11)}<span>+ Add VST / Sample Dir</span></button>
          </div>
          <select id="insp-sr-kit" class="select">${kitOpts}</select>
        </div>
        <div class="form-row">
          <label>Target Drum Piece</label>
          <div class="control-inline">
            <select id="insp-sr-piece" class="select">${pieceOpts}</select>
            <button type="button" class="btn btn-sm btn-bevel" id="btn-insp-audition">${DI.svg('speaker', 12)}<span>Audition</span></button>
          </div>
        </div>
        <div class="dsp-sliders">
          <div class="slider-row">
            <label>Trigger Thresh (${sr.thresholdDb ?? -28} dB)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-sr-thresh" min="-48" max="-8" step="1" value="${sr.thresholdDb ?? -28}" />
          </div>
          <div class="slider-row">
            <label>Sample Blend (${Math.round((sr.blend ?? 0.75) * 100)}%)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-sr-blend" min="0" max="100" step="5" value="${Math.round((sr.blend ?? 0.75) * 100)}" />
          </div>
        </div>
      </div>
    </div>
  `;

  const saveInspectorPatch = async (label, mutator, reanalyze = false) => {
    await commitEdit(
      label,
      () => { for (const t of gangedTargets) mutator(t); },
      { reanalyzeTrackIds: reanalyze ? gangedTargets.map(t => t.id) : [] }
    );
  };

  document.getElementById('btn-insp-close')?.addEventListener('click', () => {
    selectedTrackId = null;
    drawer.classList.add('hidden');
    renderStudio();
  });
  document.getElementById('insp-vid-quality')?.addEventListener('change', (e) => {
    const nextQ = e.target.value || 'hd-1080p';
    saveInspectorPatch('Change Video Quality', (t) => {
      if (!t.videoConfig) return;
      t.videoConfig.qualityPreset = nextQ;
      if (t.videoConfig.isRobosAndroidCam || t.videoConfig.sourceType === 'robos-ip-camera') {
        const pathPart = getRobosStreamPathForQuality(nextQ);
        if (t.videoConfig.streamUrl) {
          t.videoConfig.streamUrl = t.videoConfig.streamUrl.replace(/\/(video|sub)(\?.*)?$/i, `${pathPart}$2`);
        }
      }
      const qShort = nextQ === 'hd-1080p' ? '1080p Full HD' : (nextQ === 'hd-720p' ? '720p HD' : (nextQ === 'sd-480p' ? '480p SD' : '360p Low'));
      const camLbl = t.videoConfig.shortName || 'Video Cam';
      t.inputLabel = t.videoConfig.audioMode === 'interface'
        ? `${camLbl} (${qShort}) + Audio Input`
        : (t.videoConfig.audioMode === 'stream' ? `${camLbl} (${qShort}) + Stream Audio` : `${camLbl} (${qShort}) · Video Only`);
    });
  });
  document.getElementById('insp-vid-audio')?.addEventListener('change', (e) => {
    const nextAudio = e.target.value || 'none';
    const ordered = getOrderedInputs();
    saveInspectorPatch('Change Video Optional Audio Mode', (t) => {
      if (!t.videoConfig) return;
      t.videoConfig.audioMode = nextAudio;
      if (nextAudio === 'interface' && !t.inputNodeName && ordered[0]) {
        t.inputNodeName = ordered[0].name;
      } else if (nextAudio !== 'interface') {
        t.inputNodeName = '';
      }
      const qShort = t.videoConfig.qualityPreset === 'hd-720p' ? '720p HD' : '1080p Full HD';
      const camLbl = t.videoConfig.shortName || 'Video Cam';
      t.inputLabel = nextAudio === 'interface'
        ? `${camLbl} (${qShort}) + Audio Input`
        : (nextAudio === 'stream' ? `${camLbl} (${qShort}) + Stream Audio` : `${camLbl} (${qShort}) · Video Only`);
    });
  });
  document.getElementById('btn-insp-robos-flip')?.addEventListener('click', async () => {
    if (!track.videoConfig) return;
    const probed = await window.robos?.probeRobosIpCamera?.({
      hostOrUrl: track.videoConfig.baseUrl || track.videoConfig.streamUrl || track.videoConfig.host,
      port: track.videoConfig.port || 8080,
      username: track.videoConfig.username,
      password: track.videoConfig.password,
    });
    const nextLens = probed?.status?.lensFacing === 'FRONT' ? 'BACK' : 'FRONT';
    const res = await window.robos?.controlRobosIpCamera?.({ videoConfig: track.videoConfig, command: { lens: nextLens } });
    if (res?.ok) showStatus(`Switched "${track.name}" to ${nextLens} camera lens`);
  });
  document.getElementById('btn-insp-robos-torch')?.addEventListener('click', async () => {
    if (!track.videoConfig) return;
    const res = await window.robos?.controlRobosIpCamera?.({ videoConfig: track.videoConfig, command: { toggleTorch: true } });
    if (res?.ok) showStatus(`Toggled LED flashlight on "${track.name}"`);
  });
  document.getElementById('btn-insp-robos-notimestamp')?.addEventListener('click', async () => {
    if (!track.videoConfig) return;
    const res = await window.robos?.controlRobosIpCamera?.({ videoConfig: track.videoConfig, command: { overlayTimestamp: false } });
    if (res?.ok) showStatus(`Disabled surveillance timestamp watermark on "${track.name}"`);
  });
  document.getElementById('btn-insp-norm-gain')?.addEventListener('click', async () => {
    await commitEdit('Auto-Normalize Track Gain', () => {
      for (const t of gangedTargets) DE.normalizeTrackGain(t, -6.0);
    }, { statusMsg: `Normalized ${gangedTargets.length} channel(s) to -6.0 dBFS target` });
  });
  document.getElementById('btn-insp-clear-clips')?.addEventListener('click', async () => {
    await commitEdit('Clear Track Takes', () => {
      for (const t of gangedTargets) t.clips = [];
    });
  });
  document.getElementById('btn-insp-audition')?.addEventListener('click', () => {
    auditionDrumPiece(
      document.getElementById('insp-sr-kit')?.value || sr.kitId,
      document.getElementById('insp-sr-piece')?.value || sr.pieceId
    );
  });
  document.getElementById('btn-insp-manage-vst')?.addEventListener('click', () => {
    openVstDirectoriesModal();
  });
  document.getElementById('insp-add-plugin-sel')?.addEventListener('change', e => {
    const pluginLabel = e.target.value;
    if (!pluginLabel) return;
    saveInspectorPatch('Add Insert Plugin', t => {
      const existing = Array.isArray(t.fx?.openSourcePlugins) ? t.fx.openSourcePlugins : [];
      if (!existing.includes(pluginLabel)) {
        t.fx = { ...(t.fx || {}), openSourcePlugins: [...existing, pluginLabel] };
      }
    });
  });
  drawer.querySelectorAll('[data-rm-plugin-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const rmIdx = Number(btn.dataset.rmPluginIdx);
      const rmName = curPlugins[rmIdx];
      saveInspectorPatch('Remove Insert Plugin', t => {
        const existing = Array.isArray(t.fx?.openSourcePlugins) ? t.fx.openSourcePlugins : [];
        t.fx = { ...(t.fx || {}), openSourcePlugins: existing.filter(p => p !== rmName) };
      });
    });
  });

  const gangedIdSet = new Set(gangedTargets.map(t => t.id));
  const bindLiveInspectorSlider = (id, undoLabel, mutatorFn, { formatLabel = null, hotSwapOnInput = false, syncTrackRow = null } = {}) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    const lblEl = inp.closest('.slider-row')?.querySelector('label');
    let snapSaved = false;
    inp.addEventListener('pointerdown', () => { snapSaved = false; });
    inp.addEventListener('input', (e) => {
      if (!currentProject) return;
      if (!snapSaved) {
        historyStack.pushSnapshot(currentProject, undoLabel);
        snapSaved = true;
        updateEditToolbarState();
      }
      for (const t of gangedTargets) mutatorFn(t, e.target.value);
      if (lblEl && typeof formatLabel === 'function') {
        lblEl.textContent = formatLabel(track, e.target.value);
      }
      if (typeof syncTrackRow === 'function') {
        syncTrackRow(e.target.value);
      }
      markDirty(true);
      if (hotSwapOnInput) {
        if (isPlaying || isRecording) seamlessRefreshLiveAudio();
      } else {
        applyLiveTrackParamsInPlace(gangedIdSet);
      }
    });
    inp.addEventListener('change', async (e) => {
      if (!snapSaved && currentProject) {
        historyStack.pushSnapshot(currentProject, undoLabel);
        for (const t of gangedTargets) mutatorFn(t, e.target.value);
        markDirty(true);
        if (hotSwapOnInput) {
          if (isPlaying || isRecording) seamlessRefreshLiveAudio();
        } else {
          applyLiveTrackParamsInPlace(gangedIdSet);
        }
      }
      snapSaved = false;
      await syncProjectToMain();
    });
  };

  bindLiveInspectorSlider(
    'insp-gain-db',
    'Adjust Input Gain',
    (t, val) => { t.gainDb = DE.clamp(-24, 36, Number(val) || 0); },
    {
      formatLabel: (t) => `Input Trim (${DE.formatDb(Number(t.gainDb) || 0)})`,
      syncTrackRow: () => {
        const listEl = document.getElementById('tracks-list');
        for (const t of gangedTargets) {
          const gVal = Number(t.gainDb) || 0;
          const ob = document.getElementById(`gain-badge-${t.id}`);
          if (ob) {
            ob.textContent = DE.formatDb(gVal);
            ob.classList.toggle('boosted', Math.abs(gVal) >= 0.05);
          }
          const sl = listEl?.querySelector(`input[data-act="gain"][data-id="${t.id}"]`);
          if (sl) sl.value = gVal.toFixed(1);
        }
        drawAllTimelineCanvases();
      },
    }
  );
  document.getElementById('insp-phase-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Phase Invert', t => { t.fx = { ...(t.fx || {}), phaseInvert: e.target.checked }; })
  );
  document.getElementById('insp-eq-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle EQ', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), enabled: e.target.checked } }; })
  );
  bindLiveInspectorSlider(
    'insp-eq-hpf',
    'Adjust HPF',
    (t, val) => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), hpfHz: Number(val) } }; },
    { formatLabel: (t) => `High-Pass (${t.fx?.eq?.hpfHz || 60} Hz${Number(t.fx?.eq?.hpfSlope) === 24 ? ' · 24dB' : ''})` }
  );
  bindLiveInspectorSlider(
    'insp-eq-low',
    'Adjust Low Shelf',
    (t, val) => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), lowGainDb: Number(val) } }; },
    { formatLabel: (t) => `Low Shelf (${t.fx?.eq?.lowGainDb ?? 0} dB @ ${t.fx?.eq?.lowFreqHz || 80}Hz)` }
  );
  bindLiveInspectorSlider(
    'insp-eq-mid',
    'Adjust Low-Mid EQ',
    (t, val) => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), midGainDb: Number(val) } }; },
    { formatLabel: (t) => `Low-Mid (${t.fx?.eq?.midGainDb ?? 0} dB @ ${t.fx?.eq?.midFreqHz || 500}Hz)` }
  );
  bindLiveInspectorSlider(
    'insp-eq-presence',
    'Adjust Mid Punch',
    (t, val) => {
      const nextPresence = Number(val) || 0;
      const prevEq = t.fx?.eq || {};
      const nextEq = {
        ...prevEq,
        presenceFreqHz: Number(prevEq.presenceFreqHz) || 2000,
        presenceGainDb: nextPresence,
      };
      if (Number.isFinite(Number(prevEq.punchFreqHz))) {
        nextEq.punchGainDb = Math.round(nextPresence * 0.9 * 2) / 2;
      }
      t.fx = { ...(t.fx || {}), eq: nextEq };
    },
    {
      formatLabel: (t) => {
        const pFreq = ((Number(t.fx?.eq?.presenceFreqHz) || 2000) / 1000).toFixed(2).replace(/\.?0+$/, '');
        return `Mid Punch (${t.fx?.eq?.presenceGainDb ?? 0} dB @ ${pFreq}kHz)`;
      },
    }
  );
  bindLiveInspectorSlider(
    'insp-eq-high',
    'Adjust High EQ',
    (t, val) => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), highGainDb: Number(val) } }; },
    {
      formatLabel: (t) => {
        const teq = t.fx?.eq || {};
        const suffix = teq.lpfHz
          ? ` · LPF ${(Number(teq.lpfHz) / 1000).toFixed(1)}k`
          : (teq.airGainDb ? ` · +${teq.airGainDb}dB@14k` : '');
        return `High Air (${teq.highGainDb ?? 0} dB${suffix})`;
      },
    }
  );
  document.getElementById('insp-exc-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Cymbal Air Exciter', t => {
      const prev = t.fx?.airExciter || {};
      t.fx = {
        ...(t.fx || {}),
        airExciter: {
          freqHz: prev.freqHz || 5800,
          drive: prev.drive || 2.7,
          ...prev,
          enabled: e.target.checked,
          mix: e.target.checked && !(Number(prev.mix) > 0) ? 0.45 : (Number(prev.mix) || 0),
        },
      };
    })
  );
  bindLiveInspectorSlider(
    'insp-exc-mix',
    'Adjust Cymbal Air Sheen',
    (t, val) => {
      const mix = DE.clamp(0, 1.0, (Number(val) || 0) / 100);
      const prev = t.fx?.airExciter || {};
      t.fx = {
        ...(t.fx || {}),
        airExciter: {
          freqHz: prev.freqHz || 5800,
          drive: prev.drive || 2.7,
          ...prev,
          enabled: mix > 0.005,
          mix,
        },
      };
    },
    {
      formatLabel: (t) => `Cymbal Air Sheen (${Math.round((t.fx?.airExciter?.mix ?? 0) * 100)}% Exciter)`,
      syncTrackRow: (val) => {
        const chk = document.getElementById('insp-exc-on');
        if (chk) chk.checked = (Number(val) || 0) > 0.5;
      },
    }
  );
  document.getElementById('insp-comp-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Compressor', t => { t.fx = { ...(t.fx || {}), compressor: { ...(t.fx?.compressor || {}), enabled: e.target.checked } }; })
  );
  bindLiveInspectorSlider(
    'insp-comp-ratio',
    'Adjust Compressor Ratio',
    (t, val) => { t.fx = { ...(t.fx || {}), compressor: { ...(t.fx?.compressor || {}), ratio: Number(val) } }; },
    { formatLabel: (t) => `Compressor (${t.fx?.compressor?.ratio ?? 3.5}:1${t.fx?.compressor?.makeupDb ? ` · +${t.fx.compressor.makeupDb}dB` : ''})` }
  );
  document.getElementById('insp-rev-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Studio Reverb', t => {
      const prev = t.fx?.reverb || {};
      t.fx = {
        ...(t.fx || {}),
        reverb: {
          type: prev.type || 'plate',
          decaySec: prev.decaySec || 1.2,
          preDelayMs: prev.preDelayMs ?? 20,
          dampHz: prev.dampHz || 7200,
          ...prev,
          enabled: e.target.checked,
          mix: e.target.checked && !(Number(prev.mix) > 0) ? 0.20 : (Number(prev.mix) || 0),
        },
      };
    })
  );
  bindLiveInspectorSlider(
    'insp-rev-mix',
    'Adjust Reverb Mix',
    (t, val) => {
      const mix = DE.clamp(0, 0.85, (Number(val) || 0) / 100);
      const prev = t.fx?.reverb || {};
      t.fx = {
        ...(t.fx || {}),
        reverb: {
          type: prev.type || 'plate',
          decaySec: prev.decaySec || 1.2,
          preDelayMs: prev.preDelayMs ?? 20,
          dampHz: prev.dampHz || 7200,
          ...prev,
          enabled: mix > 0.005,
          mix,
        },
      };
    },
    {
      formatLabel: (t) => `Studio Reverb (${Math.round((t.fx?.reverb?.mix ?? 0) * 100)}% ${t.fx?.reverb?.type === 'room' ? 'Room' : 'Plate'})`,
      syncTrackRow: (val) => {
        const chk = document.getElementById('insp-rev-on');
        if (chk) chk.checked = (Number(val) || 0) > 0.5;
      },
    }
  );
  bindLiveInspectorSlider(
    'insp-pan',
    'Adjust Pan',
    (t, val) => { t.pan = Number(val); },
    {
      formatLabel: (t) => `Stereo Pan (${formatPan(t.pan)})`,
      syncTrackRow: () => {
        const listEl = document.getElementById('tracks-list');
        for (const t of gangedTargets) {
          const pb = listEl?.querySelector(`[data-act="pan-reset"][data-id="${t.id}"]`);
          if (pb) pb.textContent = formatPan(t.pan);
        }
      },
    }
  );

  document.getElementById('insp-sr-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Sound Replacement', t => {
      t.soundReplacement = { ...(t.soundReplacement || {}), enabled: e.target.checked, supported: true };
    }, true)
  );
  document.getElementById('insp-sr-kit')?.addEventListener('change', e => {
    const chosenKit = (drumkitsStatus.kits || []).find(k => k.id === e.target.value);
    const firstPiece = chosenKit ? Object.keys(chosenKit.pieces || {})[0] : 'snare';
    saveInspectorPatch('Select Drum Kit', t => {
      const curPiece = t.soundReplacement?.pieceId || sr.pieceId;
      t.soundReplacement = {
        ...(t.soundReplacement || {}),
        kitId: e.target.value,
        pieceId: chosenKit?.pieces?.[curPiece] ? curPiece : firstPiece,
      };
    });
  });
  document.getElementById('insp-sr-piece')?.addEventListener('change', e =>
    saveInspectorPatch('Select Drum Piece', t => {
      t.soundReplacement = { ...(t.soundReplacement || {}), pieceId: e.target.value };
    })
  );
  document.getElementById('insp-sr-thresh')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Trigger Threshold', t => {
      t.soundReplacement = { ...(t.soundReplacement || {}), thresholdDb: Number(e.target.value) };
    }, true)
  );
  bindLiveInspectorSlider(
    'insp-sr-blend',
    'Adjust Replacement Blend',
    (t, val) => { t.soundReplacement = { ...(t.soundReplacement || {}), blend: Number(val) / 100 }; },
    {
      formatLabel: (t) => `Sample Blend (${Math.round((t.soundReplacement?.blend ?? 0.75) * 100)}%)`,
      hotSwapOnInput: true,
    }
  );

  if (justOpened) {
    requestAnimationFrame(() => {
      drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

// ─── DAW Editing Actions, Top Menu Bar & Right-Click Context Menus ──────────

function closeContextMenu() {
  const menu = document.getElementById('daw-context-menu');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
}

function closeMenubarDropdown() {
  activeMenubarKey = null;
  document.querySelectorAll('.menubar-trigger').forEach(b => b.classList.remove('open'));
  const popup = document.getElementById('daw-menubar-popup');
  if (popup) {
    popup.classList.add('hidden');
    popup.innerHTML = '';
  }
}

function positionContextMenu(menu, clientX, clientY) {
  menu.classList.remove('hidden');
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const x = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 10));
  const y = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 10));
  menu.style.left = `${Math.round(x)}px`;
  menu.style.top = `${Math.round(y)}px`;
}

function openRenameModal(title, labelText, initialValue, onConfirm) {
  renameModalCallback = onConfirm;
  const modal = document.getElementById('rename-item-modal');
  const titleEl = document.getElementById('rename-modal-title');
  const lblEl = document.getElementById('rename-modal-label');
  const inpEl = document.getElementById('rename-modal-input');
  if (!modal || !inpEl) return;
  if (titleEl) titleEl.textContent = title;
  if (lblEl) lblEl.textContent = labelText;
  inpEl.value = initialValue || '';
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    inpEl.focus();
    inpEl.select();
  });
}

function closeRenameModal() {
  renameModalCallback = null;
  document.getElementById('rename-item-modal')?.classList.add('hidden');
}

// ─── Track Creation, Batch Track Actions, WAV Import & Stereo Mixdown ───────

async function createNewSession() {
  stopPlayback();
  const res = await window.robos.projectNew({ name: 'New Studio Drum & Band Session', bpm: 120 });
  if (res?.ok) {
    historyStack.clear();
    currentProject = res.project;
    selectedTrackId = null;
    selectedTrackIds.clear();
    anchorTrackId = null;
    selectedClipIds.clear();
    anchorClipId = null;
    playheadSec = 0;
    timelineOffsetSec = 0;
    document.getElementById('transport-timecode').textContent = formatTimecode(0);
    markDirty(false);
    switchView('studio-stage');
    renderStudio();
    showStatus('Created new studio session.');
  }
}

async function addBlankAudioTracks(count = 1, { profileId = null, afterTrackId = null } = {}) {
  const prevSnap = currentProject ? DE.cloneDeep(currentProject) : null;
  const res = await window.robos.addBlankTracks({
    count,
    profileId,
    armed: true,
    afterTrackId,
  });
  if (!res?.ok || !res.project) {
    showStatus(`Failed to add track(s): ${res?.error || 'Unknown error'}`, true);
    return;
  }
  if (prevSnap) historyStack.pushSnapshot(prevSnap, `Add ${res.addedTracks?.length || count} Track(s)`);
  currentProject = res.project;
  const addedIds = (res.addedTracks || []).map(t => t.id);
  selectedClipIds.clear();
  anchorClipId = null;
  selectedTrackIds = new Set(addedIds);
  anchorTrackId = addedIds[0] || null;
  markDirty(true);
  switchView('studio-stage');
  renderStudio();
  const labelSummary = (res.addedTracks || []).map(t => `${t.name} (${t.inputLabel})`).slice(0, 3).join(', ');
  showStatus(`Added ${addedIds.length} armed audio track(s): ${labelSummary}${addedIds.length > 3 ? '...' : ''}`);
}

async function armSelectedTracks() {
  if (!currentProject) return;
  if (selectedTrackIds.size === 0) {
    await armAllTracks();
    return;
  }
  const cnt = selectedTrackIds.size;
  await commitEdit('Arm Selected Track(s)', () => {
    DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'armed', true);
  }, { statusMsg: `Armed ${cnt} selected track(s)` });
}

async function disarmSelectedTracks() {
  if (!currentProject || !selectedTrackIds.size) return;
  const cnt = selectedTrackIds.size;
  await commitEdit('Disarm Selected Track(s)', () => {
    DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'armed', false);
  }, { statusMsg: `Disarmed ${cnt} selected track(s)` });
}

async function armAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) {
    showStatus('No tracks in session yet — press Ctrl+T or + Track first.', true);
    return;
  }
  const hwIds = new Set(
    (currentProject.tracks || [])
      .filter(t => Boolean(t.inputNodeName) || !(t.clips || []).some(c => c.sourceFile || c.mediaKind))
      .map(t => t.id)
  );
  const target = hwIds.size > 0 ? hwIds : 'all';
  const count = target === 'all' ? currentProject.tracks.length : hwIds.size;
  await commitEdit('Arm All Tracks', () => {
    DE.setTracksPropertyBatch(currentProject, 'all', 'armed', false);
    DE.setTracksPropertyBatch(currentProject, target, 'armed', true);
  }, { statusMsg: `Armed ${count} hardware capture track(s) (backing media tracks kept ready for playback)` });
}

async function disarmAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  await commitEdit('Disarm All Tracks', () => {
    DE.setTracksPropertyBatch(currentProject, 'all', 'armed', false);
  }, { statusMsg: `Disarmed all ${currentProject.tracks.length} tracks` });
}

async function removeSelectedTracks() {
  if (!currentProject || !selectedTrackIds.size) {
    showStatus('Check or select one or more tracks first to remove them.', true);
    return;
  }
  const cnt = selectedTrackIds.size;
  await commitEdit('Remove Selected Track(s)', () => {
    DE.deleteTracksFromProject(currentProject, selectedTrackIds);
  }, { statusMsg: `Removed ${cnt} track(s) (Press Ctrl+Z to Undo)` });
}

async function removeAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  const total = currentProject.tracks.length;
  await commitEdit('Remove All Tracks', () => {
    currentProject.tracks = [];
  }, { statusMsg: `Removed all ${total} tracks from session (Press Ctrl+Z to Undo)` });
}

function editSelectAllTracksOnly() {
  if (!currentProject) return;
  const res = DE.selectAllTracksOnly(currentProject);
  selectedTrackIds = res.selectedTrackIds;
  selectedClipIds = res.selectedClipIds;
  anchorClipId = null;
  anchorTrackId = currentProject.tracks?.[0]?.id || null;
  renderStudio();
  showStatus(`Selected all ${selectedTrackIds.size} track(s) (regions deselected — ready for batch actions)`);
}

function editSelectAllClipsOnly() {
  if (!currentProject) return;
  const res = DE.selectAllClipsOnly(currentProject);
  selectedTrackIds = res.selectedTrackIds;
  selectedClipIds = res.selectedClipIds;
  anchorTrackId = null;
  renderStudio();
  showStatus(`Selected all ${selectedClipIds.size} audio region(s) across timeline`);
}

function editInvertTrackSelection() {
  if (!currentProject) return;
  selectedClipIds.clear();
  selectedTrackIds = DE.invertTrackSelection(currentProject, selectedTrackIds);
  anchorTrackId = [...selectedTrackIds][0] || null;
  renderStudio();
  showStatus(`Inverted track selection (${selectedTrackIds.size} track(s) selected)`);
}

async function editTrimToPlayhead(edge /* 'left' | 'right' */) {
  if (!currentProject) return;
  let trimmed = 0;
  await commitEdit(edge === 'left' ? 'Trim Start to Playhead' : 'Trim End to Playhead', () => {
    trimmed = DE.trimClipsToPlayhead(currentProject, selectedClipIds, edge, playheadSec, selectedTrackIds);
  });
  if (trimmed > 0) {
    showStatus(`Trimmed ${trimmed} region(s) ${edge === 'left' ? 'start' : 'end'} to playhead (${formatTimecode(playheadSec)})`);
  } else {
    showStatus('Place playhead inside a selected region or track before trimming ([ or ]).', true);
  }
}

let isGeneratingClickTrack = false;
let isRemovingDrums = false;

async function removeDrumsUnderTrack(track) {
  if (!track || !currentProject) return;
  if (isRemovingDrums) {
    showStatus('Already removing drums from stem — please wait for separation to finish...');
    return;
  }
  const activeClips = (track.clips || []).filter(c => !c.muted && c.wavFile);
  if (!activeClips.length) {
    showStatus(`Track "${track.name}" has no audible audio regions to remove drums from.`, true);
    return;
  }

  stopPlayback();
  isRemovingDrums = true;
  const prevSnap = DE.cloneDeep(currentProject);
  showStatus(`Analyzing "${track.name}" with Gemini RobOS Agent & separating drumless stem...`);

  await runDawJob({
    title: `Remove Drums (${track.name})`,
    category: 'STEMS',
    detail: `Analyzing "${track.name}" & separating drumless stem...`,
    progress: 15,
  }, async (job) => {
    let progressUnsub = null;
    if (typeof window.robos?.onRemoveDrumsProgress === 'function') {
      progressUnsub = window.robos.onRemoveDrumsProgress((p) => {
        if (p?.message) {
          showStatus(p.message);
          job.update({
            detail: p.message,
            ...(Number.isFinite(Number(p.percent)) ? { progress: Number(p.percent) } : {}),
          });
        }
      });
    }

    try {
      const res = await window.robos.removeDrumsFromTrack({
        trackId: track.id,
        preferredProvider: 'antigravity',
        project: currentProject,
      });
      if (!res?.ok || !res.project) {
        const errMsg = res?.error || 'Unknown error';
        showStatus(`Remove Drums failed: ${errMsg}`, true);
        job.fail(errMsg);
        return res;
      }

      historyStack.pushSnapshot(prevSnap, `Remove Drums (${track.name})`);
      currentProject = res.project;
      for (const c of (res.drumlessTrack?.clips || [])) {
        if (c.wavFile) decodedBufferCache.delete(c.wavFile);
      }
      if (res.drumlessTrack?.id) {
        selectedTrackIds = new Set([res.drumlessTrack.id]);
        anchorTrackId = res.drumlessTrack.id;
      }
      selectedClipIds = new Set(res.createdClipIds || []);

      markDirty(true);
      renderStudio();
      const firstOutWav = res.drumlessTrack?.clips?.[0]?.wavFile || '';
      const doneMsg = `Created "${res.drumlessTrack?.name || 'No Drums'}" directly below "${track.name}" (muted original stem · ${res.provider}) — press Space to play!`;
      showStatus(doneMsg);
      job.complete({
        detail: `Created "${res.drumlessTrack?.name || 'No Drums'}" via ${res.provider}`,
        outputPath: firstOutWav,
        ...(firstOutWav ? { actionLabel: 'Reveal' } : {}),
      });
      return res;
    } finally {
      if (typeof progressUnsub === 'function') {
        try { progressUnsub(); } catch {}
      }
      isRemovingDrums = false;
    }
  });
}

async function generateClickTrackUnderTrack(track) {
  if (!track || !currentProject) return;
  if (isGeneratingClickTrack) {
    showStatus('Already analyzing track and generating AI click track — please wait a moment...');
    return;
  }
  const activeClips = (track.clips || []).filter(c => !c.muted && c.wavFile);
  if (!activeClips.length) {
    showStatus(`Track "${track.name}" has no audible audio regions to align a click track to.`, true);
    return;
  }

  stopPlayback();
  isGeneratingClickTrack = true;
  const prevSnap = DE.cloneDeep(currentProject);
  showStatus(`Analyzing "${track.name}" with Gemini RobOS Agent & generating aligned click track + 1-measure count-off...`);

  await runDawJob({
    title: `Generate Click Track (${track.name})`,
    category: 'CLICK AI',
    detail: `Analyzing tempo & beats on "${track.name}"...`,
    progress: 15,
  }, async (job) => {
    let progressUnsub = null;
    if (typeof window.robos?.onClickTrackProgress === 'function') {
      progressUnsub = window.robos.onClickTrackProgress((p) => {
        if (p?.message) {
          showStatus(p.message);
          job.update({
            detail: p.message,
            ...(Number.isFinite(Number(p.percent)) ? { progress: Number(p.percent) } : {}),
          });
        }
      });
    }

    try {
      const res = await window.robos.generateClickTrack({
        trackId: track.id,
        preferredProvider: 'antigravity',
        project: currentProject,
      });
      if (!res?.ok || !res.project) {
        const errMsg = res?.error || 'Unknown error';
        showStatus(`Generate Click Track failed: ${errMsg}`, true);
        job.fail(errMsg);
        return res;
      }

      historyStack.pushSnapshot(prevSnap, `Generate Click Track (${track.name})`);
      currentProject = res.project;
      if (res.clickClip?.wavFile) {
        decodedBufferCache.delete(res.clickClip.wavFile);
      }
      if (res.clickTrack?.id) {
        selectedTrackIds = new Set([res.clickTrack.id]);
        anchorTrackId = res.clickTrack.id;
      }
      selectedClipIds = res.clickClip?.id ? new Set([res.clickClip.id]) : new Set();

      playheadSec = Number(res.countInStartSec) || 0;
      playReturnAnchorSec = playheadSec;
      const tcEl = document.getElementById('transport-timecode');
      if (tcEl) tcEl.textContent = formatTimecode(playheadSec);
      ensurePlayheadInViewport(playheadSec);

      markDirty(true);
      renderStudio();
      const shiftNote = res.timelineShiftSec > 0
        ? ` (shifted session +${res.timelineShiftSec.toFixed(2)}s to fit 1-bar count-in)`
        : '';
      const tempoDesc = Array.isArray(res.tempoSegments) && res.tempoSegments.length >= 2
        ? `${res.tempoSegments.map(s => Math.round(s.bpm)).join(' -> ')} BPM (${res.tempoSegments.length} sections)`
        : `${res.bpm} BPM`;
      showStatus(
        `Generated Click Track under "${track.name}" (${tempoDesc} · ${res.timeSignature}, 1-bar count-in @ ${formatTimecode(playheadSec)}) via ${res.provider}${shiftNote} — press Space to play!`
      );
      job.complete({
        detail: `Aligned Click (${tempoDesc} · ${res.timeSignature})`,
        outputPath: res.clickClip?.wavFile || '',
        ...(res.clickClip?.wavFile ? { actionLabel: 'Reveal' } : {}),
      });
      return res;
    } finally {
      if (typeof progressUnsub === 'function') {
        try { progressUnsub(); } catch {}
      }
      isGeneratingClickTrack = false;
    }
  });
}

async function createLyricsTrackUnderTrack(track, { clipId = null } = {}) {
  if (!track || !currentProject) return;
  if (isCreatingLyricsTrack) {
    showStatus('Already creating MIDI-mapped Karaoke Lyrics track — please wait a moment...');
    return;
  }
  const activeClips = (track.clips || []).filter(c => !c.muted && (!clipId || c.id === clipId));
  if (!activeClips.length) {
    showStatus(`Track "${track.name}" has no active music/audio regions to map lyrics to.`, true);
    return;
  }

  stopPlayback();
  isCreatingLyricsTrack = true;
  const prevSnap = DE.cloneDeep(currentProject);
  showStatus(`Creating MIDI-mapped Karaoke Lyrics (.KAR 0xFF 05) for "${track.name}"...`);

  await runDawJob({
    title: `Create Lyrics Track (${track.name})`,
    category: 'MIDI .KAR',
    detail: `Mapping MIDI Karaoke (.KAR 0xFF 05) for "${track.name}"...`,
    progress: 18,
  }, async (job) => {
    let progressUnsub = null;
    if (typeof window.robos?.onLyricsProgress === 'function') {
      progressUnsub = window.robos.onLyricsProgress((p) => {
        if (p?.message) {
          showStatus(p.message);
          job.update({
            detail: p.message,
            ...(Number.isFinite(Number(p.percent)) ? { progress: Number(p.percent) } : {}),
          });
        }
      });
    }

    try {
      const res = await window.robos.createLyricsTrack({
        trackId: track.id,
        clipId,
        project: currentProject,
      });
      if (!res?.ok || !res.project) {
        const errMsg = res?.error || 'Unknown error';
        showStatus(`Create Lyrics Track failed: ${errMsg}`, true);
        job.fail(errMsg);
        return res;
      }

      historyStack.pushSnapshot(prevSnap, `Create Lyrics Track (${track.name})`);
      currentProject = res.project;
      if (res.lyricsTrack?.id) {
        selectedTrackIds = new Set([res.lyricsTrack.id]);
        anchorTrackId = res.lyricsTrack.id;
        // If no video track was already selected, point Video Output to the Karaoke stage and open the Video Display!
        if (!selectedVideoOutputTrackId || !getVideoCapableTracks().some(t => t.id === selectedVideoOutputTrackId && isTrackVideoCapable(t))) {
          selectedVideoOutputTrackId = res.lyricsTrack.id;
        }
      }
      selectedClipIds = res.lyricsClip?.id ? new Set([res.lyricsClip.id]) : new Set();

      if (!videoDockOpen && !videoPopoutOpen) {
        videoDockOpen = true;
      }

      invalidateStaticTimelineCaches();
      markDirty(true);
      renderStudio();
      syncVideoOutputMonitor({ forcePush: true });
      showStatus(
        `Created MIDI Karaoke Track "${res.lyricsTrack?.name}" (${res.lineCount} lines · ${res.wordCount} MIDI 0xFF 05 words via ${res.source}) — press Space to play Karaoke on Video Output!`
      );
      job.complete({
        detail: `${res.lineCount} lines · ${res.wordCount} MIDI words (${res.source})`,
        outputPath: res.lyricsClip?.karFile || '',
        ...(res.lyricsClip?.karFile ? { actionLabel: 'Reveal' } : {}),
      });
      return res;
    } finally {
      if (typeof progressUnsub === 'function') {
        try { progressUnsub(); } catch {}
      }
      isCreatingLyricsTrack = false;
    }
  });
}

async function importAudioWavFiles({ startSec = playheadSec, targetTrackId = null, filePaths = undefined } = {}) {
  const prevSnap = currentProject ? DE.cloneDeep(currentProject) : null;
  let chosenTrackId = targetTrackId;
  if (!chosenTrackId && selectedTrackIds.size === 1) {
    const selId = [...selectedTrackIds][0];
    const selTrack = (currentProject?.tracks || []).find(t => t.id === selId);
    const hasOverlap = (selTrack?.clips || []).some(c => {
      const s = Number(c.startSec) || 0;
      const e = s + (Number(c.durationSec) || 0);
      return startSec >= s - 0.01 && startSec < e;
    });
    if (selTrack && !selTrack.armed && !hasOverlap) {
      chosenTrackId = selId;
    }
  }

  if (Array.isArray(filePaths) && filePaths.length > 0) {
    showStatus(`Importing & decoding ${filePaths.length} media file(s) at ${formatTimecode(startSec)}...`);
  }

  const res = await window.robos.importAudioFiles({
    startSec,
    targetTrackId: chosenTrackId,
    filePaths,
  });
  if (res?.canceled) return;
  if (!res?.ok || !res.project) {
    showStatus(`Media import failed: ${res?.error || 'Unknown error'}`, true);
    return;
  }
  if (prevSnap) historyStack.pushSnapshot(prevSnap, 'Import Audio / Video Media');
  currentProject = res.project;
  for (const t of (currentProject.tracks || [])) {
    for (const c of (t.clips || [])) {
      if ((res.importedClipIds || []).includes(c.id) && c.wavFile) {
        decodedBufferCache.delete(c.wavFile);
      }
    }
  }
  selectedClipIds = new Set(res.importedClipIds || []);
  if (res.createdTrackIds?.length) {
    selectedTrackIds = new Set(res.createdTrackIds);
    anchorTrackId = res.createdTrackIds[0];
  }
  markDirty(true);
  switchView('studio-stage');
  renderStudio();
  if (isPlaying || isRecording) {
    seamlessRefreshLiveAudio();
  }

  const items = res.importedItems || [];
  const videoCount = items.filter(x => x.mediaKind === 'video').length;
  const audioCount = Math.max(0, items.length - videoCount);
  const kindSummary = videoCount && audioCount
    ? `${audioCount} audio + ${videoCount} video`
    : (videoCount ? `${videoCount} video audio stem(s)` : `${(res.importedClipIds || []).length} audio file(s)`);
  const warnSuffix = res.skippedErrors?.length ? ` (${res.skippedErrors.length} skipped: ${res.skippedErrors[0]})` : '';
  showStatus(`Imported ${kindSummary} at ${formatTimecode(startSec)}${warnSuffix}`);
}

function extractDroppedFilePaths(dataTransfer) {
  if (!dataTransfer) return [];
  const seen = new Set();
  const out = [];
  const addPath = (p) => {
    const clean = String(p || '').trim();
    if (clean && clean.startsWith('/') && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  };

  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      const resolved = typeof window.robos?.getPathForFile === 'function'
        ? window.robos.getPathForFile(file)
        : (file?.path || '');
      addPath(resolved);
    }
  }

  try {
    const uriList = dataTransfer.getData('text/uri-list') || '';
    for (const rawLine of uriList.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('file://')) {
        try {
          addPath(decodeURIComponent(line.replace(/^file:\/\/(localhost)?/, '')));
        } catch {}
      } else if (line.startsWith('/')) {
        addPath(line);
      }
    }
  } catch {}

  return out;
}

function resolveMediaDropContext(ev) {
  const rowEl = ev.target?.closest?.('.track-row');
  const laneEl = ev.target?.closest?.('[data-lane-track]') || rowEl?.querySelector?.('[data-lane-track]');
  const hoveredTrackId = laneEl?.dataset?.laneTrack || rowEl?.dataset?.trackRow || null;
  const hoveredTrack = hoveredTrackId
    ? (currentProject?.tracks || []).find(t => t.id === hoveredTrackId) || null
    : null;

  let dropStartSec = playheadSec;
  if (laneEl) {
    const rect = laneEl.getBoundingClientRect();
    if (rect.width > 10) {
      const ratio = DE.clamp(0, 1, (ev.clientX - rect.left) / rect.width);
      const rawSec = timelineOffsetSec + ratio * getTimelineTotalSec();
      dropStartSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid);
    }
  }

  let eligibleTrack = null;
  if (hoveredTrack && !hoveredTrack.armed) {
    const overlapsExisting = (hoveredTrack.clips || []).some(c => {
      const s = Number(c.startSec) || 0;
      const e = s + (Number(c.durationSec) || 0);
      return dropStartSec >= s - 0.01 && dropStartSec < e;
    });
    if (!overlapsExisting) eligibleTrack = hoveredTrack;
  }

  return { rowEl, hoveredTrack, eligibleTrack, dropStartSec: Number(dropStartSec.toFixed(3)) };
}

function setupMediaDragAndDrop() {
  const overlay = document.getElementById('media-drop-overlay');
  const titleEl = document.getElementById('media-drop-title');
  let dragDepth = 0;
  let lastHoverRow = null;

  const clearHoverState = () => {
    dragDepth = 0;
    overlay?.classList.add('hidden');
    if (lastHoverRow) {
      lastHoverRow.classList.remove('drop-target-hover');
      lastHoverRow = null;
    }
  };

  const hasExternalFiles = (dt) => {
    if (!dt || !dt.types) return false;
    const types = Array.from(dt.types);
    return types.includes('Files') || types.includes('text/uri-list');
  };

  window.addEventListener('dragenter', (ev) => {
    if (!hasExternalFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    dragDepth++;
    overlay?.classList.remove('hidden');
  });

  window.addEventListener('dragover', (ev) => {
    if (!hasExternalFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
    overlay?.classList.remove('hidden');

    const { rowEl, eligibleTrack, dropStartSec } = resolveMediaDropContext(ev);
    if (lastHoverRow && lastHoverRow !== rowEl) {
      lastHoverRow.classList.remove('drop-target-hover');
    }
    if (rowEl && eligibleTrack) {
      rowEl.classList.add('drop-target-hover');
      lastHoverRow = rowEl;
    } else {
      lastHoverRow = null;
    }

    if (titleEl) {
      titleEl.textContent = eligibleTrack
        ? `Drop to Import onto "${eligibleTrack.name}" @ ${formatTimecode(dropStartSec)}`
        : `Drop Audio or Video to Create Media Track @ ${formatTimecode(dropStartSec)}`;
    }
  });

  window.addEventListener('dragleave', (ev) => {
    if (!hasExternalFiles(ev.dataTransfer)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 || (ev.clientX <= 0 && ev.clientY <= 0)) {
      clearHoverState();
    }
  });

  window.addEventListener('drop', async (ev) => {
    if (!hasExternalFiles(ev.dataTransfer)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const { eligibleTrack, dropStartSec } = resolveMediaDropContext(ev);
    const paths = extractDroppedFilePaths(ev.dataTransfer);
    clearHoverState();
    if (!paths.length) {
      showStatus('Could not read file path(s) from drop — use Import (Ctrl+Shift+I) to browse.', true);
      return;
    }
    await importAudioWavFiles({
      startSec: dropStartSec,
      targetTrackId: paths.length === 1 && eligibleTrack ? eligibleTrack.id : null,
      filePaths: paths,
    });
  });
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const EXPORT_FORMAT_CATALOG = {
  mp4: {
    ext: 'mp4',
    defaultQuality: 'stream_copy',
    qualities: [
      { id: 'stream_copy', label: 'Instant Lossless Video Copy + 320 kbps AAC' },
      { id: '1080p_hq', label: '1080p H.264 High Quality (CRF 18) + 320 kbps AAC' },
      { id: '720p_hd', label: '720p H.264 HD (CRF 20) + 256 kbps AAC' },
    ],
  },
  mp3: {
    ext: 'mp3',
    defaultQuality: '320k',
    qualities: [
      { id: '320k', label: '320 kbps CBR (Studio Max)' },
      { id: '256k', label: '256 kbps CBR (High)' },
      { id: '192k', label: '192 kbps CBR (Standard)' },
      { id: 'v0', label: 'V0 VBR (~245 kbps Variable)' },
    ],
  },
  wav: {
    ext: 'wav',
    defaultQuality: 'pcm_s24le',
    qualities: [
      { id: 'pcm_s24le', label: '24-bit PCM (Studio Master)' },
      { id: 'pcm_s16le', label: '16-bit PCM (CD Standard)' },
      { id: 'pcm_f32le', label: '32-bit IEEE Float' },
    ],
  },
  flac: {
    ext: 'flac',
    defaultQuality: '24bit',
    qualities: [
      { id: '24bit', label: '24-bit Lossless (Level 8)' },
      { id: '16bit', label: '16-bit Lossless (CD Compatible)' },
    ],
  },
  m4a: {
    ext: 'm4a',
    defaultQuality: '256k',
    qualities: [
      { id: '320k', label: '320 kbps AAC (Max)' },
      { id: '256k', label: '256 kbps AAC (iTunes Plus)' },
      { id: '192k', label: '192 kbps AAC (Streaming)' },
    ],
  },
  ogg: {
    ext: 'ogg',
    defaultQuality: 'q8',
    qualities: [
      { id: 'q8', label: 'Quality 8 (~256 kbps)' },
      { id: 'q6', label: 'Quality 6 (~192 kbps)' },
      { id: 'q4', label: 'Quality 4 (~128 kbps)' },
    ],
  },
  opus: {
    ext: 'opus',
    defaultQuality: '192k',
    qualities: [
      { id: '256k', label: '256 kbps Opus (Transparent Master)' },
      { id: '192k', label: '192 kbps Opus (High)' },
      { id: '128k', label: '128 kbps Opus (Compact)' },
    ],
  },
  aiff: {
    ext: 'aiff',
    defaultQuality: 'pcm_s24be',
    qualities: [
      { id: 'pcm_s24be', label: '24-bit PCM Big-Endian' },
      { id: 'pcm_s16be', label: '16-bit PCM Big-Endian' },
    ],
  },
};

/**
 * Encode stereo Float32Arrays into a lossless 32-bit IEEE Float RIFF WAV Uint8Array
 * so FFmpeg receives un-quantized 32-bit float studio dynamic range for MP3 / 24-bit WAV / FLAC / M4A.
 */
function encodeStereoFloat32IeeeWavBytes(left, right, sampleRate = 48000) {
  const numFrames = left.length;
  const numChannels = 2;
  const bytesPerSample = 4;
  const dataBytes = numFrames * numChannels * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true); // WAVE_FORMAT_IEEE_FLOAT = 3
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 32, true);
  writeStr(36, 'data');
  view.setUint32(40, dataBytes, true);

  let pos = 44;
  for (let i = 0; i < numFrames; i++) {
    view.setFloat32(pos, DE.clamp(-1.0, 1.0, left[i] || 0), true);
    view.setFloat32(pos + 4, DE.clamp(-1.0, 1.0, right[i] || 0), true);
    pos += 8;
  }
  return new Uint8Array(buf);
}

function getExportPlayableTracks({ excludeClick = false } = {}) {
  const tracks = currentProject?.tracks || [];
  const anySolo = tracks.some(t => t.soloed);
  return tracks.filter((t) => {
    if (anySolo ? !t.soloed : t.muted) return false;
    if (excludeClick) {
      const nonMutedClips = (t.clips || []).filter(c => !c.muted);
      const isPureClickTrack = nonMutedClips.length > 0 && nonMutedClips.every(c => c.mediaKind === 'click');
      if (isPureClickTrack) return false;
    }
    return true;
  });
}

function getExportVideoTakeChoices() {
  const choices = [];
  for (const t of (currentProject?.tracks || [])) {
    const vidClips = (t.clips || []).filter(c => !c.muted && Boolean(resolveClipVideoFilePath(c)));
    if (!vidClips.length) continue;
    // Order newest take first on each track, prioritizing dedicated camera tracks (`trackKind === 'video'`) first!
    for (let i = vidClips.length - 1; i >= 0; i--) {
      const c = vidClips[i];
      const vPath = resolveClipVideoFilePath(c);
      const startSec = Number(c.startSec) || 0;
      const durSec = Math.max(0.05, Number(c.durationSec) || 0);
      choices.push({
        key: `${t.id}::${c.id}`,
        trackId: t.id,
        trackName: t.name,
        isCameraTrack: t.trackKind === 'video',
        clipId: c.id,
        takeNumber: i + 1,
        totalTakesOnTrack: vidClips.length,
        videoFile: vPath,
        startSec,
        offsetSec: Math.max(0, Number(c.offsetSec) || 0),
        durationSec: durSec,
        endSec: Number((startSec + durSec).toFixed(4)),
        label: vidClips.length > 1
          ? `${t.name} — Take #${i + 1}${i === vidClips.length - 1 ? ' (Latest)' : ''} [${formatTimecode(startSec)} -> ${formatTimecode(startSec + durSec)}]`
          : `${t.name} — ${c.name || 'Video'} [${formatTimecode(startSec)} -> ${formatTimecode(startSec + durSec)}]`,
      });
    }
  }
  choices.sort((a, b) => Number(b.isCameraTrack) - Number(a.isCameraTrack));
  return choices;
}

async function revealActiveVideoTakeInFolder(preferTrackId = '', preferClipId = '') {
  const choices = getExportVideoTakeChoices();
  const chosen = (preferClipId && choices.find(x => x.clipId === preferClipId))
    || (preferTrackId && choices.find(x => x.trackId === preferTrackId))
    || (selectedVideoOutputTrackId && choices.find(x => x.trackId === selectedVideoOutputTrackId))
    || choices[0];
  if (!chosen?.videoFile) {
    showStatus('No recorded or imported .mp4 video file found in this session yet.', true);
    return;
  }
  const rev = await window.robos?.revealFileInFolder?.(chosen.videoFile);
  if (rev?.ok) {
    showStatus(`Revealed video file in folder: ${chosen.videoFile}`);
  } else {
    showStatus(`Video file path: ${chosen.videoFile}`, !rev?.ok);
  }
}

function getFullSessionExportBounds(excludeClick = false) {
  const playable = getExportPlayableTracks({ excludeClick });
  let maxEndSec = 0;
  for (const t of playable) {
    for (const c of (t.clips || [])) {
      if (c.muted) continue;
      const e = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0);
      if (e > maxEndSec) maxEndSec = e;
    }
  }
  if (maxEndSec <= 0.05) {
    maxEndSec = DE.getProjectEndSec(currentProject) || 0;
  }
  return { startSec: 0, endSec: Number(Math.max(0, maxEndSec).toFixed(4)), playableTracks: playable };
}

function populateExportVideoTrackSelector(preferClipId = '', preferTrackId = '') {
  const row = document.getElementById('export-video-track-row');
  const sel = document.getElementById('export-video-track-select');
  const choices = getExportVideoTakeChoices();
  if (!sel) return choices;
  if (!choices.length) {
    sel.innerHTML = '<option value="">No recorded or imported .mp4 video clips in session</option>';
  } else {
    const preferred = (preferClipId && choices.find(c => c.clipId === preferClipId))
      || (preferTrackId && choices.find(c => c.trackId === preferTrackId))
      || (selectedVideoOutputTrackId && choices.find(c => c.trackId === selectedVideoOutputTrackId))
      || choices[0];
    sel.innerHTML = choices
      .map(c => `<option value="${esc(c.key)}"${c.key === preferred?.key ? ' selected' : ''}>${esc(c.label)}</option>`)
      .join('');
  }
  return choices;
}

function getSelectedExportVideoChoice() {
  const sel = document.getElementById('export-video-track-select');
  const choices = getExportVideoTakeChoices();
  if (!choices.length) return null;
  const val = sel?.value || '';
  return choices.find(c => c.key === val) || choices[0];
}

function populateExportQualityOptions(formatId) {
  const spec = EXPORT_FORMAT_CATALOG[formatId] || EXPORT_FORMAT_CATALOG.mp3;
  const qSel = document.getElementById('export-quality-select');
  if (!qSel) return;
  const savedQ = exportPrefs.qualityByFormat[formatId] || spec.defaultQuality;
  qSel.innerHTML = spec.qualities
    .map(q => `<option value="${esc(q.id)}"${q.id === savedQ ? ' selected' : ''}>${esc(q.label)}</option>`)
    .join('');

  const vidRow = document.getElementById('export-video-track-row');
  if (vidRow) vidRow.classList.toggle('hidden', formatId !== 'mp4');
  const confirmBtn = document.getElementById('btn-export-confirm');
  if (confirmBtn && !isExportingMixdown) {
    confirmBtn.textContent = formatId === 'mp4'
      ? 'Export MP4 Video + Audio...'
      : 'Export Audio Mixdown...';
  }

  const fnInp = document.getElementById('export-filename-input');
  if (fnInp && fnInp.value.trim()) {
    const stem = fnInp.value.trim().replace(/\.(mp4|mp3|wav|flac|m4a|ogg|opus|aiff)$/i, '');
    fnInp.value = `${stem}.${spec.ext}`;
  }
}

function refreshExportModalSummary() {
  const scopeSel = document.getElementById('export-scope-selection');
  const scopeFull = document.getElementById('export-scope-full');
  const fromInp = document.getElementById('export-from-input');
  const toInp = document.getElementById('export-to-input');
  const durBadge = document.getElementById('export-duration-badge');
  const summaryEl = document.getElementById('export-tracks-summary');
  const excludeClick = Boolean(document.getElementById('export-chk-exclude-click')?.checked);

  const isSelMode = Boolean(scopeSel?.checked);
  document.getElementById('export-scope-sel-card')?.classList.toggle('active', isSelMode);
  document.getElementById('export-scope-full-card')?.classList.toggle('active', Boolean(scopeFull?.checked));

  if (fromInp) fromInp.disabled = !isSelMode;
  if (toInp) toInp.disabled = !isSelMode;

  const fullBounds = getFullSessionExportBounds(excludeClick);
  const fSec = isSelMode ? (parseTimecodeInput(fromInp?.value) ?? 0) : 0;
  const tSec = isSelMode ? (parseTimecodeInput(toInp?.value) ?? fullBounds.endSec) : fullBounds.endSec;
  const span = Math.max(0, tSec - fSec);

  if (durBadge) {
    durBadge.textContent = `Duration: ${formatTimecode(span)} (${span.toFixed(2)}s)`;
  }
  if (summaryEl) {
    summaryEl.textContent = `${fullBounds.playableTracks.length} audible channel(s) included`;
  }
}

function openExportMixdownModal({ preferFormat = '', preferTrackId = '', preferClipId = '' } = {}) {
  const modal = document.getElementById('export-mixdown-modal');
  if (!modal || !currentProject) return;
  closeContextMenu();
  closeMenubarDropdown();

  const excludeClickChk = document.getElementById('export-chk-exclude-click');
  if (excludeClickChk) excludeClickChk.checked = Boolean(exportPrefs.excludeClick);
  const normChk = document.getElementById('export-chk-normalize');
  if (normChk) normChk.checked = Boolean(exportPrefs.normalize);
  const fadeChk = document.getElementById('export-chk-edge-fade');
  if (fadeChk) fadeChk.checked = Boolean(exportPrefs.edgeFade);

  const fullBounds = getFullSessionExportBounds(Boolean(excludeClickChk?.checked));
  if (fullBounds.endSec <= 0.05 && !hasActiveTimeSelection()) {
    showStatus('No audible audio regions to export — record or import audio first.', true);
    return;
  }

  const vidChoices = populateExportVideoTrackSelector(preferClipId, preferTrackId);
  const hasRecordedCamTake = vidChoices.some(c => c.isCameraTrack);
  const activeFormat = preferFormat
    || (hasRecordedCamTake && exportPrefs.format === 'mp3' ? 'mp4' : (exportPrefs.format || 'mp3'));

  // When opening specifically for MP4 video export and no narrow ruler selection is set, default bounds to the chosen video take!
  const chosenVid = getSelectedExportVideoChoice();
  const autoBoundToVid = activeFormat === 'mp4' && chosenVid && (!hasActiveTimeSelection() || preferFormat === 'mp4');
  const useSel = Boolean(autoBoundToVid || hasActiveTimeSelection());
  const scopeSel = document.getElementById('export-scope-selection');
  const scopeFull = document.getElementById('export-scope-full');
  if (scopeSel) scopeSel.checked = useSel;
  if (scopeFull) scopeFull.checked = !useSel;

  const fromInp = document.getElementById('export-from-input');
  const toInp = document.getElementById('export-to-input');
  if (fromInp) {
    fromInp.value = formatTimecode(
      autoBoundToVid ? chosenVid.startSec : (useSel ? timeSelection.fromSec : 0)
    );
  }
  if (toInp) {
    toInp.value = formatTimecode(
      autoBoundToVid ? chosenVid.endSec : (useSel ? timeSelection.toSec : fullBounds.endSec)
    );
  }

  const fmtSel = document.getElementById('export-format-select');
  if (fmtSel) fmtSel.value = activeFormat;
  const srSel = document.getElementById('export-samplerate-select');
  if (srSel) srSel.value = String(exportPrefs.sampleRate || 48000);

  const spec = EXPORT_FORMAT_CATALOG[activeFormat] || EXPORT_FORMAT_CATALOG.mp3;
  const safeTitle = String(currentProject?.name || 'session').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  const fnInp = document.getElementById('export-filename-input');
  if (fnInp) {
    fnInp.value = activeFormat === 'mp4'
      ? `${safeTitle}-video.${spec.ext}`
      : (useSel ? `${safeTitle}-selection.${spec.ext}` : `${safeTitle}-mixdown.${spec.ext}`);
  }
  populateExportQualityOptions(activeFormat);
  refreshExportModalSummary();

  const statusEl = document.getElementById('export-modal-status');
  if (statusEl) {
    statusEl.textContent = activeFormat === 'mp4' && chosenVid
      ? `Combining "${chosenVid.trackName}" (Take #${chosenVid.takeNumber}) with stereo audio mixdown`
      : (useSel
        ? `Exporting selected range ${fromInp?.value || ''} -> ${toInp?.value || ''}`
        : `Exporting full session (00:00.000 -> ${formatTimecode(fullBounds.endSec)})`);
  }

  modal.classList.remove('hidden');
}

function closeExportMixdownModal() {
  document.getElementById('export-mixdown-modal')?.classList.add('hidden');
}

const yieldUiPaint = () => new Promise(resolve => setTimeout(resolve, 16));

async function renderAndExportMixdown({
  startSec = 0,
  endSec = null,
  format = 'mp3',
  quality = '',
  sampleRate = 48000,
  normalize = true,
  edgeFade = true,
  excludeClick = false,
  defaultName = '',
  targetFile = undefined,
  videoChoice = null,
} = {}) {
  const playableTracks = getExportPlayableTracks({ excludeClick });
  const fullBounds = getFullSessionExportBounds(excludeClick);
  const renderStartSec = Math.max(0, Number(startSec) || 0);
  const rawEndSec = endSec !== null && endSec !== undefined ? Number(endSec) : fullBounds.endSec;
  const isSubRange = renderStartSec > 0.01 || (fullBounds.endSec > 0 && rawEndSec < fullBounds.endSec - 0.05);
  const tailPadSec = isSubRange ? 0 : 1.0;
  const renderEndSec = Math.min(renderStartSec + 900, Math.max(renderStartSec + 0.05, rawEndSec + tailPadSec));
  const sliceSpanSec = renderEndSec - renderStartSec;

  if (!playableTracks.length || sliceSpanSec <= 0.04) {
    showStatus('No audible tracks or valid time range to export.', true);
    return { ok: false };
  }

  let effectiveFormat = format || 'mp3';
  let effectiveQuality = quality || '';
  const initialSpec = EXPORT_FORMAT_CATALOG[effectiveFormat] || EXPORT_FORMAT_CATALOG.mp3;
  const safeTitle = String(currentProject?.name || 'mixdown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  const suggestedName = defaultName || `${safeTitle}-${effectiveFormat === 'mp4' ? 'video' : 'mixdown'}.${initialSpec.ext}`;

  let resolvedVid = effectiveFormat === 'mp4' ? (videoChoice || getSelectedExportVideoChoice()) : null;
  if (effectiveFormat === 'mp4' && !resolvedVid?.videoFile) {
    const noVidErr = 'No recorded or imported .mp4 video clip found to combine with audio.';
    showStatus(noVidErr, true);
    const statusEl = document.getElementById('export-modal-status');
    if (statusEl) statusEl.textContent = noVidErr;
    return { ok: false, error: noVidErr };
  }

  // Ask for destination file path FIRST (just like Save to Kdenlive), then close the modal immediately
  // so the export runs non-blockingly in the bottom-toolbar <robos-job-status> spinner!
  let destFile = targetFile;
  if (!destFile && typeof window.robos?.pickExportMixdownPath === 'function') {
    const picked = await window.robos.pickExportMixdownPath({
      format: effectiveFormat,
      quality: effectiveQuality || initialSpec.defaultQuality,
      defaultName: suggestedName,
    });
    if (!picked?.ok || picked?.canceled || !picked.filePath) {
      return { ok: false, canceled: true };
    }
    destFile = picked.filePath;
    if (picked.format) effectiveFormat = picked.format;
    if (picked.quality) effectiveQuality = picked.quality;
    if (effectiveFormat === 'mp4' && !resolvedVid) {
      resolvedVid = videoChoice || getSelectedExportVideoChoice();
      if (!resolvedVid?.videoFile) {
        const noVidErr = 'No recorded or imported .mp4 video clip found to combine with audio.';
        showStatus(noVidErr, true);
        return { ok: false, error: noVidErr };
      }
    }
  }

  closeExportMixdownModal();

  const renderRate = 48000;
  const spec = EXPORT_FORMAT_CATALOG[effectiveFormat] || EXPORT_FORMAT_CATALOG.mp3;
  const targetLeaf = destFile ? (String(destFile).split('/').pop() || suggestedName) : suggestedName;

  return runDawJob({
    title: effectiveFormat === 'mp4'
      ? `Export MP4 Video (${targetLeaf})`
      : `Export ${spec.ext.toUpperCase()} (${targetLeaf})`,
    category: effectiveFormat === 'mp4' ? 'VIDEO MP4' : 'MIXDOWN',
    detail: `Decoding stems (${formatTimecode(renderStartSec)} -> ${formatTimecode(rawEndSec)})...`,
    progress: 12,
  }, async (job) => {
    showStatus(`Decoding stems & rendering stereo mixdown (${formatTimecode(renderStartSec)} -> ${formatTimecode(rawEndSec)})...`);
    await yieldUiPaint();

    for (const track of playableTracks) {
      for (const clip of (track.clips || [])) {
        if (clip.muted) continue;
        const cStart = Number(clip.startSec) || 0;
        const cEnd = cStart + (Number(clip.durationSec) || 0);
        if (cEnd <= renderStartSec || cStart >= renderEndSec) continue;
        if (clip.wavFile) {
          try { await loadDecodedAudio(clip.wavFile); } catch {}
        }
        if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
          for (const hit of clip.transients) {
            const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
            if (sp) {
              try { await loadDecodedAudio(sp); } catch {}
            }
          }
        }
      }
    }

    job.update({
      progress: 42,
      detail: `Rendering stereo DSP master (${playableTracks.length} track(s), ${sliceSpanSec.toFixed(1)}s)...`,
    });
    await yieldUiPaint();

    const totalFrames = Math.max(256, Math.ceil(sliceSpanSec * renderRate));
    const offlineCtx = new OfflineAudioContext(2, totalFrames, renderRate);
    const offlineMasterBus = createMasterDrumBus(offlineCtx);

    for (const track of playableTracks) {
      const { inputGain, trackMixBus, srActive, blend } = buildTrackWebAudioChain(offlineCtx, track, offlineMasterBus);
      for (const clip of (track.clips || [])) {
        if (clip.muted) continue;
        const clipStart = Math.max(0, Number(clip.startSec) || 0);
        const clipOff = Math.max(0, Number(clip.offsetSec) || 0);
        const buf = decodedBufferCache.get(clip.wavFile);
        const clipDur = Math.max(0.04, Number(clip.durationSec) || (buf ? Math.max(0.04, buf.duration - clipOff) : 0));
        const clipEnd = clipStart + clipDur;

        if (buf && clipOff < buf.duration && clipEnd > renderStartSec + 0.002 && clipStart < renderEndSec - 0.002) {
          const segStart = Math.max(clipStart, renderStartSec);
          const segEnd = Math.min(clipEnd, renderEndSec);
          const intoClip = segStart - clipStart;
          const srcOffset = clipOff + intoClip;
          const playDur = Math.min(segEnd - segStart, Math.max(0.01, buf.duration - srcOffset));

          if (playDur > 0.008 && srcOffset < buf.duration) {
            const ctxStart = Math.max(0, segStart - renderStartSec);
            const ctxEnd = ctxStart + playDur;
            const src = offlineCtx.createBufferSource();
            src.buffer = buf;
            const clipGainNode = offlineCtx.createGain();
            const clipGainLin = DE.dbToGain(Number(clip.gainDb) || 0);
            const fadeIn = Math.max(0, Number(clip.fadeInSec) || 0);
            const fadeOut = Math.max(0, Number(clip.fadeOutSec) || 0);

            if (intoClip < 0.002 && fadeIn > 0.002) {
              clipGainNode.gain.setValueAtTime(0.0001, ctxStart);
              clipGainNode.gain.linearRampToValueAtTime(clipGainLin, ctxStart + Math.min(fadeIn, playDur));
            } else {
              clipGainNode.gain.setValueAtTime(clipGainLin, ctxStart);
            }
            if ((clipEnd - segEnd) < 0.002 && fadeOut > 0.002 && playDur > fadeOut) {
              clipGainNode.gain.setValueAtTime(clipGainLin, Math.max(ctxStart, ctxEnd - fadeOut));
              clipGainNode.gain.linearRampToValueAtTime(0.0001, ctxEnd);
            }

            src.connect(clipGainNode).connect(inputGain);
            src.start(ctxStart, srcOffset, playDur);
          }
        }

        if (srActive && Array.isArray(clip.transients)) {
          const clipVelScale = clip.autoGainStaged ? 1.0 : DE.clamp(0.15, 1.4, DE.dbToGain((Number(clip.gainDb) || 0) * 0.25));
          for (const hit of clip.transients) {
            const absHitSec = clipStart + (Number(hit.timeSec) || 0);
            if (absHitSec < renderStartSec || absHitSec > Math.min(clipEnd + 0.005, renderEndSec)) continue;
            const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
            const srBuf = sp ? decodedBufferCache.get(sp) : null;
            if (!srBuf) continue;
            const hitSrc = offlineCtx.createBufferSource();
            hitSrc.buffer = srBuf;
            const hitGain = offlineCtx.createGain();
            hitGain.gain.value = blend * Math.max(0.25, Math.min(1.3, (Number(hit.velocity) || 0.8) * clipVelScale));
            hitSrc.connect(hitGain).connect(trackMixBus);
            hitSrc.start(Math.max(0, absHitSec - renderStartSec));
          }
        }
      }
    }

    const rendered = await offlineCtx.startRendering();
    const left = new Float32Array(rendered.getChannelData(0));
    const right = new Float32Array(rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left);
    const n = left.length;

    // Apply smooth 15ms half-cosine edge fades on From -> To slices so mid-song cuts never click!
    if (edgeFade && n > 64) {
      const fadeSamples = Math.min(Math.round(0.015 * renderRate), Math.floor(n * 0.25));
      if (renderStartSec > 0.005) {
        for (let i = 0; i < fadeSamples; i++) {
          const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeSamples);
          left[i] *= w;
          right[i] *= w;
        }
      }
      for (let i = 0; i < fadeSamples; i++) {
        const idx = n - 1 - i;
        const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeSamples);
        left[idx] *= w;
        right[idx] *= w;
      }
    }

    // Optional Peak Normalization to -0.3 dBFS (0.96605 linear)
    if (normalize) {
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const al = Math.abs(left[i]);
        const ar = Math.abs(right[i]);
        if (al > peak) peak = al;
        if (ar > peak) peak = ar;
      }
      if (peak > 0.0002) {
        const scale = DE.dbToGain(-0.3) / peak;
        for (let i = 0; i < n; i++) {
          left[i] = DE.clamp(-0.999, 0.999, left[i] * scale);
          right[i] = DE.clamp(-0.999, 0.999, right[i] * scale);
        }
      }
    }

    const encMsg = effectiveFormat === 'mp4'
      ? `Muxing camera video (${resolvedVid.trackName}) + stereo audio into .MP4...`
      : `Encoding .${spec.ext.toUpperCase()} (${effectiveQuality || spec.defaultQuality} @ ${sampleRate} Hz)...`;
    showStatus(encMsg);
    job.update({ progress: 76, detail: encMsg });
    await yieldUiPaint();

    const wavBytes = (effectiveFormat === 'wav' && (effectiveQuality || spec.defaultQuality) === 'pcm_s16le' && Number(sampleRate) === 48000)
      ? DE.encodeStereoFloat32ToWavBytes(left, right, renderRate)
      : encodeStereoFloat32IeeeWavBytes(left, right, renderRate);

    await yieldUiPaint();
    const res = await window.robos.exportMixdown({
      wavBase64: uint8ToBase64(wavBytes),
      format: effectiveFormat,
      quality: effectiveQuality || spec.defaultQuality,
      sampleRate: Number(sampleRate) || 48000,
      title: currentProject?.name || 'RobOS DAW Mixdown',
      defaultName: suggestedName,
      targetFile: destFile,
      videoMuxSpec: (effectiveFormat === 'mp4' && resolvedVid) ? {
        videoFile: resolvedVid.videoFile,
        clipStartSec: resolvedVid.startSec,
        clipOffsetSec: resolvedVid.offsetSec,
        clipDurationSec: resolvedVid.durationSec,
        renderStartSec,
        renderEndSec,
      } : null,
    });

    if (res?.canceled) {
      showStatus('Mixdown export canceled.');
      job.cancel('Mixdown export canceled');
      return res;
    }
    if (res?.ok) {
      const doneText = `Exported .${(res.ext || spec.ext).toUpperCase()} mixdown (${sliceSpanSec.toFixed(1)}s) -> ${res.filePath}`;
      showStatus(doneText);
      job.complete({
        detail: `Exported ${targetLeaf} (${sliceSpanSec.toFixed(1)}s @ ${sampleRate} Hz)`,
        outputPath: res.filePath,
        actionLabel: 'Reveal',
      });
      return res;
    }
    const errText = res?.error || 'Unknown error';
    showStatus(`Export failed: ${errText}`, true);
    job.fail(errText);
    return res;
  });
}

async function renderFullSessionMixdownWavBase64ForKdenlive({ excludeClick = true, normalize = true } = {}) {
  const playableTracks = getExportPlayableTracks({ excludeClick });
  const fullBounds = getFullSessionExportBounds(excludeClick);
  if (!playableTracks.length || fullBounds.endSec <= 0.04) {
    return '';
  }

  const renderRate = 48000;
  const renderEndSec = Math.min(900, Math.max(0.1, fullBounds.endSec + 0.5));
  for (const track of playableTracks) {
    for (const clip of (track.clips || [])) {
      if (clip.muted) continue;
      if (clip.wavFile) {
        try { await loadDecodedAudio(clip.wavFile); } catch {}
      }
      if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
        for (const hit of clip.transients) {
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          if (sp) {
            try { await loadDecodedAudio(sp); } catch {}
          }
        }
      }
    }
  }

  const totalFrames = Math.max(256, Math.ceil(renderEndSec * renderRate));
  const offlineCtx = new OfflineAudioContext(2, totalFrames, renderRate);
  const offlineMasterBus = createMasterDrumBus(offlineCtx);

  for (const track of playableTracks) {
    const { inputGain, trackMixBus, srActive, blend } = buildTrackWebAudioChain(offlineCtx, track, offlineMasterBus);
    for (const clip of (track.clips || [])) {
      if (clip.muted) continue;
      const clipStart = Math.max(0, Number(clip.startSec) || 0);
      const clipOff = Math.max(0, Number(clip.offsetSec) || 0);
      const buf = decodedBufferCache.get(clip.wavFile);
      const clipDur = Math.max(0.04, Number(clip.durationSec) || (buf ? Math.max(0.04, buf.duration - clipOff) : 0));
      const clipEnd = clipStart + clipDur;

      if (buf && clipOff < buf.duration && clipEnd > 0.002 && clipStart < renderEndSec - 0.002) {
        const segEnd = Math.min(clipEnd, renderEndSec);
        const playDur = Math.min(segEnd - clipStart, Math.max(0.01, buf.duration - clipOff));
        if (playDur > 0.008) {
          const src = offlineCtx.createBufferSource();
          src.buffer = buf;
          const clipGainNode = offlineCtx.createGain();
          const clipGainLin = DE.dbToGain(Number(clip.gainDb) || 0);
          const fadeIn = Math.max(0, Number(clip.fadeInSec) || 0);
          const fadeOut = Math.max(0, Number(clip.fadeOutSec) || 0);

          if (fadeIn > 0.002) {
            clipGainNode.gain.setValueAtTime(0.0001, clipStart);
            clipGainNode.gain.linearRampToValueAtTime(clipGainLin, clipStart + Math.min(fadeIn, playDur));
          } else {
            clipGainNode.gain.setValueAtTime(clipGainLin, clipStart);
          }
          if (fadeOut > 0.002 && playDur > fadeOut) {
            clipGainNode.gain.setValueAtTime(clipGainLin, Math.max(clipStart, clipStart + playDur - fadeOut));
            clipGainNode.gain.linearRampToValueAtTime(0.0001, clipStart + playDur);
          }
          src.connect(clipGainNode).connect(inputGain);
          src.start(clipStart, clipOff, playDur);
        }
      }

      if (srActive && Array.isArray(clip.transients)) {
        const clipVelScale = clip.autoGainStaged ? 1.0 : DE.clamp(0.15, 1.4, DE.dbToGain((Number(clip.gainDb) || 0) * 0.25));
        for (const hit of clip.transients) {
          const absHitSec = clipStart + (Number(hit.timeSec) || 0);
          if (absHitSec < 0 || absHitSec > Math.min(clipEnd + 0.005, renderEndSec)) continue;
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          const srBuf = sp ? decodedBufferCache.get(sp) : null;
          if (!srBuf) continue;
          const hitSrc = offlineCtx.createBufferSource();
          hitSrc.buffer = srBuf;
          const hitGain = offlineCtx.createGain();
          hitGain.gain.value = blend * Math.max(0.25, Math.min(1.3, (Number(hit.velocity) || 0.8) * clipVelScale));
          hitSrc.connect(hitGain).connect(trackMixBus);
          hitSrc.start(absHitSec);
        }
      }
    }
  }

  const rendered = await offlineCtx.startRendering();
  const left = new Float32Array(rendered.getChannelData(0));
  const right = new Float32Array(rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left);
  const n = left.length;

  if (normalize && n > 0) {
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const al = Math.abs(left[i]);
      const ar = Math.abs(right[i]);
      if (al > peak) peak = al;
      if (ar > peak) peak = ar;
    }
    if (peak > 0.0002) {
      const scale = DE.dbToGain(-0.3) / peak;
      for (let i = 0; i < n; i++) {
        left[i] = DE.clamp(-0.999, 0.999, left[i] * scale);
        right[i] = DE.clamp(-0.999, 0.999, right[i] * scale);
      }
    }
  }

  return uint8ToBase64(encodeStereoFloat32IeeeWavBytes(left, right, renderRate));
}

async function saveSessionToKdenliveProject({ forceSaveAs = false, targetPath = '' } = {}) {
  if (!currentProject) return { ok: false };
  if (isSavingKdenlive) {
    showStatus('Already syncing Kdenlive project — please wait a moment...');
    return { ok: false };
  }

  const hasAnyClips = (currentProject.tracks || []).some(t => (t.clips || []).length > 0);
  if (!hasAnyClips) {
    showStatus('Record or import audio/video clips before saving to a Kdenlive project.', true);
    return { ok: false };
  }

  let kdenlivePath = targetPath || (!forceSaveAs ? (currentProject.kdenliveFile || '') : '');
  if (!kdenlivePath) {
    const pick = await window.robos?.pickKdenlivePath?.({ defaultPath: currentProject.kdenliveFile || '' });
    if (!pick?.ok || pick?.canceled || !pick.kdenlivePath) {
      return { ok: false, canceled: true };
    }
    kdenlivePath = pick.kdenlivePath;
  }

  isSavingKdenlive = true;
  const targetLeaf = String(kdenlivePath).split('/').pop() || 'session.kdenlive';
  const hadExistingTarget = Boolean(currentProject.kdenliveFile && currentProject.kdenliveFile === kdenlivePath);
  try {
    return await runDawJob({
      title: hadExistingTarget ? `Sync Kdenlive (${targetLeaf})` : `Save to Kdenlive (${targetLeaf})`,
      category: 'KDENLIVE',
      detail: 'Rendering lossless 48 kHz stereo audio mixdown...',
      progress: 18,
    }, async (job) => {
      showStatus('Rendering lossless 48 kHz audio mixdown & syncing aligned video tracks to Kdenlive project...');
      const wavBase64 = await renderFullSessionMixdownWavBase64ForKdenlive({
        excludeClick: Boolean(exportPrefs.excludeClick),
        normalize: true,
      });

      job.update({
        progress: 68,
        detail: `Aligning video tracks & writing MLT XML (${targetLeaf})...`,
      });

      await syncProjectToMain();
      const res = await window.robos.saveKdenliveProject({
        kdenlivePath,
        wavBase64,
        project: currentProject,
      });

      if (!res?.ok) {
        const errMsg = res?.error || 'Unknown error';
        showStatus(`Save to Kdenlive Project failed: ${errMsg}`, true);
        job.fail(errMsg);
        return res;
      }

      currentProject.kdenliveFile = res.kdenlivePath;
      const kdBtn = document.getElementById('btn-project-save-kdenlive');
      if (kdBtn) {
        kdBtn.title = `Sync Audio Mixdown + Video Tracks to ${res.kdenlivePath} (Ctrl+Alt+K · Shift+Click for Save As)`;
      }

      const fileNameOnly = res.kdenlivePath.split('/').pop();
      if (res.existedBefore) {
        const syncMsg = `Synced Kdenlive project -> ${fileNameOnly} (${res.updatedTrackCount} updated, ${res.createdTrackCount} created · 1 audio mixdown + ${res.videoTrackCount} video track(s))`;
        showStatus(syncMsg);
        job.complete({
          detail: `Synced ${fileNameOnly} (${res.updatedTrackCount} updated, ${res.createdTrackCount} created · 1 audio + ${res.videoTrackCount} video)`,
          outputPath: res.kdenlivePath,
          actionLabel: 'Reveal',
        });
      } else {
        const createMsg = `Created Kdenlive project -> ${fileNameOnly} (1 audio mixdown track + ${res.videoTrackCount} aligned video track(s))`;
        showStatus(createMsg);
        job.complete({
          detail: `Created ${fileNameOnly} (1 audio mixdown + ${res.videoTrackCount} video track(s))`,
          outputPath: res.kdenlivePath,
          actionLabel: 'Reveal',
        });
      }
      return res;
    });
  } finally {
    isSavingKdenlive = false;
  }
}

async function executeExportMixdownFromModal() {
  if (!currentProject) return;
  if (isExportingMixdown) {
    closeExportMixdownModal();
    showStatus('Already running mixdown export in the bottom toolbar Jobs queue — please wait a moment...');
    return;
  }
  const isSelMode = Boolean(document.getElementById('export-scope-selection')?.checked);
  const excludeClick = Boolean(document.getElementById('export-chk-exclude-click')?.checked);
  const normalize = Boolean(document.getElementById('export-chk-normalize')?.checked);
  const edgeFade = Boolean(document.getElementById('export-chk-edge-fade')?.checked);
  const format = document.getElementById('export-format-select')?.value || 'mp3';
  const quality = document.getElementById('export-quality-select')?.value || '';
  const sampleRate = Number(document.getElementById('export-samplerate-select')?.value) || 48000;
  const defaultName = document.getElementById('export-filename-input')?.value?.trim() || '';
  const chosenVideo = format === 'mp4' ? getSelectedExportVideoChoice() : null;

  const fullBounds = getFullSessionExportBounds(excludeClick);
  let startSec = 0;
  let endSec = fullBounds.endSec;

  if (isSelMode) {
    const parsedFrom = parseTimecodeInput(document.getElementById('export-from-input')?.value);
    const parsedTo = parseTimecodeInput(document.getElementById('export-to-input')?.value);
    if (parsedFrom === null || parsedTo === null || parsedTo <= parsedFrom + 0.02) {
      showStatus('Enter a valid From -> To range where To is greater than From (e.g. 00:05.000 -> 01:30.000).', true);
      const statusEl = document.getElementById('export-modal-status');
      if (statusEl) statusEl.textContent = 'Invalid From -> To range: "To" must be greater than "From".';
      return;
    }
    startSec = parsedFrom;
    endSec = parsedTo;
    setTimeSelectionRange(startSec, endSec);
  }

  exportPrefs.format = format;
  exportPrefs.qualityByFormat[format] = quality;
  exportPrefs.sampleRate = sampleRate;
  exportPrefs.normalize = normalize;
  exportPrefs.edgeFade = edgeFade;
  exportPrefs.excludeClick = excludeClick;

  isExportingMixdown = true;
  try {
    await renderAndExportMixdown({
      startSec,
      endSec,
      format,
      quality,
      sampleRate,
      normalize,
      edgeFade,
      excludeClick,
      defaultName,
      videoChoice: chosenVideo,
    });
  } catch (err) {
    showStatus(`Mixdown render error: ${err.message}`, true);
  } finally {
    isExportingMixdown = false;
  }
}

async function exportSessionMixdownWav({ targetFile = undefined, format = 'wav', quality = 'pcm_s16le', startSec = 0, endSec = null } = {}) {
  // Interactive UI invocations open the full Export Audio Mixdown dialog; headless targetFile calls export directly
  if (!targetFile) {
    openExportMixdownModal();
    return;
  }
  return renderAndExportMixdown({
    startSec,
    endSec,
    format,
    quality,
    sampleRate: 48000,
    normalize: false,
    edgeFade: false,
    excludeClick: false,
    targetFile,
  });
}

// ─── Top Application Menu Bar (File, Edit, Track, Clip, Transport, Mix, View, Help) ───

function buildMenubarItems(key) {
  const tracks = currentProject?.tracks || [];
  const tCnt = selectedTrackIds.size;
  const cCnt = selectedClipIds.size;
  const effectiveClipIds = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
  const effCnt = effectiveClipIds.size;
  const hasTracks = tracks.length > 0;
  const hasClips = tracks.some(t => (t.clips || []).length > 0);
  const primaryTrack = tracks.find(t => selectedTrackIds.has(t.id)) || tracks[0] || null;
  const primaryIdx = primaryTrack ? tracks.findIndex(t => t.id === primaryTrack.id) : -1;

  if (key === 'file') {
    return [
      { icon: 'file-new', label: 'New Studio Session', kbd: 'Ctrl+N', run: () => createNewSession() },
      { icon: 'folder-open', label: 'Open Saved Session...', kbd: 'Ctrl+O', run: () => openProjectModal() },
      { sep: true },
      { icon: 'save', label: 'Save Session', kbd: 'Ctrl+S', run: () => saveCurrentSession(false) },
      { icon: 'save', label: 'Save Session As...', kbd: 'Ctrl+Shift+S', run: () => saveCurrentSession(true) },
      { sep: true },
      { icon: 'import-wav', label: 'Import Audio / Video File(s)...', kbd: 'Ctrl+Shift+I', run: () => importAudioWavFiles() },
      { icon: 'mixdown-export', label: 'Export Audio Mixdown (MP3, WAV, FLAC, M4A...)', kbd: 'Ctrl+Shift+E', disabled: !hasClips, run: () => openExportMixdownModal() },
      { icon: 'kdenlive', label: currentProject?.kdenliveFile ? `Sync to Kdenlive Project (${currentProject.kdenliveFile.split('/').pop()})` : 'Save to Kdenlive Project (.kdenlive)...', kbd: 'Ctrl+Alt+K', disabled: !hasClips, run: () => saveSessionToKdenliveProject({ forceSaveAs: false }) },
      { icon: 'kdenlive', label: 'Save to Kdenlive Project As...', kbd: '', disabled: !hasClips, run: () => saveSessionToKdenliveProject({ forceSaveAs: true }) },
      { icon: 'folder', label: 'Reveal Session Audio Folder', kbd: '', run: async () => {
        const res = await window.robos.openSessionFolder();
        if (res?.ok) showStatus(`Opened ${res.folder || res.projectDir}`);
      } },
      { sep: true },
      { icon: 'audio-interface', label: 'Scarlett Headphone & Direct Monitor Mix...', kbd: '', run: () => openHeadphoneMixModal() },
      { icon: 'channel-fx', label: 'VST & Sample Directories...', kbd: 'Ctrl+Shift+P', run: () => openVstDirectoriesModal() },
      { icon: 'audio-interface', label: 'Audio Device Preferences', kbd: 'Ctrl+,', run: () => switchView('audio-devices') },
    ];
  }

  if (key === 'edit') {
    const undoLbl = historyStack.undoStack[historyStack.undoStack.length - 1]?.label;
    const redoLbl = historyStack.redoStack[historyStack.redoStack.length - 1]?.label;
    return [
      { icon: 'undo', label: `Undo${undoLbl ? ` (${undoLbl})` : ''}`, kbd: 'Ctrl+Z', disabled: !historyStack.canUndo(), run: () => performUndo() },
      { icon: 'redo', label: `Redo${redoLbl ? ` (${redoLbl})` : ''}`, kbd: 'Ctrl+Y', disabled: !historyStack.canRedo(), run: () => performRedo() },
      { sep: true },
      { icon: 'scissors', label: 'Cut Region(s)', kbd: 'Ctrl+X', disabled: effCnt === 0, run: () => editCutSelected() },
      { icon: 'copy', label: 'Copy Region(s)', kbd: 'Ctrl+C', disabled: effCnt === 0, run: () => editCopySelected() },
      { icon: 'paste', label: 'Paste Region(s) at Playhead', kbd: 'Ctrl+V', disabled: !clipClipboard, run: () => editPasteAtPlayhead() },
      { icon: 'duplicate', label: 'Duplicate Selected', kbd: 'Ctrl+D', disabled: cCnt === 0 && tCnt === 0, run: () => editDuplicateSelected() },
      { icon: 'scissors', label: 'Split Region(s) at Playhead', kbd: 'S', disabled: !hasClips, run: () => editSplitSelectedOrPlayhead() },
      { icon: 'trash', label: 'Delete Selected', kbd: 'Del', disabled: cCnt === 0 && tCnt === 0, danger: true, run: () => editDeleteSelected() },
      { sep: true },
      { icon: 'select-all', label: 'Select All (Tracks & Regions)', kbd: 'Ctrl+A', disabled: !hasTracks, run: () => editSelectAll() },
      { icon: 'check-square', label: 'Select All Tracks Only', kbd: 'Ctrl+Shift+A', disabled: !hasTracks, run: () => editSelectAllTracksOnly() },
      { icon: 'waveform', label: 'Select All Regions Only', kbd: '', disabled: !hasClips, run: () => editSelectAllClipsOnly() },
      { icon: 'invert', label: 'Invert Track Selection', kbd: '', disabled: !hasTracks, run: () => editInvertTrackSelection() },
      { icon: 'square', label: 'Deselect All', kbd: 'Esc', disabled: cCnt === 0 && tCnt === 0, run: () => {
        selectedClipIds.clear();
        selectedTrackIds.clear();
        renderStudio();
      } },
      { sep: true },
      { icon: snapToGrid ? 'check' : 'magnet', label: `Snap Edits to Beat Grid (${snapToGrid ? 'ON' : 'OFF'})`, kbd: 'G', run: () => {
        snapToGrid = !snapToGrid;
        updateEditToolbarState();
        showStatus(`Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
      } },
    ];
  }

  if (key === 'track') {
    return [
      { icon: 'plus', label: 'Add Blank Audio Track', kbd: 'Ctrl+T', run: () => addBlankAudioTracks(1) },
      { icon: 'layers', label: 'Add 4 Audio Tracks (Sequential Inputs)', kbd: 'Ctrl+Shift+T', run: () => addBlankAudioTracks(4) },
      { icon: 'layers', label: 'Add 8 Audio Tracks (8-Preamp Bank)', kbd: '', run: () => addBlankAudioTracks(8) },
      { icon: 'mic-wizard', label: 'Add Mic via Studio Wizard...', kbd: '', run: () => openAddMicWizard() },
      { icon: 'video', label: 'Add Video Input Track (RobOS IP Cam / Webcam)...', kbd: '', run: () => openAddVideoModal() },
      { icon: 'drumset-ai', label: 'DrumSet AI All-Mic Soundcheck...', kbd: '', run: () => openDrumsetWizard() },
      { icon: 'metronome', label: 'Generate Click Track Below Selected (Gemini AI)...', kbd: '', disabled: !primaryTrack || !(primaryTrack.clips || []).some(c => !c.muted), run: () => primaryTrack && generateClickTrackUnderTrack(primaryTrack) },
      { icon: 'drum-replace', label: 'Remove Drums to New Track Below (Gemini AI)...', kbd: '', disabled: !primaryTrack || !(primaryTrack.clips || []).some(c => !c.muted), run: () => primaryTrack && removeDrumsUnderTrack(primaryTrack) },
      { icon: 'lyrics', label: 'Create Lyrics Track (MIDI Karaoke .KAR)...', kbd: '', disabled: !primaryTrack || !(primaryTrack.clips || []).some(c => !c.muted), run: () => primaryTrack && createLyricsTrackUnderTrack(primaryTrack) },
      { sep: true },
      { icon: 'record', label: `Arm Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: 'Shift+R', disabled: tCnt === 0, run: () => armSelectedTracks() },
      { icon: 'stop', label: `Disarm Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: '', disabled: tCnt === 0, run: () => disarmSelectedTracks() },
      { icon: 'record', label: `Arm All Tracks (${tracks.length})`, kbd: 'Ctrl+Alt+R', disabled: !hasTracks, run: () => armAllTracks() },
      { icon: 'stop', label: 'Disarm All Tracks', kbd: '', disabled: !hasTracks, run: () => disarmAllTracks() },
      { sep: true },
      { icon: 'mute', label: 'Mute / Unmute Selected Track(s)', kbd: 'M', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = first ? !first.muted : true;
        await commitEdit('Mute/Unmute Selected Tracks', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'muted', nextVal);
        });
      } },
      { icon: 'speaker', label: 'Unmute All Tracks', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Unmute All Tracks', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'muted', false); });
      } },
      { icon: 'headphones', label: 'Solo / Unsolo Selected Track(s)', kbd: 'Shift+S', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = first ? !first.soloed : true;
        await commitEdit('Solo/Unsolo Selected Tracks', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'soloed', nextVal);
        });
      } },
      { icon: 'headphones', label: 'Clear All Solos', kbd: 'Ctrl+Alt+S', disabled: !tracks.some(t => t.soloed), run: async () => {
        await commitEdit('Clear All Solos', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'soloed', false); });
      } },
      { icon: 'phase', label: 'Invert 180° Phase (Ø) on Selected', kbd: '', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = !first?.fx?.phaseInvert;
        await commitEdit('Toggle Phase Invert', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'phaseInvert', nextVal);
        });
      } },
      { sep: true },
      { icon: 'edit', label: 'Rename Selected Track...', kbd: 'F2', disabled: tCnt === 0, run: () => {
        inlineRenamingTrackId = [...selectedTrackIds][0];
        renderStudio();
      } },
      { icon: 'duplicate', label: 'Duplicate Selected Track(s) (with Regions)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Duplicate Track(s)', () => {
          selectedTrackIds = new Set(DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: true }));
        });
      } },
      { icon: 'copy', label: 'Duplicate Selected Track Setup (Empty)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Duplicate Empty Track(s)', () => {
          selectedTrackIds = new Set(DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: false }));
        });
      } },
      { icon: 'arrow-up', label: 'Move Selected Track(s) Up', kbd: 'Alt+Up', disabled: !primaryTrack || primaryIdx <= 0, run: async () => {
        await commitEdit('Move Track(s) Up', () => { DE.reorderTracksBatch(currentProject, selectedTrackIds.size ? selectedTrackIds : new Set([primaryTrack.id]), -1); });
      } },
      { icon: 'arrow-down', label: 'Move Selected Track(s) Down', kbd: 'Alt+Down', disabled: !primaryTrack || primaryIdx >= tracks.length - 1, run: async () => {
        await commitEdit('Move Track(s) Down', () => { DE.reorderTracksBatch(currentProject, selectedTrackIds.size ? selectedTrackIds : new Set([primaryTrack.id]), 1); });
      } },
      { icon: 'bolt', label: 'Auto-Normalize Selected Track Gain (-6 dBFS)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Auto-Normalize Track Gain', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) DE.normalizeTrackGain(t, -6.0);
        });
      } },
      { icon: 'minus', label: 'Clear Recorded Regions on Selected Track(s)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Clear Track Takes', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) t.clips = [];
        });
      } },
      { sep: true },
      { icon: 'trash', label: `Remove Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: 'Shift+Del', disabled: tCnt === 0, danger: true, run: () => removeSelectedTracks() },
      { icon: 'warning', label: `Remove All Tracks (${tracks.length})`, kbd: '', disabled: !hasTracks, danger: true, run: () => removeAllTracks() },
    ];
  }

  if (key === 'clip') {
    const forSelClips = (fn) => {
      for (const tr of tracks) for (const c of (tr.clips || [])) if (effectiveClipIds.has(c.id)) fn(c, tr);
    };
    return [
      { icon: 'scissors', label: 'Split Region(s) at Playhead', kbd: 'S', disabled: !hasClips, run: () => editSplitSelectedOrPlayhead() },
      { icon: 'trim-left', label: 'Trim Start to Playhead', kbd: '[', disabled: !hasClips, run: () => editTrimToPlayhead('left') },
      { icon: 'trim-right', label: 'Trim End to Playhead', kbd: ']', disabled: !hasClips, run: () => editTrimToPlayhead('right') },
      { sep: true },
      { icon: 'mute', label: 'Mute / Unmute Selected Region(s)', kbd: 'M', disabled: effCnt === 0, run: async () => {
        let nextM = null;
        await commitEdit('Mute/Unmute Take(s)', () => {
          forSelClips((c) => { if (nextM === null) nextM = !c.muted; c.muted = nextM; });
        });
      } },
      { icon: 'bolt', label: 'Normalize Region Gain (-3 dBFS)', kbd: '', disabled: effCnt === 0, run: async () => {
        await commitEdit('Normalize Take Gain', () => { forSelClips(c => DE.normalizeClipGain(c, -3.0)); }, { statusMsg: 'Normalized selected region(s) to -3.0 dBFS' });
      } },
      { icon: 'faders', label: 'Reset Region Gain (0.0 dB)', kbd: '', disabled: effCnt === 0, run: async () => {
        await commitEdit('Reset Take Gain', () => { forSelClips(c => { c.gainDb = 0; }); });
      } },
      { icon: 'fade', label: 'Apply 15 ms De-Click Fades', kbd: '', disabled: effCnt === 0, run: async () => {
        await commitEdit('Apply 15ms De-Click Fades', () => {
          forSelClips(c => {
            const maxF = Math.max(0.01, (Number(c.durationSec) || 0.1) * 0.45);
            c.fadeInSec = Math.min(maxF, 0.015);
            c.fadeOutSec = Math.min(maxF, 0.015);
          });
        });
      } },
      { icon: 'fade', label: 'Clear Region Fades (0 ms)', kbd: '', disabled: effCnt === 0, run: async () => {
        await commitEdit('Clear Take Fades', () => { forSelClips(c => { c.fadeInSec = 0; c.fadeOutSec = 0; }); });
      } },
      { sep: true },
      { icon: 'arrow-left', label: 'Nudge Selected Region(s) Left (-50 ms)', kbd: 'Ctrl+Left', disabled: effCnt === 0, run: async () => {
        await commitEdit('Nudge Take Left', () => { DE.moveClipsByDelta(currentProject, effectiveClipIds, -0.05); });
      } },
      { icon: 'arrow-right', label: 'Nudge Selected Region(s) Right (+50 ms)', kbd: 'Ctrl+Right', disabled: effCnt === 0, run: async () => {
        await commitEdit('Nudge Take Right', () => { DE.moveClipsByDelta(currentProject, effectiveClipIds, 0.05); });
      } },
      { icon: 'trim-right', label: 'Move Start to Playhead', kbd: '', disabled: effCnt === 0, run: async () => {
        let minS = Infinity;
        forSelClips(c => { if ((Number(c.startSec) || 0) < minS) minS = Number(c.startSec) || 0; });
        if (Number.isFinite(minS)) {
          await commitEdit('Move Take(s) to Playhead', () => { DE.moveClipsByDelta(currentProject, effectiveClipIds, playheadSec - minS); });
        }
      } },
      { icon: 'rewind', label: 'Snap Start to 00:00.00', kbd: '', disabled: effCnt === 0, run: async () => {
        let minS = Infinity;
        forSelClips(c => { if ((Number(c.startSec) || 0) < minS) minS = Number(c.startSec) || 0; });
        if (Number.isFinite(minS)) {
          await commitEdit('Snap Take(s) to 00:00.00', () => { DE.moveClipsByDelta(currentProject, effectiveClipIds, -minS); });
        }
      } },
      { icon: 'drum-replace', label: 'Re-Detect Drum Transients', kbd: '', disabled: effCnt === 0, run: async () => {
        const trIds = new Set();
        forSelClips((_c, tr) => trIds.add(tr.id));
        await commitEdit('Re-Detect Drum Transients', () => {}, { reanalyzeTrackIds: [...trIds] });
      } },
      { icon: 'edit', label: 'Rename Region...', kbd: 'F2', disabled: cCnt !== 1 && tCnt !== 1, run: () => editRenameFocused() },
      { sep: true },
      { icon: 'trash', label: `Delete Selected Region(s)${cCnt ? ` (${cCnt})` : ''}`, kbd: 'Del', disabled: cCnt === 0, danger: true, run: () => editDeleteSelected() },
    ];
  }

  if (key === 'transport') {
    const metroOn = Boolean(currentProject?.metronome);
    return [
      { icon: isPlaying ? 'stop' : 'play', label: isPlaying ? 'Stop Playback (Return Start)' : 'Play Timeline', kbd: 'Space', run: () => startPlayback() },
      { icon: isPlaying ? 'stop' : 'play', label: 'Play / Pause at Cursor', kbd: 'Enter', run: () => {
        if (isRecording) toggleRecording({ keepCursorAtStop: true });
        else if (isPlaying) stopPlayback({ returnToStart: false });
        else startPlayback();
      } },
      { icon: isRecording ? 'stop' : 'record', label: isRecording ? 'Stop & Save Recorded Media' : 'Record Armed Tracks', kbd: 'Ctrl+R', run: () => toggleRecording() },
      { icon: 'trash', label: 'Abort Recording & Delete Incomplete Pass', kbd: 'Alt+Bksp', disabled: !isRecording, danger: true, run: () => abortCurrentRecording() },
      { icon: 'refresh', label: 'Quick Retake Pass (Discard & Re-Punch)', kbd: 'Ctrl+Shift+R', run: () => quickRetakeRecording() },
      { sep: true },
      { icon: 'rewind', label: 'Go to Start of Project (00:00.000)', kbd: 'W / Home', run: () => {
        if (isRecording) return;
        playheadSec = 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(0);
        if (isPlaying) { stopPlayback({ returnToStart: false }); startPlayback(); }
        else drawAllTimelineCanvases();
      } },
      { icon: 'plus', label: 'Insert Marker at Cursor / Recording Pos', kbd: 'Shift+M', run: async () => {
        if (!currentProject) return;
        const m = DE.addProjectMarker(currentProject, playheadSec);
        invalidateStaticTimelineCaches();
        markDirty(true);
        drawAllTimelineCanvases();
        if (!isRecording) await syncProjectToMain();
        showStatus(`Dropped Marker ${m.num} (${m.name}) at ${formatTimecode(m.timeSec)}`);
      } },
      { sep: true },
      { icon: 'metronome', label: `Metronome Click (${metroOn ? 'ON' : 'OFF'})`, kbd: 'C', run: async () => {
        const res = await window.robos.updateProjectMeta({ metronome: !metroOn });
        if (res?.ok) { currentProject = res.project; renderStudio(); }
      } },
      { icon: 'clock', label: `1-Bar Record Count-In (${countInEnabled ? 'ON' : 'OFF'})`, kbd: 'Shift+C', run: () => {
        countInEnabled = !countInEnabled;
        showStatus(`1-Bar Record Count-In: ${countInEnabled ? 'ON' : 'OFF'}`);
      } },
      { icon: 'loop', label: `Repeat / Loop Playback (${loopPlayback ? 'ON' : 'OFF'})`, kbd: 'Alt+R', run: () => {
        loopPlayback = !loopPlayback;
        updateEditToolbarState();
        showStatus(`Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
      } },
      { sep: true },
      { icon: 'sliders', label: `Set Session Tempo (${currentProject?.bpm || 120} BPM)...`, kbd: '', run: () => {
        openRenameModal('Set Session Tempo', 'Tempo (40 – 280 BPM)', String(currentProject?.bpm || 120), async (val) => {
          const nextBpm = DE.clamp(40, 280, Math.round(Number(val) || 120));
          const res = await window.robos.updateProjectMeta({ bpm: nextBpm });
          if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); showStatus(`Set session tempo to ${nextBpm} BPM`); }
        });
      } },
    ];
  }

  if (key === 'mix') {
    return [
      { icon: 'channel-fx', label: `Toggle Channel Insert & Trigger Rack (${selectedTrackId ? 'OPEN' : 'CLOSED'})`, kbd: 'I', disabled: !hasTracks, run: () => {
        if (selectedTrackId) selectedTrackId = null;
        else selectedTrackId = primaryTrack?.id || null;
        renderStudio();
      } },
      { sep: true },
      { icon: 'faders', label: 'Reset All Track Input Trims (0.0 dB)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Reset All Track Gains', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'gainDb', 0); }, { statusMsg: 'Reset all track input trims to 0.0 dB' });
      } },
      { icon: 'speaker', label: 'Reset All Channel Faders (100%)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Reset All Volumes', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'volume', 1.0); }, { statusMsg: 'Reset all channel faders to unity (100%)' });
      } },
      { icon: 'balance', label: 'Center All Stereo Pans (C)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Center All Pans', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'pan', 0); }, { statusMsg: 'Centered all stereo pans' });
      } },
      { sep: true },
      { icon: 'drum-replace', label: 'Enable Drum Replacement on Selected Track(s)', kbd: '', disabled: tCnt === 0, run: async () => {
        const ids = [...selectedTrackIds];
        await commitEdit('Enable Drum Replacement', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) t.soundReplacement = { ...(t.soundReplacement || {}), enabled: true, supported: true };
        }, { reanalyzeTrackIds: ids });
      } },
      { icon: 'minus', label: 'Disable All Drum Sound Replacement', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Disable All Drum Replacement', () => {
          for (const t of tracks) t.soundReplacement = { ...(t.soundReplacement || {}), enabled: false };
        });
      } },
      { icon: 'package', label: 'VST & Sample Directories / Drum Kits...', kbd: 'Ctrl+Shift+P', run: () => openVstDirectoriesModal() },
    ];
  }

  if (key === 'view') {
    const inStudio = !document.getElementById('view-studio-stage')?.classList.contains('hidden');
    return [
      { icon: 'daw-crest', label: `Workstation Arrangement${inStudio ? ' [Active]' : ''}`, kbd: '1', run: () => switchView('studio-stage') },
      { icon: 'audio-interface', label: `Hardware I/O — Audio Devices${!inStudio ? ' [Active]' : ''}`, kbd: '2', run: () => switchView('audio-devices') },
      { sep: true },
      { icon: 'zoom-in', label: 'Zoom In Arrangement', kbd: '+', run: () => setTimelineZoom(timelineZoom * 1.25) },
      { icon: 'zoom-out', label: 'Zoom Out Arrangement', kbd: '-', run: () => setTimelineZoom(timelineZoom / 1.25) },
      { icon: 'maximize', label: 'Zoom to Fit Session (100%)', kbd: 'Ctrl+0', run: () => setTimelineZoom(1.0, { resetOffset: true }) },
      { sep: true },
      { icon: 'channel-fx', label: `${selectedTrackId ? 'Hide' : 'Show'} Channel Insert & Trigger Rack`, kbd: 'I', disabled: !hasTracks, run: () => {
        selectedTrackId = selectedTrackId ? null : (primaryTrack?.id || null);
        renderStudio();
      } },
      { sep: true },
      { icon: 'video', label: `${(videoDockOpen || videoPopoutOpen) ? 'Hide' : 'Show'} Video Output Monitor`, kbd: 'V', run: () => toggleVideoOutputMonitor() },
      { icon: 'popout', label: 'Pop Out Video Output to Standalone Window', kbd: '', run: () => popOutVideoOutputToAppWindow() },
    ];
  }

  if (key === 'help') {
    return [
      { icon: 'keyboard', label: 'Keyboard & Mouse Shortcuts Reference', kbd: '?', run: () => {
        document.getElementById('shortcuts-modal')?.classList.remove('hidden');
      } },
      { icon: 'refresh', label: 'Rescan Focusrite USB & PipeWire Audio Bus', kbd: '', run: async () => {
        const snap = await window.robos.getAudioSnapshot();
        renderSnapshot(snap);
        renderStudio();
        showStatus(snap.focusrite?.connected ? `Connected to ${snap.focusrite.model}` : 'Rescanned PipeWire bus.');
      } },
      { icon: 'drum-replace', label: 'VST & Sample Directories / Open Drum Kits...', kbd: 'Ctrl+Shift+P', run: () => openVstDirectoriesModal() },
    ];
  }

  return [];
}

function openMenubarDropdown(key, triggerEl) {
  const popup = document.getElementById('daw-menubar-popup');
  if (!popup || !triggerEl) return;
  closeContextMenu();

  if (activeMenubarKey === key && !popup.classList.contains('hidden')) {
    closeMenubarDropdown();
    return;
  }

  activeMenubarKey = key;
  document.querySelectorAll('.menubar-trigger').forEach(b => b.classList.toggle('open', b.dataset.menubar === key));
  const items = buildMenubarItems(key);

  popup.innerHTML = items.map((item, idx) => {
    if (item.sep) return '<div class="ctx-sep"></div>';
    return `<button type="button" class="ctx-item ${item.danger ? 'danger' : ''}" data-mb-idx="${idx}" ${item.disabled ? 'disabled' : ''}>
      <span class="ctx-item-left">${DI.menuIcon(item.icon)}<span>${esc(item.label)}</span></span>
      <span class="ctx-kbd">${esc(item.kbd || '')}</span>
    </button>`;
  }).join('');

  const rect = triggerEl.getBoundingClientRect();
  popup.classList.remove('hidden');
  popup.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - 300)))}px`;
  popup.style.top = `${Math.round(rect.bottom + 2)}px`;

  popup.querySelectorAll('[data-mb-idx]').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const item = items[Number(btn.dataset.mbIdx)];
      closeMenubarDropdown();
      if (item && !item.disabled && typeof item.run === 'function') {
        await item.run();
      }
    });
  });
}

// ─── 4 Contextual Right-Click Menus: Track, Empty Rack, Take, Timeline Space ───

function ctxRow(attr, cmd, icon, label, kbd = '', { disabled = false, danger = false } = {}) {
  return `<button type="button" class="ctx-item${danger ? ' danger' : ''}" ${attr}="${esc(cmd)}" ${disabled ? 'disabled' : ''}>
    <span class="ctx-item-left">${DI.menuIcon(icon)}<span>${esc(label)}</span></span>
    <span class="ctx-kbd">${esc(kbd)}</span>
  </button>`;
}

function openEmptyRackContextMenu(ev) {
  const menu = document.getElementById('daw-context-menu');
  if (!menu) return;
  closeMenubarDropdown();
  const tracks = currentProject?.tracks || [];
  const tCnt = selectedTrackIds.size;

  menu.innerHTML = `
    <div class="ctx-header">
      <span class="ctx-item-left">${DI.badge('daw-crest', 15)}<span>CHANNEL RACK (${tracks.length})</span></span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${tCnt} SEL</span>
    </div>
    ${ctxRow('data-rack-ctx', 'add-1', 'plus', 'Add Blank Audio Track', 'Ctrl+T')}
    ${ctxRow('data-rack-ctx', 'add-4', 'layers', 'Add 4 Sequential Audio Tracks', 'Ctrl+Shift+T')}
    ${ctxRow('data-rack-ctx', 'add-8', 'layers', 'Add 8 Sequential Audio Tracks')}
    ${ctxRow('data-rack-ctx', 'wiz-mic', 'mic-wizard', 'Add Mic via Studio Wizard...')}
    ${ctxRow('data-rack-ctx', 'add-video', 'video', 'Add RobOS IP Camera / Video Track (HD)...')}
    ${ctxRow('data-rack-ctx', 'wiz-drumset', 'drumset-ai', 'DrumSet AI Soundcheck (Gemini)...')}
    ${ctxRow('data-rack-ctx', 'import-wav', 'import-wav', 'Import Audio / Video File(s)...', 'Ctrl+Shift+I')}
    <div class="ctx-sep"></div>
    ${ctxRow('data-rack-ctx', 'sel-all-tracks', 'check-square', `Select All Tracks (${tracks.length})`, 'Ctrl+Shift+A', { disabled: !tracks.length })}
    ${ctxRow('data-rack-ctx', 'arm-all', 'record', 'Arm All Tracks', 'Ctrl+Alt+R', { disabled: !tracks.length })}
    ${ctxRow('data-rack-ctx', 'disarm-all', 'stop', 'Disarm All Tracks', '', { disabled: !tracks.length })}
    ${ctxRow('data-rack-ctx', 'unmute-all', 'speaker', 'Unmute All & Clear Solos', '', { disabled: !tracks.length })}
    <div class="ctx-sep"></div>
    ${ctxRow('data-rack-ctx', 'rem-sel', 'trash', `Remove Selected Track(s) (${tCnt})`, 'Shift+Del', { disabled: !tCnt, danger: true })}
    ${ctxRow('data-rack-ctx', 'rem-all', 'warning', `Remove All Tracks (${tracks.length})`, '', { disabled: !tracks.length, danger: true })}
  `;

  positionContextMenu(menu, ev.clientX, ev.clientY);

  menu.querySelectorAll('[data-rack-ctx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.rackCtx;
      closeContextMenu();
      if (cmd === 'add-1') await addBlankAudioTracks(1);
      else if (cmd === 'add-4') await addBlankAudioTracks(4);
      else if (cmd === 'add-8') await addBlankAudioTracks(8);
      else if (cmd === 'wiz-mic') openAddMicWizard();
      else if (cmd === 'add-video') openAddVideoModal({ scanLan: true, preferredType: 'robos-ip-camera' });
      else if (cmd === 'wiz-drumset') openDrumsetWizard();
      else if (cmd === 'import-wav') await importAudioWavFiles();
      else if (cmd === 'sel-all-tracks') editSelectAllTracksOnly();
      else if (cmd === 'arm-all') await armAllTracks();
      else if (cmd === 'disarm-all') await disarmAllTracks();
      else if (cmd === 'unmute-all') {
        await commitEdit('Unmute All & Clear Solos', () => {
          DE.setTracksPropertyBatch(currentProject, 'all', 'muted', false);
          DE.setTracksPropertyBatch(currentProject, 'all', 'soloed', false);
        });
      } else if (cmd === 'rem-sel') await removeSelectedTracks();
      else if (cmd === 'rem-all') await removeAllTracks();
    });
  });
}

function openTimelineSpaceContextMenu(ev, track, clickTimeSec) {
  const menu = document.getElementById('daw-context-menu');
  if (!menu || !currentProject) return;
  closeMenubarDropdown();
  const safeTime = DE.snapTimeToBeatGrid(clickTimeSec, currentProject.bpm || 120, snapToGrid);

  menu.innerHTML = `
    <div class="ctx-header">
      <span class="ctx-item-left">${DI.svg('clock', 13.5)}<span>ARRANGEMENT @ ${formatTimecode(safeTime)}</span></span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${esc(track ? track.name : 'RULER')}</span>
    </div>
    ${ctxRow('data-tl-ctx', 'move-ph', 'trim-right', `Move Playhead Here (${formatTimecode(safeTime)})`, 'Click')}
    ${ctxRow('data-tl-ctx', 'play-here', 'play', 'Play From Here')}
    <div class="ctx-sep"></div>
    ${ctxRow('data-tl-ctx', 'set-from', 'trim-left', `Set 'From' (${formatTimecode(safeTime)})`, 'Drag Ruler')}
    ${ctxRow('data-tl-ctx', 'set-to', 'trim-right', `Set 'To' (${formatTimecode(safeTime)})`, 'Drag Ruler')}
    ${hasActiveTimeSelection() ? ctxRow('data-tl-ctx', 'clear-range', 'close', `Clear Time Selection (${formatTimecode(timeSelection.fromSec)} -> ${formatTimecode(timeSelection.toSec)})`, 'DblClick') : ''}
    ${ctxRow('data-tl-ctx', 'export-mixdown', 'mixdown-export', hasActiveTimeSelection() ? 'Export Selected Range...' : 'Export Audio Mixdown...', 'Ctrl+Shift+E')}
    <div class="ctx-sep"></div>
    ${ctxRow('data-tl-ctx', 'paste-here', 'paste', 'Paste Region(s) Here', 'Ctrl+V', { disabled: !clipClipboard })}
    ${ctxRow('data-tl-ctx', 'import-here', 'import-wav', 'Import Audio / Video Here...', 'Ctrl+Shift+I')}
    ${track ? ctxRow('data-tl-ctx', 'gen-click', 'metronome', 'Generate Click Track', 'Gemini AI', { disabled: !(track.clips || []).some(c => !c.muted) }) : ''}
    ${track ? ctxRow('data-tl-ctx', 'remove-drums', 'drum-replace', 'Remove Drums', 'Gemini AI', { disabled: !(track.clips || []).some(c => !c.muted) }) : ''}
    ${track ? ctxRow('data-tl-ctx', 'create-lyrics', 'lyrics', 'Create Lyrics Track', 'MIDI .KAR', { disabled: !(track.clips || []).some(c => !c.muted) }) : ''}
    ${ctxRow('data-tl-ctx', 'split-all-here', 'scissors', `Split All Regions Crossing ${formatTimecode(safeTime)}`)}
    <div class="ctx-sep"></div>
    ${ctxRow('data-tl-ctx', 'toggle-snap', snapToGrid ? 'check' : 'magnet', `Snap to Beat Grid (${snapToGrid ? 'ON' : 'OFF'})`, 'G')}
    ${ctxRow('data-tl-ctx', 'toggle-loop', 'loop', `Loop Timeline Playback (${loopPlayback ? 'ON' : 'OFF'})`, 'L')}
    ${ctxRow('data-tl-ctx', 'add-track', 'plus', 'Add Blank Audio Track', 'Ctrl+T')}
    ${track ? ctxRow('data-tl-ctx', 'track-menu', 'faders', `Open "${track.name}" Channel Menu...`, '→') : ''}
  `;

  positionContextMenu(menu, ev.clientX, ev.clientY);

  menu.querySelectorAll('[data-tl-ctx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.tlCtx;
      closeContextMenu();
      if (cmd === 'move-ph') {
        seekPlayheadTo(safeTime);
      } else if (cmd === 'set-from') {
        setTimeSelectionFrom(safeTime);
      } else if (cmd === 'set-to') {
        setTimeSelectionTo(safeTime);
      } else if (cmd === 'clear-range') {
        clearTimeSelection();
      } else if (cmd === 'export-mixdown') {
        openExportMixdownModal();
      } else if (cmd === 'play-here') {
        stopPlayback({ returnToStart: false });
        playheadSec = safeTime;
        document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
        await startPlayback();
      } else if (cmd === 'paste-here') {
        if (!clipClipboard) return;
        await commitEdit('Paste Take(s)', () => {
          const created = DE.pasteClipsIntoProject(currentProject, clipClipboard, safeTime, track?.id || null);
          selectedClipIds = new Set(created);
        }, { statusMsg: `Pasted region(s) at ${formatTimecode(safeTime)}` });
      } else if (cmd === 'import-here') {
        await importAudioWavFiles({ startSec: safeTime, targetTrackId: track?.id || null });
      } else if (cmd === 'gen-click' && track) {
        await generateClickTrackUnderTrack(track);
      } else if (cmd === 'remove-drums' && track) {
        await removeDrumsUnderTrack(track);
      } else if (cmd === 'create-lyrics' && track) {
        await createLyricsTrackUnderTrack(track);
      } else if (cmd === 'split-all-here') {
        let cnt = 0;
        await commitEdit('Split All Takes at Cursor', () => {
          const out = DE.splitClipsInProject(currentProject, {
            selectedClipIds: new Set(),
            selectedTrackIds: new Set(),
            splitTimeSec: safeTime,
          });
          cnt = out.splitCount;
          if (out.newClipIds.length) selectedClipIds = new Set(out.newClipIds);
        });
        showStatus(cnt ? `Split ${cnt} region(s) at ${formatTimecode(safeTime)}` : 'No regions cross that timeline position.');
      } else if (cmd === 'toggle-snap') {
        snapToGrid = !snapToGrid;
        updateEditToolbarState();
      } else if (cmd === 'toggle-loop') {
        loopPlayback = !loopPlayback;
        updateEditToolbarState();
      } else if (cmd === 'add-track') {
        await addBlankAudioTracks(1, { afterTrackId: track?.id || null });
      } else if (cmd === 'track-menu' && track) {
        openTrackContextMenu(ev, track, safeTime);
      }
    });
  });
}

function openTrackContextMenu(ev, track, clickTimeSec = null) {
  const menu = document.getElementById('daw-context-menu');
  if (!menu || !currentProject) return;
  closeMenubarDropdown();

  const tracks = currentProject.tracks || [];
  const targetIds = selectedTrackIds.has(track.id) && selectedTrackIds.size > 0
    ? new Set(selectedTrackIds)
    : new Set([track.id]);
  const multiLabel = targetIds.size > 1 ? `${targetIds.size} Tracks Selected` : track.name;
  const trackIdx = tracks.findIndex(t => t.id === track.id);

  const colorDots = DE.STUDIO_COLORS.map(c =>
    `<button type="button" class="ctx-color-dot ${(track.color || '').toLowerCase() === c.toLowerCase() ? 'active' : ''}" data-ctx-color="${esc(c)}" style="background:${esc(c)}" title="Set Track Color ${esc(c)}"></button>`
  ).join('');

  menu.innerHTML = `
    <div class="ctx-header">
      <span class="ctx-item-left">${DI.badge('mic-wizard', 15)}<span>${esc(multiLabel)}</span></span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${DE.formatDb(Number(track.gainDb) || 0)}</span>
    </div>
    ${ctxRow('data-ctx', 'gen-click', 'metronome', 'Generate Click Track', 'Gemini AI', { disabled: !(track.clips || []).some(c => !c.muted) })}
    ${ctxRow('data-ctx', 'remove-drums', 'drum-replace', 'Remove Drums', 'Gemini AI', { disabled: !(track.clips || []).some(c => !c.muted) })}
    ${ctxRow('data-ctx', 'create-lyrics', 'lyrics', 'Create Lyrics Track', 'MIDI .KAR', { disabled: !(track.clips || []).some(c => !c.muted) })}
    ${ctxRow('data-ctx', 'add-below', 'plus', 'Add Blank Audio Track Below', 'Ctrl+T')}
    ${ctxRow('data-ctx', 'rename-track', 'edit', 'Rename Track...', 'F2')}
    ${ctxRow('data-ctx', 'reset-gain', 'faders', 'Reset Input Trim (0.0 dB)', 'DblClick')}
    ${ctxRow('data-ctx', 'norm-gain', 'bolt', 'Auto-Normalize Track Gain (-6 dBFS)')}
    ${ctxRow('data-ctx', 'toggle-phase', 'phase', `${track.fx?.phaseInvert ? 'Disable' : 'Enable'} 180° Phase Invert (Ø)`, track.fx?.phaseInvert ? 'ON' : 'OFF')}
    <div class="ctx-sep"></div>
    ${ctxRow('data-ctx', 'toggle-arm', 'record', `${track.armed ? 'Disarm' : 'Arm'} Selected (${targetIds.size})`, 'Shift+R')}
    ${ctxRow('data-ctx', 'arm-all', 'record', `Arm All Tracks (${tracks.length})`, 'Ctrl+Alt+R')}
    ${ctxRow('data-ctx', 'disarm-all', 'stop', 'Disarm All Tracks')}
    ${ctxRow('data-ctx', 'exclusive-solo', 'headphones', track.soloed && tracks.filter(t => t.soloed).length === 1 ? 'Unsolo All' : 'Exclusive Solo This Track', 'Alt+Click')}
    ${ctxRow('data-ctx', 'toggle-mute', 'mute', `${track.muted ? 'Unmute' : 'Mute'} Track${targetIds.size > 1 ? `s (${targetIds.size})` : ''}`, 'M')}
    ${ctxRow('data-ctx', 'toggle-sr', 'drum-replace', `${track.soundReplacement?.enabled ? 'Disable' : 'Enable'} Drum Replacement`)}
    ${ctxRow('data-ctx', 'open-fx', 'channel-fx', 'Open Channel Insert & Trigger Rack', 'I')}
    <div class="ctx-inline-row">
      <span class="ctx-inline-lbl">Channel Color</span>
      <div class="ctx-pill-strip">${colorDots}</div>
    </div>
    <div class="ctx-sep"></div>
    ${ctxRow('data-ctx', 'select-all-tracks', 'check-square', `Select All Tracks (${tracks.length})`, 'Ctrl+Shift+A')}
    ${ctxRow('data-ctx', 'paste-here', 'paste', `Paste Region(s) ${clickTimeSec !== null ? `at ${formatTimecode(clickTimeSec)}` : 'at Playhead'}`, 'Ctrl+V', { disabled: !clipClipboard })}
    ${ctxRow('data-ctx', 'dup-with-takes', 'duplicate', `Duplicate Track${targetIds.size > 1 ? 's' : ''} (with Regions)`, 'Ctrl+D')}
    ${ctxRow('data-ctx', 'dup-empty', 'copy', 'Duplicate Track Setup (Empty)')}
    ${ctxRow('data-ctx', 'move-up', 'arrow-up', 'Move Track Up', 'Alt+Up', { disabled: trackIdx <= 0 })}
    ${ctxRow('data-ctx', 'move-down', 'arrow-down', 'Move Track Down', 'Alt+Down', { disabled: trackIdx >= tracks.length - 1 })}
    ${ctxRow('data-ctx', 'clear-takes', 'minus', 'Clear Recorded Regions', '', { disabled: (track.clips?.length || 0) === 0 && targetIds.size === 1 })}
    ${ctxRow('data-ctx', 'delete-track', 'trash', `Remove Track${targetIds.size > 1 ? `s (${targetIds.size})` : ''}`, 'Shift+Del', { danger: true })}
    ${tracks.length > 1 ? ctxRow('data-ctx', 'delete-all-tracks', 'warning', `Remove All Tracks (${tracks.length})`, '', { danger: true }) : ''}
  `;

  positionContextMenu(menu, ev.clientX, ev.clientY);

  menu.querySelectorAll('[data-ctx-color]').forEach(dot => {
    dot.addEventListener('click', async (e) => {
      e.stopPropagation();
      const color = dot.dataset.ctxColor;
      closeContextMenu();
      await commitEdit('Change Track Color', () => {
        for (const t of (currentProject.tracks || [])) {
          if (targetIds.has(t.id)) t.color = color;
        }
      });
    });
  });

  menu.querySelectorAll('[data-ctx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.ctx;
      closeContextMenu();

      if (cmd === 'gen-click') {
        await generateClickTrackUnderTrack(track);
      } else if (cmd === 'remove-drums') {
        await removeDrumsUnderTrack(track);
      } else if (cmd === 'create-lyrics') {
        await createLyricsTrackUnderTrack(track);
      } else if (cmd === 'add-below') {
        await addBlankAudioTracks(1, { afterTrackId: track.id });
      } else if (cmd === 'rename-track') {
        inlineRenamingTrackId = track.id;
        renderStudio();
      } else if (cmd === 'reset-gain') {
        await commitEdit('Reset Track Gain', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.gainDb = 0;
        }, { statusMsg: 'Reset track input trim to 0.0 dB' });
      } else if (cmd === 'norm-gain') {
        await commitEdit('Auto-Normalize Track Gain', () => {
          for (const t of tracks) if (targetIds.has(t.id)) DE.normalizeTrackGain(t, -6.0);
        }, { statusMsg: 'Normalized selected track input trim to -6.0 dBFS target' });
      } else if (cmd === 'toggle-phase') {
        const nextVal = !track.fx?.phaseInvert;
        await commitEdit('Toggle Phase Invert', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.fx = { ...(t.fx || {}), phaseInvert: nextVal };
        });
      } else if (cmd === 'toggle-arm') {
        const nextVal = !track.armed;
        await commitEdit('Toggle Record Arm', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.armed = nextVal;
        });
      } else if (cmd === 'arm-all') {
        await armAllTracks();
      } else if (cmd === 'disarm-all') {
        await disarmAllTracks();
      } else if (cmd === 'select-all-tracks') {
        editSelectAllTracksOnly();
      } else if (cmd === 'exclusive-solo') {
        const alreadyExclusive = track.soloed && tracks.filter(t => t.soloed).length === 1;
        await commitEdit('Exclusive Solo', () => {
          for (const t of tracks) t.soloed = alreadyExclusive ? false : (t.id === track.id);
        });
      } else if (cmd === 'toggle-mute') {
        const nextVal = !track.muted;
        await commitEdit('Toggle Track Mute', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.muted = nextVal;
        });
      } else if (cmd === 'toggle-sr') {
        const nextVal = !track.soundReplacement?.enabled;
        const reIds = [];
        await commitEdit('Toggle Drum Replacement', () => {
          for (const t of tracks) {
            if (!targetIds.has(t.id)) continue;
            t.soundReplacement = { ...(t.soundReplacement || {}), enabled: nextVal, supported: true };
            if (nextVal) reIds.push(t.id);
          }
        }, { reanalyzeTrackIds: reIds });
      } else if (cmd === 'open-fx') {
        selectedTrackId = track.id;
        renderStudio();
      } else if (cmd === 'paste-here') {
        if (!clipClipboard) return;
        const pasteTime = clickTimeSec !== null ? clickTimeSec : playheadSec;
        await commitEdit('Paste Take(s)', () => {
          const created = DE.pasteClipsIntoProject(currentProject, clipClipboard, pasteTime, track.id);
          selectedClipIds = new Set(created);
        }, { statusMsg: `Pasted region(s) at ${formatTimecode(pasteTime)}` });
      } else if (cmd === 'dup-with-takes' || cmd === 'dup-empty') {
        const includeClips = cmd === 'dup-with-takes';
        await commitEdit('Duplicate Track', () => {
          const newIds = DE.duplicateTracksInProject(currentProject, targetIds, { includeClips });
          selectedTrackIds = new Set(newIds);
        }, { statusMsg: `Duplicated ${targetIds.size} track(s)` });
      } else if (cmd === 'move-up') {
        await commitEdit('Move Track(s) Up', () => { DE.reorderTracksBatch(currentProject, targetIds, -1); });
      } else if (cmd === 'move-down') {
        await commitEdit('Move Track(s) Down', () => { DE.reorderTracksBatch(currentProject, targetIds, 1); });
      } else if (cmd === 'clear-takes') {
        await commitEdit('Clear Track Takes', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.clips = [];
        });
      } else if (cmd === 'delete-track') {
        await commitEdit('Remove Track(s)', () => {
          DE.deleteTracksFromProject(currentProject, targetIds);
        }, { statusMsg: `Removed ${targetIds.size} track(s) (Ctrl+Z to Undo)` });
      } else if (cmd === 'delete-all-tracks') {
        await removeAllTracks();
      }
    });
  });
}

function openTakeContextMenu(ev, track, clip, clickTimeSec) {
  const menu = document.getElementById('daw-context-menu');
  if (!menu || !currentProject) return;

  const targetClipIds = selectedClipIds.has(clip.id) && selectedClipIds.size > 0
    ? new Set(selectedClipIds)
    : new Set([clip.id]);
  const multiLabel = targetClipIds.size > 1 ? `${targetClipIds.size} Regions Selected` : (clip.name || 'Take');
  const clipStart = Number(clip.startSec) || 0;
  const clipEnd = clipStart + (Number(clip.durationSec) || 0);
  const canSplitHere = clickTimeSec > clipStart + 0.04 && clickTimeSec < clipEnd - 0.04;
  const canSplitPlayhead = playheadSec > clipStart + 0.04 && playheadSec < clipEnd - 0.04;

  menu.innerHTML = `
    <div class="ctx-header">
      <span class="ctx-item-left">${DI.svg('waveform', 14)}<span>${esc(multiLabel)}</span></span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${DE.formatDb(Number(clip.gainDb) || 0)}</span>
    </div>
    ${ctxRow('data-take-ctx', 'play-solo', 'play', 'Play Solo From This Region')}
    ${ctxRow('data-take-ctx', 'set-from', 'trim-left', `Set 'From' (${formatTimecode(clickTimeSec)})`, 'Drag Ruler')}
    ${ctxRow('data-take-ctx', 'set-to', 'trim-right', `Set 'To' (${formatTimecode(clickTimeSec)})`, 'Drag Ruler')}
    ${ctxRow('data-take-ctx', 'select-bounds', 'select-all', `Select Region Bounds (${formatTimecode(clipStart)} -> ${formatTimecode(clipEnd)})`)}
    ${hasActiveTimeSelection() ? ctxRow('data-take-ctx', 'clear-range', 'close', 'Clear Time Selection') : ''}
    ${ctxRow('data-take-ctx', 'export-mixdown', 'mixdown-export', 'Export Audio Mixdown...', 'Ctrl+Shift+E')}
    ${resolveClipVideoFilePath(clip) ? ctxRow('data-take-ctx', 'export-video-mp4', 'video', 'Export Video + Audio Mixdown (.mp4)...') : ''}
    ${resolveClipVideoFilePath(clip) ? ctxRow('data-take-ctx', 'reveal-video-mp4', 'folder', 'Reveal Raw Camera Video (.mp4) in Folder') : ''}
    <div class="ctx-sep"></div>
    ${ctxRow('data-take-ctx', 'gen-click', 'metronome', 'Generate Click Track', 'Gemini AI')}
    ${ctxRow('data-take-ctx', 'remove-drums', 'drum-replace', 'Remove Drums', 'Gemini AI')}
    ${ctxRow('data-take-ctx', 'create-lyrics', 'lyrics', 'Create Lyrics Track', 'MIDI .KAR')}
    ${ctxRow('data-take-ctx', 'split-here', 'scissors', `Split Region${targetClipIds.size > 1 ? 's' : ''} Here (${formatTimecode(clickTimeSec)})`, '', { disabled: !canSplitHere })}
    ${ctxRow('data-take-ctx', 'trim-start-here', 'trim-left', `Trim Start${targetClipIds.size > 1 ? 's' : ''} Here (${formatTimecode(clickTimeSec)})`, '[', { disabled: !canSplitHere })}
    ${ctxRow('data-take-ctx', 'trim-end-here', 'trim-right', `Trim End${targetClipIds.size > 1 ? 's' : ''} Here (${formatTimecode(clickTimeSec)})`, ']', { disabled: !canSplitHere })}
    ${ctxRow('data-take-ctx', 'split-playhead', 'scissors', `Split at Playhead (${formatTimecode(playheadSec)})`, 'S', { disabled: !(canSplitPlayhead || targetClipIds.size > 1) })}
    <div class="ctx-sep"></div>
    <div class="ctx-inline-row">
      <span class="ctx-inline-lbl">Region Clip Gain</span>
      <div class="ctx-pill-strip">
        <button type="button" class="ctx-mini-pill" data-take-gain="-6">-6 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="-3">-3 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="0">0 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="3">+3 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="6">+6 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="norm">Norm</button>
      </div>
    </div>
    <div class="ctx-inline-row">
      <span class="ctx-inline-lbl">Fade In &amp; Out</span>
      <div class="ctx-pill-strip">
        <button type="button" class="ctx-mini-pill" data-take-fade="0">0 ms</button>
        <button type="button" class="ctx-mini-pill" data-take-fade="0.015">15 ms</button>
        <button type="button" class="ctx-mini-pill" data-take-fade="0.05">50 ms</button>
        <button type="button" class="ctx-mini-pill" data-take-fade="0.25">250 ms</button>
      </div>
    </div>
    ${ctxRow('data-take-ctx', 'toggle-mute', 'mute', `${clip.muted ? 'Unmute' : 'Mute'} Region${targetClipIds.size > 1 ? 's' : ''}`, 'M')}
    ${ctxRow('data-take-ctx', 'redetect-transients', 'drum-replace', 'Re-Detect Drum Transients')}
    <div class="ctx-sep"></div>
    ${ctxRow('data-take-ctx', 'rename', 'edit', 'Rename Region...', 'F2')}
    ${ctxRow('data-take-ctx', 'copy', 'copy', `Copy Region${targetClipIds.size > 1 ? 's' : ''}`, 'Ctrl+C')}
    ${ctxRow('data-take-ctx', 'cut', 'scissors', `Cut Region${targetClipIds.size > 1 ? 's' : ''}`, 'Ctrl+X')}
    ${ctxRow('data-take-ctx', 'duplicate', 'duplicate', `Duplicate Region${targetClipIds.size > 1 ? 's' : ''}`, 'Ctrl+D')}
    ${ctxRow('data-take-ctx', 'snap-zero', 'rewind', 'Snap Start to 00:00.00')}
    ${ctxRow('data-take-ctx', 'move-playhead', 'trim-right', `Move Start to Playhead (${formatTimecode(playheadSec)})`)}
    ${ctxRow('data-take-ctx', 'delete', 'trash', `Delete Region${targetClipIds.size > 1 ? `s (${targetClipIds.size})` : ''}`, 'Del', { danger: true })}
  `;

  positionContextMenu(menu, ev.clientX, ev.clientY);

  const forEachSelectedClip = (cb) => {
    for (const tr of (currentProject.tracks || [])) {
      for (const c of (tr.clips || [])) {
        if (targetClipIds.has(c.id)) cb(c, tr);
      }
    }
  };

  menu.querySelectorAll('[data-take-gain]').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = pill.dataset.takeGain;
      closeContextMenu();
      await commitEdit('Adjust Take Gain', () => {
        forEachSelectedClip((c) => {
          if (val === 'norm') DE.normalizeClipGain(c, -3.0);
          else c.gainDb = Number(val);
        });
      }, { statusMsg: val === 'norm' ? 'Normalized selected region(s) to -3.0 dBFS' : `Set region gain to ${DE.formatDb(Number(val))}` });
    });
  });

  menu.querySelectorAll('[data-take-fade]').forEach(pill => {
    pill.addEventListener('click', async (e) => {
      e.stopPropagation();
      const fadeSec = Number(pill.dataset.takeFade) || 0;
      closeContextMenu();
      await commitEdit('Set Take Fades', () => {
        forEachSelectedClip((c) => {
          const maxF = Math.max(0.01, (Number(c.durationSec) || 0.1) * 0.45);
          c.fadeInSec = Math.min(maxF, fadeSec);
          c.fadeOutSec = Math.min(maxF, fadeSec);
        });
      }, { statusMsg: `Applied ${Math.round(fadeSec * 1000)} ms fade-in/out to selected region(s)` });
    });
  });

  menu.querySelectorAll('[data-take-ctx]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cmd = btn.dataset.takeCtx;
      closeContextMenu();

      if (cmd === 'play-solo') {
        stopPlayback();
        for (const t of (currentProject.tracks || [])) t.soloed = (t.id === track.id);
        playheadSec = Number(clip.startSec) || 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
        renderStudio();
        await syncProjectToMain();
        startPlayback();
      } else if (cmd === 'set-from') {
        const snapT = DE.snapTimeToBeatGrid(clickTimeSec, currentProject?.bpm || 120, snapToGrid);
        setTimeSelectionFrom(snapT);
      } else if (cmd === 'set-to') {
        const snapT = DE.snapTimeToBeatGrid(clickTimeSec, currentProject?.bpm || 120, snapToGrid);
        setTimeSelectionTo(snapT);
      } else if (cmd === 'select-bounds') {
        let lo = Infinity;
        let hi = 0;
        forEachSelectedClip((c) => {
          const s = Number(c.startSec) || 0;
          const e = s + (Number(c.durationSec) || 0);
          if (s < lo) lo = s;
          if (e > hi) hi = e;
        });
        if (Number.isFinite(lo) && hi > lo + 0.02) {
          setTimeSelectionRange(lo, hi);
          showStatus(`Selected region bounds: From ${formatTimecode(lo)} -> To ${formatTimecode(hi)}`);
        }
      } else if (cmd === 'clear-range') {
        clearTimeSelection();
      } else if (cmd === 'export-mixdown') {
        openExportMixdownModal();
      } else if (cmd === 'export-video-mp4') {
        openExportMixdownModal({ preferFormat: 'mp4', preferTrackId: track.id, preferClipId: clip.id });
      } else if (cmd === 'reveal-video-mp4') {
        await revealActiveVideoTakeInFolder(track.id, clip.id);
      } else if (cmd === 'gen-click') {
        await generateClickTrackUnderTrack(track);
      } else if (cmd === 'remove-drums') {
        await removeDrumsUnderTrack(track);
      } else if (cmd === 'create-lyrics') {
        await createLyricsTrackUnderTrack(track, { clipId: targetClipIds.size === 1 ? clip.id : null });
      } else if (cmd === 'split-here') {
        await commitEdit('Split Take', () => {
          const out = DE.splitClipsInProject(currentProject, {
            selectedClipIds: targetClipIds,
            selectedTrackIds,
            splitTimeSec: clickTimeSec,
          });
          if (out.newClipIds.length) selectedClipIds = new Set(out.newClipIds);
        }, { statusMsg: `Split region(s) at ${formatTimecode(clickTimeSec)}` });
      } else if (cmd === 'trim-start-here' || cmd === 'trim-end-here') {
        const edge = cmd === 'trim-start-here' ? 'left' : 'right';
        let trimmed = 0;
        await commitEdit(edge === 'left' ? 'Trim Start Here' : 'Trim End Here', () => {
          trimmed = DE.trimClipsToPlayhead(currentProject, targetClipIds, edge, clickTimeSec, selectedTrackIds);
        });
        showStatus(`Trimmed ${trimmed} region(s) ${edge === 'left' ? 'start' : 'end'} to ${formatTimecode(clickTimeSec)}`);
      } else if (cmd === 'split-playhead') {
        await editSplitSelectedOrPlayhead();
      } else if (cmd === 'toggle-mute') {
        const nextMuted = !clip.muted;
        await commitEdit('Mute/Unmute Take', () => {
          forEachSelectedClip((c) => { c.muted = nextMuted; });
        });
      } else if (cmd === 'redetect-transients') {
        const trIds = new Set();
        forEachSelectedClip((_c, tr) => trIds.add(tr.id));
        await commitEdit('Re-Detect Drum Transients', () => {}, {
          reanalyzeTrackIds: [...trIds],
          statusMsg: 'Re-detected drum transients on selected region track(s)',
        });
      } else if (cmd === 'rename') {
        openRenameModal('Rename Region', 'Region Label', clip.name || 'Take', async (newName) => {
          await commitEdit('Rename Take', () => { clip.name = newName; });
        });
      } else if (cmd === 'copy') {
        editCopySelected();
      } else if (cmd === 'cut') {
        await editCutSelected();
      } else if (cmd === 'duplicate') {
        await editDuplicateSelected();
      } else if (cmd === 'snap-zero' || cmd === 'move-playhead') {
        let minStart = Infinity;
        forEachSelectedClip((c) => {
          const s = Number(c.startSec) || 0;
          if (s < minStart) minStart = s;
        });
        const targetTime = cmd === 'snap-zero' ? 0 : playheadSec;
        if (Number.isFinite(minStart)) {
          await commitEdit('Move Take(s)', () => {
            DE.moveClipsByDelta(currentProject, targetClipIds, targetTime - minStart);
          }, { statusMsg: `Moved region(s) to ${formatTimecode(targetTime)}` });
        }
      } else if (cmd === 'delete') {
        await commitEdit('Delete Take(s)', () => {
          DE.deleteClipsFromProject(currentProject, targetClipIds);
        }, { statusMsg: `Deleted ${targetClipIds.size} region(s)` });
      }
    });
  });
}

// ─── Shared Keyboard & Toolbar Edit Commands ────────────────────────────────

function editSelectAll() {
  if (!currentProject) return;
  const all = DE.selectAllInProject(currentProject);
  selectedTrackIds = all.selectedTrackIds;
  selectedClipIds = all.selectedClipIds;
  anchorTrackId = currentProject.tracks?.[0]?.id || null;
  renderStudio();
  showStatus(`Selected all ${selectedTrackIds.size} track(s) and ${selectedClipIds.size} region(s)`);
}

async function editSplitSelectedOrPlayhead() {
  if (!currentProject) return;
  let splitCount = 0;
  await commitEdit('Split at Playhead', () => {
    const out = DE.splitClipsInProject(currentProject, {
      selectedClipIds,
      selectedTrackIds,
      splitTimeSec: playheadSec,
    });
    splitCount = out.splitCount;
    if (out.newClipIds.length) selectedClipIds = new Set(out.newClipIds);
  });
  if (splitCount > 0) {
    showStatus(`Split ${splitCount} region(s) at playhead (${formatTimecode(playheadSec)})`);
  } else {
    showStatus('Move the playhead inside a region (Click on timeline) before splitting (S).', true);
  }
}

function editCopySelected() {
  const effectiveClipIds = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
  if (!currentProject || !effectiveClipIds.size) {
    showStatus('Select one or more regions or tracks to copy (Click, Ctrl+Click, or Ctrl+A).', true);
    return;
  }
  clipClipboard = DE.copyClipsFromProject(currentProject, effectiveClipIds);
  if (clipClipboard) {
    showStatus(`Copied ${clipClipboard.entries.length} region(s) to clipboard`);
  }
}

async function editCutSelected() {
  const effectiveClipIds = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
  if (!currentProject || !effectiveClipIds.size) return;
  clipClipboard = DE.copyClipsFromProject(currentProject, effectiveClipIds);
  const cnt = effectiveClipIds.size;
  await commitEdit('Cut Take(s)', () => {
    DE.deleteClipsFromProject(currentProject, effectiveClipIds);
  }, { statusMsg: `Cut ${cnt} region(s) to clipboard` });
}

async function editPasteAtPlayhead() {
  if (!currentProject || !clipClipboard) {
    showStatus('Clipboard is empty — Copy (Ctrl+C) or Cut (Ctrl+X) a region first.', true);
    return;
  }
  const primaryTrackId = [...selectedTrackIds][0] || anchorTrackId || null;
  await commitEdit('Paste Take(s)', () => {
    const created = DE.pasteClipsIntoProject(currentProject, clipClipboard, playheadSec, primaryTrackId);
    selectedClipIds = new Set(created);
  }, { statusMsg: `Pasted ${clipClipboard.entries.length} region(s) at ${formatTimecode(playheadSec)}` });
}

async function editDuplicateSelected() {
  if (!currentProject) return;
  if (selectedClipIds.size > 0) {
    const cnt = selectedClipIds.size;
    await commitEdit('Duplicate Take(s)', () => {
      const created = DE.duplicateClipsInProject(currentProject, selectedClipIds);
      selectedClipIds = new Set(created);
    }, { statusMsg: `Duplicated ${cnt} phase-aligned region(s)` });
    return;
  }
  if (selectedTrackIds.size > 0) {
    const cnt = selectedTrackIds.size;
    await commitEdit('Duplicate Track(s)', () => {
      const created = DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: true });
      selectedTrackIds = new Set(created);
    }, { statusMsg: `Duplicated ${cnt} track(s)` });
    return;
  }
  showStatus('Select a region or track first to duplicate (Ctrl+D).', true);
}

async function editDeleteSelected() {
  if (!currentProject) return;
  if (selectedClipIds.size > 0) {
    const cnt = selectedClipIds.size;
    await commitEdit('Delete Take(s)', () => {
      DE.deleteClipsFromProject(currentProject, selectedClipIds);
    }, { statusMsg: `Deleted ${cnt} region(s)` });
    return;
  }
  if (selectedTrackIds.size > 0) {
    const cnt = selectedTrackIds.size;
    await commitEdit('Delete Track(s)', () => {
      DE.deleteTracksFromProject(currentProject, selectedTrackIds);
    }, { statusMsg: `Deleted ${cnt} track(s)` });
    return;
  }
}

function editRenameFocused() {
  if (!currentProject) return;
  if (selectedClipIds.size === 1) {
    const onlyClipId = [...selectedClipIds][0];
    const found = DE.findClipWithTrack(currentProject, onlyClipId);
    if (found) {
      openRenameModal('Rename Take', 'Take Label', found.clip.name || 'Take', async (newName) => {
        await commitEdit('Rename Take', () => { found.clip.name = newName; });
      });
      return;
    }
  }
  if (selectedTrackIds.size >= 1) {
    inlineRenamingTrackId = [...selectedTrackIds][0];
    renderStudio();
  }
}

// ─── ADD MIC WIZARD ─────────────────────────────────────────────────────────

function getActiveWizardProfile() {
  return micProfiles.find(p => p.id === wizProfileId) || micProfiles[0];
}

function openAddMicWizard() {
  wizStep = 1;
  wizCategory = 'all';
  if (!wizProfileId && micProfiles.length) wizProfileId = micProfiles[0].id;
  document.getElementById('add-mic-wizard-modal')?.classList.remove('hidden');
  renderWizardStep();
}

async function closeAddMicWizard() {
  await window.robos.wizardStopTapDetect();
  document.getElementById('add-mic-wizard-modal')?.classList.add('hidden');
}

function renderWizardMicCards() {
  const grid = document.getElementById('wiz-mic-cards-grid');
  if (!grid) return;
  const filtered = wizCategory === 'all'
    ? micProfiles
    : micProfiles.filter(p => p.category === wizCategory);

  grid.innerHTML = filtered.map(p => `
    <button type="button" class="mic-card ${p.id === wizProfileId ? 'selected' : ''}" data-mic-id="${esc(p.id)}">
      <div class="mic-card-img-wrap">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" />
        ${p.soundReplacement?.supported
          ? `<span class="mic-card-badge">${DI.badge('drum-replace', 11)}<span>Trigger</span></span>`
          : `<span class="mic-card-badge">${DI.badge('channel-fx', 11)}<span>LV2/EQ</span></span>`}
      </div>
      <div class="mic-card-title">${esc(p.name)}</div>
    </button>
  `).join('');

  grid.querySelectorAll('[data-mic-id]').forEach(card => {
    card.addEventListener('click', () => {
      wizProfileId = card.dataset.micId;
      grid.querySelectorAll('[data-mic-id]').forEach(c => {
        c.classList.toggle('selected', c.dataset.micId === wizProfileId);
      });
    });
    card.addEventListener('dblclick', () => {
      wizProfileId = card.dataset.micId;
      goToWizardStep(2);
    });
  });
}

function updateWizardChannelLevelsInPlace() {
  const container = document.getElementById('wiz-channel-list');
  const manualSel = document.getElementById('wiz-manual-channel');
  if (!container) return;

  if (manualSel && document.activeElement !== manualSel && manualSel.value !== wizSelectedChannelName) {
    manualSel.value = wizSelectedChannelName;
  }

  container.querySelectorAll('[data-ch-name]').forEach(row => {
    const chName = row.dataset.chName;
    const lvl = wizTapLevels[chName];
    const peakDb = lvl ? lvl.peakDb : -96;
    row.classList.toggle('selected', chName === wizSelectedChannelName);
    row.classList.toggle('spiking', peakDb >= -36);
    const fill = row.querySelector('.wiz-ch-bar-fill');
    if (fill) fill.style.width = `${dbToPercent(peakDb).toFixed(1)}%`;
  });
}

function renderWizardChannelRows() {
  const container = document.getElementById('wiz-channel-list');
  const manualSel = document.getElementById('wiz-manual-channel');
  if (!container || !manualSel) return;

  const inputs = getOrderedInputs();
  if ((!wizSelectedChannelName || !inputs.some(i => i.name === wizSelectedChannelName)) && inputs.length) {
    const usedNames = new Set((currentProject?.tracks || []).map(t => t.inputNodeName));
    const firstUnused = inputs.find(i => !usedNames.has(i.name)) || inputs[0];
    wizSelectedChannelName = firstUnused.name;
  }

  manualSel.innerHTML = inputs.map(inp =>
    `<option value="${esc(inp.name)}"${inp.name === wizSelectedChannelName ? ' selected' : ''}>${esc(inp.description)}</option>`
  ).join('');

  container.innerHTML = inputs.slice(0, 24).map(inp => {
    const lvl = wizTapLevels[inp.name];
    const peakDb = lvl ? lvl.peakDb : -96;
    const isSel = inp.name === wizSelectedChannelName;
    const isSpike = peakDb >= -36;
    return `
      <div class="wiz-ch-row ${isSel ? 'selected' : ''} ${isSpike ? 'spiking' : ''}" data-ch-name="${esc(inp.name)}">
        <span class="wiz-ch-label">${inp.isFocusrite ? '<span class="fr-led"></span>' : ''}${esc(inp.description)}</span>
        <div class="wiz-ch-bar">
          <div class="wiz-ch-bar-fill" style="width:${dbToPercent(peakDb).toFixed(1)}%"></div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-ch-name]').forEach(row => {
    const selectRow = () => {
      wizSelectedChannelName = row.dataset.chName;
      wizChannelUserPicked = true;
      if (manualSel) manualSel.value = wizSelectedChannelName;
      updateWizardChannelLevelsInPlace();
    };
    row.addEventListener('mousedown', selectRow);
    row.addEventListener('click', selectRow);
  });
}

function populateWizardStep3(profile) {
  const chipsEl = document.getElementById('wiz-plugin-chips');
  if (chipsEl) {
    chipsEl.innerHTML = (profile.fx?.openSourcePlugins || []).map(pl => `<span class="plugin-chip">${esc(pl)}</span>`).join('');
  }

  const gate = profile.fx?.gate || { enabled: true, thresholdDb: -36 };
  const eq = profile.fx?.eq || { enabled: true, hpfHz: 60, lowGainDb: 3, midGainDb: -3, highGainDb: 3 };
  const comp = profile.fx?.compressor || { enabled: true, ratio: 4 };

  const setSlider = (id, valId, val, fmt) => {
    const el = document.getElementById(id);
    const lbl = document.getElementById(valId);
    if (el) el.value = val;
    if (lbl) lbl.textContent = fmt(val);
  };

  document.getElementById('wiz-gate-enabled').checked = gate.enabled !== false;
  setSlider('wiz-gate-thresh', 'wiz-gate-val', gate.thresholdDb ?? -36, v => `${v} dB`);

  document.getElementById('wiz-eq-enabled').checked = eq.enabled !== false;
  setSlider('wiz-eq-hpf', 'wiz-hpf-val', eq.hpfHz ?? 60, v => `${v} Hz`);
  setSlider('wiz-eq-low', 'wiz-low-val', eq.lowGainDb ?? 0, v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);
  setSlider('wiz-eq-mid', 'wiz-mid-val', eq.midGainDb ?? 0, v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);
  setSlider('wiz-eq-high', 'wiz-high-val', eq.highGainDb ?? 0, v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);

  document.getElementById('wiz-comp-enabled').checked = comp.enabled !== false;
  setSlider('wiz-comp-ratio', 'wiz-comp-val', comp.ratio ?? 3.5, v => `${Number(v).toFixed(1)}:1`);

  // Sound Replacement Setup
  const sr = profile.soundReplacement || {};
  const srToggle = document.getElementById('wiz-sr-enabled');
  srToggle.checked = Boolean(sr.enabled);
  document.getElementById('wiz-sr-toggle-lbl').textContent = sr.enabled ? 'ON' : 'OFF';
  document.getElementById('wiz-sr-unsupported-note')?.classList.toggle('hidden', Boolean(sr.supported));

  populateWizardDrumSelectors(sr.kitId || 'gm-rock-kit', sr.pieceId || 'snare');
  setSlider('wiz-sr-thresh', 'wiz-sr-thresh-val', sr.thresholdDb ?? -28, v => `${v} dBFS`);
  setSlider('wiz-sr-blend', 'wiz-sr-blend-val', Math.round((sr.blend ?? 0.75) * 100), v => `${v}% Replaced`);
}

function populateWizardDrumSelectors(preferredKitId, preferredPieceId) {
  const kitSel = document.getElementById('wiz-sr-kit');
  const pieceSel = document.getElementById('wiz-sr-piece');
  if (!kitSel || !pieceSel) return;

  const kits = drumkitsStatus?.kits || [];
  kitSel.innerHTML = kits.map(k => {
    const genre = k.genreTag ? `[${k.genreTag}] ` : '';
    return `<option value="${esc(k.id)}"${k.id === preferredKitId ? ' selected' : ''}>${esc(genre)}${esc(k.name)} ${k.installed ? `(${k.sampleCount} samples)` : '(Click Install)'}</option>`;
  }).join('');

  const chosenKit = kits.find(k => k.id === kitSel.value) || kits[0];
  const pieces = Object.values(chosenKit?.pieces || {});
  pieceSel.innerHTML = pieces.map(p =>
    `<option value="${esc(p.id)}"${p.id === preferredPieceId ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');
}

async function goToWizardStep(step) {
  wizStep = step;
  await renderWizardStep();
}

async function renderWizardStep() {
  const profile = getActiveWizardProfile();
  document.getElementById('wiz-step-1')?.classList.toggle('hidden', wizStep !== 1);
  document.getElementById('wiz-step-2')?.classList.toggle('hidden', wizStep !== 2);
  document.getElementById('wiz-step-3')?.classList.toggle('hidden', wizStep !== 3);

  document.getElementById('wiz-pill-1')?.classList.toggle('active', wizStep === 1);
  document.getElementById('wiz-pill-2')?.classList.toggle('active', wizStep === 2);
  document.getElementById('wiz-pill-3')?.classList.toggle('active', wizStep === 3);

  const sub = document.getElementById('wiz-step-subtitle');
  const backBtn = document.getElementById('btn-wiz-back');
  const nextBtn = document.getElementById('btn-wiz-next');
  const addAnotherBtn = document.getElementById('btn-wiz-add-another');
  const finishBtn = document.getElementById('btn-wiz-finish');

  backBtn.disabled = wizStep === 1;
  nextBtn.classList.toggle('hidden', wizStep === 3);
  addAnotherBtn?.classList.toggle('hidden', wizStep !== 3);
  finishBtn.classList.toggle('hidden', wizStep !== 3);

  if (wizStep === 1) {
    sub.textContent = 'Step 1 of 3 — Select preset';
    nextBtn.textContent = 'Next: Input →';
    renderWizardMicCards();
    await window.robos.wizardStopTapDetect();
  } else if (wizStep === 2) {
    sub.textContent = `Step 2 of 3 — Select input for ${profile.shortLabel}`;
    nextBtn.textContent = 'Next: EQ & Trigger →';

    document.getElementById('wiz-selected-banner').innerHTML = `
      <img src="${esc(profile.image)}" alt="${esc(profile.name)}" />
      <strong>${esc(profile.name)}</strong>
    `;
    const existingSame = (currentProject?.tracks || []).filter(t => t.profileId === profile.id).length;
    document.getElementById('wiz-track-name').value = existingSame > 0 ? `${profile.shortLabel} ${existingSame + 1}` : profile.shortLabel;
    const defPan = Number(profile.defaultPan) || 0;
    const panSlider = document.getElementById('wiz-pan-slider');
    const panValEl = document.getElementById('wiz-pan-val');
    if (panSlider) panSlider.value = String(defPan);
    if (panValEl) panValEl.textContent = formatPan(defPan);
    const hints = profile.hardwareHints || {};
    const hintParts = [
      hints.level || 'Line',
      hints.air ? 'Air ON' : 'Air OFF',
      hints.phantom48v ? '+48V' : 'No +48V',
    ];
    document.getElementById('wiz-hw-hint-summary').textContent = hintParts.join(' · ');
    document.getElementById('wiz-tap-alert')?.classList.add('hidden');
    wizTapLevels = {};
    wizChannelUserPicked = false;
    renderWizardChannelRows();
    await window.robos.wizardStartTapDetect({ strikeThresholdDb: -26 });
  } else if (wizStep === 3) {
    await window.robos.wizardStopTapDetect();
    sub.textContent = 'Step 3 of 3 — EQ & Sound Replacement';
    populateWizardStep3(profile);
  }
}

async function finishAddMicWizard({ addAnother = false } = {}) {
  const profile = getActiveWizardProfile();
  const manualSel = document.getElementById('wiz-manual-channel');
  const chosenNode = manualSel?.value || wizSelectedChannelName || '';
  const chosenLabel = manualSel?.selectedOptions?.[0]?.textContent || '';

  const fxOverride = {
    openSourcePlugins: profile.fx?.openSourcePlugins || [],
    phaseInvert: Boolean(profile.fx?.phaseInvert),
    gate: {
      enabled: Boolean(document.getElementById('wiz-gate-enabled')?.checked),
      thresholdDb: Number(document.getElementById('wiz-gate-thresh')?.value ?? -36),
    },
    eq: {
      ...(profile.fx?.eq || {}),
      enabled: Boolean(document.getElementById('wiz-eq-enabled')?.checked),
      hpfHz: Number(document.getElementById('wiz-eq-hpf')?.value ?? 60),
      lowGainDb: Number(document.getElementById('wiz-eq-low')?.value ?? 0),
      midGainDb: Number(document.getElementById('wiz-eq-mid')?.value ?? 0),
      highGainDb: Number(document.getElementById('wiz-eq-high')?.value ?? 0),
    },
    compressor: {
      ...(profile.fx?.compressor || {}),
      enabled: Boolean(document.getElementById('wiz-comp-enabled')?.checked),
      ratio: Number(document.getElementById('wiz-comp-ratio')?.value ?? 3.5),
    },
    drive: profile.fx?.drive || { enabled: false, amount: 0 },
  };

  const soundReplacement = {
    supported: true,
    enabled: Boolean(document.getElementById('wiz-sr-enabled')?.checked),
    kitId: document.getElementById('wiz-sr-kit')?.value || 'gm-rock-kit',
    pieceId: document.getElementById('wiz-sr-piece')?.value || profile.soundReplacement?.pieceId || 'snare',
    thresholdDb: Number(document.getElementById('wiz-sr-thresh')?.value ?? -28),
    blend: Number(document.getElementById('wiz-sr-blend')?.value ?? 75) / 100,
    minIntervalMs: profile.soundReplacement?.minIntervalMs ?? 65,
  };

  const res = await window.robos.addMicTrack({
    profileId: profile.id,
    name: document.getElementById('wiz-track-name')?.value || profile.shortLabel,
    inputNodeName: chosenNode,
    inputLabel: chosenLabel,
    armed: true,
    pan: Number(document.getElementById('wiz-pan-slider')?.value || 0),
    applyHardwareHints: Boolean(document.getElementById('wiz-apply-hw-hints')?.checked),
    fxOverride,
    soundReplacement,
  });

  if (res?.ok) {
    if (currentProject) historyStack.pushSnapshot(currentProject, 'Add Mic Track');
    currentProject = res.project;
    if (res.audioSnapshot) renderSnapshot(res.audioSnapshot);
    selectedTrackIds = new Set([res.track.id]);
    anchorTrackId = res.track.id;
    wizSelectedChannelName = ''; // auto-advance to next unused input for next mic
    markDirty(true);
    renderStudio();
    showStatus(`Added armed track "${res.track.name}" on ${res.track.inputLabel}${soundReplacement.enabled ? ` with ${soundReplacement.kitId} (${soundReplacement.pieceId}) Sound Replacement` : ''}.`);
    if (addAnother) {
      await goToWizardStep(1);
    } else {
      await closeAddMicWizard();
      switchView('studio-stage');
    }
  } else {
    showStatus(`Failed to add mic track: ${res?.error || 'Unknown error'}`, true);
  }
}

// ─── DRUMSET AI ALL-MIC SOUNDCHECK WIZARD ───────────────────────────────────

function populateScAiProviderSelect() {
  const sel = document.getElementById('sc-ai-provider');
  if (!sel) return;
  const list = aiProviders.length ? aiProviders : [
    { id: 'antigravity', name: 'Gemini CLI / Antigravity' },
    { id: 'claude-code', name: 'Claude Code' },
    { id: 'github-copilot', name: 'GitHub Copilot' },
    { id: 'codex', name: 'Codex' },
  ];
  // Put Gemini / Antigravity first
  const sorted = [...list].sort((a, b) => (a.id === 'antigravity' ? -1 : b.id === 'antigravity' ? 1 : 0));
  sel.innerHTML = sorted.map(p =>
    `<option value="${esc(p.id)}"${p.id === preferredAiProvider ? ' selected' : ''}>${esc(p.name)}${p.id === 'antigravity' ? ' (Recommended — Multimodal Audio)' : ''}</option>`
  ).join('');
}

function selectScInputPreset(mode = 'focusrite') {
  const ordered = getOrderedInputs();
  scSelectedInputs.clear();
  for (const inp of ordered) {
    const desc = String(inp.description || '');
    const isAdat = /adat|direct/i.test(desc);
    const isSpdif = /s\/pdif|spdif/i.test(desc);
    if (mode === 'focusrite') {
      // Enable Analog 1-8 + ADAT 9-16 by default on Focusrite (or all inputs if no Focusrite)
      if (inp.isFocusrite ? !isSpdif : !ordered.some(x => x.isFocusrite)) {
        scSelectedInputs.add(inp.name);
      }
    } else if (mode === 'analog') {
      if (inp.isFocusrite && !isAdat && !isSpdif) scSelectedInputs.add(inp.name);
    } else if (mode === 'adat') {
      if (inp.isFocusrite && isAdat) scSelectedInputs.add(inp.name);
    }
  }
  if (scSelectedInputs.size === 0 && ordered.length) {
    ordered.slice(0, 8).forEach(i => scSelectedInputs.add(i.name));
  }
  renderScInputsGrid();
}

function renderScInputsGrid() {
  const grid = document.getElementById('sc-inputs-grid');
  const countEl = document.getElementById('sc-selected-count');
  if (!grid) return;
  const ordered = getOrderedInputs();
  if (countEl) countEl.textContent = String(scSelectedInputs.size);

  grid.innerHTML = ordered.map(inp => {
    const checked = scSelectedInputs.has(inp.name);
    const desc = String(inp.description || '');
    const tag = /adat/i.test(desc) ? 'ADAT' : (/spdif|s\/pdif/i.test(desc) ? 'S/PDIF' : (inp.isFocusrite ? 'Analog' : 'Host'));
    const shortDesc = desc.replace(/^Scarlett\s+\S+\s+(?:3rd\s+Gen\s+)?/i, '');
    return `
      <label class="sc-input-chip ${checked ? 'checked' : ''}">
        <input type="checkbox" data-sc-inp="${esc(inp.name)}" ${checked ? 'checked' : ''} />
        <span>${esc(shortDesc || desc)}</span>
        <span class="tag">${esc(tag)}</span>
      </label>
    `;
  }).join('');

  grid.querySelectorAll('[data-sc-inp]').forEach(chk => {
    chk.addEventListener('change', () => {
      if (chk.checked) scSelectedInputs.add(chk.dataset.scInp);
      else scSelectedInputs.delete(chk.dataset.scInp);
      renderScInputsGrid();
    });
  });
}

function setScStage(stage) {
  scStage = stage;
  document.getElementById('sc-stage-ready')?.classList.toggle('hidden', stage !== 'ready');
  document.getElementById('sc-stage-recording')?.classList.toggle('hidden', stage !== 'recording' && stage !== 'analyzing');
  document.getElementById('sc-stage-results')?.classList.toggle('hidden', stage !== 'results');

  document.getElementById('sc-pill-1')?.classList.toggle('active', stage === 'ready');
  document.getElementById('sc-pill-2')?.classList.toggle('active', stage === 'recording' || stage === 'analyzing');
  document.getElementById('sc-pill-3')?.classList.toggle('active', stage === 'results');

  document.getElementById('sc-live-banner')?.classList.toggle('hidden', stage !== 'recording');
  document.getElementById('sc-analyzing-box')?.classList.toggle('hidden', stage !== 'analyzing');

  document.getElementById('btn-sc-start')?.classList.toggle('hidden', stage !== 'ready');
  document.getElementById('btn-sc-stop-analyze')?.classList.toggle('hidden', stage !== 'recording');
  document.getElementById('btn-sc-apply')?.classList.toggle('hidden', stage !== 'results');
  document.getElementById('btn-sc-record-again')?.classList.toggle('hidden', stage !== 'results');
}

function openDrumsetWizard() {
  stopPlayback();
  window.robos.wizardStopTapDetect();
  document.getElementById('add-mic-wizard-modal')?.classList.add('hidden');
  populateScAiProviderSelect();
  if (scSelectedInputs.size === 0) {
    selectScInputPreset('focusrite');
  } else {
    renderScInputsGrid();
  }
  setScStage('ready');
  document.getElementById('drumset-wizard-modal')?.classList.remove('hidden');
}

async function closeDrumsetWizard() {
  if (scStage === 'recording') {
    await window.robos.soundcheckCancel();
  }
  setScStage('ready');
  document.getElementById('drumset-wizard-modal')?.classList.add('hidden');
}

async function startDrumsetSoundcheck() {
  const inputNodeNames = Array.from(scSelectedInputs);
  if (!inputNodeNames.length) {
    showStatus('Select at least one capture input channel first.', true);
    return;
  }
  const res = await window.robos.soundcheckStart({ inputNodeNames });
  if (!res?.ok) {
    showStatus(`Could not start soundcheck: ${res?.error || 'Unknown error'}`, true);
    return;
  }
  scArmedInputsList = res.inputs || [];
  document.getElementById('sc-live-timer').textContent = '00:00.0';
  document.getElementById('sc-live-title').textContent = `RECORDING ALL ${scArmedInputsList.length} ARMED CHANNELS — PLAY YOUR DRUM SET NOW`;

  const grid = document.getElementById('sc-live-meters-grid');
  if (grid) {
    grid.innerHTML = scArmedInputsList.map((inp, idx) => {
      const chNum = idx + 1;
      const shortDesc = String(inp.description || inp.name).replace(/^Scarlett\s+\S+\s+(?:3rd\s+Gen\s+)?/i, '');
      return `
        <div class="sc-meter-card" id="sc-meter-card-${chNum}">
          <div class="sc-meter-top">
            <span>Ch ${chNum}: ${esc(shortDesc)}</span>
            <span class="sc-peak-badge mono" id="sc-peak-badge-${chNum}">Max -∞</span>
          </div>
          <div class="wiz-ch-bar">
            <div class="wiz-ch-bar-fill" id="sc-bar-fill-${chNum}" style="width:0%"></div>
          </div>
        </div>
      `;
    }).join('');
  }
  setScStage('recording');
}

async function stopAndAnalyzeDrumsetSoundcheck() {
  const stopBtn = document.getElementById('btn-sc-stop-analyze');
  if (stopBtn) stopBtn.disabled = true;
  setScStage('analyzing');

  const preferredProvider = document.getElementById('sc-ai-provider')?.value || 'antigravity';
  const simulateKitGroove = Boolean(document.getElementById('chk-sc-simulate')?.checked);

  document.getElementById('sc-analyzing-title').textContent = 'Analyzing multi-channel recordings with RobOS Agent (Gemini)…';
  document.getElementById('sc-analyzing-detail').textContent = 'Measuring fundamental pitch, snare-wire sizzle, cymbal decay & cross-channel bleed dominance…';

  const res = await window.robos.soundcheckStopAndClassify({
    preferredProvider,
    simulateKitGroove,
  });
  if (stopBtn) stopBtn.disabled = false;

  if (!res?.ok) {
    setScStage('ready');
    showStatus(`Soundcheck analysis failed: ${res?.error || 'Unknown error'}`, true);
    return;
  }

  scClassifications = res.classifications || [];
  scLastProviderLabel = res.providerLabel || res.provider || 'Gemini';
  renderScResults(res);
  setScStage('results');
}

async function playSoundcheckPreviewClip(filePath) {
  if (!filePath) return;
  try {
    const ctx = await ensureRoutedStudioAudioCtx();
    const buf = await loadDecodedAudio(filePath, true);
    if (!buf) throw new Error('Could not read soundcheck WAV');
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    showStatus(`Playing recorded soundcheck clip (${buf.duration.toFixed(1)}s)...`);
  } catch (err) {
    showStatus(`Clip preview error: ${err.message}`, true);
  }
}

function renderScResults(meta = {}) {
  const badge = document.getElementById('sc-provider-badge');
  const summaryEl = document.getElementById('sc-results-summary');
  const unusedCountEl = document.getElementById('sc-unused-count');
  const showUnused = Boolean(document.getElementById('chk-sc-show-unused')?.checked);
  const listEl = document.getElementById('sc-results-list');
  if (!listEl) return;

  const activeCount = scClassifications.filter(c => c.includeTrack && c.profileId !== 'unused').length;
  const unusedCount = scClassifications.length - activeCount;

  if (badge) badge.textContent = `Classified via ${scLastProviderLabel}`;
  if (summaryEl) {
    summaryEl.textContent = `Identified ${activeCount} active mic(s) out of ${scClassifications.length} inputs${meta.durationSec ? ` (${meta.durationSec}s soundcheck)` : ''}`;
  }
  if (unusedCountEl) unusedCountEl.textContent = String(unusedCount);

  const visibleItems = showUnused
    ? scClassifications
    : scClassifications.filter(c => c.includeTrack || !c.features?.isSilent);

  const defaultKit = (drumkitsStatus?.kits || [])[0];
  const allPieces = Object.values(defaultKit?.pieces || {
    kick: { id: 'kick', label: 'Bass / Kick Drum' },
    snare: { id: 'snare', label: 'Acoustic Snare Drum' },
    'rack-tom': { id: 'rack-tom', label: 'Rack Tom' },
    'floor-tom': { id: 'floor-tom', label: 'Floor Tom' },
    hihat: { id: 'hihat', label: 'Closed Hi-Hat' },
    crash: { id: 'crash', label: 'Crash Cymbal' },
    ride: { id: 'ride', label: 'Ride Cymbal' },
  });

  if (!visibleItems.length) {
    listEl.innerHTML = `
      <div class="card" style="text-align:center;padding:24px;">
        <strong>All ${scClassifications.length} channels were quiet (&lt; -48 dBFS) during this take.</strong>
        <p class="hint">Check your Focusrite gain knobs or click "Re-Record Soundcheck" and hit the drums firmly.</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = visibleItems.map((item) => {
    const idx = scClassifications.indexOf(item);
    const shortHw = String(item.inputLabel || '').replace(/^Scarlett\s+\S+\s+(?:3rd\s+Gen\s+)?/i, '');
    const profOptions = [
      ...micProfiles.map(p => `<option value="${esc(p.id)}"${p.id === item.profileId ? ' selected' : ''}>${esc(p.name)}</option>`),
      `<option value="unused"${item.profileId === 'unused' ? ' selected' : ''}>— Unused / Unplugged —</option>`,
    ].join('');

    const pieceOpts = allPieces.map(p =>
      `<option value="${esc(p.id)}"${p.id === item.replacementPieceId ? ' selected' : ''}>${esc(p.label)}</option>`
    ).join('');

    const peakStr = item.features?.peakDb <= -90 ? '-∞ dB' : `${item.features?.peakDb} dB`;
    const confPct = Math.round((Number(item.confidence) || 0.85) * 100);

    return `
      <div class="sc-result-row ${item.includeTrack ? '' : 'excluded'}" data-sc-idx="${idx}">
        <input type="checkbox" data-sc-act="include" data-idx="${idx}" ${item.includeTrack ? 'checked' : ''} title="Include &amp; arm this track" />
        <img class="sc-result-thumb" src="${esc(item.image || 'assets/mics/snare-mic.webp')}" alt="" />
        <div>
          <div style="font-weight:700;font-size:12px;">Ch ${item.channelIndex}: ${esc(shortHw)}</div>
          <div class="hint mono">Peak ${esc(peakStr)} · ${item.features?.transientCount || 0} hits</div>
          ${item.wavFile ? `<button type="button" class="btn btn-sm btn-bevel" style="height:22px;padding:0 7px;margin-top:4px;font-size:10.5px;" data-sc-act="listen" data-idx="${idx}">${DI.svg('speaker', 11)}<span>Play Clip</span></button>` : ''}
        </div>
        <div>
          <select class="select" style="height:29px;font-size:12px;margin-bottom:4px;" data-sc-act="profile" data-idx="${idx}">${profOptions}</select>
          <input type="text" class="text-input" style="height:27px;font-size:12px;" data-sc-act="name" data-idx="${idx}" value="${esc(item.suggestedTrackName)}" />
        </div>
        <div class="sc-reason-text">
          <span class="sc-conf-pill">${confPct}%</span>${esc(item.reasoning)}
          ${item.phaseInvert ? '<div style="color:#fde047;font-weight:700;margin-top:2px;">Ø Auto Polarity Inverted</div>' : ''}
        </div>
        <div>
          <label class="checkbox-row" style="margin:0 0 4px;font-size:11.5px;">
            <input type="checkbox" data-sc-act="sr-toggle" data-idx="${idx}" ${item.soundReplacementEnabled ? 'checked' : ''} />
            <span>Trigger Replace</span>
          </label>
          <select class="select" style="height:27px;font-size:11.5px;" data-sc-act="sr-piece" data-idx="${idx}" ${item.soundReplacementEnabled ? '' : 'disabled'}>${pieceOpts}</select>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-sc-act]').forEach(el => {
    const idx = Number(el.dataset.idx);
    const item = scClassifications[idx];
    if (!item) return;
    const act = el.dataset.scAct;

    if (act === 'listen') {
      el.addEventListener('click', () => playSoundcheckPreviewClip(item.previewWavFile || item.wavFile));
    } else if (act === 'include') {
      el.addEventListener('change', () => {
        item.includeTrack = el.checked;
        if (el.checked && item.profileId === 'unused') {
          item.profileId = 'drum-room';
          const prof = micProfiles.find(p => p.id === 'drum-room') || micProfiles[0];
          item.suggestedTrackName = prof.shortLabel;
          item.image = prof.image;
        }
        renderScResults();
      });
    } else if (act === 'profile') {
      el.addEventListener('change', () => {
        item.profileId = el.value;
        if (el.value === 'unused') {
          item.includeTrack = false;
          item.soundReplacementEnabled = false;
        } else {
          const prof = micProfiles.find(p => p.id === el.value) || micProfiles[0];
          item.includeTrack = true;
          item.suggestedTrackName = prof.shortLabel;
          item.image = prof.image;
          item.phaseInvert = Boolean(prof.fx?.phaseInvert);
          item.soundReplacementEnabled = Boolean(prof.soundReplacement?.enabled);
          item.replacementPieceId = prof.soundReplacement?.pieceId || 'snare';
        }
        renderScResults();
      });
    } else if (act === 'name') {
      el.addEventListener('input', () => { item.suggestedTrackName = el.value; });
    } else if (act === 'sr-toggle') {
      el.addEventListener('change', () => {
        item.soundReplacementEnabled = el.checked;
        renderScResults();
      });
    } else if (act === 'sr-piece') {
      el.addEventListener('change', () => { item.replacementPieceId = el.value; });
    }
  });
}

async function applyDrumsetWizardResults() {
  const applyBtn = document.getElementById('btn-sc-apply');
  if (applyBtn) applyBtn.disabled = true;

  const replaceExistingTracks = Boolean(document.getElementById('chk-sc-replace-tracks')?.checked);
  const importSoundcheckTakes = Boolean(document.getElementById('chk-sc-import-takes')?.checked);
  const applyHardwareHints = Boolean(document.getElementById('chk-sc-hw-hints')?.checked);

  const res = await window.robos.soundcheckApply({
    classifications: scClassifications,
    replaceExistingTracks,
    importSoundcheckTakes,
    applyHardwareHints,
  });
  if (applyBtn) applyBtn.disabled = false;

  if (!res?.ok) {
    showStatus(`Failed to apply DrumSet setup: ${res?.error || 'Unknown error'}`, true);
    return;
  }

  if (currentProject) historyStack.pushSnapshot(currentProject, 'DrumSet AI Auto-Setup');
  currentProject = res.project;
  if (res.audioSnapshot) renderSnapshot(res.audioSnapshot);
  selectedTrackId = null;
  selectedTrackIds = new Set(currentProject?.tracks?.[0]?.id ? [currentProject.tracks[0].id] : []);
  anchorTrackId = currentProject?.tracks?.[0]?.id || null;
  selectedClipIds.clear();
  decodedBufferCache.clear();
  markDirty(true);
  await closeDrumsetWizard();
  switchView('studio-stage');
  renderStudio();
  showStatus(`Configured & armed ${res.addedCount} studio mic track(s) via ${scLastProviderLabel} — press Play to audition or REC for a new take.`);
}

// ─── Project Save / Open / Drum Kits Modals ─────────────────────────────────

async function saveCurrentSession(saveAsDialog = false) {
  const name = document.getElementById('project-name-input')?.value || currentProject?.name || 'Studio Session';
  const bpm = Number(document.getElementById('project-bpm-input')?.value) || 120;
  const res = await window.robos.projectSave({ name, bpm, saveAsDialog });
  if (res?.canceled) return;
  if (res?.ok) {
    currentProject = res.project;
    savedProjectsState = res.savedProjects || savedProjectsState;
    markDirty(false);
    renderStudio();
    showStatus(`Saved session "${currentProject.name}" (${currentProject.tracks.length} tracks) → ${res.manifestFile}`);
  } else {
    showStatus(`Save failed: ${res?.error || 'Unknown error'}`, true);
  }
}

async function openProjectModal() {
  const listRes = await window.robos.projectList();
  if (listRes?.ok) savedProjectsState = listRes;
  const listEl = document.getElementById('saved-projects-list');
  const projects = savedProjectsState?.projects || [];

  if (!projects.length) {
    listEl.innerHTML = `<div class="hint">No saved sessions in <code>${esc(savedProjectsState.projectsRoot || '~/.local/share/robos/daw-studio/projects')}</code> yet. Save a session or click "Browse project.json on Disk…".</div>`;
  } else {
    listEl.innerHTML = projects.map(p => `
      <div class="saved-proj-row">
        <div>
          <strong>${esc(p.name)}</strong>
          <div class="hint">${p.trackCount} track(s) · ${p.clipCount} recorded take(s) · ${p.bpm} BPM · ${p.savedAt ? new Date(p.savedAt).toLocaleString() : ''}</div>
          <div class="mono" style="color:var(--muted);font-size:11px;">${esc(p.manifestFile)}</div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-open-proj="${esc(p.id)}">Open Session</button>
      </div>
    `).join('');

    listEl.querySelectorAll('[data-open-proj]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await loadProjectByIdOrDialog({ idOrPath: btn.dataset.openProj });
      });
    });
  }

  document.getElementById('open-project-modal')?.classList.remove('hidden');
}

async function loadProjectByIdOrDialog(payload) {
  stopPlayback();
  const res = await window.robos.projectOpen(payload);
  if (res?.canceled) return;
  if (res?.ok && res.project) {
    historyStack.clear();
    currentProject = res.project;
    savedProjectsState = res.savedProjects || savedProjectsState;
    selectedTrackId = null;
    selectedTrackIds = new Set(currentProject.tracks?.[0]?.id ? [currentProject.tracks[0].id] : []);
    anchorTrackId = currentProject.tracks?.[0]?.id || null;
    selectedClipIds.clear();
    anchorClipId = null;
    decodedBufferCache.clear();
    playheadSec = 0;
    timelineOffsetSec = 0;
    document.getElementById('transport-timecode').textContent = formatTimecode(0);
    markDirty(false);
    document.getElementById('open-project-modal')?.classList.add('hidden');
    switchView('studio-stage');
    renderStudio();
    const clipTotal = (currentProject.tracks || []).reduce((n, t) => n + (t.clips?.length || 0), 0);
    showStatus(`Opened "${currentProject.name}" — reloaded ${currentProject.tracks.length} track(s) and ${clipTotal} recorded WAV stem(s).`);
  } else {
    showStatus(`Open failed: ${res?.error || 'Unknown error'}`, true);
  }
}

function updateDrumkitsBadge() {
  const installedCount = (drumkitsStatus?.kits || []).filter(k => k.installed).length;
  const customDirCount = vstDirsStatus?.customDirectories?.length || 0;
  const badge = document.getElementById('drumkits-badge');
  if (badge) {
    badge.textContent = customDirCount > 0
      ? `${installedCount} kits · ${customDirCount} dir`
      : `${installedCount}/${(drumkitsStatus?.kits || []).length}`;
  }
}

function applyVstDirsResponse(res) {
  if (!res?.ok) return;
  if (res.vstDirsStatus) vstDirsStatus = res.vstDirsStatus;
  if (res.drumkitsStatus) drumkitsStatus = res.drumkitsStatus;
  if (res.systemPlugins) systemPlugins = res.systemPlugins;
  updateDrumkitsBadge();
  renderDrumkitsModal();
  if (selectedTrackId) renderInspectorDrawer();
}

async function openVstDirectoriesModal() {
  const res = await window.robos.vstDirsGet?.();
  if (res?.ok) applyVstDirsResponse(res);
  else renderDrumkitsModal();
  document.getElementById('drumkits-modal')?.classList.remove('hidden');
}

async function addCustomVstDirectoryPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) {
    showStatus('Enter a folder path or click Browse Folder to select a directory.', true);
    return;
  }
  const res = await window.robos.vstDirsAdd({ dirPath: trimmed });
  if (res?.ok) {
    const inp = document.getElementById('vst-dir-path-input');
    if (inp) inp.value = '';
    applyVstDirsResponse(res);
    const added = (res.vstDirsStatus?.customDirectories || []).find(d => d.path === res.addedEntries?.[0]?.path) || res.addedEntries?.[0];
    showStatus(`Indexed directory "${added?.label || trimmed}" (${added?.pluginCount ?? 0} plugins, ${added?.sampleCount ?? 0} audio samples).`);
  } else if (!res?.canceled) {
    showStatus(`Could not add directory: ${res?.error || 'Unknown error'}`, true);
  }
}

async function browseAndAddCustomVstDirectory() {
  const res = await window.robos.vstDirsAdd({ browseDialog: true });
  if (res?.ok) {
    applyVstDirsResponse(res);
    const count = res.addedEntries?.length || 1;
    showStatus(`Added ${count} VST / Sample director${count === 1 ? 'y' : 'ies'}.`);
  } else if (res && !res.canceled) {
    showStatus(`Could not add directory: ${res.error || 'Unknown error'}`, true);
  }
}

function renderDrumkitsModal() {
  const customListEl = document.getElementById('vst-custom-dirs-list');
  const sysSummaryEl = document.getElementById('vst-system-paths-summary');
  const listEl = document.getElementById('drumkits-catalog-list');

  if (customListEl) {
    const customDirs = vstDirsStatus?.customDirectories || [];
    if (!customDirs.length) {
      customListEl.innerHTML = `
        <div class="hint" style="padding:8px 2px;">
          No custom directories configured yet. Click <strong>Browse Folder...</strong> or paste a VST / Sample folder path above.
        </div>
      `;
    } else {
      customListEl.innerHTML = customDirs.map(d => {
        const badges = [];
        if (!d.exists) badges.push(`<span class="vst-fmt-badge missing">MISSING ON DISK</span>`);
        for (const fmt of (d.formats || [])) {
          if (fmt === 'SAMPLES') {
            badges.push(`<span class="vst-fmt-badge samples">SAMPLES · ${d.sampleCount} WAV/AUDIO</span>`);
          } else {
            badges.push(`<span class="vst-fmt-badge">${esc(fmt)}</span>`);
          }
        }
        if (d.pluginCount > 0) {
          badges.push(`<span class="vst-fmt-badge">${d.pluginCount} PLUGIN${d.pluginCount === 1 ? '' : 'S'}</span>`);
        }
        if (d.archiveCount > 0) {
          badges.push(`<span class="vst-fmt-badge archive" title="Contains ${esc((d.archiveNames || []).join(', '))} — mount/extract or install VST binaries to load">${d.archiveCount} .ISO / ARCHIVE${d.archiveCount === 1 ? '' : 'S'} (UNEXTRACTED)</span>`);
        }
        if (d.proprietarySoundbankCount > 0) {
          badges.push(`<span class="vst-fmt-badge archive" title="Proprietary Toontrack OBW / RIFF-ttpw encoded soundbanks cannot be decoded as raw PCM WAV — requires host VST engine">${d.proprietarySoundbankCount} LOCKED OBW/TTPW SOUNDBANK${d.proprietarySoundbankCount === 1 ? '' : 'S'}</span>`);
        }
        if (d.exists && d.pluginCount === 0 && d.sampleCount === 0 && !d.archiveCount && !d.proprietarySoundbankCount) {
          badges.push(`<span class="vst-fmt-badge">EMPTY / NO PLUGINS</span>`);
        }
        return `
          <div class="vst-dir-row">
            <div class="vst-dir-info">
              <div class="vst-dir-title-line">
                <strong>${esc(d.label)}</strong>
                ${badges.join('')}
              </div>
              <div class="vst-dir-path mono" title="${esc(d.path)}">${esc(d.path)}</div>
            </div>
            <div class="btn-cluster">
              ${d.kitId ? `<button type="button" class="btn btn-sm btn-bevel" data-audition-kit="${esc(d.kitId)}" data-piece="snare" title="Audition sample from this pack">${DI.svg('speaker', 12)}<span>Test</span></button>` : ''}
              <button type="button" class="btn btn-sm btn-bevel" data-open-vst-dir="${esc(d.path)}" title="Reveal folder in file manager">${DI.svg('folder', 12)}<span>Open</span></button>
              <button type="button" class="btn btn-sm btn-bevel" data-remove-vst-dir="${esc(d.path)}" title="Remove directory from RobOS DAW Studio">${DI.svg('trash', 12)}<span>Remove</span></button>
            </div>
          </div>
        `;
      }).join('');

      customListEl.querySelectorAll('[data-audition-kit]').forEach(btn => {
        btn.addEventListener('click', () => auditionDrumPiece(btn.dataset.auditionKit, btn.dataset.piece));
      });
      customListEl.querySelectorAll('[data-open-vst-dir]').forEach(btn => {
        btn.addEventListener('click', () => window.robos.openFolderPath({ dirPath: btn.dataset.openVstDir }));
      });
      customListEl.querySelectorAll('[data-remove-vst-dir]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetPath = btn.dataset.removeVstDir;
          const res = await window.robos.vstDirsRemove({ dirPath: targetPath });
          if (res?.ok) {
            applyVstDirsResponse(res);
            showStatus(`Removed directory: ${targetPath}`);
          }
        });
      });
    }
  }

  if (sysSummaryEl) {
    const activeSys = (vstDirsStatus?.systemPaths || []).filter(s => s.exists);
    const sysPluginCount = activeSys.reduce((acc, s) => acc + (s.pluginCount || 0), 0);
    const pills = activeSys.slice(0, 6).map(s =>
      `<span class="vst-sys-pill mono" title="${esc(s.path)}">${esc(s.path)} (${s.pluginCount})</span>`
    ).join('');
    sysSummaryEl.innerHTML = `
      <span>Standard Linux Paths (${sysPluginCount} system plugins detected):</span>
      <div class="vst-sys-pills">${pills || '<span class="hint">None mounted</span>'}</div>
    `;
  }

  if (!listEl) return;
  const kits = drumkitsStatus?.kits || [];
  listEl.innerHTML = kits.map(k => {
    const hasKick = Boolean(k.pieces?.kick);
    const snarePiece = k.pieces?.snare ? 'snare' : (Object.keys(k.pieces || {})[0] || 'snare');
    const genreBadge = k.genreTag
      ? `<span class="mono" style="display:inline-block;padding:1px 6px;border-radius:3px;background:rgba(0,212,255,0.12);border:1px solid rgba(0,212,255,0.28);color:#7dd3fc;font-size:10px;margin-right:6px;">${esc(k.genreTag)}</span>`
      : '';
    const pieceCount = Object.keys(k.pieces || {}).length;
    const actionBtn = k.isCustomDirectory
      ? `<button type="button" class="btn btn-sm btn-bevel" data-open-kit-dir="${esc(k.kitDir)}">${DI.svg('folder', 12)}<span>Open Folder</span></button>`
      : `<button type="button" class="btn btn-sm ${k.installed ? 'btn-bevel' : 'btn-primary'}" data-dl-kit="${esc(k.id)}">${k.installed ? `${DI.svg('refresh', 12)}<span>Verify</span>` : `${DI.svg('download', 12)}<span>Download</span>`}</button>`;
    return `
      <div class="saved-proj-row">
        <div>
          <div style="margin-bottom:2px;">${genreBadge}<strong>${esc(k.name)}</strong> <span class="mono" style="color:var(--accent);font-size:11px;">[${esc(k.license)}]</span></div>
          <div class="hint">${esc(k.description)}</div>
          <div class="mono" style="font-size:11px;color:${k.installed ? '#86efac' : '#fde047'};">
            ${k.installed ? `INSTALLED (${pieceCount} drum pieces · ${k.sampleCount} lossless/WAV layers)` : 'Not downloaded yet'}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
          ${k.installed && hasKick ? `<button type="button" class="btn btn-sm btn-bevel" data-audition-kit="${esc(k.id)}" data-piece="kick" title="Audition Kick">${DI.svg('speaker', 12)}<span>Kick</span></button>` : ''}
          ${k.installed ? `<button type="button" class="btn btn-sm btn-bevel" data-audition-kit="${esc(k.id)}" data-piece="${esc(snarePiece)}" title="Audition Snare">${DI.svg('speaker', 12)}<span>Snare</span></button>` : ''}
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-audition-kit]').forEach(btn => {
    btn.addEventListener('click', () => auditionDrumPiece(btn.dataset.auditionKit, btn.dataset.piece));
  });
  listEl.querySelectorAll('[data-open-kit-dir]').forEach(btn => {
    btn.addEventListener('click', () => window.robos.openFolderPath({ dirPath: btn.dataset.openKitDir }));
  });
  listEl.querySelectorAll('[data-dl-kit]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await window.robos.downloadDrumkit({ kitId: btn.dataset.dlKit });
      btn.disabled = false;
      if (res?.ok && res.status) {
        drumkitsStatus = res.status;
        updateDrumkitsBadge();
        renderDrumkitsModal();
      }
    });
  });
}

// ─── Preferences -> Audio Devices Rendering (Preserved) ─────────────────────

function setMeter(peakDb, labelText) {
  const fill = document.getElementById('meter-fill');
  const readout = document.getElementById('meter-db-readout');
  const label = document.getElementById('meter-status-label');
  if (fill) fill.style.width = `${dbToPercent(peakDb).toFixed(1)}%`;
  if (readout) readout.textContent = `${peakDb <= -90 ? '-∞' : peakDb.toFixed(1)} dBFS`;
  if (label && labelText) label.textContent = labelText;
}

function renderSnapshot(snap) {
  if (!snap || !snap.ok) {
    showStatus(snap?.error || 'Could not inspect Linux audio devices.', true);
    return;
  }
  currentSnapshot = snap;

  const fr = snap.focusrite || { connected: false };
  const clk = snap.clock || { effectiveRate: 48000, effectiveQuantum: 1024, latencyMs: 21.33, forceQuantum: 0, quantum: 1024 };
  const pill = document.getElementById('header-hw-pill');
  if (pill) {
    if (fr.connected) {
      pill.textContent = `${fr.model} · ${(clk.effectiveRate / 1000).toFixed(clk.effectiveRate % 1000 ? 1 : 0)}kHz / ${fr.bits}-bit`;
      pill.className = 'hw-pill connected';
    } else {
      pill.textContent = `PipeWire ${(clk.effectiveRate / 1000).toFixed(0)}kHz · No USB Interface`;
      pill.className = 'hw-pill';
    }
  }

  const cardSlot = document.getElementById('interface-card-slot');
  if (cardSlot) {
    if (fr.connected) {
      const syncBadges = fr.mixer?.syncValid
        ? `Internal ${fr.mixer.syncValid.internal ? 'LOCK' : '—'} · S/PDIF ${fr.mixer.syncValid.spdif ? 'LOCK' : '—'} · ADAT ${fr.mixer.syncValid.adat ? 'LOCK' : '—'}`
        : 'Locked';
      cardSlot.innerHTML = `
        <div class="card card-focusrite" id="focusrite-card">
          <div class="fr-header">
            <div class="fr-title-wrap">
              <span class="badge-connected">CONNECTED</span>
              <span class="badge-Scarlett">FOCUSRITE PRO-AUDIO</span>
              <span class="fr-name">${esc(fr.model)}</span>
            </div>
            <span class="mono">USB ID ${esc(fr.usbId || '')} · ALSA ${esc(fr.alsaDevice || '')}${fr.serial ? ` · SN ${esc(fr.serial)}` : ''}</span>
          </div>
          <div class="specs-grid">
            <div class="spec-item"><span class="k">Linux Driver</span><span class="v">snd_usb_audio + PipeWire (Native)</span></div>
            <div class="spec-item"><span class="k">Hardware I/O</span><span class="v">${fr.maxCaptureChannels} Inputs / ${fr.maxPlaybackChannels} Outputs</span></div>
            <div class="spec-item"><span class="k">Sample Format</span><span class="v">${fr.bits}-bit PCM (${esc(fr.format)})</span></div>
            <div class="spec-item"><span class="k">USB Transport</span><span class="v">${esc(fr.usbSpeed)}</span></div>
            <div class="spec-item"><span class="k">Supported Rates</span><span class="v">${(fr.sampleRates || []).map(r => `${r / 1000}k`).join(', ')} Hz</span></div>
            <div class="spec-item"><span class="k">Firmware &amp; Sync</span><span class="v">FW ${esc(fr.mixer?.firmwareVersion || 'OK')} · ${syncBadges}</span></div>
          </div>
        </div>
      `;
    } else {
      cardSlot.innerHTML = `
        <div class="card" id="focusrite-card">
          <div class="fr-header"><div class="fr-title-wrap"><span class="fr-name">No Focusrite USB Interface Detected</span></div></div>
          <p class="subtitle" style="margin-bottom:0;">${esc(fr.hint || 'Connect your Focusrite Scarlett / Clarett USB interface.')}</p>
        </div>
      `;
    }
  }

  const inSel = document.getElementById('select-input-device');
  const outSel = document.getElementById('select-output-device');
  const activeInName = snap.activeInput?.name || '';
  const activeOutName = snap.activeOutput?.name || '';

  if (inSel) {
    inSel.innerHTML = (snap.inputs || []).map(n =>
      `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeInName ? ' selected' : ''}>${n.isDefault ? '[DEF] ' : ''}${esc(n.description)}</option>`
    ).join('');
  }
  if (outSel) {
    outSel.innerHTML = (snap.outputs || []).map(n =>
      `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeOutName ? ' selected' : ''}>${n.isDefault ? '[DEF] ' : ''}${esc(n.description)}</option>`
    ).join('');
  }

  const rateSel = document.getElementById('select-sample-rate');
  const rates = fr.connected && fr.sampleRates?.length ? fr.sampleRates : [44100, 48000, 88200, 96000];
  if (rateSel) {
    rateSel.innerHTML = rates.map(r =>
      `<option value="${r}"${clk.effectiveRate === r ? ' selected' : ''}>${(r / 1000).toFixed(r % 1000 ? 1 : 0)} kHz (${r} Hz)</option>`
    ).join('');
  }

  const qSel = document.getElementById('select-quantum');
  if (qSel) {
    const qChoices = [
      { v: 0, label: `Auto / Dynamic (${clk.quantum} samples)` },
      { v: 64, label: `64 samples (${((64 / clk.effectiveRate) * 1000).toFixed(2)} ms — Ultra-Low Latency)` },
      { v: 128, label: `128 samples (${((128 / clk.effectiveRate) * 1000).toFixed(2)} ms — Studio Tracking)` },
      { v: 256, label: `256 samples (${((256 / clk.effectiveRate) * 1000).toFixed(2)} ms — Balanced)` },
      { v: 512, label: `512 samples (${((512 / clk.effectiveRate) * 1000).toFixed(2)} ms — Heavy FX Mixing)` },
      { v: 1024, label: `1024 samples (${((1024 / clk.effectiveRate) * 1000).toFixed(2)} ms — Safe Playback)` },
    ];
    qSel.innerHTML = qChoices.map(q =>
      `<option value="${q.v}"${clk.forceQuantum === q.v ? ' selected' : ''}>${esc(q.label)}</option>`
    ).join('');
  }

  const srEl = document.getElementById('stat-rate');
  if (srEl) srEl.textContent = `${clk.effectiveRate} Hz`;
  const sqEl = document.getElementById('stat-quantum');
  if (sqEl) sqEl.textContent = `${clk.effectiveQuantum} smp`;
  const slEl = document.getElementById('stat-latency');
  if (slEl) slEl.textContent = `${clk.latencyMs} ms`;

  const mixerSlot = document.getElementById('focusrite-mixer-slot');
  if (mixerSlot) {
    if (fr.connected && fr.mixer && (fr.mixer.preamps?.length || fr.mixer.phantomBanks?.length)) {
      const banksHtml = (fr.mixer.phantomBanks || []).map(b => `
        <button type="button" class="hw-toggle ${b.enabled ? 'on-48v' : 'off-48v'}"
          data-hw-card="${fr.alsaCardIndex}" data-hw-control="${esc(b.control)}" data-hw-val="${!b.enabled}">
          ${DI.svg('bolt', 12)} <span>${esc(b.label)}: ${b.enabled ? 'ON' : 'OFF'}</span>
        </button>
      `).join('');

      const clockSelectHtml = fr.mixer.clockSource?.options?.length ? `
        <label class="mono" style="display:flex;align-items:center;gap:6px;">
          Clock:
          <select id="select-fr-clock" class="select" style="height:30px;width:auto;">
            ${fr.mixer.clockSource.options.map(opt => `<option value="${esc(opt)}"${opt === fr.mixer.clockSource.value ? ' selected' : ''}>${esc(opt)}</option>`).join('')}
          </select>
        </label>
      ` : '';

      const stripsHtml = (fr.mixer.preamps || []).map(p => `
        <div class="preamp-strip">
          <div class="preamp-ch-title">${esc(p.label)}</div>
          ${p.level !== null ? `
            <button type="button" class="hw-toggle ${p.level === 'Inst' ? 'on-inst' : ''}"
              data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Level"
              data-hw-enum="${p.level === 'Inst' ? 'Line' : 'Inst'}">
              ${p.level === 'Inst' ? 'Inst (Hi-Z)' : 'Line'}
            </button>
          ` : `<div style="height:27px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);">Mic / Line</div>`}
          ${p.air !== null ? `
            <button type="button" class="hw-toggle ${p.air ? 'on-air' : ''}"
              data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Air" data-hw-val="${!p.air}">
              Air ${p.air ? 'ON' : 'OFF'}
            </button>
          ` : ''}
          ${p.pad !== null ? `
            <button type="button" class="hw-toggle ${p.pad ? 'on-pad' : ''}"
              data-hw-card="${fr.alsaCardIndex}" data-hw-control="Line In ${p.channel} Pad" data-hw-val="${!p.pad}">
              Pad ${p.pad ? '-10dB' : 'OFF'}
            </button>
          ` : ''}
        </div>
      `).join('');

      const hpMix = fr.mixer.headphoneMix;
      const inlineHpHtml = hpMix?.supported ? `
        <div class="hpmix-inline-card">
          <div>
            <strong style="color:#f1f5f9;">Scarlett Headphone &amp; Direct Monitor (${esc(hpMix.mixLeft)}/${esc(hpMix.mixRight)})</strong>
            <div class="hint" style="margin-top:2px;">
              Direct Mic Bleed: <strong>${hpMix.activeDirectCount > 0 ? `${hpMix.activeDirectCount} input(s) live (${hpMix.maxDirectInputDb >= 0 ? '+' : ''}${hpMix.maxDirectInputDb} dB)` : 'OFF (Zero Mic Echo)'}</strong>
              · Backing PCM 1+2: <strong>${hpMix.backingPcmDb >= 0 ? '+' : ''}${hpMix.backingPcmDb} dB</strong>
              · PipeWire Sink: <strong>${snap.outputVolume?.percent ?? 100}%</strong>
            </div>
          </div>
          <div class="btn-cluster">
            ${hpMix.activeDirectCount > 0 ? `
              <button type="button" class="btn btn-sm btn-primary" id="btn-inline-mute-direct">Mute Direct Mic Bleed + 100% Backing</button>
            ` : ''}
            <button type="button" class="btn btn-sm btn-bevel" id="btn-inline-open-hpmix">Open Headphone Mix...</button>
          </div>
        </div>
      ` : '';

      mixerSlot.innerHTML = `
        <div class="card" id="focusrite-preamp-card">
          <div class="preamp-header">
            <div>
              <h2 class="card-title" style="margin-bottom:2px;">Focusrite Hardware Preamps &amp; DSP (${fr.mixer.totalMixerControls} Kernel Controls Active)</h2>
              <span class="hint">Direct hardware control over USB via mainline Linux <code>snd_usb_audio</code> Scarlett driver.</span>
            </div>
            <div class="phantom-group">${clockSelectHtml}${banksHtml}</div>
          </div>
          <div class="preamp-strip-grid">${stripsHtml}</div>
          ${inlineHpHtml}
        </div>
      `;

      document.getElementById('btn-inline-open-hpmix')?.addEventListener('click', () => openHeadphoneMixModal());
      document.getElementById('btn-inline-mute-direct')?.addEventListener('click', async (ev) => {
        ev.currentTarget.disabled = true;
        await applyHeadphoneMixUpdate({ preset: 'backing-only' }, 'Muted Scarlett direct mic bleed in headphones & set Backing Track to 100%.');
      });

      mixerSlot.querySelectorAll('[data-hw-control]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const cardIndex = Number(btn.dataset.hwCard);
          const control = btn.dataset.hwControl;
          const value = btn.dataset.hwEnum !== undefined ? btn.dataset.hwEnum : (btn.dataset.hwVal === 'true');
          btn.disabled = true;
          const res = await window.robos.setFocusriteControl({ cardIndex, control, value });
          if (res?.ok) {
            renderSnapshot(res.snapshot);
            showStatus(`Updated Focusrite hardware "${control}" → ${value}`);
          } else {
            btn.disabled = false;
            showStatus(`Hardware control failed: ${res?.error || 'Unknown error'}`, true);
          }
        });
      });

      document.getElementById('select-fr-clock')?.addEventListener('change', async (e) => {
        const value = e.target.value;
        const res = await window.robos.setFocusriteControl({
          cardIndex: fr.alsaCardIndex,
          control: 'Clock Source Clock Source',
          value,
        });
        if (res?.ok) renderSnapshot(res.snapshot);
      });
    } else {
      mixerSlot.innerHTML = '';
    }
  }

  const inCountEl = document.getElementById('inputs-count-heading');
  if (inCountEl) inCountEl.textContent = `Capture Inputs (${snap.inputs?.length || 0})`;
  const outCountEl = document.getElementById('outputs-count-heading');
  if (outCountEl) outCountEl.textContent = `Playback Outputs (${snap.outputs?.length || 0})`;

  const inList = document.getElementById('inputs-list');
  if (inList) {
    inList.innerHTML = (snap.inputs || []).map(n => `
      <li class="endpoint-item ${n.isFocusrite ? 'is-fr' : ''} ${n.isDefault ? 'is-default' : ''}">
        <span>${n.isDefault ? '<span class="def-tag">DEF</span> ' : ''}${esc(n.description)}</span>
        <span class="mono" style="color:var(--muted);">PW #${n.id}</span>
      </li>
    `).join('');
  }
  const outList = document.getElementById('outputs-list');
  if (outList) {
    outList.innerHTML = (snap.outputs || []).map(n => `
      <li class="endpoint-item ${n.isFocusrite ? 'is-fr' : ''} ${n.isDefault ? 'is-default' : ''}">
        <span>${n.isDefault ? '<span class="def-tag">DEF</span> ' : ''}${esc(n.description)}</span>
        <span class="mono" style="color:var(--muted);">PW #${n.id}</span>
      </li>
    `).join('');
  }
  updateHeadphoneMixBadge(snap);
  if (!document.getElementById('headphone-mix-modal')?.classList.contains('hidden')) {
    renderHeadphoneMixModal(snap);
  }
  updateStatusBarTelemetry();
}

let hpMixDebounceTimer = null;

function setLiveHeadphoneBoostDb(dbVal) {
  const clamped = DE.clamp(-12, 12, Number(dbVal) || 0);
  liveHeadphoneBoostDb = Number(clamped.toFixed(1));
  try { localStorage.setItem('robos.daw.headphoneBoostDb', String(liveHeadphoneBoostDb)); } catch {}
  const gainLin = DE.dbToGain(liveHeadphoneBoostDb);
  for (const node of activeLiveMasterBoostGains) {
    try {
      const now = node.context?.currentTime || 0;
      node.gain.setTargetAtTime(gainLin, now, 0.008);
    } catch {
      try { node.gain.value = gainLin; } catch {}
    }
  }
  const lbl = document.getElementById('hpmix-daw-boost-val');
  if (lbl) lbl.textContent = `${liveHeadphoneBoostDb >= 0 ? '+' : ''}${liveHeadphoneBoostDb.toFixed(1)} dB`;
}

function updateHeadphoneMixBadge(snap = currentSnapshot) {
  const badge = document.getElementById('headphone-mix-badge');
  if (!badge) return;
  const hpMix = snap?.focusrite?.mixer?.headphoneMix;
  const pwPct = snap?.outputVolume?.percent ?? 100;
  if (hpMix?.supported) {
    if (hpMix.activeDirectCount > 0) {
      badge.textContent = `${hpMix.activeDirectCount} Mic${hpMix.activeDirectCount > 1 ? 's' : ''} Live`;
      badge.className = 'pill-count warn-bleed';
      badge.title = `${hpMix.activeDirectCount} Focusrite hardware input(s) are currently audible in your headphones (${hpMix.maxDirectInputDb} dB). Click to mute direct mic echo & boost backing track.`;
    } else {
      const boostNote = hpMix.backingPcmDb > 0 ? ` +${hpMix.backingPcmDb}dB` : `${pwPct}%`;
      badge.textContent = `Clean · ${boostNote}`;
      badge.className = 'pill-count clean-mix';
      badge.title = 'Focusrite direct mic bleed is muted in headphones — pure backing track monitoring.';
    }
  } else {
    badge.textContent = `${pwPct}%`;
    badge.className = 'pill-count';
  }
}

async function openHeadphoneMixModal() {
  const modal = document.getElementById('headphone-mix-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  renderHeadphoneMixModal(currentSnapshot);
  const fresh = await window.robos.getAudioSnapshot();
  if (fresh?.ok) {
    renderSnapshot(fresh);
  }
}

function closeHeadphoneMixModal() {
  document.getElementById('headphone-mix-modal')?.classList.add('hidden');
}

async function applyHeadphoneMixUpdate(patch = {}, statusMsg = '') {
  const cardIndex = currentSnapshot?.focusrite?.alsaCardIndex ?? null;
  const sinkId = currentSnapshot?.activeOutput?.id || null;
  const noteEl = document.getElementById('hpmix-status-note');
  if (noteEl) noteEl.textContent = 'Applying Scarlett hardware DSP & PipeWire output settings...';
  const res = await window.robos.setHeadphoneMix({
    cardIndex,
    sinkId,
    ...patch,
  });
  if (res?.ok && res.snapshot) {
    renderSnapshot(res.snapshot);
    if (statusMsg) showStatus(statusMsg);
    if (noteEl) noteEl.textContent = statusMsg || 'Updated Scarlett Headphone & Backing Track Mix.';
  } else if (noteEl) {
    noteEl.textContent = `Update failed: ${res?.error || 'Unknown error'}`;
  }
  return res;
}

function scheduleHeadphoneMixUpdate(patch, statusMsg = '') {
  if (hpMixDebounceTimer) clearTimeout(hpMixDebounceTimer);
  hpMixDebounceTimer = setTimeout(() => {
    hpMixDebounceTimer = null;
    applyHeadphoneMixUpdate(patch, statusMsg);
  }, 110);
}

function formatMonitorDbLabel(db) {
  const n = Number(db);
  if (!Number.isFinite(n) || n <= -79.5) return 'OFF (-80 dB)';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)} dB`;
}

function renderHeadphoneMixModal(snap = currentSnapshot) {
  const pwPct = snap?.outputVolume?.percent ?? 100;
  const hpMix = snap?.focusrite?.mixer?.headphoneMix || null;

  const pwSlider = document.getElementById('hpmix-pw-vol-slider');
  const pwVal = document.getElementById('hpmix-pw-vol-val');
  if (pwSlider) pwSlider.value = String(DE.clamp(20, 150, pwPct));
  if (pwVal) pwVal.textContent = `${pwPct}%${snap?.outputVolume?.muted ? ' (MUTED)' : ''}`;

  const dawSlider = document.getElementById('hpmix-daw-boost-slider');
  const dawVal = document.getElementById('hpmix-daw-boost-val');
  if (dawSlider) dawSlider.value = String(liveHeadphoneBoostDb);
  if (dawVal) dawVal.textContent = `${liveHeadphoneBoostDb >= 0 ? '+' : ''}${liveHeadphoneBoostDb.toFixed(1)} dB`;

  const pcmBlock = document.getElementById('hpmix-pcm-block');
  const pcmSlider = document.getElementById('hpmix-pcm-db-slider');
  const pcmVal = document.getElementById('hpmix-pcm-db-val');
  const mixBusLbl = document.getElementById('hpmix-mixbus-lbl');
  const masterDirSlider = document.getElementById('hpmix-direct-master-slider');
  const masterDirVal = document.getElementById('hpmix-direct-master-val');
  const listEl = document.getElementById('hpmix-direct-inputs-list');

  if (!hpMix?.supported) {
    if (pcmBlock) pcmBlock.classList.add('hidden');
    if (masterDirSlider) masterDirSlider.disabled = true;
    if (masterDirVal) masterDirVal.textContent = 'N/A';
    if (listEl) {
      listEl.innerHTML = '<div class="hint" style="padding:10px;">No Focusrite hardware DSP routing mixer detected on active USB audio card — use PipeWire &amp; DAW Boost sliders on the left.</div>';
    }
    return;
  }

  if (pcmBlock) pcmBlock.classList.remove('hidden');
  if (mixBusLbl) mixBusLbl.textContent = `${hpMix.mixLeft} / ${hpMix.mixRight}`;
  if (pcmSlider) pcmSlider.value = String(DE.clamp(-36, 12, hpMix.backingPcmDb));
  if (pcmVal) pcmVal.textContent = formatMonitorDbLabel(hpMix.backingPcmDb);

  if (masterDirSlider) {
    masterDirSlider.disabled = false;
    masterDirSlider.value = String(DE.clamp(-80, 6, hpMix.maxDirectInputDb));
  }
  if (masterDirVal) masterDirVal.textContent = formatMonitorDbLabel(hpMix.maxDirectInputDb);

  if (listEl) {
    // Show Analogue 1..8 plus any active S/PDIF or ADAT slots so the list stays focused & crystal-clear
    const visibleSlots = hpMix.directInputs.filter(d => d.active || /^Analogue\s+[1-8]$/i.test(d.inputName));
    listEl.innerHTML = visibleSlots.map(d => {
      // Match session track name if a track uses this input!
      const matchingTrack = (currentProject?.tracks || []).find(t => {
        const m = String(d.inputName).match(/^Analogue\s+(\d+)$/i);
        if (m) {
          const chNum = Number(m[1]);
          return new RegExp(`Input\\s*${chNum}\\b|Mic${chNum}\\b|Line${chNum + 6}\\b`, 'i').test(`${t.inputLabel || ''} ${t.inputNodeName || ''}`);
        }
        return false;
      });
      const friendlyLabel = matchingTrack ? `${d.inputName} (${matchingTrack.name})` : d.inputName;
      return `
        <div class="hpmix-direct-row ${d.active ? 'is-live' : ''}">
          <span class="hpmix-direct-name" title="${esc(friendlyLabel)}">${esc(friendlyLabel)}</span>
          <input type="range" min="-80" max="6" step="1" value="${DE.clamp(-80, 6, d.maxDb)}" data-hp-slot="${d.slot}" class="range-full" />
          <span class="mono" data-hp-slot-lbl="${d.slot}" style="font-size:10px;text-align:right;">${d.active ? `${d.maxDb >= 0 ? '+' : ''}${d.maxDb} dB` : 'OFF'}</span>
          <button type="button" class="btn btn-sm btn-bevel" data-hp-mute-slot="${d.slot}" data-hp-is-active="${d.active ? '1' : '0'}">${d.active ? 'Mute' : '0 dB'}</button>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('input[data-hp-slot]').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const slot = Number(e.target.dataset.hpSlot);
        const db = Number(e.target.value);
        const lbl = listEl.querySelector(`[data-hp-slot-lbl="${slot}"]`);
        if (lbl) lbl.textContent = db <= -79.5 ? 'OFF' : `${db >= 0 ? '+' : ''}${db} dB`;
        scheduleHeadphoneMixUpdate({ slotDb: { slot, db } });
      });
    });

    listEl.querySelectorAll('button[data-hp-mute-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        const slot = Number(btn.dataset.hpMuteSlot);
        const isAct = btn.dataset.hpIsActive === '1';
        applyHeadphoneMixUpdate(
          { slotDb: { slot, db: isAct ? -80 : -6 } },
          isAct ? `Muted Scarlett Slot #${slot} in headphones.` : `Unmuted Scarlett Slot #${slot} (-6 dB) in headphones.`
        );
      });
    });
  }
}

async function toggleLiveMonitor() {
  const btn = document.getElementById('btn-live-monitor');
  if (liveMediaStream) {
    if (liveRafId) cancelAnimationFrame(liveRafId);
    liveRafId = null;
    liveMediaStream.getTracks().forEach(t => t.stop());
    liveMediaStream = null;
    if (liveAudioCtx) {
      try { await liveAudioCtx.close(); } catch {}
      liveAudioCtx = null;
    }
    btn.textContent = 'Start Live Mic Meter';
    setMeter(-96, 'Input Signal Meter');
    return;
  }

  try {
    const inSel = document.getElementById('select-input-device');
    const inOpt = inSel?.selectedOptions?.[0];
    if (inOpt?.dataset?.nodeId) {
      await window.robos.saveAudioEngine({
        defaultInputId: Number(inOpt.dataset.nodeId),
        preferredInputNodeName: inSel.value,
      });
    }
    liveMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    liveAudioCtx = new AudioContext();
    const src = liveAudioCtx.createMediaStreamSource(liveMediaStream);
    const analyser = liveAudioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    btn.textContent = 'Stop Live Mic Meter';

    const tick = () => {
      if (!liveMediaStream) return;
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const a = Math.abs(buf[i]);
        if (a > peak) peak = a;
      }
      const db = peak <= 0.000015 ? -96 : 20 * Math.log10(peak);
      setMeter(db, 'Live Input Signal');
      liveRafId = requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    showStatus(`Could not open live WebAudio stream: ${err.message}`, true);
  }
}

function switchView(viewId) {
  const inAudioDevices = viewId === 'audio-devices';
  document.getElementById('view-audio-devices')?.classList.toggle('hidden', !inAudioDevices);
  document.getElementById('view-studio-stage')?.classList.toggle('hidden', viewId !== 'studio-stage');
  document.getElementById('btn-topbar-audio-devices')?.classList.toggle('active', inAudioDevices);
  document.getElementById('header-hw-pill')?.classList.toggle('active', inAudioDevices);
  const crumb = document.getElementById('header-crumb');
  if (crumb) {
    crumb.textContent = inAudioDevices ? 'Preferences / Audio Devices' : 'Workstation / Arrangement';
  }
  if (viewId === 'studio-stage') requestAnimationFrame(drawAllTimelineCanvases);
}

function toggleAudioDevicesView() {
  const inAudioDevices = !document.getElementById('view-audio-devices')?.classList.contains('hidden');
  switchView(inAudioDevices ? 'studio-stage' : 'audio-devices');
}

// ─── Initialization & Event Wiring ──────────────────────────────────────────

async function init() {
  // Top Menu Bar (File, Edit, Track, Clip, Transport, Mix, View, Help)
  document.querySelectorAll('.menubar-trigger[data-menubar]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openMenubarDropdown(btn.dataset.menubar, btn);
    });
    btn.addEventListener('mouseenter', () => {
      const popup = document.getElementById('daw-menubar-popup');
      if (activeMenubarKey && activeMenubarKey !== btn.dataset.menubar && popup && !popup.classList.contains('hidden')) {
        openMenubarDropdown(btn.dataset.menubar, btn);
      }
    });
  });

  // Topbar View Navigation (Hardware I/O <-> Arrangement)
  document.getElementById('btn-topbar-audio-devices')?.addEventListener('click', toggleAudioDevicesView);
  document.getElementById('header-hw-pill')?.addEventListener('click', toggleAudioDevicesView);
  document.getElementById('header-hw-pill')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      toggleAudioDevicesView();
    }
  });
  document.getElementById('btn-brand-home')?.addEventListener('click', () => switchView('studio-stage'));
  document.getElementById('btn-brand-home')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      switchView('studio-stage');
    }
  });
  document.getElementById('btn-back-to-studio')?.addEventListener('click', () => switchView('studio-stage'));

  // Studio CTAs & Quick Track Batch Controls
  document.getElementById('btn-open-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-empty-open-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-switch-to-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-open-add-mic-wizard')?.addEventListener('click', openAddMicWizard);
  document.getElementById('btn-empty-open-wizard')?.addEventListener('click', openAddMicWizard);
  document.getElementById('btn-empty-add-blank-track')?.addEventListener('click', () => addBlankAudioTracks(1));
  document.getElementById('btn-empty-import-media')?.addEventListener('click', () => importAudioWavFiles());
  document.getElementById('btn-quick-add-track')?.addEventListener('click', () => addBlankAudioTracks(1));
  document.getElementById('btn-quick-import-media')?.addEventListener('click', () => importAudioWavFiles());
  setupMediaDragAndDrop();
  document.getElementById('btn-quick-arm-sel')?.addEventListener('click', () => armSelectedTracks());
  document.getElementById('btn-quick-disarm-all')?.addEventListener('click', () => disarmAllTracks());
  document.getElementById('btn-quick-remove-tracks')?.addEventListener('click', () => removeSelectedTracks());
  document.getElementById('chk-select-all-tracks')?.addEventListener('change', (ev) => {
    selectedClipIds.clear();
    anchorClipId = null;
    if (ev.target.checked) {
      selectedTrackIds = new Set((currentProject?.tracks || []).map(t => t.id));
      anchorTrackId = currentProject?.tracks?.[0]?.id || null;
    } else {
      selectedTrackIds.clear();
      anchorTrackId = null;
    }
    renderStudio();
  });
  document.getElementById('btn-snap-grid')?.addEventListener('click', () => {
    snapToGrid = !snapToGrid;
    updateEditToolbarState();
    showStatus(`Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
  });
  document.getElementById('btn-loop-toggle')?.addEventListener('click', () => {
    loopPlayback = !loopPlayback;
    updateEditToolbarState();
    showStatus(`Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
  });

  // DrumSet AI Soundcheck Wizard Controls
  document.getElementById('btn-sc-close')?.addEventListener('click', closeDrumsetWizard);
  document.getElementById('btn-sc-cancel')?.addEventListener('click', closeDrumsetWizard);
  document.getElementById('btn-sc-sel-focusrite')?.addEventListener('click', () => selectScInputPreset('focusrite'));
  document.getElementById('btn-sc-sel-analog')?.addEventListener('click', () => selectScInputPreset('analog'));
  document.getElementById('btn-sc-sel-adat')?.addEventListener('click', () => selectScInputPreset('adat'));
  document.getElementById('btn-sc-start')?.addEventListener('click', startDrumsetSoundcheck);
  document.getElementById('btn-sc-stop-analyze')?.addEventListener('click', stopAndAnalyzeDrumsetSoundcheck);
  document.getElementById('btn-sc-record-again')?.addEventListener('click', () => setScStage('ready'));
  document.getElementById('btn-sc-apply')?.addEventListener('click', applyDrumsetWizardResults);
  document.getElementById('chk-sc-show-unused')?.addEventListener('change', () => renderScResults());

  // Session File Controls
  document.getElementById('project-name-input')?.addEventListener('change', async (e) => {
    const res = await window.robos.updateProjectMeta({ name: e.target.value });
    if (res?.ok) { currentProject = res.project; markDirty(true); }
  });
  document.getElementById('project-bpm-input')?.addEventListener('change', async (e) => {
    const res = await window.robos.updateProjectMeta({ bpm: Number(e.target.value) || 120 });
    if (res?.ok) {
      currentProject = res.project;
      markDirty(true);
      drawAllTimelineCanvases();
      if (isPlaying || isRecording) seamlessRefreshLiveAudio();
    }
  });
  document.getElementById('btn-metronome-toggle')?.addEventListener('click', async () => {
    const next = !Boolean(currentProject?.metronome);
    const res = await window.robos.updateProjectMeta({ metronome: next });
    if (res?.ok) {
      currentProject = res.project;
      renderStudio();
      if (isPlaying || isRecording) seamlessRefreshLiveAudio();
    }
  });

  document.getElementById('btn-project-new')?.addEventListener('click', createNewSession);
  document.getElementById('btn-project-save')?.addEventListener('click', () => saveCurrentSession(false));
  document.getElementById('btn-project-save-as')?.addEventListener('click', () => saveCurrentSession(true));
  document.getElementById('btn-project-export')?.addEventListener('click', () => openExportMixdownModal());
  document.getElementById('btn-vmon-export-mp4')?.addEventListener('click', () => {
    openExportMixdownModal({ preferFormat: 'mp4', preferTrackId: selectedVideoOutputTrackId });
  });
  document.getElementById('btn-vmon-reveal-mp4')?.addEventListener('click', () => {
    revealActiveVideoTakeInFolder(selectedVideoOutputTrackId);
  });
  document.getElementById('btn-project-save-kdenlive')?.addEventListener('click', (ev) => saveSessionToKdenliveProject({ forceSaveAs: Boolean(ev.shiftKey) }));
  document.getElementById('btn-vmon-kdenlive')?.addEventListener('click', (ev) => saveSessionToKdenliveProject({ forceSaveAs: Boolean(ev.shiftKey) }));
  document.getElementById('btn-export-to-kdenlive')?.addEventListener('click', async (ev) => {
    document.getElementById('export-mixdown-modal')?.classList.add('hidden');
    await saveSessionToKdenliveProject({ forceSaveAs: Boolean(ev.shiftKey) });
  });
  document.getElementById('btn-project-open')?.addEventListener('click', openProjectModal);
  document.getElementById('btn-open-modal-close')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-open-modal-cancel')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-browse-project-file')?.addEventListener('click', () => loadProjectByIdOrDialog({ openDialog: true }));

  // Time Selection Toolbar Pill, Bottom Status Bar Telemetry & Export Audio Mixdown Modal Controls
  document.getElementById('time-selection-pill')?.addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-clear-time-selection')) return;
    openExportMixdownModal();
  });
  document.getElementById('btn-clear-time-selection')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    clearTimeSelection();
  });
  document.getElementById('sb-panel-selection')?.addEventListener('click', (ev) => {
    if (ev.target.closest('#btn-sb-clear-sel')) return;
    if (hasActiveTimeSelection() || selectedClipIds.size > 0) {
      openExportMixdownModal();
    }
  });
  document.getElementById('btn-sb-clear-sel')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    clearTimeSelection();
  });
  document.getElementById('sb-panel-engine')?.addEventListener('click', toggleAudioDevicesView);
  document.getElementById('btn-export-modal-close')?.addEventListener('click', closeExportMixdownModal);
  document.getElementById('btn-export-modal-cancel')?.addEventListener('click', closeExportMixdownModal);
  document.getElementById('btn-export-confirm')?.addEventListener('click', executeExportMixdownFromModal);
  document.getElementById('export-scope-selection')?.addEventListener('change', refreshExportModalSummary);
  document.getElementById('export-scope-full')?.addEventListener('change', refreshExportModalSummary);
  document.getElementById('export-from-input')?.addEventListener('input', refreshExportModalSummary);
  document.getElementById('export-to-input')?.addEventListener('input', refreshExportModalSummary);
  document.getElementById('export-from-input')?.addEventListener('change', () => {
    const f = parseTimecodeInput(document.getElementById('export-from-input')?.value);
    const t = parseTimecodeInput(document.getElementById('export-to-input')?.value);
    if (f !== null && t !== null && t > f + 0.02) setTimeSelectionRange(f, t);
    refreshExportModalSummary();
  });
  document.getElementById('export-to-input')?.addEventListener('change', () => {
    const f = parseTimecodeInput(document.getElementById('export-from-input')?.value);
    const t = parseTimecodeInput(document.getElementById('export-to-input')?.value);
    if (f !== null && t !== null && t > f + 0.02) setTimeSelectionRange(f, t);
    refreshExportModalSummary();
  });
  document.getElementById('export-format-select')?.addEventListener('change', (e) => {
    populateExportQualityOptions(e.target.value);
    if (e.target.value === 'mp4') {
      const chosen = getSelectedExportVideoChoice();
      if (chosen && !hasActiveTimeSelection()) {
        const selRadio = document.getElementById('export-scope-selection');
        if (selRadio) selRadio.checked = true;
        document.getElementById('export-from-input').value = formatTimecode(chosen.startSec);
        document.getElementById('export-to-input').value = formatTimecode(chosen.endSec);
        refreshExportModalSummary();
      }
    }
  });
  document.getElementById('export-video-track-select')?.addEventListener('change', () => {
    const chosen = getSelectedExportVideoChoice();
    if (chosen) {
      const selRadio = document.getElementById('export-scope-selection');
      if (selRadio) selRadio.checked = true;
      document.getElementById('export-from-input').value = formatTimecode(chosen.startSec);
      document.getElementById('export-to-input').value = formatTimecode(chosen.endSec);
      refreshExportModalSummary();
    }
  });
  document.getElementById('btn-export-use-video')?.addEventListener('click', () => {
    const chosen = getSelectedExportVideoChoice();
    if (!chosen) {
      showStatus('No recorded or imported video clip found in this session.', true);
      return;
    }
    const selRadio = document.getElementById('export-scope-selection');
    if (selRadio) selRadio.checked = true;
    document.getElementById('export-from-input').value = formatTimecode(chosen.startSec);
    document.getElementById('export-to-input').value = formatTimecode(chosen.endSec);
    refreshExportModalSummary();
  });
  document.getElementById('export-chk-exclude-click')?.addEventListener('change', refreshExportModalSummary);
  document.getElementById('btn-export-use-ruler')?.addEventListener('click', () => {
    if (!hasActiveTimeSelection()) {
      showStatus('Click-drag across the timeline header (or right-click Set From / Set To) first.', true);
      return;
    }
    const selRadio = document.getElementById('export-scope-selection');
    if (selRadio) selRadio.checked = true;
    document.getElementById('export-from-input').value = formatTimecode(timeSelection.fromSec);
    document.getElementById('export-to-input').value = formatTimecode(timeSelection.toSec);
    refreshExportModalSummary();
  });
  document.getElementById('btn-export-use-clips')?.addEventListener('click', () => {
    const effIds = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
    let lo = Infinity;
    let hi = 0;
    for (const tr of (currentProject?.tracks || [])) {
      for (const c of (tr.clips || [])) {
        if (effIds.has(c.id)) {
          const s = Number(c.startSec) || 0;
          const e = s + (Number(c.durationSec) || 0);
          if (s < lo) lo = s;
          if (e > hi) hi = e;
        }
      }
    }
    if (!Number.isFinite(lo) || hi <= lo + 0.02) {
      showStatus('Select one or more regions/tracks first to use their bounds.', true);
      return;
    }
    setTimeSelectionRange(lo, hi);
    const selRadio = document.getElementById('export-scope-selection');
    if (selRadio) selRadio.checked = true;
    document.getElementById('export-from-input').value = formatTimecode(lo);
    document.getElementById('export-to-input').value = formatTimecode(hi);
    refreshExportModalSummary();
  });
  document.getElementById('btn-export-use-full')?.addEventListener('click', () => {
    const fullRadio = document.getElementById('export-scope-full');
    if (fullRadio) fullRadio.checked = true;
    const fb = getFullSessionExportBounds(Boolean(document.getElementById('export-chk-exclude-click')?.checked));
    document.getElementById('export-from-input').value = formatTimecode(0);
    document.getElementById('export-to-input').value = formatTimecode(fb.endSec);
    refreshExportModalSummary();
  });

  // DAW Edit Toolbar & Zoom Controls
  document.getElementById('btn-edit-undo')?.addEventListener('click', performUndo);
  document.getElementById('btn-edit-redo')?.addEventListener('click', performRedo);
  document.getElementById('btn-edit-select-all')?.addEventListener('click', editSelectAll);
  document.getElementById('btn-edit-split')?.addEventListener('click', editSplitSelectedOrPlayhead);
  document.getElementById('btn-edit-duplicate')?.addEventListener('click', editDuplicateSelected);
  document.getElementById('btn-edit-delete')?.addEventListener('click', editDeleteSelected);
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => setTimelineZoom(timelineZoom * 1.25));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => setTimelineZoom(timelineZoom / 1.25));
  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => setTimelineZoom(1.0, { resetOffset: true }));

  // Shortcuts Modal & Rename Modal Controls
  document.getElementById('btn-open-shortcuts-modal')?.addEventListener('click', () => {
    document.getElementById('shortcuts-modal')?.classList.remove('hidden');
  });
  document.getElementById('btn-shortcuts-close')?.addEventListener('click', () => {
    document.getElementById('shortcuts-modal')?.classList.add('hidden');
  });
  document.getElementById('btn-shortcuts-done')?.addEventListener('click', () => {
    document.getElementById('shortcuts-modal')?.classList.add('hidden');
  });

  document.getElementById('btn-rename-close')?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-rename-cancel')?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-rename-confirm')?.addEventListener('click', () => {
    const val = document.getElementById('rename-modal-input')?.value?.trim();
    const cb = renameModalCallback;
    closeRenameModal();
    if (val && typeof cb === 'function') cb(val);
  });
  document.getElementById('rename-modal-input')?.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      document.getElementById('btn-rename-confirm')?.click();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      closeRenameModal();
    }
  });

  // Global Mouse Drag, Middle-Mouse Hand Pan, Context Menu / Menubar Dismissal & Wheel Zoom/Scroll
  window.addEventListener('mousemove', handleGlobalTimelineMouseMove);
  window.addEventListener('mouseup', handleGlobalTimelineMouseUp);
  window.addEventListener('blur', endMiddlePanDrag);
  window.addEventListener('auxclick', (ev) => {
    if (ev.button === 1 && ev.target?.closest?.('#tracks-workspace')) {
      ev.preventDefault();
    }
  }, { capture: true });
  window.addEventListener('mousedown', (ev) => {
    if (ev.button === 1 && ev.target?.closest?.('#tracks-workspace')) {
      ev.preventDefault();
      ev.stopPropagation();
      closeContextMenu();
      closeMenubarDropdown();
      const refLane = ev.target.closest?.('[data-lane-track]')
        || document.getElementById('timeline-ruler-wrap')
        || document.querySelector('[data-lane-track]');
      const rect = refLane ? refLane.getBoundingClientRect() : null;
      middlePanDragState = {
        startX: ev.clientX,
        startOffsetSec: timelineOffsetSec,
        laneWidth: Math.max(64, rect ? rect.width : 640),
        viewSpanSec: getTimelineDurationSec(),
      };
      document.body.classList.add('panning-timeline');
      return;
    }
    const menu = document.getElementById('daw-context-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(ev.target)) {
      closeContextMenu();
    }
    const mbPopup = document.getElementById('daw-menubar-popup');
    const mbNav = document.getElementById('daw-menubar');
    if (mbPopup && !mbPopup.classList.contains('hidden') && !mbPopup.contains(ev.target) && !(mbNav && mbNav.contains(ev.target))) {
      closeMenubarDropdown();
    }
  }, { capture: true });
  document.getElementById('tracks-list')?.addEventListener('scroll', () => {
    closeContextMenu();
    closeMenubarDropdown();
  });
  document.getElementById('tracks-workspace')?.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      const rulerEl = document.getElementById('timeline-ruler-wrap');
      const rRect = rulerEl ? rulerEl.getBoundingClientRect() : null;
      const anchorRatio = rRect && rRect.width > 20
        ? Math.max(0, Math.min(1, (ev.clientX - rRect.left) / rRect.width))
        : null;
      setTimelineZoom(ev.deltaY < 0 ? timelineZoom * 1.18 : timelineZoom / 1.18, { anchorRatio });
    } else if (ev.shiftKey || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
      ev.preventDefault();
      const delta = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      setTimelineOffsetSec(timelineOffsetSec + (delta / 480) * getTimelineDurationSec());
    }
  }, { passive: false });

  // Empty Track Rack & Timeline Ruler Right-Click Context Menus
  document.getElementById('track-header-col-title')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    openEmptyRackContextMenu(ev);
  });
  document.getElementById('studio-empty-state')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    openEmptyRackContextMenu(ev);
  });
  document.getElementById('tracks-list')?.addEventListener('contextmenu', (ev) => {
    if (!ev.target.closest('.track-row')) {
      ev.preventDefault();
      openEmptyRackContextMenu(ev);
    }
  });
  document.getElementById('timeline-scroll-area')?.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0 || isRecording) return;
    if (ev.target.closest('.track-row') || ev.target.closest('.timeline-header-row')) return;
    const rulerEl = document.getElementById('timeline-ruler-wrap');
    const rect = rulerEl ? rulerEl.getBoundingClientRect() : null;
    if (rect && rect.width > 10 && ev.clientX >= rect.left && ev.clientX <= rect.right) {
      ev.preventDefault();
      closeContextMenu();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const clickedSec = DE.snapTimeToBeatGrid(timelineOffsetSec + ratio * getTimelineDurationSec(), currentProject?.bpm || 120, snapToGrid && !ev.altKey);
      seekPlayheadTo(clickedSec);
    }
  });

  // Transport Controls
  document.getElementById('btn-transport-rewind')?.addEventListener('click', () => {
    if (isRecording) return;
    timelineOffsetSec = 0;
    seekPlayheadTo(0, { ensureVisible: true });
  });
  document.getElementById('btn-transport-play')?.addEventListener('click', (ev) => {
    ev.currentTarget?.blur?.();
    startPlayback();
  });
  document.getElementById('btn-transport-stop')?.addEventListener('click', async (ev) => {
    ev.currentTarget?.blur?.();
    if (isRecording) await toggleRecording();
    else stopPlayback();
  });
  document.getElementById('btn-transport-record')?.addEventListener('click', (ev) => {
    ev.currentTarget?.blur?.();
    toggleRecording();
  });

  document.getElementById('timeline-ruler-wrap')?.addEventListener('mousemove', (ev) => {
    if (rulerScrubState || isRecording) return;
    const wrap = ev.currentTarget;
    if (!hasActiveTimeSelection()) {
      wrap.style.cursor = 'crosshair';
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const totalSec = getTimelineDurationSec();
    const sx0 = ((timeSelection.fromSec - timelineOffsetSec) / totalSec) * rect.width;
    const sx1 = ((timeSelection.toSec - timelineOffsetSec) / totalSec) * rect.width;
    const localX = ev.clientX - rect.left;
    if (Math.abs(localX - sx0) <= 7 || Math.abs(localX - sx1) <= 7) {
      wrap.style.cursor = 'ew-resize';
    } else {
      wrap.style.cursor = 'crosshair';
    }
  });

  document.getElementById('timeline-ruler-wrap')?.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0 || isRecording) return;
    ev.preventDefault();
    closeContextMenu();
    closeMenubarDropdown();
    const rect = ev.currentTarget.getBoundingClientRect();
    const totalSec = getTimelineDurationSec();
    const localX = ev.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, localX / Math.max(1, rect.width)));
    const clickedSec = DE.snapTimeToBeatGrid(timelineOffsetSec + ratio * totalSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);

    if (hasActiveTimeSelection()) {
      const sx0 = ((timeSelection.fromSec - timelineOffsetSec) / totalSec) * rect.width;
      const sx1 = ((timeSelection.toSec - timelineOffsetSec) / totalSec) * rect.width;
      if (Math.abs(localX - sx0) <= 7) {
        rulerScrubState = { rect, startX: ev.clientX, anchorSec: timeSelection.toSec, moved: true };
        return;
      }
      if (Math.abs(localX - sx1) <= 7) {
        rulerScrubState = { rect, startX: ev.clientX, anchorSec: timeSelection.fromSec, moved: true };
        return;
      }
    }
    rulerScrubState = { rect, startX: ev.clientX, anchorSec: clickedSec, moved: false };
  });

  document.getElementById('timeline-ruler-wrap')?.addEventListener('dblclick', (ev) => {
    if (isRecording) return;
    ev.preventDefault();
    clearTimeSelection();
  });
  document.getElementById('timeline-ruler-wrap')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const rect = ev.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    openTimelineSpaceContextMenu(ev, null, timelineOffsetSec + ratio * getTimelineDurationSec());
  });

  // Full Workstation Keyboard Shortcuts (capture phase so focused buttons/sliders never delay Spacebar!)
  window.addEventListener('keydown', async (ev) => {
    const activeEl = document.activeElement;
    const activeTag = activeEl?.tagName || '';
    const inputType = String(activeEl?.type || '').toLowerCase();
    const isTextInput = activeTag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color', 'file'].includes(inputType);
    const isTextTyping = activeTag === 'TEXTAREA' || isTextInput || Boolean(activeEl?.isContentEditable);
    const isSelectFocused = activeTag === 'SELECT';
    const isMod = ev.ctrlKey || ev.metaKey;
    const keyLower = (ev.key || '').toLowerCase();

    // Ctrl+S / Ctrl+Shift+S always works (even inside session name input)
    if (isMod && !ev.altKey && keyLower === 's') {
      ev.preventDefault();
      ev.stopPropagation();
      await saveCurrentSession(ev.shiftKey);
      return;
    }

    // Fast-path Spacebar transport stop/start (even if a slider/button/select is focused when recording or playing!)
    if (!isTextTyping && !isMod && !ev.altKey && ev.code === 'Space') {
      const anyModalOpen = ['add-mic-wizard-modal', 'open-project-modal', 'drumkits-modal', 'drumset-wizard-modal', 'rename-item-modal', 'shortcuts-modal', 'export-mixdown-modal', 'add-video-modal']
        .some(id => {
          const el = document.getElementById(id);
          return el && !el.classList.contains('hidden');
        });
      if (!anyModalOpen && (!isSelectFocused || isRecording || isPlaying || isStartingPlayback || isStartingRecording)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.repeat || isStartingPlayback || isStartingRecording) return;
        if (isRecording) await toggleRecording({ keepCursorAtStop: false });
        else if (isPlaying) stopPlayback({ returnToStart: true });
        else await startPlayback();
        return;
      }
    }

    if (isTextTyping || isSelectFocused) return;

    // Escape closes menus/modals first, otherwise clears selection
    if (ev.key === 'Escape') {
      const mbPopup = document.getElementById('daw-menubar-popup');
      if (mbPopup && !mbPopup.classList.contains('hidden')) {
        closeMenubarDropdown();
        return;
      }
      const ctxMenu = document.getElementById('daw-context-menu');
      if (ctxMenu && !ctxMenu.classList.contains('hidden')) {
        closeContextMenu();
        return;
      }
      const expModal = document.getElementById('export-mixdown-modal');
      if (expModal && !expModal.classList.contains('hidden')) {
        closeExportMixdownModal();
        return;
      }
      const vidModal = document.getElementById('add-video-modal');
      if (vidModal && !vidModal.classList.contains('hidden')) {
        closeAddVideoModal();
        return;
      }
      const scModal = document.getElementById('shortcuts-modal');
      if (scModal && !scModal.classList.contains('hidden')) {
        scModal.classList.add('hidden');
        return;
      }
      const audioView = document.getElementById('view-audio-devices');
      if (audioView && !audioView.classList.contains('hidden')) {
        switchView('studio-stage');
        return;
      }
      if (selectedClipIds.size > 0 || selectedTrackIds.size > 0) {
        selectedClipIds.clear();
        selectedTrackIds.clear();
        renderStudio();
        showStatus('Deselected all tracks and takes.');
        return;
      }
      if (hasActiveTimeSelection()) {
        clearTimeSelection();
      }
      return;
    }

    // Do not intercept studio shortcuts if a modal dialog is open
    const anyModalOpen = ['add-mic-wizard-modal', 'open-project-modal', 'drumkits-modal', 'drumset-wizard-modal', 'rename-item-modal', 'shortcuts-modal', 'export-mixdown-modal', 'add-video-modal']
      .some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
    if (anyModalOpen) return;

    if (!isMod && !ev.altKey && !ev.shiftKey && keyLower === 'v') {
      ev.preventDefault();
      await toggleVideoOutputMonitor();
      return;
    }

    // ─── REAPER Tracking, Recording, Comping, Marker & Workstation Shortcuts ───

    const setCursorSec = (nextSec) => {
      seekPlayheadTo(nextSec, { ensureVisible: true });
    };

    // 1. REAPER Abort Recording & Delete Incomplete Pass: Alt+Backspace or Ctrl+.
    if ((ev.altKey && !isMod && ev.key === 'Backspace') || (isMod && !ev.altKey && ev.key === '.')) {
      ev.preventDefault();
      if (isRecording) await abortCurrentRecording();
      else showStatus('No active recording pass to abort.');
      return;
    }

    // 2. REAPER Quick Retake (Discard Current/Last Pass & Re-Punch Record): Ctrl+Shift+R or F4
    if ((isMod && !ev.altKey && ev.shiftKey && keyLower === 'r') || (!isMod && !ev.altKey && ev.key === 'F4')) {
      ev.preventDefault();
      await quickRetakeRecording();
      return;
    }

    // 3. REAPER Record Transport: Ctrl+R (preventing Chromium reload!) or Numpad *
    if ((isMod && !ev.altKey && !ev.shiftKey && keyLower === 'r') || ev.code === 'NumpadMultiply') {
      ev.preventDefault();
      await toggleRecording();
      return;
    }

    // 4. REAPER Drop Marker Live at Playhead / Recording Position: Insert or Shift+M
    if (ev.key === 'Insert' || (!isMod && !ev.altKey && ev.shiftKey && keyLower === 'm')) {
      ev.preventDefault();
      if (currentProject) {
        if (!isRecording) historyStack.pushSnapshot(currentProject, 'Insert Project Marker');
        const m = DE.addProjectMarker(currentProject, playheadSec);
        invalidateStaticTimelineCaches();
        markDirty(true);
        drawAllTimelineCanvases();
        if (!isRecording) await syncProjectToMain();
        updateEditToolbarState();
        showStatus(`Dropped Marker ${m.num} (${m.name}) at ${formatTimecode(m.timeSec)}`);
      }
      return;
    }

    // 5. REAPER Clear All Markers: Alt+Shift+M
    if (!isMod && ev.altKey && ev.shiftKey && keyLower === 'm') {
      ev.preventDefault();
      if (currentProject && Array.isArray(currentProject.markers) && currentProject.markers.length) {
        await commitEdit('Clear Project Markers', () => { currentProject.markers = []; }, { statusMsg: 'Cleared all timeline markers.' });
      }
      return;
    }

    // 6. REAPER Jump to Marker 1..9: Alt+1 .. Alt+9 (or plain 1..9 when >=1 marker exists)
    if (/^[1-9]$/.test(ev.key) && ((ev.altKey && !isMod) || (!isMod && !ev.altKey && (currentProject?.markers?.length || 0) >= Number(ev.key)))) {
      const targetSec = DE.jumpToProjectMarkerByNumber(currentProject, Number(ev.key));
      if (targetSec !== null) {
        ev.preventDefault();
        setCursorSec(targetSec);
        showStatus(`Jumped to Marker ${ev.key} (${formatTimecode(targetSec)})`);
        return;
      }
    }

    // 7. REAPER Function-Key Console Row: F5 Mute, F6 Solo, F7 Record Arm, F8 Input Monitor, F1/? Keymap
    if (!isMod && !ev.altKey && ev.key === 'F1') {
      ev.preventDefault();
      document.getElementById('shortcuts-modal')?.classList.remove('hidden');
      return;
    }
    if (!isMod && !ev.altKey && ev.key === 'F5') {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        await commitEdit('Toggle Track Mute', () => {
          const tracks = currentProject?.tracks || [];
          const first = tracks.find(t => selectedTrackIds.has(t.id));
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'muted', first ? !first.muted : true);
        });
      }
      return;
    }
    if (!isMod && !ev.altKey && ev.key === 'F6') {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        await commitEdit('Toggle Track Solo', () => {
          const tracks = currentProject?.tracks || [];
          const first = tracks.find(t => selectedTrackIds.has(t.id));
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'soloed', first ? !first.soloed : true);
        });
      }
      return;
    }
    if (!isMod && !ev.altKey && ev.key === 'F7') {
      ev.preventDefault();
      await armSelectedTracks();
      return;
    }
    if ((!isMod && !ev.altKey && ev.key === 'F8') || (!isMod && ev.altKey && !ev.shiftKey && keyLower === 'i')) {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        await commitEdit('Toggle Input Monitoring', () => {
          const tracks = currentProject?.tracks || [];
          const first = tracks.find(t => selectedTrackIds.has(t.id));
          const nextMon = first ? !first.monitor : true;
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'monitor', nextMon);
        }, { statusMsg: `Toggled Input Monitoring on ${selectedTrackIds.size} track(s)` });
      }
      return;
    }

    // 8. REAPER Polarity/Phase Invert (Alt+P), Disarm All (Alt+Shift+D), Unmute All (Ctrl+Alt+M), Add Mic Wizard (Alt+T)
    if (!isMod && ev.altKey && !ev.shiftKey && keyLower === 'p') {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        await commitEdit('Toggle Phase Polarity', () => {
          const tracks = currentProject?.tracks || [];
          const first = tracks.find(t => selectedTrackIds.has(t.id));
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'phaseInvert', !(first?.fx?.phaseInvert));
        }, { statusMsg: 'Toggled 180° polarity (Ø) on selected track(s).' });
      }
      return;
    }
    if (!isMod && ev.altKey && ev.shiftKey && keyLower === 'd') {
      ev.preventDefault();
      await disarmAllTracks();
      return;
    }
    if (isMod && ev.altKey && keyLower === 'm') {
      ev.preventDefault();
      await commitEdit('Unmute All Tracks', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'muted', false); }, { statusMsg: 'Unmuted all tracks.' });
      return;
    }
    if (!isMod && ev.altKey && !ev.shiftKey && keyLower === 't') {
      ev.preventDefault();
      await openAddMicWizard();
      return;
    }

    // 9. REAPER Snap (Alt+S) & Repeat Loop (Alt+R) & Fade In/Out to Cursor (Alt+F / Alt+G)
    if (!isMod && ev.altKey && !ev.shiftKey && keyLower === 's') {
      ev.preventDefault();
      snapToGrid = !snapToGrid;
      updateEditToolbarState();
      showStatus(`Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
      return;
    }
    if (!isMod && ev.altKey && !ev.shiftKey && keyLower === 'r') {
      ev.preventDefault();
      loopPlayback = !loopPlayback;
      updateEditToolbarState();
      showStatus(`Repeat / Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
      return;
    }
    if (!isMod && ev.altKey && !ev.shiftKey && (keyLower === 'f' || keyLower === 'g')) {
      ev.preventDefault();
      const side = keyLower === 'f' ? 'in' : 'out';
      await commitEdit(side === 'in' ? 'Fade In to Cursor' : 'Fade Out from Cursor', () => {
        const cnt = DE.fadeClipsToPlayhead(currentProject, selectedClipIds, selectedTrackIds, side, playheadSec);
        showStatus(cnt ? `Applied Fade-${side === 'in' ? 'In' : 'Out'} to cursor (${formatTimecode(playheadSec)}) on ${cnt} item(s).` : 'Place cursor inside a selected item to fade to cursor.');
      });
      return;
    }

    // 10. REAPER Overlapping Take Comping: T (Next Take), Shift+T (Prev Take), Alt+Shift+T (Crop to Active Take)
    if (!isMod && ev.altKey && ev.shiftKey && keyLower === 't') {
      ev.preventDefault();
      await commitEdit('Crop to Active Take', () => {
        const removed = DE.cropToActiveTake(currentProject, selectedTrackIds, playheadSec);
        showStatus(removed ? `Cropped to active take (removed ${removed} muted pass${removed > 1 ? 'es' : ''}).` : 'No muted overlapping passes to crop on selected track(s).');
      });
      return;
    }
    if (!isMod && !ev.altKey && keyLower === 't') {
      ev.preventDefault();
      const dir = ev.shiftKey ? -1 : 1;
      await commitEdit(dir > 0 ? 'Switch to Next Take' : 'Switch to Previous Take', () => {
        const res = DE.cycleOverlappingTake(currentProject, selectedTrackIds, playheadSec, dir);
        if (res.switchedTracks > 0) {
          selectedClipIds = new Set(res.activeClipIds);
          showStatus(`Comping: Activated Take ${res.takeNumber} / ${res.totalTakes} on ${res.switchedTracks} track(s).`);
        } else {
          showStatus('Record 2+ overlapping passes on a track to cycle takes with T / Shift+T.');
        }
      });
      return;
    }

    // 11. REAPER Normalize Items/Tracks: Ctrl+Shift+N
    if (isMod && !ev.altKey && ev.shiftKey && keyLower === 'n') {
      ev.preventDefault();
      await commitEdit('Normalize Selected (-6.0 dBFS)', () => {
        const effClips = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
        if (selectedClipIds.size > 0) {
          for (const tr of (currentProject?.tracks || [])) {
            for (const c of (tr.clips || [])) {
              if (effClips.has(c.id)) DE.normalizeClipGain(c, -6.0);
            }
          }
          showStatus(`Normalized ${selectedClipIds.size} selected item(s) to -6.0 dBFS.`);
        } else if (selectedTrackIds.size > 0) {
          for (const tr of (currentProject?.tracks || [])) {
            if (selectedTrackIds.has(tr.id)) DE.normalizeTrackGain(tr, -6.0);
          }
          showStatus(`Normalized ${selectedTrackIds.size} selected track(s) to -6.0 dBFS.`);
        }
      });
      return;
    }

    if (isMod && !ev.shiftKey && keyLower === 'n') {
      ev.preventDefault();
      await createNewSession();
    } else if (isMod && keyLower === 'o') {
      ev.preventDefault();
      await openProjectModal();
    } else if (isMod && keyLower === 't') {
      ev.preventDefault();
      await addBlankAudioTracks(ev.shiftKey ? 4 : 1);
    } else if (isMod && ev.shiftKey && keyLower === 'i') {
      ev.preventDefault();
      await importAudioWavFiles();
    } else if (isMod && ev.shiftKey && keyLower === 'e') {
      ev.preventDefault();
      await exportSessionMixdownWav();
    } else if (isMod && ev.shiftKey && keyLower === 'p') {
      ev.preventDefault();
      await openVstDirectoriesModal();
    } else if (isMod && ev.key === ',') {
      ev.preventDefault();
      switchView('audio-devices');
    } else if (isMod && ev.altKey && keyLower === 'r') {
      ev.preventDefault();
      await armAllTracks();
    } else if (isMod && ev.altKey && keyLower === 'k') {
      ev.preventDefault();
      await saveSessionToKdenliveProject({ forceSaveAs: Boolean(ev.shiftKey) });
    } else if (isMod && ev.altKey && keyLower === 's') {
      ev.preventDefault();
      await commitEdit('Clear All Solos', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'soloed', false); });
    } else if (isMod && keyLower === 'a') {
      ev.preventDefault();
      if (ev.shiftKey) editSelectAllTracksOnly();
      else editSelectAll();
    } else if (isMod && keyLower === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) await performRedo();
      else await performUndo();
    } else if (isMod && keyLower === 'y') {
      ev.preventDefault();
      await performRedo();
    } else if (isMod && keyLower === 'c') {
      ev.preventDefault();
      editCopySelected();
    } else if (isMod && keyLower === 'x') {
      ev.preventDefault();
      await editCutSelected();
    } else if (isMod && keyLower === 'v') {
      ev.preventDefault();
      await editPasteAtPlayhead();
    } else if (isMod && keyLower === 'd') {
      ev.preventDefault();
      await editDuplicateSelected();
    } else if (isMod && keyLower === 'b') {
      ev.preventDefault();
      await editSplitSelectedOrPlayhead();
    } else if (!isMod && !ev.altKey && ev.shiftKey && keyLower === 's') {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        const tracks = currentProject?.tracks || [];
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = first ? !first.soloed : true;
        await commitEdit('Solo/Unsolo Selected Tracks', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'soloed', nextVal);
        });
      }
    } else if (!isMod && !ev.altKey && keyLower === 's') {
      ev.preventDefault();
      await editSplitSelectedOrPlayhead();
    } else if (isMod && !ev.altKey && ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      // REAPER Peak Display Gain: Ctrl+Shift+Up / Ctrl+Shift+Down scales waveform visual height non-destructively
      ev.preventDefault();
      waveformZoomDb = DE.clamp(-12, 36, waveformZoomDb + (ev.key === 'ArrowUp' ? 3 : -3));
      drawAllTimelineCanvases();
      showStatus(`Waveform Peak Display Zoom: ${waveformZoomDb >= 0 ? '+' : ''}${waveformZoomDb} dB`);
    } else if (isMod && !ev.altKey && ev.shiftKey && (ev.key === '0' || ev.key === ')')) {
      ev.preventDefault();
      waveformZoomDb = 0;
      drawAllTimelineCanvases();
      showStatus('Waveform Peak Display Zoom: Reset (0 dB)');
    } else if ((isMod && ev.key === '0') || (!isMod && !ev.altKey && ev.key === '\\')) {
      ev.preventDefault();
      setTimelineZoom(1.0, { resetOffset: true });
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault();
      if (ev.shiftKey && selectedTrackIds.size > 0) await removeSelectedTracks();
      else await editDeleteSelected();
    } else if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      if (selectedTrackIds.size > 0) {
        const dir = ev.key === 'ArrowUp' ? -1 : 1;
        await commitEdit(dir < 0 ? 'Move Track(s) Up' : 'Move Track(s) Down', () => {
          DE.reorderTracksBatch(currentProject, selectedTrackIds, dir);
        });
      }
    } else if (isMod && !ev.altKey && !ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      // REAPER Console Track Navigation: Ctrl+Up / Ctrl+Down selects prev/next track
      ev.preventDefault();
      const tracks = currentProject?.tracks || [];
      if (tracks.length) {
        const primary = anchorTrackId || [...selectedTrackIds][0] || tracks[0].id;
        const curIdx = Math.max(0, tracks.findIndex(t => t.id === primary));
        const nextIdx = DE.clamp(0, tracks.length - 1, curIdx + (ev.key === 'ArrowUp' ? -1 : 1));
        selectedTrackIds = new Set([tracks[nextIdx].id]);
        anchorTrackId = tracks[nextIdx].id;
        if (selectedTrackId) selectedTrackId = tracks[nextIdx].id;
        renderStudio();
      }
    } else if (!isMod && !ev.altKey && ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      // Gain Nudge +/-1.0 dB on selected takes or tracks
      ev.preventDefault();
      const deltaDb = ev.key === 'ArrowUp' ? 1.0 : -1.0;
      if (selectedClipIds.size > 0) {
        await commitEdit('Nudge Item Gain', () => {
          for (const tr of (currentProject?.tracks || [])) {
            for (const c of (tr.clips || [])) {
              if (selectedClipIds.has(c.id)) {
                c.gainDb = Number(DE.clamp(-24, 36, (Number(c.gainDb) || 0) + deltaDb).toFixed(1));
                c.autoGainStaged = false;
              }
            }
          }
        });
      } else if (selectedTrackIds.size > 0) {
        await commitEdit('Nudge Track Trim', () => {
          for (const tr of (currentProject?.tracks || [])) {
            if (selectedTrackIds.has(tr.id)) {
              tr.gainDb = Number(DE.clamp(-24, 36, (Number(tr.gainDb) || 0) + deltaDb).toFixed(1));
            }
          }
        });
      }
    } else if (!isMod && !ev.altKey && !ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      // REAPER Default ArrowUp / ArrowDown: Horizontal Zoom In / Out
      ev.preventDefault();
      setTimelineZoom(ev.key === 'ArrowUp' ? timelineZoom * 1.25 : timelineZoom / 1.25);
    } else if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault();
      await editTrimToPlayhead(ev.key === '[' ? 'left' : 'right');
    } else if (!isMod && !ev.altKey && (ev.key === ';' || ev.key === '\'')) {
      // REAPER Jump Cursor to Prev / Next Item Edge or Marker
      ev.preventDefault();
      const nextPt = DE.findAdjacentTimelinePoint(currentProject, playheadSec, ev.key === ';' ? -1 : 1);
      setCursorSec(nextPt);
    } else if (!isMod && !ev.altKey && (ev.key === ',' || ev.key === '.')) {
      // REAPER Beat Scrub/Nudge (-1 Beat / +1 Beat)
      ev.preventDefault();
      const beatSec = 60 / (Number(currentProject?.bpm) || 120);
      setCursorSec(playheadSec + (ev.key === ',' ? -beatSec : beatSec));
    } else if (ev.key === 'PageUp' || ev.key === 'PageDown') {
      // REAPER Measure Jump (-1 Bar / +1 Bar)
      ev.preventDefault();
      const barSec = (60 / (Number(currentProject?.bpm) || 120)) * 4;
      setCursorSec(playheadSec + (ev.key === 'PageUp' ? -barSec : barSec));
    } else if (ev.key === 'F2') {
      ev.preventDefault();
      editRenameFocused();
    } else if (ev.key === 'Enter') {
      // REAPER Enter: Play/Pause (stops at current playhead cursor without rewinding)
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.repeat || isStartingPlayback || isStartingRecording) return;
      if (isRecording) await toggleRecording({ keepCursorAtStop: true });
      else if (isPlaying) stopPlayback({ returnToStart: false });
      else await startPlayback();
    } else if (!isMod && !ev.altKey && ev.shiftKey && keyLower === 'r') {
      ev.preventDefault();
      await armSelectedTracks();
    } else if (!isMod && !ev.altKey && keyLower === 'r') {
      ev.preventDefault();
      await toggleRecording();
    } else if (!isMod && !ev.altKey && keyLower === 'g') {
      ev.preventDefault();
      snapToGrid = !snapToGrid;
      updateEditToolbarState();
      showStatus(`Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
    } else if (!isMod && !ev.altKey && keyLower === 'l') {
      ev.preventDefault();
      loopPlayback = !loopPlayback;
      updateEditToolbarState();
      showStatus(`Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
    } else if (!isMod && !ev.altKey && ev.shiftKey && keyLower === 'c') {
      ev.preventDefault();
      countInEnabled = !countInEnabled;
      showStatus(`1-Bar Record Count-In: ${countInEnabled ? 'ON' : 'OFF'}`);
    } else if (!isMod && !ev.altKey && keyLower === 'c') {
      ev.preventDefault();
      const next = !Boolean(currentProject?.metronome);
      const res = await window.robos.updateProjectMeta({ metronome: next });
      if (res?.ok) {
        currentProject = res.project;
        renderStudio();
        if (isPlaying || isRecording) seamlessRefreshLiveAudio();
      }
    } else if (!isMod && !ev.altKey && keyLower === 'i') {
      ev.preventDefault();
      const primaryId = [...selectedTrackIds][0] || currentProject?.tracks?.[0]?.id || null;
      selectedTrackId = selectedTrackId ? null : primaryId;
      renderStudio();
    } else if (!isMod && !ev.altKey && ev.key === '1') {
      ev.preventDefault();
      switchView('studio-stage');
    } else if (!isMod && !ev.altKey && ev.key === '2') {
      ev.preventDefault();
      switchView('audio-devices');
    } else if (!isMod && !ev.altKey && keyLower === 'm') {
      ev.preventDefault();
      if (selectedClipIds.size > 0) {
        await commitEdit('Toggle Take Mute', () => {
          let firstState = null;
          for (const tr of (currentProject?.tracks || [])) {
            for (const c of (tr.clips || [])) {
              if (selectedClipIds.has(c.id)) {
                if (firstState === null) firstState = !c.muted;
                c.muted = firstState;
              }
            }
          }
        });
      } else if (selectedTrackIds.size > 0) {
        await commitEdit('Toggle Track Mute', () => {
          const tracks = currentProject?.tracks || [];
          const first = tracks.find(t => selectedTrackIds.has(t.id));
          const nextMuted = first ? !first.muted : true;
          for (const t of tracks) if (selectedTrackIds.has(t.id)) t.muted = nextMuted;
        });
      }
    } else if (ev.key === 'Home' || (!isMod && ev.key === '0') || (!isMod && !ev.altKey && !ev.shiftKey && keyLower === 'w')) {
      // REAPER W / Home: Go to start of project (00:00.000)
      ev.preventDefault();
      setCursorSec(0);
    } else if (ev.key === 'End') {
      // REAPER End: Go to end of project
      ev.preventDefault();
      setCursorSec(DE.getProjectEndSec(currentProject));
    } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      const dir = ev.key === 'ArrowLeft' ? -1 : 1;
      const effectiveClipIds = DE.getEffectiveSelectedClipIds(currentProject, selectedClipIds, selectedTrackIds);
      if (isMod && effectiveClipIds.size > 0) {
        const nudge = dir * (ev.shiftKey ? 0.25 : 0.05);
        await commitEdit('Nudge Take(s)', () => {
          DE.moveClipsByDelta(currentProject, effectiveClipIds, nudge);
        });
      } else {
        const step = dir * (ev.shiftKey ? 2.0 : 0.5);
        setCursorSec(playheadSec + step);
      }
    } else if (ev.key === '+' || ev.key === '=') {
      ev.preventDefault();
      setTimelineZoom(timelineZoom * 1.25);
    } else if (ev.key === '-' || ev.key === '_') {
      ev.preventDefault();
      setTimelineZoom(timelineZoom / 1.25);
    } else if (ev.key === '?') {
      ev.preventDefault();
      document.getElementById('shortcuts-modal')?.classList.remove('hidden');
    }
  }, { capture: true });

  // Add Mic Wizard Controls
  document.getElementById('btn-wiz-close')?.addEventListener('click', closeAddMicWizard);
  document.getElementById('btn-wiz-cancel')?.addEventListener('click', closeAddMicWizard);
  document.getElementById('btn-wiz-back')?.addEventListener('click', () => {
    if (wizStep > 1) goToWizardStep(wizStep - 1);
  });
  document.getElementById('btn-wiz-next')?.addEventListener('click', () => {
    if (wizStep < 3) goToWizardStep(wizStep + 1);
  });
  document.getElementById('btn-wiz-add-another')?.addEventListener('click', () => finishAddMicWizard({ addAnother: true }));
  document.getElementById('btn-wiz-finish')?.addEventListener('click', () => finishAddMicWizard({ addAnother: false }));

  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      wizCategory = pill.dataset.cat;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.toggle('active', p === pill));
      renderWizardMicCards();
    });
  });

  document.getElementById('wiz-manual-channel')?.addEventListener('change', (e) => {
    wizSelectedChannelName = e.target.value;
    wizChannelUserPicked = true;
    updateWizardChannelLevelsInPlace();
  });
  document.getElementById('wiz-pan-slider')?.addEventListener('input', (e) => {
    document.getElementById('wiz-pan-val').textContent = formatPan(e.target.value);
  });

  const bindRangeLabel = (id, lblId, fmt) => {
    document.getElementById(id)?.addEventListener('input', e => {
      const lbl = document.getElementById(lblId);
      if (lbl) lbl.textContent = fmt(e.target.value);
    });
  };
  bindRangeLabel('wiz-gate-thresh', 'wiz-gate-val', v => `${v} dB`);
  bindRangeLabel('wiz-eq-hpf', 'wiz-hpf-val', v => `${v} Hz`);
  bindRangeLabel('wiz-eq-low', 'wiz-low-val', v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);
  bindRangeLabel('wiz-eq-mid', 'wiz-mid-val', v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);
  bindRangeLabel('wiz-eq-high', 'wiz-high-val', v => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} dB`);
  bindRangeLabel('wiz-comp-ratio', 'wiz-comp-val', v => `${Number(v).toFixed(1)}:1`);
  bindRangeLabel('wiz-sr-thresh', 'wiz-sr-thresh-val', v => `${v} dBFS`);
  bindRangeLabel('wiz-sr-blend', 'wiz-sr-blend-val', v => `${v}% Replaced`);

  document.getElementById('wiz-sr-enabled')?.addEventListener('change', (e) => {
    document.getElementById('wiz-sr-toggle-lbl').textContent = e.target.checked ? 'ON' : 'OFF';
  });
  document.getElementById('wiz-sr-kit')?.addEventListener('change', (e) => {
    populateWizardDrumSelectors(e.target.value, document.getElementById('wiz-sr-piece')?.value);
  });
  document.getElementById('btn-wiz-audition')?.addEventListener('click', () => {
    auditionDrumPiece(
      document.getElementById('wiz-sr-kit')?.value || 'gm-rock-kit',
      document.getElementById('wiz-sr-piece')?.value || 'snare'
    );
  });
  document.getElementById('btn-wiz-download-kit')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const kitId = document.getElementById('wiz-sr-kit')?.value || 'gm-rock-kit';
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    const res = await window.robos.downloadDrumkit({ kitId });
    btn.disabled = false;
    btn.innerHTML = `${DI.svg('download', 12)}<span>Install Kit</span>`;
    if (res?.ok && res.status) {
      drumkitsStatus = res.status;
      updateDrumkitsBadge();
      populateWizardDrumSelectors(kitId, document.getElementById('wiz-sr-piece')?.value);
      showStatus(`Installed open-source drum kit "${kitId}".`);
    }
  });

  // VST & Sample Directories + Drumkits Modal
  document.getElementById('btn-open-drumkits-modal')?.addEventListener('click', () => {
    openVstDirectoriesModal();
  });
  document.getElementById('btn-vst-browse-dir')?.addEventListener('click', () => {
    browseAndAddCustomVstDirectory();
  });
  document.getElementById('btn-vst-add-path')?.addEventListener('click', () => {
    addCustomVstDirectoryPath(document.getElementById('vst-dir-path-input')?.value);
  });
  document.getElementById('vst-dir-path-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustomVstDirectoryPath(e.currentTarget.value);
    }
  });
  document.getElementById('btn-vst-rescan-dirs')?.addEventListener('click', async () => {
    const res = await window.robos.vstDirsGet();
    if (res?.ok) {
      applyVstDirsResponse(res);
      showStatus(`Rescanned ${res.vstDirsStatus?.totalCustomDirs || 0} custom dir(s) — ${res.vstDirsStatus?.totalPlugins || 0} plugins, ${res.vstDirsStatus?.totalCustomSamples || 0} custom samples.`);
    }
  });
  document.getElementById('btn-drumkits-close')?.addEventListener('click', () => document.getElementById('drumkits-modal')?.classList.add('hidden'));
  document.getElementById('btn-drumkits-done')?.addEventListener('click', () => document.getElementById('drumkits-modal')?.classList.add('hidden'));
  document.getElementById('btn-download-all-kits')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await window.robos.downloadDrumkit({ kitId: 'all' });
    btn.disabled = false;
    if (res?.ok && res.status) {
      drumkitsStatus = res.status;
      updateDrumkitsBadge();
      renderDrumkitsModal();
      showStatus('All open-source studio drum kits verified in ~/.local/share/robos/daw-studio/instruments/.');
    }
  });

  // Scarlett Headphone & Direct Monitor Mix Modal Handlers
  document.getElementById('btn-topbar-headphone-mix')?.addEventListener('click', () => openHeadphoneMixModal());
  document.getElementById('btn-hpmix-close')?.addEventListener('click', closeHeadphoneMixModal);
  document.getElementById('btn-hpmix-done')?.addEventListener('click', closeHeadphoneMixModal);
  document.getElementById('btn-hpmix-preset-drums')?.addEventListener('click', () => {
    setLiveHeadphoneBoostDb(Math.max(0, liveHeadphoneBoostDb));
    applyHeadphoneMixUpdate(
      { preset: 'backing-only' },
      'Applied Drum Tracking Preset: Scarlett direct mic echo muted (-80 dB) + Backing Track set to 100%.'
    );
  });
  document.getElementById('btn-hpmix-preset-boost')?.addEventListener('click', () => {
    setLiveHeadphoneBoostDb(3);
    applyHeadphoneMixUpdate(
      { preset: 'boost-backing' },
      'Applied Loud Backing Boost: Direct mics muted + Scarlett DSP +6 dB + PipeWire 115% + DAW +3 dB.'
    );
  });
  document.getElementById('btn-hpmix-preset-blend')?.addEventListener('click', () => {
    setLiveHeadphoneBoostDb(0);
    applyHeadphoneMixUpdate(
      { preset: 'blend-direct' },
      'Applied Subtle Direct Blend: Scarlett direct mics at -12 dB + Backing Track 100%.'
    );
  });
  document.getElementById('btn-hpmix-mute-all-direct')?.addEventListener('click', () => {
    applyHeadphoneMixUpdate(
      { directMonitorDb: -80 },
      'Muted all Focusrite direct hardware mic inputs in headphones (recording gain unchanged).'
    );
  });
  document.getElementById('hpmix-pw-vol-slider')?.addEventListener('input', (e) => {
    const pct = Number(e.target.value);
    const lbl = document.getElementById('hpmix-pw-vol-val');
    if (lbl) lbl.textContent = `${pct}%`;
    scheduleHeadphoneMixUpdate({ pipewireOutputPercent: pct });
  });
  document.getElementById('hpmix-pcm-db-slider')?.addEventListener('input', (e) => {
    const db = Number(e.target.value);
    const lbl = document.getElementById('hpmix-pcm-db-val');
    if (lbl) lbl.textContent = formatMonitorDbLabel(db);
    scheduleHeadphoneMixUpdate({ backingPcmDb: db });
  });
  document.getElementById('hpmix-daw-boost-slider')?.addEventListener('input', (e) => {
    setLiveHeadphoneBoostDb(Number(e.target.value));
  });
  document.getElementById('hpmix-direct-master-slider')?.addEventListener('input', (e) => {
    const db = Number(e.target.value);
    const lbl = document.getElementById('hpmix-direct-master-val');
    if (lbl) lbl.textContent = formatMonitorDbLabel(db);
    scheduleHeadphoneMixUpdate({ directMonitorDb: db });
  });

  // Audio Devices Preferences Handlers
  document.getElementById('btn-rescan')?.addEventListener('click', async () => {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
    await ensureRoutedStudioAudioCtx(true);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `Connected to ${snap.focusrite.model} (${snap.inputs.length} inputs, ${snap.outputs.length} outputs)`
      : 'Rescanned PipeWire & ALSA audio bus.');
  });

  document.getElementById('select-output-device')?.addEventListener('change', async (e) => {
    const outSel = e.currentTarget;
    const outOpt = outSel?.selectedOptions?.[0];
    const res = await window.robos.saveAudioEngine({
      defaultOutputId: outOpt ? Number(outOpt.dataset.nodeId) : undefined,
      preferredOutputNodeName: outSel?.value || '',
    });
    if (res?.ok && res.snapshot) {
      renderSnapshot(res.snapshot);
    }
    await ensureRoutedStudioAudioCtx(true);
    const outLabel = activeStudioSinkInfo.label || outOpt?.textContent || 'Selected Output';
    showStatus(`Studio Playback & Audition Routed -> ${outLabel}`);
  });

  document.getElementById('btn-apply-engine')?.addEventListener('click', async () => {
    const inSel = document.getElementById('select-input-device');
    const outSel = document.getElementById('select-output-device');
    const inOpt = inSel?.selectedOptions?.[0];
    const outOpt = outSel?.selectedOptions?.[0];
    const res = await window.robos.saveAudioEngine({
      sampleRate: Number(document.getElementById('select-sample-rate').value),
      quantum: Number(document.getElementById('select-quantum').value),
      defaultInputId: inOpt ? Number(inOpt.dataset.nodeId) : undefined,
      defaultOutputId: outOpt ? Number(outOpt.dataset.nodeId) : undefined,
      preferredInputNodeName: inSel?.value || '',
      preferredOutputNodeName: outSel?.value || '',
    });
    if (res?.ok) {
      renderSnapshot(res.snapshot);
      await ensureRoutedStudioAudioCtx(true);
      showStatus(`Applied: ${res.snapshot.clock.effectiveRate} Hz · ${res.snapshot.clock.effectiveQuantum} samples (${res.snapshot.clock.latencyMs} ms latency) -> ${activeStudioSinkInfo.label || res.snapshot.activeOutput?.description || 'Output'}`);
    } else {
      showStatus(`Failed to apply engine settings: ${res?.error || 'Unknown error'}`, true);
    }
  });

  document.getElementById('btn-test-input')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('select-input-device')?.value || '';
    btn.disabled = true;
    showStatus('Capturing 1.5s test sample from selected input...');
    const res = await window.robos.testInputCapture({ targetNodeName: target, durationMs: 1500 });
    btn.disabled = false;
    if (res?.ok) {
      setMeter(res.peakDb, 'Last 1.5s Capture Peak');
      showStatus(`Captured ${res.samples} samples @ 48kHz — Peak: ${res.peakDb} dBFS · RMS: ${res.rmsDb} dBFS`);
    } else {
      showStatus(`Input test failed: ${res?.error || 'No signal'}`, true);
    }
  });

  document.getElementById('btn-play-tone')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('select-output-device')?.value || '';
    btn.disabled = true;
    const res = await window.robos.playTestTone({ targetNodeName: target });
    btn.disabled = false;
    if (res?.ok) showStatus('Played studio test chime on selected output.');
  });

  document.getElementById('btn-live-monitor')?.addEventListener('click', toggleLiveMonitor);

  // Backend Push Subscriptions
  window.robos.onHardwareChanged(async (snap) => {
    renderSnapshot(snap);
    await ensureRoutedStudioAudioCtx(true);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `USB Hotplug: ${snap.focusrite.model} connected (${activeStudioSinkInfo.label || snap.activeOutput?.description || 'routed'}).`
      : 'USB audio device state changed.');
  });

  window.robos.onTapLevels((data) => {
    if (wizStep !== 2) return;
    for (const item of (data?.levels || [])) {
      wizTapLevels[item.name] = item;
    }
    if (data?.detected && !wizChannelUserPicked) {
      wizSelectedChannelName = data.detected.name;
      const alertEl = document.getElementById('wiz-tap-alert');
      if (alertEl) {
        alertEl.textContent = `Detected: ${data.detected.description}`;
        alertEl.classList.remove('hidden');
      }
    }
    updateWizardChannelLevelsInPlace();
  });

  window.robos.onRecordProgress((prog) => {
    if (!isRecording || !liveRecSession) return;
    const sliceDur = Number(prog.sliceDurationSec) || 0.02;
    liveRecSession.sliceDurationSec = sliceDur;

    // Pure O(1) memory ingestion ONLY — never touch DOM or Canvas outside VSync RAF!
    const tracksById = new Map((currentProject?.tracks || []).map(t => [t.id, t]));
    for (const tr of (prog.tracks || [])) {
      liveRecLevels[tr.trackId] = tr;
      const recState = liveRecSession.tracks.get(tr.trackId);
      if (!recState) continue;

      const trackObj = tracksById.get(tr.trackId);
      const threshDb = trackObj?.soundReplacement?.thresholdDb ?? -28;
      const threshLin = Math.pow(10, threshDb / 20);
      const minGapSec = (trackObj?.soundReplacement?.minIntervalMs ?? 65) / 1000;

      if (Array.isArray(tr.newPeaks) && tr.newPeaks.length) {
        for (let i = 0; i < tr.newPeaks.length; i++) {
          const p = Number(tr.newPeaks[i]) || 0;
          if (!recState.liveNoiseEst || recState.peaks.length < 8) {
            recState.liveNoiseEst = recState.liveNoiseEst ? Math.min(recState.liveNoiseEst, Math.max(0.00003, p)) : Math.max(0.00003, p);
          } else if (p < recState.liveNoiseEst * 2.5) {
            recState.liveNoiseEst = recState.liveNoiseEst * 0.92 + p * 0.08;
          }
          if (!recState.liveMaxLin || p > recState.liveMaxLin) {
            recState.liveMaxLin = p;
          }
          const adaptiveLin = (recState.liveMaxLin >= Math.max(0.0008, (recState.liveNoiseEst || 0.00005) * 6.0) && recState.liveMaxLin < threshLin)
            ? Math.max((recState.liveNoiseEst || 0.00005) * 5.0, recState.liveMaxLin * 0.38)
            : threshLin;
          const sliceIdx = recState.peaks.length;
          const sliceSec = sliceIdx * sliceDur;
          if (p >= adaptiveLin && p > recState.prevSlicePeak * 1.22 && (sliceSec - recState.lastHitSec) >= minGapSec) {
            recState.hitTimesSec.push(Number(sliceSec.toFixed(3)));
            recState.lastHitSec = sliceSec;
          }
          recState.prevSlicePeak = p * 0.7 + recState.prevSlicePeak * 0.3;
          recState.peaks.push(p);
        }
      }
      recState.currentPeak = Number(tr.currentPeak) || 0;
      recState.peakDb = Number.isFinite(tr.peakDb) ? tr.peakDb : -96;
      recState.meterDirty = true;
      if (Number.isFinite(tr.maxPeakDb) && tr.maxPeakDb > recState.maxPeakDb) {
        recState.maxPeakDb = tr.maxPeakDb;
      }
    }
  });

  window.robos.onSoundcheckLevels((data) => {
    if (scStage !== 'recording') return;
    const sec = Number(data?.elapsedSec || 0);
    const mins = Math.floor(sec / 60);
    const rem = (sec - mins * 60).toFixed(1).padStart(4, '0');
    const timerEl = document.getElementById('sc-live-timer');
    if (timerEl) timerEl.textContent = `${String(mins).padStart(2, '0')}:${rem}`;

    for (const ch of (data?.channels || [])) {
      const idx = ch.channelIndex;
      const fill = document.getElementById(`sc-bar-fill-${idx}`);
      const badge = document.getElementById(`sc-peak-badge-${idx}`);
      const card = document.getElementById(`sc-meter-card-${idx}`);
      if (fill) fill.style.width = `${dbToPercent(ch.peakDb).toFixed(1)}%`;
      if (badge) {
        badge.textContent = ch.maxPeakDb <= -90 ? 'Max -∞' : `Max ${ch.maxPeakDb.toFixed(1)} dB`;
      }
      if (card && ch.maxPeakDb >= -38) {
        card.classList.add('hit-active');
      }
    }
  });

  window.robos.onSoundcheckStatus((st) => {
    if (st?.message) {
      const detail = document.getElementById('sc-analyzing-detail');
      if (detail) detail.textContent = st.message;
    }
  });

  window.robos.onDrumkitProgress((prog) => {
    const pBar = document.getElementById('drumkits-progress-bar');
    if (pBar) {
      pBar.textContent = `Downloading ${prog.kitId}: ${prog.completed}/${prog.total} (${prog.file})...`;
      pBar.classList.remove('hidden');
      if (prog.completed >= prog.total) {
        setTimeout(() => pBar.classList.add('hidden'), 1800);
      }
    }
    if (window.RobosJobs && prog?.kitId) {
      const pct = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : null;
      if (!activeDrumkitJobHandle || activeDrumkitJobHandle.kitId !== prog.kitId) {
        activeDrumkitJobHandle = {
          kitId: prog.kitId,
          handle: window.RobosJobs.start({
            title: `Install Drum Kit (${prog.kitId})`,
            category: 'DRUM KIT',
            detail: `Downloading ${prog.completed}/${prog.total} (${prog.file || ''})...`,
            progress: pct,
          }),
        };
      } else {
        activeDrumkitJobHandle.handle.update({
          detail: `Downloading ${prog.completed}/${prog.total} (${prog.file || ''})...`,
          progress: pct,
        });
      }
      if (prog.total > 0 && prog.completed >= prog.total) {
        activeDrumkitJobHandle.handle.complete({
          detail: `Installed ${prog.kitId} (${prog.total} samples)`,
        });
        activeDrumkitJobHandle = null;
      }
    }
  });

  document.getElementById('daw-job-status')?.addEventListener('robos-job-action', async (ev) => {
    const outPath = ev?.detail?.outputPath;
    if (outPath && typeof window.robos?.revealFileInFolder === 'function') {
      const rev = await window.robos.revealFileInFolder(outPath);
      if (rev?.ok) {
        showStatus(`Revealed ${String(outPath).split('/').pop()} in file manager.`);
      }
    }
  });

  window.addEventListener('resize', () => requestAnimationFrame(drawAllTimelineCanvases));

  // Video Mode: Add Video Input Modal & Embedded / Pop-Out Video Output Monitor Controls
  const embVid = document.getElementById('embedded-video-el');
  if (embVid) {
    embVid.addEventListener('seeking', () => { isSeekingEmbeddedVideo = true; });
    embVid.addEventListener('seeked', () => {
      isSeekingEmbeddedVideo = false;
      if (pendingEmbeddedSeekSec !== null) {
        const next = pendingEmbeddedSeekSec;
        pendingEmbeddedSeekSec = null;
        safeSeekEmbeddedVideo(embVid, next);
      }
    });
  }

  document.getElementById('btn-topbar-video-monitor')?.addEventListener('click', () => toggleVideoOutputMonitor());
  document.getElementById('btn-open-add-video-modal')?.addEventListener('click', () => openAddVideoModal({ scanLan: true }));
  document.getElementById('btn-quick-add-video')?.addEventListener('click', () => openAddVideoModal({ scanLan: true }));
  document.getElementById('btn-empty-add-video')?.addEventListener('click', () => openAddVideoModal({ scanLan: true, preferredType: 'robos-ip-camera' }));
  document.getElementById('btn-vid-modal-close')?.addEventListener('click', closeAddVideoModal);
  document.getElementById('btn-vid-modal-cancel')?.addEventListener('click', closeAddVideoModal);
  document.getElementById('btn-vid-scan-lan')?.addEventListener('click', () => openAddVideoModal({ scanLan: true, includeSubnetSweep: true }));
  document.getElementById('btn-vid-refresh-preview')?.addEventListener('click', () => refreshAddVideoModalPreview());
  document.getElementById('btn-vid-confirm-add')?.addEventListener('click', () => confirmAddVideoTrackFromModal());
  document.getElementById('btn-vid-robos-connect')?.addEventListener('click', () => connectAndVerifyRobosIpCameraInModal());

  document.querySelectorAll('[data-vid-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      setVideoModalType(btn.dataset.vidType);
      const vcfg = buildSelectedModalVideoConfig();
      if (vcfg.streamUrl || vcfg.devicePath) {
        refreshAddVideoModalPreview().catch(() => {});
      }
    });
  });

  document.getElementById('btn-robos-cam-flip')?.addEventListener('click', () => {
    const nextLens = activeRobosProbedStatus?.lensFacing === 'FRONT' ? 'BACK' : 'FRONT';
    sendModalRobosCamControl({ lens: nextLens });
  });
  document.getElementById('btn-robos-cam-torch')?.addEventListener('click', () => {
    sendModalRobosCamControl({ toggleTorch: true });
  });
  document.getElementById('btn-robos-cam-zoom1')?.addEventListener('click', () => {
    sendModalRobosCamControl({ zoom: 1.0 });
  });
  document.getElementById('btn-robos-cam-zoom2')?.addEventListener('click', () => {
    sendModalRobosCamControl({ zoom: 2.0 });
  });

  document.getElementById('vid-source-select')?.addEventListener('change', (ev) => {
    const val = ev.target.value;
    if (activeVideoModalType === 'robos-ip-camera') {
      const found = discoveredVideoSources.find(s => s.id === val);
      const hostInp = document.getElementById('vid-robos-host-input');
      const portInp = document.getElementById('vid-robos-port-input');
      if (found) {
        if (hostInp) hostInp.value = found.host || '';
        if (portInp) portInp.value = String(found.port || 8080);
        activeRobosProbedStatus = found.robosStatus || null;
        renderRobosTelemetryBar(activeRobosProbedStatus);
        const nameInp = document.getElementById('vid-track-name-input');
        if (nameInp && found.shortName) nameInp.value = found.shortName;
        refreshAddVideoModalPreview().catch(() => {});
      } else {
        if (hostInp) { hostInp.value = ''; hostInp.focus(); }
        renderRobosTelemetryBar(null);
      }
      return;
    }
    document.getElementById('vid-custom-url-fields')?.classList.toggle('hidden', val !== '__custom__');
    const found = discoveredVideoSources.find(s => s.id === val);
    const nameInp = document.getElementById('vid-track-name-input');
    if (nameInp && found?.shortName) {
      nameInp.value = found.shortName;
    }
    if (found) {
      refreshAddVideoModalPreview().catch(() => {});
    }
  });

  document.getElementById('vid-quality-select')?.addEventListener('change', () => {
    const vcfg = buildSelectedModalVideoConfig();
    if (vcfg.streamUrl || vcfg.devicePath) {
      refreshAddVideoModalPreview().catch(() => {});
    }
  });

  document.getElementById('vid-audio-mode-select')?.addEventListener('change', (ev) => {
    document.getElementById('vid-audio-interface-row')?.classList.toggle('hidden', ev.target.value !== 'interface');
  });

  document.getElementById('vmon-track-select')?.addEventListener('change', (ev) => {
    selectedVideoOutputTrackId = ev.target.value || '';
    renderStudio();
    syncVideoOutputMonitor({ forcePush: true });
  });
  document.getElementById('btn-vmon-live-cam')?.addEventListener('click', () => {
    videoLiveCamEnabled = !videoLiveCamEnabled;
    syncVideoOutputMonitor({ forcePush: true });
  });
  document.getElementById('btn-vmon-wide')?.addEventListener('click', () => {
    videoDockWide = !videoDockWide;
    syncVideoOutputMonitor();
    requestAnimationFrame(drawAllTimelineCanvases);
  });
  document.getElementById('btn-vmon-popout')?.addEventListener('click', () => popOutVideoOutputToAppWindow());
  document.getElementById('btn-vmon-close')?.addEventListener('click', () => {
    videoDockOpen = false;
    renderStudio();
    syncVideoOutputMonitor({ forcePush: true });
  });

  if (typeof window.robos?.onVideoWindowState === 'function') {
    window.robos.onVideoWindowState((st) => {
      videoPopoutOpen = Boolean(st?.open);
      if (!videoPopoutOpen && st?.dockToEmbedded) {
        videoDockOpen = true;
      }
      renderStudio();
      syncVideoOutputMonitor({ forcePush: true });
    });
  }
  if (typeof window.robos?.onVideoSelectTrackFromPopout === 'function') {
    window.robos.onVideoSelectTrackFromPopout((payload) => {
      if (payload?.trackId) {
        selectedVideoOutputTrackId = payload.trackId;
        renderStudio();
        syncVideoOutputMonitor({ forcePush: true });
      }
    });
  }

  // Initial Studio Boot
  const boot = await window.robos.getStudioInit();
  if (boot?.ok) {
    micProfiles = boot.micProfiles || [];
    discoveredVideoSources = Array.isArray(boot.videoSources) ? boot.videoSources : [];
    drumkitsStatus = boot.drumkitsStatus || { kits: [] };
    vstDirsStatus = boot.vstDirsStatus || vstDirsStatus;
    systemPlugins = boot.systemPlugins || [];
    aiProviders = boot.aiProviders || [];
    preferredAiProvider = boot.preferredAiProvider || 'antigravity';
    currentProject = boot.currentProject;
    savedProjectsState = boot.savedProjects || { projects: [] };
    selectedTrackId = null;
    selectedTrackIds = new Set(currentProject?.tracks?.[0]?.id ? [currentProject.tracks[0].id] : []);
    anchorTrackId = currentProject?.tracks?.[0]?.id || null;
    updateDrumkitsBadge();
    renderSnapshot(boot.audioSnapshot);
    await ensureRoutedStudioAudioCtx(true);
    renderStudio();
    showStatus(`Loaded session: ${currentProject?.name || 'Session'}`);
  } else {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
    await ensureRoutedStudioAudioCtx(true);
  }
}

// Expose deterministic inspection hook for E2E verification
window.__dawStudioState = () => ({
  studioAudioSink: {
    sinkId: studioAudioCtx?.sinkId || null,
    nodeName: activeStudioSinkInfo.nodeName || null,
    label: activeStudioSinkInfo.label || null,
  },
  project: currentProject,
  isDirty,
  isRecording,
  isStartingRecording,
  isPlaying,
  isStartingPlayback,
  playheadSec,
  playReturnAnchorSec,
  playbackHotSwapSeq,
  timeSelection: hasActiveTimeSelection() ? { ...timeSelection } : null,
  exportModalOpen: !document.getElementById('export-mixdown-modal')?.classList.contains('hidden'),
  headphoneMixModalOpen: !document.getElementById('headphone-mix-modal')?.classList.contains('hidden'),
  liveHeadphoneBoostDb,
  headphoneMix: currentSnapshot?.focusrite?.mixer?.headphoneMix
    ? {
        activeDirectCount: currentSnapshot.focusrite.mixer.headphoneMix.activeDirectCount,
        maxDirectInputDb: currentSnapshot.focusrite.mixer.headphoneMix.maxDirectInputDb,
        backingPcmDb: currentSnapshot.focusrite.mixer.headphoneMix.backingPcmDb,
        pipewireOutputPercent: currentSnapshot.outputVolume?.percent ?? 100,
      }
    : null,
  jobs: window.RobosJobs?.getSnapshot?.() || null,
  videoMode: {
    discoveredSourcesCount: discoveredVideoSources.length,
    videoTrackIds: getVideoCapableTracks().map(t => t.id),
    selectedVideoOutputTrackId,
    videoDockOpen,
    videoDockWide,
    videoPopoutOpen,
    videoLiveCamEnabled,
  },
  timelineZoom,
  timelineOffsetSec,
  waveformZoomDb,
  snapToGrid,
  loopPlayback,
  countInEnabled,
  activeMenubarKey,
  selectedTrackIds: Array.from(selectedTrackIds),
  selectedClipIds: Array.from(selectedClipIds),
  canUndo: historyStack.canUndo(),
  canRedo: historyStack.canRedo(),
  menubarOpen: !document.getElementById('daw-menubar-popup')?.classList.contains('hidden'),
  contextMenuOpen: !document.getElementById('daw-context-menu')?.classList.contains('hidden'),
  wizStep,
  wizProfileId,
  scStage,
  scSelectedCount: scSelectedInputs.size,
  scClassificationsCount: scClassifications.length,
  drumkitsInstalled: (drumkitsStatus?.kits || []).filter(k => k.installed).map(k => k.id),
  vstCustomDirectories: (vstDirsStatus?.customDirectories || []).map(d => ({
    path: d.path,
    label: d.label,
    pluginCount: d.pluginCount,
    sampleCount: d.sampleCount,
    kitId: d.kitId,
  })),
  totalDiscoveredPlugins: vstDirsStatus?.totalPlugins || 0,
  liveRecording: liveRecSession ? {
    startSec: liveRecSession.startSec,
    elapsedSec: Number(getLiveRecordingElapsedSec().toFixed(3)),
    sliceDurationSec: liveRecSession.sliceDurationSec,
    tracks: Array.from(liveRecSession.tracks.values()).map(t => ({
      trackId: t.trackId,
      peakSliceCount: t.peaks.length,
      currentPeak: t.currentPeak,
      maxPeakDb: t.maxPeakDb,
      liveHitCount: t.hitTimesSec.length,
    })),
  } : null,
});
window.__openDrumsetWizard = openDrumsetWizard;
window.__openVstDirectoriesModal = openVstDirectoriesModal;
window.__dawTestOpenMenubar = (key = 'track') => {
  const btn = document.querySelector(`.menubar-trigger[data-menubar="${key}"]`);
  if (btn) openMenubarDropdown(key, btn);
};
window.__dawTestOpenRackMenu = () => openEmptyRackContextMenu({ clientX: 220, clientY: 200 });
window.__dawTestOpenTimelineMenu = () => openTimelineSpaceContextMenu({ clientX: 600, clientY: 200 }, currentProject?.tracks?.[0] || null, 2.5);
window.__dawTestOpenTrackMenu = (trackIdx = 0) => {
  const tr = currentProject?.tracks?.[trackIdx];
  if (tr) openTrackContextMenu({ clientX: 280, clientY: 220 }, tr);
};
window.__dawTestOpenTakeMenu = (trackIdx = 0, clipIdx = 0) => {
  const tr = currentProject?.tracks?.[trackIdx];
  const cl = tr?.clips?.[clipIdx];
  if (tr && cl) openTakeContextMenu({ clientX: 540, clientY: 220 }, tr, cl, (Number(cl.startSec) || 0) + (Number(cl.durationSec) || 1) * 0.5);
};

init();
