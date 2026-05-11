'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  listSkills:        ()         => ipcRenderer.invoke('ap-list-skills'),
  runPrompt:         (params)   => ipcRenderer.invoke('ap-run-prompt', params),
  historyList:       ()         => ipcRenderer.invoke('ap-history-list'),
  historyClear:      ()         => ipcRenderer.invoke('ap-history-clear'),
  openSkillsManager: ()         => ipcRenderer.invoke('ap-open-skills-manager'),
});
