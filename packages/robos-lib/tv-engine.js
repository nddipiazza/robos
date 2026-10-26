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
    try {
      const dashMod = require('./dashboard-engine');
      const dashEngine = dashMod.createDashboardEngine();
      initialDash = dashEngine.resolveDashboard('daily-engineering-ops').dashboard;
    } catch {}

    const commitsCard = (initialDash?.cards || []).find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-git-commits'
    );
    const calendarCard = (initialDash?.cards || []).find(
      (c) => (c.componentTag || c.widgetTag) === 'robos-widget-calendar-today'
    );
    const agentsCard = (initialDash?.cards || []).find(
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

    const commits = ((commitsCard && commitsCard.liveData && commitsCard.liveData.commits) || []).slice(0, 10);
    const events = ((calendarCard && calendarCard.liveData && calendarCard.liveData.events) || []).slice(0, 6);
    const sessions = ((agentsCard && agentsCard.liveData && agentsCard.liveData.sessions) || []).slice(0, 3);

    const commitRowsXml = Array.from({ length: 10 }, (_, i) => {
      const c = commits[i];
      const y = 166 + i * 70;
      const sha = c ? c.shortSha || c.hash || String(c.sha || '').slice(0, 8) : '';
      const line1 = c ? `${i + 1}. ${String(c.subject || '').slice(0, 48)}` : `${i + 1}. -`;
      const line2 = c ? `   #${sha} | ${c.author || 'dev'} | ${c.relativeTime || 'recent'}` : '';
      return `    <Label id="commitTitle${i}" translation="[68, ${y}]" scale="[0.68, 0.68]" width="790" height="36" numLines="1" color="0xF8FAFCFF" text="${safeXml(line1)}" />
    <Label id="commitMeta${i}" translation="[68, ${y + 28}]" scale="[0.58, 0.58]" width="920" height="34" numLines="1" color="0x67E8F9FF" text="${safeXml(line2)}" />
    <Rectangle translation="[68, ${y + 58}]" width="544" height="1" color="0x1E293BFF" />`;
    }).join('\n');

    const calendarRowsXml = Array.from({ length: 6 }, (_, i) => {
      const ev = events[i];
      const y = 170 + i * 114;
      const status = String(ev?.status || 'upcoming').toUpperCase();
      const stripeColor = status === 'IN-PROGRESS' || status === 'NOW' ? '0x10B981FF' : status === 'COMPLETED' ? '0x64748BFF' : '0x00BCD4FF';
      const timeText = ev ? `${ev.time}   [${status}]` : '';
      const titleText = ev ? String(ev.title || '').slice(0, 44) : '';
      const locText = ev ? `Location: ${ev.location || 'Desk'}` : '';
      return `    <Rectangle id="calBg${i}" translation="[676, ${y}]" width="544" height="100" color="0x161F30FF" visible="${ev ? 'true' : 'false'}" />
    <Rectangle id="calStripe${i}" translation="[676, ${y}]" width="6" height="100" color="${stripeColor}" visible="${ev ? 'true' : 'false'}" />
    <Label id="calTime${i}" translation="[696, ${y + 10}]" scale="[0.58, 0.58]" width="860" height="34" numLines="1" color="0x6EE7B7FF" text="${safeXml(timeText)}" />
    <Label id="calTitle${i}" translation="[696, ${y + 38}]" scale="[0.70, 0.70]" width="720" height="36" numLines="1" color="0xF8FAFCFF" text="${safeXml(titleText)}" />
    <Label id="calLoc${i}" translation="[696, ${y + 68}]" scale="[0.58, 0.58]" width="860" height="34" numLines="1" color="0x94A3B8FF" text="${safeXml(locText)}" />`;
    }).join('\n');

    const agentRowsXml = Array.from({ length: 3 }, (_, i) => {
      const s = sessions[i];
      const y = 170 + i * 230;
      const sTitle = s ? s.name || s.title || s.id || 'Agent Session' : '';
      const sRef = s ? s.taskRef || s.branch || 'main' : 'main';
      const titleText = s ? `* ${String(sTitle).slice(0, 44)}` : '';
      const metaText = s ? `${s.providerLabel || s.provider || 'Agent'} | ${sRef} | [${String(s.status || 'running').toUpperCase()}]` : '';
      const rawLines = Array.isArray(s?.statusLines) ? s.statusLines : Array.isArray(s?.tailLines) ? s.tailLines : [];
      const tails = rawLines.slice(-4);
      const tailLabels = Array.from({ length: 4 }, (__, tIdx) => {
        const ty = y + 78 + tIdx * 30;
        const tLine = tails[tIdx] ? String(tails[tIdx]).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 56) : '';
        return `    <Label id="agentTail${i}_${tIdx}" translation="[1310, ${ty}]" scale="[0.55, 0.55]" width="940" height="34" numLines="1" color="0xA7F3D0FF" text="${safeXml(tLine)}" />`;
      }).join('\n');
      return `    <Rectangle id="agentCard${i}" translation="[1284, ${y}]" width="568" height="214" color="0x161F30FF" visible="${s ? 'true' : 'false'}" />
    <Rectangle id="agentStripe${i}" translation="[1284, ${y}]" width="568" height="3" color="0xF59E0BFF" visible="${s ? 'true' : 'false'}" />
    <Label id="agentTitle${i}" translation="[1300, ${y + 10}]" scale="[0.68, 0.68]" width="780" height="36" numLines="1" color="0xF8FAFCFF" text="${safeXml(titleText)}" />
    <Label id="agentMeta${i}" translation="[1300, ${y + 38}]" scale="[0.56, 0.56]" width="940" height="34" numLines="1" color="0xFCD34DFF" text="${safeXml(metaText)}" />
    <Rectangle id="agentTermBg${i}" translation="[1298, ${y + 68}]" width="540" height="134" color="0x090D16FF" visible="${s ? 'true' : 'false'}" />
${tailLabels}`;
    }).join('\n');

    const manifest = `title=${appName}\nsubtitle=RobOS 10-Foot Smart TV & Live Dashboards Suite\nmajor_version=1\nminor_version=2\nbuild_version=3\nui_resolutions=fhd\n`;
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
        url = m.top.apiUrl
        if url <> ""
            http = CreateObject("roUrlTransfer")
            http.SetUrl(url)
            raw = http.GetToString()
            if raw <> ""
                m.top.payloadJson = raw
            end if
        end if
        sleep(10000)
    end while
