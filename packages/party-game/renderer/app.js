'use strict';

/* RobOS Party Game — host console. */

const api = window.partyGame;
const $ = (id) => document.getElementById(id);
let state = null;
let formLoaded = false;
let agentEl = null;
let saveTimer = null;
let tvSelection = []; // [{ tvId, screen }]
let lastPreviewKey = '';

const SCREENS = [
  ['stage', 'Main stage'],
  ['scoreboard', 'Scoreboard'],
  ['spotlight', 'Spotlight'],
];
const PHASE_TEXT = {
  setup: 'Setup',
  lobby: 'Lobby: guests are joining',
  roles: 'Role reveal',
  'game-intro': 'Mini game intro',
  question: 'Guests are answering',
  reveal: 'Reveal',
  scores: 'Standings',
  finale: 'Finale',
};
const NEXT_LABEL = {
  setup: 'Open the lobby',
  lobby: 'Start the game',
  roles: 'Next reveal',
  'game-intro': 'Start round',
  question: 'Reveal now',
  reveal: 'Next',
  scores: 'Next mini game',
  finale: 'Finished',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showError(msg) {
  const bar = $('errorBar');
  bar.textContent = msg || '';
  bar.hidden = !msg;
}

async function call(fn, ...args) {
  const res = await fn(...args);
  if (res && res.state) render(res.state);
  if (res && !res.ok) showError(res.error);
  else showError('');
  return res;
}

// ── Agent selector ─────────────────────────────────────────────────────────

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

async function mountAgentSelector(settings) {
  const slot = $('agentSlot');
  if (!(await loadAgentSelector())) {
    slot.innerHTML = '<div class="warn">The RobOS agent picker (robos-lib) is not installed, so the party cannot start. Install RobOS or set ROBOS_LIB_PATH.</div>';
    return;
  }
  agentEl = document.createElement('robos-agent-selector');
  slot.appendChild(agentEl);
  agentEl.addEventListener('change', () => {
    const v = agentEl.value;
    if (!v.provider || agentEl.loading) return;
    const cur = state?.settings?.agent || {};
    if (cur.provider === v.provider && cur.model === v.model && cur.effort === v.effort) return;
    call(api.updateSettings, { agent: v });
  });
  const a = settings.agent || {};
  try {
    await agentEl.load({ provider: a.provider, model: a.model, effort: a.effort });
  } catch (err) {
    slot.insertAdjacentHTML('beforeend', `<div class="warn">${esc(err.message)}</div>`);
  }
}

// ── Settings form ──────────────────────────────────────────────────────────

function fillForm(st) {
  const s = st.settings;
  $('title').value = s.title;
  $('personality').innerHTML = st.personalities.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('');
  $('personality').value = s.personality;
  $('personalityDesc').textContent = st.personalities.find((p) => p.id === s.personality)?.description || '';
  for (const id of ['aiWaitSeconds', 'roundsPerGame', 'answerSeconds', 'revealSeconds', 'minGuests']) $(id).value = s[id];
  for (const cb of document.querySelectorAll('#voiceOutputs input')) cb.checked = (s.narrationOutputs || []).includes(cb.value);
  renderSpeakers(st);
  $('hostFace').value = s.hostFace;
  $('autoAdvance').checked = s.autoAdvance;
  $('secretRoles').checked = s.secretRoles;
  $('customQuestions').value = (s.customQuestions || []).map((q) => q.prompt).join('\n');

  const order = [...s.miniGames, ...st.miniGames.map((m) => m.id).filter((id) => !s.miniGames.includes(id))];
  $('miniGameList').innerHTML = order.map((id) => {
    const m = st.miniGames.find((x) => x.id === id);
    return `<div class="mg" data-id="${m.id}">
      <label class="check"><input type="checkbox" ${s.miniGames.includes(m.id) ? 'checked' : ''}> <span class="mg-icon">${esc(m.icon)}</span> <b>${esc(m.title)}</b></label>
      <span class="muted small">${esc(m.tagline)}</span>
      <span class="mg-move"><button type="button" class="link" data-move="-1" title="Move up">▲</button><button type="button" class="link" data-move="1" title="Move down">▼</button></span>
    </div>`;
  }).join('');
  $('packList').innerHTML = st.surveyPacks.map((p) => `<label class="check" title="${esc(p.description)}">
    <input type="checkbox" value="${p.id}" ${s.surveyPacks.includes(p.id) ? 'checked' : ''}> ${esc(p.title)} <span class="muted small">(${p.count})</span></label>`).join('');
}

function readForm() {
  const custom = $('customQuestions').value.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((prompt, i) => ({ id: `custom-${i + 1}`, kind: 'text', prompt, fact: `${prompt.replace(/\?$/, '')}: {answer}.` }));
  return {
    title: $('title').value.trim() || 'RobOS Party Game',
    personality: $('personality').value,
    hostFace: $('hostFace').value,
    aiWaitSeconds: Number($('aiWaitSeconds').value),
    roundsPerGame: Number($('roundsPerGame').value),
    answerSeconds: Number($('answerSeconds').value),
    revealSeconds: Number($('revealSeconds').value),
    minGuests: Number($('minGuests').value),
    narrationOutputs: [...document.querySelectorAll('#voiceOutputs input:checked')].map((cb) => cb.value),
    speakerId: $('speakerId').value || null,
    autoAdvance: $('autoAdvance').checked,
    secretRoles: $('secretRoles').checked,
    customQuestions: custom,
    miniGames: [...document.querySelectorAll('#miniGameList .mg')].filter((el) => el.querySelector('input').checked).map((el) => el.dataset.id),
    surveyPacks: [...document.querySelectorAll('#packList input:checked')].map((el) => el.value),
  };
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => call(api.updateSettings, readForm()), 400);
}

