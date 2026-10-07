'use strict';
/**
 * Dev Central v2 — agent runs on tasks.
 *
 * A "run" is one RobOS agent session working on a task (Design, Implement, Resume). Dev Central launches runs from
 * the Options column, shows a running indicator on the task and its epic, streams the discussion, and can steer
 * (resume the same session with new instructions) or kill a run.
 *
 * Run records are plain JSON in ~/.robos/agent-runs/<runId>.json (+ <runId>.log, the agent's raw JSON-lines output).
 * Any RobOS app can publish a run for a task by writing the same record — Dev Central picks it up. Fields:
 *   runId, taskId | taskKey | url | number+repo, provider ('codex'|'claude'), sessionId, pid, status
 *   ('running'|'done'|'error'|'stopped'|'interrupted'), activity, mode, title, startedAt, updatedAt, cwd, log
 * Existing shared job-state files (~/.robos/agent-jobs/<sessionId>.json) that carry a task reference are shown too.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { randomUUID } = require('node:crypto');

let workTask = null;
for (const p of ['../../robos-agent-client/work-task/backend', '/usr/local/share/robos/robos-agent-client/work-task/backend']) {
  try { workTask = require(p); break; } catch {}
}
let jobState = null;
try { jobState = require('../../robos-lib/agent-job-state'); } catch {}
let sessionLink = null;
try { sessionLink = require('../../robos-lib/agent-session-link'); } catch {}

const RUNS_DIR = process.env.ROBOS_AGENT_RUNS_DIR || path.join(os.homedir(), '.robos', 'agent-runs');
const JOBS_DIR = process.env.ROBOS_AGENT_JOBS_DIR || path.join(os.homedir(), '.robos', 'agent-jobs');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

const alive = pid => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const clip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ── decoding the agent's JSON-lines output ────────────────────────────────────
function decodeLine(obj) {
  if (workTask && workTask.decode) { try { return workTask.decode(obj).events || []; } catch {} }
  const ev = [];
  if (obj.type === 'assistant') for (const b of (obj.message && obj.message.content) || []) { if (b.type === 'text') ev.push({ role: 'assistant', text: b.text }); if (b.type === 'tool_use') ev.push({ role: 'tool', name: b.name, text: JSON.stringify(b.input) }); }
  if (obj.type === 'item.completed' && obj.item && obj.item.type === 'agent_message') ev.push({ role: 'assistant', text: obj.item.text });
  return ev;
}
function sessionIdOf(obj) {
  const v = obj && (obj.thread_id || obj.session_id || (obj.thread && obj.thread.id) || (obj.init && obj.init.session_id));
  return typeof v === 'string' && UUID.test(v) ? v : null;
}
function parseLog(file, { max = 3 * 1024 * 1024 } = {}) {
  let text = '';
  try {
    const st = fs.statSync(file), fd = fs.openSync(file, 'r');
    const len = Math.min(st.size, max), buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, st.size - len); fs.closeSync(fd);
    text = buf.toString('utf8');
    if (st.size > max) text = text.slice(text.indexOf('\n') + 1);
  } catch { return { events: [], sessionId: null }; }
  const events = []; let sessionId = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let obj; try { obj = JSON.parse(line); } catch { events.push({ role: 'log', text: line.slice(0, 2000) }); continue; }
    sessionId = sessionId || sessionIdOf(obj);
    for (const e of decodeLine(obj)) if (e && e.text != null && String(e.text).trim()) events.push({ role: e.role || 'assistant', name: e.name || '', text: String(e.text).slice(0, 8000) });
  }
  return { events, sessionId };
}

// ── prompts ───────────────────────────────────────────────────────────────────
const DELIVERY = 'DEFAULT ROBOS DELIVERY WORKFLOW:\nCreate a feature branch (use the requested branch, otherwise codex/<task-key>). Implement and test the task, commit the task changes, and push that branch to origin. Do not create a pull request, including a draft PR. Report the workspace path, repository, branch, base branch, validation and evidence locations. The developer may optionally review Changes, Evidence and Walkthrough locally and then explicitly click Create PR when ready. Never make PR creation an automatic completion step.';
function taskBlock(t, epic) {
  return [`Task: ${t.key || t.id} — ${t.title}`, t.url ? `Link: ${t.url}` : '', t.repo ? `Repository: ${t.repo}` : '', epic && !epic.loose ? `Epic: ${epic.code} — ${epic.name}` : '', (t.labels || []).length ? `Labels: ${(t.labels || []).join(', ')}` : '', '', 'Description:', t.description || '(no description)'].filter(x => x !== '').join('\n');
}
function promptFor(mode, t, epic, note) {
  const extra = note ? `\n\nAdditional instructions from the developer:\n${note}` : '';
  if (mode === 'design') return `You are designing the work for this task. Do NOT modify any files.\n\n${taskBlock(t, epic)}\n\nProduce a concise design: the approach, the files/modules to change, interfaces, a test plan, risks and open questions. If requirements are ambiguous, list specific questions.${extra}`;
  if (mode === 'implement') return `Implement this task.\n\n${taskBlock(t, epic)}\n\n${DELIVERY}${extra}`;
  return `Continue working on this task from where you left off.\n\n${taskBlock(t, epic)}${extra}`;
}

// ── the registry ──────────────────────────────────────────────────────────────
function create({ readSettings, notify, isTestMode }) {
  fs.mkdirSync(RUNS_DIR, { recursive: true, mode: 0o700 });
  const children = new Map();                // runId → ChildProcess (only for runs this process launched)
  let lastSig = '';

  const recFile = id => path.join(RUNS_DIR, id + '.json');
  const logFile = id => path.join(RUNS_DIR, id + '.log');
  /** Mirror the run into the shared job-state store (~/.robos/agent-jobs) so RobOS Agents & other apps see who launched it and for which task. */
  const publish = r => {
    if (!jobState || !r.sessionId || r.provider !== 'codex') return;
    try {
      jobState.write({ sessionId: r.sessionId, provider: 'codex', status: r.status === 'done' ? 'paused' : r.status === 'stopped' ? 'idle' : r.status,
        activity: r.activity || '', agentName: r.title, childPid: r.status === 'running' ? r.pid : null, mode: r.mode, startedAt: r.startedAt,
        runId: r.runId, launchedBy: r.launchedBy, taskId: r.taskId, taskKey: r.taskKey, taskUrl: r.url, repo: r.repo, epicId: r.epicId, epicKey: r.epicKey });
    } catch {}
  };
  const save = r => { r.updatedAt = Date.now(); publish(r); const f = recFile(r.runId), tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(r)); fs.renameSync(tmp, f); };
  const load = id => /^[\w-]{6,80}$/.test(id || '') ? readJson(recFile(id), null) : null;

  /** Reconcile a record with reality (process liveness, session id, last activity). Returns the (possibly updated) record. */
  function refresh(r) {
    let dirty = false;
    const settled = r.status !== 'running' && r.sessionId && r.activity;   // finished runs don't need re-reading
    if (r.log && !settled) {
      const { events, sessionId } = parseLog(r.log, { max: 256 * 1024 });
      if (sessionId && r.sessionId !== sessionId) { r.sessionId = sessionId; dirty = true; }
      const last = [...events].reverse().find(e => e.role !== 'log' && e.role !== 'system');
      const act = last ? clip((last.name ? last.name + ': ' : '') + last.text, 140) : r.activity;
      if (act && act !== r.activity) { r.activity = act; dirty = true; }
    }
    if (r.status === 'running' && !children.has(r.runId) && !alive(r.pid)) { r.status = 'interrupted'; r.endedAt = Date.now(); dirty = true; }
    if (dirty) save(r);
    return r;
  }
  function allRuns() {
    let files = []; try { files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.json')); } catch {}
    const runs = [];
    for (const f of files) { const r = readJson(path.join(RUNS_DIR, f), null); if (r && r.runId) runs.push(refresh(r)); }
    return runs;
  }
  /** Job-state files published by other RobOS apps (agents-manager etc.). Only those that reference a task are used. */
  function externalRuns() {
    let files = []; try { files = fs.readdirSync(JOBS_DIR).filter(f => f.endsWith('.json')); } catch {}
    const out = [];
    const ownSessions = new Set(allRuns().map(r => r.sessionId).filter(Boolean));
    for (const f of files) {
      const j = readJson(path.join(JOBS_DIR, f), null);
      if (!j || !j.sessionId || j.launchedBy === 'dev-central' || ownSessions.has(j.sessionId)) continue;
      const ref = j.taskId || j.taskKey || j.key || j.issueUrl || j.taskUrl || j.url;
      if (!ref) continue;
      let status = j.status;
      if (status === 'running' && (!alive(j.childPid) && !alive(j.ownerPid))) status = 'interrupted';
      out.push({ runId: 'ext-' + j.sessionId, external: true, taskId: j.taskId, taskKey: j.taskKey || j.key, url: j.issueUrl || j.taskUrl || j.url, provider: j.provider || 'codex', sessionId: j.sessionId, pid: j.childPid || null, status, activity: j.activity || '', title: j.agentName || 'Agent', mode: j.mode || 'agent', startedAt: j.startedAt || j.updatedAt, updatedAt: j.updatedAt });
    }
    return out;
  }
  const matches = (r, t) => !!t && (r.taskId === t.id || (r.taskKey && (r.taskKey === t.key || r.taskKey === t.id)) || (r.url && t.url && r.url === t.url) ||
    (r.number && t.number && Number(r.number) === Number(t.number) && (!r.repo || !t.repo || r.repo === t.repo)));

  /** { runs, byTask: {taskId: [run…]}, running: n } for the tree payload. Epics are resolved in the renderer from their tasks. */
  function summary(tasks) {
    const runs = allRuns().concat(externalRuns()).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    const byTask = {};
    for (const r of runs) for (const t of tasks) if (matches(r, t)) (byTask[t.id] = byTask[t.id] || []).push(slim(r));
    // epics that are themselves issues carry their own runs through the same matching (their issue is a task row's epic)
    return { runs: runs.map(slim), byTask, running: runs.filter(r => r.status === 'running').length };
  }
  const slim = r => ({ runId: r.runId, taskId: r.taskId, taskKey: r.taskKey, epicId: r.epicId, provider: r.provider, sessionId: r.sessionId || null, status: r.status, activity: r.activity || '', mode: r.mode, title: r.title, startedAt: r.startedAt, endedAt: r.endedAt || null, launchedBy: r.launchedBy || (r.external ? 'another RobOS app' : ''), launchedAs: r.launchedAs || '', external: !!r.external, canSteer: !r.external && !!r.sessionId, canOpen: !!r.sessionId && r.provider === 'codex' });

  // ── launching ───────────────────────────────────────────────────────────────
  function workdirFor(task, ts) {
    const s = readSettings() || {};
    const repoName = String(task.repo || '').split('/').pop();
    const cands = [ts && (ts.local_path || ts.workdir || ts.clone_path), s.workspace_dir, s.workspaceDir, s.projects_dir, s.projectsDir]
      .filter(Boolean).flatMap(p => [p && path.join(p, repoName || ''), p]);
    cands.push(path.join(os.homedir(), 'source', repoName || ''));
    for (const c of cands) { try { if (c && fs.statSync(c).isDirectory() && fs.existsSync(path.join(c, '.git'))) return c; } catch {} }
    const scratch = path.join(os.homedir(), '.robos', 'agent-work', repoName || 'tasks'); fs.mkdirSync(scratch, { recursive: true });
    return scratch;
  }
  function backendName() {
    try { return (workTask && workTask.configuredBackend) ? workTask.configuredBackend('codex') : 'codex'; } catch { return 'codex'; }
  }
  function invocationFor(backend, mode, prompt, resumeId) {
    if (resumeId) {
      if (backend === 'claude') return { bin: 'claude', args: ['-p', '--resume', resumeId, '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits', '--', prompt] };
      return { bin: (workTask && workTask.invocation ? workTask.invocation('codex', 'implement', '').bin : 'codex'), args: ['exec', 'resume', '--json', resumeId, '--', prompt] };
    }
    const inv = workTask && workTask.invocation ? workTask.invocation(backend, mode === 'design' ? 'plan' : 'implement', prompt)
      : (backend === 'claude' ? { bin: 'claude', args: ['-p', '--verbose', '--output-format', 'stream-json', '--', prompt] } : { bin: 'codex', args: ['exec', '--json', '--', prompt] });
    if (backend === 'claude' && mode !== 'design') inv.args.splice(1, 0, '--permission-mode', 'acceptEdits');
    return inv;
  }
  function spawnInto(r, inv, cwd) {
    const out = fs.openSync(r.log, 'a');
    fs.writeSync(out, JSON.stringify({ type: 'robos.run', event: r.resumed ? 'resumed' : 'started', at: new Date().toISOString() }) + '\n');
    const env = { ...process.env, ROBOS_AGENT_RUN_ID: r.runId, ROBOS_LAUNCHED_BY: r.launchedBy || 'dev-central', ROBOS_AGENT_MODE: r.mode || '', ROBOS_TASK_ID: r.taskId || '', ROBOS_TASK_KEY: r.taskKey || '', ROBOS_TASK_URL: r.url || '',
      ROBOS_TASK_REPO: r.repo || '', ROBOS_TASK_SERVER: r.serverId || '', ROBOS_EPIC_KEY: r.epicKey || '', ROBOS_TASK_STAGE: r.stageAtLaunch || '' };
    delete env.ELECTRON_RUN_AS_NODE; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
    const child = cp.spawn(inv.bin, inv.args, { cwd, env, detached: true, stdio: ['ignore', out, out] });
    fs.closeSync(out);
    r.pid = child.pid; r.status = 'running'; r.endedAt = null; r.exitCode = null;
    children.set(r.runId, child);
    child.on('error', e => { children.delete(r.runId); r.status = 'error'; r.activity = 'Could not start ' + inv.bin + ': ' + e.message; r.endedAt = Date.now(); save(r); notify(); });
    child.on('exit', (code, sig) => {
      if (children.get(r.runId) !== child) return;            // replaced by a steer/resume
      children.delete(r.runId);
      const cur = load(r.runId) || r;
      cur.exitCode = code; cur.endedAt = Date.now();
      if (cur.status === 'running') cur.status = code === 0 ? 'done' : 'error';
      save(refresh(cur)); notify();
    });
    child.unref();
    save(r);
  }
  function start({ task, epic, ts, mode = 'implement', note = '' }) {
    const running = allRuns().find(r => r.status === 'running' && matches(r, task));
    if (running) return { ok: false, error: 'An agent is already running on this task', runId: running.runId };
    const backend = backendName();
    const prompt = promptFor(mode, task, epic, note);   // run metadata header is added once the run id exists (see below)
    const cwd = workdirFor(task, ts);
    const runId = 'run-' + Date.now().toString(36) + '-' + randomUUID().slice(0, 6);
    const launchedAs = (() => { try { return os.userInfo().username; } catch { return ''; } })();
    const r = { launchedBy: 'dev-central', launchedAs, launcherPid: process.pid, stageAtLaunch: task.status || null, serverId: task.serverId || null, epicKey: epic && !epic.loose ? epic.code : null,
      runId, taskId: task.id, taskKey: task.key, epicId: epic && !epic.loose ? epic.id : null, number: task.number || null, repo: task.repo || '', url: task.url || null, title: `${mode === 'design' ? 'Design' : mode === 'resume' ? 'Resume' : 'Implement'} ${task.key || task.id}`, mode, provider: backend, cwd, log: logFile(runId), startedAt: Date.now(), status: 'running', activity: 'Starting…', ownerPid: process.pid };
    const header = `[RobOS run] id=${runId} launched-by=dev-central task=${task.key || task.id}${task.url ? ' url=' + task.url : ''}${r.epicKey ? ' epic=' + r.epicKey : ''} mode=${mode}\nMention the task key (${task.key || task.id}) in the branch name, commit messages and any report so the work can be traced back to this task.\n\n`;
    try { spawnInto(r, invocationFor(backend, mode, header + prompt), cwd); }
    catch (e) { return { ok: false, error: e.message }; }
    notify();
    return { ok: true, runId };
  }
  function resolve(runId) { const r = load(runId); return r ? refresh(r) : null; }
  function kill(runId) {
    const ext = String(runId).startsWith('ext-');
    let r = ext ? externalRuns().find(x => x.runId === runId) : resolve(runId);
    if (!r) return { ok: false, error: 'Run not found' };
    const pid = r.pid;
    if (!pid || !alive(pid)) { if (!ext) { r.status = r.status === 'running' ? 'stopped' : r.status; save(r); } notify(); return { ok: true, note: 'Already stopped' }; }
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch (e) { return { ok: false, error: e.message }; } }
    if (!ext) { r.status = 'stopped'; r.endedAt = Date.now(); r.activity = 'Stopped by you'; save(r); }
    setTimeout(() => { if (alive(pid)) { try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch {} } } }, 4000).unref();
    notify();
    return { ok: true };
  }
  /** Steer = stop the current turn and resume the same session with the developer's message. */
  function steer(runId, message, { task, epic } = {}) {
    message = String(message || '').trim();
    if (!message) return { ok: false, error: 'Write what the agent should do differently' };
    const r = resolve(runId);
    if (!r || r.external) return { ok: false, error: r ? 'This session was started by another app — open it in RobOS Agents to steer it' : 'Run not found' };
    if (!r.sessionId) return { ok: false, error: 'The agent has not reported its session id yet — try again in a moment' };
    if (alive(r.pid)) { try { process.kill(-r.pid, 'SIGTERM'); } catch { try { process.kill(r.pid, 'SIGTERM'); } catch {} } }
    const old = children.get(r.runId); children.delete(r.runId);
    const go = () => {
      r.resumed = true; r.mode = 'steer'; r.activity = 'Steering: ' + clip(message, 100);
      fs.appendFileSync(r.log, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '↪ Steer from you: ' + message }] }, robos_steer: true }) + '\n');
      try { spawnInto(r, invocationFor(r.provider, 'implement', message, r.sessionId), r.cwd); } catch (e) { return { ok: false, error: e.message }; }
      notify();
      return { ok: true };
    };
    if (old && alive(r.pid)) { return new Promise(res => { const t0 = Date.now(); const wait = () => { if (!alive(r.pid) || Date.now() - t0 > 3000) res(go()); else setTimeout(wait, 80); }; wait(); }); }
    return go();
  }
  function transcript(runId, since = 0) {
    const ext = String(runId).startsWith('ext-');
    if (ext) { const r = externalRuns().find(x => x.runId === runId); return r ? { ok: true, run: slim(r), events: [], next: 0, external: true } : { ok: false, error: 'Run not found' }; }
    const r = resolve(runId);
    if (!r) return { ok: false, error: 'Run not found' };
    const { events } = parseLog(r.log);
    return { ok: true, run: slim(r), events: events.slice(Math.max(0, since)), next: events.length, total: events.length };
  }
  async function openSession(runId) {
    const sid = String(runId).startsWith('ext-') ? String(runId).slice(4) : (resolve(runId) || {}).sessionId;
    if (!sid) return { ok: false, error: 'No session id yet' };
    if (!sessionLink) return { ok: false, error: 'robos-lib/agent-session-link is unavailable' };
    try { return await sessionLink.open({ provider: 'codex', sessionId: sid }); } catch (e) { return { ok: false, error: e.message }; }
  }

  // Poll while anything is running so the UI shows live activity; push only on change.
  const tick = () => {
    const runs = allRuns().concat(externalRuns());
    const sig = JSON.stringify(runs.map(r => [r.runId, r.status, r.activity, r.sessionId]));
    if (sig !== lastSig) { lastSig = sig; notify(); }
  };
  if (!isTestMode) setInterval(tick, 2000).unref();
  return { summary, start, steer, kill, transcript, openSession, allRuns, tick, _paths: { RUNS_DIR } };
}

module.exports = { create, parseLog, promptFor, RUNS_DIR };
