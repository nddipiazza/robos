'use strict';
/**
 * Dev Central v2 — task-tree data layer.
 *
 * Tasks come from the RobOS task servers configured in Task Servers (settings.json → task_servers:
 * GitHub issues, Jira, …) through the `robos-task-client` adapters. GitHub auth is the RobOS-selected
 * Git client account (see robos-task-client/github-adapter.js and the robos-github-auth skill).
 *
 * Hierarchy: an issue that has sub-issues (GitHub) / is a parent (Jira) becomes an "epic" row and its
 * descendants are the tasks under it. Issues with no parent and no children are grouped per server.
 * Locally-stored RobOS features (dev-central-feature.json) are merged in for non-server work.
 *
 * Extra state lives in ~/.config/robos/dev-central-v2.json (recent list) and a per-server cache in
 * dev-central-v2-cache.json so the window paints instantly while a refresh runs in the background.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let Worker = null;
try { ({ Worker } = require('node:worker_threads')); } catch {}
let githubAccounts = null;
try { githubAccounts = require('../../robos-lib/github-accounts'); } catch {}

// ── Workflow stages ───────────────────────────────────────────────────────────
// The single source of truth is robos-lib/default-workflow (default-workflow.jsonld). Never hard-code stage names.
let defaultWorkflow = null;
try { defaultWorkflow = require('../../robos-lib/default-workflow'); } catch {}
const FALLBACK_STATES = [
  { id: 'not-started', label: 'Not started', color: '#8b949e', agent_phases: ['new', 'planning', 'planning-agent', 'plan-review'], is_initial: true, is_final: false },
  { id: 'designed', label: 'Designed', color: '#58a6ff', agent_phases: ['plan-approved'], is_initial: false, is_final: false },
  { id: 'agent-implementing', label: 'Agent implementing', color: '#a371f7', agent_phases: ['implementing'], is_initial: false, is_final: false },
  { id: 'local-evidence-review', label: 'Local evidence review', color: '#d29922', agent_phases: ['local-review'], is_initial: false, is_final: false },
  { id: 'draft-pr-pipeline-review', label: 'Draft PR pipeline review', color: '#db8b54', agent_phases: ['checking-pr'], is_initial: false, is_final: false },
  { id: 'human-review', label: 'Human review', color: '#58a6ff', agent_phases: ['review'], is_initial: false, is_final: false },
  { id: 'closed', label: 'Closed', color: '#3fb950', agent_phases: ['merged', 'complete'], is_initial: false, is_final: true },
];
function workflowStates() {
  try { const st = defaultWorkflow.createDefaultWorkflow('task').states; if (Array.isArray(st) && st.length) return st; } catch {}
  return FALLBACK_STATES;
}
const slug = x => String(x == null ? '' : x).trim().toLowerCase().replace(/[\s_]+/g, '-');
// Old / foreign status words → workflow stage ids (kept so GitHub labels and saved data written before the new workflow still map).
const LEGACY = {
  open: 'not-started', todo: 'not-started', 'to-do': 'not-started', backlog: 'not-started', new: 'not-started', unstarted: 'not-started',
  'in-progress': 'agent-implementing', inprogress: 'agent-implementing', doing: 'agent-implementing', started: 'agent-implementing',
  development: 'agent-implementing', 'in-development': 'agent-implementing', implementing: 'agent-implementing',
  review: 'human-review', 'in-review': 'human-review', 'code-review': 'human-review', 'in-code-review': 'human-review',
  'draft-pr': 'draft-pr-pipeline-review', 'pr-pipeline': 'draft-pr-pipeline-review',
  done: 'closed', resolved: 'closed', released: 'closed', deployed: 'closed', complete: 'closed', completed: 'closed', merged: 'closed',
};
function canonStatus(raw, { category, closed, type } = {}) {
  const states = workflowStates();
  const final = (states.find(s => s.is_final) || states[states.length - 1]).id;
  const initial = (states.find(s => s.is_initial) || states[0]).id;
  if (closed || String(category || '').toLowerCase() === 'done') return final;
  const k = slug(raw);
  if (k === 'blocked') return initial;
  for (const s of states) if (s.id === k || slug(s.label) === k || (s.agent_phases || []).includes(k)) return s.id;
  if (LEGACY[k]) return LEGACY[k];
  if (/evidence/.test(k)) return 'local-evidence-review';
  if (/draft|pipeline/.test(k)) return 'draft-pr-pipeline-review';
  if (/human|review/.test(k)) return 'human-review';
  if (/design|plan-approved/.test(k)) return 'designed';
  if (/implement|progress/.test(k)) return 'agent-implementing';
  if (type === 'jira') { const c = String(category || '').toLowerCase(); return c === 'indeterminate' ? 'agent-implementing' : initial; }
  return initial;
}
const normStatus = s => canonStatus(s);
const stageById = id => workflowStates().find(s => s.id === id);
const normPrio = p => (/^P[0-3]$/i.test(p || '') ? p.toUpperCase() : 'P2');

function register({ ipcMain, loadFeatures, saveFeatures, readSettings, getWindow, isTestMode, configDir }) {
  const V2_FILE = path.join(configDir, 'dev-central-v2.json');
  const CACHE_FILE = path.join(configDir, 'dev-central-v2-cache.json');

  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
  const writeJson = (f, v) => { try { fs.mkdirSync(configDir, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v)); } catch {} };
  const loadState = () => readJson(V2_FILE, { recent: [] });
  const saveState = st => writeJson(V2_FILE, st);
  let cache = readJson(CACHE_FILE, { servers: {} });
  let syncPromise = null;

  // ── task servers & adapters ───────────────────────────────────────────────
  function servers() {
    const list = ((readSettings() || {}).task_servers || []).filter(t => t && (t.type === 'github' || t.type === 'jira'));
    return list.map((t, i) => ({ ts: t, sid: String(t.id || t.name || `${t.type}-${i}`) }));
  }
  // Every task-server call (gh / Jira) runs in a worker-thread pool so the main process never blocks.
  const POOL_SIZE = 4;
  const pool = { slots: [], queue: [] };
  function poolPump() {
    while (pool.queue.length) {
      let slot = pool.slots.find(x => !x.job);
      if (!slot && pool.slots.length < POOL_SIZE) slot = poolSpawn();
      if (!slot) break;
      const job = pool.queue.shift();
      slot.job = job; slot.w.postMessage(job.msg);
    }
  }
  function poolSpawn() {
    const w = new Worker(path.join(__dirname, 'v2-worker.js'));
    const slot = { w, job: null };
    const drop = err => {
      pool.slots = pool.slots.filter(x => x !== slot);
      const j = slot.job; slot.job = null;
      if (j) j.reject(err);
      poolPump();
    };
    w.on('message', m => { const j = slot.job; slot.job = null; if (j) (m.ok ? j.resolve(m.result) : j.reject(new Error(m.error))); poolPump(); });
    w.on('error', drop);
    w.on('exit', () => drop(new Error('Task server worker stopped')));
    w.unref();
    pool.slots.push(slot);
    return slot;
  }
  function serverCall(ts, msg) {
    if (!Worker) return Promise.reject(new Error('worker_threads unavailable'));
    return new Promise((resolve, reject) => { pool.queue.push({ msg: { ts, ...msg }, resolve, reject }); poolPump(); });
  }
  const repoLabel = ts => ts.type === 'github'
    ? (ts.gh_org && ts.gh_repo ? `${ts.gh_org}/${ts.gh_repo}` : (ts.repos && ts.repos[0] ? `${ts.repos[0].org}/${ts.repos[0].repo}` : ts.name || ''))
    : (ts.name || ts.url || '');

  // ── identity ──────────────────────────────────────────────────────────────
  function me() {
    const s = readSettings() || {};
    let login = null; try { login = (githubAccounts && githubAccounts.read().git) || null; } catch {}
    const osUser = (() => { try { return os.userInfo().username; } catch { return 'me'; } })();
    const names = [login, ...servers().map(x => x.ts.username), s.display_name, s.user_name, s.user && s.user.name, 'Dev User', 'dev-user', osUser].filter(Boolean);
    return { name: login || (servers().find(x => x.ts.username) || { ts: {} }).ts.username || s.display_name || s.user_name || 'Dev User', aliases: new Set(names.map(x => String(x).toLowerCase())), login };
  }
  const isMe = (a, who) => !!a && who.aliases.has(String(a).toLowerCase());

  // ── normalization of task-client work items ───────────────────────────────
  const isBlocked = i => slug(i.status) === 'blocked' || (i.labels || []).some(l => /^blocked$/i.test(l));
  function statusOf(i, type) {
    return canonStatus(i.status, { category: i.statusCategory, closed: type === 'github' && String(i.statusCategory).toLowerCase() === 'done', type });
  }
  function prioOf(i) {
    const p = String(i.priority || '').toLowerCase();
    if (/critical|highest|blocker|p0/.test(p)) return 'P0';
    if (/high|p1/.test(p)) return 'P1';
    if (/low|p3/.test(p)) return 'P3';
    return 'P2';
  }
  function itemToTask(i, ts, sid, who, epicId, parentId) {
    const hist = [];
    if (i.created) hist.push({ timestamp: i.created, state: 'CREATED', actor: '', note: `Opened in ${repoLabel(ts)}` });
    if (i.updated && i.updated !== i.created) hist.push({ timestamp: i.updated, state: String(i.status || 'UPDATED').toUpperCase(), actor: '', note: 'Last updated on the task server' });
    return {
      id: `${sid}:${i.key}`, serverId: sid, number: ts.type === 'github' ? Number(i.id) : undefined, key: i.key,
      title: i.summary || '', type: /bug/i.test(i.issueType || '') || (i.labels || []).includes('bug') ? 'bug' : 'task',
      status: statusOf(i, ts.type), blocked: isBlocked(i), priority: prioOf(i), assignee: i.assignee || null, mine: isMe(i.assignee, who),
      description: String(i.description || '').slice(0, 800), url: i.url || null, labels: i.labels || [], pr: null,
      history: hist, updated: i.updated || i.created || null, created: i.created || null, repo: repoLabel(ts), epicId, parentId: parentId || null, subIssues: i.subIssues || 0,
    };
  }

  function buildServerTree(ts, sid, items, who) {
    const byKey = new Map(items.map(i => [i.key, i]));
    const kids = new Map();
    for (const i of items) if (i.parent && byKey.has(i.parent.key) && i.parent.key !== i.key) (kids.get(i.parent.key) || kids.set(i.parent.key, []).get(i.parent.key)).push(i);
    const isChild = i => !!(i.parent && byKey.has(i.parent.key) && i.parent.key !== i.key);
    const epics = [], tasks = [], placed = new Set();
    const descend = (item, epicId, parentTaskId, depth) => {
      if (depth > 6) return;
      for (const c of kids.get(item.key) || []) {
        if (placed.has(c.key)) continue;
        placed.add(c.key);
        const t = itemToTask(c, ts, sid, who, epicId, parentTaskId);
        tasks.push(t);
        descend(c, epicId, t.id, depth + 1);
      }
    };
    for (const r of items.filter(i => kids.has(i.key) && !isChild(i))) {
      placed.add(r.key);
      const epicId = `${sid}:${r.key}`;
      epics.push({
        id: epicId, code: r.key, name: r.summary, status: statusOf(r, ts.type), repo: repoLabel(ts), service: '',
        description: String(r.description || '').slice(0, 600), active: false, createdAt: r.created || null, url: r.url || null,
        number: ts.type === 'github' ? Number(r.id) : null, assignee: r.assignee || null, mine: isMe(r.assignee, who), serverId: sid, fromServer: true,
      });
      descend(r, epicId, null, 1);
    }
    const loose = items.filter(i => !placed.has(i.key));
    if (loose.length) {
      const epicId = `${sid}:~`;
      epics.push({ id: epicId, code: repoLabel(ts) || sid, name: `${ts.name || sid} — issues without a parent`, status: 'agent-implementing', repo: repoLabel(ts), service: '',
        description: '', active: false, createdAt: null, url: null, number: null, serverId: sid, fromServer: true, loose: true });
      for (const i of loose) tasks.push(itemToTask(i, ts, sid, who, epicId, null));
    }
    return { epics, tasks };
  }

  // ── local RobOS features (non-server work) ────────────────────────────────
  function normLocal(t, f, who) {
    const hist = t.lifetimeHistory || [];
    const last = hist.length ? hist[hist.length - 1].timestamp : null;
    const title = t.title || '';
    return {
      id: t.id, number: t.number, key: t.id, title,
      type: t.type || (/^(fix|bug)\b|\bleak\b|\bcrash\b/i.test(title) ? 'bug' : 'task'),
      status: normStatus(t.status), blocked: String(t.status).toUpperCase() === 'BLOCKED', priority: normPrio(t.priority), assignee: t.assignee || null, mine: isMe(t.assignee, who),
      description: t.description || '', url: t.taskServerUrl || null, labels: t.labels || [], pr: t.pr ? { ...t.pr } : null,
      history: hist, updated: t.updatedAt || last || f.createdAt || null, created: t.createdAt || f.createdAt || null, repo: f.repository || '', epicId: f.id, parentId: null, local: true,
    };
  }

  // Link pull requests to tasks: prefer an open PR, then merged, then closed; newest first.
  function attachPrs(tasks, prs) {
    if (!prs || !prs.length) return;
    const rank = p => (p.merged ? 1 : p.state === 'closed' ? 2 : 0);
    const by = new Map();
    for (const p of prs) for (const n of p.issues || []) (by.get(n) || by.set(n, []).get(n)).push(p);
    for (const t of tasks) {
      const list = (by.get(t.number) || []).slice().sort((a, b) => rank(a) - rank(b) || String(b.updated).localeCompare(String(a.updated)));
      if (!list.length) continue;
      const p = list[0];
      t.pr = { number: p.number, title: p.title, branch: p.branch, url: p.url, ci: p.ci, review: p.review, merged: p.merged, draft: p.draft, state: p.state, author: p.author };
      t.prCount = list.length;
    }
  }

  function buildTree() {
    const who = me();
    const epics = [], tasks = [], urls = new Set(), errors = [];
    for (const { ts, sid } of servers()) {
      const c = cache.servers[sid];
      if (c && c.error) errors.push({ server: ts.name || sid, error: c.error });
      if (!c || !c.items) continue;
      c.items.forEach(i => i.url && urls.add(i.url));
      const t = buildServerTree(ts, sid, c.items, who);
      attachPrs(t.tasks, c.prs);
      epics.push(...t.epics); tasks.push(...t.tasks);
    }
    for (const f of loadFeatures()) {
      const lt = (f.tasks || []).filter(t => !(t.taskServerUrl && urls.has(t.taskServerUrl)));
      if (!lt.length) continue;
      epics.push({ id: f.id, code: f.code || f.id, name: f.name, status: normStatus(f.status), repo: f.repository || '', service: f.targetService || '',
        description: f.description || '', active: !!f.active, createdAt: f.createdAt || null, url: f.issueUrl || null, number: null, local: true });
      for (const t of lt) tasks.push(normLocal(t, f, who));
    }
    return { ok: true, me: who.name, workflow: workflowStates().map(x => ({ id: x.id, label: x.label, color: x.color, initial: !!x.is_initial, final: !!x.is_final })), epics, tasks, recent: loadState().recent || [], syncing: !!syncPromise, busy: [...busy.keys()], jobs: [...jobs.values()].filter(j => !j.finished).map(snap), errors,
      servers: servers().map(x => ({ id: x.sid, name: x.ts.name || x.sid, type: x.ts.type })) };
  }

  const notify = () => { try { const w = getWindow && getWindow(); if (w && w.webContents) w.webContents.send('dc-data-updated', { v2: true }); } catch {} };

  // ── refresh from task servers ─────────────────────────────────────────────
  const fetchServer = (sid, ts) => serverCall(ts, { op: 'fetch' });
  function refresh() {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      await Promise.all(servers().map(async ({ ts, sid }) => {
        try { const r = await fetchServer(sid, ts); cache.servers[sid] = { items: Array.isArray(r) ? r : r.items, prs: Array.isArray(r) ? [] : (r.prs || []), fetchedAt: Date.now(), error: null }; }
        catch (e) { cache.servers[sid] = { ...(cache.servers[sid] || { items: [] }), error: String(e.message || e).slice(0, 300) }; }
      }));
      writeJson(CACHE_FILE, cache);
    })().finally(() => { syncPromise = null; notify(); });
    return syncPromise;
  }

  // ── background jobs ───────────────────────────────────────────────────────
  // Mutations on task servers are jobs: the IPC call returns at once, the renderer shows spinners on the affected
  // rows and live progress, and each finished item is pushed to the window as it completes.
  const jobs = new Map(); const busy = new Map(); let jobSeq = 0;
  const snap = j => ({ id: j.id, kind: j.kind, label: j.label, total: j.total, done: j.done, failed: j.failed, finished: j.finished, cancelled: j.cancelled, warnings: j.warnings.slice() });
  const sendJob = j => { try { const w = getWindow && getWindow(); if (w && w.webContents) w.webContents.send('dc-v2-job', snap(j)); } catch {} };
  function startJob(kind, label, items) {      // items: [{ taskId, key, run: async () => void }]
    const j = { id: 'job' + (++jobSeq), kind, label, total: items.length, done: 0, failed: 0, finished: false, cancelled: false, warnings: [] };
    jobs.set(j.id, j);
    items.forEach(it => busy.set(it.taskId, j.id));
    setImmediate(async () => {                 // after the IPC reply, so the renderer sees the job before its first event
      sendJob(j);
      let idx = 0;
      const lane = async () => {
        while (idx < items.length && !j.cancelled) {
          const it = items[idx++];
          try { await it.run(); }
          catch (e) { j.failed++; j.warnings.push(`${it.key}: ${String((e && e.message) || e).slice(0, 200)}`); }
          j.done++; busy.delete(it.taskId); sendJob(j);
        }
      };
      await Promise.all(Array.from({ length: Math.min(POOL_SIZE, items.length) }, lane));
      items.forEach(it => { if (busy.get(it.taskId) === j.id) busy.delete(it.taskId); });
      j.finished = true; writeJson(CACHE_FILE, cache); sendJob(j); notify();
      setTimeout(() => jobs.delete(j.id), 60000).unref();
    });
    return j;
  }
  ipcMain.handle('dc-v2-job-cancel', (_, id) => { const j = jobs.get(id); if (j) { j.cancelled = true; sendJob(j); } return { ok: !!j }; });

  // ── mutations ─────────────────────────────────────────────────────────────
  function serverOf(taskId) {
    for (const { ts, sid } of servers()) {
      if (String(taskId).startsWith(sid + ':')) {
        const key = String(taskId).slice(sid.length + 1);
        const item = ((cache.servers[sid] || {}).items || []).find(i => i.key === key);
        if (item) return { ts, sid, item };
      }
    }
    return null;
  }
  function findLocal(feats, taskId) {
    for (const f of feats) { const t = (f.tasks || []).find(x => x.id === taskId); if (t) return t; }
    return null;
  }
  function noteLocal(task, state, actor, text) {
    task.lifetimeHistory = task.lifetimeHistory || [];
    task.lifetimeHistory.push({ timestamp: new Date().toISOString(), state, actor, note: text });
  }

  ipcMain.handle('dc-v2-get-tree', () => buildTree());
  ipcMain.handle('dc-v2-sync', async () => { await refresh(); return buildTree(); });
  ipcMain.handle('dc-v2-touch-recent', (_, taskId) => {
    const st = loadState();
    st.recent = [taskId, ...(st.recent || []).filter(x => x !== taskId)].slice(0, 12);
    saveState(st);
    return { ok: true, recent: st.recent };
  });

  ipcMain.handle('dc-v2-assign', async (_, payload = {}) => {
    const who = me();
    const ids = payload.taskIds || (payload.taskId ? [payload.taskId] : []);
    const assignee = payload.assignee === null ? null : (payload.assignee || who.name);
    const warnings = [], items = [];
    let feats = null;
    for (const id of ids) {
      const srv = serverOf(id);
      if (srv) {
        const { ts, item } = srv;
        if (busy.has(id)) { warnings.push(`${item.key}: still updating`); continue; }
        if (assignee === null && ts.type !== 'github') { warnings.push(`${item.key}: unassigning is not supported for this task server`); continue; }
        if (assignee !== null && !isMe(assignee, who)) { warnings.push(`${item.key}: can only assign to yourself on this task server`); continue; }
        items.push({ taskId: id, key: item.key, run: async () => {
          if (assignee === null) await serverCall(ts, { op: 'call', method: 'unassignIssue', args: [item.id, '@me'] });
          else await serverCall(ts, { op: 'call', method: 'updateIssue', args: [ts.type === 'github' ? item.id : item.key, { assignee: ts.type === 'github' ? '@me' : (ts.username || who.name) }] });
          item.assignee = assignee;
        } });
        continue;
      }
      feats = feats || loadFeatures();
      const t = findLocal(feats, id);
      if (!t) { warnings.push(`Task ${id} not found`); continue; }
      const prev = t.assignee; t.assignee = assignee;
      noteLocal(t, assignee ? 'ASSIGNED' : 'UNASSIGNED', who.name, assignee ? `Assigned to ${assignee}${prev ? ` (was ${prev})` : ''}` : `Unassigned (was ${prev || 'nobody'})`);
    }
    if (feats) saveFeatures(feats);
    const job = items.length ? startJob('assign', assignee === null ? 'Unassigning' : 'Assigning to you', items) : null;
    if (!job) notify();
    return { ...buildTree(), warnings, jobId: job ? job.id : null };
  });

  ipcMain.handle('dc-v2-set-status', async (_, { taskId, status } = {}) => {
    const who = me();
    const state = stageById(status) || stageById(canonStatus(status));
    if (!state) return { ok: false, error: 'Unknown workflow stage' };
    const target = state.id;
    const srv = serverOf(taskId);
    if (srv) {
      const { ts, item } = srv;
      if (busy.has(taskId)) return { ok: false, error: `${item.key}: still updating` };
      const job = startJob('status', `Moving to ${state.label}`, [{ taskId, key: item.key, run: async () => {
        if (ts.type === 'github') {
          const wasClosed = String(item.statusCategory).toLowerCase() === 'done';
          const old = (item.labels || []).find(l => l.startsWith('state:'));
          if (state.is_final) await serverCall(ts, { op: 'call', method: 'closeIssue', args: [item.id] });
          else {
            if (wasClosed) await serverCall(ts, { op: 'call', method: 'reopenIssue', args: [item.id] });
            await serverCall(ts, { op: 'call', method: 'transitionIssueTo', args: [item.id, target, old && old.slice(6) !== target ? old.slice(6) : undefined] });
            item.labels = (item.labels || []).filter(l => !l.startsWith('state:')).concat([`state:${target}`]);
          }
          item.status = state.is_final ? 'closed' : target; item.statusCategory = state.is_final ? 'done' : 'indeterminate';
        } else {
          await serverCall(ts, { op: 'call', method: 'transitionIssueTo', args: [item.key, state.label] });
          item.status = state.label; item.statusCategory = state.is_final ? 'done' : state.is_initial ? 'new' : 'indeterminate';
        }
      } }]);
      return { ...buildTree(), jobId: job.id };
    }
    const feats = loadFeatures();
    const t = findLocal(feats, taskId);
    if (!t) return { ok: false, error: 'Task not found' };
    const prev = canonStatus(t.status); t.status = target;
    noteLocal(t, target.toUpperCase().replace(/-/g, '_'), who.name, `Stage ${(stageById(prev) || {}).label || prev} → ${state.label}`);
    saveFeatures(feats);
    notify();
    return buildTree();
  });

  if (!isTestMode) {
    fs.watchFile(require('../../robos-task-client/pr-task-status').notificationFile(),{persistent:false,interval:1000},(current,previous)=>{if(current.mtimeMs!==previous.mtimeMs)refresh().catch(()=>{});});
    setTimeout(() => refresh().catch(() => {}), 500);
    setInterval(() => refresh().catch(() => {}), 120000).unref();
  }
}

module.exports = { register };