function wireForm() {
  $('setupPanel').addEventListener('input', (e) => {
    if (e.target.closest('robos-agent-selector') || e.target.closest('#tvList')) return;
    if (e.target.id === 'personality') $('personalityDesc').textContent = state.personalities.find((p) => p.id === e.target.value)?.description || '';
    scheduleSave();
  });
  $('miniGameList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const row = btn.closest('.mg');
    const dir = Number(btn.dataset.move);
    const sibling = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!sibling) return;
    if (dir < 0) row.parentNode.insertBefore(row, sibling);
    else row.parentNode.insertBefore(sibling, row);
    scheduleSave();
  });
  $('scanSpeakers').onclick = async () => {
    $('scanSpeakers').textContent = 'Scanning…';
    const res = await call(api.scanSpeakers);
    $('scanSpeakers').textContent = 'Scan for speakers';
    if (res.ok) renderSpeakers(res.state, res.result);
  };
  $('resetSettings').onclick = async () => {
    const res = await call(api.resetSettings);
    if (res.ok) fillForm(res.state);
  };
}

function renderSpeakers(st, list = st.speakers || []) {
  const sel = $('speakerId');
  const current = st.settings.speakerId;
  sel.innerHTML = '<option value="">Choose a speaker…</option>' + list.map((s) =>
    `<option value="${esc(s.ip)}" ${s.ip === current ? 'selected' : ''}>${esc(s.name)}${s.online ? '' : ' (offline)'} · ${esc(s.ip)}</option>`).join('');
  $('speakerRow').hidden = !st.speakersAvailable;
}

// ── TVs ────────────────────────────────────────────────────────────────────

