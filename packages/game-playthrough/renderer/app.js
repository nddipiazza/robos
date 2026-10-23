/* Renderer for RobOS Game Playthrough. Polls live.json written by tests/e2e/play_full_game.py
   and the game's IPC web service, draws the tray icon, and starts / stops runs. */
const $ = (id) => document.getElementById(id);

const state = {
  registry: [],
  live: null,
  selected: null,          // milestone index (1-based) or null for the live view
  config: null,
  lastDoneCount: -1,
  lastCurrentIndex: null,
  shotBusy: false,
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:` : '') + `${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
};

// ── header ────────────────────────────────────────────────────────────────
function renderHeader(live) {
  const status = live ? live.status : 'waiting';
  const pill = $('status');
  pill.textContent = status;
  pill.className = `pill ${status}`;
  $('elapsed').textContent = live ? `${fmtTime(live.elapsed_sec)} elapsed · ×${live.time_scale}` +
    '' : '';
  const total = live ? live.total : state.registry.length;
  const done = live ? live.done_count : 0;
  $('progress-bar').style.width = total ? `${(100 * done) / total}%` : '0';
  $('progress-text').textContent = `${done} / ${total} milestones` + (live && live.until && live.until < total ? ` (until #${live.until})` : '');
  $('btn-stop').disabled = !(state.run && state.run.running);

  const s = (live && live.stats) || {};
  const chips = [
    ['Level', s.level], ['HP', s.hp != null ? `${s.hp}/${s.hp_max}` : null, s.hp_max && s.hp / s.hp_max < 0.3 ? 'bad' : ''],
    ['MP', s.mp != null ? `${s.mp}/${s.mp_max}` : null], ['Gold', s.gold], ['EXP', s.exp],
    ['ATK/DEF', s.attack != null ? `${s.attack}/${s.defense}` : null],
    ['Battles', live && live.battles], ['Deaths', live && live.deaths, live && live.deaths ? 'warn' : ''],
    ['Scene', s.scene], ['Tile', s.tile && s.tile[0] != null ? `${s.tile[0]},${s.tile[1]} ${s.facing || ''}` : null],
  ];
  $('chips').innerHTML = chips.filter(([, v]) => v != null && v !== '')
    .map(([k, v, cls]) => `<span class="chip ${cls || ''}">${esc(k)} <b>${esc(v)}</b></span>`).join('');

  const cur = live && live.milestones ? live.milestones[live.index] : null;
  const obj = live && live.objective ? live.objective.label : '';
  $('objective').innerHTML = cur
    ? `Now: <b>#${cur.index} ${esc(cur.name)}</b>${obj ? ` — ${esc(obj)}` : ''}${live.error ? ` <span class="violation">${esc(live.error)}</span>` : ''}`
    : (live && live.error ? `<span class="violation">${esc(live.error)}</span>`
      : live && live.status === 'completed' ? `Run completed: all ${live.total} milestones in ${fmtTime(live.elapsed_sec)}.`
      : live ? `Run ${esc(live.status)} at ${live.done_count} / ${live.total} milestones.`
      : 'No run yet — press New run to start the AI playthrough.');
}

// ── milestone list ────────────────────────────────────────────────────────
function milestoneRows() {
  if (state.live && state.live.milestones && state.live.milestones.length) return state.live.milestones;
  return state.registry.map((m, i) => ({ index: i + 1, id: m.id, name: m.name, type: m.type, map: m.map, optional: !!m.optional, state: 'pending' }));
}

function renderList() {
  const rows = milestoneRows();
  const list = $('milestone-list');
  const existing = list.children.length === rows.length;
  rows.forEach((m, i) => {
    const badge = m.state === 'done' ? (m.video ? '🎬' : '✓') : m.state === 'current' ? '▶' : m.state === 'skipped' ? '⤼' : '';
    const html = `<span class="num">${m.index}</span><span class="name" title="${esc(m.id)}${m.map ? ' · ' + esc(m.map) : ''}">${esc(m.name)}` +
      `<br><span class="type">${esc(m.type)}${m.optional ? ' · optional' : ''}${m.checkpoint ? ' · checkpoint' : ''}</span></span><span class="badge">${badge}</span>`;
    let li = existing ? list.children[i] : null;
    if (!li) {
      li = document.createElement('li');
      li.dataset.index = m.index;
      li.addEventListener('click', () => selectMilestone(m.index));
      list.appendChild(li);
    }
    if (li.innerHTML !== html) li.innerHTML = html;
    li.className = `${m.state}${state.selected === m.index ? ' selected' : ''}`;
  });
  const cur = list.querySelector('li.current');
  const curIndex = cur ? cur.dataset.index : null;
  if (cur && $('follow').checked && curIndex !== state.lastCurrentIndex) {
    state.lastCurrentIndex = curIndex;
    requestAnimationFrame(() => cur.scrollIntoView({ block: 'center' }));
  }
}

// ── milestone view ────────────────────────────────────────────────────────
async function selectMilestone(index) {
  const m = milestoneRows().find((r) => r.index === index);
  if (!m || (m.state !== 'done' && m.state !== 'current')) return;
  state.selected = index;
  $('follow').checked = false;
  state.showingRuns = false;
  setView('view-milestone');
  $('ms-title').textContent = `#${m.index} ${m.name}`;
  $('ms-meta').textContent = `${m.id} · ${m.type}${m.map ? ' · ' + m.map : ''}${m.optional ? ' · optional' : ''}`;
  const video = $('ms-video');
  const url = m.video ? await window.dash.fileUrl(m.video) : null;
  if (url) {
    if (video.dataset.src !== url) {
      video.dataset.src = url;
      video.src = url;
      video.play().catch(() => {});
    }
    video.classList.remove('hidden');
    $('ms-video-msg').textContent = '';
    $('ms-reveal').disabled = false;
  } else {
    video.pause();
    video.removeAttribute('src');
    video.dataset.src = '';
    video.classList.add('hidden');
    $('ms-video-msg').textContent = m.state === 'current'
      ? 'Still recording — this milestone is in progress. Use the live view to watch it.'
      : 'No video for this milestone (run with --stepped to record one per milestone).';
    $('ms-reveal').disabled = true;
  }
  const shot = $('ms-shot');
  const shotUrl = m.screenshot ? await window.dash.fileUrl(m.screenshot) : null;
  if (shotUrl) shot.src = shotUrl; else shot.removeAttribute('src');

  const ck = m.checkpoint ? await window.dash.readJson(m.checkpoint) : null;
  if (ck) {
    const items = Array.isArray(ck.items) ? ck.items.map((it) => (typeof it === 'string' ? it : it.id || it.name)).join(', ') : '';
    const rows = [
      ['Location', `${ck.scene} (${ck.tile}) facing ${ck.facing}`], ['Level', ck.heroLevel], ['EXP', ck.heroExp], ['Gold', ck.gold],
      ['HP / MP', `${ck.heroHp}/${ck.heroHpMax} · ${ck.heroMp}/${ck.heroMpMax}`], ['ATK / DEF', `${ck.heroAtk}/${ck.heroDef}`],
      ['Weapon', ck.heroWeapon], ['Armor', ck.heroArmor], ['Shield', ck.heroShield],
      ['Spells', Array.isArray(ck.heroSpells) ? ck.heroSpells.join(', ') : ''],
      ['Chests opened', ck.openedChests ? Object.keys(ck.openedChests).length : 0], ['Items', items],
    ];
    $('ms-checkpoint').innerHTML = rows.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('');
  } else {
    $('ms-checkpoint').innerHTML = '<span class="muted">no checkpoint saved for this milestone yet</span><span></span>';
  }
  $('ms-replay-cmd').textContent = `cd ${state.config ? state.config.projectDir : 'games/quest-warrior-dragon'} && ` +
    `python3 tests/e2e/play_full_game.py --stepped --only ${m.index}`;
  renderList();
}

function showLive() {
  state.showingRuns = false;
  state.selected = null;
  $('ms-video').pause();
  setView('view-live');
  renderList();
}

// ── live view ─────────────────────────────────────────────────────────────
function renderLive(live) {
  if (!live) return;
  const s = live.stats || {};
  $('live-scene').textContent = `${s.scene || ''}${s.map ? ' · ' + s.map : ''}`;
  const b = live.battle && live.battle.is_battle ? live.battle : null;
  const info = b ? b.battle_scene_info || {} : null;
  $('live-battle').innerHTML = info
    ? [['Monster', `${info.monster_name} (HP ${info.monster_hp})`], ['Monster ATK/DEF', `${info.monster_atk}/${info.monster_def}`],
      ['Hero HP/MP', `${info.hero_hp}/${info.hero_mp}`], ['Stopspelled', b.hero_stopspelled ? 'yes' : 'no']]
      .map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')
    : '<span class="muted">not in battle</span><span></span>';
  const eq = s.equipment || {};
  const inv = Array.isArray(s.inventory) ? s.inventory : [];
  const counts = {};
  inv.forEach((it) => { const k = it.name || it.id || String(it); counts[k] = (counts[k] || 0) + 1; });
  const pack = Object.entries(counts).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ');
  $('live-pack').innerHTML = [['Weapon', eq.weapon], ['Armor', eq.armor], ['Shield', eq.shield], ['Pack', pack || '(empty)']]
    .map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v || '—')}</span>`).join('');
  const ai = live.ai || {};
  const inputs = Array.isArray(ai.recent_inputs) ? ai.recent_inputs.slice(-16) : [];
  $('live-inputs').innerHTML = inputs.map((i) => `<span>${esc(typeof i === 'string' ? i : i.action || JSON.stringify(i))}</span>`).join('') +
    (ai.stride_target ? `<span title="stride target">→ ${esc(JSON.stringify(ai.stride_target))}</span>` : '');
  const log = Array.isArray(live.log) ? live.log : [];
  const logEl = $('live-log');
  const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 24;
  logEl.innerHTML = log.map((e) => `<div class="${esc(e.kind)}">${String(e.t ?? '').padStart(6)} L${e.level ?? ''} ${esc(e.kind)}: ${esc(e.msg)}</div>`).join('');
  if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  const v = Array.isArray(live.violations) ? live.violations : [];
  $('live-violations').innerHTML = v.map((x) => `<div class="violation">⚠ ${esc(x.kind)}: ${esc(x.detail)}</div>`).join('');
}

async function refreshScreenshot() {
  if (state.selected !== null || state.shotBusy || document.hidden) return;
  if (!state.live || state.live.status !== 'running') {
    // Not running (or viewing an archived run): show the last screenshot that run saved, if any.
    const last = state.live ? await window.dash.screenshot() : null;
    if (last) $('live-shot').src = last;
    else $('live-shot').removeAttribute('src');
    $('live-shot-msg').textContent = state.live ? `run ${state.live.status} — last screenshot` : 'no run';
    return;
  }
  state.shotBusy = true;
  try {
    const url = await window.dash.screenshot();
    if (url) {
      $('live-shot').src = url;
      $('live-shot-msg').textContent = '';
    } else {
      $('live-shot-msg').textContent = 'game not reachable on the IPC port';
    }
  } finally {
    state.shotBusy = false;
  }
}

// ── tray icon: progress ring, coloured by status ─────────────────────────
function updateTray(live) {
  const done = live ? live.done_count : 0, total = live ? live.total : 0;
  const status = live ? live.status : 'waiting';
  const sig = `${status}:${done}/${total}`;
  const c = $('tray-canvas'), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#30363d';
  ctx.beginPath(); ctx.arc(16, 16, 12, 0, Math.PI * 2); ctx.stroke();
  const color = status === 'running' ? '#00bcd4' : status === 'done' ? '#3fb950' : status === 'waiting' ? '#8b949e' : '#f85149';
  if (total) {
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(16, 16, 12, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * done) / total); ctx.stroke();
  }
  ctx.fillStyle = color;
  if (status === 'running') {
    ctx.beginPath(); ctx.moveTo(13, 10); ctx.lineTo(13, 22); ctx.lineTo(22, 16); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillRect(12, 12, 8, 8);
  }
  window.dash.setTray(c.toDataURL('image/png'), sig);
}

// ── poll loop ─────────────────────────────────────────────────────────────
async function tick() {
  state.run = await window.dash.runStatus();
  const live = await window.dash.live();
  state.live = live;
  renderHeader(live);
  renderList();
  if (state.showingRuns) renderRuns();
  else if (state.selected === null) renderLive(live);
  updateTray(live);
  if (live && live.done_count !== state.lastDoneCount) {
    // A milestone just landed: refresh a selected-but-still-recording card so its video appears.
    if (state.selected !== null) selectMilestone(state.selected);
    state.lastDoneCount = live.done_count;
  }
}

async function init() {
  state.config = await window.dash.config();
  state.registry = await window.dash.registry();
  $('btn-live').addEventListener('click', showLive);
  $('btn-videos').addEventListener('click', () => window.dash.open('videos'));
  $('btn-stop').addEventListener('click', async () => {
    if (confirm('Stop the AI run now? The driver will write its report and shut the game down.')) {
      await window.dash.stopRun();
    }
  });
  $('btn-new-run').addEventListener('click', openRunDialog);
  $('btn-export').addEventListener('click', openExportDialog);
  $('export-form').addEventListener('submit', startExportFromDialog);
  $('export-cancel').addEventListener('click', () => window.dash.exportCancel());
  $('export-dismiss').addEventListener('click', () => $('export-bar').classList.add('hidden'));
  window.dash.exportStatus().then((st) => { if (st) watchExport(); });
  $('btn-runs').addEventListener('click', showRuns);
  $('btn-game-dir').addEventListener('click', async () => {
    const res = await window.dash.chooseGameDir();
    if (res && res.error) alert(res.error);
    state.registry = await window.dash.registry();
    showRuns();
  });
  $('run-form').addEventListener('submit', startFromDialog);
  $('ms-reveal').addEventListener('click', () => {
    const m = milestoneRows().find((r) => r.index === state.selected);
    if (m && m.video) window.dash.reveal(m.video);
  });
  $('ms-replay').addEventListener('click', () => navigator.clipboard.writeText($('ms-replay-cmd').textContent));
  renderViewing();
  await tick();
  if (state.config.select) selectMilestone(state.config.select);
  setInterval(tick, 1000);
  setInterval(refreshScreenshot, 1500);
  refreshScreenshot();
}

// ── runs ──────────────────────────────────────────────────────────────────
function setView(name) {
  for (const v of ['view-live', 'view-milestone', 'view-runs']) $(v).classList.toggle('hidden', v !== name);
}

async function showRuns() {
  state.selected = null;
  state.showingRuns = true;
  setView('view-runs');
  await renderRuns();
}

async function renderRuns() {
  const runs = await window.dash.runs();
  const run = state.run || (await window.dash.runStatus());
  $('game-dir').textContent = run.gameDir ? run.gameDir : 'Game folder not found — choose it';
  const viewing = state.config.viewing || '';
  $('runs-body').innerHTML = runs.map((r, i) => `<tr class="${r.live ? 'current' : ''}">
      <td title="${esc(r.started_at)}">${esc(r.name)}${r.resumed_from ? ' <span class="muted">(resumed)</span>' : ''}</td>
      <td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
      <td>${r.done}${r.total ? ` / ${r.total}` : ''}</td><td>${r.battles}</td><td>${r.deaths}</td>
      <td>${fmtTime(r.elapsed_sec)}</td><td>${r.videos}</td>
      <td><button class="small" data-run="${i}">${(r.live ? !viewing : viewing === r.name) ? 'Viewing' : 'View'}</button></td>
    </tr>${r.error ? `<tr><td></td><td colspan="7" class="err">${esc(r.error)}</td></tr>` : ''}`).join('');
  $('runs-body').querySelectorAll('button[data-run]').forEach((b) => b.addEventListener('click', async () => {
    const r = runs[parseInt(b.dataset.run, 10)];
    await window.dash.viewRun(r.live ? '' : r.dir);
    state.config = await window.dash.config();
    state.lastDoneCount = -1;
    renderViewing();
    showLive();
  }));
  $('run-log').textContent = (run.log || []).join('\n') || (run.running ? 'Run started outside this app.' : 'No run started from this app yet.');
}

function renderViewing() {
  const v = state.config.viewing;
  $('viewing').classList.toggle('hidden', !v);
  $('viewing').textContent = v ? `Viewing ${v}` : '';
}

// ── export to mp4 ─────────────────────────────────────────────────────────
// The export itself runs in the main process; this only plans it and draws progress.
let exportPlan = null;
let exportTimer = null;

const fmtDur = (sec) => {
  if (sec == null || !isFinite(sec)) return '—';
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s).padStart(2, '0')}s`;
};