end sub
`;
    const mainSceneXml = `<?xml version="1.0" encoding="utf-8" ?>
<component name="MainScene" extends="Scene">
  <script type="text/brightscript" uri="pkg:/components/MainScene.brs" />
  <children>
    <Rectangle id="bg" width="1920" height="1080" color="0x070B12FF" />
    <Rectangle id="headerBar" width="1920" height="84" color="0x0F172AFF" />
    <Rectangle id="headerAccent" translation="[0, 84]" width="1920" height="2" color="0x00BCD4FF" />
    <Label id="brandLabel" scale="[0.90, 0.90]" text="RobOS Dashboards - Daily Engineering &amp; Agent Ops" translation="[48, 24]" width="1280" height="40" numLines="1" color="0xF8FAFCFF" />
    <Label id="hostLabel" scale="[0.62, 0.62]" text="LIVE CAST | ${portalUrl}/dashboard (${tvIp})" translation="[1240, 30]" width="1000" height="34" numLines="1" horizAlign="right" color="0x67E8F9FF" />

    <!-- Column 1: 10 Latest Commit Messages -->
    <Rectangle id="colCommitsCard" translation="[48, 102]" width="584" height="784" color="0x111827FF" />
    <Rectangle translation="[48, 102]" width="584" height="4" color="0x00BCD4FF" />
    <Label id="colCommitsHeader" scale="[0.76, 0.76]" text="1. 10 LATEST COMMIT MESSAGES" translation="[68, 118]" width="700" height="36" numLines="1" color="0x67E8F9FF" />
    <Rectangle translation="[68, 154]" width="544" height="2" color="0x1E293BFF" />
${commitRowsXml}

    <!-- Column 2: Calendar Events for the Day -->
    <Rectangle id="colCalendarCard" translation="[656, 102]" width="584" height="784" color="0x111827FF" />
    <Rectangle translation="[656, 102]" width="584" height="4" color="0x10B981FF" />
    <Label id="colCalendarHeader" scale="[0.76, 0.76]" text="2. CALENDAR EVENTS FOR THE DAY" translation="[676, 118]" width="700" height="36" numLines="1" color="0x6EE7B7FF" />
    <Rectangle translation="[676, 154]" width="544" height="2" color="0x1E293BFF" />
${calendarRowsXml}

    <!-- Column 3: Running RobOS Agent Sessions & Tailed Status Lines -->
    <Rectangle id="colAgentsCard" translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
    <Rectangle translation="[1264, 102]" width="608" height="4" color="0xF59E0BFF" />
    <Label id="colAgentsHeader" scale="[0.72, 0.72]" text="3. RUNNING ROBOS AGENT SESSIONS (TAILED)" translation="[1284, 118]" width="780" height="36" numLines="1" color="0xFCD34DFF" />
    <Rectangle translation="[1284, 154]" width="568" height="2" color="0x1E293BFF" />
