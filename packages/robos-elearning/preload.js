'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robosELearning', {
  getInitialTarget: () => ipcRenderer.invoke('elearning:get-initial-target'),
  listCourses: () => ipcRenderer.invoke('elearning:list-courses'),
  getCourse: (id) => ipcRenderer.invoke('elearning:get-course', id),
  issueCertificate: (payload) => ipcRenderer.invoke('elearning:issue-certificate', payload),
  listCertificates: (opts) => ipcRenderer.invoke('elearning:list-certificates', opts),
  exportWebsite: (opts) => ipcRenderer.invoke('elearning:export-website', opts),
  // Voice Assistant & Real-Time Co-Authoring
  startVoiceAssistant: (opts) => ipcRenderer.invoke('elearning:start-voice-assistant', opts),
  stopVoiceAssistant: () => ipcRenderer.invoke('elearning:stop-voice-assistant'),
  getVoiceStatus: () => ipcRenderer.invoke('elearning:get-voice-status'),
  onVoiceMutation: (callback) => {
    ipcRenderer.on('elearning:voice-mutation', (_e, data) => callback(data));
  },
  onVoiceStreamEvent: (callback) => {
    ipcRenderer.on('elearning:voice-stream-event', (_e, data) => callback(data));
  },
});