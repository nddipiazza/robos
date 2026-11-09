'use strict';

/* RobOS Personality — the app window.
 *
 * Settings for each part (face, voice, ears, eyes, model), the face preview,
 * and the conversation. This window is also where the voice plays (so the
 * chosen sound device and the lip sync come from the real audio) and where the
 * microphone is listened to.
 */

const api = window.personality;
const core = window.TalkCore;
const $ = (id) => document.getElementById(id);

const COLORS = ['#00bcd4', '#3b82f6', '#22c55e', '#7c3aed', '#ec4899', '#f97316', '#eab308', '#ef4444', '#14b8a6'];
const ENGINE_LABELS = { kokoro: 'Kokoro (natural, offline)', piper: 'Piper (fast, offline)', 'edge-tts': 'Edge TTS (online)' };

let state = null;
let agentEl = null;
let activity = 'idle';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stageToken() {
  try { return new URL(state.faceUrl).searchParams.get('t') || ''; } catch { return ''; }
}

async function call(fn, ...args) {
  const res = await fn(...args);
  if (!res.ok) throw new Error(res.error);
  return res.result;
}

function setStatus(id, text, kind = '') {
  const el = $(id);
  el.textContent = text || '';
  el.dataset.kind = kind;
}

// ── Saving settings ────────────────────────────────────────────────────────

const pending = {};
let saveTimer = null;
function save(patch, { now = false } = {}) {
  for (const [k, v] of Object.entries(patch)) {
    pending[k] = typeof v === 'object' && v && !Array.isArray(v) ? { ...(pending[k] || {}), ...v } : v;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, now ? 0 : 400);
}

async function flushSave() {
  const patch = { ...pending };
  for (const k of Object.keys(pending)) delete pending[k];
  if (!Object.keys(patch).length) return;
  try {
    state.active = await call(api.update, patch);
    $('personality-select').querySelector(`option[value="${CSS.escape(state.active.id)}"]`).textContent = state.active.name;
  } catch (err) {
    setStatus('cast-status', err.message, 'error');
  }
}

// ── Devices ────────────────────────────────────────────────────────────────

async function listDevices(kind) {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === kind && d.deviceId !== 'communications');
  } catch {
    return [];
  }
}

function fillDeviceSelect(sel, devices, current, noun) {
  const opts = [`<option value="default">System default ${noun}</option>`];
  devices.filter((d) => d.deviceId !== 'default').forEach((d, i) => {
    opts.push(`<option value="${esc(d.deviceId)}">${esc(d.label || `${noun} ${i + 1}`)}</option>`);
  });
  sel.innerHTML = opts.join('');
  sel.value = devices.some((d) => d.deviceId === current) ? current : 'default';
}

async function refreshDevices() {
  const p = state.active;
  fillDeviceSelect($('voice-output'), await listDevices('audiooutput'), p.voice.outputDeviceId, 'speaker');
  fillDeviceSelect($('ears-device'), await listDevices('audioinput'), p.ears.deviceId, 'microphone');
}
navigator.mediaDevices?.addEventListener?.('devicechange', () => state && refreshDevices());

// ── Form ───────────────────────────────────────────────────────────────────

function fillVoices() {
  const p = state.active;
  const engines = Object.keys(ENGINE_LABELS);
  $('voice-engine').innerHTML = engines.map((e) => {
    const installed = state.engines[e];
    return `<option value="${e}">${esc(ENGINE_LABELS[e])}${installed ? '' : ' (not installed)'}</option>`;
  }).join('');
  $('voice-engine').value = engines.includes(p.voice.engine) ? p.voice.engine : 'kokoro';
  const list = (state.voices && state.voices[$('voice-engine').value]) || [];
  $('voice-voice').innerHTML = list.length
    ? list.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')
    : '<option value="">Default voice</option>';
  $('voice-voice').value = list.some((v) => v.id === p.voice.voice) ? p.voice.voice : (list[0]?.id || '');
}

