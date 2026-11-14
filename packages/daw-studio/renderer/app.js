'use strict';

// ─── Studio & Hardware State ────────────────────────────────────────────────
let currentSnapshot = null;
let micProfiles = [];
let drumkitsStatus = { kits: [], anyInstalled: false };
let currentProject = null;
let savedProjectsState = { projects: [], lastProjectId: null };
let selectedTrackId = null;
let isDirty = false;

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

function getTimelineDurationSec() {
  let maxEnd = DEFAULT_TIMELINE_SECONDS;
  for (const t of (currentProject?.tracks || [])) {
    for (const c of (t.clips || [])) {
      const end = (Number(c.startSec) || 0) + (Number(c.durationSec) || 0) + 2;
      if (end > maxEnd) maxEnd = end;
    }
  }
  return Math.ceil(maxEnd);
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
  const maxDuration = getTimelineDurationSec();

  // Pre-decode needed clip & replacement buffers
  for (const track of playableTracks) {
    for (const clip of (track.clips || [])) {
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
      const clipStart = Number(clip.startSec) || 0;
      const buf = decodedBufferCache.get(clip.wavFile);
      if (buf) {
        const clipEnd = clipStart + buf.duration;
        if (clipEnd > startFrom) {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(inputGain);
          if (clipStart >= startFrom) {
            src.start(now + (clipStart - startFrom));
          } else {
            src.start(now, startFrom - clipStart);
          }
          activeScheduledNodes.push(src);
        }
      }

      // Schedule Open-Source Drum Sound Replacement samples on transients!
      if (srActive && Array.isArray(clip.transients)) {
        for (const hit of clip.transients) {
          const absHitSec = clipStart + (Number(hit.timeSec) || 0);
          if (absHitSec < startFrom) continue;
          const sp = resolveDrumSamplePath(track.soundReplacement.kitId, track.soundReplacement.pieceId, hit.velocity);
          const srBuf = sp ? decodedBufferCache.get(sp) : null;
          if (!srBuf) continue;

          const hitSrc = ctx.createBufferSource();
          hitSrc.buffer = srBuf;
          const hitGain = ctx.createGain();
          hitGain.gain.value = blend * Math.max(0.25, Math.min(1.15, Number(hit.velocity) || 0.8));
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
      currentProject = res.project;
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

  const res = await window.robos.recordStart({
    startSec: playheadSec,
    projectMeta: {
      name: document.getElementById('project-name-input')?.value,
      bpm: Number(document.getElementById('project-bpm-input')?.value) || 120,
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

  if (selectedTrackId && !tracks.some(t => t.id === selectedTrackId)) {
    selectedTrackId = tracks[0]?.id || null;
  }

  const orderedInputs = getOrderedInputs();
  const listEl = document.getElementById('tracks-list');
  listEl.innerHTML = tracks.map(t => {
    const isSel = t.id === selectedTrackId;
    const srOn = Boolean(t.soundReplacement?.enabled);
    const srPiece = t.soundReplacement?.pieceId || 'drum';
    const inputOptions = orderedInputs.map(inp =>
      `<option value="${esc(inp.name)}"${inp.name === t.inputNodeName ? ' selected' : ''}>${esc(inp.description)}</option>`
    ).join('');

    return `
      <div class="track-row ${isSel ? 'selected' : ''}" data-track-id="${esc(t.id)}">
        <div class="track-controls-col">
          <div class="track-color-bar" style="background:${esc(t.color || '#00bcd4')}"></div>
          <img class="track-mic-thumb" src="${esc(t.image || 'assets/mics/snare-mic.webp')}" alt="${esc(t.name)}" />
          <div class="track-meta-stack">
            <div class="track-top-line">
              <span class="track-name-label" title="${esc(t.name)}">${esc(t.name)}</span>
              <div class="track-btn-strip">
                <button type="button" class="trk-mini-btn ${t.armed ? 'arm-on' : ''}" data-act="arm" data-id="${esc(t.id)}" title="Arm Track for Recording">● R</button>
                <button type="button" class="trk-mini-btn ${t.muted ? 'mute-on' : ''}" data-act="mute" data-id="${esc(t.id)}" title="Mute Track">M</button>
                <button type="button" class="trk-mini-btn ${t.soloed ? 'solo-on' : ''}" data-act="solo" data-id="${esc(t.id)}" title="Solo Track">S</button>
                <button type="button" class="trk-mini-btn" data-act="inspect" data-id="${esc(t.id)}" title="Open EQ / LV2 / Sound Replacement Inspector">🎛️ FX</button>
                <button type="button" class="trk-mini-btn ${srOn ? 'sr-on' : ''}" data-act="toggle-sr" data-id="${esc(t.id)}" title="Toggle Open-Source Drum Sound Replacement">🥁 ${srOn ? esc(srPiece) : 'Off'}</button>
                <button type="button" class="trk-mini-btn" data-act="delete" data-id="${esc(t.id)}" title="Remove Track">✕</button>
              </div>
            </div>
            <div class="track-mid-line">
              <select class="track-input-select" data-act="input-change" data-id="${esc(t.id)}" aria-label="Track Hardware Input">
                ${inputOptions || `<option value="${esc(t.inputNodeName)}">${esc(t.inputLabel || 'Default Input')}</option>`}
              </select>
            </div>
            <div class="track-bot-line">
              <span>Vol</span>
              <input type="range" class="track-vol-slider" min="0" max="1.4" step="0.02" value="${Number(t.volume ?? 1).toFixed(2)}" data-act="vol" data-id="${esc(t.id)}" />
              <span class="mono">${formatPan(t.pan)}</span>
              <div class="track-live-meter" title="Live Track Input Peak">
                <div class="track-live-meter-fill" id="rec-meter-${esc(t.id)}" style="width:${dbToPercent(liveRecLevels[t.id]?.peakDb ?? -96)}%"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="track-lane-col" data-lane-track="${esc(t.id)}">
          <canvas class="track-wave-canvas" id="wave-canvas-${esc(t.id)}" height="92"></canvas>
        </div>
      </div>
    `;
  }).join('');

  bindTrackRowEvents();
  renderInspectorDrawer();
  requestAnimationFrame(drawAllTimelineCanvases);
}

function bindTrackRowEvents() {
  const listEl = document.getElementById('tracks-list');
  if (!listEl) return;

  listEl.querySelectorAll('[data-act]').forEach(el => {
    const act = el.dataset.act;
    const trackId = el.dataset.id;

    if (act === 'input-change') {
      el.addEventListener('change', async () => {
        const optText = el.selectedOptions?.[0]?.textContent || el.value;
        const res = await window.robos.updateTrack({
          trackId,
          patch: { inputNodeName: el.value, inputLabel: optText },
        });
        if (res?.ok) {
          currentProject = res.project;
          markDirty(true);
          renderStudio();
        }
      });
      return;
    }

    if (act === 'vol') {
      el.addEventListener('input', async () => {
        const res = await window.robos.updateTrack({
          trackId,
          patch: { volume: Number(el.value) },
        });
        if (res?.ok) {
          currentProject = res.project;
          markDirty(true);
        }
      });
      return;
    }

    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const track = (currentProject?.tracks || []).find(t => t.id === trackId);
      if (!track) return;

      if (act === 'arm') {
        const res = await window.robos.updateTrack({ trackId, patch: { armed: !track.armed } });
        if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); }
      } else if (act === 'mute') {
        const res = await window.robos.updateTrack({ trackId, patch: { muted: !track.muted } });
        if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); }
      } else if (act === 'solo') {
        const res = await window.robos.updateTrack({ trackId, patch: { soloed: !track.soloed } });
        if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); }
      } else if (act === 'toggle-sr') {
        const nextEnabled = !track.soundReplacement?.enabled;
        const res = await window.robos.updateTrack({
          trackId,
          patch: { soundReplacement: { enabled: nextEnabled, supported: true } },
          reanalyze: nextEnabled,
        });
        if (res?.ok) {
          currentProject = res.project;
          selectedTrackId = trackId;
          markDirty(true);
          renderStudio();
        }
      } else if (act === 'inspect') {
        selectedTrackId = selectedTrackId === trackId ? null : trackId;
        renderStudio();
      } else if (act === 'delete') {
        const res = await window.robos.deleteTrack({ trackId });
        if (res?.ok) {
          currentProject = res.project;
          markDirty(true);
          renderStudio();
        }
      }
    });
  });

  listEl.querySelectorAll('[data-lane-track]').forEach(lane => {
    lane.addEventListener('click', (ev) => {
      selectedTrackId = lane.dataset.laneTrack;
      const rect = lane.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / Math.max(1, rect.width)));
      playheadSec = ratio * getTimelineDurationSec();
      document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
      if (isPlaying) {
        stopPlayback();
        startPlayback();
      } else {
        renderInspectorDrawer();
        drawAllTimelineCanvases();
      }
    });
  });
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
    for (let s = 0; s <= totalSec; s++) {
      const x = Math.round((s / totalSec) * w);
      ctx.strokeStyle = s % 4 === 0 ? '#334155' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, s % 2 === 0 ? 10 : 18);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (s % 2 === 0 && x < w - 26) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${s}s`, x + 3, 12);
      }
    }

    // Playhead triangle
    const px = Math.round((playheadSec / totalSec) * w);
    ctx.fillStyle = '#00bcd4';
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 8);
    ctx.closePath();
    ctx.fill();
  }

  // 2. Per-Track Waveform + Transient Canvases
  for (const track of (currentProject.tracks || [])) {
    const canvas = document.getElementById(`wave-canvas-${track.id}`);
    if (!canvas) continue;
    const w = canvas.clientWidth || 640;
    const h = 92;
    if (canvas.width !== w) canvas.width = w;
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

    // Draw recorded clips
    for (const clip of (track.clips || [])) {
      const startX = (Number(clip.startSec || 0) / totalSec) * w;
      const clipW = Math.max(8, (Number(clip.durationSec || 1) / totalSec) * w);

      ctx.fillStyle = 'rgba(22, 34, 49, 0.92)';
      ctx.strokeStyle = track.color || '#00bcd4';
      ctx.lineWidth = 1.2;
      ctx.fillRect(startX, 5, clipW, h - 10);
      ctx.strokeRect(startX, 5, clipW, h - 10);

      // Peaks envelope
      const peaks = Array.isArray(clip.peaks) ? clip.peaks : [];
      if (peaks.length) {
        ctx.fillStyle = track.color || '#00bcd4';
        const stepX = clipW / peaks.length;
        const barW = Math.max(1, stepX - 0.35);
        const midY = h / 2 + 4;
        const maxAmpH = (h - 28) / 2;
        for (let i = 0; i < peaks.length; i++) {
          const amp = Math.max(0.03, Math.min(1, peaks[i] * 1.35));
          const bh = amp * maxAmpH;
          ctx.fillRect(startX + i * stepX, midY - bh, barW, bh * 2);
        }
      }

      // Transient Drum Replacement Markers (▼)
      if (track.soundReplacement?.enabled && Array.isArray(clip.transients)) {
        for (const hit of clip.transients) {
          const hx = startX + ((Number(hit.timeSec) || 0) / Math.max(0.1, Number(clip.durationSec) || 1)) * clipW;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(hx, 6);
          ctx.lineTo(hx, h - 6);
          ctx.stroke();

          ctx.fillStyle = '#fde047';
          ctx.beginPath();
          ctx.moveTo(hx - 4, 6);
          ctx.lineTo(hx + 4, 6);
          ctx.lineTo(hx, 13);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Clip title + stats
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 10.5px -apple-system, sans-serif';
      const hitNote = track.soundReplacement?.enabled && clip.transients?.length
        ? ` · 🥁 ${clip.transients.length} hits`
        : '';
      ctx.fillText(
        `${clip.name || 'Take'} (${Number(clip.durationSec || 0).toFixed(1)}s, ${clip.peakDb ?? '—'} dB${hitNote})`,
        startX + 6,
        17
      );
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
    ctx.strokeStyle = '#00bcd4';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();
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

  drawer.innerHTML = `
    <div class="inspector-top">
      <div>
        <strong>🎛️ Channel Strip &amp; Sound Replacement Inspector — ${esc(track.name)}</strong>
        <span class="hint" style="margin-left:10px;">Input: ${esc(track.inputLabel)} · Plugins: ${(track.fx?.openSourcePlugins || []).map(esc).join(' → ')}</span>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-sm" id="btn-insp-clear-clips">Clear Takes (${track.clips?.length || 0})</button>
        <button type="button" class="btn btn-sm" id="btn-insp-close">Close</button>
      </div>
    </div>

    <div class="inspector-grid">
      <div>
        <div class="mini-heading">Parametric EQ &amp; Dynamics (WebAudio + LV2 Chain)</div>
        <div class="dsp-sliders">
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

  const saveInspectorPatch = async (patch, reanalyze = false) => {
    const res = await window.robos.updateTrack({ trackId: track.id, patch, reanalyze });
    if (res?.ok) {
      currentProject = res.project;
      markDirty(true);
      renderStudio();
    }
  };

  document.getElementById('btn-insp-close')?.addEventListener('click', () => {
    selectedTrackId = null;
    drawer.classList.add('hidden');
  });
  document.getElementById('btn-insp-clear-clips')?.addEventListener('click', async () => {
    const res = await window.robos.clearTrackClips({ trackId: track.id });
    if (res?.ok) { currentProject = res.project; markDirty(true); renderStudio(); }
  });
  document.getElementById('btn-insp-audition')?.addEventListener('click', () => {
    auditionDrumPiece(
      document.getElementById('insp-sr-kit')?.value || sr.kitId,
      document.getElementById('insp-sr-piece')?.value || sr.pieceId
    );
  });

  document.getElementById('insp-eq-on')?.addEventListener('change', e => saveInspectorPatch({ fx: { eq: { enabled: e.target.checked } } }));
  document.getElementById('insp-eq-hpf')?.addEventListener('change', e => saveInspectorPatch({ fx: { eq: { hpfHz: Number(e.target.value) } } }));
  document.getElementById('insp-eq-low')?.addEventListener('change', e => saveInspectorPatch({ fx: { eq: { lowGainDb: Number(e.target.value) } } }));
  document.getElementById('insp-eq-mid')?.addEventListener('change', e => saveInspectorPatch({ fx: { eq: { midGainDb: Number(e.target.value) } } }));
  document.getElementById('insp-eq-high')?.addEventListener('change', e => saveInspectorPatch({ fx: { eq: { highGainDb: Number(e.target.value) } } }));
  document.getElementById('insp-comp-on')?.addEventListener('change', e => saveInspectorPatch({ fx: { compressor: { enabled: e.target.checked } } }));
  document.getElementById('insp-comp-ratio')?.addEventListener('change', e => saveInspectorPatch({ fx: { compressor: { ratio: Number(e.target.value) } } }));
  document.getElementById('insp-pan')?.addEventListener('change', e => saveInspectorPatch({ pan: Number(e.target.value) }));

  document.getElementById('insp-sr-on')?.addEventListener('change', e =>
    saveInspectorPatch({ soundReplacement: { enabled: e.target.checked, supported: true } }, true)
  );
  document.getElementById('insp-sr-kit')?.addEventListener('change', e => {
    const chosenKit = (drumkitsStatus.kits || []).find(k => k.id === e.target.value);
    const firstPiece = chosenKit ? Object.keys(chosenKit.pieces || {})[0] : 'snare';
    saveInspectorPatch({ soundReplacement: { kitId: e.target.value, pieceId: chosenKit?.pieces?.[sr.pieceId] ? sr.pieceId : firstPiece } });
  });
  document.getElementById('insp-sr-piece')?.addEventListener('change', e =>
    saveInspectorPatch({ soundReplacement: { pieceId: e.target.value } })
  );
  document.getElementById('insp-sr-thresh')?.addEventListener('change', e =>
    saveInspectorPatch({ soundReplacement: { thresholdDb: Number(e.target.value) } }, true)
  );
  document.getElementById('insp-sr-blend')?.addEventListener('change', e =>
    saveInspectorPatch({ soundReplacement: { blend: Number(e.target.value) / 100 } })
  );
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
    currentProject = res.project;
    if (res.audioSnapshot) renderSnapshot(res.audioSnapshot);
    selectedTrackId = res.track.id;
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
    currentProject = res.project;
    savedProjectsState = res.savedProjects || savedProjectsState;
    selectedTrackId = currentProject.tracks?.[0]?.id || null;
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
  // Navigation
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('nav-open-wizard-rail')?.addEventListener('click', openAddMicWizard);

  // Studio CTAs
  document.getElementById('btn-open-add-mic-wizard')?.addEventListener('click', openAddMicWizard);
  document.getElementById('btn-empty-open-wizard')?.addEventListener('click', openAddMicWizard);

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

  document.getElementById('btn-project-new')?.addEventListener('click', async () => {
    stopPlayback();
    const res = await window.robos.projectNew({ name: 'New Studio Drum & Band Session', bpm: 120 });
    if (res?.ok) {
      currentProject = res.project;
      selectedTrackId = null;
      playheadSec = 0;
      document.getElementById('transport-timecode').textContent = formatTimecode(0);
      markDirty(false);
      renderStudio();
      showStatus('📄 Created new studio session.');
    }
  });
  document.getElementById('btn-project-save')?.addEventListener('click', () => saveCurrentSession(false));
  document.getElementById('btn-project-save-as')?.addEventListener('click', () => saveCurrentSession(true));
  document.getElementById('btn-project-open')?.addEventListener('click', openProjectModal);
  document.getElementById('btn-open-modal-close')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-open-modal-cancel')?.addEventListener('click', () => document.getElementById('open-project-modal')?.classList.add('hidden'));
  document.getElementById('btn-browse-project-file')?.addEventListener('click', () => loadProjectByIdOrDialog({ openDialog: true }));

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
    playheadSec = ratio * getTimelineDurationSec();
    document.getElementById('transport-timecode').textContent = formatTimecode(playheadSec);
    drawAllTimelineCanvases();
  });

  // Keyboard shortcuts (Ctrl+S to save, Space to play/stop)
  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      saveCurrentSession(false);
    } else if (ev.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      ev.preventDefault();
      if (isRecording) toggleRecording();
      else if (isPlaying) stopPlayback();
      else startPlayback();
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
    currentProject = boot.currentProject;
    savedProjectsState = boot.savedProjects || { projects: [] };
    selectedTrackId = currentProject?.tracks?.[0]?.id || null;
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
  wizStep,
  wizProfileId,
  drumkitsInstalled: (drumkitsStatus?.kits || []).filter(k => k.installed).map(k => k.id),
});

init();
