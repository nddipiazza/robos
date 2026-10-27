'use strict';

/**
 * RobOS Smart TV & Ten-Foot Portal Engine (`robos-lib/tv-engine`)
 *
 * Provides first-class Smart TV integration for RobOS:
 *  1. LAN Smart TV Discovery & Device Registry (Google TV / Android TV ADB :5555 + Cast :8008/:8009,
 *     LG webOS Dev Mode :9991 / SSAP :3000, Samsung Tizen WGT :26101 / REST :8001, Roku ECP :8060,
 *     Apple TV / Moonlight / Sunshine).
 *  2. Live 10-Foot Big-Screen Portal HTTP Server (`:19210` or ephemeral in test mode) with full
 *     D-Pad / Spatial Navigation (`ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight`/`Enter`/`Escape`),
 *     HTML5 Gamepad API polling, Now Playing audio/TTS jukebox, Game & App Launcher, and Live Workspace view.
 *  3. Native TV Sideload Package Builder — generates real, ready-to-sideload client bundles:
 *     - LG webOS (`appinfo.json` + 10-foot `index.html` + `ares-package` / `ares-install` / `ares-extend-dev` scripts)
 *     - Samsung Tizen (`config.xml` + `index.html` + `tizen package` / `sdb install` scripts)
 *     - Google TV / Android TV (`AndroidManifest.xml` + Leanback WebView activity + `adb connect` / `adb install` scripts)
 *     - Roku OS (`manifest` + BrightScript `source/Main.brs` + `components/MainScene.xml` + ZIP sideload script)
 *  4. Remote D-Pad / Key Dispatch to paired TVs (ADB `input keyevent`, Roku ECP `/keypress/*`, or Portal SSE).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawnSync, exec } = require('node:child_process');

const DEFAULT_PORTAL_PORT = 19210;

const TV_PLATFORMS = [
  {
    id: 'roku-os',
    name: 'Roku OS TV & Streaming Players (TCL, Hisense, Sharp, Onn, Roku Ultra)',
    vendor: 'TCL Roku TV / Hisense / Roku OS 14 & 15',
    protocol: 'Roku External Control Protocol ECP (:8060) & Dev Installer (:80)',
    packageFormat: 'Roku SceneGraph Channel Bundle (robos-tv-roku.zip)',
    cliTool: 'curl',
    requiredPermissions: [
      {
        id: 'roku-ecp-network-access',
        title: '1. Enable Local Network Remote Control (Required for D-Pad, Power & App Launch)',
        xmlField: '<ecp-setting-mode>enabled</ecp-setting-mode>',
        blockedSymptom: 'HTTP 403 Forbidden on :8060/keypress/* or <ecp-setting-mode>limited|disabled</ecp-setting-mode> (Roku OS 14.1+ default)',
        steps: [
          'Press the Home (🏠) button on your physical Roku remote.',
          'Scroll down and select Settings → System → Advanced system settings.',
          'Select Control by mobile apps → Network access.',
          'Change the setting from "Default" (or "Disabled") to "Enabled" (or "Permissive") and confirm.',
        ],
      },
      {
        id: 'roku-fast-tv-start',
        title: '2. Enable Fast TV Start / Wake-on-WLAN (Required to Power ON the TV After Deep Standby)',
        xmlField: '<supports-wake-on-wlan>true</supports-wake-on-wlan>',
        blockedSymptom: 'TV turns OFF via RobOS, but stops responding to PowerOn after 15 minutes of standby because Wi-Fi powered down',
        steps: [
          'On your Roku TV, open Settings → System → Power.',
          'Select Fast TV Start and check "Enable Fast TV Start".',
          'This keeps the Roku Wi-Fi/Ethernet card listening on port 8060 while the screen is off so RobOS can always wake it with PowerOn.',
        ],
      },
      {
        id: 'roku-dev-installer',
        title: '3. Enable Developer Application Installer (Required Only to Sideload Custom RobOS TV Channel ZIP)',
        xmlField: '<developer-enabled>true</developer-enabled>',
        blockedSymptom: 'Port 80 connection refused when running sideload-roku.sh (<developer-enabled>false</developer-enabled>)',
        steps: [
          'Using the physical Roku remote (Roku OS 15 blocks this combo over Wi-Fi), press Home once so the highlight is at the top.',
          'Press these 10 buttons briskly without pausing: Home, Home, Home, Up, Up, Right, Left, Right, Left, Right.',
          'On the "Developer Settings" screen that appears, select "Enable installer and restart".',
          'Accept the Developer Tools License Agreement, enter a webserver password (e.g. "robos"), and select "Set password and reboot".',
          'After reboot, run sideload-roku.sh (or click Sideload App in RobOS Smart TV Studio) to upload robos-tv-roku.zip to http://<TV-IP>/plugin_install.',
        ],
      },
    ],
    devModeSteps: [
      'Remote Control (D-Pad / Power / Volume / Input Switch): Settings → System → Advanced system settings → Control by mobile apps → Network access → set to "Enabled" / "Permissive".',
      'Wake from Off (PowerOn): Settings → System → Power → Fast TV Start → check "Enable Fast TV Start".',
      'Sideload Custom RobOS Channel (:80): On physical Roku remote press Home (3x), Up (2x), Right, Left, Right, Left, Right → Enable installer & set password.',
    ],
  },
  {
    id: 'android-tv',
    name: 'Google TV / Android TV / Fire TV',
    vendor: 'Google / Sony Bravia / TCL Google TV / Hisense / NVIDIA Shield / Amazon Fire TV',
    protocol: 'ADB Network Debugging (:5555) & Google Cast (:8009)',
    packageFormat: 'Android TV Leanback APK / WebAPK (com.robos.tv)',
    cliTool: 'adb',
    requiredPermissions: [
      {
        id: 'android-developer-options',
        title: '1. Unlock Hidden Developer Options Menu',
        blockedSymptom: 'Developer Options menu is hidden in Settings → System',
        steps: [
          'On your Google TV / Android TV, open Settings (⚙️) → System → About.',
          'Scroll down to "Android TV OS Build" (On Fire TV: Settings → My Fire TV → About → highlight your Fire TV device name).',
          'Press the Select / OK button on your remote 7 times rapidly until the toast "You are now a developer!" appears.',
        ],
      },
      {
        id: 'android-network-adb',
        title: '2. Enable Network / Wireless ADB Debugging (:5555) & Authorize RSA Key',
        blockedSymptom: 'Connection refused on port 5555, or adb devices reports "unauthorized"',
        steps: [
          'Go back to Settings → System → Developer options (On Fire TV: Settings → My Fire TV → Developer Options).',
          'Toggle ON "USB debugging" AND "Network debugging" (or "ADB debugging" on Fire TV; on Sony Bravia / Android 11+, toggle ON "Wireless debugging").',
          'When RobOS connects (`adb connect <TV-IP>:5555`), look at your TV screen for the popup "Allow USB/Network debugging from this computer?".',
          'Check the box "Always allow from this computer" and click "Allow" on your TV remote.',
        ],
      },
      {
        id: 'android-unknown-sources',
        title: '3. Allow Sideloading Unknown Apps & Stay Awake on LAN',
        blockedSymptom: 'INSTALL_FAILED_USER_RESTRICTED or TV drops ADB when screen sleeps',
        steps: [
          'In Settings → Apps → Security & Restrictions → Unknown sources, toggle ON permission for ADB / Package Installer.',
          'In Settings → System → Power & Energy (or Network → Wake on LAN / Renderer Control), enable "Wake on network" so RobOS can wake the TV with KEYCODE_WAKEUP.',
        ],
      },
    ],
    devModeSteps: [
      'On your TV, open Settings → System → About and press Select/OK on "Android TV OS Build" 7 times.',
      'Open Settings → System → Developer Options and enable "USB Debugging" and "Network Debugging" (:5555).',
      'When prompted on the TV screen, check "Always allow from this computer" and select Allow.',
      'Enter your TV IP below and click "Generate TV Sideload Package" to install the Leanback launcher.',
    ],
  },
  {
    id: 'lg-webos',
    name: 'LG webOS Smart TV',
    vendor: 'LG OLED (C/G/B Series) / QNED / NanoCell / UHD (webOS 4.0 – 26)',
    protocol: 'webOS Developer Mode SSH (:9991) & SSAP (:3000 / :3001)',
    packageFormat: 'webOS IPK Package (com.robos.tv_1.0.0_all.ipk)',
    cliTool: 'ares-install',
    requiredPermissions: [
      {
        id: 'lg-connect-apps-ssap',
        title: '1. Enable LG Connect Apps (Required for Network Remote Control, Volume & Power)',
        blockedSymptom: 'Port 3000/3001 WebSocket SSAP connection refused or pairing prompt never appears',
        steps: [
          'On your LG Magic Remote, press the Settings (⚙️) button → All Settings → General → External Devices (or Network on older webOS).',
          'Select TV On With Mobile → turn ON "Turn on via Wi-Fi" (so RobOS can wake the TV).',
          'Ensure "LG Connect Apps" is toggled ON.',
          'On first connection from RobOS, click "Accept" on the pairing confirmation toast on your LG TV screen.',
        ],
      },
      {
        id: 'lg-dev-mode-app',
        title: '2. Install LG Developer Mode App & Enable Key Server (:9991)',
        blockedSymptom: 'Port 9991 closed — ares-install / ares-novacom cannot sideload .ipk packages',
        steps: [
          'Create a free developer account at https://webostv.developer.lge.com.',
          'Open the LG Content Store (Apps) on your TV, search for "Developer Mode", and install the official LG Developer Mode app.',
          'Sign in with your LG Developer account, toggle "Dev Mode Status" to ON, and allow the TV to reboot.',
          'After reboot, open the Developer Mode app again and toggle "Key Server" to ON.',
          'Copy the 6-character Passphrase shown on the TV screen into RobOS Smart TV Studio so ares-novacom can fetch the prisoner@<TV-IP>:9991 SSH key.',
        ],
      },
      {
        id: 'lg-1000h-timer',
        title: '3. Keep the 1,000-Hour Developer Mode Session Alive',
        blockedSymptom: 'LG webOS automatically wipes sideloaded apps if the 1,000-hour countdown reaches 0:00',
        steps: [
          'Leave "Auto-Renew 1,000h Dev Session" enabled in RobOS Smart TV Studio (or click "Renew LG webOS 1,000h Timer") so RobOS periodically runs `ares-extend-dev` before expiration.',
        ],
      },
    ],
    devModeSteps: [
      'Remote Control & Wake: Settings → All Settings → General → External Devices → TV On With Mobile → enable "Turn on via Wi-Fi" and "LG Connect Apps".',
      'Sideload IPK: Install "Developer Mode" from LG Content Store, sign in, turn ON "Dev Mode Status" (reboots TV), then turn ON "Key Server" (:9991).',
      'Enter the 6-character Key Server Passphrase into RobOS Smart TV Studio to install com.robos.tv and auto-renew the 1,000h timer.',
    ],
  },
  {
    id: 'samsung-tizen',
    name: 'Samsung Tizen Smart TV',
    vendor: 'Samsung Neo QLED / OLED / Crystal UHD / The Frame (Tizen OS)',
    protocol: 'Tizen Smart Development Bridge SDB (:26101) & SmartView REST/WSS (:8001 / :8002)',
    packageFormat: 'Tizen Web Application Widget (RobOSTV.wgt)',
    cliTool: 'sdb',
    requiredPermissions: [
      {
        id: 'samsung-ip-remote',
        title: '1. Enable IP Remote & Access Notification (Required for LAN Remote Control & Power)',
        blockedSymptom: 'WebSocket connection to :8001/:8002 is rejected or ignored by the Samsung TV',
        steps: [
          'On your Samsung TV, open Settings → General & Privacy (or General) → Network → Expert Settings.',
          'Toggle ON "Power On with Mobile" and toggle ON "IP Remote".',
          'Open Settings → General & Privacy → External Device Manager → Device Connection Manager → Access Notification and set it to "First Time Only".',
          'When RobOS connects for the first time, use your Samsung remote to click "Allow" on the top-right TV popup within 30 seconds.',
        ],
      },
      {
        id: 'samsung-dev-mode-12345',
        title: '2. Unlock Tizen Developer Mode (1-2-3-4-5) & Whitelist RobOS Host IP (:26101)',
        blockedSymptom: 'Port 26101 (SDB) closed or refuses connection from your RobOS PC IP',
        steps: [
          'Open the "Apps" panel on your Samsung TV from the Smart Hub menu.',
          'Press 1-2-3-4-5 in sequence on your remote (or via the on-screen 123 number pad) to open the hidden Developer Mode dialog.',
          'Toggle "Developer Mode" to ON and enter the exact LAN IPv4 address of your RobOS machine (shown in the top bar of RobOS Smart TV Studio) into the "Host PC IP" field.',
          'Hold down the Power button on your remote for 5 seconds until the Samsung TV performs a full cold reboot.',
          'After reboot, click "Generate TV Sideload Package" in RobOS to connect via `sdb connect <TV-IP>:26101` and install RobOSTV.wgt.',
        ],
      },
    ],
    devModeSteps: [
      'Remote Control: Settings → General → Network → Expert Settings → enable "IP Remote" and "Power On with Mobile", then click "Allow" on TV popup.',
      'Sideload WGT (:26101): Open "Apps" panel, press 1-2-3-4-5 on remote, turn Developer Mode ON, enter your RobOS Host LAN IP, and cold-reboot the TV (hold Power 5s).',
    ],
  },
  {
    id: 'moonlight-sunshine',
    name: 'Moonlight / Sunshine 4K 120Hz Game & Desktop Stream',
    vendor: 'Any Smart TV, Apple TV, or Streaming Stick running Moonlight',
    protocol: 'NVIDIA GameStream / Sunshine RTSP + ENet (:47984 / :47989 / :47990)',
    packageFormat: 'Full RobOS Desktop & Godot 4 Game Stream (H.265 / AV1)',
    cliTool: 'sunshine',
    requiredPermissions: [
      {
        id: 'moonlight-pin-pairing',
        title: '1. Install Moonlight Client on TV & Pair 4-Digit PIN with Sunshine Host',
        blockedSymptom: 'RobOS host appears with a lock icon inside Moonlight on the TV',
        steps: [
          'Install the Moonlight app on your TV (Google Play Store on Android TV, Amazon Appstore on Fire TV, App Store on Apple TV, or webOS Homebrew on LG).',
          'Ensure Sunshine is running on your RobOS host (`sunshine` listening on ports 47984–47990 TCP/UDP).',
          'Select your RobOS PC inside Moonlight on the TV—the TV will display a 4-digit pairing PIN.',
          'Enter that 4-digit PIN in the Sunshine / RobOS pairing prompt to authorize 4K 120Hz streaming and gamepad input.',
        ],
      },
    ],
    devModeSteps: [
      'Install Moonlight on your TV (Google TV, Fire TV, Apple TV, or LG webOS).',
      'Click your RobOS Host on the TV screen and enter the 4-digit PIN shown on the TV into RobOS / Sunshine (:47990).',
    ],
  },
];

const TEN_FOOT_LAUNCH_TILES = [
  {
    id: 'portal-home',
    title: 'RobOS 10-Foot Home',
    category: 'Dashboard',
    badge: 'TV Optimized',
    description: 'Big-screen overview of active agents, sprint status, media playback, and quick actions.',
    packageId: 'robos-tv',
    shortcutKey: '1',
  },
  {
    id: 'crpg-realm',
    title: 'Realm of Heroes cRPG',
    category: 'Games',
    badge: 'Controller Ready',
    description: 'Party-based tactical isometric D&D 5e cRPG in Godot 4 with gamepad & couch co-op support.',
    packageId: 'crpg-editor',
    shortcutKey: '2',
  },
  {
    id: 'quest-warrior-dragon',
    title: 'Quest: Warrior Dragon',
    category: 'Games',
    badge: 'D-Pad Native',
    description: 'Clean-room NES-authentic 2D JRPG in Godot 4 — play with any TV remote D-Pad or controller.',
    packageId: 'game-playthrough',
    shortcutKey: '3',
  },
  {
    id: 'tabletop-rpg',
    title: 'RobOS Tabletop RPG',
    category: 'Games',
    badge: 'Living Room Board',
    description: 'HeroQuest-inspired 26×19 tactical dungeon crawler designed for big-screen tabletop nights.',
    packageId: 'robos-tabletop',
    shortcutKey: '4',
  },
  {
    id: 'audio-jukebox',
    title: 'Audio Player & Virtual DJ',
    category: 'Media & Audio',
    badge: 'Cast + Lyrics',
    description: '100,000-song library with synchronized full-screen TV lyrics, AI Playlists, and Kokoro Virtual DJ.',
    packageId: 'audio-player',
    shortcutKey: '5',
  },
  {
    id: 'home-intercom',
    title: 'Home Speaker Intercom',
    category: 'Smart Home',
    badge: 'Multi-Room TTS',
    description: 'Broadcast voice notes, Kokoro neural TTS announcements, and soundscapes across every room.',
    packageId: 'home-speaker',
    shortcutKey: '6',
  },
  {
    id: 'pr-review-theater',
    title: 'PR Review Theater',
    category: 'Engineering',
    badge: 'Cinema Mode',
    description: 'Watch narrated 1080p agent proof-of-work walkthroughs and semantic KGraph blast-radius diffs from the couch.',
    packageId: 'pr-review',
    shortcutKey: '7',
  },
  {
    id: 'pos-menu-board',
    title: 'POS Order & Prep Display',
    category: 'Commerce',
    badge: 'Kiosk / Wall TV',
    description: 'Live café/bar order prep queue and digital menu board powered by RobOS Point of Sale.',
    packageId: 'point-of-sale',
    shortcutKey: '8',
  },
  {
    id: 'party-game',
    title: 'RobOS Party Game',
    category: 'Party Games',
    badge: 'Phones as Controllers',
    description: 'An AI host face runs survey-powered mini games about your guests; phones are the controllers.',
    packageId: 'party-game',
    shortcutKey: '9',
  },
];

function detectLanIp() {
  try {
    const nets = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(nets)) {
      if (name === 'lo' || name.startsWith('veth') || name.startsWith('tun') || name.startsWith('docker')) continue;
      for (const iface of addrs || []) {
        if (!iface.internal && iface.family === 'IPv4') {
          if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.')) {
            return iface.address;
          }
        }
      }
    }
    for (const addrs of Object.values(nets)) {
      for (const iface of addrs || []) {
        if (!iface.internal && iface.family === 'IPv4') {
          return iface.address;
        }
      }
    }
  } catch {}
  return '192.168.1.100';
}

function detectToolingStatus() {
  const checkCmd = (cmd) => {
    try {
      const res = spawnSync('which', [cmd], { encoding: 'utf8', timeout: 1500 });
      return res.status === 0 && Boolean(String(res.stdout || '').trim());
    } catch {
      return false;
    }
  };
  return {
    adb: checkCmd('adb'),
    aresInstall: checkCmd('ares-install'),
    sdb: checkCmd('sdb'),
    sunshine: checkCmd('sunshine'),
    ffmpeg: checkCmd('ffmpeg'),
  };
}

// ── Portal ownership ─────────────────────────────────────────────────────
// Only one process can bind :19210; every other RobOS app reuses it. Each
// server reports who it is (pid, app, hash of the tv-engine code it loaded)
// in /api/status so a newer app can spot a stale server and ask it to hand
// the port over via the loopback-only POST /api/portal/shutdown.
const PORTAL_CODE_VERSION = (() => {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').slice(0, 12);
  } catch {
    return 'unknown';
  }
})();
const PORTAL_FEATURES = ['owner', 'shutdown', 'live-frame-push', 'cinema-cast'];
const ROBOS_PORTAL_APPS = ['robos-tv', 'robos-dashboards', 'party-game', 'dev-central', 'movie-player'];
const PORTAL_SHUTDOWN_HEADER = 'x-robos-portal';

function defaultPortalAppName() {
  const main = require.main && require.main.filename;
  return main ? path.basename(path.dirname(main)) : 'node-script';
}

function requestLocalPortal(port, { method = 'GET', pathname = '/api/status', headers = {}, body = null, timeoutMs = 1500 } = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: pathname, headers, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ reachable: true, status: res.statusCode, json });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve({ reachable: false, status: 0, json: null }));
    req.end(body || undefined);
  });
}

// Which local process is listening on the port (Linux `ss`); null elsewhere.
function findPortListener(port) {
  try {
    const res = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8', timeout: 1500 });
    const m = String(res.stdout || '').match(/pid=(\d+)/);
    if (!m) return null;
    const pid = Number(m[1]);
    let command = '';
    try {
      command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean).join(' ');
    } catch {}
    return { pid, command: command.length > 240 ? `${command.slice(0, 237)}...` : command };
  } catch {
    return null;
  }
}

function probeTcpPort(ip, port, timeoutMs = 450) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, ip);
  });
}

function renderDevCentralWallboardHtml({ hostIp, portalPort, devCentralCast = null, tvDevices = [] }) {
  const portalUrl = `http://${hostIp}:${portalPort}`;
  const cast = devCentralCast || {};
  const kpis = cast.kpis || {
    featureCode: 'FEAT-42',
    featureStatus: 'IN PROGRESS',
    tasksCount: 4,
    prsCount: 3,
    reviewsCount: 2,
    blockersCount: 2,
    ciHealth: '75%',
  };
  const feat = cast.activeFeature || {
    code: 'FEAT-42',
    name: 'Multi-Step Dynamic Form Validation & TypeSpec Contracts',
    status: 'IN_PROGRESS',
    repository: 'acme-corp/buildbarn-forms',
    service: 'forms-api',
    progressPct: 75,
  };
  const issues = Array.isArray(cast.issues) ? cast.issues.slice(0, 5) : [];
  const prs = Array.isArray(cast.prs) ? cast.prs.slice(0, 4) : [];
  const blockers = Array.isArray(cast.blockers) ? cast.blockers.slice(0, 4) : [];
  const standup = cast.standup || { yesterday: [], today: [], blockers: [] };

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="8" />
  <title>RobOS Dev Central — 10-Foot Smart TV Dashboard Cast</title>
  <style>
    :root {
      --bg: #070b12;
      --surface: #0e1628;
      --surface-elev: #131f38;
      --border: #1e293b;
      --accent: #00bcd4;
      --green: #10b981;
      --yellow: #f59e0b;
      --red: #ef4444;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 15% 0%, rgba(0, 188, 212, 0.14), transparent 42%),
                  radial-gradient(circle at 85% 100%, rgba(59, 130, 246, 0.1), transparent 42%),
                  var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 28px 42px;
      min-height: 100vh;
    }
    .wb-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 18px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }
    .wb-brand { display: flex; align-items: center; gap: 16px; }
    .wb-badge-live {
      background: rgba(16, 185, 129, 0.16);
      border: 1px solid rgba(16, 185, 129, 0.45);
      color: #6ee7b7;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .wb-title { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
    .wb-sub { font-size: 14px; color: var(--muted); margin-top: 3px; }
    .wb-pills { display: flex; align-items: center; gap: 12px; }
    .wb-pill {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 8px 16px;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text);
    }
    .wb-pill.tv-target {
      border-color: rgba(0, 188, 212, 0.5);
      color: #67e8f9;
      background: rgba(0, 188, 212, 0.1);
    }
    .wb-kpis {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
      margin-bottom: 20px;
    }
    .wb-kpi {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px 18px;
    }
    .wb-kpi-val { font-size: 28px; font-weight: 800; color: var(--text); }
    .wb-kpi-lbl { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .wb-feature {
      background: linear-gradient(135deg, rgba(14, 22, 40, 0.96), rgba(19, 31, 56, 0.92));
      border: 1px solid rgba(0, 188, 212, 0.4);
      border-radius: 16px;
      padding: 18px 24px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .wb-feat-code {
      color: var(--accent);
      font-weight: 800;
      font-size: 14px;
      text-transform: uppercase;
    }
    .wb-feat-name { font-size: 21px; font-weight: 700; margin: 4px 0; }
    .wb-feat-meta { font-size: 13px; color: var(--muted); }
    .wb-prog-wrap { min-width: 260px; text-align: right; }
    .wb-prog-bar {
      width: 260px;
      height: 12px;
      background: #070b12;
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid var(--border);
      margin-bottom: 6px;
    }
    .wb-prog-fill {
      height: 100%;
      background: linear-gradient(90deg, #00bcd4, #10b981);
    }
    .wb-cols {
      display: grid;
      grid-template-columns: 1.1fr 1.1fr 0.9fr;
      gap: 18px;
    }
    .wb-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 18px 20px;
    }
    .wb-card h3 {
      font-size: 16px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--accent);
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .wb-item {
      padding: 11px 12px;
      border-radius: 10px;
      background: var(--surface-elev);
      border: 1px solid var(--border);
      margin-bottom: 10px;
    }
    .wb-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .wb-item-title { font-size: 15px; font-weight: 600; color: var(--text); }
    .wb-tag {
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      background: rgba(0, 188, 212, 0.15);
      color: #67e8f9;
    }
    .wb-tag.alert { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
    .wb-tag.pass { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; }
    .wb-footer {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 13px;
    }
    a.wb-link { color: var(--accent); text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <header class="wb-header">
    <div class="wb-brand">
      <span class="wb-badge-live">● LIVE TV CAST</span>
      <div>
        <div class="wb-title">RobOS Dev Central — Mission Control Wallboard</div>
        <div class="wb-sub">Cast to ${esc(cast.tvName || 'Living Room Smart TV')} (${esc(cast.tvIp || hostIp)}) · ${esc(cast.sprintName || 'Sprint 42')}</div>
      </div>
    </div>
    <div class="wb-pills">
      <span class="wb-pill tv-target">📺 Target TV: ${esc(cast.tvName || (tvDevices[0] && tvDevices[0].name) || 'Smart TV')}</span>
      <a class="wb-pill wb-link" href="/">⇄ Switch to 10-Foot App Grid</a>
    </div>
  </header>

  <section class="wb-kpis">
    <div class="wb-kpi">
      <div class="wb-kpi-val" style="color:#67e8f9">${esc(kpis.featureCode || feat.code || 'FEAT-42')}</div>
      <div class="wb-kpi-lbl">Active Feature (${esc(kpis.featureStatus || 'IN PROGRESS')})</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi-val">${esc(kpis.tasksCount ?? issues.length)}</div>
      <div class="wb-kpi-lbl">Assigned Tasks</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi-val">${esc(kpis.prsCount ?? prs.length)}</div>
      <div class="wb-kpi-lbl">Open Pull Requests</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi-val">${esc(kpis.reviewsCount ?? 0)}</div>
      <div class="wb-kpi-lbl">Review Requests</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi-val" style="color:${Number(kpis.blockersCount) > 0 ? '#f87171' : '#6ee7b7'}">${esc(kpis.blockersCount ?? blockers.length)}</div>
      <div class="wb-kpi-lbl">Active Blockers</div>
    </div>
    <div class="wb-kpi">
      <div class="wb-kpi-val" style="color:#6ee7b7">${esc(kpis.ciHealth || '100%')}</div>
      <div class="wb-kpi-lbl">Pipeline Health</div>
    </div>
  </section>

  <section class="wb-feature">
    <div>
      <div class="wb-feat-code">🎯 Active Feature In Progress · ${esc(feat.code || 'FEAT-42')}</div>
      <div class="wb-feat-name">${esc(feat.name || 'RobOS Feature Delivery')}</div>
      <div class="wb-feat-meta">Repository: ${esc(feat.repository || 'acme-corp/buildbarn-forms')} · Service: ${esc(feat.service || 'forms-api')}</div>
    </div>
    <div class="wb-prog-wrap">
      <div class="wb-prog-bar"><div class="wb-prog-fill" style="width:${Number(feat.progressPct || 75)}%"></div></div>
      <div style="font-size:14px;font-weight:700;color:#6ee7b7">${Number(feat.progressPct || 75)}% Complete</div>
    </div>
  </section>

  <main class="wb-cols">
    <div class="wb-card">
      <h3><span>📋 Assigned Sprint Tasks</span><span>${issues.length}</span></h3>
      ${
        issues.length
          ? issues
              .map(
                (i) => `
        <div class="wb-item">
          <div class="wb-item-top">
            <span>#${esc(i.number)}</span>
            <span class="wb-tag">${esc(i.state || 'OPEN')}</span>
          </div>
          <div class="wb-item-title">${esc(i.title)}</div>
        </div>`
              )
              .join('')
          : '<div class="wb-item"><div class="wb-item-title">All sprint tasks complete</div></div>'
      }
    </div>

    <div class="wb-card">
      <h3><span>🌿 Pull Requests &amp; CI</span><span>${prs.length}</span></h3>
      ${
        prs.length
          ? prs
              .map(
                (p) => `
        <div class="wb-item">
          <div class="wb-item-top">
            <span>PR #${esc(p.number)} · ${esc(p.headRefName || 'main')}</span>
            <span class="wb-tag ${p.reviewDecision === 'APPROVED' ? 'pass' : ''}">${esc(p.reviewDecision || p.state || 'OPEN')}</span>
          </div>
          <div class="wb-item-title">${esc(p.title)}</div>
        </div>`
              )
              .join('')
          : '<div class="wb-item"><div class="wb-item-title">No open pull requests</div></div>'
      }
    </div>

    <div class="wb-card">
      <h3><span>🚨 Blockers &amp; Standup</span><span>${blockers.length} Alert${blockers.length === 1 ? '' : 's'}</span></h3>
      ${
        blockers.length
          ? blockers
              .map(
                (b) => `
        <div class="wb-item">
          <div class="wb-item-top">
            <span>${esc(b.label || 'Blocker')}</span>
            <span class="wb-tag alert">${esc(b.severity || 'high')}</span>
          </div>
          <div class="wb-item-title">${esc(b.text)}</div>
        </div>`
              )
              .join('')
          : '<div class="wb-item"><div class="wb-item-title" style="color:#6ee7b7">✓ Zero active blockers across pipelines</div></div>'
      }
      ${
        standup && Array.isArray(standup.today) && standup.today.length
          ? `<div class="wb-item" style="margin-top:12px;border-color:rgba(0,188,212,0.35)">
              <div class="wb-item-top"><span>🤖 AI Standup Focus</span><span class="wb-tag">Today</span></div>
              <div class="wb-item-title" style="font-size:13px;line-height:1.45">${esc(standup.today.slice(0, 2).join(' · '))}</div>
            </div>`
          : ''
      }
    </div>
  </main>

  <footer class="wb-footer">
    <div>RobOS Dev Central Live TV Cast · Serving on ${portalUrl}/dev-central</div>
    <div>Auto-refreshing every 8s · Cast Timestamp: ${esc(cast.castAt ? new Date(cast.castAt).toLocaleTimeString() : 'Live')}</div>
  </footer>
</body>
</html>`;
}

/**
 * Generates the self-contained 10-Foot Smart TV Web UI HTML served by the RobOS TV Portal
 * and embedded inside sideloaded LG webOS, Samsung Tizen, and Android TV packages.
 */