async function openExportDialog() {
  const st = await window.dash.exportStatus();
  if (st && !st.done) { alert('An export is already running — see the progress bar.'); return; }
  $('export-go').disabled = true;
  $('export-error').textContent = '';
  $('export-options').innerHTML = '';
  $('export-system').textContent = '';
  $('export-summary').textContent = 'Reading the milestone videos and measuring this machine…';
  $('export-dialog').showModal();
  exportPlan = await window.dash.exportPlan();
  if (!exportPlan || !exportPlan.ok) {
    $('export-summary').textContent = '';
    $('export-error').textContent = (exportPlan && exportPlan.error) || 'Nothing to export.';
    return;
  }
  const p = exportPlan;
  $('export-summary').textContent = `${p.name}: ${p.clips} milestone videos, ${fmtDur(p.seconds)} of recording, ${(p.mb / 1024).toFixed(2)} GB.`;
  $('export-options').innerHTML = p.options.map((o, i) => `<label>
      <input type="radio" name="export-mode" value="${i}" ${i === 0 ? 'checked' : ''}>
      <span>${esc(o.label)} <span class="muted">→ ${fmtDur(o.outSeconds)} video, ~${o.estMB < 1024 ? `${Math.round(o.estMB)} MB` : `${(o.estMB / 1024).toFixed(1)} GB`}</span></span>
      <span class="muted">takes</span><span class="est">~${fmtDur(o.estSec)}</span>
    </label>`).join('');
  const sys = p.system;
  $('export-system').textContent = `Estimates from this machine: ${sys.cores} CPU threads (${sys.model.trim()}), ` +
    `disk read ${Math.round(sys.readMBs)} MB/s, x264 ${sys.encodeFps ? Math.round(sys.encodeFps) : '?'} frames/s at this size, ` +
    `${sys.freeGB.toFixed(1)} GB RAM free. The export runs in the background; you can keep using the app.`;
  $('export-go').disabled = false;
}

