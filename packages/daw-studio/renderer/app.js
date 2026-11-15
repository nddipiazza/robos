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

// Playback & Recording Transport State
let studioAudioCtx = null;
let decodedBufferCache = new Map();
let isPlaying = false;
let isRecording = false;
let playheadSec = 0;
let playStartWallSec = 0;
let playStartOffsetSec = 0;
let activeScheduledNodes = [];
let transportRafId = null;
let liveRecLevels = {}; // trackId -> { peakDb, bytes }

// Add Mic Wizard State
let wizStep = 1;
let wizCategory = 'all';
let wizProfileId = 'kick-in';
let wizSelectedChannelName = '';
let wizTapLevels = {};

// DrumSet AI Soundcheck Wizard State
let aiProviders = [];
let preferredAiProvider = 'antigravity';
let scStage = 'ready'; // 'ready' | 'recording' | 'analyzing' | 'results'
let scSelectedInputs = new Set();
let scArmedInputsList = [];
let scClassifications = [];
let scLastProviderLabel = '';

const DEFAULT_TIMELINE_SECONDS = 16;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTimecode(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
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

function showStatus(message, isError = false) {
  const el = document.getElementById('status-banner');
  if (!el) return;
  el.textContent = message;
  el.className = `status-banner${isError ? ' error' : ''}`;
  el.classList.remove('hidden');
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

function getBaseProjectSpanSec() {
  let maxEnd = DEFAULT_TIMELINE_SECONDS;
  for (const t of (currentProject?.tracks || [])) {
    for (const c of (t.clips || [])) {
      const end = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0) + 2;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return Math.ceil(maxEnd);
}

function getTimelineDurationSec() {
  const base = getBaseProjectSpanSec();
  return Math.max(2, Number((base / Math.max(0.25, timelineZoom)).toFixed(2)));
}

function setTimelineZoom(nextZoom) {
  timelineZoom = DE.clamp(0.25, 8.0, Number(nextZoom) || 1.0);
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
  await syncProjectToMain(reanalyzeTrackIds);
}

async function performUndo() {
  const res = historyStack.undo(currentProject);
  if (!res) {
    showStatus('Nothing left to undo.');
    return;
  }
  currentProject = res.project;
  pruneSelections();
  markDirty(true);
  renderStudio();
  showStatus(`Undo: ${res.label}`);
  await syncProjectToMain();
}

async function performRedo() {
  const res = historyStack.redo(currentProject);
  if (!res) {
    showStatus('Nothing to redo.');
    return;
  }
  currentProject = res.project;
  pruneSelections();
  markDirty(true);
  renderStudio();
  showStatus(`Redo: ${res.label}`);
  await syncProjectToMain();
}

// ─── Web Audio Engine & Open-Source Sample Playback ─────────────────────────

function ensureStudioAudioCtx() {
  if (!studioAudioCtx || studioAudioCtx.state === 'closed') {
    studioAudioCtx = new AudioContext();
  }
  if (studioAudioCtx.state === 'suspended') {
    studioAudioCtx.resume().catch(() => {});
  }
  return studioAudioCtx;
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
    const ctx = ensureStudioAudioCtx();
    const audioBuf = await loadDecodedAudio(samplePath);
    if (!audioBuf) throw new Error('Could not decode drum sample');
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain).connect(ctx.destination);
    src.start();
    showStatus(`Auditioned ${kitId} / ${pieceId}`);
  } catch (err) {
    showStatus(`Audition failed: ${err.message}`, true);
  }
}

function makeSoftClipCurve(amount = 0.2) {
  const k = Math.max(0, Number(amount) || 0) * 35;
  const n = 512;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = k === 0 ? x : ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function buildTrackWebAudioChain(ctx, track) {
  const inputGain = ctx.createGain();
  const trackGainLin = DE.dbToGain(Number(track.gainDb) || 0) * (track.fx?.phaseInvert ? -1 : 1);
  inputGain.gain.value = trackGainLin;
  let tail = inputGain;

  const eq = track.fx?.eq || {};
  if (eq.enabled !== false) {
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = Number(eq.hpfHz) || 40;

    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = Number(eq.lowFreqHz) || 80;
    low.gain.value = Number(eq.lowGainDb) || 0;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = Number(eq.midFreqHz) || 500;
    mid.Q.value = Number(eq.midQ) || 1.4;
    mid.gain.value = Number(eq.midGainDb) || 0;

    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = Number(eq.highFreqHz) || 5000;
    high.gain.value = Number(eq.highGainDb) || 0;

    tail.connect(hpf);
    hpf.connect(low);
    low.connect(mid);
    mid.connect(high);
    tail = high;
  }

  const compCfg = track.fx?.compressor || {};
  if (compCfg.enabled !== false) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = Math.max(-60, Math.min(0, Number(compCfg.thresholdDb) || -18));
    comp.ratio.value = Math.max(1, Math.min(20, Number(compCfg.ratio) || 3.5));
    comp.attack.value = Math.max(0.001, (Number(compCfg.attackMs) || 10) / 1000);
    comp.release.value = Math.max(0.02, (Number(compCfg.releaseMs) || 110) / 1000);
    tail.connect(comp);
    tail = comp;
  }

  if (track.fx?.drive?.enabled && Number(track.fx.drive.amount) > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSoftClipCurve(track.fx.drive.amount);
    tail.connect(shaper);
    tail = shaper;
  }

  const dryBusGain = ctx.createGain();
  const srActive = Boolean(track.soundReplacement?.enabled);
  const blend = srActive ? Math.max(0, Math.min(1, Number(track.soundReplacement?.blend ?? 0.75))) : 0;
  dryBusGain.gain.value = srActive ? (1 - blend * 0.85) : 1.0;
  tail.connect(dryBusGain);

  const trackMixBus = ctx.createGain();
  trackMixBus.gain.value = Math.max(0, Math.min(1.5, Number(track.volume ?? 1.0)));

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, Number(track.pan) || 0));

  dryBusGain.connect(trackMixBus);
  trackMixBus.connect(panner);
  panner.connect(ctx.destination);

  return { inputGain, trackMixBus, srActive, blend };
}

function stopPlayback() {
  isPlaying = false;
  if (transportRafId) {
    cancelAnimationFrame(transportRafId);
    transportRafId = null;
  }
  for (const node of activeScheduledNodes) {
    try { node.stop(); } catch {}
    try { node.disconnect(); } catch {}
  }
  activeScheduledNodes = [];
  document.getElementById('btn-transport-play')?.classList.remove('playing');
  if (!isRecording) {
    const sub = document.getElementById('transport-substate');
    if (sub) sub.textContent = 'READY';
  }
  drawAllTimelineCanvases();
}

