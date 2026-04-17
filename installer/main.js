'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');

let win = null;

// ── GitHub Release API ───────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com/repos/nddipiazza/robos/releases/latest';

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'RobOS-Installer' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (url) => {
      const mod = url.startsWith('https') ? https : http;
      mod.get(url, { headers: { 'User-Agent': 'RobOS-Installer' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(destPath);
        res.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (onProgress && total > 0) {
            onProgress({ downloaded, total, percent: Math.round((downloaded / total) * 100) });
          }
        });
        res.on('end', () => { file.end(); resolve(destPath); });
        res.on('error', (e) => { file.end(); reject(e); });
      }).on('error', reject);
    };
    follow(url);
  });
}

// ── Drive detection ──────────────────────────────────────────────────────────

function listDrives() {
  const platform = os.platform();
  try {
    if (platform === 'linux') {
      const output = execSync('lsblk -Jdno NAME,SIZE,MODEL,TRAN,RM', { encoding: 'utf8' });
      const parsed = JSON.parse(output);
      return (parsed.blockdevices || [])
        .filter(d => d.rm || d.tran === 'usb')  // removable or USB
        .map(d => ({
          device: `/dev/${d.name}`,
          name: (d.model || d.name).trim(),
          size: d.size,
          transport: d.tran || 'unknown',
        }));
    }
    if (platform === 'darwin') {
      const output = execSync('diskutil list -plist external', { encoding: 'utf8' });
      // Simplified — parse diskutil output
      const lines = execSync('diskutil list external', { encoding: 'utf8' });
      const drives = [];
      for (const line of lines.split('\n')) {
        const match = line.match(/^(\/dev\/disk\d+)/);
        if (match) {
          const info = execSync(`diskutil info ${match[1]}`, { encoding: 'utf8' });
          const size = (info.match(/Disk Size:.*\((\d+.*?)\)/) || [])[1] || 'unknown';
          const name = (info.match(/Media Name:\s+(.+)/) || [])[1] || match[1];
          drives.push({ device: match[1], name: name.trim(), size, transport: 'usb' });
        }
      }
      return drives;
    }
    if (platform === 'win32') {
      const output = execSync('wmic diskdrive where "MediaType=\'Removable Media\' or InterfaceType=\'USB\'" get DeviceID,Model,Size /format:csv', { encoding: 'utf8' });
      const drives = [];
      for (const line of output.trim().split('\n').slice(1)) {
        const [, deviceId, model, size] = line.split(',');
        if (deviceId) {
          drives.push({
            device: deviceId.trim(),
            name: (model || 'USB Drive').trim(),
            size: size ? `${Math.round(parseInt(size) / 1e9)} GB` : 'unknown',
            transport: 'usb',
          });
        }
      }
      return drives;
    }
  } catch (e) {
    console.error('Drive detection error:', e.message);
  }
  return [];
}

// ── Flash ISO to drive ───────────────────────────────────────────────────────

function flashISO(isoPath, device, onProgress) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();

    if (platform === 'linux' || platform === 'darwin') {
      // Unmount first
      try {
        if (platform === 'linux') execSync(`umount ${device}* 2>/dev/null || true`);
        else execSync(`diskutil unmountDisk ${device} 2>/dev/null || true`);
      } catch {}

      const args = [`if=${isoPath}`, `of=${device}`, 'bs=4M', 'conv=fdatasync'];
      const dd = spawn('sudo', ['dd', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      dd.stderr.on('data', (d) => {
        stderr += d.toString();
        // Parse dd progress (when status=progress is used)
        const match = d.toString().match(/(\d+) bytes/);
        if (match && onProgress) {
          const written = parseInt(match[1]);
          const total = fs.statSync(isoPath).size;
          onProgress({ written, total, percent: Math.round((written / total) * 100) });
        }
      });

      dd.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`dd failed (code ${code}): ${stderr}`));
      });
      dd.on('error', reject);
    } else if (platform === 'win32') {
      // On Windows, use PowerShell with admin elevation
      // This is a simplified approach — production would use a native addon
      reject(new Error('Windows flashing requires running as Administrator. Use Rufus or balenaEtcher for now.'));
    }
  });
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 700,
    height: 550,
    minWidth: 600,
    minHeight: 450,
    backgroundColor: '#0d1117',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Installer',
    autoHideMenuBar: true,
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-latest-release', async () => {
  try {
    const release = await fetchJSON(GITHUB_API);
    const isoAsset = (release.assets || []).find(a => a.name.endsWith('.iso'));
    return {
      ok: true,
      version: release.tag_name,
      isoUrl: isoAsset ? isoAsset.browser_download_url : null,
      isoName: isoAsset ? isoAsset.name : null,
      isoSize: isoAsset ? isoAsset.size : 0,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('list-drives', () => {
  return listDrives();
});

ipcMain.handle('download-iso', async (_ev, url, filename) => {
  const dest = path.join(os.tmpdir(), filename);
  if (fs.existsSync(dest)) {
    return { ok: true, path: dest, cached: true };
  }
  try {
    await downloadFile(url, dest, (progress) => {
      win.webContents.send('download-progress', progress);
    });
    return { ok: true, path: dest };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('flash', async (_ev, isoPath, device) => {
  try {
    await flashISO(isoPath, device, (progress) => {
      win.webContents.send('flash-progress', progress);
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-url', (_ev, url) => shell.openExternal(url));
