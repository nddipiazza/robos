'use strict';

const DE = window.DawEditing;

// ─── Studio & Hardware State ────────────────────────────────────────────────
let currentSnapshot = null;
let micProfiles = [];
let drumkitsStatus = { kits: [], anyInstalled: false };
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
    badge.textContent = '✓ Saved';
    badge.className = 'save-badge saved';
  } else {
    badge.textContent = dirty ? '● Unsaved Changes' : 'New Session';
    badge.className = 'save-badge';
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
    armBtn.textContent = tCnt > 0 ? `● Arm (${tCnt})` : '● Arm All';
  }
  const remBtn = document.getElementById('btn-quick-remove-tracks');
  if (remBtn) {
    remBtn.disabled = tCnt === 0;
    remBtn.textContent = tCnt > 0 ? `✕ Remove (${tCnt})` : '✕ Remove';
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
  showStatus(`↩ Undo: ${res.label}`);
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
  showStatus(`↪ Redo: ${res.label}`);
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
    showStatus(`Drum kit "${kitId}" is not installed yet — click "⬇ Install Kit" first.`, true);
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
    showStatus(`🔊 Auditioned ${kitId} → ${pieceId}`);
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
    if (sub) sub.textContent = `COUNT ${4 - b}…`;
    showStatus(`🔔 Count-in (${safeBpm} BPM): ${b + 1} / 4…`);
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
      showStatus(`✓ Recorded ${res.recordedClips.length} armed mic track(s)${totalHits ? ` · ${totalHits} drum transient(s) detected for Sound Replacement` : ''}!`);
    } else {
      showStatus(`Recording stop error: ${res?.error || 'Unknown error'}`, true);
    }
    return;
  }

  const armed = (currentProject?.tracks || []).filter(t => t.armed);
  if (!armed.length) {
    showStatus('Arm at least one mic track (● R) or open "+ Add Mic Wizard" before recording.', true);
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
  showStatus(`● Recording ${res.armedCount} armed channel(s) simultaneously via PipeWire + Focusrite… Click Stop (⏹) when finished.`);
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
  listEl.innerHTML = tracks.map(t => {
    const isSel = selectedTrackIds.has(t.id);
    const srOn = Boolean(t.soundReplacement?.enabled);
    const srPiece = t.soundReplacement?.pieceId || 'drum';
    const phaseOn = Boolean(t.fx?.phaseInvert);
    const gainDb = Number(t.gainDb) || 0;
    const inputOptions = orderedInputs.map(inp =>
      `<option value="${esc(inp.name)}"${inp.name === t.inputNodeName ? ' selected' : ''}>${esc(inp.description)}</option>`
    ).join('');

    const nameHtml = inlineRenamingTrackId === t.id
      ? `<input type="text" class="inline-rename-input" data-inline-rename="${esc(t.id)}" value="${esc(t.name)}" aria-label="Rename Track" />`
      : `<span class="track-name-label" data-name-dbl="${esc(t.id)}" title="${esc(t.name)} — Double-click to rename · Right-click for Track Menu">${esc(t.name)}</span>`;

    return `
      <div class="track-row ${isSel ? 'selected' : ''}" data-track-id="${esc(t.id)}">
        <div class="track-controls-col" data-track-strip="${esc(t.id)}">
          <div class="track-color-bar" style="background:${esc(t.color || '#00bcd4')}"></div>
          <input type="checkbox" class="track-sel-chk" data-track-chk="${esc(t.id)}" ${isSel ? 'checked' : ''} title="Select Track for Batch Actions (Shift+Click for range)" aria-label="Select ${esc(t.name)}" />
          <img class="track-mic-thumb" src="${esc(t.image || 'assets/mics/snare-mic.webp')}" alt="${esc(t.name)}" />
          <div class="track-meta-stack">
            <div class="track-top-line">
              ${nameHtml}
              <div class="track-btn-strip">
                <button type="button" class="trk-mini-btn ${t.armed ? 'arm-on' : ''}" data-act="arm" data-id="${esc(t.id)}" title="Arm Track (Ctrl+Click = Selected · Alt+Click = Exclusive)">● R</button>
                <button type="button" class="trk-mini-btn ${t.muted ? 'mute-on' : ''}" data-act="mute" data-id="${esc(t.id)}" title="Mute Track (M · Ctrl+Click = Selected · Alt+Click = Exclusive)">M</button>
                <button type="button" class="trk-mini-btn ${t.soloed ? 'solo-on' : ''}" data-act="solo" data-id="${esc(t.id)}" title="Solo Track (Ctrl+Click = Selected · Alt+Click = Exclusive Solo)">S</button>
                <button type="button" class="trk-mini-btn ${phaseOn ? 'phase-on' : ''}" data-act="phase" data-id="${esc(t.id)}" title="180° Phase Invert Ø (Drum Top/Bottom &amp; Overhead Polarity)">Ø</button>
                <button type="button" class="trk-mini-btn ${selectedTrackId === t.id ? 'sr-on' : ''}" data-act="inspect" data-id="${esc(t.id)}" title="Open Channel Strip EQ / LV2 / Drum Replace Inspector">🎛️ FX</button>
                <button type="button" class="trk-mini-btn ${srOn ? 'sr-on' : ''}" data-act="toggle-sr" data-id="${esc(t.id)}" title="Toggle Open-Source Drum Sound Replacement">🥁 ${srOn ? esc(srPiece) : 'Off'}</button>
                <button type="button" class="trk-mini-btn" data-act="delete" data-id="${esc(t.id)}" title="Remove Track">✕</button>
              </div>
            </div>
            <div class="track-mid-line">
              <select class="track-input-select" data-act="input-change" data-id="${esc(t.id)}" aria-label="Track Hardware Input">
                ${inputOptions || `<option value="${esc(t.inputNodeName)}">${esc(t.inputLabel || 'Default Input')}</option>`}
              </select>
            </div>
            <div class="track-gain-line">
              <span>Gain</span>
              <input type="range" class="track-gain-slider" min="-24" max="24" step="0.5" value="${gainDb.toFixed(1)}" data-act="gain" data-id="${esc(t.id)}" title="Pre-FX Input Gain (-24 to +24 dB) · Double-click to reset 0.0 dB · Hold Ctrl to gang selected tracks" />
              <span class="mono gain-db-badge ${Math.abs(gainDb) >= 0.05 ? 'boosted' : ''}" id="gain-badge-${esc(t.id)}" data-act="gain-reset" data-id="${esc(t.id)}" title="Double-click to reset Track Gain to 0.0 dB">${DE.formatDb(gainDb)}</span>
              <span style="margin-left:auto;color:#64748b;">Vol</span>
              <input type="range" class="track-vol-slider" style="width:68px;" min="0" max="1.4" step="0.02" value="${Number(t.volume ?? 1).toFixed(2)}" data-act="vol" data-id="${esc(t.id)}" title="Post-FX Fader Volume · Double-click to reset to 100%" />
              <span class="mono" data-act="pan-reset" data-id="${esc(t.id)}" style="cursor:pointer;min-width:26px;text-align:right;" title="Double-click to center Pan">${formatPan(t.pan)}</span>
            </div>
            <div class="track-bot-line">
              <span class="mono" style="font-size:10px;color:#64748b;">${(t.clips?.length || 0)} take${(t.clips?.length || 0) === 1 ? '' : 's'}</span>
              <div class="track-live-meter" title="Live Track Input Peak">
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
  if ((ev?.ctrlKey || ev?.metaKey) && selectedTrackIds.size > 0) {
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
        }, { statusMsg: `✏️ Renamed track to "${nextName}"` });
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
      el.addEventListener('click', ev => ev.stopPropagation());
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        dragSnapshotSaved = false;
        startGainMap = new Map((currentProject?.tracks || []).map(t => [t.id, Number(t.gainDb) || 0]));
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
        track.gainDb = newVal;
        const badge = document.getElementById(`gain-badge-${trackId}`);
        if (badge) {
          badge.textContent = DE.formatDb(newVal);
          badge.classList.toggle('boosted', Math.abs(newVal) >= 0.05);
        }

        // Hold Ctrl while dragging Gain to gang all selected tracks by the same dB delta!
        if ((ev.ctrlKey || ev.metaKey) && selectedTrackIds.has(trackId) && selectedTrackIds.size > 1) {
          for (const other of (currentProject?.tracks || [])) {
            if (other.id === trackId || !selectedTrackIds.has(other.id)) continue;
            const base = startGainMap ? (startGainMap.get(other.id) ?? 0) : (Number(other.gainDb) || 0);
            const gVal = DE.clamp(-24, 24, Number((base + delta).toFixed(1)));
            other.gainDb = gVal;
            const ob = document.getElementById(`gain-badge-${other.id}`);
            if (ob) {
              ob.textContent = DE.formatDb(gVal);
              ob.classList.toggle('boosted', Math.abs(gVal) >= 0.05);
            }
          }
        }
        markDirty(true);
        drawAllTimelineCanvases();
      });
      el.addEventListener('change', async () => {
        dragSnapshotSaved = false;
        renderInspectorDrawer();
        await syncProjectToMain();
      });
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        await commitEdit('Reset Track Gain', () => {
          track.gainDb = 0;
        }, { statusMsg: `🎚️ Reset "${track.name}" input gain to 0.0 dB` });
      });
      return;
    }

    if (act === 'gain-reset') {
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        await commitEdit('Reset Track Gain', () => {
          track.gainDb = 0;
        }, { statusMsg: `🎚️ Reset "${track.name}" input gain to 0.0 dB` });
      });
      return;
    }

    if (act === 'vol') {
      let volSnapSaved = false;
      el.addEventListener('click', ev => ev.stopPropagation());
      el.addEventListener('pointerdown', ev => { ev.stopPropagation(); volSnapSaved = false; });
      el.addEventListener('input', () => {
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        if (!volSnapSaved) {
          historyStack.pushSnapshot(currentProject, 'Adjust Track Volume');
          volSnapSaved = true;
          updateEditToolbarState();
        }
        track.volume = Number(el.value);
        markDirty(true);
      });
      el.addEventListener('change', async () => {
        volSnapSaved = false;
        await syncProjectToMain();
      });
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        await commitEdit('Reset Track Volume', () => { track.volume = 1.0; });
      });
      return;
    }

    if (act === 'pan-reset') {
      el.addEventListener('dblclick', async (ev) => {
        ev.stopPropagation();
        const track = (currentProject?.tracks || []).find(t => t.id === trackId);
        if (!track) return;
        await commitEdit('Center Pan', () => { track.pan = 0; });
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

  // Timeline Lane Mouse Selection, Dragging, Edge Trimming & Take Context Menu
  listEl.querySelectorAll('[data-lane-track]').forEach(lane => {
    const trackId = lane.dataset.laneTrack;

    lane.addEventListener('mousemove', (ev) => {
      if (timelineDragState) return;
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;
      const hit = hitTestLaneClip(track, lane, ev.clientX);
      if (!hit) lane.style.cursor = 'crosshair';
      else if (hit.zone === 'left-edge' || hit.zone === 'right-edge') lane.style.cursor = 'ew-resize';
      else lane.style.cursor = 'grab';
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
        const isModifier = ev.ctrlKey || ev.metaKey || ev.shiftKey;
        if (!isModifier && selectedClipIds.has(hit.clip.id) && hit.zone === 'body') {
          anchorClipId = hit.clip.id;
        } else {
          const next = DE.applyClipClickSelection(currentProject, selectedClipIds, anchorClipId, hit.clip.id, ev);
          selectedClipIds = next.selectedClipIds;
          anchorClipId = next.anchorClipId;
          if (!isModifier) {
            selectedTrackIds = new Set([track.id]);
            anchorTrackId = track.id;
          } else {
            selectedTrackIds.add(track.id);
          }
        }
        if (selectedTrackId !== null) selectedTrackId = track.id;

        if (hit.zone === 'body') {
          const initialStarts = new Map();
          for (const tr of tracks) {
            for (const c of (tr.clips || [])) {
              if (selectedClipIds.has(c.id)) initialStarts.set(c.id, Number(c.startSec) || 0);
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
            initialStarts,
          };
        } else {
          timelineDragState = {
            mode: hit.zone === 'left-edge' ? 'left' : 'right',
            trackId: track.id,
            clipId: hit.clip.id,
            startX: ev.clientX,
            laneWidth: Math.max(1, rect.width),
            totalSec,
            pushedUndo: false,
            initialClip: DE.cloneDeep(hit.clip),
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
        if (!selectedClipIds.has(hit.clip.id)) {
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
      const edgeZonePx = Math.min(8, Math.max(4, clipW * 0.18));
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
    historyStack.pushSnapshot(
      currentProject,
      timelineDragState.mode === 'move' ? 'Move Take(s)' : 'Trim Take Edge'
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
    DE.moveClipsByDelta(currentProject, selectedClipIds, deltaSec);
  } else {
    const found = DE.findClipWithTrack(currentProject, timelineDragState.clipId);
    if (found) {
      Object.assign(found.clip, DE.cloneDeep(timelineDragState.initialClip));
      DE.trimClipEdge(found.clip, timelineDragState.mode, deltaSec);
    }
  }
  markDirty(true);
  drawAllTimelineCanvases();
}

async function handleGlobalTimelineMouseUp() {
  if (!timelineDragState) return;
  const didEdit = timelineDragState.pushedUndo;
  timelineDragState = null;
  if (didEdit) {
    renderStudio();
    await syncProjectToMain();
  }
}

function drawAllTimelineCanvases() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  const totalSec = getTimelineDurationSec();
  const bpm = Number(currentProject.bpm) || 120;
  const secPerBeat = 60 / bpm;

  // 1. Ruler Canvas
  const ruler = document.getElementById('timeline-ruler-canvas');
  if (ruler) {
    const w = ruler.clientWidth || 640;
    const h = 28;
    if (ruler.width !== w) ruler.width = w;
    const ctx = ruler.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d13';
    ctx.fillRect(0, 0, w, h);

    ctx.font = '10.5px ui-monospace, monospace';
    const stepSec = totalSec <= 8 ? 0.5 : (totalSec <= 24 ? 1 : 2);
    for (let s = 0; s <= totalSec + 0.001; s += stepSec) {
      const x = Math.round((s / totalSec) * w);
      const isMajor = Math.abs(s % (stepSec * 2)) < 0.01;
      ctx.strokeStyle = isMajor ? '#334155' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? 10 : 18);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (isMajor && x < w - 30) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${Number(s.toFixed(1))}s`, x + 3, 12);
      }
    }

    // Playhead triangle
    const px = Math.round((playheadSec / totalSec) * w);
    if (px >= -6 && px <= w + 6) {
      ctx.fillStyle = '#00bcd4';
      ctx.beginPath();
      ctx.moveTo(px - 5, 0);
      ctx.lineTo(px + 5, 0);
      ctx.lineTo(px, 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // 2. Per-Track Waveform + Transient Canvases
  for (const track of (currentProject.tracks || [])) {
    const canvas = document.getElementById(`wave-canvas-${track.id}`);
    if (!canvas) continue;
    const w = canvas.clientWidth || 640;
    const h = 102;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    // Subtle beat gridlines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    for (let t = 0; t <= totalSec; t += secPerBeat * 2) {
      const x = Math.round((t / totalSec) * w);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Center zero-crossing line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const trackGainDb = Number(track.gainDb) || 0;

    // Draw recorded clips
    for (const clip of (track.clips || [])) {
      const startX = (Number(clip.startSec || 0) / totalSec) * w;
      const clipW = Math.max(8, (Number(clip.durationSec || 1) / totalSec) * w);
      if (startX > w + 4 || startX + clipW < -4) continue;

      const isClipSel = selectedClipIds.has(clip.id);
      const isMuted = Boolean(clip.muted);
      const clipGainDb = Number(clip.gainDb) || 0;
      const totalGainLinear = DE.dbToGain(trackGainDb + clipGainDb);

      ctx.save();
      if (isMuted) ctx.globalAlpha = 0.42;

      ctx.fillStyle = isClipSel ? 'rgba(14, 48, 68, 0.95)' : 'rgba(22, 34, 49, 0.92)';
      ctx.strokeStyle = isClipSel ? '#f8fafc' : (track.color || '#00bcd4');
      ctx.lineWidth = isClipSel ? 2.0 : 1.2;
      ctx.fillRect(startX, 5, clipW, h - 10);
      ctx.strokeRect(startX, 5, clipW, h - 10);

      // Header bar tint
      ctx.fillStyle = isClipSel ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.55)';
      ctx.fillRect(startX + 1, 6, Math.max(2, clipW - 2), 16);

      // Peaks envelope scaled live by Track Gain + Take Gain!
      const peaks = Array.isArray(clip.peaks) ? clip.peaks : [];
      if (peaks.length) {
        ctx.fillStyle = isMuted ? '#64748b' : (track.color || '#00bcd4');
        const stepX = clipW / peaks.length;
        const barW = Math.max(1, stepX - 0.35);
        const midY = h / 2 + 6;
        const maxAmpH = (h - 32) / 2;
        for (let i = 0; i < peaks.length; i++) {
          const amp = Math.max(0.025, Math.min(1, peaks[i] * 1.35 * totalGainLinear));
          const bh = amp * maxAmpH;
          ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
        }
      }

      // Fade-in & Fade-out visual envelopes
      const durSec = Math.max(0.05, Number(clip.durationSec) || 1);
      const fadeInPx = Math.min(clipW * 0.5, ((Number(clip.fadeInSec) || 0) / durSec) * clipW);
      const fadeOutPx = Math.min(clipW * 0.5, ((Number(clip.fadeOutSec) || 0) / durSec) * clipW);
      if (fadeInPx > 2) {
        ctx.fillStyle = 'rgba(9, 13, 19, 0.55)';
        ctx.beginPath();
        ctx.moveTo(startX, 5);
        ctx.lineTo(startX + fadeInPx, 5);
        ctx.lineTo(startX, h - 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(startX, h - 5);
        ctx.lineTo(startX + fadeInPx, 5);
        ctx.stroke();
      }
      if (fadeOutPx > 2) {
        const endX = startX + clipW;
        ctx.fillStyle = 'rgba(9, 13, 19, 0.55)';
        ctx.beginPath();
        ctx.moveTo(endX, 5);
        ctx.lineTo(endX - fadeOutPx, 5);
        ctx.lineTo(endX, h - 5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(endX - fadeOutPx, 5);
        ctx.lineTo(endX, h - 5);
        ctx.stroke();
      }

      // Transient Drum Replacement Markers (▼)
      if (track.soundReplacement?.enabled && Array.isArray(clip.transients) && !isMuted) {
        for (const hit of clip.transients) {
          const hx = startX + ((Number(hit.timeSec) || 0) / durSec) * clipW;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hx, 22);
          ctx.lineTo(hx, h - 6);
          ctx.stroke();

          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.moveTo(hx - 4, 22);
          ctx.lineTo(hx + 4, 22);
          ctx.lineTo(hx, 28);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Edge trim handles on selected clips
      if (isClipSel && clipW > 20) {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(startX + 1, h / 2 - 10, 3, 20);
        ctx.fillRect(startX + clipW - 4, h / 2 - 10, 3, 20);
      }

      // Clip title + gain + stats
      ctx.fillStyle = isClipSel ? '#ffffff' : '#e2e8f0';
      ctx.font = '600 10.5px -apple-system, sans-serif';
      const muteTag = isMuted ? '[MUTED] ' : '';
      const gainTag = Math.abs(clipGainDb) >= 0.05 ? ` · ${DE.formatDb(clipGainDb)}` : '';
      const hitNote = track.soundReplacement?.enabled && clip.transients?.length
        ? ` · 🥁 ${clip.transients.length} hits`
        : '';
      ctx.save();
      ctx.beginPath();
      ctx.rect(startX + 3, 5, Math.max(4, clipW - 6), 18);
      ctx.clip();
      ctx.fillText(
        `${muteTag}${clip.name || 'Take'} (${Number(clip.durationSec || 0).toFixed(1)}s, ${clip.peakDb ?? '—'} dB${gainTag}${hitNote})`,
        startX + 6,
        17
      );
      ctx.restore();
      ctx.restore();
    }

    // Live Recording region preview
    if (isRecording && track.armed) {
      const recStart = (playheadSec / totalSec) * w;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(recStart, 5, Math.max(16, 48), h - 10);
      ctx.fillStyle = '#fca5a5';
      ctx.font = '700 11px ui-monospace, monospace';
      ctx.fillText('● RECORDING LIVE…', recStart + 6, h / 2 + 4);
    }

    // Playhead line
    const px = Math.round((playheadSec / totalSec) * w);
    if (px >= 0 && px <= w) {
      ctx.strokeStyle = '#00bcd4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
      ctx.stroke();
    }
  }
}

function renderInspectorDrawer() {
  const drawer = document.getElementById('track-inspector-drawer');
  if (!drawer) return;
  const track = (currentProject?.tracks || []).find(t => t.id === selectedTrackId);
  if (!track) {
    drawer.classList.add('hidden');
    return;
  }
  drawer.classList.remove('hidden');

  const eq = track.fx?.eq || {};
  const comp = track.fx?.compressor || {};
  const sr = track.soundReplacement || {};
  const kits = drumkitsStatus?.kits || [];
  const activeKit = kits.find(k => k.id === sr.kitId) || kits[0];
  const piecesObj = activeKit?.pieces || {};

  const kitOpts = kits.map(k =>
    `<option value="${esc(k.id)}"${k.id === sr.kitId ? ' selected' : ''}>${esc(k.name)} ${k.installed ? '✓' : '(Install)'}</option>`
  ).join('');
  const pieceOpts = Object.values(piecesObj).map(p =>
    `<option value="${esc(p.id)}"${p.id === sr.pieceId ? ' selected' : ''}>${esc(p.label)}</option>`
  ).join('');

  const totalTransients = (track.clips || []).reduce((n, c) => n + (c.transients?.length || 0), 0);
  const gainDb = Number(track.gainDb) || 0;

  drawer.innerHTML = `
    <div class="inspector-top">
      <div>
        <strong>🎛️ Channel Strip &amp; Sound Replacement Inspector — ${esc(track.name)}</strong>
        <span class="hint" style="margin-left:10px;">Input: ${esc(track.inputLabel)} · Plugins: ${(track.fx?.openSourcePlugins || []).map(esc).join(' → ')}</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-sm" id="btn-insp-norm-gain" title="Auto-normalize Track Input Gain so peak hits -6 dBFS">⚡ Auto-Gain (-6 dB)</button>
        <button type="button" class="btn btn-sm" id="btn-insp-clear-clips">Clear Takes (${track.clips?.length || 0})</button>
        <button type="button" class="btn btn-sm" id="btn-insp-close">Close</button>
      </div>
    </div>

    <div class="inspector-grid">
      <div>
        <div class="mini-heading">Input Trim, Polarity, Parametric EQ &amp; Dynamics</div>
        <div class="dsp-sliders">
          <div class="slider-row">
            <label>Input Gain (${DE.formatDb(gainDb)})</label>
            <input type="checkbox" id="insp-phase-on" title="180° Phase Invert (Ø)" ${track.fx?.phaseInvert ? 'checked' : ''} />
            <input type="range" id="insp-gain-db" min="-24" max="24" step="0.5" value="${gainDb}" />
          </div>
          <div class="slider-row">
            <label>High-Pass (${eq.hpfHz || 60} Hz)</label>
            <input type="checkbox" id="insp-eq-on" ${eq.enabled !== false ? 'checked' : ''} />
            <input type="range" id="insp-eq-hpf" min="20" max="320" step="5" value="${eq.hpfHz || 60}" />
          </div>
          <div class="slider-row">
            <label>Low Shelf (${eq.lowGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" id="insp-eq-low" min="-12" max="12" step="0.5" value="${eq.lowGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Mid Peak (${eq.midGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" id="insp-eq-mid" min="-12" max="12" step="0.5" value="${eq.midGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>High Air (${eq.highGainDb ?? 0} dB)</label>
            <span></span>
            <input type="range" id="insp-eq-high" min="-12" max="12" step="0.5" value="${eq.highGainDb ?? 0}" />
          </div>
          <div class="slider-row">
            <label>Compressor (${comp.ratio ?? 3.5}:1)</label>
            <input type="checkbox" id="insp-comp-on" ${comp.enabled !== false ? 'checked' : ''} />
            <input type="range" id="insp-comp-ratio" min="1" max="10" step="0.5" value="${comp.ratio ?? 3.5}" />
          </div>
          <div class="slider-row">
            <label>Stereo Pan (${formatPan(track.pan)})</label>
            <span></span>
            <input type="range" id="insp-pan" min="-1" max="1" step="0.05" value="${track.pan || 0}" />
          </div>
        </div>
      </div>

      <div>
        <div class="sr-card-header" style="margin-bottom:8px;">
          <div>
            <div class="mini-heading" style="margin:0;">🥁 Open-Source Drum Sound Replacement</div>
            <span class="hint">${totalTransients} detected transient hit(s) across recorded clips</span>
          </div>
          <label class="toggle-pill">
            <input type="checkbox" id="insp-sr-on" ${sr.enabled ? 'checked' : ''} />
            <span>${sr.enabled ? 'ENABLED' : 'OFF'}</span>
          </label>
        </div>

        <div class="form-row">
          <label>Open-Source Drum Kit</label>
          <select id="insp-sr-kit" class="select">${kitOpts}</select>
        </div>
        <div class="form-row">
          <label>Replacement Drum Piece</label>
          <div class="control-inline">
            <select id="insp-sr-piece" class="select">${pieceOpts}</select>
            <button type="button" class="btn btn-sm" id="btn-insp-audition">🔊 Audition</button>
          </div>
        </div>
        <div class="dsp-sliders">
          <div class="slider-row">
            <label>Trigger Thresh (${sr.thresholdDb ?? -28} dB)</label>
            <span></span>
            <input type="range" id="insp-sr-thresh" min="-48" max="-8" step="1" value="${sr.thresholdDb ?? -28}" />
          </div>
          <div class="slider-row">
            <label>Replaced Blend (${Math.round((sr.blend ?? 0.75) * 100)}%)</label>
            <span></span>
            <input type="range" id="insp-sr-blend" min="0" max="100" step="5" value="${Math.round((sr.blend ?? 0.75) * 100)}" />
          </div>
        </div>
      </div>
    </div>
  `;

  const saveInspectorPatch = async (label, mutator, reanalyze = false) => {
    await commitEdit(label, mutator, { reanalyzeTrackIds: reanalyze ? [track.id] : [] });
  };

  document.getElementById('btn-insp-close')?.addEventListener('click', () => {
    selectedTrackId = null;
    drawer.classList.add('hidden');
    renderStudio();
  });
  document.getElementById('btn-insp-norm-gain')?.addEventListener('click', async () => {
    await commitEdit('Auto-Normalize Track Gain', () => {
      DE.normalizeTrackGain(track, -6.0);
    }, { statusMsg: `⚡ Normalized "${track.name}" gain to ${DE.formatDb(track.gainDb)} (-6 dBFS target)` });
  });
  document.getElementById('btn-insp-clear-clips')?.addEventListener('click', async () => {
    await commitEdit('Clear Track Takes', () => {
      track.clips = [];
    });
  });
  document.getElementById('btn-insp-audition')?.addEventListener('click', () => {
    auditionDrumPiece(
      document.getElementById('insp-sr-kit')?.value || sr.kitId,
      document.getElementById('insp-sr-piece')?.value || sr.pieceId
    );
  });

  document.getElementById('insp-gain-db')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Input Gain', () => { track.gainDb = DE.clamp(-24, 24, Number(e.target.value) || 0); })
  );
  document.getElementById('insp-phase-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Phase Invert', () => { track.fx = { ...(track.fx || {}), phaseInvert: e.target.checked }; })
  );
  document.getElementById('insp-eq-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle EQ', () => { track.fx.eq = { ...(track.fx?.eq || {}), enabled: e.target.checked }; })
  );
  document.getElementById('insp-eq-hpf')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust HPF', () => { track.fx.eq = { ...(track.fx?.eq || {}), hpfHz: Number(e.target.value) }; })
  );
  document.getElementById('insp-eq-low')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Low Shelf', () => { track.fx.eq = { ...(track.fx?.eq || {}), lowGainDb: Number(e.target.value) }; })
  );
  document.getElementById('insp-eq-mid')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Mid EQ', () => { track.fx.eq = { ...(track.fx?.eq || {}), midGainDb: Number(e.target.value) }; })
  );
  document.getElementById('insp-eq-high')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust High EQ', () => { track.fx.eq = { ...(track.fx?.eq || {}), highGainDb: Number(e.target.value) }; })
  );
  document.getElementById('insp-comp-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Compressor', () => { track.fx.compressor = { ...(track.fx?.compressor || {}), enabled: e.target.checked }; })
  );
  document.getElementById('insp-comp-ratio')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Compressor Ratio', () => { track.fx.compressor = { ...(track.fx?.compressor || {}), ratio: Number(e.target.value) }; })
  );
  document.getElementById('insp-pan')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Pan', () => { track.pan = Number(e.target.value); })
  );

  document.getElementById('insp-sr-on')?.addEventListener('change', e =>
    saveInspectorPatch('Toggle Sound Replacement', () => {
      track.soundReplacement = { ...(track.soundReplacement || {}), enabled: e.target.checked, supported: true };
    }, true)
  );
  document.getElementById('insp-sr-kit')?.addEventListener('change', e => {
    const chosenKit = (drumkitsStatus.kits || []).find(k => k.id === e.target.value);
    const firstPiece = chosenKit ? Object.keys(chosenKit.pieces || {})[0] : 'snare';
    saveInspectorPatch('Select Drum Kit', () => {
      track.soundReplacement = {
        ...(track.soundReplacement || {}),
        kitId: e.target.value,
        pieceId: chosenKit?.pieces?.[sr.pieceId] ? sr.pieceId : firstPiece,
      };
    });
  });
  document.getElementById('insp-sr-piece')?.addEventListener('change', e =>
    saveInspectorPatch('Select Drum Piece', () => {
      track.soundReplacement = { ...(track.soundReplacement || {}), pieceId: e.target.value };
    })
  );
  document.getElementById('insp-sr-thresh')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Trigger Threshold', () => {
      track.soundReplacement = { ...(track.soundReplacement || {}), thresholdDb: Number(e.target.value) };
    }, true)
  );
  document.getElementById('insp-sr-blend')?.addEventListener('change', e =>
    saveInspectorPatch('Adjust Replacement Blend', () => {
      track.soundReplacement = { ...(track.soundReplacement || {}), blend: Number(e.target.value) / 100 };
    })
  );
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
  if (titleEl) titleEl.textContent = `✏️ ${title}`;
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
    showStatus('📄 Created new studio session.');
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
  showStatus(`➕ Added ${addedIds.length} armed audio track(s): ${labelSummary}${addedIds.length > 3 ? '…' : ''}`);
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
  }, { statusMsg: `● Armed ${cnt} selected track(s)` });
}