function fillCameras() {
  const p = state.active;
  const cams = state.cameras || [];
  const opts = ['<option value="">No eyes</option>'];
  for (const c of cams) {
    opts.push(`<option value="${esc(c.id)}"${c.canOpen ? '' : ' disabled'}>${esc(c.name)}${c.canOpen ? '' : ' (shared from another machine)'}</option>`);
  }
  $('eyes-camera').innerHTML = opts.join('');
  $('eyes-camera').value = cams.some((c) => c.id === p.eyes.cameraId) ? p.eyes.cameraId : '';
  if (!state.cameraWatchInstalled) setStatus('eyes-status', 'RobOS Camera Watch is not installed, so there are no cameras.', 'warn');
  else if (!cams.length) setStatus('eyes-status', 'No cameras yet. Add one in RobOS Camera Watch, then press Refresh.');
  else showEyesStatus(state.eyes);
}

function showEyesStatus(s) {
  if (!s) return;
  if (!state.active.eyes.cameraId) setStatus('eyes-status', 'Eyes are closed.');
  else setStatus('eyes-status', s.message, s.state === 'error' ? 'error' : (s.state === 'live' ? 'ok' : ''));
}

function showSight(sight) {
  const img = $('eyes-preview');
  if (!sight || !sight.at) { img.classList.add('hidden'); return; }
  img.src = `http://127.0.0.1:${state.stagePort}/sight.jpg?t=${encodeURIComponent(stageToken())}&n=${sight.at}`;
  img.classList.remove('hidden');
}

function fillDisplaysAndTvs() {
  $('display-select').innerHTML = (state.displays || []).map((d) => `<option value="${d.id}">${esc(d.label)}</option>`).join('')
    || '<option value="">This screen</option>';
  const tvs = state.tvs || [];
  if (!state.tvStudioInstalled) {
    $('tv-select').innerHTML = '<option value="">Smart TV Studio not installed</option>';
  } else if (!tvs.length) {
    $('tv-select').innerHTML = '<option value="">No TVs paired</option>';
  } else {
    $('tv-select').innerHTML = tvs.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} (${esc(t.platformName || 'TV')})${t.casting ? ', showing' : ''}</option>`).join('');
  }
  $('tv-cast').disabled = !tvs.length;
  updateTvButton();
  $('face-window').textContent = state.faceWindowOpen ? 'Close window' : 'Show in a window';
}

function updateTvButton() {
  const tv = (state.tvs || []).find((t) => t.id === $('tv-select').value);
  $('tv-cast').textContent = tv && tv.casting ? 'Stop casting' : 'Cast to TV';
}

function fillForm() {
  const p = state.active;
  $('personality-select').innerHTML = state.personalities.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  $('personality-select').value = p.id;
  $('delete-personality').disabled = state.personalities.length <= 1;
  $('name').value = p.name;
  $('persona').value = p.persona;
  $('face-style').value = p.face.style;
  $('colors').innerHTML = COLORS.map((c) => `<button type="button" class="swatch${c === p.face.color ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join('');
  fillVoices();
  $('voice-speed').value = p.voice.speed;
  $('voice-speed-label').textContent = `${Number(p.voice.speed).toFixed(2)}×`;
  $('voice-captions').checked = p.voice.captions;
  $('ears-sensitivity').value = p.ears.sensitivity;
  $('ears-sens-label').textContent = `${Math.round(p.ears.sensitivity * 100)}%`;
  $('eyes-pip').checked = p.eyes.pip;
  fillCameras();
  showSight(state.sight);
  fillDisplaysAndTvs();
  if (!state.voiceInstalled) setStatus('voice-status', 'RobOS Voice is not installed: captions only, no sound.', 'warn');
  else if (!state.engines[p.voice.engine]) setStatus('voice-status', `${ENGINE_LABELS[p.voice.engine] || p.voice.engine} is not installed; RobOS Voice falls back to another engine.`, 'warn');
  else setStatus('voice-status', '');
  if (!state.earsInstalled) setStatus('ears-status', 'RobOS Voice is not installed, so there is no speech recognition. Type instead.', 'warn');
  if (state.testBrain) setStatus('model-status', 'Test brain: answers come from a stand-in, not an AI agent.', 'warn');
  renderTranscript(state.history);
  if (agentEl) agentEl.load({ provider: p.model.provider, model: p.model.model, effort: p.model.effort }).catch(() => {});
  refreshDevices();
}