function renderTvs(st) {
  const tvs = st.availableTvs || [];
  const locked = st.phase !== 'setup';
  if (!tvs.length) {
    $('tvList').innerHTML = '<div class="warn">No RobOS TVs are paired yet. Pair one in RobOS Smart TV Studio, then come back.</div>';
    return;
  }
  if (!tvSelection.length && st.tvs.length) tvSelection = st.tvs.map((t) => ({ tvId: t.tvId, screen: t.screen }));
  $('tvList').innerHTML = tvs.map((tv) => {
    const sel = tvSelection.find((s) => s.tvId === tv.id);
    return `<div class="tv ${sel ? 'on' : ''}">
      <label class="check"><input type="checkbox" data-tv="${esc(tv.id)}" ${sel ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span><b>${esc(tv.name)}</b><br><span class="muted small">${esc(tv.platformName || tv.platformId)} · ${esc(tv.ip)} · ${tv.browser ? 'opens the page' : 'live frames'}</span></span></label>
      <select data-screen="${esc(tv.id)}" ${!sel || locked ? 'disabled' : ''}>
        ${SCREENS.map(([id, label]) => `<option value="${id}" ${sel && sel.screen === id ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

function wireTvs() {
  $('tvList').addEventListener('change', (e) => {
    const tvId = e.target.dataset.tv || e.target.dataset.screen;
    if (!tvId) return;
    if (e.target.dataset.tv) {
      if (e.target.checked) {
        const used = tvSelection.map((s) => s.screen);
        const screen = SCREENS.map(([id]) => id).find((id) => !used.includes(id)) || 'stage';
        tvSelection.push({ tvId, screen });
      } else {
        tvSelection = tvSelection.filter((s) => s.tvId !== tvId);
      }
    } else {
      const sel = tvSelection.find((s) => s.tvId === tvId);
      if (sel) sel.screen = e.target.value;
    }
    call(api.selectTvs, tvSelection);
  });
  $('recastBtn').onclick = async () => {
    const res = await call(api.recast);
    if (res.ok) showCastResults(res.result);
  };
}

function showCastResults(results) {
  $('castResults').innerHTML = (results || []).map((r) =>
    `<div>${r.ok ? '✅' : '⚠️'} <b>${esc(r.name || r.tvId)}</b> (${esc(r.screen)}): ${esc(r.message || '')}</div>`).join('');
}

// ── Guests ─────────────────────────────────────────────────────────────────

function renderGuests(st) {
  const editable = ['setup', 'lobby'].includes(st.phase);
  $('guestCount').textContent = `${st.guestsDetail.length} joined`;
  $('guestList').innerHTML = st.guestsDetail.map((g) => {
    const pct = Math.round((g.progress.answered / Math.max(1, g.progress.total)) * 100);
    const role = g.role ? `<span class="role" style="color:${esc(g.role.color)}">${esc(g.role.emoji)} ${esc(g.role.title)}</span>` : '';
    const live = st.phase === 'question' ? `<span class="small ${g.answered ? 'ok' : 'muted'}">${g.answered ? 'answered' : '…'}</span>` : '';
    const hostBadge = g.isPartyHost ? '<span class="host-badge" title="Party host">🏠 party host</span>' : '';
    return `<div class="guest">
      <span class="g-avatar">${esc(g.avatar)}</span>
      <div class="g-main"><b>${esc(g.name)}</b> ${hostBadge} ${role} ${live}
        <div class="bar"><i style="width:${pct}%"></i></div>
        <span class="muted small">${g.surveyComplete ? 'Survey done' : `${g.progress.answered}/${g.progress.total} answers`}</span>
      </div>
      <span class="g-score">${g.score}</span>
      ${editable ? `<button type="button" class="link" data-survey="${g.id}">Answers</button>${g.isPartyHost ? '' : `<button type="button" class="link" data-host="${g.id}" title="Make party host">🏠</button>`}<button type="button" class="link danger" data-remove="${g.id}">Remove</button>` : ''}
    </div>`;
  }).join('') || '<div class="muted">Nobody yet. Open the lobby and share the QR code.</div>';
  $('startHint').textContent = st.canStart && !st.canStart.ok ? st.canStart.reasons.join(' · ') : '';
  const ph = st.partyHost;
  $('houseStatus').innerHTML = ph
    ? `🏠 <b>${esc(ph.name)}</b> is the party host · house ${ph.house.complete ? 'described' : '<span class="danger">needs the required answers</span>'} (${ph.house.percent}%)`
    : '🏠 No party host yet. Any guest can tap “I’m the party host” on their phone, or pick one here.';
  $('houseBtn').hidden = !ph || !editable;
}

function wireGuests() {
  $('addGuestForm').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('guestName').value.trim();
    if (!name) return;
    const res = await call(api.addGuest, name);
    if (res.ok) {
      $('guestName').value = '';
      openSurvey(res.result.id);
    }
  };
  $('guestList').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) call(api.removeGuest, rm.dataset.remove);
    const sv = e.target.closest('[data-survey]');
    if (sv) openSurvey(sv.dataset.survey);
    const host = e.target.closest('[data-host]');
    if (host) call(api.setPartyHost, host.dataset.host);
  });
  $('houseBtn').onclick = openHouse;
}