async function disarmSelectedTracks() {
  if (!currentProject || !selectedTrackIds.size) return;
  const cnt = selectedTrackIds.size;
  await commitEdit('Disarm Selected Track(s)', () => {
    DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'armed', false);
  }, { statusMsg: `○ Disarmed ${cnt} selected track(s)` });
}

async function armAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) {
    showStatus('No tracks in session yet — press Ctrl+T or "+ Track" first.', true);
    return;
  }
  await commitEdit('Arm All Tracks', () => {
    DE.setTracksPropertyBatch(currentProject, 'all', 'armed', true);
  }, { statusMsg: `● Armed all ${currentProject.tracks.length} studio tracks for recording` });
}

async function disarmAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  await commitEdit('Disarm All Tracks', () => {
    DE.setTracksPropertyBatch(currentProject, 'all', 'armed', false);
  }, { statusMsg: `○ Disarmed all ${currentProject.tracks.length} tracks` });
}

async function removeSelectedTracks() {
  if (!currentProject || !selectedTrackIds.size) {
    showStatus('Check or select one or more tracks first to remove them.', true);
    return;
  }
  const cnt = selectedTrackIds.size;
  await commitEdit('Remove Selected Track(s)', () => {
    DE.deleteTracksFromProject(currentProject, selectedTrackIds);
  }, { statusMsg: `🗑️ Removed ${cnt} track(s) (Press Ctrl+Z to Undo)` });
}

