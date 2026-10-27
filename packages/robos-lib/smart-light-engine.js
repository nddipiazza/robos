'use strict';

/**
 * RobOS Smart Light Engine (`robos-lib/smart-light-engine`)
 *
 * Provides zero-cloud LAN Smart Light discovery, multi-protocol control,
 * room & zone orchestration, Mood Scenes, AI Lighting Designer (optional),
 * 24-hour Circadian Daylight curves, Wake-Up Sunrise schedules, and
 * Dev Central / CI Build Status Light Bar synchronization.
 *
 * Supported LAN Protocols (Zero-Cloud):
 *  1. Philips WiZ (`wiz-udp`)           — UDP :38899 JSON-RPC (`getPilot` / `setPilot`)
 *  2. TP-Link Kasa / Tapo (`kasa-lan`)  — UDP/TCP :9999 XOR-171 autokey cipher (`transition_light_state`)
 *  3. WLED (`wled-http`)                — HTTP :80 `/json/state` & `/json/info` (RGB + 100+ segments/effects)
 *  4. Philips Hue Bridge (`hue-rest`)   — HTTP :80 `/api/<key>/lights/<id>/state` + `/api` link-button pairing
 *  5. LIFX LAN (`lifx-udp`)             — UDP :56700 binary protocol (`GetService`, `SetPower`, `SetColor` HSBK)
 *  6. Govee LAN API (`govee-udp`)       — UDP :4001/:4002/:4003 JSON (`turn`, `brightness`, `colorwc`)
 *  7. Shelly Gen1/Gen2/Gen3 (`shelly`)  — HTTP :80 `/light/0` & `/rpc/Light.Set` / `/rpc/RGBW.Set`
 *  8. Yeelight LAN (`yeelight-tcp`)     — TCP :55443 JSON-RPC (`set_power`, `set_bright`, `set_rgb`, `set_ct_abx`)
 *  9. Elgato Key Light (`elgato-http`)  — HTTP :9123 `/elgato/lights` (studio key lights, mired temperature)
 * 10. Home Assistant (`ha-rest`)        — HTTP :8123 `/api/services/light/turn_on` & `turn_off`
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');

const DEFAULT_API_PORT = 19219;

const LIGHT_PROTOCOLS = [
  {
    id: 'wiz-udp',
    name: 'Philips WiZ / WiZ Connected (UDP :38899)',
    vendor: 'Signify / Philips WiZ / WiZ Pro',
    transport: 'UDP :38899 JSON-RPC',
    defaultPort: 38899,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb', 'scenes'],
    setupSteps: [
      'Open the WiZ V2 mobile app → Settings → Current Home → Security / Local Communication.',
      'Ensure "Allow Local Communication (UDP 38899)" is toggled ON (enabled by default on most WiZ bulbs).',
      'Click "Scan LAN for Lights" in RobOS Smart Light to broadcast `{"method":"getPilot","params":{}}` on port 38899.',
    ],
  },
  {
    id: 'wled-http',
    name: 'WLED Addressable LED Strips & Matrices (HTTP :80)',
    vendor: 'ESP32 / ESP8266 WLED / QuinLED / Athom',
    transport: 'HTTP REST /json/state (:80)',
    defaultPort: 80,
    capabilities: ['power', 'brightness', 'rgb', 'effects'],
    setupSteps: [
      'Connect your WLED controller to your Wi-Fi network (no cloud account required; JSON API `/json/state` is always active).',
      'Enter the WLED controller IP or click "Scan LAN for Lights" to probe `/json/info` across your subnet.',
      'Use effect presets (Aurora, Cyberpunk, Breath, Fireplace, Rainbow) directly from RobOS.',
    ],
  },
  {
    id: 'kasa-lan',
    name: 'TP-Link Kasa Smart Bulbs & Light Strips (UDP/TCP :9999)',
    vendor: 'TP-Link Kasa KL125 / KL130 / KL430',
    transport: 'UDP/TCP :9999 XOR-171 Cipher',
    defaultPort: 9999,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'Ensure your Kasa bulb or light strip is on the same LAN subnet as RobOS.',
      'In the Kasa app → Me → Settings → Third-Party Compatibility, toggle ON local/third-party access if prompted on newer firmware.',
      'RobOS encrypts and dispatches native `smartlife.iot.smartbulb.lightingservice.transition_light_state` packets over port 9999.',
    ],
  },
  {
    id: 'hue-rest',
    name: 'Philips Hue Bridge v2 (HTTP REST :80)',
    vendor: 'Signify Philips Hue Bridge & Zigbee Lights',
    transport: 'HTTP PUT /api/<key>/lights/<id>/state',
    defaultPort: 80,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'Press the physical round Link Button on top of your Philips Hue Bridge.',
      'Within 30 seconds, click "Pair Hue Bridge" in RobOS Smart Light to generate and save a local API username key.',
      'All Zigbee bulbs, lightstrips, and Hue Play bars paired to your bridge can then be controlled with zero cloud latency.',
    ],
  },
  {
    id: 'lifx-udp',
    name: 'LIFX Wi-Fi Smart Lights & Beam/Tile (UDP :56700)',
    vendor: 'LIFX Color / White-to-Warm / Z-Strip / Beam',
    transport: 'UDP :56700 LIFX Binary Protocol',
    defaultPort: 56700,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'LIFX bulbs listen on UDP port 56700 out of the box with zero cloud dependencies.',
      'Click "Scan LAN for Lights" to send a 36-byte LIFX `GetService (2)` broadcast frame and auto-discover all bulbs.',
    ],
  },
  {
    id: 'govee-udp',
    name: 'Govee LAN Control LED Strips, Bars & Lamps (UDP :4003)',
    vendor: 'Govee H6199 / H6076 / Glide / RGBIC',
    transport: 'UDP Multicast :4001 & Control :4003',
    defaultPort: 4003,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'Open the Govee Home mobile app → select your light → tap the gear icon (Settings) in the top-right.',
      'Toggle ON "LAN Control" (make sure your light is connected to 2.4GHz Wi-Fi).',
      'RobOS discovers Govee lights on multicast `239.255.255.250:4001` and sends real-time JSON commands to UDP `:4003`.',
    ],
  },
  {
    id: 'elgato-http',
    name: 'Elgato Key Light / Key Light Air / Ring Light (:9123)',
    vendor: 'Corsair / Elgato Studio Lighting',
    transport: 'HTTP PUT :9123/elgato/lights',
    defaultPort: 9123,
    capabilities: ['power', 'brightness', 'kelvin'],
    setupSteps: [
      'Pair your Elgato Key Light to Wi-Fi once; its HTTP server on port 9123 requires no authentication.',
      'RobOS converts Kelvin (2900K–7000K) to Elgato mireds (143–344) and updates `/elgato/lights`.',
    ],
  },
  {
    id: 'yeelight-tcp',
    name: 'Yeelight / Xiaomi Mi LED Smart Bulbs & Lightbars (:55443)',
    vendor: 'Yeelight Color / Lightstrip / Monitor Bar',
    transport: 'TCP :55443 JSON-RPC + SSDP :1982',
    defaultPort: 55443,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'Open the Yeelight mobile app → select your light → click the bottom-right menu → "LAN Control" → toggle ON.',
      'RobOS connects via TCP port 55443 and sends newline-delimited JSON-RPC commands (`set_power`, `set_bright`, `set_rgb`, `set_ct_abx`).',
    ],
  },
  {
    id: 'shelly',
    name: 'Shelly Smart Dimmer / Duo / RGBW2 (HTTP :80)',
    vendor: 'Allterco Shelly Gen1 / Plus / Pro',
    transport: 'HTTP /light/0 & /rpc/Light.Set',
    defaultPort: 80,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'Shelly devices expose local HTTP REST and JSON-RPC endpoints on port 80 by default.',
      'Enter the Shelly IP address and select Room & Device Type.',
    ],
  },
  {
    id: 'ha-rest',
    name: 'Home Assistant Light Bridge (HTTP :8123)',
    vendor: 'Home Assistant OS / Zigbee2MQTT / Matter / Z-Wave',
    transport: 'HTTP POST :8123/api/services/light/*',
    defaultPort: 8123,
    capabilities: ['power', 'brightness', 'kelvin', 'rgb'],
    setupSteps: [
      'In Home Assistant → Profile → Long-Lived Access Tokens, create a token.',
      'Set the entity ID (e.g. `light.office_ceiling`) in the Device ID / Token field (`entity_id|token`).',
    ],
  },
];

const WLED_EFFECTS = [
  { id: 'solid', code: 0, name: 'Solid Color' },
  { id: 'breath', code: 2, name: 'Breathing Pulse' },
  { id: 'rainbow', code: 9, name: 'Rainbow Cycle' },
  { id: 'aurora', code: 38, name: 'Northern Aurora' },
  { id: 'cyberpunk', code: 63, name: 'Cyberpunk Neon' },
  { id: 'fireplace', code: 66, name: 'Cozy Fireplace Flicker' },
  { id: 'ocean', code: 101, name: 'Pacifica Ocean Waves' },
  { id: 'meteor', code: 76, name: 'Shooting Star Meteor' },
];

const DEFAULT_ROOMS = [
  { id: 'studio', name: 'Studio & Dev Desk', icon: '💻', floor: 'Main Floor' },
  { id: 'living-room', name: 'Living Room', icon: '🛋️', floor: 'Main Floor' },
  { id: 'bedroom', name: 'Master Bedroom', icon: '🛏️', floor: 'Upper Floor' },
  { id: 'kitchen', name: 'Kitchen & Dining', icon: '☕', floor: 'Main Floor' },
  { id: 'basement', name: 'Basement Theater', icon: '🎬', floor: 'Basement' },
];

const DEFAULT_LIGHTS = [
  {
    id: 'light-studio-wled-strip',
    name: 'Dev Desk Halo Strip (WLED)',
    roomId: 'studio',
    protocolId: 'wled-http',
    formFactor: 'strip',
    ip: '192.168.1.81',
    port: 80,
    deviceKey: '',
    on: true,
    brightness: 88,
    colorMode: 'rgb',
    colorHex: '#00bcd4',
    kelvin: 5000,
    effect: 'cyberpunk',
    online: true,
    wattsMax: 18,
  },
  {
    id: 'light-studio-keylight',
    name: 'Elgato Studio Key Light',
    roomId: 'studio',
    protocolId: 'elgato-http',
    formFactor: 'panel',
    ip: '192.168.1.82',
    port: 9123,
    deviceKey: '',
    on: true,
    brightness: 70,
    colorMode: 'kelvin',
    colorHex: '#fff4e0',
    kelvin: 5200,
    effect: 'solid',
    online: true,
    wattsMax: 25,
  },
  {
    id: 'light-living-wiz-sofa',
    name: 'Sofa Floor Lamp (Philips WiZ)',
    roomId: 'living-room',
    protocolId: 'wiz-udp',
    formFactor: 'lamp',
    ip: '192.168.1.83',
    port: 38899,
    deviceKey: '',
    on: true,
    brightness: 75,
    colorMode: 'kelvin',
    colorHex: '#ffb76b',
    kelvin: 2800,
    effect: 'solid',
    online: true,
    wattsMax: 11,
  },
  {
    id: 'light-living-govee-tv',
    name: '65" Roku TV Bias Backlight (Govee)',
    roomId: 'living-room',
    protocolId: 'govee-udp',
    formFactor: 'strip',
    ip: '192.168.1.84',
    port: 4003,
    deviceKey: '',
    on: true,
    brightness: 65,
    colorMode: 'rgb',
    colorHex: '#7c3aed',
    kelvin: 3200,
    effect: 'aurora',
    online: true,
    wattsMax: 15,
  },
  {
    id: 'light-bedroom-lifx-nightstand',
    name: 'Nightstand Globe (LIFX Color)',
    roomId: 'bedroom',
    protocolId: 'lifx-udp',
    formFactor: 'bulb',
    ip: '192.168.1.85',
    port: 56700,
    deviceKey: '',
    on: false,
    brightness: 35,
    colorMode: 'kelvin',
    colorHex: '#ff9e44',
    kelvin: 2400,
    effect: 'solid',
    online: true,
    wattsMax: 9,
  },
  {
    id: 'light-kitchen-kasa-island',
    name: 'Kitchen Island Pendants (TP-Link Kasa)',
    roomId: 'kitchen',
    protocolId: 'kasa-lan',
    formFactor: 'pendant',
    ip: '192.168.1.86',
    port: 9999,
    deviceKey: '',
    on: true,
    brightness: 90,
    colorMode: 'kelvin',
    colorHex: '#fff1d6',
    kelvin: 4200,
    effect: 'solid',
    online: true,
    wattsMax: 14,
  },
  {
    id: 'light-basement-hue-play',
    name: 'Basement Cinema Sconces (Philips Hue)',
    roomId: 'basement',
    protocolId: 'hue-rest',
    formFactor: 'bar',
    ip: '192.168.1.87',
    port: 80,
    deviceKey: '1',
    on: true,
    brightness: 45,
    colorMode: 'rgb',
    colorHex: '#3b82f6',
    kelvin: 3000,
    effect: 'breath',
    online: true,
    wattsMax: 12,
  },
];

const BUILTIN_SCENES = [
  {
    id: 'scene-deep-focus',
    name: 'Deep Focus & Flow State',
    icon: '⚡',
    badge: '5200K Crisp Daylight',
    description: 'High-clarity 5200K daylight across desk and room lights with cyan accent strip for coding sessions.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 92,
      colorMode: 'kelvin',
      kelvin: 5200,
      colorHex: '#00bcd4',
      stripColorHex: '#00bcd4',
      effect: 'solid',
    },
  },
  {
    id: 'scene-movie-theater',
    name: 'Cinema & TV Bias Mode',
    icon: '🎬',
    badge: 'Dim + Bias Glow',
    description: 'Dims overhead bulbs to 15% warm amber and sets TV/Desk strips to deep purple bias lighting to reduce eye strain.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 22,
      colorMode: 'rgb',
      kelvin: 2400,
      colorHex: '#7c3aed',
      stripColorHex: '#7c3aed',
      effect: 'breath',
    },
  },
  {
    id: 'scene-cozy-evening',
    name: 'Cozy Amber Evening',
    icon: '🌅',
    badge: '2400K Candlelight',
    description: 'Warm 2400K golden-hour hearth ambiance across every room for relaxing after work.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 55,
      colorMode: 'kelvin',
      kelvin: 2400,
      colorHex: '#ff9e44',
      stripColorHex: '#f97316',
      effect: 'fireplace',
    },
  },
  {
    id: 'scene-cyberpunk',
    name: 'RobOS Cyberpunk Arcade',
    icon: '🕹️',
    badge: 'Cyan + Neon Pink',
    description: 'Signature RobOS dark-navy neon aesthetic: electric cyan (#00bcd4) and synthwave pink (#ec4899) effects.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 85,
      colorMode: 'rgb',
      kelvin: 4500,
      colorHex: '#ec4899',
      stripColorHex: '#00bcd4',
      effect: 'cyberpunk',
    },
  },
  {
    id: 'scene-aurora-borealis',
    name: 'Northern Aurora Borealis',
    icon: '🌌',
    badge: 'Teal + Emerald Wave',
    description: 'Slow-moving arctic teal (#14b8a6) and emerald green (#22c55e) waves across strips and lamps.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 72,
      colorMode: 'rgb',
      kelvin: 4000,
      colorHex: '#14b8a6',
      stripColorHex: '#22c55e',
      effect: 'aurora',
    },
  },
  {
    id: 'scene-night-reading',
    name: 'Night Reading',
    icon: '📖',
    badge: '3000K Glare-Free',
    description: 'Balanced 3000K soft white at 48% brightness—comfortable for reading without suppressing melatonin.',
    roomScope: 'all',
    preset: {
      on: true,
      brightness: 48,
      colorMode: 'kelvin',
      kelvin: 3000,
      colorHex: '#ffd29d',
      stripColorHex: '#ffb76b',
      effect: 'solid',
    },
  },
  {
    id: 'scene-incident-alert',
    name: 'Pager / Build Broken Alert',
    icon: '🚨',
    badge: 'High-Vis Crimson',
    description: 'High-visibility crimson red alert lighting triggered when CI pipelines fail or P0 blockers occur.',
    roomScope: 'studio',
    preset: {
      on: true,
      brightness: 100,
      colorMode: 'rgb',
      kelvin: 3500,
      colorHex: '#ef4444',
      stripColorHex: '#ef4444',
      effect: 'breath',
    },
  },
  {
    id: 'scene-goodnight',
    name: 'Goodnight Shutdown',
    icon: '🌙',
    badge: 'All Off / Nightlight',
    description: 'Turns off all rooms except a 10% ultra-warm 2200K bedroom nightlight.',
    roomScope: 'all',
    preset: {
      on: false,
      brightness: 10,
      colorMode: 'kelvin',
      kelvin: 2200,
      colorHex: '#ff8a2b',
      stripColorHex: '#ff8a2b',
      effect: 'solid',
      keepNightlightRoomId: 'bedroom',
    },
  },
];

const DEFAULT_SCHEDULES = [
  {
    id: 'sched-sunrise-wakeup',
    name: 'Sunrise Wake-Up Fade',
    time: '07:00',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    roomScope: 'bedroom',
    sceneId: 'scene-deep-focus',
    fadeMinutes: 20,
    enabled: true,
    lastTriggeredAt: null,
  },
  {
    id: 'sched-evening-warmth',
    name: 'Golden Hour Wind-Down',
    time: '18:30',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    roomScope: 'all',
    sceneId: 'scene-cozy-evening',
    fadeMinutes: 10,
    enabled: true,
    lastTriggeredAt: null,
  },
  {
    id: 'sched-goodnight',
    name: 'Late Night Auto-Off',
    time: '23:30',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    roomScope: 'all',
    sceneId: 'scene-goodnight',
    fadeMinutes: 5,
    enabled: true,
    lastTriggeredAt: null,
  },
];

const CI_STATUS_STATES = {
  passing: {
    id: 'passing',
    label: 'CI Passing / All Checks Green',
    colorHex: '#22c55e',
    brightness: 80,
    effect: 'solid',
    description: 'Sets mapped status light to Emerald Green (#22c55e).',
  },
  building: {
    id: 'building',
    label: 'Agent Running / Build in Progress',
    colorHex: '#00bcd4',
    brightness: 88,
    effect: 'breath',
    description: 'Pulses mapped status light in RobOS Cyan (#00bcd4) while an agent or build runs.',
  },
  warning: {
    id: 'warning',
    label: 'PR Review Needed / Flaky Warning',
    colorHex: '#f59e0b',
    brightness: 85,
    effect: 'solid',
    description: 'Sets mapped status light to Amber (#f59e0b) when PR reviews are waiting.',
  },
  failing: {
    id: 'failing',
    label: 'CI Broken / Blocker Detected',
    colorHex: '#ef4444',
    brightness: 100,
    effect: 'breath',
    description: 'Pulses mapped status light in Crimson Red (#ef4444) on build failure.',
  },
};

// ── Color & Kelvin Conversion Helpers ────────────────────────────────────────

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex) {
  const clean = String(hex || '#00bcd4').replace(/^#/, '').trim();
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  const num = parseInt(clean.slice(0, 6), 16);
  if (Number.isNaN(num)) return { r: 0, g: 188, b: 212 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const to2 = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function rgbToHsv({ r, g, b }) {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    hue: Math.round(h * 360),
    saturation: Math.round(s * 100),
    value: Math.round(v * 100),
  };
}

function kelvinToHex(kelvin) {
  const k = clamp(kelvin, 1800, 9000) / 100;
  let r;
  let g;
  let b;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  return rgbToHex({ r, g, b });
}

/**
 * Compute Circadian Kelvin & recommended brightness for any hour of the day (0..23.99).
 */
