'use strict';
const path = require('path');
const fs   = require('fs');

const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'The RobOS top taskbar provides continuous real-time observability over active ephemeral agent swarms.',
    target: '#btn-agent-widget',
    action: 'hover',
    callout: 'Inspect Taskbar Agent Indicator Chip',
    minHold: 3200,
  },
  {
    narration: 'We click the agent chip to open the live session management dropdown.',
    target: '#btn-agent-widget',
    action: 'click',
    callout: 'Open Agent Sessions Popover',
    minHold: 3000,
  },
  {
    narration: 'The popover displays active agent usernames, assigned engineering roles, and allocated RAM quotas.',
    target: '#agent-menu',
    action: 'hover',
    callout: 'Review Running Agent Profiles',
    minHold: 3200,
  },
  {
    narration: 'We terminate an individual agent session, executing instant process kill and tmpfs unmount.',
    target: '.btn-kill-agent',
    action: 'click',
    callout: 'Kill & Wipe Individual Agent',
    js: `(() => {
      const btn = document.querySelector('.btn-kill-agent');
      if (btn) btn.click();
    })()`,
    minHold: 3200,
  },
  {
    narration: 'We use the Clean All action to purge all remaining ephemeral agent profiles in one click.',
    target: '#btn-wipe-all-agents',
    action: 'click',
    callout: 'Clean All Active Agents',
    minHold: 3000,
  },
  {
    narration: 'The taskbar status indicator updates dynamically to reflect zero active agent accounts.',
    target: '#btn-agent-widget',
    action: 'hover',
    callout: 'Zero Active Agent Swarms',
    minHold: 2800,
  },
];

runDemo({
  slug: 'robos-profiled-taskbar',
  appId: 'robos-desktop',
  windowTitle: 'RobOS Desktop',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  prelaunch: async (app) => {
    const profiledDir = path.join(app.sandboxHome, '.config', 'robos', 'profiled');
    fs.mkdirSync(profiledDir, { recursive: true });
    const seedProfiles = [
      { username: 'my-agent-reviewer', role: 'Code Reviewer', quota: '2G', status: 'active' },
      { username: 'my-agent-tester', role: 'Test Fabric Runner', quota: '4G', status: 'active' },
    ];
    fs.writeFileSync(path.join(profiledDir, 'profiles.json'), JSON.stringify(seedProfiles, null, 2), 'utf8');
  },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