async function removeAllTracks() {
  if (!currentProject || !(currentProject.tracks || []).length) return;
  const total = currentProject.tracks.length;
  await commitEdit('Remove All Tracks', () => {
    currentProject.tracks = [];
  }, { statusMsg: `🗑️ Removed all ${total} tracks from session (Press Ctrl+Z to Undo)` });
}

function editSelectAllTracksOnly() {
  if (!currentProject) return;
  const res = DE.selectAllTracksOnly(currentProject);
  selectedTrackIds = res.selectedTrackIds;
  selectedClipIds = res.selectedClipIds;
  anchorClipId = null;
  anchorTrackId = currentProject.tracks?.[0]?.id || null;
  renderStudio();
  showStatus(`☑ Selected all ${selectedTrackIds.size} track(s) (takes deselected — ready for batch track actions)`);
}

function editSelectAllClipsOnly() {
  if (!currentProject) return;
  const res = DE.selectAllClipsOnly(currentProject);
  selectedTrackIds = res.selectedTrackIds;
  selectedClipIds = res.selectedClipIds;
  anchorTrackId = null;
  renderStudio();
  showStatus(`🎞️ Selected all ${selectedClipIds.size} take(s) across timeline`);
}

function editInvertTrackSelection() {
  if (!currentProject) return;
  selectedClipIds.clear();
  selectedTrackIds = DE.invertTrackSelection(currentProject, selectedTrackIds);
  anchorTrackId = [...selectedTrackIds][0] || null;
  renderStudio();
  showStatus(`⇄ Inverted track selection (${selectedTrackIds.size} track(s) selected)`);
}

