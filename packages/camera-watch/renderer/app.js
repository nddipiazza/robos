'use strict';

/* global window, document */

const api = window.robos;
const $ = (id) => document.getElementById(id);

const state = {
  cameras: [],
  status: new Map(),
  scores: new Map(),
  events: [],
  recordings: [],
  settings: null,
  cols: 2,
  focusId: null,
  editing: null,
  kind: 'onvif',
  zoneEdit: false,
  activeRec: null,
};

async function call(fn, ...args) {
  const r = await fn(...args);
  if (!r || !r.ok) throw new Error(r?.error || 'Something went wrong.');
  return r.data;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer = null;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 6000 : 3000);
}

function banner(msg, isError = false) {
  const b = $('banner');
  b.textContent = msg || '';
  b.classList.toggle('error', isError);
  b.classList.toggle('hidden', !msg);
}

function cameraStatus(cam) {
  return state.status.get(cam.id) || cam.status || { state: cam.enabled ? 'connecting' : 'disabled' };
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
}
function fmtDay(iso) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}
function fmtSize(bytes) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}
function cameraAddress(cam) {
  if (cam.kind === 'onvif') return `${cam.onvif?.hostname}:${cam.onvif?.port} (ONVIF)`;
  if (cam.kind === 'device') return `Webcam: ${cam.device?.name}${cam.device?.videoSize ? ` · ${cam.device.videoSize}` : ''}`;
  try {
    const u = new URL(cam.streamUrl);
    u.password = '';
    u.username = '';
    return u.toString();
  } catch {
    return cam.streamUrl;
  }
}

function stateLabel(st) {
  if (st.state === 'live') return { text: 'Live', cls: 'live' };
  if (st.state === 'connecting') return { text: 'Connecting…', cls: '' };
  if (st.state === 'error') return { text: 'Offline', cls: 'error' };
  if (st.state === 'disabled' || st.state === 'stopped') return { text: 'Off', cls: '' };
  return { text: st.state, cls: '' };
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'events') loadEvents();
  if (name === 'recordings') loadRecordings();
  if (name === 'settings') loadSettings();
  if (name === 'cameras') renderCameraList();
}

// ── Live grid ────────────────────────────────────────────────────────────────
$('layout-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-cols]');
  if (!b) return;
  state.cols = Number(b.dataset.cols);
  try { localStorage.setItem('camera-watch.cols', String(state.cols)); } catch {}
  applyCols();
});

function applyCols() {
  document.querySelectorAll('#layout-seg button').forEach((b) => b.classList.toggle('active', Number(b.dataset.cols) === state.cols));
  $('live-grid').style.setProperty('--cols', String(state.cols));
}

function renderLive() {
  const grid = $('live-grid');
  const enabled = state.cameras.filter((c) => c.enabled);
  $('live-empty').classList.toggle('hidden', state.cameras.length > 0);
  // Keep existing tiles (and their open streams); add and remove only what changed.
  const keep = new Set(enabled.map((c) => c.id));
  grid.querySelectorAll('.tile').forEach((t) => { if (!keep.has(t.dataset.id)) { t.querySelector('img').src = ''; t.remove(); } });
  enabled.forEach((cam, i) => {
    let tile = grid.querySelector(`.tile[data-id="${cam.id}"]`);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.id = cam.id;
      tile.innerHTML = `
        <img alt="" />
        <div class="tile-msg"></div>
        <div class="tile-label"><span class="t-name"></span><span class="spacer"></span><span class="pill t-rec hidden rec">REC</span><span class="pill t-motion hidden motion">MOTION</span><span class="pill t-state"></span></div>
        <div class="tile-foot"><span class="t-fps"></span><div class="tile-meter"><div></div></div></div>`;
      tile.addEventListener('click', () => openFocus(cam.id));
      tile.addEventListener('dblclick', (e) => { e.stopPropagation(); tile.requestFullscreen?.(); });
    }
    // The live stream survives camera reconnects; a saved edit restarts the camera
    // and closes it, so open it again then.
    if (tile.dataset.src !== cam.liveUrl) {
      tile.dataset.src = cam.liveUrl;
      tile.querySelector('img').src = cam.liveUrl;
    }
    if (grid.children[i] !== tile) grid.insertBefore(tile, grid.children[i] || null);
    updateTile(cam);
  });
  updateKpis();
}