function bindForm() {
  $('personality-select').addEventListener('change', async (e) => {
    stopListening();
    await call(api.select, e.target.value);
    await reload();
  });
  $('new-personality').addEventListener('click', async () => {
    const name = `Personality ${state.personalities.length + 1}`;
    await call(api.create, name);
    await reload();
    $('name').focus();
    $('name').select();
  });
  $('delete-personality').addEventListener('click', async () => {
    if (!confirm(`Delete ${state.active.name} and its conversation?`)) return;
    await call(api.remove, state.active.id);
    await reload();
  });
  $('name').addEventListener('input', (e) => save({ name: e.target.value }));
  $('persona').addEventListener('input', (e) => save({ persona: e.target.value }));
  $('face-style').addEventListener('change', (e) => save({ face: { style: e.target.value } }, { now: true }));
  $('colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    for (const s of $('colors').children) s.classList.toggle('on', s === b);
    save({ face: { color: b.dataset.color } }, { now: true });
  });
  $('voice-engine').addEventListener('change', (e) => {
    state.active.voice.engine = e.target.value;
    fillVoices();
    save({ voice: { engine: e.target.value, voice: $('voice-voice').value } }, { now: true });
  });
  $('voice-voice').addEventListener('change', (e) => save({ voice: { voice: e.target.value } }, { now: true }));
  $('voice-output').addEventListener('change', (e) => {
    save({ voice: { outputDeviceId: e.target.value } }, { now: true });
    state.active.voice.outputDeviceId = e.target.value;
    applySink();
  });
  $('voice-speed').addEventListener('input', (e) => {
    $('voice-speed-label').textContent = `${Number(e.target.value).toFixed(2)}×`;
    save({ voice: { speed: Number(e.target.value) } });
  });
  $('voice-captions').addEventListener('change', (e) => save({ voice: { captions: e.target.checked } }, { now: true }));
  $('voice-test').addEventListener('click', async () => {
    await flushSave();
    call(api.say, `Hi, I am ${state.active.name}. This is how I sound.`).catch((err) => setStatus('voice-status', err.message, 'error'));
  });
  $('ears-device').addEventListener('change', (e) => {
    state.active.ears.deviceId = e.target.value;
    save({ ears: { deviceId: e.target.value } }, { now: true });
    if (ears.on) { stopListening(); startListening(); }
  });
  $('ears-sensitivity').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    $('ears-sens-label').textContent = `${Math.round(v * 100)}%`;
    state.active.ears.sensitivity = v;
    ears.detector?.setSensitivity(v);
    save({ ears: { sensitivity: v } });
  });
  $('eyes-camera').addEventListener('change', (e) => {
    state.active.eyes.cameraId = e.target.value;
    save({ eyes: { cameraId: e.target.value } }, { now: true });
    if (!e.target.value) showSight(null);
  });
  $('eyes-refresh').addEventListener('click', async () => {
    state.cameras = await api.refreshCameras();
    fillCameras();
  });
  $('eyes-pip').addEventListener('change', (e) => save({ eyes: { pip: e.target.checked } }, { now: true }));

  $('face-window').addEventListener('click', async () => {
    try {
      if (state.faceWindowOpen) await call(api.closeFaceWindow);
      else await call(api.openFaceWindow, { displayId: $('display-select').value || null, fullscreen: $('fullscreen').checked });
      state.faceWindowOpen = !state.faceWindowOpen;
      fillDisplaysAndTvs();
      setStatus('cast-status', state.faceWindowOpen ? 'The face is in its own window. Press F11 there for full screen.' : '');
    } catch (err) {
      setStatus('cast-status', err.message, 'error');
    }
  });
  $('tv-select').addEventListener('change', updateTvButton);
  $('tv-cast').addEventListener('click', async () => {
    const tvId = $('tv-select').value;
    const tv = (state.tvs || []).find((t) => t.id === tvId);
    if (!tv) return;
    try {
      if (tv.casting) {
        await call(api.stopTv, tvId);
        setStatus('cast-status', `Stopped casting to ${tv.name}.`);
      } else {
        setStatus('cast-status', `Casting to ${tv.name}…`);
        const r = await call(api.castTv, tvId);
        setStatus('cast-status', `${r.message} The voice plays on this computer's sound device.`, 'ok');
      }
      state.tvs = await api.listTvs();
      fillDisplaysAndTvs();
    } catch (err) {
      setStatus('cast-status', err.message, 'error');
    }
  });

  $('composer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('message').value.trim();
    if (!text || activity === 'thinking') return;
    $('message').value = '';
    stopVoice();
    try {
      await call(api.talk, text);
    } catch (err) {
      addTurn({ role: 'error', text: err.message });
    }
  });
  $('clear-history').addEventListener('click', async () => {
    await call(api.clearHistory);
    renderTranscript([]);
  });
  $('listen').addEventListener('click', () => (ears.on ? stopListening() : startListening()));
}