async function editTrimToPlayhead(edge /* 'left' | 'right' */) {
  if (!currentProject) return;
  let trimmed = 0;
  await commitEdit(edge === 'left' ? 'Trim Start to Playhead' : 'Trim End to Playhead', () => {
    trimmed = DE.trimClipsToPlayhead(currentProject, selectedClipIds, edge, playheadSec);
  });
  if (trimmed > 0) {
    showStatus(`✂️ Trimmed ${trimmed} take(s) ${edge === 'left' ? 'start' : 'end'} to playhead (${formatTimecode(playheadSec)})`);
  } else {
    showStatus('Place playhead inside a selected take before trimming ([ or ]).', true);
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
  showStatus(`📥 Imported ${(res.importedClipIds || []).length} WAV file(s) at ${formatTimecode(startSec)}`);
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

  showStatus('⏳ Rendering full stereo mixdown WAV (EQ + Compressor + Drum Sound Replacement)…');
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
      showStatus(`💿 Exported stereo 48kHz 16-bit WAV mixdown (${renderSpanSec.toFixed(1)}s) → ${res.filePath}`);
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
  const hasTracks = tracks.length > 0;
  const hasClips = tracks.some(t => (t.clips || []).length > 0);
  const primaryTrack = tracks.find(t => selectedTrackIds.has(t.id)) || tracks[0] || null;
  const primaryIdx = primaryTrack ? tracks.findIndex(t => t.id === primaryTrack.id) : -1;

  if (key === 'file') {
    return [
      { label: '📄 New Studio Session', kbd: 'Ctrl+N', run: () => createNewSession() },
      { label: '📂 Open Saved Session…', kbd: 'Ctrl+O', run: () => openProjectModal() },
      { sep: true },
      { label: '💾 Save Session', kbd: 'Ctrl+S', run: () => saveCurrentSession(false) },
      { label: '💾 Save Session As…', kbd: 'Ctrl+Shift+S', run: () => saveCurrentSession(true) },
      { sep: true },
      { label: '📥 Import Audio WAV File(s)…', kbd: 'Ctrl+Shift+I', run: () => importAudioWavFiles() },
      { label: '💿 Export Stereo Mixdown (.wav)…', kbd: 'Ctrl+Shift+E', disabled: !hasClips, run: () => exportSessionMixdownWav() },
      { label: '📁 Reveal Session Audio Folder', kbd: '', run: async () => {
        const res = await window.robos.openSessionFolder();
        if (res?.ok) showStatus(`📁 Opened ${res.folder}`);
      } },
      { sep: true },
      { label: '🎛️ Audio Device Preferences', kbd: 'Ctrl+,', run: () => switchView('audio-devices') },
    ];
  }

  if (key === 'edit') {
    const undoLbl = historyStack.undoStack[historyStack.undoStack.length - 1]?.label;
    const redoLbl = historyStack.redoStack[historyStack.redoStack.length - 1]?.label;
    return [
      { label: `↩ Undo${undoLbl ? ` (${undoLbl})` : ''}`, kbd: 'Ctrl+Z', disabled: !historyStack.canUndo(), run: () => performUndo() },
      { label: `↪ Redo${redoLbl ? ` (${redoLbl})` : ''}`, kbd: 'Ctrl+Y', disabled: !historyStack.canRedo(), run: () => performRedo() },
      { sep: true },
      { label: '✂️ Cut Take(s)', kbd: 'Ctrl+X', disabled: cCnt === 0, run: () => editCutSelected() },
      { label: '📋 Copy Take(s)', kbd: 'Ctrl+C', disabled: cCnt === 0, run: () => editCopySelected() },
      { label: '📋 Paste Take(s) at Playhead', kbd: 'Ctrl+V', disabled: !clipClipboard, run: () => editPasteAtPlayhead() },
      { label: '📑 Duplicate Selected', kbd: 'Ctrl+D', disabled: cCnt === 0 && tCnt === 0, run: () => editDuplicateSelected() },
      { label: '✂️ Split Take(s) at Playhead', kbd: 'S', disabled: !hasClips, run: () => editSplitSelectedOrPlayhead() },
      { label: '🗑️ Delete Selected', kbd: 'Del', disabled: cCnt === 0 && tCnt === 0, danger: true, run: () => editDeleteSelected() },
      { sep: true },
      { label: '▣ Select All (Tracks & Takes)', kbd: 'Ctrl+A', disabled: !hasTracks, run: () => editSelectAll() },
      { label: '☑ Select All Tracks Only', kbd: 'Ctrl+Shift+A', disabled: !hasTracks, run: () => editSelectAllTracksOnly() },
      { label: '🎞️ Select All Takes Only', kbd: '', disabled: !hasClips, run: () => editSelectAllClipsOnly() },
      { label: '⇄ Invert Track Selection', kbd: '', disabled: !hasTracks, run: () => editInvertTrackSelection() },
      { label: '⬜ Deselect All', kbd: 'Esc', disabled: cCnt === 0 && tCnt === 0, run: () => {
        selectedClipIds.clear();
        selectedTrackIds.clear();
        renderStudio();
      } },
      { sep: true },
      { label: `${snapToGrid ? '✓ ' : ''}🧲 Snap Edits to Beat Grid`, kbd: 'G', run: () => {
        snapToGrid = !snapToGrid;
        updateEditToolbarState();
        showStatus(`🧲 Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
      } },
    ];
  }

  if (key === 'track') {
    return [
      { label: '➕ Add Blank Audio Track', kbd: 'Ctrl+T', run: () => addBlankAudioTracks(1) },
      { label: '➕ Add 4 Audio Tracks (Sequential Inputs)', kbd: 'Ctrl+Shift+T', run: () => addBlankAudioTracks(4) },
      { label: '➕ Add 8 Audio Tracks (8-Preamp Bank)', kbd: '', run: () => addBlankAudioTracks(8) },
      { label: '🎙️ Add Mic via Studio Wizard…', kbd: '', run: () => openAddMicWizard() },
      { label: '🥁 DrumSet AI All-Mic Soundcheck…', kbd: '', run: () => openDrumsetWizard() },
      { sep: true },
      { label: `● Arm Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: 'Shift+R', disabled: tCnt === 0, run: () => armSelectedTracks() },
      { label: `○ Disarm Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: '', disabled: tCnt === 0, run: () => disarmSelectedTracks() },
      { label: `● Arm All Tracks (${tracks.length})`, kbd: 'Ctrl+Alt+R', disabled: !hasTracks, run: () => armAllTracks() },
      { label: '○ Disarm All Tracks', kbd: '', disabled: !hasTracks, run: () => disarmAllTracks() },
      { sep: true },
      { label: '🔇 Mute / Unmute Selected Track(s)', kbd: 'M', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = first ? !first.muted : true;
        await commitEdit('Mute/Unmute Selected Tracks', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'muted', nextVal);
        });
      } },
      { label: '🔊 Unmute All Tracks', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Unmute All Tracks', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'muted', false); });
      } },
      { label: '🎧 Solo / Unsolo Selected Track(s)', kbd: 'Shift+S', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = first ? !first.soloed : true;
        await commitEdit('Solo/Unsolo Selected Tracks', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'soloed', nextVal);
        });
      } },
      { label: '🎧 Clear All Solos', kbd: 'Ctrl+Alt+S', disabled: !tracks.some(t => t.soloed), run: async () => {
        await commitEdit('Clear All Solos', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'soloed', false); });
      } },
      { label: 'Ø Invert 180° Phase on Selected', kbd: '', disabled: tCnt === 0, run: async () => {
        const first = tracks.find(t => selectedTrackIds.has(t.id));
        const nextVal = !first?.fx?.phaseInvert;
        await commitEdit('Toggle Phase Invert', () => {
          DE.setTracksPropertyBatch(currentProject, selectedTrackIds, 'phaseInvert', nextVal);
        });
      } },
      { sep: true },
      { label: '✏️ Rename Selected Track…', kbd: 'F2', disabled: tCnt === 0, run: () => {
        inlineRenamingTrackId = [...selectedTrackIds][0];
        renderStudio();
      } },
      { label: '📑 Duplicate Selected Track(s) (with Takes)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Duplicate Track(s)', () => {
          selectedTrackIds = new Set(DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: true }));
        });
      } },
      { label: '📄 Duplicate Selected Track Setup (Empty)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Duplicate Empty Track(s)', () => {
          selectedTrackIds = new Set(DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: false }));
        });
      } },
      { label: '↑ Move Selected Track Up', kbd: 'Alt+↑', disabled: !primaryTrack || primaryIdx <= 0, run: async () => {
        await commitEdit('Move Track Up', () => { DE.reorderTrackInProject(currentProject, primaryTrack.id, -1); });
      } },
      { label: '↓ Move Selected Track Down', kbd: 'Alt+↓', disabled: !primaryTrack || primaryIdx >= tracks.length - 1, run: async () => {
        await commitEdit('Move Track Down', () => { DE.reorderTrackInProject(currentProject, primaryTrack.id, 1); });
      } },
      { label: '⚡ Auto-Normalize Selected Track Gain (-6 dBFS)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Auto-Normalize Track Gain', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) DE.normalizeTrackGain(t, -6.0);
        });
      } },
      { label: '🧹 Clear Recorded Takes on Selected Track(s)', kbd: '', disabled: tCnt === 0, run: async () => {
        await commitEdit('Clear Track Takes', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) t.clips = [];
        });
      } },
      { sep: true },
      { label: `🗑️ Remove Selected Track(s)${tCnt ? ` (${tCnt})` : ''}`, kbd: 'Shift+Del', disabled: tCnt === 0, danger: true, run: () => removeSelectedTracks() },
      { label: `⚠️ Remove All Tracks (${tracks.length})`, kbd: '', disabled: !hasTracks, danger: true, run: () => removeAllTracks() },
    ];
  }

  if (key === 'clip') {
    const forSelClips = (fn) => {
      for (const tr of tracks) for (const c of (tr.clips || [])) if (selectedClipIds.has(c.id)) fn(c, tr);
    };
    return [
      { label: '✂️ Split Take(s) at Playhead', kbd: 'S', disabled: !hasClips, run: () => editSplitSelectedOrPlayhead() },
      { label: '⇥ Trim Start to Playhead', kbd: '[', disabled: !hasClips, run: () => editTrimToPlayhead('left') },
      { label: '⇤ Trim End to Playhead', kbd: ']', disabled: !hasClips, run: () => editTrimToPlayhead('right') },
      { sep: true },
      { label: '🔇 Mute / Unmute Selected Take(s)', kbd: 'M', disabled: cCnt === 0, run: async () => {
        let nextM = null;
        await commitEdit('Mute/Unmute Take(s)', () => {
          forSelClips((c) => { if (nextM === null) nextM = !c.muted; c.muted = nextM; });
        });
      } },
      { label: '⚡ Normalize Take Gain (-3 dBFS)', kbd: '', disabled: cCnt === 0, run: async () => {
        await commitEdit('Normalize Take Gain', () => { forSelClips(c => DE.normalizeClipGain(c, -3.0)); }, { statusMsg: '⚡ Normalized selected take(s) to -3.0 dBFS' });
      } },
      { label: '🎚️ Reset Take Gain (0.0 dB)', kbd: '', disabled: cCnt === 0, run: async () => {
        await commitEdit('Reset Take Gain', () => { forSelClips(c => { c.gainDb = 0; }); });
      } },
      { label: '🌊 Apply 15 ms De-Click Fades', kbd: '', disabled: cCnt === 0, run: async () => {
        await commitEdit('Apply 15ms De-Click Fades', () => {
          forSelClips(c => {
            const maxF = Math.max(0.01, (Number(c.durationSec) || 0.1) * 0.45);
            c.fadeInSec = Math.min(maxF, 0.015);
            c.fadeOutSec = Math.min(maxF, 0.015);
          });
        });
      } },
      { label: '🌊 Clear Take Fades (0 ms)', kbd: '', disabled: cCnt === 0, run: async () => {
        await commitEdit('Clear Take Fades', () => { forSelClips(c => { c.fadeInSec = 0; c.fadeOutSec = 0; }); });
      } },
      { sep: true },
      { label: '← Nudge Selected Take(s) Left (-50 ms)', kbd: 'Ctrl+←', disabled: cCnt === 0, run: async () => {
        await commitEdit('Nudge Take Left', () => { DE.moveClipsByDelta(currentProject, selectedClipIds, -0.05); });
      } },
      { label: '→ Nudge Selected Take(s) Right (+50 ms)', kbd: 'Ctrl+→', disabled: cCnt === 0, run: async () => {
        await commitEdit('Nudge Take Right', () => { DE.moveClipsByDelta(currentProject, selectedClipIds, 0.05); });
      } },
      { label: '⇥ Move Start to Playhead', kbd: '', disabled: cCnt === 0, run: async () => {
        let minS = Infinity;
        forSelClips(c => { if ((Number(c.startSec) || 0) < minS) minS = Number(c.startSec) || 0; });
        if (Number.isFinite(minS)) {
          await commitEdit('Move Take(s) to Playhead', () => { DE.moveClipsByDelta(currentProject, selectedClipIds, playheadSec - minS); });
        }
      } },
      { label: '⏮ Snap Start to 00:00.00', kbd: '', disabled: cCnt === 0, run: async () => {
        let minS = Infinity;
        forSelClips(c => { if ((Number(c.startSec) || 0) < minS) minS = Number(c.startSec) || 0; });
        if (Number.isFinite(minS)) {
          await commitEdit('Snap Take(s) to 00:00.00', () => { DE.moveClipsByDelta(currentProject, selectedClipIds, -minS); });
        }
      } },
      { label: '🥁 Re-Detect Drum Transients', kbd: '', disabled: cCnt === 0, run: async () => {
        const trIds = new Set();
        forSelClips((_c, tr) => trIds.add(tr.id));
        await commitEdit('Re-Detect Drum Transients', () => {}, { reanalyzeTrackIds: [...trIds] });
      } },
      { label: '✏️ Rename Take…', kbd: 'F2', disabled: cCnt !== 1, run: () => editRenameFocused() },
      { sep: true },
      { label: `🗑️ Delete Selected Take(s)${cCnt ? ` (${cCnt})` : ''}`, kbd: 'Del', disabled: cCnt === 0, danger: true, run: () => editDeleteSelected() },
    ];
  }

  if (key === 'transport') {
    const metroOn = currentProject?.metronome !== false;
    return [
      { label: isPlaying ? '⏹ Stop Playback' : '▶ Play Timeline', kbd: 'Space', run: () => startPlayback() },
      { label: isRecording ? '⏹ Stop Recording' : '● Record Armed Tracks', kbd: 'R', run: () => toggleRecording() },
      { label: '⏮ Rewind to 00:00.00', kbd: 'Home', run: () => {
        playheadSec = 0;
        document.getElementById('transport-timecode').textContent = formatTimecode(0);
        if (isPlaying) { stopPlayback(); startPlayback(); }
        else drawAllTimelineCanvases();
      } },
      { sep: true },
      { label: `${metroOn ? '✓ ' : ''}🔔 Metronome Click Track`, kbd: 'C', run: async () => {
        const res = await window.robos.updateProjectMeta({ metronome: !metroOn });
        if (res?.ok) { currentProject = res.project; renderStudio(); }
      } },
      { label: `${countInEnabled ? '✓ ' : ''}⏱️ 1-Bar Record Count-In (4 Clicks)`, kbd: '', run: () => {
        countInEnabled = !countInEnabled;
        showStatus(`⏱️ 1-Bar Record Count-In: ${countInEnabled ? 'ON' : 'OFF'}`);
      } },
      { label: `${loopPlayback ? '✓ ' : ''}🔁 Loop Timeline Playback`, kbd: 'L', run: () => {
        loopPlayback = !loopPlayback;
        updateEditToolbarState();
        showStatus(`🔁 Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
      } },
      { sep: true },
      { label: `🎵 Set Session Tempo / BPM (${currentProject?.bpm || 120} BPM)…`, kbd: '', run: () => {
        openRenameModal('Set Session Tempo', 'Tempo (40 – 280 BPM)', String(currentProject?.bpm || 120), async (val) => {
          const nextBpm = DE.clamp(40, 280, Math.round(Number(val) || 120));
          const res = await window.robos.updateProjectMeta({ bpm: nextBpm });
          if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); showStatus(`🎵 Set session tempo to ${nextBpm} BPM`); }
        });
      } },
    ];
  }

  if (key === 'mix') {
    return [
      { label: `${selectedTrackId ? '✓ ' : ''}🎛️ Toggle Channel Strip FX / EQ / Drum Inspector`, kbd: 'I', disabled: !hasTracks, run: () => {
        if (selectedTrackId) selectedTrackId = null;
        else selectedTrackId = primaryTrack?.id || null;
        renderStudio();
      } },
      { sep: true },
      { label: '🎚️ Reset All Track Input Gains (0.0 dB)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Reset All Track Gains', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'gainDb', 0); }, { statusMsg: '🎚️ Reset all track input gains to 0.0 dB' });
      } },
      { label: '🔊 Reset All Fader Volumes (100%)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Reset All Volumes', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'volume', 1.0); }, { statusMsg: '🔊 Reset all channel faders to unity (100%)' });
      } },
      { label: '⚖️ Center All Stereo Pans (C)', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Center All Pans', () => { DE.setTracksPropertyBatch(currentProject, 'all', 'pan', 0); }, { statusMsg: '⚖️ Centered all stereo pans' });
      } },
      { sep: true },
      { label: '🥁 Enable Drum Replacement on Selected Track(s)', kbd: '', disabled: tCnt === 0, run: async () => {
        const ids = [...selectedTrackIds];
        await commitEdit('Enable Drum Replacement', () => {
          for (const t of tracks) if (selectedTrackIds.has(t.id)) t.soundReplacement = { ...(t.soundReplacement || {}), enabled: true, supported: true };
        }, { reanalyzeTrackIds: ids });
      } },
      { label: '🥁 Disable All Drum Sound Replacement', kbd: '', disabled: !hasTracks, run: async () => {
        await commitEdit('Disable All Drum Replacement', () => {
          for (const t of tracks) t.soundReplacement = { ...(t.soundReplacement || {}), enabled: false };
        });
      } },
      { label: '📦 Manage Open-Source Drum Kits…', kbd: '', run: () => {
        renderDrumkitsModal();
        document.getElementById('drumkits-modal')?.classList.remove('hidden');
      } },
    ];
  }

  if (key === 'view') {
    const inStudio = !document.getElementById('view-studio-stage')?.classList.contains('hidden');
    return [
      { label: `${inStudio ? '● ' : ''}⏺ Recording Studio Timeline`, kbd: '1', run: () => switchView('studio-stage') },
      { label: `${!inStudio ? '● ' : ''}🎛️ Preferences → Audio Devices`, kbd: '2', run: () => switchView('audio-devices') },
      { sep: true },
      { label: '🔍 Zoom In Timeline', kbd: '+', run: () => setTimelineZoom(timelineZoom * 1.25) },
      { label: '🔎 Zoom Out Timeline', kbd: '-', run: () => setTimelineZoom(timelineZoom / 1.25) },
      { label: '📐 Zoom to Fit Session (100%)', kbd: 'Ctrl+0', run: () => setTimelineZoom(1.0) },
      { sep: true },
      { label: `${selectedTrackId ? '✓ ' : ''}🎛️ Show / Hide FX Inspector Drawer`, kbd: 'I', disabled: !hasTracks, run: () => {
        selectedTrackId = selectedTrackId ? null : (primaryTrack?.id || null);
        renderStudio();
      } },
    ];
  }

  if (key === 'help') {
    return [
      { label: '⌨️ Keyboard & Mouse Shortcuts Reference', kbd: '?', run: () => {
        document.getElementById('shortcuts-modal')?.classList.remove('hidden');
      } },
      { label: '↻ Rescan Focusrite USB & PipeWire Audio Bus', kbd: '', run: async () => {
        const snap = await window.robos.getAudioSnapshot();
        renderSnapshot(snap);
        renderStudio();
        showStatus(snap.focusrite?.connected ? `✓ Connected to ${snap.focusrite.model}` : 'Rescanned PipeWire bus.');
      } },
      { label: '🥁 Verify / Download Open-Source Drum Kits…', kbd: '', run: () => {
        renderDrumkitsModal();
        document.getElementById('drumkits-modal')?.classList.remove('hidden');
      } },
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
      <span>${esc(item.label)}</span>
      <span class="ctx-kbd">${esc(item.kbd || '')}</span>
    </button>`;
  }).join('');

  const rect = triggerEl.getBoundingClientRect();
  popup.classList.remove('hidden');
  popup.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - 280)))}px`;
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

function openEmptyRackContextMenu(ev) {
  const menu = document.getElementById('daw-context-menu');
  if (!menu) return;
  closeMenubarDropdown();
  const tracks = currentProject?.tracks || [];
  const tCnt = selectedTrackIds.size;

  menu.innerHTML = `
    <div class="ctx-header">
      <span>🎛️ Studio Track Rack (${tracks.length})</span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${tCnt} sel</span>
    </div>
    <button type="button" class="ctx-item" data-rack-ctx="add-1"><span>➕ Add Blank Audio Track</span><span class="ctx-kbd">Ctrl+T</span></button>
    <button type="button" class="ctx-item" data-rack-ctx="add-4"><span>➕ Add 4 Sequential Audio Tracks</span><span class="ctx-kbd">Ctrl+Shift+T</span></button>
    <button type="button" class="ctx-item" data-rack-ctx="add-8"><span>➕ Add 8 Sequential Audio Tracks</span><span></span></button>
    <button type="button" class="ctx-item" data-rack-ctx="wiz-mic"><span>🎙️ Add Mic via Studio Wizard…</span><span></span></button>
    <button type="button" class="ctx-item" data-rack-ctx="wiz-drumset"><span>🥁 DrumSet AI Soundcheck (Gemini)…</span><span></span></button>
    <button type="button" class="ctx-item" data-rack-ctx="import-wav"><span>📥 Import Audio WAV File(s)…</span><span class="ctx-kbd">Ctrl+Shift+I</span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-rack-ctx="sel-all-tracks" ${tracks.length ? '' : 'disabled'}><span>☑ Select All Tracks (${tracks.length})</span><span class="ctx-kbd">Ctrl+Shift+A</span></button>
    <button type="button" class="ctx-item" data-rack-ctx="arm-all" ${tracks.length ? '' : 'disabled'}><span>● Arm All Tracks</span><span class="ctx-kbd">Ctrl+Alt+R</span></button>
    <button type="button" class="ctx-item" data-rack-ctx="disarm-all" ${tracks.length ? '' : 'disabled'}><span>○ Disarm All Tracks</span><span></span></button>
    <button type="button" class="ctx-item" data-rack-ctx="unmute-all" ${tracks.length ? '' : 'disabled'}><span>🔊 Unmute All &amp; Clear Solos</span><span></span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item danger" data-rack-ctx="rem-sel" ${tCnt ? '' : 'disabled'}><span>🗑️ Remove Selected Track(s) (${tCnt})</span><span class="ctx-kbd">Shift+Del</span></button>
    <button type="button" class="ctx-item danger" data-rack-ctx="rem-all" ${tracks.length ? '' : 'disabled'}><span>⚠️ Remove All Tracks (${tracks.length})</span><span></span></button>
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
      <span>⏱️ Timeline @ ${formatTimecode(safeTime)}</span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${esc(track ? track.name : 'Ruler')}</span>
    </div>
    <button type="button" class="ctx-item" data-tl-ctx="move-ph"><span>⇥ Move Playhead Here (${formatTimecode(safeTime)})</span><span>Click</span></button>
    <button type="button" class="ctx-item" data-tl-ctx="play-here"><span>▶ Play From Here</span><span></span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-tl-ctx="paste-here" ${clipClipboard ? '' : 'disabled'}><span>📋 Paste Take(s) Here</span><span class="ctx-kbd">Ctrl+V</span></button>
    <button type="button" class="ctx-item" data-tl-ctx="import-here"><span>📥 Import Audio WAV Here…</span><span class="ctx-kbd">Ctrl+Shift+I</span></button>
    <button type="button" class="ctx-item" data-tl-ctx="split-all-here"><span>✂️ Split All Takes Crossing ${formatTimecode(safeTime)}</span><span></span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-tl-ctx="toggle-snap"><span>${snapToGrid ? '✓ ' : ''}🧲 Snap to Beat Grid</span><span class="ctx-kbd">G</span></button>
    <button type="button" class="ctx-item" data-tl-ctx="toggle-loop"><span>${loopPlayback ? '✓ ' : ''}🔁 Loop Timeline Playback</span><span class="ctx-kbd">L</span></button>
    <button type="button" class="ctx-item" data-tl-ctx="add-track"><span>➕ Add Blank Audio Track</span><span class="ctx-kbd">Ctrl+T</span></button>
    ${track ? `<button type="button" class="ctx-item" data-tl-ctx="track-menu"><span>🎙️ Open "${esc(track.name)}" Track Menu…</span><span>→</span></button>` : ''}
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
        }, { statusMsg: `📋 Pasted take(s) at ${formatTimecode(safeTime)}` });
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
        showStatus(cnt ? `✂️ Split ${cnt} take(s) at ${formatTimecode(safeTime)}` : 'No takes cross that timeline position.');
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
      <span>🎙️ ${esc(multiLabel)}</span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${DE.formatDb(Number(track.gainDb) || 0)}</span>
    </div>
    <button type="button" class="ctx-item" data-ctx="add-below"><span>➕ Add Blank Audio Track Below</span><span class="ctx-kbd">Ctrl+T</span></button>
    <button type="button" class="ctx-item" data-ctx="rename-track"><span>✏️ Rename Track…</span><span class="ctx-kbd">F2</span></button>
    <button type="button" class="ctx-item" data-ctx="reset-gain"><span>🎚️ Reset Input Gain (0.0 dB)</span><span class="ctx-kbd">DblClick</span></button>
    <button type="button" class="ctx-item" data-ctx="norm-gain"><span>⚡ Auto-Normalize Track Gain (-6 dBFS)</span><span></span></button>
    <button type="button" class="ctx-item" data-ctx="toggle-phase"><span>Ø ${track.fx?.phaseInvert ? 'Disable' : 'Enable'} 180° Phase Invert</span><span>${track.fx?.phaseInvert ? 'ON' : 'OFF'}</span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-ctx="toggle-arm"><span>● ${track.armed ? 'Disarm' : 'Arm'} Selected (${targetIds.size})</span><span class="ctx-kbd">Shift+R</span></button>
    <button type="button" class="ctx-item" data-ctx="arm-all"><span>● Arm All Tracks (${tracks.length})</span><span class="ctx-kbd">Ctrl+Alt+R</span></button>
    <button type="button" class="ctx-item" data-ctx="disarm-all"><span>○ Disarm All Tracks</span><span></span></button>
    <button type="button" class="ctx-item" data-ctx="exclusive-solo"><span>🎧 ${track.soloed && tracks.filter(t => t.soloed).length === 1 ? 'Unsolo All' : 'Exclusive Solo This Track'}</span><span class="ctx-kbd">Alt+Click</span></button>
    <button type="button" class="ctx-item" data-ctx="toggle-mute"><span>🔇 ${track.muted ? 'Unmute' : 'Mute'} Track${targetIds.size > 1 ? `s (${targetIds.size})` : ''}</span><span class="ctx-kbd">M</span></button>
    <button type="button" class="ctx-item" data-ctx="toggle-sr"><span>🥁 ${track.soundReplacement?.enabled ? 'Disable' : 'Enable'} Drum Replacement</span><span></span></button>
    <button type="button" class="ctx-item" data-ctx="open-fx"><span>🎛️ Open EQ / LV2 / Drum FX Inspector</span><span class="ctx-kbd">I</span></button>
    <div class="ctx-inline-row">
      <span class="ctx-inline-lbl">Track Color</span>
      <div class="ctx-pill-strip">${colorDots}</div>
    </div>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-ctx="select-all-tracks"><span>☑ Select All Tracks (${tracks.length})</span><span class="ctx-kbd">Ctrl+Shift+A</span></button>
    <button type="button" class="ctx-item" data-ctx="paste-here" ${clipClipboard ? '' : 'disabled'}><span>📋 Paste Take(s) ${clickTimeSec !== null ? `at ${formatTimecode(clickTimeSec)}` : 'at Playhead'}</span><span class="ctx-kbd">Ctrl+V</span></button>
    <button type="button" class="ctx-item" data-ctx="dup-with-takes"><span>📑 Duplicate Track${targetIds.size > 1 ? 's' : ''} (with Takes)</span><span class="ctx-kbd">Ctrl+D</span></button>
    <button type="button" class="ctx-item" data-ctx="dup-empty"><span>📄 Duplicate Track Setup (Empty)</span><span></span></button>
    <button type="button" class="ctx-item" data-ctx="move-up" ${trackIdx <= 0 ? 'disabled' : ''}><span>↑ Move Track Up</span><span class="ctx-kbd">Alt+↑</span></button>
    <button type="button" class="ctx-item" data-ctx="move-down" ${trackIdx >= tracks.length - 1 ? 'disabled' : ''}><span>↓ Move Track Down</span><span class="ctx-kbd">Alt+↓</span></button>
    <button type="button" class="ctx-item" data-ctx="clear-takes" ${(track.clips?.length || 0) === 0 && targetIds.size === 1 ? 'disabled' : ''}><span>🧹 Clear Recorded Takes</span><span></span></button>
    <button type="button" class="ctx-item danger" data-ctx="delete-track"><span>🗑️ Remove Track${targetIds.size > 1 ? `s (${targetIds.size})` : ''}</span><span class="ctx-kbd">Shift+Del</span></button>
    ${tracks.length > 1 ? `<button type="button" class="ctx-item danger" data-ctx="delete-all-tracks"><span>⚠️ Remove All Tracks (${tracks.length})</span><span></span></button>` : ''}
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
        }, { statusMsg: '🎚️ Reset track input gain to 0.0 dB' });
      } else if (cmd === 'norm-gain') {
        await commitEdit('Auto-Normalize Track Gain', () => {
          for (const t of tracks) if (targetIds.has(t.id)) DE.normalizeTrackGain(t, -6.0);
        }, { statusMsg: '⚡ Normalized selected track input gain to -6.0 dBFS target' });
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
        }, { statusMsg: `📋 Pasted take(s) at ${formatTimecode(pasteTime)}` });
      } else if (cmd === 'dup-with-takes' || cmd === 'dup-empty') {
        const includeClips = cmd === 'dup-with-takes';
        await commitEdit('Duplicate Track', () => {
          const newIds = DE.duplicateTracksInProject(currentProject, targetIds, { includeClips });
          selectedTrackIds = new Set(newIds);
        }, { statusMsg: `📑 Duplicated ${targetIds.size} track(s)` });
      } else if (cmd === 'move-up') {
        await commitEdit('Move Track Up', () => { DE.reorderTrackInProject(currentProject, track.id, -1); });
      } else if (cmd === 'move-down') {
        await commitEdit('Move Track Down', () => { DE.reorderTrackInProject(currentProject, track.id, 1); });
      } else if (cmd === 'clear-takes') {
        await commitEdit('Clear Track Takes', () => {
          for (const t of tracks) if (targetIds.has(t.id)) t.clips = [];
        });
      } else if (cmd === 'delete-track') {
        await commitEdit('Remove Track(s)', () => {
          DE.deleteTracksFromProject(currentProject, targetIds);
        }, { statusMsg: `🗑️ Removed ${targetIds.size} track(s) (Ctrl+Z to Undo)` });
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
  const multiLabel = targetClipIds.size > 1 ? `${targetClipIds.size} Takes Selected` : (clip.name || 'Take');
  const clipStart = Number(clip.startSec) || 0;
  const clipEnd = clipStart + (Number(clip.durationSec) || 0);
  const canSplitHere = clickTimeSec > clipStart + 0.04 && clickTimeSec < clipEnd - 0.04;
  const canSplitPlayhead = playheadSec > clipStart + 0.04 && playheadSec < clipEnd - 0.04;

  menu.innerHTML = `
    <div class="ctx-header">
      <span>🎞️ ${esc(multiLabel)}</span>
      <span class="mono" style="color:#94a3b8;font-size:10px;">${DE.formatDb(Number(clip.gainDb) || 0)}</span>
    </div>
    <button type="button" class="ctx-item" data-take-ctx="play-solo"><span>▶ Play Solo From This Take</span><span></span></button>
    <button type="button" class="ctx-item" data-take-ctx="split-here" ${canSplitHere ? '' : 'disabled'}><span>✂️ Split Take Here (${formatTimecode(clickTimeSec)})</span><span></span></button>
    <button type="button" class="ctx-item" data-take-ctx="split-playhead" ${canSplitPlayhead || targetClipIds.size > 1 ? '' : 'disabled'}><span>✂️ Split at Playhead (${formatTimecode(playheadSec)})</span><span class="ctx-kbd">S</span></button>
    <div class="ctx-sep"></div>
    <div class="ctx-inline-row">
      <span class="ctx-inline-lbl">Take Clip Gain</span>
      <div class="ctx-pill-strip">
        <button type="button" class="ctx-mini-pill" data-take-gain="-6">-6 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="-3">-3 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="0">0 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="3">+3 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="6">+6 dB</button>
        <button type="button" class="ctx-mini-pill" data-take-gain="norm">⚡ Norm</button>
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
    <button type="button" class="ctx-item" data-take-ctx="toggle-mute"><span>🔇 ${clip.muted ? 'Unmute' : 'Mute'} Take${targetClipIds.size > 1 ? 's' : ''}</span><span class="ctx-kbd">M</span></button>
    <button type="button" class="ctx-item" data-take-ctx="redetect-transients"><span>🥁 Re-Detect Drum Transients</span><span></span></button>
    <div class="ctx-sep"></div>
    <button type="button" class="ctx-item" data-take-ctx="rename"><span>✏️ Rename Take…</span><span class="ctx-kbd">F2</span></button>
    <button type="button" class="ctx-item" data-take-ctx="copy"><span>📋 Copy Take${targetClipIds.size > 1 ? 's' : ''}</span><span class="ctx-kbd">Ctrl+C</span></button>
    <button type="button" class="ctx-item" data-take-ctx="cut"><span>✂️ Cut Take${targetClipIds.size > 1 ? 's' : ''}</span><span class="ctx-kbd">Ctrl+X</span></button>
    <button type="button" class="ctx-item" data-take-ctx="duplicate"><span>📑 Duplicate Take${targetClipIds.size > 1 ? 's' : ''}</span><span class="ctx-kbd">Ctrl+D</span></button>
    <button type="button" class="ctx-item" data-take-ctx="snap-zero"><span>⏮ Snap Start to 00:00.00</span><span></span></button>
    <button type="button" class="ctx-item" data-take-ctx="move-playhead"><span>⇥ Move Start to Playhead (${formatTimecode(playheadSec)})</span><span></span></button>
    <button type="button" class="ctx-item danger" data-take-ctx="delete"><span>🗑️ Delete Take${targetClipIds.size > 1 ? `s (${targetClipIds.size})` : ''}</span><span class="ctx-kbd">Del</span></button>
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
      }, { statusMsg: val === 'norm' ? '⚡ Normalized selected take(s) to -3.0 dBFS' : `🎚️ Set take gain to ${DE.formatDb(Number(val))}` });
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
      }, { statusMsg: `🌊 Applied ${Math.round(fadeSec * 1000)} ms fade-in/out to selected take(s)` });
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
        }, { statusMsg: `✂️ Split take(s) at ${formatTimecode(clickTimeSec)}` });
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
          statusMsg: '🥁 Re-detected drum transients on selected take track(s)',
        });
      } else if (cmd === 'rename') {
        openRenameModal('Rename Take', 'Take Label', clip.name || 'Take', async (newName) => {
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
          }, { statusMsg: `⇥ Moved take(s) to ${formatTimecode(targetTime)}` });
        }
      } else if (cmd === 'delete') {
        await commitEdit('Delete Take(s)', () => {
          DE.deleteClipsFromProject(currentProject, targetClipIds);
        }, { statusMsg: `🗑️ Deleted ${targetClipIds.size} take(s)` });
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
  showStatus(`▣ Selected all ${selectedTrackIds.size} track(s) and ${selectedClipIds.size} take(s)`);
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
    showStatus(`✂️ Split ${splitCount} take(s) at playhead (${formatTimecode(playheadSec)})`);
  } else {
    showStatus('Move the playhead inside a take (press Click on timeline) before splitting (S).', true);
  }
}