function computeCircadianTarget(hourFloat) {
  const h = ((Number(hourFloat) % 24) + 24) % 24;
  // Bell-like curve peaking between 11:00 and 14:00 at 5800K, 2200K at night
  let kelvin = 2200;
  let brightness = 25;
  let phase = 'Night Wind-Down';

  if (h >= 6 && h < 9) {
    const t = (h - 6) / 3;
    kelvin = Math.round(2500 + t * 2500);
    brightness = Math.round(35 + t * 55);
    phase = 'Morning Sunrise Boost';
  } else if (h >= 9 && h < 15) {
    const t = Math.sin(((h - 9) / 6) * Math.PI);
    kelvin = Math.round(5000 + t * 800);
    brightness = Math.round(88 + t * 12);
    phase = 'Solar Noon Peak Focus';
  } else if (h >= 15 && h < 18.5) {
    const t = (h - 15) / 3.5;
    kelvin = Math.round(5000 - t * 1800);
    brightness = Math.round(85 - t * 20);
    phase = 'Afternoon Transition';
  } else if (h >= 18.5 && h < 22) {
    const t = (h - 18.5) / 3.5;
    kelvin = Math.round(3200 - t * 900);
    brightness = Math.round(65 - t * 35);
    phase = 'Golden Hour & Melatonin Prep';
  } else {
    kelvin = 2200;
    brightness = 20;
    phase = 'Deep Night Rest';
  }

  return {
    hour: Math.round(h * 10) / 10,
    kelvin,
    brightness,
    colorHex: kelvinToHex(kelvin),
    phase,
  };
}