// ── Model picker ───────────────────────────────────────────────────────────

function loadAgentSelector() {
  return new Promise((resolve) => {
    if (customElements.get('robos-agent-selector')) return resolve(true);
    const a = document.createElement('script');
    a.src = '../../robos-lib/agent-selector.js';
    a.onload = () => resolve(true);
    a.onerror = () => {
      const b = document.createElement('script');
      b.src = 'file:///usr/local/share/robos/robos-lib/agent-selector.js';
      b.onload = () => resolve(true);
      b.onerror = () => resolve(false);
      document.head.appendChild(b);
    };
    document.head.appendChild(a);
  });
}

async function mountAgentSelector() {
  const slot = $('agent-slot');
  if (!(await loadAgentSelector())) {
    slot.innerHTML = '<p class="status" data-kind="warn">The RobOS agent picker is not installed. Answers use the agent set as active in RobOS Agents.</p>';
    return;
  }
  agentEl = document.createElement('robos-agent-selector');
  slot.appendChild(agentEl);
  agentEl.addEventListener('change', () => {
    const v = agentEl.value;
    if (!v.provider || agentEl.loading) return;
    const cur = state.active.model;
    if (cur.provider === v.provider && cur.model === v.model && cur.effort === v.effort) return;
    state.active.model = { ...v };
    save({ model: v }, { now: true });
    const p = agentEl.provider;
    if (!state.testBrain) setStatus('model-status', p && !p.available ? (p.error || `${p.label} is not signed in.`) : '', p && !p.available ? 'warn' : '');
  });
  const m = state.active.model;
  try {
    await agentEl.load({ provider: m.provider, model: m.model, effort: m.effort });
  } catch (err) {
    setStatus('model-status', err.message, 'error');
  }
}

// ── Conversation ───────────────────────────────────────────────────────────

function turnHtml(t) {
  const who = t.role === 'user' ? 'You' : (t.role === 'error' ? 'Problem' : state.active.name);
  const meta = [];
  if (t.viaEars) meta.push('heard');
  if (t.saw) meta.push('looked');
  if (t.mood && t.role === 'assistant') meta.push(t.mood);
  return `<li class="turn ${esc(t.role)}"><div class="who">${esc(who)}${meta.length ? ` <span class="muted">· ${esc(meta.join(' · '))}</span>` : ''}</div><div class="text">${esc(t.text)}</div></li>`;
}

function renderTranscript(history) {
  const list = $('transcript');
  list.innerHTML = (history || []).map(turnHtml).join('')
    || `<li class="empty muted">Say hello. Type below, or press Listen and talk.</li>`;
  list.scrollTop = list.scrollHeight;
}

function addTurn(t) {
  const list = $('transcript');
  list.querySelector('.empty')?.remove();
  list.insertAdjacentHTML('beforeend', turnHtml(t));
  list.scrollTop = list.scrollHeight;
}

function setActivity(a) {
  activity = a;
  $('activity').textContent = a;
  $('activity').dataset.activity = a;
  $('send').disabled = a === 'thinking';
  $('message').placeholder = a === 'thinking' ? `${state?.active.name || 'It'} is thinking…` : 'Type something to say to it…';
}

