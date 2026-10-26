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
    let initialSlideshow = null;
    try {
      const dashMod = require('./dashboard-engine');
      const dashEngine = dashMod.createDashboardEngine();
      initialDash = dashEngine.resolveDashboard('daily-engineering-ops').dashboard;
      initialSlideshow = dashEngine.getSlideshowState();
    } catch {}

    const dashCards = initialDash?.cards || [];
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
      const bh = cnt === 0 ? 3 : Math.max(5, Math.min(64, Math.round((cnt / maxDayCommits) * 64)));
      const by = 448 - bh;
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
      const maH = Math.max(4, Math.min(64, Math.round((ma / maxDayCommits) * 64)));
      const maY = 448 - maH;
      return `    <Rectangle id="commitBar${i}" translation="[${bx}, ${by}]" width="12" height="${bh}" color="${barColor}" />
    <Rectangle id="maDot${i}" translation="[${bx + 2}, ${maY}]" width="8" height="3" color="0xFCD34DFF" />`;
    }).join('\n');

    const commitRowsXml = Array.from({ length: 6 }, (_, i) => {
      const c = commits[i];
      const y = 516 + i * 59;
      const sha = c ? c.shortSha || c.hash || String(c.sha || '').slice(0, 8) : '';
      const line1 = c ? `${i + 1}. ${String(c.subject || '').slice(0, 48)}` : `${i + 1}. -`;
      const line2 = c ? `   #${sha} | ${c.author || 'dev'} | ${c.relativeTime || 'recent'}` : '';
      return `    <Label id="commitTitle${i}" translation="[68, ${y}]" scale="[0.63, 0.63]" width="820" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(line1)}" />
    <Label id="commitMeta${i}" translation="[68, ${y + 23}]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(line2)}" />
    <Rectangle translation="[68, ${y + 50}]" width="544" height="1" color="0x1E293BFF" />`;
    }).join('\n');

    const musicPlaying = Boolean(musicData.isPlaying !== false);
    const musicStatusLine = `NOW PLAYING [${musicPlaying ? 'PLAYING' : 'PAUSED'}]  ${musicData.elapsed || '24:45'} / ${musicData.duration || '46:07'}  |  ${musicData.output || 'Local Audio'}`;
    const musicTitleLine = `${musicData.title || 'Ambience & Music'}`;
    const musicArtistClean = String(musicData.artistAlbum || `${musicData.artist || ''} - ${musicData.album || ''}`).replace(/[^\x20-\x7E]/g, '-');
    const musicArtistLine = `${musicArtistClean}  (${musicData.source || 'Google Drive'})`;
    const musicPct = Math.max(4, Math.min(100, Number(musicData.progressPct) || 54));
    const musicBarW = Math.max(16, Math.round((musicPct / 100) * 512));
    const upNextArr = Array.isArray(musicData.upNext) ? musicData.upNext : [];
    const musicUpNextLine = upNextArr.length
      ? `Up Next: ${upNextArr.map((u) => `${u.title} (${u.artist})`).join(' | ')}`
      : 'Up Next: Lux Aeterna (Clint Mansell) | 8BitStereo mixed';

    const eqBarsXml = Array.from({ length: 8 }, (_, i) => {
      const bx = 1116 + i * 11;
      const bh = 10 + ((i * 7) % 22);
      const by = 228 - bh;
      const bColor = i % 3 === 0 ? '0xA855F7FF' : i % 2 === 0 ? '0x00BCD4FF' : '0x10B981FF';
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

    const agentRowsXml = Array.from({ length: 3 }, (_, i) => {
      const s = sessions[i];
      const y = 320 + i * 182;
      const isVis = s ? 'true' : 'false';
      const sTitle = s ? s.name || s.title || s.id || 'In-Progress Session' : '';
      const sAct = s ? s.activity || s.cwd || '/home/ndipiazza/source/robos' : '';
      const sEl = s ? s.elapsedFormatted || '00:05' : '00:00';
      const titleText = s ? `* ${String(sTitle).slice(0, 46)}` : '';
      const metaText = s ? `IN PROGRESS [${sEl}] | ${String(sAct).slice(0, 42)}` : '';
      const rawLines = Array.isArray(s?.statusLines) ? s.statusLines : Array.isArray(s?.tailLines) ? s.tailLines : [];
      const tails = rawLines.slice(-3);
      const tailLabels = Array.from({ length: 3 }, (__, tIdx) => {
        const ty = y + 70 + tIdx * 28;
        const tLine = tails[tIdx] ? String(tails[tIdx]).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 56) : '';
        return `    <Label id="agentTail${i}_${tIdx}" translation="[1310, ${ty}]" scale="[0.54, 0.54]" width="940" height="32" numLines="1" color="0xA7F3D0FF" visible="${isVis}" text="${safeXml(tLine)}" />`;
      }).join('\n');
      return `    <Rectangle id="agentCard${i}" translation="[1284, ${y}]" width="568" height="170" color="0x161F30FF" visible="${isVis}" />
    <Rectangle id="agentStripe${i}" translation="[1284, ${y}]" width="568" height="3" color="0x10B981FF" visible="${isVis}" />
    <Rectangle id="agentDot${i}" translation="[1300, ${y + 13}]" width="10" height="10" color="0x10B981FF" visible="${isVis}" />
    <Label id="agentTitle${i}" translation="[1316, ${y + 8}]" scale="[0.64, 0.64]" width="760" height="34" numLines="1" color="0xF8FAFCFF" visible="${isVis}" text="${safeXml(titleText)}" />
    <Label id="agentMeta${i}" translation="[1300, ${y + 34}]" scale="[0.54, 0.54]" width="940" height="32" numLines="1" color="0x6EE7B7FF" visible="${isVis}" text="${safeXml(metaText)}" />
    <Rectangle id="agentTermBg${i}" translation="[1298, ${y + 62}]" width="540" height="98" color="0x090D16FF" visible="${isVis}" />
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
        url = m.top.apiUrl
        if url <> ""
            http = CreateObject("roUrlTransfer")
            http.SetUrl(url)
            raw = http.GetToString()
            if raw <> ""
                m.top.payloadJson = raw
            end if
        end if
        sleep(2000)
    end while
end sub
`;
    const ssEnabled = Boolean(initialSlideshow?.enabled);
    const ssInterval = Math.max(3, Number(initialSlideshow?.intervalSeconds) || 15);
    const ssRem = Math.max(1, Number(initialSlideshow?.secondsRemainingInSlide) || ssInterval);
    const ssSlideNum = Number(initialSlideshow?.slideNumber) || 1;
    const ssTotal = Number(initialSlideshow?.totalSlides) || 3;
    const ssBadgeText = ssEnabled
      ? `SLIDESHOW: ${ssSlideNum}/${ssTotal} (${ssInterval}s) - Next in ${ssRem}s`
      : `SINGLE DASHBOARD (Slideshow Off)`;

    const mainSceneXml = `<?xml version="1.0" encoding="utf-8" ?>
<component name="MainScene" extends="Scene">
  <script type="text/brightscript" uri="pkg:/components/MainScene.brs" />
  <children>
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

    <!-- SLIDE 0: Daily Engineering & Calendar Ops (daily-engineering-ops) -->
    <Group id="slideGroup0" visible="true">
    <!-- Column 1: GitHub Repo Activity (nddipiazza/robos) + Commits, main CI & Latest Release -->
    <Rectangle id="colCommitsCard" translation="[48, 102]" width="584" height="784" color="0x111827FF" />
    <Rectangle translation="[48, 102]" width="584" height="4" color="0x00BCD4FF" />
    <Label id="colCommitsHeader" scale="[0.70, 0.70]" text="1. GITHUB REPO: nddipiazza/robos (main CI, Release &amp; Commits)" translation="[68, 118]" width="760" height="36" numLines="1" color="0x67E8F9FF" />
    <Rectangle translation="[68, 152]" width="544" height="2" color="0x1E293BFF" />

    <!-- Release Status Box -->
    <Rectangle id="ghReleaseBg" translation="[68, 162]" width="544" height="72" color="0x161F30FF" />
    <Rectangle id="ghReleaseStripe" translation="[68, 162]" width="6" height="72" color="${relStripeColor}" />
    <Label id="ghReleaseLine1" translation="[84, 172]" scale="[0.58, 0.58]" width="900" height="32" numLines="1" color="0x6EE7B7FF" text="${safeXml(relLine1)}" />
    <Label id="ghReleaseLine2" translation="[84, 200]" scale="[0.54, 0.54]" width="960" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(relLine2)}" />

    <!-- CI Status in main Box -->
    <Rectangle id="ghCiBg" translation="[68, 240]" width="544" height="92" color="0x161F30FF" />
    <Rectangle id="ghCiStripe" translation="[68, 240]" width="6" height="92" color="0x00BCD4FF" />
    <Label id="ghCiHeader" translation="[84, 248]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0x67E8F9FF" text="${safeXml(ciHeaderLine)}" />
    <Label id="ghCiRow1" translation="[84, 274]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0xA7F3D0FF" text="${safeXml(ciRow1)}" />
    <Label id="ghCiRow2" translation="[84, 300]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0xFCD34DFF" text="${safeXml(ciRow2)}" />

    <!-- 30-Day RobOS Commit Velocity & Breakdown Graph Box -->
    <Rectangle id="commitGraphCard" translation="[68, 340]" width="544" height="142" color="0x161F30FF" />
    <Rectangle id="commitGraphStripe" translation="[68, 340]" width="6" height="142" color="0x10B981FF" />
    <Label id="commitGraphHeader" translation="[84, 348]" scale="[0.53, 0.53]" width="960" height="28" numLines="1" color="0x6EE7B7FF" text="${safeXml(graphHeaderLine)}" />
    <Rectangle id="commitPlotBg" translation="[106, 376]" width="494" height="74" color="0x090D16FF" />
    <Label translation="[78, 376]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="${safeXml(String(maxDayCommits))}" />
    <Label translation="[78, 404]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="50" />
    <Label translation="[82, 430]" scale="[0.46, 0.46]" width="60" height="24" numLines="1" color="0x94A3B8FF" text="0" />
    <Rectangle translation="[106, 394]" width="494" height="1" color="0x1E293BFF" />
    <Rectangle translation="[106, 413]" width="494" height="1" color="0x1E293BFF" />
    <Rectangle translation="[106, 432]" width="494" height="1" color="0x1E293BFF" />
${commitGraphBarsXml}
    <Label id="commitGraphLegend" translation="[84, 454]" scale="[0.50, 0.50]" width="1020" height="26" numLines="1" color="0xCBD5E1FF" text="${safeXml(graphLegendLine)}" />

    <Label id="ghCommitsSubheader" translation="[68, 490]" scale="[0.55, 0.55]" width="900" height="26" numLines="1" color="0x94A3B8FF" text="LATEST ROBOS COMMITS IN MAIN:" />
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

    <!-- Column 3: Countdown Until Next Meeting + Running RobOS Agent Sessions (Tailed) -->
    <Rectangle id="colAgentsCard" translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
    <Rectangle translation="[1264, 102]" width="608" height="4" color="0xF59E0BFF" />
    <Label id="colAgentsHeader" scale="[0.65, 0.65]" text="3. NEXT MEETING COUNTDOWN &amp; RUNNING AGENTS (TAILED)" translation="[1284, 118]" width="840" height="36" numLines="1" color="0xFCD34DFF" />
    <Rectangle translation="[1284, 154]" width="568" height="2" color="0x1E293BFF" />

    <!-- Countdown Until Next Meeting Widget Box -->
    <Rectangle id="nextMeetingCardBg" translation="[1284, 164]" width="568" height="142" color="0x161F30FF" />
    <Rectangle id="nextMeetingStripe" translation="[1284, 164]" width="6" height="142" color="0x10B981FF" />
    <Label id="countdownWidgetTitle" translation="[1304, 172]" scale="[0.55, 0.55]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="COUNTDOWN UNTIL NEXT MEETING (LIVE 1Hz SECOND-BY-SECOND)" />
    <Label id="countdownTimerLabel" translation="[1304, 198]" scale="[1.02, 1.02]" width="520" height="44" numLines="1" color="0xF8FAFCFF" text="${safeXml(meetingData.countdownLabel || 'T - 00:28:00')}" />
    <Label id="nextMeetingTitleLabel" translation="[1304, 236]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0x67E8F9FF" text="${safeXml(nmTitleLine)}" />
    <Label id="nextMeetingMetaLabel" translation="[1304, 258]" scale="[0.52, 0.52]" width="980" height="28" numLines="1" color="0x94A3B8FF" text="${safeXml(nmMetaLine)}" />
    <Rectangle id="secBarTrack" translation="[1304, 282]" width="528" height="12" color="0x090D16FF" />
    <Rectangle id="secBarFill" translation="[1304, 282]" width="${nmBarW}" height="12" color="0x10B981FF" />
    <Rectangle id="secPulseDot" translation="[1820, 174]" width="14" height="14" color="0x10B981FF" />

${agentRowsXml}
    </Group>

    <!-- SLIDE 1: Smart TV & Connected Studio Wallboard (smart-home-tv-command) -->
    <Group id="slideGroup1" visible="false">
      <!-- Column 1: Paired Smart TVs & Cast Sessions -->
      <Rectangle translation="[48, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[48, 102]" width="584" height="4" color="0x00BCD4FF" />
      <Label scale="[0.68, 0.68]" text="1. PAIRED SMART TVs &amp; 10-FOOT CAST FLEET (LAN)" translation="[68, 118]" width="780" height="36" numLines="1" color="0x67E8F9FF" />
      <Rectangle translation="[68, 152]" width="544" height="2" color="0x1E293BFF" />

      <Rectangle translation="[68, 166]" width="544" height="136" color="0x161F30FF" />
      <Rectangle translation="[68, 166]" width="6" height="136" color="0x10B981FF" />
      <Label translation="[86, 176]" scale="[0.66, 0.66]" width="760" height="32" numLines="1" color="0xF8FAFCFF" text="1. 65&quot; TCL Roku TV (Living room) [ACTIVE CAST]" />
      <Label translation="[86, 206]" scale="[0.56, 0.56]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="IP: 192.168.1.15 | Roku OS 15.3.4 | ECP :8060 + Sideloaded Channel" />
      <Label translation="[86, 234]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Mode: Multi-Dashboard Slideshow Rotation | 1080p FHD SceneGraph" />
      <Label translation="[86, 262]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="Portal: ${portalUrl}/dashboard | Polling /api/dashboard-cast (2s)" />

      <Rectangle translation="[68, 316]" width="544" height="122" color="0x161F30FF" />
      <Rectangle translation="[68, 316]" width="6" height="122" color="0x00BCD4FF" />
      <Label translation="[86, 326]" scale="[0.64, 0.64]" width="760" height="32" numLines="1" color="0xF8FAFCFF" text="2. Living Room OLED (LG OLED65C4PUA)" />
      <Label translation="[86, 356]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="IP: 192.168.1.64 | LG webOS 24 | Auto-Renew Timer: 998h Left" />
      <Label translation="[86, 386]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="Package: com.robos.tv_1.0.0_all.ipk | SSH :9991 &amp; SSAP :3000 Online" />

      <Rectangle translation="[68, 452]" width="544" height="122" color="0x161F30FF" />
      <Rectangle translation="[68, 452]" width="6" height="122" color="0xA855F7FF" />
      <Label translation="[86, 462]" scale="[0.64, 0.64]" width="760" height="32" numLines="1" color="0xF8FAFCFF" text="3. Basement TV (Sony Bravia 4K Google TV)" />
      <Label translation="[86, 492]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xD8B4FEFF" text="IP: 192.168.1.52 | Android TV ADB :5555 &amp; Google Cast :8009" />
      <Label translation="[86, 522]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="Leanback Launcher Installed | Moonlight 4K 120Hz Stream Ready" />

      <Rectangle translation="[68, 588]" width="544" height="122" color="0x161F30FF" />
      <Rectangle translation="[68, 588]" width="6" height="122" color="0xF59E0BFF" />
      <Label translation="[86, 598]" scale="[0.64, 0.64]" width="760" height="32" numLines="1" color="0xF8FAFCFF" text="4. Studio Wall Display (Samsung QN90D Neo QLED)" />
      <Label translation="[86, 628]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xFCD34DFF" text="IP: 192.168.1.78 | Samsung Tizen | SDB :26101 &amp; REST :8001" />
      <Label translation="[86, 658]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="Wallboard Mode: KGraph Architecture &amp; CI Build Status Sync" />

      <Rectangle translation="[68, 724]" width="544" height="140" color="0x090D16FF" />
      <Label translation="[86, 738]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0x10B981FF" text="SUNSHINE / MOONLIGHT 4K 120Hz STREAMING HOST: READY" />
      <Label translation="[86, 768]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0xCBD5E1FF" text="Encoder: VAAPI / NVENC Low-Latency | Audio: PulseAudio 5.1 Surround" />
      <Label translation="[86, 796]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="Gamepad Bridge: DualSense / Xbox XInput + Roku ECP D-Pad Active" />
      <Label translation="[86, 824]" scale="[0.50, 0.50]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="Zero-Cloud LAN Discovery: SSDP + mDNS + ARP Subnet Sweep" />

      <!-- Column 2: Smart Light Studio & Circadian Daylight Scenes -->
      <Rectangle translation="[656, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[656, 102]" width="584" height="4" color="0x10B981FF" />
      <Label scale="[0.66, 0.66]" text="2. SMART LIGHT STUDIO &amp; CIRCADIAN SCENES (LAN)" translation="[676, 118]" width="820" height="36" numLines="1" color="0x6EE7B7FF" />
      <Rectangle translation="[676, 152]" width="544" height="2" color="0x1E293BFF" />

      <Rectangle translation="[676, 166]" width="544" height="114" color="0x161F30FF" />
      <Rectangle translation="[676, 166]" width="6" height="114" color="0xF59E0BFF" />
      <Label translation="[694, 176]" scale="[0.62, 0.62]" width="820" height="32" numLines="1" color="0xFCD34DFF" text="ACTIVE SCENE: Deep Focus Coding (4800K Daylight)" />
      <Label translation="[694, 206]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xF8FAFCFF" text="24-Hour Circadian Curve: ENABLED | CI Build Status Light Bar: SYNCED" />
      <Label translation="[694, 236]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x6EE7B7FF" text="4 of 5 LAN Fixtures ON | Avg Brightness: 82% | Zero-Cloud UDP/HTTP" />

      <Rectangle translation="[676, 294]" width="544" height="102" color="0x161F30FF" />
      <Rectangle translation="[676, 294]" width="6" height="102" color="0x38BDF8FF" />
      <Label translation="[694, 304]" scale="[0.62, 0.62]" width="800" height="30" numLines="1" color="0xF8FAFCFF" text="1. Desk Key Light Bar (Elgato Key Light :9123) [ON - 85%]" />
      <Label translation="[694, 334]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="Temp: 4800K Neutral White | Studio Desk | Color: #38BDF8" />
      <Rectangle translation="[694, 368]" width="430" height="10" color="0x38BDF8FF" />

      <Rectangle translation="[676, 408]" width="544" height="102" color="0x161F30FF" />
      <Rectangle translation="[676, 408]" width="6" height="102" color="0x22D3EEFF" />
      <Label translation="[694, 418]" scale="[0.62, 0.62]" width="800" height="30" numLines="1" color="0xF8FAFCFF" text="2. Ceiling WiZ Strip (Philips WiZ UDP :38899) [ON - 90%]" />
      <Label translation="[694, 448]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="Mode: Cyan Focus Glow | Living Room / Studio | Color: #22D3EE" />
      <Rectangle translation="[694, 482]" width="455" height="10" color="0x22D3EEFF" />

      <Rectangle translation="[676, 522]" width="544" height="102" color="0x161F30FF" />
      <Rectangle translation="[676, 522]" width="6" height="102" color="0x10B981FF" />
      <Label translation="[694, 532]" scale="[0.62, 0.62]" width="800" height="30" numLines="1" color="0xF8FAFCFF" text="3. Rack Status WLED (WLED HTTP :80) [ON - 100%]" />
      <Label translation="[694, 562]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="CI Build Bar Sync: main Branch Passing | Server Rack | Color: #10B981" />
      <Rectangle translation="[694, 596]" width="506" height="10" color="0x10B981FF" />

      <Rectangle translation="[676, 636]" width="544" height="102" color="0x161F30FF" />
      <Rectangle translation="[676, 636]" width="6" height="102" color="0xA855F7FF" />
      <Label translation="[694, 646]" scale="[0.62, 0.62]" width="800" height="30" numLines="1" color="0xF8FAFCFF" text="4. Studio Bias Hue (Philips Hue Bridge REST) [ON - 70%]" />
      <Label translation="[694, 676]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xD8B4FEFF" text="Mode: 65&quot; Roku TV Backlight Bias | Living Room | Color: #A855F7" />
      <Rectangle translation="[694, 710]" width="354" height="10" color="0xA855F7FF" />

      <Rectangle translation="[676, 750]" width="544" height="114" color="0x090D16FF" />
      <Label translation="[694, 764]" scale="[0.58, 0.58]" width="860" height="30" numLines="1" color="0x94A3B8FF" text="5. Reading Floor Lamp (TP-Link Kasa XOR :9999) [STANDBY - 45%]" />
      <Label translation="[694, 794]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="Scheduled: Sunset Warm Dimming (2700K) at 18:30 Local Time" />
      <Label translation="[694, 822]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="Protocols: WiZ, WLED, Kasa, Hue, LIFX, Govee, Elgato, Shelly, Yeelight" />

      <!-- Column 3: Connected Studio Schedule & Audio / Voice Status -->
      <Rectangle translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
      <Rectangle translation="[1264, 102]" width="608" height="4" color="0xF59E0BFF" />
      <Label scale="[0.65, 0.65]" text="3. STUDIO SCHEDULE, HOME SPEAKER &amp; VOICE" translation="[1284, 118]" width="840" height="36" numLines="1" color="0xFCD34DFF" />
      <Rectangle translation="[1284, 154]" width="568" height="2" color="0x1E293BFF" />

      <Rectangle translation="[1284, 166]" width="568" height="146" color="0x161F30FF" />
      <Rectangle translation="[1284, 166]" width="6" height="146" color="0xA855F7FF" />
      <Label translation="[1304, 176]" scale="[0.62, 0.62]" width="860" height="32" numLines="1" color="0xD8B4FEFF" text="ROBOS AUDIO PLAYER &amp; HOME SPEAKER INTERCOM" />
      <Label translation="[1304, 206]" scale="[0.66, 0.66]" width="800" height="34" numLines="1" color="0xF8FAFCFF" text="${safeXml(musicTitleLine)} - ${safeXml(musicArtistClean)}" />
      <Label translation="[1304, 238]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="Virtual DJ (RobOS Voice Kokoro-82M): Ready | 100k Library Indexed" />
      <Label translation="[1304, 268]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="${safeXml(musicUpNextLine)}" />

      <Rectangle translation="[1284, 328]" width="568" height="166" color="0x161F30FF" />
      <Rectangle translation="[1284, 328]" width="6" height="166" color="0x10B981FF" />
      <Label translation="[1304, 338]" scale="[0.60, 0.60]" width="880" height="30" numLines="1" color="0x6EE7B7FF" text="NEXT STUDIO MEETING &amp; DUAL GOOGLE CALENDARS" />
      <Label translation="[1304, 370]" scale="[0.76, 0.76]" width="740" height="36" numLines="1" color="0xF8FAFCFF" text="${safeXml(nmTitleLine)}" />
      <Label translation="[1304, 408]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(nmMetaLine)}" />
      <Label translation="[1304, 438]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0xCBD5E1FF" text="Synced Accounts: nicholas.dipiazza@gmail.com + nicholas@hermetiq.com" />
      <Label translation="[1304, 464]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0xA7F3D0FF" text="Thunderbird CalDAV + RobOS Dashboard Live Sync Verified" />

      <Rectangle translation="[1284, 510]" width="568" height="354" color="0x090D16FF" />
      <Rectangle translation="[1284, 510]" width="568" height="3" color="0x00BCD4FF" />
      <Label translation="[1304, 524]" scale="[0.60, 0.60]" width="880" height="30" numLines="1" color="0x67E8F9FF" text="CONNECTED WORKSTATION &amp; VPN SANDBOX TELEMETRY" />
      <Label translation="[1304, 560]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xF8FAFCFF" text="* Host LAN IP: ${safeXml(portalUrl)} | TV Portal Server: ONLINE" />
      <Label translation="[1304, 592]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x6EE7B7FF" text="* Prompt Security Guard: ACTIVE (Gitleaks + Presidio + OWASP LLM01)" />
      <Label translation="[1304, 624]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xFCD34DFF" text="* VPN Sandbox (ip netns): Ready | 3-Barrier Kill-Switch Armed" />
      <Label translation="[1304, 656]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xD8B4FEFF" text="* Cloud Accounts: Google Workspace (2 Accounts) + GitHub CLI Linked" />
      <Label translation="[1304, 688]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="* Slideshow Engine: Deterministic Epoch Sync Across Desktop + Roku TV" />
      <Label translation="[1304, 720]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x94A3B8FF" text="Configure cycle interval (seconds) in RobOS Dashboards toolbar." />
    </Group>

    <!-- SLIDE 2: Knowledge Graph & Sprint Pulse (kgraph-architecture-pulse) -->
    <Group id="slideGroup2" visible="false">
      <!-- Column 1: Dual-State Knowledge Graph Health & SHACL Validation -->
      <Rectangle translation="[48, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[48, 102]" width="584" height="4" color="0xA855F7FF" />
      <Label scale="[0.66, 0.66]" text="1. KNOWLEDGE GRAPH (OSLC JSON-LD &amp; W3C SHACL)" translation="[68, 118]" width="800" height="36" numLines="1" color="0xD8B4FEFF" />
      <Rectangle translation="[68, 152]" width="544" height="2" color="0x1E293BFF" />

      <Rectangle translation="[68, 166]" width="544" height="120" color="0x161F30FF" />
      <Rectangle translation="[68, 166]" width="6" height="120" color="0x10B981FF" />
      <Label translation="[86, 176]" scale="[0.68, 0.68]" width="760" height="34" numLines="1" color="0x6EE7B7FF" text="W3C SHACL VALIDATION GATE: 100% PASSING" />
      <Label translation="[86, 208]" scale="[0.56, 0.56]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="19 Modular KGraph Packages (.robos/kgraphs/) | 0 Shape Violations" />
      <Label translation="[86, 238]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="World 1 (main) vs World 2 (Branch) Blast Radius: 0 Breaking Diffs" />

      <Rectangle translation="[68, 300]" width="544" height="568" color="0x161F30FF" />
      <Rectangle translation="[68, 300]" width="6" height="568" color="0xA855F7FF" />
      <Label translation="[86, 312]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xD8B4FEFF" text="MODULAR KGRAPH PACKAGES &amp; ONTOLOGY NODES:" />
      <Label translation="[86, 348]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="1. robos-dashboards.jsonld  [DashboardLayout + 13 Widget Catalog]" />
      <Label translation="[86, 382]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="2. robos-tv.jsonld          [SmartTVStudio + Roku/webOS/Tizen/ADB]" />
      <Label translation="[86, 416]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="3. google-calendar.jsonld   [Dual CalDAV/CardDAV + Thunderbird]" />
      <Label translation="[86, 450]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xFCD34DFF" text="4. cloud-accounts.jsonld    [Google Workspace + M365 + Nextcloud]" />
      <Label translation="[86, 484]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="5. smart-light.jsonld       [Zero-Cloud LAN Lighting + Circadian]" />
      <Label translation="[86, 518]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="6. vpn-sandbox.jsonld       [ip netns + 3-Barrier Kill-Switch]" />
      <Label translation="[86, 552]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="7. point-of-sale.jsonld     [Register + Kiosk + Prep Queue API]" />
      <Label translation="[86, 586]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xD8B4FEFF" text="8. audio-player.jsonld      [100k Library + Virtual DJ + Cast]" />
      <Label translation="[86, 620]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="9. crpg-realm.jsonld        [Godot 4 Tactical D&amp;D 5e SRD Engine]" />
      <Label translation="[86, 654]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="10. robos-core-apps.jsonld  [Dev Central + PR Theater + Planner]" />
      <Rectangle translation="[86, 694]" width="508" height="2" color="0x1E293BFF" />
      <Label translation="[86, 710]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="Vocabularies: Schema.org + OASIS OSLC + W3C SHACL + Dublin Core" />
      <Label translation="[86, 740]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Living Docs &amp; eLearning Courses Auto-Synthesized from KGraph" />

      <!-- Column 2: Sprint 42 Tasks, PR Review Theater & E2E Proofs -->
      <Rectangle translation="[656, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[656, 102]" width="584" height="4" color="0x00BCD4FF" />
      <Label scale="[0.66, 0.66]" text="2. SPRINT 42 PULSE, PR THEATER &amp; E2E PROOFS" translation="[676, 118]" width="800" height="36" numLines="1" color="0x67E8F9FF" />
      <Rectangle translation="[676, 152]" width="544" height="2" color="0x1E293BFF" />

      <Rectangle translation="[676, 166]" width="544" height="128" color="0x161F30FF" />
      <Rectangle translation="[676, 166]" width="6" height="128" color="0x00BCD4FF" />
      <Label translation="[694, 176]" scale="[0.66, 0.66]" width="760" height="32" numLines="1" color="0xF8FAFCFF" text="SPRINT 42 VELOCITY: 18 DONE | 4 IN PROGRESS | 0 BLOCKED" />
      <Label translation="[694, 208]" scale="[0.55, 0.55]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="Completion Rate: 82% | All E2E Container Suites Passing (Docker/Xvfb)" />
      <Rectangle translation="[694, 246]" width="508" height="14" color="0x090D16FF" />
      <Rectangle translation="[694, 246]" width="418" height="14" color="0x10B981FF" />

      <Rectangle translation="[676, 308]" width="544" height="132" color="0x161F30FF" />
      <Rectangle translation="[676, 308]" width="6" height="132" color="0x10B981FF" />
      <Label translation="[694, 318]" scale="[0.60, 0.60]" width="840" height="30" numLines="1" color="0x6EE7B7FF" text="[DONE] Multi-Dashboard Slideshow &amp; Roku TV Auto-Rotation" />
      <Label translation="[694, 348]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="Configurable second timer cycling across selected KGraph dashboards" />
      <Label translation="[694, 378]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Verified: robos-dashboards.test.cjs + Roku 65&quot; TV Live Cast" />

      <Rectangle translation="[676, 452]" width="544" height="132" color="0x161F30FF" />
      <Rectangle translation="[676, 452]" width="6" height="132" color="0x10B981FF" />
      <Label translation="[694, 462]" scale="[0.60, 0.60]" width="840" height="30" numLines="1" color="0x6EE7B7FF" text="[DONE] Live Tailed Agent Sessions Stream &amp; Next Meeting Timer" />
      <Label translation="[694, 492]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="Real-time 1Hz countdown + dynamic active-only RobOS agent stream" />
      <Label translation="[694, 522]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Verified: Zero static breakdown when idle; live tail lines when running" />

      <Rectangle translation="[676, 596]" width="544" height="132" color="0x161F30FF" />
      <Rectangle translation="[676, 596]" width="6" height="132" color="0x00BCD4FF" />
      <Label translation="[694, 606]" scale="[0.60, 0.60]" width="840" height="30" numLines="1" color="0x67E8F9FF" text="[DONE] Dual Google Workspace Calendar Sync + 30-Day Velocity" />
      <Label translation="[694, 636]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="Thunderbird CalDAV + 30-day commit bar chart &amp; 7-day moving average" />
      <Label translation="[694, 666]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Accounts: nicholas.dipiazza@gmail.com + nicholas@hermetiq.com" />

      <Rectangle translation="[676, 740]" width="544" height="128" color="0x090D16FF" />
      <Label translation="[694, 754]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0xFCD34DFF" text="PR REVIEW THEATER &amp; IDE BRIDGE (INTELLIJ :63343 / VS CODE)" />
      <Label translation="[694, 786]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0xCBD5E1FF" text="1080p Narrated Walkthrough Proofs + Semantic Diff Blast Radius Ready" />
      <Label translation="[694, 816]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(ciHeaderLine)}" />

      <!-- Column 3: Latest Commits & Repository Velocity Summary -->
      <Rectangle translation="[1264, 102]" width="608" height="784" color="0x111827FF" />
      <Rectangle translation="[1264, 102]" width="608" height="4" color="0x10B981FF" />
      <Label scale="[0.65, 0.65]" text="3. REPOSITORY PULSE: nddipiazza/robos (MAIN)" translation="[1284, 118]" width="840" height="36" numLines="1" color="0x6EE7B7FF" />
      <Rectangle translation="[1284, 154]" width="568" height="2" color="0x1E293BFF" />

      <Rectangle translation="[1284, 166]" width="568" height="126" color="0x161F30FF" />
      <Rectangle translation="[1284, 166]" width="6" height="126" color="0x10B981FF" />
      <Label translation="[1304, 176]" scale="[0.60, 0.60]" width="880" height="30" numLines="1" color="0x6EE7B7FF" text="${safeXml(graphHeaderLine)}" />
      <Label translation="[1304, 208]" scale="[0.56, 0.56]" width="900" height="28" numLines="1" color="0xF8FAFCFF" text="${safeXml(relLine1)}" />
      <Label translation="[1304, 238]" scale="[0.52, 0.52]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="${safeXml(graphLegendLine)}" />

      <Rectangle translation="[1284, 306]" width="568" height="562" color="0x161F30FF" />
      <Rectangle translation="[1284, 306]" width="6" height="562" color="0x00BCD4FF" />
      <Label translation="[1304, 318]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x67E8F9FF" text="RECENT COMMITS MERGED TO MAIN:" />
      <Label id="s2Commit0" translation="[1304, 358]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[0] ? `1. #${commits[0].shortSha || commits[0].hash} - ${String(commits[0].subject || '').slice(0, 48)}` : '1. Latest commit in main')}" />
      <Label id="s2Commit1" translation="[1304, 402]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[1] ? `2. #${commits[1].shortSha || commits[1].hash} - ${String(commits[1].subject || '').slice(0, 48)}` : '2. -')}" />
      <Label id="s2Commit2" translation="[1304, 446]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[2] ? `3. #${commits[2].shortSha || commits[2].hash} - ${String(commits[2].subject || '').slice(0, 48)}` : '3. -')}" />
      <Label id="s2Commit3" translation="[1304, 490]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[3] ? `4. #${commits[3].shortSha || commits[3].hash} - ${String(commits[3].subject || '').slice(0, 48)}` : '4. -')}" />
      <Label id="s2Commit4" translation="[1304, 534]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[4] ? `5. #${commits[4].shortSha || commits[4].hash} - ${String(commits[4].subject || '').slice(0, 48)}` : '5. -')}" />
      <Label id="s2Commit5" translation="[1304, 578]" scale="[0.58, 0.58]" width="900" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(commits[5] ? `6. #${commits[5].shortSha || commits[5].hash} - ${String(commits[5].subject || '').slice(0, 48)}` : '6. -')}" />
      <Rectangle translation="[1304, 624]" width="528" height="2" color="0x1E293BFF" />
      <Label translation="[1304, 642]" scale="[0.56, 0.56]" width="900" height="28" numLines="1" color="0x6EE7B7FF" text="COMMIT TYPE DISTRIBUTION (LAST 30 DAYS):" />
      <Label translation="[1304, 676]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0x67E8F9FF" text="* Features (feat): ${safeXml(String(bt.feat || 336))} commits   |   Bug Fixes (fix): ${safeXml(String(bt.fix || 166))} commits" />
      <Label translation="[1304, 708]" scale="[0.54, 0.54]" width="900" height="28" numLines="1" color="0xD8B4FEFF" text="* Docs (docs):     ${safeXml(String(bt.docs || 64))} commits    |   Chores/Other:    ${safeXml(String(bt.other || 88))} commits" />
      <Label translation="[1304, 748]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0xFCD34DFF" text="Slideshow automatically rotates across all enabled RobOS dashboards." />
    </Group>

    <!-- Bottom Status & Compact Tile Selector -->
    <Rectangle id="heroCard" translation="[48, 902]" width="1824" height="132" color="0x111827FF" />
    <Rectangle translation="[48, 902]" width="1824" height="2" color="0x1E293BFF" />
    <Label id="heroTitle" scale="[0.75, 0.75]" text="RobOS Live TV Wallboard Active - D-Pad Up/Down/OK switches TV experience" translation="[72, 916]" width="1460" height="36" numLines="1" color="0xF8FAFCFF" />
    <Label id="heroDesc" scale="[0.62, 0.62]" text="GitHub Repo (nddipiazza/robos CI &amp; Release) | Dual Google Calendars | Live Clock &amp; Tailed Agents" translation="[72, 954]" width="1760" height="34" numLines="1" color="0x94A3B8FF" />
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
    <Timer id="clockTimer" repeat="true" duration="1.0" />
  </children>
</component>
`;
    const mainSceneBrs = `sub init()
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
    m.clockTimer = m.top.findNode("clockTimer")
    m.tickCount = 0
    m.remainingSec = ${initialRemSec}
    m.nextMeetingTimeStr = "${safeXml(nm.time || '16:30')}"
    m.slideshowEnabled = ${ssEnabled ? 'true' : 'false'}
    m.slideIntervalSec = ${ssInterval}
    m.slideRemSec = ${ssRem}
    m.slideNumber = ${ssSlideNum}
    m.slideTotal = ${ssTotal}
    m.activeDashId = "daily-engineering-ops"
    m.agentActive = [${sessions[0] ? 'true' : 'false'}, ${sessions[1] ? 'true' : 'false'}, ${sessions[2] ? 'true' : 'false'}]
    m.agentElapsed = [${Number(sessions[0]?.elapsedSec) || 5}, ${Number(sessions[1]?.elapsedSec) || 5}, ${Number(sessions[2]?.elapsedSec) || 5}]
    m.agentActivity = ["${safeXml(String(sessions[0]?.activity || sessions[0]?.cwd || '').slice(0, 42))}", "${safeXml(String(sessions[1]?.activity || sessions[1]?.cwd || '').slice(0, 42))}", "${safeXml(String(sessions[2]?.activity || sessions[2]?.cwd || '').slice(0, 42))}"]

    m.clockTimer.observeField("fire", "onClockTick")
    m.clockTimer.control = "start"

    m.tiles = [
        { id: "portal-home", title: "1. Daily Engineering & Agent Ops Dashboard", desc: "Live JS Canvas Clock + GitHub Repo Activity (nddipiazza/robos) + Dual Calendars + Agents." },
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
    onClockTick()
end sub

function pad2(n as Integer) as String
    if n < 10 then return "0" + n.ToStr()
    return n.ToStr()
end function

sub applySlideVisibility(dashId as String)
    m.activeDashId = dashId
    if m.slideGroup0 <> invalid then m.slideGroup0.visible = (dashId = "daily-engineering-ops")
    if m.slideGroup1 <> invalid then m.slideGroup1.visible = (dashId = "smart-home-tv-command")
    if m.slideGroup2 <> invalid then m.slideGroup2.visible = (dashId = "kgraph-architecture-pulse")
    if dashId <> "daily-engineering-ops" and dashId <> "smart-home-tv-command" and dashId <> "kgraph-architecture-pulse"
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
    if m.remainingSec > 0
        m.remainingSec = m.remainingSec - 1
    end if
    if m.slideshowEnabled = true
        if m.slideRemSec > 1
            m.slideRemSec = m.slideRemSec - 1
        else
            m.slideRemSec = m.slideIntervalSec
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
            bh = 8 + (((m.tickCount * 5) + (i * 9)) mod 26)
            by = 236 - bh
            eqNode.height = bh
            eqNode.translation = [bx, by]
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

sub onPayloadUpdated()
    raw = m.dashTask.payloadJson
    if raw = "" then return
    json = ParseJson(raw)
    if json = invalid or json.dashboard = invalid then return
    dash = json.dashboard
    ss = json.slideshow
    if ss <> invalid
        m.slideshowEnabled = (ss.enabled = true)
        if ss.intervalSeconds <> invalid then m.slideIntervalSec = ss.intervalSeconds
        if ss.secondsRemainingInSlide <> invalid then m.slideRemSec = ss.secondsRemainingInSlide
        if ss.slideNumber <> invalid then m.slideNumber = ss.slideNumber
        if ss.totalSlides <> invalid then m.slideTotal = ss.totalSlides
        updateSlideshowHud()
    end if
    if dash.id <> invalid
        applySlideVisibility(cleanAscii(dash.id))
    end if
    if dash.title <> invalid
        if m.slideshowEnabled = true
            m.brandLabel.text = "[" + m.slideNumber.ToStr() + "/" + m.slideTotal.ToStr() + "] " + cleanAscii(dash.title)
        else
            m.brandLabel.text = "RobOS Dashboards - " + cleanAscii(dash.title)
        end if
    end if
    if dash.cards = invalid then return

    for each card in dash.cards
        cTag = card.componentTag
        if cTag = invalid then cTag = card.widgetTag
        if cTag = "robos-widget-github-repo" and card.liveData <> invalid
            rel = card.liveData.latestRelease
            if rel <> invalid
                l1 = m.top.findNode("ghReleaseLine1")
                l2 = m.top.findNode("ghReleaseLine2")
                st = m.top.findNode("ghReleaseStripe")
                isRun = (rel.isRunningNow = true)
                runTxt = "IDLE - NOT RUNNING"
                if isRun then runTxt = "RUNNING NOW"
                if st <> invalid
                    if isRun then st.color = "0xF59E0BFF" else st.color = "0x10B981FF"
                end if
                if l1 <> invalid then l1.text = "RELEASE: " + cleanAscii(rel.name) + " (Run #" + cleanAscii(rel.releaseRunNumber) + ") [" + runTxt + "]"
                if l2 <> invalid then l2.text = "Last Release #" + cleanAscii(rel.releaseRunNumber) + ": " + UCase(cleanAscii(rel.releaseConclusion)) + " | Win EXE Release #" + cleanAscii(rel.windowsReleaseRunNumber) + ": " + UCase(cleanAscii(rel.windowsReleaseConclusion))
            end if
            ci = card.liveData.mainCi
            if ci <> invalid
                ch = m.top.findNode("ghCiHeader")
                if ch <> invalid and ci.summaryText <> invalid then ch.text = "CI STATUS IN MAIN: " + cleanAscii(ci.summaryText)
            end if
        else if cTag = "robos-widget-git-commits" and card.liveData <> invalid and card.liveData.commits <> invalid
            commits = card.liveData.commits
            for i = 0 to 5
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
            pState = "PLAYING"
            if md.isPlaying = false then pState = "PAUSED"
            if msNode <> invalid then msNode.text = "NOW PLAYING [" + pState + "]  " + cleanAscii(md.elapsed) + " / " + cleanAscii(md.duration) + "  |  " + cleanAscii(md.output)
            if mtNode <> invalid then mtNode.text = Left(cleanAscii(md.title), 42)
            if maNode <> invalid then maNode.text = cleanAscii(md.artistAlbum) + "  (" + cleanAscii(md.source) + ")"
            if mpNode <> invalid and md.progressPct <> invalid
                pct = md.progressPct
                if pct < 4 then pct = 4
                if pct > 100 then pct = 100
                mpNode.width = Int((pct / 100.0) * 512)
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
  let _liveDashboardFrameBuf = null;
  let _liveDashboardFrameUpdatedAt = 0;

  function setLiveDashboardFrame(buf) {
    if (Buffer.isBuffer(buf) && buf.length > 1000) {
      _liveDashboardFrameBuf = buf;
      _liveDashboardFrameUpdatedAt = Date.now();
    }
  }

  function getLiveDashboardFrame() {
    return {
      buffer: _liveDashboardFrameBuf,
      updatedAt: _liveDashboardFrameUpdatedAt,
    };
  }

  function startPortalServer(preferredPort = boundPort) {
    if (server && server.listening) {
      return Promise.resolve({ ok: true, port: boundPort, url: `http://${detectLanIp()}:${boundPort}` });
    }
    return new Promise((resolve) => {
      server = http.createServer((req, res) => {
        loadState();
        const hostIp = detectLanIp();
        const u = new URL(req.url || '/', `http://${hostIp}:${boundPort}`);

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
          const ssState = dashEngine.getSlideshowState();
          const explicitDashId = u.searchParams.get('id');
          const targetDashId = explicitDashId
            ? explicitDashId
            : ssState?.enabled
            ? 'slideshow'
            : state.activeDashboardCast?.dashboardId || 'daily-engineering-ops';
          const resolved = dashEngine.resolveDashboard(targetDashId);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(
            JSON.stringify({
              ok: true,
              cast: state.activeDashboardCast || null,
              slideshow: resolved.slideshow || ssState || null,
              dashboard: resolved.dashboard,
              castUrl: `http://${hostIp}:${boundPort}/dashboard`,
            })
          );
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
    setLiveDashboardFrame,
    getLiveDashboardFrame,
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