// ── Protocol Packet Builders & Encoders ──────────────────────────────────────

/**
 * TP-Link Kasa XOR-171 autokey cipher (UDP has no 4-byte length prefix; TCP has 4-byte BE length).
 */
function encodeKasaXorPayload(jsonString, withTcpHeader = false) {
  const str = typeof jsonString === 'string' ? jsonString : JSON.stringify(jsonString);
  const body = Buffer.alloc(str.length);
  let key = 171;
  for (let i = 0; i < str.length; i++) {
    const c = key ^ str.charCodeAt(i);
    key = c;
    body[i] = c;
  }
  if (!withTcpHeader) return body;
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

function decodeKasaXorPayload(buf, hasTcpHeader = false) {
  const slice = hasTcpHeader && buf.length > 4 ? buf.subarray(4) : buf;
  let key = 171;
  let out = '';
  for (let i = 0; i < slice.length; i++) {
    const c = key ^ slice[i];
    key = slice[i];
    out += String.fromCharCode(c);
  }
  return out;
}

/**
 * LIFX LAN binary packet builder (36-byte header + payload).
 * Message 2 = GetService, 117 = SetPower, 102 = SetColor.
 */
function buildLifxPacket(messageType, payloadBuf = Buffer.alloc(0)) {
  const totalSize = 36 + payloadBuf.length;
  const header = Buffer.alloc(36);
  header.writeUInt16LE(totalSize, 0);
  // Protocol = 1024 (0x0400), addressable = 1 (0x1000), tagged = 1 for broadcast (0x2000)
  header.writeUInt16LE(messageType === 2 ? 0x3400 : 0x1400, 2);
  header.writeUInt32LE(0x524f424f, 4); // source identifier "ROBO"
  header[22] = 0x01; // res_required
  header.writeUInt16LE(messageType, 32);
  return Buffer.concat([header, payloadBuf]);
}

function buildLifxSetColorPacket({ hue, saturation, brightness, kelvin, durationMs = 250 }) {
  // LIFX Light::SetColor (102) payload is 13 bytes:
  // reserved(1), hue(u16), saturation(u16), brightness(u16), kelvin(u16), duration(u32)
  const payload = Buffer.alloc(13);
  payload[0] = 0;
  payload.writeUInt16LE(Math.round((clamp(hue, 0, 360) / 360) * 65535), 1);
  payload.writeUInt16LE(Math.round((clamp(saturation, 0, 100) / 100) * 65535), 3);
  payload.writeUInt16LE(Math.round((clamp(brightness, 0, 100) / 100) * 65535), 5);
  payload.writeUInt16LE(clamp(kelvin || 3500, 1500, 9000), 7);
  payload.writeUInt32LE(clamp(durationMs, 0, 60000), 9);
  return buildLifxPacket(102, payload);
}

/**
 * Build a wire-protocol command descriptor for any supported light protocol.
 * Used both for real LAN dispatch and for the Protocol Inspector.
 */
function buildProtocolCommand(light) {
  const rgb = hexToRgb(light.colorMode === 'kelvin' ? kelvinToHex(light.kelvin) : light.colorHex);
  const hsv = rgbToHsv(rgb);
  const briPct = clamp(light.brightness, 1, 100);
  const bri255 = Math.round((briPct / 100) * 255);
  const kelvin = clamp(light.kelvin || 4000, 2000, 6500);
  const ip = light.ip || '192.168.1.100';
  const port = Number(light.port) || 80;

  switch (light.protocolId) {
    case 'wiz-udp': {
      const params = {
        state: Boolean(light.on),
        dimming: clamp(briPct, 10, 100),
      };
      if (light.colorMode === 'rgb') {
        params.r = rgb.r;
        params.g = rgb.g;
        params.b = rgb.b;
      } else {
        params.temp = kelvin;
      }
      const payload = { id: 1, method: 'setPilot', params };
      const jsonStr = JSON.stringify(payload);
      return {
        protocolId: 'wiz-udp',
        transport: 'UDP',
        ip,
        port: port || 38899,
        payload,
        cliPreview: `echo '${jsonStr}' | nc -u -w1 ${ip} ${port || 38899}`,
      };
    }

    case 'wled-http': {
      const fxObj = WLED_EFFECTS.find((e) => e.id === light.effect) || WLED_EFFECTS[0];
      const payload = {
        on: Boolean(light.on),
        bri: bri255,
        transition: 4,
        seg: [
          {
            id: 0,
            col: [[rgb.r, rgb.g, rgb.b]],
            fx: fxObj.code,
            sx: 128,
            ix: 128,
          },
        ],
      };
      const jsonStr = JSON.stringify(payload);
      return {
        protocolId: 'wled-http',
        transport: 'HTTP POST',
        ip,
        port: port || 80,
        path: '/json/state',
        method: 'POST',
        payload,
        cliPreview: `curl -s -X POST "http://${ip}:${port || 80}/json/state" -H "Content-Type: application/json" -d '${jsonStr}'`,
      };
    }

    case 'kasa-lan': {
      const stateObj = {
        on_off: light.on ? 1 : 0,
        brightness: briPct,
        color_temp: light.colorMode === 'kelvin' ? kelvin : 0,
        hue: light.colorMode === 'rgb' ? hsv.hue : 0,
        saturation: light.colorMode === 'rgb' ? hsv.saturation : 0,
        transition_period: 200,
      };
      const payload = {
        'smartlife.iot.smartbulb.lightingservice': {
          transition_light_state: stateObj,
        },
      };
      return {
        protocolId: 'kasa-lan',
        transport: 'UDP XOR-171',
        ip,
        port: port || 9999,
        payload,
        cliPreview: `# TP-Link Kasa XOR-171 UDP :${port || 9999} → ${ip}\n${JSON.stringify(payload)}`,
      };
    }

    case 'hue-rest': {
      const [hueUser, lightIdx] = String(light.deviceKey || 'robos-hue-user|1').includes('|')
        ? String(light.deviceKey).split('|')
        : ['robos-hue-bridge-key', String(light.deviceKey || '1')];
      const ctMired = clamp(Math.round(1000000 / kelvin), 153, 500);
      const payload = {
        on: Boolean(light.on),
        bri: clamp(Math.round((briPct / 100) * 254), 1, 254),
      };
      if (light.colorMode === 'rgb') {
        payload.hue = Math.round((hsv.hue / 360) * 65535);
        payload.sat = Math.round((hsv.saturation / 100) * 254);
      } else {
        payload.ct = ctMired;
      }
      const reqPath = `/api/${hueUser}/lights/${lightIdx}/state`;
      return {
        protocolId: 'hue-rest',
        transport: 'HTTP PUT',
        ip,
        port: port || 80,
        path: reqPath,
        method: 'PUT',
        payload,
        cliPreview: `curl -s -X PUT "http://${ip}${reqPath}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`,
      };
    }

    case 'lifx-udp': {
      const packet = buildLifxSetColorPacket({
        hue: light.colorMode === 'rgb' ? hsv.hue : 0,
        saturation: light.colorMode === 'rgb' ? hsv.saturation : 0,
        brightness: light.on ? briPct : 0,
        kelvin,
      });
      return {
        protocolId: 'lifx-udp',
        transport: 'UDP Binary',
        ip,
        port: port || 56700,
        binaryHex: packet.toString('hex'),
        payload: {
          message: 'Light::SetColor (102)',
          hue: hsv.hue,
          saturation: light.colorMode === 'rgb' ? hsv.saturation : 0,
          brightness: light.on ? briPct : 0,
          kelvin,
        },
        cliPreview: `echo "${packet.toString('hex')}" | xxd -r -p | nc -u -w1 ${ip} ${port || 56700}`,
      };
    }

    case 'govee-udp': {
      const payload = {
        msg: {
          cmd: 'colorwc',
          data: {
            color: { r: rgb.r, g: rgb.g, b: rgb.b },
            colorTemInKelvin: light.colorMode === 'kelvin' ? kelvin : 0,
          },
        },
        turn: {
          msg: { cmd: 'turn', data: { value: light.on ? 1 : 0 } },
        },
        brightness: {
          msg: { cmd: 'brightness', data: { value: briPct } },
        },
      };
      return {
        protocolId: 'govee-udp',
        transport: 'UDP',
        ip,
        port: port || 4003,
        payload,
        cliPreview: `echo '${JSON.stringify(payload.msg)}' | nc -u -w1 ${ip} ${port || 4003}`,
      };
    }

    case 'elgato-http': {
      const mireds = clamp(Math.round(1000000 / kelvin), 143, 344);
      const payload = {
        numberOfLights: 1,
        lights: [
          {
            on: light.on ? 1 : 0,
            brightness: briPct,
            temperature: mireds,
          },
        ],
      };
      return {
        protocolId: 'elgato-http',
        transport: 'HTTP PUT',
        ip,
        port: port || 9123,
        path: '/elgato/lights',
        method: 'PUT',
        payload,
        cliPreview: `curl -s -X PUT "http://${ip}:${port || 9123}/elgato/lights" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`,
      };
    }

    case 'yeelight-tcp': {
      const rgbInt = (rgb.r << 16) + (rgb.g << 8) + rgb.b;
      const payload = !light.on
        ? { id: 1, method: 'set_power', params: ['off', 'smooth', 300] }
        : light.colorMode === 'rgb'
          ? { id: 1, method: 'set_rgb', params: [rgbInt, 'smooth', 300] }
          : { id: 1, method: 'set_ct_abx', params: [kelvin, 'smooth', 300] };
      return {
        protocolId: 'yeelight-tcp',
        transport: 'TCP JSON-RPC',
        ip,
        port: port || 55443,
        payload,
        cliPreview: `printf '%s\\r\\n' '${JSON.stringify(payload)}' | nc -w1 ${ip} ${port || 55443}`,
      };
    }

    case 'shelly': {
      const payload = {
        id: 0,
        on: Boolean(light.on),
        brightness: briPct,
        rgb: [rgb.r, rgb.g, rgb.b],
      };
      return {
        protocolId: 'shelly',
        transport: 'HTTP POST',
        ip,
        port: port || 80,
        path: '/rpc/RGBW.Set',
        method: 'POST',
        payload,
        cliPreview: `curl -s -X POST "http://${ip}:${port || 80}/rpc/RGBW.Set" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`,
      };
    }

    case 'ha-rest':
    default: {
      const [entityId, token] = String(light.deviceKey || 'light.studio_desk|').split('|');
      const service = light.on ? 'turn_on' : 'turn_off';
      const payload = light.on
        ? {
            entity_id: entityId || 'light.studio_desk',
            brightness_pct: briPct,
            ...(light.colorMode === 'rgb' ? { rgb_color: [rgb.r, rgb.g, rgb.b] } : { kelvin }),
          }
        : { entity_id: entityId || 'light.studio_desk' };
      const reqPath = `/api/services/light/${service}`;
      return {
        protocolId: 'ha-rest',
        transport: 'HTTP POST',
        ip,
        port: port || 8123,
        path: reqPath,
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        payload,
        cliPreview: `curl -s -X POST "http://${ip}:${port || 8123}${reqPath}" -H "Content-Type: application/json" -d '${JSON.stringify(payload)}'`,
      };
    }
  }
}

// ── Network Dispatch Helpers (Non-blocking with fast timeouts) ───────────────

function sendUdpFireAndForget(ip, port, buffer, timeoutMs = 250) {
  return new Promise((resolve) => {
    let closed = false;
    const sock = dgram.createSocket('udp4');
    const finish = (res) => {
      if (closed) return;
      closed = true;
      try {
        sock.close();
      } catch {}
      resolve(res);
    };
    const timer = setTimeout(() => finish({ ok: true, mode: 'udp-dispatched' }), timeoutMs);
    sock.once('error', (err) => {
      clearTimeout(timer);
      finish({ ok: false, error: err.message });
    });
    sock.once('message', (msg) => {
      clearTimeout(timer);
      finish({ ok: true, mode: 'udp-reply', replyBytes: msg.length });
    });
    try {
      sock.send(buffer, port, ip, (err) => {
        if (err) {
          clearTimeout(timer);
          finish({ ok: false, error: err.message });
        }
      });
    } catch (err) {
      clearTimeout(timer);
      finish({ ok: false, error: err.message });
    }
  });
}

function sendHttpLightRequest({ ip, port, path: reqPath, method = 'POST', headers = {}, bodyObj }, timeoutMs = 450) {
  return new Promise((resolve) => {
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const req = http.request(
      {
        hostname: ip,
        port: port || 80,
        path: reqPath || '/',
        method,
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 400,
            statusCode: res.statusCode,
            responseText: Buffer.concat(chunks).toString('utf8').slice(0, 300),
          });
        });
      }
    );
    req.once('timeout', () => {
      req.destroy();
      resolve({ ok: false, timeout: true });
    });
    req.once('error', (err) => {
      resolve({ ok: false, error: err.message });
    });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sendTcpLine(ip, port, line, timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {}
      resolve(res);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.write(`${line}\r\n`, () => finish({ ok: true, mode: 'tcp-sent' }));
    });
    socket.once('timeout', () => finish({ ok: false, timeout: true }));
    socket.once('error', (err) => finish({ ok: false, error: err.message }));
    socket.connect(port, ip);
  });
}

