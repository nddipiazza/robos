'use strict';
const scenarios   = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');

const SCRIPT = [
  {
    narration: 'RobOS orchestrates multi-agent swarms with distinct Linux user IDs and memory-backed homes.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Inspect Multi-Agent Daemon Telemetry',
    minHold: 3200,
  },
  {
    narration: 'We trigger concurrent batch provisioning to spawn a 4-worker autonomous development swarm.',
    target: '#btn-spawn-swarm',
    action: 'click',
    callout: 'Spawn 4x Autonomous Swarm',
    minHold: 3200,
  },
  {
    narration: 'The stat bar updates to 4 active profiles, each allocated a 2GB tmpfs quota and X11 display bridge.',
    target: '#stat-active',
    action: 'hover',
    callout: '4 Active Swarm Profiles',
    minHold: 3200,
  },
  {
    narration: 'We inspect individual swarm worker cards, verifying POSIX 0700 permission isolation.',
    target: '.profile-card',
    action: 'click',
    callout: 'Inspect Swarm Worker 1',
    minHold: 3500,
  },
  {
    narration: 'We trigger a complete zero-residue wipe to instantly terminate all agents and unmount storage.',
    target: '#btn-refresh',
    action: 'click',
    callout: 'Execute Zero-Residue Wipe',
    js: `(async () => {
      await window.wipeAll();
    })()`,
    minHold: 3200,
  },
  {
    narration: 'All memory-backed tmpfs homes and forwarded sockets are cleanly purged with zero disk residue.',
    target: '#stat-bar',
    action: 'hover',
    callout: 'Zero Active Residue Verified',
    minHold: 2800,
  },
];

runDemo({
  slug: 'robos-profiled-zero-residue',
  appId: 'robos-profiled',
  windowTitle: 'RobOS Ephemeral Profile Manager',
  scenario: scenarios['all-good'],
  audio: false,
  env: { ROBOS_DEMO_SHOW: '1' },
  script: SCRIPT,
}).catch(err => {
  console.error(err);
  process.exit(1);
});
