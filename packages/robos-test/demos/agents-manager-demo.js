'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

const MIN  = 60_000;
const HOUR = 3_600_000;

function seedClaudeState(sandboxHome) {
  const sessionsDir = path.join(sandboxHome, '.claude', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  const sessions = [
    {
      sessionId: 'sess-acme-fix-42',
      cwd: path.join(sandboxHome, 'source', 'buildbarn-forms'),
      startedAt: Date.now() - 30 * MIN,
      pid: 12345,
    },
    {
      sessionId: 'sess-dashboard-design',
      cwd: path.join(sandboxHome, 'source', 'scheduler-dashboard'),
      startedAt: Date.now() - 3 * HOUR,
      pid: 12346,
    },
    {
      sessionId: 'sess-worker-pool-spike',
      cwd: path.join(sandboxHome, 'source', 'worker-pool'),
      startedAt: Date.now() - 1 * 86_400_000,
      pid: 12347,
    },
  ];

  for (const s of sessions) {
    fs.writeFileSync(path.join(sessionsDir, `${s.sessionId}.json`),
      JSON.stringify(s, null, 2));
  }

  // History with a few user prompts per session, most recent first
  const historyLines = [
    { sessionId: 'sess-acme-fix-42', timestamp: Date.now() - 2 * MIN,  display: 'Draft a fix for the semaphore release in the error path',      project: sessions[0].cwd },
    { sessionId: 'sess-acme-fix-42', timestamp: Date.now() - 12 * MIN, display: 'Write a reproduction test for the worker pool exhaustion bug',  project: sessions[0].cwd },
    { sessionId: 'sess-acme-fix-42', timestamp: Date.now() - 28 * MIN, display: 'Analyze the steps-to-reproduce on issue #42',                   project: sessions[0].cwd },
    { sessionId: 'sess-dashboard-design', timestamp: Date.now() - 1 * HOUR,  display: 'Draft a technical design for the scheduler queue visualization dashboard', project: sessions[1].cwd },
    { sessionId: 'sess-dashboard-design', timestamp: Date.now() - 2 * HOUR,  display: 'Sketch the data model for real-time queue metrics',        project: sessions[1].cwd },
    { sessionId: 'sess-worker-pool-spike', timestamp: Date.now() - 23 * HOUR, display: 'Research: what pool implementations handle backpressure well?', project: sessions[2].cwd },
  ];

  fs.writeFileSync(path.join(sandboxHome, '.claude', 'history.jsonl'),
    historyLines.map(l => JSON.stringify(l)).join('\n') + '\n');

  // Claude settings (used by the config form)
  fs.writeFileSync(path.join(sandboxHome, '.claude', 'settings.json'),
    JSON.stringify({ defaultMode: 'plan', model: 'claude-opus-4-7' }, null, 2));
}

const SCRIPT = [
  {
    narration: 'RobOS AI Agent Manager is the central console for every AI agent working on your behalf — GitHub Copilot, Claude Code, and any other provider you\u2019ve installed.',
    js: null, minHold: 5000,
  },
  {
    narration: 'The sidebar lists every provider RobOS detected on your system — installed or not, authenticated or not, with one-click installers for the ones you haven\u2019t set up yet.',
    js: null, minHold: 5500,
  },
  {
    narration: 'Open Claude Code.',
    js: `(() => {
      const items = document.querySelectorAll('#provider-nav .provider-nav-item');
      for (const it of items) {
        if (/claude/i.test(it.textContent || '')) { it.click(); return; }
      }
    })();`,
    minHold: 3500,
  },
  {
    narration: 'Every session you\u2019ve opened on this machine — working directory, when it started, the first prompt you sent. Resume any of them with a single click and RobOS drops you back into that conversation.',
    js: null, minHold: 7000,
  },
  {
    narration: 'Recent prompts are indexed across all sessions, so you can search for what you asked the agent yesterday without hunting through terminals.',
    js: null, minHold: 4500,
  },
  {
    narration: 'The configuration panel controls default mode, model, and behavior flags — settings that apply to every new Claude session launched from RobOS.',
    js: `(() => {
      const el = document.getElementById('cfg-default-mode') || document.querySelector('[class*="config"]');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    })();`,
    minHold: 5500,
  },
  {
    narration: 'Switch back to GitHub Copilot to see the same controls — status, session history, launch buttons — with the same familiar layout regardless of provider.',
    js: `(() => {
      const items = document.querySelectorAll('#provider-nav .provider-nav-item');
      for (const it of items) {
        if (/copilot/i.test(it.textContent || '')) { it.click(); return; }
      }
    })();`,
    minHold: 5500,
  },
  {
    narration: 'One console, every AI agent. RobOS doesn\u2019t pick a favorite — it makes whichever one you use feel first-class.',
    js: null, minHold: 4500,
  },
];

runDemo({
  slug: 'agents-manager',
  appId: 'agents-manager',
  windowTitle: 'RobOS Agents',
  scenario: scenarios['all-good'],
  prelaunch: async (app) => {
    seedClaudeState(app.sandboxHome);
    await evalJS(app.port, `window.location.reload()`);
  },
  postSettle: 2000,
  script: SCRIPT,
}).catch(err => { console.error(err); process.exit(1); });
