'use strict';
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let win;

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    x: 240,
    y: 80,
    title: 'Google Chrome - robos/acme-petshop: Issues · Gitea',
    backgroundColor: '#1b1c1d',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = process.argv[2] || 'http://127.0.0.1:3000/robos/acme-petshop/issues';
  win.loadURL(url);
});