// ── Voice playback with lip sync ───────────────────────────────────────────

const voice = { ctx: null, analyser: null, source: null, speech: null, raf: 0, timer: 0 };

function voiceGraph() {
  if (!voice.ctx) {
    voice.ctx = new AudioContext();
    voice.source = voice.ctx.createMediaElementSource($('voice-audio'));
    voice.analyser = voice.ctx.createAnalyser();
    voice.analyser.fftSize = 1024;
    voice.source.connect(voice.analyser);
    voice.analyser.connect(voice.ctx.destination);
    applySink();
  }
  return voice;
}

function applySink() {
  const id = state?.active.voice.outputDeviceId || 'default';
  if (voice.ctx && typeof voice.ctx.setSinkId === 'function') {
    voice.ctx.setSinkId(id === 'default' ? '' : id).catch((err) => setStatus('voice-status', `Could not use that sound device: ${err.message}`, 'error'));
  }
}

function stopVoice() {
  cancelAnimationFrame(voice.raf);
  clearTimeout(voice.timer);
  const a = $('voice-audio');
  try { a.pause(); } catch {}
  if (voice.speech) api.speechDone({ id: voice.speech.id });
  voice.speech = null;
}

function playSpeech(msg) {
  stopVoice();
  const speech = { ...msg, started: performance.now() };
  voice.speech = speech;
  const duration = msg.audioUrl ? 0 : core.textDurationMs(msg.text);
  let lastSent = 0;
  let lastWords = -1;
  const buf = new Float32Array(1024);
  const follower = new core.MouthFollower();
  const audio = $('voice-audio');

  function finish() {
    if (voice.speech !== speech) return;
    cancelAnimationFrame(voice.raf);
    voice.speech = null;
    api.speechDone({ id: speech.id });
  }

  function tick(now) {
    if (voice.speech !== speech) return;
    let pos;
    let mouth;
    if (msg.audioUrl) {
      pos = audio.duration > 0 && Number.isFinite(audio.duration) ? audio.currentTime / audio.duration : 0;
      voice.analyser.getFloatTimeDomainData(buf);
      mouth = follower.push(core.rms(buf));
    } else {
      pos = (now - speech.started) / duration;
      mouth = core.mouthFromText(msg.text, pos, now);
      if (pos >= 1) return finish();
    }
    if (now - lastSent > 33) {
      lastSent = now;
      const words = core.wordsSpoken(msg.text, pos);
      api.speechProgress({ id: speech.id, mouth, words: words !== lastWords ? words : undefined });
      lastWords = words;
    }
    voice.raf = requestAnimationFrame(tick);
  }

  if (msg.audioUrl) {
    const g = voiceGraph();
    if (g.ctx.state === 'suspended') g.ctx.resume().catch(() => {});
    audio.src = msg.audioUrl;
    audio.onended = finish;
    audio.onerror = () => {
      setStatus('voice-status', 'The voice audio could not be played; showing captions only.', 'warn');
      // Fall back to text timing for this line.
      msg.audioUrl = null;
      playSpeech(msg);
    };
    audio.play().then(() => { voice.raf = requestAnimationFrame(tick); }).catch(() => audio.onerror());
    // Never leave the face stuck speaking if the audio stalls.
    voice.timer = setTimeout(finish, Math.max(5000, (msg.durationMs || 0) + 4000) + msg.text.length * 90);
  } else {
    voice.raf = requestAnimationFrame(tick);
  }
  if (msg.voiceNote) setStatus('voice-status', `No sound: ${msg.voiceNote}`, 'warn');
  else if (msg.engine && msg.engine !== 'captions') setStatus('voice-status', `Speaking with ${msg.engine}.`, 'ok');
}

// ── Ears: microphone → words ───────────────────────────────────────────────

const ears = { on: false, stream: null, ctx: null, node: null, detector: null, lastLevelSent: 0, seq: 0 };

