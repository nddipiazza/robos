/* Renderer for the Quest: Warrior Dragon AI playthrough dashboard. Polls live.json written by
   tests/e2e/play_full_game.py and the game's IPC web service; draws the tray icon. */
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
    (live.driver_alive === false && status === 'running' ? ' · driver gone' : '') : '';
  const total = live ? live.total : state.registry.length;
  const done = live ? live.done_count : 0;
  $('progress-bar').style.width = total ? `${(100 * done) / total}%` : '0';
  $('progress-text').textContent = `${done} / ${total} milestones` + (live && live.until && live.until < total ? ` (until #${live.until})` : '');
  $('btn-stop').disabled = !(live && status === 'running' && live.driver_alive !== false);

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
    : (live && live.error ? `<span class="violation">${esc(live.error)}</span>` : 'Run tests/e2e/play_full_game.py --stepped to start a run.');
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
  $('view-live').classList.add('hidden');
  $('view-milestone').classList.remove('hidden');
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
  state.selected = null;
  $('ms-video').pause();
  $('view-milestone').classList.add('hidden');
  $('view-live').classList.remove('hidden');
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
    $('live-shot-msg').textContent = state.live ? `run ${state.live.status} — game closed` : 'no run';
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
  const live = await window.dash.live();
  state.live = live;
  renderHeader(live);
  renderList();
  if (state.selected === null) renderLive(live);
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
      await window.dash.command('stop_play_game', {});
    }
  });
  $('ms-reveal').addEventListener('click', () => {
    const m = milestoneRows().find((r) => r.index === state.selected);
    if (m && m.video) window.dash.reveal(m.video);
  });
  $('ms-replay').addEventListener('click', () => navigator.clipboard.writeText($('ms-replay-cmd').textContent));
  await tick();
  if (state.config.select) selectMilestone(state.config.select);
  setInterval(tick, 1000);
  setInterval(refreshScreenshot, 1500);
  refreshScreenshot();
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