${agentRowsXml}

    <!-- Bottom Status & Compact Tile Selector -->
    <Rectangle id="heroCard" translation="[48, 902]" width="1824" height="132" color="0x111827FF" />
    <Rectangle translation="[48, 902]" width="1824" height="2" color="0x1E293BFF" />
    <Label id="heroTitle" scale="[0.75, 0.75]" text="RobOS Live TV Wallboard Active - D-Pad Up/Down/OK switches TV experience" translation="[72, 916]" width="1460" height="36" numLines="1" color="0xF8FAFCFF" />
    <Label id="heroDesc" scale="[0.62, 0.62]" text="10 Latest Git Commits | Today's Calendar Schedule | Active Coding Agent Sessions &amp; Tailed Logs" translation="[72, 954]" width="1760" height="34" numLines="1" color="0x94A3B8FF" />
    <Label id="statusFooter" scale="[0.62, 0.62]" text="Connected to ${portalUrl}/dashboard | Auto-refreshing every 10s" translation="[72, 988]" width="1760" height="34" numLines="1" color="0x67E8F9FF" />
    <LabelList
      id="tileList"
      translation="[1220, 916]"
      scale="[0.66, 0.66]"
      itemSize="[940, 42]"
      itemSpacing="[0, 6]"
      numRows="3"
      color="0xF8FAFCFF"
      focusedColor="0x061318FF" />
  </children>
