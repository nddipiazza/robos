'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  // STT / Dictation & Context
  getStatus: () => ipcRenderer.invoke('vp-get-status'),
  getAppContext: () => ipcRenderer.invoke('vp-get-app-context'),
  listDevices: () => ipcRenderer.invoke('vp-list-devices'),
  activate: (options) => ipcRenderer.invoke('vp-activate', options),
  deactivate: () => ipcRenderer.invoke('vp-deactivate'),
  dictate: (payload) => ipcRenderer.invoke('vp-dictate', payload),
  getPrompts: (query) => ipcRenderer.invoke('vp-get-prompts', query),
  getPrompt: (id) => ipcRenderer.invoke('vp-get-prompt', id),
  deletePrompt: (id) => ipcRenderer.invoke('vp-delete-prompt', id),
  clearPrompts: () => ipcRenderer.invoke('vp-clear-prompts'),
  getPrefs: () => ipcRenderer.invoke('vp-get-prefs'),
  savePrefs: (prefs) => ipcRenderer.invoke('vp-save-prefs', prefs),

  // Outgoing Voice (TTS)
  speak: (text, options) => ipcRenderer.invoke('vp-tts-speak', text, options),
  stopSpeaking: () => ipcRenderer.invoke('vp-tts-stop'),
  listVoices: () => ipcRenderer.invoke('vp-tts-get-voices'),
  getTTSPrefs: () => ipcRenderer.invoke('vp-tts-get-prefs'),
  saveTTSPrefs: (prefs) => ipcRenderer.invoke('vp-tts-save-prefs', prefs),

  // Background stream & Assistant
  toggleBackground: (enable) => ipcRenderer.invoke('vp-background-toggle', enable),
  askAssistant: (query, options) => ipcRenderer.invoke('vp-assistant-chat', query, options),
  getAssistantHistory: () => ipcRenderer.invoke('vp-assistant-get-history'),
  clearAssistantHistory: () => ipcRenderer.invoke('vp-assistant-clear-history'),
  toggleWakeWord: (enabled) => ipcRenderer.invoke('vp-wake-word-toggle', enabled),

  // Event Listeners
  onActivated: (callback) => {
    ipcRenderer.on('vp-event-activated', (_e, data) => callback(data));
  },
  onDeactivated: (callback) => {
    ipcRenderer.on('vp-event-deactivated', (_e, data) => callback(data));
  },
  onDictation: (callback) => {
    ipcRenderer.on('vp-event-dictation', (_e, data) => callback(data));
  },
  onInterimText: (callback) => {
    ipcRenderer.on('vp-event-interim-text', (_e, data) => callback(data));
  },
  onStreamText: (callback) => {
    ipcRenderer.on('vp-event-stream-text', (_e, data) => callback(data));
  },
  onWakeWord: (callback) => {
    ipcRenderer.on('vp-event-wake-word', (_e, data) => callback(data));
  },
  onAssistantState: (callback) => {
    ipcRenderer.on('vp-event-assistant-state', (_e, data) => callback(data));
  },
  onAssistantTurn: (callback) => {
    ipcRenderer.on('vp-event-assistant-turn', (_e, data) => callback(data));
  },
  streamToAgent: (payload) => ipcRenderer.invoke('vp-stream-to-agent', payload),
  onAgentResponse: (callback) => {
    ipcRenderer.on('vp-event-agent-response', (_e, data) => callback(data));
  },
};

contextBridge.exposeInMainWorld('voicePrompt', api);
contextBridge.exposeInMainWorld('robosVoice', api);
