'use strict';
const scenarios  = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'Desktop Manager initializes the APP_REGISTRY, displaying all installed RobOS apps, categories, and system services.',
    target: '#app-search',
    action: 'type',
    value: 'Task',
    callout: 'Filter apps by "Task"',
    minHold: 2800,
  },
  {
    narration: 'Search filter updates the app grid in real time. We clear search and dispatch an application launch.',
    target: '#app-search',
    action: 'type',
    value: '',
    callout: 'Clear Search & Launch Tool',
    js: `(() => {
      const search = document.getElementById('app-search');
      if (search) {
        search.value = '';
        search.dispatchEvent(new Event('input'));
      }
      setTimeout(() => {
        const item = document.querySelector('.btn-launch');
        if (item) item.click();
      }, 300);
    })()`,
    minHold: 3000,
  },
  {
    narration: 'We switch to the Socket IPC Console tab to inspect real-time Unix domain socket communication.',
    target: '#tab-btn-socket',
    action: 'click',
    callout: 'Open Socket IPC Console',
    js: `(() => {
      const btn = document.getElementById('tab-btn-socket');
      if (btn) btn.click();
      setTimeout(() => {
        const ping = document.getElementById('btn-ping-socket');
        if (ping) ping.click();
      }, 500);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We query the application registry and process health telemetry over the Unix socket hub.',
    target: '#btn-query-apps',
    action: 'click',
    callout: 'Query Registered Apps via Socket',
    js: `(() => {
      const qApps = document.getElementById('btn-query-apps');
      if (qApps) qApps.click();
      setTimeout(() => {
        const qStatus = document.getElementById('btn-query-status');
        if (qStatus) qStatus.click();
      }, 600);
    })()`,
    minHold: 3200,
  },
  {
    narration: 'Switching to Notifications tab, we emit a high-priority toast alert and observe the unread badge count update.',
    target: '#tab-btn-notif',
    action: 'click',
    callout: 'Open Live Notifications Tab',
    js: `(() => {
      const tabNotif = document.getElementById('tab-btn-notif');
      if (tabNotif) tabNotif.click();
      setTimeout(() => {
        const emitBtn = document.getElementById('btn-emit-urgent-notif');
        if (emitBtn) emitBtn.click();
      }, 500);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'In the Watchdog tab, critical background daemons are monitored with automated crash recovery.',
    target: '#tab-btn-watchdog',
    action: 'click',
    callout: 'Inspect Watchdog Keep-Alive Grid',
    js: `(() => {
      const tabWatchdog = document.getElementById('tab-btn-watchdog');
      if (tabWatchdog) tabWatchdog.click();
      setTimeout(() => {
        const toggle = document.querySelector('.toggle-switch input');
        if (toggle) {
          toggle.click();
          setTimeout(() => toggle.click(), 1000);
        }
      }, 600);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Desktop Manager delivers complete process supervision, high-performance IPC, and automated crash recovery.',
    target: '#tab-btn-apps',
    action: 'click',
    callout: 'Return to Apps Overview',
    js: `(() => {
      const tabApps = document.getElementById('tab-btn-apps');
      if (tabApps) tabApps.click();
    })()`,
    minHold: 2800,
  },
];

runDemo({
  slug: 'desktop-manager',
  appId: 'desktop-manager',
  windowTitle: 'RobOS Desktop Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