</component>
`;
    const mainSceneBrs = `sub init()
    m.tileList = m.top.findNode("tileList")
    m.heroTitle = m.top.findNode("heroTitle")
    m.heroDesc = m.top.findNode("heroDesc")
    m.statusFooter = m.top.findNode("statusFooter")
    m.brandLabel = m.top.findNode("brandLabel")

    m.tiles = [
        { id: "portal-home", title: "1. Daily Engineering & Agent Ops Dashboard", desc: "3-column live graphical dashboard from RobOS Dashboards (${portalUrl}/dashboard)." },
        { id: "crpg-realm", title: "2. Realm of Heroes cRPG [Godot 4]", desc: "Party-based tactical isometric D&D 5e cRPG in Godot 4." },
        { id: "quest-warrior-dragon", title: "3. Quest: Warrior Dragon [2D JRPG]", desc: "Clean-room NES-authentic 2D JRPG in Godot 4." },
        { id: "tabletop-rpg", title: "4. RobOS Tabletop RPG [Dungeon Board]", desc: "HeroQuest-inspired 26x19 tactical dungeon crawler." },
        { id: "audio-jukebox", title: "5. Audio Player & Virtual DJ [100k Songs]", desc: "100,000-song library with synchronized TV lyrics and Virtual DJ." },
        { id: "home-intercom", title: "6. Home Speaker Intercom [Multi-Room]", desc: "Broadcast voice notes and Kokoro neural TTS announcements." },
        { id: "pr-review-theater", title: "7. PR Review Theater [1080p Cinema]", desc: "Watch narrated 1080p agent proof-of-work walkthroughs." },
        { id: "pos-menu-board", title: "8. POS Order & Prep Display [Wall Kiosk]", desc: "Live cafe/bar order prep queue and digital menu board." }
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

    m.dashTask = CreateObject("roSGNode", "DashboardTask")
    m.dashTask.apiUrl = "${portalUrl}/api/dashboard-cast"
    m.dashTask.observeField("payloadJson", "onPayloadUpdated")
    m.dashTask.control = "RUN"
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

sub onPayloadUpdated()
    raw = m.dashTask.payloadJson
    if raw = "" then return
    json = ParseJson(raw)
    if json = invalid or json.dashboard = invalid then return
    dash = json.dashboard
    if dash.title <> invalid then m.brandLabel.text = "RobOS Dashboards - " + cleanAscii(dash.title)
    if dash.cards = invalid then return

    for each card in dash.cards
        cTag = card.componentTag
        if cTag = invalid then cTag = card.widgetTag
        if cTag = "robos-widget-git-commits" and card.liveData <> invalid and card.liveData.commits <> invalid
            commits = card.liveData.commits
            for i = 0 to 9
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
        else if cTag = "robos-widget-calendar-today" and card.liveData <> invalid and card.liveData.events <> invalid
            events = card.liveData.events
            for i = 0 to 5
                bgNode = m.top.findNode("calBg" + i.ToStr())
                stNode = m.top.findNode("calStripe" + i.ToStr())
                tmNode = m.top.findNode("calTime" + i.ToStr())
                tlNode = m.top.findNode("calTitle" + i.ToStr())
                lcNode = m.top.findNode("calLoc" + i.ToStr())
                if i < events.Count()
                    ev = events[i]
                    if bgNode <> invalid then bgNode.visible = true
                    if stNode <> invalid then stNode.visible = true
                    if tmNode <> invalid then tmNode.text = cleanAscii(ev.time) + "   [" + UCase(cleanAscii(ev.status)) + "]"
                    if tlNode <> invalid then tlNode.text = Left(cleanAscii(ev.title), 44)
                    if lcNode <> invalid then lcNode.text = "Location: " + cleanAscii(ev.location)
                end if
            end for
        else if cTag = "robos-widget-agent-sessions" and card.liveData <> invalid and card.liveData.sessions <> invalid
            sessions = card.liveData.sessions
            for i = 0 to 2
                if i < sessions.Count()
                    s = sessions[i]
                    atNode = m.top.findNode("agentTitle" + i.ToStr())
                    amNode = m.top.findNode("agentMeta" + i.ToStr())
                    sTitle = s.name
                    if sTitle = invalid then sTitle = s.title
                    sRef = s.taskRef
                    if sRef = invalid then sRef = "main"
                    if atNode <> invalid and sTitle <> invalid then atNode.text = "* " + Left(cleanAscii(sTitle), 44)
                    if amNode <> invalid then amNode.text = cleanAscii(s.provider) + " | " + cleanAscii(sRef) + " | [" + UCase(cleanAscii(s.status)) + "]"
                    linesArr = s.statusLines
                    if linesArr = invalid then linesArr = s.tailLines
                    if linesArr <> invalid
                        for tIdx = 0 to 3
                            tlNode = m.top.findNode("agentTail" + i.ToStr() + "_" + tIdx.ToStr())
                            if tlNode <> invalid and tIdx < linesArr.Count()
                                tlNode.text = Left(cleanAscii(linesArr[tIdx]), 56)
                            end if
                        end for
                    end if
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
        m.statusFooter.text = "Launched on RobOS Host (${portalUrl}): " + t.title
    end if
end sub
`;
    write('manifest', manifest);
    write('source/Main.brs', mainBrs);
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

function createTvEngine({ configDir, portalPort = DEFAULT_PORTAL_PORT } = {}) {
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
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
    } catch {}
  }

  loadState();

  let server = null;
  let boundPort = state.portalPort || DEFAULT_PORTAL_PORT;

  function startPortalServer(preferredPort = boundPort) {
    if (server && server.listening) {
      return Promise.resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
    }
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        loadState();
        const hostIp = detectLanIp();
        const u = new URL(req.url || '/', `http://${hostIp}:${boundPort}`);

        if (u.pathname === '/api/status') {
          const payload = JSON.stringify({
            ok: true,
            app: 'robos-tv-portal',
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
          const dashEngine = require('./dashboard-engine').createDashboardEngine({ configDir: resolvedConfigDir });
          const targetDashId =
            u.searchParams.get('id') ||
            state.activeDashboardCast?.dashboardId ||
            'daily-engineering-ops';
          const resolved = dashEngine.resolveDashboard(targetDashId);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              ok: true,
              cast: state.activeDashboardCast || null,
              dashboard: resolved.dashboard,
              castUrl: `http://${hostIp}:${boundPort}/dashboard`,
            })
          );
          return;
        }

        if (u.pathname === '/dashboard' || u.pathname.startsWith('/dashboard/')) {
          const dashEngineModule = require('./dashboard-engine');
          const dashEngine = dashEngineModule.createDashboardEngine({ configDir: resolvedConfigDir });
          const slugId = u.pathname.startsWith('/dashboard/')
            ? decodeURIComponent(u.pathname.slice('/dashboard/'.length))
            : null;
          const targetDashId =
            slugId ||
            u.searchParams.get('id') ||
            state.activeDashboardCast?.dashboardId ||
            'daily-engineering-ops';
          const resolved = dashEngine.resolveDashboard(targetDashId);
          if (state.activeDashboardCast?.layoutId && state.activeDashboardCast.dashboardId === targetDashId) {
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

      server.once('error', () => {
        // Fallback to ephemeral port if preferredPort is already bound
        server.listen(0, '0.0.0.0', () => {
          boundPort = server.address().port;
          server.unref();
          resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
        });
      });

      server.listen(preferredPort, '0.0.0.0', () => {
        boundPort = server.address().port;
        server.unref();
        resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
      });
    });
  }

  function stopPortalServer() {
    return new Promise((resolve) => {
      if (!server) return resolve({ ok: true });
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
  };
}

module.exports = {
  DEFAULT_PORTAL_PORT,
  TV_PLATFORMS,
  TEN_FOOT_LAUNCH_TILES,
  detectLanIp,
  detectToolingStatus,
  renderDevCentralWallboardHtml,
  renderTenFootPortalHtml,
  generateSideloadPackage,
  createTvEngine,
};