function updateTile(cam) {
  const tile = document.querySelector(`.tile[data-id="${cam.id}"]`);
  if (!tile) return;
  const st = cameraStatus(cam);
  const lbl = stateLabel(st);
  tile.querySelector('.t-name').textContent = cam.name;
  const pill = tile.querySelector('.t-state');
  pill.textContent = lbl.text;
  pill.className = `pill t-state ${lbl.cls}`;
  tile.querySelector('.t-motion').classList.toggle('hidden', !st.motion);
  tile.querySelector('.t-rec').classList.toggle('hidden', !st.recording);
  tile.classList.toggle('motion', Boolean(st.motion));
  tile.querySelector('.t-fps').textContent = st.state === 'live' && st.fps ? `${st.fps} fps` : '';
  const msg = tile.querySelector('.tile-msg');
  const live = st.state === 'live';
  msg.classList.toggle('hidden', live);
  msg.classList.toggle('error', st.state === 'error');
  msg.textContent = live ? '' : (st.state === 'error' ? st.error : 'Connecting to the camera…');
  const score = state.scores.get(cam.id) ?? st.motionScore ?? 0;
  tile.querySelector('.tile-meter > div').style.width = `${Math.min(100, (score / Math.max(0.1, cam.motion?.minAreaPercent || 1.5)) * 50)}%`;
}

function updateKpis() {
  const enabled = state.cameras.filter((c) => c.enabled);
  const live = enabled.filter((c) => cameraStatus(c).state === 'live').length;
  const motion = enabled.filter((c) => cameraStatus(c).motion).length;
  $('kpi-live').textContent = `${live} / ${enabled.length}`;
  $('kpi-motion').textContent = String(motion);
  const today = new Date().toDateString();
  $('kpi-events').textContent = String(state.events.filter((e) => new Date(e.startedAt).toDateString() === today).length);
}

// ── Focused camera ───────────────────────────────────────────────────────────
function focusedCamera() {
  return state.cameras.find((c) => c.id === state.focusId) || null;
}

async function openFocus(id) {
  state.focusId = id;
  const cam = focusedCamera();
  if (!cam) return;
  $('focus-title').textContent = cam.name;
  $('focus-img').src = cam.liveUrl;
  $('focus-overlay').classList.remove('hidden');
  setZoneEdit(false);
  fillMotionControls(cam);
  updateFocus();
  const hasPtz = cam.kind === 'onvif' && cam.onvif?.ptz;
  $('ptz-block').classList.toggle('hidden', !hasPtz);
  $('m-camera-wrap').classList.toggle('hidden', cam.kind !== 'onvif');
  const sel = $('ptz-presets');
  sel.innerHTML = '<option value="">Go to preset…</option>';
  if (hasPtz) {
    try {
      const presets = await call(api.ptzPresets, id);
      for (const p of presets) sel.insertAdjacentHTML('beforeend', `<option value="${esc(p.token)}">${esc(p.name)}</option>`);
    } catch { /* no presets */ }
  }
}

function closeFocus() {
  state.focusId = null;
  $('focus-img').src = '';
  $('focus-overlay').classList.add('hidden');
  setZoneEdit(false);
}

function updateFocus() {
  const cam = focusedCamera();
  if (!cam) return;
  const st = cameraStatus(cam);
  const lbl = stateLabel(st);
  const pill = $('focus-state');
  pill.textContent = st.motion ? 'MOTION' : lbl.text;
  pill.className = `pill ${st.motion ? 'motion' : lbl.cls}`;
  const rec = $('focus-record');
  rec.textContent = st.recording ? 'Stop recording' : 'Record';
  rec.classList.toggle('recording', Boolean(st.recording));
  const score = state.scores.get(cam.id) ?? st.motionScore ?? 0;
  const area = cam.motion?.minAreaPercent || 1.5;
  const scale = Math.max(area * 2, 4);
  $('focus-meter').style.width = `${Math.min(100, (score / scale) * 100)}%`;
  $('focus-meter').classList.toggle('hot', score >= area);
  $('focus-meter-mark').style.left = `${(area / scale) * 100}%`;
}

function fillMotionControls(cam) {
  const m = cam.motion || {};
  $('m-enabled').checked = Boolean(m.enabled);
  $('m-record').checked = Boolean(m.record);
  $('m-camera').checked = Boolean(m.useCameraEvents);
  $('m-sensitivity').value = m.sensitivity ?? 60;
  $('m-area').value = m.minAreaPercent ?? 1.5;
  $('m-sens-val').textContent = String(m.sensitivity ?? 60);
  $('m-area-val').textContent = `${m.minAreaPercent ?? 1.5}%`;
  $('m-zones-hint').textContent = (m.zones || []).length
    ? `${m.zones.length} zone${m.zones.length > 1 ? 's' : ''}. Only motion inside ${m.zones.length > 1 ? 'them' : 'it'} counts.`
    : 'Watching the whole picture. Draw zones to watch only part of it.';
}

