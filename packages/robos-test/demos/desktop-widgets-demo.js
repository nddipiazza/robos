'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS }  = require('../lib/snapshot');

const SCRIPT = [
  {
    narration: 'RobOS Desktop Widgets deliver real-time system, task, and AI agent telemetry overlays on the desktop.',
    target: '#widget-active-task',
    action: 'hover',
    callout: 'Inspect Active Task Widget',
    minHold: 3200,
  },
  {
    narration: 'System Resources widget tracks live memory utilization, CPU load averages, disk capacity, and uptime.',
    target: '#widget-system-stats',
    action: 'hover',
    callout: 'Inspect System Resource Telemetry',
    minHold: 3200,
  },
  {
    narration: 'AI Agent & Quota widget displays active LLM agent sessions and monthly API quota utilization.',
    target: '#widget-ai-agent',
    action: 'hover',
    callout: 'Inspect AI Agent Quota & Sessions',
    minHold: 3200,
  },
  {
    narration: 'Work Journal and Security widgets provide Git knowledge graph branches and GPG/Pass encryption state.',
    target: '#widget-journal-summary',
    action: 'hover',
    callout: 'Inspect Journal & GPG Security',
    minHold: 3200,
  },
  {
    narration: 'Interactive toggle chips allow instant customization and reflow of visible desktop status overlays.',
    target: '#chip-active-task',
    action: 'click',
    callout: 'Toggle Widget Layout Customization',
    js: `(() => {
      setTimeout(() => {
        const chip = document.getElementById('chip-active-task');
        if (chip) chip.click();
      }, 1000);
    })()`,
    minHold: 3500,
  },
  {
    narration: 'Desktop Widgets maintain ambient system awareness and zero-overhead SDLC context across the entire OS.',
    target: '#btn-refresh-data',
    action: 'click',
    callout: 'Refresh Telemetry Metrics',
    minHold: 2800,
  },
];

runDemo({
  slug: 'desktop-widgets',
  appId: 'desktop-widgets',
  windowTitle: 'RobOS Desktop Widgets',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  prelaunch: async (app) => {
    // Seed active task
    const taskFile = path.join(app.sandboxHome, '.config', 'robos', 'active-issue');
    fs.mkdirSync(path.dirname(taskFile), { recursive: true });
    fs.writeFileSync(taskFile, 'TASK-501: Architect Desktop Status Widgets');

    // Seed settings
    const settingsFile = path.join(app.sandboxHome, '.config', 'robos', 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify({ knowledge_graph_branch: 'feat/status-overlays' }));

    await evalJS(app.port, `window.refreshData()`);
  },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