function editCopySelected() {
  if (!currentProject || !selectedClipIds.size) {
    showStatus('Select one or more takes to copy (Click, Ctrl+Click, or Ctrl+A).', true);
    return;
  }
  clipClipboard = DE.copyClipsFromProject(currentProject, selectedClipIds);
  if (clipClipboard) {
    showStatus(`📋 Copied ${clipClipboard.entries.length} take(s) to clipboard`);
  }
}

async function editCutSelected() {
  if (!currentProject || !selectedClipIds.size) return;
  clipClipboard = DE.copyClipsFromProject(currentProject, selectedClipIds);
  const cnt = selectedClipIds.size;
  await commitEdit('Cut Take(s)', () => {
    DE.deleteClipsFromProject(currentProject, selectedClipIds);
  }, { statusMsg: `✂️ Cut ${cnt} take(s) to clipboard` });
}

async function editPasteAtPlayhead() {
  if (!currentProject || !clipClipboard) {
    showStatus('Clipboard is empty — Copy (Ctrl+C) or Cut (Ctrl+X) a take first.', true);
    return;
  }
  const primaryTrackId = [...selectedTrackIds][0] || anchorTrackId || null;
  await commitEdit('Paste Take(s)', () => {
    const created = DE.pasteClipsIntoProject(currentProject, clipClipboard, playheadSec, primaryTrackId);
    selectedClipIds = new Set(created);
  }, { statusMsg: `📋 Pasted ${clipClipboard.entries.length} take(s) at ${formatTimecode(playheadSec)}` });
}

