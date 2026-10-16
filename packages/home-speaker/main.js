'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { HomeSpeakerService } = require('./lib/speaker-service');
const { listSounds } = require('./lib/soundboard');

// Flags for VM / headless compatibility
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

let mainWindow = null;
let speakerService = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 850,
    minHeight: 650,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Wire up DOM snapshot debugging for RobOS test harness & snapshot-cli
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19200, 'home-speaker');
  } catch {
    try {
      const { registerSnapshotIPC, startDebugServer } = require('../robos-lib/dom-snapshot');
      registerSnapshotIPC(mainWindow);
      startDebugServer(mainWindow, 19200, 'home-speaker');
    } catch {}
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  speakerService = new HomeSpeakerService();
  createWindow();

  // Fast background probe of known speakers
  speakerService.probeKnownSpeakers(2000).catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Registrations
ipcMain.handle('speakers:scan', async () => {
  return speakerService.scan(2500);
});

ipcMain.handle('speakers:get', async () => {
  return speakerService.getSpeakers();
});

ipcMain.handle('speakers:probe', async () => {
  return speakerService.probeKnownSpeakers(2000);
});

ipcMain.handle('speakers:getStatus', async (_event, targetIp) => {
  return speakerService.getStatus(targetIp);
});

ipcMain.handle('speakers:setVolume', async (_event, targetIp, level, muted) => {
  return speakerService.setVolume(targetIp, level, muted);
});

ipcMain.handle('speakers:stop', async (_event, targetIp) => {
  return speakerService.stop(targetIp);
});

ipcMain.handle('speakers:pause', async (_event, targetIp) => {
  return speakerService.pause(targetIp);
});

ipcMain.handle('speakers:resume', async (_event, targetIp) => {
  return speakerService.resume(targetIp);
});

ipcMain.handle('speakers:castFile', async (_event, target, filePath, metadata) => {
  return speakerService.castFile(target, filePath, metadata);
});

ipcMain.handle('speakers:castTTS', async (_event, target, text, options) => {
  return speakerService.castTTS(target, text, options);
});

ipcMain.handle('speakers:castVoiceRecording', async (_event, target, arrayBuffer, options) => {
  const buffer = Buffer.from(arrayBuffer);
  return speakerService.castVoiceRecording(target, buffer, options);
});

ipcMain.handle('speakers:playSound', async (_event, target, soundId) => {
  return speakerService.playSound(target, soundId);
});

ipcMain.handle('speakers:playAmbient', async (_event, target, soundType, durationMinutes) => {
  return speakerService.playAmbient(target, soundType, durationMinutes);
});

ipcMain.handle('speakers:listSounds', async () => {
  return listSounds();
});

ipcMain.handle('speakers:listVoices', async () => {
  return [
    { id: 'af_heart', name: 'Heart (Warm Natural Female - Kokoro)', engine: 'kokoro', recommended: true },
    { id: 'am_michael', name: 'Michael (Confident Male - Kokoro)', engine: 'kokoro' },
    { id: 'am_adam', name: 'Adam (Expressive Male - Kokoro)', engine: 'kokoro' },
    { id: 'af_bella', name: 'Bella (Friendly Female - Kokoro)', engine: 'kokoro' },
    { id: 'af_nicole', name: 'Nicole (Professional Female - Kokoro)', engine: 'kokoro' },
    { id: 'bf_emma', name: 'Emma (British Accent Female - Kokoro)', engine: 'kokoro' },
    { id: 'en_US-lessac-medium', name: 'Lessac (Medium Neural - Piper)', engine: 'piper' }
  ];
});

// RobOS Media Player Music Library Handlers
ipcMain.handle('library:getTracks', async (_event, limit) => {
  return speakerService.getLibraryTracks(limit);
});

ipcMain.handle('library:search', async (_event, query, limit) => {
  return speakerService.searchLibrary(query, limit);
});

ipcMain.handle('library:getAlbums', async () => {
  return speakerService.getLibraryAlbums();
});

ipcMain.handle('library:castTrack', async (_event, target, queryOrId) => {
  return speakerService.castLibraryTrack(target, queryOrId);
});

// Scheduled Broadcast Handlers
ipcMain.handle('schedule:list', async () => {
  return speakerService.listSchedules();
});

ipcMain.handle('schedule:get', async (_event, id) => {
  return speakerService.getSchedule(id);
});

ipcMain.handle('schedule:add', async (_event, jobData) => {
  return speakerService.addSchedule(jobData);
});

ipcMain.handle('schedule:update', async (_event, id, partial) => {
  return speakerService.updateSchedule(id, partial);
});

ipcMain.handle('schedule:remove', async (_event, id) => {
  return speakerService.removeSchedule(id);
});

ipcMain.handle('schedule:trigger', async (_event, id) => {
  return speakerService.triggerSchedule(id);
});

ipcMain.handle('dialog:openAudioFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Custom Audio File to Cast',
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});
