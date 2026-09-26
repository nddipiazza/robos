'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const hudApi = {
  getStatus: () => ipcRenderer.invoke('vp-get-status'),
  getPrefs: () => ipcRenderer.invoke('vp-get-prefs'),
  savePrefs: (prefs) => ipcRenderer.invoke('vp-save-prefs', prefs),
  setHudPosition: (pos) => ipcRenderer.invoke('vp-hud-set-position', pos),
  hideHud: () => ipcRenderer.invoke('vp-hud-hide'),
  showHud: () => ipcRenderer.invoke('vp-hud-show'),
  toggleMic: (enable) => ipcRenderer.invoke('vp-hud-toggle-mic', enable),
  stopTts: () => ipcRenderer.invoke('vp-tts-stop'),
  speak: (text, opts) => ipcRenderer.invoke('vp-tts-speak', text, opts),
  triggerWakeWord: () => ipcRenderer.invoke('vp-trigger-wake-word'),
  executeSkill: (cmd, opts) => ipcRenderer.invoke('vp-skills-execute', cmd, opts),
  askAssistant: (query, opts) => ipcRenderer.invoke('vp-assistant-chat', query, opts),
  getAssistantHistory: () => ipcRenderer.invoke('vp-assistant-get-history'),
  clearAssistantHistory: () => ipcRenderer.invoke('vp-assistant-clear-history'),

  // Events from main process
  onRecordingState: (callback) => {
    ipcRenderer.on('vp-hud-recording-state', (_e, data) => callback(data));
  },
  onWakeGreeting: (callback) => {
    ipcRenderer.on('vp-hud-wake-greeting', (_e, data) => callback(data));
  },
  onStreamText: (callback) => {
    ipcRenderer.on('vp-hud-stream-text', (_e, data) => callback(data));
  },
  onAssistantState: (callback) => {
    ipcRenderer.on('vp-hud-assistant-state', (_e, data) => callback(data));
  },
  onActionDone: (callback) => {
    ipcRenderer.on('vp-hud-action-done', (_e, data) => callback(data));
  },
  onAssistantTurn: (callback) => {
    ipcRenderer.on('vp-hud-assistant-turn', (_e, data) => callback(data));
  },
  onInterimText: (callback) => {
    ipcRenderer.on('vp-hud-interim-text', (_e, data) => callback(data));
  },
};

contextBridge.exposeInMainWorld('robosVoiceHud', hudApi);