// Host-side survey for guests without a phone.
async function openSurvey(guestId) {
  const res = await api.getGuestSurvey(guestId);
  if (!res.ok) return showError(res.error);
  const { questions, answers, name } = res.result;
  $('surveyTitle').textContent = `${name}'s survey`;
  $('surveyFields').innerHTML = questions.map((q) => {
    const v = answers[q.id];
    let input;
    if (q.kind === 'choice') {
      input = `<select name="${q.id}"><option value="">—</option>${q.options.map((o) => `<option value="${esc(o.value)}" ${v === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (q.kind === 'scale') {
      input = `<select name="${q.id}"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${v === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <span class="muted small">1 = ${esc(q.minLabel)} · 5 = ${esc(q.maxLabel)}</span>`;
    } else {
      input = `<input name="${q.id}" maxlength="120" value="${esc(v || '')}" placeholder="${esc(q.placeholder || '')}">`;
    }
    return `<label>${esc(q.prompt)}${input}</label>`;
  }).join('');
  const dlg = $('surveyDialog');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.onclose = async () => {
    if (dlg.returnValue !== 'save') return;
    const data = {};
    for (const el of $('surveyFields').querySelectorAll('[name]')) {
      if (el.value === '') continue;
      const q = questions.find((x) => x.id === el.name);
      data[el.name] = q.kind === 'scale' ? Number(el.value) : el.value;
    }
    call(api.submitSurvey, guestId, data);
  };
}

// The party host's house survey, filled in from the desktop.
function openHouse() {
  const questions = state.houseSurvey;
  const saved = state.house || {};
  $('surveyTitle').textContent = `${state.partyHost.name}'s house`;
  $('surveyFields').innerHTML = questions.map((q) => {
    const v = saved[q.id];
    let input;
    if (q.kind === 'multi') {
      input = `<div class="checks">${q.options.map((o) => `<label class="check"><input type="checkbox" name="${q.id}" value="${esc(o.value)}" ${(v || []).includes(o.value) ? 'checked' : ''}> ${esc(o.label)}</label>`).join('')}</div>`;
    } else if (q.kind === 'choice') {
      input = `<select name="${q.id}"><option value="">—</option>${q.options.map((o) => `<option value="${esc(o.value)}" ${v === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else {
      input = `<textarea name="${q.id}" rows="3" maxlength="600" placeholder="${esc(q.placeholder || '')}">${esc(v || '')}</textarea>`;
    }
    return `<div class="field"><div class="field-label">${esc(q.prompt)}${q.required ? ' <span class="req">*</span>' : ''}</div>${input}</div>`;
  }).join('');
  const dlg = $('surveyDialog');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'save') return;
    const answers = {};
    for (const q of questions) {
      if (q.kind === 'multi') {
        const vals = [...$('surveyFields').querySelectorAll(`[name="${q.id}"]:checked`)].map((el) => el.value);
        if (vals.length) answers[q.id] = vals;
      } else {
        const el = $('surveyFields').querySelector(`[name="${q.id}"]`);
        if (el && el.value.trim()) answers[q.id] = el.value.trim();
      }
    }
    call(api.submitHouse, answers);
  };
}

// ── Live ───────────────────────────────────────────────────────────────────

function renderPreviews(st) {
  const screens = st.tvs.length ? [...new Set(st.tvs.map((t) => t.screen))] : ['stage'];
  const key = screens.join(',') + st.gamePort;
  if (key === lastPreviewKey) return;
  lastPreviewKey = key;
  $('previews').innerHTML = screens.map((s) => {
    const names = st.tvs.filter((t) => t.screen === s).map((t) => t.name).join(', ') || 'Preview';
    return `<figure class="preview"><div class="frame"><iframe src="${st.tvPreviewBase}?screen=${s}&capture=1" title="${s} screen" tabindex="-1"></iframe></div>
      <figcaption><b>${esc(SCREENS.find(([id]) => id === s)?.[1] || s)}</b> · ${esc(names)}
      <button type="button" class="link" data-open="${st.tvPreviewBase}?screen=${s}">Open full screen</button></figcaption></figure>`;
  }).join('');
  scalePreviews();
}

// TV pages render at 1920×1080; shrink each preview to fit its frame.
function scalePreviews() {
  for (const frame of document.querySelectorAll('.frame')) {
    const iframe = frame.querySelector('iframe');
    if (iframe) iframe.style.transform = `scale(${frame.clientWidth / 1920})`;
  }
}
new ResizeObserver(scalePreviews).observe(document.body);

function renderAi(st) {
  const ai = st.aiDetail;
  const labels = { idle: 'waiting for guests', writing: 'writing the show…', ready: 'script ready', failed: 'using stock material' };
  $('aiStatus').textContent = labels[ai.status] || ai.status;
  $('aiStatus').className = `pill ai-${ai.status}`;
  $('aiPill').textContent = `AI host: ${labels[ai.status] || ai.status}`;
  $('aiPill').className = `pill ai-${ai.status}`;
  const sc = ai.script;
  $('aiDetail').innerHTML = `
    <div><b>${ai.calls}</b> agent calls · <b>${ai.intros}</b> guest welcomes · <b>${ai.recaps}</b> recaps · <b>${ai.awards}</b> finale awards</div>
    ${sc ? `<div class="script">
      <div class="show-title">“${esc(sc.showTitle || 'Untitled show')}”</div>
      <div>${sc.roleReveals} role reveals · ${sc.whoSaidThat} Who Said That? teasers · ${sc.mostLikelyTo} superlatives · ${sc.houseQuests} house quests · ${sc.trivia} trivia questions · ${sc.bluffs} bluffs</div>
    </div>` : '<div class="muted small">The script is written once every guest has finished the survey.</div>'}`;
}

function renderHistory(st) {
  const guests = Object.fromEntries(st.guests.map((g) => [g.id, g]));
  $('history').innerHTML = st.history.slice().reverse().map((h) => {
    const deltas = Object.entries(h.deltas).map(([id, d]) => `${esc(guests[id]?.name || '?')} ${d.points > 0 ? '+' : ''}${d.points}`).join(', ');
    return `<div class="h-row"><span class="h-game">${esc(st.miniGames.find((m) => m.id === h.game)?.icon || '')}</span>
      <span class="h-prompt">${esc(h.prompt)}</span><span class="h-answer">${esc(h.correct || '')}</span><span class="muted small">${deltas || 'no points'}</span></div>`;
  }).join('') || '<div class="muted">Rounds will show up here.</div>';
}

function renderSteps(st) {
  const order = ['setup', 'lobby', 'roles', 'game-intro', 'finale'];
  const idx = st.phase === 'finale' ? 4 : ['game-intro', 'question', 'reveal', 'scores'].includes(st.phase) ? 3 : order.indexOf(st.phase);
  const labels = ['Setup', 'Lobby', 'Roles', st.game ? `Game ${st.game.number}/${st.game.total}` : 'Games', 'Finale'];
  $('steps').innerHTML = labels.map((l, i) => `<span class="step ${i < idx ? 'done' : i === idx ? 'now' : ''}">${esc(l)}</span>`).join('');
}

// ── Main render ────────────────────────────────────────────────────────────

function render(st) {
  state = st;
  if (!formLoaded) {
    formLoaded = true;
    fillForm(st);
    mountAgentSelector(st.settings);
  }
  const phase = st.phase;
  document.body.dataset.phase = phase;
  $('phaseText').textContent = PHASE_TEXT[phase] || phase;
  $('nextBtn').textContent = NEXT_LABEL[phase] || 'Next';
  $('nextBtn').disabled = phase === 'finale' || (phase === 'lobby' && st.canStart && !st.canStart.ok);
  $('skipBtn').hidden = phase !== 'question';
  $('resetBtn').hidden = ['setup', 'lobby'].includes(phase);
  $('endBtn').hidden = phase === 'setup';
  for (const el of $('setupPanel').querySelectorAll('input, select, textarea, button')) {
    if (el.closest('#tvList')) continue;
    el.disabled = !['setup', 'lobby'].includes(phase);
  }
  $('setupPanel').classList.toggle('locked', !['setup', 'lobby'].includes(phase));
  $('joinUrl').textContent = st.joinUrl || '';
  $('qr').src = `http://127.0.0.1:${st.gamePort}/qr.svg?v=${encodeURIComponent(st.joinUrl || '')}`;
  if (st.narration) $('narration').textContent = st.narration.text;
  renderSteps(st);
  renderTvs(st);
  renderGuests(st);
  renderAi(st);
  renderPreviews(st);
  renderHistory(st);
  if (st.error) showError(st.error);
}

// Narration on this computer's speakers. The server holds the request until
// RobOS Voice finishes synthesizing, so the audio may start a moment late.
api.onNarration((n) => {
  if (!state || !(state.settings.narrationOutputs || []).includes('host')) return;
  const voice = $('voice');
  voice.src = `http://127.0.0.1:${state.gamePort}/api/narration/${encodeURIComponent(n.id)}`;
  voice.play().catch(() => {});
});

async function onNext() {
  const phase = state?.phase;
  if (phase === 'setup') {
    if (!tvSelection.length) return showError('Pick at least one RobOS TV first.');
    if (agentEl && agentEl.value.provider) await api.updateSettings({ ...readForm(), agent: agentEl.value });
    await api.selectTvs(tvSelection);
    const res = await call(api.openLobby);
    if (res.ok) showCastResults(res.result);
    return;
  }
  await call(api.next);
}

$('nextBtn').onclick = onNext;
$('skipBtn').onclick = () => call(api.skipRound);
$('resetBtn').onclick = () => call(api.reset);
$('endBtn').onclick = () => {
  if (confirm('End the party? Guests and scores are cleared and the TVs are released.')) {
    tvSelection = [];
    call(api.endParty);
  }
};
document.addEventListener('click', (e) => {
  const open = e.target.closest('[data-open]');
  if (open) api.openExternal(open.dataset.open);
});

wireForm();
wireTvs();
wireGuests();
api.onState(render);
api.getState().then(render);
