'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { exec } = require('child_process');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_DIR = path.join(HOME_DIR, '.config', 'robos');

function getSocketPath() {
  if (process.env.ROBOS_DM_SOCKET) return process.env.ROBOS_DM_SOCKET;
  const runtimeDir = process.env.XDG_RUNTIME_DIR || (process.getuid ? `/run/user/${process.getuid()}` : '/run/user/1000');
  if (fs.existsSync(runtimeDir)) return path.join(runtimeDir, 'robos-dm.sock');
  const uid = process.getuid ? process.getuid() : 1000;
  return `/tmp/robos-dm-${uid}.sock`;
}

function execAsync(cmd, env = {}) {
  return new Promise((resolve) => {
    const display = process.env.DISPLAY || ':0';
    exec(cmd, { env: { ...process.env, DISPLAY: display, ...env }, timeout: 3000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message, stdout: '' });
      resolve({ ok: true, stdout: stdout ? stdout.trim() : '' });
    });
  });
}

/**
 * Get active window details via X11 / xdotool / xprop
 */
async function getActiveWindow() {
  // Try xdotool first
  let wid = null;
  const xdoRes = await execAsync('xdotool getactivewindow 2>/dev/null');
  if (xdoRes.ok && xdoRes.stdout) {
    wid = xdoRes.stdout;
  } else {
    // Fall back to xprop root window
    const rootRes = await execAsync('xprop -root _NET_ACTIVE_WINDOW 2>/dev/null');
    if (rootRes.ok && rootRes.stdout) {
      const match = rootRes.stdout.match(/0x[0-9a-fA-F]+/);
      if (match) wid = String(parseInt(match[0], 16));
    }
  }

  if (!wid) {
    return {
      wid: null,
      title: null,
      appId: null,
      wmClass: null,
    };
  }

  // Query window details via xprop
  const propRes = await execAsync(`xprop -id ${wid} WM_CLASS _NET_WM_NAME _NET_WM_PID 2>/dev/null`);
  let title = '';
  let wmClass = '';
  let pid = null;

  if (propRes.ok && propRes.stdout) {
    const nameMatch = propRes.stdout.match(/_NET_WM_NAME\([^)]+\)\s*=\s*"([^"]+)"/);
    if (nameMatch) title = nameMatch[1];

    const classMatch = propRes.stdout.match(/WM_CLASS\([^)]+\)\s*=\s*"([^"]+)",\s*"([^"]+)"/);
    if (classMatch) {
      wmClass = `${classMatch[1]}.${classMatch[2]}`;
    }

    const pidMatch = propRes.stdout.match(/_NET_WM_PID\([^)]+\)\s*=\s*(\d+)/);
    if (pidMatch) pid = parseInt(pidMatch[1], 10);
  }

  // Derive appId from wmClass or title
  let appId = null;
  if (wmClass) {
    const instance = wmClass.split('.')[0].toLowerCase().replace(/^robos-/, '');
    appId = instance;
  } else if (title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('git projects')) appId = 'git-projects';
    else if (titleLower.includes('dev central')) appId = 'dev-central';
    else if (titleLower.includes('issue manager')) appId = 'issue-manager';
    else if (titleLower.includes('agent chat')) appId = 'agent-chat';
    else if (titleLower.includes('notifications')) appId = 'notifications';
  }

  return {
    wid,
    title: title || 'Desktop',
    appId,
    wmClass,
    pid,
  };
}

/**
 * Scan running RobOS applications
 */
async function getRunningApps() {
  const socketPath = getSocketPath();

  // 1. Try querying Desktop Manager socket
  const fromSocket = await new Promise((resolve) => {
    if (!fs.existsSync(socketPath)) return resolve(null);
    try {
      const client = net.connect(socketPath, () => {
        client.write(JSON.stringify({ status: true }));
      });
      let raw = '';
      client.on('data', chunk => { raw += chunk; });
      client.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.status) {
            const apps = [];
            for (const [id, info] of Object.entries(parsed.status)) {
              if (info && info.alive) {
                apps.push({ appId: id, pid: info.pid, alive: true });
              }
            }
            return resolve(apps);
          }
        } catch {}
        resolve(null);
      });
      client.on('error', () => resolve(null));
      setTimeout(() => { try { client.destroy(); } catch {} resolve(null); }, 1000);
    } catch {
      resolve(null);
    }
  });

  if (fromSocket && fromSocket.length > 0) {
    return fromSocket;
  }

  // 2. Fallback: inspect /proc for /usr/local/share/robos/* or robos electron apps
  const apps = [];
  try {
    const pids = fs.readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pidStr of pids) {
      try {
        const cmdline = fs.readFileSync(`/proc/${pidStr}/cmdline`, 'utf8');
        const m = cmdline.match(/(?:\/usr\/local\/share\/robos\/|packages\/)([^/\0]+)/);
        if (m) {
          const appId = m[1].replace(/^robos-/, '');
          if (appId !== 'robos-lib' && appId !== 'robos-icons') {
            if (!apps.some(a => a.appId === appId)) {
              apps.push({ appId, pid: parseInt(pidStr, 10), alive: true });
            }
          }
        }
      } catch {}
    }
  } catch {}

  return apps;
}

/**
 * Read active workspace context
 */
function getWorkspaceContext() {
  try {
    const wsFile = path.join(CONFIG_DIR, 'workspaces.json');
    if (fs.existsSync(wsFile)) {
      const data = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        const active = data.find(w => w.active) || data[0];
        return {
          name: active.name || path.basename(active.path || ''),
          path: active.path || '',
          branch: active.branch || 'main',
        };
      }
    }
  } catch {}

  // Current working directory / repo fallback
  return {
    name: 'robos',
    path: process.cwd(),
    branch: 'main',
  };
}

/**
 * Aggregate all context into a single structured metadata object
 */
async function getAggregatedContext() {
  const [activeWin, runningApps] = await Promise.all([
    getActiveWindow(),
    getRunningApps(),
  ]);

  const workspace = getWorkspaceContext();

  const activeAppId = activeWin.appId || (runningApps.length > 0 ? runningApps[0].appId : 'desktop');

  return {
    capturedAt: new Date().toISOString(),
    activeApp: {
      appId: activeAppId,
      title: activeWin.title,
      wid: activeWin.wid,
      wmClass: activeWin.wmClass,
    },
    runningApps,
    workspace,
    summary: activeWin.title ? `In ${activeWin.title} (${activeAppId})` : `In ${activeAppId}`,
  };
}

module.exports = {
  getActiveWindow,
  getRunningApps,
  getWorkspaceContext,
  getAggregatedContext,
};
