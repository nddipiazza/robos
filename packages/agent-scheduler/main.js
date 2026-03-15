const { app, BrowserWindow, ipcMain } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const crypto = require('crypto');
let copilot = null;
try {
  copilot = require('/usr/local/share/robos/robos-copilot-lib');
} catch {
  try {
    copilot = require(path.join(__dirname, '..', 'robos-cli', 'robos-copilot-lib'));
  } catch { /* AI features unavailable */ }
}

const CONFIG_DIR    = path.join(os.homedir(), '.config', 'robos', 'agent-scheduler');
const SCHEDULES_FILE = path.join(CONFIG_DIR, 'schedules.json');
const LOGS_DIR      = path.join(CONFIG_DIR, 'logs');
const RUN_SCRIPT    = '/usr/local/share/robos/agent-scheduler/run-job.sh';
const SYSTEM_JOB_SETTINGS_FILE = path.join(os.homedir(), '.config', 'robos', 'system-job-settings.json');
const DRAFTS_DIR    = path.join(os.homedir(), '.config', 'robos', 'workflow-studio-drafts');
const GIT_PROJECTS_FILE = path.join(os.homedir(), '.config', 'robos', 'git-projects.json');
const JOURNAL_DIR   = path.join(os.homedir(), '.config', 'robos', 'journal');

const SYSTEM_JOBS = [
  {
    id: 'daily-dev-summary',
    name: 'Daily Developer Summary',
    description: 'Summarizes your day using AI: git commits, task breakdowns, and journal activity from the last 24 hours.',
    icon: '📊',
    defaultTime: '09:00',
  },
];

const ROBOS_INSTRUCTIONS_FILE = path.join(os.homedir(), '.config', 'robos', 'robos-instructions.txt');
function getRobosInstructions() {
  try {
    const txt = fs.readFileSync(ROBOS_INSTRUCTIONS_FILE, 'utf8').trim();
    if (txt) return txt + '\n\n';
  } catch {}
  return '';
}

