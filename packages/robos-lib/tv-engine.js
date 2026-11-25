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
const zlib = require('node:zlib');
const { spawnSync, exec } = require('node:child_process');
const tabloClient = require('./tablo-client');

function resolveConfiguredMediaServerUrl(configDir) {
  try {
    const dir = configDir || process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
    const file = path.join(dir, 'media-servers.json');
    if (!fs.existsSync(file)) return '';
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!cfg || !Array.isArray(cfg.servers)) return '';
    const srv = cfg.servers.find(s => s && s.id === cfg.defaultServerId && s.enabled !== false && s.url)
      || cfg.servers.find(s => s && s.enabled !== false && s.url);
    return srv ? String(srv.url).trim().replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

function buildCinemaPosterPng(width, height) {
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const tb = Buffer.from(type, 'ascii');
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    tb.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([tb, data])), 8 + data.length);
    return out;
  };

  // Pure 24-bit opaque RGB (no alpha channel) white background + navy/blue RobOS [ robot ] emblem
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height, 255);
  const cx = width / 2;
  const cy = height * 0.44;
  const unit = Math.min(width, height);
  const stroke = Math.max(4, Math.round(unit * 0.045));
  const headW = Math.round(unit * 0.28);
  const headH = Math.round(unit * 0.19);
  const headX0 = Math.round(cx - headW / 2);
  const headY0 = Math.round(cy - unit * 0.19);
  const bodyW = Math.round(unit * 0.24);
  const bodyH = Math.round(unit * 0.22);
  const bodyX0 = Math.round(cx - bodyW / 2);
  const bodyY0 = headY0 + headH + Math.max(3, Math.round(unit * 0.025));
  const eyeR = Math.max(3, Math.round(unit * 0.03));
  const eyeY = Math.round(headY0 + headH * 0.52);
  const eyeL = Math.round(cx - headW * 0.23);
  const eyeRgt = Math.round(cx + headW * 0.23);
  const brkHalfW = Math.round(unit * 0.31);
  const brkTop = Math.round(cy - unit * 0.26);
  const brkBot = Math.round(cy + unit * 0.26);
  const brkKnee = Math.round(unit * 0.09);

  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0;
    for (let x = 0; x < width; x++) {
      let r = 255, g = 255, b = 255;

      // Left & right angled code brackets < robot >
      const dxAbs = Math.abs(x - cx);
      if (y >= brkTop && y <= brkBot) {
        let targetX = brkHalfW;
        if (y < brkTop + brkKnee) {
          targetX = brkHalfW - (brkTop + brkKnee - y);
        } else if (y > brkBot - brkKnee) {
          targetX = brkHalfW - (y - (brkBot - brkKnee));
        }
        if (Math.abs(dxAbs - targetX) <= stroke * 0.55) {
          r = 0; g = 18; b = 83;
        }
      }

      // Antenna stem + bulb
      const antTop = headY0 - Math.round(unit * 0.075);
      const antDist = Math.hypot(x - cx, y - antTop);
      if (antDist <= Math.max(3, Math.round(unit * 0.025)) || (Math.abs(x - cx) <= Math.max(2, Math.round(stroke * 0.3)) && y >= antTop && y <= headY0)) {
        r = 0; g = 18; b = 83;
      }

      // Robot head + white eyes
      if (x >= headX0 && x <= headX0 + headW && y >= headY0 && y <= headY0 + headH) {
        r = 0; g = 18; b = 83;
        if (Math.hypot(x - eyeL, y - eyeY) <= eyeR || Math.hypot(x - eyeRgt, y - eyeY) <= eyeR) {
          r = 255; g = 255; b = 255;
        }
      }

      // Robot torso with vertical navy -> light-blue fade
      if (x >= bodyX0 && x <= bodyX0 + bodyW && y >= bodyY0 && y <= bodyY0 + bodyH) {
        const t = (y - bodyY0) / Math.max(1, bodyH);
        r = Math.round(0 + 185 * t);
        g = Math.round(22 + 182 * t);
        b = Math.round(92 + 140 * t);
      }

      const p = rowOff + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // 24-bit opaque RGB (no alpha channel)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderRobosWhiteBluePng({ width, height, isSplash = false, destPath }) {
  const transparentLogoPath = path.resolve(__dirname, '..', '..', 'robos-transparent-background.png');
  const sidebarLogoPath = path.resolve(__dirname, '..', '..', 'site', 'assets', 'images', 'logo-sidebar.png');
  const maxW = Math.round(width * (isSplash ? 0.46 : 0.84));
  const maxH = Math.round(height * (isSplash ? 0.58 : 0.84));

  if (fs.existsSync(transparentLogoPath)) {
    try {
      // Crop transparent margins tightly to the blue [ robot ] RobOS mark (1038x827 at 507,354 on 2048x1536),
      // Lanczos-scale, composite onto a pure #FFFFFF white canvas, and encode as 24-bit opaque RGB (no alpha).
      const fc = `[1:v]crop=1038:827:507:354,scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24[out]`;
      const r = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi', '-i', `color=c=white:s=${width}x${height}:d=1`,
          '-i', transparentLogoPath,
          '-filter_complex', fc,
          '-map', '[out]',
          '-frames:v', '1',
          destPath,
        ],
        { timeout: 6000 }
      );
      if (r.status === 0 && fs.existsSync(destPath) && fs.statSync(destPath).size > 500) {
        return true;
      }
    } catch {}
  }

  if (fs.existsSync(sidebarLogoPath)) {
    try {
      const fc = `[1:v]scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24[out]`;
      const r = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-f', 'lavfi', '-i', `color=c=white:s=${width}x${height}:d=1`,
          '-i', sidebarLogoPath,
          '-filter_complex', fc,
          '-map', '[out]',
          '-frames:v', '1',
          destPath,
        ],
        { timeout: 6000 }
      );
      if (r.status === 0 && fs.existsSync(destPath) && fs.statSync(destPath).size > 500) {
        return true;
      }
    } catch {}
  }

  fs.writeFileSync(destPath, buildCinemaPosterPng(width, height));
  return false;
}

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
  {
    id: 'tablo-dvr',
    title: 'Tablo OTA DVR & Live TV',
    category: 'Live TV & DVR',
    badge: 'LAN',
    description: 'Watch recorded NFL/MLB games, TV series, and 55 live OTA antenna channels from your Tablo 4th Gen DVR.',
    packageId: 'robos-tv',
    shortcutKey: '0',
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
        <div class="wb-sub">Cast to ${esc(cast.tvName || 'Preview')} (${esc(cast.tvIp || hostIp)}) · ${esc(cast.sprintName || 'Sprint 42')}</div>
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
  configDir = '',
  hostIp = '192.168.1.100',
  portalPort = DEFAULT_PORTAL_PORT,
  tvIp = '',
  appName = 'RobOS TV',
  appId = 'com.robos.tv',
  version = '1.0.0',
  webosPassphrase = '',
  channelMode = 'auto',
  mediaServerUrl = '',
  preloadedCinemaItems = null,
  preloadedCinemaRev = '',
  rokuDevPassword = '',
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
      title: '',
      artist: '',
      album: '',
      artistAlbum: '',
      elapsed: '0:00',
      duration: '0:00',
      progressPct: 0,
      isPlaying: false,
      output: 'Desktop (Local Audio)',
      upNext: [],
    };
    const sessions = ((agentsCard && agentsCard.liveData && agentsCard.liveData.sessions) || []).slice(0, 3);
    const meetingData = (meetingCard && meetingCard.liveData) || {
      secondsUntil: 0,
      countdownLabel: 'No upcoming meetings',
      urgencyPct: 0,
    };
    const nm = meetingData.nextMeeting || {};
    const fm = meetingData.followingMeeting || {};
    const initialRemSec = Math.max(0, Number(meetingData.secondsUntil) || 0);
    const nmTitleLine = nm.title ? `${nm.time || '--:--'} - ${nm.title}` : 'No upcoming meetings';
    const nmMetaLine = nm.title
      ? `Calendar: ${nm.accountEmail || 'not connected'}${fm.title ? ` | After: ${fm.time || ''} ${String(fm.title).slice(0, 22)}` : ''}`
      : 'Connect a calendar to see your next meeting';
    const nmBarW = Math.max(24, Math.min(528, Math.round(((Number(meetingData.urgencyPct) || 0) / 100) * 528)));

    const relRunning = Boolean(ghRel.isRunningNow);
    const relStripeColor = relRunning ? '0x38BDF8FF' : '0x10B981FF';
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
        ? '0x38BDF8FF'
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
    <Rectangle id="maDot${i}" translation="[${bx + 2}, ${maY}]" width="8" height="3" color="0x7DD3FCFF" />`;
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
    const popStargazers = Array.isArray(pop.stargazers) ? pop.stargazers : [];
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
      <Rectangle id="cloneUniqBar${i}" translation="[${bx + 5}, ${uy}]" width="14" height="${uh}" color="0x7DD3FCFF" />`;
    }).join('\n');

    const stargazerRowsXml = Array.from({ length: 7 }, (_, i) => {
      const sg = popStargazers[i] || { login: 'github-user', starredAt: '2026' };
      const y = 456 + i * 56;
      return `      <Rectangle translation="[694, ${y}]" width="508" height="46" color="0x090D16FF" />
      <Rectangle translation="[694, ${y}]" width="3" height="46" color="0x38BDF8FF" />
      <Label id="s1StarUser${i}" translation="[712, ${y + 10}]" scale="[0.62, 0.62]" width="520" height="30" numLines="1" color="0xF8FAFCFF" text="${safeXml(`${i + 1}. @${sg.login}`)}" />
      <Label id="s1StarDate${i}" translation="[1010, ${y + 11}]" scale="[0.55, 0.55]" width="320" height="28" numLines="1" color="0x7DD3FCFF" text="${safeXml(`* Starred ${sg.starredAt}`)}" />`;
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
      const stripeCol = isRun ? '0x38BDF8FF' : isOk ? '0x10B981FF' : '0xEF4444FF';
      const statusCol = isRun ? '0x7DD3FCFF' : isOk ? '0x6EE7B7FF' : '0xFCA5A5FF';
      const badgeTxt = isRun ? 'RUNNING NOW' : isOk ? 'PASS - SUCCESS' : 'FAIL - ATTENTION';
      return `      <Rectangle id="s1WfBg${i}" translation="[68, ${y}]" width="544" height="96" color="0x161F30FF" />
      <Rectangle id="s1WfStripe${i}" translation="[68, ${y}]" width="6" height="96" color="${stripeCol}" />
      <Label id="s1WfTitle${i}" translation="[86, ${y + 10}]" scale="[0.64, 0.64]" width="620" height="32" numLines="1" color="0xF8FAFCFF" text="${safeXml(`${i + 1}. ${wf.name || wf.shortName} (#${wf.runNumber})`)}" />
      <Label id="s1WfBadge${i}" translation="[86, ${y + 39}]" scale="[0.56, 0.56]" width="860" height="28" numLines="1" color="${statusCol}" text="${safeXml(`Status: [${badgeTxt}]  |  Branch: main  |  Run #${wf.runNumber}`)}" />
      <Label id="s1WfSub${i}" translation="[86, ${y + 65}]" scale="[0.50, 0.50]" width="940" height="26" numLines="1" color="0x94A3B8FF" text="${safeXml(`Commit: ${String(wf.displayTitle || 'Latest main push').slice(0, 56)}`)}" />`;
    }).join('\n');

    const musicPlaying = Boolean(musicData.isPlaying === true);
    const musicStatusLine = musicPlaying
      ? `NOW PLAYING [PLAYING]  ${musicData.elapsed || '0:00'} / ${musicData.duration || '0:00'}  |  ${musicData.output || 'Local Audio'}`
      : `AUDIO IDLE [NOT PLAYING]  0:00 / ${musicData.duration || '0:00'}  |  ${musicData.output || 'Local Audio'}`;
    const musicTitleLine = musicPlaying
      ? `${musicData.title || 'Unknown track'}`
      : 'No Audio Currently Playing';
    const musicArtistClean = String(musicData.artistAlbum || `${musicData.artist || ''} - ${musicData.album || ''}`).replace(/[^\x20-\x7E]/g, '-');
    const musicArtistLine = musicPlaying
      ? `${musicArtistClean}${musicData.source ? `  (${musicData.source})` : ''}`
      : musicData.id
      ? `Last queued: ${String(musicData.title || 'None').slice(0, 38)} (${musicData.output || 'RobOS Audio Player'})`
      : 'Open Audio Player to start listening';
    const musicPct = musicPlaying ? Math.max(4, Math.min(100, Number(musicData.progressPct) || 1)) : 0;
    const musicBarW = musicPlaying ? Math.max(16, Math.round((musicPct / 100) * 512)) : 0;
    const upNextArr = Array.isArray(musicData.upNext) ? musicData.upNext : [];
    const musicUpNextLine = upNextArr.length
      ? `Up Next: ${upNextArr.map((u) => `${u.title} (${u.artist})`).join(' | ')}`
      : 'Up Next: nothing queued';

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
      const accEmail = ev?.accountEmail || ev?.calendar || 'you@example.com';
      const isSecondCal = ev?.color === '#10b981';
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
      const sAct = s ? s.activity || s.cwd || '' : '';
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

    const resolvedCfgDir = configDir || process.env.ROBOS_CONFIG_DIR || path.join(os.homedir(), '.config', 'robos');
    const effectiveMediaServerUrl = String(mediaServerUrl || resolveConfiguredMediaServerUrl(resolvedCfgDir) || '').replace(/\/+$/, '');
    const isMoviePlayerChannel = channelMode === 'movie-player' || /movie player/i.test(appName);
    const effectiveChannelTitle = isMoviePlayerChannel ? (appName === 'RobOS TV' ? 'RobOS Movie Player' : appName) : appName;
    const effectiveSubtitle = isMoviePlayerChannel
      ? 'Movies, TV Shows & DVR Streaming from RobOS Media Server'
      : 'RobOS 10-Foot Smart TV & Live Dashboards Suite';
    const progressBaseUrl = effectiveMediaServerUrl || portalUrl;

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
    <field id="mediaServerUrl" type="string" />
    <field id="knownRev" type="string" />
    <field id="progressUrl" type="string" />
    <field id="castActionUrl" type="string" />
    <field id="metaRequestUrl" type="string" />
    <field id="playbackMetaJson" type="string" alwaysNotify="true" />
    <field id="payloadJson" type="string" alwaysNotify="true" />
    <field id="localFrameUri" type="string" alwaysNotify="true" />
  </interface>
  <script type="text/brightscript" uri="pkg:/components/DashboardTask.brs" />
</component>
`;
    const dashboardTaskBrs = `sub init()
    m.top.functionName = "pollDashboard"
end sub

sub pollDashboard()
    lastProgUrl = ""
    lastCastUrl = ""
    lastMetaUrl = ""
    lastFrameSeq = -1
    localFileIdx = 0
    curRev = m.top.knownRev
    hadCinemaCast = false
    while true
        cUrl = m.top.castActionUrl
        if cUrl <> "" and cUrl <> lastCastUrl
            lastCastUrl = cUrl
            cHttp = CreateObject("roUrlTransfer")
            cHttp.SetUrl(cUrl)
            cHttp.GetToString()
        end if
        pUrl = m.top.progressUrl
        if pUrl <> "" and pUrl <> lastProgUrl
            lastProgUrl = pUrl
            pHttp = CreateObject("roUrlTransfer")
            pHttp.SetUrl(pUrl)
            pHttp.GetToString()
        end if
        mUrl = m.top.metaRequestUrl
        if mUrl <> "" and mUrl <> lastMetaUrl
            lastMetaUrl = mUrl
            mHttp = CreateObject("roUrlTransfer")
            mHttp.SetUrl(mUrl)
            mRaw = mHttp.GetToString()
            if mRaw <> ""
                m.top.playbackMetaJson = mRaw
            end if
        end if
        raw = ""
        msUrl = m.top.mediaServerUrl
        url = m.top.apiUrl
        isAppCast = false
        hasCinemaCast = false
        if msUrl <> ""
            msPollUrl = msUrl + "/api/roku-cinema"
            if curRev <> ""
                msPollUrl = msPollUrl + "?knownRev=" + curRev
            end if
            msHttp = CreateObject("roUrlTransfer")
            msHttp.SetUrl(msPollUrl)
            msRaw = msHttp.GetToString()
            if msRaw <> ""
                hasCinemaCast = (Instr(1, msRaw, Chr(34) + "cinemaCast" + Chr(34) + ":{") > 0)
                isUnchanged = (Instr(1, msRaw, Chr(34) + "unchanged" + Chr(34) + ":true") > 0)
                if not isUnchanged
                    parsedMs = ParseJson(msRaw)
                    if parsedMs <> invalid and parsedMs.rev <> invalid
                        curRev = parsedMs.rev.ToStr()
                    end if
                    m.top.payloadJson = msRaw
                else if hasCinemaCast or hadCinemaCast
                    m.top.payloadJson = msRaw
                end if
                hadCinemaCast = hasCinemaCast
            end if
        else if url <> ""
            pollUrl = url
            if lastFrameSeq >= 0
                sep = "?"
                if Instr(1, pollUrl, "?") > 0 then sep = "&"
                pollUrl = pollUrl + sep + "afterSeq=" + lastFrameSeq.ToStr()
            end if
            http = CreateObject("roUrlTransfer")
            http.SetUrl(pollUrl)
            raw = http.GetToString()
            if raw <> ""
                isAppCast = (Instr(1, raw, Chr(34) + "appCastActive" + Chr(34) + ":true") > 0)
                if isAppCast
                    parsed = ParseJson(raw)
                    if parsed <> invalid and parsed.appCast <> invalid and parsed.appCast.frameUrl <> invalid
                        fSeq = 0
                        if parsed.frameSeq <> invalid then fSeq = Int(parsed.frameSeq)
                        if fSeq > 0 and fSeq <> lastFrameSeq
                            fUrl = parsed.appCast.frameUrl.ToStr()
                            fSep = "?"
                            if Instr(1, fUrl, "?") > 0 then fSep = "&"
                            localFileIdx = localFileIdx + 1
                            tmpPath = "tmp:/cast_" + localFileIdx.ToStr() + ".jpg"
                            imgHttp = CreateObject("roUrlTransfer")
                            imgHttp.SetUrl(fUrl + fSep + "seq=" + fSeq.ToStr())
                            dlCode = imgHttp.GetToFile(tmpPath)
                            if dlCode = 200
                                lastFrameSeq = fSeq
                                m.top.localFrameUri = tmpPath
                                if localFileIdx > 3
                                    DeleteFile("tmp:/cast_" + (localFileIdx - 3).ToStr() + ".jpg")
                                end if
                            end if
                        end if
                    end if
                else
                    lastFrameSeq = -1
                end if
                m.top.payloadJson = raw
            end if
        end if
        if isAppCast
            sleep(15)
        else if hasCinemaCast or Instr(1, raw, Chr(34) + "cinemaCastActive" + Chr(34) + ":true") > 0
            sleep(500)
        else
            sleep(1000)
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

    let initialCinemaLibActive = isMoviePlayerChannel;
    let initialCinemaLibDefaultTab = 'movies';
    let initialCinemaLibItems = [];
    let initialCinemaRev = preloadedCinemaRev || '';
    const toCleanAsciiObj = (val) => {
      if (typeof val === 'string') {
        return val
          .replace(/[—–·•]/g, '-')
          .replace(/[^\x20-\x7E]+/g, '')
          .trim();
      }
      if (Array.isArray(val)) return val.map(toCleanAsciiObj);
      if (val && typeof val === 'object') {
        const res = {};
        for (const [k, v] of Object.entries(val)) res[k] = toCleanAsciiObj(v);
        return res;
      }
      return val;
    };
    const rewriteCinemaItemHost = (item, targetHost) => {
      if (!item || typeof item !== 'object') return item;
      const fixUrl = (u) => {
        if (!u || typeof u !== 'string') return u;
        return u.replace(/^http:\/\/(localhost|127\.0\.0\.1):(\d+)\//i, `http://${targetHost}:$2/`);
      };
      const cleaned = toCleanAsciiObj(item);
      const out = {
        ...cleaned,
        artUrl: fixUrl(cleaned.artUrl),
        coverUrl: fixUrl(cleaned.coverUrl),
        thumbnailUrl: fixUrl(cleaned.thumbnailUrl),
        streamUrl: fixUrl(cleaned.streamUrl),
        hlsUrl: fixUrl(cleaned.hlsUrl),
      };
      if (Array.isArray(cleaned.episodes)) {
        out.episodes = cleaned.episodes.map((ep) => ({
          ...ep,
          artUrl: fixUrl(ep.artUrl) || out.artUrl,
          streamUrl: fixUrl(ep.streamUrl),
          hlsUrl: fixUrl(ep.hlsUrl),
        }));
      }
      return out;
    };
    try {
      const cfgFile = path.join(resolvedCfgDir, 'tv-studio.json');
      const stDisk = fs.existsSync(cfgFile) ? JSON.parse(fs.readFileSync(cfgFile, 'utf8')) : {};
      const tabloSnap = Array.isArray(stDisk.tabloCinemaItemsSnapshot) ? stDisk.tabloCinemaItemsSnapshot : [];
      if (Array.isArray(preloadedCinemaItems) && preloadedCinemaItems.length > 0) {
        const hasTabloAlready = preloadedCinemaItems.some(it => it && (it.isTablo || it.mediaType === 'tablo'));
        const merged = hasTabloAlready ? preloadedCinemaItems : [...preloadedCinemaItems, ...tabloSnap];
        initialCinemaLibItems = merged.map((it) => rewriteCinemaItemHost(it, hostIp));
      } else if (stDisk) {
        const baseMovies = Array.isArray(stDisk.moviePlayerLibrarySnapshot)
          ? stDisk.moviePlayerLibrarySnapshot.filter((it) => it && !it.isTablo && it.mediaType !== 'tablo')
          : [];
        initialCinemaLibItems = [...baseMovies, ...tabloSnap].map((it) => rewriteCinemaItemHost(it, hostIp));
        if (!isMoviePlayerChannel && stDisk.activeCinemaLibrary && stDisk.activeCinemaLibrary.defaultTab) {
          initialCinemaLibDefaultTab = String(stDisk.activeCinemaLibrary.defaultTab);
        }
        const hasActiveAppCast = Object.values(stDisk.appCasts || {}).some((c) => c && c.active);
        if (
          isMoviePlayerChannel ||
          (!hasActiveAppCast &&
            ((stDisk.activeCinemaLibrary && stDisk.activeCinemaLibrary.active !== false) ||
              (stDisk.activeCinemaCast && stDisk.activeCinemaCast.active !== false)))
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
    <Rectangle id="bg" width="1920" height="1080" color="0x070B14FF" />
    <Rectangle id="headerBar" width="1920" height="84" color="0x090E1AFF" />
    <Rectangle id="headerAccent" translation="[0, 84]" width="1920" height="1" color="0x1E293BFF" />
    <Rectangle id="slideProgressFill" translation="[0, 82]" width="${ssEnabled ? Math.max(40, Math.round(((ssInterval - ssRem) / ssInterval) * 1920)) : 0}" height="3" color="0x38BDF8FF" />
    <Label id="brandLabel" scale="[0.76, 0.76]" text="RobOS Dashboards - Daily Engineering &amp; Agent Ops" translation="[48, 25]" width="980" height="40" numLines="1" color="0xF8FAFCFF" />
    <Label id="headerCountdownLabel" scale="[0.60, 0.60]" text="NEXT MEETING: ${safeXml(nm.time || '16:30')} (${safeXml(meetingData.countdownLabel || 'T - 00:28:00')})" translation="[780, 29]" width="560" height="34" numLines="1" color="0x6EE7B7FF" />
    <Rectangle id="slideshowBadgeBg" translation="[1130, 20]" width="390" height="42" color="0x0F172AFF" />
    <Rectangle id="slideshowBadgeBorder" translation="[1130, 20]" width="3" height="42" color="0x38BDF8FF" />
    <Label id="slideshowBadgeLabel" scale="[0.54, 0.54]" text="${safeXml(ssBadgeText)}" translation="[1144, 29]" width="680" height="32" numLines="1" color="0xBAE6FDFF" />
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
    <Rectangle translation="[1264, 102]" width="608" height="3" color="0x38BDF8FF" />
    <Label id="colAgentsHeader" scale="[0.65, 0.65]" text="3. NEXT MEETING COUNTDOWN &amp; RUNNING AGENTS" translation="[1284, 118]" width="820" height="36" numLines="1" color="0x7DD3FCFF" />
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
      <Label translation="[86, 730]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x7DD3FCFF" text="LATEST RELEASE PIPELINE STATUS:" />
      <Label id="s1RelLine1" translation="[86, 762]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x6EE7B7FF" text="${safeXml(relLine1)}" />
      <Label id="s1RelLine2" translation="[86, 794]" scale="[0.54, 0.54]" width="920" height="28" numLines="1" color="0xF8FAFCFF" text="${safeXml(relLine2)}" />
      <Label translation="[86, 826]" scale="[0.52, 0.52]" width="920" height="28" numLines="1" color="0x94A3B8FF" text="Tag: ${safeXml(ghRel.tag || 'v0.0.8')} | Published: Oct 22, 2026 | Assets: Win EXE, macOS DMG, Linux" />

      <!-- Column 2: GitHub Stars, Forks, Watchers & Stargazers -->
      <Rectangle translation="[656, 102]" width="584" height="784" color="0x111827FF" />
      <Rectangle translation="[656, 102]" width="584" height="3" color="0x38BDF8FF" />
      <Label scale="[0.65, 0.65]" text="2. GITHUB STARS, FORKS &amp; COMMUNITY PULSE" translation="[676, 118]" width="820" height="36" numLines="1" color="0x7DD3FCFF" />
      <Rectangle translation="[676, 152]" width="544" height="2" color="0x1E293BFF" />

      <!-- 2x2 Big Hero Metric Boxes -->
      <Rectangle translation="[676, 166]" width="264" height="114" color="0x161F30FF" />
      <Rectangle translation="[676, 166]" width="264" height="3" color="0x38BDF8FF" />
      <Label id="s1StarsVal" translation="[694, 180]" scale="[1.02, 1.02]" width="230" height="44" numLines="1" color="0xBAE6FDFF" text="${safeXml(`* ${popStars} STARS`)}" />
      <Label translation="[694, 224]" scale="[0.54, 0.54]" width="420" height="28" numLines="1" color="0xF8FAFCFF" text="GitHub Stargazers" />
      <Label translation="[694, 248]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="nddipiazza/robos (+2 this month)" />

      <Rectangle translation="[956, 166]" width="264" height="114" color="0x161F30FF" />
      <Rectangle translation="[956, 166]" width="264" height="3" color="0x00BCD4FF" />
      <Label id="s1ForksVal" translation="[974, 180]" scale="[1.02, 1.02]" width="230" height="44" numLines="1" color="0x67E8F9FF" text="${safeXml(`${popForks} FORK`)}" />
      <Label translation="[974, 224]" scale="[0.54, 0.54]" width="420" height="28" numLines="1" color="0xF8FAFCFF" text="Repository Forks" />
      <Label translation="[974, 248]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Active Community Network" />

      <Rectangle translation="[676, 292]" width="264" height="106" color="0x161F30FF" />
      <Rectangle translation="[676, 292]" width="264" height="3" color="0x10B981FF" />
      <Label id="s1WatchersVal" translation="[694, 304]" scale="[0.90, 0.90]" width="260" height="40" numLines="1" color="0x6EE7B7FF" text="${safeXml(`${popWatchers} WATCHERS`)}" />
      <Label translation="[694, 344]" scale="[0.52, 0.52]" width="440" height="28" numLines="1" color="0xF8FAFCFF" text="Subscribed Repo Watchers" />
      <Label translation="[694, 368]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Following all RobOS releases" />

      <Rectangle translation="[956, 292]" width="264" height="106" color="0x161F30FF" />
      <Rectangle translation="[956, 292]" width="264" height="3" color="0xA855F7FF" />
      <Label id="s1DlHeroVal" translation="[974, 304]" scale="[0.86, 0.86]" width="270" height="40" numLines="1" color="0xD8B4FEFF" text="${safeXml(`${popDlTotal} INSTALLS`)}" />
      <Label translation="[974, 344]" scale="[0.52, 0.52]" width="440" height="28" numLines="1" color="0xF8FAFCFF" text="Release Asset Downloads" />
      <Label translation="[974, 368]" scale="[0.48, 0.48]" width="460" height="24" numLines="1" color="0x94A3B8FF" text="Win EXE + macOS DMG + Linux" />

      <Rectangle translation="[676, 412]" width="544" height="456" color="0x161F30FF" />
      <Rectangle translation="[676, 412]" width="4" height="456" color="0x38BDF8FF" />
      <Label translation="[694, 422]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x7DD3FCFF" text="RECENT GITHUB STARGAZERS (WHO STARRED ROBOS):" />
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
      <Rectangle translation="[1284, 710]" width="568" height="2" color="0x38BDF8FF" />
      <Label translation="[1304, 722]" scale="[0.58, 0.58]" width="880" height="30" numLines="1" color="0x7DD3FCFF" text="TOP DISCOVERY REFERRERS &amp; POPULAR CONTENT PATHS:" />
      <Label translation="[1304, 754]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x6EE7B7FF" text="* #1 Referrer: rowbose.com (5 views / 4 unique visitors)" />
      <Label translation="[1304, 784]" scale="[0.54, 0.54]" width="940" height="28" numLines="1" color="0x67E8F9FF" text="* #2 Referrer: github.com (1u)  |  #3 Referrer: l.facebook.com (1u)" />
      <Label translation="[1304, 814]" scale="[0.52, 0.52]" width="960" height="28" numLines="1" color="0xCBD5E1FF" text="Top Paths: /nddipiazza/robos | /releases/tag/v0.0.8 | /packages/getemgigs" />
    </Group>

    <!-- SLIDE 2 (SLIDE 3 OF 3): RobOS Voice Dictation - Most Recent Chats (robos-voice-dictation) -->
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

    <!-- Bottom Status & Visual Image-Card Launcher Bar (Zero LabelList / Zero Text-Only Menus) -->
    <Rectangle id="heroCard" translation="[48, 898]" width="1824" height="142" color="0x0B1220FF" />
    <Rectangle translation="[48, 898]" width="1824" height="1" color="0x1E293BFF" />
    <Label id="heroTitle" scale="[0.64, 0.64]" text="RobOS TV  |  Movies, TV Shows &amp; Dashboards" translation="[68, 912]" width="1160" height="32" numLines="1" color="0xF8FAFCFF" />
    <Label id="heroDesc" scale="[0.50, 0.50]" text="Choose Movies, TV Shows, DVR, or a live dashboard card on the right" translation="[68, 942]" width="1460" height="28" numLines="1" color="0x94A3B8FF" />
    <Label id="statusFooter" scale="[0.48, 0.48]" text="Connected to ${portalUrl}/dashboard" translation="[68, 970]" width="1460" height="26" numLines="1" color="0x64748BFF" />
    <!-- 6 Visual Image-Tile Launcher Cards on Wallboard Dock (x=848..1856) -->
    <Group id="wallLauncherGroup">
      <Rectangle id="wallCardBorder0" translation="[848, 910]" width="162" height="118" color="0xFFFFFFFF" />
      <Rectangle id="wallCardBg0" translation="[850, 912]" width="158" height="114" color="0x172554FF" />
      <Rectangle translation="[860, 922]" width="44" height="64" color="0x0284C7FF" />
      <Label translation="[860, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xFFFFFFFF" text="FILM" />
      <Poster id="wallCardPoster0" translation="[860, 922]" width="44" height="64" loadWidth="88" loadHeight="128" loadDisplayMode="scaleToZoom" />
      <Label id="wallCardTitle0" translation="[912, 926]" scale="[0.46, 0.46]" width="190" height="44" wrap="true" numLines="2" color="0xFFFFFFFF" text="Movies" />
      <Label id="wallCardSub0" translation="[860, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0xBAE6FDFF" text="Feature Films" />

      <Rectangle id="wallCardBorder1" translation="[1016, 910]" width="162" height="118" color="0x111A2EFF" />
      <Rectangle id="wallCardBg1" translation="[1018, 912]" width="158" height="114" color="0x111A2EFF" />
      <Rectangle translation="[1028, 922]" width="44" height="64" color="0x1E3A5FFF" />
      <Label translation="[1028, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="SHOW" />
      <Poster id="wallCardPoster1" translation="[1028, 922]" width="44" height="64" loadWidth="88" loadHeight="128" loadDisplayMode="scaleToZoom" />
      <Label id="wallCardTitle1" translation="[1080, 926]" scale="[0.46, 0.46]" width="190" height="44" wrap="true" numLines="2" color="0xE2E8F0FF" text="TV Shows" />
      <Label id="wallCardSub1" translation="[1028, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0x94A3B8FF" text="Series &amp; Seasons" />

      <Rectangle id="wallCardBorder2" translation="[1184, 910]" width="162" height="118" color="0x111A2EFF" />
      <Rectangle id="wallCardBg2" translation="[1186, 912]" width="158" height="114" color="0x111A2EFF" />
      <Rectangle translation="[1196, 922]" width="44" height="64" color="0x164E63FF" />
      <Label translation="[1196, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xA5F3FCFF" text="DVR" />
      <Poster id="wallCardPoster2" translation="[1196, 922]" width="44" height="64" loadWidth="88" loadHeight="128" loadDisplayMode="scaleToZoom" />
      <Label id="wallCardTitle2" translation="[1248, 926]" scale="[0.46, 0.46]" width="190" height="44" wrap="true" numLines="2" color="0xE2E8F0FF" text="Tablo DVR" />
      <Label id="wallCardSub2" translation="[1196, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0x94A3B8FF" text="OTA Recordings" />

      <Rectangle id="wallCardBorder3" translation="[1352, 910]" width="162" height="118" color="0x111A2EFF" />
      <Rectangle id="wallCardBg3" translation="[1354, 912]" width="158" height="114" color="0x111A2EFF" />
      <Rectangle translation="[1364, 922]" width="44" height="64" color="0x065F46FF" />
      <Label translation="[1364, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xA7F3D0FF" text="OPS" />
      <Label id="wallCardTitle3" translation="[1416, 926]" scale="[0.45, 0.45]" width="190" height="44" wrap="true" numLines="2" color="0xE2E8F0FF" text="Eng &amp; Agents" />
      <Label id="wallCardSub3" translation="[1364, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0x94A3B8FF" text="Dashboard 1" />

      <Rectangle id="wallCardBorder4" translation="[1520, 910]" width="162" height="118" color="0x111A2EFF" />
      <Rectangle id="wallCardBg4" translation="[1522, 912]" width="158" height="114" color="0x111A2EFF" />
      <Rectangle translation="[1532, 922]" width="44" height="64" color="0x1E3A8AFF" />
      <Label translation="[1532, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xBFDBFEFF" text="CI+" />
      <Label id="wallCardTitle4" translation="[1584, 926]" scale="[0.45, 0.45]" width="190" height="44" wrap="true" numLines="2" color="0xE2E8F0FF" text="CI &amp; Stars" />
      <Label id="wallCardSub4" translation="[1532, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0x94A3B8FF" text="Dashboard 2" />

      <Rectangle id="wallCardBorder5" translation="[1688, 910]" width="162" height="118" color="0x111A2EFF" />
      <Rectangle id="wallCardBg5" translation="[1690, 912]" width="158" height="114" color="0x111A2EFF" />
      <Rectangle translation="[1700, 922]" width="44" height="64" color="0x4C1D95FF" />
      <Label translation="[1700, 944]" scale="[0.56, 0.56]" width="78" height="28" numLines="1" horizAlign="center" color="0xDDD6FEFF" text="MIC" />
      <Label id="wallCardTitle5" translation="[1752, 926]" scale="[0.45, 0.45]" width="190" height="44" wrap="true" numLines="2" color="0xE2E8F0FF" text="Voice Chats" />
      <Label id="wallCardSub5" translation="[1700, 994]" scale="[0.40, 0.40]" width="340" height="22" numLines="1" color="0x94A3B8FF" text="Dashboard 3" />
    </Group>

    <!-- Modern Clean 10-Foot RobOS Media Browser (Midnight Slate + Sky Blue + Single Crisp Focus Ring) -->
    <Group id="cinemaLibraryGroup" visible="${initialCinemaLibActive ? 'true' : 'false'}">
      <!-- Deep Midnight Theater Canvas (#070B14) -->
      <Rectangle width="1920" height="1080" color="0x070B14FF" />

      <!-- Minimal Floating Top Navigation Bar (y=0..76, zero thick lines) -->
      <Rectangle width="1920" height="76" color="0x090E1AFF" />
      <Rectangle id="cinemaHeaderAccent" translation="[0, 75]" width="1920" height="1" color="0x162032FF" />

      <!-- Official RobOS Brand Mark + Wordmark (x=56, y=14) -->
      <Poster translation="[56, 15]" width="62" height="46" uri="pkg:/images/channel-poster_sd.png" loadDisplayMode="scaleToFit" />
      <Label translation="[130, 22]" scale="[0.64, 0.64]" width="200" height="32" numLines="1" color="0xF8FAFCFF" text="RobOS" />

      <!-- Clean Pill Tab 0: Movies (x=256, y=15, w=204, h=46) -->
      <Rectangle id="cinemaTabMoviesBorder" translation="[256, 15]" width="204" height="46" color="0x172554FF" />
      <Rectangle id="cinemaTabMoviesBg" translation="[258, 17]" width="200" height="42" color="0x172554FF" />
      <Label id="cinemaTabMoviesLabel" translation="[262, 26]" scale="[0.52, 0.52]" width="376" height="28" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Movies" />

      <!-- Clean Pill Tab 1: TV Shows (x=474, y=15, w=224, h=46) -->
      <Rectangle id="cinemaTabShowsBorder" translation="[474, 15]" width="224" height="46" color="0x090E1AFF" />
      <Rectangle id="cinemaTabShowsBg" translation="[476, 17]" width="220" height="42" color="0x090E1AFF" />
      <Label id="cinemaTabShowsLabel" translation="[480, 26]" scale="[0.52, 0.52]" width="416" height="28" numLines="1" horizAlign="center" color="0x94A3B8FF" text="TV Shows" />

      <!-- Clean Pill Tab 2: Live & DVR (x=712, y=15, w=224, h=46) -->
      <Group id="cinemaTabTabloGroup" visible="true">
        <Rectangle id="cinemaTabTabloBorder" translation="[712, 15]" width="224" height="46" color="0x090E1AFF" />
        <Rectangle id="cinemaTabTabloBg" translation="[714, 17]" width="220" height="42" color="0x090E1AFF" />
        <Label id="cinemaTabTabloLabel" translation="[718, 26]" scale="[0.52, 0.52]" width="416" height="28" numLines="1" horizAlign="center" color="0x94A3B8FF" text="DVR" />
      </Group>

      <!-- Clean Pill Tab 2 Alternate when inside a Series: <- All Shows -->
      <Group id="cinemaTabBackGroup" visible="false">
        <Rectangle id="cinemaTabBackBorder" translation="[712, 15]" width="244" height="46" color="0x0F172AFF" />
        <Rectangle id="cinemaTabBackBg" translation="[714, 17]" width="240" height="42" color="0x0F172AFF" />
        <Label id="cinemaTabBackLabel" translation="[718, 26]" scale="[0.50, 0.50]" width="472" height="28" numLines="1" horizAlign="center" color="0x7DD3FCFF" text="&lt; All TV Shows" />
      </Group>

      <!-- Quiet Right-Aligned Library Summary -->
      <Label id="cinemaActiveCatBadge" translation="[1240, 26]" scale="[0.48, 0.48]" width="1290" height="26" numLines="1" horizAlign="right" color="0x64748BFF" text="Movies" />
      <Label id="cinemaLibSubHeader" translation="[1240, 26]" scale="[0.44, 0.44]" width="10" height="10" visible="false" text="" />

      <!-- Airy, Frameless Spotlight Hero (y=84..350) -->
      <Rectangle id="cinemaHeroBg" translation="[56, 86]" width="1808" height="258" color="0x0B1220FF" />
      <Rectangle translation="[56, 86]" width="1808" height="1" color="0x162032FF" />

      <!-- Clean 2:3 Spotlight Poster (x=76, y=102, w=152, h=226) -->
      <Rectangle id="cinemaHeroPosterFallbackBg" translation="[76, 102]" width="152" height="226" color="0x131D31FF" />
      <Label id="cinemaHeroPosterMonogram" translation="[76, 192]" scale="[1.10, 1.10]" width="138" height="48" numLines="1" horizAlign="center" color="0x7DD3FCFF" text="R" />
      <Poster id="cinemaLibPoster" translation="[76, 102]" width="152" height="226" loadWidth="304" loadHeight="452" loadDisplayMode="scaleToZoom" />
      <Rectangle id="cinemaHeroProgTrack" translation="[76, 322]" width="152" height="6" color="0x0F172AFF" visible="false" />
      <Rectangle id="cinemaHeroProgFill" translation="[76, 322]" width="0" height="6" color="0x38BDF8FF" visible="false" />

      <!-- Clean Cinematic Spotlight Typography (x=254) -->
      <Label id="cinemaHeroEyebrow" translation="[254, 104]" scale="[0.46, 0.46]" width="2400" height="24" numLines="1" color="0x38BDF8FF" text="FEATURE FILM" />
      <Label id="cinemaLibDetailTitle" translation="[254, 132]" scale="[0.90, 0.90]" width="1240" height="46" numLines="1" color="0xFFFFFFFF" text="Select a Title" />
      <Label id="cinemaLibDetailMeta" translation="[254, 184]" scale="[0.50, 0.50]" width="2200" height="26" numLines="1" color="0xCBD5E1FF" text="" />
      <Label id="cinemaHeroSynopsis" translation="[254, 218]" scale="[0.49, 0.49]" width="2260" height="68" wrap="true" numLines="2" color="0x94A3B8FF" text="" />
      <Label id="cinemaLibDetailSub" translation="[254, 296]" scale="[0.46, 0.46]" width="2400" height="24" numLines="1" color="0x7DD3FCFF" text="" />

      <!-- Optional 16:9 Tablo Recording Broadcast Frame Preview (x=1404, y=100, w=444, h=230) -->
      <Group id="cinemaHeroThumbGroup" visible="false">
        <Rectangle translation="[1404, 100]" width="444" height="230" color="0x0F172AFF" />
        <Poster id="cinemaHeroThumbPoster" translation="[1406, 102]" width="440" height="226" loadWidth="640" loadHeight="360" loadDisplayMode="scaleToZoom" />
        <Rectangle translation="[1406, 298]" width="440" height="30" color="0x070B14D8" />
        <Label id="cinemaHeroThumbCaption" translation="[1418, 304]" scale="[0.42, 0.42]" width="1000" height="22" numLines="1" color="0xBAE6FDFF" text="" />
      </Group>

      <!-- Sleek Horizontal Filter / Season Pill Strip (y=360..408, 6 clean borderless pills) -->
      <Group id="cinemaCatCardsRow">
        <Rectangle id="cinemaCatCardBorder0" translation="[56, 360]" width="288" height="46" color="0x172554FF" />
        <Rectangle id="cinemaCatCardBg0" translation="[58, 362]" width="284" height="42" color="0x172554FF" />
        <Label id="cinemaCatCardTitle0" translation="[66, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x7DD3FCFF" text="All Movies" />

        <Rectangle id="cinemaCatCardBorder1" translation="[360, 360]" width="288" height="46" color="0x0D1526FF" />
        <Rectangle id="cinemaCatCardBg1" translation="[362, 362]" width="284" height="42" color="0x0D1526FF" />
        <Label id="cinemaCatCardTitle1" translation="[370, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Continue Watching" />

        <Rectangle id="cinemaCatCardBorder2" translation="[664, 360]" width="288" height="46" color="0x0D1526FF" />
        <Rectangle id="cinemaCatCardBg2" translation="[666, 362]" width="284" height="42" color="0x0D1526FF" />
        <Label id="cinemaCatCardTitle2" translation="[674, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Franchises" />

        <Rectangle id="cinemaCatCardBorder3" translation="[968, 360]" width="288" height="46" color="0x0D1526FF" />
        <Rectangle id="cinemaCatCardBg3" translation="[970, 362]" width="284" height="42" color="0x0D1526FF" />
        <Label id="cinemaCatCardTitle3" translation="[978, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Sci-Fi &amp; Fantasy" />

        <Rectangle id="cinemaCatCardBorder4" translation="[1272, 360]" width="288" height="46" color="0x0D1526FF" />
        <Rectangle id="cinemaCatCardBg4" translation="[1274, 362]" width="284" height="42" color="0x0D1526FF" />
        <Label id="cinemaCatCardTitle4" translation="[1282, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Action" />

        <Rectangle id="cinemaCatCardBorder5" translation="[1576, 360]" width="288" height="46" color="0x0D1526FF" />
        <Rectangle id="cinemaCatCardBg5" translation="[1578, 362]" width="284" height="42" color="0x0D1526FF" />
        <Label id="cinemaCatCardTitle5" translation="[1586, 372]" scale="[0.47, 0.47]" width="570" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Comedy" />
      </Group>

      <!-- Quiet Section Header Above Poster Row (y=422..452) -->
      <Label id="cinemaShelfTitleLabel" translation="[58, 422]" scale="[0.52, 0.52]" width="1600" height="28" numLines="1" color="0xE2E8F0FF" text="All Movies" />
      <Label id="cinemaShelfPosLabel" translation="[1260, 424]" scale="[0.46, 0.46]" width="1300" height="24" numLines="1" horizAlign="right" color="0x64748BFF" text="1 of 120" />

      <!-- Spacious, Clean 6-Column Poster Row (x=56 + slot*304, y=456, w=288, h=512; poster 276x406) -->
      <Group id="cinemaPosterShelf">
        <Rectangle id="cinemaCardBorder0" translation="[56, 456]" width="288" height="512" color="0xFFFFFFFF" />
        <Rectangle id="cinemaCardBg0" translation="[59, 459]" width="282" height="506" color="0x131E33FF" />
        <Rectangle id="cinemaCardArtBg0" translation="[62, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono0" translation="[62, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M1" />
        <Poster id="cinemaCardPoster0" translation="[62, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg0" translation="[214, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge0" translation="[218, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack0" translation="[62, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill0" translation="[62, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle0" translation="[68, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xFFFFFFFF" text="" />
        <Label id="cinemaCardGenre0" translation="[68, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x94A3B8FF" text="" />
        <Label id="cinemaCardState0" translation="[68, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x7DD3FCFF" text="" />

        <Rectangle id="cinemaCardBorder1" translation="[360, 456]" width="288" height="512" color="0x0D1422FF" />
        <Rectangle id="cinemaCardBg1" translation="[363, 459]" width="282" height="506" color="0x0D1422FF" />
        <Rectangle id="cinemaCardArtBg1" translation="[366, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono1" translation="[366, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M2" />
        <Poster id="cinemaCardPoster1" translation="[366, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg1" translation="[518, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge1" translation="[522, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack1" translation="[366, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill1" translation="[366, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle1" translation="[372, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xE2E8F0FF" text="" />
        <Label id="cinemaCardGenre1" translation="[372, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
        <Label id="cinemaCardState1" translation="[372, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />

        <Rectangle id="cinemaCardBorder2" translation="[664, 456]" width="288" height="512" color="0x0D1422FF" />
        <Rectangle id="cinemaCardBg2" translation="[667, 459]" width="282" height="506" color="0x0D1422FF" />
        <Rectangle id="cinemaCardArtBg2" translation="[670, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono2" translation="[670, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M3" />
        <Poster id="cinemaCardPoster2" translation="[670, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg2" translation="[822, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge2" translation="[826, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack2" translation="[670, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill2" translation="[670, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle2" translation="[676, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xE2E8F0FF" text="" />
        <Label id="cinemaCardGenre2" translation="[676, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
        <Label id="cinemaCardState2" translation="[676, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />

        <Rectangle id="cinemaCardBorder3" translation="[968, 456]" width="288" height="512" color="0x0D1422FF" />
        <Rectangle id="cinemaCardBg3" translation="[971, 459]" width="282" height="506" color="0x0D1422FF" />
        <Rectangle id="cinemaCardArtBg3" translation="[974, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono3" translation="[974, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M4" />
        <Poster id="cinemaCardPoster3" translation="[974, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg3" translation="[1126, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge3" translation="[1130, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack3" translation="[974, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill3" translation="[974, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle3" translation="[980, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xE2E8F0FF" text="" />
        <Label id="cinemaCardGenre3" translation="[980, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
        <Label id="cinemaCardState3" translation="[980, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />

        <Rectangle id="cinemaCardBorder4" translation="[1272, 456]" width="288" height="512" color="0x0D1422FF" />
        <Rectangle id="cinemaCardBg4" translation="[1275, 459]" width="282" height="506" color="0x0D1422FF" />
        <Rectangle id="cinemaCardArtBg4" translation="[1278, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono4" translation="[1278, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M5" />
        <Poster id="cinemaCardPoster4" translation="[1278, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg4" translation="[1430, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge4" translation="[1434, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack4" translation="[1278, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill4" translation="[1278, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle4" translation="[1284, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xE2E8F0FF" text="" />
        <Label id="cinemaCardGenre4" translation="[1284, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
        <Label id="cinemaCardState4" translation="[1284, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />

        <Rectangle id="cinemaCardBorder5" translation="[1576, 456]" width="288" height="512" color="0x0D1422FF" />
        <Rectangle id="cinemaCardBg5" translation="[1579, 459]" width="282" height="506" color="0x0D1422FF" />
        <Rectangle id="cinemaCardArtBg5" translation="[1582, 462]" width="276" height="406" color="0x0F172AFF" />
        <Label id="cinemaCardMono5" translation="[1582, 640]" scale="[1.25, 1.25]" width="220" height="54" numLines="1" horizAlign="center" color="0x475569FF" text="M6" />
        <Poster id="cinemaCardPoster5" translation="[1582, 462]" width="276" height="406" loadWidth="360" loadHeight="530" loadDisplayMode="scaleToZoom" />
        <Rectangle id="cinemaCardPillBg5" translation="[1734, 472]" width="114" height="26" color="0x070B14D8" />
        <Label id="cinemaCardBadge5" translation="[1738, 477]" scale="[0.41, 0.41]" width="260" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="2024" />
        <Rectangle id="cinemaCardProgTrack5" translation="[1582, 862]" width="276" height="6" color="0x090D16FF" visible="false" />
        <Rectangle id="cinemaCardProgFill5" translation="[1582, 862]" width="0" height="6" color="0x38BDF8FF" visible="false" />
        <Label id="cinemaCardTitle5" translation="[1588, 880]" scale="[0.49, 0.49]" width="540" height="28" numLines="1" color="0xE2E8F0FF" text="" />
        <Label id="cinemaCardGenre5" translation="[1588, 908]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
        <Label id="cinemaCardState5" translation="[1588, 934]" scale="[0.42, 0.42]" width="620" height="22" numLines="1" color="0x64748BFF" text="" />
      </Group>

      <!-- Subtle Minimal Footer Hint (y=994, no border, no box) -->
      <Label id="cinemaLibFooter" translation="[58, 998]" scale="[0.44, 0.44]" width="3900" height="24" numLines="1" color="0x475569FF" text="OK Select   |   Play Quick Start   |   FF/Rew Jump 3 Rows   |   * Switch Tab" />
      <Label id="cinemaLibCountLabel" translation="[58, 998]" scale="[0.44, 0.44]" width="10" height="10" visible="false" text="" />
    </Group>
    <!-- Double-Buffered 1920x1080 Live Chromium JS Canvas Frame Layer -->
    <Poster id="livePosterA" width="1920" height="1080" opacity="0.0" />
    <Poster id="livePosterB" width="1920" height="1080" opacity="0.0" />
    <!-- Full-screen 1920x1080 Cinema Video Layer -->
    <Video id="cinemaVideo" translation="[0, 0]" width="1920" height="1080" visible="false" mute="false" loop="false" enableUI="false" />

    <!-- Clean Cinema Subtitle Cue Pill (Midnight Glass, Zero Yellow Stripes) -->
    <Group id="subtitleOverlayGroup" visible="false" translation="[160, 916]">
      <Rectangle id="subtitleCueBg" translation="[180, 0]" width="1240" height="86" color="0x050810DC" />
      <Label id="subtitleCueLabel" translation="[200, 10]" scale="[0.80, 0.80]" width="1500" height="84" wrap="true" numLines="2" horizAlign="center" vertAlign="center" color="0xFFFFFFFF" text="" />
    </Group>

    <!-- Modern Clean In-Playback OSD Menu (Midnight Glass + Sky Blue + Single White Focus Ring) -->
    <Group id="playerOsdGroup" visible="false">
      <!-- Top Translucent Glass Header (y=0..96) -->
      <Group id="osdTopBarGroup">
        <Rectangle width="1920" height="96" color="0x070B14E6" />
        <Rectangle translation="[0, 95]" width="1920" height="1" color="0x1E293BFF" />
        <Rectangle id="osdTypePillBg" translation="[56, 18]" width="144" height="26" color="0x0284C7FF" />
        <Label id="osdTypePillTxt" translation="[62, 22]" scale="[0.42, 0.42]" width="314" height="20" numLines="1" horizAlign="center" color="0xFFFFFFFF" text="PLAYING" />
        <Label id="osdTopTitle" translation="[216, 14]" scale="[0.72, 0.72]" width="1360" height="36" numLines="1" color="0xFFFFFFFF" text="RobOS" />
        <Label id="osdTopSubMeta" translation="[56, 56]" scale="[0.46, 0.46]" width="2350" height="24" numLines="1" color="0x94A3B8FF" text="" />

        <Rectangle id="osdStateBadgeBg" translation="[1286, 16]" width="136" height="28" color="0x059669FF" />
        <Label id="osdStateBadgeTxt" translation="[1290, 21]" scale="[0.43, 0.43]" width="298" height="20" numLines="1" horizAlign="center" color="0xFFFFFFFF" text="PLAYING" />

        <Rectangle id="osdCcBadgeBg" translation="[1434, 16]" width="208" height="28" color="0x1E293BFF" />
        <Label id="osdCcBadgeTxt" translation="[1440, 21]" scale="[0.42, 0.42]" width="466" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="CC: OFF" />

        <Rectangle id="osdAudioBadgeBg" translation="[1654, 16]" width="210" height="28" color="0x1E293BFF" />
        <Label id="osdAudioBadgeTxt" translation="[1660, 21]" scale="[0.42, 0.42]" width="470" height="20" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="AUDIO" />

        <Label id="osdTopClockTxt" translation="[1286, 56]" scale="[0.50, 0.50]" width="1156" height="26" numLines="1" horizAlign="right" color="0xE2E8F0FF" text="0:00 / 0:00" />
      </Group>

      <!-- Clean Sky-Blue Timeline Progress Bar -->
      <Group id="osdScrubberGroup" translation="[0, 504]">
        <Rectangle id="osdScrubberBg" translation="[56, 0]" width="1808" height="62" color="0x090F1CEB" />
        <Rectangle id="osdScrubberFocusBorder" translation="[56, 0]" width="1808" height="2" color="0x1E293BFF" />
        <Label id="osdTimeElapsed" translation="[76, 10]" scale="[0.50, 0.50]" width="260" height="24" numLines="1" color="0x7DD3FCFF" text="0:00" />
        <Label id="osdScrubHint" translation="[220, 12]" scale="[0.44, 0.44]" width="2650" height="22" numLines="1" color="0x94A3B8FF" text="" />
        <Label id="osdTimeTotal" translation="[1600, 10]" scale="[0.50, 0.50]" width="480" height="24" numLines="1" horizAlign="right" color="0xCBD5E1FF" text="0:00" />
        <Rectangle id="osdTrackBg" translation="[76, 40]" width="1768" height="8" color="0x1E293BFF" />
        <Rectangle id="osdTrackFill" translation="[76, 40]" width="10" height="8" color="0x38BDF8FF" />
        <Rectangle id="osdTrackKnob" translation="[82, 35]" width="8" height="18" color="0xFFFFFFFF" />
      </Group>

      <!-- Clean Modern 7-Tab Player Drawer (y=572..1056) -->
      <Group id="osdFullDrawerGroup" visible="false">
        <Rectangle translation="[56, 572]" width="1808" height="480" color="0x080D18F4" />
        <Rectangle translation="[56, 572]" width="1808" height="1" color="0x1E293BFF" />

        <!-- 7 Clean Pill Tabs (x=74 + idx*254, y=586, w=244, h=46) -->
        <Rectangle id="osdTabBorder0" translation="[74, 586]" width="244" height="46" color="0xFFFFFFFF" />
        <Rectangle id="osdTabBg0" translation="[76, 588]" width="240" height="42" color="0x172554FF" />
        <Label id="osdTabLbl0" translation="[80, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0xFFFFFFFF" text="Controls" />

        <Rectangle id="osdTabBorder1" translation="[328, 586]" width="244" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg1" translation="[330, 588]" width="240" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl1" translation="[334, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Subtitles" />

        <Rectangle id="osdTabBorder2" translation="[582, 586]" width="244" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg2" translation="[584, 588]" width="240" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl2" translation="[588, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Season" />

        <Rectangle id="osdTabBorder3" translation="[836, 586]" width="244" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg3" translation="[838, 588]" width="240" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl3" translation="[842, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Show" />

        <Rectangle id="osdTabBorder4" translation="[1090, 586]" width="244" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg4" translation="[1092, 588]" width="240" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl4" translation="[1096, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Details" />

        <Rectangle id="osdTabBorder5" translation="[1344, 586]" width="244" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg5" translation="[1346, 588]" width="240" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl5" translation="[1350, 598]" scale="[0.48, 0.48]" width="480" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Audio" />

        <Rectangle id="osdTabBorder6" translation="[1598, 586]" width="248" height="46" color="0x0E1628FF" />
        <Rectangle id="osdTabBg6" translation="[1600, 588]" width="244" height="42" color="0x0E1628FF" />
        <Label id="osdTabLbl6" translation="[1604, 598]" scale="[0.48, 0.48]" width="488" height="26" numLines="1" horizAlign="center" color="0x94A3B8FF" text="Metadata" />

        <Rectangle translation="[74, 642]" width="1772" height="1" color="0x162032FF" />

        <!-- Clean Action Button Row (y=656..724) -->
        <Group id="osdActionBtnsGroup" visible="true">
          <Rectangle id="osdBtnBorder0" translation="[74, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg0" translation="[76, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop0" translation="[80, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Pause" />
          <Label id="osdBtnSub0" translation="[80, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Playback" />

          <Rectangle id="osdBtnBorder1" translation="[328, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg1" translation="[330, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop1" translation="[334, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="-15s" />
          <Label id="osdBtnSub1" translation="[334, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Rewind" />

          <Rectangle id="osdBtnBorder2" translation="[582, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg2" translation="[584, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop2" translation="[588, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="+30s" />
          <Label id="osdBtnSub2" translation="[588, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Forward" />

          <Rectangle id="osdBtnBorder3" translation="[836, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg3" translation="[838, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop3" translation="[842, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Previous" />
          <Label id="osdBtnSub3" translation="[842, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Episode" />

          <Rectangle id="osdBtnBorder4" translation="[1090, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg4" translation="[1092, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop4" translation="[1096, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Next" />
          <Label id="osdBtnSub4" translation="[1096, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Episode" />

          <Rectangle id="osdBtnBorder5" translation="[1344, 656]" width="244" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg5" translation="[1346, 658]" width="240" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop5" translation="[1350, 667]" scale="[0.46, 0.46]" width="504" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Restart" />
          <Label id="osdBtnSub5" translation="[1350, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="From 0:00" />

          <Rectangle id="osdBtnBorder6" translation="[1598, 656]" width="248" height="68" color="0x111A2EFF" />
          <Rectangle id="osdBtnBg6" translation="[1600, 658]" width="244" height="64" color="0x111A2EFF" />
          <Label id="osdBtnTop6" translation="[1604, 667]" scale="[0.46, 0.46]" width="512" height="24" numLines="1" horizAlign="center" color="0xF8FAFCFF" text="Watched" />
          <Label id="osdBtnSub6" translation="[1604, 694]" scale="[0.40, 0.40]" width="580" height="20" numLines="1" horizAlign="center" color="0x64748BFF" text="Status" />
        </Group>

        <!-- Clean Frameless Summary Card (y=738..1008) -->
        <Group id="osdRichSummaryGroup" visible="true">
          <Rectangle translation="[74, 738]" width="1772" height="268" color="0x0D1424FF" />
          <Rectangle translation="[94, 756]" width="154" height="230" color="0x131D31FF" />
          <Label id="osdSummaryMono" translation="[94, 846]" scale="[1.05, 1.05]" width="144" height="44" numLines="1" horizAlign="center" color="0x64748BFF" text="R" />
          <Poster id="osdSummaryPoster" translation="[94, 756]" width="154" height="230" loadWidth="308" loadHeight="460" loadDisplayMode="scaleToZoom" />

          <Label id="osdSummaryEyebrow" translation="[272, 754]" scale="[0.46, 0.46]" width="3100" height="24" numLines="1" color="0x38BDF8FF" text="" />
          <Label id="osdSummaryTitle" translation="[272, 782]" scale="[0.68, 0.68]" width="2200" height="36" numLines="1" color="0xFFFFFFFF" text="" />
          <Label id="osdSummaryBadges" translation="[272, 822]" scale="[0.47, 0.47]" width="3150" height="24" numLines="1" color="0xCBD5E1FF" text="" />
          <Label id="osdSummaryBody" translation="[272, 854]" scale="[0.50, 0.50]" width="3050" height="96" wrap="true" numLines="3" color="0x94A3B8FF" text="" />
          <Label id="osdSummarySubLine" translation="[272, 962]" scale="[0.45, 0.45]" width="3300" height="24" numLines="1" color="0x7DD3FCFF" text="" />
        </Group>

        <!-- TAB 2 DEDICATED PANE: SEASON & EPISODE CARDS -->
        <Group id="osdSeasonPaneGroup" visible="false">
          <Rectangle id="osdSeasonBtnBorder0" translation="[74, 654]" width="236" height="42" color="0x111A2EFF" />
          <Rectangle id="osdSeasonBtnBg0" translation="[76, 656]" width="232" height="38" color="0x111A2EFF" />
          <Label id="osdSeasonBtnLbl0" translation="[80, 664]" scale="[0.45, 0.45]" width="496" height="22" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="&lt; Prev Season" />

          <Rectangle id="osdSeasonBtnBorder1" translation="[322, 654]" width="236" height="42" color="0x111A2EFF" />
          <Rectangle id="osdSeasonBtnBg1" translation="[324, 656]" width="232" height="38" color="0x111A2EFF" />
          <Label id="osdSeasonBtnLbl1" translation="[328, 664]" scale="[0.45, 0.45]" width="496" height="22" numLines="1" horizAlign="center" color="0xE2E8F0FF" text="Next Season &gt;" />

          <Rectangle id="osdSeasonBtnBorder2" translation="[570, 654]" width="316" height="42" color="0x111A2EFF" />
          <Rectangle id="osdSeasonBtnBg2" translation="[572, 656]" width="312" height="38" color="0x111A2EFF" />
          <Label id="osdSeasonBtnLbl2" translation="[576, 664]" scale="[0.45, 0.45]" width="676" height="22" numLines="1" horizAlign="center" color="0x7DD3FCFF" text="Open in Library" />

          <Label id="osdSeasonHeaderInfo" translation="[910, 662]" scale="[0.48, 0.48]" width="1950" height="26" numLines="1" horizAlign="right" color="0x94A3B8FF" text="" />

          <!-- 5 Borderless Episode Cards (x=74 + slot*356, y=708, w=344, h=298) -->
          <Rectangle id="osdEpBorder0" translation="[74, 708]" width="344" height="298" color="0x111A2EFF" />
          <Rectangle id="osdEpBg0" translation="[77, 711]" width="338" height="292" color="0x111A2EFF" />
          <Poster id="osdEpPoster0" translation="[83, 717]" width="326" height="176" loadWidth="326" loadHeight="176" loadDisplayMode="scaleToZoom" />
          <Rectangle translation="[91, 725]" width="106" height="24" color="0x070B14D8" />
          <Label id="osdEpCode0" translation="[95, 729]" scale="[0.42, 0.42]" width="232" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="S01E01" />
          <Rectangle id="osdEpProgBg0" translation="[83, 887]" width="326" height="6" color="0x090D16FF" visible="false" />
          <Rectangle id="osdEpProgFill0" translation="[83, 887]" width="0" height="6" color="0x38BDF8FF" visible="false" />
          <Label id="osdEpTitle0" translation="[85, 904]" scale="[0.47, 0.47]" width="680" height="46" wrap="true" numLines="2" color="0xFFFFFFFF" text="" />
          <Label id="osdEpMeta0" translation="[85, 970]" scale="[0.41, 0.41]" width="760" height="22" numLines="1" color="0x64748BFF" text="" />

          <Rectangle id="osdEpBorder1" translation="[430, 708]" width="344" height="298" color="0x111A2EFF" />
          <Rectangle id="osdEpBg1" translation="[433, 711]" width="338" height="292" color="0x111A2EFF" />
          <Poster id="osdEpPoster1" translation="[439, 717]" width="326" height="176" loadWidth="326" loadHeight="176" loadDisplayMode="scaleToZoom" />
          <Rectangle translation="[447, 725]" width="106" height="24" color="0x070B14D8" />
          <Label id="osdEpCode1" translation="[451, 729]" scale="[0.42, 0.42]" width="232" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="S01E02" />
          <Rectangle id="osdEpProgBg1" translation="[439, 887]" width="326" height="6" color="0x090D16FF" visible="false" />
          <Rectangle id="osdEpProgFill1" translation="[439, 887]" width="0" height="6" color="0x38BDF8FF" visible="false" />
          <Label id="osdEpTitle1" translation="[441, 904]" scale="[0.47, 0.47]" width="680" height="46" wrap="true" numLines="2" color="0xFFFFFFFF" text="" />
          <Label id="osdEpMeta1" translation="[441, 970]" scale="[0.41, 0.41]" width="760" height="22" numLines="1" color="0x64748BFF" text="" />

          <Rectangle id="osdEpBorder2" translation="[786, 708]" width="344" height="298" color="0x111A2EFF" />
          <Rectangle id="osdEpBg2" translation="[789, 711]" width="338" height="292" color="0x111A2EFF" />
          <Poster id="osdEpPoster2" translation="[795, 717]" width="326" height="176" loadWidth="326" loadHeight="176" loadDisplayMode="scaleToZoom" />
          <Rectangle translation="[803, 725]" width="106" height="24" color="0x070B14D8" />
          <Label id="osdEpCode2" translation="[807, 729]" scale="[0.42, 0.42]" width="232" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="S01E03" />
          <Rectangle id="osdEpProgBg2" translation="[795, 887]" width="326" height="6" color="0x090D16FF" visible="false" />
          <Rectangle id="osdEpProgFill2" translation="[795, 887]" width="0" height="6" color="0x38BDF8FF" visible="false" />
          <Label id="osdEpTitle2" translation="[797, 904]" scale="[0.47, 0.47]" width="680" height="46" wrap="true" numLines="2" color="0xFFFFFFFF" text="" />
          <Label id="osdEpMeta2" translation="[797, 970]" scale="[0.41, 0.41]" width="760" height="22" numLines="1" color="0x64748BFF" text="" />

          <Rectangle id="osdEpBorder3" translation="[1142, 708]" width="344" height="298" color="0x111A2EFF" />
          <Rectangle id="osdEpBg3" translation="[1145, 711]" width="338" height="292" color="0x111A2EFF" />
          <Poster id="osdEpPoster3" translation="[1151, 717]" width="326" height="176" loadWidth="326" loadHeight="176" loadDisplayMode="scaleToZoom" />
          <Rectangle translation="[1159, 725]" width="106" height="24" color="0x070B14D8" />
          <Label id="osdEpCode3" translation="[1163, 729]" scale="[0.42, 0.42]" width="232" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="S01E04" />
          <Rectangle id="osdEpProgBg3" translation="[1151, 887]" width="326" height="6" color="0x090D16FF" visible="false" />
          <Rectangle id="osdEpProgFill3" translation="[1151, 887]" width="0" height="6" color="0x38BDF8FF" visible="false" />
          <Label id="osdEpTitle3" translation="[1153, 904]" scale="[0.47, 0.47]" width="680" height="46" wrap="true" numLines="2" color="0xFFFFFFFF" text="" />
          <Label id="osdEpMeta3" translation="[1153, 970]" scale="[0.41, 0.41]" width="760" height="22" numLines="1" color="0x64748BFF" text="" />

          <Rectangle id="osdEpBorder4" translation="[1498, 708]" width="348" height="298" color="0x111A2EFF" />
          <Rectangle id="osdEpBg4" translation="[1501, 711]" width="342" height="292" color="0x111A2EFF" />
          <Poster id="osdEpPoster4" translation="[1507, 717]" width="330" height="176" loadWidth="330" loadHeight="176" loadDisplayMode="scaleToZoom" />
          <Rectangle translation="[1515, 725]" width="106" height="24" color="0x070B14D8" />
          <Label id="osdEpCode4" translation="[1519, 729]" scale="[0.42, 0.42]" width="232" height="20" numLines="1" horizAlign="center" color="0xBAE6FDFF" text="S01E05" />
          <Rectangle id="osdEpProgBg4" translation="[1507, 887]" width="330" height="6" color="0x090D16FF" visible="false" />
          <Rectangle id="osdEpProgFill4" translation="[1507, 887]" width="0" height="6" color="0x38BDF8FF" visible="false" />
          <Label id="osdEpTitle4" translation="[1509, 904]" scale="[0.47, 0.47]" width="680" height="46" wrap="true" numLines="2" color="0xFFFFFFFF" text="" />
          <Label id="osdEpMeta4" translation="[1509, 970]" scale="[0.41, 0.41]" width="760" height="22" numLines="1" color="0x64748BFF" text="" />
        </Group>

        <!-- TAB 6 DEDICATED PANE: CLEAN STREAM & FILE METADATA GRID -->
        <Group id="osdMetaGridGroup" visible="false">
          <Rectangle translation="[74, 656]" width="578" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead0" translation="[94, 670]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="FILE &amp; CONTAINER" />
          <Label id="osdMetaVal0" translation="[94, 700]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />

          <Rectangle translation="[670, 656]" width="578" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead1" translation="[690, 670]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="VIDEO STREAM" />
          <Label id="osdMetaVal1" translation="[690, 700]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />

          <Rectangle translation="[1266, 656]" width="580" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead2" translation="[1286, 670]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="AUDIO STREAMS" />
          <Label id="osdMetaVal2" translation="[1286, 700]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />

          <Rectangle translation="[74, 838]" width="578" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead3" translation="[94, 852]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="SUBTITLES" />
          <Label id="osdMetaVal3" translation="[94, 882]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />

          <Rectangle translation="[670, 838]" width="578" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead4" translation="[690, 852]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="LIBRARY &amp; PROGRESS" />
          <Label id="osdMetaVal4" translation="[690, 882]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />

          <Rectangle translation="[1266, 838]" width="580" height="170" color="0x0E1626FF" />
          <Label id="osdMetaHead5" translation="[1286, 852]" scale="[0.46, 0.46]" width="1140" height="24" numLines="1" color="0x38BDF8FF" text="DELIVERY &amp; BITRATE" />
          <Label id="osdMetaVal5" translation="[1286, 882]" scale="[0.48, 0.48]" width="1110" height="112" wrap="true" numLines="4" color="0xE2E8F0FF" text="" />
        </Group>

        <!-- Minimal Quiet Footer Hint -->
        <Label id="osdFooterHint" translation="[76, 1020]" scale="[0.43, 0.43]" width="3900" height="22" numLines="1" color="0x64748BFF" text="Up/Down Switch Row   |   Left/Right Navigate   |   OK Select   |   * Subtitles   |   Back Close" />
      </Group>
    </Group>
    <Timer id="clockTimer" repeat="true" duration="1.0" />
    <Timer id="subTimer" repeat="true" duration="0.25" />
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
    m.cinemaHeaderAccent = m.top.findNode("cinemaHeaderAccent")
    m.cinemaTabMoviesBorder = m.top.findNode("cinemaTabMoviesBorder")
    m.cinemaTabMoviesBg = m.top.findNode("cinemaTabMoviesBg")
    m.cinemaTabMoviesStripe = m.top.findNode("cinemaTabMoviesStripe")
    m.cinemaTabMoviesPoster = m.top.findNode("cinemaTabMoviesPoster")
    m.cinemaTabMoviesLabel = m.top.findNode("cinemaTabMoviesLabel")
    m.cinemaTabMoviesSub = m.top.findNode("cinemaTabMoviesSub")
    m.cinemaTabMoviesPillBg = m.top.findNode("cinemaTabMoviesPillBg")
    m.cinemaTabMoviesPillTxt = m.top.findNode("cinemaTabMoviesPillTxt")
    m.cinemaTabShowsBorder = m.top.findNode("cinemaTabShowsBorder")
    m.cinemaTabShowsBg = m.top.findNode("cinemaTabShowsBg")
    m.cinemaTabShowsStripe = m.top.findNode("cinemaTabShowsStripe")
    m.cinemaTabShowsPoster = m.top.findNode("cinemaTabShowsPoster")
    m.cinemaTabShowsLabel = m.top.findNode("cinemaTabShowsLabel")
    m.cinemaTabShowsSub = m.top.findNode("cinemaTabShowsSub")
    m.cinemaTabShowsPillBg = m.top.findNode("cinemaTabShowsPillBg")
    m.cinemaTabShowsPillTxt = m.top.findNode("cinemaTabShowsPillTxt")
    m.cinemaTabTabloGroup = m.top.findNode("cinemaTabTabloGroup")
    m.cinemaTabTabloBorder = m.top.findNode("cinemaTabTabloBorder")
    m.cinemaTabTabloBg = m.top.findNode("cinemaTabTabloBg")
    m.cinemaTabTabloStripe = m.top.findNode("cinemaTabTabloStripe")
    m.cinemaTabTabloPoster = m.top.findNode("cinemaTabTabloPoster")
    m.cinemaTabTabloLabel = m.top.findNode("cinemaTabTabloLabel")
    m.cinemaTabTabloSub = m.top.findNode("cinemaTabTabloSub")
    m.cinemaTabTabloPillBg = m.top.findNode("cinemaTabTabloPillBg")
    m.cinemaTabTabloPillTxt = m.top.findNode("cinemaTabTabloPillTxt")
    m.cinemaTabBackGroup = m.top.findNode("cinemaTabBackGroup")
    m.cinemaTabBackBorder = m.top.findNode("cinemaTabBackBorder")
    m.cinemaTabBackBg = m.top.findNode("cinemaTabBackBg")
    m.cinemaTabBackPoster = m.top.findNode("cinemaTabBackPoster")
    m.cinemaTabBackLabel = m.top.findNode("cinemaTabBackLabel")
    m.cinemaTabBackSub = m.top.findNode("cinemaTabBackSub")
    m.cinemaHeroThumbGroup = m.top.findNode("cinemaHeroThumbGroup")
    m.cinemaHeroThumbBorder = m.top.findNode("cinemaHeroThumbBorder")
    m.cinemaHeroThumbPoster = m.top.findNode("cinemaHeroThumbPoster")
    m.cinemaHeroThumbCaption = m.top.findNode("cinemaHeroThumbCaption")
    m.cinemaZoneCompassBar = m.top.findNode("cinemaZoneCompassBar")
    m.cinemaActiveCatBadge = m.top.findNode("cinemaActiveCatBadge")
    m.cinemaLibSubHeader = m.top.findNode("cinemaLibSubHeader")
    m.cinemaCatPaneBg = m.top.findNode("cinemaCatPaneBg")
    m.cinemaCatFocusStripe = m.top.findNode("cinemaCatFocusStripe")
    m.cinemaCatHeaderLabel = m.top.findNode("cinemaCatHeaderLabel")
    m.cinemaCatSubHint = m.top.findNode("cinemaCatSubHint")
    m.cinemaListPaneBg = m.top.findNode("cinemaListPaneBg")
    m.cinemaListFocusStripe = m.top.findNode("cinemaListFocusStripe")
    m.cinemaLibCountLabel = m.top.findNode("cinemaLibCountLabel")
    m.cinemaLibPoster = m.top.findNode("cinemaLibPoster")
    m.cinemaHeroProgTrack = m.top.findNode("cinemaHeroProgTrack")
    m.cinemaHeroProgFill = m.top.findNode("cinemaHeroProgFill")
    m.cinemaHeroPosterFallbackBg = m.top.findNode("cinemaHeroPosterFallbackBg")
    m.cinemaHeroPosterTopBar = m.top.findNode("cinemaHeroPosterTopBar")
    m.cinemaHeroPosterRibbon = m.top.findNode("cinemaHeroPosterRibbon")
    m.cinemaHeroPosterMonogram = m.top.findNode("cinemaHeroPosterMonogram")
    m.cinemaHeroPosterFallbackTitle = m.top.findNode("cinemaHeroPosterFallbackTitle")
    m.cinemaHeroPosterFallbackYear = m.top.findNode("cinemaHeroPosterFallbackYear")
    m.cinemaSpotlightPillBg = m.top.findNode("cinemaSpotlightPillBg")
    m.cinemaSpotlightPillText = m.top.findNode("cinemaSpotlightPillText")
    m.cinemaHeroEyebrow = m.top.findNode("cinemaHeroEyebrow")
    m.cinemaLibDetailTitle = m.top.findNode("cinemaLibDetailTitle")
    m.cinemaBadgeYear = m.top.findNode("cinemaBadgeYear")
    m.cinemaBadgeRating = m.top.findNode("cinemaBadgeRating")
    m.cinemaBadgeQuality = m.top.findNode("cinemaBadgeQuality")
    m.cinemaBadgeGenre = m.top.findNode("cinemaBadgeGenre")
    m.cinemaBadgeFormatBg = m.top.findNode("cinemaBadgeFormatBg")
    m.cinemaBadgeFormatStripe = m.top.findNode("cinemaBadgeFormatStripe")
    m.cinemaBadgeFormat = m.top.findNode("cinemaBadgeFormat")
    m.cinemaLibDetailMeta = m.top.findNode("cinemaLibDetailMeta")
    m.cinemaLibDetailSub = m.top.findNode("cinemaLibDetailSub")
    m.cinemaHeroSynopsis = m.top.findNode("cinemaHeroSynopsis")
    m.cinemaPlayBtnBg = m.top.findNode("cinemaPlayBtnBg")
    m.cinemaLibPlayPrompt = m.top.findNode("cinemaLibPlayPrompt")
    m.cinemaHeroNavHint = m.top.findNode("cinemaHeroNavHint")
    m.cinemaShelfTitleLabel = m.top.findNode("cinemaShelfTitleLabel")
    m.cinemaShelfPosLabel = m.top.findNode("cinemaShelfPosLabel")
    m.cinemaLibFooter = m.top.findNode("cinemaLibFooter")
    m.cinemaLibraryActive = false
    m.cinemaActiveTab = "movies"
    m.activeShowGroup = invalid
    m.activeShowSeasons = []
    m.activeSeasonIndex = 1
    m.lastShowGroupIndex = 0
    m.currentPlayingTrackId = ""
    ' 3-Row 2D Focus State: "tabs" (Row 0), "categories" (Row 1), "posters" (Row 2)
    m.cinemaFocusZone = "posters"
    m.cinemaTabCol = 0
    m.cinemaCatIndex = 0
    m.cinemaPosterIndex = 0
    m.wallCardIndex = 0
    m.allCinemaItems = []
    m.cinemaLibItems = []
    m.cinemaLibHash = ""
    m.movieCategories = [
        { id: "all", tag: "COLLECTION", mono: "ALL", label: "All Movies" },
        { id: "continue", tag: "RESUME", mono: "GO", label: "In Progress" },
        { id: "franchises", tag: "BOX SETS", mono: "BOX", label: "Franchises" },
        { id: "scifi", tag: "GENRE", mono: "SCI", label: "Sci-Fi & Fantasy" },
        { id: "action", tag: "GENRE", mono: "ACT", label: "Action" },
        { id: "horror", tag: "GENRE", mono: "HOR", label: "Horror" },
        { id: "family", tag: "GENRE", mono: "FAM", label: "Family" },
        { id: "comedy", tag: "GENRE", mono: "COM", label: "Comedy" },
        { id: "thriller", tag: "GENRE", mono: "THR", label: "Thriller" },
        { id: "uhd", tag: "QUALITY", mono: "4K", label: "4K & BluRay" },
        { id: "new", tag: "RELEASES", mono: "NEW", label: "New Releases" },
        { id: "classics", tag: "ARCHIVE", mono: "CLS", label: "Classics" }
    ]
    m.showCategories = [
        { id: "all", tag: "COLLECTION", mono: "ALL", label: "All TV Shows" },
        { id: "continue", tag: "RESUME", mono: "GO", label: "In Progress" },
        { id: "networks", tag: "STREAMING", mono: "TV+", label: "Originals" },
        { id: "scifi", tag: "GENRE", mono: "SCI", label: "Sci-Fi & Fantasy" },
        { id: "drama", tag: "GENRE", mono: "DRM", label: "Drama & Crime" },
        { id: "action", tag: "GENRE", mono: "ACT", label: "Action" },
        { id: "horror", tag: "GENRE", mono: "HOR", label: "Horror" },
        { id: "comedy", tag: "GENRE", mono: "COM", label: "Comedy" }
    ]
    m.tabloCategories = [
        { id: "all", tag: "TABLO DVR", mono: "DVR", label: "All DVR" },
        { id: "sports", tag: "LIVE SPORTS", mono: "SPT", label: "Live Sports" },
        { id: "series", tag: "TV SHOWS", mono: "TV", label: "Series" },
        { id: "news", tag: "LOCAL OTA", mono: "NWS", label: "Local News" },
        { id: "fox", tag: "CH 47.1 FOX", mono: "FOX", label: "47.1 FOX" },
        { id: "nbc", tag: "CH 15.1 NBC", mono: "NBC", label: "15.1 NBC" }
    ]
    m.lastAppliedDefaultTab = ""
    m.cinemaCategories = m.movieCategories
    m.cinemaVideoActive = false
    m.lastCinemaLoadKey = ""
    m.lastRemoteCastKey = ""
    m.dismissedCinemaLoadKey = ""
    m.lastCinemaSeekKey = ""
    m.lastCinemaPauseKey = ""
    m.currentPlayingMediaUrl = ""
    m.currentStreamIsHls = false
    m.subtitleOverlayGroup = m.top.findNode("subtitleOverlayGroup")
    m.subtitleCueBg = m.top.findNode("subtitleCueBg")
    m.subtitleCueAccent = m.top.findNode("subtitleCueAccent")
    m.subtitleCueLabel = m.top.findNode("subtitleCueLabel")
    m.playerOsdGroup = m.top.findNode("playerOsdGroup")
    m.osdScrubberGroup = m.top.findNode("osdScrubberGroup")
    m.osdFullDrawerGroup = m.top.findNode("osdFullDrawerGroup")
    m.osdActionBtnsGroup = m.top.findNode("osdActionBtnsGroup")
    m.osdRichSummaryGroup = m.top.findNode("osdRichSummaryGroup")
    m.osdSeasonPaneGroup = m.top.findNode("osdSeasonPaneGroup")
    m.osdMetaGridGroup = m.top.findNode("osdMetaGridGroup")
    m.subTimer = m.top.findNode("subTimer")
    m.playerOsdOpen = false
    m.playerOsdMode = "full"
    m.playerMiniHideSec = 0
    m.osdZone = "tabs"
    m.osdTabIdx = 0
    m.osdItemIdx = 0
    m.osdSeasonTopIdx = 0
    m.osdEpFocusIdx = 0
    m.osdBrowseSeasonIdx = 0
    m.osdSeasonsList = []
    m.osdSeasonEps = []
    m.playingShowGroup = invalid
    m.playingShowGroupIdx = -1
    m.playingEpisodeObj = invalid
    m.playingEpFlatIndex = -1
    m.playbackMeta = invalid
    m.captionsEnabled = false
    m.captionTempReplaySec = 0
    m.captionChoiceIdx = 0
    m.captionChoices = [
        { kind: "off", label: "Captions Off", trackIndex: -1 },
        { kind: "native_cc", label: "Broadcast / Stream CC", trackIndex: -2 }
    ]
    m.subtitleCues = []
    m.cuesExtracting = false
    m.lastCueIdx = -1
    m.captionSizeMode = 1
    m.captionOffsetSec = 0.0
    m.activeAudioChoiceIdx = 0
    if m.cinemaVideo <> invalid
        m.cinemaVideo.observeField("state", "onCinemaVideoState")
    end if
    if m.subTimer <> invalid
        m.subTimer.observeField("fire", "onSubTimerTick")
        m.subTimer.control = "start"
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

    m.wallCards = [
        { id: "movie-player", title: "RobOS Cinema+ Movies", desc: "Browse & play 107 feature films with 2:3 posters, plot synopses, and watch progress." },
        { id: "tv-shows", title: "RobOS Cinema+ TV Shows", desc: "Browse 48 TV Series by Season & Episode with visual poster cards and resume tracking." },
        { id: "tablo-dvr", title: "Tablo OTA DVR Recordings", desc: "Browse & play your Tablo DVR recordings with acquired broadcast thumbnails." },
        { id: "daily-engineering-ops", title: "Daily Engineering & Agent Ops", desc: "Slide 1: GitHub Releases & Commits + Music + Dual Calendars + Tailed Agents." },
        { id: "github-ci-popularity", title: "GitHub CI Status & App Popularity", desc: "Slide 2: CI Status in main + Stars & Forks + 14-Day Clones & Release Downloads." },
        { id: "robos-voice-dictation", title: "RobOS Voice Dictation Chats", desc: "Slide 3: Live RobOS Voice dictation dialogue bubbles, commands, and skill badges." }
    ]
    m.top.setFocus(true)

    m.bundledTabloItems = []
    initLibRaw = ReadAsciiFile("pkg:/source/cinema-library.json")
    initKnownRev = ""
    if initLibRaw <> ""
        initLibObj = ParseJson(initLibRaw)
        if initLibObj <> invalid and initLibObj.items <> invalid
            for each initIt in initLibObj.items
                if initIt <> invalid and ((initIt.isTablo = true) or (initIt.mediaType <> invalid and initIt.mediaType = "tablo"))
                    m.bundledTabloItems.Push(initIt)
                end if
            end for
            m.latestCinemaLibrary = initLibObj
            if initLibObj.rev <> invalid then initKnownRev = initLibObj.rev.ToStr()
            if initLibObj.active = true
                m.localLibraryOpened = true
                showCinemaLibrary(initLibObj)
            end if
        end if
    end if
    updateWallLauncherUi()

    m.dashTask = CreateObject("roSGNode", "DashboardTask")
    m.dashTask.apiUrl = "${portalUrl}/api/dashboard-cast"
    m.dashTask.mediaServerUrl = "${effectiveMediaServerUrl}"
    m.dashTask.knownRev = initKnownRev
    m.dashTask.observeField("payloadJson", "onPayloadUpdated")
    m.dashTask.observeField("playbackMetaJson", "onPlaybackMetaLoaded")
    m.dashTask.observeField("localFrameUri", "onLocalFrameReady")
    m.dashTask.control = "RUN"
    onClockTick()
end sub

function safeInt(v as Dynamic) as Integer
    if v = invalid then return 0
    t = type(v)
    if t = "Integer" or t = "roInt" or t = "LongInteger" then return v
    if t = "Float" or t = "roFloat" or t = "Double" or t = "roDouble" then return Int(v)
    if t = "String" or t = "roString" then return Int(Val(v))
    return 0
end function

function safeFloat(v as Dynamic) as Float
    if v = invalid then return 0.0
    t = type(v)
    if t = "Float" or t = "roFloat" or t = "Double" or t = "roDouble" then return v
    if t = "Integer" or t = "roInt" or t = "LongInteger" then return v * 1.0
    if t = "String" or t = "roString" then return Val(v)
    return 0.0
end function

function formatClockHms(secVal as Dynamic) as String
    s = safeInt(secVal)
    if s < 0 then s = 0
    h = Int(s / 3600)
    mn = Int((s mod 3600) / 60)
    sc = s mod 60
    if h > 0
        return h.ToStr() + ":" + pad2(mn) + ":" + pad2(sc)
    end if
    return mn.ToStr() + ":" + pad2(sc)
end function

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
            m.slideshowBadgeLabel.color = "0xBAE6FDFF"
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
    if m.cinemaVideoActive = true and m.cinemaVideo <> invalid
        if m.top.hasFocus() <> true
            m.top.setFocus(true)
        end if
        if m.captionTempReplaySec > 0
            m.captionTempReplaySec = m.captionTempReplaySec - 1
        end if
        if m.playerOsdOpen = true
            updatePlayerOsdHeaderAndScrubber()
            if m.playerOsdMode = "mini" and m.cinemaVideo.state = "playing"
                if m.playerMiniHideSec > 1
                    m.playerMiniHideSec = m.playerMiniHideSec - 1
                else
                    closePlayerOsd()
                end if
            else if m.playerOsdMode = "full" and m.osdTabIdx = 6
                renderPlayerOsd()
            end if
        end if
        if m.cuesExtracting = true and m.dashTask <> invalid and m.currentPlayingTrackId <> "" and (m.tickCount mod 3) = 0
            reqCueIdx = 0
            if m.captionChoiceIdx > 0 and m.captionChoiceIdx < m.captionChoices.Count()
                ch = m.captionChoices[m.captionChoiceIdx]
                if ch <> invalid and ch.trackIndex <> invalid and ch.trackIndex >= 0 then reqCueIdx = ch.trackIndex
            end if
            m.dashTask.metaRequestUrl = "${progressBaseUrl}/api/roku-playback-meta/" + m.currentPlayingTrackId + "?cueTrack=" + reqCueIdx.ToStr() + "&waitCues=1&seq=" + m.tickCount.ToStr()
        end if
    end if
    if m.cinemaVideoActive = true and m.cinemaVideo <> invalid and m.dashTask <> invalid and m.currentPlayingTrackId <> ""
        if (m.tickCount mod 5) = 0 and m.cinemaVideo.state = "playing"
            posSec = Int(m.cinemaVideo.position)
            durSec = Int(m.cinemaVideo.duration)
            if posSec > 0
                m.dashTask.progressUrl = "${progressBaseUrl}/api/tv-progress?id=" + m.currentPlayingTrackId + "&positionSec=" + posSec.ToStr() + "&durationSec=" + durSec.ToStr() + "&seq=" + m.tickCount.ToStr()
            end if
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
            todayBar.color = "0x38BDF8FF"
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
    return s.ToStr()
end function

sub ensureLivePosters()
    if m.livePosterA = invalid
        m.livePosterA = m.top.findNode("livePosterA")
        m.livePosterB = m.top.findNode("livePosterB")
        m.frontPoster = ""
        m.frameSeq = 0
        m.posterLoading = false
        m.pendingPosterUri = ""
    end if
end sub

sub startPosterSwap(uri as String)
    ensureLivePosters()
    if uri = "" then return
    if m.posterLoading = true
        m.pendingPosterUri = uri
        return
    end if
    m.posterLoading = true
    if m.frontPoster = "A" then target = m.livePosterB else target = m.livePosterA
    target.unobserveField("loadStatus")
    target.observeField("loadStatus", "onLivePosterLoaded")
    target.uri = uri
end sub

sub onLocalFrameReady()
    if m.dashTask = invalid then return
    localUri = m.dashTask.localFrameUri
    if localUri = invalid or localUri = "" then return
    if m.cinemaVideoActive = true then stopCinemaVideo()
    if m.cinemaLibraryActive = true then hideCinemaLibrary()
    startPosterSwap(localUri)
end sub

sub showAppCastFrame(frameUrl as String)
    ensureLivePosters()
    if m.dashTask <> invalid and m.dashTask.localFrameUri <> invalid and m.dashTask.localFrameUri <> ""
        return
    end if
    m.frameSeq = m.frameSeq + 1
    sep = "?"
    if Instr(1, frameUrl, "?") > 0 then sep = "&"
    startPosterSwap(frameUrl + sep + "seq=" + m.frameSeq.ToStr())
end sub

sub onLivePosterLoaded(evt as Object)
    p = evt.getRoSGNode()
    st = p.loadStatus
    if st = "loading" then return
    p.unobserveField("loadStatus")
    m.posterLoading = false
    if st = "ready"
        if p.id = "livePosterA"
            m.livePosterA.opacity = 1.0
            m.livePosterB.opacity = 0.0
            m.frontPoster = "A"
        else
            m.livePosterB.opacity = 1.0
            m.livePosterA.opacity = 0.0
            m.frontPoster = "B"
        end if
    end if
    if m.pendingPosterUri <> ""
        nextUri = m.pendingPosterUri
        m.pendingPosterUri = ""
        startPosterSwap(nextUri)
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
    if m.dashTask <> invalid then m.dashTask.localFrameUri = ""
    if m.livePosterA <> invalid
        m.livePosterA.opacity = 0.0
        m.livePosterB.opacity = 0.0
        m.frontPoster = ""
        m.posterLoading = false
        m.pendingPosterUri = ""
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
        m.localVideoPlaying = (cinema.isLocal = true)
        m.switchingCinemaLoad = true
        m.cinemaVideo.control = "stop"
        m.cinemaVideo.content = invalid
        if cinema.trackId <> invalid and cinema.trackId.ToStr() <> ""
            m.currentPlayingTrackId = cleanAscii(cinema.trackId)
        end if
        if cinema.hlsUrl <> invalid and cinema.hlsUrl.ToStr() <> ""
            m.currentPlayingHlsUrl = cleanAscii(cinema.hlsUrl)
            m.triedHlsFallback = false
        end if
        content = CreateObject("roSGNode", "ContentNode")
        content.url = cinema.mediaUrl
        if cinema.title <> invalid then content.title = cinema.title else content.title = "RobOS Movie Player"
        m.currentPlayingTitle = content.title
        fmt = "mp4"
        if cinema.streamFormat <> invalid and cinema.streamFormat <> ""
            fmt = LCase(cinema.streamFormat.ToStr())
        else if Instr(1, LCase(cinema.mediaUrl.ToStr()), ".mkv") > 0
            fmt = "mkv"
        end if
        content.streamFormat = fmt
        startSec = 0
        if cinema.startAt <> invalid and cinema.startAt > 0
            startSec = safeInt(cinema.startAt)
            content.PlayStart = startSec
        end if
        m.currentPlayingStartSec = startSec
        m.currentPlayingMediaUrl = cleanAscii(cinema.mediaUrl)
        m.currentStreamIsHls = (fmt = "hls")
        m.cinemaVideo.content = content
        m.top.setFocus(true)
        m.cinemaVideo.control = "play"
        m.switchingCinemaLoad = false
        if cinema.seekKey <> invalid then m.lastCinemaSeekKey = cinema.seekKey.ToStr()
        if cinema.pauseKey <> invalid then m.lastCinemaPauseKey = cinema.pauseKey.ToStr()
        if cinema.preserveMeta <> true
            initPlaybackContextForCurrentTrack()
        end if
        openPlayerOsd("mini")
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
    if cinema.pauseKey <> invalid
        pk = cinema.pauseKey.ToStr()
        if pk <> "" and pk <> m.lastCinemaPauseKey
            m.lastCinemaPauseKey = pk
            if cinema.paused = true
                if m.cinemaVideo.state = "playing" then m.cinemaVideo.control = "pause"
            else
                if m.cinemaVideo.state = "paused" then m.cinemaVideo.control = "resume"
            end if
        end if
    end if
end sub

sub stopCinemaVideo()
    if m.cinemaVideoActive <> true then return
    m.cinemaVideoActive = false
    m.lastCinemaLoadKey = ""
    m.lastCinemaSeekKey = ""
    closePlayerOsd()
    if m.subtitleOverlayGroup <> invalid then m.subtitleOverlayGroup.visible = false
    if m.cinemaVideo <> invalid
        m.cinemaVideo.control = "stop"
        m.cinemaVideo.visible = false
    end if
    m.top.setFocus(true)
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
    if mv = invalid then return {}
    if mv._info <> invalid then return mv._info
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

    isTablo = (mv.mediaType <> invalid and mv.mediaType = "tablo") or (mv.isTablo = true)
    isTv = (not isTablo) and ((mv.mediaType <> invalid and mv.mediaType = "tv") or (mv.isShowGroup = true) or hasAnyKeyword(hay, ["s01e", "s02e", "s03e", "atypical", "tv series", "season "]))
    isScifi = hasAnyKeyword(hay, ["dune", "harry potter", "lord of the rings", "fellowship", "two towers", "return of the king", "ex machina", "serenity", "wicked", "wizard of oz", "willow", "ne zha", "backrooms", "sci-fi", "science-fiction", "science fiction", "fantasy", "fallout", "firefly", "foundation", "game of thrones", "house of the dragon", "rick and morty", "severance", "silo", "stranger things", "the last of us", "mandalorian", "westworld", "avatar", "arcane", "doctor who", "black mirror", "andor", "loki"])
    isAction = hasAnyKeyword(hay, ["avengers", "endgame", "infinity war", "mortal kombat", "resident evil", "dune", "lord of the rings", "harry potter", "willow", "hunting games", "outpost", "serenity", "ne zha", "action", "adventure", "archer", "avatar", "fallout", "firefly", "game of thrones", "house of the dragon", "the boys", "the last of us", "mandalorian", "peacemaker", "reacher", "shogun", "vikings", "daredevil"])
    isHorror = hasAnyKeyword(hay, ["conjuring", "annabelle", "insidious", "scream", "paranormal activity", "the nun", "nun ii", "final destination", "friday the 13th", "halloween", "terrifier", "babadook", "malignant", "it follows", "smile", "orphan", "lights out", "five nights at freddy", "jennifers body", "megan is missing", "backrooms", "other mommy", "hokum", "horror", "supernatural", "stranger things", "the last of us", "wednesday", "yellowjackets", "walking dead", "haunting", "from", "evil", "penny dreadful"])
    isFamily = hasAnyKeyword(hay, ["inside out", "rileys first date", "tangled", "zootopia", "super mario", "ne zha", "matilda", "cruella", "spirited", "wizard of oz", "wicked", "kpop demon hunters", "harry potter", "animation", "family", "bluey", "avatar", "spongebob", "simpsons", "gravity falls"])
    if LCase(titleStr) = "home" then isFamily = true
    isComedy = hasAnyKeyword(hay, ["scary movie", "anyone but you", "ticket to paradise", "four rooms", "beetlejuice", "buddy", "spirited", "men up", "heist before christmas", "cruella", "matilda", "atypical", "jennifers body", "rileys first date", "comedy", "archer", "bluey", "bojack", "rick and morty", "south park", "ted lasso", "the bear", "the office", "white lotus", "wednesday", "parks and rec", "brooklyn nine", "always sunny", "curb your", "arrested development", "what we do in the shadows"])
    isThriller = hasAnyKeyword(hay, ["ready or not", "missing", "housemaid", "obsession", "passenger", "orphan", "scream", "final destination", "ex machina", "it follows", "malignant", "hunting games", "outpost", "thriller", "crime", "mystery", "breaking bad", "better call saul", "dexter", "fargo", "mindhunter", "mr robot", "narcos", "ozark", "peaky blinders", "severance", "sherlock", "sopranos", "true detective", "wire", "yellowjackets"])

    primaryGenre = "Drama & Cinema"
    bgCol = "0x111C30FF"
    barCol = "0x38BDF8FF"
    if isTablo
        primaryGenre = cleanAscii(mv.genre)
        if primaryGenre = "" then primaryGenre = "Tablo OTA DVR"
        bgCol = "0x0F2536FF"
        barCol = "0x00BCD4FF"
        if mv.pkgThumbUri <> invalid and mv.pkgThumbUri <> ""
            mv.artUrl = mv.pkgThumbUri
            mv.thumbnailUrl = mv.pkgThumbUri
        end if
        if mv.pkgCoverUri <> invalid and mv.pkgCoverUri <> ""
            mv.coverUrl = mv.pkgCoverUri
        end if
    else if isTv
        primaryGenre = "TV Series"
        bgCol = "0x132038FF"
        barCol = "0x38BDF8FF"
    else if isScifi
        primaryGenre = "Sci-Fi & Fantasy"
        bgCol = "0x14233DFF"
        barCol = "0x38BDF8FF"
    else if isAction
        primaryGenre = "Action & Adventure"
        bgCol = "0x132036FF"
        barCol = "0x38BDF8FF"
    else if isFamily
        primaryGenre = "Animation & Family"
        bgCol = "0x112433FF"
        barCol = "0x10B981FF"
    else if isComedy
        primaryGenre = "Comedy & Romance"
        bgCol = "0x152038FF"
        barCol = "0x7DD3FCFF"
    else if isHorror
        primaryGenre = "Horror & Supernatural"
        bgCol = "0x161D30FF"
        barCol = "0x60A5FAFF"
    else if isThriller
        primaryGenre = "Thriller & Mystery"
        bgCol = "0x141F36FF"
        barCol = "0x818CF8FF"
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
    if srcStr <> "" then qualBadge = resStr + " | " + srcStr

    isUhd = (resStr = "4K UHD" or srcStr = "BluRay")
    yrNum = 0
    if mv.year <> invalid then yrNum = Int(Val(mv.year.ToStr()))
    isNew = (yrNum >= 2023)
    isClassic = (yrNum > 0 and yrNum < 2010)

    fmtStr = "MP4"
    if isTablo
        fmtStr = "HLS DVR"
    else if mv.streamFormat <> invalid and LCase(mv.streamFormat.ToStr()) = "mkv"
        fmtStr = "MKV"
    else if mv.streamUrl <> invalid and Instr(1, LCase(mv.streamUrl.ToStr()), ".mkv") > 0
        fmtStr = "MKV"
    end if

    infoObj = {
        franchise: franchise,
        primaryGenre: primaryGenre,
        qualBadge: qualBadge,
        resStr: resStr,
        fmtStr: fmtStr,
        monogram: makeMonogram(titleStr),
        bgCol: bgCol,
        barCol: barCol,
        isTablo: isTablo,
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
    mv._info = infoObj
    return infoObj
end function

function cinemaItemMatchesCat(mv as Object, catId as String) as Boolean
    info = cinemaClassifyItem(mv)
    if m.cinemaActiveTab = "tablo"
        if not info.isTablo then return false
        if catId = "all" or catId = "" then return true
        tKind = ""
        if mv.tabloKind <> invalid then tKind = LCase(cleanAscii(mv.tabloKind))
        netHay = LCase(cleanAscii(mv.network) + " " + cleanAscii(mv.title) + " " + cleanAscii(mv.genre))
        if catId = "sports" then return (tKind = "sports" or Instr(1, netHay, "nfl") > 0 or Instr(1, netHay, "mlb") > 0 or Instr(1, netHay, "football") > 0 or Instr(1, netHay, "baseball") > 0)
        if catId = "series" then return (tKind = "series" and Instr(1, netHay, "news") = 0)
        if catId = "news" then return (Instr(1, netHay, "news") > 0)
        if catId = "fox" then return (Instr(1, netHay, "47.1") > 0 or Instr(1, netHay, "fox") > 0)
        if catId = "nbc" then return (Instr(1, netHay, "15.1") > 0 or Instr(1, netHay, "nbc") > 0)
        return true
    else if m.cinemaActiveTab = "shows"
        if not info.isTv or info.isTablo then return false
    else
        if info.isTv or info.isTablo then return false
    end if
    if catId = "all" or catId = "" or catId = "__switch_shows__" or catId = "__switch_movies__" then return true
    if catId = "continue"
        if mv.inProgress = true then return true
        if mv.inProgressCount <> invalid and mv.inProgressCount > 0 then return true
        return false
    end if
    if catId = "networks"
        if mv.network <> invalid and mv.network <> "" then return true
        return true
    end if
    if catId = "drama" then return (not info.isScifi and not info.isComedy and not info.isHorror)
    if catId = "franchises" then return (info.franchise <> "")
    if catId = "scifi" then return info.isScifi
    if catId = "action" then return info.isAction
    if catId = "horror" then return info.isHorror
    if catId = "family" then return info.isFamily
    if catId = "comedy" then return (info.isComedy or info.isFamily)
    if catId = "thriller" then return info.isThriller
    if catId = "uhd" then return info.isUhd
    if catId = "new" then return info.isNew
    if catId = "classics" then return info.isClassic
    return true
end function

sub updateWallLauncherUi()
    firstMovieArt = ""
    firstShowArt = ""
    firstTabloArt = ""
    moviesCnt = 0
    showsCnt = 0
    tabloCnt = 0
    srcItems = invalid
    if m.allCinemaItems <> invalid and m.allCinemaItems.Count() > 0
        srcItems = m.allCinemaItems
    else if m.latestCinemaLibrary <> invalid and m.latestCinemaLibrary.items <> invalid
        srcItems = m.latestCinemaLibrary.items
    end if
    if srcItems <> invalid
        for each mv in srcItems
            info = cinemaClassifyItem(mv)
            if info.isTablo
                tabloCnt = tabloCnt + 1
                if firstTabloArt = "" and mv.artUrl <> invalid and mv.artUrl <> "" then firstTabloArt = mv.artUrl
            else if info.isTv
                showsCnt = showsCnt + 1
                if firstShowArt = "" and mv.artUrl <> invalid and mv.artUrl <> "" then firstShowArt = mv.artUrl
            else
                moviesCnt = moviesCnt + 1
                if firstMovieArt = "" and mv.artUrl <> invalid and mv.artUrl <> "" then firstMovieArt = mv.artUrl
            end if
        end for
    end if
    wp0 = m.top.findNode("wallCardPoster0")
    wp1 = m.top.findNode("wallCardPoster1")
    wp2 = m.top.findNode("wallCardPoster2")
    ws0 = m.top.findNode("wallCardSub0")
    ws1 = m.top.findNode("wallCardSub1")
    ws2 = m.top.findNode("wallCardSub2")
    if wp0 <> invalid and firstMovieArt <> "" then wp0.uri = firstMovieArt
    if wp1 <> invalid and firstShowArt <> "" then wp1.uri = firstShowArt
    if wp2 <> invalid and firstTabloArt <> "" then wp2.uri = firstTabloArt
    if ws0 <> invalid and moviesCnt > 0 then ws0.text = moviesCnt.ToStr() + " Films"
    if ws1 <> invalid and showsCnt > 0 then ws1.text = showsCnt.ToStr() + " Series"
    if ws2 <> invalid and tabloCnt > 0 then ws2.text = tabloCnt.ToStr() + " Recordings"
    for i = 0 to 5
        bdr = m.top.findNode("wallCardBorder" + i.ToStr())
        bg = m.top.findNode("wallCardBg" + i.ToStr())
        ttl = m.top.findNode("wallCardTitle" + i.ToStr())
        isF = (i = m.wallCardIndex)
        if bdr <> invalid
            if isF then bdr.color = "0xFFFFFFFF" else bdr.color = "0x111A2EFF"
        end if
        if bg <> invalid
            if isF then bg.color = "0x1E3A5FFF" else bg.color = "0x111A2EFF"
        end if
        if ttl <> invalid
            if isF then ttl.color = "0xFFFFFFFF" else ttl.color = "0xCBD5E1FF"
        end if
    end for
    if m.wallCards <> invalid and m.wallCardIndex >= 0 and m.wallCardIndex < m.wallCards.Count()
        wc = m.wallCards[m.wallCardIndex]
        if m.heroTitle <> invalid then m.heroTitle.text = wc.title
        if m.heroDesc <> invalid then m.heroDesc.text = wc.desc
    end if
end sub

sub updateCinemaTabHeaderUi()
    isMovies = (m.cinemaActiveTab = "movies")
    isShows = (m.cinemaActiveTab = "shows")
    isTablo = (m.cinemaActiveTab = "tablo")
    inTabsZone = (m.cinemaFocusZone = "tabs")
    moviesCnt = 0
    showsCnt = 0
    tabloCnt = 0
    if m.allCinemaItems <> invalid
        for each mv in m.allCinemaItems
            info = cinemaClassifyItem(mv)
            if info.isTablo
                tabloCnt = tabloCnt + 1
            else if info.isTv
                showsCnt = showsCnt + 1
            else
                moviesCnt = moviesCnt + 1
            end if
        end for
    end if

    isMoviesTabFocused = (inTabsZone and m.cinemaTabCol = 0)
    isShowsTabFocused = (inTabsZone and m.cinemaTabCol = 1)
    isTabloTabFocused = (inTabsZone and m.cinemaTabCol = 2 and m.activeShowGroup = invalid)
    isBackTabFocused = (inTabsZone and m.cinemaTabCol = 2 and m.activeShowGroup <> invalid)

    if m.cinemaTabMoviesBorder <> invalid
        if isMoviesTabFocused
            m.cinemaTabMoviesBorder.color = "0xFFFFFFFF"
        else if isMovies
            m.cinemaTabMoviesBorder.color = "0x172554FF"
        else
            m.cinemaTabMoviesBorder.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabMoviesBg <> invalid
        if isMoviesTabFocused
            m.cinemaTabMoviesBg.color = "0x1E3A5FFF"
        else if isMovies
            m.cinemaTabMoviesBg.color = "0x172554FF"
        else
            m.cinemaTabMoviesBg.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabMoviesLabel <> invalid
        m.cinemaTabMoviesLabel.text = "Movies"
        if isMoviesTabFocused
            m.cinemaTabMoviesLabel.color = "0xFFFFFFFF"
        else if isMovies
            m.cinemaTabMoviesLabel.color = "0x7DD3FCFF"
        else
            m.cinemaTabMoviesLabel.color = "0x94A3B8FF"
        end if
    end if

    if m.cinemaTabShowsBorder <> invalid
        if isShowsTabFocused
            m.cinemaTabShowsBorder.color = "0xFFFFFFFF"
        else if isShows
            m.cinemaTabShowsBorder.color = "0x172554FF"
        else
            m.cinemaTabShowsBorder.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabShowsBg <> invalid
        if isShowsTabFocused
            m.cinemaTabShowsBg.color = "0x1E3A5FFF"
        else if isShows
            m.cinemaTabShowsBg.color = "0x172554FF"
        else
            m.cinemaTabShowsBg.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabShowsLabel <> invalid
        m.cinemaTabShowsLabel.text = "TV Shows"
        if isShowsTabFocused
            m.cinemaTabShowsLabel.color = "0xFFFFFFFF"
        else if isShows
            m.cinemaTabShowsLabel.color = "0x7DD3FCFF"
        else
            m.cinemaTabShowsLabel.color = "0x94A3B8FF"
        end if
    end if

    if m.cinemaTabTabloGroup <> invalid
        m.cinemaTabTabloGroup.visible = (m.activeShowGroup = invalid)
    end if
    if m.cinemaTabTabloBorder <> invalid
        if isTabloTabFocused
            m.cinemaTabTabloBorder.color = "0xFFFFFFFF"
        else if isTablo
            m.cinemaTabTabloBorder.color = "0x172554FF"
        else
            m.cinemaTabTabloBorder.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabTabloBg <> invalid
        if isTabloTabFocused
            m.cinemaTabTabloBg.color = "0x1E3A5FFF"
        else if isTablo
            m.cinemaTabTabloBg.color = "0x172554FF"
        else
            m.cinemaTabTabloBg.color = "0x090E1AFF"
        end if
    end if
    if m.cinemaTabTabloLabel <> invalid
        m.cinemaTabTabloLabel.text = "DVR"
        if isTabloTabFocused
            m.cinemaTabTabloLabel.color = "0xFFFFFFFF"
        else if isTablo
            m.cinemaTabTabloLabel.color = "0x7DD3FCFF"
        else
            m.cinemaTabTabloLabel.color = "0x94A3B8FF"
        end if
    end if

    if m.cinemaTabBackGroup <> invalid
        if m.activeShowGroup <> invalid
            m.cinemaTabBackGroup.visible = true
            if m.cinemaTabBackBorder <> invalid
                if isBackTabFocused then m.cinemaTabBackBorder.color = "0xFFFFFFFF" else m.cinemaTabBackBorder.color = "0x13253AFF"
            end if
            if m.cinemaTabBackBg <> invalid
                if isBackTabFocused then m.cinemaTabBackBg.color = "0x1E3A5FFF" else m.cinemaTabBackBg.color = "0x13253AFF"
            end if
            if m.cinemaTabBackLabel <> invalid
                if isBackTabFocused then m.cinemaTabBackLabel.color = "0xFFFFFFFF" else m.cinemaTabBackLabel.color = "0x7DD3FCFF"
            end if
        else
            m.cinemaTabBackGroup.visible = false
        end if
    end if

    if m.cinemaActiveCatBadge <> invalid
        m.cinemaActiveCatBadge.color = "0x94A3B8FF"
        if m.activeShowGroup <> invalid
            sCountVal = safeInt(m.activeShowGroup.seasonCount)
            eCountVal = safeInt(m.activeShowGroup.episodeCount)
            m.cinemaActiveCatBadge.text = Left(cleanAscii(m.activeShowGroup.title), 28) + "   |   " + sCountVal.ToStr() + " Seasons  (" + eCountVal.ToStr() + " Eps)"
        else if isTablo
            m.cinemaActiveCatBadge.text = tabloCnt.ToStr() + " DVR Recordings"
        else if isShows
            m.cinemaActiveCatBadge.text = showsCnt.ToStr() + " TV Series"
        else
            m.cinemaActiveCatBadge.text = moviesCnt.ToStr() + " Movies"
        end if
    end if
end sub

sub switchCinemaTab(tabName as String)
    m.cinemaActiveTab = tabName
    m.activeShowGroup = invalid
    m.activeShowSeasons = []
    if tabName = "tablo"
        m.cinemaCategories = m.tabloCategories
        m.cinemaTabCol = 2
    else if tabName = "shows"
        m.cinemaCategories = m.showCategories
        m.cinemaTabCol = 1
    else
        m.cinemaActiveTab = "movies"
        m.cinemaCategories = m.movieCategories
        m.cinemaTabCol = 0
    end if
    m.cinemaCatIndex = 0
    m.cinemaPosterIndex = 0
    applyCinemaCategoryFilter(0)
    updateCinemaPaneFocusUi()
end sub

sub updateCinemaPaneFocusUi()
    if m.cinemaHeaderAccent <> invalid
        m.cinemaHeaderAccent.color = "0x162032FF"
    end if
    updateCinemaTabHeaderUi()
    updateCinemaCategoryCardsUi()
    updateCinemaPosterShelf(m.cinemaPosterIndex)
end sub

sub updateCinemaCategoryCardsUi()
    isCatZone = (m.cinemaFocusZone = "categories")
    if m.activeShowGroup <> invalid and m.activeShowSeasons <> invalid and m.activeShowSeasons.Count() > 0
        totalS = m.activeShowSeasons.Count()
        activeIdx = m.activeSeasonIndex
        if activeIdx < 0 then activeIdx = 0
        if activeIdx >= totalS then activeIdx = totalS - 1
        winStart = Int(activeIdx / 6) * 6
        for slot = 0 to 5
            sIdx = winStart + slot
            bdr = m.top.findNode("cinemaCatCardBorder" + slot.ToStr())
            bg = m.top.findNode("cinemaCatCardBg" + slot.ToStr())
            ttl = m.top.findNode("cinemaCatCardTitle" + slot.ToStr())
            if sIdx < totalS
                sObj = m.activeShowSeasons[sIdx]
                isSel = (sIdx = activeIdx)
                epCnt = 0
                if sObj.episodes <> invalid then epCnt = sObj.episodes.Count()
                if bdr <> invalid
                    bdr.visible = true
                    if isSel and isCatZone
                        bdr.color = "0xFFFFFFFF"
                    else if isSel
                        bdr.color = "0x172554FF"
                    else
                        bdr.color = "0x0D1526FF"
                    end if
                end if
                if bg <> invalid
                    bg.visible = true
                    if isSel and isCatZone
                        bg.color = "0x1E3A5FFF"
                    else if isSel
                        bg.color = "0x172554FF"
                    else
                        bg.color = "0x0D1526FF"
                    end if
                end if
                if ttl <> invalid
                    ttl.visible = true
                    ttl.text = cleanAscii(sObj.label) + " (" + epCnt.ToStr() + ")"
                    if isSel and isCatZone
                        ttl.color = "0xFFFFFFFF"
                    else if isSel
                        ttl.color = "0x7DD3FCFF"
                    else
                        ttl.color = "0x94A3B8FF"
                    end if
                end if
            else
                if bdr <> invalid then bdr.visible = false
                if bg <> invalid then bg.visible = false
                if ttl <> invalid then ttl.visible = false
            end if
        end for
        return
    end if

    if m.cinemaCategories = invalid or m.cinemaCategories.Count() = 0 then return
    totalC = m.cinemaCategories.Count()
    activeIdx = m.cinemaCatIndex
    if activeIdx < 0 then activeIdx = 0
    if activeIdx >= totalC then activeIdx = totalC - 1
    winStart = Int(activeIdx / 6) * 6

    for slot = 0 to 5
        cIdx = winStart + slot
        bdr = m.top.findNode("cinemaCatCardBorder" + slot.ToStr())
        bg = m.top.findNode("cinemaCatCardBg" + slot.ToStr())
        ttl = m.top.findNode("cinemaCatCardTitle" + slot.ToStr())
        if cIdx < totalC
            cat = m.cinemaCategories[cIdx]
            isSel = (cIdx = activeIdx)
            matchCnt = 0
            if m.allCinemaItems <> invalid
                for each mv in m.allCinemaItems
                    if cinemaItemMatchesCat(mv, cat.id)
                        matchCnt = matchCnt + 1
                    end if
                end for
            end if
            if bdr <> invalid
                bdr.visible = true
                if isSel and isCatZone
                    bdr.color = "0xFFFFFFFF"
                else if isSel
                    bdr.color = "0x172554FF"
                else
                    bdr.color = "0x0D1526FF"
                end if
            end if
            if bg <> invalid
                bg.visible = true
                if isSel and isCatZone
                    bg.color = "0x1E3A5FFF"
                else if isSel
                    bg.color = "0x172554FF"
                else
                    bg.color = "0x0D1526FF"
                end if
            end if
            if ttl <> invalid
                ttl.visible = true
                ttl.text = cleanAscii(cat.label) + " (" + matchCnt.ToStr() + ")"
                if isSel and isCatZone
                    ttl.color = "0xFFFFFFFF"
                else if isSel
                    ttl.color = "0x7DD3FCFF"
                else
                    ttl.color = "0x94A3B8FF"
                end if
            end if
        else
            if bdr <> invalid then bdr.visible = false
            if bg <> invalid then bg.visible = false
            if ttl <> invalid then ttl.visible = false
        end if
    end for
end sub

sub enterShowSeasons(showObj as Object, showIdx as Integer)
    if showObj = invalid or showObj.episodes = invalid or showObj.episodes.Count() = 0 then return
    m.lastShowGroupIndex = showIdx
    m.activeShowGroup = showObj
    eps = showObj.episodes
    showArt = ""
    if showObj.artUrl <> invalid then showArt = showObj.artUrl
    seasons = []
    seenSeasons = {}
    seasonNums = []
    for each ep in eps
        sNum = 1
        if ep.seasonNumber <> invalid and ep.seasonNumber >= 0 then sNum = Int(ep.seasonNumber)
        sKey = sNum.ToStr()
        if not seenSeasons.DoesExist(sKey)
            seenSeasons[sKey] = true
            seasonNums.Push(sNum)
        end if
    end for
    if seasonNums.Count() > 1
        for i = 0 to seasonNums.Count() - 2
            for j = i + 1 to seasonNums.Count() - 1
                a = seasonNums[i]
                b = seasonNums[j]
                aSort = a
                bSort = b
                if aSort = 0 then aSort = 9999
                if bSort = 0 then bSort = 9999
                if bSort < aSort
                    tmp = seasonNums[i]
                    seasonNums[i] = seasonNums[j]
                    seasonNums[j] = tmp
                end if
            end for
        end for
    end if
    defaultSIdx = 0
    foundInProgSeason = false
    for idxN = 0 to seasonNums.Count() - 1
        sNum = seasonNums[idxN]
        sEps = []
        sArt = showArt
        hasInProg = false
        for each ep in eps
            epSeasonNum = 1
            if ep.seasonNumber <> invalid and ep.seasonNumber >= 0 then epSeasonNum = Int(ep.seasonNumber)
            if epSeasonNum = sNum
                sEps.Push(ep)
                if ep.inProgress = true then hasInProg = true
                if sArt = showArt and ep.artUrl <> invalid and ep.artUrl <> "" then sArt = ep.artUrl
            end if
        end for
        if hasInProg and not foundInProgSeason
            defaultSIdx = seasons.Count()
            foundInProgSeason = true
        end if
        sLbl = "Season " + sNum.ToStr()
        sMono = "S" + pad2(sNum)
        sTag = "SEASON " + sNum.ToStr()
        if sNum = 0
            sLbl = "Specials"
            sMono = "SPC"
            sTag = "SPECIALS"
        end if
        seasons.Push({
            id: "season_" + sNum.ToStr(),
            seasonNumber: sNum,
            tag: sTag,
            mono: sMono,
            label: sLbl,
            countText: sEps.Count().ToStr() + " Episodes",
            artUrl: sArt,
            episodes: sEps
        })
    end for
    if seasonNums.Count() > 1
        seasons.Push({
            id: "season_all",
            seasonNumber: -1,
            tag: "COMPLETE SERIES",
            mono: "ALL",
            label: "All Seasons",
            countText: eps.Count().ToStr() + " Episodes",
            artUrl: showArt,
            episodes: eps
        })
    end if
    m.activeShowSeasons = seasons
    m.activeSeasonIndex = defaultSIdx
    applyShowSeasonFilter(defaultSIdx)
    m.cinemaFocusZone = "posters"
    updateCinemaPaneFocusUi()
end sub

sub exitShowSeasons()
    if m.activeShowGroup = invalid then return
    m.activeShowGroup = invalid
    m.activeShowSeasons = []
    m.cinemaTabCol = 1
    applyCinemaCategoryFilter(m.cinemaCatIndex)
    if m.lastShowGroupIndex >= 0 and m.cinemaLibItems <> invalid and m.lastShowGroupIndex < m.cinemaLibItems.Count()
        m.cinemaPosterIndex = m.lastShowGroupIndex
        updateCinemaLibDetail(m.cinemaPosterIndex)
        updateCinemaPosterShelf(m.cinemaPosterIndex)
    end if
    m.cinemaFocusZone = "posters"
    updateCinemaPaneFocusUi()
end sub

sub applyShowSeasonFilter(sIdx as Integer)
    if m.activeShowGroup = invalid or m.activeShowSeasons = invalid then return
    if sIdx < 0 or sIdx >= m.activeShowSeasons.Count() then return
    m.activeSeasonIndex = sIdx
    sObj = m.activeShowSeasons[sIdx]
    eps = sObj.episodes
    m.cinemaLibItems = eps
    if m.cinemaShelfTitleLabel <> invalid
        m.cinemaShelfTitleLabel.text = Left(cleanAscii(m.activeShowGroup.title), 36) + "   -   " + cleanAscii(sObj.label)
    end if
    resumeIdx = 0
    foundResume = false
    for i = 0 to eps.Count() - 1
        ep = eps[i]
        if ep.inProgress = true and not foundResume
            resumeIdx = i
            foundResume = true
        end if
    end for
    m.cinemaPosterIndex = resumeIdx
    updateCinemaCategoryCardsUi()
    updateCinemaLibDetail(resumeIdx)
    updateCinemaPosterShelf(resumeIdx)
end sub

sub applyCinemaCategoryFilter(catIdx as Integer)
    if m.activeShowGroup <> invalid
        applyShowSeasonFilter(catIdx)
        return
    end if
    if m.cinemaCategories = invalid or catIdx < 0 or catIdx >= m.cinemaCategories.Count() then return
    cat = m.cinemaCategories[catIdx]
    m.cinemaCatIndex = catIdx
    filtered = []
    if m.allCinemaItems <> invalid
        for each mv in m.allCinemaItems
            if cinemaItemMatchesCat(mv, cat.id)
                filtered.Push(mv)
            end if
        end for
    end if
    m.cinemaLibItems = filtered
    m.cinemaPosterIndex = 0
    if m.cinemaShelfTitleLabel <> invalid
        m.cinemaShelfTitleLabel.text = cleanAscii(cat.label)
    end if
    updateCinemaCategoryCardsUi()
    updateCinemaLibDetail(0)
    updateCinemaPosterShelf(0)
end sub

sub updateCinemaPosterShelf(focusedIdx as Integer)
    total = 0
    if m.cinemaLibItems <> invalid then total = m.cinemaLibItems.Count()
    if total = 0
        m.cinemaPosterIndex = 0
        if m.cinemaShelfPosLabel <> invalid then m.cinemaShelfPosLabel.text = "0 Titles"
        for slot = 0 to 5
            bdr = m.top.findNode("cinemaCardBorder" + slot.ToStr())
            bg = m.top.findNode("cinemaCardBg" + slot.ToStr())
            artBg = m.top.findNode("cinemaCardArtBg" + slot.ToStr())
            mono = m.top.findNode("cinemaCardMono" + slot.ToStr())
            pst = m.top.findNode("cinemaCardPoster" + slot.ToStr())
            pillBg = m.top.findNode("cinemaCardPillBg" + slot.ToStr())
            pTrk = m.top.findNode("cinemaCardProgTrack" + slot.ToStr())
            pFil = m.top.findNode("cinemaCardProgFill" + slot.ToStr())
            bdg = m.top.findNode("cinemaCardBadge" + slot.ToStr())
            ttl = m.top.findNode("cinemaCardTitle" + slot.ToStr())
            gnr = m.top.findNode("cinemaCardGenre" + slot.ToStr())
            stt = m.top.findNode("cinemaCardState" + slot.ToStr())
            if bdr <> invalid then bdr.visible = false
            if bg <> invalid then bg.visible = false
            if artBg <> invalid then artBg.visible = false
            if pillBg <> invalid then pillBg.visible = false
            if mono <> invalid then mono.visible = false
            if pst <> invalid then pst.visible = false
            if pTrk <> invalid then pTrk.visible = false
            if pFil <> invalid then pFil.visible = false
            if bdg <> invalid then bdg.visible = false
            if ttl <> invalid then ttl.visible = false
            if gnr <> invalid then gnr.visible = false
            if stt <> invalid then stt.visible = false
        end for
        return
    end if

    if focusedIdx < 0 then focusedIdx = 0
    if focusedIdx >= total then focusedIdx = total - 1
    m.cinemaPosterIndex = focusedIdx
    isPostersZone = (m.cinemaFocusZone = "posters")
    winStart = Int(focusedIdx / 6) * 6
    rowNum = Int(focusedIdx / 6) + 1
    totalRows = Int((total + 5) / 6)
    if m.cinemaShelfPosLabel <> invalid
        m.cinemaShelfPosLabel.text = (focusedIdx + 1).ToStr() + " of " + total.ToStr() + "   |   Row " + rowNum.ToStr() + " of " + totalRows.ToStr()
    end if

    for slot = 0 to 5
        itemIdx = winStart + slot
        bdr = m.top.findNode("cinemaCardBorder" + slot.ToStr())
        bg = m.top.findNode("cinemaCardBg" + slot.ToStr())
        artBg = m.top.findNode("cinemaCardArtBg" + slot.ToStr())
        mono = m.top.findNode("cinemaCardMono" + slot.ToStr())
        pst = m.top.findNode("cinemaCardPoster" + slot.ToStr())
        pillBg = m.top.findNode("cinemaCardPillBg" + slot.ToStr())
        pTrk = m.top.findNode("cinemaCardProgTrack" + slot.ToStr())
        pFil = m.top.findNode("cinemaCardProgFill" + slot.ToStr())
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
                if isFocused and isPostersZone
                    bdr.color = "0xFFFFFFFF"
                else if isFocused
                    bdr.color = "0x172554FF"
                else
                    bdr.color = "0x0D1422FF"
                end if
            end if
            if bg <> invalid
                bg.visible = true
                if isFocused and isPostersZone
                    bg.color = "0x16243EFF"
                else if isFocused
                    bg.color = "0x111C30FF"
                else
                    bg.color = "0x0D1422FF"
                end if
            end if
            if artBg <> invalid
                artBg.visible = true
                artBg.color = info.bgCol
            end if
            if pillBg <> invalid then pillBg.visible = true
            if mono <> invalid
                mono.visible = true
                if mv.episodeCode <> invalid and mv.episodeCode <> "" and m.activeShowGroup <> invalid
                    mono.text = cleanAscii(mv.episodeCode)
                else
                    mono.text = info.monogram
                end if
            end if
            if pst <> invalid
                pst.visible = true
                if mv.artUrl <> invalid and mv.artUrl <> ""
                    pst.uri = mv.artUrl
                else if m.activeShowGroup <> invalid and m.activeShowGroup.artUrl <> invalid and m.activeShowGroup.artUrl <> ""
                    pst.uri = m.activeShowGroup.artUrl
                else
                    pst.uri = ""
                end if
            end if
            pct = 0
            if mv.progressPct <> invalid then pct = Int(mv.progressPct)
            if mv.completed = true then pct = 100
            if pTrk <> invalid and pFil <> invalid
                if pct > 0
                    pTrk.visible = true
                    pFil.visible = true
                    w = Int((pct / 100.0) * 276)
                    if w < 12 then w = 12
                    if w > 276 then w = 276
                    pFil.width = w
                    if mv.completed = true then pFil.color = "0x22C55EFF" else pFil.color = "0x38BDF8FF"
                else
                    pTrk.visible = false
                    pFil.visible = false
                end if
            end if
            if bdg <> invalid
                bdg.visible = true
                if m.activeShowGroup <> invalid and mv.episodeCode <> invalid
                    bdg.text = cleanAscii(mv.episodeCode)
                else if mv.isShowGroup = true and mv.seasonCount <> invalid
                    bdg.text = mv.seasonCount.ToStr() + "S | " + mv.episodeCount.ToStr() + " Eps"
                else
                    yrTxt = "HD"
                    if mv.year <> invalid then yrTxt = mv.year.ToStr()
                    if mv.rating <> invalid and mv.rating > 0
                        bdg.text = yrTxt + " | * " + mv.rating.ToStr()
                    else
                        bdg.text = yrTxt
                    end if
                end if
            end if
            if ttl <> invalid
                ttl.visible = true
                if m.activeShowGroup <> invalid and mv.episodeTitle <> invalid and mv.episodeTitle <> ""
                    ttl.text = Left(cleanAscii(mv.episodeTitle), 28)
                else
                    ttl.text = Left(cleanAscii(mv.title), 28)
                end if
                if isFocused and isPostersZone then ttl.color = "0xFFFFFFFF" else ttl.color = "0xE2E8F0FF"
            end if
            if gnr <> invalid
                gnr.visible = true
                gnr.color = "0x94A3B8FF"
                if m.activeShowGroup <> invalid and mv.airdate <> invalid and mv.airdate <> ""
                    gnr.text = cleanAscii(mv.episodeCode) + "  |  " + Left(cleanAscii(mv.airdate), 10)
                else if mv.network <> invalid and mv.network <> ""
                    gnr.text = Left(cleanAscii(mv.network), 26)
                else if info.franchise <> ""
                    gnr.text = Left(info.franchise, 26)
                else
                    gnr.text = Left(info.primaryGenre, 26)
                end if
            end if
            if stt <> invalid
                stt.visible = true
                if mv.inProgress = true and mv.progressPct <> invalid
                    stt.text = "Resume " + mv.progressPct.ToStr() + "%"
                    stt.color = "0x38BDF8FF"
                else if mv.completed = true
                    stt.text = "Watched"
                    stt.color = "0x34D399FF"
                else if mv.isShowGroup = true and m.activeShowGroup = invalid
                    stt.text = mv.seasonCount.ToStr() + " Seasons  |  " + mv.episodeCount.ToStr() + " Eps"
                    if isFocused and isPostersZone then stt.color = "0x7DD3FCFF" else stt.color = "0x64748BFF"
                else
                    stt.text = info.resStr + "  |  " + info.fmtStr
                    if isFocused and isPostersZone then stt.color = "0x7DD3FCFF" else stt.color = "0x64748BFF"
                end if
            end if
        else
            if bdr <> invalid then bdr.visible = false
            if bg <> invalid then bg.visible = false
            if artBg <> invalid then artBg.visible = false
            if pillBg <> invalid then pillBg.visible = false
            if mono <> invalid then mono.visible = false
            if pst <> invalid then pst.visible = false
            if pTrk <> invalid then pTrk.visible = false
            if pFil <> invalid then pFil.visible = false
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
        lastId = cleanAscii(libObj.items[libObj.items.Count() - 1].id)
        newHash = libObj.items.Count().ToStr() + ":" + cleanAscii(libObj.items[0].id) + ":" + lastId
        if m.cinemaLibHash <> newHash
            m.cinemaLibHash = newHash
            m.allCinemaItems = libObj.items
            if libObj.defaultTab <> invalid and libObj.defaultTab <> "" and m.lastAppliedDefaultTab = ""
                m.lastAppliedDefaultTab = cleanAscii(libObj.defaultTab)
                switchCinemaTab(m.lastAppliedDefaultTab)
            else
                applyCinemaCategoryFilter(m.cinemaCatIndex)
                updateCinemaTabHeaderUi()
            end if
            updateWallLauncherUi()
        end if
    end if
    if libObj <> invalid and libObj.defaultTab <> invalid and libObj.defaultTab <> ""
        dTab = cleanAscii(libObj.defaultTab)
        if m.lastAppliedDefaultTab <> dTab
            m.lastAppliedDefaultTab = dTab
            switchCinemaTab(dTab)
        end if
    end if
    if wasActive <> true and m.cinemaVideoActive <> true
        m.cinemaFocusZone = "posters"
        m.top.setFocus(true)
        updateCinemaPaneFocusUi()
    end if
end sub

sub hideCinemaLibrary()
    if m.cinemaLibraryActive <> true then return
    m.cinemaLibraryActive = false
    if m.cinemaLibraryGroup <> invalid then m.cinemaLibraryGroup.visible = false
    if m.cinemaVideoActive <> true
        m.top.setFocus(true)
        updateWallLauncherUi()
    end if
end sub

sub updateCinemaLibDetail(idx as Integer)
    if m.cinemaLibItems = invalid or m.cinemaLibItems.Count() = 0
        if m.cinemaHeroEyebrow <> invalid then m.cinemaHeroEyebrow.text = "LIBRARY FILTER"
        if m.cinemaLibDetailTitle <> invalid then m.cinemaLibDetailTitle.text = "No Matching Titles"
        if m.cinemaLibDetailMeta <> invalid then m.cinemaLibDetailMeta.text = "Use Left / Right on the filter strip to choose another category."
        if m.cinemaHeroSynopsis <> invalid then m.cinemaHeroSynopsis.text = ""
        if m.cinemaLibDetailSub <> invalid then m.cinemaLibDetailSub.text = ""
        if m.cinemaLibPoster <> invalid then m.cinemaLibPoster.uri = ""
        if m.cinemaHeroPosterMonogram <> invalid then m.cinemaHeroPosterMonogram.text = "--"
        if m.cinemaHeroProgTrack <> invalid then m.cinemaHeroProgTrack.visible = false
        if m.cinemaHeroProgFill <> invalid then m.cinemaHeroProgFill.visible = false
        if m.cinemaHeroThumbGroup <> invalid then m.cinemaHeroThumbGroup.visible = false
        return
    end if
    if idx < 0 or idx >= m.cinemaLibItems.Count() then return
    mv = m.cinemaLibItems[idx]
    info = cinemaClassifyItem(mv)
    titleClean = cleanAscii(mv.title)
    if m.activeShowGroup <> invalid and mv.episodeCode <> invalid and mv.episodeTitle <> invalid
        titleClean = cleanAscii(mv.episodeCode) + " - " + cleanAscii(mv.episodeTitle)
    end if
    if m.cinemaLibDetailTitle <> invalid then m.cinemaLibDetailTitle.text = Left(titleClean, 52)

    if m.cinemaHeroEyebrow <> invalid
        if info.isTablo
            netUpper = "OTA DVR"
            if mv.network <> invalid and mv.network <> "" then netUpper = UCase(cleanAscii(mv.network))
            m.cinemaHeroEyebrow.text = "TABLO DVR   |   " + netUpper
        else if m.activeShowGroup <> invalid
            sNum = 1
            eNum = 1
            if mv.seasonNumber <> invalid then sNum = mv.seasonNumber
            if mv.episodeNumber <> invalid then eNum = mv.episodeNumber
            m.cinemaHeroEyebrow.text = UCase(cleanAscii(m.activeShowGroup.title)) + "   |   SEASON " + sNum.ToStr() + "   |   EPISODE " + eNum.ToStr()
        else if mv.isShowGroup = true
            netUpper = "TV SERIES"
            if mv.network <> invalid and mv.network <> "" then netUpper = UCase(cleanAscii(mv.network))
            m.cinemaHeroEyebrow.text = netUpper + "   |   " + UCase(info.primaryGenre)
        else if info.franchise <> ""
            m.cinemaHeroEyebrow.text = UCase(info.franchise)
        else
            m.cinemaHeroEyebrow.text = UCase(info.primaryGenre)
        end if
    end if

    if m.cinemaHeroPosterFallbackBg <> invalid then m.cinemaHeroPosterFallbackBg.color = info.bgCol
    if m.cinemaHeroPosterMonogram <> invalid then m.cinemaHeroPosterMonogram.text = info.monogram

    if m.cinemaLibPoster <> invalid
        if info.isTablo and mv.coverUrl <> invalid and mv.coverUrl <> ""
            m.cinemaLibPoster.uri = mv.coverUrl
        else if mv.artUrl <> invalid and mv.artUrl <> ""
            m.cinemaLibPoster.uri = mv.artUrl
        else if m.activeShowGroup <> invalid and m.activeShowGroup.artUrl <> invalid and m.activeShowGroup.artUrl <> ""
            m.cinemaLibPoster.uri = m.activeShowGroup.artUrl
        else
            m.cinemaLibPoster.uri = ""
        end if
    end if

    if m.cinemaHeroThumbGroup <> invalid
        if info.isTablo and mv.artUrl <> invalid and mv.artUrl <> ""
            m.cinemaHeroThumbGroup.visible = true
            if m.cinemaHeroThumbPoster <> invalid then m.cinemaHeroThumbPoster.uri = mv.artUrl
            if m.cinemaHeroThumbCaption <> invalid
                m.cinemaHeroThumbCaption.text = Left(cleanAscii(mv.network), 24) + "  |  " + Left(cleanAscii(mv.qualityBadge), 18)
            end if
        else
            m.cinemaHeroThumbGroup.visible = false
        end if
    end if

    heroPct = 0
    if mv.progressPct <> invalid then heroPct = Int(mv.progressPct)
    if mv.completed = true then heroPct = 100
    if m.cinemaHeroProgTrack <> invalid and m.cinemaHeroProgFill <> invalid
        if heroPct > 0
            m.cinemaHeroProgTrack.visible = true
            m.cinemaHeroProgFill.visible = true
            hw = Int((heroPct / 100.0) * 152)
            if hw < 10 then hw = 10
            if hw > 152 then hw = 152
            m.cinemaHeroProgFill.width = hw
            if mv.completed = true then m.cinemaHeroProgFill.color = "0x22C55EFF" else m.cinemaHeroProgFill.color = "0x38BDF8FF"
        else
            m.cinemaHeroProgTrack.visible = false
            m.cinemaHeroProgFill.visible = false
        end if
    end if

    yrStr = ""
    if mv.year <> invalid and mv.year.ToStr() <> "" then yrStr = mv.year.ToStr()
    if m.cinemaLibDetailMeta <> invalid
        if m.activeShowGroup <> invalid
            airStr = ""
            if mv.airdate <> invalid and mv.airdate <> "" then airStr = "   |   Aired " + cleanAscii(mv.airdate)
            m.cinemaLibDetailMeta.text = cleanAscii(m.activeShowGroup.title) + "   |   " + cleanAscii(mv.episodeCode) + airStr + "   |   " + info.qualBadge
        else if mv.isShowGroup = true
            upNextStr = "Up Next: " + cleanAscii(mv.episodeCode)
            if mv.episodeTitle <> invalid and mv.episodeTitle <> "" then upNextStr = upNextStr + " (" + Left(cleanAscii(mv.episodeTitle), 28) + ")"
            netInfo = ""
            if mv.network <> invalid and mv.network <> "" then netInfo = cleanAscii(mv.network) + "   |   "
            m.cinemaLibDetailMeta.text = netInfo + mv.seasonCount.ToStr() + " Seasons   |   " + mv.episodeCount.ToStr() + " Episodes   |   " + upNextStr
        else
            metaParts = []
            if yrStr <> "" then metaParts.Push(yrStr)
            if mv.rating <> invalid and mv.rating > 0 then metaParts.Push("* " + mv.rating.ToStr() + "/10")
            metaParts.Push(info.qualBadge)
            if mv.genre <> invalid and mv.genre <> ""
                metaParts.Push(Left(cleanAscii(mv.genre), 32))
            else
                metaParts.Push(info.primaryGenre)
            end if
            if mv.director <> invalid and mv.director <> "" then metaParts.Push("Dir. " + Left(cleanAscii(mv.director), 26))
            metaLine = ""
            for mIdx = 0 to metaParts.Count() - 1
                if mIdx > 0 then metaLine = metaLine + "   |   "
                metaLine = metaLine + metaParts[mIdx]
            end for
            m.cinemaLibDetailMeta.text = metaLine
        end if
    end if

    if m.cinemaHeroSynopsis <> invalid
        ov = cleanAscii(mv.overview)
        if ov = "" and m.activeShowGroup <> invalid then ov = cleanAscii(m.activeShowGroup.overview)
        if ov <> ""
            m.cinemaHeroSynopsis.text = Left(ov, 290)
        else if mv.isShowGroup = true
            m.cinemaHeroSynopsis.text = cleanAscii(mv.title) + " (" + mv.seasonCount.ToStr() + " Seasons, " + mv.episodeCount.ToStr() + " Episodes). Press OK to browse seasons and episodes, or Play to start " + cleanAscii(mv.episodeCode) + "."
        else
            m.cinemaHeroSynopsis.text = "Ready to stream in " + info.qualBadge + " over your local network."
        end if
    end if

    if m.cinemaLibDetailSub <> invalid
        if mv.isShowGroup = true and m.activeShowGroup = invalid
            m.cinemaLibDetailSub.text = "Press OK to Browse Seasons   |   Press Play to Watch " + cleanAscii(mv.episodeCode)
        else if mv.inProgress = true and mv.positionSec <> invalid and mv.positionSec > 0
            rMin = Int(mv.positionSec / 60)
            rSec = Int(mv.positionSec) mod 60
            m.cinemaLibDetailSub.text = "Resume from " + rMin.ToStr() + "m " + pad2(rSec) + "s (" + heroPct.ToStr() + "%)   |   " + info.fmtStr + " Direct Play"
        else if mv.completed = true
            m.cinemaLibDetailSub.text = "Watched   |   Press OK to Watch Again   |   " + info.fmtStr + " Direct Play"
        else
            m.cinemaLibDetailSub.text = "Press OK to Watch   |   " + info.fmtStr + " Direct Play"
        end if
    end if

    if m.cinemaLibFooter <> invalid
        if m.activeShowGroup <> invalid
            m.cinemaLibFooter.text = "OK Play Episode   |   Up Seasons & Tabs   |   Back All TV Shows"
        else if mv.isShowGroup = true
            m.cinemaLibFooter.text = "OK Browse Seasons   |   Play Quick Start   |   Up Filters & Tabs   |   * Switch Tab"
        else
            m.cinemaLibFooter.text = "OK Watch   |   Up/Down Browse Grid   |   FF/Rew Jump 3 Rows   |   * Switch Tab"
        end if
    end if
end sub

sub playCinemaItemAtIndex(idx as Integer)
    if m.cinemaLibItems = invalid or idx < 0 or idx >= m.cinemaLibItems.Count() then return
    mv = m.cinemaLibItems[idx]
    if mv = invalid or mv.streamUrl = invalid or mv.streamUrl = "" then return
    if m.cinemaLibFooter <> invalid
        m.cinemaLibFooter.text = "Starting full-screen playback: " + cleanAscii(mv.title) + "..."
    end if
    m.localVideoPlaying = true
    trackId = ""
    if mv.repTrackId <> invalid and mv.repTrackId <> ""
        trackId = cleanAscii(mv.repTrackId)
    else if mv.id <> invalid
        trackId = cleanAscii(mv.id)
    end if
    m.currentPlayingTrackId = trackId
    m.currentPlayingItem = mv
    m.currentPlayingHlsUrl = cleanAscii(mv.hlsUrl)
    m.triedHlsFallback = false
    fmt = "mp4"
    if mv.streamFormat <> invalid and mv.streamFormat <> ""
        fmt = LCase(mv.streamFormat.ToStr())
    else if Instr(1, LCase(mv.streamUrl.ToStr()), ".m3u8") > 0
        fmt = "hls"
    else if Instr(1, LCase(mv.streamUrl.ToStr()), ".mkv") > 0
        fmt = "mkv"
    end if
    resumeSec = 0
    if mv.inProgress = true and mv.positionSec <> invalid and mv.positionSec > 5
        resumeSec = Int(mv.positionSec)
    end if
    playTitle = cleanAscii(mv.title)
    if m.activeShowGroup <> invalid and mv.episodeCode <> invalid
        playTitle = cleanAscii(m.activeShowGroup.title) + " - " + cleanAscii(mv.episodeCode) + " " + cleanAscii(mv.episodeTitle)
    end if
    m.currentPlayingTitle = playTitle
    m.currentPlayingStartSec = resumeSec
    if m.dashTask <> invalid
        m.dashTask.castActionUrl = "${progressBaseUrl}/api/roku-cast-clear?loadKey=all&seq=" + m.tickCount.ToStr()
    end if
    playCinemaVideo({
        active: true,
        isLocal: true,
        loadKey: "remote-" + idx.ToStr() + "-" + m.tickCount.ToStr(),
        mediaUrl: mv.streamUrl,
        streamFormat: fmt,
        title: playTitle,
        startAt: resumeSec,
        paused: false
    })
end sub

sub onCinemaVideoState()
    if m.switchingCinemaLoad = true then return
    if m.cinemaVideo = invalid or m.cinemaVideoActive <> true then return
    st = m.cinemaVideo.state
    if st = "playing" or st = "buffering" or st = "paused"
        if m.top.hasFocus() <> true
            m.top.setFocus(true)
        end if
        if m.playerOsdOpen = true then updatePlayerOsdHeaderAndScrubber()
        return
    end if
    if st = "error" and m.triedHlsFallback <> true and m.currentPlayingHlsUrl <> invalid and m.currentPlayingHlsUrl <> ""
        m.triedHlsFallback = true
        playCinemaVideo({
            active: true,
            isLocal: m.localVideoPlaying,
            loadKey: "hls-fallback-" + m.tickCount.ToStr(),
            mediaUrl: m.currentPlayingHlsUrl,
            streamFormat: "hls",
            title: m.currentPlayingTitle,
            startAt: m.currentPlayingStartSec,
            paused: false
        })
        return
    end if
    if st = "finished" or st = "error"
        if m.dashTask <> invalid
            if st = "finished" and m.currentPlayingTrackId <> ""
                m.dashTask.progressUrl = "${progressBaseUrl}/api/tv-progress?id=" + m.currentPlayingTrackId + "&watched=true&seq=" + m.tickCount.ToStr()
                if m.currentPlayingItem <> invalid
                    m.currentPlayingItem.completed = true
                    m.currentPlayingItem.inProgress = false
                    m.currentPlayingItem.progressPct = 100
                    m.currentPlayingItem.positionSec = 0
                end if
            end if
            m.dashTask.castActionUrl = "${progressBaseUrl}/api/roku-cast-clear?loadKey=all&seq=" + m.tickCount.ToStr()
        end if
        m.currentPlayingTrackId = ""
        m.currentPlayingItem = invalid
        if m.lastRemoteCastKey <> "" then m.dismissedCinemaLoadKey = m.lastRemoteCastKey else m.dismissedCinemaLoadKey = m.lastCinemaLoadKey
        m.localVideoPlaying = false
        m.localLibraryOpened = true
        stopCinemaVideo()
        if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
            showCinemaLibrary(m.latestCinemaLibrary)
        end if
        m.cinemaFocusZone = "posters"
        m.top.setFocus(true)
        updateCinemaPaneFocusUi()
    end if
end sub

sub onPayloadUpdated()
    raw = m.dashTask.payloadJson
    if raw = "" then return
    json = ParseJson(raw)
    if json = invalid then return
    if json.cinemaLibrary <> invalid and json.cinemaLibrary.items <> invalid
        if m.bundledTabloItems <> invalid and m.bundledTabloItems.Count() > 0
            hasTabloInUpdate = false
            for each upIt in json.cinemaLibrary.items
                if upIt <> invalid and ((upIt.isTablo = true) or (upIt.mediaType <> invalid and upIt.mediaType = "tablo"))
                    hasTabloInUpdate = true
                    exit for
                end if
            end for
            if not hasTabloInUpdate
                for each tbIt in m.bundledTabloItems
                    json.cinemaLibrary.items.Push(tbIt)
                end for
            end if
        end if
        m.latestCinemaLibrary = json.cinemaLibrary
    end if
    if json.appCast <> invalid and json.appCast.active = true and json.appCast.frameUrl <> invalid
        if m.cinemaVideoActive = true then stopCinemaVideo()
        if m.cinemaLibraryActive = true then hideCinemaLibrary()
        showAppCastFrame(json.appCast.frameUrl)
        if json.appCast.narration <> invalid then playAppCastAudio(json.appCast.narration)
        return
    end if
    if json.cinemaLibrary <> invalid and json.cinemaLibrary.active = true
        hideAppCastFrames()
        showCinemaLibrary(json.cinemaLibrary)
    else if json.unchanged <> true and m.cinemaLibraryActive = true and m.localLibraryOpened <> true
        hideCinemaLibrary()
    end if
    if json.cinemaCast <> invalid and json.cinemaCast.active = true and json.cinemaCast.mediaUrl <> invalid
        cKey = ""
        if json.cinemaCast.loadKey <> invalid then cKey = json.cinemaCast.loadKey.ToStr() else cKey = json.cinemaCast.mediaUrl.ToStr()
        if cKey <> "" and cKey <> m.dismissedCinemaLoadKey
            if cKey <> m.lastRemoteCastKey
                m.lastRemoteCastKey = cKey
                m.localLibraryOpened = true
                hideAppCastFrames()
                if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
                    showCinemaLibrary(m.latestCinemaLibrary)
                end if
                playCinemaVideo(json.cinemaCast)
                return
            else if m.localVideoPlaying <> true and m.cinemaVideoActive = true
                playCinemaVideo(json.cinemaCast)
                return
            end if
        end if
    else if m.cinemaVideoActive = true and m.localVideoPlaying <> true
        stopCinemaVideo()
    end if
    if m.cinemaLibraryActive = true
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
                    if isRun then st.color = "0x38BDF8FF" else st.color = "0x10B981FF"
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
                    if md.id <> invalid
                        maNode.text = "Last queued: " + Left(cleanAscii(md.title), 36) + " (" + cleanAscii(md.output) + ")"
                    else
                        maNode.text = "Open Audio Player to start listening"
                    end if
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
                    if accEmail = invalid then accEmail = "you@example.com"
                    isSecond = (ev.color <> invalid and LCase(cleanAscii(ev.color)) = "#10b981")
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

sub launchWallCard(idx as Integer)
    if m.wallCards = invalid or idx < 0 or idx >= m.wallCards.Count() then return
    t = m.wallCards[idx]
    if t.id = "movie-player" or t.id = "tv-shows" or t.id = "tablo-dvr"
        m.localLibraryOpened = true
        if m.latestCinemaLibrary <> invalid
            showCinemaLibrary(m.latestCinemaLibrary)
        else
            showCinemaLibrary({ active: true, items: [] })
        end if
        if t.id = "tablo-dvr"
            switchCinemaTab("tablo")
        else if t.id = "tv-shows"
            switchCinemaTab("shows")
        else
            switchCinemaTab("movies")
        end if
        m.cinemaFocusZone = "posters"
        updateCinemaPaneFocusUi()
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
    if m.statusFooter <> invalid
        m.statusFooter.text = "Active Wallboard Experience: " + t.title
    end if
end sub

sub initPlaybackContextForCurrentTrack()
    m.playbackMeta = invalid
    m.subtitleCues = []
    m.cuesExtracting = false
    m.lastCueIdx = -1
    m.activeAudioChoiceIdx = 0
    m.captionChoices = [
        { kind: "off", label: "Captions Off", trackIndex: -1 },
        { kind: "native_cc", label: "Broadcast / Stream CC", trackIndex: -2 }
    ]
    if m.captionsEnabled = true
        m.captionChoiceIdx = 1
    else
        m.captionChoiceIdx = 0
    end if
    m.playingShowGroup = invalid
    m.playingShowGroupIdx = -1
    m.playingEpisodeObj = invalid
    m.playingEpFlatIndex = -1
    m.osdSeasonsList = []
    m.osdSeasonEps = []
    m.osdBrowseSeasonIdx = 0
    m.osdEpFocusIdx = 0

    allSource = m.allCinemaItems
    if (allSource = invalid or allSource.Count() = 0) and m.latestCinemaLibrary <> invalid and m.latestCinemaLibrary.items <> invalid
        allSource = m.latestCinemaLibrary.items
    end if

    tid = m.currentPlayingTrackId
    if allSource <> invalid and allSource.Count() > 0
        for sIdx = 0 to allSource.Count() - 1
            cand = allSource[sIdx]
            if cand <> invalid and cand.isShowGroup = true and cand.episodes <> invalid and cand.episodes.Count() > 0
                if m.activeShowGroup <> invalid and cleanAscii(cand.id) = cleanAscii(m.activeShowGroup.id)
                    m.playingShowGroup = cand
                    m.playingShowGroupIdx = sIdx
                end if
                for eIdx = 0 to cand.episodes.Count() - 1
                    epItem = cand.episodes[eIdx]
                    if epItem <> invalid and tid <> "" and (cleanAscii(epItem.id) = tid or cleanAscii(epItem.repTrackId) = tid)
                        m.playingShowGroup = cand
                        m.playingShowGroupIdx = sIdx
                        m.playingEpisodeObj = epItem
                        m.playingEpFlatIndex = eIdx
                        if m.currentPlayingItem = invalid or m.currentPlayingItem.isShowGroup = true
                            m.currentPlayingItem = epItem
                        end if
                        exit for
                    end if
                end for
                if m.playingEpisodeObj <> invalid then exit for
            else if cand <> invalid and tid <> "" and (cleanAscii(cand.id) = tid or cleanAscii(cand.repTrackId) = tid)
                if m.currentPlayingItem = invalid
                    m.currentPlayingItem = cand
                end if
            end if
        end for
    end if

    if m.playingShowGroup <> invalid
        targetSNum = 1
        if m.playingEpisodeObj <> invalid and m.playingEpisodeObj.seasonNumber <> invalid
            targetSNum = safeInt(m.playingEpisodeObj.seasonNumber)
        end if
        buildPlayerSeasonsForShow(m.playingShowGroup, targetSNum)
    else if allSource <> invalid
        relMovies = []
        curGenre = ""
        if m.currentPlayingItem <> invalid and m.currentPlayingItem.genre <> invalid
            curGenre = LCase(cleanAscii(m.currentPlayingItem.genre))
        end if
        for each mvCand in allSource
            if mvCand <> invalid and mvCand.isShowGroup <> true and mvCand.streamUrl <> invalid and mvCand.streamUrl <> ""
                if curGenre = "" or Instr(1, LCase(cleanAscii(mvCand.genre)), Left(curGenre, 5)) > 0 or relMovies.Count() < 12
                    relMovies.Push(mvCand)
                end if
                if relMovies.Count() >= 24 then exit for
            end if
        end for
        m.osdSeasonEps = relMovies
        m.osdSeasonsList = [{ seasonNumber: 1, label: "Related Films", episodes: relMovies }]
        m.osdBrowseSeasonIdx = 0
        m.osdEpFocusIdx = 0
        for rIdx = 0 to relMovies.Count() - 1
            if tid <> "" and cleanAscii(relMovies[rIdx].id) = tid
                m.osdEpFocusIdx = rIdx
                exit for
            end if
        end for
    end if

    isTabloStream = false
    if m.currentPlayingItem <> invalid and (m.currentPlayingItem.isTablo = true or cleanAscii(m.currentPlayingItem.mediaType) = "tablo")
        isTabloStream = true
    end if
    if Instr(1, LCase(m.currentPlayingMediaUrl), "/api/tablo/") > 0 then isTabloStream = true

    if m.dashTask <> invalid and tid <> "" and not isTabloStream
        m.dashTask.metaRequestUrl = "${progressBaseUrl}/api/roku-playback-meta/" + tid + "?seq=" + m.tickCount.ToStr()
    end if
end sub

sub buildPlayerSeasonsForShow(showObj as Object, targetSeasonNum as Integer)
    m.osdSeasonsList = []
    m.osdSeasonEps = []
    if showObj = invalid or showObj.episodes = invalid or showObj.episodes.Count() = 0 then return
    eps = showObj.episodes
    seenS = {}
    sNums = []
    for each ep in eps
        sn = 1
        if ep.seasonNumber <> invalid and safeInt(ep.seasonNumber) >= 0 then sn = safeInt(ep.seasonNumber)
        sk = sn.ToStr()
        if not seenS.DoesExist(sk)
            seenS[sk] = true
            sNums.Push(sn)
        end if
    end for
    if sNums.Count() > 1
        for i = 0 to sNums.Count() - 2
            for j = i + 1 to sNums.Count() - 1
                if sNums[j] < sNums[i]
                    tmpS = sNums[i]
                    sNums[i] = sNums[j]
                    sNums[j] = tmpS
                end if
            end for
        end for
    end if
    matchBrowseIdx = 0
    for idxS = 0 to sNums.Count() - 1
        snVal = sNums[idxS]
        sEpArr = []
        for each ep in eps
            epSn = 1
            if ep.seasonNumber <> invalid and safeInt(ep.seasonNumber) >= 0 then epSn = safeInt(ep.seasonNumber)
            if epSn = snVal then sEpArr.Push(ep)
        end for
        sTitle = "Season " + snVal.ToStr()
        if snVal = 0 then sTitle = "Specials"
        m.osdSeasonsList.Push({
            seasonNumber: snVal,
            label: sTitle,
            episodes: sEpArr
        })
        if snVal = targetSeasonNum then matchBrowseIdx = idxS
    end for
    applyPlayerBrowseSeason(matchBrowseIdx)
end sub

sub applyPlayerBrowseSeason(browseIdx as Integer)
    if m.osdSeasonsList = invalid or m.osdSeasonsList.Count() = 0 then return
    if browseIdx < 0 then browseIdx = m.osdSeasonsList.Count() - 1
    if browseIdx >= m.osdSeasonsList.Count() then browseIdx = 0
    m.osdBrowseSeasonIdx = browseIdx
    sEntry = m.osdSeasonsList[browseIdx]
    m.osdSeasonEps = sEntry.episodes
    m.osdEpFocusIdx = 0
    if m.osdSeasonEps <> invalid and m.osdSeasonEps.Count() > 0 and m.currentPlayingTrackId <> ""
        for i = 0 to m.osdSeasonEps.Count() - 1
            if cleanAscii(m.osdSeasonEps[i].id) = m.currentPlayingTrackId
                m.osdEpFocusIdx = i
                exit for
            end if
        end for
    end if
end sub

sub onPlaybackMetaLoaded()
    if m.dashTask = invalid then return
    rawMeta = m.dashTask.playbackMetaJson
    if rawMeta = "" then return
    parsed = ParseJson(rawMeta)
    if parsed = invalid or parsed.ok <> true then return
    if m.currentPlayingTrackId <> "" and parsed.id <> invalid and cleanAscii(parsed.id) <> m.currentPlayingTrackId
        return
    end if
    m.playbackMeta = parsed

    choices = [{ kind: "off", label: "Captions Off", trackIndex: -1 }]
    if parsed.subtitleTracks <> invalid and parsed.subtitleTracks.Count() > 0
        for each st in parsed.subtitleTracks
            choices.Push({
                kind: "server",
                label: cleanAscii(st.label),
                trackIndex: safeInt(st.trackIndex),
                srtUrl: cleanAscii(st.srtUrl)
            })
        end for
    end if
    choices.Push({ kind: "native_cc", label: "Broadcast / Stream CC", trackIndex: -2 })
    m.captionChoices = choices

    if parsed.cues <> invalid and parsed.cuesReady = true
        m.subtitleCues = parsed.cues
        m.cuesExtracting = false
        m.lastCueIdx = -1
    else if parsed.cuesExtracting = true
        m.cuesExtracting = true
    else
        m.cuesExtracting = false
    end if

    if m.captionsEnabled = true
        matchedIdx = 0
        if parsed.cueTrackIndex <> invalid and safeInt(parsed.cueTrackIndex) >= 0
            wantTrk = safeInt(parsed.cueTrackIndex)
            for cIdx = 1 to m.captionChoices.Count() - 1
                if m.captionChoices[cIdx].kind = "server" and m.captionChoices[cIdx].trackIndex = wantTrk
                    matchedIdx = cIdx
                    exit for
                end if
            end for
        end if
        if matchedIdx = 0 and m.captionChoices.Count() > 1
            matchedIdx = 1
        end if
        m.captionChoiceIdx = matchedIdx
    else
        m.captionChoiceIdx = 0
    end if

    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

function findCueIdxAtTime(tSec as Float) as Integer
    totalC = 0
    if m.subtitleCues <> invalid then totalC = m.subtitleCues.Count()
    if totalC = 0 then return -1

    if m.lastCueIdx >= 0 and m.lastCueIdx < totalC
        curC = m.subtitleCues[m.lastCueIdx]
        if tSec >= safeFloat(curC.s) and tSec <= safeFloat(curC.e)
            return m.lastCueIdx
        end if
        if m.lastCueIdx + 1 < totalC
            nxtC = m.subtitleCues[m.lastCueIdx + 1]
            if tSec >= safeFloat(nxtC.s) and tSec <= safeFloat(nxtC.e)
                m.lastCueIdx = m.lastCueIdx + 1
                return m.lastCueIdx
            end if
        end if
    end if

    lo = 0
    hi = totalC - 1
    while lo <= hi
        midIdx = Int((lo + hi) / 2)
        cObj = m.subtitleCues[midIdx]
        cs = safeFloat(cObj.s)
        ce = safeFloat(cObj.e)
        if tSec < cs
            hi = midIdx - 1
        else if tSec > ce
            lo = midIdx + 1
        else
            m.lastCueIdx = midIdx
            return midIdx
        end if
    end while
    return -1
end function

function findNearestOrNextCueIdx(tSec as Float) as Integer
    totalC = 0
    if m.subtitleCues <> invalid then totalC = m.subtitleCues.Count()
    if totalC = 0 then return -1
    for i = 0 to totalC - 1
        cObj = m.subtitleCues[i]
        if safeFloat(cObj.e) >= tSec then return i
    end for
    return totalC - 1
end function

sub onSubTimerTick()
    if m.subtitleOverlayGroup = invalid then return
    if m.cinemaVideoActive <> true or m.cinemaVideo = invalid
        m.subtitleOverlayGroup.visible = false
        return
    end if

    effectiveCc = (m.captionsEnabled = true or m.captionTempReplaySec > 0)
    if not effectiveCc
        m.subtitleOverlayGroup.visible = false
        if m.cinemaVideo.globalCaptionMode <> "Off"
            m.cinemaVideo.globalCaptionMode = "Off"
        end if
        return
    end if

    activeChoice = { kind: "native_cc", label: "Broadcast CC", trackIndex: -2 }
    if m.captionChoiceIdx > 0 and m.captionChoiceIdx < m.captionChoices.Count()
        activeChoice = m.captionChoices[m.captionChoiceIdx]
    else if m.captionChoices.Count() > 1
        activeChoice = m.captionChoices[1]
    end if

    if m.playerOsdOpen = true and m.playerOsdMode = "full"
        m.subtitleOverlayGroup.translation = [160, 396]
    else if m.playerOsdOpen = true and m.playerOsdMode = "mini"
        m.subtitleOverlayGroup.translation = [160, 842]
    else
        m.subtitleOverlayGroup.translation = [160, 916]
    end if

    if m.subtitleCueLabel <> invalid
        if m.captionSizeMode = 0
            m.subtitleCueLabel.scale = [0.66, 0.66]
            m.subtitleCueLabel.width = 1820
        else if m.captionSizeMode = 2
            m.subtitleCueLabel.scale = [0.94, 0.94]
            m.subtitleCueLabel.width = 1280
        else
            m.subtitleCueLabel.scale = [0.80, 0.80]
            m.subtitleCueLabel.width = 1500
        end if
    end if

    if activeChoice.kind = "server" and m.subtitleCues <> invalid and m.subtitleCues.Count() > 0
        if m.cinemaVideo.globalCaptionMode <> "Off"
            m.cinemaVideo.globalCaptionMode = "Off"
        end if
        curT = safeFloat(m.cinemaVideo.position) + m.captionOffsetSec
        cIdx = findCueIdxAtTime(curT)
        if cIdx >= 0 and cIdx < m.subtitleCues.Count()
            cueTxt = cleanAscii(m.subtitleCues[cIdx].t)
            if cueTxt <> ""
                m.subtitleCueLabel.text = cueTxt
                m.subtitleOverlayGroup.visible = true
            else
                m.subtitleOverlayGroup.visible = false
            end if
        else
            m.subtitleOverlayGroup.visible = false
        end if
        if m.playerOsdOpen = true and m.playerOsdMode = "full" and m.osdTabIdx = 1
            updateCaptionsTranscriptCard()
        end if
    else
        m.subtitleOverlayGroup.visible = false
        if m.cinemaVideo.globalCaptionMode <> "On"
            m.cinemaVideo.globalCaptionMode = "On"
        end if
    end if
end sub

sub toggleCaptionsOnOff()
    if m.captionsEnabled = true
        m.captionsEnabled = false
        m.captionTempReplaySec = 0
        m.captionChoiceIdx = 0
    else
        m.captionsEnabled = true
        if m.captionChoices.Count() > 1
            m.captionChoiceIdx = 1
            ch = m.captionChoices[1]
            if ch.kind = "server" and m.subtitleCues.Count() = 0 and m.dashTask <> invalid and m.currentPlayingTrackId <> ""
                m.dashTask.metaRequestUrl = "${progressBaseUrl}/api/roku-playback-meta/" + m.currentPlayingTrackId + "?cueTrack=" + ch.trackIndex.ToStr() + "&waitCues=1&seq=" + m.tickCount.ToStr()
            end if
        end if
    end if
    onSubTimerTick()
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub cycleCaptionChoice(delta as Integer)
    totalCh = m.captionChoices.Count()
    if totalCh <= 1 then return
    nextIdx = m.captionChoiceIdx + delta
    if nextIdx < 0 then nextIdx = totalCh - 1
    if nextIdx >= totalCh then nextIdx = 0
    m.captionChoiceIdx = nextIdx
    chosen = m.captionChoices[nextIdx]
    if chosen.kind = "off"
        m.captionsEnabled = false
        m.captionTempReplaySec = 0
    else
        m.captionsEnabled = true
        if chosen.kind = "server" and m.dashTask <> invalid and m.currentPlayingTrackId <> ""
            m.dashTask.metaRequestUrl = "${progressBaseUrl}/api/roku-playback-meta/" + m.currentPlayingTrackId + "?cueTrack=" + chosen.trackIndex.ToStr() + "&waitCues=1&seq=" + m.tickCount.ToStr()
        end if
    end if
    onSubTimerTick()
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub jumpToNeighborCaption(delta as Integer)
    if m.cinemaVideo = invalid then return
    totalC = 0
    if m.subtitleCues <> invalid then totalC = m.subtitleCues.Count()
    if totalC = 0
        ns = safeInt(m.cinemaVideo.position) + (delta * 10)
        if ns < 0 then ns = 0
        m.cinemaVideo.seek = ns
        return
    end if
    if m.captionsEnabled <> true
        m.captionsEnabled = true
        if m.captionChoiceIdx = 0 and m.captionChoices.Count() > 1 then m.captionChoiceIdx = 1
    end if
    curT = safeFloat(m.cinemaVideo.position) + m.captionOffsetSec
    anchorIdx = findNearestOrNextCueIdx(curT)
    targetIdx = anchorIdx + delta
    if delta < 0 and anchorIdx >= 0 and anchorIdx < totalC
        if curT - safeFloat(m.subtitleCues[anchorIdx].s) > 2.2
            targetIdx = anchorIdx
        else
            targetIdx = anchorIdx - 1
        end if
    end if
    if targetIdx < 0 then targetIdx = 0
    if targetIdx >= totalC then targetIdx = totalC - 1
    targetSec = safeFloat(m.subtitleCues[targetIdx].s) - m.captionOffsetSec
    if targetSec < 0 then targetSec = 0
    m.lastCueIdx = targetIdx
    m.cinemaVideo.seek = targetSec
    onSubTimerTick()
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub cycleCaptionSize()
    m.captionSizeMode = (m.captionSizeMode + 1) mod 3
    onSubTimerTick()
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub cycleCaptionOffset()
    if m.captionOffsetSec >= 1.4
        m.captionOffsetSec = -1.5
    else
        m.captionOffsetSec = m.captionOffsetSec + 0.5
    end if
    onSubTimerTick()
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub cycleAudioTrack(delta as Integer)
    if m.cinemaVideo = invalid then return
    rokuTracks = m.cinemaVideo.availableAudioTracks
    metaTracks = []
    if m.playbackMeta <> invalid and m.playbackMeta.audioTracks <> invalid
        metaTracks = m.playbackMeta.audioTracks
    end if

    if m.currentStreamIsHls = true and metaTracks.Count() > 1 and m.currentPlayingHlsUrl <> ""
        nextA = m.activeAudioChoiceIdx + delta
        if nextA < 0 then nextA = metaTracks.Count() - 1
        if nextA >= metaTracks.Count() then nextA = 0
        m.activeAudioChoiceIdx = nextA
        curPos = safeInt(m.cinemaVideo.position)
        hlsBase = m.currentPlayingHlsUrl
        qPos = Instr(1, hlsBase, "?")
        if qPos > 0 then hlsBase = Left(hlsBase, qPos - 1)
        newUrl = hlsBase + "?audio=" + nextA.ToStr()
        playCinemaVideo({
            active: true,
            isLocal: m.localVideoPlaying,
            preserveMeta: true,
            loadKey: "audio-hls-" + nextA.ToStr() + "-" + m.tickCount.ToStr(),
            mediaUrl: newUrl,
            streamFormat: "hls",
            title: m.currentPlayingTitle,
            startAt: curPos,
            paused: false
        })
        openPlayerOsd("full")
        return
    end if

    if rokuTracks <> invalid and rokuTracks.Count() > 1
        nextR = m.activeAudioChoiceIdx + delta
        if nextR < 0 then nextR = rokuTracks.Count() - 1
        if nextR >= rokuTracks.Count() then nextR = 0
        m.activeAudioChoiceIdx = nextR
        rkEntry = rokuTracks[nextR]
        if rkEntry <> invalid and rkEntry.Track <> invalid
            m.cinemaVideo.audioTrack = rkEntry.Track.ToStr()
        end if
    else if metaTracks.Count() > 1 and m.currentPlayingHlsUrl <> ""
        ' Switch to HLS transcode to select secondary audio track cleanly
        nextM = m.activeAudioChoiceIdx + delta
        if nextM < 0 then nextM = metaTracks.Count() - 1
        if nextM >= metaTracks.Count() then nextM = 0
        m.activeAudioChoiceIdx = nextM
        switchStreamDeliveryMode(true)
        return
    end if
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub switchStreamDeliveryMode(useHls as Boolean)
    if m.cinemaVideo = invalid or m.currentPlayingItem = invalid then return
    curPos = safeInt(m.cinemaVideo.position)
    if useHls = true and m.currentPlayingHlsUrl <> ""
        hlsBase = m.currentPlayingHlsUrl
        qPos = Instr(1, hlsBase, "?")
        if qPos > 0 then hlsBase = Left(hlsBase, qPos - 1)
        hlsTarget = hlsBase
        if m.activeAudioChoiceIdx > 0 then hlsTarget = hlsBase + "?audio=" + m.activeAudioChoiceIdx.ToStr()
        playCinemaVideo({
            active: true,
            isLocal: m.localVideoPlaying,
            preserveMeta: true,
            loadKey: "mode-hls-" + m.tickCount.ToStr(),
            mediaUrl: hlsTarget,
            streamFormat: "hls",
            title: m.currentPlayingTitle,
            startAt: curPos,
            paused: false
        })
        openPlayerOsd("full")
    else if useHls <> true and m.currentPlayingItem.streamUrl <> invalid and m.currentPlayingItem.streamUrl <> ""
        directFmt = "mp4"
        if m.currentPlayingItem.streamFormat <> invalid and m.currentPlayingItem.streamFormat <> ""
            directFmt = LCase(cleanAscii(m.currentPlayingItem.streamFormat))
        else if Instr(1, LCase(cleanAscii(m.currentPlayingItem.streamUrl)), ".mkv") > 0
            directFmt = "mkv"
        end if
        playCinemaVideo({
            active: true,
            isLocal: m.localVideoPlaying,
            preserveMeta: true,
            loadKey: "mode-direct-" + m.tickCount.ToStr(),
            mediaUrl: m.currentPlayingItem.streamUrl,
            streamFormat: directFmt,
            title: m.currentPlayingTitle,
            startAt: curPos,
            paused: false
        })
        openPlayerOsd("full")
    end if
end sub

sub toggleCurrentWatchedStatus()
    if m.currentPlayingTrackId = "" or m.dashTask = invalid then return
    nowWatched = true
    if m.currentPlayingItem <> invalid and m.currentPlayingItem.completed = true
        nowWatched = false
    else if m.playbackMeta <> invalid and m.playbackMeta.watched = true
        nowWatched = false
    end if
    if nowWatched = true
        m.dashTask.progressUrl = "${progressBaseUrl}/api/tv-progress?id=" + m.currentPlayingTrackId + "&watched=true&seq=" + m.tickCount.ToStr()
        if m.currentPlayingItem <> invalid
            m.currentPlayingItem.completed = true
            m.currentPlayingItem.inProgress = false
            m.currentPlayingItem.progressPct = 100
        end if
        if m.playbackMeta <> invalid then m.playbackMeta.watched = true
    else
        m.dashTask.progressUrl = "${progressBaseUrl}/api/tv-progress?id=" + m.currentPlayingTrackId + "&unwatched=true&seq=" + m.tickCount.ToStr()
        if m.currentPlayingItem <> invalid
            m.currentPlayingItem.completed = false
            m.currentPlayingItem.inProgress = false
            m.currentPlayingItem.progressPct = 0
            m.currentPlayingItem.positionSec = 0
        end if
        if m.playbackMeta <> invalid then m.playbackMeta.watched = false
    end if
    if m.playerOsdOpen = true then renderPlayerOsd()
end sub

sub playSpecificEpisodeObj(epObj as Object, showObj as Object)
    if epObj = invalid or epObj.streamUrl = invalid or epObj.streamUrl = "" then return
    m.localVideoPlaying = true
    m.currentPlayingTrackId = cleanAscii(epObj.id)
    m.currentPlayingItem = epObj
    m.currentPlayingHlsUrl = cleanAscii(epObj.hlsUrl)
    m.triedHlsFallback = false
    fmt = "mp4"
    if epObj.streamFormat <> invalid and epObj.streamFormat <> ""
        fmt = LCase(cleanAscii(epObj.streamFormat))
    else if Instr(1, LCase(cleanAscii(epObj.streamUrl)), ".m3u8") > 0
        fmt = "hls"
    else if Instr(1, LCase(cleanAscii(epObj.streamUrl)), ".mkv") > 0
        fmt = "mkv"
    end if
    resumeSec = 0
    if epObj.inProgress = true and epObj.positionSec <> invalid and safeInt(epObj.positionSec) > 5
        resumeSec = safeInt(epObj.positionSec)
    end if
    playTitle = cleanAscii(epObj.title)
    if showObj <> invalid and epObj.episodeCode <> invalid and epObj.episodeCode <> ""
        playTitle = cleanAscii(showObj.title) + " - " + cleanAscii(epObj.episodeCode) + " " + cleanAscii(epObj.episodeTitle)
    end if
    m.currentPlayingTitle = playTitle
    m.currentPlayingStartSec = resumeSec
    closePlayerOsd()
    playCinemaVideo({
        active: true,
        isLocal: true,
        trackId: m.currentPlayingTrackId,
        hlsUrl: m.currentPlayingHlsUrl,
        loadKey: "osd-ep-" + m.currentPlayingTrackId + "-" + m.tickCount.ToStr(),
        mediaUrl: epObj.streamUrl,
        streamFormat: fmt,
        title: playTitle,
        startAt: resumeSec,
        paused: false
    })
end sub

sub playAdjacentEpisode(delta as Integer)
    if m.playingShowGroup <> invalid and m.playingShowGroup.episodes <> invalid and m.playingShowGroup.episodes.Count() > 0
        eps = m.playingShowGroup.episodes
        baseIdx = m.playingEpFlatIndex
        if baseIdx < 0 then baseIdx = 0
        nextIdx = baseIdx + delta
        if nextIdx < 0 then nextIdx = 0
        if nextIdx >= eps.Count() then nextIdx = eps.Count() - 1
        playSpecificEpisodeObj(eps[nextIdx], m.playingShowGroup)
        return
    end if
    if m.osdSeasonEps <> invalid and m.osdSeasonEps.Count() > 1
        nextM = m.osdEpFocusIdx + delta
        if nextM < 0 then nextM = m.osdSeasonEps.Count() - 1
        if nextM >= m.osdSeasonEps.Count() then nextM = 0
        playSpecificEpisodeObj(m.osdSeasonEps[nextM], invalid)
    else if m.cinemaVideo <> invalid
        ns = safeInt(m.cinemaVideo.position) + (delta * 60)
        if ns < 0 then ns = 0
        m.cinemaVideo.seek = ns
    end if
end sub

sub exitPlaybackToLibrary()
    if m.dashTask <> invalid
        if m.cinemaVideo <> invalid and m.currentPlayingTrackId <> ""
            posSec = safeInt(m.cinemaVideo.position)
            durSec = safeInt(m.cinemaVideo.duration)
            if posSec > 0
                m.dashTask.progressUrl = "${progressBaseUrl}/api/tv-progress?id=" + m.currentPlayingTrackId + "&positionSec=" + posSec.ToStr() + "&durationSec=" + durSec.ToStr() + "&seq=" + m.tickCount.ToStr()
                if m.currentPlayingItem <> invalid and posSec >= 5
                    m.currentPlayingItem.positionSec = posSec
                    m.currentPlayingItem.inProgress = true
                    m.currentPlayingItem.completed = false
                    if durSec > 0
                        pct = Int(((posSec * 1.0) / (durSec * 1.0)) * 100)
                        if pct < 1 then pct = 1
                        if pct > 99 then pct = 99
                        m.currentPlayingItem.progressPct = pct
                    end if
                end if
            end if
        end if
        m.dashTask.castActionUrl = "${progressBaseUrl}/api/roku-cast-clear?loadKey=all&seq=" + m.tickCount.ToStr()
    end if
    m.currentPlayingTrackId = ""
    m.currentPlayingItem = invalid
    if m.lastRemoteCastKey <> "" then m.dismissedCinemaLoadKey = m.lastRemoteCastKey else m.dismissedCinemaLoadKey = m.lastCinemaLoadKey
    m.localVideoPlaying = false
    m.localLibraryOpened = true
    stopCinemaVideo()
    if m.cinemaLibraryActive <> true and m.latestCinemaLibrary <> invalid
        showCinemaLibrary(m.latestCinemaLibrary)
    end if
    m.cinemaFocusZone = "posters"
    m.top.setFocus(true)
    updateCinemaPaneFocusUi()
end sub

sub openShowInLibraryFromPlayer(jumpToBrowsedSeason as Boolean)
    targetShow = m.playingShowGroup
    targetShowIdx = m.playingShowGroupIdx
    targetBrowseSNum = -1
    if jumpToBrowsedSeason = true and m.osdSeasonsList <> invalid and m.osdBrowseSeasonIdx >= 0 and m.osdBrowseSeasonIdx < m.osdSeasonsList.Count()
        targetBrowseSNum = safeInt(m.osdSeasonsList[m.osdBrowseSeasonIdx].seasonNumber)
    end if
    exitPlaybackToLibrary()
    if targetShow <> invalid
        switchCinemaTab("shows")
        if targetShowIdx < 0 then targetShowIdx = 0
        enterShowSeasons(targetShow, targetShowIdx)
        if targetBrowseSNum >= 0 and m.activeShowSeasons <> invalid
            for sIdx = 0 to m.activeShowSeasons.Count() - 1
                if safeInt(m.activeShowSeasons[sIdx].seasonNumber) = targetBrowseSNum
                    applyShowSeasonFilter(sIdx)
                    exit for
                end if
            end for
        end if
        m.cinemaFocusZone = "posters"
        updateCinemaPaneFocusUi()
    else
        switchCinemaTab("movies")
        m.cinemaFocusZone = "posters"
        updateCinemaPaneFocusUi()
    end if
end sub

sub openPlayerOsd(modeStr as String)
    if m.playerOsdGroup = invalid then return
    m.playerOsdOpen = true
    m.playerOsdMode = modeStr
    m.playerOsdGroup.visible = true
    if modeStr = "mini"
        m.playerMiniHideSec = 4
        if m.osdFullDrawerGroup <> invalid then m.osdFullDrawerGroup.visible = false
        if m.osdScrubberGroup <> invalid then m.osdScrubberGroup.translation = [0, 964]
    else
        m.playerMiniHideSec = 0
        if m.osdFullDrawerGroup <> invalid then m.osdFullDrawerGroup.visible = true
        if m.osdScrubberGroup <> invalid then m.osdScrubberGroup.translation = [0, 504]
        if m.osdZone <> "scrubber" and m.osdZone <> "tabs" and m.osdZone <> "seasonTop" and m.osdZone <> "items"
            m.osdZone = "tabs"
        end if
    end if
    onSubTimerTick()
    renderPlayerOsd()
end sub

sub closePlayerOsd()
    m.playerOsdOpen = false
    m.playerMiniHideSec = 0
    if m.playerOsdGroup <> invalid then m.playerOsdGroup.visible = false
    onSubTimerTick()
end sub

function currentAudioBadgeLabel() as String
    if m.playbackMeta <> invalid and m.playbackMeta.audioTracks <> invalid and m.playbackMeta.audioTracks.Count() > 0
        aTracks = m.playbackMeta.audioTracks
        idx = m.activeAudioChoiceIdx
        if idx < 0 or idx >= aTracks.Count() then idx = 0
        aObj = aTracks[idx]
        return cleanAscii(aObj.language) + " " + cleanAscii(aObj.codec) + " " + cleanAscii(aObj.channelsLabel)
    end if
    if m.cinemaVideo <> invalid and m.cinemaVideo.availableAudioTracks <> invalid and m.cinemaVideo.availableAudioTracks.Count() > 0
        rTracks = m.cinemaVideo.availableAudioTracks
        idx = m.activeAudioChoiceIdx
        if idx < 0 or idx >= rTracks.Count() then idx = 0
        rObj = rTracks[idx]
        if rObj <> invalid and rObj.Language <> invalid and rObj.Language <> ""
            return UCase(cleanAscii(rObj.Language)) + " TRACK " + (idx + 1).ToStr()
        end if
    end if
    return "STEREO"
end function

function currentCaptionBadgeLabel() as String
    if m.captionsEnabled <> true and m.captionTempReplaySec <= 0
        return "CC: Off"
    end if
    if m.captionTempReplaySec > 0 and m.captionsEnabled <> true
        return "CC: Replay (" + m.captionTempReplaySec.ToStr() + "s)"
    end if
    if m.captionChoiceIdx > 0 and m.captionChoiceIdx < m.captionChoices.Count()
        return "CC: " + Left(cleanAscii(m.captionChoices[m.captionChoiceIdx].label), 18)
    end if
    return "CC: On"
end function

sub updatePlayerOsdHeaderAndScrubber()
    if m.cinemaVideo = invalid then return
    posSec = safeInt(m.cinemaVideo.position)
    durSec = safeInt(m.cinemaVideo.duration)
    if durSec <= 0 and m.playbackMeta <> invalid and m.playbackMeta.durationSec <> invalid
        durSec = safeInt(m.playbackMeta.durationSec)
    else if durSec <= 0 and m.currentPlayingItem <> invalid and m.currentPlayingItem.durationSec <> invalid
        durSec = safeInt(m.currentPlayingItem.durationSec)
    end if
    pct = 0
    if durSec > 0
        pct = Int(((posSec * 1.0) / (durSec * 1.0)) * 100)
        if pct < 0 then pct = 0
        if pct > 100 then pct = 100
    end if
    remSec = durSec - posSec
    if remSec < 0 then remSec = 0

    typePillTxt = m.top.findNode("osdTypePillTxt")
    topTitle = m.top.findNode("osdTopTitle")
    topSub = m.top.findNode("osdTopSubMeta")
    stBg = m.top.findNode("osdStateBadgeBg")
    stTxt = m.top.findNode("osdStateBadgeTxt")
    ccBg = m.top.findNode("osdCcBadgeBg")
    ccTxt = m.top.findNode("osdCcBadgeTxt")
    auTxt = m.top.findNode("osdAudioBadgeTxt")
    clkTxt = m.top.findNode("osdTopClockTxt")

    if typePillTxt <> invalid
        if m.playingShowGroup <> invalid and m.playingEpisodeObj <> invalid
            typePillTxt.text = cleanAscii(m.playingEpisodeObj.episodeCode)
        else if m.currentPlayingItem <> invalid and m.currentPlayingItem.isTablo = true
            typePillTxt.text = "DVR"
        else
            typePillTxt.text = "FILM"
        end if
    end if
    if topTitle <> invalid then topTitle.text = Left(cleanAscii(m.currentPlayingTitle), 58)
    if topSub <> invalid
        modeLbl = "Direct Play"
        if m.currentStreamIsHls = true then modeLbl = "HLS Stream"
        if m.playingShowGroup <> invalid
            topSub.text = cleanAscii(m.playingShowGroup.title) + "   |   " + modeLbl + "   |   Up/Down Menu   |   * Subtitles"
        else if m.playbackMeta <> invalid and m.playbackMeta.video <> invalid and m.playbackMeta.video.summary <> invalid
            topSub.text = cleanAscii(m.playbackMeta.video.summary) + "   |   " + modeLbl + "   |   Up/Down Menu   |   * Subtitles"
        else
            topSub.text = modeLbl + "   |   Up/Down Menu   |   * Subtitles"
        end if
    end if

    vSt = m.cinemaVideo.state
    if stBg <> invalid and stTxt <> invalid
        if vSt = "paused"
            stBg.color = "0x0284C7FF"
            stTxt.text = "PAUSED"
        else if vSt = "buffering"
            stBg.color = "0x4F46E5FF"
            stTxt.text = "BUFFERING"
        else
            stBg.color = "0x059669FF"
            stTxt.text = "PLAYING"
        end if
    end if

    if ccTxt <> invalid then ccTxt.text = currentCaptionBadgeLabel()
    if ccBg <> invalid
        if m.captionsEnabled = true or m.captionTempReplaySec > 0 then ccBg.color = "0x0369A1FF" else ccBg.color = "0x1E293BFF"
    end if
    if auTxt <> invalid then auTxt.text = Left(currentAudioBadgeLabel(), 20)
    if clkTxt <> invalid
        if durSec > 0
            clkTxt.text = formatClockHms(posSec) + " / " + formatClockHms(durSec) + "  (-" + formatClockHms(remSec) + ")"
        else
            clkTxt.text = formatClockHms(posSec) + " / LIVE"
        end if
    end if

    elLbl = m.top.findNode("osdTimeElapsed")
    totLbl = m.top.findNode("osdTimeTotal")
    fillRect = m.top.findNode("osdTrackFill")
    knobRect = m.top.findNode("osdTrackKnob")
    scrubBdr = m.top.findNode("osdScrubberFocusBorder")
    scrubHint = m.top.findNode("osdScrubHint")
    if elLbl <> invalid then elLbl.text = formatClockHms(posSec)
    if totLbl <> invalid
        if durSec > 0
            totLbl.text = formatClockHms(durSec) + " (" + pct.ToStr() + "%)"
        else
            totLbl.text = "LIVE"
        end if
    end if
    fillW = 10
    if durSec > 0
        fillW = Int(((posSec * 1.0) / (durSec * 1.0)) * 1768)
        if fillW < 8 then fillW = 8
        if fillW > 1768 then fillW = 1768
    end if
    if fillRect <> invalid then fillRect.width = fillW
    if knobRect <> invalid then knobRect.translation = [72 + fillW, 35]
    if scrubBdr <> invalid
        if m.playerOsdMode = "full" and m.osdZone = "scrubber"
            scrubBdr.color = "0xFFFFFFFF"
            scrubBdr.height = 3
        else
            scrubBdr.color = "0x1E293BFF"
            scrubBdr.height = 1
        end if
    end if
    if scrubHint <> invalid
        if m.playerOsdMode = "mini"
            scrubHint.text = "OK Pause/Resume   |   Up/Down Menu (Subtitles, Season, Show, Details, Metadata)   |   Left/Right Seek"
        else
            scrubHint.text = "Left/Right Seek -15s / +30s   |   Rew/FF -60s / +60s   |   OK Pause/Resume   |   Down Tabs"
        end if
    end if
end sub

sub updateCaptionsTranscriptCard()
    eyebrow = m.top.findNode("osdSummaryEyebrow")
    ttl = m.top.findNode("osdSummaryTitle")
    bdg = m.top.findNode("osdSummaryBadges")
    body = m.top.findNode("osdSummaryBody")
    subL = m.top.findNode("osdSummarySubLine")

    szName = "Medium"
    if m.captionSizeMode = 0 then szName = "Small"
    if m.captionSizeMode = 2 then szName = "Large"
    offStr = m.captionOffsetSec.ToStr() + "s"
    if m.captionOffsetSec > 0 then offStr = "+" + offStr

    activeTrackName = "Off"
    if m.captionChoiceIdx > 0 and m.captionChoiceIdx < m.captionChoices.Count()
        activeTrackName = cleanAscii(m.captionChoices[m.captionChoiceIdx].label)
    end if

    totalC = 0
    if m.subtitleCues <> invalid then totalC = m.subtitleCues.Count()

    if eyebrow <> invalid then eyebrow.text = "SUBTITLES & LIVE DIALOGUE   |   " + (m.captionChoices.Count() - 1).ToStr() + " SOURCES"
    if ttl <> invalid
        if m.captionsEnabled = true
            ttl.text = "Subtitles: " + activeTrackName
        else
            ttl.text = "Subtitles Off"
        end if
    end if
    if bdg <> invalid
        cueStatus = totalC.ToStr() + " Synced Lines"
        if m.cuesExtracting = true then cueStatus = "Extracting Embedded Subtitles..."
        bdg.text = cueStatus + "   |   Size: " + szName + "   |   Offset: " + offStr
    end if

    if body <> invalid
        if totalC > 0 and m.cinemaVideo <> invalid
            curT = safeFloat(m.cinemaVideo.position) + m.captionOffsetSec
            idx = findNearestOrNextCueIdx(curT)
            prevTxt = "(Start of subtitles)"
            curTxt = "(No dialogue at current timestamp)"
            nextTxt = "(End of subtitles)"
            if idx > 0
                pCue = m.subtitleCues[idx - 1]
                prevTxt = "[" + formatClockHms(pCue.s) + "]  " + Left(cleanAscii(pCue.t), 92)
            end if
            if idx >= 0 and idx < totalC
                cCue = m.subtitleCues[idx]
                curTxt = "> [" + formatClockHms(cCue.s) + "]  " + Left(cleanAscii(cCue.t), 96)
            end if
            if idx + 1 < totalC
                nCue = m.subtitleCues[idx + 1]
                nextTxt = "[" + formatClockHms(nCue.s) + "]  " + Left(cleanAscii(nCue.t), 92)
            end if
            body.text = prevTxt + Chr(10) + curTxt + Chr(10) + nextTxt
        else if m.cuesExtracting = true
            body.text = "Extracting embedded subtitle stream in the background - captions will appear automatically in a moment."
        else
            body.text = "Switch between embedded subtitle tracks, sidecar .srt/.vtt files, or broadcast closed captions above."
        end if
    end if
    if subL <> invalid
        subL.text = "Select Prev Line or Next Line above to jump playback directly to adjacent spoken dialogue."
    end if
end sub

sub setOsdButtonRow(defs as Object)
    count = defs.Count()
    if m.osdItemIdx >= count then m.osdItemIdx = count - 1
    if m.osdItemIdx < 0 then m.osdItemIdx = 0
    for i = 0 to 6
        bdr = m.top.findNode("osdBtnBorder" + i.ToStr())
        bg = m.top.findNode("osdBtnBg" + i.ToStr())
        tLbl = m.top.findNode("osdBtnTop" + i.ToStr())
        sLbl = m.top.findNode("osdBtnSub" + i.ToStr())
        if i < count
            d = defs[i]
            isFoc = (m.osdZone = "items" and m.osdItemIdx = i)
            if bdr <> invalid
                bdr.visible = true
                if isFoc
                    bdr.color = "0xFFFFFFFF"
                else if d.active = true
                    bdr.color = "0x172554FF"
                else
                    bdr.color = "0x111A2EFF"
                end if
            end if
            if bg <> invalid
                bg.visible = true
                if isFoc
                    bg.color = "0x1E3A5FFF"
                else if d.active = true
                    bg.color = "0x172554FF"
                else
                    bg.color = "0x111A2EFF"
                end if
            end if
            if tLbl <> invalid
                tLbl.visible = true
                tLbl.text = cleanAscii(d.top)
                if isFoc
                    tLbl.color = "0xFFFFFFFF"
                else if d.active = true
                    tLbl.color = "0x7DD3FCFF"
                else
                    tLbl.color = "0xE2E8F0FF"
                end if
            end if
            if sLbl <> invalid
                sLbl.visible = true
                sLbl.text = cleanAscii(d.sub)
                if isFoc then sLbl.color = "0xBAE6FDFF" else sLbl.color = "0x64748BFF"
            end if
        else
            if bdr <> invalid then bdr.visible = false
            if bg <> invalid then bg.visible = false
            if tLbl <> invalid then tLbl.visible = false
            if sLbl <> invalid then sLbl.visible = false
        end if
    end for
end sub

sub populateSummaryPosterAndFallback()
    pst = m.top.findNode("osdSummaryPoster")
    mono = m.top.findNode("osdSummaryMono")
    artUri = ""
    if m.playingEpisodeObj <> invalid and m.playingEpisodeObj.artUrl <> invalid and m.playingEpisodeObj.artUrl <> ""
        artUri = cleanAscii(m.playingEpisodeObj.artUrl)
    else if m.currentPlayingItem <> invalid and m.currentPlayingItem.artUrl <> invalid and m.currentPlayingItem.artUrl <> ""
        artUri = cleanAscii(m.currentPlayingItem.artUrl)
    else if m.playingShowGroup <> invalid and m.playingShowGroup.artUrl <> invalid
        artUri = cleanAscii(m.playingShowGroup.artUrl)
    end if
    if pst <> invalid then pst.uri = artUri
    if mono <> invalid then mono.text = makeMonogram(cleanAscii(m.currentPlayingTitle))
end sub

sub renderPlayerOsd()
    if m.playerOsdGroup = invalid or m.playerOsdOpen <> true then return
    updatePlayerOsdHeaderAndScrubber()
    if m.playerOsdMode = "mini" then return

    hasShow = (m.playingShowGroup <> invalid)
    tabTitles = [
        "Controls",
        "Subtitles",
        "Season",
        "Show",
        "Details",
        "Audio",
        "Metadata"
    ]
    if not hasShow
        tabTitles[2] = "More Films"
        tabTitles[3] = "Collection"
    end if

    for tIdx = 0 to 6
        tbBdr = m.top.findNode("osdTabBorder" + tIdx.ToStr())
        tbBg = m.top.findNode("osdTabBg" + tIdx.ToStr())
        tbLbl = m.top.findNode("osdTabLbl" + tIdx.ToStr())
        isSelTab = (tIdx = m.osdTabIdx)
        isFocTab = (isSelTab and m.osdZone = "tabs")
        if tbLbl <> invalid then tbLbl.text = tabTitles[tIdx]
        if tbBdr <> invalid
            if isFocTab
                tbBdr.color = "0xFFFFFFFF"
            else if isSelTab
                tbBdr.color = "0x172554FF"
            else
                tbBdr.color = "0x0E1628FF"
            end if
        end if
        if tbBg <> invalid
            if isFocTab
                tbBg.color = "0x1E3A5FFF"
            else if isSelTab
                tbBg.color = "0x172554FF"
            else
                tbBg.color = "0x0E1628FF"
            end if
        end if
        if tbLbl <> invalid
            if isFocTab
                tbLbl.color = "0xFFFFFFFF"
            else if isSelTab
                tbLbl.color = "0x7DD3FCFF"
            else
                tbLbl.color = "0x94A3B8FF"
            end if
        end if
    end for

    isSeasonTab = (m.osdTabIdx = 2)
    isMetaTab = (m.osdTabIdx = 6)
    if m.osdSeasonPaneGroup <> invalid then m.osdSeasonPaneGroup.visible = isSeasonTab
    if m.osdMetaGridGroup <> invalid then m.osdMetaGridGroup.visible = isMetaTab
    if m.osdActionBtnsGroup <> invalid then m.osdActionBtnsGroup.visible = (not isSeasonTab and not isMetaTab)
    if m.osdRichSummaryGroup <> invalid then m.osdRichSummaryGroup.visible = (not isSeasonTab and not isMetaTab)

    eyebrow = m.top.findNode("osdSummaryEyebrow")
    ttl = m.top.findNode("osdSummaryTitle")
    bdg = m.top.findNode("osdSummaryBadges")
    body = m.top.findNode("osdSummaryBody")
    subL = m.top.findNode("osdSummarySubLine")
    populateSummaryPosterAndFallback()

    isWatched = false
    if m.currentPlayingItem <> invalid and m.currentPlayingItem.completed = true then isWatched = true
    if m.playbackMeta <> invalid and m.playbackMeta.watched = true then isWatched = true
    watchBtnTop = "Mark Watched"
    watchBtnSub = "Set Complete"
    if isWatched
        watchBtnTop = "Watched"
        watchBtnSub = "Clear Status"
    end if

    if m.osdTabIdx = 0
        isPausedNow = (m.cinemaVideo <> invalid and m.cinemaVideo.state = "paused")
        playTop = "Pause"
        playSub = "Pause Video"
        if isPausedNow
            playTop = "Resume"
            playSub = "Continue"
        end if
        prevTop = "Prev Episode"
        prevSub = "Previous"
        nextTop = "Next Episode"
        nextSub = "Up Next"
        if not hasShow
            prevTop = "Prev Film"
            prevSub = "Previous"
            nextTop = "Next Film"
            nextSub = "Up Next"
        end if
        setOsdButtonRow([
            { top: playTop, sub: playSub, active: true },
            { top: "-15s", sub: "Rewind", active: false },
            { top: "+30s", sub: "Forward", active: false },
            { top: prevTop, sub: prevSub, active: false },
            { top: nextTop, sub: nextSub, active: false },
            { top: "Restart", sub: "From 0:00", active: false },
            { top: watchBtnTop, sub: watchBtnSub, active: isWatched }
        ])
        if eyebrow <> invalid
            if hasShow
                eyebrow.text = "NOW PLAYING   |   " + UCase(cleanAscii(m.playingShowGroup.title))
            else
                eyebrow.text = "NOW PLAYING"
            end if
        end if
        if ttl <> invalid then ttl.text = cleanAscii(m.currentPlayingTitle)
        if bdg <> invalid
            if m.playbackMeta <> invalid
                bdg.text = cleanAscii(m.playbackMeta.container) + "   |   " + cleanAscii(m.playbackMeta.sizeFormatted) + "   |   " + cleanAscii(m.playbackMeta.durationFormatted) + "   |   " + cleanAscii(m.playbackMeta.video.summary)
            else if m.currentPlayingItem <> invalid
                bdg.text = cleanAscii(m.currentPlayingItem.genre) + "   |   " + cleanAscii(m.currentPlayingItem.qualityBadge)
            end if
        end if
        if body <> invalid
            ovTxt = ""
            if m.playbackMeta <> invalid and m.playbackMeta.overview <> "" then ovTxt = cleanAscii(m.playbackMeta.overview)
            if ovTxt = "" and m.currentPlayingItem <> invalid then ovTxt = cleanAscii(m.currentPlayingItem.overview)
            if ovTxt = "" and hasShow then ovTxt = cleanAscii(m.playingShowGroup.overview)
            if ovTxt = "" then ovTxt = "Direct LAN stream with synced subtitles, season & show browser, audio selector, and stream metadata."
            body.text = Left(ovTxt, 280)
        end if
        if subL <> invalid
            if hasShow and m.playingShowGroup.episodes <> invalid and m.playingEpFlatIndex >= 0 and m.playingEpFlatIndex + 1 < m.playingShowGroup.episodes.Count()
                nxtEp = m.playingShowGroup.episodes[m.playingEpFlatIndex + 1]
                subL.text = "Up Next: " + cleanAscii(nxtEp.episodeCode) + " - " + cleanAscii(nxtEp.episodeTitle)
            else
                subL.text = currentCaptionBadgeLabel() + "   |   Audio: " + currentAudioBadgeLabel()
            end if
        end if
    else if m.osdTabIdx = 1
        ccTop = "Captions: Off"
        if m.captionsEnabled = true then ccTop = "Captions: On"
        szName = "Medium"
        if m.captionSizeMode = 0 then szName = "Small"
        if m.captionSizeMode = 2 then szName = "Large"
        offStr = m.captionOffsetSec.ToStr() + "s"
        if m.captionOffsetSec > 0 then offStr = "+" + offStr
        curTrkShort = "Turn On"
        if m.captionsEnabled = true and m.captionChoiceIdx > 0 and m.captionChoiceIdx < m.captionChoices.Count()
            curTrkShort = Left(cleanAscii(m.captionChoices[m.captionChoiceIdx].label), 18)
        end if
        setOsdButtonRow([
            { top: ccTop, sub: curTrkShort, active: m.captionsEnabled },
            { top: "< Prev Track", sub: "Subtitle Source", active: false },
            { top: "Next Track >", sub: "Subtitle Source", active: false },
            { top: "< Prev Line", sub: "Seek Dialogue", active: false },
            { top: "Next Line >", sub: "Seek Dialogue", active: false },
            { top: "Size: " + szName, sub: "Font Scale", active: false },
            { top: "Sync: " + offStr, sub: "Timing Offset", active: (m.captionOffsetSec <> 0.0) }
        ])
        updateCaptionsTranscriptCard()
    else if m.osdTabIdx = 2
        renderOsdSeasonPane(hasShow)
    else if m.osdTabIdx = 3
        if hasShow
            pst = m.top.findNode("osdSummaryPoster")
            if pst <> invalid and m.playingShowGroup.artUrl <> invalid then pst.uri = cleanAscii(m.playingShowGroup.artUrl)
            setOsdButtonRow([
                { top: "Open Show Page", sub: "All Seasons", active: true },
                { top: "Next Unwatched", sub: "Continue Series", active: false },
                { top: "Play S01E01", sub: "Start Series Over", active: false }
            ])
            if eyebrow <> invalid then eyebrow.text = "TV SERIES   |   " + cleanAscii(m.playingShowGroup.genre)
            if ttl <> invalid then ttl.text = cleanAscii(m.playingShowGroup.title)
            if bdg <> invalid
                sCnt = safeInt(m.playingShowGroup.seasonCount)
                eCnt = safeInt(m.playingShowGroup.episodeCount)
                wCnt = safeInt(m.playingShowGroup.watchedCount)
                bdg.text = sCnt.ToStr() + " Seasons   |   " + eCnt.ToStr() + " Episodes   |   " + wCnt.ToStr() + " / " + eCnt.ToStr() + " Watched"
            end if
            if body <> invalid then body.text = Left(cleanAscii(m.playingShowGroup.overview), 280)
            if subL <> invalid
                subL.text = "Playing: " + cleanAscii(m.playingEpisodeObj.episodeCode) + " - " + cleanAscii(m.playingEpisodeObj.episodeTitle)
            end if
        else
            setOsdButtonRow([
                { top: "Browse Library", sub: "Return to Movies", active: true },
                { top: "Previous Film", sub: "Play Previous", active: false },
                { top: "Next Film", sub: "Play Next", active: false }
            ])
            if eyebrow <> invalid then eyebrow.text = "COLLECTION"
            if ttl <> invalid then ttl.text = cleanAscii(m.currentPlayingTitle)
            if bdg <> invalid and m.currentPlayingItem <> invalid
                bdg.text = cleanAscii(m.currentPlayingItem.genre) + "   |   " + cleanAscii(m.currentPlayingItem.qualityBadge)
            end if
            if body <> invalid then body.text = "Open the More Films tab to switch movies without leaving video playback, or choose Browse Library above."
            if subL <> invalid then subL.text = "RobOS Media Server"
        end if
    else if m.osdTabIdx = 4
        nextActionLbl = "Next Episode"
        if not hasShow then nextActionLbl = "Skip +5m"
        setOsdButtonRow([
            { top: watchBtnTop, sub: watchBtnSub, active: isWatched },
            { top: "Restart", sub: "From 0:00", active: false },
            { top: nextActionLbl, sub: "Advance", active: false }
        ])
        if hasShow and m.playingEpisodeObj <> invalid
            if eyebrow <> invalid
                eyebrow.text = UCase(cleanAscii(m.playingShowGroup.title)) + "   |   SEASON " + safeInt(m.playingEpisodeObj.seasonNumber).ToStr() + "   |   EPISODE " + safeInt(m.playingEpisodeObj.episodeNumber).ToStr()
            end if
            if ttl <> invalid
                ttl.text = cleanAscii(m.playingEpisodeObj.episodeCode) + " - " + cleanAscii(m.playingEpisodeObj.episodeTitle)
            end if
        else
            if eyebrow <> invalid then eyebrow.text = "FILM DETAILS"
            if ttl <> invalid then ttl.text = cleanAscii(m.currentPlayingTitle)
        end if
        if bdg <> invalid
            yrVal = ""
            if m.playbackMeta <> invalid and m.playbackMeta.year <> invalid then yrVal = m.playbackMeta.year.ToStr() + "   |   "
            durVal = formatClockHms(m.cinemaVideo.duration)
            if m.playbackMeta <> invalid and m.playbackMeta.durationFormatted <> invalid then durVal = cleanAscii(m.playbackMeta.durationFormatted)
            szVal = ""
            if m.playbackMeta <> invalid and m.playbackMeta.sizeFormatted <> invalid then szVal = "   |   " + cleanAscii(m.playbackMeta.sizeFormatted)
            bdg.text = yrVal + durVal + szVal + "   |   " + IIfStr(isWatched, "Watched", "In Progress")
        end if
        if body <> invalid
            detOv = ""
            if m.playbackMeta <> invalid and m.playbackMeta.overview <> "" then detOv = cleanAscii(m.playbackMeta.overview)
            if detOv = "" and m.currentPlayingItem <> invalid then detOv = cleanAscii(m.currentPlayingItem.overview)
            if detOv = "" and hasShow then detOv = cleanAscii(m.playingShowGroup.overview)
            if detOv = "" then detOv = "Streaming from RobOS Media Server."
            body.text = Left(detOv, 300)
        end if
        if subL <> invalid and m.playbackMeta <> invalid
            subL.text = "Source: " + Left(cleanAscii(m.playbackMeta.fileName), 92)
        end if
    else if m.osdTabIdx = 5
        setOsdButtonRow([
            { top: "< Prev Audio", sub: "Audio Track", active: false },
            { top: "Next Audio >", sub: "Switch Language", active: true },
            { top: "Direct Play", sub: "Original Stream", active: (not m.currentStreamIsHls) },
            { top: "HLS Stream", sub: "Compatibility", active: m.currentStreamIsHls }
        ])
        if eyebrow <> invalid then eyebrow.text = "AUDIO & DELIVERY"
        if ttl <> invalid then ttl.text = "Audio: " + currentAudioBadgeLabel()
        if bdg <> invalid
            modeDesc = "Direct Play (HTTP 206 Byte-Range)"
            if m.currentStreamIsHls = true then modeDesc = "FFmpeg Live HLS Stream"
            bdg.text = modeDesc
        end if
        if body <> invalid
            if m.playbackMeta <> invalid and m.playbackMeta.audioTracks <> invalid and m.playbackMeta.audioTracks.Count() > 0
                linesA = ""
                for aI = 0 to m.playbackMeta.audioTracks.Count() - 1
                    aTrk = m.playbackMeta.audioTracks[aI]
                    prefixA = "   "
                    if aI = m.activeAudioChoiceIdx then prefixA = "> "
                    if linesA <> "" then linesA = linesA + Chr(10)
                    linesA = linesA + prefixA + cleanAscii(aTrk.label)
                    if aI >= 2 then exit for
                end for
                body.text = linesA
            else
                body.text = "Active Audio: " + currentAudioBadgeLabel()
            end if
        end if
        if subL <> invalid
            subL.text = "Switch to HLS Stream above if a multi-channel audio track or codec needs live transcoding."
        end if
    else if m.osdTabIdx = 6
        renderOsdMetadataGrid()
    end if
end sub

function IIfStr(cond as Boolean, tVal as String, fVal as String) as String
    if cond = true then return tVal
    return fVal
end function

sub renderOsdSeasonPane(hasShow as Boolean)
    topLabels = ["< Prev Season", "Next Season >", "Open in Library"]
    if not hasShow
        topLabels = ["< Prev Page", "Next Page >", "Open Library"]
    end if
    for bI = 0 to 2
        sBdr = m.top.findNode("osdSeasonBtnBorder" + bI.ToStr())
        sBg = m.top.findNode("osdSeasonBtnBg" + bI.ToStr())
        sLbl = m.top.findNode("osdSeasonBtnLbl" + bI.ToStr())
        isTopFoc = (m.osdZone = "seasonTop" and m.osdSeasonTopIdx = bI)
        if sLbl <> invalid
            sLbl.text = topLabels[bI]
            if isTopFoc then sLbl.color = "0xFFFFFFFF" else if bI = 2 then sLbl.color = "0x7DD3FCFF" else sLbl.color = "0xCBD5E1FF"
        end if
        if sBdr <> invalid
            if isTopFoc then sBdr.color = "0xFFFFFFFF" else sBdr.color = "0x111A2EFF"
        end if
        if sBg <> invalid
            if isTopFoc then sBg.color = "0x1E3A5FFF" else sBg.color = "0x111A2EFF"
        end if
    end for

    hdrInfo = m.top.findNode("osdSeasonHeaderInfo")
    totalEps = 0
    if m.osdSeasonEps <> invalid then totalEps = m.osdSeasonEps.Count()
    if hdrInfo <> invalid
        if hasShow and m.osdSeasonsList.Count() > 0 and m.osdBrowseSeasonIdx < m.osdSeasonsList.Count()
            sObj = m.osdSeasonsList[m.osdBrowseSeasonIdx]
            hdrInfo.text = cleanAscii(m.playingShowGroup.title) + "   |   " + cleanAscii(sObj.label) + " (" + totalEps.ToStr() + " Episodes)"
        else
            hdrInfo.text = totalEps.ToStr() + " Related Films"
        end if
    end if

    if m.osdEpFocusIdx < 0 then m.osdEpFocusIdx = 0
    if totalEps > 0 and m.osdEpFocusIdx >= totalEps then m.osdEpFocusIdx = totalEps - 1
    winStart = Int(m.osdEpFocusIdx / 5) * 5

    for slot = 0 to 4
        idxE = winStart + slot
        eBdr = m.top.findNode("osdEpBorder" + slot.ToStr())
        eBg = m.top.findNode("osdEpBg" + slot.ToStr())
        ePst = m.top.findNode("osdEpPoster" + slot.ToStr())
        eCd = m.top.findNode("osdEpCode" + slot.ToStr())
        ePBg = m.top.findNode("osdEpProgBg" + slot.ToStr())
        ePFl = m.top.findNode("osdEpProgFill" + slot.ToStr())
        eTtl = m.top.findNode("osdEpTitle" + slot.ToStr())
        eMt = m.top.findNode("osdEpMeta" + slot.ToStr())
        if idxE < totalEps
            ep = m.osdSeasonEps[idxE]
            isCardFoc = (m.osdZone = "items" and idxE = m.osdEpFocusIdx)
            isPlayingNow = (m.currentPlayingTrackId <> "" and cleanAscii(ep.id) = m.currentPlayingTrackId)
            if eBdr <> invalid
                eBdr.visible = true
                if isCardFoc
                    eBdr.color = "0xFFFFFFFF"
                else if isPlayingNow
                    eBdr.color = "0x172554FF"
                else
                    eBdr.color = "0x111A2EFF"
                end if
            end if
            if eBg <> invalid
                eBg.visible = true
                if isCardFoc
                    eBg.color = "0x1E3A5FFF"
                else if isPlayingNow
                    eBg.color = "0x15253DFF"
                else
                    eBg.color = "0x111A2EFF"
                end if
            end if
            if ePst <> invalid
                ePst.visible = true
                if ep.artUrl <> invalid and ep.artUrl <> ""
                    ePst.uri = cleanAscii(ep.artUrl)
                else if hasShow and m.playingShowGroup.artUrl <> invalid
                    ePst.uri = cleanAscii(m.playingShowGroup.artUrl)
                else
                    ePst.uri = ""
                end if
            end if
            if eCd <> invalid
                eCd.visible = true
                if ep.episodeCode <> invalid and ep.episodeCode <> ""
                    eCd.text = cleanAscii(ep.episodeCode)
                else if ep.year <> invalid
                    eCd.text = ep.year.ToStr()
                else
                    eCd.text = "#" + (idxE + 1).ToStr()
                end if
            end if
            if eTtl <> invalid
                eTtl.visible = true
                if ep.episodeTitle <> invalid and ep.episodeTitle <> ""
                    eTtl.text = cleanAscii(ep.episodeTitle)
                else
                    eTtl.text = cleanAscii(ep.title)
                end if
                if isCardFoc then eTtl.color = "0xFFFFFFFF" else eTtl.color = "0xE2E8F0FF"
            end if
            epPct = safeInt(ep.progressPct)
            if ep.completed = true then epPct = 100
            if ePBg <> invalid and ePFl <> invalid
                if epPct > 0
                    ePBg.visible = true
                    ePFl.visible = true
                    ePFl.width = Int((epPct / 100.0) * 326)
                    if ep.completed = true then ePFl.color = "0x10B981FF" else ePFl.color = "0x38BDF8FF"
                else
                    ePBg.visible = false
                    ePFl.visible = false
                end if
            end if
            if eMt <> invalid
                eMt.visible = true
                if isPlayingNow
                    eMt.text = "Now Playing"
                    eMt.color = "0x7DD3FCFF"
                else if ep.completed = true
                    eMt.text = "Watched"
                    eMt.color = "0x34D399FF"
                else if ep.inProgress = true
                    eMt.text = "Resume " + epPct.ToStr() + "%"
                    eMt.color = "0x38BDF8FF"
                else
                    eMt.text = (idxE + 1).ToStr() + " of " + totalEps.ToStr()
                    eMt.color = "0x64748BFF"
                end if
            end if
        else
            if eBdr <> invalid then eBdr.visible = false
            if eBg <> invalid then eBg.visible = false
            if ePst <> invalid then ePst.visible = false
            if eCd <> invalid then eCd.visible = false
            if ePBg <> invalid then ePBg.visible = false
            if ePFl <> invalid then ePFl.visible = false
            if eTtl <> invalid then eTtl.visible = false
            if eMt <> invalid then eMt.visible = false
        end if
    end for
end sub

sub renderOsdMetadataGrid()
    v0 = m.top.findNode("osdMetaVal0")
    v1 = m.top.findNode("osdMetaVal1")
    v2 = m.top.findNode("osdMetaVal2")
    v3 = m.top.findNode("osdMetaVal3")
    v4 = m.top.findNode("osdMetaVal4")
    v5 = m.top.findNode("osdMetaVal5")

    pm = m.playbackMeta
    mv = m.currentPlayingItem
    rokuVidFmt = "1080p FHD"
    if m.cinemaVideo <> invalid and m.cinemaVideo.videoFormat <> invalid and m.cinemaVideo.videoFormat <> ""
        rokuVidFmt = cleanAscii(m.cinemaVideo.videoFormat)
    end if

    if v0 <> invalid
        if pm <> invalid
            v0.text = "File: " + Left(cleanAscii(pm.fileName), 48) + Chr(10) + "Container: " + cleanAscii(pm.container) + "   |   Size: " + cleanAscii(pm.sizeFormatted) + Chr(10) + "Folder: " + Left(cleanAscii(pm.folderPath), 46)
        else if mv <> invalid
            v0.text = "Title: " + Left(cleanAscii(mv.title), 46) + Chr(10) + "Format: " + UCase(cleanAscii(mv.streamFormat)) + Chr(10) + "Track ID: " + m.currentPlayingTrackId
        end if
    end if

    if v1 <> invalid
        if pm <> invalid and pm.video <> invalid
            v1.text = "Stream: " + cleanAscii(pm.video.summary) + Chr(10) + "Roku Decoder Output: " + rokuVidFmt + Chr(10) + "Direct Play Eligible: " + IIfStr(pm.canDirectPlay = true, "Yes (Native Hardware)", "Transcode Available")
        else
            v1.text = "Quality: " + IIfStr(mv <> invalid, cleanAscii(mv.qualityBadge), "1080p HD") + Chr(10) + "Roku Decoder Output: " + rokuVidFmt
        end if
    end if

    if v2 <> invalid
        if pm <> invalid and pm.audioSummary <> invalid
            v2.text = "Active: " + currentAudioBadgeLabel() + Chr(10) + "Streams: " + Left(cleanAscii(pm.audioSummary), 88)
        else
            v2.text = "Active: " + currentAudioBadgeLabel() + Chr(10) + "Roku Hardware Audio Passthrough / Stereo"
        end if
    end if

    if v3 <> invalid
        cCnt = 0
        if m.subtitleCues <> invalid then cCnt = m.subtitleCues.Count()
        subSum = "Broadcast / Sidecar"
        if pm <> invalid and pm.subtitleSummary <> invalid then subSum = cleanAscii(pm.subtitleSummary)
        v3.text = "Status: " + currentCaptionBadgeLabel() + Chr(10) + "Detected: " + Left(subSum, 76) + Chr(10) + "Loaded Cues: " + cCnt.ToStr()
    end if

    if v4 <> invalid
        posS = 0
        durS = 0
        if m.cinemaVideo <> invalid
            posS = safeInt(m.cinemaVideo.position)
            durS = safeInt(m.cinemaVideo.duration)
        end if
        if durS <= 0 and pm <> invalid then durS = safeInt(pm.durationSec)
        svcName = "RobOS Cinema+"
        if pm <> invalid and pm.serviceName <> invalid then svcName = cleanAscii(pm.serviceName)
        v4.text = "Library: " + svcName + Chr(10) + "Position: " + formatClockHms(posS) + " / " + formatClockHms(durS) + Chr(10) + "Genre: " + IIfStr(pm <> invalid, cleanAscii(pm.genre), "Cinema")
    end if

    if v5 <> invalid
        deliv = "Direct Play (HTTP 206 Byte-Range)"
        if m.currentStreamIsHls = true then deliv = "FFmpeg HLS Live Segment Stream"
        brStr = "LAN High-Speed"
        srvStr = "${progressBaseUrl}"
        if pm <> invalid
            if pm.bitRateFormatted <> invalid then brStr = cleanAscii(pm.bitRateFormatted)
            if pm.serverName <> invalid then srvStr = cleanAscii(pm.serverName)
        end if
        v5.text = "Mode: " + deliv + Chr(10) + "Bitrate: " + brStr + Chr(10) + "Source: " + Left(srvStr, 44)
    end if
end sub

sub activateOsdCurrentItem()
    if m.cinemaVideo = invalid then return
    if m.osdTabIdx = 0
        if m.osdItemIdx = 0
            if m.cinemaVideo.state = "playing" then m.cinemaVideo.control = "pause" else if m.cinemaVideo.state = "paused" then m.cinemaVideo.control = "resume"
            renderPlayerOsd()
        else if m.osdItemIdx = 1
            ns = safeInt(m.cinemaVideo.position) - 15
            if ns < 0 then ns = 0
            m.cinemaVideo.seek = ns
            updatePlayerOsdHeaderAndScrubber()
        else if m.osdItemIdx = 2
            m.cinemaVideo.seek = safeInt(m.cinemaVideo.position) + 30
            updatePlayerOsdHeaderAndScrubber()
        else if m.osdItemIdx = 3
            playAdjacentEpisode(-1)
        else if m.osdItemIdx = 4
            playAdjacentEpisode(1)
        else if m.osdItemIdx = 5
            m.cinemaVideo.seek = 0
            updatePlayerOsdHeaderAndScrubber()
        else if m.osdItemIdx = 6
            toggleCurrentWatchedStatus()
        end if
    else if m.osdTabIdx = 1
        if m.osdItemIdx = 0
            toggleCaptionsOnOff()
        else if m.osdItemIdx = 1
            cycleCaptionChoice(-1)
        else if m.osdItemIdx = 2
            cycleCaptionChoice(1)
        else if m.osdItemIdx = 3
            jumpToNeighborCaption(-1)
        else if m.osdItemIdx = 4
            jumpToNeighborCaption(1)
        else if m.osdItemIdx = 5
            cycleCaptionSize()
        else if m.osdItemIdx = 6
            cycleCaptionOffset()
        end if
    else if m.osdTabIdx = 2
        if m.osdZone = "seasonTop"
            if m.osdSeasonTopIdx = 0
                if m.playingShowGroup <> invalid
                    applyPlayerBrowseSeason(m.osdBrowseSeasonIdx - 1)
                else if m.osdSeasonEps.Count() > 0
                    m.osdEpFocusIdx = m.osdEpFocusIdx - 5
                    if m.osdEpFocusIdx < 0 then m.osdEpFocusIdx = 0
                end if
                renderPlayerOsd()
            else if m.osdSeasonTopIdx = 1
                if m.playingShowGroup <> invalid
                    applyPlayerBrowseSeason(m.osdBrowseSeasonIdx + 1)
                else if m.osdSeasonEps.Count() > 0
                    nxtEpPage = m.osdEpFocusIdx + 5
                    if nxtEpPage >= m.osdSeasonEps.Count() then nxtEpPage = m.osdSeasonEps.Count() - 1
                    m.osdEpFocusIdx = nxtEpPage
                end if
                renderPlayerOsd()
            else if m.osdSeasonTopIdx = 2
                openShowInLibraryFromPlayer(true)
            end if
        else if m.osdSeasonEps <> invalid and m.osdEpFocusIdx >= 0 and m.osdEpFocusIdx < m.osdSeasonEps.Count()
            playSpecificEpisodeObj(m.osdSeasonEps[m.osdEpFocusIdx], m.playingShowGroup)
        end if
    else if m.osdTabIdx = 3
        if m.osdItemIdx = 0
            openShowInLibraryFromPlayer(false)
        else if m.osdItemIdx = 1
            if m.playingShowGroup <> invalid and m.playingShowGroup.episodes <> invalid
                chosenEp = m.playingShowGroup.episodes[0]
                for each candEp in m.playingShowGroup.episodes
                    if candEp.completed <> true
                        chosenEp = candEp
                        exit for
                    end if
                end for
                playSpecificEpisodeObj(chosenEp, m.playingShowGroup)
            else
                playAdjacentEpisode(-1)
            end if
        else if m.osdItemIdx = 2
            if m.playingShowGroup <> invalid and m.playingShowGroup.episodes <> invalid and m.playingShowGroup.episodes.Count() > 0
                playSpecificEpisodeObj(m.playingShowGroup.episodes[0], m.playingShowGroup)
            else
                playAdjacentEpisode(1)
            end if
        end if
    else if m.osdTabIdx = 4
        if m.osdItemIdx = 0
            toggleCurrentWatchedStatus()
        else if m.osdItemIdx = 1
            m.cinemaVideo.seek = 0
            updatePlayerOsdHeaderAndScrubber()
        else if m.osdItemIdx = 2
            if m.playingShowGroup <> invalid
                playAdjacentEpisode(1)
            else
                m.cinemaVideo.seek = safeInt(m.cinemaVideo.position) + 300
                updatePlayerOsdHeaderAndScrubber()
            end if
        end if
    else if m.osdTabIdx = 5
        if m.osdItemIdx = 0
            cycleAudioTrack(-1)
        else if m.osdItemIdx = 1
            cycleAudioTrack(1)
        else if m.osdItemIdx = 2
            switchStreamDeliveryMode(false)
        else if m.osdItemIdx = 3
            switchStreamDeliveryMode(true)
        end if
    end if
end sub

function osdMaxItemCountForTab(tabNum as Integer) as Integer
    if tabNum = 0 then return 7
    if tabNum = 1 then return 7
    if tabNum = 3 then return 3
    if tabNum = 4 then return 3
    if tabNum = 5 then return 4
    return 0
end function

function handleCinemaVideoKeyEvent(key as String) as Boolean
    if m.cinemaVideo = invalid then return false

    ' Global transport keys that always work during video playback
    if key = "play"
        if m.cinemaVideo.state = "playing"
            m.cinemaVideo.control = "pause"
        else if m.cinemaVideo.state = "paused"
            m.cinemaVideo.control = "resume"
        end if
        if m.playerOsdOpen <> true
            openPlayerOsd("mini")
        else
            if m.playerOsdMode = "mini" then m.playerMiniHideSec = 3
            renderPlayerOsd()
        end if
        return true
    else if key = "rewind"
        ns = safeInt(m.cinemaVideo.position) - 60
        if ns < 0 then ns = 0
        m.cinemaVideo.seek = ns
        if m.playerOsdOpen <> true
            openPlayerOsd("mini")
        else
            if m.playerOsdMode = "mini" then m.playerMiniHideSec = 4
            updatePlayerOsdHeaderAndScrubber()
        end if
        return true
    else if key = "fastforward"
        m.cinemaVideo.seek = safeInt(m.cinemaVideo.position) + 60
        if m.playerOsdOpen <> true
            openPlayerOsd("mini")
        else
            if m.playerOsdMode = "mini" then m.playerMiniHideSec = 4
            updatePlayerOsdHeaderAndScrubber()
        end if
        return true
    else if key = "replay"
        ns = safeInt(m.cinemaVideo.position) - 10
        if ns < 0 then ns = 0
        m.cinemaVideo.seek = ns
        if m.captionsEnabled <> true then m.captionTempReplaySec = 12
        onSubTimerTick()
        if m.playerOsdOpen <> true
            openPlayerOsd("mini")
        else
            if m.playerOsdMode = "mini" then m.playerMiniHideSec = 4
            updatePlayerOsdHeaderAndScrubber()
        end if
        return true
    end if

    ' When Full 7-Tab Player Menu is open
    if m.playerOsdOpen = true and m.playerOsdMode = "full"
        if key = "back"
            closePlayerOsd()
            return true
        else if key = "options"
            if m.osdTabIdx <> 1
                m.osdTabIdx = 1
                m.osdZone = "items"
                m.osdItemIdx = 0
                renderPlayerOsd()
            else
                closePlayerOsd()
            end if
            return true
        end if

        if m.osdZone = "scrubber"
            if key = "left"
                ns = safeInt(m.cinemaVideo.position) - 15
                if ns < 0 then ns = 0
                m.cinemaVideo.seek = ns
                updatePlayerOsdHeaderAndScrubber()
                return true
            else if key = "right"
                m.cinemaVideo.seek = safeInt(m.cinemaVideo.position) + 30
                updatePlayerOsdHeaderAndScrubber()
                return true
            else if key = "OK"
                if m.cinemaVideo.state = "playing" then m.cinemaVideo.control = "pause" else if m.cinemaVideo.state = "paused" then m.cinemaVideo.control = "resume"
                renderPlayerOsd()
                return true
            else if key = "down"
                m.osdZone = "tabs"
                renderPlayerOsd()
                return true
            end if
            return true
        else if m.osdZone = "tabs"
            if key = "left"
                if m.osdTabIdx > 0
                    m.osdTabIdx = m.osdTabIdx - 1
                    m.osdItemIdx = 0
                    renderPlayerOsd()
                end if
                return true
            else if key = "right"
                if m.osdTabIdx < 6
                    m.osdTabIdx = m.osdTabIdx + 1
                    m.osdItemIdx = 0
                    renderPlayerOsd()
                end if
                return true
            else if key = "up"
                m.osdZone = "scrubber"
                renderPlayerOsd()
                return true
            else if key = "down" or key = "OK"
                if m.osdTabIdx = 2
                    if m.osdSeasonEps <> invalid and m.osdSeasonEps.Count() > 0
                        m.osdZone = "items"
                    else
                        m.osdZone = "seasonTop"
                    end if
                else if m.osdTabIdx = 6
                    ' Metadata tab is read-only grid
                else
                    m.osdZone = "items"
                    m.osdItemIdx = 0
                end if
                renderPlayerOsd()
                return true
            end if
            return true
        else if m.osdZone = "seasonTop"
            if key = "left"
                if m.osdSeasonTopIdx > 0
                    m.osdSeasonTopIdx = m.osdSeasonTopIdx - 1
                    renderPlayerOsd()
                end if
                return true
            else if key = "right"
                if m.osdSeasonTopIdx < 2
                    m.osdSeasonTopIdx = m.osdSeasonTopIdx + 1
                    renderPlayerOsd()
                end if
                return true
            else if key = "up"
                m.osdZone = "tabs"
                renderPlayerOsd()
                return true
            else if key = "down"
                if m.osdSeasonEps <> invalid and m.osdSeasonEps.Count() > 0
                    m.osdZone = "items"
                    renderPlayerOsd()
                end if
                return true
            else if key = "OK"
                activateOsdCurrentItem()
                return true
            end if
            return true
        else
            ' m.osdZone = "items"
            if m.osdTabIdx = 2
                totalEp = 0
                if m.osdSeasonEps <> invalid then totalEp = m.osdSeasonEps.Count()
                if key = "left" and totalEp > 0
                    if m.osdEpFocusIdx > 0
                        m.osdEpFocusIdx = m.osdEpFocusIdx - 1
                        renderPlayerOsd()
                    end if
                    return true
                else if key = "right" and totalEp > 0
                    if m.osdEpFocusIdx + 1 < totalEp
                        m.osdEpFocusIdx = m.osdEpFocusIdx + 1
                        renderPlayerOsd()
                    end if
                    return true
                else if key = "down" and totalEp > 0
                    if m.osdEpFocusIdx + 5 < totalEp
                        m.osdEpFocusIdx = m.osdEpFocusIdx + 5
                        renderPlayerOsd()
                    else if Int(m.osdEpFocusIdx / 5) < Int((totalEp - 1) / 5)
                        m.osdEpFocusIdx = totalEp - 1
                        renderPlayerOsd()
                    end if
                    return true
                else if key = "up"
                    if m.osdEpFocusIdx >= 5
                        m.osdEpFocusIdx = m.osdEpFocusIdx - 5
                    else
                        m.osdZone = "seasonTop"
                    end if
                    renderPlayerOsd()
                    return true
                else if key = "OK"
                    activateOsdCurrentItem()
                    return true
                end if
                return true
            end if

            maxBtns = osdMaxItemCountForTab(m.osdTabIdx)
            if key = "left" and maxBtns > 0
                if m.osdItemIdx > 0
                    m.osdItemIdx = m.osdItemIdx - 1
                    renderPlayerOsd()
                end if
                return true
            else if key = "right" and maxBtns > 0
                if m.osdItemIdx + 1 < maxBtns
                    m.osdItemIdx = m.osdItemIdx + 1
                    renderPlayerOsd()
                end if
                return true
            else if key = "up"
                m.osdZone = "tabs"
                renderPlayerOsd()
                return true
            else if key = "OK"
                activateOsdCurrentItem()
                return true
            end if
            return true
        end if
    end if

    ' When OSD is closed or in transient Mini-HUD mode:
    ' OK pauses/resumes naturally (with transient mini-bar); Up/Down opens Full Rich Menu; * opens Subtitles
    if key = "back"
        if m.playerOsdOpen = true and m.playerOsdMode = "mini"
            closePlayerOsd()
            return true
        end if
        exitPlaybackToLibrary()
        return true
    else if key = "OK"
        if m.cinemaVideo.state = "playing"
            m.cinemaVideo.control = "pause"
        else if m.cinemaVideo.state = "paused"
            m.cinemaVideo.control = "resume"
        end if
        openPlayerOsd("mini")
        if m.cinemaVideo.state = "playing" then m.playerMiniHideSec = 3
        return true
    else if key = "up" or key = "down"
        m.osdZone = "tabs"
        openPlayerOsd("full")
        return true
    else if key = "options"
        m.osdTabIdx = 1
        m.osdZone = "items"
        m.osdItemIdx = 0
        openPlayerOsd("full")
        return true
    else if key = "left"
        ns = safeInt(m.cinemaVideo.position) - 15
        if ns < 0 then ns = 0
        m.cinemaVideo.seek = ns
        openPlayerOsd("mini")
        return true
    else if key = "right"
        m.cinemaVideo.seek = safeInt(m.cinemaVideo.position) + 30
        openPlayerOsd("mini")
        return true
    end if
    return true
end function

function onKeyEvent(key as String, press as Boolean) as Boolean
    if key = "Lit_~" or Left(key, 4) = "Lit_"
        return true
    end if
    if press <> true then return false

    ' 1. Active Full-Screen Cinema Video Playback Controls + Rich OSD Menu
    if m.cinemaVideoActive = true
        return handleCinemaVideoKeyEvent(key)
    end if

    ' 2. Natural 2D Grid Navigation in Cinema Library (Top Nav Pills <-> Filter/Season Strip <-> 6-Column Poster Grid)
    if m.cinemaLibraryActive = true
        if key = "options"
            if m.cinemaActiveTab = "movies"
                switchCinemaTab("shows")
            else if m.cinemaActiveTab = "shows"
                switchCinemaTab("tablo")
            else
                switchCinemaTab("movies")
            end if
            return true
        else if key = "play"
            playCinemaItemAtIndex(m.cinemaPosterIndex)
            return true
        else if key = "fastforward"
            totalP = 0
            if m.cinemaLibItems <> invalid then totalP = m.cinemaLibItems.Count()
            if totalP > 0
                nextP = m.cinemaPosterIndex + 18
                if nextP >= totalP then nextP = totalP - 1
                m.cinemaPosterIndex = nextP
                updateCinemaLibDetail(m.cinemaPosterIndex)
                updateCinemaPosterShelf(m.cinemaPosterIndex)
            end if
            return true
        else if key = "rewind"
            totalP = 0
            if m.cinemaLibItems <> invalid then totalP = m.cinemaLibItems.Count()
            if totalP > 0
                prevP = m.cinemaPosterIndex - 18
                if prevP < 0 then prevP = 0
                m.cinemaPosterIndex = prevP
                updateCinemaLibDetail(m.cinemaPosterIndex)
                updateCinemaPosterShelf(m.cinemaPosterIndex)
            end if
            return true
        else if key = "back"
            if m.activeShowGroup <> invalid
                exitShowSeasons()
                return true
            end if
            if m.cinemaFocusZone = "posters" and m.cinemaPosterIndex >= 6
                m.cinemaPosterIndex = m.cinemaPosterIndex mod 6
                updateCinemaLibDetail(m.cinemaPosterIndex)
                updateCinemaPosterShelf(m.cinemaPosterIndex)
                return true
            end if
            m.localLibraryOpened = false
            hideCinemaLibrary()
            return true
        end if

        if m.cinemaFocusZone = "tabs"
            maxTab = 2
            if key = "left"
                if m.cinemaTabCol > 0
                    m.cinemaTabCol = m.cinemaTabCol - 1
                    if m.activeShowGroup = invalid
                        if m.cinemaTabCol = 0 and m.cinemaActiveTab <> "movies"
                            switchCinemaTab("movies")
                            m.cinemaFocusZone = "tabs"
                            m.cinemaTabCol = 0
                        else if m.cinemaTabCol = 1 and m.cinemaActiveTab <> "shows"
                            switchCinemaTab("shows")
                            m.cinemaFocusZone = "tabs"
                            m.cinemaTabCol = 1
                        end if
                    end if
                    updateCinemaPaneFocusUi()
                end if
                return true
            else if key = "right"
                if m.cinemaTabCol < maxTab
                    m.cinemaTabCol = m.cinemaTabCol + 1
                    if m.activeShowGroup = invalid
                        if m.cinemaTabCol = 1 and m.cinemaActiveTab <> "shows"
                            switchCinemaTab("shows")
                            m.cinemaFocusZone = "tabs"
                            m.cinemaTabCol = 1
                        else if m.cinemaTabCol = 2 and m.cinemaActiveTab <> "tablo"
                            switchCinemaTab("tablo")
                            m.cinemaFocusZone = "tabs"
                            m.cinemaTabCol = 2
                        end if
                    end if
                    updateCinemaPaneFocusUi()
                end if
                return true
            else if key = "down"
                m.cinemaFocusZone = "categories"
                updateCinemaPaneFocusUi()
                return true
            else if key = "up"
                return true
            else if key = "OK"
                if m.activeShowGroup <> invalid
                    if m.cinemaTabCol = 0
                        switchCinemaTab("movies")
                    else
                        exitShowSeasons()
                        return true
                    end if
                else if m.cinemaTabCol = 0 and m.cinemaActiveTab <> "movies"
                    switchCinemaTab("movies")
                else if m.cinemaTabCol = 1 and m.cinemaActiveTab <> "shows"
                    switchCinemaTab("shows")
                else if m.cinemaTabCol = 2 and m.cinemaActiveTab <> "tablo"
                    switchCinemaTab("tablo")
                end if
                if m.cinemaLibItems <> invalid and m.cinemaLibItems.Count() > 0
                    m.cinemaFocusZone = "posters"
                else
                    m.cinemaFocusZone = "categories"
                end if
                updateCinemaPaneFocusUi()
                return true
            end if
        else if m.cinemaFocusZone = "categories"
            if key = "left"
                if m.activeShowGroup <> invalid and m.activeShowSeasons <> invalid and m.activeShowSeasons.Count() > 0
                    if m.activeSeasonIndex > 0
                        applyShowSeasonFilter(m.activeSeasonIndex - 1)
                        updateCinemaPaneFocusUi()
                    end if
                else if m.cinemaCategories <> invalid and m.cinemaCategories.Count() > 0
                    if m.cinemaCatIndex > 0
                        applyCinemaCategoryFilter(m.cinemaCatIndex - 1)
                        updateCinemaPaneFocusUi()
                    end if
                end if
                return true
            else if key = "right"
                if m.activeShowGroup <> invalid and m.activeShowSeasons <> invalid and m.activeShowSeasons.Count() > 0
                    if m.activeSeasonIndex + 1 < m.activeShowSeasons.Count()
                        applyShowSeasonFilter(m.activeSeasonIndex + 1)
                        updateCinemaPaneFocusUi()
                    end if
                else if m.cinemaCategories <> invalid and m.cinemaCategories.Count() > 0
                    if m.cinemaCatIndex + 1 < m.cinemaCategories.Count()
                        applyCinemaCategoryFilter(m.cinemaCatIndex + 1)
                        updateCinemaPaneFocusUi()
                    end if
                end if
                return true
            else if key = "up"
                m.cinemaFocusZone = "tabs"
                if m.activeShowGroup <> invalid
                    m.cinemaTabCol = 2
                else if m.cinemaActiveTab = "tablo"
                    m.cinemaTabCol = 2
                else if m.cinemaActiveTab = "shows"
                    m.cinemaTabCol = 1
                else
                    m.cinemaTabCol = 0
                end if
                updateCinemaPaneFocusUi()
                return true
            else if key = "down" or key = "OK"
                if m.cinemaLibItems <> invalid and m.cinemaLibItems.Count() > 0
                    m.cinemaFocusZone = "posters"
                    updateCinemaPaneFocusUi()
                end if
                return true
            end if
        else
            ' m.cinemaFocusZone = "posters" (2D 6-Column Poster Grid)
            totalP = 0
            if m.cinemaLibItems <> invalid then totalP = m.cinemaLibItems.Count()
            if totalP = 0
                m.cinemaFocusZone = "categories"
                updateCinemaPaneFocusUi()
                return true
            end if
            if key = "left"
                if m.cinemaPosterIndex > 0
                    m.cinemaPosterIndex = m.cinemaPosterIndex - 1
                    updateCinemaLibDetail(m.cinemaPosterIndex)
                    updateCinemaPosterShelf(m.cinemaPosterIndex)
                end if
                return true
            else if key = "right"
                if m.cinemaPosterIndex + 1 < totalP
                    m.cinemaPosterIndex = m.cinemaPosterIndex + 1
                    updateCinemaLibDetail(m.cinemaPosterIndex)
                    updateCinemaPosterShelf(m.cinemaPosterIndex)
                end if
                return true
            else if key = "down"
                if m.cinemaPosterIndex + 6 < totalP
                    m.cinemaPosterIndex = m.cinemaPosterIndex + 6
                    updateCinemaLibDetail(m.cinemaPosterIndex)
                    updateCinemaPosterShelf(m.cinemaPosterIndex)
                else if Int(m.cinemaPosterIndex / 6) < Int((totalP - 1) / 6)
                    m.cinemaPosterIndex = totalP - 1
                    updateCinemaLibDetail(m.cinemaPosterIndex)
                    updateCinemaPosterShelf(m.cinemaPosterIndex)
                end if
                return true
            else if key = "up"
                if m.cinemaPosterIndex >= 6
                    m.cinemaPosterIndex = m.cinemaPosterIndex - 6
                    updateCinemaLibDetail(m.cinemaPosterIndex)
                    updateCinemaPosterShelf(m.cinemaPosterIndex)
                else
                    m.cinemaFocusZone = "categories"
                    updateCinemaPaneFocusUi()
                end if
                return true
            else if key = "OK"
                if m.cinemaPosterIndex >= 0 and m.cinemaPosterIndex < totalP
                    mv = m.cinemaLibItems[m.cinemaPosterIndex]
                    if m.cinemaActiveTab = "shows" and m.activeShowGroup = invalid and mv <> invalid and mv.isShowGroup = true and mv.episodes <> invalid and mv.episodes.Count() > 0
                        enterShowSeasons(mv, m.cinemaPosterIndex)
                        return true
                    end if
                    playCinemaItemAtIndex(m.cinemaPosterIndex)
                end if
                return true
            end if
        end if
        return true
    end if

    ' 3. Main Wallboard Bottom Launcher Cards (wallCard0..5, clamped edges)
    if key = "left"
        if m.wallCardIndex > 0
            m.wallCardIndex = m.wallCardIndex - 1
            updateWallLauncherUi()
        end if
        return true
    else if key = "right"
        if m.wallCardIndex < 5
            m.wallCardIndex = m.wallCardIndex + 1
            updateWallLauncherUi()
        end if
        return true
    else if key = "OK" or key = "play"
        launchWallCard(m.wallCardIndex)
        return true
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

    const imagesDir = path.join(targetDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });
    try {
      for (const existing of fs.readdirSync(imagesDir)) {
        if (/^robos-(poster|splash)-[0-9a-f]+_(fhd|hd|sd)\.png$/i.test(existing)) {
          try { fs.unlinkSync(path.join(imagesDir, existing)); } catch {}
        }
      }
    } catch {}
    try {
      for (const [imgName, w, h, isSplash] of [
        ['channel-poster_fhd.png', 540, 405, false],
        ['channel-poster_hd.png', 290, 218, false],
        ['channel-poster_sd.png', 214, 144, false],
        ['splash_fhd.png', 1920, 1080, true],
        ['splash_hd.png', 1280, 720, true],
      ]) {
        const imgFull = path.join(imagesDir, imgName);
        renderRobosWhiteBluePng({ width: w, height: h, isSplash, destPath: imgFull });
        filesCreated.push(imgFull);
      }
    } catch {}
    let iconHash = 'v3';
    try {
      const fhdBuf = fs.readFileSync(path.join(imagesDir, 'channel-poster_fhd.png'));
      iconHash = crypto.createHash('sha256').update(fhdBuf).digest('hex').slice(0, 8);
      for (const [srcName, hashedName] of [
        ['channel-poster_fhd.png', `robos-poster-${iconHash}_fhd.png`],
        ['channel-poster_hd.png', `robos-poster-${iconHash}_hd.png`],
        ['channel-poster_sd.png', `robos-poster-${iconHash}_sd.png`],
        ['splash_fhd.png', `robos-splash-${iconHash}_fhd.png`],
        ['splash_hd.png', `robos-splash-${iconHash}_hd.png`],
      ]) {
        const srcFull = path.join(imagesDir, srcName);
        const dstFull = path.join(imagesDir, hashedName);
        if (fs.existsSync(srcFull)) {
          fs.copyFileSync(srcFull, dstFull);
          filesCreated.push(dstFull);
        }
      }
    } catch {}
    const bundledPkgImageUris = new Set();
    try {
      const tabloCacheDir = path.join(os.homedir(), '.cache', 'robos', 'tablo-images');
      if (fs.existsSync(tabloCacheDir)) {
        for (const f of fs.readdirSync(tabloCacheDir)) {
          const m = f.match(/-(\d+)\.jpg$/i);
          if (m) {
            const destImg = path.join(imagesDir, `tablo-${m[1]}.jpg`);
            fs.copyFileSync(path.join(tabloCacheDir, f), destImg);
            filesCreated.push(destImg);
            bundledPkgImageUris.add(`pkg:/images/tablo-${m[1]}.jpg`);
          }
        }
      }
    } catch {}
    for (const it of initialCinemaLibItems) {
      if (!it || typeof it !== 'object') continue;
      if (it.pkgThumbUri && !bundledPkgImageUris.has(it.pkgThumbUri)) delete it.pkgThumbUri;
      if (it.pkgCoverUri && !bundledPkgImageUris.has(it.pkgCoverUri)) delete it.pkgCoverUri;
    }

    const manifest = [
      `title=${effectiveChannelTitle}`,
      `subtitle=${effectiveSubtitle}`,
      `major_version=${isMoviePlayerChannel ? 2 : 1}`,
      `minor_version=${isMoviePlayerChannel ? 2 : 4}`,
      `build_version=3`,
      `ui_resolutions=fhd`,
      `mm_icon_focus_fhd=pkg:/images/robos-poster-${iconHash}_fhd.png`,
      `mm_icon_focus_hd=pkg:/images/robos-poster-${iconHash}_hd.png`,
      `mm_icon_focus_sd=pkg:/images/robos-poster-${iconHash}_sd.png`,
      `mm_icon_side_hd=pkg:/images/robos-poster-${iconHash}_sd.png`,
      `splash_screen_fhd=pkg:/images/robos-splash-${iconHash}_fhd.png`,
      `splash_screen_hd=pkg:/images/robos-splash-${iconHash}_hd.png`,
      `splash_color=#FFFFFF`,
      `splash_min_time=350`,
      '',
    ].join('\n');

    write('manifest', manifest);
    write('source/Main.brs', mainBrs);
    write(
      'source/cinema-library.json',
      JSON.stringify({
        active: initialCinemaLibActive,
        rev: initialCinemaRev,
        defaultTab: initialCinemaLibDefaultTab,
        items: initialCinemaLibItems,
      })
    );
    write('components/DashboardTask.xml', dashboardTaskXml);
    write('components/DashboardTask.brs', dashboardTaskBrs);
    write('components/MainScene.xml', mainSceneXml);
    write('components/MainScene.brs', mainSceneBrs);
    const defaultPass = rokuDevPassword || 'robos';
    write(
      'sideload-roku.sh',
      `#!/usr/bin/env bash
set -euo pipefail
TV_IP="${tvIp}"
ROKU_USER="\${ROKU_DEV_USER:-rokudev}"
ROKU_PASS="\${ROKU_DEV_PASS:-${defaultPass}}"

rm -f robos-tv-roku.zip
zip -r -q robos-tv-roku.zip manifest source components images
echo "[RobOS TV] Clearing previous dev channel icon cache on Roku ($TV_IP)..."
curl --user "$ROKU_USER:$ROKU_PASS" --digest -s -S \\
  -F "mysubmit=Delete" \\
  -F "archive=" \\
  "http://$TV_IP/plugin_install" >/dev/null 2>&1 || true
echo "[RobOS TV] Uploading robos-tv-roku.zip to Roku ($TV_IP) as $ROKU_USER..."
curl --user "$ROKU_USER:$ROKU_PASS" --digest -s -S \\
  -F "mysubmit=Install" \\
  -F "archive=@robos-tv-roku.zip" \\
  "http://$TV_IP/plugin_install" | grep -i -E "Install Success|Application Received|font color" || true
echo "[RobOS TV] Sideload complete! ${effectiveChannelTitle} is now open on your Roku screen."
`,
      true
    );

    // Also pre-build the zip archive if zip is installed so user can even upload via browser if desired
    try {
      spawnSync('zip', ['-r', '-q', 'robos-tv-roku.zip', 'manifest', 'source', 'components', 'images'], {
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
    tabloIp: tabloClient.DEFAULT_TABLO_IP,
    tabloPort: tabloClient.DEFAULT_TABLO_PORT,
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
    if (!Array.isArray(state.tvs)) state.tvs = [];
  }

  function saveState({ overwriteCinemaState = false } = {}) {
    try {
      fs.mkdirSync(resolvedConfigDir, { recursive: true });
      if (fs.existsSync(stateFile)) {
        try {
          const onDisk = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
          const preserveKeys = overwriteCinemaState
            ? ['defaultTvId', 'defaultTvIp', 'moviePlayerServer', 'moviePlayerLibrarySnapshot']
            : ['defaultTvId', 'defaultTvIp', 'activeCinemaCast', 'activeCinemaLibrary', 'moviePlayerServer', 'moviePlayerLibrarySnapshot', 'tabloCinemaItemsSnapshot'];
          for (const k of preserveKeys) {
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
  const _tabloImageCache = new Map();
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
  const appCastFrameWaiters = new Map();
  let appCastFrameSeq = 0;

  function notifyAppCastWaiters(tvId) {
    if (!tvId) return;
    const key = String(tvId);
    const waiters = appCastFrameWaiters.get(key);
    if (!waiters || waiters.size === 0) return;
    appCastFrameWaiters.delete(key);
    for (const wake of waiters) {
      try { wake(); } catch {}
    }
  }

  function setAppCastFrame(tvId, buf) {
    if (!tvId || !Buffer.isBuffer(buf) || buf.length < 500) return false;
    const key = String(tvId);
    appCastFrameSeq = (appCastFrameSeq % 1000000000) + 1;
    appCastFrames.set(key, { buf, at: Date.now(), seq: appCastFrameSeq });
    notifyAppCastWaiters(key);
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
    if (state.activeCinemaCast && state.activeCinemaCast.active !== false) {
      state.activeCinemaCast = { ...state.activeCinemaCast, active: false };
    }
    if (state.activeCinemaLibrary && state.activeCinemaLibrary.active !== false) {
      state.activeCinemaLibrary = { ...state.activeCinemaLibrary, active: false };
    }
    state.lastRemoteKey = `SHOW ${appCast.title} → ${tv.name}`;
    saveState({ overwriteCinemaState: true });

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
    notifyAppCastWaiters(tvId);
    return { ok: true, appCast: state.appCasts[tvId] };
  }

  function stopAppCast({ tvId, appId } = {}) {
    loadState();
    const casts = { ...(state.appCasts || {}) };
    for (const [id, c] of Object.entries(casts)) {
      if ((tvId && id !== tvId) || (appId && c.appId !== appId)) continue;
      casts[id] = { ...c, active: false, stoppedAt: new Date().toISOString() };
      appCastFrames.delete(id);
      notifyAppCastWaiters(id);
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

        if (u.pathname.startsWith('/art/')) {
          const artFile = path.basename(u.pathname).replace(/[^a-zA-Z0-9._-]/g, '');
          const artDir = path.join(os.homedir(), '.cache', 'robos', 'movie-player', 'art');
          const jpgCandidate = path.join(artDir, artFile.endsWith('.jpg') ? artFile : `${artFile.replace(/\.[^.]+$/, '')}.jpg`);
          if (fs.existsSync(jpgCandidate)) {
            try {
              const buf = fs.readFileSync(jpgCandidate);
              res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': String(buf.length),
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(buf);
              return;
            } catch {}
          }
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Art not found');
          return;
        }

        if (u.pathname === '/api/dashboard-cast') {
          const rokuAppCast = appCastForRequest(req, u, 'roku-os');
          if (rokuAppCast) {
            const afterSeqRaw = u.searchParams.get('afterSeq');
            const afterSeq = afterSeqRaw !== null && afterSeqRaw !== '' ? Number(afterSeqRaw) : -1;
            const sendRokuAppCastFast = () => {
              if (res.writableEnded) return;
              const currentCast = appCastForRequest(req, u, 'roku-os');
              const activeFrameEntry = currentCast ? appCastFrames.get(currentCast.tvId) : null;
              const fastBody = JSON.stringify({
                ok: true,
                appCastActive: Boolean(currentCast),
                appCast: currentCast,
                frameAt: activeFrameEntry ? activeFrameEntry.at : 0,
                frameSeq: activeFrameEntry ? activeFrameEntry.seq || 1 : 0,
                polledAt: Date.now(),
                cinemaCastActive: false,
                cinemaCast: null,
                cinemaLibrary: null,
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
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
              });
              res.end(fastBody);
            };

            const initialEntry = appCastFrames.get(rokuAppCast.tvId);
            const currentSeq = initialEntry ? initialEntry.seq || 1 : 0;
            if (afterSeq >= 0 && currentSeq === afterSeq) {
              const tvKey = String(rokuAppCast.tvId);
              let settled = false;
              let timer = null;
              const wake = () => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                const set = appCastFrameWaiters.get(tvKey);
                if (set) {
                  set.delete(wake);
                  if (set.size === 0) appCastFrameWaiters.delete(tvKey);
                }
                sendRokuAppCastFast();
              };
              if (!appCastFrameWaiters.has(tvKey)) appCastFrameWaiters.set(tvKey, new Set());
              appCastFrameWaiters.get(tvKey).add(wake);
              timer = setTimeout(wake, 750);
              if (typeof timer.unref === 'function') timer.unref();
              req.on('close', () => {
                if (settled) return;
                settled = true;
                if (timer) clearTimeout(timer);
                const set = appCastFrameWaiters.get(tvKey);
                if (set) {
                  set.delete(wake);
                  if (set.size === 0) appCastFrameWaiters.delete(tvKey);
                }
              });
              return;
            }

            sendRokuAppCastFast();
            return;
          }

          const fixHostUrl = (val) => {
            if (!val || typeof val !== 'string') return val;
            return val.replace(/^http:\/\/(\d+\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1):(\d+)\//i, `http://${hostIp}:$2/`);
          };
          const activeCinema = state.activeCinemaCast && state.activeCinemaCast.active !== false && state.activeCinemaCast.mediaUrl
            ? { ...state.activeCinemaCast, mediaUrl: fixHostUrl(state.activeCinemaCast.mediaUrl), active: true }
            : null;
          const rawCinemaItems = [
            ...(Array.isArray(state.moviePlayerLibrarySnapshot)
              ? state.moviePlayerLibrarySnapshot.filter((it) => it && !it.isTablo && it.mediaType !== 'tablo')
              : []),
            ...(Array.isArray(state.tabloCinemaItemsSnapshot) ? state.tabloCinemaItemsSnapshot : []),
          ];
          const cinemaLibItems = rawCinemaItems.map((it) => ({
            ...it,
            artUrl: fixHostUrl(it.artUrl),
            coverUrl: fixHostUrl(it.coverUrl),
            thumbnailUrl: fixHostUrl(it.thumbnailUrl),
            streamUrl: fixHostUrl(it.streamUrl),
            episodes: Array.isArray(it.episodes)
              ? it.episodes.map((ep) => ({
                  ...ep,
                  artUrl: fixHostUrl(ep.artUrl) || fixHostUrl(it.artUrl),
                  streamUrl: fixHostUrl(ep.streamUrl),
                }))
              : undefined,
          }));
          const cinemaLibrary = {
            active: Boolean(state.activeCinemaLibrary && state.activeCinemaLibrary.active !== false),
            defaultTab: state.activeCinemaLibrary?.defaultTab || null,
            tvIp: state.activeCinemaLibrary?.tvIp || null,
            tvName: state.activeCinemaLibrary?.tvName || null,
            server: state.moviePlayerServer || null,
            items: cinemaLibItems,
          };
          const cinemaCastActive = Boolean(activeCinema || cinemaLibrary.active);

          // Fast path: when the TV is playing a movie or in the 10-foot Movie Library,
          // MainScene.brs returns before reading dashboard cards — skip expensive synchronous dashboard widget
          // resolution (git log, gh api, curl, pactl) so the host app's event loop never freezes!
          if (cinemaCastActive) {
            const fastBody = JSON.stringify({
              ok: true,
              appCastActive: false,
              appCast: null,
              frameAt: 0,
              frameSeq: 0,
              polledAt: Date.now(),
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
            tvName: state.activeDashboardCast?.tvName || state.tvs[0]?.name || 'Preview',
            tvIp: state.activeDashboardCast?.tvIp || state.tvs[0]?.ip || hostIp,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(dashHtml);
          return;
        }

        if (u.pathname === '/api/tv-progress') {
          const trackId = u.searchParams.get('id') || '';
          const posSec = Number(u.searchParams.get('positionSec') || 0);
          const durSec = Number(u.searchParams.get('durationSec') || 0);
          const watchedFlag = u.searchParams.get('watched');
          if (trackId && Array.isArray(state.moviePlayerLibrarySnapshot)) {
            const pct = watchedFlag === 'true' ? 100 : durSec > 0 ? Math.min(100, Math.round((posSec / durSec) * 100)) : 0;
            const completed = watchedFlag === 'true' || pct >= 92;
            const inProgress = !completed && posSec >= 5;
            for (const item of state.moviePlayerLibrarySnapshot) {
              if (item.id === trackId || item.repTrackId === trackId) {
                item.positionSec = completed ? 0 : Math.floor(posSec);
                item.progressPct = pct;
                item.inProgress = inProgress;
                item.completed = completed;
              }
              if (Array.isArray(item.episodes)) {
                for (const ep of item.episodes) {
                  if (ep.id === trackId) {
                    ep.positionSec = completed ? 0 : Math.floor(posSec);
                    ep.progressPct = pct;
                    ep.inProgress = inProgress;
                    ep.completed = completed;
                  }
                }
              }
            }
            saveState();
          }
          const mpBase = (state.moviePlayerServer && state.moviePlayerServer.baseUrl) || 'http://127.0.0.1:19215';
          try {
            const fwdUrl = new URL('/api/tv-progress', mpBase);
            u.searchParams.forEach((v, k) => fwdUrl.searchParams.set(k, v));
            http.get(fwdUrl.toString(), () => {}).on('error', () => {});
          } catch {}
          const resp = JSON.stringify({ ok: true, id: trackId, positionSec: posSec });
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(resp);
          return;
        }

        if (u.pathname === '/movie-player' || u.pathname === '/cinema-library') {
          const rawItems = [
            ...(Array.isArray(state.moviePlayerLibrarySnapshot)
              ? state.moviePlayerLibrarySnapshot.filter((it) => it && !it.isTablo && it.mediaType !== 'tablo')
              : []),
            ...(Array.isArray(state.tabloCinemaItemsSnapshot) ? state.tabloCinemaItemsSnapshot : []),
          ];
          const fixUrl = (val) => {
            if (!val || typeof val !== 'string') return val;
            return val.replace(/^http:\/\/(\d+\.\d+\.\d+\.\d+|localhost|127\.0\.0\.1):(\d+)\//i, `http://${hostIp}:$2/`);
          };
          const items = rawItems.map((it) => ({
            ...it,
            artUrl: fixUrl(it.artUrl),
            coverUrl: fixUrl(it.coverUrl),
            thumbnailUrl: fixUrl(it.thumbnailUrl),
            streamUrl: fixUrl(it.browserStreamUrl || it.streamUrl),
            episodes: Array.isArray(it.episodes)
              ? it.episodes.map((ep) => ({
                  ...ep,
                  artUrl: fixUrl(ep.artUrl) || fixUrl(it.artUrl),
                  streamUrl: fixUrl(ep.streamUrl),
                }))
              : undefined,
          }));
          const itemsJson = JSON.stringify(items);
          const defaultTabInit = JSON.stringify(u.searchParams.get('tab') || state.activeCinemaLibrary?.defaultTab || 'movies');
          const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RobOS Cinema+ — 10-Foot Smart TV Streaming Library (100% Visual Image-Card UX)</title>
  <style>
    :root { --bg: #110e0b; --surface: #17130f; --surface2: #1e1914; --border: #2e261e; --accent: #e8a33d; --cyan: #38bdf8; --purple: #a855f7; --green: #22c55e; --text: #f1e9dc; --muted: #a89f91; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; height: 100vh; overflow: hidden; display: flex; flex-direction: column; user-select: none; }
    header { height: 92px; background: var(--surface); border-bottom: 3px solid var(--accent); display: flex; align-items: center; justify-content: space-between; padding: 0 36px; gap: 18px; flex-shrink: 0; }
    .brand-group { display: flex; align-items: center; gap: 14px; }
    .brand-card { display: flex; align-items: center; gap: 10px; background: #1a140e; border: 2px solid var(--accent); border-radius: 8px; padding: 8px 14px; }
    .brand-logo { width: 40px; height: 42px; border-radius: 6px; background: var(--accent); color: #110e0b; font-weight: 900; font-size: 16px; display: flex; align-items: center; justify-content: center; }
    .top-tabs { display: flex; gap: 12px; }
    .top-tab-card { display: flex; align-items: center; gap: 12px; width: 320px; height: 68px; padding: 8px 12px; border-radius: 10px; background: #1b1612; border: 2px solid var(--border); cursor: pointer; position: relative; text-align: left; color: var(--text); }
    .top-tab-card.active-movies { background: #2b2114; border-color: var(--accent); }
    .top-tab-card.active-shows { background: #152536; border-color: var(--cyan); }
    .top-tab-card.focused { border-color: #ffffff; box-shadow: 0 0 0 2px #ffffff; }
    .tab-thumb { width: 38px; height: 52px; border-radius: 5px; background: var(--accent); overflow: hidden; position: relative; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 11px; color: #110e0b; }
    .tab-thumb.shows { background: var(--cyan); }
    .tab-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .tab-meta { flex: 1; min-width: 0; }
    .tab-title { font-size: 15px; font-weight: 900; color: #fcd34d; letter-spacing: 0.04em; }
    .top-tab-card.active-shows .tab-title { color: #67e8f9; }
    .tab-sub { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .zone-compass { background: #211b15; border-left: 5px solid var(--accent); padding: 10px 16px; border-radius: 6px; min-width: 390px; }
    .zone-title { color: #fcd34d; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; }
    .zone-sub { color: #d6cfc2; font-size: 11px; margin-top: 3px; }
    .stage { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 14px 36px; overflow: hidden; }
    .hero { background: linear-gradient(135deg, #1b1611 0%, #221b14 60%, #2a2017 100%); border: 1px solid var(--border); border-top: 4px solid var(--accent); border-radius: 12px; padding: 14px 22px; display: flex; gap: 22px; align-items: stretch; height: 248px; flex-shrink: 0; }
    .hero-poster { width: 152px; height: 220px; border-radius: 8px; border: 2px solid var(--accent); background: #241d16; display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; flex-shrink: 0; position: relative; }
    .hero-poster img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .prog-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: rgba(0,0,0,0.85); z-index: 3; }
    .prog-fill { height: 100%; background: var(--accent); }
    .prog-fill.done { background: var(--green); }
    .hero-body { flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0; }
    .eyebrow-row { display: flex; align-items: center; gap: 12px; }
    .spotlight-tag { background: var(--accent); color: #110e0b; font-size: 11px; font-weight: 900; padding: 4px 10px; border-radius: 4px; letter-spacing: 0.06em; }
    .spotlight-tag.tv { background: var(--cyan); }
    .eyebrow-text { color: #fcd34d; font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
    .detail-title { font-size: 26px; font-weight: 800; margin: 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .badges-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
    .m-badge { padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #261f18; border-left: 3px solid var(--accent); color: #fcd34d; }
    .m-badge.cyan { background: #152536; border-left-color: var(--cyan); color: #67e8f9; }
    .m-badge.purple { background: #241b2f; border-left-color: var(--purple); color: #d8b4fe; }
    .m-badge.green { background: #11281e; border-left-color: var(--green); color: #86efac; }
    .detail-meta { font-size: 13px; color: var(--text); margin-bottom: 4px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail-synopsis { font-size: 12px; color: #d6cfc2; line-height: 1.4; margin-bottom: 6px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cta-row { display: flex; gap: 14px; align-items: center; }
    .play-cta { background: var(--accent); color: #110e0b; font-weight: 900; padding: 9px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; border: none; letter-spacing: 0.03em; }
    .nav-pill { background: #221c16; border-left: 4px solid var(--cyan); color: #67e8f9; padding: 8px 14px; font-size: 12px; font-weight: 700; border-radius: 4px; }
    .cat-shelf { background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--border); border-radius: 10px; padding: 10px 16px; flex-shrink: 0; }
    .cat-shelf.zone-active { border-top-color: #fcd34d; }
    .row-hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .pane-title { font-size: 12px; font-weight: 800; color: var(--accent); letter-spacing: 0.06em; text-transform: uppercase; }
    .pane-pos { font-size: 12px; color: var(--muted); font-weight: 600; }
    .cat-cards-row { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
    .c-card { background: #1d1813; border: 2px solid var(--border); border-bottom: 4px solid var(--border); border-radius: 8px; padding: 8px; display: flex; gap: 10px; align-items: center; cursor: pointer; min-width: 0; }
    .c-card.active { border-color: var(--accent); border-bottom-color: var(--accent); background: #281f15; }
    .c-card.focused { border-color: #ffffff; box-shadow: 0 0 0 2px #ffffff; background: #382b19; }
    .c-art { width: 46px; height: 68px; border-radius: 5px; background: #3b2314; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; color: #fcd34d; flex-shrink: 0; overflow: hidden; position: relative; }
    .c-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .c-info { min-width: 0; flex: 1; }
    .c-tag { font-size: 10px; font-weight: 800; color: #67e8f9; letter-spacing: 0.05em; }
    .c-title { font-size: 13px; font-weight: 800; color: #f8fafc; margin: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .c-count { font-size: 11px; color: #fcd34d; font-weight: 700; }
    .poster-shelf { flex: 1; background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--accent); border-radius: 10px; padding: 10px 16px; display: flex; flex-direction: column; overflow: hidden; }
    .poster-row { flex: 1; display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; min-height: 0; }
    .p-card { background: var(--surface2); border: 2px solid var(--border); border-radius: 10px; padding: 8px; display: flex; flex-direction: column; cursor: pointer; min-width: 0; min-height: 0; }
    .p-card.focused { border-color: #ffffff; box-shadow: 0 0 0 2px var(--accent); background: #2e2318; }
    .p-art { flex: 1; width: 100%; border-radius: 6px; background: #2d1b36; display: flex; align-items: center; justify-content: center; font-weight: 900; color: #fcd34d; font-size: 28px; overflow: hidden; position: relative; min-height: 150px; }
    .p-art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .p-pill { position: absolute; top: 6px; right: 6px; background: rgba(17,14,11,0.9); color: #fcd34d; font-size: 10px; font-weight: 800; padding: 3px 7px; border-radius: 4px; z-index: 2; }
    .p-info { padding-top: 6px; }
    .p-title { font-size: 13px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .p-card.focused .p-title { color: #fcd34d; }
    .p-genre { font-size: 11px; color: #67e8f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin: 2px 0; }
    .p-state { font-size: 11px; color: #86efac; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #video-overlay { position: fixed; inset: 0; background: #000; display: none; z-index: 100; }
    #video-overlay.active { display: flex; flex-direction: column; }
    #tv-video { width: 100%; height: 100%; background: #000; }
  </style>
</head>
<body>
  <header>
    <div class="brand-group">
      <div class="brand-card">
        <div class="brand-logo">RC+</div>
        <div>
          <div style="font-size:13px;font-weight:900;color:#fcd34d;letter-spacing:0.04em;">ROBOS CINEMA+</div>
          <div style="font-size:10px;color:#d6cfc2;">100% IMAGE-CARD UX</div>
        </div>
      </div>
      <div class="top-tabs">
        <div class="top-tab-card active-movies" id="tab-movies">
          <div class="tab-thumb" id="tab-movies-thumb">FILM</div>
          <div class="tab-meta">
            <div class="tab-title" id="tab-movies-title">MOVIES</div>
            <div class="tab-sub" id="tab-movies-sub">Feature Films · 4K &amp; BluRay</div>
          </div>
        </div>
        <div class="top-tab-card" id="tab-shows">
          <div class="tab-thumb shows" id="tab-shows-thumb">SHOW</div>
          <div class="tab-meta">
            <div class="tab-title" id="tab-shows-title">TV SHOWS</div>
            <div class="tab-sub" id="tab-shows-sub">Series · Seasons &amp; Episodes</div>
          </div>
        </div>
        <div class="top-tab-card" id="tab-tablo">
          <div class="tab-thumb shows" id="tab-tablo-thumb" style="background:#00bcd4;">DVR</div>
          <div class="tab-meta">
            <div class="tab-title" id="tab-tablo-title" style="color:#67e8f9;">TABLO DVR</div>
            <div class="tab-sub" id="tab-tablo-sub">OTA Recordings</div>
          </div>
        </div>
        <div class="top-tab-card" id="tab-back" style="display:none;width:250px;">
          <div class="tab-thumb shows" id="tab-back-thumb">ALL</div>
          <div class="tab-meta">
            <div class="tab-title" style="color:#67e8f9;">ALL TV SHOWS</div>
            <div class="tab-sub">Return to Series Grid</div>
          </div>
        </div>
      </div>
    </div>
    <div class="zone-compass">
      <div class="zone-title" id="active-cat-pill">ROW 3 OF 3: MOVIE POSTER CARDS</div>
      <div class="zone-sub" id="zone-sub-hint">▲/▼ SWITCH ROW (TABS / CATEGORIES / POSTERS) · ◀/▶ MOVE ACROSS ROW</div>
    </div>
  </header>
  <div class="stage">
    <div class="hero">
      <div class="hero-poster" id="poster-box"></div>
      <div class="hero-body">
        <div>
          <div class="eyebrow-row">
            <span class="spotlight-tag" id="spotlight-tag">FEATURE FILM</span>
            <span class="eyebrow-text" id="hero-eyebrow">ROBOS CINEMA+</span>
          </div>
          <h2 class="detail-title" id="detail-title">Select a Title</h2>
          <div class="badges-row">
            <span class="m-badge" id="badge-year">2024</span>
            <span class="m-badge" id="badge-rating">★ 8.5</span>
            <span class="m-badge cyan" id="badge-qual">1080p HD</span>
            <span class="m-badge purple" id="badge-genre">Sci-Fi &amp; Fantasy</span>
            <span class="m-badge green" id="badge-status">DIRECT PLAY</span>
          </div>
          <div class="detail-meta" id="detail-meta">1080p WEBRip · RobOS Cinema</div>
          <div class="detail-synopsis" id="detail-synopsis">Full HD home theater playback with real public metadata and watch progress sync.</div>
        </div>
        <div class="cta-row">
          <button class="play-cta" id="play-btn">▶ WATCH NOW (PRESS OK)</button>
          <span class="nav-pill">▲ UP: CATEGORY CARDS &amp; MOVIES/SHOWS TABS · ◀/▶ LEFT/RIGHT: BROWSE CARDS · ▼ DOWN: +6 POSTERS</span>
        </div>
      </div>
    </div>
    <div class="cat-shelf" id="cat-pane">
      <div class="row-hdr">
        <div class="pane-title" id="cat-pane-title">ROW 2 · MOVIE CATEGORY IMAGE CARDS (◀/▶ FILTER · ▲ UP TO TABS · ▼ DOWN TO POSTERS)</div>
        <div class="pane-pos" id="cat-pos-label">Category 1 of 12</div>
      </div>
      <div class="cat-cards-row" id="cat-list"></div>
    </div>
    <div class="poster-shelf" id="poster-pane">
      <div class="row-hdr">
        <div class="pane-title" id="shelf-title">ROW 3 · 2:3 PORTRAIT POSTER GALLERY (◀/▶ MOVE · ▼ NEXT 6 · OK WATCH · ▲ UP TO CATEGORIES &amp; TABS)</div>
        <div class="pane-pos" id="poster-pos-label">Movie 1 of 107</div>
      </div>
      <div class="poster-row" id="poster-row"></div>
    </div>
  </div>
  <div id="video-overlay">
    <video id="tv-video" controls autoplay></video>
  </div>
  <script>
    const ALL_ITEMS = ${itemsJson};
    const MOVIE_CATEGORIES = [
      { id: 'all', tag: 'COLLECTION', mono: 'ALL', label: 'All Movies' },
      { id: 'continue', tag: 'RESUME', mono: 'GO', label: 'Continue Watching' },
      { id: 'franchises', tag: 'BOX SETS', mono: 'BOX', label: 'Franchises & Saga' },
      { id: 'scifi', tag: 'GENRE', mono: 'SCI', label: 'Sci-Fi & Fantasy' },
      { id: 'action', tag: 'GENRE', mono: 'ACT', label: 'Action & Adventure' },
      { id: 'horror', tag: 'GENRE', mono: 'HOR', label: 'Horror & Mystery' },
      { id: 'family', tag: 'GENRE', mono: 'FAM', label: 'Animation & Family' },
      { id: 'comedy', tag: 'GENRE', mono: 'COM', label: 'Comedy & Romance' },
      { id: 'thriller', tag: 'GENRE', mono: 'THR', label: 'Thriller & Crime' },
      { id: 'uhd', tag: 'QUALITY', mono: '4K', label: '4K UHD & BluRay' },
      { id: 'new', tag: 'RELEASES', mono: 'NEW', label: 'New (2023-2026)' },
      { id: 'classics', tag: 'ARCHIVE', mono: 'CLS', label: 'Classics (Pre-2010)' }
    ];
    const SHOW_CATEGORIES = [
      { id: 'all', tag: 'COLLECTION', mono: 'ALL', label: 'All TV Shows' },
      { id: 'continue', tag: 'RESUME', mono: 'GO', label: 'Continue Watching' },
      { id: 'networks', tag: 'STREAMING', mono: 'TV+', label: 'Networks & Originals' },
      { id: 'scifi', tag: 'GENRE', mono: 'SCI', label: 'Sci-Fi & Fantasy' },
      { id: 'drama', tag: 'GENRE', mono: 'DRM', label: 'Drama & Crime' },
      { id: 'action', tag: 'GENRE', mono: 'ACT', label: 'Action & Adventure' },
      { id: 'horror', tag: 'GENRE', mono: 'HOR', label: 'Horror & Supernatural' },
      { id: 'comedy', tag: 'GENRE', mono: 'COM', label: 'Comedy & Animation' }
    ];
    const TABLO_CATEGORIES = [
      { id: 'all', tag: 'TABLO DVR', mono: 'DVR', label: 'All Recordings' },
      { id: 'sports', tag: 'LIVE SPORTS', mono: 'SPT', label: 'NFL & MLB Sports' },
      { id: 'series', tag: 'TV SHOWS', mono: 'SER', label: 'Series & Episodes' },
      { id: 'news', tag: 'LOCAL NEWS', mono: 'NWS', label: 'Local News' },
      { id: 'fox', tag: 'CHANNEL 47.1', mono: 'FOX', label: '47.1 WMSNFOX' },
      { id: 'nbc', tag: 'CHANNEL 15.1', mono: 'NBC', label: '15.1 WMTVNBC' }
    ];
    let activeTab = ${defaultTabInit};
    let activeShowGroup = null;
    let activeShowSeasons = [];
    let focusZone = 'posters'; // 'tabs' | 'categories' | 'posters'
    let tabCol = 0;
    let catIdx = 0;
    let idx = 0;
    let lastShowIdx = 0;
    let ITEMS = [];
    function classify(m) {
      const hay = ((m.title || '') + ' ' + (m.album || '') + ' ' + (m.genre || '')).toLowerCase();
      const qHay = ((m.artist || '') + ' ' + (m.qualityBadge || '')).toLowerCase();
      const franchise = m.franchise || '';
      const isTablo = m.mediaType === 'tablo' || !!m.isTablo;
      const isTv = !isTablo && (m.mediaType === 'tv' || !!m.isShowGroup || /s01e|s02e|tv series/.test(hay));
      const isScifi = /dune|harry potter|lord of the rings|fellowship|two towers|return of the king|ex machina|serenity|wicked|wizard of oz|willow|ne zha|backrooms|sci-fi|science-fiction|science fiction|fantasy|fallout|firefly|foundation|game of thrones|house of the dragon|rick and morty|severance|silo|stranger things|the last of us|mandalorian|westworld|avatar/.test(hay);
      const isAction = /avengers|endgame|infinity war|mortal kombat|resident evil|dune|lord of the rings|harry potter|willow|hunting games|outpost|serenity|ne zha|action|adventure|archer|avatar|fallout|firefly|game of thrones|house of the dragon|the boys|the last of us|mandalorian/.test(hay);
      const isHorror = /conjuring|annabelle|insidious|scream|paranormal activity|the nun|nun ii|final destination|friday the 13th|halloween|terrifier|babadook|malignant|it follows|smile|orphan|lights out|five nights at freddy|jennifers body|megan is missing|backrooms|other mommy|hokum|horror|supernatural|stranger things|the last of us|wednesday|yellowjackets/.test(hay);
      const isFamily = /inside out|rileys first date|tangled|zootopia|super mario|ne zha|matilda|cruella|spirited|wizard of oz|wicked|kpop demon hunters|harry potter|animation|family|bluey|avatar/.test(hay);
      const isComedy = /scary movie|anyone but you|ticket to paradise|four rooms|beetlejuice|buddy|spirited|men up|heist before christmas|cruella|matilda|atypical|jennifers body|rileys first date|comedy|archer|bluey|bojack|rick and morty|south park|ted lasso|the bear|the office|white lotus|wednesday/.test(hay);
      const isThriller = /ready or not|missing|housemaid|obsession|passenger|orphan|scream|final destination|ex machina|it follows|malignant|hunting games|outpost|thriller|crime|mystery|breaking bad|dexter|severance|sopranos|true detective|yellowjackets/.test(hay);
      const isUhd = /2160p|4k|bluray|brrip/.test(qHay);
      const yr = Number(m.year) || 0;
      const primaryGenre = m.genre ? String(m.genre).split(',')[0].trim() : (isTv ? 'TV Series' : isScifi ? 'Sci-Fi & Fantasy' : isAction ? 'Action & Adventure' : isFamily ? 'Animation & Family' : isComedy ? 'Comedy & Romance' : isHorror ? 'Horror & Supernatural' : isThriller ? 'Thriller & Mystery' : 'Drama & Cinema');
      const qual = /2160p|4k/.test(qHay) ? '4K UHD' : /720p/.test(qHay) ? '720p HD' : '1080p HD';
      return { franchise, primaryGenre, qual, isTablo, isTv, isScifi, isAction, isHorror, isFamily, isComedy, isThriller, isUhd, isNew: yr >= 2023, isClassic: yr > 0 && yr < 2010 };
    }
    function matchesCat(m, catId) {
      const c = classify(m);
      if (activeTab === 'tablo') {
        if (!c.isTablo) return false;
        if (catId === 'all') return true;
        const hay = ((m.title || '') + ' ' + (m.network || '') + ' ' + (m.genre || '')).toLowerCase();
        if (catId === 'sports') return m.tabloKind === 'sports' || /nfl|mlb|football|baseball/.test(hay);
        if (catId === 'series') return m.tabloKind === 'series' && !/news/.test(hay);
        if (catId === 'news') return /news/.test(hay);
        if (catId === 'fox') return /47\.1|fox/.test(hay);
        if (catId === 'nbc') return /15\.1|nbc/.test(hay);
        return true;
      }
      if (activeTab === 'shows' && (!c.isTv || c.isTablo)) return false;
      if (activeTab === 'movies' && (c.isTv || c.isTablo)) return false;
      if (catId === 'all') return true;
      if (catId === 'continue') return !!(m.inProgress || m.inProgressCount > 0);
      if (catId === 'networks') return true;
      if (catId === 'drama') return !c.isScifi && !c.isComedy && !c.isHorror;
      if (catId === 'franchises') return !!c.franchise;
      return !!c['is' + catId.charAt(0).toUpperCase() + catId.slice(1)];
    }
    const catListEl = document.getElementById('cat-list');
    const posterRowEl = document.getElementById('poster-row');
    const overlay = document.getElementById('video-overlay');
    const videoEl = document.getElementById('tv-video');
    function switchTab(tab) {
      activeTab = tab;
      activeShowGroup = null;
      activeShowSeasons = [];
      tabCol = tab === 'tablo' ? 2 : tab === 'shows' ? 1 : 0;
      catIdx = 0;
      idx = 0;
      render();
    }
    function enterShow(showObj, showIndex) {
      if (!showObj || !Array.isArray(showObj.episodes) || !showObj.episodes.length) return;
      lastShowIdx = showIndex;
      activeShowGroup = showObj;
      const eps = showObj.episodes;
      const map = new Map();
      eps.forEach(ep => {
        const s = ep.seasonNumber != null ? Number(ep.seasonNumber) : 1;
        if (!map.has(s)) map.set(s, []);
        map.get(s).push(ep);
      });
      const seasons = [
        { id: '__back_shows__', tag: 'RETURN', mono: 'ALL', label: 'All TV Shows', countText: 'Back to Series', artUrl: showObj.artUrl, episodes: [] },
        { id: 'all', tag: 'COMPLETE SERIES', mono: 'ALL', label: 'All Seasons', countText: eps.length + ' Episodes', artUrl: showObj.artUrl, episodes: eps }
      ];
      Array.from(map.keys()).sort((a, b) => (a === 0 ? 9999 : a) - (b === 0 ? 9999 : b)).forEach(s => {
        const sEps = map.get(s);
        seasons.push({
          id: 's_' + s,
          tag: s === 0 ? 'SPECIALS' : ('SEASON ' + s),
          mono: s === 0 ? 'SPC' : ('S' + String(s).padStart(2, '0')),
          label: s === 0 ? 'Specials' : ('Season ' + s),
          countText: sEps.length + ' Episodes',
          artUrl: (sEps[0] && sEps[0].artUrl) || showObj.artUrl,
          episodes: sEps
        });
      });
      activeShowSeasons = seasons;
      catIdx = seasons.length > 2 ? 2 : 1;
      idx = 0;
      focusZone = 'posters';
      render();
    }
    function exitShow() {
      activeShowGroup = null;
      activeShowSeasons = [];
      tabCol = 1;
      idx = lastShowIdx || 0;
      focusZone = 'posters';
      render();
    }
    document.getElementById('tab-movies').onclick = () => { switchTab('movies'); focusZone = 'posters'; render(); };
    document.getElementById('tab-shows').onclick = () => { switchTab('shows'); focusZone = 'posters'; render(); };
    document.getElementById('tab-tablo').onclick = () => { switchTab('tablo'); focusZone = 'posters'; render(); };
    document.getElementById('tab-back').onclick = () => exitShow();
    function render() {
      const moviesList = ALL_ITEMS.filter(m => !classify(m).isTv && !classify(m).isTablo);
      const showsList = ALL_ITEMS.filter(m => classify(m).isTv);
      const tabloList = ALL_ITEMS.filter(m => classify(m).isTablo);
      const firstMovieArt = (moviesList.find(m => m.artUrl) || {}).artUrl || '';
      const firstShowArt = (showsList.find(m => m.artUrl) || {}).artUrl || '';
      const firstTabloArt = (tabloList.find(m => m.artUrl) || {}).artUrl || '';
      document.getElementById('tab-movies-title').textContent = 'MOVIES (' + moviesList.length + ')';
      document.getElementById('tab-shows-title').textContent = 'TV SHOWS (' + showsList.length + ' SERIES)';
      document.getElementById('tab-tablo-title').textContent = 'TABLO DVR (' + tabloList.length + ')';
      if (firstMovieArt) document.getElementById('tab-movies-thumb').innerHTML = '<img src="' + firstMovieArt + '" alt="" />';
      if (firstShowArt) {
        document.getElementById('tab-shows-thumb').innerHTML = '<img src="' + firstShowArt + '" alt="" />';
        document.getElementById('tab-back-thumb').innerHTML = '<img src="' + firstShowArt + '" alt="" />';
      }
      if (firstTabloArt) {
        document.getElementById('tab-tablo-thumb').innerHTML = '<img src="' + firstTabloArt + '" alt="" />';
      }
      const tabM = document.getElementById('tab-movies');
      const tabS = document.getElementById('tab-shows');
      const tabT = document.getElementById('tab-tablo');
      const tabB = document.getElementById('tab-back');
      tabM.className = 'top-tab-card ' + (activeTab === 'movies' ? 'active-movies ' : '') + (focusZone === 'tabs' && tabCol === 0 ? 'focused' : '');
      tabS.className = 'top-tab-card ' + (activeTab === 'shows' ? 'active-shows ' : '') + (focusZone === 'tabs' && tabCol === 1 ? 'focused' : '');
      tabT.className = 'top-tab-card ' + (activeTab === 'tablo' ? 'active-shows ' : '') + (focusZone === 'tabs' && tabCol === 2 ? 'focused' : '');
      tabB.style.display = activeShowGroup ? 'flex' : 'none';
      tabB.className = 'top-tab-card active-shows ' + (focusZone === 'tabs' && tabCol === 3 ? 'focused' : '');
      document.getElementById('cat-pane').className = 'cat-shelf ' + (focusZone === 'categories' ? 'zone-active' : '');

      if (activeShowGroup) {
        document.getElementById('cat-pane-title').textContent = 'ROW 2 · SEASONS: ' + activeShowGroup.title.toUpperCase() + ' (◀/▶ SELECT SEASON · ▲ UP TO TABS · ▼ DOWN TO EPISODES)';
        const sObj = activeShowSeasons[catIdx] || activeShowSeasons[1] || { episodes: [] };
        if (sObj.id !== '__back_shows__') ITEMS = sObj.episodes || [];
        document.getElementById('cat-pos-label').textContent = 'Season Card ' + (catIdx + 1) + ' of ' + activeShowSeasons.length;
        const cWinStart = Math.max(0, Math.min(catIdx - 2, Math.max(0, activeShowSeasons.length - 6)));
        const visSeasons = activeShowSeasons.slice(cWinStart, cWinStart + 6);
        catListEl.innerHTML = visSeasons.map((s, slot) => {
          const realC = cWinStart + slot;
          const cls = (realC === catIdx ? 'active ' : '') + (focusZone === 'categories' && realC === catIdx ? 'focused' : '');
          return '<div class="c-card ' + cls + '" data-cidx="' + realC + '">' +
            '<div class="c-art">' + s.mono + (s.artUrl ? '<img src="' + s.artUrl + '" alt="" />' : '') + '</div>' +
            '<div class="c-info"><div class="c-tag">' + s.tag + '</div><div class="c-title">' + s.label + '</div><div class="c-count">' + s.countText + '</div></div></div>';
        }).join('');
      } else {
        const cats = activeTab === 'tablo' ? TABLO_CATEGORIES : activeTab === 'shows' ? SHOW_CATEGORIES : MOVIE_CATEGORIES;
        document.getElementById('cat-pane-title').textContent = activeTab === 'tablo' ? 'ROW 2 · TABLO DVR RECORDING CATEGORIES (◀/▶ FILTER · ▲ UP TO TABS · ▼ DOWN TO RECORDINGS)' : activeTab === 'shows' ? 'ROW 2 · TV SHOW CATEGORY CARDS (◀/▶ FILTER · ▲ UP TO TABS · ▼ DOWN TO POSTERS)' : 'ROW 2 · MOVIE CATEGORY CARDS (◀/▶ FILTER · ▲ UP TO TABS · ▼ DOWN TO POSTERS)';
        const cat = cats[catIdx] || cats[0];
        ITEMS = ALL_ITEMS.filter(m => matchesCat(m, cat.id));
        document.getElementById('cat-pos-label').textContent = 'Category ' + (catIdx + 1) + ' of ' + cats.length;
        const cWinStart = Math.max(0, Math.min(catIdx - 2, Math.max(0, cats.length - 6)));
        const visCats = cats.slice(cWinStart, cWinStart + 6);
        catListEl.innerHTML = visCats.map((c, slot) => {
          const realC = cWinStart + slot;
          const matches = ALL_ITEMS.filter(m => matchesCat(m, c.id));
          const repArt = (matches.find(m => m.artUrl) || {}).artUrl || '';
          const cls = (realC === catIdx ? 'active ' : '') + (focusZone === 'categories' && realC === catIdx ? 'focused' : '');
          return '<div class="c-card ' + cls + '" data-cidx="' + realC + '">' +
            '<div class="c-art">' + c.mono + (repArt ? '<img src="' + repArt + '" alt="" />' : '') + '</div>' +
            '<div class="c-info"><div class="c-tag">' + c.tag + '</div><div class="c-title">' + c.label + '</div><div class="c-count">' + matches.length + (activeTab === 'shows' ? ' Series' : ' Films') + '</div></div></div>';
        }).join('');
      }

      document.getElementById('active-cat-pill').textContent = focusZone === 'tabs'
        ? 'ROW 1 OF 3: MOVIES & TV SHOWS TABS'
        : focusZone === 'categories'
        ? 'ROW 2 OF 3: CATEGORY / SEASON IMAGE CARDS'
        : 'ROW 3 OF 3: 2:3 PORTRAIT POSTER CARDS';

      if (idx >= ITEMS.length) idx = 0;
      document.getElementById('poster-pos-label').textContent = (activeShowGroup ? 'Episode ' : activeTab === 'shows' ? 'Series ' : 'Movie ') + (ITEMS.length ? (idx + 1) : 0) + ' of ' + ITEMS.length;
      const winStart = Math.max(0, Math.min(idx - 2, Math.max(0, ITEMS.length - 6)));
      const shelfItems = ITEMS.slice(winStart, winStart + 6);
      posterRowEl.innerHTML = shelfItems.map((m, s) => {
        const realIdx = winStart + s;
        const info = classify(m);
        const mono = String(m.episodeCode || m.title || 'M').replace(/^the\\s+/i, '').slice(0, 4).toUpperCase();
        const pct = m.completed ? 100 : (m.progressPct || 0);
        const progHtml = pct > 0 ? '<div class="prog-bar"><div class="prog-fill ' + (m.completed ? 'done' : '') + '" style="width:' + pct + '%"></div></div>' : '';
        const bdgTxt = activeShowGroup ? (m.episodeCode || 'EP') : m.isShowGroup ? (m.seasonCount + 'S · ' + m.episodeCount + ' Eps') : ((m.year || 'HD') + (m.rating ? ' · ★ ' + m.rating : ' · ' + info.qual));
        const ttlTxt = activeShowGroup ? (m.episodeTitle || m.title) : m.title;
        const stateTxt = m.inProgress ? ('▶ RESUME ' + m.progressPct + '%') : m.completed ? '✓ WATCHED' : (m.isShowGroup && !activeShowGroup) ? ('OK: SEASONS (' + (m.episodeCode || 'S01E01') + ')') : (realIdx === idx ? '▶ PRESS OK TO WATCH' : ('#' + (realIdx + 1) + ' · Direct Play'));
        const artSrc = m.artUrl || (activeShowGroup && activeShowGroup.artUrl) || '';
        return '<div class="p-card ' + (focusZone === 'posters' && realIdx === idx ? 'focused' : '') + '" data-idx="' + realIdx + '">' +
          '<div class="p-art">' + mono + (artSrc ? '<img src="' + artSrc + '" alt="" />' : '') + '<span class="p-pill">' + bdgTxt + '</span>' + progHtml + '</div>' +
          '<div class="p-info"><div class="p-title">' + ttlTxt + '</div><div class="p-genre">' + (m.network || info.franchise || info.primaryGenre) + '</div><div class="p-state">' + stateTxt + '</div></div></div>';
      }).join('');

      const cur = ITEMS[idx];
      if (cur) {
        const info = classify(cur);
        const spTag = document.getElementById('spotlight-tag');
        spTag.textContent = activeShowGroup ? 'TV EPISODE' : cur.isShowGroup ? 'TV SERIES' : 'FEATURE FILM';
        spTag.className = 'spotlight-tag ' + ((activeShowGroup || cur.isShowGroup) ? 'tv' : '');
        document.getElementById('hero-eyebrow').textContent = activeShowGroup ? (activeShowGroup.title + ' · ' + (cur.episodeCode || '')) : cur.isShowGroup ? ((cur.network || 'TV SERIES') + ' · ' + cur.seasonCount + ' SEASONS · ' + cur.episodeCount + ' EPISODES') : ((info.franchise || 'ROBOS CINEMA+') + ' · ' + info.primaryGenre.toUpperCase());
        document.getElementById('detail-title').textContent = activeShowGroup ? ((cur.episodeCode || '') + ' — ' + (cur.episodeTitle || cur.title)) : cur.title;
        document.getElementById('badge-year').textContent = activeShowGroup ? (cur.episodeCode || 'Episode') : cur.isShowGroup ? (cur.seasonCount + ' Seasons') : (cur.year || 'Feature');
        document.getElementById('badge-rating').textContent = cur.rating ? ('★ ' + cur.rating + ' / 10') : cur.isShowGroup ? (cur.episodeCount + ' Episodes') : info.qual;
        document.getElementById('badge-qual').textContent = cur.network || info.qual;
        document.getElementById('badge-genre').textContent = cur.genre || info.primaryGenre;
        document.getElementById('badge-status').textContent = cur.inProgress ? ('RESUME ' + cur.progressPct + '%') : cur.completed ? '✓ WATCHED' : 'DIRECT PLAY';
        document.getElementById('detail-meta').textContent = cur.isShowGroup ? ('Up Next: ' + (cur.episodeCode || 'S01E01') + ' (' + (cur.episodeTitle || '') + ')') : ([cur.director ? 'Dir: ' + cur.director : '', cur.cast ? 'Cast: ' + cur.cast : ''].filter(Boolean).join(' · ') || cur.artist || 'Feature Film');
        document.getElementById('detail-synopsis').textContent = cur.overview || (activeShowGroup && activeShowGroup.overview) || 'Full HD home theater stream ready on your LAN.';
        const pct = cur.completed ? 100 : (cur.progressPct || 0);
        const progHtml = pct > 0 ? '<div class="prog-bar"><div class="prog-fill ' + (cur.completed ? 'done' : '') + '" style="width:' + pct + '%"></div></div>' : '';
        const artSrc = cur.artUrl || (activeShowGroup && activeShowGroup.artUrl) || '';
        document.getElementById('poster-box').innerHTML = (artSrc ? '<img src="' + artSrc + '" alt="" />' : '') + progHtml + '<div style="margin:auto;font-size:42px;font-weight:800;color:#fcd34d;">' + String(cur.title || 'M').slice(0, 2).toUpperCase() + '</div>';
        document.getElementById('play-btn').textContent = (cur.isShowGroup && !activeShowGroup) ? '▶ BROWSE SEASONS & EPISODES (OK)' : cur.inProgress ? ('▶ RESUME (' + cur.progressPct + '%)') : '▶ WATCH NOW (PRESS OK)';
      }
      catListEl.querySelectorAll('.c-card').forEach(el => {
        el.onclick = () => {
          const ci = Number(el.dataset.cidx);
          if (activeShowGroup && ci === 0) { exitShow(); return; }
          catIdx = ci; idx = 0; focusZone = 'posters'; render();
        };
      });
      posterRowEl.querySelectorAll('.p-card').forEach(el => {
        el.onclick = () => {
          const pi = Number(el.dataset.idx);
          if (idx === pi && focusZone === 'posters') { activateCurrent(); }
          else { idx = pi; focusZone = 'posters'; render(); }
        };
      });
    }
    function activateCurrent() {
      const cur = ITEMS[idx];
      if (!cur) return;
      if (activeTab === 'shows' && !activeShowGroup && cur.isShowGroup && Array.isArray(cur.episodes) && cur.episodes.length) {
        enterShow(cur, idx);
        return;
      }
      playCurrent();
    }
    function playCurrent() {
      const cur = ITEMS[idx];
      if (!cur || !cur.streamUrl) return;
      overlay.classList.add('active');
      videoEl.src = cur.streamUrl;
      if (cur.inProgress && cur.positionSec > 5) {
        videoEl.currentTime = cur.positionSec;
      }
      videoEl.play().catch(() => {});
    }
    function stopVideo() {
      const cur = ITEMS[idx];
      if (cur && videoEl.currentTime > 5) {
        const tid = cur.repTrackId || cur.id;
        fetch('/api/tv-progress?id=' + encodeURIComponent(tid) + '&positionSec=' + Math.floor(videoEl.currentTime) + '&durationSec=' + Math.floor(videoEl.duration || 0)).catch(() => {});
      }
      videoEl.pause();
      videoEl.removeAttribute('src');
      overlay.classList.remove('active');
    }
    document.getElementById('play-btn').onclick = activateCurrent;
    document.addEventListener('keydown', (e) => {
      if (overlay.classList.contains('active')) {
        if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') { stopVideo(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { videoEl.currentTime = (videoEl.currentTime || 0) + 15; e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { videoEl.currentTime = Math.max(0, (videoEl.currentTime || 0) - 15); e.preventDefault(); }
        else if (e.key === 'Enter' || e.key === ' ') { if (videoEl.paused) videoEl.play(); else videoEl.pause(); e.preventDefault(); }
        return;
      }
      if (e.key === 'Tab') { switchTab(activeTab === 'shows' ? 'movies' : 'shows'); e.preventDefault(); return; }
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
        if (activeShowGroup) { exitShow(); e.preventDefault(); }
        return;
      }
      if (focusZone === 'tabs') {
        const maxT = activeShowGroup ? 2 : 1;
        if (e.key === 'ArrowLeft') {
          tabCol = (tabCol - 1 + maxT + 1) % (maxT + 1);
          if (tabCol === 0 && activeTab !== 'movies') { switchTab('movies'); focusZone = 'tabs'; tabCol = 0; }
          else if (tabCol === 1 && activeTab !== 'shows') { switchTab('shows'); focusZone = 'tabs'; tabCol = 1; }
          render(); e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          tabCol = (tabCol + 1) % (maxT + 1);
          if (tabCol === 0 && activeTab !== 'movies') { switchTab('movies'); focusZone = 'tabs'; tabCol = 0; }
          else if (tabCol === 1 && activeTab !== 'shows') { switchTab('shows'); focusZone = 'tabs'; tabCol = 1; }
          render(); e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          focusZone = 'categories'; render(); e.preventDefault();
        } else if (e.key === 'Enter') {
          if (activeShowGroup && (tabCol === 1 || tabCol === 2)) exitShow();
          else { focusZone = 'posters'; render(); }
          e.preventDefault();
        }
      } else if (focusZone === 'categories') {
        const maxCats = activeShowGroup ? activeShowSeasons.length : (activeTab === 'shows' ? SHOW_CATEGORIES.length : MOVIE_CATEGORIES.length);
        if (e.key === 'ArrowLeft') { catIdx = (catIdx - 1 + maxCats) % maxCats; idx = 0; render(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { catIdx = (catIdx + 1) % maxCats; idx = 0; render(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { focusZone = 'tabs'; tabCol = activeTab === 'shows' ? 1 : 0; render(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { focusZone = 'posters'; render(); e.preventDefault(); }
        else if (e.key === 'Enter') {
          if (activeShowGroup && catIdx === 0) exitShow();
          else { focusZone = 'posters'; render(); }
          e.preventDefault();
        }
      } else {
        if (e.key === 'ArrowLeft') { idx = (idx - 1 + Math.max(1, ITEMS.length)) % Math.max(1, ITEMS.length); render(); e.preventDefault(); }
        else if (e.key === 'ArrowRight') { idx = (idx + 1) % Math.max(1, ITEMS.length); render(); e.preventDefault(); }
        else if (e.key === 'ArrowDown') { idx = (idx + 6) < ITEMS.length ? (idx + 6) : 0; render(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { focusZone = 'categories'; render(); e.preventDefault(); }
        else if (e.key === 'Enter') { activateCurrent(); e.preventDefault(); }
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

        if (u.pathname === '/api/tablo/status') {
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          tabloClient.getTabloStatus({ ip, port }).then((st) => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(st));
          });
          return;
        }

        if (u.pathname === '/api/tablo/recordings') {
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          const portalBaseUrl = `http://${hostIp}:${boundPort}`;
          tabloClient.listTabloRecordings({ ip, port, portalBaseUrl }).then((recs) => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(recs));
          });
          return;
        }

        if (u.pathname === '/api/tablo/channels') {
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          const portalBaseUrl = `http://${hostIp}:${boundPort}`;
          tabloClient.listTabloChannels({ ip, port, portalBaseUrl }).then((chs) => {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify(chs));
          });
          return;
        }

        if (u.pathname.startsWith('/api/tablo/image/')) {
          const imageId = u.pathname.slice('/api/tablo/image/'.length).replace(/[^\d]/g, '');
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          const cacheKey = `${ip}:${port}:${imageId}`;
          if (_tabloImageCache.has(cacheKey)) {
            const cached = _tabloImageCache.get(cacheKey);
            res.writeHead(200, {
              'Content-Type': cached.contentType,
              'Content-Length': String(cached.buffer.length),
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(cached.buffer);
            return;
          }
          tabloClient.fetchTabloImage({ ip, port, imageId }).then((img) => {
            if (!img.ok || !img.buffer) {
              res.writeHead(img.status || 404, { 'Content-Type': 'text/plain' });
              res.end('Image not found');
              return;
            }
            if (_tabloImageCache.size > 80) {
              const oldest = _tabloImageCache.keys().next().value;
              if (oldest) _tabloImageCache.delete(oldest);
            }
            _tabloImageCache.set(cacheKey, img);
            res.writeHead(200, {
              'Content-Type': img.contentType,
              'Content-Length': String(img.buffer.length),
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(img.buffer);
          });
          return;
        }

        if (u.pathname === '/api/tablo/roku.m3u8') {
          const itemPath = u.searchParams.get('path') || '';
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          tabloClient.fetchRokuTabloPlaylist({ ip, port, itemPath }).then((pl) => {
            if (!pl.ok || !pl.body) {
              res.writeHead(pl.status || 502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
              res.end(pl.error || 'Could not load Tablo HLS playlist');
              return;
            }
            res.writeHead(200, {
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Content-Length': String(Buffer.byteLength(pl.body)),
              'Cache-Control': 'no-store',
              'Access-Control-Allow-Origin': '*',
            });
            res.end(pl.body);
          });
          return;
        }

        if (u.pathname === '/api/tablo/stream') {
          const itemPath = u.searchParams.get('path') || '';
          const seekSec = Number(u.searchParams.get('seek') || 0);
          const ip = u.searchParams.get('ip') || state.tabloIp || tabloClient.DEFAULT_TABLO_IP;
          const port = Number(u.searchParams.get('port') || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
          tabloClient.watchTabloPath({ ip, port, itemPath }).then((watch) => {
            if (!watch.ok || !watch.playlistUrl) {
              res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ ok: false, error: watch.error || 'Could not start Tablo stream' }));
              return;
            }
            tabloClient.streamTabloViaFfmpeg({
              playlistUrl: watch.playlistUrl,
              seekSec,
              req,
              res,
            });
          });
          return;
        }

        if (u.pathname === '/tablo') {
          const tabloHtml = renderTabloTenFootHtml({
            hostIp,
            portalPort: boundPort,
            tabloIp: state.tabloIp || tabloClient.DEFAULT_TABLO_IP,
            tabloPort: state.tabloPort || tabloClient.DEFAULT_TABLO_PORT,
          });
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(tabloHtml);
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
      tabloIp: state.tabloIp || tabloClient.DEFAULT_TABLO_IP,
      tabloPort: state.tabloPort || tabloClient.DEFAULT_TABLO_PORT,
      tabloPortalUrl: `http://${hostIp}:${boundPort}/tablo`,
      lastRemoteKey: state.lastRemoteKey,
      tooling: detectToolingStatus(),
      platforms: TV_PLATFORMS,
      tiles: TEN_FOOT_LAUNCH_TILES,
      tvs: state.tvs,
      generatedPackages: state.generatedPackages,
    };
  }

  // Saved devices only, for callers that do not need the cost of a full overview.
  function getSavedDevices() {
    loadState();
    return { tvs: state.tvs, tabloIp: state.tabloIp || '' };
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
    const tvIp = options.tvIp || (tv && tv.ip) || '';

    const pkgResult = generateSideloadPackage({
      platformId,
      outputDir: options.outputDir || packagesOutDir,
      configDir: resolvedConfigDir,
      hostIp,
      portalPort: boundPort,
      tvIp,
      appName: options.appName || 'RobOS TV',
      appId: options.appId || 'com.robos.tv',
      webosPassphrase: options.webosPassphrase || '',
      channelMode: options.channelMode || 'auto',
      mediaServerUrl: options.mediaServerUrl || '',
      preloadedCinemaItems: options.preloadedCinemaItems || null,
      preloadedCinemaRev: options.preloadedCinemaRev || '',
      rokuDevPassword: options.rokuDevPassword || '',
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
              name: 'Roku TV',
              model: 'Roku TV',
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
    const targetIp = ip || (tv && tv.ip);
    if (!targetIp) return Promise.resolve({ ok: false, error: 'No Smart TV found in paired TV list' });
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
      sprintName: dashboard.sprintName || 'Sprint',
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

  function setTabloDevice({ ip, port } = {}) {
    loadState();
    if (ip) state.tabloIp = String(ip).trim();
    if (port) state.tabloPort = Number(port) || tabloClient.DEFAULT_TABLO_PORT;
    saveState();
    return {
      ok: true,
      tabloIp: state.tabloIp,
      tabloPort: state.tabloPort,
    };
  }

  async function getTabloOverview({ ip, port } = {}) {
    loadState();
    const targetIp = String(ip || state.tabloIp || tabloClient.DEFAULT_TABLO_IP).trim();
    const targetPort = Number(port || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
    if (ip && ip !== state.tabloIp) {
      state.tabloIp = targetIp;
      saveState();
    }
    const hostIp = detectLanIp();
    const portalBaseUrl = `http://${hostIp}:${boundPort || DEFAULT_PORTAL_PORT}`;
    const status = await tabloClient.getTabloStatus({ ip: targetIp, port: targetPort });
    const recordingsRes = status.ok
      ? await tabloClient.listTabloRecordings({ ip: targetIp, port: targetPort, portalBaseUrl })
      : { ok: false, recordings: [] };
    return {
      ok: status.ok,
      ip: targetIp,
      port: targetPort,
      portalBaseUrl,
      status,
      recordings: recordingsRes.recordings || [],
      recordingsCount: (recordingsRes.recordings || []).length,
      error: status.error || recordingsRes.error || null,
    };
  }

  async function getTabloChannels({ ip, port } = {}) {
    loadState();
    const targetIp = String(ip || state.tabloIp || tabloClient.DEFAULT_TABLO_IP).trim();
    const targetPort = Number(port || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
    const hostIp = detectLanIp();
    const portalBaseUrl = `http://${hostIp}:${boundPort || DEFAULT_PORTAL_PORT}`;
    return tabloClient.listTabloChannels({ ip: targetIp, port: targetPort, portalBaseUrl });
  }

  async function openTabloExternal({ ip, port, itemPath, title } = {}) {
    loadState();
    const targetIp = String(ip || state.tabloIp || tabloClient.DEFAULT_TABLO_IP).trim();
    const targetPort = Number(port || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
    return tabloClient.openTabloExternalPlayer({ ip: targetIp, port: targetPort, itemPath, title });
  }

  async function refreshTabloCinemaSnapshot({ ip, port } = {}) {
    loadState();
    const targetIp = String(ip || state.tabloIp || tabloClient.DEFAULT_TABLO_IP).trim();
    const targetPort = Number(port || state.tabloPort || tabloClient.DEFAULT_TABLO_PORT);
    const hostIp = detectLanIp();
    const portalPortToUse = boundPort || DEFAULT_PORTAL_PORT;
    const res = await tabloClient.listTabloCinemaItems({
      ip: targetIp,
      port: targetPort,
      hostIp,
      portalPort: portalPortToUse,
    });
    if (res.ok && Array.isArray(res.items)) {
      state.tabloCinemaItemsSnapshot = res.items;
      saveState({ overwriteCinemaState: true });
    }
    return res;
  }

  async function castTabloToTv({ tvId, ip, port } = {}) {
    loadState();
    const tv = state.tvs.find((t) => t.id === tvId) || state.tvs.find((t) => t.platformId === 'roku-os') || state.tvs[0];
    if (!tv) return { ok: false, error: 'No Smart TV found in paired TV list' };
    const snap = await refreshTabloCinemaSnapshot({ ip, port });
    const hostIp = detectLanIp();
    const portalPortToUse = boundPort || DEFAULT_PORTAL_PORT;
    state.activeCinemaCast = { active: false };
    state.activeCinemaLibrary = {
      active: true,
      defaultTab: 'tablo',
      tvId: tv.id,
      tvName: tv.name,
      tvIp: tv.ip,
      platformId: tv.platformId,
      castAt: new Date().toISOString(),
    };
    state.lastRemoteKey = `OPEN TABLO DVR TAB (${snap.items?.length || 0} recordings) → ${tv.name}`;
    saveState({ overwriteCinemaState: true });

    let launchResult = null;
    if (tv.platformId === 'roku-os' && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      launchResult = await launchRokuChannel(tv);
    }
    return {
      ok: true,
      tv,
      tabloIp: snap.ip,
      recordingsCount: snap.items?.length || 0,
      items: snap.items || [],
      portalUrl: `http://${hostIp}:${portalPortToUse}`,
      launchResult,
      message: `Opened Tablo DVR Tab (${snap.items?.length || 0} recordings with thumbnails) on ${tv.name} (${tv.ip}).`,
    };
  }

  /**
   * Builds, sideloads, and launches the standalone Plex-style "RobOS Movie Player"
   * Roku OS channel backed directly by the configured RobOS Media Server (:19234).
   */
  async function installRokuMoviePlayer(options = {}) {
    loadState();
    const tv = state.tvs.find((t) => t.id === options.tvId)
      || state.tvs.find((t) => options.tvIp && t.ip === options.tvIp)
      || state.tvs.find((t) => t.platformId === 'roku-os')
      || (options.tvIp ? { id: `tv-roku-${options.tvIp}`, name: `Roku TV (${options.tvIp})`, ip: options.tvIp, platformId: 'roku-os' } : null);
    if (!tv || !tv.ip) {
      return { ok: false, error: 'No Roku TV configured. Pair your Roku TV or pass tvIp.' };
    }

    const serverUrl = String(options.mediaServerUrl || resolveConfiguredMediaServerUrl(resolvedConfigDir) || '').replace(/\/+$/, '');
    if (!serverUrl) {
      return { ok: false, error: 'No RobOS Media Server configured in RobOS Preferences (media-servers.json).' };
    }

    // Fetch live grouped Movies & TV Series feed directly from RobOS Media Server
    let liveFeed = null;
    try {
      liveFeed = await new Promise((resolve, reject) => {
        const req = http.get(`${serverUrl}/api/roku-cinema`, { timeout: 10000 }, (res) => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            try {
              const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              if (res.statusCode >= 400 || !j?.ok) reject(new Error(j?.error || `HTTP ${res.statusCode}`));
              else resolve(j);
            } catch (err) {
              reject(err);
            }
          });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('RobOS Media Server timed out')); });
        req.on('error', reject);
      });
    } catch (err) {
      return { ok: false, error: `Could not reach RobOS Media Server at ${serverUrl}: ${err.message}` };
    }

    // Also refresh Tablo DVR snapshot if a Tablo is configured on the LAN
    if (state.tabloIp) {
      try { await refreshTabloCinemaSnapshot({ ip: state.tabloIp, port: state.tabloPort }); } catch {}
    }

    // Clear any stale appCast on this TV so nothing overrides Movie Player
    if (state.appCasts && state.appCasts[tv.id]) {
      state.appCasts[tv.id] = { ...state.appCasts[tv.id], active: false };
    }
    state.activeCinemaCast = { active: false };
    state.activeCinemaLibrary = {
      active: true,
      defaultTab: options.defaultTab || 'movies',
      tvId: tv.id,
      tvName: tv.name,
      tvIp: tv.ip,
      platformId: 'roku-os',
      mediaServerUrl: serverUrl,
      castAt: new Date().toISOString(),
    };
    state.lastRemoteKey = `INSTALL RobOS Movie Player (${liveFeed.counts?.movies || 0} Movies, ${liveFeed.counts?.shows || 0} Shows) → ${tv.name}`;
    saveState({ overwriteCinemaState: true });

    const preloadedItems = Array.isArray(liveFeed.cinemaLibrary?.items) ? liveFeed.cinemaLibrary.items : [];
    const pkg = buildTvPackage({
      platformId: 'roku-os',
      tvId: tv.id,
      tvIp: tv.ip,
      appName: options.appName || 'RobOS Movie Player',
      channelMode: 'movie-player',
      mediaServerUrl: serverUrl,
      preloadedCinemaItems: preloadedItems,
      preloadedCinemaRev: liveFeed.rev || '',
      rokuDevPassword: options.rokuDevPassword || process.env.ROBOS_DEV_PASS || process.env.ROKU_DEV_PASS || 'robos',
      outputDir: options.outputDir,
    });

    let sideloaded = false;
    let sideloadOutput = '';
    if (options.sideload !== false && process.env.ROBOS_TEST !== '1' && !process.env.NODE_TEST_CONTEXT) {
      const env = {
        ...process.env,
        ROKU_DEV_USER: options.rokuDevUser || process.env.ROKU_DEV_USER || 'rokudev',
        ROKU_DEV_PASS: options.rokuDevPassword || process.env.ROKU_DEV_PASS || 'robos',
      };
      const sl = spawnSync('bash', ['sideload-roku.sh'], {
        cwd: pkg.targetDir,
        env,
        timeout: 20000,
        encoding: 'utf8',
      });
      sideloadOutput = `${sl.stdout || ''}${sl.stderr || ''}`.trim();
      sideloaded = sl.status === 0 && /Install Success|Application Received|Identical to previous/i.test(sideloadOutput);

      // Ensure the newly installed dev channel is foregrounded on screen
      await new Promise((resolve) => {
        const req = http.request({
          hostname: tv.ip,
          port: 8060,
          path: '/launch/dev',
          method: 'POST',
          agent: false,
          headers: { 'Content-Length': '0', Connection: 'close' },
          timeout: 2500,
        }, (res) => { res.resume(); resolve(res.statusCode); });
        req.on('error', () => resolve(0));
        req.on('timeout', () => { req.destroy(); resolve(0); });
        req.end();
      });

      if (sideloaded && tv) {
        const tbCnt = Array.isArray(state.tabloCinemaItemsSnapshot) ? state.tabloCinemaItemsSnapshot.length : 0;
        tv.sideloadStatus = `RobOS Movie Player Installed (${liveFeed.counts?.movies || 0} Movies · ${liveFeed.counts?.shows || 0} Shows${tbCnt > 0 ? ` · ${tbCnt} DVR` : ''})`;
        saveState();
      }
    }

    const tabloCount = Array.isArray(state.tabloCinemaItemsSnapshot) ? state.tabloCinemaItemsSnapshot.length : 0;
    const mergedCounts = {
      ...(liveFeed.counts || {}),
      tablo: Math.max(Number(liveFeed.counts?.tablo || 0), tabloCount),
    };

    return {
      ok: options.sideload === false ? true : sideloaded,
      sideloaded,
      sideloadOutput,
      tv,
      mediaServerUrl: serverUrl,
      serverName: liveFeed.serverName || 'RobOS Media Server',
      counts: mergedCounts,
      targetDir: pkg.targetDir,
      zipPath: path.join(pkg.targetDir, 'robos-tv-roku.zip'),
      message: sideloaded
        ? `Installed & launched RobOS Movie Player on ${tv.name} (${tv.ip}) connected to ${serverUrl} (${mergedCounts.movies || 0} Movies, ${mergedCounts.shows || 0} TV Shows / ${mergedCounts.episodes || 0} Episodes${mergedCounts.tablo > 0 ? `, ${mergedCounts.tablo} Tablo DVR Recordings` : ''}).`
        : `Built RobOS Movie Player package at ${pkg.targetDir}${options.sideload === false ? '' : ` (sideload output: ${sideloadOutput || 'check Roku Developer Mode password'})`}.`,
    };
  }

  return {
    startPortalServer,
    stopPortalServer,
    getPortalOwnership,
    restartPortal,
    getOverview,
    getSavedDevices,
    addOrUpdateTv,
    removeTv,
    scanLanForTvs,
    buildTvPackage,
    installRokuMoviePlayer,
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
    setTabloDevice,
    getTabloOverview,
    getTabloChannels,
    openTabloExternal,
    refreshTabloCinemaSnapshot,
    castTabloToTv,
  };
}

function renderTabloTenFootHtml({ hostIp, portalPort, tabloIp, tabloPort }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>RobOS TV — Tablo OTA DVR &amp; Live TV (${tabloIp})</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #070b12; color: #e6edf3; font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 18px 28px; background: #0d131f; border-bottom: 1px solid #1e293b; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .pill { background: #131c2e; border: 1px solid #00bcd4; color: #67e8f9; padding: 5px 12px; border-radius: 999px; font-size: 13px; font-weight: 600; }
    .container { display: grid; grid-template-columns: 1.25fr 1fr; gap: 22px; padding: 24px 28px; max-width: 1760px; margin: 0 auto; }
    .player-card, .list-card { background: #111827; border: 1px solid #263248; border-radius: 12px; padding: 18px; }
    video { width: 100%; aspect-ratio: 16 / 9; background: #000; border-radius: 8px; border: 1px solid #1e293b; }
    .rec-item { display: flex; gap: 14px; background: #0b101b; border: 1px solid #1e293b; border-radius: 9px; padding: 12px; margin-bottom: 10px; cursor: pointer; align-items: center; }
    .rec-item:hover, .rec-item.active { border-color: #00bcd4; background: rgba(0, 188, 212, 0.1); }
    .rec-thumb { width: 128px; height: 72px; border-radius: 6px; object-fit: cover; background: #1e293b; flex-shrink: 0; }
    .btn { background: #00bcd4; color: #041217; border: none; border-radius: 6px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    .btn-sec { background: #1e293b; color: #e6edf3; border: 1px solid #334155; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1 style="margin:0;font-size:21px;">RobOS TV · Tablo OTA DVR &amp; Live Channels</h1>
      <span class="pill" id="dev-pill">Tablo @ ${tabloIp}:${tabloPort}</span>
    </div>
    <div style="display:flex;gap:10px;">
      <a href="/" class="btn btn-sec" style="text-decoration:none;">← Back to 10-Foot Portal</a>
    </div>
  </header>
  <div class="container">
    <div class="player-card">
      <video id="player" controls autoplay></video>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <div id="now-title" style="font-size:18px;font-weight:700;">Select a Recording to Play</div>
          <div id="now-sub" style="font-size:13px;color:#94a3b8;margin-top:2px;">Transcoding MPEG-2 + Dolby AC-3 to H.264/AAC via RobOS FFmpeg Engine</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-sec" id="btn-back-15">↺ -15s</button>
          <button class="btn btn-sec" id="btn-fwd-30">+30s ↻</button>
          <button class="btn btn-sec" id="btn-fwd-300">+5m ⏭</button>
        </div>
      </div>
      <p id="now-desc" style="color:#cbd5e1;font-size:13.5px;margin-top:10px;"></p>
    </div>
    <div class="list-card">
      <h2 style="margin:0 0 12px;font-size:17px;">Recorded Shows &amp; Sports on Tablo</h2>
      <div id="rec-list">Loading Tablo recordings from ${tabloIp}…</div>
    </div>
  </div>
  <script>
    let recordings = [];
    let currentRec = null;
    let baseSeek = 0;
    const video = document.getElementById('player');

    function playAtSeek(rec, seekSec) {
      currentRec = rec;
      baseSeek = Math.max(0, Math.floor(seekSec || 0));
      document.getElementById('now-title').textContent = rec.fullTitle;
      document.getElementById('now-sub').textContent = [rec.channel?.label, rec.durationFormatted, rec.sizeFormatted, rec.resolution].filter(Boolean).join(' · ');
      document.getElementById('now-desc').textContent = rec.description || '';
      video.src = rec.streamUrl + '&seek=' + baseSeek;
      video.play().catch(() => {});
      renderList();
    }

    document.getElementById('btn-back-15').onclick = () => {
      if (!currentRec) return;
      playAtSeek(currentRec, baseSeek + Math.floor(video.currentTime || 0) - 15);
    };
    document.getElementById('btn-fwd-30').onclick = () => {
      if (!currentRec) return;
      playAtSeek(currentRec, baseSeek + Math.floor(video.currentTime || 0) + 30);
    };
    document.getElementById('btn-fwd-300').onclick = () => {
      if (!currentRec) return;
      playAtSeek(currentRec, baseSeek + Math.floor(video.currentTime || 0) + 300);
    };

    function renderList() {
      const el = document.getElementById('rec-list');
      if (!recordings.length) {
        el.textContent = 'No recordings found.';
        return;
      }
      el.innerHTML = recordings.map((r, i) => \`
        <div class="rec-item \${currentRec && currentRec.id === r.id ? 'active' : ''}" data-idx="\${i}">
          <img class="rec-thumb" src="\${r.imageUrl}" alt="" onerror="this.style.display='none'" />
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14.5px;">\${r.fullTitle}</div>
            <div style="font-size:12.5px;color:#67e8f9;margin-top:2px;">\${r.channel?.label || ''} · \${r.durationFormatted} · \${r.sizeFormatted}</div>
            <div style="font-size:12px;color:#94a3b8;margin-top:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">\${r.description || ''}</div>
          </div>
          <button class="btn">▶ Play</button>
        </div>
      \`).join('');
      el.querySelectorAll('.rec-item').forEach((row) => {
        row.onclick = () => playAtSeek(recordings[Number(row.dataset.idx)], 0);
      });
    }

    fetch('/api/tablo/recordings').then(r => r.json()).then(data => {
      recordings = data.recordings || [];
      renderList();
      if (recordings[0]) playAtSeek(recordings[0], 0);
    });
  </script>
</body>
</html>`;
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
  renderTabloTenFootHtml,
  generateSideloadPackage,
  createTvEngine,
  tabloClient,
};
