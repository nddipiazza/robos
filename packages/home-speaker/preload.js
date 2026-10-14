'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosSpeaker', {
  scanSpeakers: () => ipcRenderer.invoke('speakers:scan'),
  getSpeakers: () => ipcRenderer.invoke('speakers:get'),
  probeSpeakers: () => ipcRenderer.invoke('speakers:probe'),
  getStatus: (targetIp) => ipcRenderer.invoke('speakers:getStatus', targetIp),
  setVolume: (targetIp, level, muted) => ipcRenderer.invoke('speakers:setVolume', targetIp, level, muted),
  stopPlayback: (targetIp) => ipcRenderer.invoke('speakers:stop', targetIp),
  pausePlayback: (targetIp) => ipcRenderer.invoke('speakers:pause', targetIp),
  resumePlayback: (targetIp) => ipcRenderer.invoke('speakers:resume', targetIp),
  castFile: (target, filePath, metadata) => ipcRenderer.invoke('speakers:castFile', target, filePath, metadata),
  castTTS: (target, text, options) => ipcRenderer.invoke('speakers:castTTS', target, text, options),
  castVoiceRecording: (target, arrayBuffer, options) => ipcRenderer.invoke('speakers:castVoiceRecording', target, arrayBuffer, options),
  playSound: (target, soundId) => ipcRenderer.invoke('speakers:playSound', target, soundId),
  playAmbient: (target, soundType, durationMinutes) => ipcRenderer.invoke('speakers:playAmbient', target, soundType, durationMinutes),
  listSounds: () => ipcRenderer.invoke('speakers:listSounds'),
  listVoices: () => ipcRenderer.invoke('speakers:listVoices'),
  openAudioFileDialog: () => ipcRenderer.invoke('dialog:openAudioFile'),
});