async function saveMotion(patch) {
  const cam = focusedCamera();
  if (!cam) return;
  try {
    const saved = await call(api.setMotion, cam.id, patch);
    replaceCamera(saved);
    fillMotionControls(saved);
  } catch (err) {
    toast(err.message, true);
  }
}

$('focus-close').addEventListener('click', closeFocus);
$('focus-overlay').addEventListener('click', (e) => { if (e.target.id === 'focus-overlay') closeFocus(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('cam-dialog').classList.contains('hidden')) closeCamDialog();
  else if (!$('discover-dialog').classList.contains('hidden')) $('discover-dialog').classList.add('hidden');
  else if (state.focusId) closeFocus();
});
$('focus-full').addEventListener('click', () => $('focus-video-wrap').requestFullscreen?.());
$('focus-snapshot').addEventListener('click', async () => {
  try {
    await call(api.snapshot, state.focusId);
    toast('Snapshot saved to Recordings.');
  } catch (err) { toast(err.message, true); }
});
$('focus-record').addEventListener('click', async () => {
  const cam = focusedCamera();
  if (!cam) return;
  try {
    const st = cameraStatus(cam);
    const s = st.recording ? await call(api.stopRecording, cam.id) : await call(api.startRecording, cam.id);
    if (s) state.status.set(cam.id, s);
    updateFocus();
  } catch (err) { toast(err.message, true); }
});

$('m-enabled').addEventListener('change', (e) => saveMotion({ enabled: e.target.checked }));
$('m-record').addEventListener('change', (e) => saveMotion({ record: e.target.checked }));
$('m-camera').addEventListener('change', (e) => saveMotion({ useCameraEvents: e.target.checked }));
$('m-sensitivity').addEventListener('input', (e) => { $('m-sens-val').textContent = e.target.value; });
$('m-sensitivity').addEventListener('change', (e) => saveMotion({ sensitivity: Number(e.target.value) }));
$('m-area').addEventListener('input', (e) => { $('m-area-val').textContent = `${e.target.value}%`; });
$('m-area').addEventListener('change', (e) => saveMotion({ minAreaPercent: Number(e.target.value) }));
$('m-zones-clear').addEventListener('click', () => { saveMotion({ zones: [] }); drawZones(); });
$('m-zones-edit').addEventListener('click', () => setZoneEdit(!state.zoneEdit));

// Zones: drag rectangles over the focused video.
function setZoneEdit(on) {
  state.zoneEdit = on;
  $('m-zones-edit').textContent = on ? 'Done drawing' : 'Draw zones';
  $('zone-canvas').classList.toggle('hidden', !on);
  if (on) drawZones();
}

function zoneCanvasFit() {
  const img = $('focus-img');
  const canvas = $('zone-canvas');
  const r = img.getBoundingClientRect();
  const wrap = $('focus-video-wrap').getBoundingClientRect();
  canvas.style.left = `${r.left - wrap.left}px`;
  canvas.style.top = `${r.top - wrap.top}px`;
  canvas.width = Math.max(1, Math.round(r.width));
  canvas.height = Math.max(1, Math.round(r.height));
  return canvas;
}

function drawZones(extra) {
  const cam = focusedCamera();
  if (!cam) return;
  const canvas = zoneCanvasFit();
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const zones = [...(cam.motion?.zones || []), ...(extra ? [extra] : [])];
  if (!zones.length) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (const z of zones) {
    ctx.fillStyle = 'rgba(20,184,166,0.22)';
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;
    ctx.fillRect(z.x * canvas.width, z.y * canvas.height, z.w * canvas.width, z.h * canvas.height);
    ctx.strokeRect(z.x * canvas.width, z.y * canvas.height, z.w * canvas.width, z.h * canvas.height);
  }
}

(() => {
  const canvas = $('zone-canvas');
  let start = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  canvas.addEventListener('mousedown', (e) => { start = pos(e); });
  canvas.addEventListener('mousemove', (e) => { if (start) drawZones(rect(start, pos(e))); });
  window.addEventListener('mouseup', (e) => {
    if (!start) return;
    const z = rect(start, pos(e));
    start = null;
    const cam = focusedCamera();
    if (cam && z.w > 0.02 && z.h > 0.02) {
      const zones = [...(cam.motion?.zones || []), z];
      saveMotion({ zones }).then(drawZones);
    } else {
      drawZones();
    }
  });
  window.addEventListener('resize', () => { if (state.zoneEdit) drawZones(); });
})();

