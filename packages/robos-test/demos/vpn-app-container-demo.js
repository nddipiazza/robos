'use strict';
const { runDemo } = require('../lib/demo-runner');
const scenarios = require('../lib/scenarios');
runDemo({
  slug: 'vpn-app-container', appId: 'vpn-app-container',
  windowTitle: 'RobOS VPN App Container', scenario: scenarios['all-good'], audio: false,
  script: [
    { narration: 'VPN App Container launches separate copies of selected apps behind VPN-only networking.', target: 'h1', minHold: 1800 },
    { narration: 'The runtime status checks whether a Linux Docker engine is available.', target: '#runtime', minHold: 1800 },
    { narration: 'Import your OpenVPN profile, then enter credentials locally. Credentials are not saved in settings.', target: '#profile', minHold: 1800 },
    { narration: 'qBittorrent is the default protected app. Transmission is another available preset.', target: '#app', action: 'select', value: 'transmission', callout: 'Select another protected app', minHold: 1800 },
    { narration: 'Select qBittorrent for the live network isolation test.', target: '#app', action: 'select', value: 'qbittorrent', callout: 'Select qBittorrent', minHold: 1800 },
    { narration: 'Launch remains disabled until the runtime and VPN profile are ready.', target: '#start', minHold: 1800 },
    { narration: 'Protection status explains firewall enforcement and finite VPN failure detection times.', target: '#logs', minHold: 1800 },
  ],
}).catch(error => { console.error(error); process.exitCode = 1; });