async function editDuplicateSelected() {
  if (!currentProject) return;
  if (selectedClipIds.size > 0) {
    const cnt = selectedClipIds.size;
    await commitEdit('Duplicate Take(s)', () => {
      const created = DE.duplicateClipsInProject(currentProject, selectedClipIds);
      selectedClipIds = new Set(created);
    }, { statusMsg: `📑 Duplicated ${cnt} phase-aligned take(s)` });
    return;
  }
  if (selectedTrackIds.size > 0) {
    const cnt = selectedTrackIds.size;
    await commitEdit('Duplicate Track(s)', () => {
      const created = DE.duplicateTracksInProject(currentProject, selectedTrackIds, { includeClips: true });
      selectedTrackIds = new Set(created);
    }, { statusMsg: `📑 Duplicated ${cnt} track(s)` });
    return;
  }
  showStatus('Select a take or track first to duplicate (Ctrl+D).', true);
}

async function editDeleteSelected() {
  if (!currentProject) return;
  if (selectedClipIds.size > 0) {
    const cnt = selectedClipIds.size;
    await commitEdit('Delete Take(s)', () => {
      DE.deleteClipsFromProject(currentProject, selectedClipIds);
    }, { statusMsg: `🗑️ Deleted ${cnt} take(s)` });
    return;
  }
  if (selectedTrackIds.size > 0) {
    const cnt = selectedTrackIds.size;
    await commitEdit('Delete Track(s)', () => {
      DE.deleteTracksFromProject(currentProject, selectedTrackIds);
    }, { statusMsg: `🗑️ Deleted ${cnt} track(s)` });
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
        ${p.soundReplacement?.supported ? '<span class="mic-card-badge">🥁 Drum Replace Ready</span>' : '<span class="mic-card-badge">🎛️ Studio LV2/EQ</span>'}
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
          <span>${inp.isFocusrite ? '🔴 ' : ''}${esc(inp.description)}</span>
          <span class="mono">${peakDb <= -90 ? '-∞' : peakDb.toFixed(1)} dBFS ${isSel ? '✓' : ''}</span>
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
    `<option value="${esc(k.id)}"${k.id === preferredKitId ? ' selected' : ''}>${esc(k.name)} ${k.installed ? `(${k.sampleCount} samples ✓)` : '(Click Install)'}</option>`
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
    showStatus(`✓ Added armed track "${res.track.name}" on ${res.track.inputLabel}${soundReplacement.enabled ? ` with ${soundReplacement.kitId} (${soundReplacement.pieceId}) Sound Replacement` : ''}!`);
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
  document.getElementById('sc-live-title').textContent = `● RECORDING ALL ${scArmedInputsList.length} ARMED CHANNELS — PLAY YOUR DRUM SET NOW!`;

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
    showStatus(`🔊 Playing recorded soundcheck clip (${buf.duration.toFixed(1)}s)…`);
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

  if (badge) badge.textContent = `✨ Classified via ${scLastProviderLabel}`;
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
        <p class="hint">Check your Focusrite gain knobs or click "↺ Re-Record Soundcheck" and hit the drums firmly!</p>
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
          ${item.wavFile ? `<button type="button" class="btn btn-sm" style="height:22px;padding:0 7px;margin-top:4px;font-size:10.5px;" data-sc-act="listen" data-idx="${idx}">🔊 Play Clip</button>` : ''}
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
            <span>🥁 Sound Replace</span>
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
  showStatus(`🥁 Configured & armed ${res.addedCount} studio mic track(s) via ${scLastProviderLabel}! Press ▶ Play to hear your soundcheck or ● Record for a new take.`);
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
    showStatus(`💾 Saved session "${currentProject.name}" (${currentProject.tracks.length} tracks) → ${res.manifestFile}`);
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
    showStatus(`📂 Opened "${currentProject.name}" — reloaded ${currentProject.tracks.length} track(s) and ${clipTotal} recorded WAV stem(s).`);
  } else {
    showStatus(`Open failed: ${res?.error || 'Unknown error'}`, true);
  }
}