async function startPlayback() {
  if (isRecording) return;
  if (isPlaying) {
    stopPlayback();
    return;
  }

  const tracks = currentProject?.tracks || [];
  const anySolo = tracks.some(t => t.soloed);
  const playableTracks = tracks.filter(t => anySolo ? t.soloed : !t.muted);

  const ctx = ensureStudioAudioCtx();
  const startFrom = playheadSec;
  const maxDuration = getBaseProjectSpanSec();

  // Pre-decode needed clip & replacement buffers
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

  const now = ctx.currentTime + 0.04;
  playStartWallSec = now;
  playStartOffsetSec = startFrom;
  isPlaying = true;
  activeScheduledNodes = [];

  for (const track of playableTracks) {
    const { inputGain, trackMixBus, srActive, blend } = buildTrackWebAudioChain(ctx, track);

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
          const t0 = now + (clipStart - startFrom);
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
            const tEnd = now + playDur;
            clipGainNode.gain.setValueAtTime(clipGainLin, now);
            if (fadeOut > 0.002) {
              const fadeStartWall = Math.max(now, tEnd - fadeOut);
              clipGainNode.gain.setValueAtTime(clipGainLin, fadeStartWall);
              clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
            }
            src.connect(clipGainNode).connect(inputGain);
            src.start(now, srcOffset, playDur);
          }
        }
        activeScheduledNodes.push(src);
      }

      // Schedule Open-Source Drum Sound Replacement samples on transients!
      if (srActive && Array.isArray(clip.transients)) {
        const clipVelScale = DE.clamp(0.15, 2.0, DE.dbToGain((Number(clip.gainDb) || 0) * 0.5));
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
          hitSrc.start(now + (absHitSec - startFrom));
          activeScheduledNodes.push(hitSrc);
        }
      }
    }
  }

  // Optional Metronome Click
  if (currentProject?.metronome) {
    const bpm = Number(currentProject?.bpm) || 120;
    const secPerBeat = 60 / bpm;
    const firstBeat = Math.ceil(startFrom / secPerBeat);
    const totalBeats = Math.min(64, Math.floor(maxDuration / secPerBeat));
    for (let b = firstBeat; b <= totalBeats; b++) {
      const beatSec = b * secPerBeat;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = (b % 4 === 0) ? 1180 : 840;
      const t0 = now + (beatSec - startFrom);
      g.gain.setValueAtTime(0.08, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.045);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.05);
      activeScheduledNodes.push(osc);
    }
  }

  document.getElementById('btn-transport-play')?.classList.add('playing');
  const sub = document.getElementById('transport-substate');
  if (sub) sub.textContent = 'PLAYING';

  const tick = () => {
    if (!isPlaying) return;
    playheadSec = playStartOffsetSec + Math.max(0, ctx.currentTime - playStartWallSec);
    document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
    drawAllTimelineCanvases();
    if (playheadSec >= maxDuration) {
      if (loopPlayback) {
        stopPlayback();
        playheadSec = 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(0);
        startPlayback();
        return;
      }
      playheadSec = 0;
      document.getElementById('transport-timecode').textContent = formatTimecode(0);
      stopPlayback();
      return;
    }
    transportRafId = requestAnimationFrame(tick);
  };
  tick();
}

// ─── Multi-Track Hardware Recording ─────────────────────────────────────────