// ── Journal event logging ─────────────────────────────────────────────────────
const JOURNAL_EVENTS_FILE = path.join(os.homedir(), '.config', 'robos', 'journal-events.json');
function writeJournalEvent(evt) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL_EVENTS_FILE), { recursive: true });
    let events = [];
    try { events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8')); } catch {}
    events.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, timestamp: new Date().toISOString(), ...evt });
    if (events.length > 2000) events = events.slice(0, 2000);
    fs.writeFileSync(JOURNAL_EVENTS_FILE, JSON.stringify(events, null, 2));
  } catch {}
}
function ensureDirs() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR,   { recursive: true });
}

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function loadSchedules() {
  ensureDirs();
  try {
    if (fs.existsSync(SCHEDULES_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveSchedulesFile(schedules) {
  ensureDirs();
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

// Convert a schedule recurrence to a cron expression
function toCronExpr(s) {
  const r = s.recurrence;
  if (!r) return null;
  const parts = (r.time || '09:00').split(':');
  const h = parseInt(parts[0]) || 9;
  const m = parseInt(parts[1]) || 0;
  switch (r.type) {
    case 'hourly':   return `${r.minuteOffset != null ? r.minuteOffset : 0} * * * *`;
    case 'daily':    return `${m} ${h} * * *`;
    case 'weekly': {
      const days = r.days && r.days.length ? r.days.join(',') : '1';
      return `${m} ${h} * * ${days}`;
    }
    case 'monthly':  return `${m} ${h} ${r.dayOfMonth || 1} * *`;
    case 'once': {
      if (!r.date) return null;
      const d = new Date(r.date + 'T00:00:00');
      return `${m} ${h} ${d.getDate()} ${d.getMonth() + 1} *`;
    }
    case 'cron':     return r.cronExpr || null;
    default:         return null;
  }
}

function syncCrontab(schedules, systemJobSettings) {
  const sjSettings = systemJobSettings || loadSystemJobSettings();
  exec('crontab -l 2>/dev/null || true', (err, stdout) => {
    const lines = (stdout || '').split('\n');
    // Strip existing robos-scheduler block
    const filtered = [];
    let inBlock = false;
    for (const l of lines) {
      if (l.includes('# BEGIN ROBOS-SCHEDULER')) { inBlock = true; continue; }
      if (l.includes('# END ROBOS-SCHEDULER'))   { inBlock = false; continue; }
      if (!inBlock) filtered.push(l);
    }
    // Build new block
    const block = ['# BEGIN ROBOS-SCHEDULER'];
    // System jobs
    SYSTEM_JOBS.forEach(j => {
      const cfg = sjSettings[j.id] || {};
      if (cfg.enabled === false) return;
      const time = cfg.time || j.defaultTime;
      const parts = time.split(':');
      const h = parseInt(parts[0]) || 9;
      const m = parseInt(parts[1]) || 0;
      block.push(`# SYSTEM: ${j.name}`);
      block.push(`${m} ${h} * * * /usr/local/share/robos/agent-scheduler/run-system-job.sh ${j.id}`);
    });
    // User jobs
    schedules.filter(s => s.enabled).forEach(s => {
      const expr = toCronExpr(s);
      if (expr) {
        const name = s.name.replace(/[^a-zA-Z0-9 _-]/g, '');
        block.push(`# ${name}`);
        block.push(`${expr} ${RUN_SCRIPT} ${s.id}`);
      }
    });
    block.push('# END ROBOS-SCHEDULER');

    const combined = [...filtered.filter(l => l.trim() !== ''), ...block].join('\n') + '\n';
    const tmp = `/tmp/robos-cron-${Date.now()}.txt`;
    try {
      fs.writeFileSync(tmp, combined, 'utf8');
      exec(`crontab ${tmp}`, () => { try { fs.unlinkSync(tmp); } catch {} });
    } catch {}
  });
}

function sh(cmd, env = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    exec(cmd, {
      timeout,
      env: { ...process.env, GH_PAGER: '', HOME: os.homedir(), ...env },
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout.trim());
    });
  });
}

// ── System job helpers ────────────────────────────────────────────────────────
function loadSystemJobSettings() {
  try {
    if (fs.existsSync(SYSTEM_JOB_SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SYSTEM_JOB_SETTINGS_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveSystemJobSettingsFile(settings) {
  fs.mkdirSync(path.dirname(SYSTEM_JOB_SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SYSTEM_JOB_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

async function runDailyDevSummary() {
  try {
    const dateStr = new Date().toISOString().slice(0, 10);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // 1. Git commits last 24h — structured per repo
    const gitRepos = [];
    try {
      const projects = JSON.parse(fs.readFileSync(GIT_PROJECTS_FILE, 'utf8'));
      const repos = Array.isArray(projects) ? projects : (projects.projects || []);
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      for (const repo of repos.slice(0, 10)) {
        const rp = typeof repo === 'string' ? repo : (repo.path || repo.localPath || '');
        if (!rp) continue;
        try {
          const log = await sh(`git -C "${rp}" log --format="%h %s (%an, %ar)" --since="${since}" 2>/dev/null | head -20`);
          if (log) gitRepos.push({ path: rp, name: path.basename(rp), commits: log });
        } catch {}
      }
    } catch {}

    // 2. Task breakdowns modified last 24h
    const taskBreakdowns = [];
    try {
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const files = fs.existsSync(DRAFTS_DIR) ? fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.json')) : [];
      for (const f of files) {
        const fp = path.join(DRAFTS_DIR, f);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs > cutoff) {
          try {
            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
            const issues = [];
            if (data.tree) {
              const walk = (nodes) => nodes && nodes.forEach(n => {
                if (n.issueUrl) issues.push(n.issueUrl);
                if (n.children) walk(n.children);
              });
              walk(data.tree);
            }
            taskBreakdowns.push({ name: data.name, status: data.status, issues, time: stat.mtime.toLocaleTimeString() });
          } catch {}
        }
      }
    } catch {}

    // 3. AI/Journal events last 24h — deduplicated by title for copilot prompts
    const aiEvents = [];
    try {
      const events = JSON.parse(fs.readFileSync(JOURNAL_EVENTS_FILE, 'utf8'));
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const recent = events.filter(e => e.timestamp > cutoff && e.type !== 'daily-summary');
      // Summarize: group copilot prompts, keep notable ones
      const seen = new Set();
      for (const e of recent.slice(0, 60)) {
        const key = (e.title || '').slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);
        aiEvents.push(`[${new Date(e.timestamp).toLocaleTimeString()}] ${e.title || e.type}`);
      }
    } catch {}

    // Build structured data block for the prompt
    const gitBlock = gitRepos.length
      ? gitRepos.map(r => `### ${r.name}\n${r.commits}`).join('\n\n')
      : 'No git commits in the last 24 hours.';

    const breakdownBlock = taskBreakdowns.length
      ? taskBreakdowns.map(t => {
          const issueList = t.issues.length ? `\n  Issues: ${t.issues.join(', ')}` : '';
          return `- **${t.name}** (${t.status})${issueList}`;
        }).join('\n')
      : 'No task breakdowns worked on.';

    const aiBlock = aiEvents.length ? aiEvents.slice(0, 30).join('\n') : 'No AI activity recorded.';

    const prompt = `You are writing a Daily Developer Summary for a software development manager to review. Today is ${today}.

Format your output as Markdown with the following sections. Be concise, factual, and professional. Use the raw data provided — do not invent information.

Output this exact structure:

# Daily Summary — ${today}

## 🔀 Git Activity
List each repository that had commits. For each, show the repo name as a subheading and bullet each commit message. If no commits, say "No commits today."

## 📋 Tasks Worked On
List each task breakdown that was active today. Show name, status (draft/in_progress/submitted), and any linked issue URLs. If none, say "No task breakdowns worked on."

## 🤖 AI Activity
A short bullet list of the main AI-assisted activities performed today (deduplicated, max 10 bullets). If none, say "No AI activity."

## 📝 Summary
2-3 sentences max. What did the developer accomplish? What was the primary focus? Written for a dev manager.

---

RAW DATA:

GIT COMMITS (last 24h):
${gitBlock}

TASK BREAKDOWNS (modified last 24h):
${breakdownBlock}

AI/COPILOT ACTIVITY (last 24h):
${aiBlock}`;

    writeJournalEvent({ source: 'system-job', type: 'agent-run', title: '📊 Daily Developer Summary — started', detail: 'Generating summary from git history, task breakdowns, and journal…', status: 'started' });

    // Use copilot -p with shell tools denied so it just generates text, no command execution
    const escaped = prompt.replace(/'/g, "'\\''");
    const raw = await sh(`/usr/local/bin/copilot -p '${escaped}' --deny-tool 'shell(*)' --silent 2>/dev/null`, {}, 120000);

    // Extract markdown block starting at "# Daily Summary"
    let result = raw;
    const mdStart = raw.indexOf('# Daily Summary');
    if (mdStart >= 0) result = raw.slice(mdStart).trim();

    // Write summary to journal events
    writeJournalEvent({ source: 'system-job', type: 'daily-summary', title: `📊 Daily Developer Summary — ${today}`, detail: result, status: 'success' });

    // Write summary to the journal repo daily file
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config', 'robos', 'settings.json'), 'utf8'));
      const repo = settings.journal_repo;
      if (repo) {
        const parts = repo.replace('https://github.com/', '').replace('git@github.com:', '').replace('.git', '').split('/');
        const journalRepoDir = path.join(os.homedir(), 'source', 'github.com', parts[0], parts[1]);
        const dailyDir = path.join(journalRepoDir, 'daily');
        fs.mkdirSync(dailyDir, { recursive: true });
        const journalFile = path.join(dailyDir, `${dateStr}.md`);
        if (!fs.existsSync(journalFile)) {
          const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' });
          fs.writeFileSync(journalFile, `# Journal — ${dateStr} (${dow})\n\n## 🎯 Today's Focus\n\n\n## ✏️ Notes\n\n\n## 🔗 References\n\n`);
        }
        // Replace any previous daily summary section, or append
        let existing = fs.readFileSync(journalFile, 'utf8');
        const marker = '\n# Daily Summary —';
        const idx = existing.indexOf(marker);
        if (idx >= 0) existing = existing.slice(0, idx);
        fs.writeFileSync(journalFile, existing.trimEnd() + '\n\n' + result + '\n');
      }
    } catch {}

    // Update lastRun
    const settings = loadSystemJobSettings();
    settings['daily-dev-summary'] = { ...(settings['daily-dev-summary'] || {}), lastRun: new Date().toISOString() };
    saveSystemJobSettingsFile(settings);
    syncCrontab(loadSchedules(), settings);

    return { success: true, summary: result };
  } catch (e) {
    writeJournalEvent({ source: 'system-job', type: 'agent-run', title: '📊 Daily Developer Summary — failed', detail: e.message, status: 'error' });
    return { error: e.message };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 750, minWidth: 800, minHeight: 500,
    title: 'RobOS Agent Scheduler',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.setName('agent-scheduler');
app.whenReady().then(() => { createWindow(); });
app.on('window-all-closed', () => app.quit());

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-schedules', () => loadSchedules());

ipcMain.handle('save-schedule', (_, schedule) => {
  try {
    const schedules = loadSchedules();
    if (!schedule.id) {
      schedule.id = genId();
      schedule.createdAt = new Date().toISOString();
      schedules.push(schedule);
    } else {
      const idx = schedules.findIndex(s => s.id === schedule.id);
      if (idx >= 0) schedules[idx] = schedule;
      else schedules.push(schedule);
    }
    saveSchedulesFile(schedules);
    syncCrontab(schedules);
    return schedule;
  } catch (err) {
    throw err;
  }
});

ipcMain.handle('delete-schedule', (_, id) => {
  const schedules = loadSchedules().filter(s => s.id !== id);
  saveSchedulesFile(schedules);
  syncCrontab(schedules);
  return true;
});

ipcMain.handle('toggle-schedule', (_, id) => {
  const schedules = loadSchedules();
  const s = schedules.find(s => s.id === id);
  if (s) {
    s.enabled = !s.enabled;
    saveSchedulesFile(schedules);
    syncCrontab(schedules);
    return s.enabled;
  }
  return null;
});

ipcMain.handle('run-now', async (_, id) => {
  const schedules = loadSchedules();
  const s = schedules.find(s => s.id === id);
  if (!s) return { error: 'Schedule not found' };
  try {
    const logFile = path.join(LOGS_DIR, `${id}.log`);
    if (s.commandType === 'copilot') {
      writeJournalEvent({ source: 'agent-scheduler', type: 'agent-run', title: `▶ ${s.name}`, detail: s.command.slice(0, 200), status: 'started' });
      // Write a temp runner script to avoid quoting issues
      const runnerScript = `/tmp/robos_run_${id.replace(/[^a-z0-9_]/gi, '_')}.sh`;
      const fullPrompt = getRobosInstructions() + s.command;
      const escaped = fullPrompt.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      const scriptContent = [
        '#!/bin/bash',
        `echo "=== RobOS Agent Run: $(date) ===" | tee -a "${logFile}"`,
        `/usr/local/bin/copilot -p "${escaped}" --allow-all-tools 2>&1 | tee -a "${logFile}"`,
        `echo "=== Run complete ===" | tee -a "${logFile}"`,
        '',
      ].join('\n');
      fs.writeFileSync(runnerScript, scriptContent, { mode: 0o755 });
      exec(`DISPLAY=:0 tilix -e "bash '${runnerScript}'" &`,
        { env: { ...process.env, HOME: os.homedir(), DISPLAY: ':0' } });
    } else {
      exec(`bash -c '${s.command.replace(/'/g, "'\\''")}' >> "${logFile}" 2>&1 &`,
        { env: { ...process.env, HOME: os.homedir(), DISPLAY: ':0' } });
    }
    s.lastRun = new Date().toISOString();
    saveSchedulesFile(schedules);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('get-run-log', (_, id) => {
  const logFile = path.join(LOGS_DIR, `${id}.log`);
  try {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      // Return last 100 lines
      return content.split('\n').slice(-100).join('\n');
    }
  } catch {}
  return '';
});

const ROBOS_CONTEXT_FILE = '/usr/local/share/robos/robos-cli/robos-context.md';

function getRobosContext() {
  try {
    if (fs.existsSync(ROBOS_CONTEXT_FILE)) return fs.readFileSync(ROBOS_CONTEXT_FILE, 'utf8');
  } catch {}
  return '';
}

ipcMain.handle('ai-create-schedule', async (_, userRequest) => {
  const robosContext = getRobosContext();
  const prompt = `${robosContext ? robosContext + '\n\n---\n\n' : ''}You are creating a scheduled job for RobOS Agent Scheduler. Parse the following scheduling request and output ONLY a raw JSON object (no markdown, no code fences, no explanation). The JSON must have: name (string, short label), commandType ("shell" or "copilot"), command (string — if shell, use the exact bash command leveraging robos-* CLI tools where appropriate; if copilot use the prompt text), recurrence object with: type (one of: once/hourly/daily/weekly/monthly/cron), time ("HH:MM" 24h), days (array of day numbers 0-6 where 0=Sun, for weekly only), dayOfMonth (1-31, for monthly only), cronExpr (string, for cron type only), date ("YYYY-MM-DD", for once only). Prefer robos-journal-append, robos-notify, robos-active-task for RobOS-specific actions. Request: ${userRequest}`;

  if (!copilot) return { success: false, error: 'AI library unavailable (robos-copilot-lib not found).' };

  try {
    const { ok, text: raw } = await copilot.ask(prompt, { title: 'Create schedule', source: 'agent-scheduler' });
    // Extract JSON from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return { success: true, schedule: parsed };
    }
    return { success: false, raw };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('humanize-cron', (_, schedule) => {
  const expr = toCronExpr(schedule);
  return expr || 'Invalid recurrence';
});

// ── System job IPC ────────────────────────────────────────────────────────────
ipcMain.handle('get-system-jobs', () => {
  const settings = loadSystemJobSettings();
  return SYSTEM_JOBS.map(j => ({
    ...j,
    time: (settings[j.id] && settings[j.id].time) || j.defaultTime,
    enabled: settings[j.id] ? settings[j.id].enabled !== false : true,
    lastRun: (settings[j.id] && settings[j.id].lastRun) || null,
  }));
});

ipcMain.handle('save-system-job-settings', (_, id, patch) => {
  const settings = loadSystemJobSettings();
  settings[id] = { ...(settings[id] || {}), ...patch };
  saveSystemJobSettingsFile(settings);
  syncCrontab(loadSchedules(), settings);
  return settings[id];
});

ipcMain.handle('run-system-job', async (_, id) => {
  if (id === 'daily-dev-summary') return runDailyDevSummary();
  return { error: 'Unknown system job: ' + id };
});