// PTZ: hold a button to move, release to stop.
document.querySelectorAll('[data-ptz]').forEach((btn) => {
  const go = async () => {
    const [p, t, z] = btn.dataset.ptz.split(',').map(Number);
    const speed = Number($('ptz-speed').value) || 0.5;
    try { await call(api.ptzMove, state.focusId, { pan: p * speed, tilt: t * speed, zoom: z * speed }); } catch (err) { toast(err.message, true); }
  };
  const stop = () => call(api.ptzStop, state.focusId).catch(() => {});
  btn.addEventListener('mousedown', go);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', (e) => { if (e.buttons) stop(); });
});
document.querySelector('[data-ptz-home]').addEventListener('click', () => call(api.ptzStop, state.focusId).catch(() => {}));
$('ptz-presets').addEventListener('change', async (e) => {
  if (!e.target.value) return;
  try { await call(api.ptzGoto, state.focusId, e.target.value); } catch (err) { toast(err.message, true); }
  e.target.value = '';
});

// ── Cameras tab ──────────────────────────────────────────────────────────────
function renderCameraList() {
  const list = $('cam-list');
  if (!state.cameras.length) {
    list.innerHTML = '<div class="empty"><h2>No cameras yet</h2><p>Add one with <b>Add camera</b> or <b>Find cameras</b>.</p></div>';
    return;
  }
  list.innerHTML = state.cameras.map((cam) => {
    const st = cameraStatus(cam);
    const lbl = stateLabel(st);
    const model = [cam.onvif?.manufacturer, cam.onvif?.model].filter(Boolean).join(' ');
    return `
      <div class="card cam-card" data-id="${esc(cam.id)}">
        ${st.state === 'live'
          ? `<img class="thumb" alt="" src="${esc(/^http/.test(cam.frameUrl) ? `${cam.frameUrl}&r=${Date.now()}` : cam.frameUrl)}" />`
          : '<div class="thumb"></div>'}
        <div class="info">
          <div class="row" style="align-items:center"><strong>${esc(cam.name)}</strong><span class="pill ${lbl.cls}">${esc(lbl.text)}</span>${cam.onvif?.ptz ? '<span class="pill">PTZ</span>' : ''}${cam.motion?.enabled ? '<span class="pill">Motion</span>' : ''}</div>
          <div class="addr" title="${esc(cameraAddress(cam))}">${esc(cameraAddress(cam))}</div>
          ${model ? `<div class="muted small">${esc(model)}</div>` : ''}
          ${st.state === 'error' && st.error ? `<div class="err">${esc(st.error)}</div>` : ''}
          <div class="actions">
            <button type="button" class="btn btn-small" data-act="view">View</button>
            <button type="button" class="btn btn-small" data-act="edit">Edit</button>
            <button type="button" class="btn btn-small" data-act="toggle">${cam.enabled ? 'Turn off' : 'Turn on'}</button>
            <button type="button" class="btn btn-small btn-danger" data-act="remove">Remove</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

$('cam-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('.cam-card').dataset.id;
  const cam = state.cameras.find((c) => c.id === id);
  if (!cam) return;
  try {
    if (btn.dataset.act === 'view') {
      if (!cam.enabled) { toast('Turn the camera on first.'); return; }
      showTab('live');
      openFocus(id);
    } else if (btn.dataset.act === 'edit') {
      openCamDialog(cam);
    } else if (btn.dataset.act === 'toggle') {
      replaceCamera(await call(api.setEnabled, id, !cam.enabled));
    } else if (btn.dataset.act === 'remove') {
      if (!window.confirm(`Remove "${cam.name}"? Its recordings stay in the recordings folder.`)) return;
      await call(api.removeCamera, id);
      state.cameras = state.cameras.filter((c) => c.id !== id);
      renderAll();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

function replaceCamera(cam) {
  const i = state.cameras.findIndex((c) => c.id === cam.id);
  if (i >= 0) state.cameras[i] = cam; else state.cameras.push(cam);
  if (cam.status) state.status.set(cam.id, cam.status);
  renderAll();
}

function renderAll() {
  renderLive();
  if ($('tab-cameras').classList.contains('active')) renderCameraList();
  fillCameraSelects();
}

function fillCameraSelects() {
  for (const id of ['events-camera', 'rec-camera']) {
    const sel = $(id);
    const v = sel.value;
    sel.innerHTML = '<option value="">All cameras</option>' + state.cameras.map((c) => `<option value="${esc(id === 'rec-camera' ? c.name : c.id)}">${esc(c.name)}</option>`).join('');
    sel.value = v;
  }
}

// ── Add / edit dialog ────────────────────────────────────────────────────────
function setKind(kind) {
  state.kind = kind;
  document.querySelectorAll('#f-kind-seg button').forEach((b) => b.classList.toggle('active', b.dataset.kind === kind));
  $('f-onvif-fields').classList.toggle('hidden', kind !== 'onvif');
  $('f-url-fields').classList.toggle('hidden', kind !== 'url');
  $('f-device-fields').classList.toggle('hidden', kind !== 'device');
  $('f-login-row').classList.toggle('hidden', kind === 'device');
  $('f-transport-row').classList.toggle('hidden', kind === 'device');
  if (kind === 'device' && !state.devicesLoaded) loadLocalDevices();
}

async function loadLocalDevices() {
  const sel = $('f-device');
  const keep = sel.value || state.editing?.device?.name || '';
  sel.innerHTML = '<option value="">Looking for webcams…</option>';
  try {
    const devices = await call(api.listLocalDevices);
    state.devicesLoaded = true;
    state.devices = devices;
    if (!devices.length) {
      sel.innerHTML = '<option value="">No webcams found</option>';
      return;
    }
    sel.innerHTML = devices.map((d) => {
      const taken = d.usedBy && d.name !== state.editing?.device?.name;
      return `<option value="${esc(d.name)}" data-format="${esc(d.format)}" ${taken ? 'disabled' : ''}>${esc(d.label)}${taken ? ` (already added as ${esc(d.usedBy)})` : ''}</option>`;
    }).join('');
    if (keep && devices.some((d) => d.name === keep)) sel.value = keep;
    else {
      const free = devices.find((d) => !d.usedBy);
      if (free) sel.value = free.name;
    }
    if (!$('f-name').value && sel.value) {
      $('f-name').value = devices.find((d) => d.name === sel.value)?.label || '';
    }
  } catch (err) {
    sel.innerHTML = `<option value="">${esc(err.message)}</option>`;
  }
}
$('f-device-refresh').addEventListener('click', () => { state.devicesLoaded = false; loadLocalDevices(); });
$('f-kind-seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (b) setKind(b.dataset.kind);
});

function openCamDialog(cam = null, prefill = {}) {
  state.editing = cam;
  $('cam-dialog-title').textContent = cam ? `Edit ${cam.name}` : 'Add camera';
  $('f-id').value = cam?.id || '';
  $('f-name').value = cam?.name || prefill.name || '';
  $('f-host').value = cam?.onvif?.hostname || prefill.hostname || '';
  $('f-port').value = cam?.onvif?.port || prefill.port || 80;
  $('f-path').value = cam?.onvif?.path || prefill.path || '/onvif/device_service';
  $('f-url').value = cam?.kind === 'url' ? cam.streamUrl : '';
  $('f-user').value = cam?.username || '';
  $('f-pass').value = '';
  $('f-pass').placeholder = cam?.hasPassword ? 'Unchanged' : '';
  $('f-transport').value = cam?.rtspTransport || 'tcp';
  const profSel = $('f-profile');
  profSel.innerHTML = '<option value="">Camera default</option>';
  if (cam?.onvif?.profileToken) profSel.insertAdjacentHTML('beforeend', `<option value="${esc(cam.onvif.profileToken)}">${esc(cam.onvif.profileToken)}</option>`);
  profSel.value = cam?.onvif?.profileToken || '';
  $('f-test-result').classList.add('hidden');
  $('f-device-size').value = cam?.device?.videoSize || '';
  state.devicesLoaded = false;
  if (cam?.kind === 'device') $('f-device').innerHTML = `<option value="${esc(cam.device.name)}">${esc(cam.device.name)}</option>`;
  setKind(cam?.kind || prefill.kind || 'onvif');
  $('cam-dialog').classList.remove('hidden');
  $('f-name').focus();
}

function closeCamDialog() {
  $('cam-dialog').classList.add('hidden');
  state.editing = null;
}

function formInput() {
  return {
    id: $('f-id').value || undefined,
    name: $('f-name').value,
    kind: state.kind,
    streamUrl: state.kind === 'url' ? $('f-url').value.trim() : undefined,
    username: $('f-user').value.trim(),
    password: $('f-pass').value,
    rtspTransport: $('f-transport').value,
    onvif: state.kind === 'onvif'
      ? { hostname: $('f-host').value.trim(), port: Number($('f-port').value) || 80, path: $('f-path').value.trim(), profileToken: $('f-profile').value }
      : undefined,
    device: state.kind === 'device'
      ? {
          name: $('f-device').value,
          format: $('f-device').selectedOptions[0]?.dataset.format || state.editing?.device?.format || undefined,
          videoSize: $('f-device-size').value.trim(),
        }
      : undefined,
  };
}

$('btn-add').addEventListener('click', () => openCamDialog());
$('f-cancel').addEventListener('click', closeCamDialog);
$('f-test').addEventListener('click', async () => {
  const out = $('f-test-result');
  out.className = 'test-result';
  out.textContent = 'Connecting to the camera…';
  $('f-test').disabled = true;
  try {
    const r = await call(api.testCamera, formInput());
    out.className = 'test-result ok';
    const model = [r.manufacturer, r.model].filter(Boolean).join(' ');
    out.innerHTML = `<img src="${esc(r.preview)}" alt="" /><div><strong>It works.</strong>${model ? `<div>${esc(model)}</div>` : ''}<div class="muted small">${esc(r.streamUri || '')}</div>${r.ptz ? '<div>Has pan/tilt/zoom.</div>' : ''}</div>`;
    if (Array.isArray(r.profiles) && r.profiles.length) {
      const sel = $('f-profile');
      const keep = sel.value || r.profileToken;
      sel.innerHTML = r.profiles.map((p) => `<option value="${esc(p.token)}">${esc(p.name)}${p.width ? ` · ${p.width}×${p.height}` : ''}${p.encoding ? ` · ${esc(p.encoding)}` : ''}</option>`).join('');
      sel.value = keep;
    }
    if (!$('f-name').value && model) $('f-name').value = model;
  } catch (err) {
    out.className = 'test-result fail';
    out.textContent = err.message;
  } finally {
    $('f-test').disabled = false;
  }
});

$('cam-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('f-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const saved = await call(api.saveCamera, formInput());
    replaceCamera(saved);
    closeCamDialog();
    toast(`${saved.name} saved.`);
  } catch (err) {
    const out = $('f-test-result');
    out.className = 'test-result fail';
    out.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save camera';
  }
});

// ── Discovery ────────────────────────────────────────────────────────────────
async function runDiscovery() {
  const list = $('discover-list');
  list.innerHTML = '<div class="muted">Searching the network for 5 seconds…</div>';
  $('discover-again').disabled = true;
  try {
    const found = await call(api.discover, { timeoutMs: 5000 });
    if (!found.length) {
      list.innerHTML = '<div class="muted">No ONVIF cameras answered. Check that ONVIF is turned on in the camera\'s settings (many brands ship with it off), or add the camera by its stream address.</div>';
      return;
    }
    const known = new Set(state.cameras.filter((c) => c.kind === 'onvif').map((c) => c.onvif.hostname));
    list.innerHTML = found.map((d, i) => `
      <div class="discover-row">
        <div class="d-main"><strong>${esc(d.name || d.hardware || 'ONVIF camera')}</strong>
          <div class="muted small">${esc(d.hostname)}:${esc(d.port)}${d.hardware && d.name ? ` · ${esc(d.hardware)}` : ''}</div></div>
        ${known.has(d.hostname) ? '<span class="pill live">Added</span>' : `<button type="button" class="btn btn-small btn-primary" data-i="${i}">Add</button>`}
      </div>`).join('');
    list.querySelectorAll('button[data-i]').forEach((b) => b.addEventListener('click', () => {
      const d = found[Number(b.dataset.i)];
      $('discover-dialog').classList.add('hidden');
      openCamDialog(null, { kind: 'onvif', name: d.name || d.hardware || '', hostname: d.hostname, port: d.port, path: d.path });
      $('f-user').focus();
    }));
  } catch (err) {
    list.innerHTML = `<div class="test-result fail">${esc(err.message)}</div>`;
  } finally {
    $('discover-again').disabled = false;
  }
}
$('btn-discover').addEventListener('click', () => { $('discover-dialog').classList.remove('hidden'); runDiscovery(); });
$('discover-again').addEventListener('click', runDiscovery);
$('discover-close').addEventListener('click', () => $('discover-dialog').classList.add('hidden'));

// ── Events ───────────────────────────────────────────────────────────────────
async function loadEvents() {
  try {
    state.events = await call(api.listEvents, { cameraId: $('events-camera').value || undefined, limit: 300 });
  } catch (err) { toast(err.message, true); }
  renderEvents();
  updateKpis();
}

function renderEvents() {
  const list = $('event-list');
  if (!state.events.length) {
    list.innerHTML = '<div class="empty"><h2>No motion yet</h2><p>Motion events show up here with a picture from the moment motion started.</p></div>';
    return;
  }
  let lastDay = '';
  list.innerHTML = state.events.map((e) => {
    const day = fmtDay(e.startedAt);
    const head = day !== lastDay ? `<div class="day-head">${esc(day)}</div>` : '';
    lastDay = day;
    const secs = e.endedAt ? Math.round((new Date(e.endedAt) - new Date(e.startedAt)) / 1000) : null;
    const what = e.type === 'recording' ? 'Manual recording' : (e.source === 'camera' ? 'Motion (camera alarm)' : 'Motion');
    return `${head}
      <div class="event-row" data-id="${esc(e.id)}">
        ${e.thumbUrl ? `<img src="${esc(e.thumbUrl)}" alt="" />` : '<div class="noimg" style="width:128px"></div>'}
        <div class="ev-main">
          <span class="ev-title">${esc(e.cameraName)} · ${esc(what)}</span>
          <span class="muted">${esc(fmtTime(e.startedAt))}${secs !== null ? ` · ${secs} s` : ' · still going'}${e.peakScore ? ` · peak ${e.peakScore}% of picture` : ''}</span>
          ${e.error ? `<span class="err">${esc(e.error)}</span>` : ''}
        </div>
        ${e.videoUrl ? '<button type="button" class="btn btn-small" data-play>Play clip</button>' : ''}
      </div>`;
  }).join('');
}

$('events-camera').addEventListener('change', loadEvents);
$('btn-clear-events').addEventListener('click', async () => {
  if (!window.confirm('Clear the motion event list? Recordings are kept.')) return;
  try { await call(api.clearEvents, $('events-camera').value || undefined); loadEvents(); } catch (err) { toast(err.message, true); }
});
$('event-list').addEventListener('click', (e) => {
  const row = e.target.closest('.event-row');
  if (!row) return;
  const ev = state.events.find((x) => x.id === row.dataset.id);
  if (!ev) return;
  showTab('recordings');
  playMedia({ url: ev.videoUrl || ev.thumbUrl, kind: ev.videoUrl ? 'video' : 'snapshot', file: ev.video || ev.thumb, camera: ev.cameraName, day: ev.startedAt.slice(0, 10), time: fmtTime(ev.startedAt), reason: ev.type });
});

// ── Recordings ───────────────────────────────────────────────────────────────
async function loadRecordings() {
  try { state.recordings = await call(api.listRecordings, { limit: 1000 }); } catch (err) { toast(err.message, true); }
  renderRecordings();
}

function renderRecordings() {
  const cam = $('rec-camera').value;
  const kind = $('rec-kind').value;
  const items = state.recordings.filter((r) => (!cam || r.camera === cam.replace(/[^\w .-]+/g, '_')) && (!kind || r.kind === kind));
  const total = items.reduce((a, r) => a + r.size, 0);
  $('rec-summary').textContent = items.length ? `${items.length} item${items.length > 1 ? 's' : ''} · ${fmtSize(total)}` : '';
  const list = $('rec-list');
  if (!items.length) {
    list.innerHTML = '<div class="muted">Nothing recorded yet.</div>';
    return;
  }
  list.innerHTML = items.map((r, i) => `
    <div class="rec-row ${state.activeRec === r.file ? 'active' : ''}" data-i="${i}">
      ${r.thumbUrl ? `<img src="${esc(r.thumbUrl)}" alt="" loading="lazy" />` : '<div class="noimg"></div>'}
      <div class="rec-info">
        <strong>${esc(r.camera)}</strong>
        <div class="muted small">${esc(r.day)} ${esc(r.time)} · ${esc(r.kind === 'video' ? `${r.reason} clip` : r.reason === 'snapshot' ? 'snapshot' : `${r.reason} still`)} · ${esc(fmtSize(r.size))}</div>
      </div>
    </div>`).join('');
  list.querySelectorAll('.rec-row').forEach((row) => row.addEventListener('click', () => playMedia(items[Number(row.dataset.i)])));
}

function playMedia(r) {
  state.activeRec = r.file;
  const video = $('rec-video');
  const img = $('rec-image');
  $('rec-player-empty').classList.add('hidden');
  if (r.kind === 'video') {
    img.classList.add('hidden');
    video.classList.remove('hidden');
    video.src = r.url;
    video.play().catch(() => {});
  } else {
    video.pause();
    video.classList.add('hidden');
    img.classList.remove('hidden');
    img.src = r.url;
  }
  $('rec-player-meta').innerHTML = `
    <strong>${esc(r.camera)}</strong><span class="muted">${esc(r.day)} ${esc(r.time)}</span><span class="spacer"></span>
    <button type="button" class="btn btn-small" id="rec-reveal">Show in folder</button>
    <button type="button" class="btn btn-small btn-danger" id="rec-delete">Delete</button>`;
  $('rec-reveal').addEventListener('click', () => call(api.revealRecording, r.file).catch((err) => toast(err.message, true)));
  $('rec-delete').addEventListener('click', async () => {
    if (!window.confirm('Delete this recording from disk?')) return;
    try {
      video.pause();
      video.removeAttribute('src');
      await call(api.deleteRecording, r.file);
      state.activeRec = null;
      $('rec-player-meta').innerHTML = '';
      img.classList.add('hidden');
      video.classList.add('hidden');
      $('rec-player-empty').classList.remove('hidden');
      loadRecordings();
    } catch (err) { toast(err.message, true); }
  });
  document.querySelectorAll('.rec-row').forEach((row) => row.classList.remove('active'));
}

$('rec-camera').addEventListener('change', renderRecordings);
$('rec-kind').addEventListener('change', renderRecordings);
$('btn-open-folder').addEventListener('click', () => call(api.openRecordingsFolder).catch((err) => toast(err.message, true)));

// ── Settings ─────────────────────────────────────────────────────────────────
const SETTING_KEYS = ['recordingsDir', 'retentionDays', 'postMotionSeconds', 'maxClipMinutes', 'liveFps', 'liveWidth', 'motionFps', 'ffmpegPath'];

async function loadSettings() {
  try {
    state.settings = await call(api.getSettings);
    for (const k of SETTING_KEYS) $(`set-${k}`).value = state.settings[k];
  } catch (err) { toast(err.message, true); }
  checkFfmpeg();
}

async function checkFfmpeg() {
  const out = $('ffmpeg-status');
  out.textContent = 'Checking ffmpeg…';
  try {
    const r = await call(api.checkFfmpeg);
    out.textContent = r.ok ? `Found: ${r.version}` : `${r.error} Install it (Ubuntu: sudo apt install ffmpeg) or enter its full path.`;
    if (!r.ok) banner('ffmpeg is not installed, so cameras cannot be shown. Install it (Ubuntu: sudo apt install ffmpeg) or set its path in Settings.', true);
    else if ($('banner').textContent.startsWith('ffmpeg')) banner('');
  } catch (err) { out.textContent = err.message; }
}

$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const patch = {};
  for (const k of SETTING_KEYS) {
    const v = $(`set-${k}`).value;
    patch[k] = $(`set-${k}`).type === 'number' ? Number(v) : v;
  }
  try {
    state.settings = await call(api.saveSettings, patch);
    toast('Settings saved.');
    checkFfmpeg();
  } catch (err) { toast(err.message, true); }
});
$('btn-pick-folder').addEventListener('click', async () => {
  try {
    const dir = await call(api.pickFolder);
    if (dir) $('set-recordingsDir').value = dir;
  } catch (err) { toast(err.message, true); }
});
$('btn-check-ffmpeg').addEventListener('click', async () => {
  try { await call(api.saveSettings, { ffmpegPath: $('set-ffmpegPath').value }); } catch {}
  checkFfmpeg();
});

// ── Live updates from the main process ───────────────────────────────────────
api.onStatus((s) => {
  state.status.set(s.cameraId, s);
  const cam = state.cameras.find((c) => c.id === s.cameraId);
  if (cam) updateTile(cam);
  if (s.cameraId === state.focusId) updateFocus();
  updateKpis();
});
api.onScore((s) => {
  state.scores.set(s.cameraId, s.score);
  const cam = state.cameras.find((c) => c.id === s.cameraId);
  if (cam) updateTile(cam);
  if (s.cameraId === state.focusId) updateFocus();
});
api.onEvent((evt) => {
  const i = state.events.findIndex((e) => e.id === evt.id);
  if (i >= 0) state.events[i] = evt; else state.events.unshift(evt);
  if ($('tab-events').classList.contains('active')) renderEvents();
  updateKpis();
});
api.onLog((line) => console.info('[camera-watch]', line));
api.onRecordingsChanged(() => { if ($('tab-recordings').classList.contains('active')) loadRecordings(); });

// ── Start ────────────────────────────────────────────────────────────────────
(async function init() {
  try { state.cols = Number(localStorage.getItem('camera-watch.cols')) || 2; } catch {}
  applyCols();
  try {
    state.cameras = await call(api.listCameras);
    for (const c of state.cameras) if (c.status) state.status.set(c.id, c.status);
    state.events = await call(api.listEvents, { limit: 300 });
  } catch (err) {
    banner(err.message, true);
  }
  renderAll();
  checkFfmpeg();
})();