async function playRecordCountInClicks(bpm = 120) {
  const ctx = ensureStudioAudioCtx();
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

async function toggleRecording() {
  if (isPlaying) stopPlayback();

  if (isRecording) {
    const injectTestSignal = Boolean(document.getElementById('chk-test-groove')?.checked);
    const res = await window.robos.recordStop({ injectTestSignal });
    isRecording = false;
    liveRecLevels = {};
    document.getElementById('btn-transport-record')?.classList.remove('recording');
    document.getElementById('header-rec-dot')?.classList.remove('recording');
    document.getElementById('transport-substate').textContent = 'READY';

    if (res?.ok && res.project) {
      if (currentProject) historyStack.pushSnapshot(currentProject, 'Record Multi-Track Take');
      currentProject = res.project;
      selectedClipIds = new Set((res.recordedClips || []).map(x => x.clip?.id).filter(Boolean));
      // Invalidate any stale decoded cache for newly written takes
      for (const item of (res.recordedClips || [])) {
        if (item.clip?.wavFile) decodedBufferCache.delete(item.clip.wavFile);
      }
      markDirty(true);
      renderStudio();
      const totalHits = (res.recordedClips || []).reduce((n, x) => n + (x.clip?.transients?.length || 0), 0);
      showStatus(`Recorded ${res.recordedClips.length} armed mic track(s)${totalHits ? ` — ${totalHits} drum transient(s) detected for Sound Replacement` : ''}.`);
    } else {
      showStatus(`Recording stop error: ${res?.error || 'Unknown error'}`, true);
    }
    return;
  }

  const armed = (currentProject?.tracks || []).filter(t => t.armed);
  if (!armed.length) {
    showStatus('Arm at least one mic track [R] or open Add Mic Wizard before recording.', true);
    return;
  }

  const bpm = Number(document.getElementById('project-bpm-input')?.value) || Number(currentProject?.bpm) || 120;
  if (countInEnabled) {
    await playRecordCountInClicks(bpm);
  }

  const res = await window.robos.recordStart({
    startSec: playheadSec,
    projectMeta: {
      name: document.getElementById('project-name-input')?.value,
      bpm,
    },
  });

  if (!res?.ok) {
    showStatus(res?.error || 'Could not start multi-track recording.', true);
    return;
  }

  isRecording = true;
  document.getElementById('btn-transport-record')?.classList.add('recording');
  document.getElementById('header-rec-dot')?.classList.add('recording');
  document.getElementById('transport-substate').textContent = `REC (${res.armedCount} CH)`;
  showStatus(`Recording ${res.armedCount} armed channel(s) simultaneously via PipeWire + Focusrite — press Stop when finished.`);
}

// ─── Studio & Timeline Rendering ────────────────────────────────────────────

function renderStudio() {
  if (!currentProject) return;

  const nameInput = document.getElementById('project-name-input');
  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = currentProject.name || 'Untitled Session';
  }
  const bpmInput = document.getElementById('project-bpm-input');
  if (bpmInput && document.activeElement !== bpmInput) {
    bpmInput.value = currentProject.bpm || 120;
  }
  document.getElementById('btn-metronome-toggle')?.classList.toggle('active', currentProject.metronome !== false);
  markDirty(isDirty);
  pruneSelections();
  updateEditToolbarState();

  const tracks = currentProject.tracks || [];
  const armedCount = tracks.filter(t => t.armed).length;
  const clipCount = tracks.reduce((n, t) => n + (t.clips?.length || 0), 0);
  const replaceCount = tracks.filter(t => t.soundReplacement?.enabled).length;

  document.getElementById('rail-track-count').textContent = String(tracks.length);
  document.getElementById('rail-armed-count').textContent = String(armedCount);
  document.getElementById('rail-clip-count').textContent = String(clipCount);
  document.getElementById('rail-replace-count').textContent = String(replaceCount);
  document.getElementById('tracks-header-count').textContent = String(tracks.length);

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

    const nameHtml = inlineRenamingTrackId === t.id
      ? `<input type="text" class="inline-rename-input" data-inline-rename="${esc(t.id)}" value="${esc(t.name)}" aria-label="Rename Track" />`
      : `<span class="track-name-label" data-name-dbl="${esc(t.id)}" title="${esc(t.name)} — Double-click to rename · Right-click for Track Menu">${esc(t.name)}</span>`;

    return `
      <div class="track-row ${isSel ? 'selected' : ''}" data-track-id="${esc(t.id)}">
        <div class="track-controls-col" data-track-strip="${esc(t.id)}">
          <div class="track-color-bar" style="background:${esc(t.color || '#00d4ff')}"></div>
          <div class="track-select-stack">
            <span class="track-index-num mono">${chNumStr}</span>
            <input type="checkbox" class="track-sel-chk" data-track-chk="${esc(t.id)}" ${isSel ? 'checked' : ''} title="Select Track for Batch Actions (Shift+Click for range)" aria-label="Select ${esc(t.name)}" />
          </div>
          <img class="track-mic-thumb" src="${esc(t.image || 'assets/mics/snare-mic.webp')}" alt="${esc(t.name)}" />
          <div class="track-meta-stack">
            <div class="track-top-line">
              ${nameHtml}
              <div class="track-btn-strip">
                <button type="button" class="trk-mini-btn hw-rec ${t.armed ? 'arm-on' : ''}" data-act="arm" data-id="${esc(t.id)}" title="Record Arm Track (Ctrl+Click = Selected · Alt+Click = Exclusive)">R</button>
                <button type="button" class="trk-mini-btn hw-mute ${t.muted ? 'mute-on' : ''}" data-act="mute" data-id="${esc(t.id)}" title="Mute Track (M · Ctrl+Click = Selected · Alt+Click = Exclusive)">M</button>
                <button type="button" class="trk-mini-btn hw-solo ${t.soloed ? 'solo-on' : ''}" data-act="solo" data-id="${esc(t.id)}" title="Solo Track (Ctrl+Click = Selected · Alt+Click = Exclusive Solo)">S</button>
                <button type="button" class="trk-mini-btn hw-phase ${phaseOn ? 'phase-on' : ''}" data-act="phase" data-id="${esc(t.id)}" title="180° Phase Invert Ø (Drum Top/Bottom &amp; Overhead Polarity)">Ø</button>
                <button type="button" class="trk-mini-btn hw-fx ${selectedTrackId === t.id ? 'fx-on' : ''}" data-act="inspect" data-id="${esc(t.id)}" title="Open Channel Strip EQ / LV2 / Drum Replace Inspector">${DI.svg('faders', 10.5)}<span>FX</span></button>
                <button type="button" class="trk-mini-btn hw-trig ${srOn ? 'sr-on' : ''}" data-act="toggle-sr" data-id="${esc(t.id)}" title="Toggle Open-Source Drum Sound Replacement">${DI.badge('drum-replace', 12)}<span>${srOn ? esc(srPiece) : 'TRIG'}</span></button>
                <button type="button" class="trk-mini-btn hw-del" data-act="delete" data-id="${esc(t.id)}" title="Remove Track">&times;</button>
              </div>
            </div>
            <div class="track-mid-line">
              <span class="io-micro-tag">IN</span>
              <select class="track-input-select" data-act="input-change" data-id="${esc(t.id)}" aria-label="Track Hardware Input">
                ${inputOptions || `<option value="${esc(t.inputNodeName)}">${esc(t.inputLabel || 'Default Input')}</option>`}
              </select>
            </div>
            <div class="track-gain-line">
              <span class="fader-lbl">TRIM</span>
              <input type="range" class="track-gain-slider daw-fader" min="-24" max="24" step="0.5" value="${gainDb.toFixed(1)}" data-act="gain" data-id="${esc(t.id)}" title="Pre-FX Input Gain (-24 to +24 dB) · Double-click to reset 0.0 dB · Hold Ctrl to gang selected tracks" />
              <span class="mono gain-db-badge ${Math.abs(gainDb) >= 0.05 ? 'boosted' : ''}" id="gain-badge-${esc(t.id)}" data-act="gain-reset" data-id="${esc(t.id)}" title="Double-click to reset Track Gain to 0.0 dB">${DE.formatDb(gainDb)}</span>
              <span class="fader-lbl" style="margin-left:auto;">FADER</span>
              <input type="range" class="track-vol-slider daw-fader" style="width:68px;" min="0" max="1.4" step="0.02" value="${Number(t.volume ?? 1).toFixed(2)}" data-act="vol" data-id="${esc(t.id)}" title="Post-FX Fader Volume · Double-click to reset to 100%" />
              <span class="mono pan-badge" data-act="pan-reset" data-id="${esc(t.id)}" title="Double-click to center Pan">${formatPan(t.pan)}</span>
            </div>
            <div class="track-bot-line">
              <span class="mono region-count-lbl">${(t.clips?.length || 0)} RGN</span>
              <div class="track-live-meter" title="Live Channel Input Peak Meter (dBFS)">
                <div class="track-live-meter-fill" id="rec-meter-${esc(t.id)}" style="width:${dbToPercent(liveRecLevels[t.id]?.peakDb ?? -96)}%"></div>
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
        const newVal = DE.clamp(-24, 24, Number(el.value) || 0);
        const origSelf = startGainMap ? (startGainMap.get(trackId) ?? 0) : (Number(track.gainDb) || 0);
        const delta = newVal - origSelf;
        const targetIds = gangedIds || getTargetTrackIdsForAction(trackId, ev);

        DE.adjustTracksNumericBatch(currentProject, startGainMap, targetIds, 'gainDb', delta, -24, 24, 1);
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
      const rawSec = ratio * totalSec;
      playheadSec = DE.snapTimeToBeatGrid(rawSec, currentProject?.bpm || 120, snapToGrid && !ev.altKey);
      document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
      if (isPlaying) {
        stopPlayback();
        startPlayback();
      } else {
        renderStudio();
      }
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
      const clickTimeSec = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width))) * getTimelineDurationSec();
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
  const clips = track?.clips || [];
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i];
    const startX = (Number(clip.startSec || 0) / totalSec) * w;
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

async function handleGlobalTimelineMouseUp() {
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
    await syncProjectToMain();
  }
}

function drawAllTimelineCanvases() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  const totalSec = getTimelineDurationSec();
  const bpm = Number(currentProject.bpm) || 120;
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;

  // 1. Dual-Tier Pro-DAW Arrangement Ruler (Bars|Beats + Timecode Seconds)
  const ruler = document.getElementById('timeline-ruler-canvas');
  if (ruler) {
    const w = ruler.clientWidth || 640;
    const h = 32;
    if (ruler.width !== w) ruler.width = w;
    if (ruler.height !== h) ruler.height = h;
    const ctx = ruler.getContext('2d');
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

    // Bars & Beats markers (4/4)
    const pxPerBeat = (secPerBeat / totalSec) * w;
    const maxBeats = Math.ceil(totalSec / secPerBeat) + 1;
    ctx.font = '700 9.5px ui-monospace, SFMono-Regular, Menlo, monospace';
    for (let beat = 0; beat <= maxBeats; beat++) {
      const t = beat * secPerBeat;
      if (t > totalSec + 0.01) break;
      const x = Math.round((t / totalSec) * w) + 0.5;
      const isBar = beat % 4 === 0;
      const barNum = Math.floor(beat / 4) + 1;

      if (isBar) {
        ctx.strokeStyle = '#334155';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 17);
        ctx.stroke();
        if (x < w - 26) {
          ctx.fillStyle = '#cbd5e1';
          ctx.fillText(barNum === 1 ? 'BAR 1' : String(barNum), x + 4, 12);
        }
      } else if (pxPerBeat >= 14) {
        ctx.strokeStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(x, 10);
        ctx.lineTo(x, 17);
        ctx.stroke();
      }
    }

    // Seconds sub-lane markers
    ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    const stepSec = totalSec <= 8 ? 0.5 : (totalSec <= 24 ? 1 : 2);
    for (let s = 0; s <= totalSec + 0.001; s += stepSec) {
      const x = Math.round((s / totalSec) * w) + 0.5;
      const isMajor = Math.abs(s % (stepSec * 2)) < 0.01;
      ctx.strokeStyle = isMajor ? '#283446' : '#18202c';
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? 18 : 24);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (isMajor && x < w - 32) {
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${Number(s.toFixed(1))}s`, x + 3, 29);
      }
    }

    // Playhead cap polygon + stem
    const px = Math.round((playheadSec / totalSec) * w);
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
      ctx.moveTo(px + 0.5, 10);
      ctx.lineTo(px + 0.5, h);
      ctx.stroke();
    }
  }

  // 2. Per-Track Pro Waveform + Transient Canvases
  const tracksArr = currentProject.tracks || [];
  for (let tIdx = 0; tIdx < tracksArr.length; tIdx++) {
    const track = tracksArr[tIdx];
    const canvas = document.getElementById(`wave-canvas-${track.id}`);
    if (!canvas) continue;
    const w = canvas.clientWidth || 640;
    const h = 102;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Alternating studio charcoal lane tint
    ctx.fillStyle = tIdx % 2 === 0 ? '#0b0e14' : '#0d1118';
    ctx.fillRect(0, 0, w, h);

    // Subtle alternating 1-bar shading + beat gridlines
    const maxBeats = Math.ceil(totalSec / secPerBeat) + 1;
    const pxPerBar = (secPerBar / totalSec) * w;
    if (pxPerBar >= 28) {
      for (let bar = 0; bar * secPerBar < totalSec; bar += 2) {
        const bx = (bar * secPerBar / totalSec) * w;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
        ctx.fillRect(bx, 0, pxPerBar, h);
      }
    }

    for (let beat = 0; beat <= maxBeats; beat++) {
      const t = beat * secPerBeat;
      if (t > totalSec + 0.01) break;
      const x = Math.round((t / totalSec) * w) + 0.5;
      const isBar = beat % 4 === 0;
      if (!isBar && (secPerBeat / totalSec) * w < 14) continue;
      ctx.strokeStyle = isBar ? 'rgba(148, 163, 184, 0.13)' : 'rgba(148, 163, 184, 0.045)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Center zero-crossing reference line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.beginPath();
    ctx.moveTo(0, Math.round(h / 2) + 0.5);
    ctx.lineTo(w, Math.round(h / 2) + 0.5);
    ctx.stroke();

    const trackGainDb = Number(track.gainDb) || 0;
    const baseColor = track.color || '#00d4ff';

    // Draw recorded audio regions
    for (const clip of (track.clips || [])) {
      const startX = (Number(clip.startSec || 0) / totalSec) * w;
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

      // Rounded region container
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(startX, regionTop, clipW, regionH, 4);
      else ctx.rect(startX, regionTop, clipW, regionH);
      ctx.clip();

      ctx.fillStyle = isHighlighted ? 'rgba(16, 40, 58, 0.96)' : 'rgba(17, 24, 35, 0.94)';
      ctx.fillRect(startX, regionTop, clipW, regionH);

      // Tinted studio region header bar
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

      // Dual-layer Peak + RMS core waveform scaled live by Track Trim + Region Gain
      const peaks = Array.isArray(clip.peaks) ? clip.peaks : [];
      if (peaks.length) {
        const stepX = clipW / peaks.length;
        const barW = Math.max(1, stepX - (stepX > 2.2 ? 0.45 : 0.15));
        const midY = regionTop + 17 + (regionH - 19) / 2;
        const maxAmpH = (regionH - 22) / 2;

        // Outer peak silhouette
        ctx.fillStyle = isMuted ? '#475569' : baseColor;
        ctx.globalAlpha = isMuted ? 0.35 : 0.52;
        for (let i = 0; i < peaks.length; i++) {
          const amp = Math.max(0.02, Math.min(1, peaks[i] * 1.35 * totalGainLinear));
          const bh = amp * maxAmpH;
          ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
        }

        // Brighter inner RMS body core
        ctx.fillStyle = isMuted ? '#94a3b8' : (isClipSel ? '#e0f2fe' : baseColor);
        ctx.globalAlpha = isMuted ? 0.4 : 0.92;
        for (let i = 0; i < peaks.length; i++) {
          const amp = Math.max(0.015, Math.min(1, peaks[i] * 0.78 * totalGainLinear));
          const bh = amp * maxAmpH;
          ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
        }
        ctx.globalAlpha = isMuted ? 0.4 : 1.0;
      }

      // Fade-in & Fade-out envelopes
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

      // Precision Transient Trigger Diamond Markers
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

      // Edge trim handles on selected tracks/regions + active ganged trim brackets
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

      // Region label + metrics (zero emojis)
      ctx.fillStyle = isHighlighted ? '#ffffff' : '#dbeafe';
      ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      const muteTag = isMuted ? '[MUTE] ' : '';
      const gainTag = Math.abs(clipGainDb) >= 0.05 ? ` · ${DE.formatDb(clipGainDb)}` : '';
      const hitNote = track.soundReplacement?.enabled && clip.transients?.length
        ? ` · TRIG ${clip.transients.length}`
        : '';
      ctx.save();
      ctx.beginPath();
      ctx.rect(startX + 4, regionTop + 1, Math.max(4, clipW - 8), 16);
      ctx.clip();
      ctx.fillText(
        `${muteTag}${clip.name || 'Take'}  ${Number(clip.durationSec || 0).toFixed(1)}s · ${clip.peakDb ?? '—'} dB${gainTag}${hitNote}`,
        startX + 6,
        regionTop + 12.5
      );
      ctx.restore();
      ctx.restore();

      // Region crisp border outline
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

    // Live Recording region preview
    if (isRecording && track.armed) {
      const recStart = (playheadSec / totalSec) * w;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fillRect(recStart, 5, Math.max(24, 68), h - 10);
      ctx.strokeStyle = '#ef4444';
      ctx.strokeRect(recStart + 0.5, 5.5, Math.max(24, 68) - 1, h - 11);
      ctx.fillStyle = '#fecaca';
      ctx.font = '700 10.5px ui-monospace, monospace';
      ctx.fillText('REC LIVE', recStart + 7, h / 2 + 4);
    }

    // Playhead cursor line
    const px = Math.round((playheadSec / totalSec) * w);
    if (px >= 0 && px <= w) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, 0);
      ctx.lineTo(px + 0.5, h);
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
  const sr = track.soundReplacement || {};
  const kits = drumkitsStatus?.kits || [];
  const activeKit = kits.find(k => k.id === sr.kitId) || kits[0];
  const piecesObj = activeKit?.pieces || {};

  const kitOpts = kits.map(k => {
    const tag = k.isCustomDirectory ? `[Custom · ${k.sampleCount} samples]` : (k.installed ? '[Installed]' : '[Install]');
    return `<option value="${esc(k.id)}"${k.id === sr.kitId ? ' selected' : ''}>${esc(k.name)} ${esc(tag)}</option>`;
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

    <div class="inspector-grid">
      <div class="rack-module">
        <div class="mini-heading">PREAMP TRIM · POLARITY · PARAMETRIC EQ · DYNAMICS</div>
        <div class="dsp-sliders">
          <div class="slider-row">
            <label>Input Trim (${DE.formatDb(gainDb)})</label>
            <input type="checkbox" id="insp-phase-on" title="180° Phase Invert (Ø)" ${track.fx?.phaseInvert ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-gain-db" min="-24" max="24" step="0.5" value="${gainDb}" />
          </div>
          <div class="slider-row">
            <label>High-Pass (${eq.hpfHz || 60} Hz)</label>
            <input type="checkbox" id="insp-eq-on" ${eq.enabled !== false ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-eq-hpf" min="20" max="320" step="5" value="${eq.hpfHz || 60}" />
          </div>
          <div class="slider-row">
            <label>Low Shelf (${eq.lowGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-low" min="-12" max="12" step="0.5" value="${eq.lowGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Mid Peak (${eq.midGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-mid" min="-12" max="12" step="0.5" value="${eq.midGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>High Air (${eq.highGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" class="daw-fader" id="insp-eq-high" min="-12" max="12" step="0.5" value="${eq.highGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Compressor (${comp.ratio ?? 3.5}:1)</label>
            <input type="checkbox" id="insp-comp-on" ${comp.enabled !== false ? 'checked' : ''} />
            <input type="range" class="daw-fader" id="insp-comp-ratio" min="1" max="10" step="0.5" value="${comp.ratio ?? 3.5}" />
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

  document.getElementById('insp-gain-db')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Input Gain', t => { t.gainDb = DE.clamp(-24, 24, Number(e.target.value) || 0); })
  );
  document.getElementById('insp-phase-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Phase Invert', t => { t.fx = { ...(t.fx || {}), phaseInvert: e.target.checked }; })
  );
  document.getElementById('insp-eq-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle EQ', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), enabled: e.target.checked } }; })
  );
  document.getElementById('insp-eq-hpf')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust HPF', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), hpfHz: Number(e.target.value) } }; })
  );
  document.getElementById('insp-eq-low')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Low Shelf', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), lowGainDb: Number(e.target.value) } }; })
  );
  document.getElementById('insp-eq-mid')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Mid EQ', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), midGainDb: Number(e.target.value) } }; })
  );
  document.getElementById('insp-eq-high')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust High EQ', t => { t.fx = { ...(t.fx || {}), eq: { ...(t.fx?.eq || {}), highGainDb: Number(e.target.value) } }; })
  );
  document.getElementById('insp-comp-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Compressor', t => { t.fx = { ...(t.fx || {}), compressor: { ...(t.fx?.compressor || {}), enabled: e.target.checked } }; })
  );
  document.getElementById('insp-comp-ratio')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Compressor Ratio', t => { t.fx = { ...(t.fx || {}), compressor: { ...(t.fx?.compressor || {}), ratio: Number(e.target.value) } }; })
  );
  document.getElementById('insp-pan')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Pan', t => { t.pan = Number(e.target.value); })
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
  document.getElementById('insp-sr-blend')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Replacement Blend', t => {
      t.soundReplacement = { ...(t.soundReplacement || {}), blend: Number(e.target.value) / 100 };
    })
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
  await commitEdit('Arm All Tracks', () => {
    DE.setTracksPropertyBatch(currentProject, 'all', 'armed', true);
  }, { statusMsg: `Armed all ${currentProject.tracks.length} studio tracks for recording` });
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

