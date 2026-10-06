'use strict';
/* Dev Central v2 — task tree, search & assign. No inline handlers (CSP: script-src 'self'). */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = window.robos;
  const BUILD = 'columns-1';

  // Workflow stages come from the main process (robos-lib/default-workflow) — never hard-code stage names here.
  const FALLBACK_WF = [
    { id: 'not-started', label: 'Not started', color: '#8b949e', initial: true }, { id: 'designed', label: 'Designed', color: '#58a6ff' },
    { id: 'agent-implementing', label: 'Agent implementing', color: '#a371f7' }, { id: 'local-evidence-review', label: 'Local evidence review', color: '#d29922' },
    { id: 'draft-pr-pipeline-review', label: 'Draft PR pipeline review', color: '#db8b54' }, { id: 'human-review', label: 'Human review', color: '#58a6ff' },
    { id: 'closed', label: 'Closed', color: '#3fb950', final: true },
  ];
  let WF = FALLBACK_WF;
  const stageOf = id => WF.find(s => s.id === id) || WF.find(s => s.initial) || WF[0];
  const stLabel = id => (WF.find(s => s.id === id) || { label: id }).label;
  const stColor = id => stageOf(id).color || '#8b949e';
  const stRank = id => { const i = WF.findIndex(s => s.id === id); return i < 0 ? 0 : i; };
  const isDoneId = id => !!(WF.find(s => s.id === id) || {}).final;
  const isDone = t => isDoneId(t.status);
  const nextStage = id => { const i = WF.findIndex(s => s.id === id); return i >= 0 && i < WF.length - 1 ? WF[i + 1] : null; };
  const resolveStage = q => {            // 'human', 'human-review', 'review', 'done' …  → stage id
    const n = String(q || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!n) return '';
    const alias = { done: 'closed', todo: 'not-started', open: 'not-started', review: 'human-review', inprogress: 'agent-implementing', implementing: 'agent-implementing', evidence: 'local-evidence-review', draft: 'draft-pr-pipeline-review', pipeline: 'draft-pr-pipeline-review' };
    const flat = s => s.id.replace(/-/g, '');
    const m = WF.find(s => flat(s) === n) || WF.find(s => flat(s).startsWith(n)) || WF.find(s => flat(s).includes(n));
    return m ? m.id : (alias[n] && WF.some(s => s.id === alias[n]) ? alias[n] : n);
  };
  const PRIO = { P0: 'Critical', P1: 'High', P2: 'Medium', P3: 'Low' };

  const ICON_PATHS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    play: '<polygon points="6 4 20 12 6 20 6 4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    circle: '<circle cx="12" cy="12" r="9"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/>',
    userminus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="16" y1="11" x2="22" y2="11"/>',
    expand: '<polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>',
    collapse: '<polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    git: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/>',
  };
  const icon = (n, size = 16) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[n]}</svg>`;
  const emptyArt = n => `<div class="empty-art">${icon(n, 28)}</div>`;

  const BASE_VIEWS = [
    { id: 'mine', icon: 'user', label: 'Assigned to me', test: t => t.mine && !isDone(t) },
    { id: 'attention', icon: 'alert', label: 'Needs attention', warn: true, test: t => t.mine && !isDone(t) && needsAttention(t) },
    { id: 'unassigned', icon: 'circle', label: 'Unassigned', test: t => !t.assignee && !isDone(t) },
    { id: 'all', icon: 'list', label: 'All tasks', test: () => true },
  ];
  let VIEWS = BASE_VIEWS, STAGE_VIEWS = [];
  function buildViews() {
    STAGE_VIEWS = WF.map(s => ({ id: 'stage:' + s.id, stage: s, label: s.label, test: t => t.mine && t.status === s.id }));
    VIEWS = [...BASE_VIEWS, ...STAGE_VIEWS];
  }
  buildViews();
  function needsAttention(t) { return !!t.blocked || !!(t.pr && !t.pr.merged && (t.pr.ci === 'fail' || t.pr.review === 'changes')); }

  const S = {
    epics: [], tasks: [], recent: [], me: '',
    view: 'mine', mode: 'epics', groupBy: 'none', collapsedGroups: new Set(), q: '',
    filters: { status: new Set(), prio: new Set(), epic: new Set(), assignee: new Set() },
    sort: { key: 'priority', dir: 1 },
    collapsed: new Set(),          // epic ids
    toggled: new Set(),            // tasks whose default expand state was flipped by the user
    showAll: new Set(),            // epics showing every child regardless of view/filters
    cols: null, busy: new Set(), selected: null, rows: [], menu: null, loaded: false, narrow: false, syncing: false, errors: [],
  };

  // ── small helpers ─────────────────────────────────────────────────────────
  const store = {
    get(k, d) { try { const v = localStorage.getItem('dcv2.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('dcv2.' + k, JSON.stringify(v)); } catch {} },
  };
  function timeAgo(iso) {
    if (!iso) return '—';
    const d = Date.now() - new Date(iso).getTime();
    if (isNaN(d)) return '—';
    const m = Math.floor(d / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
    const days = Math.floor(h / 24); if (days < 30) return days + 'd ago';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const epicColor = id => `hsl(${hue(id)} 55% 55%)`;
  const initials = n => String(n).split(/[^A-Za-z0-9]+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
  const avatar = (n, cls = '') => n
    ? `<span class="avatar ${cls}" style="background:hsl(${hue(n)} 45% 42%)" aria-hidden="true">${esc(initials(n))}</span>`
    : `<span class="avatar blank ${cls}" aria-hidden="true">?</span>`;
  const epicOf = id => S.epics.find(e => e.id === id);
  const taskById = id => S.tasks.find(t => t.id === id);
  const natCmp = (x, y) => String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  const num = k => parseInt(String(k).replace(/\D/g, ''), 10) || 0;

  const prioIcon = p => {
    const up = p === 'P0' ? '<path d="M3 11l5-5 5 5M3 7l5-5 5 5"/>' : p === 'P1' ? '<path d="M3 10l5-5 5 5"/>' : p === 'P2' ? '<path d="M3 6h10M3 10h10"/>' : '<path d="M3 6l5 5 5-5"/>';
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${up}</svg>`;
  };
  const prioCell = p => `<span class="prio ${p.toLowerCase()}" title="${esc(PRIO[p] || p)}">${prioIcon(p)}${p}</span>`;
  const lozenge = (s, asBtn, id, n) => asBtn
    ? `<button class="lozenge" style="--c:${stColor(s)}" data-act="status" data-id="${esc(id)}" title="Change status: ${esc(stLabel(s))}"><span class="lz-t">${esc(stLabel(s))}</span><span style="font-size:8px">▾</span></button>`
    : `<span class="lozenge" style="--c:${stColor(s)}"><span class="lz-t">${esc(stLabel(s))}</span>${n != null ? ' ' + n : ''}</span>`;
  const blockedTag = t => t.blocked ? '<span class="tag blocked" title="Marked blocked">Blocked</span>' : '';
  const typeBadge = t => t === 'bug' ? '<span class="type bug" title="Bug">!</span>' : t === 'epic' ? '<span class="type epic" title="Epic">◆</span>' : t === 'pr' ? '<span class="type pr" title="Pull request">⑂</span>' : '<span class="type task" title="Task"><svg width="9" height="10" viewBox="0 0 9 10" fill="#fff"><path d="M1 0h7a1 1 0 0 1 1 1v9L4.5 7 0 10V1a1 1 0 0 1 1-1z"/></svg></span>';
  const chev = '<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M3 1l5 4-5 4z"/></svg>';

  function ciDot(pr) { const c = pr.merged ? 'pass' : pr.ci === 'pass' ? 'pass' : pr.ci === 'fail' ? 'fail' : pr.ci ? 'pending' : 'none'; return `<span class="dot ${c}" title="CI: ${esc(pr.ci || 'n/a')}"></span>`; }
  function reviewTag(pr) {
    if (pr.merged) return '<span class="rv approved">Merged</span>';
    const r = pr.review || 'pending';
    return `<span class="rv ${r}">${r === 'approved' ? 'Approved' : r === 'changes' ? 'Changes requested' : 'Review pending'}</span>`;
  }
  const prCell = pr => pr ? `<span class="pr">${ciDot(pr)}<span class="key">#${pr.number}</span>${pr.merged ? '<span class="rv approved">Merged</span>' : `<span class="rv ${pr.review || 'pending'}">${pr.review === 'approved' ? '✓' : pr.review === 'changes' ? '✗' : '…'}</span>`}</span>` : '<span class="dim">—</span>';

  // ── filtering / sorting ───────────────────────────────────────────────────
  function visibleTasks() {
    const v = VIEWS.find(x => x.id === S.view) || VIEWS[0];
    const f = S.filters, q = S.q.trim().toLowerCase();
    return S.tasks.filter(t => {
      if (!v.test(t)) return false;
      if (f.status.size && !f.status.has(t.status)) return false;
      if (f.prio.size && !f.prio.has(t.priority)) return false;
      if (f.epic.size && !f.epic.has(t.epicId)) return false;
      if (f.assignee.size && !f.assignee.has(t.assignee || '__none__')) return false;
      if (q) {
        const e = epicOf(t.epicId);
        const hay = `${t.id} ${t.number} ${t.title} ${t.assignee || ''} ${e ? e.code + ' ' + e.name : ''} ${t.pr ? t.pr.title + ' ' + t.pr.branch : ''}`.toLowerCase();
        if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
      }
      return true;
    });
  }
  const realEpic = t => { const e = epicOf(t.epicId); return e && !e.loose ? e : null; };
  const epicLabel = t => { const e = realEpic(t); return e ? e.code + ' ' + e.name : '~'; };
  function cmp(a, b) {
    const { key, dir } = S.sort;
    let r = 0;
    if (key === 'priority') r = a.priority.localeCompare(b.priority);
    else if (key === 'status') r = stRank(a.status) - stRank(b.status);
    else if (key === 'type') r = String(a.type).localeCompare(String(b.type));
    else if (key === 'pr') r = (a.pr ? a.pr.number : 0) - (b.pr ? b.pr.number : 0);
    else if (key === 'prstate') r = ['Open', 'Draft', 'Merged', 'Closed', ''].indexOf(prState(a.pr)) - ['Open', 'Draft', 'Merged', 'Closed', ''].indexOf(prState(b.pr));
    else if (key === 'ci') r = ['fail', 'pending', 'pass', ''].indexOf(ciWord(a.pr)) - ['fail', 'pending', 'pass', ''].indexOf(ciWord(b.pr));
    else if (key === 'review') r = ['changes', 'pending', 'approved', ''].indexOf(a.pr ? (a.pr.merged ? 'approved' : a.pr.review || 'pending') : '') - ['changes', 'pending', 'approved', ''].indexOf(b.pr ? (b.pr.merged ? 'approved' : b.pr.review || 'pending') : '');
    else if (key === 'branch') r = natCmp(a.pr && a.pr.branch, b.pr && b.pr.branch);
    else if (key === 'parent') r = natCmp(parentLabel(a), parentLabel(b));
    else if (key === 'subs') r = S.tasks.filter(x => x.parentId === b.id).length - S.tasks.filter(x => x.parentId === a.id).length;
    else if (key === 'labels') r = natCmp((a.labels || []).join(','), (b.labels || []).join(','));
    else if (key === 'repo') r = natCmp(a.repo, b.repo);
    else if (key === 'created') r = new Date(b.created || 0) - new Date(a.created || 0);
    else if (key === 'title') r = a.title.localeCompare(b.title);
    else if (key === 'key') { const na = a.number || 0, nb = b.number || 0; r = na && nb ? na - nb : natCmp(a.key || a.id, b.key || b.id); }
    else if (key === 'assignee') r = (a.assignee || '~').localeCompare(b.assignee || '~');
    else if (key === 'epic') r = epicLabel(a).localeCompare(epicLabel(b));
    else if (key === 'updated') r = new Date(b.updated || 0) - new Date(a.updated || 0);
    if (r === 0 && key !== 'updated') r = new Date(b.updated || 0) - new Date(a.updated || 0);
    if (!r) r = natCmp(a.key || a.id, b.key || b.id);       // always a total order so the direction toggle visibly flips ties
    return r * dir;
  }

  // ── render: sidebar & filters ─────────────────────────────────────────────
  function renderSidebar() {
    const vrow = v => {
      const n = S.tasks.filter(v.test).length;
      const ic = v.stage ? `<span class="stage-dot" style="background:${v.stage.color}"></span>` : icon(v.icon, 15);
      return `<li><button data-view="${v.id}" class="${S.view === v.id ? 'on' : ''}"><span class="vi">${ic}</span><span class="vl">${esc(v.label)}</span><span class="vc ${v.warn && n ? 'warn' : ''}">${n}</span></button></li>`;
    };
    $('#views').innerHTML = BASE_VIEWS.map(vrow).join('') + '<li class="sb-sub">My tasks by stage</li>' + STAGE_VIEWS.map(vrow).join('');
    const v = VIEWS.find(x => x.id === S.view);
    $('#epic-list').innerHTML = S.epics.filter(e => !e.loose).map(e => {
      const n = S.tasks.filter(t => t.epicId === e.id && v.test(t)).length;
      return `<li><button data-epic="${esc(e.id)}" class="${S.filters.epic.has(e.id) ? 'on' : ''}" title="${esc(e.name)}"><span class="epic-dot" style="background:${epicColor(e.id)}"></span><span class="vl">${esc(e.code)}</span><span class="vc">${n}</span></button></li>`;
    }).join('');
  }

  function filterMenuDefs() {
    const asgs = [...new Set(S.tasks.map(t => t.assignee || '__none__'))].sort((a, b) => a === '__none__' ? -1 : b === '__none__' ? 1 : a.localeCompare(b));
    return [
      { id: 'status', label: 'Status', opts: WF.map(s => [s.id, s.label]) },
      { id: 'prio', label: 'Priority', opts: Object.keys(PRIO).map(k => [k, `${k} · ${PRIO[k]}`]) },
      { id: 'epic', label: 'Epic', opts: S.epics.filter(e => !e.loose).map(e => [e.id, `${e.code} — ${e.name}`]) },
      { id: 'assignee', label: 'Assignee', opts: asgs.map(a => [a, a === '__none__' ? 'Unassigned' : a + (a === S.me ? ' (me)' : '')]) },
    ];
  }
  function renderFilters() {
    const defs = filterMenuDefs();
    let any = false;
    const chips = defs.map(d => {
      const set = S.filters[d.id]; if (set.size) any = true;
      const val = set.size ? ': ' + [...set].map(k => (d.opts.find(o => o[0] === k) || [k, k])[1].split(' —')[0].split(' ·')[0]).join(', ') : '';
      const menu = S.menu === d.id ? `<div class="menu" data-menu="${d.id}">${d.opts.map(([k, l]) => `<label><input type="checkbox" data-f="${d.id}" value="${esc(k)}" ${set.has(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>` : '';
      return `<div class="fchip"><button data-fmenu="${d.id}" class="${set.size ? 'active' : ''}">${d.label}${esc(val.length > 38 ? val.slice(0, 36) + '…' : val)} <span class="caret">▼</span></button>${menu}</div>`;
    }).join('');
    $('#filters').innerHTML = chips + (any ? '<button class="clear-link" data-clear="1">Clear filters</button>' : '');
  }

  // ── columns: a registry; users pick which to show (right-click the header, or the Columns button) ──
  const prState = p => !p ? '' : p.merged ? 'Merged' : p.state === 'closed' ? 'Closed' : p.draft ? 'Draft' : 'Open';
  const ciWord = p => !p ? '' : p.merged ? 'pass' : (p.ci || '');
  const openLink = (url, label, cls = 'key') => url
    ? `<a class="${cls} link" href="#" data-open="${esc(url)}" title="Open ${esc(url)} in your browser">${label}</a>` : `<span class="${cls}">${label}</span>`;
  const parentLabel = t => { const p = t.parentId && taskById(t.parentId); if (p) return p.key || p.id; const e = realEpic(t); return e ? e.code : ''; };
  const dateCell = iso => iso ? `<span title="${esc(iso)}">${esc(String(iso).slice(0, 10))}</span>` : '<span class="dim">—</span>';
  // id, label, width, narrow width, sort key, locked, wide-only (hidden on narrow windows), cell(t, ctx)
  const COLDEFS = [
    { id: 'key', label: 'Issue', w: 150, wn: 136, sort: 'key', locked: true },
    { id: 'title', label: 'Summary', sort: 'title', locked: true },
    { id: 'epic', label: 'Epic', w: 190, wn: 150, sort: 'epic', cell: t => { const re = realEpic(t); return re ? `<button class="epic-chip" data-selepic="${esc(re.id)}" title="${esc(re.code + ' — ' + re.name)}"><span class="epic-dot" style="background:${epicColor(re.id)}"></span><span class="ec">${esc(re.code)}</span><span class="en">${esc(re.name)}</span></button>` : '<span class="dim">—</span>'; } },
    { id: 'type', label: 'Type', w: 84, sort: 'type', wide: true, cell: t => `<span class="dim">${t.type === 'bug' ? 'Bug' : 'Task'}</span>` },
    { id: 'status', label: 'Status', w: 190, wn: 176, sort: 'status', cls: 'st-cell', cell: t => lozenge(t.status, true, t.id) + blockedTag(t) },
    { id: 'priority', label: 'Priority', w: 92, wn: 72, sort: 'priority', cell: t => prioCell(t.priority) },
    { id: 'assignee', label: 'Assignee', w: 160, wn: 150, sort: 'assignee', cls: 'asg-cell', cell: (t, c) => c.asg + c.quick + (c.busy ? '<span class="spin" title="Updating on the task server…"></span>' : '') },
    { id: 'pr', label: 'Pull request', w: 140, sort: 'pr', wide: true, cell: t => t.pr ? `<span class="pr">${ciDot(t.pr)}${openLink(t.pr.url, '#' + t.pr.number)}${t.pr.merged ? '<span class="rv approved">Merged</span>' : `<span class="rv ${t.pr.review || 'pending'}">${t.pr.review === 'approved' ? '✓' : t.pr.review === 'changes' ? '✗' : '…'}</span>`}</span>` : '<span class="dim">—</span>' },
    { id: 'prstate', label: 'PR state', w: 90, sort: 'prstate', wide: true, cell: t => t.pr ? `<span class="prs ${prState(t.pr).toLowerCase()}">${prState(t.pr)}</span>` : '<span class="dim">—</span>' },
    { id: 'ci', label: 'CI', w: 80, sort: 'ci', wide: true, cell: t => t.pr ? `<span class="pr">${ciDot(t.pr)}<span class="dim">${esc(ciWord(t.pr) || 'n/a')}</span></span>` : '<span class="dim">—</span>' },
    { id: 'review', label: 'Review', w: 150, sort: 'review', wide: true, cell: t => t.pr ? reviewTag(t.pr) : '<span class="dim">—</span>' },
    { id: 'branch', label: 'Branch', w: 190, sort: 'branch', wide: true, cell: t => t.pr && t.pr.branch ? `<span class="mono ell" title="${esc(t.pr.branch)}">${esc(t.pr.branch)}</span>` : '<span class="dim">—</span>' },
    { id: 'parent', label: 'Parent', w: 100, sort: 'parent', wide: true, cell: t => { const p = t.parentId && taskById(t.parentId); const l = parentLabel(t); return l ? (p ? `<a class="key link" href="#" data-selectid="${esc(p.id)}" title="${esc(p.title)}">${esc(l)}</a>` : `<span class="key dim">${esc(l)}</span>`) : '<span class="dim">—</span>'; } },
    { id: 'subs', label: 'Sub-issues', w: 92, sort: 'subs', wide: true, cell: t => { const n = S.tasks.filter(x => x.parentId === t.id).length; return n ? String(n) : '<span class="dim">—</span>'; } },
    { id: 'labels', label: 'Labels', w: 200, sort: 'labels', wide: true, cell: t => (t.labels || []).filter(l => !/^(state|priority):/i.test(l)).slice(0, 3).map(l => `<span class="tag">${esc(l)}</span>`).join(' ') || '<span class="dim">—</span>' },
    { id: 'repo', label: 'Repository', w: 190, sort: 'repo', wide: true, cell: t => `<span class="dim ell" title="${esc(t.repo || '')}">${esc(t.repo || '—')}</span>` },
    { id: 'created', label: 'Created', w: 96, sort: 'created', wide: true, cell: t => dateCell(t.created) },
    { id: 'updated', label: 'Updated', w: 84, sort: 'updated', wide: true, cls: 'upd', cell: t => timeAgo(t.updated) },
  ];
  const DEFAULT_COLS = { epics: ['status', 'priority', 'assignee', 'pr', 'updated'], tasks: ['epic', 'status', 'priority', 'assignee', 'pr', 'updated'] };
  const visibleColIds = () => { const m = S.mode === 'tasks' ? 'tasks' : 'epics'; return (S.cols && S.cols[m]) || DEFAULT_COLS[m]; };
  const activeCols = () => {
    const on = new Set(visibleColIds());
    return COLDEFS.filter(c => c.locked || (on.has(c.id) && !(S.narrow && c.wide)));
  };
  function toggleCol(id) {
    const m = S.mode === 'tasks' ? 'tasks' : 'epics';
    const cur = new Set(visibleColIds());
    cur.has(id) ? cur.delete(id) : cur.add(id);
    S.cols = { ...(S.cols || {}), [m]: COLDEFS.filter(c => cur.has(c.id)).map(c => c.id) };
    store.set('cols', S.cols); renderTable();
  }
  function resetCols() { const m = S.mode === 'tasks' ? 'tasks' : 'epics'; S.cols = { ...(S.cols || {}), [m]: DEFAULT_COLS[m] }; store.set('cols', S.cols); renderTable(); }
  function columnMenu(x, y, colId) {
    const on = new Set(visibleColIds()), def = colId && COLDEFS.find(c => c.id === colId);
    const items = [];
    if (def && def.sort) items.push({ label: 'Sort ascending', icon: 'expand', run: () => { S.sort = { key: def.sort, dir: 1 }; renderTable(); } }, { label: 'Sort descending', icon: 'collapse', run: () => { S.sort = { key: def.sort, dir: -1 }; renderTable(); } });
    if (def && !def.locked) items.push({ label: `Hide “${def.label}”`, icon: 'eye', run: () => toggleCol(def.id) });
    if (items.length) items.push({ sep: true });
    COLDEFS.forEach(c => items.push({ label: c.label, checked: c.locked || on.has(c.id), disabled: !!c.locked, keepOpen: true, run: () => { toggleCol(c.id); columnMenu(x, y, colId); } }));
    items.push({ sep: true }, { label: 'Reset columns to default', icon: 'filter', run: () => { resetCols(); } });
    showContextMenu(x, y, items);
  }
  function renderHead() {
    const cols = activeCols();
    $('#thead-row').innerHTML = cols.map(c => `<th data-col="${c.id}" ${c.sort ? `data-sort="${c.sort}"` : ''} style="${c.w ? `width:${S.narrow && c.wn ? c.wn : c.w}px` : ''}">${c.label}${c.sort && c.sort === S.sort.key ? `<span class="arrow">${S.sort.dir === 1 ? '▲' : '▼'}</span>` : ''}</th>`).join('');
    const total = cols.reduce((n, c) => n + (c.w ? (S.narrow && c.wn ? c.wn : c.w) : 280), 0);
    const tt = document.querySelector('#tt'); if (tt) tt.style.minWidth = total + 'px';
  }

  // ── render: tree table ────────────────────────────────────────────────────
  const isOpen = (t, nKids) => { const def = nKids > 0; return S.toggled.has(t.id) ? !def : def; };
  function taskRow(t, depth, nKids, dim) {
    const done = isDone(t);
    const expandable = !!t.pr || nKids > 0, open = isOpen(t, nKids);
    const e = epicOf(t.epicId);
    const asg = t.assignee
      ? `<span class="assignee ${t.mine ? 'me' : ''}">${avatar(t.assignee)}<span class="nm">${esc(t.assignee)}${t.mine ? ' (me)' : ''}</span></span>`
      : `<span class="assignee none">${avatar(null)}<span class="nm">Unassigned</span></span>`;
    const isBusy = S.busy.has(t.id);
    const quick = !t.mine && !isDone(t) && !isBusy ? `<button class="btn btn-sm assign-me" data-act="assign" data-id="${esc(t.id)}" title="Assign to me (a)">Assign me</button>` : '';
    const ctx = { asg, quick, busy: isBusy };
    const cells = activeCols().map(c => {
      if (c.id === 'key') return `<td><div class="keycell" style="padding-left:${depth * 22}px"><button class="twisty ${expandable ? (open ? 'open' : '') : 'none'}" data-twist="${esc(t.id)}" data-kids="${nKids}" aria-label="Expand or collapse">${chev}</button>${typeBadge(t.type)}${openLink(t.url, esc(t.key || t.id))}${nKids ? `<span class="kidcount" title="${nKids} sub-issue${nKids === 1 ? '' : 's'}">${nKids}</span>` : ''}</div></td>`;
      if (c.id === 'title') return `<td><div class="titlecell ${done ? 'done' : ''}" title="${esc(t.title)}">${esc(t.title)}</div></td>`;
      return `<td class="${c.cls || ''}">${c.cell(t, ctx)}</td>`;
    }).join('');
    return `<tr class="row task ${S.selected === t.id ? 'sel' : ''} ${dim ? 'dim-row' : ''} ${isBusy ? 'busy' : ''}" data-row="${esc(t.id)}" data-kind="task">${cells}</tr>`;
  }
  function prRow(t, depth) {
    const p = t.pr;
    const cells = activeCols().map(c => {
      if (c.id === 'key') return `<td><div class="keycell" style="padding-left:${(depth + 1) * 22}px">${typeBadge('pr')}${openLink(p.url, 'PR #' + p.number)}</div></td>`;
      if (c.id === 'title') return `<td><div class="titlecell" title="${esc(p.title)}">${esc(p.title)} <span class="dim" style="font-family:var(--mono);margin-left:6px">${esc(p.branch || '')}</span></div></td>`;
      if (c.id === 'pr') return `<td><span class="pr">${ciDot(p)}${reviewTag(p)}</span></td>`;
      return '<td></td>';
    }).join('');
    return `<tr class="row sub" data-row="${esc(t.id)}" data-kind="pr">${cells}</tr>`;
  }
  function epicRow(e, shown, all) {
    const showingAll = S.showAll.has(e.id);
    const done = all.filter(isDone).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
    const closed = S.collapsed.has(e.id);
    return `<tr class="row epic ${S.selected === 'epic:' + e.id ? 'sel' : ''}" data-row="${esc(e.id)}" data-kind="epic"><td class="epic-cell" colspan="${activeCols().length}"><div class="epic-line">
      <button class="twisty ${closed ? '' : 'open'}" data-etwist="${esc(e.id)}" aria-label="Toggle epic">${chev}</button>
      <span class="epic-dot" style="width:8px;height:8px;border-radius:2px;background:${epicColor(e.id)}"></span>${typeBadge('epic')}
      ${e.url ? `<a class="key link" href="#" style="color:var(--purple)" data-open="${esc(e.url)}" title="Open in your browser">${esc(e.code)}</a>` : `<span class="key" style="color:var(--purple)">${esc(e.code)}</span>`}<span class="nm">${esc(e.name)}</span>
      <span class="meta">${showingAll ? all.length : shown} of ${all.length} issue${all.length === 1 ? '' : 's'}${e.repo ? ' · ' + esc(e.repo) : ''}</span>${shown < all.length || showingAll ? `<button class="linkbtn" data-showall="${esc(e.id)}">${showingAll ? 'apply filters' : 'show all ' + all.length}</button>` : ''}
      <span class="prog"><span class="bar"><i style="width:${pct}%"></i></span>${done}/${all.length} done</span>${all.some(t => S.busy.has(t.id)) ? '<span class="spin" title="Updating…"></span>' : ''}</div></td></tr>`;
  }

  function renderTable() {
    const vis = visibleTasks();
    S.rows = [];
    let html = '';
    const visIds = new Set(vis.map(t => t.id));
    const filtering = !!S.q.trim() || Object.values(S.filters).some(x => x.size);
    let epicCount = 0;
    if (S.mode === 'epics') {
      // Epics that are yours (or contain at least one task that matches the view) with the WHOLE sub-issue tree
      // underneath, nested to any depth. Your issues with no epic are listed as childless rows after the epics.
      const byId = new Map(S.tasks.map(t => [t.id, t]));
      // Sort key applies to epics first (by the epic's own value), then to the tasks inside each epic.
      const epicProxy = e => {
        const kids = S.tasks.filter(t => t.epicId === e.id);
        const prio = kids.map(t => t.priority).sort()[0] || e.priority || 'P2';
        const upd = kids.map(t => t.updated).concat(e.updated).filter(Boolean).sort().pop();
        return { id: e.id, key: e.code, number: e.number, title: e.name || '', status: e.status, assignee: e.assignee || null, priority: e.priority || prio, updated: upd, epicId: e.id };
      };
      const sortedEpics = S.epics.filter(e => !e.loose).map(e => [e, epicProxy(e)]).sort((x, y) => cmp(x[1], y[1])).map(x => x[0]);
      for (const e of sortedEpics) {
        const all = S.tasks.filter(t => t.epicId === e.id);
        const matched = all.filter(t => visIds.has(t.id));
        const rootMine = S.view === 'mine' && e.mine && !isDoneId(e.status) && !filtering;   // the epic issue itself is assigned to me
        if (!matched.length && !rootMine && !S.showAll.has(e.id)) continue;
        let pool;
        if (!filtering || S.showAll.has(e.id)) pool = all;
        else { const keep = new Set(matched.map(t => t.id)); for (const t of matched) { let p = byId.get(t.parentId); while (p && !keep.has(p.id)) { keep.add(p.id); p = byId.get(p.parentId); } } pool = all.filter(t => keep.has(t.id)); }
        pool = [...pool].sort(cmp);
        epicCount++;
        html += epicRow(e, rootMine ? all.length : matched.length, all);
        S.rows.push({ kind: 'epic', id: e.id });
        if (S.collapsed.has(e.id)) continue;
        const ids = new Set(pool.map(t => t.id)), kids = new Map(), roots = [];
        for (const t of pool) {
          if (t.parentId && ids.has(t.parentId)) (kids.get(t.parentId) || kids.set(t.parentId, []).get(t.parentId)).push(t);
          else roots.push(t);
        }
        const emit = (t, depth) => {
          const k = kids.get(t.id) || [], open = isOpen(t, k.length);
          html += taskRow(t, depth, k.length, !visIds.has(t.id)); S.rows.push({ kind: 'task', id: t.id });
          if (open) {
            if (t.pr) html += prRow(t, depth);
            k.forEach(c => emit(c, depth + 1));
          }
        };
        roots.forEach(t => emit(t, 1));
      }
      const loose = vis.filter(t => { const e = epicOf(t.epicId); return !e || e.loose; }).sort(cmp);
      for (const t of loose) { html += taskRow(t, 0, 0, false); S.rows.push({ kind: 'task', id: t.id }); if (t.pr && S.toggled.has(t.id)) html += prRow(t, 0); }
    } else {
      // Tasks view: a flat list, optionally grouped (Epic / Status / Priority / Assignee).
      const list = [...vis].sort(cmp);
      const emitTask = t => { html += taskRow(t, 0, 0, false); S.rows.push({ kind: 'task', id: t.id }); if (t.pr && S.toggled.has(t.id)) html += prRow(t, 0); };
      if (S.groupBy === 'none') list.forEach(emitTask);
      else {
        const groups = new Map();
        const keyOf = t => S.groupBy === 'epic' ? (realEpic(t) ? realEpic(t).id : '~')
          : S.groupBy === 'status' ? t.status : S.groupBy === 'priority' ? t.priority : (t.assignee || '~');
        const labelOf = (k, t) => S.groupBy === 'epic' ? (k === '~' ? 'No epic' : `${realEpic(t).code} — ${realEpic(t).name}`)
          : S.groupBy === 'status' ? stLabel(k) : S.groupBy === 'priority' ? `${k} · ${PRIO[k]}` : (k === '~' ? 'Unassigned' : k + (t.mine ? ' (me)' : ''));
        for (const t of list) { const k = keyOf(t); (groups.get(k) || groups.set(k, { label: labelOf(k, t), items: [] }).get(k)).items.push(t); }
        const order = [...groups.keys()].sort((a, b) => {
          if (a === '~') return 1; if (b === '~') return -1;
          if (S.groupBy === 'status') return stRank(a) - stRank(b);
          if (S.groupBy === 'epic') return S.epics.findIndex(e => e.id === a) - S.epics.findIndex(e => e.id === b);
          return String(a).localeCompare(String(b));
        });
        for (const k of order) {
          const g = groups.get(k), closed = S.collapsedGroups.has(S.groupBy + ':' + k);
          html += `<tr class="row group" data-gkey="${esc(S.groupBy + ':' + k)}"><td class="epic-cell" colspan="${activeCols().length}"><div class="epic-line"><button class="twisty ${closed ? '' : 'open'}" data-gtwist="${esc(S.groupBy + ':' + k)}" aria-label="Toggle group">${chev}</button><span class="nm">${esc(g.label)}</span><span class="meta">${g.items.length} task${g.items.length === 1 ? '' : 's'}</span></div></td></tr>`;
          if (!closed) g.items.forEach(emitTask);
        }
      }
    }
    $('#tbody').innerHTML = html;
    renderHead();

    const v = VIEWS.find(x => x.id === S.view);
    $('#view-title').textContent = v.label;
    $('#view-count').textContent = S.mode === 'epics' ? `${epicCount} epic${epicCount === 1 ? '' : 's'} · ${vis.length} task${vis.length === 1 ? '' : 's'}` : `${vis.length} task${vis.length === 1 ? '' : 's'}`;
    $('#btn-refresh').classList.toggle('spinning', !!S.syncing);
    $('#sb-left').innerHTML = `${vis.length} shown · ${S.tasks.length} total · ${S.tasks.filter(t => t.mine && !isDone(t)).length} open assigned to you` + (S.syncing ? ' · <span class="spin"></span> syncing…' : '') + (S.errors.length ? ` · ⚠ ${esc(S.errors.map(e => e.server + ': ' + e.error).join('; '))}` : '') + ` · <span class="dim" title="Renderer build — if this doesn't change after an edit, the app is not running this folder in dev mode">build ${BUILD}</span>`;
    const empty = $('#empty');
    const nothing = !S.rows.length;
    empty.classList.toggle('hidden', !nothing);
    $('#tt').classList.toggle('hidden', nothing);
    if (nothing) {
      const filtered = S.q || Object.values(S.filters).some(s => s.size);
      empty.innerHTML = !S.loaded ? '<h3>Loading tasks…</h3>'
        : filtered ? emptyArt('search') + '<h3>No tasks match these filters</h3><div>Try clearing a filter or searching all tasks.</div><button class="btn" data-clear="1">Clear filters</button>'
        : S.view === 'mine' ? emptyArt('inbox') + '<h3>Nothing assigned to you</h3><div>Pick something up from the backlog.</div><button class="btn btn-primary" data-find="1">' + icon('plus', 14) + ' Find &amp; assign</button>'
        : '<h3>Nothing here</h3><div>No tasks in this view.</div>';
    }
    const realEpics = S.epics.filter(e => !e.loose);
    $('#btn-expand').textContent = S.mode === 'epics' && realEpics.every(e => S.collapsed.has(e.id)) ? 'Expand all' : 'Collapse all';
    $('#btn-expand').classList.toggle('hidden', S.mode !== 'epics');
    $('#grp-wrap').classList.toggle('hidden', S.mode !== 'tasks');
    $('#groupby').value = S.groupBy;
    document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  }

  // ── detail panel ──────────────────────────────────────────────────────────
  function renderEpicDetail(el, e) {
    if (!e) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const all = S.tasks.filter(t => t.epicId === e.id);
    const done = all.filter(isDone).length, pct = all.length ? Math.round(done / all.length * 100) : 0;
    const counts = WF.map(s => [s.id, all.filter(t => t.status === s.id).length]).filter(x => x[1]);
    const unassigned = all.filter(t => !t.mine && !isDone(t));
    const ids = new Set(all.map(t => t.id)), kids = new Map(), roots = [];
    for (const t of all) { if (t.parentId && ids.has(t.parentId)) (kids.get(t.parentId) || kids.set(t.parentId, []).get(t.parentId)).push(t); else roots.push(t); }
    const list = (t, d) => `<li class="sub-li" style="padding-left:${d * 16}px"><button class="sub-btn" data-selectid="${esc(t.id)}">${typeBadge(t.type)}<span class="key">${esc(t.key || t.id)}</span><span class="sub-t ${isDone(t) ? 'done' : ''}">${esc(t.title)}</span>${lozenge(t.status)}${t.mine ? '<span class="tag">me</span>' : ''}</button></li>` + (kids.get(t.id) || []).map(c => list(c, d + 1)).join('');
    el.innerHTML = `
      <div class="d-head">
        <div class="d-top">${typeBadge('epic')}<span class="key" style="color:var(--purple)">${esc(e.code)}</span><span class="sp"></span>
          ${e.url ? `<button class="btn btn-ghost btn-sm" data-open="${esc(e.url)}">Open ↗</button>` : ''}
          <button class="btn btn-ghost btn-sm icon-only" data-close="1" aria-label="Close">✕</button></div>
        <h2 class="d-title">${esc(e.name)}</h2>
      </div>
      <div class="d-sec"><h4>Progress</h4>
        <div class="prog" style="margin-bottom:10px"><span class="bar" style="width:160px"><i style="width:${pct}%"></i></span>${done}/${all.length} done · ${pct}%</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${counts.map(([k, n]) => lozenge(k, false, null, n)).join('') || '<span class="dim">No sub-issues</span>'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${unassigned.length ? `<button class="btn btn-sm btn-primary" data-assignepic="${esc(e.id)}">Assign ${unassigned.length} open issue${unassigned.length === 1 ? '' : 's'} to me</button>` : ''}${all.some(t => t.mine && !isDone(t)) ? `<button class="btn btn-sm" data-unassignepic="${esc(e.id)}">Unassign all from me</button>` : ''}</div></div>
      <div class="d-sec"><h4>Details</h4><div class="kv"><span>Repository</span><span>${esc(e.repo || '—')}</span><span>Status</span><span>${lozenge(e.status)}</span>${e.fromServer ? `<span>Assignee</span><span>${e.assignee ? esc(e.assignee) : '<i class="dim">Unassigned</i>'}</span>` : ''}</div></div>
      ${e.description ? `<div class="d-sec"><h4>Description</h4><div class="d-desc">${esc(e.description)}</div></div>` : ''}
      <div class="d-sec"><h4>Sub-issues (${all.length})</h4><ul class="sub-ul">${roots.map(t => list(t, 0)).join('') || '<span class="dim">None</span>'}</ul></div>`;
  }
  function renderDetail() {
    const el = $('#detail');
    if (S.selected && S.selected.startsWith('epic:')) { renderEpicDetail(el, epicOf(S.selected.slice(5))); return; }
    const t = taskById(S.selected);
    if (!t) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const e = epicOf(t.epicId);
    const hist = [...(t.history || [])].reverse();
    el.innerHTML = `
      <div class="d-head">
        <div class="d-top">${typeBadge(t.type)}<span class="key">${esc(t.key || t.id)}</span><span class="sp"></span>
          ${t.url ? `<button class="btn btn-ghost btn-sm" data-open="${esc(t.url)}">Open ↗</button>` : ''}
          <button class="btn btn-ghost btn-sm icon-only" data-close="1" aria-label="Close">✕</button></div>
        <h2 class="d-title">${esc(t.title)}</h2>
      </div>
      <div class="d-sec"><h4>Details</h4><div class="kv">
        <span>Status</span><span><select class="sel" data-setstatus="${esc(t.id)}">${WF.map(s => `<option value="${s.id}" ${s.id === t.status ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></span>
        <span>Assignee</span><span style="display:flex;align-items:center;gap:8px">${avatar(t.assignee, 'lg')}<span>${t.assignee ? esc(t.assignee) + (t.mine ? ' (me)' : '') : '<i class="dim">Unassigned</i>'}</span>
          ${t.mine ? `<button class="btn btn-sm" data-act="unassign" data-id="${esc(t.id)}">Unassign</button>` : `<button class="btn btn-sm btn-primary" data-act="assign" data-id="${esc(t.id)}">${t.assignee ? 'Take over' : 'Assign to me'}</button>`}</span>
        <span>Priority</span><span>${prioCell(t.priority)} <span class="dim">${PRIO[t.priority] || ''}</span></span>
        <span>Epic</span><span>${e ? `<span class="epic-dot" style="display:inline-block;background:${epicColor(e.id)};margin:0 6px 0 0"></span>${esc(e.code)} — ${esc(e.name)}` : '—'}</span>
        <span>Repository</span><span>${esc(e && e.repo || '—')}</span>
        <span>Updated</span><span>${timeAgo(t.updated)}</span></div></div>
      ${t.pr ? `<div class="d-sec"><h4>Pull request</h4><div class="prcard"><div class="t">#${t.pr.number} ${esc(t.pr.title)}</div>
        <div class="meta">${ciDot(t.pr)}<span>CI ${esc(t.pr.ci || 'n/a')}</span>${reviewTag(t.pr)}<span style="font-family:var(--mono)">${esc(t.pr.branch || '')}</span>
        ${t.pr.url ? `<button class="btn btn-sm" data-open="${esc(t.pr.url)}">Open PR ↗</button>` : ''}</div></div></div>` : ''}
      ${t.description ? `<div class="d-sec"><h4>Description</h4><div class="d-desc">${esc(t.description)}</div></div>` : ''}
      <div class="d-sec"><h4>Activity</h4>${hist.length ? `<ul class="tl">${hist.map(h => `<li><div class="st">${esc(h.state)} <span class="when">· ${esc(h.actor || '')} · ${timeAgo(h.timestamp)}</span></div><div class="nt">${esc(h.note || '')}</div></li>`).join('')}</ul>` : '<span class="dim">No activity yet.</span>'}</div>`;
  }

  function renderAll() { renderSidebar(); renderFilters(); renderTable(); renderDetail(); const m = $('#me-chip'); m.innerHTML = S.me ? `${avatar(S.me)}<span>${esc(S.me)}</span>` : ''; }

  // ── actions ───────────────────────────────────────────────────────────────
  function toast(msg, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (opts.err ? ' err' : '');
    el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button data-undo="1">Undo</button>' : ''}`;
    $('#toasts').appendChild(el);
    if (opts.undo) el.querySelector('[data-undo]').addEventListener('click', () => { opts.undo(); el.remove(); });
    setTimeout(() => el.remove(), opts.undo ? 7000 : 3200);
  }
  function applyTree(r) {
    if (!r || !r.ok) return;
    if (Array.isArray(r.workflow) && r.workflow.length) { WF = r.workflow; buildViews(); if (!VIEWS.some(v => v.id === S.view)) S.view = 'mine'; }
    S.epics = r.epics; S.tasks = r.tasks; S.me = r.me; S.recent = r.recent || S.recent; S.loaded = true;
    S.syncing = !!r.syncing; S.errors = r.errors || []; S.busy = new Set(r.busy || []);
    if (S.selected && !taskById(S.selected)) S.selected = null;
  }
  async function reload() { applyTree(await api.v2GetTree()); renderAll(); if (P.open) renderPalette(); }

  // ── background jobs: task-server calls run off the main thread; the UI shows spinners and live progress ──
  const jobMeta = new Map();         // jobId → { kind, ids, prev, assignee, label }
  const jobSeen = new Set();
  let reloadTimer = null;
  function reloadSoon() {            // coalesce a burst of per-item events into one repaint
    if (reloadTimer) return;
    reloadTimer = setTimeout(async () => { reloadTimer = null; try { applyTree(await api.v2GetTree()); renderAll(); if (P.open) renderPalette(); } catch {} }, 120);
  }
  function jobToast(j) {
    let el = document.getElementById('job-' + j.id);
    if (!el) {
      el = document.createElement('div'); el.id = 'job-' + j.id; el.className = 'toast job';
      el.innerHTML = '<span class="spin"></span><span class="jt"></span><span class="jbar"><i></i></span><button data-canceljob="' + j.id + '">Cancel</button>';
      $('#toasts').appendChild(el);
    }
    const pct = j.total ? Math.round(j.done / j.total * 100) : 0;
    el.querySelector('.jt').textContent = `${j.label} ${j.done} / ${j.total}${j.failed ? ` · ${j.failed} failed` : ''}${j.cancelled ? ' · cancelling…' : '…'}`;
    el.querySelector('.jbar i').style.width = pct + '%';
    return el;
  }
  function onJob(j) {
    if (!j.finished) { jobToast(j); reloadSoon(); return; }
    const el = document.getElementById('job-' + j.id); if (el) el.remove();
    jobSeen.add(j.id);
    reloadSoon();
    const m = jobMeta.get(j.id) || {}; jobMeta.delete(j.id);
    j.warnings.slice(0, 4).forEach(w => toast(w, { err: true }));
    if (j.warnings.length > 4) toast(`…and ${j.warnings.length - 4} more failed`, { err: true });
    const ok = j.done - j.failed;
    if (!ok) return;
    if (m.kind === 'status') return toast(`${m.label}`);
    const what = ok === 1 ? (m.label || '1 task') : `${ok} tasks`;
    if (m.assignee === null) toast(`Unassigned ${what}`);
    else toast(`Assigned ${what} to you${j.cancelled ? ' (cancelled the rest)' : ''}`, { undo: m.prev ? () => undoAssign(m) : null });
  }
  async function undoAssign(m) {
    const byPrev = new Map();
    m.ids.forEach(id => { const k = m.prev[id] || null; (byPrev.get(k) || byPrev.set(k, []).get(k)).push(id); });
    for (const [who, list] of byPrev) await startAssign(list, who, { quiet: true });
  }
  async function startAssign(ids, assignee, o = {}) {
    ids = [].concat(ids);
    const prev = {}; ids.forEach(id => { const t = taskById(id); prev[id] = t ? t.assignee : null; });
    try {
      const r = await api.v2Assign({ taskIds: ids, assignee });
      applyTree(r); renderAll(); if (P.open) renderPalette();
      (r.warnings || []).forEach(w => toast(w, { err: true }));
      if (r.jobId) jobMeta.set(r.jobId, { kind: 'assign', ids, prev, assignee, label: ids.length === 1 ? ((taskById(ids[0]) || {}).key || ids[0]) : null });
      else if (!o.quiet && ids.length) toast(assignee === null ? 'Unassigned' : 'Assigned to you');
    } catch (e) { toast('Assign failed: ' + e.message, { err: true }); }
  }
  const assign = (ids, _unused, assignee) => startAssign(ids, assignee);
  async function setStatus(id, status) {
    const r = await api.v2SetStatus({ taskId: id, status: status.toUpperCase() });
    if (r && r.ok) {
      applyTree(r); renderAll();
      if (r.jobId) jobMeta.set(r.jobId, { kind: 'status', label: `${((taskById(id) || {}).key || id)} → ${stLabel(status)}` });
      else toast(`${id} → ${stLabel(status)}`);
    } else toast((r && r.error) || 'Failed to update', { err: true });
  }
  function selectEpic(id) {
    S.selected = 'epic:' + id;
    if (S.collapsed.has(id)) { S.collapsed.delete(id); store.set('collapsed', [...S.collapsed]); }
    renderTable(); renderDetail();
  }
  function select(id, openDetail = true) {
    S.selected = id;
    if (openDetail && id) {
      S.recent = [id, ...S.recent.filter(x => x !== id)].slice(0, 12);
      api.v2TouchRecent(id);
    }
    renderTable(); renderDetail();
    const row = document.querySelector(`tr[data-row="${CSS.escape(id || '')}"][data-kind="task"]`);
    if (row) row.scrollIntoView({ block: 'nearest' });
  }


  // ── right-click context menu (tasks, epics, pull requests, groups) ────────
  async function copyText(text, what) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
    }
    toast(`Copied ${what}`);
  }
  const descendants = id => { const out = []; const walk = pid => S.tasks.filter(t => t.parentId === pid).forEach(c => { out.push(c); walk(c.id); }); walk(id); return out; };
  const openLabel = n => n === 1 ? '1 open issue' : `${n} open issues`;

  function taskMenu(t) {
    const e = realEpic(t), kids = descendants(t.id), nk = S.tasks.filter(x => x.parentId === t.id).length;
    const subOpen = kids.filter(c => !c.mine && !isDone(c)), subMine = kids.filter(c => c.mine && !isDone(c));
    const open = isOpen(t, nk);
    const items = [
      { label: 'Open details', icon: 'info', hint: '↵', run: () => select(t.id) },
      t.url && { label: 'Open in browser', icon: 'ext', run: () => api.openUrl(t.url) },
      t.pr && t.pr.url && { label: `Open PR #${t.pr.number}`, icon: 'git', run: () => api.openUrl(t.pr.url) },
      { sep: true },
      t.mine ? { label: 'Unassign me', icon: 'userminus', run: () => assign(t.id, null, null) }
             : { label: t.assignee ? 'Take over (assign to me)' : 'Assign to me', icon: 'userplus', hint: 'a', disabled: isDone(t), run: () => assign(t.id) },
      nk && subOpen.length && { label: `Assign me + ${openLabel(subOpen.length)} below`, icon: 'userplus', run: () => assign([...(t.mine || isDone(t) ? [] : [t.id]), ...subOpen.map(c => c.id)]) },
      nk && subMine.length && { label: `Unassign me from ${subMine.length} below`, icon: 'userminus', run: () => assign(subMine.map(c => c.id), null, null) },
      nextStage(t.status) && { label: `Advance to ${nextStage(t.status).label}`, icon: 'play', run: () => setStatus(t.id, nextStage(t.status).id) },
      { label: 'Set status', icon: 'check', sub: WF.map(s => ({ label: s.label, dot: s.color, checked: t.status === s.id, run: () => setStatus(t.id, s.id) })) },
      (nk || t.pr) && { sep: true },
      (nk || t.pr) && { label: open ? 'Collapse' : 'Expand', icon: open ? 'collapse' : 'expand', hint: open ? '←' : '→', run: () => { S.toggled.has(t.id) ? S.toggled.delete(t.id) : S.toggled.add(t.id); renderTable(); } },
      { sep: true },
      e && { label: `Show epic ${e.code}`, icon: 'info', run: () => selectEpic(e.id) },
      e && { label: S.filters.epic.has(e.id) ? 'Clear epic filter' : `Filter list to ${e.code}`, icon: 'filter', run: () => { S.filters.epic = S.filters.epic.has(e.id) ? new Set() : new Set([e.id]); renderAll(); } },
      { sep: true },
      { label: `Copy key  ${t.key || t.id}`, icon: 'copy', run: () => copyText(t.key || t.id, 'key') },
      t.url && { label: 'Copy link', icon: 'copy', run: () => copyText(t.url, 'link') },
      { label: 'Copy title', icon: 'copy', run: () => copyText(t.title, 'title') },
    ];
    return items;
  }
  function epicMenu(e) {
    const all = S.tasks.filter(t => t.epicId === e.id);
    const toAssign = all.filter(t => !t.mine && !isDone(t)), mineOpen = all.filter(t => t.mine && !isDone(t));
    const closed = S.collapsed.has(e.id), showingAll = S.showAll.has(e.id);
    const visIds = new Set(visibleTasks().map(t => t.id)), hidden = all.some(t => !visIds.has(t.id));
    return [
      { label: 'Open details', icon: 'info', run: () => selectEpic(e.id) },
      e.url && { label: 'Open in browser', icon: 'ext', run: () => api.openUrl(e.url) },
      { sep: true },
      { label: toAssign.length ? `Assign all to me (${openLabel(toAssign.length)})` : 'Assign all to me', icon: 'userplus', disabled: !toAssign.length, run: () => assign(toAssign.map(t => t.id)) },
      { label: mineOpen.length ? `Unassign all from me (${mineOpen.length})` : 'Unassign all from me', icon: 'userminus', disabled: !mineOpen.length, run: () => assign(mineOpen.map(t => t.id), null, null) },
      { sep: true },
      { label: closed ? 'Expand' : 'Collapse', icon: closed ? 'expand' : 'collapse', run: () => toggleEpic(e.id) },
      (hidden || showingAll) && { label: showingAll ? 'Apply view filters' : `Show all ${all.length} issues`, icon: 'list', run: () => { showingAll ? S.showAll.delete(e.id) : S.showAll.add(e.id); renderTable(); } },
      { label: S.filters.epic.has(e.id) ? 'Clear epic filter' : 'Filter list to this epic', icon: 'filter', run: () => { S.filters.epic = S.filters.epic.has(e.id) ? new Set() : new Set([e.id]); renderAll(); } },
      { sep: true },
      { label: `Copy key  ${e.code}`, icon: 'copy', run: () => copyText(e.code, 'key') },
      e.url && { label: 'Copy link', icon: 'copy', run: () => copyText(e.url, 'link') },
      { label: 'Copy title', icon: 'copy', run: () => copyText(e.name, 'title') },
    ];
  }
  function menuFor(row) {
    const kind = row.dataset.kind;
    if (kind === 'epic') { const e = epicOf(row.dataset.row); return e ? epicMenu(e) : null; }
    if (kind === 'task' || kind === 'pr') {
      const t = taskById(row.dataset.row); if (!t) return null;
      if (kind === 'pr') return [t.pr.url && { label: `Open PR #${t.pr.number}`, icon: 'git', run: () => api.openUrl(t.pr.url) }, t.pr.url && { label: 'Copy PR link', icon: 'copy', run: () => copyText(t.pr.url, 'link') },
        { label: 'Open task', icon: 'info', run: () => select(t.id) }];
      return taskMenu(t);
    }
    if (kind === 'group') { const k = row.dataset.gkey, closed = S.collapsedGroups.has(k); return [{ label: closed ? 'Expand group' : 'Collapse group', icon: closed ? 'expand' : 'collapse', run: () => { closed ? S.collapsedGroups.delete(k) : S.collapsedGroups.add(k); renderTable(); } }]; }
    return null;
  }
  function itemHtml(it, path) {
    if (!it) return '';
    if (it.sep) return '<div class="ctx-sep"></div>';
    const id = path.join('.');
    if (it.sub) return `<div class="ctx-item has-sub ${it.disabled ? 'dis' : ''}" role="menuitem" aria-haspopup="true">${it.icon ? icon(it.icon, 14) : '<span class="ctx-i"></span>'}<span class="ctx-l">${esc(it.label)}</span><span class="ctx-arrow">▸</span><div class="ctx-sub">${it.sub.map((s, i) => itemHtml(s, [...path, i])).join('')}</div></div>`;
    return `<button class="ctx-item ${it.disabled ? 'dis' : ''}" role="menuitem" data-ci="${id}" ${it.disabled ? 'disabled' : ''}>${it.dot ? `<span class="ctx-dot" style="background:${it.dot}"></span>` : it.icon ? icon(it.icon, 14) : '<span class="ctx-i"></span>'}<span class="ctx-l">${esc(it.label)}</span>${it.checked ? '<span class="ctx-hint">✓</span>' : it.hint ? `<kbd class="ctx-hint">${esc(it.hint)}</kbd>` : ''}</button>`;
  }
  let ctxItems = [];
  function showContextMenu(x, y, items) {
    closeContext();
    ctxItems = items.filter(Boolean);
    // drop leading/trailing/duplicate separators
    ctxItems = ctxItems.filter((it, i, arr) => !it.sep || (i > 0 && i < arr.length - 1 && !arr[i - 1].sep));
    const el = $('#ctx');
    el.innerHTML = ctxItems.map((it, i) => itemHtml(it, [i])).join('');
    el.classList.remove('hidden');
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(4, Math.min(x, innerWidth - w - 6)) + 'px';
    el.style.top = Math.max(4, Math.min(y, innerHeight - h - 6)) + 'px';
    el.classList.toggle('flip', x + w + 230 > innerWidth);
  }
  function closeContext() {
    const el = $('#ctx'); if (el) el.classList.add('hidden');
    document.querySelectorAll('tr.ctx-target').forEach(r => r.classList.remove('ctx-target'));
  }
  function runCtx(path) {
    let it = { sub: ctxItems };
    for (const i of path.split('.').map(Number)) it = (it.sub || [])[i];
    closeContext();
    if (it && it.run && !it.disabled) it.run();
  }

  // generic popover (status picker)
  function popover(anchor, items, onPick) {
    closePopover();
    const r = anchor.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'menu'; el.id = 'pop';
    el.style.cssText = `position:fixed;left:${Math.min(r.left, innerWidth - 210)}px;top:${r.bottom + 4}px;z-index:60`;
    el.innerHTML = items.map(([k, l, col]) => `<button class="mi" data-pick="${k}"><span class="lozenge" style="--c:${col}"><span class="lz-t">${esc(l)}</span></span></button>`).join('');
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-pick]'); if (b) { closePopover(); onPick(b.dataset.pick); } });
    document.body.appendChild(el);
  }
  function closePopover() { const p = $('#pop'); if (p) p.remove(); closeContext(); }

  // ── search & assign palette ───────────────────────────────────────────────
  const P = { open: false, q: '', scope: 'all', status: new Set(), prio: new Set(), epic: '', sel: new Set(), cur: 0, items: [] };

  function parseQuery(q) {
    const f = { terms: [], unassigned: false, mine: false, assignee: null, status: null, prio: null, epic: null, num: null };
    for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
      const low = tok.toLowerCase();
      if (low === 'is:unassigned' || low === 'no:assignee') f.unassigned = true;
      else if (low === 'is:mine' || low === '@me') f.mine = true;
      else if (low.startsWith('assignee:')) f.assignee = low.slice(9);
      else if (low.startsWith('@') && low.length > 1) f.assignee = low.slice(1);
      else if (low.startsWith('status:')) f.status = resolveStage(low.slice(7));
      else if (/^p[0-3]$/.test(low)) f.prio = low.toUpperCase();
      else if (low.startsWith('epic:')) f.epic = low.slice(5);
      else if (/^#\d+$/.test(low)) f.num = low.slice(1);
      else f.terms.push(low);
    }
    return f;
  }
  function score(t, f) {
    const e = epicOf(t.epicId);
    if (f.num && String(t.number) !== f.num) return -1;
    if (f.unassigned && t.assignee) return -1;
    if (f.mine && !t.mine) return -1;
    if (f.assignee && !(t.assignee || '').toLowerCase().includes(f.assignee)) return -1;
    if (f.status && t.status !== f.status) return -1;
    if (f.prio && t.priority !== f.prio) return -1;
    if (f.epic && !(e && (e.code + ' ' + e.name).toLowerCase().includes(f.epic))) return -1;
    let s = f.num ? 100 : 1;
    const title = t.title.toLowerCase(), key = t.id.toLowerCase();
    for (const w of f.terms) {
      let m = 0;
      if (key === w || String(t.number) === w) m = 100;
      else if (key.includes(w)) m = 40;
      else if (title.split(/[^a-z0-9]+/).some(x => x.startsWith(w))) m = 30;
      else if (title.includes(w)) m = 20;
      else if (e && (e.code + ' ' + e.name).toLowerCase().includes(w)) m = 8;
      else if ((t.assignee || '').toLowerCase().includes(w)) m = 6;
      else if ((t.description || '').toLowerCase().includes(w) || (t.labels || []).join(' ').toLowerCase().includes(w)) m = 3;
      if (!m) return -1;
      s += m;
    }
    return s;
  }
  const byPriority = (a, b) => a.priority.localeCompare(b.priority) || new Date(b.updated || 0) - new Date(a.updated || 0);
  const hl = (text, terms) => {
    let out = esc(text);
    for (const w of terms || []) if (w.length > 1) out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    return out;
  };

  function palResults() {
    const f = parseQuery(P.q);
    const hasQuery = P.q.trim().length > 0;
    const prio = P.prio, status = P.status;
    const pass = t => {
      if (P.scope === 'unassigned' && t.assignee) return false;
      if (P.scope === 'mine' && !t.mine) return false;
      if (P.scope === 'recent' && !S.recent.includes(t.id)) return false;
      if (prio.size && !prio.has(t.priority)) return false;
      if (status.size ? !status.has(t.status) : (isDone(t) && !(f.status && isDoneId(f.status)))) return false;
      if (P.epic && t.epicId !== P.epic) return false;
      return true;
    };
    const local = S.tasks.filter(pass).map(t => ({ t, s: score(t, f) })).filter(x => x.s >= 0);
    const sections = [];
    if (!hasQuery && P.scope === 'all' && !prio.size && !status.size && !P.epic) {
      const recent = S.recent.map(taskById).filter(t => t && !isDone(t)).slice(0, 5);
      const rid = new Set(recent.map(t => t.id));
      const sug = local.map(x => x.t).filter(t => !t.assignee && !rid.has(t.id)).sort(byPriority).slice(0, 8);
      if (recent.length) sections.push({ title: 'Recently viewed', items: recent });
      if (sug.length) sections.push({ title: 'Suggested — unassigned, highest priority first', items: sug });
    } else {
      const sorter = hasQuery ? (a, b) => b.s - a.s || byPriority(a.t, b.t)
        : P.scope === 'recent' ? (a, b) => S.recent.indexOf(a.t.id) - S.recent.indexOf(b.t.id)
        : (a, b) => (!!a.t.assignee - !!b.t.assignee) || byPriority(a.t, b.t);
      const l = local.sort(sorter).map(x => x.t).slice(0, 50);
      sections.push({ title: P.scope === 'recent' ? 'Recently viewed' : `Results (${local.length})`, items: l });
    }
    return { sections, terms: f.terms };
  }

  function renderPalette() {
    const counts = {
      all: S.tasks.filter(t => !isDone(t)).length,
      unassigned: S.tasks.filter(t => !t.assignee && !isDone(t)).length,
      recent: S.recent.filter(id => taskById(id)).length,
      mine: S.tasks.filter(t => t.mine && !isDone(t)).length,
    };
    const scopes = [['all', 'All'], ['unassigned', 'Unassigned'], ['recent', 'Recent'], ['mine', 'Mine']];
    $('#pal-filters').innerHTML =
      scopes.map(([k, l]) => `<button class="pill ${P.scope === k ? 'on' : ''}" data-pscope="${k}">${l}<span class="n">${counts[k]}</span></button>`).join('') +
      '<span class="pal-sep"></span>' +
      Object.keys(PRIO).map(p => `<button class="pill ${P.prio.has(p) ? 'on' : ''}" data-pprio="${p}" title="${PRIO[p]}">${p}</button>`).join('') +
      '<span class="pal-sep"></span>' +
      WF.map(s => `<button class="pill ${P.status.has(s.id) ? 'on' : ''}" data-pstatus="${s.id}">${esc(s.label)}</button>`).join('') +
      `<span class="pal-sep"></span><select class="sel" id="pal-epic" aria-label="Epic"><option value="">All epics</option>${S.epics.map(e => `<option value="${esc(e.id)}" ${P.epic === e.id ? 'selected' : ''}>${esc(e.code)}</option>`).join('')}</select>`;

    const { sections, terms } = palResults();
    P.items = sections.flatMap(s => s.items);
    if (P.cur >= P.items.length) P.cur = Math.max(0, P.items.length - 1);
    let idx = 0, html = '';
    for (const sec of sections) {
      html += `<div class="pr-sec"><span>${esc(sec.title)}</span></div>`;
      for (const t of sec.items) {
        const i = idx++, e = epicOf(t.epicId);
        const mine = t.mine, checked = P.sel.has(t.id);
        html += `<div class="res ${i === P.cur ? 'cur' : ''}" data-ri="${i}" role="option">
          <span class="chk">${mine ? '<span style="width:15px;display:inline-block"></span>' : `<input type="checkbox" data-rsel="${esc(t.id)}" ${checked ? 'checked' : ''} aria-label="Select ${esc(t.id)}">`}</span>
          <div class="body"><div class="l1">${typeBadge(t.type)}<span class="key">${esc(t.key || t.id)}</span><span class="t">${hl(t.title, terms)}</span></div>
            <div class="l2">${e ? `<span><span class="epic-dot" style="display:inline-block;background:${epicColor(e.id)};margin:0 4px 0 0"></span>${esc(e.code)}</span>` : ''}${lozenge(t.status)}${prioCell(t.priority)}
              <span class="assignee ${t.assignee ? '' : 'none'}">${avatar(t.assignee)}<span class="nm">${t.assignee ? esc(t.assignee) : 'Unassigned'}</span></span><span class="dim">${timeAgo(t.updated)}</span></div></div>
          <div class="act">${mine ? '<span class="assigned-ok">✓ Yours</span>' : `<button class="btn btn-sm ${t.assignee ? '' : 'btn-primary'}" data-pasg="${esc(t.id)}">${t.assignee ? 'Take over' : 'Assign to me'}</button>`}</div></div>`;
      }
    }
    if (!P.items.length) html = `<div class="pal-empty">${emptyArt('search')}<div style="margin-top:6px"><b>No matching tasks</b></div><div>Try fewer filters, or search by key, title, or <code>@person</code>.</div></div>`;
    $('#pal-results').innerHTML = html;
    const bulk = [...P.sel].filter(id => { const t = P.items.find(x => x.id === id) || taskById(id); return t && !t.mine; });
    $('#pal-bulk').disabled = !bulk.length;
    $('#pal-bulk').textContent = bulk.length ? `Assign ${bulk.length} selected to me` : 'Assign selected to me';
    const cur = document.querySelector('.res.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function openPalette(prefill) {
    P.open = true; P.cur = 0; P.sel.clear();
    if (typeof prefill === 'string') P.q = prefill;
    $('#scrim').classList.remove('hidden');
    const inp = $('#pal-input'); inp.value = P.q; inp.focus(); inp.select();
    renderPalette();
  }
  function closePalette() { P.open = false; $('#scrim').classList.add('hidden'); }
  async function paletteAssign(ids) {
    ids.forEach(id => P.sel.delete(id));
    await assign(ids);
  }

  // ── events ────────────────────────────────────────────────────────────────
  function wire() {
    document.addEventListener('click', ev => {
      const tgt = ev.target;
      if (!tgt.closest('.fchip') && S.menu) { S.menu = null; renderFilters(); }
      const inCtx = ev.composedPath().some(n => n.id === 'ctx');   // composedPath survives the menu re-rendering itself
      if (!tgt.closest('#pop') && !inCtx && !tgt.closest('[data-act="status"]')) closePopover();
      if (inCtx) return;

      let el;
      if ((el = tgt.closest('[data-open]'))) { ev.preventDefault(); ev.stopPropagation(); api.openUrl(el.dataset.open); return; }
      if ((el = tgt.closest('a[data-selectid]'))) { ev.preventDefault(); select(el.dataset.selectid); return; }
      if ((el = tgt.closest('[data-view]'))) { S.view = el.dataset.view; store.set('view', S.view); renderAll(); return; }
      if ((el = tgt.closest('[data-epic]'))) { const id = el.dataset.epic; S.filters.epic = S.filters.epic.has(id) ? new Set() : new Set([id]); renderAll(); return; }
      if ((el = tgt.closest('[data-fmenu]'))) { S.menu = S.menu === el.dataset.fmenu ? null : el.dataset.fmenu; renderFilters(); return; }
      if (tgt.closest('[data-clear]')) { Object.values(S.filters).forEach(s => s.clear()); S.q = ''; $('#q').value = ''; renderAll(); return; }
      if (tgt.closest('[data-find]')) { openPalette(''); return; }
      if ((el = tgt.closest('[data-etwist]'))) { toggleEpic(el.dataset.etwist); return; }
      if ((el = tgt.closest('[data-selepic]'))) { selectEpic(el.dataset.selepic); return; }
      if ((el = tgt.closest('[data-gtwist]'))) { const k = el.dataset.gtwist; S.collapsedGroups.has(k) ? S.collapsedGroups.delete(k) : S.collapsedGroups.add(k); renderTable(); return; }
      if ((el = tgt.closest('[data-showall]'))) { const id = el.dataset.showall; S.showAll.has(id) ? S.showAll.delete(id) : S.showAll.add(id); renderTable(); return; }
      if ((el = tgt.closest('[data-selectid]'))) { select(el.dataset.selectid); return; }
      if ((el = tgt.closest('[data-canceljob]'))) { api.v2CancelJob && api.v2CancelJob(el.dataset.canceljob); return; }
      if ((el = tgt.closest('[data-unassignepic]'))) { const ids = S.tasks.filter(t => t.epicId === el.dataset.unassignepic && t.mine && !isDone(t)).map(t => t.id); assign(ids, null, null); return; }
      if ((el = tgt.closest('[data-assignepic]'))) { const ids = S.tasks.filter(t => t.epicId === el.dataset.assignepic && !t.mine && !isDone(t)).map(t => t.id); assign(ids); return; }
      if ((el = tgt.closest('[data-twist]'))) { const id = el.dataset.twist; S.toggled.has(id) ? S.toggled.delete(id) : S.toggled.add(id); renderTable(); return; }
      if ((el = tgt.closest('[data-act="status"]'))) {
        const id = el.dataset.id;
        popover(el, WF.map(s => [s.id, s.label, s.color]), k => setStatus(id, k));
        ev.stopPropagation(); return;
      }
      if ((el = tgt.closest('[data-act="assign"]'))) { assign(el.dataset.id); return; }
      if ((el = tgt.closest('[data-act="unassign"]'))) { assign(el.dataset.id, null, null); return; }
      if ((el = tgt.closest('[data-open]'))) { api.openUrl(el.dataset.open); return; }
      if (tgt.closest('[data-close]')) { S.selected = null; renderTable(); renderDetail(); return; }
      if ((el = tgt.closest('tr.row.group'))) { const k = el.dataset.gkey; S.collapsedGroups.has(k) ? S.collapsedGroups.delete(k) : S.collapsedGroups.add(k); renderTable(); return; }
      if ((el = tgt.closest('tr.row'))) {
        const kind = el.dataset.kind;
        if (kind === 'epic') selectEpic(el.dataset.row);
        else select(el.dataset.row);
        return;
      }
      // palette
      if (tgt.id === 'scrim') { closePalette(); return; }
      if ((el = tgt.closest('[data-pscope]'))) { P.scope = el.dataset.pscope; P.cur = 0; renderPalette(); $('#pal-input').focus(); return; }
      if ((el = tgt.closest('[data-pprio]'))) { const p = el.dataset.pprio; P.prio.has(p) ? P.prio.delete(p) : P.prio.add(p); P.cur = 0; renderPalette(); $('#pal-input').focus(); return; }
      if ((el = tgt.closest('[data-pstatus]'))) { const s = el.dataset.pstatus; P.status.has(s) ? P.status.delete(s) : P.status.add(s); P.cur = 0; renderPalette(); $('#pal-input').focus(); return; }
      if ((el = tgt.closest('[data-pasg]'))) { paletteAssign([el.dataset.pasg]); return; }
      if ((el = tgt.closest('[data-rsel]'))) return; // handled by change
      if ((el = tgt.closest('.res'))) { P.cur = +el.dataset.ri; renderPalette(); return; }
    });
    document.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.f) { const set = S.filters[t.dataset.f]; t.checked ? set.add(t.value) : set.delete(t.value); renderSidebar(); renderTable(); renderFilters(); return; }
      if (t.dataset.setstatus) { setStatus(t.dataset.setstatus, t.value); return; }
      if (t.dataset.rsel) { t.checked ? P.sel.add(t.dataset.rsel) : P.sel.delete(t.dataset.rsel); renderPalette(); return; }
      if (t.id === 'pal-epic') { P.epic = t.value; P.cur = 0; renderPalette(); return; }
    });
    $('#q').addEventListener('input', e => { S.q = e.target.value; renderTable(); });
    $('#mode-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { S.mode = b.dataset.mode; store.set('mode', S.mode); renderTable(); renderSidebar(); } });
    $('#groupby').addEventListener('change', e => { S.groupBy = e.target.value; store.set('groupBy', S.groupBy); renderTable(); });
    $('#btn-expand').addEventListener('click', () => {
      const real = S.epics.filter(e => !e.loose), all = real.every(e => S.collapsed.has(e.id));
      S.collapsed = all ? new Set() : new Set(real.map(e => e.id)); store.set('collapsed', [...S.collapsed]); renderTable();
    });
    document.querySelector('#tt thead').addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]'); if (!th) return;
      const k = th.dataset.sort;
      S.sort = S.sort.key === k ? { key: k, dir: -S.sort.dir } : { key: k, dir: 1 };
      renderTable();
    });
    $('#omni').addEventListener('click', () => openPalette(''));
    $('#btn-find').addEventListener('click', () => openPalette(''));
    $('#btn-refresh').addEventListener('click', async () => {
      if (S.syncing) return;
      S.syncing = true; renderTable();
      const r = api.v2Sync ? await api.v2Sync().catch(() => null) : null;
      if (r && r.ok) { applyTree(r); renderAll(); } else await reload();
      toast('Refreshed');
    });
    $('#pal-close').addEventListener('click', closePalette);
    $('#pal-bulk').addEventListener('click', () => paletteAssign([...P.sel].filter(id => { const t = P.items.find(x => x.id === id); return t && !t.mine; })));
    $('#pal-input').addEventListener('input', e => { P.q = e.target.value; P.cur = 0; renderPalette(); });
    document.addEventListener('keydown', onKey);
    $('#tt thead').addEventListener('contextmenu', ev => { ev.preventDefault(); const th = ev.target.closest('th'); columnMenu(ev.clientX, ev.clientY, th && th.dataset.col); });
    $('#btn-cols').addEventListener('click', ev => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); columnMenu(Math.max(8, r.right - 230), r.bottom + 4, null); });
    $('#tbody').addEventListener('contextmenu', ev => {
      const row = ev.target.closest('tr.row'); if (!row) return;
      const items = menuFor(row); if (!items) return;
      ev.preventDefault();
      row.classList.add('ctx-target');
      showContextMenu(ev.clientX, ev.clientY, items);
      row.classList.add('ctx-target');
    });
    $('#ctx').addEventListener('click', ev => { const b = ev.target.closest('[data-ci]'); if (b) runCtx(b.dataset.ci); });
    $('#ctx').addEventListener('contextmenu', ev => ev.preventDefault());
    window.addEventListener('blur', closeContext);
    window.addEventListener('resize', closeContext);
    $('#table-wrap').addEventListener('scroll', closeContext);
    new ResizeObserver(es => es.forEach(en => { const n = en.contentRect.width < 940; if (n !== S.narrow) { S.narrow = n; renderTable(); } })).observe($('#table-wrap'));
    if (api && api.onDataUpdated) api.onDataUpdated(() => reloadSoon());
    if (api && api.onV2Job) api.onV2Job(onJob);
  }
  function toggleEpic(id) { S.collapsed.has(id) ? S.collapsed.delete(id) : S.collapsed.add(id); store.set('collapsed', [...S.collapsed]); renderTable(); }

  function onKey(e) {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (P.open) {
      if (e.key === 'Escape') { closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); P.cur = Math.min(P.items.length - 1, P.cur + 1); renderPalette(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); P.cur = Math.max(0, P.cur - 1); renderPalette(); return; }
      if (e.key === 'Tab' && P.items[P.cur] && document.activeElement.id === 'pal-input') {
        e.preventDefault(); const t = P.items[P.cur];
        if (!t.mine) { P.sel.has(t.id) ? P.sel.delete(t.id) : P.sel.add(t.id); }
        P.cur = Math.min(P.items.length - 1, P.cur + 1); renderPalette(); return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const bulk = [...P.sel].filter(id => { const t = P.items.find(x => x.id === id); return t && !t.mine; });
        if (bulk.length && (e.metaKey || e.ctrlKey)) { paletteAssign(bulk); return; }
        const t = P.items[P.cur]; if (t && !t.mine) paletteAssign([t.id]);
        return;
      }
      return;
    }
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(''); return; }
    if (!$('#ctx').classList.contains('hidden') && e.key === 'Escape') { closeContext(); return; }
    if (typing) { if (e.key === 'Escape') document.activeElement.blur(); return; }
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      const sel = S.selected && S.selected.startsWith('epic:') ? S.selected.slice(5) : S.selected;
      const row = sel && document.querySelector(`tr.row[data-row="${CSS.escape(sel)}"]:not(.sub)`);
      if (row) { e.preventDefault(); const r = row.getBoundingClientRect(); const items = menuFor(row); if (items) { row.classList.add('ctx-target'); showContextMenu(r.left + 120, r.bottom - 6, items); } }
      return;
    }
    if (e.key === 'Escape') { if (S.selected) { S.selected = null; renderTable(); renderDetail(); } closePopover(); return; }
    const idx = S.rows.findIndex(r => (r.kind === 'task' ? r.id : 'epic:' + r.id) === S.selected);
    const move = d => {
      const nxt = S.rows[Math.max(0, Math.min(S.rows.length - 1, (idx < 0 ? (d > 0 ? -1 : S.rows.length) : idx) + d))];
      if (!nxt) return;
      if (nxt.kind === 'task') select(nxt.id, true);
      else { S.selected = 'epic:' + nxt.id; renderTable(); renderDetail(); document.querySelector(`tr[data-row="${CSS.escape(nxt.id)}"]`)?.scrollIntoView({ block: 'nearest' }); }
    };
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'a' && S.selected) { const t = taskById(S.selected); if (t && !t.mine && !isDone(t)) assign(t.id); }
    else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && S.selected) {
      const t = taskById(S.selected); if (!t) return;
      const nk = S.tasks.filter(x => x.parentId === t.id).length;
      if (t.pr || nk) { const want = e.key === 'ArrowRight'; if (isOpen(t, nk) !== want) { S.toggled.has(t.id) ? S.toggled.delete(t.id) : S.toggled.add(t.id); renderTable(); } }
    }
  }

  // Dev probe hook (see lib/dev-probe.js): a compact picture of what the UI is showing right now.
  window.__dcDebug = () => ({
    view: S.view, mode: S.mode, sort: S.sort, groupBy: S.groupBy, q: S.q, narrow: S.narrow, syncing: S.syncing, busy: [...S.busy], errors: S.errors,
    filters: Object.fromEntries(Object.entries(S.filters).map(([k, v]) => [k, [...v]])),
    epics: S.epics.map(e => ({ id: e.id, code: e.code, number: e.number, name: e.name, status: e.status, loose: !!e.loose })),
    rows: [...document.querySelectorAll('#tbody tr.row')].slice(0, 150).map(r => r.dataset.kind + ' ' + (r.dataset.row || r.dataset.gkey)),
    taskCount: S.tasks.length,
  });

  // ── boot ──────────────────────────────────────────────────────────────────
  async function init() {
    S.view = store.get('view', 'mine'); S.mode = ({ tree: 'epics', flat: 'tasks' })[store.get('mode', 'epics')] || store.get('mode', 'epics'); S.groupBy = store.get('groupBy', 'none');
    S.collapsed = new Set(store.get('collapsed', []));
    S.cols = store.get('cols', null);
    if (!VIEWS.some(v => v.id === S.view)) S.view = 'mine';   // legacy ids (in_progress/review/done) fall back; stage views re-validated on first tree load
    wire(); renderAll();
    try {
      const r = await api.v2GetTree();
      applyTree(r);
      // first run on an empty "mine" view: fall back to All so the screen is never blank
      renderAll();
      if (api.v2Sync) { S.syncing = true; renderTable(); api.v2Sync().then(r => { if (r && r.ok) { applyTree(r); renderAll(); } }).catch(() => { S.syncing = false; renderTable(); }); }
    } catch (e) { $('#empty').classList.remove('hidden'); $('#empty').innerHTML = `<h3>Couldn’t load tasks</h3><div>${esc(e.message)}</div>`; }
  }
  init();
})();