async function startListening() {
  if (ears.on) return;
  if (!state.earsInstalled) {
    setStatus('ears-status', 'RobOS Voice is not installed, so there is no speech recognition.', 'warn');
    return;
  }
  const deviceId = state.active.ears.deviceId;
  try {
    ears.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId && deviceId !== 'default' ? { deviceId: { exact: deviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    setStatus('ears-status', `Could not open the microphone: ${err.message}`, 'error');
    return;
  }
  ears.on = true;
  ears.ctx = new AudioContext();
  const src = ears.ctx.createMediaStreamSource(ears.stream);
  ears.node = ears.ctx.createScriptProcessor(4096, 1, 1);
  const rate = ears.ctx.sampleRate;
  ears.detector = new core.UtteranceDetector({
    sensitivity: state.active.ears.sensitivity,
    onStart: () => {
      api.hearing(true);
      setStatus('ears-status', 'Hearing you…', 'ok');
    },
    onPartial: (samples) => {
      api.hear({ samples, final: false }).catch(() => {});
    },
    onEnd: async (samples) => {
      api.hearing(false);
      setStatus('ears-status', 'Working out what you said…');
      try {
        const r = await call(api.hear, { samples, final: true });
        setStatus('ears-status', r.text ? `Heard: “${r.text}”` : 'Did not catch any words.', r.text ? '' : 'warn');
      } catch (err) {
        setStatus('ears-status', err.message, 'error');
      }
    },
  });
  ears.node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const chunk = core.downsample(input, rate, core.SAMPLE_RATE);
    // While it talks or thinks, it does not listen (so it never hears itself).
    if (activity === 'speaking' || activity === 'thinking') {
      if (ears.detector.speaking) api.hearing(false);
      ears.detector.reset();
      meter(0);
      return;
    }
    ears.detector.push(chunk);
    meter(ears.detector.level);
  };
  src.connect(ears.node);
  ears.node.connect(ears.ctx.destination);
  api.ears({ listening: true });
  $('listen').setAttribute('aria-pressed', 'true');
  $('listen').textContent = 'Stop listening';
  setStatus('ears-status', 'Listening. Just talk.', 'ok');
  // Device names show once the microphone is allowed.
  refreshDevices();
}

function meter(level) {
  $('ears-meter').style.width = `${Math.min(100, Math.round(level * 900))}%`;
  const now = performance.now();
  if (now - ears.lastLevelSent > 100) {
    ears.lastLevelSent = now;
    api.ears({ level });
  }
}

function stopListening() {
  if (!ears.on) return;
  ears.on = false;
  try { ears.node.disconnect(); } catch {}
  try { ears.stream.getTracks().forEach((t) => t.stop()); } catch {}
  try { ears.ctx.close(); } catch {}
  ears.node = ears.stream = ears.ctx = ears.detector = null;
  api.hearing(false);
  api.ears({ listening: false, level: 0 });
  $('ears-meter').style.width = '0%';
  $('listen').setAttribute('aria-pressed', 'false');
  $('listen').textContent = 'Listen';
  setStatus('ears-status', 'Not listening.');
}

// ── Start ──────────────────────────────────────────────────────────────────

async function reload() {
  state = await api.getState();
  fillForm();
  setActivity(state.activity);
  if (state.faceUrl && $('face-frame').src !== state.faceUrl) $('face-frame').src = state.faceUrl;
}

api.onTurn((t) => {
  if (t.personalityId && t.personalityId !== state.active.id) return;
  addTurn(t);
});
api.onSpeak(playSpeech);
api.onActivity(({ activity: a }) => setActivity(a));
api.onEyes((s) => { state.eyes = s; showEyesStatus(s); });
api.onSight((s) => { state.sight = s; showSight(s); });

(async function init() {
  bindForm();
  await reload();
  await mountAgentSelector();
  $('message').focus();
})();

// Tests read the window's state from here.
window.__personalityApp = () => ({ activity, listening: ears.on, speaking: Boolean(voice.speech), transcript: [...document.querySelectorAll('#transcript .turn')].map((li) => ({ role: li.classList[1], text: li.querySelector('.text').textContent })) });