async function importAudioWavFiles({ startSec = playheadSec, targetTrackId = null, filePaths = undefined } = {}) {
  const prevSnap = currentProject ? DE.cloneDeep(currentProject) : null;
  const chosenTrackId = targetTrackId || (selectedTrackIds.size === 1 ? [...selectedTrackIds][0] : null);
  const res = await window.robos.importAudioFiles({
    startSec,
    targetTrackId: chosenTrackId,
    filePaths,
  });
  if (res?.canceled) return;
  if (!res?.ok || !res.project) {
    showStatus(`Import WAV failed: ${res?.error || 'Unknown error'}`, true);
    return;
  }
  if (prevSnap) historyStack.pushSnapshot(prevSnap, 'Import Audio WAV');
  currentProject = res.project;
  selectedClipIds = new Set(res.importedClipIds || []);
  markDirty(true);
  switchView('studio-stage');
  renderStudio();
  showStatus(`Imported ${(res.importedClipIds || []).length} WAV file(s) at ${formatTimecode(startSec)}`);
}

function uint8ToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function exportSessionMixdownWav({ targetFile = undefined } = {}) {
  const tracks = currentProject?.tracks || [];
  const anySolo = tracks.some(t => t.soloed);
  const playableTracks = tracks.filter(t => anySolo ? t.soloed : !t.muted);
  let maxEndSec = 0;
  for (const t of playableTracks) {
    for (const c of (t.clips || [])) {
      if (c.muted) continue;
      const e = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0);
      if (e > maxEndSec) maxEndSec = e;
    }
  }
  if (maxEndSec <= 0.05) {
    showStatus('No audible recorded takes to export — record or import audio first.', true);
    return;
  }

  showStatus('Rendering stereo mixdown WAV (EQ + Compressor + Drum Sound Replacement)...');
  try {
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

    const sampleRate = 48000;
    const renderSpanSec = Math.min(900, maxEndSec + 0.5);
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(renderSpanSec * sampleRate), sampleRate);

    for (const track of playableTracks) {
      const { inputGain, trackMixBus, srActive, blend } = buildTrackWebAudioChain(offlineCtx, track);
      for (const clip of (track.clips || [])) {
        if (clip.muted) continue;
        const clipStart = Math.max(0, Number(clip.startSec) || 0);
        const clipOff = Math.max(0, Number(clip.offsetSec) || 0);
        const buf = decodedBufferCache.get(clip.wavFile);
        const clipDur = Math.max(0.04, Number(clip.durationSec) || (buf ? Math.max(0.04, buf.duration - clipOff) : 0));

        if (buf && clipOff < buf.duration) {
          const src = offlineCtx.createBufferSource();
          src.buffer = buf;
          const clipGainNode = offlineCtx.createGain();
          const clipGainLin = DE.dbToGain(Number(clip.gainDb) || 0);
          const playDur = Math.min(clipDur, Math.max(0.01, buf.duration - clipOff));
          const fadeIn = Math.max(0, Number(clip.fadeInSec) || 0);
          const fadeOut = Math.max(0, Number(clip.fadeOutSec) || 0);
          const tEnd = clipStart + playDur;

          if (fadeIn > 0.002) {
            clipGainNode.gain.setValueAtTime(0.0001, clipStart);
            clipGainNode.gain.linearRampToValueAtTime(clipGainLin, clipStart + Math.min(fadeIn, playDur));
          } else {
            clipGainNode.gain.setValueAtTime(clipGainLin, clipStart);
          }
          if (fadeOut > 0.002 && playDur > fadeOut) {
            clipGainNode.gain.setValueAtTime(clipGainLin, Math.max(clipStart + Math.min(fadeIn, playDur), tEnd - fadeOut));
            clipGainNode.gain.linearRampToValueAtTime(0.0001, tEnd);
          }
          src.connect(clipGainNode).connect(inputGain);
          src.start(clipStart, clipOff, playDur);
        }

        if (srActive && Array.isArray(clip.transients)) {
          const clipVelScale = DE.clamp(0.15, 2.0, DE.dbToGain((Number(clip.gainDb) || 0) * 0.5));
          for (const hit of clip.transients) {
            const absHitSec = clipStart + (Number(hit.timeSec) || 0);
            if (absHitSec > clipStart + clipDur + 0.005) continue;
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
    const left = rendered.getChannelData(0);
    const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
    const wavBytes = DE.encodeStereoFloat32ToWavBytes(left, right, sampleRate);
    const safeTitle = String(currentProject?.name || 'mixdown').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const res = await window.robos.exportMixdownWav({
      wavBase64: uint8ToBase64(wavBytes),
      defaultName: `${safeTitle || 'session'}-mixdown.wav`,
      targetFile,
    });
    if (res?.canceled) {
      showStatus('Mixdown export canceled.');
      return;
    }
    if (res?.ok) {
      showStatus(`Exported stereo 48kHz 16-bit WAV mixdown (${renderSpanSec.toFixed(1)}s) → ${res.filePath}`);
    } else {
      showStatus(`Export failed: ${res?.error || 'Unknown error'}`, true);
    }
  } catch (err) {
    showStatus(`Mixdown render error: ${err.message}`, true);
  }
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
      { icon: 'import-wav', label: 'Import Audio WAV File(s)...', kbd: 'Ctrl+Shift+I', run: () => importAudioWavFiles() },
      { icon: 'mixdown-export', label: 'Export Stereo Mixdown (.wav)...', kbd: 'Ctrl+Shift+E', disabled: !hasClips, run: () => exportSessionMixdownWav() },
      { icon: 'folder', label: 'Reveal Session Audio Folder', kbd: '', run: async () => {
        const res = await window.robos.openSessionFolder();
        if (res?.ok) showStatus(`Opened ${res.folder || res.projectDir}`);
      } },
      { sep: true },
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
      { icon: 'drumset-ai', label: 'DrumSet AI All-Mic Soundcheck...', kbd: '', run: () => openDrumsetWizard() },
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
    const metroOn = currentProject?.metronome !== false;
    return [
      { icon: isPlaying ? 'stop' : 'play', label: isPlaying ? 'Stop Playback' : 'Play Timeline', kbd: 'Space', run: () => startPlayback() },
      { icon: isRecording ? 'stop' : 'record', label: isRecording ? 'Stop Recording' : 'Record Armed Tracks', kbd: 'R', run: () => toggleRecording() },
      { icon: 'rewind', label: 'Return to Zero (00:00.00)', kbd: 'Home', run: () => {
        playheadSec = 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(0);
        if (isPlaying) { stopPlayback(); startPlayback(); }
        else drawAllTimelineCanvases();
      } },
      { sep: true },
      { icon: 'metronome', label: `Metronome Click (${metroOn ? 'ON' : 'OFF'})`, kbd: 'C', run: async () => {
        const res = await window.robos.updateProjectMeta({ metronome: !metroOn });
        if (res?.ok) { currentProject = res.project; renderStudio(); }
      } },
      { icon: 'clock', label: `1-Bar Record Count-In (${countInEnabled ? 'ON' : 'OFF'})`, kbd: '', run: () => {
        countInEnabled = !countInEnabled;
        showStatus(`1-Bar Record Count-In: ${countInEnabled ? 'ON' : 'OFF'}`);
      } },
      { icon: 'loop', label: `Loop Timeline Playback (${loopPlayback ? 'ON' : 'OFF'})`, kbd: 'L', run: () => {
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
      { icon: 'maximize', label: 'Zoom to Fit Session (100%)', kbd: 'Ctrl+0', run: () => setTimelineZoom(1.0) },
      { sep: true },
      { icon: 'channel-fx', label: `${selectedTrackId ? 'Hide' : 'Show'} Channel Insert & Trigger Rack`, kbd: 'I', disabled: !hasTracks, run: () => {
        selectedTrackId = selectedTrackId ? null : (primaryTrack?.id || null);
        renderStudio();
      } },
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
    ${ctxRow('data-rack-ctx', 'wiz-drumset', 'drumset-ai', 'DrumSet AI Soundcheck (Gemini)...')}
    ${ctxRow('data-rack-ctx', 'import-wav', 'import-wav', 'Import Audio WAV File(s)...', 'Ctrl+Shift+I')}
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
    ${ctxRow('data-tl-ctx', 'paste-here', 'paste', 'Paste Region(s) Here', 'Ctrl+V', { disabled: !clipClipboard })}
    ${ctxRow('data-tl-ctx', 'import-here', 'import-wav', 'Import Audio WAV Here...', 'Ctrl+Shift+I')}
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
        playheadSec = safeTime;
        document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
        drawAllTimelineCanvases();
      } else if (cmd === 'play-here') {
        stopPlayback();
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

      if (cmd === 'add-below') {
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
          ? `<span class="mic-card-badge">${DI.badge('drum-replace', 12)}<span>Trigger Ready</span></span>`
          : `<span class="mic-card-badge">${DI.badge('channel-fx', 12)}<span>Studio LV2/EQ</span></span>`}
      </div>
      <div class="mic-card-title">${esc(p.name)}</div>
      <div class="mic-card-desc">${esc(p.description)}</div>
      <div class="mic-card-fx">${esc((p.fx?.openSourcePlugins || []).slice(0, 2).join(' · '))}</div>
    </button>
  `).join('');

  grid.querySelectorAll('[data-mic-id]').forEach(card => {
    card.addEventListener('click', () => {
      wizProfileId = card.dataset.micId;
      renderWizardMicCards();
    });
    card.addEventListener('dblclick', () => {
      wizProfileId = card.dataset.micId;
      goToWizardStep(2);
    });
  });
}

function renderWizardChannelRows() {
  const container = document.getElementById('wiz-channel-list');
  const manualSel = document.getElementById('wiz-manual-channel');
  if (!container || !manualSel) return;

  const inputs = getOrderedInputs();
  if (!wizSelectedChannelName && inputs.length) {
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
        <div class="wiz-ch-top">
          <span>${inp.isFocusrite ? '<span class="fr-led"></span>' : ''}${esc(inp.description)}</span>
          <span class="mono">${peakDb <= -90 ? '-∞' : peakDb.toFixed(1)} dBFS${isSel ? ' [SEL]' : ''}</span>
        </div>
        <div class="wiz-ch-bar">
          <div class="wiz-ch-bar-fill" style="width:${dbToPercent(peakDb).toFixed(1)}%"></div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-ch-name]').forEach(row => {
    row.addEventListener('click', () => {
      wizSelectedChannelName = row.dataset.chName;
      renderWizardChannelRows();
    });
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
  kitSel.innerHTML = kits.map(k =>
    `<option value="${esc(k.id)}"${k.id === preferredKitId ? ' selected' : ''}>${esc(k.name)} ${k.installed ? `(${k.sampleCount} samples installed)` : '(Click Install)'}</option>`
  ).join('');

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
    await window.robos.wizardStopTapDetect();
    sub.textContent = 'Step 1 of 3 — Choose a studio microphone or instrument preset';
    nextBtn.textContent = 'Next: Identify Channel →';
    renderWizardMicCards();
  } else if (wizStep === 2) {
    sub.textContent = `Step 2 of 3 — Strike ${profile.shortLabel} or tap the mic to auto-detect its Focusrite input channel`;
    nextBtn.textContent = 'Next: Open-Source VST / EQ & Drum Replace →';

    document.getElementById('wiz-selected-banner').innerHTML = `
      <img src="${esc(profile.image)}" alt="${esc(profile.name)}" />
      <div>
        <strong style="font-size:14.5px;">${esc(profile.name)}</strong>
        <div class="hint">${esc(profile.description)}</div>
      </div>
    `;
    const existingSame = (currentProject?.tracks || []).filter(t => t.profileId === profile.id).length;
    document.getElementById('wiz-track-name').value = existingSame > 0 ? `${profile.shortLabel} ${existingSame + 1}` : profile.shortLabel;
    document.getElementById('wiz-placement-tip').innerHTML = `<strong>Studio Placement Tip:</strong> ${esc(profile.placementTip)}`;
    const hints = profile.hardwareHints || {};
    const hintParts = [
      hints.level || 'Line',
      hints.air ? 'Air ON' : 'Air OFF',
      hints.phantom48v ? '+48V Condenser' : 'Dynamic (No +48V)',
    ];
    document.getElementById('wiz-hw-hint-summary').textContent = hintParts.join(' · ');
    document.getElementById('wiz-tap-alert')?.classList.add('hidden');
    wizTapLevels = {};
    renderWizardChannelRows();
    await window.robos.wizardStartTapDetect({ strikeThresholdDb: -26 });
  } else if (wizStep === 3) {
    await window.robos.wizardStopTapDetect();
    sub.textContent = 'Step 3 of 3 — Review automatic Open-Source VST/LV2 chain, Parametric EQ & Sound Replacement';
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
    const ctx = ensureStudioAudioCtx();
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
    const firstPiece = k.pieces?.snare ? 'snare' : (Object.keys(k.pieces || {})[0] || 'snare');
    const actionBtn = k.isCustomDirectory
      ? `<button type="button" class="btn btn-sm btn-bevel" data-open-kit-dir="${esc(k.kitDir)}">${DI.svg('folder', 12)}<span>Open Folder</span></button>`
      : `<button type="button" class="btn btn-sm ${k.installed ? 'btn-bevel' : 'btn-primary'}" data-dl-kit="${esc(k.id)}">${k.installed ? `${DI.svg('refresh', 12)}<span>Verify</span>` : `${DI.svg('download', 12)}<span>Download</span>`}</button>`;
    return `
      <div class="saved-proj-row">
        <div>
          <strong>${esc(k.name)}</strong> <span class="mono" style="color:var(--accent);">[${esc(k.license)}]</span>
          <div class="hint">${esc(k.description)}</div>
          <div class="mono" style="font-size:11px;color:${k.installed ? '#86efac' : '#fde047'};">
            ${k.installed ? `INSTALLED (${k.sampleCount} lossless/WAV samples)` : 'Not downloaded yet'}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          ${k.installed ? `<button type="button" class="btn btn-sm btn-bevel" data-audition-kit="${esc(k.id)}" data-piece="${esc(firstPiece)}">${DI.svg('speaker', 12)}<span>Test</span></button>` : ''}
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
        </div>
      `;

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
  document.querySelectorAll('.nav-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  document.getElementById('view-audio-devices')?.classList.toggle('hidden', viewId !== 'audio-devices');
  document.getElementById('view-studio-stage')?.classList.toggle('hidden', viewId !== 'studio-stage');
  document.getElementById('header-crumb').textContent =
    viewId === 'audio-devices' ? 'Preferences › Audio Devices' : 'Workstation › Recording Studio';
  if (viewId === 'studio-stage') requestAnimationFrame(drawAllTimelineCanvases);
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

  // Navigation
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('nav-open-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('nav-open-wizard-rail')?.addEventListener('click', openAddMicWizard);

  // Studio CTAs & Quick Track Batch Controls
  document.getElementById('btn-open-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-empty-open-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-switch-to-drumset-wizard')?.addEventListener('click', openDrumsetWizard);
  document.getElementById('btn-open-add-mic-wizard')?.addEventListener('click', openAddMicWizard);
  document.getElementById('btn-empty-open-wizard')?.addEventListener('click', openAddMicWizard);
  document.getElementById('btn-empty-add-blank-track')?.addEventListener('click', () => addBlankAudioTracks(1));
  document.getElementById('btn-quick-add-track')?.addEventListener('click', () => addBlankAudioTracks(1));
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
    if (res?.ok) { currentProject = res.project; markDirty(true); drawAllTimelineCanvases(); }
  });
  document.getElementById('btn-metronome-toggle')?.addEventListener('click', async () => {
    const next = !(currentProject?.metronome !== false);
    const res = await window.robos.updateProjectMeta({ metronome: next });
    if (res?.ok) { currentProject = res.project; renderStudio(); }
  });

  document.getElementById('btn-project-new')?.addEventListener('click', createNewSession);
  document.getElementById('btn-project-save')?.addEventListener('click', () => saveCurrentSession(false));
  document.getElementById('btn-project-save-as')?.addEventListener('click', () => saveCurrentSession(true));
  document.getElementById('btn-project-open')?.addEventListener('click', openProjectModal);
  document.getElementById('btn-open-modal-close')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-open-modal-cancel')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-browse-project-file')?.addEventListener('click', () => loadProjectByIdOrDialog({ openDialog: true }));

  // DAW Edit Toolbar & Zoom Controls
  document.getElementById('btn-edit-undo')?.addEventListener('click', performUndo);
  document.getElementById('btn-edit-redo')?.addEventListener('click', performRedo);
  document.getElementById('btn-edit-select-all')?.addEventListener('click', editSelectAll);
  document.getElementById('btn-edit-split')?.addEventListener('click', editSplitSelectedOrPlayhead);
  document.getElementById('btn-edit-duplicate')?.addEventListener('click', editDuplicateSelected);
  document.getElementById('btn-edit-delete')?.addEventListener('click', editDeleteSelected);
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => setTimelineZoom(timelineZoom * 1.25));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => setTimelineZoom(timelineZoom / 1.25));
  document.getElementById('btn-zoom-fit')?.addEventListener('click', () => setTimelineZoom(1.0));

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

  // Global Mouse Drag, Context Menu / Menubar Dismissal & Ctrl+Wheel Zoom
  window.addEventListener('mousemove', handleGlobalTimelineMouseMove);
  window.addEventListener('mouseup', handleGlobalTimelineMouseUp);
  window.addEventListener('mousedown', (ev) => {
    const menu = document.getElementById('daw-context-menu');
    if (menu && !menu.classList.contains('hidden') && !menu.contains(ev.target)) {
      closeContextMenu();
    }
    const mbPopup = document.getElementById('daw-menubar-popup');
    const mbNav = document.getElementById('daw-menubar');
    if (mbPopup && !mbPopup.classList.contains('hidden') && !mbPopup.contains(ev.target) && !(mbNav && mbNav.contains(ev.target))) {
      closeMenubarDropdown();
    }
  });
  document.getElementById('tracks-list')?.addEventListener('scroll', () => {
    closeContextMenu();
    closeMenubarDropdown();
  });
  document.getElementById('tracks-workspace')?.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey || ev.metaKey) {
      ev.preventDefault();
      setTimelineZoom(ev.deltaY < 0 ? timelineZoom * 1.18 : timelineZoom / 1.18);
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

  // Transport Controls
  document.getElementById('btn-transport-rewind')?.addEventListener('click', () => {
    playheadSec = 0;
    document.getElementById('transport-timecode').textContent = formatTimecode(0);
    if (isPlaying) { stopPlayback(); startPlayback(); }
    else drawAllTimelineCanvases();
  });
  document.getElementById('btn-transport-play')?.addEventListener('click', startPlayback);
  document.getElementById('btn-transport-stop')?.addEventListener('click', async () => {
    if (isRecording) await toggleRecording();
    else stopPlayback();
  });
  document.getElementById('btn-transport-record')?.addEventListener('click', toggleRecording);

  document.getElementById('timeline-ruler-wrap')?.addEventListener('click', (ev) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    playheadSec = DE.snapTimeToBeatGrid(ratio * getTimelineDurationSec(), currentProject?.bpm || 120, snapToGrid && !ev.altKey);
    document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
    if (isPlaying) { stopPlayback(); startPlayback(); }
    else drawAllTimelineCanvases();
  });
  document.getElementById('timeline-ruler-wrap')?.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const rect = ev.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
    openTimelineSpaceContextMenu(ev, null, ratio * getTimelineDurationSec());
  });

  // Full Workstation Keyboard Shortcuts
  window.addEventListener('keydown', async (ev) => {
    const activeTag = document.activeElement?.tagName || '';
    const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeTag) || document.activeElement?.isContentEditable;
    const isMod = ev.ctrlKey || ev.metaKey;
    const keyLower = (ev.key || '').toLowerCase();

    // Ctrl+S / Ctrl+Shift+S always works (even inside session name input)
    if (isMod && !ev.altKey && keyLower === 's') {
      ev.preventDefault();
      await saveCurrentSession(ev.shiftKey);
      return;
    }

    if (isTyping) return;

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
      const scModal = document.getElementById('shortcuts-modal');
      if (scModal && !scModal.classList.contains('hidden')) {
        scModal.classList.add('hidden');
        return;
      }
      if (selectedClipIds.size > 0 || selectedTrackIds.size > 0) {
        selectedClipIds.clear();
        selectedTrackIds.clear();
        renderStudio();
        showStatus('Deselected all tracks and takes.');
      }
      return;
    }

    // Do not intercept studio shortcuts if a modal dialog is open
    const anyModalOpen = ['add-mic-wizard-modal', 'open-project-modal', 'drumkits-modal', 'drumset-wizard-modal', 'rename-item-modal', 'shortcuts-modal']
      .some(id => {
        const el = document.getElementById(id);
        return el && !el.classList.contains('hidden');
      });
    if (anyModalOpen) return;

    if (isMod && keyLower === 'n') {
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
    } else if (isMod && ev.key === '0') {
      ev.preventDefault();
      setTimelineZoom(1.0);
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
    } else if (ev.key === '[' || ev.key === ']') {
      ev.preventDefault();
      await editTrimToPlayhead(ev.key === '[' ? 'left' : 'right');
    } else if (ev.key === 'F2') {
      ev.preventDefault();
      editRenameFocused();
    } else if (ev.code === 'Space') {
      ev.preventDefault();
      if (isRecording) await toggleRecording();
      else if (isPlaying) stopPlayback();
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
    } else if (!isMod && !ev.altKey && keyLower === 'c') {
      ev.preventDefault();
      const next = !(currentProject?.metronome !== false);
      const res = await window.robos.updateProjectMeta({ metronome: next });
      if (res?.ok) { currentProject = res.project; renderStudio(); }
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
    } else if (ev.key === 'Home' || (!isMod && ev.key === '0')) {
      ev.preventDefault();
      playheadSec = 0;
      document.getElementById('transport-timecode').textContent = formatTimecode(0);
      drawAllTimelineCanvases();
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
        playheadSec = Math.max(0, Number((playheadSec + step).toFixed(3)));
        document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
        drawAllTimelineCanvases();
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
  });

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
    renderWizardChannelRows();
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
  document.getElementById('nav-open-vst-dirs')?.addEventListener('click', () => {
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

  // Audio Devices Preferences Handlers
  document.getElementById('btn-rescan')?.addEventListener('click', async () => {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `Connected to ${snap.focusrite.model} (${snap.inputs.length} inputs, ${snap.outputs.length} outputs)`
      : 'Rescanned PipeWire & ALSA audio bus.');
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
      showStatus(`Applied: ${res.snapshot.clock.effectiveRate} Hz · ${res.snapshot.clock.effectiveQuantum} samples (${res.snapshot.clock.latencyMs} ms latency)`);
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
  window.robos.onHardwareChanged((snap) => {
    renderSnapshot(snap);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `USB Hotplug: ${snap.focusrite.model} connected.`
      : 'USB audio device state changed.');
  });

  window.robos.onTapLevels((data) => {
    if (wizStep !== 2) return;
    for (const item of (data?.levels || [])) {
      wizTapLevels[item.name] = item;
    }
    if (data?.detected) {
      wizSelectedChannelName = data.detected.name;
      const alertEl = document.getElementById('wiz-tap-alert');
      if (alertEl) {
        alertEl.textContent = `Strike detected on "${data.detected.description}" (${data.detected.peakDb} dBFS) — channel auto-selected.`;
        alertEl.classList.remove('hidden');
      }
    }
    renderWizardChannelRows();
  });

  window.robos.onRecordProgress((prog) => {
    if (!isRecording) return;
    const recTime = (Number(prog.startSec) || 0) + (Number(prog.elapsedSec) || 0);
    document.getElementById('transport-timecode').textContent = formatTimecode(recTime);
    for (const tr of (prog.tracks || [])) {
      liveRecLevels[tr.trackId] = tr;
      const bar = document.getElementById(`rec-meter-${tr.trackId}`);
      if (bar) bar.style.width = `${dbToPercent(tr.peakDb).toFixed(1)}%`;
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
      pBar.textContent = `Downloading ${prog.kitId}: ${prog.completed}/${prog.total} (${prog.file})…`;
      pBar.classList.remove('hidden');
      if (prog.completed >= prog.total) {
        setTimeout(() => pBar.classList.add('hidden'), 1800);
      }
    }
  });

  window.addEventListener('resize', () => requestAnimationFrame(drawAllTimelineCanvases));

  // Initial Studio Boot
  const boot = await window.robos.getStudioInit();
  if (boot?.ok) {
    micProfiles = boot.micProfiles || [];
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
    renderStudio();
  } else {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
  }
}

// Expose deterministic inspection hook for E2E verification
window.__dawStudioState = () => ({
  project: currentProject,
  isDirty,
  isRecording,
  isPlaying,
  playheadSec,
  timelineZoom,
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