function updateDrumkitsBadge() {
  const installedCount = (drumkitsStatus?.kits || []).filter(k => k.installed).length;
  const badge = document.getElementById('drumkits-badge');
  if (badge) badge.textContent = `${installedCount}/${(drumkitsStatus?.kits || []).length}`;
}

function renderDrumkitsModal() {
  const listEl = document.getElementById('drumkits-catalog-list');
  if (!listEl) return;
  const kits = drumkitsStatus?.kits || [];
  listEl.innerHTML = kits.map(k => {
    const firstPiece = Object.keys(k.pieces || {})[0] || 'snare';
    return `
      <div class="saved-proj-row">
        <div>
          <strong>${esc(k.name)}</strong> <span class="mono" style="color:var(--accent);">[${esc(k.license)}]</span>
          <div class="hint">${esc(k.description)}</div>
          <div class="mono" style="font-size:11px;color:${k.installed ? '#86efac' : '#fde047'};">
            ${k.installed ? `✓ Installed (${k.sampleCount} lossless/WAV samples)` : 'Not downloaded yet'}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          ${k.installed ? `<button type="button" class="btn btn-sm" data-audition-kit="${esc(k.id)}" data-piece="${esc(firstPiece)}">🔊 Test</button>` : ''}
          <button type="button" class="btn btn-sm ${k.installed ? '' : 'btn-primary'}" data-dl-kit="${esc(k.id)}">${k.installed ? '↻ Verify' : '⬇ Download'}</button>
        </div>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('[data-audition-kit]').forEach(btn => {
    btn.addEventListener('click', () => auditionDrumPiece(btn.dataset.auditionKit, btn.dataset.piece));
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
      pill.textContent = `● ${fr.model} · ${(clk.effectiveRate / 1000).toFixed(clk.effectiveRate % 1000 ? 1 : 0)}kHz / ${fr.bits}-bit`;
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
        ? `Internal ${fr.mixer.syncValid.internal ? '✓' : '—'} · S/PDIF ${fr.mixer.syncValid.spdif ? '✓' : '—'} · ADAT ${fr.mixer.syncValid.adat ? '✓' : '—'}`
        : 'Locked';
      cardSlot.innerHTML = `
        <div class="card card-focusrite" id="focusrite-card">
          <div class="fr-header">
            <div class="fr-title-wrap">
              <span class="badge-connected">● CONNECTED</span>
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
      `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeInName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
    ).join('');
  }
  if (outSel) {
    outSel.innerHTML = (snap.outputs || []).map(n =>
      `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeOutName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
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
          ⚡ ${esc(b.label)}: ${b.enabled ? 'ON' : 'OFF'}
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
              ${p.level === 'Inst' ? '🎸 Inst (Hi-Z)' : 'Line'}
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
            showStatus(`✓ Updated Focusrite hardware "${control}" → ${value}`);
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
        <span>${n.isDefault ? '★ ' : ''}${esc(n.description)}</span>
        <span class="mono" style="color:var(--muted);">PW #${n.id}</span>
      </li>
    `).join('');
  }
  const outList = document.getElementById('outputs-list');
  if (outList) {
    outList.innerHTML = (snap.outputs || []).map(n => `
      <li class="endpoint-item ${n.isFocusrite ? 'is-fr' : ''} ${n.isDefault ? 'is-default' : ''}">
        <span>${n.isDefault ? '★ ' : ''}${esc(n.description)}</span>
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
    showStatus(`🧲 Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
  });
  document.getElementById('btn-loop-toggle')?.addEventListener('click', () => {
    loopPlayback = !loopPlayback;
    updateEditToolbarState();
    showStatus(`🔁 Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
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
      const primaryId = [...selectedTrackIds][0];
      if (primaryId) {
        const dir = ev.key === 'ArrowUp' ? -1 : 1;
        await commitEdit(dir < 0 ? 'Move Track Up' : 'Move Track Down', () => {
          DE.reorderTrackInProject(currentProject, primaryId, dir);
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
      showStatus(`🧲 Snap to Beat Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
    } else if (!isMod && !ev.altKey && keyLower === 'l') {
      ev.preventDefault();
      loopPlayback = !loopPlayback;
      updateEditToolbarState();
      showStatus(`🔁 Loop Playback: ${loopPlayback ? 'ON' : 'OFF'}`);
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
      if (isMod && selectedClipIds.size > 0) {
        const nudge = dir * (ev.shiftKey ? 0.25 : 0.05);
        await commitEdit('Nudge Take(s)', () => {
          DE.moveClipsByDelta(currentProject, selectedClipIds, nudge);
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
    btn.textContent = 'Downloading…';
    const res = await window.robos.downloadDrumkit({ kitId });
    btn.disabled = false;
    btn.textContent = '⬇ Install Kit';
    if (res?.ok && res.status) {
      drumkitsStatus = res.status;
      updateDrumkitsBadge();
      populateWizardDrumSelectors(kitId, document.getElementById('wiz-sr-piece')?.value);
      showStatus(`✓ Installed open-source drum kit "${kitId}"!`);
    }
  });

  // Drumkits Modal
  document.getElementById('btn-open-drumkits-modal')?.addEventListener('click', () => {
    renderDrumkitsModal();
    document.getElementById('drumkits-modal')?.classList.remove('hidden');
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
      showStatus('✓ All open-source studio drum kits verified in ~/.local/share/robos/daw-studio/instruments/!');
    }
  });

  // Audio Devices Preferences Handlers
  document.getElementById('btn-rescan')?.addEventListener('click', async () => {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `✓ Connected to ${snap.focusrite.model} (${snap.inputs.length} inputs, ${snap.outputs.length} outputs)`
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
      showStatus(`✓ Applied: ${res.snapshot.clock.effectiveRate} Hz · ${res.snapshot.clock.effectiveQuantum} samples (${res.snapshot.clock.latencyMs} ms latency)`);
    } else {
      showStatus(`Failed to apply engine settings: ${res?.error || 'Unknown error'}`, true);
    }
  });

  document.getElementById('btn-test-input')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('select-input-device')?.value || '';
    btn.disabled = true;
    showStatus('Capturing 1.5s test sample from selected input…');
    const res = await window.robos.testInputCapture({ targetNodeName: target, durationMs: 1500 });
    btn.disabled = false;
    if (res?.ok) {
      setMeter(res.peakDb, 'Last 1.5s Capture Peak');
      showStatus(`✓ Captured ${res.samples} samples @ 48kHz — Peak: ${res.peakDb} dBFS · RMS: ${res.rmsDb} dBFS`);
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
    if (res?.ok) showStatus('✓ Played studio test chime on selected output.');
  });

  document.getElementById('btn-live-monitor')?.addEventListener('click', toggleLiveMonitor);

  // Backend Push Subscriptions
  window.robos.onHardwareChanged((snap) => {
    renderSnapshot(snap);
    renderStudio();
    showStatus(snap.focusrite?.connected
      ? `🔌 USB Hotplug: ${snap.focusrite.model} connected!`
      : '🔌 USB audio device state changed.');
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
        alertEl.textContent = `🎯 Strike detected on "${data.detected.description}" (${data.detected.peakDb} dBFS)! Channel auto-selected.`;
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
});
window.__openDrumsetWizard = openDrumsetWizard;
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
