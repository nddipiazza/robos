'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS }  = require('../lib/snapshot');

const SCRIPT = [
  {
    narration: 'Notifications app provides category and tier filtered history of all SDLC events.',
    target: '#search-input',
    action: 'type',
    value: 'Build',
    callout: 'Search for "Build"',
    minHold: 3200,
  },
  {
    narration: 'Search instantly filters notification history. We clear search to restore full event timeline.',
    target: '#search-input',
    action: 'type',
    value: '',
    callout: 'Clear Search Filter',
    js: `(() => {
      const s = document.getElementById('search-input');
      if (s) {
        s.value = '';
        s.dispatchEvent(new Event('input'));
      }
    })()`,
    minHold: 3000,
  },
  {
    narration: 'Category checkboxes allow multi-select filtering with live unread badge counters in the toolbar.',
    target: '#filter-pr_review',
    action: 'click',
    callout: 'Toggle PR Review Category',
    js: `(() => {
      setTimeout(() => {
        const cb = document.getElementById('filter-pr_review');
        if (cb) cb.click();
      }, 1000);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We execute bulk actions like Mark All Read to synchronize notification read state across apps.',
    target: '#btn-mark-all-read',
    action: 'click',
    callout: 'Bulk Mark All Read',
    minHold: 3000,
  },
  {
    narration: 'We switch to Preferences to configure system-wide Quiet Hours and Do-Not-Disturb modes.',
    target: '#tab-btn-prefs',
    action: 'click',
    callout: 'Open Preferences Tab',
    minHold: 3200,
  },
  {
    narration: 'We enable Quiet Hours and save preferences to ~/.config/robos/notification-prefs.json.',
    target: '#btn-save-prefs',
    action: 'click',
    callout: 'Save Notification Preferences',
    js: `(() => {
      const q = document.getElementById('pref-quiet-enabled');
      if (q) q.checked = true;
      const dnd = document.getElementById('pref-dnd');
      if (dnd) dnd.checked = true;
      const btn = document.getElementById('btn-save-prefs');
      if (btn) btn.click();
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Notifications app delivers centralized SDLC event audit trails, multi-tier filtering, and preference controls.',
    target: '#tab-btn-list',
    action: 'click',
    callout: 'Return to Notifications List',
    minHold: 2800,
  },
];

runDemo({
  slug: 'notifications',
  appId: 'notifications',
  windowTitle: 'RobOS Notifications',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  prelaunch: async (app) => {
    // Seed sample notifications
    const notifs = [
      {
        id: 'demo-pr-1',
        category: 'pr_review',
        tier: 'warning',
        title: 'PR Review Requested: #142',
        body: 'Jane requested your architecture review on PR #142',
        source: 'github',
        ts: new Date().toISOString(),
        read: false,
      },
      {
        id: 'demo-ci-1',
        category: 'ci_cd',
        tier: 'critical',
        title: 'Production Build Failure',
        body: 'Pipeline stopped: schema validation error in entity model',
        source: 'github-actions',
        ts: new Date(Date.now() - 300000).toISOString(),
        read: false,
      },
      {
        id: 'demo-task-1',
        category: 'task',
        tier: 'info',
        title: 'Task Assigned: TASK-408',
        body: 'Assigned to implement Toast Daemon notification stack',
        source: 'task-board',
        ts: new Date(Date.now() - 600000).toISOString(),
        read: false,
      },
      {
        id: 'demo-agent-1',
        category: 'agent',
        tier: 'info',
        title: 'Agent Session: Knowledge Graph Sync',
        body: 'Agent updated entity schemas for SDLC lifecycle',
        source: 'claude-console',
        ts: new Date(Date.now() - 900000).toISOString(),
        read: true,
      },
      {
        id: 'demo-sys-1',
        category: 'system',
        tier: 'critical',
        title: 'Low Disk Storage Alert',
        body: 'Virtual disk space is under 10% threshold',
        source: 'robos-system',
        ts: new Date(Date.now() - 1200000).toISOString(),
        read: false,
      },
    ];
    const notifFile = path.join(app.sandboxHome, '.config', 'robos', 'notifications.json');
    fs.mkdirSync(path.dirname(notifFile), { recursive: true });
    fs.writeFileSync(notifFile, JSON.stringify(notifs, null, 2));
    await evalJS(app.port, `load()`);
  },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