async function startExportFromDialog(e) {
  if (e.submitter && e.submitter.value !== 'go') return;
  e.preventDefault();
  const o = exportPlan.options[parseInt(document.querySelector('input[name=export-mode]:checked').value, 10)];
  const res = await window.dash.exportStart({ mode: o.mode, speed: o.speed, estSec: o.estSec });
  if (!res || !res.ok) { $('export-error').textContent = (res && res.error) || 'Export failed to start.'; return; }
  $('export-dialog').close();
  watchExport();
}

function watchExport() {
  clearInterval(exportTimer);
  const bar = $('export-bar');
  bar.classList.remove('hidden', 'done', 'failed');
  ['export-show', 'export-play', 'export-dismiss'].forEach((id) => $(id).classList.add('hidden'));
  $('export-cancel').classList.remove('hidden');
  $('btn-export').disabled = true;
  const draw = async () => {
    const st = await window.dash.exportStatus();
    if (!st) return;
    $('export-fill').style.width = `${Math.round(st.progress * 100)}%`;
    $('export-pct').textContent = `${Math.round(st.progress * 100)}%`;
    if (!st.done) {
      $('export-phase').textContent = st.phase;
      $('export-eta').textContent = `${fmtDur(st.elapsed)} elapsed · ${st.remaining != null ? `~${fmtDur(st.remaining)} left` : 'estimating…'}`;
      return;
    }
    clearInterval(exportTimer);
    $('btn-export').disabled = false;
    $('export-cancel').classList.add('hidden');
    $('export-dismiss').classList.remove('hidden');
    if (st.error) {
      bar.classList.add('failed');
      $('export-phase').textContent = st.error === 'Cancelled' ? 'Export cancelled' : `Export failed: ${st.error}`;
      $('export-eta').textContent = '';
    } else {
      bar.classList.add('done');
      $('export-phase').textContent = `Saved ${st.out.split('/').pop()}`;
      $('export-eta').textContent = `${fmtDur(st.outSeconds)} video · ${(st.size / 1048576).toFixed(0)} MB · took ${fmtDur(st.elapsed)}`;
      $('export-show').classList.remove('hidden');
      $('export-play').classList.remove('hidden');
      $('export-show').onclick = () => window.dash.exportShow(st.out);
      $('export-play').onclick = () => window.dash.exportPlay(st.out);
    }
  };
  draw();
  exportTimer = setInterval(draw, 700);
}