async function dispatchLightCommandOnLan(cmd, skipNetwork = false) {
  if (skipNetwork) {
    return { ok: true, simulated: true };
  }
  try {
    if (cmd.protocolId === 'wiz-udp') {
      const buf = Buffer.from(JSON.stringify(cmd.payload), 'utf8');
      return await sendUdpFireAndForget(cmd.ip, cmd.port, buf, 180);
    }
    if (cmd.protocolId === 'kasa-lan') {
      const buf = encodeKasaXorPayload(JSON.stringify(cmd.payload), false);
      return await sendUdpFireAndForget(cmd.ip, cmd.port, buf, 180);
    }
    if (cmd.protocolId === 'lifx-udp') {
      const buf = Buffer.from(cmd.binaryHex, 'hex');
      return await sendUdpFireAndForget(cmd.ip, cmd.port, buf, 180);
    }
    if (cmd.protocolId === 'govee-udp') {
      const turnBuf = Buffer.from(JSON.stringify(cmd.payload.turn), 'utf8');
      const briBuf = Buffer.from(JSON.stringify(cmd.payload.brightness), 'utf8');
      const colBuf = Buffer.from(JSON.stringify(cmd.payload), 'utf8');
      await sendUdpFireAndForget(cmd.ip, cmd.port, turnBuf, 100);
      await sendUdpFireAndForget(cmd.ip, cmd.port, briBuf, 100);
      return await sendUdpFireAndForget(cmd.ip, cmd.port, colBuf, 120);
    }
    if (cmd.protocolId === 'yeelight-tcp') {
      return await sendTcpLine(cmd.ip, cmd.port, JSON.stringify(cmd.payload), 250);
    }
    if (cmd.transport.startsWith('HTTP')) {
      return await sendHttpLightRequest(
        {
          ip: cmd.ip,
          port: cmd.port,
          path: cmd.path,
          method: cmd.method,
          headers: cmd.headers,
          bodyObj: cmd.payload,
        },
        300
      );
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }
  return { ok: true };
}

// ── AI Mood Scene Generator (Optional AI with deterministic fallback) ────────

const VIBE_PALETTES = [
  {
    keywords: ['tokyo', 'cyber', 'neon', 'synth', 'matrix', 'blade', 'arcade', 'hacker'],
    name: 'Neon Tokyo Rain',
    icon: '🌧️',
    badge: 'AI Synthwave Palette',
    primaryHex: '#00bcd4',
    secondaryHex: '#ec4899',
    kelvin: 4600,
    brightness: 82,
    effect: 'cyberpunk',
  },
  {
    keywords: ['sunset', 'beach', 'bonfire', 'fire', 'campfire', 'amber', 'hearth', 'autumn', 'cozy'],
    name: 'Golden Sunset Hearth',
    icon: '🔥',
    badge: 'AI Warm Ember Palette',
    primaryHex: '#f97316',
    secondaryHex: '#eab308',
    kelvin: 2300,
    brightness: 64,
    effect: 'fireplace',
  },
  {
    keywords: ['ocean', 'sea', 'underwater', 'reef', 'aqua', 'tropical', 'rain', 'calm', 'zen'],
    name: 'Abyssal Coral Reef',
    icon: '🌊',
    badge: 'AI Ocean Palette',
    primaryHex: '#14b8a6',
    secondaryHex: '#3b82f6',
    kelvin: 4200,
    brightness: 68,
    effect: 'ocean',
  },
  {
    keywords: ['dungeon', 'boss', 'd&d', 'dragon', 'battle', 'combat', 'red', 'hell', 'sith'],
    name: 'Dragon Boss Lair',
    icon: '🐉',
    badge: 'AI Tactical RPG Palette',
    primaryHex: '#ef4444',
    secondaryHex: '#7c3aed',
    kelvin: 2600,
    brightness: 78,
    effect: 'breath',
  },
  {
    keywords: ['forest', 'jungle', 'elven', 'nature', 'emerald', 'garden', 'moss', 'spring'],
    name: 'Enchanted Elven Canopy',
    icon: '🌲',
    badge: 'AI Forest Palette',
    primaryHex: '#22c55e',
    secondaryHex: '#14b8a6',
    kelvin: 3800,
    brightness: 70,
    effect: 'aurora',
  },
  {
    keywords: ['focus', 'study', 'code', 'work', 'morning', 'coffee', 'daylight', 'sprint'],
    name: 'High-Velocity Sprint Focus',
    icon: '🚀',
    badge: 'AI Daylight Flow',
    primaryHex: '#00bcd4',
    secondaryHex: '#3b82f6',
    kelvin: 5400,
    brightness: 94,
    effect: 'solid',
  },
];

function synthesizeDeterministicMoodScene(promptText, roomScope = 'all') {
  const lower = String(promptText || '').toLowerCase();
  let matched = VIBE_PALETTES[0];
  for (const cand of VIBE_PALETTES) {
    if (cand.keywords.some((kw) => lower.includes(kw))) {
      matched = cand;
      break;
    }
  }
  const cleanTitle = String(promptText || matched.name).trim().slice(0, 42);
  return {
    id: `scene-ai-${Date.now()}`,
    name: cleanTitle ? `✨ ${cleanTitle}` : matched.name,
    icon: matched.icon,
    badge: matched.badge,
    description: `Synthesized from prompt: "${promptText}" (${matched.primaryHex} + ${matched.secondaryHex}, ${matched.kelvin}K, effect: ${matched.effect}).`,
    roomScope: roomScope || 'all',
    preset: {
      on: true,
      brightness: matched.brightness,
      colorMode: 'rgb',
      kelvin: matched.kelvin,
      colorHex: matched.secondaryHex,
      stripColorHex: matched.primaryHex,
      effect: matched.effect,
    },
  };
}

// ── Main Engine Factory ──────────────────────────────────────────────────────

function createSmartLightEngine(options = {}) {
  const configDir =
    options.configDir ||
    process.env.ROBOS_CONFIG_DIR ||
    path.join(process.env.HOME || os.homedir(), '.config', 'robos');
  const stateFile = path.join(configDir, 'smart-lights.json');
  const skipLanNetwork =
    options.skipLanNetwork !== undefined
      ? Boolean(options.skipLanNetwork)
      : process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1';

  let apiPort = Number(options.apiPort ?? DEFAULT_API_PORT);
  let apiServer = null;

  function loadState() {
    try {
      if (fs.existsSync(stateFile)) {
        const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (parsed && Array.isArray(parsed.lights) && parsed.lights.length > 0) {
          return {
            rooms: Array.isArray(parsed.rooms) && parsed.rooms.length ? parsed.rooms : DEFAULT_ROOMS,
            lights: parsed.lights,
            customScenes: Array.isArray(parsed.customScenes) ? parsed.customScenes : [],
            schedules: Array.isArray(parsed.schedules) ? parsed.schedules : DEFAULT_SCHEDULES,
            activeSceneId: parsed.activeSceneId || 'scene-deep-focus',
            circadianEnabled: Boolean(parsed.circadianEnabled),
            ciSync: {
              enabled: parsed.ciSync?.enabled !== false,
              targetLightId: parsed.ciSync?.targetLightId || 'light-studio-wled-strip',
              currentStatus: parsed.ciSync?.currentStatus || 'passing',
              lastSyncedAt: parsed.ciSync?.lastSyncedAt || new Date().toISOString(),
            },
            tvBiasSync: {
              enabled: parsed.tvBiasSync?.enabled !== false,
              targetLightId: parsed.tvBiasSync?.targetLightId || 'light-living-govee-tv',
              mode: parsed.tvBiasSync?.mode || 'cinema-purple',
            },
            protocolLog: Array.isArray(parsed.protocolLog) ? parsed.protocolLog.slice(0, 35) : [],
          };
        }
      }
    } catch {}

    return {
      rooms: DEFAULT_ROOMS.map((r) => ({ ...r })),
      lights: DEFAULT_LIGHTS.map((l) => ({ ...l })),
      customScenes: [],
      schedules: DEFAULT_SCHEDULES.map((s) => ({ ...s })),
      activeSceneId: 'scene-deep-focus',
      circadianEnabled: false,
      ciSync: {
        enabled: true,
        targetLightId: 'light-studio-wled-strip',
        currentStatus: 'passing',
        lastSyncedAt: new Date().toISOString(),
      },
      tvBiasSync: {
        enabled: true,
        targetLightId: 'light-living-govee-tv',
        mode: 'cinema-purple',
      },
      protocolLog: [],
    };
  }

  let state = loadState();

  function saveState() {
    try {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch {}
  }

  // Ensure initial state file exists
  saveState();

  function recordProtocolEvent(light, cmd, netResult) {
    const entry = {
      id: `pkt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      lightId: light.id,
      lightName: light.name,
      protocolId: cmd.protocolId,
      transport: cmd.transport,
      target: `${cmd.ip}:${cmd.port}${cmd.path || ''}`,
      cliPreview: cmd.cliPreview,
      payload: cmd.payload,
      status: netResult?.ok ? 'DISPATCHED' : 'LOCAL_UPDATED',
    };
    state.protocolLog.unshift(entry);
    if (state.protocolLog.length > 35) {
      state.protocolLog = state.protocolLog.slice(0, 35);
    }
    return entry;
  }

  function computeMetrics() {
    const totalLights = state.lights.length;
    const activeLights = state.lights.filter((l) => l.on).length;
    const onlineLights = state.lights.filter((l) => l.online !== false).length;
    const estimatedWatts = state.lights.reduce((acc, l) => {
      if (!l.on) return acc;
      const maxW = Number(l.wattsMax) || 10;
      const factor = Math.max(0.15, clamp(l.brightness, 1, 100) / 100);
      return acc + maxW * factor;
    }, 0);
    const avgBrightness =
      activeLights > 0
        ? Math.round(
            state.lights.filter((l) => l.on).reduce((s, l) => s + clamp(l.brightness, 1, 100), 0) /
              activeLights
          )
        : 0;
    return {
      totalLights,
      activeLights,
      onlineLights,
      estimatedWatts: Math.round(estimatedWatts * 10) / 10,
      avgBrightness,
    };
  }

  function getOverview() {
    const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
    const circadianNow = computeCircadianTarget(nowHour);
    const circadianCurve = [];
    for (let h = 0; h < 24; h += 2) {
      circadianCurve.push(computeCircadianTarget(h));
    }

    return {
      ok: true,
      apiUrl: `http://127.0.0.1:${apiPort}`,
      rooms: state.rooms,
      lights: state.lights.map((l) => ({
        ...l,
        displayHex: l.colorMode === 'kelvin' ? kelvinToHex(l.kelvin) : l.colorHex,
      })),
      protocols: LIGHT_PROTOCOLS,
      effects: WLED_EFFECTS,
      scenes: [...BUILTIN_SCENES, ...state.customScenes],
      schedules: state.schedules,
      activeSceneId: state.activeSceneId,
      circadianEnabled: state.circadianEnabled,
      circadianNow,
      circadianCurve,
      ciSync: state.ciSync,
      ciStatusCatalog: CI_STATUS_STATES,
      tvBiasSync: state.tvBiasSync,
      protocolLog: state.protocolLog,
      metrics: computeMetrics(),
    };
  }

  async function updateLight(lightId, patch = {}) {
    const idx = state.lights.findIndex((l) => l.id === lightId);
    if (idx === -1) {
      return { ok: false, error: `Light "${lightId}" not found.` };
    }
    const current = state.lights[idx];
    const next = {
      ...current,
      ...patch,
    };
    if (patch.on !== undefined) next.on = Boolean(patch.on);
    if (patch.brightness !== undefined) {
      next.brightness = clamp(patch.brightness, 1, 100);
      if (next.brightness > 0 && patch.on === undefined) next.on = true;
    }
    if (patch.kelvin !== undefined) {
      next.kelvin = clamp(patch.kelvin, 2000, 6500);
      if (!patch.colorMode) next.colorMode = 'kelvin';
      next.colorHex = kelvinToHex(next.kelvin);
    }
    if (patch.colorHex !== undefined) {
      next.colorHex = String(patch.colorHex).startsWith('#') ? patch.colorHex : `#${patch.colorHex}`;
      if (!patch.colorMode) next.colorMode = 'rgb';
    }
    if (patch.effect !== undefined) {
      next.effect = String(patch.effect);
    }

    state.lights[idx] = next;
    const cmd = buildProtocolCommand(next);
    const netRes = await dispatchLightCommandOnLan(cmd, skipLanNetwork);
    const logEntry = recordProtocolEvent(next, cmd, netRes);
    saveState();

    return {
      ok: true,
      light: {
        ...next,
        displayHex: next.colorMode === 'kelvin' ? kelvinToHex(next.kelvin) : next.colorHex,
      },
      command: cmd,
      logEntry,
      overview: getOverview(),
    };
  }

  async function setRoomState(roomId, patch = {}) {
    const targets = state.lights.filter((l) => roomId === 'all' || l.roomId === roomId);
    const commands = [];
    for (const light of targets) {
      const res = await updateLight(light.id, patch);
      if (res.command) commands.push(res.command);
    }
    return {
      ok: true,
      updatedCount: targets.length,
      commands,
      overview: getOverview(),
    };
  }

  async function addOrUpdateLight(input = {}) {
    const name = String(input.name || '').trim();
    const ip = String(input.ip || '').trim() || '192.168.1.90';
    if (!name) {
      return { ok: false, error: 'Light name is required.' };
    }
    const protocolId = input.protocolId || 'wiz-udp';
    const proto = LIGHT_PROTOCOLS.find((p) => p.id === protocolId) || LIGHT_PROTOCOLS[0];
    const id =
      input.id ||
      `light-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}-${Date.now().toString(36).slice(-3)}`;

    const lightObj = {
      id,
      name,
      roomId: input.roomId || 'studio',
      protocolId: proto.id,
      formFactor: input.formFactor || 'bulb',
      ip,
      port: Number(input.port) || proto.defaultPort || 80,
      deviceKey: String(input.deviceKey || '').trim(),
      on: input.on !== undefined ? Boolean(input.on) : true,
      brightness: clamp(input.brightness ?? 80, 1, 100),
      colorMode: input.colorMode || 'kelvin',
      colorHex: input.colorHex || '#00bcd4',
      kelvin: clamp(input.kelvin ?? 4000, 2000, 6500),
      effect: input.effect || 'solid',
      online: true,
      wattsMax: Number(input.wattsMax) || 12,
    };

    const existingIdx = state.lights.findIndex((l) => l.id === id);
    if (existingIdx >= 0) {
      state.lights[existingIdx] = { ...state.lights[existingIdx], ...lightObj };
    } else {
      state.lights.push(lightObj);
    }
    const cmd = buildProtocolCommand(lightObj);
    const netRes = await dispatchLightCommandOnLan(cmd, skipLanNetwork);
    recordProtocolEvent(lightObj, cmd, netRes);
    saveState();

    return {
      ok: true,
      light: lightObj,
      overview: getOverview(),
    };
  }

  function removeLight(lightId) {
    const before = state.lights.length;
    state.lights = state.lights.filter((l) => l.id !== lightId);
    saveState();
    return {
      ok: state.lights.length < before,
      overview: getOverview(),
    };
  }

  async function applyScene(sceneId, roomScopeOverride = null) {
    const allScenes = [...BUILTIN_SCENES, ...state.customScenes];
    const scene = allScenes.find((s) => s.id === sceneId);
    if (!scene) {
      return { ok: false, error: `Scene "${sceneId}" not found.` };
    }
    const scope = roomScopeOverride || scene.roomScope || 'all';
    const preset = scene.preset || {};
    state.activeSceneId = scene.id;

    for (const light of state.lights) {
      if (scope !== 'all' && light.roomId !== scope) continue;
      if (preset.keepNightlightRoomId && !preset.on) {
        if (light.roomId === preset.keepNightlightRoomId) {
          await updateLight(light.id, {
            on: true,
            brightness: preset.brightness || 10,
            colorMode: 'kelvin',
            kelvin: preset.kelvin || 2200,
            effect: 'solid',
          });
        } else {
          await updateLight(light.id, { on: false });
        }
        continue;
      }

      const isStripOrBar = light.formFactor === 'strip' || light.formFactor === 'bar';
      const targetColorHex =
        isStripOrBar && preset.stripColorHex ? preset.stripColorHex : preset.colorHex || '#00bcd4';
      const targetMode =
        isStripOrBar && preset.stripColorHex ? 'rgb' : preset.colorMode || 'kelvin';

      await updateLight(light.id, {
        on: preset.on !== false,
        brightness: preset.brightness ?? 80,
        colorMode: targetMode,
        kelvin: preset.kelvin ?? 4000,
        colorHex: targetColorHex,
        effect: isStripOrBar ? preset.effect || 'solid' : 'solid',
      });
    }

    saveState();
    return {
      ok: true,
      scene,
      overview: getOverview(),
    };
  }

  function saveCustomScene(input = {}) {
    const name = String(input.name || '').trim();
    if (!name) {
      return { ok: false, error: 'Scene name is required.' };
    }
    const roomScope = input.roomScope || 'all';
    const refLight =
      state.lights.find((l) => l.on && (roomScope === 'all' || l.roomId === roomScope)) ||
      state.lights[0] ||
      DEFAULT_LIGHTS[0];
    const stripLight =
      state.lights.find((l) => l.formFactor === 'strip' && l.on) || refLight;

    const scene = {
      id: `scene-custom-${Date.now()}`,
      name,
      icon: input.icon || '✨',
      badge: input.badge || 'Custom Saved Scene',
      description:
        input.description ||
        `Captured live lighting state (${refLight.brightness}% brightness, ${refLight.kelvin}K).`,
      roomScope,
      isCustom: true,
      preset: {
        on: true,
        brightness: refLight.brightness,
        colorMode: refLight.colorMode,
        kelvin: refLight.kelvin,
        colorHex: refLight.colorHex,
        stripColorHex: stripLight.colorHex,
        effect: stripLight.effect || 'solid',
      },
    };
    state.customScenes.unshift(scene);
    state.activeSceneId = scene.id;
    saveState();
    return {
      ok: true,
      scene,
      overview: getOverview(),
    };
  }

  async function designSceneWithAi({ prompt, roomScope = 'all' } = {}) {
    const text = String(prompt || '').trim();
    if (!text) {
      return { ok: false, error: 'Describe a lighting mood or scene first.' };
    }

    // Optional AI call through robos-lib/ai-agent if enabled & non-test; always falls back cleanly
    let aiScene = null;
    if (!skipLanNetwork && process.env.ROBOS_SMART_LIGHT_USE_CLI_AI === '1') {
      try {
        const aiAgent = require('./ai-agent');
        const askRes = await aiAgent.ask(
          `Return ONLY valid JSON for a smart light scene matching "${text}": {"name":"...","primaryHex":"#RRGGBB","secondaryHex":"#RRGGBB","kelvin":4000,"brightness":80,"effect":"aurora"}`
        );
        const match = String(askRes?.text || askRes || '').match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.primaryHex) {
            aiScene = {
              id: `scene-ai-${Date.now()}`,
              name: `✨ ${parsed.name || text}`,
              icon: '🪄',
              badge: 'AI Designed Scene',
              description: `AI lighting palette for "${text}" (${parsed.primaryHex} / ${parsed.secondaryHex}).`,
              roomScope,
              isCustom: true,
              preset: {
                on: true,
                brightness: clamp(parsed.brightness || 80, 10, 100),
                colorMode: 'rgb',
                kelvin: clamp(parsed.kelvin || 4000, 2000, 6500),
                colorHex: parsed.secondaryHex || parsed.primaryHex,
                stripColorHex: parsed.primaryHex,
                effect: parsed.effect || 'aurora',
              },
            };
          }
        }
      } catch {}
    }

    if (!aiScene) {
      aiScene = synthesizeDeterministicMoodScene(text, roomScope);
      aiScene.isCustom = true;
    }

    state.customScenes.unshift(aiScene);
    await applyScene(aiScene.id, roomScope);
    return {
      ok: true,
      scene: aiScene,
      overview: getOverview(),
    };
  }

  async function applyCircadianHour(hourFloat = null, toggleAuto = null) {
    if (toggleAuto !== null && toggleAuto !== undefined) {
      state.circadianEnabled = Boolean(toggleAuto);
    }
    const targetHour =
      hourFloat !== null && hourFloat !== undefined
        ? Number(hourFloat)
        : new Date().getHours() + new Date().getMinutes() / 60;
    const target = computeCircadianTarget(targetHour);

    for (const light of state.lights) {
      if (!light.on) continue;
      await updateLight(light.id, {
        on: true,
        brightness: target.brightness,
        colorMode: 'kelvin',
        kelvin: target.kelvin,
        colorHex: target.colorHex,
      });
    }
    saveState();
    return {
      ok: true,
      circadianTarget: target,
      overview: getOverview(),
    };
  }

  function addOrUpdateSchedule(schedInput = {}) {
    const name = String(schedInput.name || '').trim();
    if (!name) return { ok: false, error: 'Schedule name is required.' };
    const id = schedInput.id || `sched-${Date.now()}`;
    const item = {
      id,
      name,
      time: schedInput.time || '07:30',
      days: Array.isArray(schedInput.days) && schedInput.days.length
        ? schedInput.days
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      roomScope: schedInput.roomScope || 'all',
      sceneId: schedInput.sceneId || 'scene-deep-focus',
      fadeMinutes: clamp(schedInput.fadeMinutes ?? 15, 0, 60),
      enabled: schedInput.enabled !== false,
      lastTriggeredAt: schedInput.lastTriggeredAt || null,
    };
    const idx = state.schedules.findIndex((s) => s.id === id);
    if (idx >= 0) {
      state.schedules[idx] = item;
    } else {
      state.schedules.push(item);
    }
    saveState();
    return { ok: true, schedule: item, overview: getOverview() };
  }

  function removeSchedule(scheduleId) {
    state.schedules = state.schedules.filter((s) => s.id !== scheduleId);
    saveState();
    return { ok: true, overview: getOverview() };
  }

  async function triggerScheduleNow(scheduleId) {
    const sched = state.schedules.find((s) => s.id === scheduleId);
    if (!sched) return { ok: false, error: 'Schedule not found.' };
    sched.lastTriggeredAt = new Date().toISOString();
    await applyScene(sched.sceneId, sched.roomScope);
    saveState();
    return { ok: true, schedule: sched, overview: getOverview() };
  }

  async function triggerCiStatusLight({ status = 'passing', targetLightId = null, enabled = null } = {}) {
    if (targetLightId) state.ciSync.targetLightId = targetLightId;
    if (enabled !== null && enabled !== undefined) state.ciSync.enabled = Boolean(enabled);
    const statusDef = CI_STATUS_STATES[status] || CI_STATUS_STATES.passing;
    state.ciSync.currentStatus = statusDef.id;
    state.ciSync.lastSyncedAt = new Date().toISOString();

    const targetId = state.ciSync.targetLightId || state.lights[0]?.id;
    let lightRes = null;
    if (targetId) {
      lightRes = await updateLight(targetId, {
        on: true,
        brightness: statusDef.brightness,
        colorMode: 'rgb',
        colorHex: statusDef.colorHex,
        effect: statusDef.effect,
      });
    }
    saveState();
    return {
      ok: true,
      ciStatus: statusDef,
      lightResult: lightRes,
      overview: getOverview(),
    };
  }

  async function scanLanForLights(timeoutMs = 350) {
    const discovered = [];
    if (!skipLanNetwork) {
      // Broadcast WiZ getPilot & Kasa get_sysinfo over UDP
      await new Promise((resolve) => {
        const sock = dgram.createSocket('udp4');
        const timer = setTimeout(() => {
          try {
            sock.close();
          } catch {}
          resolve();
        }, timeoutMs);
        sock.on('error', () => {
          clearTimeout(timer);
          try {
            sock.close();
          } catch {}
          resolve();
        });
        sock.on('message', (msg, rinfo) => {
          try {
            if (rinfo.port === 38899) {
              const j = JSON.parse(msg.toString('utf8'));
              if (j && j.result) {
                discovered.push({
                  ip: rinfo.address,
                  port: 38899,
                  protocolId: 'wiz-udp',
                  name: `WiZ Smart Bulb (${rinfo.address})`,
                  on: Boolean(j.result.state),
                  brightness: j.result.dimming || 80,
                });
              }
            } else if (rinfo.port === 9999) {
              const j = JSON.parse(decodeKasaXorPayload(msg, false));
              const sys = j?.system?.get_sysinfo;
              if (sys) {
                discovered.push({
                  ip: rinfo.address,
                  port: 9999,
                  protocolId: 'kasa-lan',
                  name: sys.alias || `Kasa Smart Bulb (${rinfo.address})`,
                  on: Boolean(sys.light_state?.on_off),
                  brightness: sys.light_state?.brightness || 80,
                });
              }
            }
          } catch {}
        });
        sock.bind(0, () => {
          try {
            sock.setBroadcast(true);
            const wizProbe = Buffer.from(JSON.stringify({ method: 'getPilot', params: {} }));
            sock.send(wizProbe, 38899, '255.255.255.255');
            const kasaProbe = encodeKasaXorPayload(JSON.stringify({ system: { get_sysinfo: {} } }), false);
            sock.send(kasaProbe, 9999, '255.255.255.255');
          } catch {}
        });
      });
    }

    for (const d of discovered) {
      const exists = state.lights.find((l) => l.ip === d.ip && l.protocolId === d.protocolId);
      if (!exists) {
        await addOrUpdateLight(d);
      } else {
        exists.online = true;
      }
    }
    saveState();
    return {
      ok: true,
      discoveredCount: discovered.length,
      totalPaired: state.lights.length,
      overview: getOverview(),
    };
  }

  async function pairHueBridge({ bridgeIp = '192.168.1.87' } = {}) {
    let generatedKey = `robos-hue-${Math.random().toString(36).slice(2, 10)}`;
    let livePaired = false;
    if (!skipLanNetwork) {
      const res = await sendHttpLightRequest(
        {
          ip: bridgeIp,
          port: 80,
          path: '/api',
          method: 'POST',
          bodyObj: { devicetype: 'robos#smart-light' },
        },
        500
      );
      if (res.ok && res.responseText) {
        try {
          const parsed = JSON.parse(res.responseText);
          const username = parsed?.[0]?.success?.username;
          if (username) {
            generatedKey = username;
            livePaired = true;
          }
        } catch {}
      }
    }

    // Update any Hue lights on that IP with the new bridge key
    for (const light of state.lights) {
      if (light.protocolId === 'hue-rest') {
        const idx = String(light.deviceKey || '1').split('|').pop() || '1';
        light.ip = bridgeIp;
        light.deviceKey = `${generatedKey}|${idx}`;
      }
    }
    saveState();
    return {
      ok: true,
      bridgeIp,
      hueUsername: generatedKey,
      livePaired,
      overview: getOverview(),
    };
  }

  // ── Local Control REST API Server (:19219) ───────────────────────────────
  function startApiServer() {
    if (apiServer) return Promise.resolve({ ok: true, port: apiPort });
    return new Promise((resolve) => {
      const srv = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        const u = new URL(req.url || '/', `http://127.0.0.1:${apiPort}`);
        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/api/overview')) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(getOverview()));
          return;
        }

        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', async () => {
          let body = {};
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (raw) body = JSON.parse(raw);
          } catch {}

          if (req.method === 'POST' && u.pathname === '/api/scene') {
            const out = await applyScene(body.sceneId, body.roomScope);
            res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
            return;
          }
          if (req.method === 'POST' && u.pathname === '/api/light') {
            const out = await updateLight(body.lightId, body);
            res.writeHead(out.ok ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
            return;
          }
          if (req.method === 'POST' && u.pathname === '/api/ci-status') {
            const out = await triggerCiStatusLight(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(out));
            return;
          }
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
        });
      });

      const onListening = () => {
        apiPort = srv.address().port;
        apiServer = srv;
        resolve({ ok: true, port: apiPort });
      };

      srv.once('error', () => {
        srv.removeListener('listening', onListening);
        // Fallback to ephemeral port if 19219 is busy
        srv.listen(0, '127.0.0.1', onListening);
      });

      srv.listen(apiPort, '127.0.0.1', onListening);
    });
  }

  function stopApiServer() {
    if (!apiServer || !apiServer.listening) {
      apiServer = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const s = apiServer;
      apiServer = null;
      s.close(() => resolve());
    });
  }

  return {
    getOverview,
    updateLight,
    setRoomState,
    addOrUpdateLight,
    removeLight,
    applyScene,
    saveCustomScene,
    designSceneWithAi,
    applyCircadianHour,
    addOrUpdateSchedule,
    removeSchedule,
    triggerScheduleNow,
    triggerCiStatusLight,
    scanLanForLights,
    pairHueBridge,
    startApiServer,
    stopApiServer,
  };
}

module.exports = {
  DEFAULT_API_PORT,
  LIGHT_PROTOCOLS,
  WLED_EFFECTS,
  DEFAULT_ROOMS,
  DEFAULT_LIGHTS,
  BUILTIN_SCENES,
  CI_STATUS_STATES,
  hexToRgb,
  rgbToHex,
  rgbToHsv,
  kelvinToHex,
  computeCircadianTarget,
  encodeKasaXorPayload,
  decodeKasaXorPayload,
  buildLifxPacket,
  buildLifxSetColorPacket,
  buildProtocolCommand,
  synthesizeDeterministicMoodScene,
  createSmartLightEngine,
};