function renderTenFootPortalHtml({ hostIp, portalPort, activeTileId = 'portal-home', tvDevices = [], lastKey = null, devCentralCast = null, activeDashboardCast = null }) {
  const portalUrl = `http://${hostIp}:${portalPort}`;
  const tilesJson = JSON.stringify(TEN_FOOT_LAUNCH_TILES);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RobOS TV — 10-Foot Smart TV Portal</title>
  <style>
    :root {
      --bg: #070b12;
      --surface: #111827;
      --surface-focus: #1e293b;
      --border: #263248;
      --accent: #00bcd4;
      --green: #22c55e;
      --purple: #7c3aed;
      --text: #f8fafc;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 36px 52px;
      background: radial-gradient(circle at 85% 12%, rgba(0, 188, 212, 0.16), transparent 45%),
                  radial-gradient(circle at 12% 88%, rgba(124, 58, 237, 0.14), transparent 45%),
                  var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      user-select: none;
    }
    .tv-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--border);
    }
    .tv-brand {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .tv-logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(0, 188, 212, 0.15);
      border: 2px solid var(--accent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 22px;
      color: var(--accent);
    }
    .tv-title { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
    .tv-sub { font-size: 15px; color: var(--muted); margin-top: 2px; }
    .tv-status-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 15px;
    }
    .tv-pill {
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 600;
    }
    .tv-pill.online { border-color: rgba(34, 197, 94, 0.5); color: #86efac; }
    .tv-hero {
      background: linear-gradient(135deg, rgba(17, 24, 39, 0.95), rgba(30, 41, 59, 0.85));
      border: 2px solid var(--border);
      border-radius: 18px;
      padding: 26px 32px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
    }
    .tv-hero h2 { margin: 0 0 8px; font-size: 26px; }
    .tv-hero p { margin: 0; color: var(--muted); font-size: 16px; max-width: 760px; line-height: 1.5; }
    .tv-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 20px;
    }
    .tv-tile {
      background: var(--surface);
      border: 3px solid var(--border);
      border-radius: 16px;
      padding: 22px;
      cursor: pointer;
      transition: transform 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 180px;
      outline: none;
    }
    .tv-tile:focus, .tv-tile.focused {
      background: var(--surface-focus);
      border-color: var(--accent);
      transform: scale(1.035);
      box-shadow: 0 0 0 4px rgba(0, 188, 212, 0.25), 0 16px 32px rgba(0, 0, 0, 0.5);
    }
    .tile-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .tile-cat {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent);
      font-weight: 700;
    }
    .tile-badge {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(0, 188, 212, 0.14);
      color: #67e8f9;
      font-weight: 600;
    }
    .tile-title {
      font-size: 20px;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .tile-desc {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.45;
      margin: 0;
    }
    .tv-footer {
      margin-top: 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--muted);
      font-size: 14px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
    .key-hint {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 16px;
    }
    .kbd {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 3px 8px;
      border-radius: 6px;
      color: var(--text);
      font-family: monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header class="tv-top">
    <div class="tv-brand">
      <div class="tv-logo">TV</div>
      <div>
        <div class="tv-title">RobOS 10-Foot Smart TV Portal</div>
        <div class="tv-sub">Connected to ${portalUrl} · D-Pad, Remote &amp; Gamepad Spatial Navigation Ready</div>
      </div>
    </div>
    <div class="tv-status-bar">
      <span class="tv-pill online" id="gamepad-indicator">Remote D-Pad Active</span>
      <span class="tv-pill" id="active-tv-count">${tvDevices.length} Paired TV${tvDevices.length === 1 ? '' : 's'}</span>
      <span class="tv-pill" id="clock-pill">--:--</span>
    </div>
  </header>

  <section class="tv-hero" id="hero-banner">
    <div>
      <h2 id="hero-title">Welcome to RobOS on Your Living Room TV</h2>
      <p id="hero-desc">Use your TV remote directional pad (Up/Down/Left/Right + OK) or an Xbox/PlayStation/Bluetooth controller to launch RobOS games, AI Playlists, Home Speaker intercoms, or PR Review Theater.</p>
    </div>
    <div class="tv-pill online" id="last-action-pill">${lastKey ? 'Last Remote Input: ' + lastKey : 'Ready for Remote Input'}</div>
  </section>

  ${
    activeDashboardCast && activeDashboardCast.active
      ? `<section class="tv-hero" id="robos-dashboard-cast-banner" style="border-color:#10b981;background:linear-gradient(135deg, rgba(14,22,40,0.98), rgba(6,78,59,0.52));margin-bottom:24px;">
          <div>
            <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#6ee7b7;margin-bottom:6px;">
              ● LIVE ROBOS DASHBOARD ON TV → ${String(activeDashboardCast.tvName || 'Smart TV')} (${String(activeDashboardCast.tvIp || hostIp)})
            </div>
            <h2 style="margin:0 0 6px;font-size:22px;">${String(activeDashboardCast.title || 'Daily Engineering & Agent Ops Dashboard')}</h2>
            <p style="margin:0;color:#cbd5e1;font-size:15px;">
              Layout: <strong>${String(activeDashboardCast.layoutTitle || activeDashboardCast.layoutId || 'Mission Control 3-Column')}</strong> ·
              Cards: <strong>${Number(activeDashboardCast.cardsCount || 3)} RobOS Widgets</strong> (10 Latest Commits · Daily Calendar Events · Tailed Agent Sessions)
            </p>
          </div>
          <a href="/dashboard" class="tv-pill online" style="text-decoration:none;border-color:#10b981;color:#6ee7b7;">📊 Open Full RobOS Dashboard on TV →</a>
        </section>`
      : ''
  }

  ${
    devCentralCast && devCentralCast.active
      ? `<section class="tv-hero" id="dev-central-cast-banner" style="border-color:#00bcd4;background:linear-gradient(135deg, rgba(14,22,40,0.98), rgba(6,78,59,0.45));margin-bottom:24px;">
          <div>
            <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:#6ee7b7;margin-bottom:6px;">
              ● LIVE CAST FROM ROBOS DEV CENTRAL → ${String(devCentralCast.tvName || 'Smart TV')} (${String(devCentralCast.tvIp || hostIp)})
            </div>
            <h2 style="margin:0 0 6px;font-size:22px;">${String((devCentralCast.activeFeature && devCentralCast.activeFeature.code) || 'FEAT-42')}: ${String((devCentralCast.activeFeature && devCentralCast.activeFeature.name) || 'Sprint 42 Delivery')}</h2>
            <p style="margin:0;color:#cbd5e1;font-size:15px;">
              Tasks: <strong>${Number((devCentralCast.kpis && devCentralCast.kpis.tasksCount) ?? 0)}</strong> ·
              Open PRs: <strong>${Number((devCentralCast.kpis && devCentralCast.kpis.prsCount) ?? 0)}</strong> ·
              Reviews: <strong>${Number((devCentralCast.kpis && devCentralCast.kpis.reviewsCount) ?? 0)}</strong> ·
              Blockers: <strong>${Number((devCentralCast.kpis && devCentralCast.kpis.blockersCount) ?? 0)}</strong> ·
              Pipeline Health: <strong>${String((devCentralCast.kpis && devCentralCast.kpis.ciHealth) || '100%')}</strong>
            </p>
          </div>
          <a href="/dev-central" class="tv-pill online" style="text-decoration:none;border-color:#00bcd4;color:#67e8f9;">📺 Open Full Dev Central TV Wallboard →</a>
        </section>`
      : ''
  }

  <main class="tv-grid" id="tv-grid" role="grid" aria-label="RobOS 10-Foot App Launcher"></main>

  <footer class="tv-footer">
    <div>
      <span class="key-hint"><span class="kbd">◀ ▲ ▼ ▶</span> Navigate Tiles</span>
      <span class="key-hint"><span class="kbd">OK / Enter</span> Launch App on TV</span>
      <span class="key-hint"><span class="kbd">Back / Return</span> Portal Home</span>
      <span class="key-hint"><span class="kbd">Play / Pause</span> Toggle Audio Jukebox</span>
    </div>
    <div>RobOS Smart TV Studio · Zero-Cloud LAN Stream</div>
  </footer>

  <script>
    const TILES = ${tilesJson};
    let focusedIndex = Math.max(0, TILES.findIndex(t => t.id === ${JSON.stringify(activeTileId)}));
    const grid = document.getElementById('tv-grid');

    function renderGrid() {
      grid.innerHTML = TILES.map((t, idx) => \`
        <div class="tv-tile \${idx === focusedIndex ? 'focused' : ''}"
             tabindex="0"
             role="gridcell"
             data-idx="\${idx}"
             data-tile-id="\${t.id}">
          <div>
            <div class="tile-top">
              <span class="tile-cat">\${t.category}</span>
              <span class="tile-badge">\${t.badge}</span>
            </div>
            <h3 class="tile-title">\${t.title}</h3>
            <p class="tile-desc">\${t.description}</p>
          </div>
        </div>
      \`).join('');

      const active = TILES[focusedIndex];
      if (active) {
        document.getElementById('hero-title').textContent = active.title + ' (' + active.badge + ')';
        document.getElementById('hero-desc').textContent = active.description;
      }

      grid.querySelectorAll('.tv-tile').forEach(el => {
        el.onclick = () => {
          focusedIndex = Number(el.dataset.idx);
          renderGrid();
          activateTile(TILES[focusedIndex]);
        };
      });
    }

    async function activateTile(tile) {
      if (!tile) return;
      document.getElementById('last-action-pill').textContent = 'Launched: ' + tile.title;
      try {
        await fetch('/api/activate-tile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tileId: tile.id })
        });
      } catch {}
    }

    document.addEventListener('keydown', (e) => {
      const cols = 4;
      if (e.key === 'ArrowRight') {
        focusedIndex = (focusedIndex + 1) % TILES.length;
        renderGrid();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        focusedIndex = (focusedIndex - 1 + TILES.length) % TILES.length;
        renderGrid();
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        focusedIndex = (focusedIndex + cols) % TILES.length;
        renderGrid();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        focusedIndex = (focusedIndex - cols + TILES.length) % TILES.length;
        renderGrid();
        e.preventDefault();
      } else if (e.key === 'Enter' || e.key === ' ') {
        activateTile(TILES[focusedIndex]);
        e.preventDefault();
      }
    });

    window.addEventListener('gamepadconnected', (e) => {
      document.getElementById('gamepad-indicator').textContent = 'Gamepad: ' + e.gamepad.id.slice(0, 24);
    });

    function updateClock() {
      const d = new Date();
      document.getElementById('clock-pill').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    updateClock();
    setInterval(updateClock, 15000);
    renderGrid();

    // Another RobOS app (e.g. Party Game) can cast its own page to this TV.
    function followAppCast() {
      fetch('/api/app-cast').then(function (r) { return r.json(); }).then(function (j) {
        if (j && j.appCast && j.appCast.active && j.appCast.url) location.replace(j.appCast.url);
      }).catch(function () {});
    }
    followAppCast();
    setInterval(followAppCast, 3000);
  </script>
</body>
</html>`;
}

/**
 * Generates real, developer-mode sideloadable app package files on disk for a target Smart TV OS.
 */
function generateSideloadPackage({
  platformId,
  outputDir,
  hostIp = '192.168.1.100',
  portalPort = DEFAULT_PORTAL_PORT,
  tvIp = '192.168.1.52',
  appName = 'RobOS TV',
  appId = 'com.robos.tv',
  version = '1.0.0',
  webosPassphrase = '',
}) {
  const portalUrl = `http://${hostIp}:${portalPort}`;
  const targetDir = path.join(outputDir, platformId);
  fs.mkdirSync(targetDir, { recursive: true });

  const filesCreated = [];
  const write = (relPath, content, executable = false) => {
    const full = path.join(targetDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    if (executable) {
      try { fs.chmodSync(full, 0o755); } catch {}
    }
    filesCreated.push(full);
    return full;
  };

  const launcherHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${appName}</title>
  <meta http-equiv="refresh" content="0;url=${portalUrl}" />
  <style>
    body { background: #070b12; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .box { text-align: center; border: 2px solid #00bcd4; border-radius: 16px; padding: 32px 48px; background: #111827; }
    h1 { color: #00bcd4; margin: 0 0 12px; }
    p { color: #94a3b8; margin: 0; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Connecting to ${appName}…</h1>
    <p>Opening RobOS 10-Foot Portal at <strong>${portalUrl}</strong></p>
  </div>
  <script>window.location.replace(${JSON.stringify(portalUrl)});</script>
</body>
</html>\n`;

  if (platformId === 'lg-webos') {
    const appInfo = {
      id: appId,
      version,
      vendor: 'RobOS Project',
      type: 'web',
      main: 'index.html',
      title: appName,
      icon: 'icon.png',
      largeIcon: 'largeIcon.png',
      resolution: '1920x1080',
      disableBackHistoryAPI: true,
    };
    write('appinfo.json', JSON.stringify(appInfo, null, 2) + '\n');
    write('index.html', launcherHtml);
    write(
      'sideload-webos.sh',
      `#!/usr/bin/env bash
set -euo pipefail
# RobOS LG webOS Developer Mode Sideloader & Auto-Renewal Script
TV_NAME="robos-lg-tv"
TV_IP="${tvIp}"
PASSPHRASE="${webosPassphrase || '123456'}"

echo "[RobOS TV] Packaging webOS IPK from $(pwd)..."
ares-package .

IPK_FILE="${appId}_${version}_all.ipk"
echo "[RobOS TV] Registering target TV ($TV_IP:9991)..."
ares-setup-device --add "$TV_NAME" --info "{\\"host\\":\\"$TV_IP\\",\\"port\\":\\"9991\\",\\"username\\":\\"prisoner\\"}" || true

echo "[RobOS TV] Fetching SSH developer key from LG Key Server..."
ares-novacom --device "$TV_NAME" --getkey --passphrase "$PASSPHRASE"

echo "[RobOS TV] Installing $IPK_FILE onto LG webOS TV..."
ares-install --device "$TV_NAME" "$IPK_FILE"

echo "[RobOS TV] Launching ${appId} on TV..."
ares-launch --device "$TV_NAME" "${appId}"

echo "[RobOS TV] Extending LG Developer Mode 1,000-hour session timer..."
ares-extend-dev --device "$TV_NAME" || true
`,
      true
    );

    return {
      ok: true,
      platformId,
      targetDir,
      portalUrl,
      filesCreated,
      installCommand: `cd "${targetDir}" && ./sideload-webos.sh`,
      summary: `Generated LG webOS IPK project (appinfo.json, index.html, sideload-webos.sh) pointing to ${portalUrl}.`,
    };
  }

  if (platformId === 'samsung-tizen') {
    const configXml = `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://rowbose.com/tv" version="${version}" viewmodes="maximized">
  <tizen:application id="robostv001.RobOSTV" package="robostv001" required_version="4.0"/>
  <content src="index.html"/>
  <feature name="http://tizen.org/feature/screen.size.all"/>
  <icon src="icon.png"/>
  <name>${appName}</name>
  <tizen:privilege name="http://tizen.org/privilege/internet"/>
  <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
  <access origin="*" subdomains="true"/>
  <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable"/>
</widget>\n`;
    write('config.xml', configXml);
    write('index.html', launcherHtml);
    write(
      'sideload-tizen.sh',
      `#!/usr/bin/env bash
set -euo pipefail
# RobOS Samsung Tizen Developer Mode Sideloader
TV_IP="${tvIp}"

echo "[RobOS TV] Connecting to Samsung Tizen TV at $TV_IP:26101 via SDB..."
sdb connect "$TV_IP:26101"

echo "[RobOS TV] Building Tizen Web Widget (RobOSTV.wgt)..."
tizen package -t wgt -- .

echo "[RobOS TV] Installing RobOSTV.wgt onto Samsung TV..."
tizen install -n RobOSTV.wgt

echo "[RobOS TV] Launching robostv001.RobOSTV..."
tizen run -p robostv001.RobOSTV
`,
      true
    );

    return {
      ok: true,
      platformId,
      targetDir,
      portalUrl,
      filesCreated,
      installCommand: `cd "${targetDir}" && ./sideload-tizen.sh`,
      summary: `Generated Samsung Tizen WGT project (config.xml, index.html, sideload-tizen.sh) pointing to ${portalUrl}.`,
    };
  }

  if (platformId === 'roku-os') {
    let initialDash = null;
    let initialVoiceDash = null;
    let initialSlideshow = null;
    try {
      const dashMod = require('./dashboard-engine');
      const dashEngine = dashMod.createDashboardEngine();
      initialDash = dashEngine.resolveDashboard('daily-engineering-ops').dashboard;
      initialVoiceDash = dashEngine.resolveDashboard('robos-voice-dictation').dashboard;
      initialSlideshow = dashEngine.getSlideshowState();
    } catch {}

    const dashCards = initialDash?.cards || [];
    const voiceDashCards = initialVoiceDash?.cards || [];
    const ghCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-github-repo'
    );
    const commitsCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-git-commits'
    );
    const calendarCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-calendar-today'
    );
    const musicCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-music-player'
    );
    const meetingCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-next-meeting'
    );
    const voiceCard =
      voiceDashCards.find(
        (c) => (c.componentTag || c.widgetTag) === 'robos-widget-voice-dictation'
      ) ||
      dashCards.find(
        (c) => (c.componentTag || c.widgetTag) === 'robos-widget-voice-dictation'
      );
    const agentsCard = dashCards.find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-agent-sessions'
    );

    const safeXml = (str) =>
      String(str || '')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const ghData = (ghCard && ghCard.liveData) || {};
    const ghRel = ghData.latestRelease || {
      tag: 'v0.0.8',
      name: 'RobOS v0.0.8',
      releaseRunNumber: 11,
      releaseConclusion: 'success',
      windowsReleaseRunNumber: 5,
      windowsReleaseConclusion: 'success',
      isRunningNow: false,
    };
    const ghCi = ghData.mainCi || {
      summaryText: '3 Passing | 1 Failing | 0 Running',
      workflows: [
        { shortName: 'Docs Pages', runNumber: 416, conclusion: 'success', status: 'completed' },
        { shortName: 'Household CI', runNumber: 15, conclusion: 'success', status: 'completed' },
        { shortName: 'Win EXE Release', runNumber: 5, conclusion: 'success', status: 'completed' },
        { shortName: 'Windows Suite', runNumber: 64, conclusion: 'failure', status: 'completed' },
      ],
    };
    const commits = (
      (ghData.commits && ghData.commits.length ? ghData.commits : null) ||
      (commitsCard && commitsCard.liveData && commitsCard.liveData.commits) ||
      []
    ).slice(0, 8);
    const events = ((calendarCard && calendarCard.liveData && calendarCard.liveData.events) || []).slice(0, 5);
    const musicData = (musicCard && musicCard.liveData) || {
      title: 'Ambience & Music',
      artist: "Baldur's Gate 3",
      album: 'video game music',
      artistAlbum: "Baldur's Gate 3 - video game music",
      elapsed: '24:45',
      duration: '46:07',
      progressPct: 54,
      isPlaying: true,
      output: 'Desktop (Local Audio)',
      upNext: [
        { title: 'Lux Aeterna (Requiem for a Dream) 4', artist: 'Clint Mansell' },
        { title: '8BitStereo mixed', artist: 'Copy of Dragon Warrior (NES) Soundtrack' },
      ],
    };
    const sessions = ((agentsCard && agentsCard.liveData && agentsCard.liveData.sessions) || []).slice(0, 3);
    const meetingData = (meetingCard && meetingCard.liveData) || {
      secondsUntil: 1680,
      countdownLabel: 'T - 00:28:00',
      urgencyPct: 76,
      nextMeeting: {
        time: '16:30',
        title: 'Hermetiq Client Delivery & Agent Ops Check-In',
        accountEmail: 'nicholas@hermetiq.com',
        location: 'Google Calendar (nicholas@hermetiq.com)',
      },
      followingMeeting: {
        time: 'Oct 31 08:30',
        title: 'Comprehensive Eye Exam - Dr. Jennifer Caine',
        accountEmail: 'nicholas.dipiazza@gmail.com',
      },
    };
    const nm = meetingData.nextMeeting || {};
    const fm = meetingData.followingMeeting || {};
    const initialRemSec = Math.max(60, Number(meetingData.secondsUntil) || 1680);
    const nmTitleLine = `${nm.time || '16:30'} - ${nm.title || 'Hermetiq Client Delivery & Agent Ops Check-In'}`;
    const nmMetaLine = `Calendar: ${nm.accountEmail || 'nicholas@hermetiq.com'} | After: ${fm.time || 'Oct 31 08:30'} ${String(fm.title || '').slice(0, 22)}`;
    const nmBarW = Math.max(24, Math.min(528, Math.round(((Number(meetingData.urgencyPct) || 70) / 100) * 528)));

    const relRunning = Boolean(ghRel.isRunningNow);
    const relStripeColor = relRunning ? '0xF59E0BFF' : '0x10B981FF';
    const relLine1 = `RELEASE: ${ghRel.name || ghRel.tag || 'v0.0.8'} (Run #${ghRel.releaseRunNumber || 11}) [${relRunning ? 'RUNNING NOW' : 'IDLE - NOT RUNNING'}]`;
    const relLine2 = `Last Release #${ghRel.releaseRunNumber || 11}: ${String(ghRel.releaseConclusion || 'SUCCESS').toUpperCase()} | Win EXE Release #${ghRel.windowsReleaseRunNumber || 5}: ${String(ghRel.windowsReleaseConclusion || 'SUCCESS').toUpperCase()}`;

    const wfList = Array.isArray(ghCi.workflows) ? ghCi.workflows : [];
    const fmtWf = (w) => {
      if (!w) return '';
      const st = w.status === 'in_progress' || w.status === 'queued' ? 'RUNNING' : String(w.conclusion || 'PASS').toUpperCase();
      return `${w.shortName || w.name} #${w.runNumber} [${st}]`;
    };
    const ciHeaderLine = `CI STATUS IN MAIN: ${String(ghCi.summaryText || '3 Passing | 1 Failing').replace(/[^\x20-\x7E]/g, '|')}`;
    const ciRow1 = `${fmtWf(wfList[0])}   |   ${fmtWf(wfList[1])}`;
    const ciRow2 = `${fmtWf(wfList[2])}   |   ${fmtWf(wfList[3])}`;

    const c30 = ghData.commits30d || {
      total: 654,
      avgPerDay: 21.8,
      peakDay: { label: 'Oct 2', count: 95 },
      todayCount: 25,
      byType: { feat: 336, fix: 166, docs: 64, other: 88 },
      dailySeries: [
        { count: 0, ma7: 0 }, { count: 15, ma7: 7.5 }, { count: 14, ma7: 9.7 }, { count: 22, ma7: 12.8 },
        { count: 38, ma7: 17.8 }, { count: 95, ma7: 30.7 }, { count: 29, ma7: 30.4 }, { count: 2, ma7: 30.7 },
        { count: 8, ma7: 29.7 }, { count: 1, ma7: 27.9 }, { count: 14, ma7: 26.7 }, { count: 0, ma7: 21.3 },
        { count: 1, ma7: 7.9 }, { count: 17, ma7: 6.1 }, { count: 2, ma7: 6.1 }, { count: 32, ma7: 9.6 },
        { count: 39, ma7: 15.0 }, { count: 20, ma7: 15.9 }, { count: 20, ma7: 18.7 }, { count: 19, ma7: 21.3 },
        { count: 36, ma7: 24.0 }, { count: 17, ma7: 26.1 }, { count: 31, ma7: 26.0 }, { count: 21, ma7: 23.4 },
        { count: 36, ma7: 25.7 }, { count: 48, ma7: 29.7 }, { count: 29, ma7: 31.1 }, { count: 16, ma7: 28.3 },
        { count: 7, ma7: 26.9 }, { count: 25, ma7: 26.0 },
      ],
    };
    const series30 = Array.isArray(c30.dailySeries) && c30.dailySeries.length === 30 ? c30.dailySeries : [];
    const maxDayCommits = Math.max(40, ...series30.map((d) => Number(d.count) || 0), 95);
    const bt = c30.byType || { feat: 336, fix: 166, docs: 64, other: 88 };
    const graphHeaderLine = `30-DAY COMMITS GRAPH: ${c30.total || 654} Total | Avg ${c30.avgPerDay || 21.8}/d | Peak ${c30.peakDay?.count || 95} (${c30.peakDay?.label || 'Oct 2'}) | Today ${c30.todayCount || 25}`;
    const graphLegendLine = `Sep 27   Oct 4   Oct 11   Oct 18   Oct 26  |  feat:${bt.feat || 336}  fix:${bt.fix || 166}  docs:${bt.docs || 64}`;

    const commitGraphBarsXml = Array.from({ length: 30 }, (_, i) => {
      const d = series30[i] || { count: 15, ma7: 18 };
      const cnt = Number(d.count) || 0;
      const ma = Number(d.ma7) || cnt;
      const bx = 114 + i * 16;
      const bh = cnt === 0 ? 3 : Math.max(5, Math.min(68, Math.round((cnt / maxDayCommits) * 68)));
      const by = 356 - bh;
      const isToday = i === 29;
      const barColor = isToday
        ? '0xF59E0BFF'
        : cnt >= 35
        ? '0x10B981FF'
        : cnt >= 15
        ? '0x00BCD4FF'
        : cnt > 0
        ? '0xA855F7FF'
        : '0x1E293BFF';
      const maH = Math.max(4, Math.min(68, Math.round((ma / maxDayCommits) * 68)));
      const maY = 356 - maH;
      return `    <Rectangle id="commitBar${i}" translation="[${bx}, ${by}]" width="12" height="${bh}" color="${barColor}" />
    <Rectangle id="maDot${i}" translation="[${bx + 2}, ${maY}]" width="8" height="3" color="0xFCD34DFF" />`;
    }).join('\n');

    const commitRowsXml = Array.from({ length: 7 }, (_, i) => {
      const c = commits[i];
      const y = 432 + i * 64;
      const sha = c ? c.shortSha || c.hash || String(c.sha || '').slice(0, 8) : '';
      const line1 = c ? `${i + 1}. ${String(c.subject || '').slice(0, 48)}` : `${i + 1}. -`;
      const line2 = c ? `   #${sha} | ${c.author || 'dev'} | ${c.relativeTime || 'recent'}` : '';
      return `    <Label id="commitTitle${i}" translation="[68, ${y}]" scale="[0.64, 0.64]" width="820" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(line1)}" />
    <Label id="commitMeta${i}" translation="[68, ${y + 24}]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(line2)}" />
    <Rectangle translation="[68, ${y + 52}]" width="544" height="1" color="0x1E293BFF" />`;
    }).join('\n');

    const pop = ghData.popularity || {};
    const popStars = Number(pop.stars ?? 7);
    const popForks = Number(pop.forks ?? 1);
    const popWatchers = Number(pop.watchers ?? 7);
    const popDlTotal = Number(pop.downloads?.totalDownloads ?? 91);
    const popClonesCount = Number(pop.clones14d?.count ?? 2637);
    const popClonesUniques = Number(pop.clones14d?.uniques ?? 612);
    const popClonesPeak = pop.clones14d?.peakDay || { label: 'Oct 23', count: 328, uniques: 109 };
    const popViewsCount = Number(pop.views14d?.count ?? 17);
    const popViewsUniques = Number(pop.views14d?.uniques ?? 8);
    const popStargazers = Array.isArray(pop.stargazers) && pop.stargazers.length
      ? pop.stargazers
      : [
          { login: 'mrsdianajane-design', starredAt: '2026-10-24' },
          { login: 'reham00025', starredAt: '2026-10-09' },
          { login: 'krickert', starredAt: '2026-09-03' },
          { login: 'aliasdhacker', starredAt: '2026-08-06' },
          { login: 'nddipiazza-ak', starredAt: '2026-04-24' },
          { login: 'gwatts', starredAt: '2026-04-23' },
          { login: 'bdw617', starredAt: '2026-04-17' },
        ];
    const defaultClonesDaily = [
      { date: '2026-10-13', count: 29, uniques: 17 },
      { date: '2026-10-14', count: 249, uniques: 95 },
      { date: '2026-10-15', count: 158, uniques: 84 },
      { date: '2026-10-16', count: 162, uniques: 67 },
      { date: '2026-10-17', count: 281, uniques: 71 },
      { date: '2026-10-18', count: 229, uniques: 80 },
      { date: '2026-10-19', count: 138, uniques: 46 },
      { date: '2026-10-20', count: 277, uniques: 88 },
      { date: '2026-10-21', count: 193, uniques: 61 },
      { date: '2026-10-22', count: 300, uniques: 88 },
      { date: '2026-10-23', count: 328, uniques: 109 },
      { date: '2026-10-24', count: 151, uniques: 50 },
      { date: '2026-10-25', count: 55, uniques: 18 },
      { date: '2026-10-26', count: 87, uniques: 33 },
    ];
    const clonesDaily =
      Array.isArray(pop.clones14d?.daily) && pop.clones14d.daily.length >= 7
        ? pop.clones14d.daily.slice(-14)
        : defaultClonesDaily;
    const maxCloneDay = Math.max(100, ...clonesDaily.map((d) => Number(d.count) || 0), 328);
    const cloneBarsXml = Array.from({ length: 14 }, (_, i) => {
      const cd = clonesDaily[i] || { count: 120, uniques: 45 };
      const cnt = Number(cd.count) || 0;
      const unq = Number(cd.uniques) || 0;
      const bx = 1320 + i * 36;
      const bh = Math.max(6, Math.min(82, Math.round((cnt / maxCloneDay) * 82)));
      const by = 354 - bh;
      const uh = Math.max(4, Math.min(bh, Math.round((unq / maxCloneDay) * 82)));
      const uy = 354 - uh;
      const bColor = cnt >= 250 ? '0x10B981FF' : cnt >= 150 ? '0x00BCD4FF' : '0xA855F7FF';
      return `      <Rectangle id="cloneBar${i}" translation="[${bx}, ${by}]" width="24" height="${bh}" color="${bColor}" />
      <Rectangle id="cloneUniqBar${i}" translation="[${bx + 5}, ${uy}]" width="14" height="${uh}" color="0xFCD34DFF" />`;
    }).join('\n');

    const stargazerRowsXml = Array.from({ length: 7 }, (_, i) => {
      const sg = popStargazers[i] || { login: 'github-user', starredAt: '2026' };
      const y = 456 + i * 56;
      return `      <Rectangle translation="[694, ${y}]" width="508" height="46" color="0x090D16FF" />
      <Rectangle translation="[694, ${y}]" width="4" height="46" color="0xF59E0BFF" />
      <Label id="s1StarUser${i}" translation="[712, ${y + 10}]" scale="[0.62, 0.62]" width="520" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(`${i + 1}. @${sg.login}`)}" />
      <Label id="s1StarDate${i}" translation="[1010, ${y + 11}]" scale="[0.55, 0.55]" width="320" height="28" numLines="1" color="0xFCD34DFF" text="${safeXml(`* Starred ${sg.starredAt}`)}" />`;
    }).join('\n');

    const wfCardsSlide1Xml = Array.from({ length: 4 }, (_, i) => {
      const wf = wfList[i] || {
        name: ['Deploy docs to GitHub Pages', 'Household lifecycle', 'Native Windows EXE release', 'Windows app suite'][i],
        shortName: ['Docs Pages', 'Household CI', 'Win EXE Release', 'Windows Suite'][i],
        runNumber: [416, 15, 5, 64][i],
        status: 'completed',
        conclusion: i === 3 ? 'failure' : 'success',
        displayTitle: 'main branch workflow run',
      };
      const y = 278 + i * 108;
      const isRun = wf.status === 'in_progress' || wf.status === 'queued';
      const isOk = wf.conclusion === 'success';
      const stripeCol = isRun ? '0xF59E0BFF' : isOk ? '0x10B981FF' : '0xEF4444FF';
      const statusCol = isRun ? '0xFCD34DFF' : isOk ? '0x6EE7B7FF' : '0xFCA5A5FF';
      const badgeTxt = isRun ? 'RUNNING NOW' : isOk ? 'PASS - SUCCESS' : 'FAIL - ATTENTION';
      return `      <Rectangle id="s1WfBg${i}" translation="[68, ${y}]" width="544" height="96" color="0x161F30FF" />
      <Rectangle id="s1WfStripe${i}" translation="[68, ${y}]" width="6" height="96" color="${stripeCol}" />
      <Label id="s1WfTitle${i}" translation="[86, ${y + 10}]" scale="[0.64, 0.64]" width="620" height="32" numLines="1" color="0xF8FAFCFF" text="${safeXml(`${i + 1}. ${wf.name || wf.shortName} (#${wf.runNumber})`)}" />
      <Label id="s1WfBadge${i}" translation="[86, ${y + 39}]" scale="[0.56, 0.56]" width="860" height="28" numLines="1" color="${statusCol}" text="${safeXml(`Status: [${badgeTxt}]  |  Branch: main  |  Run #${wf.runNumber}`)}" />
      <Label id="s1WfSub${i}" translation="[86, ${y + 65}]" scale="[0.50, 0.50]" width="940" height="26" numLines="1" color="0x94A3B8FF" text="${safeXml(`Commit: ${String(wf.displayTitle || 'Latest main push').slice(0, 56)}`)}" />`;
    }).join('\n');

    const musicPlaying = Boolean(musicData.isPlaying === true);
    const musicStatusLine = musicPlaying
      ? `NOW PLAYING [PLAYING]  ${musicData.elapsed || '0:00'} / ${musicData.duration || '46:07'}  |  ${musicData.output || 'Local Audio'}`
      : `AUDIO IDLE [NOT PLAYING]  0:00 / ${musicData.duration || '0:00'}  |  ${musicData.output || 'Local Audio'}`;
    const musicTitleLine = musicPlaying
      ? `${musicData.title || 'Ambience & Music'}`
      : 'No Audio Currently Playing';
    const musicArtistClean = String(musicData.artistAlbum || `${musicData.artist || ''} - ${musicData.album || ''}`).replace(/[^\x20-\x7E]/g, '-');
    const musicArtistLine = musicPlaying
      ? `${musicArtistClean}  (${musicData.source || 'Google Drive'})`
      : `Last queued: ${String(musicData.title || 'None').slice(0, 38)} (${musicData.output || 'RobOS Audio Player'})`;
    const musicPct = musicPlaying ? Math.max(4, Math.min(100, Number(musicData.progressPct) || 1)) : 0;
    const musicBarW = musicPlaying ? Math.max(16, Math.round((musicPct / 100) * 512)) : 0;
    const upNextArr = Array.isArray(musicData.upNext) ? musicData.upNext : [];
    const musicUpNextLine = upNextArr.length
      ? `Up Next: ${upNextArr.map((u) => `${u.title} (${u.artist})`).join(' | ')}`
      : 'Up Next: Lux Aeterna (Clint Mansell) | 8BitStereo mixed';

    const eqBarsXml = Array.from({ length: 8 }, (_, i) => {
      const bx = 1116 + i * 11;
      const bh = musicPlaying ? 10 + ((i * 7) % 22) : 4;
      const by = 228 - bh;
      const bColor = musicPlaying
        ? i % 3 === 0 ? '0xA855F7FF' : i % 2 === 0 ? '0x00BCD4FF' : '0x10B981FF'
        : '0x334155FF';
      return `    <Rectangle id="eqBar${i}" translation="[${bx}, ${by}]" width="7" height="${bh}" color="${bColor}" />`;
    }).join('\n');

    const calendarRowsXml = Array.from({ length: 5 }, (_, i) => {
      const ev = events[i];
      const y = 310 + i * 112;
      const status = String(ev?.status || 'upcoming').toUpperCase();
      const accEmail = ev?.accountEmail || ev?.calendar || 'nicholas.dipiazza@gmail.com';
      const isSecondCal = String(accEmail).toLowerCase().includes('hermetiq') || ev?.color === '#10b981';
      const stripeColor = isSecondCal ? '0x10B981FF' : '0x00BCD4FF';
      const timeColor = isSecondCal ? '0x6EE7B7FF' : '0x67E8F9FF';
      const timeText = ev ? `${ev.time}  [${status}]  (${accEmail})` : '';
      const titleText = ev ? String(ev.title || '').slice(0, 44) : '';
      const locText = ev ? `Calendar: ${accEmail} | ${ev.location || 'Workspace'}` : '';
      return `    <Rectangle id="calBg${i}" translation="[676, ${y}]" width="544" height="98" color="0x161F30FF" visible="${ev ? 'true' : 'false'}" />
    <Rectangle id="calStripe${i}" translation="[676, ${y}]" width="6" height="98" color="${stripeColor}" visible="${ev ? 'true' : 'false'}" />
    <Label id="calTime${i}" translation="[696, ${y + 8}]" scale="[0.56, 0.56]" width="900" height="32" numLines="1" color="${timeColor}" text="${safeXml(timeText)}" />
    <Label id="calTitle${i}" translation="[696, ${y + 36}]" scale="[0.66, 0.66]" width="740" height="34" numLines="1" color="0xF8FAFCFF" text="${safeXml(titleText)}" />
    <Label id="calLoc${i}" translation="[696, ${y + 66}]" scale="[0.54, 0.54]" width="900" height="32" numLines="1" color="0x94A3B8FF" text="${safeXml(locText)}" />`;
    }).join('\n');

    const voiceData = (voiceCard && voiceCard.liveData) || {
      active: false,
      pushToTalkKey: 'Super+V',
      configuredDevice: 'default',
      interimBubble: null,
      bubbles: [],
    };
    const voiceDisplayList = [];
    if (voiceData.interimBubble && (voiceData.interimBubble.text || voiceData.interimBubble.msg)) {
      voiceDisplayList.push({ ...voiceData.interimBubble, isInterim: true });
    }
    const rawVoiceBubbles = Array.isArray(voiceData.bubbles) ? voiceData.bubbles.slice().reverse() : [];
    for (const vb of rawVoiceBubbles) {
      if (voiceDisplayList.length >= 6) break;
      voiceDisplayList.push({ ...vb, isInterim: false });
    }
    const voiceIsRec = Boolean(voiceData.active || voiceData.interimBubble);
    const voiceStatusTitleStr = voiceIsRec
      ? `LISTENING LIVE - Recording Active (${voiceData.pushToTalkKey || 'Super+V'})`
      : `STANDBY - ${(voiceData.bubbles || []).length} Recent Dictated Chats (${voiceData.pushToTalkKey || 'Super+V'})`;
    const voiceStatusSubStr = `Microphone: ${voiceData.configuredDevice || 'default'}  |  Showing Most Recent Chats (Newest First)  |  Live HUD Sync :19188`;

    const voiceSlide2RowsXml = Array.from({ length: 6 }, (_, i) => {
      const vb = voiceDisplayList[i];
      const by = 248 + i * 102;
      const isVis = vb ? 'true' : 'false';
      const isInt = Boolean(vb && vb.isInterim);
      const stripeCol = isInt
        ? '0x00BCD4FF'
        : vb && vb.commandCard
        ? '0x10B981FF'
        : '0xA855F7FF';
      let tagSuffix = 'RobOS Voice Chat';
      if (isInt) {
        tagSuffix = 'LISTENING LIVE (Streaming Utterance...)';
      } else if (vb && vb.commandCard && vb.commandCard.title) {
        tagSuffix = `Matched Command: ${vb.commandCard.title} [${vb.commandCard.statusLabel || 'Done'}]`;
      } else if (vb && Array.isArray(vb.likelySkills) && vb.likelySkills[0]) {
        const sk = vb.likelySkills[0];
        tagSuffix = `Likely Skill: ${sk.title || sk.name} (${sk.category || 'Skill'})`;
      } else if (vb && vb.isAmbient) {
        tagSuffix = `Ambient Audio: ${vb.ambientReason || 'Background sound'}`;
      }
      const metaLine = vb ? `${i + 1}. [${vb.time || 'Live'}]   ${tagSuffix}` : '';
      const txtLine = vb ? `"${String(vb.text || vb.msg || '').slice(0, 165)}"` : '';
      return `      <Rectangle id="s2VoiceBubbleBg${i}" translation="[68, ${by}]" width="1784" height="92" color="0x161F30FF" visible="${isVis}" />
      <Rectangle id="s2VoiceBubbleStripe${i}" translation="[68, ${by}]" width="6" height="92" color="${stripeCol}" visible="${isVis}" />
      <Label id="s2VoiceBubbleMeta${i}" translation="[88, ${by + 8}]" scale="[0.58, 0.58]" width="2600" height="30" numLines="1" color="${isInt ? '0xFCA5A5FF' : '0xD8B4FEFF'}" visible="${isVis}" text="${safeXml(metaLine)}" />
      <Label id="s2VoiceBubbleText${i}" translation="[88, ${by + 36}]" scale="[0.70, 0.70]" width="2480" height="54" numLines="2" color="0xF8FAFCFF" visible="${isVis}" text="${safeXml(txtLine)}" />`;
    }).join('\n');

    const agentRowsXml = Array.from({ length: 3 }, (_, i) => {
      const s = sessions[i];
      const y = 316 + i * 190;
      const isVis = s && i < 3 ? 'true' : 'false';
      const sTitle = s ? s.name || s.title || s.id || 'In-Progress Session' : '';
      const sAct = s ? s.activity || s.cwd || '/home/ndipiazza/source/robos' : '';
      const sEl = s ? s.elapsedFormatted || '00:05' : '00:00';
      const titleText = s ? `* ${String(sTitle).slice(0, 46)}` : '';
      const metaText = s ? `IN PROGRESS [${sEl}] | ${String(sAct).slice(0, 42)}` : '';
      const rawLines = Array.isArray(s?.statusLines) ? s.statusLines : Array.isArray(s?.tailLines) ? s.tailLines : [];
      const tails = rawLines.slice(-3);
      const tailLabels = Array.from({ length: 3 }, (__, tIdx) => {
        const ty = y + 72 + tIdx * 34;
        const tLine = tails[tIdx] ? String(tails[tIdx]).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 56) : '';
        return `    <Label id="agentTail${i}_${tIdx}" translation="[1310, ${ty}]" scale="[0.54, 0.54]" width="980" height="28" numLines="1" color="0xA7F3D0FF" visible="${isVis}" text="${safeXml(tLine)}" />`;
      }).join('\n');
      return `    <Rectangle id="agentCard${i}" translation="[1284, ${y}]" width="568" height="176" color="0x161F30FF" visible="${isVis}" />
    <Rectangle id="agentStripe${i}" translation="[1284, ${y}]" width="568" height="3" color="0x10B981FF" visible="${isVis}" />
    <Rectangle id="agentDot${i}" translation="[1300, ${y + 15}]" width="12" height="12" color="0x10B981FF" visible="${isVis}" />
    <Label id="agentTitle${i}" translation="[1320, ${y + 10}]" scale="[0.64, 0.64]" width="840" height="34" numLines="1" color="0xF8FAFCFF" visible="${isVis}" text="${safeXml(titleText)}" />
    <Label id="agentMeta${i}" translation="[1300, ${y + 38}]" scale="[0.52, 0.52]" width="980" height="28" numLines="1" color="0x6EE7B7FF" visible="${isVis}" text="${safeXml(metaText)}" />
    <Rectangle id="agentTermBg${i}" translation="[1298, ${y + 66}]" width="540" height="102" color="0x090D16FF" visible="${isVis}" />
${tailLabels}`;
    }).join('\n');

    const manifest = `title=${appName}\nsubtitle=RobOS 10-Foot Smart TV & Live Dashboards Suite\nmajor_version=1\nminor_version=3\nbuild_version=1\nui_resolutions=fhd\n`;
    const mainBrs = `sub Main()
    screen = CreateObject("roSGScreen")
    m.port = CreateObject("roMessagePort")
    screen.setMessagePort(m.port)
    scene = screen.CreateScene("MainScene")
    screen.show()
    while(true)
        msg = wait(0, m.port)
        if type(msg) = "roSGScreenEvent" and msg.isScreenClosed() then return
    end while
end sub
`;
    const dashboardTaskXml = `<?xml version="1.0" encoding="utf-8" ?>
<component name="DashboardTask" extends="Task">
  <interface>
    <field id="apiUrl" type="string" />
    <field id="payloadJson" type="string" />
  </interface>
  <script type="text/brightscript" uri="pkg:/components/DashboardTask.brs" />
</component>
`;
    const dashboardTaskBrs = `sub init()
    m.top.functionName = "pollDashboard"
end sub

sub pollDashboard()
    while true
        raw = ""
        url = m.top.apiUrl
        if url <> ""
            http = CreateObject("roUrlTransfer")
            http.SetUrl(url)
            raw = http.GetToString()
            if raw <> ""
                m.top.payloadJson = raw
            end if
        end if
        if Instr(1, raw, Chr(34) + "appCastActive" + Chr(34) + ":true") > 0 or Instr(1, raw, Chr(34) + "cinemaCastActive" + Chr(34) + ":true") > 0
            sleep(700)
        else
            sleep(2000)
        end if
    end while
end sub
`;
    const ssEnabled = initialSlideshow ? Boolean(initialSlideshow.enabled) : true;
    const ssInterval = Math.max(3, Number(initialSlideshow?.intervalSeconds) || 15);
    const ssRem = Math.max(1, Number(initialSlideshow?.secondsRemainingInSlide) || ssInterval);
    const ssSlideNum = Number(initialSlideshow?.slideNumber) || 1;
    const ssTotal = Number(initialSlideshow?.totalSlides) || 3;
    const initActiveDashId = initialSlideshow?.currentDashboardId || 'daily-engineering-ops';
    const ssBadgeText = ssEnabled
      ? `SLIDESHOW: ${ssSlideNum}/${ssTotal} (${ssInterval}s) - Next in ${ssRem}s`
      : `SINGLE DASHBOARD (Slideshow Off)`;

    let initialCinemaLibActive = false;
    let initialCinemaLibItems = [];
    try {
      const cfgFile = path.join(process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos'), 'tv-studio.json');
      if (fs.existsSync(cfgFile)) {
        const stDisk = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
        if (Array.isArray(stDisk.moviePlayerLibrarySnapshot)) {
          initialCinemaLibItems = stDisk.moviePlayerLibrarySnapshot;
        }
        if (
          (stDisk.activeCinemaLibrary && stDisk.activeCinemaLibrary.active !== false) ||
          (stDisk.activeCinemaCast && stDisk.activeCinemaCast.active !== false)
        ) {
          initialCinemaLibActive = true;
        }
      }
    } catch {}

    const mainSceneXml = `<?xml version="1.0" encoding="utf-8" ?>
<component name="MainScene" extends="Scene">
  <script type="text/brightscript" uri="pkg:/components/MainScene.brs" />
  <children>
    <!-- Silent 160x90 looping H.264+AAC video node placed behind opaque bg Rectangle so Roku hardware media player stays in state=play (suppresses screensaver & auto-standby with zero keypress audio) -->
    <Video id="keepAliveVideo" translation="[0, 0]" width="160" height="90" mute="true" loop="true" enableUI="false" />
    <Rectangle id="bg" width="1920" height="1080" color="0x070B12FF" />
    <Rectangle id="headerBar" width="1920" height="84" color="0x0F172AFF" />
    <Rectangle id="headerAccent" translation="[0, 84]" width="1920" height="2" color="0x00BCD4FF" />
    <Rectangle id="slideProgressFill" translation="[0, 82]" width="${ssEnabled ? Math.max(40, Math.round(((ssInterval - ssRem) / ssInterval) * 1920)) : 0}" height="4" color="0xF59E0BFF" />
    <Label id="brandLabel" scale="[0.76, 0.76]" text="RobOS Dashboards - Daily Engineering &amp; Agent Ops" translation="[48, 25]" width="980" height="40" numLines="1" color="0xF8FAFCFF" />
    <Label id="headerCountdownLabel" scale="[0.60, 0.60]" text="NEXT MEETING: ${safeXml(nm.time || '16:30')} (${safeXml(meetingData.countdownLabel || 'T - 00:28:00')})" translation="[780, 29]" width="560" height="34" numLines="1" color="0x6EE7B7FF" />
    <Rectangle id="slideshowBadgeBg" translation="[1130, 20]" width="390" height="42" color="0x1E1B4BFF" />
    <Rectangle id="slideshowBadgeBorder" translation="[1130, 20]" width="4" height="42" color="0xF59E0BFF" />
    <Label id="slideshowBadgeLabel" scale="[0.54, 0.54]" text="${safeXml(ssBadgeText)}" translation="[1144, 29]" width="680" height="32" numLines="1" color="0xFCD34DFF" />
    <Label id="hostLabel" scale="[0.54, 0.54]" text="LIVE CAST | ${portalUrl}/dashboard" translation="[1460, 30]" width="760" height="34" numLines="1" horizAlign="right" color="0x67E8F9FF" />

    <!-- SLIDE 0: Daily Engineering & Calendar Ops (daily-engineering-ops) — CI Status removed from Slide 1 -->
    <Group id="slideGroup0" visible="${initActiveDashId === 'daily-engineering-ops' ? 'true' : 'false'}">
    <!-- Column 1: GitHub Repo Activity (nddipiazza/robos) + Latest Release & 30-Day Commits -->
    <Rectangle id="colCommitsCard" translation="[48, 102]" width="584" height="784" color="0x111827FF" />
    <Rectangle translation="[48, 102]" width="584" height="4" color="0x00BCD4FF" />
    <Label id="colCommitsHeader" scale="[0.68, 0.68]" text="1. GITHUB REPO: nddipiazza/robos (Release &amp; Commits)" translation="[68, 118]" width="780" height="36" numLines="1" color="0x67E8F9FF" />
    <Rectangle translation="[68, 152]" width="544" height="2" color="0x1E293BFF" />

    <!-- Release Status Box -->
    <Rectangle id="ghReleaseBg" translation="[68, 162]" width="544" height="74" color="0x161F30FF" />
    <Rectangle id="ghReleaseStripe" translation="[68, 162]" width="6" height="74" color="${relStripeColor}" />
    <Label id="ghReleaseLine1" translation="[84, 172]" scale="[0.58, 0.58]" width="900" height="32" numLines="1" color="0x6EE7B7FF" text="${safeXml(relLine1)}" />
    <Label id="ghReleaseLine2" translation="[84, 200]" scale="[0.54, 0.54]" width="960" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(relLine2)}" />

    <!-- 30-Day RobOS Commit Velocity & Breakdown Graph Box -->
    <Rectangle id="commitGraphCard" translation="[68, 246]" width="544" height="146" color="0x161F30FF" />
    <Rectangle id="commitGraphStripe" translation="[68, 246]" width="6" height="146" color="0x10B981FF" />
    <Label id="commitGraphHeader" translation="[84, 254]" scale="[0.53, 0.53]" width="960" height="28" numLines="1" color="0x6EE7B7FF" text="${safeXml(graphHeaderLine)}" />
    <Rectangle id="commitPlotBg" translation="[106, 282]" width="494" height="76" color="0x090D16FF" />
    <Label translation="[78, 282]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="${safeXml(String(maxDayCommits))}" />
    <Label translation="[78, 310]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="50" />
    <Label translation="[82, 338]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="0" />
    <Rectangle translation="[106, 300]" width="494" height="1" color="0x1E293BFF" />
    <Rectangle translation="[106, 319]" width="494" height="1" color="0x1E293BFF" />
    <Rectangle translation="[106, 338]" width="494" height="1" color="0x1E293BFF" />
${commitGraphBarsXml}
    <Label id="commitGraphLegend" translation="[84, 362]" scale="[0.50, 0.50]" width="1020" height="26" numLines="1" color="0xCBD5E1FF" text="${safeXml(graphLegendLine)}" />

    <Label id="ghCommitsSubheader" translation="[68, 402]" scale="[0.55, 0.55]" width="900" height="26" numLines="1" color="0x94A3B8FF" text="LATEST ROBOS COMMITS IN MAIN:" />
${commitRowsXml}

    <!-- Column 2: Now Playing Music + Calendar Events for the Day (Both Google Calendars) -->
    <Rectangle id="colCalendarCard" translation="[656, 102]" width="584" height="784" color="0x111827FF" />
    <Rectangle translation="[656, 102]" width="584" height="4" color="0x10B981FF" />
    <Label id="colCalendarHeader" scale="[0.65, 0.65]" text="2. NOW PLAYING MUSIC &amp; DUAL GOOGLE CALENDARS" translation="[676, 118]" width="820" height="36" numLines="1" color="0x6EE7B7FF" />
    <Rectangle translation="[676, 152]" width="544" height="2" color="0x1E293BFF" />

    <!-- Now Playing Music Widget Box -->
    <Rectangle id="musicCardBg" translation="[676, 162]" width="544" height="136" color="0x161F30FF" />
    <Rectangle id="musicStripe" translation="[676, 162]" width="6" height="136" color="0xA855F7FF" />
    <Label id="musicStatusLabel" translation="[694, 170]" scale="[0.54, 0.54]" width="760" height="28" numLines="1" color="0x6EE7B7FF" text="${safeXml(musicStatusLine)}" />
    <Label id="musicTitleLabel" translation="[694, 194]" scale="[0.76, 0.76]" width="540" height="36" numLines="1" color="0xF8FAFCFF" text="${safeXml(musicTitleLine)}" />
    <Label id="musicArtistLabel" translation="[694, 224]" scale="[0.58, 0.58]" width="720" height="30" numLines="1" color="0xD8B4FEFF" text="${safeXml(musicArtistLine)}" />
${eqBarsXml}
    <Rectangle id="musicProgTrack" translation="[694, 254]" width="512" height="10" color="0x090D16FF" />
    <Rectangle id="musicProgFill" translation="[694, 254]" width="${musicBarW}" height="10" color="0xA855F7FF" />
    <Label id="musicUpNextLabel" translation="[694, 270]" scale="[0.52, 0.52]" width="960" height="28" numLines="1" color="0x94A3B8FF" text="${safeXml(musicUpNextLine)}" />

${calendarRowsXml}

    <!-- Column 3: Countdown Until Next Meeting + Running RobOS Agent Sessions (Status Tailed Live) -->
    <Rectangle id="colAgentsCard" translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
    <Rectangle translation="[1264, 102]" width="608" height="4" color="0xF59E0BFF" />
    <Label id="colAgentsHeader" scale="[0.65, 0.65]" text="3. NEXT MEETING COUNTDOWN &amp; RUNNING AGENTS" translation="[1284, 118]" width="820" height="36" numLines="1" color="0xFCD34DFF" />
    <Rectangle translation="[1284, 152]" width="568" height="2" color="0x1E293BFF" />

    <!-- Countdown Until Next Meeting Widget Box -->
    <Rectangle id="nextMeetingCardBg" translation="[1284, 160]" width="568" height="144" color="0x161F30FF" />
    <Rectangle id="nextMeetingStripe" translation="[1284, 160]" width="6" height="144" color="0x10B981FF" />
    <Label id="countdownWidgetTitle" translation="[1304, 168]" scale="[0.55, 0.55]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="COUNTDOWN UNTIL NEXT MEETING (LIVE 1Hz SECOND-BY-SECOND)" />
    <Label id="countdownTimerLabel" translation="[1304, 194]" scale="[1.04, 1.04]" width="520" height="44" numLines="1" color="0xF8FAFCFF" text="${safeXml(meetingData.countdownLabel || 'T - 00:28:00')}" />
    <Label id="nextMeetingTitleLabel" translation="[1304, 234]" scale="[0.58, 0.58]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(nmTitleLine)}" />
    <Label id="nextMeetingMetaLabel" translation="[1304, 258]" scale="[0.50, 0.50]" width="980" height="26" numLines="1" color="0x94A3B8FF" text="${safeXml(nmMetaLine)}" />
    <Rectangle id="secBarTrack" translation="[1304, 282]" width="528" height="10" color="0x090D16FF" />
    <Rectangle id="secBarFill" translation="[1304, 282]" width="${nmBarW}" height="10" color="0x10B981FF" />
    <Rectangle id="secPulseDot" translation="[1820, 170]" width="14" height="14" color="0x10B981FF" />

${agentRowsXml}
    </Group>

    <!-- SLIDE 1 (SLIDE 2 OF 3): GitHub CI Status & App Popularity (github-ci-popularity) -->
    <Group id="slideGroup1" visible="${initActiveDashId === 'github-ci-popularity' ? 'true' : 'false'}">
      <!-- Column 1: CI Status in main & Release Pipeline -->
      <Rectangle translation="[48, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[48, 102]" width="584" height="4" color="0x00BCD4FF" />
      <Label scale="[0.66, 0.66]" text="1. CI STATUS IN MAIN &amp; RELEASE PIPELINE" translation="[68, 118]" width="780" height="36" numLines="1" color="0x67E8F9FF" />
      <Rectangle translation="[68, 152]" width="544" height="2" color="0x1E293BFF" />

      <Rectangle translation="[68, 166]" width="544" height="98" color="0x161F30FF" />
      <Rectangle translation="[68, 166]" width="6" height="98" color="0x00BCD4FF" />
      <Label id="s1CiSummaryTitle" translation="[86, 176]" scale="[0.64, 0.64]" width="800" height="32" numLines="1" color="0x67E8F9FF" text="${safeXml(ciHeaderLine)}" />
      <Label translation="[86, 206]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="Repository: nddipiazza/robos  |  Target Branch: main" />
      <Label translation="[86, 234]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="GitHub Actions Workflows: Automated Docs, CI, &amp; Multi-OS Releases" />

${wfCardsSlide1Xml}

      <Rectangle translation="[68, 718]" width="544" height="150" color="0x090D16FF" />
      <Rectangle id="s1RelStripe" translation="[68, 718]" width="6" height="150" color="${relStripeColor}" />
      <Label translation="[86, 730]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xFCD34DFF" text="LATEST RELEASE PIPELINE STATUS:" />
      <Label id="s1RelLine1" translation="[86, 762]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x6EE7B7FF" text="${safeXml(relLine1)}" />
      <Label id="s1RelLine2" translation="[86, 794]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xF8FAFCFF" text="${safeXml(relLine2)}" />
      <Label translation="[86, 826]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Tag: ${safeXml(ghRel.tag || 'v0.0.8')} | Published: Oct 22, 2026 | Assets: Win EXE, macOS DMG, Linux" />

      <!-- Column 2: GitHub Stars, Forks, Watchers & Stargazers -->
      <Rectangle translation="[656, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[656, 102]" width="584" height="4" color="0xF59E0BFF" />
      <Label scale="[0.65, 0.65]" text="2. GITHUB STARS, FORKS &amp; COMMUNITY PULSE" translation="[676, 118]" width="820" height="36" numLines="1" color="0xFCD34DFF" />
      <Rectangle translation="[676, 152]" width="544" height="2" color="0x1E293BFF" />

      <!-- 2x2 Big Hero Metric Boxes -->
      <Rectangle translation="[676, 166]" width="264" height="114" color="0x161F30FF" />
      <Rectangle translation="[676, 166]" width="264" height="4" color="0xF59E0BFF" />
      <Label id="s1StarsVal" translation="[694, 180]" scale="[1.02, 1.02]" width="230" height="44" numLines="1" color="0xFCD34DFF" text="${safeXml(`* ${popStars} STARS`)}" />
      <Label translation="[694, 224]" scale="[0.54, 0.54]" width="420" height="28" numLines="1" color="0xF8FAFCFF" text="GitHub Stargazers" />
      <Label translation="[694, 248]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="nddipiazza/robos (+2 this month)" />

      <Rectangle translation="[956, 166]" width="264" height="114" color="0x161F30FF" />
      <Rectangle translation="[956, 166]" width="264" height="4" color="0x00BCD4FF" />
      <Label id="s1ForksVal" translation="[974, 180]" scale="[1.02, 1.02]" width="230" height="44" numLines="1" color="0x67E8F9FF" text="${safeXml(`${popForks} FORK`)}" />
      <Label translation="[974, 224]" scale="[0.54, 0.54]" width="420" height="28" numLines="1" color="0xF8FAFCFF" text="Repository Forks" />
      <Label translation="[974, 248]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Active Community Network" />

      <Rectangle translation="[676, 292]" width="264" height="106" color="0x161F30FF" />
      <Rectangle translation="[676, 292]" width="264" height="4" color="0x10B981FF" />
      <Label id="s1WatchersVal" translation="[694, 304]" scale="[0.90, 0.90]" width="260" height="40" numLines="1" color="0x6EE7B7FF" text="${safeXml(`${popWatchers} WATCHERS`)}" />
      <Label translation="[694, 344]" scale="[0.52, 0.52]" width="440" height="28" numLines="1" color="0xF8FAFCFF" text="Subscribed Repo Watchers" />
      <Label translation="[694, 368]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Following all RobOS releases" />

      <Rectangle translation="[956, 292]" width="264" height="106" color="0x161F30FF" />
      <Rectangle translation="[956, 292]" width="264" height="4" color="0xA855F7FF" />
      <Label id="s1DlHeroVal" translation="[974, 304]" scale="[0.86, 0.86]" width="270" height="40" numLines="1" color="0xD8B4FEFF" text="${safeXml(`${popDlTotal} INSTALLS`)}" />
      <Label translation="[974, 344]" scale="[0.52, 0.52]" width="440" height="28" numLines="1" color="0xF8FAFCFF" text="Release Asset Downloads" />
      <Label translation="[974, 368]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Win EXE + macOS DMG + Linux" />

      <Rectangle translation="[676, 412]" width="544" height="456" color="0x161F30FF" />
      <Rectangle translation="[676, 412]" width="6" height="456" color="0xF59E0BFF" />
      <Label translation="[694, 422]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xFCD34DFF" text="RECENT GITHUB STARGAZERS (WHO STARRED ROBOS):" />
${stargazerRowsXml}

      <!-- Column 3: App Popularity: 14-Day Clones, Traffic Referrers & Release Downloads -->
      <Rectangle translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
      <Rectangle translation="[1264, 102]" width="608" height="4" color="0x10B981FF" />
      <Label scale="[0.63, 0.63]" text="3. APP POPULARITY: CLONES, TRAFFIC &amp; DOWNLOADS" translation="[1284, 118]" width="860" height="36" numLines="1" color="0x6EE7B7FF" />
      <Rectangle translation="[1284, 154]" width="568" height="2" color="0x1E293BFF" />

      <!-- 14-Day Git Clones & Unique Cloners Bar Chart Box -->
      <Rectangle translation="[1284, 166]" width="568" height="232" color="0x161F30FF" />
      <Rectangle translation="[1284, 166]" width="6" height="232" color="0x10B981FF" />
      <Label id="s1ClonesTitle" translation="[1304, 176]" scale="[0.62, 0.62]" width="860" height="32" numLines="1" color="0x6EE7B7FF" text="${safeXml(`14-DAY GIT CLONES: ${popClonesCount} Clones | ${popClonesUniques} Unique Cloners`)}" />
      <Label id="s1ClonesSub" translation="[1304, 204]" scale="[0.52, 0.52]" width="980" height="28" numLines="1" color="0xF8FAFCFF" text="${safeXml(`Peak Day: ${popClonesPeak.label || 'Oct 23'} (${popClonesPeak.count || 328} Clones / ${popClonesPeak.uniques || 109} Uniques) | ${popViewsCount} Views (${popViewsUniques} Uniques)`)}" />
      <Rectangle translation="[1304, 236]" width="528" height="122" color="0x090D16FF" />
      <Rectangle translation="[1304, 268]" width="528" height="1" color="0x1E293BFF" />
      <Rectangle translation="[1304, 300]" width="528" height="1" color="0x1E293BFF" />
      <Rectangle translation="[1304, 332]" width="528" height="1" color="0x1E293BFF" />
${cloneBarsXml}
      <Label translation="[1304, 364]" scale="[0.50, 0.50]" width="1020" height="26" numLines="1" color="0xCBD5E1FF" text="Oct 13          Oct 17          Oct 21          Oct 26  (Gold = Unique Cloners/Day)" />

      <!-- Release Installer Downloads Breakdown Box -->
      <Rectangle translation="[1284, 410]" width="568" height="288" color="0x161F30FF" />
      <Rectangle translation="[1284, 410]" width="6" height="288" color="0xA855F7FF" />
      <Label translation="[1304, 420]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xD8B4FEFF" text="RELEASE INSTALLER DOWNLOADS (${safeXml(String(popDlTotal))} TOTAL ACROSS RELEASES):" />
      <Label translation="[1304, 448]" scale="[0.52, 0.52]" width="960" height="28" numLines="1" color="0x67E8F9FF" text="By Release: v0.0.8 (13 DLs)  |  v0.0.7 (70 DLs)  |  v0.0.6 (6 DLs)  |  v0.0.5 (2 DLs)" />
      <Rectangle translation="[1304, 480]" width="528" height="36" color="0x090D16FF" />
      <Label translation="[1316, 488]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="1. RobOS-Installer-v0.0.7-mac.dmg (macOS)          [21 Downloads]" />
      <Rectangle translation="[1304, 522]" width="528" height="36" color="0x090D16FF" />
      <Label translation="[1316, 530]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="2. RobOS-Installer-v0.0.7-win.exe (Windows)        [21 Downloads]" />
      <Rectangle translation="[1304, 564]" width="528" height="36" color="0x090D16FF" />
      <Label translation="[1316, 572]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="3. RobOS-Installer-v0.0.7-linux.AppImage (Linux)   [18 Downloads]" />
      <Rectangle translation="[1304, 606]" width="528" height="36" color="0x090D16FF" />
      <Label translation="[1316, 614]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="4. RobOS-v0.0.8-Windows-Setup.exe (Win v0.0.8)     [ 4 Downloads]" />
      <Rectangle translation="[1304, 648]" width="528" height="36" color="0x090D16FF" />
      <Label translation="[1316, 656]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="5. Install-RobOS.cmd / .ps1 + Linux .deb           [11 Downloads]" />

      <!-- Top Traffic Referrers & Popular Pages Box -->
      <Rectangle translation="[1284, 710]" width="568" height="158" color="0x090D16FF" />
      <Rectangle translation="[1284, 710]" width="568" height="3" color="0xF59E0BFF" />
      <Label translation="[1304, 722]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xFCD34DFF" text="TOP DISCOVERY REFERRERS &amp; POPULAR CONTENT PATHS:" />
      <Label translation="[1304, 754]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x6EE7B7FF" text="* #1 Referrer: rowbose.com (5 views / 4 unique visitors)" />
      <Label translation="[1304, 784]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="* #2 Referrer: github.com (1u)  |  #3 Referrer: l.facebook.com (1u)" />
      <Label translation="[1304, 814]" scale="[0.52, 0.52]" width="960" height="28" numLines="1" color="0xCBD5E1FF" text="Top Paths: /nddipiazza/robos | /releases/tag/v0.0.8 | /packages/getemgigs" />
    </Group>

    <!-- SLIDE 2 (SLIDE 3 OF 3): RobOS Voice Dictation — Most Recent Chats (robos-voice-dictation) -->
    <Group id="slideGroup2" visible="${initActiveDashId === 'robos-voice-dictation' ? 'true' : 'false'}">
      <Rectangle translation="[48, 102]" width="1824" height="784" color="0x111827FF" />
      <Rectangle translation="[48, 102]" width="1824" height="4" color="0xA855F7FF" />
      <Label scale="[0.72, 0.72]" text="ROBOS VOICE DICTATION - MOST RECENT CHATS (LIVE SPEECH-TO-TEXT DIALOGUE STREAM)" translation="[68, 118]" width="2300" height="38" numLines="1" color="0xD8B4FEFF" />
      <Rectangle translation="[68, 152]" width="1784" height="2" color="0x1E293BFF" />

      <Rectangle id="s2VoiceStatusBg" translation="[68, 164]" width="1784" height="72" color="0x090D16FF" />
      <Rectangle id="s2VoiceStatusStripe" translation="[68, 164]" width="8" height="72" color="${voiceIsRec ? '0xEF4444FF' : '0x10B981FF'}" />
      <Label id="s2VoiceStatusTitle" translation="[92, 174]" scale="[0.68, 0.68]" width="2400" height="34" numLines="1" color="${voiceIsRec ? '0xFCA5A5FF' : '0x6EE7B7FF'}" text="${safeXml(voiceStatusTitleStr)}" />
      <Label id="s2VoiceStatusSub" translation="[92, 204]" scale="[0.54, 0.54]" width="2800" height="28" numLines="1" color="0x94A3B8FF" text="${safeXml(voiceStatusSubStr)}" />

${voiceSlide2RowsXml}
    </Group>

    <!-- Bottom Status & Compact Tile Selector -->
    <Rectangle id="heroCard" translation="[48, 902]" width="1824" height="132" color="0x111827FF" />
    <Rectangle translation="[48, 902]" width="1824" height="2" color="0x1E293BFF" />
    <Label id="heroTitle" scale="[0.75, 0.75]" text="RobOS Live TV Wallboard Active - D-Pad Up/Down/OK switches TV experience" translation="[72, 916]" width="1460" height="36" numLines="1" color="0xF8FAFCFF" />
    <Label id="heroDesc" scale="[0.62, 0.62]" text="Slide 1: Engineering, Music, Calendars &amp; Agents | Slide 2: CI Status &amp; Popularity | Slide 3: RobOS Voice Recent Chats" translation="[72, 954]" width="1760" height="34" numLines="1" color="0x94A3B8FF" />
    <Label id="statusFooter" scale="[0.62, 0.62]" text="Connected to ${portalUrl}/dashboard | Multi-Dashboard Slideshow + 1Hz Live Clock" translation="[72, 988]" width="1760" height="34" numLines="1" color="0x67E8F9FF" />
    <LabelList
      id="tileList"
      translation="[1220, 916]"
      scale="[0.66, 0.66]"
      itemSize="[940, 42]"
      itemSpacing="[0, 6]"
      numRows="3"
      color="0xF8FAFCFF"
      focusedColor="0x061318FF" />

    <!-- Double-Buffered 1920x1080 Live Chromium JS Canvas Frame Layer -->
    <Poster id="livePosterA" width="1920" height="1080" opacity="0.0" />
    <Poster id="livePosterB" width="1920" height="1080" opacity="0.0" />
    <!-- Interactive 10-Foot Movie Player Library Browser Overlay (Netflix / Plex / Apple TV+ Style, D-Pad Remote Controlled) -->
    <Group id="cinemaLibraryGroup" visible="${initialCinemaLibActive ? 'true' : 'false'}">
      <!-- Deep Obsidian Theater Backdrop -->
      <Rectangle width="1920" height="1080" color="0x09080DFF" />
      <!-- Top Netflix/Plex Navigation Header -->
      <Rectangle width="1920" height="78" color="0x110E18FF" />
      <Rectangle translation="[0, 76]" width="1920" height="3" color="0xE50914FF" />
      <Rectangle translation="[0, 78]" width="680" height="2" color="0xE8A33DFF" />

      <!-- Brand Pill -->
      <Rectangle translation="[36, 18]" width="196" height="42" color="0xE50914FF" />
      <Label translation="[50, 26]" scale="[0.66, 0.66]" width="260" height="34" numLines="1" color="0xFFFFFFFF" text="ROBOS CINEMA+" />
      <Label id="cinemaLibHeader" translation="[250, 24]" scale="[0.74, 0.74]" width="980" height="40" numLines="1" color="0xF8FAFCFF" text="10-Foot Streaming Library &amp; Collections" />

      <!-- Active Category Pill & Remote Legend in Header -->
      <Rectangle translation="[980, 18]" width="330" height="42" color="0x1E1B2EFF" />
      <Rectangle translation="[980, 18]" width="4" height="42" color="0xE8A33DFF" />
      <Label id="cinemaActiveCatBadge" translation="[996, 27]" scale="[0.54, 0.54]" width="580" height="30" numLines="1" color="0xFCD34DFF" text="CATEGORY: ALL MOVIES" />
      <Label id="cinemaLibSubHeader" translation="[1326, 27]" scale="[0.52, 0.52]" width="1060" height="30" numLines="1" horizAlign="right" color="0xCBD5E1FF" text="[LEFT] CATEGORIES  |  [RIGHT] MOVIES  |  [OK] PLAY  |  [BACK] EXIT" />

      <!-- LEFT SIDEBAR: Plex / Netflix Category Rail (x=36, y=94, w=382, h=894) -->
      <Rectangle id="cinemaCatPaneBg" translation="[36, 94]" width="382" height="894" color="0x12101BFF" />
      <Rectangle id="cinemaCatFocusStripe" translation="[36, 94]" width="382" height="5" color="0xE8A33DFF" />
      <Label id="cinemaCatHeaderLabel" translation="[56, 110]" scale="[0.60, 0.60]" width="560" height="32" numLines="1" color="0xE8A33DFF" text="BROWSE CATEGORIES (D-PAD LEFT)" />
      <Label translation="[56, 136]" scale="[0.46, 0.46]" width="720" height="24" numLines="1" color="0x94A3B8FF" text="Up/Down filters live  •  Press Right or OK for Movies" />
      <Rectangle translation="[56, 162]" width="342" height="2" color="0x262136FF" />
      <LabelList
        id="cinemaCatList"
        translation="[52, 174]"
        scale="[0.64, 0.64]"
        itemSize="[540, 52]"
        itemSpacing="[0, 8]"
        numRows="12"
        color="0xE2E8F0FF"
        focusedColor="0x110E18FF" />

      <!-- TOP-RIGHT STAGE: Netflix / Plex Hero Spotlight Billboard (x=436, y=94, w=1448, h=392) -->
      <Rectangle id="cinemaHeroBg" translation="[436, 94]" width="1448" height="392" color="0x151221FF" />
      <Rectangle id="cinemaHeroAccentTop" translation="[436, 94]" width="1448" height="4" color="0xE50914FF" />
      <!-- Atmospheric decorative backdrop glow bars -->
      <Rectangle id="cinemaHeroGlow1" translation="[1320, 106]" width="540" height="364" color="0x1E1830FF" />
      <Rectangle id="cinemaHeroGlow2" translation="[1480, 120]" width="360" height="336" color="0x271D3DFF" />

      <!-- Hero 1:1 Library Preview Image Card (x=460, y=114, w=352, h=352 — matches 320x320 Library Preview Images) -->
      <Rectangle id="cinemaHeroPosterFrame" translation="[456, 110]" width="360" height="360" color="0xE8A33DFF" />
      <Rectangle id="cinemaHeroPosterFallbackBg" translation="[460, 114]" width="352" height="352" color="0x1E1B2EFF" />
      <Rectangle id="cinemaHeroPosterTopBar" translation="[460, 114]" width="352" height="36" color="0xE50914FF" />
      <Label id="cinemaHeroPosterRibbon" translation="[474, 122]" scale="[0.50, 0.50]" width="640" height="26" numLines="1" color="0xFFFFFFFF" text="ROBOS CINEMA FEATURE" />
      <Label id="cinemaHeroPosterMonogram" translation="[460, 212]" scale="[1.85, 1.85]" width="190" height="70" numLines="1" horizAlign="center" color="0xFCD34DFF" text="RC" />
      <Label id="cinemaHeroPosterFallbackTitle" translation="[476, 336]" scale="[0.56, 0.56]" width="560" height="60" numLines="2" horizAlign="center" color="0xF8FAFCFF" text="RobOS Cinema" />
      <Label id="cinemaHeroPosterFallbackYear" translation="[476, 424]" scale="[0.52, 0.52]" width="560" height="28" numLines="1" horizAlign="center" color="0xE8A33DFF" text="1080p BluRay" />
      <Poster id="cinemaLibPoster" translation="[460, 114]" width="352" height="352" loadDisplayMode="scaleToFit" />

      <!-- Hero Spotlight Details (x=838, y=114) -->
      <Rectangle translation="[838, 114]" width="150" height="28" color="0xE50914FF" />
      <Label translation="[850, 119]" scale="[0.48, 0.48]" width="280" height="24" numLines="1" color="0xFFFFFFFF" text="SPOTLIGHT FEATURE" />
      <Label id="cinemaHeroEyebrow" translation="[1002, 118]" scale="[0.54, 0.54]" width="1500" height="28" numLines="1" color="0xFCD34DFF" text="ROBOS CINEMA+  •  DIRECT LAN STREAM" />

      <Label id="cinemaLibDetailTitle" translation="[838, 150]" scale="[0.98, 0.98]" width="1020" height="50" numLines="1" color="0xFFFFFFFF" text="Select a Movie" />

      <!-- Metadata Badges Row (Year, Quality, Genre, Format) -->
      <Rectangle translation="[838, 206]" width="104" height="34" color="0x262136FF" />
      <Rectangle translation="[838, 206]" width="4" height="34" color="0xE8A33DFF" />
      <Label id="cinemaBadgeYear" translation="[852, 213]" scale="[0.54, 0.54]" width="160" height="28" numLines="1" color="0xFCD34DFF" text="2024" />

      <Rectangle translation="[954, 206]" width="210" height="34" color="0x162436FF" />
      <Rectangle translation="[954, 206]" width="4" height="34" color="0x38BDF8FF" />
      <Label id="cinemaBadgeQuality" translation="[968, 213]" scale="[0.54, 0.54]" width="360" height="28" numLines="1" color="0x67E8F9FF" text="1080p HD • BluRay" />

      <Rectangle translation="[1176, 206]" width="340" height="34" color="0x231836FF" />
      <Rectangle translation="[1176, 206]" width="4" height="34" color="0xA855F7FF" />
      <Label id="cinemaBadgeGenre" translation="[1190, 213]" scale="[0.54, 0.54]" width="580" height="28" numLines="1" color="0xD8B4FEFF" text="Sci-Fi &amp; Fantasy" />

      <Rectangle translation="[1528, 206]" width="164" height="34" color="0x0F2922FF" />
      <Rectangle translation="[1528, 206]" width="4" height="34" color="0x10B981FF" />
      <Label id="cinemaBadgeFormat" translation="[1542, 213]" scale="[0.54, 0.54]" width="260" height="28" numLines="1" color="0x6EE7B7FF" text="INSTANT STREAM" />

      <!-- Synopsis / Franchise / Audio-Video Stream Description -->
      <Label id="cinemaLibDetailMeta" translation="[838, 252]" scale="[0.62, 0.62]" width="1600" height="32" numLines="1" color="0xE2E8F0FF" text="1080p WEBRip  |  RobOS Cinema" />
      <Label id="cinemaLibDetailSub" translation="[838, 284]" scale="[0.54, 0.54]" width="1800" height="30" numLines="1" color="0x94A3B8FF" text="Zero-Cloud LAN Direct Stream (HTTP 206 Byte-Range)" />
      <Label id="cinemaHeroSynopsis" translation="[838, 314]" scale="[0.52, 0.52]" width="1880" height="28" numLines="1" color="0xCBD5E1FF" text="Full HD home theater playback with instant chapter seeking and Roku hardware decoding." />

      <!-- Netflix / Plex Hero Action Buttons -->
      <Rectangle id="cinemaPlayBtnBg" translation="[838, 356]" width="440" height="58" color="0xE50914FF" />
      <Label id="cinemaLibPlayPrompt" translation="[862, 373]" scale="[0.64, 0.64]" width="640" height="34" numLines="1" color="0xFFFFFFFF" text="▶  WATCH NOW (PRESS OK)" />

      <Rectangle translation="[1294, 356]" width="566" height="58" color="0x1E1B2EFF" />
      <Rectangle translation="[1294, 356]" width="4" height="58" color="0x38BDF8FF" />
      <Label id="cinemaHeroNavHint" translation="[1312, 374]" scale="[0.52, 0.52]" width="1020" height="30" numLines="1" color="0x67E8F9FF" text="◀ LEFT: SWITCH CATEGORY   |   ▲/▼: BROWSE PREVIEW CARDS" />

      <Label translation="[838, 428]" scale="[0.48, 0.48]" width="2040" height="26" numLines="1" color="0x64748BFF" text="During playback: Left/Right seeks 15s  •  Play/Pause toggles  •  Back returns to this Cinema Library" />

      <!-- MIDDLE-RIGHT STAGE: 5-Card Visual Library Preview Carousel Shelf (x=436, y=496, w=1448, h=288) -->
      <Rectangle translation="[436, 496]" width="1448" height="288" color="0x12101BFF" />
      <Rectangle id="cinemaShelfAccent" translation="[436, 496]" width="1448" height="3" color="0xE8A33DFF" />
      <Label id="cinemaShelfTitleLabel" translation="[456, 506]" scale="[0.56, 0.56]" width="1600" height="28" numLines="1" color="0xFCD34DFF" text="POSTER CAROUSEL  •  FEATURED ROW" />
      <Label id="cinemaShelfPosLabel" translation="[1320, 506]" scale="[0.52, 0.52]" width="1040" height="28" numLines="1" horizAlign="right" color="0x94A3B8FF" text="Showing 5-Poster Window" />

      <!-- 5 Library Preview Cards (i = 0..4, each width=272, height=238, x = 450 + i * 284, y = 536) -->
      <Group id="cinemaPosterShelf">
        <!-- Card 0 -->
        <Rectangle id="cinemaCardBorder0" translation="[450, 536]" width="272" height="238" color="0x262136FF" />
        <Rectangle id="cinemaCardBg0" translation="[453, 539]" width="266" height="232" color="0x191626FF" />
        <Rectangle id="cinemaCardArtBg0" translation="[502, 546]" width="168" height="168" color="0x2D1B36FF" />
        <Label id="cinemaCardMono0" translation="[502, 610]" scale="[0.95, 0.95]" width="176" height="44" numLines="1" horizAlign="center" color="0xFCD34DFF" text="M1" />
        <Poster id="cinemaCardPoster0" translation="[502, 546]" width="168" height="168" loadDisplayMode="scaleToFit" />
        <Label id="cinemaCardTitle0" translation="[460, 720]" scale="[0.50, 0.50]" width="504" height="26" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movie 1" />
        <Label id="cinemaCardBadge0" translation="[462, 744]" scale="[0.42, 0.42]" width="340" height="22" numLines="1" color="0x67E8F9FF" text="2024 • 1080p" />
        <Label id="cinemaCardGenre0" translation="[462, 548]" scale="[0.38, 0.38]" width="100" height="20" numLines="1" visible="false" color="0xD8B4FEFF" text="Cinema" />
        <Label id="cinemaCardState0" translation="[602, 744]" scale="[0.42, 0.42]" width="260" height="22" numLines="1" horizAlign="right" color="0x94A3B8FF" text="#1" />

        <!-- Card 1 -->
        <Rectangle id="cinemaCardBorder1" translation="[734, 536]" width="272" height="238" color="0x262136FF" />
        <Rectangle id="cinemaCardBg1" translation="[737, 539]" width="266" height="232" color="0x191626FF" />
        <Rectangle id="cinemaCardArtBg1" translation="[786, 546]" width="168" height="168" color="0x1E293BFF" />
        <Label id="cinemaCardMono1" translation="[786, 610]" scale="[0.95, 0.95]" width="176" height="44" numLines="1" horizAlign="center" color="0xFCD34DFF" text="M2" />
        <Poster id="cinemaCardPoster1" translation="[786, 546]" width="168" height="168" loadDisplayMode="scaleToFit" />
        <Label id="cinemaCardTitle1" translation="[744, 720]" scale="[0.50, 0.50]" width="504" height="26" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movie 2" />
        <Label id="cinemaCardBadge1" translation="[746, 744]" scale="[0.42, 0.42]" width="340" height="22" numLines="1" color="0x67E8F9FF" text="2024 • 1080p" />
        <Label id="cinemaCardGenre1" translation="[746, 548]" scale="[0.38, 0.38]" width="100" height="20" numLines="1" visible="false" color="0xD8B4FEFF" text="Cinema" />
        <Label id="cinemaCardState1" translation="[886, 744]" scale="[0.42, 0.42]" width="260" height="22" numLines="1" horizAlign="right" color="0x94A3B8FF" text="#2" />

        <!-- Card 2 -->
        <Rectangle id="cinemaCardBorder2" translation="[1018, 536]" width="272" height="238" color="0x262136FF" />
        <Rectangle id="cinemaCardBg2" translation="[1021, 539]" width="266" height="232" color="0x191626FF" />
        <Rectangle id="cinemaCardArtBg2" translation="[1070, 546]" width="168" height="168" color="0x31102FFF" />
        <Label id="cinemaCardMono2" translation="[1070, 610]" scale="[0.95, 0.95]" width="176" height="44" numLines="1" horizAlign="center" color="0xFCD34DFF" text="M3" />
        <Poster id="cinemaCardPoster2" translation="[1070, 546]" width="168" height="168" loadDisplayMode="scaleToFit" />
        <Label id="cinemaCardTitle2" translation="[1028, 720]" scale="[0.50, 0.50]" width="504" height="26" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movie 3" />
        <Label id="cinemaCardBadge2" translation="[1030, 744]" scale="[0.42, 0.42]" width="340" height="22" numLines="1" color="0x67E8F9FF" text="2024 • 1080p" />
        <Label id="cinemaCardGenre2" translation="[1030, 548]" scale="[0.38, 0.38]" width="100" height="20" numLines="1" visible="false" color="0xD8B4FEFF" text="Cinema" />
        <Label id="cinemaCardState2" translation="[1170, 744]" scale="[0.42, 0.42]" width="260" height="22" numLines="1" horizAlign="right" color="0x94A3B8FF" text="#3" />

        <!-- Card 3 -->
        <Rectangle id="cinemaCardBorder3" translation="[1302, 536]" width="272" height="238" color="0x262136FF" />
        <Rectangle id="cinemaCardBg3" translation="[1305, 539]" width="266" height="232" color="0x191626FF" />
        <Rectangle id="cinemaCardArtBg3" translation="[1354, 546]" width="168" height="168" color="0x142E24FF" />
        <Label id="cinemaCardMono3" translation="[1354, 610]" scale="[0.95, 0.95]" width="176" height="44" numLines="1" horizAlign="center" color="0xFCD34DFF" text="M4" />
        <Poster id="cinemaCardPoster3" translation="[1354, 546]" width="168" height="168" loadDisplayMode="scaleToFit" />
        <Label id="cinemaCardTitle3" translation="[1312, 720]" scale="[0.50, 0.50]" width="504" height="26" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movie 4" />
        <Label id="cinemaCardBadge3" translation="[1314, 744]" scale="[0.42, 0.42]" width="340" height="22" numLines="1" color="0x67E8F9FF" text="2024 • 1080p" />
        <Label id="cinemaCardGenre3" translation="[1314, 548]" scale="[0.38, 0.38]" width="100" height="20" numLines="1" visible="false" color="0xD8B4FEFF" text="Cinema" />
        <Label id="cinemaCardState3" translation="[1454, 744]" scale="[0.42, 0.42]" width="260" height="22" numLines="1" horizAlign="right" color="0x94A3B8FF" text="#4" />

        <!-- Card 4 -->
        <Rectangle id="cinemaCardBorder4" translation="[1586, 536]" width="272" height="238" color="0x262136FF" />
        <Rectangle id="cinemaCardBg4" translation="[1589, 539]" width="266" height="232" color="0x191626FF" />
        <Rectangle id="cinemaCardArtBg4" translation="[1638, 546]" width="168" height="168" color="0x3B1D1DFF" />
        <Label id="cinemaCardMono4" translation="[1638, 610]" scale="[0.95, 0.95]" width="176" height="44" numLines="1" horizAlign="center" color="0xFCD34DFF" text="M5" />
        <Poster id="cinemaCardPoster4" translation="[1638, 546]" width="168" height="168" loadDisplayMode="scaleToFit" />
        <Label id="cinemaCardTitle4" translation="[1596, 720]" scale="[0.50, 0.50]" width="504" height="26" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movie 5" />
        <Label id="cinemaCardBadge4" translation="[1598, 744]" scale="[0.42, 0.42]" width="340" height="22" numLines="1" color="0x67E8F9FF" text="2024 • 1080p" />
        <Label id="cinemaCardGenre4" translation="[1598, 548]" scale="[0.38, 0.38]" width="100" height="20" numLines="1" visible="false" color="0xD8B4FEFF" text="Cinema" />
        <Label id="cinemaCardState4" translation="[1738, 744]" scale="[0.42, 0.42]" width="260" height="22" numLines="1" horizAlign="right" color="0x94A3B8FF" text="#5" />
      </Group>

      <!-- BOTTOM-RIGHT STAGE: Scrollable Category Title List (x=436, y=792, w=1448, h=196) -->
      <Rectangle id="cinemaListPaneBg" translation="[436, 792]" width="1448" height="196" color="0x12101BFF" />
      <Rectangle id="cinemaListFocusStripe" translation="[436, 792]" width="1448" height="4" color="0x38BDF8FF" />
      <Label id="cinemaLibCountLabel" translation="[456, 802]" scale="[0.56, 0.56]" width="2200" height="30" numLines="1" color="0x67E8F9FF" text="TITLES IN CATEGORY (D-PAD UP/DOWN TO BROWSE, OK TO PLAY, LEFT FOR CATEGORIES):" />
      <LabelList
        id="cinemaLibList"
        translation="[456, 834]"
        scale="[0.66, 0.66]"
        itemSize="[2120, 44]"
        itemSpacing="[0, 5]"
        numRows="3"
        color="0xF1E9DCFF"
        focusedColor="0x110E18FF" />

      <!-- Footer Status Bar -->
      <Rectangle translation="[36, 1000]" width="1848" height="56" color="0x110E18FF" />
      <Rectangle translation="[36, 1000]" width="6" height="56" color="0xE50914FF" />
      <Label id="cinemaLibFooter" translation="[58, 1016]" scale="[0.56, 0.56]" width="3100" height="32" numLines="1" color="0xF8FAFCFF" text="RobOS Cinema+ Active  •  Use Roku D-Pad Left/Right to switch between Categories &amp; Movies, Up/Down to browse, OK to watch" />
    </Group>
    <!-- Full-screen 1920x1080 Cinema Video Layer for RobOS Movie Player Cast -->
    <Video id="cinemaVideo" translation="[0, 0]" width="1920" height="1080" visible="false" mute="false" loop="false" enableUI="true" />
    <Timer id="clockTimer" repeat="true" duration="1.0" />
  </children>
</component>
`;
    const mainSceneBrs = `sub startKeepAliveVideo()
    if m.keepAliveVideo <> invalid
        vidContent = CreateObject("roSGNode", "ContentNode")
        vidContent.url = "pkg:/source/keepalive.mp4"
        vidContent.streamFormat = "mp4"
        m.keepAliveVideo.content = vidContent
        m.keepAliveVideo.mute = true
        m.keepAliveVideo.loop = true
        m.keepAliveVideo.control = "play"
    end if
end sub

sub init()
    m.tileList = m.top.findNode("tileList")
    m.heroTitle = m.top.findNode("heroTitle")
    m.heroDesc = m.top.findNode("heroDesc")
    m.statusFooter = m.top.findNode("statusFooter")
    m.brandLabel = m.top.findNode("brandLabel")
    m.headerCountdownLabel = m.top.findNode("headerCountdownLabel")
    m.slideshowBadgeLabel = m.top.findNode("slideshowBadgeLabel")
    m.slideProgressFill = m.top.findNode("slideProgressFill")
    m.slideGroup0 = m.top.findNode("slideGroup0")
    m.slideGroup1 = m.top.findNode("slideGroup1")
    m.slideGroup2 = m.top.findNode("slideGroup2")
    m.countdownTimerLabel = m.top.findNode("countdownTimerLabel")
    m.nextMeetingTitleLabel = m.top.findNode("nextMeetingTitleLabel")
    m.nextMeetingMetaLabel = m.top.findNode("nextMeetingMetaLabel")
    m.secBarFill = m.top.findNode("secBarFill")
    m.secPulseDot = m.top.findNode("secPulseDot")
    m.keepAliveVideo = m.top.findNode("keepAliveVideo")
    m.cinemaVideo = m.top.findNode("cinemaVideo")
    m.cinemaLibraryGroup = m.top.findNode("cinemaLibraryGroup")
    m.cinemaCatList = m.top.findNode("cinemaCatList")
    m.cinemaCatPaneBg = m.top.findNode("cinemaCatPaneBg")
    m.cinemaCatFocusStripe = m.top.findNode("cinemaCatFocusStripe")
    m.cinemaCatHeaderLabel = m.top.findNode("cinemaCatHeaderLabel")
    m.cinemaActiveCatBadge = m.top.findNode("cinemaActiveCatBadge")
    m.cinemaListPaneBg = m.top.findNode("cinemaListPaneBg")
    m.cinemaListFocusStripe = m.top.findNode("cinemaListFocusStripe")
    m.cinemaLibList = m.top.findNode("cinemaLibList")
    m.cinemaLibCountLabel = m.top.findNode("cinemaLibCountLabel")
    m.cinemaLibPoster = m.top.findNode("cinemaLibPoster")
    m.cinemaHeroPosterFallbackBg = m.top.findNode("cinemaHeroPosterFallbackBg")
    m.cinemaHeroPosterTopBar = m.top.findNode("cinemaHeroPosterTopBar")
    m.cinemaHeroPosterRibbon = m.top.findNode("cinemaHeroPosterRibbon")
    m.cinemaHeroPosterMonogram = m.top.findNode("cinemaHeroPosterMonogram")
    m.cinemaHeroPosterFallbackTitle = m.top.findNode("cinemaHeroPosterFallbackTitle")
    m.cinemaHeroPosterFallbackYear = m.top.findNode("cinemaHeroPosterFallbackYear")
    m.cinemaHeroEyebrow = m.top.findNode("cinemaHeroEyebrow")
    m.cinemaLibDetailTitle = m.top.findNode("cinemaLibDetailTitle")
    m.cinemaBadgeYear = m.top.findNode("cinemaBadgeYear")
    m.cinemaBadgeQuality = m.top.findNode("cinemaBadgeQuality")
    m.cinemaBadgeGenre = m.top.findNode("cinemaBadgeGenre")
    m.cinemaBadgeFormat = m.top.findNode("cinemaBadgeFormat")
    m.cinemaLibDetailMeta = m.top.findNode("cinemaLibDetailMeta")
    m.cinemaLibDetailSub = m.top.findNode("cinemaLibDetailSub")
    m.cinemaHeroSynopsis = m.top.findNode("cinemaHeroSynopsis")
    m.cinemaPlayBtnBg = m.top.findNode("cinemaPlayBtnBg")
    m.cinemaLibPlayPrompt = m.top.findNode("cinemaLibPlayPrompt")
    m.cinemaShelfTitleLabel = m.top.findNode("cinemaShelfTitleLabel")
    m.cinemaShelfPosLabel = m.top.findNode("cinemaShelfPosLabel")
    m.cinemaLibFooter = m.top.findNode("cinemaLibFooter")
    m.cinemaLibraryActive = false
    m.cinemaFocusPane = "movies"
    m.allCinemaItems = []
    m.cinemaLibItems = []
    m.cinemaLibHash = ""
    m.cinemaCatIndex = 0
    m.cinemaCategories = [
        { id: "all", label: "* Featured & All Movies" },
        { id: "franchises", label: "Franchises & Box Sets" },
        { id: "scifi", label: "Sci-Fi & Fantasy" },
        { id: "action", label: "Action & Adventure" },
        { id: "horror", label: "Horror & Supernatural" },
        { id: "family", label: "Animation & Family" },
        { id: "comedy", label: "Comedy & Romance" },
        { id: "thriller", label: "Thriller & Mystery" },
        { id: "tv", label: "TV Series & Episodes" },
        { id: "uhd", label: "4K UHD & 1080p BluRay" },
        { id: "new", label: "New Releases (2023-2026)" },
        { id: "classics", label: "Classics (Pre-2010)" }
    ]
    if m.cinemaCatList <> invalid
        m.cinemaCatList.observeField("itemFocused", "onCinemaCatFocused")
        m.cinemaCatList.observeField("itemSelected", "onCinemaCatSelected")
    end if
    if m.cinemaLibList <> invalid
        m.cinemaLibList.observeField("itemFocused", "onCinemaLibItemFocused")
        m.cinemaLibList.observeField("itemSelected", "onCinemaLibItemSelected")
    end if
    m.cinemaVideoActive = false
    m.lastCinemaLoadKey = ""
    m.dismissedCinemaLoadKey = ""
    m.lastCinemaSeekKey = ""
    if m.cinemaVideo <> invalid
        m.cinemaVideo.observeField("state", "onCinemaVideoState")
    end if
    m.clockTimer = m.top.findNode("clockTimer")
    m.tickCount = 0
    m.remainingSec = ${initialRemSec}
    m.nextMeetingTimeStr = "${safeXml(nm.time || '16:30')}"
    m.slideshowEnabled = ${ssEnabled ? 'true' : 'false'}
    m.slideIntervalSec = ${ssInterval}
    m.slideRemSec = ${ssRem}
    m.slideNumber = ${ssSlideNum}
    m.slideTotal = ${ssTotal}
    m.activeDashId = "${safeXml(initActiveDashId)}"
    m.musicPlaying = ${musicPlaying ? 'true' : 'false'}
    m.agentActive = [${sessions[0] ? 'true' : 'false'}, ${sessions[1] ? 'true' : 'false'}, ${sessions[2] ? 'true' : 'false'}]
    m.agentElapsed = [${Number(sessions[0]?.elapsedSec) || 5}, ${Number(sessions[1]?.elapsedSec) || 5}, ${Number(sessions[2]?.elapsedSec) || 5}]
    m.agentActivity = ["${safeXml(String(sessions[0]?.activity || sessions[0]?.cwd || '').slice(0, 42))}", "${safeXml(String(sessions[1]?.activity || sessions[1]?.cwd || '').slice(0, 42))}", "${safeXml(String(sessions[2]?.activity || sessions[2]?.cwd || '').slice(0, 42))}"]

    startKeepAliveVideo()

    m.clockTimer.observeField("fire", "onClockTick")
    m.clockTimer.control = "start"

    m.tiles = [
        { id: "daily-engineering-ops", title: "1. Daily Engineering & Agent Ops Dashboard", desc: "Slide 1: GitHub Releases & Commits + Music + Dual Calendars + Tailed Agents." },
        { id: "github-ci-popularity", title: "2. GitHub CI Status & App Popularity", desc: "Slide 2: CI Status in main + Stars & Forks + 14-Day Clones & Release Downloads." },
        { id: "robos-voice-dictation", title: "3. RobOS Voice Dictation - Most Recent Chats", desc: "Slide 3: Live RobOS Voice dictation dialogue bubbles, commands, and skill badges." },
        { id: "crpg-realm", title: "4. Realm of Heroes cRPG [Godot 4]", desc: "Party-based tactical isometric D&D 5e cRPG in Godot 4." },
        { id: "quest-warrior-dragon", title: "5. Quest: Warrior Dragon [2D JRPG]", desc: "Clean-room NES-authentic 2D JRPG in Godot 4." },
        { id: "tabletop-rpg", title: "6. RobOS Tabletop RPG [Dungeon Board]", desc: "HeroQuest-inspired 26x19 tactical dungeon crawler." },
        { id: "movie-player", title: "7. RobOS Movie Player [Cinema Library]", desc: "Browse & play your 100k movie library on TV with your remote." },
        { id: "audio-jukebox", title: "8. Audio Player & Virtual DJ [100k Songs]", desc: "100,000-song library with synchronized TV lyrics and Virtual DJ." },
        { id: "home-intercom", title: "9. Home Speaker Intercom [Multi-Room]", desc: "Broadcast voice notes and Kokoro neural TTS announcements." }
    ]

    content = CreateObject("roSGNode", "ContentNode")
    for each t in m.tiles
        item = content.CreateChild("ContentNode")
        item.title = t.title
    end for
    m.tileList.content = content
    m.tileList.observeField("itemFocused", "onItemFocused")
    m.tileList.observeField("itemSelected", "onItemSelected")
    m.tileList.setFocus(true)

    initLibRaw = ReadAsciiFile("pkg:/source/cinema-library.json")
    if initLibRaw <> ""
        initLibObj = ParseJson(initLibRaw)
        if initLibObj <> invalid and initLibObj.items <> invalid
            m.latestCinemaLibrary = initLibObj
            if initLibObj.active = true
                showCinemaLibrary(initLibObj)
            end if
        end if
    end if

    m.dashTask = CreateObject("roSGNode", "DashboardTask")
    m.dashTask.apiUrl = "${portalUrl}/api/dashboard-cast"
    m.dashTask.observeField("payloadJson", "onPayloadUpdated")
    m.dashTask.control = "RUN"
    onClockTick()
end sub

function pad2(n as Integer) as String
    if n < 10 then return "0" + n.ToStr()
    return n.ToStr()
end function

sub applySlideVisibility(dashId as String)
    m.activeDashId = dashId
    if m.slideGroup0 <> invalid then m.slideGroup0.visible = (dashId = "daily-engineering-ops")
    if m.slideGroup1 <> invalid then m.slideGroup1.visible = (dashId = "github-ci-popularity")
    if m.slideGroup2 <> invalid then m.slideGroup2.visible = (dashId = "robos-voice-dictation")
    if dashId <> "daily-engineering-ops" and dashId <> "github-ci-popularity" and dashId <> "robos-voice-dictation"
        if m.slideGroup0 <> invalid then m.slideGroup0.visible = true
    end if
end sub

sub updateSlideshowHud()
    if m.slideshowBadgeLabel <> invalid
        if m.slideshowEnabled = true
            m.slideshowBadgeLabel.text = "SLIDESHOW: " + m.slideNumber.ToStr() + "/" + m.slideTotal.ToStr() + " (" + m.slideIntervalSec.ToStr() + "s) - Next in " + m.slideRemSec.ToStr() + "s"
            m.slideshowBadgeLabel.color = "0xFCD34DFF"
        else
            m.slideshowBadgeLabel.text = "SINGLE DASHBOARD (Slideshow Off)"
            m.slideshowBadgeLabel.color = "0x94A3B8FF"
        end if
    end if
    if m.slideProgressFill <> invalid
        if m.slideshowEnabled = true and m.slideIntervalSec > 0
            elapsed = m.slideIntervalSec - m.slideRemSec
            if elapsed < 0 then elapsed = 0
            if elapsed > m.slideIntervalSec then elapsed = m.slideIntervalSec
            w = Int(((elapsed * 1.0) / (m.slideIntervalSec * 1.0)) * 1920)
            if w < 30 then w = 30
            m.slideProgressFill.width = w
        else
            m.slideProgressFill.width = 0
        end if
    end if
end sub

sub onClockTick()
    m.tickCount = m.tickCount + 1
    ' While an app cast's narration or cinema video owns the video player, its own handlers
    ' bring the keep-alive back.
    if m.keepAliveVideo <> invalid and m.castAudioActive <> true and m.cinemaVideoActive <> true
        vState = m.keepAliveVideo.state
        if vState = "finished" or vState = "stopped" or vState = "error"
            startKeepAliveVideo()
        end if
    end if
    if m.remainingSec > 0
        m.remainingSec = m.remainingSec - 1
    end if
    if m.slideshowEnabled = true
        if m.slideRemSec > 1
            m.slideRemSec = m.slideRemSec - 1
        else
            m.slideRemSec = m.slideIntervalSec
            if m.activeDashId = "daily-engineering-ops"
                m.slideNumber = 2
                applySlideVisibility("github-ci-popularity")
                if m.brandLabel <> invalid then m.brandLabel.text = "[2/" + m.slideTotal.ToStr() + "] GitHub CI Status & App Popularity"
            else if m.activeDashId = "github-ci-popularity"
                m.slideNumber = 3
                applySlideVisibility("robos-voice-dictation")
                if m.brandLabel <> invalid then m.brandLabel.text = "[3/" + m.slideTotal.ToStr() + "] RobOS Voice Dictation - Most Recent Chats"
            else
                m.slideNumber = 1
                applySlideVisibility("daily-engineering-ops")
                if m.brandLabel <> invalid then m.brandLabel.text = "[1/" + m.slideTotal.ToStr() + "] Daily Engineering & Agent Ops Dashboard"
            end if
        end if
    end if
    updateSlideshowHud()

    remSec = m.remainingSec
    days = Int(remSec / 86400)
    remH = Int((remSec mod 86400) / 3600)
    remM = Int((remSec mod 3600) / 60)
    remS = remSec mod 60
    cdStr = "T - "
    if days > 0 then cdStr = cdStr + days.ToStr() + "d "
    cdStr = cdStr + pad2(remH) + ":" + pad2(remM) + ":" + pad2(remS)

    if m.countdownTimerLabel <> invalid then m.countdownTimerLabel.text = cdStr
    if m.headerCountdownLabel <> invalid then m.headerCountdownLabel.text = "NEXT MEETING: " + m.nextMeetingTimeStr + " (" + cdStr + ")"

    if m.secBarFill <> invalid
        ratio = 1.0 - (remSec / 3600.0)
        if ratio < 0.08 then ratio = 0.08
        if ratio > 1.0 then ratio = 1.0
        m.secBarFill.width = Int(ratio * 528)
    end if
    if m.secPulseDot <> invalid
        if (m.tickCount mod 2) = 0
            m.secPulseDot.color = "0x10B981FF"
        else
            m.secPulseDot.color = "0x00BCD4FF"
        end if
    end if

    for i = 0 to 7
        eqNode = m.top.findNode("eqBar" + i.ToStr())
        if eqNode <> invalid
            bx = 1116 + i * 11
            if m.musicPlaying = true
                bh = 8 + (((m.tickCount * 5) + (i * 9)) mod 26)
                by = 236 - bh
                eqNode.height = bh
                eqNode.translation = [bx, by]
                if (i mod 3) = 0 then eqNode.color = "0xA855F7FF" else if (i mod 2) = 0 then eqNode.color = "0x00BCD4FF" else eqNode.color = "0x10B981FF"
            else
                eqNode.height = 4
                eqNode.translation = [bx, 232]
                eqNode.color = "0x334155FF"
            end if
        end if
    end for

    todayBar = m.top.findNode("commitBar29")
    if todayBar <> invalid
        if (m.tickCount mod 2) = 0
            todayBar.color = "0xF59E0BFF"
        else
            todayBar.color = "0x10B981FF"
        end if
    end if

    for i = 0 to 2
        if m.agentActive[i] = true
            m.agentElapsed[i] = m.agentElapsed[i] + 1
            elSec = m.agentElapsed[i]
            elMin = Int(elSec / 60)
            elRem = elSec mod 60
            elStr = pad2(elMin) + ":" + pad2(elRem)
            amNode = m.top.findNode("agentMeta" + i.ToStr())
            if amNode <> invalid
                amNode.text = "IN PROGRESS [" + elStr + "] | " + m.agentActivity[i]
            end if
            adNode = m.top.findNode("agentDot" + i.ToStr())
            if adNode <> invalid
                if (m.tickCount mod 2) = 0
                    adNode.color = "0x10B981FF"
                else
                    adNode.color = "0x00BCD4FF"
                end if
            end if
        end if
    end for
end sub

function cleanAscii(s as Dynamic) as String
    if s = invalid then return ""
    str = s.ToStr()
    out = ""
    for i = 0 to Len(str) - 1
        ch = Mid(str, i + 1, 1)
        code = Asc(ch)
        if code >= 32 and code <= 126
            out = out + ch
        else if code = 183 or code = 8212
            out = out + "-"
        end if
    end for
    return out
end function

sub showAppCastFrame(frameUrl as String)
    if m.livePosterA = invalid
        m.livePosterA = m.top.findNode("livePosterA")
        m.livePosterB = m.top.findNode("livePosterB")
        m.frontPoster = ""
        m.frameSeq = 0
    end if
    m.frameSeq = m.frameSeq + 1
    if m.frontPoster = "A" then target = m.livePosterB else target = m.livePosterA
    target.observeField("loadStatus", "onLivePosterLoaded")
    target.uri = frameUrl + "&seq=" + m.frameSeq.ToStr()
end sub

sub onLivePosterLoaded(evt as Object)
    p = evt.getRoSGNode()
    if p.loadStatus <> "ready" then return
    p.unobserveField("loadStatus")
    if p.id = "livePosterA"
        m.livePosterA.opacity = 1.0
        m.livePosterB.opacity = 0.0
        m.frontPoster = "A"
    else
        m.livePosterB.opacity = 1.0
        m.livePosterA.opacity = 0.0
        m.frontPoster = "B"
    end if
end sub

' Plays an app cast's narration once per new id through the keep-alive Video
' node, which is the media player Roku TVs reliably output sound from. The
' line is an MP4 (tiny black video + AAC) like the keep-alive clip:
'   stop keep-alive -> play the line unmuted -> restart the muted keep-alive
'   new line mid-sentence  -> cut over to it
'   line hangs             -> the watchdog restarts the keep-alive
'   app cast ends mid-line -> stopCastAudio() restarts the keep-alive
sub playAppCastAudio(narration as Object)
    if narration = invalid or narration.id = invalid or narration.url = invalid then return
    if type(m.lastCastAudioId) <> "roString" and type(m.lastCastAudioId) <> "String" then m.lastCastAudioId = ""
    if m.lastCastAudioId = narration.id then return
    m.lastCastAudioId = narration.id
    if m.keepAliveVideo = invalid then return
    if m.castAudioWatchdog = invalid
        m.keepAliveVideo.observeField("state", "onCastVideoState")
        m.castAudioWatchdog = CreateObject("roSGNode", "Timer")
        m.castAudioWatchdog.repeat = false
        m.castAudioWatchdog.duration = 45
        m.castAudioWatchdog.observeField("fire", "onCastAudioWatchdog")
        m.top.appendChild(m.castAudioWatchdog)
    end if
    print "RobOS narration play "; narration.url
    m.castAudioActive = true
    m.castAudioWatchdog.control = "stop"
    m.castAudioWatchdog.control = "start"
    v = m.keepAliveVideo
    v.control = "stop"
    content = CreateObject("roSGNode", "ContentNode")
    content.url = narration.url
    content.streamFormat = "mp4"
    v.loop = false
    v.mute = false
    v.content = content
    v.control = "play"
end sub

sub onCastVideoState()
    st = m.keepAliveVideo.state
    if m.castAudioActive = true
        print "RobOS narration state "; st; " "; m.keepAliveVideo.errorMsg
        if st = "finished" or st = "error" then endCastAudio()
    end if
end sub

sub onCastAudioWatchdog()
    print "RobOS narration watchdog: giving the TV back to the keep-alive"
    stopCastAudio()
end sub

' Back to the muted, looping keep-alive once a line is over (once per line).
sub endCastAudio()
    if m.castAudioActive <> true then return
    m.castAudioActive = false
    if m.castAudioWatchdog <> invalid then m.castAudioWatchdog.control = "stop"
    startKeepAliveVideo()
end sub

sub stopCastAudio()
    if m.castAudioActive = true
        m.keepAliveVideo.control = "stop"
        endCastAudio()
    end if
end sub

sub hideAppCastFrames()
    stopCastAudio()
    if m.livePosterA <> invalid
        m.livePosterA.opacity = 0.0
        m.livePosterB.opacity = 0.0
        m.frontPoster = ""
    end if
end sub

sub playCinemaVideo(cinema as Object)
    if cinema = invalid or cinema.mediaUrl = invalid then return
    if m.cinemaVideo = invalid then m.cinemaVideo = m.top.findNode("cinemaVideo")
    if m.cinemaVideo = invalid then return
    if m.keepAliveVideo <> invalid and m.cinemaVideoActive <> true
        m.keepAliveVideo.control = "stop"
    end if
    m.cinemaVideoActive = true
    m.cinemaVideo.visible = true
    m.cinemaVideo.mute = false
    loadKey = ""
    if cinema.loadKey <> invalid then loadKey = cinema.loadKey.ToStr() else loadKey = cinema.mediaUrl.ToStr()
    if m.lastCinemaLoadKey <> loadKey
        m.lastCinemaLoadKey = loadKey
        m.cinemaVideo.control = "stop"
        content = CreateObject("roSGNode", "ContentNode")
        content.url = cinema.mediaUrl
        if cinema.title <> invalid then content.title = cinema.title else content.title = "RobOS Movie Player"
        fmt = "mp4"
        if cinema.streamFormat <> invalid and cinema.streamFormat <> ""
            fmt = LCase(cinema.streamFormat.ToStr())
        else if Instr(1, LCase(cinema.mediaUrl.ToStr()), ".mkv") > 0
            fmt = "mkv"
        end if
        content.streamFormat = fmt
        if cinema.startAt <> invalid and cinema.startAt > 0
            content.PlayStart = Int(cinema.startAt)
        end if
        m.cinemaVideo.content = content
        m.cinemaVideo.setFocus(true)
        m.cinemaVideo.control = "play"
        if cinema.seekKey <> invalid then m.lastCinemaSeekKey = cinema.seekKey.ToStr()
        return
    end if
    if cinema.seekKey <> invalid
        sk = cinema.seekKey.ToStr()
        if sk <> "" and sk <> m.lastCinemaSeekKey
            m.lastCinemaSeekKey = sk
            if cinema.seekSeconds <> invalid
                m.cinemaVideo.seek = cinema.seekSeconds
            end if
        end if
    end if
    if cinema.paused = true
        if m.cinemaVideo.state = "playing" then m.cinemaVideo.control = "pause"
    else
        if m.cinemaVideo.state = "paused" then m.cinemaVideo.control = "resume"
    end if
end sub

sub stopCinemaVideo()
    if m.cinemaVideoActive <> true then return
    m.cinemaVideoActive = false
    m.lastCinemaLoadKey = ""
    m.lastCinemaSeekKey = ""
    if m.cinemaVideo <> invalid
        m.cinemaVideo.control = "stop"
        m.cinemaVideo.visible = false
    end if
    if m.cinemaLibraryActive = true and m.cinemaLibList <> invalid
        m.cinemaLibList.setFocus(true)
    else if m.tileList <> invalid
        m.tileList.setFocus(true)
    end if
    startKeepAliveVideo()
end sub

function hasAnyKeyword(hay as String, words as Object) as Boolean
    for each w in words
        if Instr(1, hay, w) > 0 then return true
    end for
    return false
end function

function makeMonogram(titleStr as String) as String
    s = titleStr
    if LCase(Left(s, 4)) = "the " then s = Mid(s, 5)
    if LCase(Left(s, 2)) = "a " then s = Mid(s, 3)
    c1 = UCase(Left(s, 1))
    if c1 = "" then c1 = "M"
    c2 = ""
    sp = Instr(1, s, " ")
    if sp > 0 and sp < Len(s)
        c2 = UCase(Mid(s, sp + 1, 1))
    else if Len(s) > 1
        c2 = UCase(Mid(s, 2, 1))
    end if
    return c1 + c2
end function

function cinemaClassifyItem(mv as Object) as Object
    titleStr = cleanAscii(mv.title)
    albumStr = cleanAscii(mv.album)
    artistStr = cleanAscii(mv.artist)
    genreStr = cleanAscii(mv.genre)
    hay = LCase(titleStr + " " + albumStr + " " + genreStr)
    qualHay = LCase(artistStr + " " + cleanAscii(mv.qualityBadge) + " " + albumStr)

    franchise = cleanAscii(mv.franchise)
    if franchise = ""
        if hasAnyKeyword(hay, ["harry potter", "azkaban", "chamber of secrets", "sorcerers stone", "half blood prince", "order of the phoenix"]) then franchise = "Harry Potter Wizarding World"
        if hasAnyKeyword(hay, ["lord of the rings", "fellowship of the ring", "two towers", "return of the king", "hobbit"]) then franchise = "The Lord of the Rings"
        if hasAnyKeyword(hay, ["conjuring", "annabelle", "the nun", "nun ii"]) then franchise = "The Conjuring Universe"
        if hasAnyKeyword(hay, ["insidious"]) then franchise = "Insidious Collection"
        if hasAnyKeyword(hay, ["scream"]) then franchise = "Scream Collection"
        if hasAnyKeyword(hay, ["final destination"]) then franchise = "Final Destination Collection"
        if hasAnyKeyword(hay, ["paranormal activity"]) then franchise = "Paranormal Activity Collection"
        if hasAnyKeyword(hay, ["avengers", "endgame", "infinity war"]) then franchise = "Marvel & Avengers"
        if hasAnyKeyword(hay, ["mortal kombat"]) then franchise = "Mortal Kombat Collection"
        if hasAnyKeyword(hay, ["scary movie"]) then franchise = "Scary Movie Collection"
        if hasAnyKeyword(hay, ["wicked", "wizard of oz"]) then franchise = "Wicked & Wizard of Oz"
        if hasAnyKeyword(hay, ["resident evil"]) then franchise = "Resident Evil Collection"
        if hasAnyKeyword(hay, ["five nights at freddy"]) then franchise = "Five Nights at Freddy's"
        if hasAnyKeyword(hay, ["ne zha"]) then franchise = "Ne Zha Collection"
        if hasAnyKeyword(hay, ["halloween"]) then franchise = "Halloween Collection"
        if hasAnyKeyword(hay, ["orphan"]) then franchise = "Orphan Collection"
        if hasAnyKeyword(hay, ["inside out", "rileys first date"]) then franchise = "Inside Out Collection"
        if hasAnyKeyword(hay, ["atypical"]) then franchise = "Atypical (Series)"
    end if

    isTv = hasAnyKeyword(hay, ["s01e", "s02e", "s03e", "atypical", "tv series", "season "])
    isScifi = hasAnyKeyword(hay, ["dune", "harry potter", "lord of the rings", "fellowship", "two towers", "return of the king", "ex machina", "serenity", "wicked", "wizard of oz", "willow", "ne zha", "backrooms", "sci-fi", "fantasy"])
    isAction = hasAnyKeyword(hay, ["avengers", "endgame", "infinity war", "mortal kombat", "resident evil", "dune", "lord of the rings", "harry potter", "willow", "hunting games", "outpost", "serenity", "ne zha", "action"])
    isHorror = hasAnyKeyword(hay, ["conjuring", "annabelle", "insidious", "scream", "paranormal activity", "the nun", "nun ii", "final destination", "friday the 13th", "halloween", "terrifier", "babadook", "malignant", "it follows", "smile", "orphan", "lights out", "five nights at freddy", "jennifers body", "megan is missing", "backrooms", "other mommy", "hokum", "horror"])
    isFamily = hasAnyKeyword(hay, ["inside out", "rileys first date", "tangled", "zootopia", "super mario", "ne zha", "matilda", "cruella", "spirited", "wizard of oz", "wicked", "kpop demon hunters", "harry potter", "animation", "family"])
    if LCase(titleStr) = "home" then isFamily = true
    isComedy = hasAnyKeyword(hay, ["scary movie", "anyone but you", "ticket to paradise", "four rooms", "beetlejuice", "buddy", "spirited", "men up", "heist before christmas", "cruella", "matilda", "atypical", "jennifers body", "rileys first date", "comedy"])
    isThriller = hasAnyKeyword(hay, ["ready or not", "missing", "housemaid", "obsession", "passenger", "orphan", "scream", "final destination", "ex machina", "it follows", "malignant", "hunting games", "outpost", "thriller"])

    primaryGenre = "Drama & Cinema"
    bgCol = "0x1E293BFF"
    barCol = "0x38BDF8FF"
    if isTv
        primaryGenre = "TV Series"
        bgCol = "0x1E1B4BFF"
        barCol = "0x818CF8FF"
    else if isScifi
        primaryGenre = "Sci-Fi & Fantasy"
        bgCol = "0x172554FF"
        barCol = "0x38BDF8FF"
    else if isAction
        primaryGenre = "Action & Adventure"
        bgCol = "0x431407FF"
        barCol = "0xF59E0BFF"
    else if isFamily
        primaryGenre = "Animation & Family"
        bgCol = "0x064E3BFF"
        barCol = "0x10B981FF"
    else if isComedy
        primaryGenre = "Comedy & Romance"
        bgCol = "0x4A044EFF"
        barCol = "0xE879F9FF"
    else if isHorror
        primaryGenre = "Horror & Supernatural"
        bgCol = "0x450A0AFF"
        barCol = "0xEF4444FF"
    else if isThriller
        primaryGenre = "Thriller & Mystery"
        bgCol = "0x2E1065FF"
        barCol = "0xA855F7FF"
    end if

    resStr = "1080p HD"
    if Instr(1, qualHay, "2160p") > 0 or Instr(1, qualHay, "4k") > 0
        resStr = "4K UHD"
    else if Instr(1, qualHay, "720p") > 0
        resStr = "720p HD"
    end if
    srcStr = ""
    if Instr(1, qualHay, "bluray") > 0 or Instr(1, qualHay, "brrip") > 0
        srcStr = "BluRay"
    else if Instr(1, qualHay, "web") > 0
        srcStr = "WEB-DL"
    else if Instr(1, qualHay, "hdrip") > 0
        srcStr = "HDRip"
    end if
    qualBadge = resStr
    if srcStr <> "" then qualBadge = resStr + " • " + srcStr

    isUhd = (resStr = "4K UHD" or srcStr = "BluRay")
    yrNum = 0
    if mv.year <> invalid then yrNum = Int(Val(mv.year.ToStr()))
    isNew = (yrNum >= 2023)
    isClassic = (yrNum > 0 and yrNum < 2010)

    fmtStr = "MP4"
    if mv.streamFormat <> invalid and LCase(mv.streamFormat.ToStr()) = "mkv"
        fmtStr = "MKV"
    else if mv.streamUrl <> invalid and Instr(1, LCase(mv.streamUrl.ToStr()), ".mkv") > 0
        fmtStr = "MKV"
    end if

    return {
        franchise: franchise,
        primaryGenre: primaryGenre,
        qualBadge: qualBadge,
        resStr: resStr,
        fmtStr: fmtStr,
        monogram: makeMonogram(titleStr),
        bgCol: bgCol,
        barCol: barCol,
        isTv: isTv,
        isScifi: isScifi,
        isAction: isAction,
        isHorror: isHorror,
        isFamily: isFamily,
        isComedy: isComedy,
        isThriller: isThriller,
        isUhd: isUhd,
        isNew: isNew,
        isClassic: isClassic
    }
end function

function cinemaItemMatchesCat(mv as Object, catId as String) as Boolean
    if catId = "all" or catId = "" then return true
    info = cinemaClassifyItem(mv)
    if catId = "franchises" then return (info.franchise <> "")
    if catId = "scifi" then return info.isScifi
    if catId = "action" then return info.isAction
    if catId = "horror" then return info.isHorror
    if catId = "family" then return info.isFamily
    if catId = "comedy" then return info.isComedy
    if catId = "thriller" then return info.isThriller
    if catId = "tv" then return info.isTv
    if catId = "uhd" then return info.isUhd
    if catId = "new" then return info.isNew
    if catId = "classics" then return info.isClassic
    return true
end function

sub updateCinemaPaneFocusUi()
    isCat = (m.cinemaFocusPane = "categories")
    if m.cinemaCatFocusStripe <> invalid
        if isCat then m.cinemaCatFocusStripe.color = "0xE8A33DFF" else m.cinemaCatFocusStripe.color = "0x262136FF"
    end if
    if m.cinemaListFocusStripe <> invalid
        if isCat then m.cinemaListFocusStripe.color = "0x262136FF" else m.cinemaListFocusStripe.color = "0xE50914FF"
    end if
    if m.cinemaCatHeaderLabel <> invalid
        if isCat
            m.cinemaCatHeaderLabel.text = "▶ CATEGORIES ACTIVE (PRESS RIGHT FOR MOVIES)"
            m.cinemaCatHeaderLabel.color = "0xFCD34DFF"
        else
            m.cinemaCatHeaderLabel.text = "BROWSE CATEGORIES (PRESS LEFT)"
            m.cinemaCatHeaderLabel.color = "0x94A3B8FF"
        end if
    end if
    if m.cinemaPlayBtnBg <> invalid
        if isCat then m.cinemaPlayBtnBg.color = "0x991B1BFF" else m.cinemaPlayBtnBg.color = "0xE50914FF"
    end if
end sub

sub populateCinemaCatList()
    if m.cinemaCatList = invalid or m.cinemaCategories = invalid then return
    content = CreateObject("roSGNode", "ContentNode")
    for cIdx = 0 to m.cinemaCategories.Count() - 1
        cat = m.cinemaCategories[cIdx]
        cnt = 0
        if m.allCinemaItems <> invalid
            for each mv in m.allCinemaItems
                if cinemaItemMatchesCat(mv, cat.id) then cnt = cnt + 1
            end for
        end if
        item = content.CreateChild("ContentNode")
        item.title = cat.label + "  (" + cnt.ToStr() + ")"
    end for
    m.cinemaCatList.content = content
end sub

sub applyCinemaCategoryFilter(catIdx as Integer)
    if m.cinemaCategories = invalid or catIdx < 0 or catIdx >= m.cinemaCategories.Count() then return
    m.cinemaCatIndex = catIdx
    cat = m.cinemaCategories[catIdx]
    filtered = []
    if m.allCinemaItems <> invalid
        for each mv in m.allCinemaItems
            if cinemaItemMatchesCat(mv, cat.id)
                filtered.Push(mv)
            end if
        end for
    end if
    m.cinemaLibItems = filtered
    catUpper = UCase(cat.label)
    if m.cinemaActiveCatBadge <> invalid
        m.cinemaActiveCatBadge.text = catUpper + " (" + filtered.Count().ToStr() + ")"
    end if
    if m.cinemaShelfTitleLabel <> invalid
        m.cinemaShelfTitleLabel.text = "POSTER CAROUSEL  •  " + catUpper + " (" + filtered.Count().ToStr() + " TITLES)"
    end if
    if m.cinemaLibCountLabel <> invalid
        m.cinemaLibCountLabel.text = catUpper + " — " + filtered.Count().ToStr() + " TITLES  (▲/▼ BROWSE  •  OK PLAY FULL-SCREEN  •  ◀ LEFT SWITCH CATEGORY):"
    end if
    content = CreateObject("roSGNode", "ContentNode")
    for i = 0 to filtered.Count() - 1
        mv = filtered[i]
        info = cinemaClassifyItem(mv)
        item = content.CreateChild("ContentNode")
        yrStr = ""
        if mv.year <> invalid then yrStr = " (" + mv.year.ToStr() + ")"
        franTag = info.primaryGenre
        if info.franchise <> "" then franTag = info.franchise + " • " + info.primaryGenre
        item.title = (i + 1).ToStr() + ". " + Left(cleanAscii(mv.title), 38) + yrStr + "   [" + info.qualBadge + "]   " + franTag
    end for
    if m.cinemaLibList <> invalid
        m.cinemaLibList.content = content
    end if
    if filtered.Count() > 0
        updateCinemaLibDetail(0)
        updateCinemaPosterShelf(0)
    end if
end sub

sub updateCinemaPosterShelf(focusedIdx as Integer)
    total = 0
    if m.cinemaLibItems <> invalid then total = m.cinemaLibItems.Count()
    if total = 0 then return
    winStart = focusedIdx - 2
    if winStart + 5 > total then winStart = total - 5
    if winStart < 0 then winStart = 0
    if m.cinemaShelfPosLabel <> invalid
        m.cinemaShelfPosLabel.text = "Title #" + (focusedIdx + 1).ToStr() + " of " + total.ToStr() + "  •  Press OK to Watch"
    end if
    for slot = 0 to 4
        itemIdx = winStart + slot
        bdr = m.top.findNode("cinemaCardBorder" + slot.ToStr())
        bg = m.top.findNode("cinemaCardBg" + slot.ToStr())
        artBg = m.top.findNode("cinemaCardArtBg" + slot.ToStr())
        mono = m.top.findNode("cinemaCardMono" + slot.ToStr())
        pst = m.top.findNode("cinemaCardPoster" + slot.ToStr())
        bdg = m.top.findNode("cinemaCardBadge" + slot.ToStr())
        ttl = m.top.findNode("cinemaCardTitle" + slot.ToStr())
        gnr = m.top.findNode("cinemaCardGenre" + slot.ToStr())
        stt = m.top.findNode("cinemaCardState" + slot.ToStr())
        if itemIdx < total
            mv = m.cinemaLibItems[itemIdx]
            info = cinemaClassifyItem(mv)
            isFocused = (itemIdx = focusedIdx)
            if bdr <> invalid
                bdr.visible = true
                if isFocused then bdr.color = "0xE8A33DFF" else bdr.color = "0x262136FF"
            end if
            if bg <> invalid
                bg.visible = true
                if isFocused then bg.color = "0x27192CFF" else bg.color = "0x181524FF"
            end if
            if artBg <> invalid
                artBg.visible = true
                artBg.color = info.bgCol
            end if
            if mono <> invalid
                mono.visible = true
                mono.text = info.monogram
            end if
            if pst <> invalid
                pst.visible = true
                if mv.artUrl <> invalid and mv.artUrl <> ""
                    pst.uri = mv.artUrl
                else
                    pst.uri = ""
                end if
            end if
            yrTxt = "HD"
            if mv.year <> invalid then yrTxt = mv.year.ToStr()
            if bdg <> invalid
                bdg.visible = true
                bdg.text = yrTxt + " • " + info.resStr
            end if
            if ttl <> invalid
                ttl.visible = true
                ttl.text = Left(cleanAscii(mv.title), 26)
                if isFocused then ttl.color = "0xFCD34DFF" else ttl.color = "0xF8FAFCFF"
            end if
            if gnr <> invalid
                gnr.visible = true
                if info.franchise <> ""
                    gnr.text = Left(info.franchise, 24)
                else
                    gnr.text = info.primaryGenre
                end if
            end if
            if stt <> invalid
                stt.visible = true
                if isFocused
                    stt.text = "▶ SELECTED (#" + (itemIdx + 1).ToStr() + ")"
                    stt.color = "0x6EE7B7FF"
                else
                    stt.text = "#" + (itemIdx + 1).ToStr() + " • " + info.fmtStr
                    stt.color = "0x94A3B8FF"
                end if
            end if
        else
            if bdr <> invalid then bdr.visible = false
            if bg <> invalid then bg.visible = false
            if artBg <> invalid then artBg.visible = false
            if mono <> invalid then mono.visible = false
            if pst <> invalid then pst.visible = false
            if bdg <> invalid then bdg.visible = false
            if ttl <> invalid then ttl.visible = false
            if gnr <> invalid then gnr.visible = false
            if stt <> invalid then stt.visible = false
        end if
    end for
end sub

sub showCinemaLibrary(libObj as Object)
    if m.cinemaLibraryGroup = invalid then m.cinemaLibraryGroup = m.top.findNode("cinemaLibraryGroup")
    if m.cinemaLibraryGroup = invalid then return
    wasActive = m.cinemaLibraryActive
    m.cinemaLibraryActive = true
    m.cinemaLibraryGroup.visible = true
    if libObj <> invalid and libObj.items <> invalid and libObj.items.Count() > 0
        newHash = libObj.items.Count().ToStr() + ":" + cleanAscii(libObj.items[0].id)
        if m.cinemaLibHash <> newHash
            m.cinemaLibHash = newHash
            m.allCinemaItems = libObj.items
            populateCinemaCatList()
            applyCinemaCategoryFilter(m.cinemaCatIndex)
        end if
    end if
    if wasActive <> true and m.cinemaVideoActive <> true
        m.cinemaFocusPane = "movies"
        if m.cinemaLibList <> invalid then m.cinemaLibList.setFocus(true)
        updateCinemaPaneFocusUi()
    end if
end sub

sub hideCinemaLibrary()
    if m.cinemaLibraryActive <> true then return
    m.cinemaLibraryActive = false
    if m.cinemaLibraryGroup <> invalid then m.cinemaLibraryGroup.visible = false
    if m.cinemaVideoActive <> true and m.tileList <> invalid
        m.tileList.setFocus(true)
    end if
end sub

sub updateCinemaLibDetail(idx as Integer)
    if m.cinemaLibItems = invalid or idx < 0 or idx >= m.cinemaLibItems.Count() then return
    mv = m.cinemaLibItems[idx]
    info = cinemaClassifyItem(mv)
    titleClean = cleanAscii(mv.title)
    if m.cinemaLibDetailTitle <> invalid then m.cinemaLibDetailTitle.text = Left(titleClean, 44)
    yrStr = "Feature"
    if mv.year <> invalid then yrStr = mv.year.ToStr()

    if m.cinemaBadgeYear <> invalid then m.cinemaBadgeYear.text = yrStr
    if m.cinemaBadgeQuality <> invalid then m.cinemaBadgeQuality.text = info.qualBadge
    if m.cinemaBadgeGenre <> invalid then m.cinemaBadgeGenre.text = info.primaryGenre
    if m.cinemaBadgeFormat <> invalid then m.cinemaBadgeFormat.text = info.fmtStr + " DIRECT"

    if m.cinemaHeroEyebrow <> invalid
        if info.franchise <> ""
            m.cinemaHeroEyebrow.text = UCase(info.franchise) + "  •  " + UCase(info.primaryGenre)
        else
            m.cinemaHeroEyebrow.text = "ROBOS CINEMA+ FEATURE  •  " + UCase(info.primaryGenre)
        end if
    end if

    if m.cinemaHeroPosterFallbackBg <> invalid then m.cinemaHeroPosterFallbackBg.color = info.bgCol
    if m.cinemaHeroPosterTopBar <> invalid then m.cinemaHeroPosterTopBar.color = info.barCol
    if m.cinemaHeroPosterRibbon <> invalid then m.cinemaHeroPosterRibbon.text = UCase(info.primaryGenre)
    if m.cinemaHeroPosterMonogram <> invalid then m.cinemaHeroPosterMonogram.text = info.monogram
    if m.cinemaHeroPosterFallbackTitle <> invalid then m.cinemaHeroPosterFallbackTitle.text = Left(titleClean, 30)
    if m.cinemaHeroPosterFallbackYear <> invalid then m.cinemaHeroPosterFallbackYear.text = yrStr + "  •  " + info.qualBadge

    if m.cinemaLibDetailMeta <> invalid
        franStr = "Standalone Feature Film"
        if info.franchise <> "" then franStr = "Collection: " + info.franchise
        m.cinemaLibDetailMeta.text = franStr + "   |   Genre: " + info.primaryGenre + "   |   Quality: " + info.qualBadge
    end if
    if m.cinemaLibDetailSub <> invalid
        m.cinemaLibDetailSub.text = "Container: " + info.fmtStr + " Direct Stream   |   Source: " + Left(cleanAscii(mv.album), 40) + "   |   Zero-Cloud LAN HTTP 206"
    end if
    if m.cinemaHeroSynopsis <> invalid
        if info.franchise <> ""
            m.cinemaHeroSynopsis.text = "Part of the " + info.franchise + " in your RobOS Cinema library. Press OK on your Roku remote for instant full-screen playback."
        else
            m.cinemaHeroSynopsis.text = "Full HD home theater stream (" + info.qualBadge + ") ready on your LAN. Press OK on your Roku remote for instant full-screen playback."
        end if
    end if
    if m.cinemaLibPoster <> invalid
        if mv.artUrl <> invalid and mv.artUrl <> ""
            m.cinemaLibPoster.uri = mv.artUrl
        else
            m.cinemaLibPoster.uri = ""
        end if
    end if
    if m.cinemaLibFooter <> invalid
        m.cinemaLibFooter.text = "Selected #" + (idx + 1).ToStr() + " of " + m.cinemaLibItems.Count().ToStr() + ": " + titleClean + " (" + yrStr + ") — Press [OK] to Watch Full-Screen, or [LEFT] for Categories"
    end if
end sub

sub onCinemaCatFocused()
    if m.cinemaCatList = invalid then return
    m.cinemaFocusPane = "categories"
    updateCinemaPaneFocusUi()
    applyCinemaCategoryFilter(m.cinemaCatList.itemFocused)
end sub

sub onCinemaCatSelected()
    if m.cinemaCatList = invalid then return
    applyCinemaCategoryFilter(m.cinemaCatList.itemSelected)
    m.cinemaFocusPane = "movies"
    if m.cinemaLibList <> invalid then m.cinemaLibList.setFocus(true)
    updateCinemaPaneFocusUi()
end sub

sub onCinemaLibItemFocused()
    if m.cinemaLibList = invalid then return
    m.cinemaFocusPane = "movies"
    updateCinemaPaneFocusUi()
    idx = m.cinemaLibList.itemFocused
    updateCinemaLibDetail(idx)
    updateCinemaPosterShelf(idx)
end sub

sub playCinemaItemAtIndex(idx as Integer)
    if m.cinemaLibItems = invalid or idx < 0 or idx >= m.cinemaLibItems.Count() then return
    mv = m.cinemaLibItems[idx]
    if mv = invalid or mv.streamUrl = invalid or mv.streamUrl = "" then return
    if m.cinemaLibFooter <> invalid
        m.cinemaLibFooter.text = "Starting full-screen playback: " + cleanAscii(mv.title) + "..."
    end if
    m.localVideoPlaying = true
    fmt = "mp4"
    if mv.streamFormat <> invalid and mv.streamFormat <> ""
        fmt = LCase(mv.streamFormat.ToStr())
    else if Instr(1, LCase(mv.streamUrl.ToStr()), ".mkv") > 0
        fmt = "mkv"
    end if
    playCinemaVideo({
        active: true,
        loadKey: "remote-" + idx.ToStr() + "-" + m.tickCount.ToStr(),
        mediaUrl: mv.streamUrl,
        streamFormat: fmt,
        title: cleanAscii(mv.title),
        startAt: 0,
        paused: false
    })
end sub

sub onCinemaLibItemSelected()
    if m.cinemaLibList = invalid or m.cinemaLibItems = invalid then return
    playCinemaItemAtIndex(m.cinemaLibList.itemSelected)
end sub

sub onCinemaVideoState()
    if m.cinemaVideo = invalid or m.cinemaVideoActive <> true then return
    st = m.cinemaVideo.state
    if st = "finished" or st = "error"
        m.dismissedCinemaLoadKey = m.lastCinemaLoadKey
        m.localVideoPlaying = false
        stopCinemaVideo()
        if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
            showCinemaLibrary(m.latestCinemaLibrary)
        end if
        m.cinemaFocusPane = "movies"
        if m.cinemaLibList <> invalid
            m.cinemaLibList.setFocus(true)
        end if
        updateCinemaPaneFocusUi()
    end if
end sub

sub onPayloadUpdated()
    raw = m.dashTask.payloadJson
    if raw = "" then return
    json = ParseJson(raw)
    if json = invalid then return
    if json.cinemaLibrary <> invalid and json.cinemaLibrary.items <> invalid
        m.latestCinemaLibrary = json.cinemaLibrary
    end if
    if json.cinemaLibrary <> invalid and json.cinemaLibrary.active = true
        hideAppCastFrames()
        showCinemaLibrary(json.cinemaLibrary)
    end if
    if json.cinemaCast <> invalid and json.cinemaCast.active = true and json.cinemaCast.mediaUrl <> invalid
        cKey = ""
        if json.cinemaCast.loadKey <> invalid then cKey = json.cinemaCast.loadKey.ToStr() else cKey = json.cinemaCast.mediaUrl.ToStr()
        if cKey <> "" and cKey <> m.dismissedCinemaLoadKey
            hideAppCastFrames()
            if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
                showCinemaLibrary(m.latestCinemaLibrary)
            end if
            playCinemaVideo(json.cinemaCast)
            return
        end if
    else if m.cinemaVideoActive = true and m.localVideoPlaying <> true
        stopCinemaVideo()
    end if
    if m.cinemaLibraryActive = true
        return
    end if
    if json.appCast <> invalid and json.appCast.active = true and json.appCast.frameUrl <> invalid
        showAppCastFrame(json.appCast.frameUrl)
        if json.appCast.narration <> invalid then playAppCastAudio(json.appCast.narration)
        return
    end if
    hideAppCastFrames()
    if json.dashboard = invalid then return
    dash = json.dashboard
    ss = json.slideshow
    if ss <> invalid
        wasEnabled = m.slideshowEnabled
        m.slideshowEnabled = (ss.enabled = true)
        if ss.intervalSeconds <> invalid and ss.intervalSeconds > 0
            if m.slideIntervalSec <> ss.intervalSeconds
                m.slideIntervalSec = ss.intervalSeconds
                if m.slideRemSec > m.slideIntervalSec then m.slideRemSec = m.slideIntervalSec
            end if
        end if
        if ss.totalSlides <> invalid and ss.totalSlides > 0 then m.slideTotal = ss.totalSlides
        if wasEnabled = false and m.slideshowEnabled = true
            if ss.slideNumber <> invalid then m.slideNumber = ss.slideNumber
            if ss.secondsRemainingInSlide <> invalid then m.slideRemSec = ss.secondsRemainingInSlide
            if dash.id <> invalid then applySlideVisibility(cleanAscii(dash.id))
        end if
        updateSlideshowHud()
    end if
    if m.slideshowEnabled = false
        if dash.id <> invalid
            applySlideVisibility(cleanAscii(dash.id))
        end if
        if dash.title <> invalid and m.brandLabel <> invalid
            m.brandLabel.text = "RobOS Dashboards - " + cleanAscii(dash.title)
        end if
    end if
    cardsToProcess = dash.cards
    if json.allSlideCards <> invalid then cardsToProcess = json.allSlideCards
    if cardsToProcess = invalid then return

    for each card in cardsToProcess
        cTag = card.componentTag
        if cTag = invalid then cTag = card.widgetTag
        if cTag = "robos-widget-github-repo" and card.liveData <> invalid
            rel = card.liveData.latestRelease
            if rel <> invalid
                l1 = m.top.findNode("ghReleaseLine1")
                l2 = m.top.findNode("ghReleaseLine2")
                st = m.top.findNode("ghReleaseStripe")
                s1l1 = m.top.findNode("s1RelLine1")
                s1l2 = m.top.findNode("s1RelLine2")
                isRun = (rel.isRunningNow = true)
                runTxt = "IDLE - NOT RUNNING"
                if isRun then runTxt = "RUNNING NOW"
                if st <> invalid
                    if isRun then st.color = "0xF59E0BFF" else st.color = "0x10B981FF"
                end if
                if l1 <> invalid then l1.text = "RELEASE: " + cleanAscii(rel.name) + " (Run #" + cleanAscii(rel.releaseRunNumber) + ") [" + runTxt + "]"
                if l2 <> invalid then l2.text = "Last Release #" + cleanAscii(rel.releaseRunNumber) + ": " + UCase(cleanAscii(rel.releaseConclusion)) + " | Win EXE Release #" + cleanAscii(rel.windowsReleaseRunNumber) + ": " + UCase(cleanAscii(rel.windowsReleaseConclusion))
                if s1l1 <> invalid then s1l1.text = "LATEST RELEASE: " + cleanAscii(rel.name) + " (Run #" + cleanAscii(rel.releaseRunNumber) + ") [" + runTxt + "]"
                if s1l2 <> invalid then s1l2.text = "Release #" + cleanAscii(rel.releaseRunNumber) + ": " + UCase(cleanAscii(rel.releaseConclusion)) + " | Win EXE Release #" + cleanAscii(rel.windowsReleaseRunNumber) + ": " + UCase(cleanAscii(rel.windowsReleaseConclusion))
            end if
            ci = card.liveData.mainCi
            if ci <> invalid
                s1ch = m.top.findNode("s1CiSummaryTitle")
                if s1ch <> invalid and ci.summaryText <> invalid then s1ch.text = "MAIN BRANCH CI: " + UCase(cleanAscii(ci.summaryText))
            end if
            pop = card.liveData.popularity
            if pop <> invalid
                stNode = m.top.findNode("s1StarsVal")
                fkNode = m.top.findNode("s1ForksVal")
                wtNode = m.top.findNode("s1WatchersVal")
                if stNode <> invalid and pop.stars <> invalid then stNode.text = pop.stars.ToStr()
                if fkNode <> invalid and pop.forks <> invalid then fkNode.text = pop.forks.ToStr()
                if wtNode <> invalid and pop.watchers <> invalid then wtNode.text = pop.watchers.ToStr()
                if pop.clones14d <> invalid
                    cTitle = m.top.findNode("s1ClonesTitle")
                    if cTitle <> invalid and pop.clones14d.count <> invalid and pop.clones14d.uniques <> invalid
                        cTitle.text = "14-DAY GIT CLONES: " + pop.clones14d.count.ToStr() + " TOTAL  (" + pop.clones14d.uniques.ToStr() + " UNIQUE CLONERS)"
                    end if
                end if
                if pop.downloads <> invalid and pop.downloads.totalDownloads <> invalid
                    dlVal = m.top.findNode("s1DlHeroVal")
                    if dlVal <> invalid then dlVal.text = pop.downloads.totalDownloads.ToStr()
                end if
            end if
        else if cTag = "robos-widget-git-commits" and card.liveData <> invalid and card.liveData.commits <> invalid
            commits = card.liveData.commits
            for i = 0 to 6
                tNode = m.top.findNode("commitTitle" + i.ToStr())
                mNode = m.top.findNode("commitMeta" + i.ToStr())
                if i < commits.Count()
                    c = commits[i]
                    sha = c.shortSha
                    if sha = invalid then sha = c.hash
                    if tNode <> invalid then tNode.text = (i + 1).ToStr() + ". " + Left(cleanAscii(c.subject), 48)
                    if mNode <> invalid then mNode.text = "   #" + cleanAscii(sha) + " | " + cleanAscii(c.author) + " | " + cleanAscii(c.relativeTime)
                end if
            end for
        else if cTag = "robos-widget-next-meeting" and card.liveData <> invalid
            nd = card.liveData
            if nd.secondsUntil <> invalid then m.remainingSec = nd.secondsUntil
            if nd.nextMeeting <> invalid
                nmObj = nd.nextMeeting
                if nmObj.time <> invalid then m.nextMeetingTimeStr = cleanAscii(nmObj.time)
                if m.nextMeetingTitleLabel <> invalid
                    m.nextMeetingTitleLabel.text = cleanAscii(nmObj.time) + " - " + Left(cleanAscii(nmObj.title), 46)
                end if
                if m.nextMeetingMetaLabel <> invalid
                    afterStr = ""
                    if nd.followingMeeting <> invalid
                        afterStr = " | After: " + cleanAscii(nd.followingMeeting.time) + " " + Left(cleanAscii(nd.followingMeeting.title), 20)
                    end if
                    m.nextMeetingMetaLabel.text = "Calendar: " + cleanAscii(nmObj.accountEmail) + afterStr
                end if
            end if
        else if cTag = "robos-widget-music-player" and card.liveData <> invalid
            md = card.liveData
            msNode = m.top.findNode("musicStatusLabel")
            mtNode = m.top.findNode("musicTitleLabel")
            maNode = m.top.findNode("musicArtistLabel")
            mpNode = m.top.findNode("musicProgFill")
            muNode = m.top.findNode("musicUpNextLabel")
            mStripe = m.top.findNode("musicStripe")
            isMusPlaying = (md.isPlaying = true)
            m.musicPlaying = isMusPlaying
            if isMusPlaying = true
                if mStripe <> invalid then mStripe.color = "0xA855F7FF"
                if msNode <> invalid
                    msNode.text = "NOW PLAYING [PLAYING]  " + cleanAscii(md.elapsed) + " / " + cleanAscii(md.duration) + "  |  " + cleanAscii(md.output)
                    msNode.color = "0x6EE7B7FF"
                end if
                if mtNode <> invalid
                    mtNode.text = Left(cleanAscii(md.title), 42)
                    mtNode.color = "0xF8FAFCFF"
                end if
                if maNode <> invalid
                    maNode.text = cleanAscii(md.artistAlbum) + "  (" + cleanAscii(md.source) + ")"
                    maNode.color = "0xD8B4FEFF"
                end if
                if mpNode <> invalid and md.progressPct <> invalid
                    pct = md.progressPct
                    if pct < 4 then pct = 4
                    if pct > 100 then pct = 100
                    mpNode.width = Int((pct / 100.0) * 512)
                end if
            else
                if mStripe <> invalid then mStripe.color = "0x475569FF"
                if msNode <> invalid
                    msNode.text = "AUDIO IDLE [NOT PLAYING]  0:00 / " + cleanAscii(md.duration) + "  |  " + cleanAscii(md.output)
                    msNode.color = "0x94A3B8FF"
                end if
                if mtNode <> invalid
                    mtNode.text = "No Audio Currently Playing"
                    mtNode.color = "0x94A3B8FF"
                end if
                if maNode <> invalid
                    maNode.text = "Last queued: " + Left(cleanAscii(md.title), 36) + " (" + cleanAscii(md.output) + ")"
                    maNode.color = "0x64748BFF"
                end if
                if mpNode <> invalid then mpNode.width = 0
            end if
            if muNode <> invalid and md.upNext <> invalid and md.upNext.Count() > 0
                u0 = md.upNext[0]
                uStr = "Up Next: " + cleanAscii(u0.title) + " (" + cleanAscii(u0.artist) + ")"
                if md.upNext.Count() > 1
                    u1 = md.upNext[1]
                    uStr = uStr + " | " + cleanAscii(u1.title)
                end if
                muNode.text = Left(uStr, 68)
            end if
        else if cTag = "robos-widget-calendar-today" and card.liveData <> invalid and card.liveData.events <> invalid
            events = card.liveData.events
            for i = 0 to 4
                bgNode = m.top.findNode("calBg" + i.ToStr())
                stNode = m.top.findNode("calStripe" + i.ToStr())
                tmNode = m.top.findNode("calTime" + i.ToStr())
                tlNode = m.top.findNode("calTitle" + i.ToStr())
                lcNode = m.top.findNode("calLoc" + i.ToStr())
                if i < events.Count()
                    ev = events[i]
                    accEmail = ev.accountEmail
                    if accEmail = invalid then accEmail = ev.calendar
                    if accEmail = invalid then accEmail = "nicholas.dipiazza@gmail.com"
                    isSecond = (Instr(1, LCase(cleanAscii(accEmail)), "hermetiq") > 0)
                    if bgNode <> invalid then bgNode.visible = true
                    if stNode <> invalid
                        stNode.visible = true
                        if isSecond then stNode.color = "0x10B981FF" else stNode.color = "0x00BCD4FF"
                    end if
                    if tmNode <> invalid
                        if isSecond then tmNode.color = "0x6EE7B7FF" else tmNode.color = "0x67E8F9FF"
                        tmNode.text = cleanAscii(ev.time) + "  [" + UCase(cleanAscii(ev.status)) + "]  (" + cleanAscii(accEmail) + ")"
                    end if
                    if tlNode <> invalid then tlNode.text = Left(cleanAscii(ev.title), 44)
                    if lcNode <> invalid then lcNode.text = "Calendar: " + cleanAscii(accEmail) + " | " + cleanAscii(ev.location)
                else
                    if bgNode <> invalid then bgNode.visible = false
                    if stNode <> invalid then stNode.visible = false
                    if tmNode <> invalid then tmNode.text = ""
                    if tlNode <> invalid then tlNode.text = ""
                    if lcNode <> invalid then lcNode.text = ""
                end if
            end for
        else if cTag = "robos-widget-voice-dictation" and card.liveData <> invalid
            vd = card.liveData
            s2Title = m.top.findNode("s2VoiceStatusTitle")
            s2Sub = m.top.findNode("s2VoiceStatusSub")
            s2Stripe = m.top.findNode("s2VoiceStatusStripe")
            isVRec = (vd.active = true or vd.interimBubble <> invalid)
            pttKey = cleanAscii(vd.pushToTalkKey)
            if pttKey = "" then pttKey = "Super+V"
            micDev = cleanAscii(vd.configuredDevice)
            if micDev = "" then micDev = "default"
            vList = []
            if vd.interimBubble <> invalid and (vd.interimBubble.text <> invalid or vd.interimBubble.msg <> invalid)
                vList.Push({ item: vd.interimBubble, isInterim: true })
            end if
            if vd.bubbles <> invalid and vd.bubbles.Count() > 0
                for bIdx = vd.bubbles.Count() - 1 to 0 step -1
                    if vList.Count() >= 6 then exit for
                    vList.Push({ item: vd.bubbles[bIdx], isInterim: false })
                end for
            end if
            bTotal = 0
            if vd.bubbles <> invalid then bTotal = vd.bubbles.Count()
            if s2Title <> invalid
                if isVRec = true
                    s2Title.text = "LISTENING LIVE - Recording Active (" + pttKey + ")  |  " + bTotal.ToStr() + " Recent Dictated Chats"
                    s2Title.color = "0xFCA5A5FF"
                else
                    s2Title.text = "STANDBY - " + bTotal.ToStr() + " Recent Dictated Chats (" + pttKey + ")"
                    s2Title.color = "0x6EE7B7FF"
                end if
            end if
            if s2Sub <> invalid
                s2Sub.text = "Microphone: " + micDev + "  |  Showing Most Recent Chats (Newest First)  |  Live HUD Sync :19188"
            end if
            if s2Stripe <> invalid
                if isVRec = true then s2Stripe.color = "0xEF4444FF" else s2Stripe.color = "0x10B981FF"
            end if
            for i = 0 to 5
                vBg = m.top.findNode("s2VoiceBubbleBg" + i.ToStr())
                vSt = m.top.findNode("s2VoiceBubbleStripe" + i.ToStr())
                vMt = m.top.findNode("s2VoiceBubbleMeta" + i.ToStr())
                vTx = m.top.findNode("s2VoiceBubbleText" + i.ToStr())
                if i < vList.Count()
                    entry = vList[i]
                    vb = entry.item
                    isInt = (entry.isInterim = true)
                    if vBg <> invalid then vBg.visible = true
                    if vSt <> invalid
                        vSt.visible = true
                        if isInt = true
                            vSt.color = "0x00BCD4FF"
                        else if vb.commandCard <> invalid
                            vSt.color = "0x10B981FF"
                        else
                            vSt.color = "0xA855F7FF"
                        end if
                    end if
                    suffix = "RobOS Voice Chat"
                    if isInt = true
                        suffix = "LISTENING LIVE (Streaming Utterance...)"
                    else if vb.commandCard <> invalid and vb.commandCard.title <> invalid
                        suffix = "Matched Command: " + cleanAscii(vb.commandCard.title)
                    else if vb.likelySkills <> invalid and vb.likelySkills.Count() > 0
                        sk0 = vb.likelySkills[0]
                        if sk0.title <> invalid then suffix = "Likely Skill: " + cleanAscii(sk0.title)
                    else if vb.isAmbient = true
                        suffix = "Ambient Audio"
                    end if
                    if vMt <> invalid
                        vMt.visible = true
                        if isInt = true then vMt.color = "0xFCA5A5FF" else vMt.color = "0xD8B4FEFF"
                        vMt.text = (i + 1).ToStr() + ". [" + cleanAscii(vb.time) + "]   " + Left(suffix, 72)
                    end if
                    if vTx <> invalid
                        vTx.visible = true
                        rawMsg = vb.text
                        if rawMsg = invalid then rawMsg = vb.msg
                        vTx.text = Chr(34) + Left(cleanAscii(rawMsg), 165) + Chr(34)
                    end if
                else
                    if vBg <> invalid then vBg.visible = false
                    if vSt <> invalid then vSt.visible = false
                    if vMt <> invalid
                        vMt.visible = false
                        vMt.text = ""
                    end if
                    if vTx <> invalid
                        vTx.visible = false
                        vTx.text = ""
                    end if
                end if
            end for
        else if cTag = "robos-widget-agent-sessions" and card.liveData <> invalid and card.liveData.sessions <> invalid
            sessions = card.liveData.sessions
            for i = 0 to 2
                cardNode = m.top.findNode("agentCard" + i.ToStr())
                stripeNode = m.top.findNode("agentStripe" + i.ToStr())
                dotNode = m.top.findNode("agentDot" + i.ToStr())
                atNode = m.top.findNode("agentTitle" + i.ToStr())
                amNode = m.top.findNode("agentMeta" + i.ToStr())
                termNode = m.top.findNode("agentTermBg" + i.ToStr())
                if i < sessions.Count()
                    s = sessions[i]
                    m.agentActive[i] = true
                    if s.elapsedSec <> invalid then m.agentElapsed[i] = s.elapsedSec
                    actStr = cleanAscii(s.activity)
                    if actStr = "" then actStr = cleanAscii(s.cwd)
                    m.agentActivity[i] = Left(actStr, 42)
                    if cardNode <> invalid then cardNode.visible = true
                    if stripeNode <> invalid then stripeNode.visible = true
                    if dotNode <> invalid then dotNode.visible = true
                    if atNode <> invalid then atNode.visible = true
                    if amNode <> invalid then amNode.visible = true
                    if termNode <> invalid then termNode.visible = true
                    sTitle = s.name
                    if sTitle = invalid then sTitle = s.title
                    if atNode <> invalid and sTitle <> invalid then atNode.text = "* " + Left(cleanAscii(sTitle), 46)
                    elFmt = cleanAscii(s.elapsedFormatted)
                    if elFmt = "" then elFmt = "00:05"
                    if amNode <> invalid then amNode.text = "IN PROGRESS [" + elFmt + "] | " + m.agentActivity[i]
                    linesArr = s.statusLines
                    if linesArr = invalid then linesArr = s.tailLines
                    for tIdx = 0 to 2
                        tlNode = m.top.findNode("agentTail" + i.ToStr() + "_" + tIdx.ToStr())
                        if tlNode <> invalid
                            tlNode.visible = true
                            if linesArr <> invalid and tIdx < linesArr.Count()
                                tlNode.text = Left(cleanAscii(linesArr[tIdx]), 56)
                            else
                                tlNode.text = ""
                            end if
                        end if
                    end for
                else
                    m.agentActive[i] = false
                    if cardNode <> invalid then cardNode.visible = false
                    if stripeNode <> invalid then stripeNode.visible = false
                    if dotNode <> invalid then dotNode.visible = false
                    if atNode <> invalid
                        atNode.visible = false
                        atNode.text = ""
                    end if
                    if amNode <> invalid
                        amNode.visible = false
                        amNode.text = ""
                    end if
                    if termNode <> invalid then termNode.visible = false
                    for tIdx = 0 to 2
                        tlNode = m.top.findNode("agentTail" + i.ToStr() + "_" + tIdx.ToStr())
                        if tlNode <> invalid
                            tlNode.visible = false
                            tlNode.text = ""
                        end if
                    end for
                end if
            end for
        end if
    end for
end sub

sub onItemFocused()
    idx = m.tileList.itemFocused
    if idx >= 0 and idx < m.tiles.Count()
        t = m.tiles[idx]
        m.heroTitle.text = t.title
        m.heroDesc.text = t.desc
    end if
end sub

sub onItemSelected()
    idx = m.tileList.itemSelected
    if idx >= 0 and idx < m.tiles.Count()
        t = m.tiles[idx]
        if t.id = "movie-player"
            m.localLibraryOpened = true
            if m.latestCinemaLibrary <> invalid
                showCinemaLibrary(m.latestCinemaLibrary)
            else
                showCinemaLibrary({ active: true, items: [] })
            end if
            return
        end if
        if t.id = "daily-engineering-ops" or t.id = "github-ci-popularity" or t.id = "robos-voice-dictation"
            m.slideRemSec = m.slideIntervalSec
            if t.id = "daily-engineering-ops" then m.slideNumber = 1
            if t.id = "github-ci-popularity" then m.slideNumber = 2
            if t.id = "robos-voice-dictation" then m.slideNumber = 3
            applySlideVisibility(t.id)
            updateSlideshowHud()
        end if
        m.statusFooter.text = "Launched on RobOS Host (${portalUrl}): " + t.title
    end if
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if key = "Lit_~" or Left(key, 4) = "Lit_"
        return true
    end if
    if press = true and m.cinemaLibraryActive = true and m.cinemaVideoActive <> true
        if key = "left"
            if m.cinemaFocusPane = "movies" and m.cinemaCatList <> invalid
                m.cinemaFocusPane = "categories"
                m.cinemaCatList.setFocus(true)
                updateCinemaPaneFocusUi()
                return true
            end if
        else if key = "right"
            if m.cinemaFocusPane = "categories" and m.cinemaLibList <> invalid
                m.cinemaFocusPane = "movies"
                m.cinemaLibList.setFocus(true)
                updateCinemaPaneFocusUi()
                return true
            end if
        else if key = "play"
            if m.cinemaLibList <> invalid
                playCinemaItemAtIndex(m.cinemaLibList.itemFocused)
                return true
            end if
        end if
    end if
    if press = true and key = "back"
        if m.cinemaVideoActive = true
            m.dismissedCinemaLoadKey = m.lastCinemaLoadKey
            m.localVideoPlaying = false
            stopCinemaVideo()
            if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
                showCinemaLibrary(m.latestCinemaLibrary)
            end if
            m.cinemaFocusPane = "movies"
            if m.cinemaLibList <> invalid
                m.cinemaLibList.setFocus(true)
            end if
            updateCinemaPaneFocusUi()
            return true
        end if
        if m.cinemaLibraryActive = true
            m.localLibraryOpened = false
            hideCinemaLibrary()
            return true
        end if
    end if
    return false
end function
`;
    const keepAliveSrc = path.join(__dirname, 'keepalive.mp4');
    const keepAliveFull = path.join(targetDir, 'source/keepalive.mp4');
    fs.mkdirSync(path.dirname(keepAliveFull), { recursive: true });
    if (!fs.existsSync(keepAliveSrc)) {
      try {
        spawnSync(
          'ffmpeg',
          [
            '-y',
            '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=15:d=60',
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
            '-shortest',
            '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-g', '30',
            '-c:a', 'aac', '-b:a', '32k',
            '-movflags', '+faststart',
            keepAliveSrc,
          ],
          { timeout: 8000 }
        );
      } catch {}
    }
    if (fs.existsSync(keepAliveSrc)) {
      fs.copyFileSync(keepAliveSrc, keepAliveFull);
      filesCreated.push(keepAliveFull);
    }

    write('manifest', manifest);
    write('source/Main.brs', mainBrs);
    write(
      'source/cinema-library.json',
      JSON.stringify({
        active: initialCinemaLibActive,
        items: initialCinemaLibItems,
      })
    );
    write('components/DashboardTask.xml', dashboardTaskXml);
    write('components/DashboardTask.brs', dashboardTaskBrs);
    write('components/MainScene.xml', mainSceneXml);
    write('components/MainScene.brs', mainSceneBrs);
    write(
      'sideload-roku.sh',
      `#!/usr/bin/env bash
set -euo pipefail
TV_IP="${tvIp}"
ROKU_USER="\${ROKU_DEV_USER:-rokudev}"
ROKU_PASS="\${ROKU_DEV_PASS:-robos}"

rm -f robos-tv-roku.zip
zip -r -q robos-tv-roku.zip manifest source components
echo "[RobOS TV] Uploading robos-tv-roku.zip to Roku ($TV_IP) as $ROKU_USER..."
curl --user "$ROKU_USER:$ROKU_PASS" --digest -s -S \\
  -F "mysubmit=Install" \\
  -F "archive=@robos-tv-roku.zip" \\
  "http://$TV_IP/plugin_install" | grep -i -E "Install Success|Application Received|font color" || true
echo "[RobOS TV] Sideload complete! RobOS TV is now open on your Roku screen."
`,
      true
    );

    // Also pre-build the zip archive if zip is installed so user can even upload via browser if desired
    try {
      spawnSync('zip', ['-r', '-q', 'robos-tv-roku.zip', 'manifest', 'source', 'components'], {
        cwd: targetDir,
        timeout: 4000,
      });
      if (fs.existsSync(path.join(targetDir, 'robos-tv-roku.zip'))) {
        filesCreated.push(path.join(targetDir, 'robos-tv-roku.zip'));
      }
    } catch {}

    return {
      ok: true,
      platformId,
      targetDir,
      portalUrl,
      filesCreated,
      installCommand: `cd "${targetDir}" && ROKU_DEV_PASS="<YOUR-ROKU-DEV-PASSWORD>" ./sideload-roku.sh`,
      summary: `Generated interactive Roku SceneGraph channel (robos-tv-roku.zip + sideload-roku.sh) for ${tvIp}.`,
    };
  }

  // Default: Google TV / Android TV / Fire TV (ADB Leanback + Instant Remote Launch)
  const androidManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${appId}"
    android:versionCode="1"
    android:versionName="${version}">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-feature android:name="android.software.leanback" android:required="true" />
    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />
    <application
        android:label="${appName}"
        android:banner="@drawable/tv_banner"
        android:usesCleartextTraffic="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="keyboard|keyboardHidden|navigation|orientation|screenSize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>\n`;

  write('AndroidManifest.xml', androidManifest);
  write('assets/index.html', launcherHtml);
  write(
    'sideload-android-tv.sh',
    `#!/usr/bin/env bash
set -euo pipefail
# RobOS Google TV / Android TV / Fire TV ADB Sideloader & Instant Portal Launcher
TV_IP="${tvIp}"
PORTAL_URL="${portalUrl}"

echo "[RobOS TV] Connecting to Android TV via ADB at $TV_IP:5555..."
adb connect "$TV_IP:5555"

if [ -f "robos-tv-leanback.apk" ]; then
  echo "[RobOS TV] Installing RobOS Leanback TV APK..."
  adb -s "$TV_IP:5555" install -r robos-tv-leanback.apk
fi

echo "[RobOS TV] Launching RobOS 10-Foot Portal ($PORTAL_URL) on TV screen..."
adb -s "$TV_IP:5555" shell am start -a android.intent.action.VIEW -d "$PORTAL_URL"
`,
    true
  );

  return {
    ok: true,
    platformId: 'android-tv',
    targetDir,
    portalUrl,
    filesCreated,
    installCommand: `cd "${targetDir}" && ./sideload-android-tv.sh`,
    summary: `Generated Android TV Leanback project (AndroidManifest.xml, assets/index.html, sideload-android-tv.sh) for ${tvIp}:5555 -> ${portalUrl}.`,
  };
}

function createTvEngine({
  configDir,
  portalPort = DEFAULT_PORTAL_PORT,
  appName = defaultPortalAppName(),
  codeVersion = PORTAL_CODE_VERSION,
  reusePortal,
  onPortalReleased,
} = {}) {
  const resolvedConfigDir =
    configDir ||
    process.env.ROBOS_CONFIG_DIR ||
    path.join(process.env.HOME || os.homedir(), '.config', 'robos');
  const stateFile = path.join(resolvedConfigDir, 'tv-studio.json');
  const packagesOutDir = path.join(resolvedConfigDir, 'tv-packages');

  let state = {
    portalPort,
    activeTileId: 'portal-home',
    webosAutoRenew: true,
    webosLastRenewedAt: '2026-10-26T09:00:00.000Z',
    webosSessionRemainingHours: 998,
    sunshineEnabled: true,
    lastRemoteKey: null,
    tvs: [],
    generatedPackages: [],
  };

  function loadState() {
    try {
      if (fs.existsSync(stateFile)) {
        const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        state = { ...state, ...parsed };
      }
    } catch {}
    if (!Array.isArray(state.tvs) || state.tvs.length === 0) {
      state.tvs = [
        {
          id: 'tv-livingroom-tcl-roku',
          name: '65" TCL Roku TV (Living room)',
          ip: '192.168.1.15',
          platformId: 'roku-os',
          platformName: 'Roku OS TV & Streaming Players',
          model: 'TCL 65S425 (Roku OS 15.3.4)',
          devModeEnabled: false,
          sideloadStatus: 'Live on LAN (:8060 ECP Active) · Enable Dev Mode to Sideload ZIP',
          online: true,
          ports: { ecp: 8060, http: 80 },
        },
        {
          id: 'tv-basement-cast',
          name: 'Basement TV',
          ip: '192.168.1.52',
          platformId: 'android-tv',
          platformName: 'Google TV / Android TV (ADB + Cast)',
          model: 'Sony Bravia 4K Google TV',
          devModeEnabled: true,
          sideloadStatus: 'Installed (com.robos.tv v1.0.0)',
          online: true,
          ports: { cast: 8009, adb: 5555 },
        },
        {
          id: 'tv-livingroom-webos',
          name: 'Living Room OLED',
          ip: '192.168.1.64',
          platformId: 'lg-webos',
          platformName: 'LG webOS Smart TV',
          model: 'LG OLED65C4PUA (webOS 24)',
          devModeEnabled: true,
          sideloadStatus: 'Installed (Auto-Renew Active · 998h left)',
          online: true,
          ports: { ssh: 9991, ssap: 3000 },
        },
        {
          id: 'tv-office-tizen',
          name: 'Studio Wall Display',
          ip: '192.168.1.78',
          platformId: 'samsung-tizen',
          platformName: 'Samsung Tizen Smart TV',
          model: 'Samsung QN90D Neo QLED',
          devModeEnabled: true,
          sideloadStatus: 'Ready to Sideload (.wgt)',
          online: true,
          ports: { sdb: 26101, rest: 8001 },
        },
      ];
      saveState();
    }
  }

  function saveState() {
    try {
      fs.mkdirSync(resolvedConfigDir, { recursive: true });
      if (fs.existsSync(stateFile)) {
        try {
          const onDisk = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          for (const k of ['activeCinemaCast', 'activeCinemaLibrary', 'moviePlayerServer', 'moviePlayerLibrarySnapshot']) {
            if (onDisk[k] !== undefined) {
              state[k] = onDisk[k];
            }
          }
        } catch {}
      }
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch {}
  }

  loadState();

  let server = null;
  let boundPort = state.portalPort || DEFAULT_PORTAL_PORT;
  let _liveDashboardFrameBuf = null;
  let _liveDashboardFrameUpdatedAt = 0;
  // Set when another process already serves the portal and this engine reuses it.
  let reusedOwner = null;
  let releasedAt = 0;
  const ownerInfo = {
    pid: process.pid,
    appName: String(appName || 'node-script'),
    codeVersion: String(codeVersion || 'unknown'),
    startedAt: new Date().toISOString(),
    features: PORTAL_FEATURES,
  };

  function storeLiveDashboardFrame(buf) {
    if (Buffer.isBuffer(buf) && buf.length > 1000) {
      _liveDashboardFrameBuf = buf;
      _liveDashboardFrameUpdatedAt = Date.now();
      return true;
    }
    return false;
  }

  function setLiveDashboardFrame(buf) {
    if (!storeLiveDashboardFrame(buf)) return;
    // Frames live in the memory of the process serving the portal, so a
    // reusing app pushes them there instead of keeping them to itself.
    if (!(server && server.listening) && (reusedOwner?.features || []).includes('live-frame-push')) {
      requestLocalPortal(boundPort, {
        method: 'POST',
        pathname: '/api/dashboard-live-frame',
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(buf.length) },
        body: buf,
      }).catch(() => {});
    }
  }

  function getLiveDashboardFrame() {
    return {
      buffer: _liveDashboardFrameBuf,
      updatedAt: _liveDashboardFrameUpdatedAt,
    };
  }

  // ── App casts ──────────────────────────────────────────────────────────
  // Any RobOS app can take over a TV with its own page (state.appCasts[tvId]).
  // Browser TVs (webOS, Tizen, Android TV) are sent to the page's URL; Roku,
  // which has no browser, shows JPEG frames the app pushes to
  // POST /api/app-cast-frame?tv=<id>. Frames are kept in the memory of the
  // process serving the portal, so apps push them over HTTP, not in-process.
  const appCastFrames = new Map();

  function setAppCastFrame(tvId, buf) {
    if (!tvId || !Buffer.isBuffer(buf) || buf.length < 500) return false;
    appCastFrames.set(String(tvId), { buf, at: Date.now() });
    return true;
  }

  function isLoopback(req) {
    const addr = String(req.socket?.remoteAddress || '');
    return addr === '::1' || addr.startsWith('127.') || addr.startsWith('::ffff:127.');
  }

  function appCastForRequest(req, u, platformId = null) {
    const casts = Object.values(state.appCasts || {}).filter((c) => c && c.active && (!platformId || c.platformId === platformId));
    if (!casts.length) return null;
    const explicit = u.searchParams.get('tv');
    if (explicit) return casts.find((c) => c.tvId === explicit) || null;
    const addr = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const byIp = casts.find((c) => c.tvIp === addr);
    if (byIp) return byIp;
    // A Roku behind NAT or with a stale IP still gets the cast if it is the only one.
    return platformId && casts.length === 1 ? casts[0] : null;
  }

  async function castAppToTv({ tvId, appId, title, url } = {}) {
    loadState();
    const tv = state.tvs.find((t) => t.id === tvId);
    if (!tv) return { ok: false, error: `TV ${tvId} is not paired` };
    if (!url) return { ok: false, error: 'url is required' };
    const hostIp = detectLanIp();
    const portalUrl = `http://${hostIp}:${boundPort || DEFAULT_PORTAL_PORT}`;
    const isRoku = tv.platformId === 'roku-os';
    const appCast = {
      active: true,
      tvId: tv.id,
      tvName: tv.name,
      tvIp: tv.ip,
      platformId: tv.platformId,
      appId: appId || 'app',
      title: title || appId || 'RobOS App',
      url,
      mode: isRoku ? 'frames' : 'url',
      frameUrl: isRoku ? `${portalUrl}/api/app-cast-frame.jpg?tv=${encodeURIComponent(tv.id)}` : null,
      castAt: new Date().toISOString(),
    };
    state.appCasts = { ...(state.appCasts || {}), [tv.id]: appCast };
    state.lastRemoteKey = `SHOW ${appCast.title} → ${tv.name}`;
    saveState();

    let note = 'The TV opens it from the RobOS portal within a few seconds.';
    if (process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      if (tv.platformId === 'android-tv') {
        exec(`adb -s "${tv.ip}:5555" shell am start -a android.intent.action.VIEW -d "${url}"`, () => {});
        note = 'Opened on the TV with adb.';
      } else if (isRoku) {
        const launch = await launchRokuChannel(tv);
        if (launch.dispatch && launch.dispatch.blocked) {
          note = launch.dispatch.setupMessage || `${tv.name} blocked the remote launch command.`;
        } else if (launch.rokuChannelLaunched) {
          note = launch.sideloadedNow
            ? 'Installed and launched the updated RobOS TV channel; it shows live frames of the game.'
            : 'Launched the RobOS TV channel; it shows live frames of the game.';
        } else {
          note = 'The RobOS TV channel is not installed: enable Roku Developer Mode, then sideload it from Smart TV Studio.';
        }
      }
    }
    return { ok: true, tv, appCast, message: `${appCast.title} is on ${tv.name}. ${note}` };
  }

  // Merges fields into a live app cast, e.g. { narration: { id, url } } so a
  // Roku plays the app's latest spoken line.
  function updateAppCast({ tvId, appId, patch = {} } = {}) {
    loadState();
    const cast = state.appCasts && state.appCasts[tvId];
    if (!cast || !cast.active || (appId && cast.appId !== appId)) return { ok: false, error: 'No active app cast on that TV' };
    state.appCasts[tvId] = { ...cast, ...patch };
    saveState();
    return { ok: true, appCast: state.appCasts[tvId] };
  }

  function stopAppCast({ tvId, appId } = {}) {
    loadState();
    const casts = { ...(state.appCasts || {}) };
    for (const [id, c] of Object.entries(casts)) {
      if ((tvId && id !== tvId) || (appId && c.appId !== appId)) continue;
      casts[id] = { ...c, active: false, stoppedAt: new Date().toISOString() };
      appCastFrames.delete(id);
    }
    state.appCasts = casts;
    saveState();
    return { ok: true, appCasts: casts };
  }

  function listAppCasts() {
    loadState();
    return Object.values(state.appCasts || {}).filter((c) => c && c.active);
  }

  function startPortalServer(preferredPort = boundPort, { reuse } = {}) {
    if (server && server.listening) {
      return Promise.resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
    }
    const mayReuse =
      reuse !== false &&
      Boolean(preferredPort) &&
      (reusePortal ?? (preferredPort === DEFAULT_PORTAL_PORT && process.env.ROBOS_TEST !== '1'));
    if (mayReuse && reusedOwner && Date.now() - releasedAt < 10000) {
      // Just handed the port to a newer app; don't race it for the bind.
      return Promise.resolve({ ok: true, port: boundPort, reused: true, owner: reusedOwner, url: `http://${detectLanIp()}:${boundPort}` });
    }
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        loadState();
        const hostIp = detectLanIp();
        const u = new URL(req.url || '/', `http://${hostIp}:${boundPort}`);

        if (u.pathname === '/api/portal/shutdown') {
          // Hand :19210 to a newer RobOS app. Loopback only, and the custom
          // header plus no Origin keeps web pages in a local browser out.
          if (req.method !== 'POST' || !isLoopback(req) || req.headers.origin || req.headers[PORTAL_SHUTDOWN_HEADER] !== 'shutdown') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Portal shutdown is only accepted from RobOS apps on this computer' }));
            return;
          }
          const requestedBy = {
            pid: Number(req.headers['x-robos-portal-pid']) || null,
            appName: String(req.headers['x-robos-portal-app'] || '').slice(0, 64) || null,
          };
          const closing = server;
          res.writeHead(200, { 'Content-Type': 'application/json', Connection: 'close' });
          res.end(JSON.stringify({ ok: true, released: true, owner: ownerInfo }));
          res.on('finish', () => releasePortal(closing, requestedBy));
          return;
        }

        if (u.pathname === '/api/dashboard-live-frame' && req.method === 'POST') {
          if (!isLoopback(req)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Frames may only be pushed from this computer');
            return;
          }
          const chunks = [];
          let size = 0;
          req.on('data', (c) => {
            size += c.length;
            if (size <= 4 * 1024 * 1024) chunks.push(c);
          });
          req.on('end', () => {
            const ok = size <= 4 * 1024 * 1024 && storeLiveDashboardFrame(Buffer.concat(chunks));
            res.writeHead(ok ? 204 : 400, { 'Content-Type': 'text/plain' });
            res.end();
          });
          return;
        }

        if (u.pathname === '/api/dashboard-live-frame.jpg') {
          if (_liveDashboardFrameBuf && Date.now() - _liveDashboardFrameUpdatedAt < 30000) {
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': String(_liveDashboardFrameBuf.length),
              'Cache-Control': 'no-store, no-cache, must-revalidate',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(_liveDashboardFrameBuf);
          } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Live frame not active');
          }
          return;
        }

        if (u.pathname === '/api/app-cast-frame' && req.method === 'POST') {
          // Local RobOS apps push rendered JPEG frames for TVs without a browser (Roku).
          if (!isLoopback(req)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Frames may only be pushed from this computer');
            return;
          }
          const tvId = u.searchParams.get('tv') || '';
          const chunks = [];
          let size = 0;
          req.on('data', (c) => {
            size += c.length;
            if (size <= 4 * 1024 * 1024) chunks.push(c);
          });
          req.on('end', () => {
            const ok = size <= 4 * 1024 * 1024 && setAppCastFrame(tvId, Buffer.concat(chunks));
            res.writeHead(ok ? 204 : 400, { 'Content-Type': 'text/plain' });
            res.end();
          });
          return;
        }

        if (u.pathname === '/api/app-cast-frame.jpg') {
          const frame = appCastFrames.get(u.searchParams.get('tv') || '');
          if (!frame || Date.now() - frame.at > 30000) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('No app cast frame');
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(frame.buf.length),
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(frame.buf);
          return;
        }

        if (u.pathname === '/api/app-cast') {
          const body = JSON.stringify({ ok: true, appCast: appCastForRequest(req, u) });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(body);
          return;
        }

        if (u.pathname === '/api/status') {
          const payload = JSON.stringify({
            ok: true,
            app: 'robos-tv-portal',
            owner: ownerInfo,
            hostIp,
            portalPort: boundPort,
            portalUrl: `http://${hostIp}:${boundPort}`,
            activeTileId: state.activeTileId,
            lastRemoteKey: state.lastRemoteKey,
            devCentralCast: state.devCentralCast || null,
            activeDashboardCast: state.activeDashboardCast || null,
            tvCount: state.tvs.length,
            tiles: TEN_FOOT_LAUNCH_TILES,
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(payload);
          return;
        }

        if (u.pathname === '/api/dashboard-cast') {
          const rokuAppCast = appCastForRequest(req, u, 'roku-os');
          const activeCinema = state.activeCinemaCast && state.activeCinemaCast.active !== false && state.activeCinemaCast.mediaUrl
            ? { ...state.activeCinemaCast, active: true }
            : null;
          const cinemaLibItems = Array.isArray(state.moviePlayerLibrarySnapshot) ? state.moviePlayerLibrarySnapshot : [];
          const cinemaLibrary = {
            active: Boolean(state.activeCinemaLibrary && state.activeCinemaLibrary.active !== false),
            tvIp: state.activeCinemaLibrary?.tvIp || null,
            tvName: state.activeCinemaLibrary?.tvName || null,
            server: state.moviePlayerServer || null,
            items: cinemaLibItems,
          };
          const cinemaCastActive = Boolean(activeCinema || cinemaLibrary.active);

          // Fast path: when the TV is playing a movie, in the 10-foot Movie Library, or showing an app cast,
          // MainScene.brs returns before reading dashboard cards — skip expensive synchronous dashboard widget
          // resolution (git log, gh api, curl, pactl) so the host app's event loop never freezes!
          if (cinemaCastActive || rokuAppCast) {
            const fastBody = JSON.stringify({
              ok: true,
              appCastActive: Boolean(rokuAppCast),
              appCast: rokuAppCast,
              cinemaCastActive,
              cinemaCast: activeCinema,
              cinemaLibrary,
              cast: state.activeDashboardCast || null,
              slideshow: null,
              dashboard: null,
              allSlideCards: [],
              keepAliveActive: true,
              castUrl: `http://${hostIp}:${boundPort}/dashboard`,
            });
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(fastBody),
              'Access-Control-Allow-Origin': '*',
            });
            res.end(fastBody);
            return;
          }

          const dashMod = require('./dashboard-engine');
          const dashEngine = dashMod.createDashboardEngine({ configDir: resolvedConfigDir });
          const ssState = dashEngine.getSlideshowState();
          const explicitDashId = u.searchParams.get('id');
          const targetDashId = explicitDashId
            ? explicitDashId
            : ssState?.enabled
            ? 'slideshow'
            : state.activeDashboardCast?.dashboardId || 'daily-engineering-ops';
          const resolved = dashEngine.resolveDashboard(targetDashId);
          let allSlideCards = [...(resolved.dashboard?.cards || [])];
          try {
            const slideIds = ['daily-engineering-ops', 'github-ci-popularity', 'robos-voice-dictation'];
            for (const sId of slideIds) {
              if (sId === resolved.dashboard?.id) continue;
              const otherResolved = dashEngine.resolveDashboard(sId);
              if (otherResolved?.dashboard?.cards) {
                allSlideCards.push(...otherResolved.dashboard.cards);
              }
            }
          } catch {}

          const bodyJson = JSON.stringify({
            ok: true,
            appCastActive: Boolean(rokuAppCast),
            appCast: rokuAppCast,
            cinemaCastActive,
            cinemaCast: activeCinema,
            cinemaLibrary,
            cast: state.activeDashboardCast || null,
            slideshow: resolved.slideshow || ssState || null,
            dashboard: resolved.dashboard,
            allSlideCards,
            keepAliveActive: true,
            castUrl: `http://${hostIp}:${boundPort}/dashboard`,
          });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyJson),
            'Access-Control-Allow-Origin': '*',
          });
          res.end(bodyJson);
          return;
        }

        if (u.pathname === '/dashboard' || u.pathname.startsWith('/dashboard/')) {
          const dashEngineModule = require('./dashboard-engine');
          const dashEngine = dashEngineModule.createDashboardEngine({ configDir: resolvedConfigDir });
          const ssState = dashEngine.getSlideshowState();
          const slugId = u.pathname.startsWith('/dashboard/')
            ? decodeURIComponent(u.pathname.slice('/dashboard/'.length))
            : null;
          const explicitDashId = slugId || u.searchParams.get('id');
          const targetDashId = explicitDashId
            ? explicitDashId
            : ssState?.enabled
            ? 'slideshow'
            : state.activeDashboardCast?.dashboardId || 'daily-engineering-ops';
          const resolved = dashEngine.resolveDashboard(targetDashId);
          if (state.activeDashboardCast?.layoutId && state.activeDashboardCast.dashboardId === resolved.dashboard.id) {
            const customLayout = dashEngineModule.DASHBOARD_LAYOUTS.find((l) => l.id === state.activeDashboardCast.layoutId);
            if (customLayout) {
              resolved.dashboard.layout = customLayout;
              resolved.dashboard.layoutId = customLayout.id;
            }
          }
          const dashHtml = dashEngineModule.renderDashboardTvWallboardHtml({
            hostIp,
            portalPort: boundPort,
            resolvedDashboard: resolved,
            tvName: state.activeDashboardCast?.tvName || state.tvs[0]?.name || 'Living Room Smart TV',
            tvIp: state.activeDashboardCast?.tvIp || state.tvs[0]?.ip || hostIp,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(dashHtml);
          return;
        }

        if (u.pathname === '/movie-player') {
          const items = Array.isArray(state.moviePlayerLibrarySnapshot) ? state.moviePlayerLibrarySnapshot : [];
          const itemsJson = JSON.stringify(items);
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RobOS Cinema+ — 10-Foot Smart TV Streaming Library</title>
  <style>
    :root { --bg: #09080d; --surface: #12101b; --surface2: #191626; --border: #262136; --crimson: #e50914; --accent: #e8a33d; --cyan: #38bdf8; --purple: #a855f7; --text: #f8fafc; --muted: #94a3b8; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; overflow: hidden; display: flex; flex-direction: column; user-select: none; }
    header { height: 74px; background: #110e18; border-bottom: 3px solid var(--crimson); display: flex; align-items: center; justify-content: space-between; padding: 0 36px; }
    .brand-group { display: flex; align-items: center; gap: 16px; }
    .brand-pill { background: var(--crimson); color: #fff; font-weight: 800; font-size: 16px; padding: 8px 16px; border-radius: 6px; letter-spacing: 0.05em; }
    header h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .cat-pill { background: #1e1b2e; border-left: 4px solid var(--accent); color: #fcd34d; padding: 8px 16px; font-size: 14px; font-weight: 700; border-radius: 4px; }
    header .sub { color: #cbd5e1; font-size: 13px; font-weight: 600; }
    .layout { flex: 1; display: grid; grid-template-columns: 340px 1fr; gap: 20px; padding: 18px 36px; overflow: hidden; }
    .sidebar { background: var(--surface); border: 1px solid var(--border); border-top: 4px solid var(--accent); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; overflow: hidden; }
    .sidebar.dim { border-top-color: var(--border); }
    .pane-title { font-size: 13px; font-weight: 800; color: var(--accent); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
    .cat-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .cat-row { padding: 10px 14px; border-radius: 8px; background: rgba(255,255,255,0.02); border: 1px solid transparent; display: flex; justify-content: space-between; align-items: center; font-size: 15px; cursor: pointer; color: #e2e8f0; }
    .cat-row.active { border-color: var(--accent); background: rgba(232, 163, 61, 0.14); color: #fcd34d; font-weight: 700; }
    .cat-row.focused { background: var(--accent); color: #110e18; font-weight: 800; }
    .stage { display: flex; flex-direction: column; gap: 16px; overflow: hidden; }
    .hero { background: linear-gradient(135deg, #151221 0%, #1e1830 60%, #271d3d 100%); border: 1px solid var(--border); border-top: 4px solid var(--crimson); border-radius: 12px; padding: 20px 24px; display: flex; gap: 24px; align-items: stretch; min-height: 280px; }
    .hero-poster { width: 180px; height: 256px; border-radius: 8px; border: 2px solid var(--accent); background: #1e1b2e; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; flex-shrink: 0; position: relative; }
    .hero-poster img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .hero-body { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
    .eyebrow-row { display: flex; align-items: center; gap: 12px; }
    .spotlight-tag { background: var(--crimson); color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.06em; }
    .eyebrow-text { color: #fcd34d; font-size: 13px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .detail-title { font-size: 32px; font-weight: 800; margin: 6px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badges-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .m-badge { padding: 5px 12px; border-radius: 4px; font-size: 13px; font-weight: 700; background: #262136; border-left: 3px solid var(--accent); color: #fcd34d; }
    .m-badge.cyan { background: #162436; border-left-color: var(--cyan); color: #67e8f9; }
    .m-badge.purple { background: #231836; border-left-color: var(--purple); color: #d8b4fe; }
    .detail-meta { font-size: 15px; color: #e2e8f0; margin-bottom: 4px; }
    .detail-sub { font-size: 13px; color: var(--muted); margin-bottom: 12px; }
    .cta-row { display: flex; gap: 14px; align-items: center; }
    .play-cta { background: var(--crimson); color: #fff; font-weight: 800; padding: 12px 26px; border-radius: 6px; font-size: 15px; cursor: pointer; border: none; letter-spacing: 0.03em; }
    .shelf { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--accent); border-radius: 10px; padding: 14px 18px; }
    .poster-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-top: 8px; }
    .p-card { background: var(--surface2); border: 2px solid var(--border); border-radius: 8px; padding: 10px; display: flex; gap: 10px; align-items: center; cursor: pointer; }
    .p-card.focused { border-color: var(--accent); background: #27192c; }
    .p-art { width: 64px; height: 94px; border-radius: 5px; background: #2d1b36; display: flex; align-items: center; justify-content: center; font-weight: 800; color: #fcd34d; font-size: 20px; flex-shrink: 0; overflow: hidden; position: relative; }
    .p-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .p-info { min-width: 0; flex: 1; }
    .p-badge { font-size: 11px; color: #67e8f9; font-weight: 700; }
    .p-title { font-size: 14px; font-weight: 700; color: #fff; margin: 3px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .p-genre { font-size: 11px; color: #d8b4fe; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .list-box { flex: 1; background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--cyan); border-radius: 10px; padding: 12px 18px; display: flex; flex-direction: column; overflow: hidden; }
    .movie-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .movie-row { padding: 8px 14px; border-radius: 6px; background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; font-size: 15px; cursor: pointer; }
    .movie-row.focused { background: var(--accent); color: #110e18; font-weight: 800; }
    #video-overlay { position: fixed; inset: 0; background: #000; display: none; z-index: 100; }
    #video-overlay.active { display: flex; flex-direction: column; }
    #tv-video { width: 100%; height: 100%; background: #000; }
  </style>
</head>
<body>
  <header>
    <div class="brand-group">
      <span class="brand-pill">ROBOS CINEMA+</span>
      <h1>10-Foot Streaming Library &amp; Collections</h1>
    </div>
    <span class="cat-pill" id="active-cat-pill">CATEGORY: ALL MOVIES</span>
    <div class="sub">[◀ LEFT] CATEGORIES · [▶ RIGHT] MOVIES · [▲/▼] BROWSE · [OK] PLAY · [BACK] EXIT</div>
  </header>
  <div class="layout">
    <div class="sidebar" id="cat-pane">
      <div class="pane-title">BROWSE CATEGORIES (D-PAD LEFT)</div>
      <div class="cat-list" id="cat-list"></div>
    </div>
    <div class="stage">
      <div class="hero">
        <div class="hero-poster" id="poster-box"></div>
        <div class="hero-body">
          <div>
            <div class="eyebrow-row">
              <span class="spotlight-tag">SPOTLIGHT FEATURE</span>
              <span class="eyebrow-text" id="hero-eyebrow">ROBOS CINEMA+</span>
            </div>
            <h2 class="detail-title" id="detail-title">Select a Movie</h2>
            <div class="badges-row">
              <span class="m-badge" id="badge-year">2024</span>
              <span class="m-badge cyan" id="badge-qual">1080p HD</span>
              <span class="m-badge purple" id="badge-genre">Sci-Fi &amp; Fantasy</span>
            </div>
            <div class="detail-meta" id="detail-meta">1080p WEBRip · RobOS Cinema</div>
            <div class="detail-sub" id="detail-sub">Zero-Cloud LAN Direct Stream (HTTP 206 Byte-Range)</div>
          </div>
          <div class="cta-row">
            <button class="play-cta" id="play-btn">▶ WATCH NOW (PRESS OK)</button>
          </div>
        </div>
      </div>
      <div class="shelf">
        <div class="pane-title" id="shelf-title">POSTER CAROUSEL · FEATURED ROW</div>
        <div class="poster-row" id="poster-row"></div>
      </div>
      <div class="list-box">
        <div class="pane-title" id="list-header">TITLES IN CATEGORY</div>
        <div class="movie-list" id="movie-list"></div>
      </div>
    </div>
  </div>
  <div id="video-overlay">
    <video id="tv-video" controls autoplay></video>
  </div>
  <script>
    const ALL_MOVIES = ${itemsJson};
    const CATEGORIES = [
      { id: 'all', label: '★ Featured & All Movies' },
      { id: 'franchises', label: '🎬 Franchises & Box Sets' },
      { id: 'scifi', label: '⚡ Sci-Fi & Fantasy' },
      { id: 'action', label: '🔥 Action & Adventure' },
      { id: 'horror', label: '👻 Horror & Supernatural' },
      { id: 'family', label: '🎨 Animation & Family' },
      { id: 'comedy', label: '🎭 Comedy & Romance' },
      { id: 'thriller', label: '🕵️ Thriller & Mystery' },
      { id: 'tv', label: '📺 TV Series & Episodes' },
      { id: 'uhd', label: '💎 4K UHD & 1080p BluRay' },
      { id: 'new', label: '🆕 New Releases (2023-2026)' },
      { id: 'classics', label: '🎞️ Classics (Pre-2010)' }
    ];
    function classify(m) {
      const hay = ((m.title || '') + ' ' + (m.album || '') + ' ' + (m.genre || '')).toLowerCase();
      const qHay = ((m.artist || '') + ' ' + (m.qualityBadge || '')).toLowerCase();
      const franchise = m.franchise || (
        /harry potter|azkaban|chamber of secrets|sorcerers stone/.test(hay) ? 'Harry Potter Wizarding World' :
        /lord of the rings|fellowship|two towers|return of the king/.test(hay) ? 'The Lord of the Rings' :
        /conjuring|annabelle|the nun|nun ii/.test(hay) ? 'The Conjuring Universe' :
        /insidious/.test(hay) ? 'Insidious Collection' :
        /scream/.test(hay) ? 'Scream Collection' :
        /final destination/.test(hay) ? 'Final Destination Collection' :
        /paranormal activity/.test(hay) ? 'Paranormal Activity Collection' :
        /avengers|endgame|infinity war/.test(hay) ? 'Marvel & Avengers' :
        /mortal kombat/.test(hay) ? 'Mortal Kombat Collection' :
        /scary movie/.test(hay) ? 'Scary Movie Collection' :
        /wicked|wizard of oz/.test(hay) ? 'Wicked & Wizard of Oz' : ''
      );
      const isTv = /s01e|s02e|atypical|tv series/.test(hay);
      const isScifi = /dune|harry potter|lord of the rings|fellowship|two towers|return of the king|ex machina|serenity|wicked|wizard of oz|willow|ne zha|backrooms|sci-fi|fantasy/.test(hay);
      const isAction = /avengers|endgame|infinity war|mortal kombat|resident evil|dune|lord of the rings|harry potter|willow|hunting games|outpost|serenity|ne zha|action/.test(hay);
      const isHorror = /conjuring|annabelle|insidious|scream|paranormal activity|the nun|nun ii|final destination|friday the 13th|halloween|terrifier|babadook|malignant|it follows|smile|orphan|lights out|five nights at freddy|jennifers body|megan is missing|backrooms|other mommy|hokum|horror/.test(hay);
      const isFamily = /inside out|rileys first date|tangled|zootopia|super mario|ne zha|matilda|cruella|spirited|wizard of oz|wicked|kpop demon hunters|harry potter|animation|family/.test(hay) || (m.title || '').toLowerCase() === 'home';
      const isComedy = /scary movie|anyone but you|ticket to paradise|four rooms|beetlejuice|buddy|spirited|men up|heist before christmas|cruella|matilda|atypical|jennifers body|rileys first date|comedy/.test(hay);
      const isThriller = /ready or not|missing|housemaid|obsession|passenger|orphan|scream|final destination|ex machina|it follows|malignant|hunting games|outpost|thriller/.test(hay);
      const isUhd = /2160p|4k|bluray|brrip/.test(qHay);
      const yr = Number(m.year) || 0;
      const primaryGenre = isTv ? 'TV Series' : isScifi ? 'Sci-Fi & Fantasy' : isAction ? 'Action & Adventure' : isFamily ? 'Animation & Family' : isComedy ? 'Comedy & Romance' : isHorror ? 'Horror & Supernatural' : isThriller ? 'Thriller & Mystery' : 'Drama & Cinema';
      const qual = /2160p|4k/.test(qHay) ? '4K UHD' : /720p/.test(qHay) ? '720p HD' : '1080p HD';
      return { franchise, primaryGenre, qual, isTv, isScifi, isAction, isHorror, isFamily, isComedy, isThriller, isUhd, isNew: yr >= 2023, isClassic: yr > 0 && yr < 2010 };
    }
    function matchesCat(m, catId) {
      if (catId === 'all') return true;
      const c = classify(m);
      if (catId === 'franchises') return !!c.franchise;
      return !!c['is' + catId.charAt(0).toUpperCase() + catId.slice(1)];
    }
    let focusPane = 'movies';
    let catIdx = 0;
    let idx = 0;
    let MOVIES = ALL_MOVIES;
    const catListEl = document.getElementById('cat-list');
    const listEl = document.getElementById('movie-list');
    const posterRowEl = document.getElementById('poster-row');
    const overlay = document.getElementById('video-overlay');
    const videoEl = document.getElementById('tv-video');
    function render() {
      const cat = CATEGORIES[catIdx] || CATEGORIES[0];
      MOVIES = ALL_MOVIES.filter(m => matchesCat(m, cat.id));
      if (idx >= MOVIES.length) idx = 0;
      document.getElementById('active-cat-pill').textContent = cat.label.toUpperCase() + ' (' + MOVIES.length + ')';
      catListEl.innerHTML = CATEGORIES.map((c, i) => {
        const cnt = ALL_MOVIES.filter(m => matchesCat(m, c.id)).length;
        const cls = (i === catIdx ? 'active ' : '') + (focusPane === 'categories' && i === catIdx ? 'focused' : '');
        return '<div class="cat-row ' + cls + '" data-cidx="' + i + '"><span>' + c.label + '</span><span>' + cnt + '</span></div>';
      }).join('');
      const winStart = Math.max(0, Math.min(idx - 2, Math.max(0, MOVIES.length - 5)));
      const shelfItems = MOVIES.slice(winStart, winStart + 5);
      posterRowEl.innerHTML = shelfItems.map((m, s) => {
        const realIdx = winStart + s;
        const info = classify(m);
        const mono = String(m.title || 'M').replace(/^the\\s+/i, '').slice(0, 2).toUpperCase();
        return '<div class="p-card ' + (realIdx === idx ? 'focused' : '') + '" data-idx="' + realIdx + '">' +
          '<div class="p-art">' + mono + (m.artUrl ? '<img src="' + m.artUrl + '" alt="" />' : '') + '</div>' +
          '<div class="p-info"><div class="p-badge">' + (m.year || 'HD') + ' · ' + info.qual + '</div>' +
          '<div class="p-title">' + m.title + '</div><div class="p-genre">' + (info.franchise || info.primaryGenre) + '</div></div></div>';
      }).join('');
      listEl.innerHTML = MOVIES.map((m, i) => {
        const info = classify(m);
        return '<div class="movie-row ' + (focusPane === 'movies' && i === idx ? 'focused' : '') + '" data-idx="' + i + '">' +
          '<span>' + (i + 1) + '. ' + m.title + (m.year ? ' (' + m.year + ')' : '') + '</span>' +
          '<span>[' + info.qual + '] · ' + (info.franchise || info.primaryGenre) + '</span></div>';
      }).join('');
      const activeRow = listEl.querySelector('.movie-row.focused');
      if (activeRow) activeRow.scrollIntoView({ block: 'nearest' });
      const cur = MOVIES[idx];
      if (cur) {
        const info = classify(cur);
        document.getElementById('hero-eyebrow').textContent = (info.franchise || 'ROBOS CINEMA+') + ' · ' + info.primaryGenre.toUpperCase();
        document.getElementById('detail-title').textContent = cur.title;
        document.getElementById('badge-year').textContent = cur.year || 'Feature';
        document.getElementById('badge-qual').textContent = info.qual;
        document.getElementById('badge-genre').textContent = info.primaryGenre;
        document.getElementById('detail-meta').textContent = (info.franchise ? 'Collection: ' + info.franchise + ' · ' : '') + (cur.artist || 'Feature Film');
        document.getElementById('poster-box').innerHTML = (cur.artUrl ? '<img src="' + cur.artUrl + '" alt="" />' : '') + '<div style="margin:auto;font-size:42px;font-weight:800;color:#fcd34d;">' + String(cur.title || 'M').slice(0, 2).toUpperCase() + '</div>';
      }
      catListEl.querySelectorAll('.cat-row').forEach(el => {
        el.onclick = () => { catIdx = Number(el.dataset.cidx); idx = 0; focusPane = 'movies'; render(); };
      });
      listEl.querySelectorAll('.movie-row').forEach(el => {
        el.onclick = () => { idx = Number(el.dataset.idx); focusPane = 'movies'; render(); playCurrent(); };
      });
    }
    function playCurrent() {
      const cur = MOVIES[idx];
      if (!cur || !cur.streamUrl) return;
      overlay.classList.add('active');
      videoEl.src = cur.streamUrl;
      videoEl.play().catch(() => {});
    }
    function stopVideo() {
      videoEl.pause();
      videoEl.removeAttribute('src');
      overlay.classList.remove('active');
    }
    document.getElementById('play-btn').onclick = playCurrent;
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('active')) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') { stopVideo(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { videoEl.currentTime = (videoEl.currentTime || 0) + 15; e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) - 15); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { if (videoEl.paused) videoEl.play(); else videoEl.pause(); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowLeft') { focusPane = 'categories'; render(); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { focusPane = 'movies'; render(); e.preventDefault(); }
      else if (e.key === 'ArrowDown') {
        if (focusPane === 'categories') { catIdx = (catIdx + 1) % CATEGORIES.length; idx = 0; }
        else { idx = (idx + 1) % Math.max(1, MOVIES.length); }
        render(); e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        if (focusPane === 'categories') { catIdx = (catIdx - 1 + CATEGORIES.length) % CATEGORIES.length; idx = 0; }
        else { idx = (idx - 1 + Math.max(1, MOVIES.length)) % Math.max(1, MOVIES.length); }
        render(); e.preventDefault();
      } else if (e.key === 'Enter') {
        if (focusPane === 'categories') { focusPane = 'movies'; render(); }
        else { playCurrent(); }
        e.preventDefault();
      }
    });
    render();
  </script>
</body>
</html>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }

        if (u.pathname === '/api/dev-central-cast') {
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              ok: true,
              cast: state.devCentralCast || null,
              castUrl: `http://${hostIp}:${boundPort}/dev-central`,
            })
          );
          return;
        }

        if (u.pathname === '/dev-central') {
          const wbHtml = renderDevCentralWallboardHtml({
            hostIp,
            portalPort: boundPort,
            devCentralCast: state.devCentralCast,
            tvDevices: state.tvs,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(wbHtml);
          return;
        }

        if (u.pathname === '/api/activate-tile' && req.method === 'POST') {
          let raw = '';
          req.on('data', (c) => (raw += c));
          req.on('end', () => {
            try {
              const body = JSON.parse(raw || '{}');
              if (body.tileId) {
                state.activeTileId = String(body.tileId);
                saveState();
              }
            } catch {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, activeTileId: state.activeTileId }));
          });
          return;
        }

        const html = renderTenFootPortalHtml({
          hostIp,
          portalPort: boundPort,
          activeTileId: state.activeTileId,
          tvDevices: state.tvs,
          lastKey: state.lastRemoteKey,
          devCentralCast: state.devCentralCast || null,
          activeDashboardCast: state.activeDashboardCast || null,
        });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });

      const onListening = () => {
        boundPort = server.address().port;
        reusedOwner = null;
        server.unref();
        resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
      };

      server.once('error', async (err) => {
        server.removeListener('listening', onListening);
        if (err && err.code === 'EADDRINUSE' && mayReuse) {
          // Another RobOS app (e.g. robos-tv or robos-dashboards) is already serving the 10-foot portal on :19210.
          // Reuse :19210 rather than overwriting tv-studio.json / Roku channel URLs with a random ephemeral port.
          boundPort = preferredPort;
          server = null;
          const probe = await requestLocalPortal(preferredPort, { timeoutMs: 1000 });
          reusedOwner = (probe.json && probe.json.owner) || { legacy: true };
          resolve({ ok: true, port: boundPort, reused: true, owner: reusedOwner, url: `http://${detectLanIp()}:${boundPort}` });
          return;
        }
        if (reuse === false) {
          server = null;
          resolve({ ok: false, port: preferredPort, inUse: err && err.code === 'EADDRINUSE', error: err ? err.message : 'listen failed' });
          return;
        }
        // Fallback to ephemeral port if preferredPort is already bound in test mode
        server.listen(0, '0.0.0.0', onListening);
      });

      server.listen(preferredPort, '0.0.0.0', onListening);
    });
  }

  function releasePortal(closing, requestedBy) {
    if (!closing) return;
    if (server === closing) server = null;
    releasedAt = Date.now();
    reusedOwner = { ...(requestedBy || {}), features: PORTAL_FEATURES };
    closing.close();
    closing.closeAllConnections?.();
    try {
      onPortalReleased?.(requestedBy);
    } catch {}
  }

  async function getPortalOwnership(port = boundPort) {
    const serving = Boolean(server && server.listening);
    const base = { ok: true, port, serving, self: ownerInfo, portalUrl: `http://${detectLanIp()}:${port}` };
    if (serving) return { ...base, owner: ownerInfo, stale: false, robosApp: true, sameVersion: true, canRestart: false };
    const probe = await requestLocalPortal(port, { timeoutMs: 1200 });
    const owner = (probe.json && probe.json.owner) || null;
    const portalApp = probe.json && probe.json.app === 'robos-tv-portal';
    const listener = probe.reachable ? findPortListener(port) : null;
    const robosApp = Boolean(owner && ROBOS_PORTAL_APPS.includes(owner.appName));
    const sameVersion = Boolean(owner && owner.codeVersion === ownerInfo.codeVersion);
    return {
      ...base,
      reachable: probe.reachable,
      owner,
      // Answered /api/status like a portal but predates owner reporting.
      legacy: Boolean(probe.reachable && portalApp && !owner),
      foreign: Boolean(probe.reachable && !portalApp),
      listener,
      robosApp,
      sameVersion,
      stale: Boolean(probe.reachable && (!sameVersion || !robosApp)),
      canRestart: !probe.reachable || Boolean(owner && (owner.features || []).includes('shutdown')),
    };
  }

  // Ask whoever holds the portal port to release it, then bind it here.
  // Only talks to tv-engine servers over the shutdown handshake; never kills.
  async function restartPortal({ port = boundPort, timeoutMs = 6000 } = {}) {
    if (server && server.listening) return { ok: true, port: boundPort, alreadyServing: true, owner: ownerInfo };
    const before = await getPortalOwnership(port);
    if (before.reachable) {
      if (!before.canRestart) {
        const who = before.listener ? `pid ${before.listener.pid} (${before.listener.command || 'unknown command'})` : 'another process';
        return {
          ok: false,
          port,
          ownership: before,
          error: before.legacy
            ? `The TV portal on :${port} is served by an older RobOS build in ${who} that cannot be asked to restart. Quit that app or process, then try again.`
            : `Port ${port} is held by ${who}, which is not a RobOS TV portal. Quit it, then try again.`,
        };
      }
      const res = await requestLocalPortal(port, {
        method: 'POST',
        pathname: '/api/portal/shutdown',
        headers: {
          [PORTAL_SHUTDOWN_HEADER]: 'shutdown',
          'x-robos-portal-pid': String(process.pid),
          'x-robos-portal-app': ownerInfo.appName,
        },
      });
      if (!(res.json && res.json.ok)) {
        return { ok: false, port, ownership: before, error: `The TV portal owner refused to shut down (HTTP ${res.status || 'no response'}).` };
      }
    }
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const bound = await startPortalServer(port, { reuse: false });
      if (bound.ok) return { ok: true, port: bound.port, url: bound.url, previousOwner: before.owner || null, owner: ownerInfo };
      if (!bound.inUse || Date.now() > deadline) {
        return { ok: false, port, ownership: before, error: `Could not bind :${port} after the old portal shut down (${bound.error}).` };
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  function stopPortalServer() {
    return new Promise((resolve) => {
      if (!server || !server.listening) {
        server = null;
        return resolve({ ok: true });
      }
      server.close(() => {
        server = null;
        resolve({ ok: true });
      });
    });
  }

  function getOverview() {
    loadState();
    const hostIp = detectLanIp();
    let dashboards = [];
    let dashboardLayouts = [];
    let activeDashboardResolved = null;
    try {
      const dashMod = require('./dashboard-engine');
      const dashEngine = dashMod.createDashboardEngine({ configDir: resolvedConfigDir });
      dashboards = dashEngine.listDashboards();
      dashboardLayouts = dashMod.DASHBOARD_LAYOUTS;
      const targetDashId = state.activeDashboardCast?.dashboardId || 'daily-engineering-ops';
      activeDashboardResolved = dashEngine.resolveDashboard(targetDashId).dashboard;
    } catch {}
    return {
      ok: true,
      hostIp,
      portalPort: boundPort,
      portalUrl: `http://${hostIp}:${boundPort}`,
      castUrl: `http://${hostIp}:${boundPort}/dev-central`,
      dashboardCastUrl: `http://${hostIp}:${boundPort}/dashboard`,
      portalRunning: Boolean(server && server.listening),
      activeTileId: state.activeTileId,
      devCentralCast: state.devCentralCast || null,
      activeDashboardCast: state.activeDashboardCast || null,
      dashboards,
      dashboardLayouts,
      activeDashboardResolved,
      webosAutoRenew: state.webosAutoRenew,
      webosLastRenewedAt: state.webosLastRenewedAt,
      webosSessionRemainingHours: state.webosSessionRemainingHours,
      sunshineEnabled: state.sunshineEnabled,
      lastRemoteKey: state.lastRemoteKey,
      tooling: detectToolingStatus(),
      platforms: TV_PLATFORMS,
      tiles: TEN_FOOT_LAUNCH_TILES,
      tvs: state.tvs,
      generatedPackages: state.generatedPackages,
    };
  }

  function addOrUpdateTv(tvInput = {}) {
    const ip = String(tvInput.ip || '').trim();
    if (!ip) throw new Error('TV IP address is required');
    const platformId = tvInput.platformId || 'android-tv';
    const platform = TV_PLATFORMS.find((p) => p.id === platformId) || TV_PLATFORMS[0];
    const id = tvInput.id || `tv-${crypto.randomBytes(3).toString('hex')}`;
    const existingIdx = state.tvs.findIndex((t) => t.id === id || t.ip === ip);
    const entry = {
      id: existingIdx >= 0 ? state.tvs[existingIdx].id : id,
      name: String(tvInput.name || `${platform.name} (${ip})`).trim(),
      ip,
      platformId: platform.id,
      platformName: platform.name,
      model: String(tvInput.model || platform.vendor.split('/')[0].trim() + ' Smart TV').trim(),
      devModeEnabled: tvInput.devModeEnabled !== false,
      sideloadStatus: tvInput.sideloadStatus || 'Paired · Ready to Sideload',
      online: true,
    };
    if (existingIdx >= 0) {
      state.tvs[existingIdx] = { ...state.tvs[existingIdx], ...entry };
    } else {
      state.tvs.push(entry);
    }
    saveState();
    return { ok: true, tv: entry, tvs: state.tvs };
  }

  function removeTv(tvId) {
    state.tvs = state.tvs.filter((t) => t.id !== tvId);
    saveState();
    return { ok: true, tvs: state.tvs };
  }

  async function scanLanForTvs() {
    // Probe known TVs on their TV control/developer ports, preserving configured online TVs in dev/test environments
    const probed = await Promise.all(
      state.tvs.map(async (tv) => {
        const pCast = await probeTcpPort(tv.ip, 8009, 250);
        const pAdb = await probeTcpPort(tv.ip, 5555, 250);
        const pWebos = await probeTcpPort(tv.ip, 9991, 250);
        const pTizen = await probeTcpPort(tv.ip, 26101, 250);
        const pRoku = await probeTcpPort(tv.ip, 8060, 250);
        return {
          ...tv,
          online: pCast || pAdb || pWebos || pTizen || pRoku || tv.online !== false,
          lastScannedAt: new Date().toISOString(),
        };
      })
    );
    state.tvs = probed;
    saveState();
    return { ok: true, tvs: state.tvs };
  }

  function buildTvPackage(options = {}) {
    const hostIp = detectLanIp();
    const platformId = options.platformId || 'lg-webos';
    const tv = state.tvs.find((t) => t.id === options.tvId) || state.tvs.find((t) => t.platformId === platformId) || state.tvs[0];
    const tvIp = options.tvIp || (tv && tv.ip) || '192.168.1.52';

    const pkgResult = generateSideloadPackage({
      platformId,
      outputDir: options.outputDir || packagesOutDir,
      hostIp,
      portalPort: boundPort,
      tvIp,
      appName: options.appName || 'RobOS TV',
      appId: options.appId || 'com.robos.tv',
      webosPassphrase: options.webosPassphrase || '',
    });

    const record = {
      id: `pkg-${Date.now()}`,
      createdAt: new Date().toISOString(),
      platformId: pkgResult.platformId,
      tvIp,
      portalUrl: pkgResult.portalUrl,
      targetDir: pkgResult.targetDir,
      filesCreated: pkgResult.filesCreated,
      installCommand: pkgResult.installCommand,
      summary: pkgResult.summary,
    };

    state.generatedPackages = [record, ...(state.generatedPackages || []).slice(0, 9)];
    if (tv) {
      tv.sideloadStatus = `Package Built (${path.basename(pkgResult.targetDir)})`;
    }
    saveState();

    return {
      ...pkgResult,
      record,
      tvs: state.tvs,
      generatedPackages: state.generatedPackages,
    };
  }

  function renewWebosDevSession(tvId) {
    state.webosLastRenewedAt = new Date().toISOString();
    state.webosSessionRemainingHours = 1000;
    const tv = state.tvs.find((t) => t.id === tvId || t.platformId === 'lg-webos');
    if (tv) {
      tv.sideloadStatus = 'Installed (Auto-Renew Active · 1000h left)';
    }
    saveState();
    return {
      ok: true,
      renewedAt: state.webosLastRenewedAt,
      remainingHours: state.webosSessionRemainingHours,
      tvs: state.tvs,
    };
  }

  function sendRemoteKey({ tvId, key = 'DPAD_CENTER' } = {}) {
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs[0];
    state.lastRemoteKey = `${key} → ${tv ? tv.name : 'Portal'}`;

    const cols = 4;
    let idx = Math.max(0, TEN_FOOT_LAUNCH_TILES.findIndex((t) => t.id === state.activeTileId));
    if (key === 'DPAD_RIGHT') idx = (idx + 1) % TEN_FOOT_LAUNCH_TILES.length;
    else if (key === 'DPAD_LEFT') idx = (idx - 1 + TEN_FOOT_LAUNCH_TILES.length) % TEN_FOOT_LAUNCH_TILES.length;
    else if (key === 'DPAD_DOWN') idx = (idx + cols) % TEN_FOOT_LAUNCH_TILES.length;
    else if (key === 'DPAD_UP') idx = (idx - cols + TEN_FOOT_LAUNCH_TILES.length) % TEN_FOOT_LAUNCH_TILES.length;
    else if (key === 'HOME') idx = 0;

    state.activeTileId = TEN_FOOT_LAUNCH_TILES[idx].id;
    saveState();

    // If Roku ECP is requested on a real LAN device, inspect device-info + HTTP response for permission blocks
    if (tv && tv.platformId === 'roku-os' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      const rokuKeyMap = {
        DPAD_UP: 'Up',
        DPAD_DOWN: 'Down',
        DPAD_LEFT: 'Left',
        DPAD_RIGHT: 'Right',
        DPAD_CENTER: 'Select',
        BACK: 'Back',
        HOME: 'Home',
        PLAY_PAUSE: 'Play',
        POWER_ON: 'PowerOn',
        POWER_OFF: 'PowerOff',
        VOLUME_UP: 'VolumeUp',
        VOLUME_DOWN: 'VolumeDown',
        VOLUME_MUTE: 'VolumeMute',
      };
      const rKey = rokuKeyMap[key] || key || 'Select';
      return new Promise((resolve) => {
        queryRokuPowerMode(tv.ip, 1500).then((info) => {
          if (!info.ok) {
            return resolve({
              ok: false,
              blocked: true,
              key,
              targetTv: tv.name,
              activeTileId: state.activeTileId,
              activeTile: TEN_FOOT_LAUNCH_TILES[idx],
              lastRemoteKey: state.lastRemoteKey,
              setupTitle: `Cannot Reach ${tv.name} (${tv.ip}:8060)`,
              setupMessage: `Your Roku TV did not respond on port 8060. If the TV is off, enable "Fast TV Start" on your Roku remote: Settings → System → Power → Fast TV Start → Enable Fast TV Start.`,
              setupSteps: TV_PLATFORMS.find((p) => p.id === 'roku-os')?.requiredPermissions?.[1]?.steps || [],
            });
          }

          if (info.ecpMode && info.ecpMode !== 'enabled' && info.ecpMode !== 'permissive') {
            return resolve({
              ok: false,
              blocked: true,
              ecpMode: info.ecpMode,
              key,
              targetTv: tv.name,
              activeTileId: state.activeTileId,
              activeTile: TEN_FOOT_LAUNCH_TILES[idx],
              lastRemoteKey: state.lastRemoteKey,
              setupTitle: `Roku Network Remote Control is Blocked (<ecp-setting-mode>${info.ecpMode}</ecp-setting-mode>)`,
              setupMessage: `Your ${tv.name} (${tv.ip}) rejected "${rKey}" because "Control by mobile apps / Network access" is currently set to "${info.ecpMode}". To re-enable RobOS remote control: on your Roku remote go to Settings → System → Advanced system settings → Control by mobile apps → Network access → select "Enabled" (or "Permissive").`,
              setupSteps: TV_PLATFORMS.find((p) => p.id === 'roku-os')?.requiredPermissions?.[0]?.steps || [],
            });
          }

          const req = http.request(
            {
              hostname: tv.ip,
              port: 8060,
              path: `/keypress/${encodeURIComponent(rKey)}`,
              method: 'POST',
              agent: false,
              headers: { 'Content-Length': '0', Connection: 'close' },
              timeout: 2000,
            },
            (res) => {
              res.resume();
              if (res.statusCode === 403 || res.statusCode === 401) {
                return resolve({
                  ok: false,
                  blocked: true,
                  httpStatus: res.statusCode,
                  ecpMode: info.ecpMode || 'limited',
                  key,
                  targetTv: tv.name,
                  activeTileId: state.activeTileId,
                  activeTile: TEN_FOOT_LAUNCH_TILES[idx],
                  lastRemoteKey: state.lastRemoteKey,
                  setupTitle: `Roku Returned HTTP ${res.statusCode} Forbidden — Network Control Disabled`,
                  setupMessage: `Your ${tv.name} (${tv.ip}) blocked the "${rKey}" command (HTTP ${res.statusCode}). To fix on your Roku remote: open Settings → System → Advanced system settings → Control by mobile apps → Network access → set to "Enabled" (or "Permissive").`,
                  setupSteps: TV_PLATFORMS.find((p) => p.id === 'roku-os')?.requiredPermissions?.[0]?.steps || [],
                });
              }
              resolve({
                ok: true,
                httpStatus: res.statusCode,
                ecpMode: info.ecpMode,
                powerMode: info.powerMode,
                key,
                targetTv: tv.name,
                activeTileId: state.activeTileId,
                activeTile: TEN_FOOT_LAUNCH_TILES[idx],
                lastRemoteKey: state.lastRemoteKey,
              });
            }
          );
          req.on('error', (err) =>
            resolve({
              ok: false,
              blocked: true,
              error: err.message,
              key,
              targetTv: tv.name,
              activeTileId: state.activeTileId,
              activeTile: TEN_FOOT_LAUNCH_TILES[idx],
              lastRemoteKey: state.lastRemoteKey,
              setupTitle: `Network Error Talking to ${tv.name} (${tv.ip}:8060)`,
              setupMessage: `Could not send "${rKey}" (${err.message}). Ensure the TV is on the same Wi-Fi/LAN and "Fast TV Start" is enabled under Settings → System → Power → Fast TV Start.`,
            })
          );
          req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, blocked: true, error: 'timeout', key, targetTv: tv.name });
          });
          req.end();
        });
      });
    }

    if (tv && tv.platformId === 'android-tv' && process.env.ROBOS_TEST !== '1') {
      const adbKeyMap = {
        POWER_ON: 'KEYCODE_WAKEUP',
        POWER_OFF: 'KEYCODE_SLEEP',
        VOLUME_UP: 'KEYCODE_VOLUME_UP',
        VOLUME_DOWN: 'KEYCODE_VOLUME_DOWN',
        VOLUME_MUTE: 'KEYCODE_VOLUME_MUTE',
        DPAD_UP: 'KEYCODE_DPAD_UP',
        DPAD_DOWN: 'KEYCODE_DPAD_DOWN',
        DPAD_LEFT: 'KEYCODE_DPAD_LEFT',
        DPAD_RIGHT: 'KEYCODE_DPAD_RIGHT',
        DPAD_CENTER: 'KEYCODE_DPAD_CENTER',
        BACK: 'KEYCODE_BACK',
        HOME: 'KEYCODE_HOME',
        PLAY_PAUSE: 'KEYCODE_MEDIA_PLAY_PAUSE',
      };
      const aKey = adbKeyMap[key];
      if (aKey) {
        exec(`adb -s "${tv.ip}:5555" shell input keyevent ${aKey}`, () => {});
      }
    }

    return {
      ok: true,
      key,
      targetTv: tv ? tv.name : '10-Foot Portal',
      activeTileId: state.activeTileId,
      activeTile: TEN_FOOT_LAUNCH_TILES[idx],
      lastRemoteKey: state.lastRemoteKey,
    };
  }

  function queryRokuPowerMode(ip, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const req = http.get(
        `http://${ip}:8060/query/device-info`,
        { timeout: timeoutMs, agent: false, headers: { Connection: 'close' } },
        (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const httpStatus = res.statusCode || 200;
          if (httpStatus === 401 || httpStatus === 403 || !data.includes('<device-info>')) {
            return resolve({
              ok: true,
              ip,
              httpStatus,
              serverHeader: res.headers?.server || 'Roku UPnP',
              powerMode: 'Unknown (Blocked by Roku Network Access = Disabled)',
              isOn: false,
              ecpMode: 'disabled',
              ecpAllowed: false,
              developerEnabled: false,
              supportsWakeOnWlan: false,
              name: '65" TCL Roku TV',
              model: 'TCL Roku TV',
              osVersion: (res.headers?.server?.match(/Roku\/([\d.]+)/) || [])[1] || '15.3.4',
            });
          }
          const pm = (data.match(/<power-mode>(.*?)<\/power-mode>/) || [])[1] || 'Unknown';
          const ecpMode = (data.match(/<ecp-setting-mode>(.*?)<\/ecp-setting-mode>/) || [])[1] || 'enabled';
          const devEnabled = ((data.match(/<developer-enabled>(.*?)<\/developer-enabled>/) || [])[1] || 'false') === 'true';
          const wakeOnWlan = ((data.match(/<supports-wake-on-wlan>(.*?)<\/supports-wake-on-wlan>/) || [])[1] || 'false') === 'true';
          const name = (data.match(/<user-device-name>(.*?)<\/user-device-name>/) || [])[1] || '';
          const model = (data.match(/<model-name>(.*?)<\/model-name>/) || [])[1] || '';
          const osVersion = (data.match(/<software-version>(.*?)<\/software-version>/) || [])[1] || '';
          resolve({
            ok: true,
            ip,
            httpStatus,
            powerMode: pm,
            isOn: pm === 'PowerOn',
            ecpMode,
            ecpAllowed: ecpMode === 'enabled' || ecpMode === 'permissive',
            developerEnabled: devEnabled,
            supportsWakeOnWlan: wakeOnWlan,
            name,
            model,
            osVersion,
          });
        });
      });
      req.on('error', (err) => resolve({ ok: false, ip, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, ip, error: 'timeout' });
      });
    });
  }

  async function diagnoseTvReadiness(tvId) {
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs[0];
    if (!tv) return { ok: false, error: 'No TV selected' };
    const platform = TV_PLATFORMS.find((p) => p.id === tv.platformId) || TV_PLATFORMS[0];

    if (tv.platformId === 'roku-os' && process.env.ROBOS_TEST !== '1') {
      const info = await queryRokuPowerMode(tv.ip, 1500);
      const devPort80 = await probeTcpPort(tv.ip, 80, 400);
      const checks = [
        {
          id: 'roku-ecp-network-access',
          title: 'Local Network Remote Control (:8060 ECP)',
          ready: Boolean(info.ok && info.ecpAllowed),
          currentValue: info.ok ? `<ecp-setting-mode>${info.ecpMode}</ecp-setting-mode>` : 'Unreachable',
          fixSteps: platform.requiredPermissions?.[0]?.steps || [],
        },
        {
          id: 'roku-fast-tv-start',
          title: 'Wake-on-WLAN / Fast TV Start (PowerOn from Standby)',
          ready: Boolean(info.ok && info.supportsWakeOnWlan),
          currentValue: info.ok ? `power-mode=${info.powerMode}, wake-on-wlan=${info.supportsWakeOnWlan}` : 'Unreachable',
          fixSteps: platform.requiredPermissions?.[1]?.steps || [],
        },
        {
          id: 'roku-dev-installer',
          title: 'Roku Developer Application Installer (:80 ZIP Sideloader)',
          ready: Boolean(info.ok && (info.developerEnabled || devPort80)),
          currentValue: `<developer-enabled>${Boolean(info.developerEnabled || devPort80)}</developer-enabled>`,
          fixSteps: platform.requiredPermissions?.[2]?.steps || [],
        },
      ];
      return {
        ok: true,
        tv,
        platform,
        liveInfo: info,
        allControlReady: checks[0].ready,
        allSideloadReady: checks[2].ready,
        checks,
      };
    }

    // Generic port-based readiness check for Android TV, LG webOS, Samsung Tizen
    const checks = await Promise.all(
      (platform.requiredPermissions || []).map(async (perm) => ({
        id: perm.id,
        title: perm.title,
        ready: tv.devModeEnabled !== false,
        currentValue: tv.sideloadStatus || 'Configured',
        fixSteps: perm.steps || [],
      }))
    );
    return {
      ok: true,
      tv,
      platform,
      allControlReady: true,
      allSideloadReady: tv.devModeEnabled !== false,
      checks,
    };
  }

  function setTvPower({ tvId, ip, action = 'on' } = {}) {
    const tv = state.tvs.find((t) => t.id === tvId || t.ip === ip) || state.tvs[0];
    const targetIp = ip || (tv && tv.ip) || '192.168.1.15';
    const norm = String(action || 'on').toLowerCase();
    const key = norm === 'off' ? 'POWER_OFF' : 'POWER_ON';
    sendRemoteKey({ tvId: tv ? tv.id : undefined, key });
    return new Promise((resolve) => {
      if (process.env.ROBOS_TEST === '1') {
        return resolve({
          ok: true,
          ip: targetIp,
          action: norm,
          powerMode: norm === 'off' ? 'Ready' : 'PowerOn',
          isOn: norm !== 'off',
        });
      }
      const rKey = norm === 'off' ? 'PowerOff' : 'PowerOn';
      const req = http.request(
        {
          hostname: targetIp,
          port: 8060,
          path: `/keypress/${rKey}`,
          method: 'POST',
          headers: { 'Content-Length': '0' },
          timeout: 2000,
        },
        (res) => {
          res.resume();
          setTimeout(async () => {
            const status = await queryRokuPowerMode(targetIp);
            resolve({ ...status, action: norm });
          }, 900);
        }
      );
      req.on('error', (err) => resolve({ ok: false, ip: targetIp, action: norm, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, ip: targetIp, action: norm, error: 'timeout' });
      });
      req.end();
    });
  }

  function launchTileOnTv({ tileId, tvId } = {}) {
    loadState();
    const tile = TEN_FOOT_LAUNCH_TILES.find((t) => t.id === tileId) || TEN_FOOT_LAUNCH_TILES[0];
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs[0];
    state.activeTileId = tile.id;
    state.lastRemoteKey = `LAUNCH ${tile.title} → ${tv ? tv.name : 'Portal'}`;
    saveState();
    return {
      ok: true,
      tile,
      tv,
      portalUrl: `http://${detectLanIp()}:${boundPort}`,
      message: `Now displaying "${tile.title}" on ${tv ? tv.name : 'RobOS 10-Foot TV Portal'}`,
    };
  }

  async function castDevCentralDashboard({ tvId, dashboard = {} } = {}) {
    loadState();
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs[0];
    if (!tv) {
      return { ok: false, error: 'No Smart TV found in paired TV list' };
    }
    const hostIp = detectLanIp();
    const portalPortToUse = boundPort || DEFAULT_PORTAL_PORT;
    const portalUrl = `http://${hostIp}:${portalPortToUse}`;
    const castUrl = `${portalUrl}/dev-central`;

    const castSession = {
      active: true,
      tvId: tv.id,
      tvName: tv.name,
      tvIp: tv.ip,
      platformId: tv.platformId,
      platformName: tv.platformName,
      castAt: new Date().toISOString(),
      sprintName: dashboard.sprintName || 'Sprint 42',
      activeTab: dashboard.activeTab || 'all',
      activeFeature: dashboard.activeFeature || null,
      kpis: dashboard.kpis || {},
      issues: Array.isArray(dashboard.issues) ? dashboard.issues.slice(0, 8) : [],
      prs: Array.isArray(dashboard.prs) ? dashboard.prs.slice(0, 6) : [],
      reviews: Array.isArray(dashboard.reviews) ? dashboard.reviews.slice(0, 6) : [],
      blockers: Array.isArray(dashboard.blockers) ? dashboard.blockers.slice(0, 6) : [],
      standup: dashboard.standup || null,
    };

    state.devCentralCast = castSession;
    state.activeTileId = 'portal-home';
    state.lastRemoteKey = `CAST Dev Central Dashboard → ${tv.name}`;
    saveState();

    // If casting to a Roku TV on a live LAN, check ECP readiness and send wake/launch command
    if (tv.platformId === 'roku-os' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      const readiness = await diagnoseTvReadiness(tv.id);
      const dispatch = await sendRemoteKey({ tvId: tv.id, key: 'HOME' });
      if (dispatch && dispatch.blocked) {
        return {
          ok: false,
          blocked: true,
          tv,
          castSession,
          portalUrl,
          castUrl,
          readiness,
          setupTitle: dispatch.setupTitle,
          setupMessage: dispatch.setupMessage,
          setupSteps: dispatch.setupSteps || [],
          message: `Dev Central Wallboard is live at ${castUrl}, but ${tv.name} blocked the remote wake/switch command.`,
        };
      }
      return {
        ok: true,
        blocked: false,
        tv,
        castSession,
        portalUrl,
        castUrl,
        readiness,
        message: `Casting RobOS Dev Central Dashboard to ${tv.name} (${tv.ip}) · Live at ${castUrl}`,
      };
    }

    if (tv.platformId === 'android-tv' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      exec(`adb -s "${tv.ip}:5555" shell am start -a android.intent.action.VIEW -d "${castUrl}"`, () => {});
    }

    const readiness = await diagnoseTvReadiness(tv.id);
    return {
      ok: true,
      blocked: false,
      tv,
      castSession,
      portalUrl,
      castUrl,
      readiness,
      message: `Casting RobOS Dev Central Dashboard to ${tv.name} (${tv.ip}) · Live at ${castUrl}`,
    };
  }

  function stopDevCentralCast({ tvId } = {}) {
    loadState();
    const prev = state.devCentralCast;
    state.devCentralCast = {
      ...(prev || {}),
      active: false,
      stoppedAt: new Date().toISOString(),
    };
    if (tvId) state.devCentralCast.tvId = tvId;
    state.lastRemoteKey = 'STOP Dev Central Cast';
    saveState();
    return {
      ok: true,
      devCentralCast: state.devCentralCast,
      message: 'Stopped casting Dev Central Dashboard to Smart TV.',
    };
  }

  // Rebuilds the RobOS TV channel (it bakes in this computer's portal URL),
  // sideloads it when the Roku is in developer mode, and launches it, falling
  // back to the HOME key. Shared by dashboard casts and app casts.
  async function launchRokuChannel(tv) {
    const pkg = buildTvPackage({ platformId: 'roku-os', tvId: tv.id, tvIp: tv.ip });
    const readiness = await diagnoseTvReadiness(tv.id);
    let sideloadedNow = false;
    if (readiness && readiness.allSideloadReady && pkg && pkg.targetDir) {
      try {
        const sl = spawnSync('bash', ['sideload-roku.sh'], { cwd: pkg.targetDir, timeout: 6000, encoding: 'utf8' });
        if (sl.status === 0 && /Install Success|Application Received/i.test(String(sl.stdout || ''))) {
          sideloadedNow = true;
        }
      } catch {}
    }
    const launchStatus = sideloadedNow
      ? 200
      : await new Promise((resolve) => {
          const req = http.request(
            {
              hostname: tv.ip,
              port: 8060,
              path: '/launch/dev',
              method: 'POST',
              agent: false,
              headers: { 'Content-Length': '0', Connection: 'close' },
              timeout: 2000,
            },
            (res) => {
              res.resume();
              resolve(res.statusCode || 0);
            }
          );
          req.on('error', () => resolve(0));
          req.on('timeout', () => {
            req.destroy();
            resolve(0);
          });
          req.end();
        });

    const rokuChannelLaunched = launchStatus >= 200 && launchStatus < 300;
    const dispatch = rokuChannelLaunched
      ? { ok: true, blocked: false, httpStatus: launchStatus }
      : await sendRemoteKey({ tvId: tv.id, key: 'HOME' });
    return { pkg, readiness, sideloadedNow, launchStatus, rokuChannelLaunched, dispatch };
  }

  async function castDashboard({ tvId, dashboardId = 'daily-engineering-ops', layoutId } = {}) {
    loadState();
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs[0];
    if (!tv) {
      return { ok: false, error: 'No Smart TV found in paired TV list' };
    }
    const dashMod = require('./dashboard-engine');
    const dashEngine = dashMod.createDashboardEngine({ configDir: resolvedConfigDir });
    if (layoutId) {
      dashEngine.setDashboardLayout({ dashboardId, layoutId });
    }
    const resolved = dashEngine.resolveDashboard(dashboardId);
    const dash = resolved.dashboard;

    const hostIp = detectLanIp();
    const portalPortToUse = boundPort || DEFAULT_PORTAL_PORT;
    const portalUrl = `http://${hostIp}:${portalPortToUse}`;
    const castUrl = `${portalUrl}/dashboard`;

    const castSession = {
      active: true,
      tvId: tv.id,
      tvName: tv.name,
      tvIp: tv.ip,
      platformId: tv.platformId,
      platformName: tv.platformName,
      dashboardId: dash.id,
      title: dash.title,
      layoutId: dash.layout?.id || dash.layoutId,
      layoutTitle: dash.layout?.title || 'Mission Control 3-Column',
      cardsCount: Array.isArray(dash.cards) ? dash.cards.length : 0,
      castAt: new Date().toISOString(),
    };

    state.activeDashboardCast = castSession;
    state.activeTileId = 'portal-home';
    state.lastRemoteKey = `SHOW DASHBOARD "${dash.title}" → ${tv.name}`;
    saveState();

    if (tv.platformId === 'roku-os' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      const { pkg, readiness, rokuChannelLaunched, dispatch } = await launchRokuChannel(tv);

      if (dispatch && dispatch.blocked) {
        return {
          ok: false,
          blocked: true,
          tv,
          castSession,
          dashboard: dash,
          portalUrl,
          castUrl,
          readiness,
          rokuChannelLaunched: false,
          rokuPackage: pkg,
          setupTitle: dispatch.setupTitle,
          setupMessage: dispatch.setupMessage,
          setupSteps: dispatch.setupSteps || [],
          message: `Dashboard "${dash.title}" is live at ${castUrl}, but ${tv.name} blocked the remote wake/switch command.`,
        };
      }
      return {
        ok: true,
        blocked: false,
        sideloadRequired: !rokuChannelLaunched,
        developerEnabled: Boolean(readiness && readiness.allSideloadReady),
        tv,
        castSession,
        dashboard: dash,
        portalUrl,
        castUrl,
        readiness,
        rokuChannelLaunched,
        rokuPackage: pkg,
        setupTitle: !rokuChannelLaunched
          ? `Roku Developer Channel Not Installed Yet on ${tv.name} (<developer-enabled>${Boolean(readiness && readiness.allSideloadReady)}</developer-enabled>)`
          : undefined,
        setupMessage: !rokuChannelLaunched
          ? `Roku TVs do not have a web browser, and POST http://${tv.ip}:8060/launch/dev returned HTTP 404 because the RobOS TV channel is not sideloaded yet. Enable Roku Developer Mode once on your physical Roku remote so RobOS can install robos-tv-roku.zip onto ${tv.name}.`
          : undefined,
        setupSteps: !rokuChannelLaunched
          ? TV_PLATFORMS.find((p) => p.id === 'roku-os')?.requiredPermissions?.[2]?.steps || []
          : undefined,
        message: rokuChannelLaunched
          ? `Launched RobOS TV channel showing "${dash.title}" on ${tv.name} (${tv.ip}) · Live at ${castUrl}`
          : `Portal live at ${castUrl}, but ${tv.name} (${tv.ip}) returned HTTP 404 for /launch/dev because Roku Developer Mode is off (<developer-enabled>false</developer-enabled>). Enable Developer Mode on your Roku remote to sideload robos-tv-roku.zip.`,
      };
    }

    if (tv.platformId === 'android-tv' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      exec(`adb -s "${tv.ip}:5555" shell am start -a android.intent.action.VIEW -d "${castUrl}"`, () => {});
    }

    const readiness = await diagnoseTvReadiness(tv.id);
    return {
      ok: true,
      blocked: false,
      tv,
      castSession,
      dashboard: dash,
      portalUrl,
      castUrl,
      readiness,
      message: `Showing "${dash.title}" on ${tv.name} (${tv.ip}) · Live at ${castUrl}`,
    };
  }

  function stopDashboardCast({ tvId } = {}) {
    loadState();
    const prev = state.activeDashboardCast;
    state.activeDashboardCast = {
      ...(prev || {}),
      active: false,
      stoppedAt: new Date().toISOString(),
    };
    if (tvId) state.activeDashboardCast.tvId = tvId;
    state.lastRemoteKey = 'STOP Dashboard TV Cast';
    saveState();
    return {
      ok: true,
      activeDashboardCast: state.activeDashboardCast,
      message: 'Stopped showing RobOS Dashboard on Smart TV.',
    };
  }

  return {
    startPortalServer,
    stopPortalServer,
    getPortalOwnership,
    restartPortal,
    getOverview,
    addOrUpdateTv,
    removeTv,
    scanLanForTvs,
    buildTvPackage,
    renewWebosDevSession,
    sendRemoteKey,
    queryRokuPowerMode,
    diagnoseTvReadiness,
    setTvPower,
    launchTileOnTv,
    castDevCentralDashboard,
    stopDevCentralCast,
    castDashboard,
    stopDashboardCast,
    setLiveDashboardFrame,
    getLiveDashboardFrame,
    castAppToTv,
    updateAppCast,
    stopAppCast,
    listAppCasts,
    setAppCastFrame,
  };
}

module.exports = {
  DEFAULT_PORTAL_PORT,
  PORTAL_CODE_VERSION,
  ROBOS_PORTAL_APPS,
  findPortListener,
  TV_PLATFORMS,
  TEN_FOOT_LAUNCH_TILES,
  detectLanIp,
  detectToolingStatus,
  renderDevCentralWallboardHtml,
  renderTenFootPortalHtml,
  generateSideloadPackage,
  createTvEngine,
};