async function openRunDialog() {
  const reg = state.registry;
  const cps = new Set((await window.dash.checkpoints()).map((c) => c.index));
  const opt = (i, needCp) => {
    const m = reg[i - 1];
    const ok = !needCp || cps.has(i - 1) || i === 1;
    return `<option value="${i}" ${ok ? '' : 'disabled'}>#${i} ${esc(m ? m.name : '')}</option>`;
  };
  $('run-from').innerHTML = reg.map((_, k) => opt(k + 1, true)).slice(1).join('');
  $('run-only').innerHTML = reg.map((_, k) => opt(k + 1, true)).join('');
  $('run-error').textContent = state.run && state.run.running ? 'A run is already in progress.' : '';
  $('run-go').disabled = !!(state.run && state.run.running);
  $('run-dialog').showModal();
}

async function startFromDialog(e) {
  if (e.submitter && e.submitter.value !== 'go') return;
  e.preventDefault();
  const mode = document.querySelector('input[name=mode]:checked').value;
  const opts = {
    mode,
    milestone: mode === 'resume' ? $('run-from').value : mode === 'only' ? $('run-only').value : 0,
    timeScale: $('run-speed').value,
    until: $('run-until').value,
    headed: $('run-headed').checked,
    sound: $('run-sound').checked,
  };
  const res = await window.dash.startRun(opts);
  if (!res || !res.ok) {
    $('run-error').textContent = (res && res.error) || 'Could not start the run.';
    return;
  }
  $('run-dialog').close();
  state.config = await window.dash.config();
  renderViewing();
  showLive();
}

