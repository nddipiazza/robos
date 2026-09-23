'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0e0c12',
    title: 'RobOS cRPG Game Builder & Tactical Engine Academy',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const localDoc = path.join(__dirname, '../../docs/projects/crpg-realm/create-your-own-game/elearning/index.html');
  win.loadFile(localDoc);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
