'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

let win;
let _debugServer = null;
try {
  _debugServer = require('../../robos-lib/dom-snapshot');
} catch {}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:63343');
  const pathname = url.pathname;
  const params = Object.fromEntries(url.searchParams.entries());

  if (pathname === '/robos/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'OK', ide: 'IntelliJ IDEA Ultimate 2026.1', port: 63343 }));
    return;
  }

  if (pathname === '/robos/open-file') {
    if (win) win.webContents.send('ide-open-file', params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, action: 'open-file', params }));
    return;
  }

  if (pathname === '/robos/set-breakpoint') {
    if (win) win.webContents.send('ide-set-breakpoint', params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, action: 'set-breakpoint', params }));
    return;
  }

  if (pathname === '/robos/run') {
    if (win) win.webContents.send('ide-run', params);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, action: 'run', params }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(63343, '127.0.0.1');

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1040,
    height: 680,
    title: 'IntelliJ IDEA Ultimate 2026.1 - robos-java-service',
    backgroundColor: '#1e1f22',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (_debugServer) _debugServer.startDebugServer(win, 19157);
});

app.on('window-all-closed', () => {
  server.close();
  app.quit();
});