init();

// ── Resizable column dividers ─────────────────────────────────────────────────
// "aside": milestone list | viewer; "grid": game screen | side panel (live + milestone views).
// Widths are remembered per viewer; double-click a divider to reset it.
function setupSplitters() {
  const root = document.documentElement;
  const KEY = 'dw-dashboard-splits';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { saved = {}; }
  const apply = () => {
    if (saved.aside) root.style.setProperty('--aside-w', `${saved.aside}px`); else root.style.removeProperty('--aside-w');
    if (saved.grid) root.style.setProperty('--grid-left', `${saved.grid}px`); else root.style.removeProperty('--grid-left');
  };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (_) { /* storage unavailable */ } };
  apply();
  document.querySelectorAll('.splitter').forEach((el) => {
    const kind = el.dataset.split;
    el.addEventListener('dblclick', () => { delete saved[kind]; apply(); persist(); });
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      document.body.classList.add('resizing');
      const left = el.previousElementSibling;
      const startX = e.clientX;
      const startW = left.getBoundingClientRect().width;
      const container = el.parentElement.getBoundingClientRect().width;
      const move = (ev) => {
        const min = kind === 'aside' ? 200 : 160;
        const max = container - (kind === 'aside' ? 320 : 200);
        saved[kind] = Math.round(Math.max(min, Math.min(max, startW + ev.clientX - startX)));
        apply();
      };
      const up = () => {
        el.classList.remove('dragging');
        document.body.classList.remove('resizing');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        persist();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  });
}
setupSplitters();
