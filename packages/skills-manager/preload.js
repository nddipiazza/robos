'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  skillsList:       ()        => ipcRenderer.invoke('skills-list'),
  skillsSaveCustom: (skills)  => ipcRenderer.invoke('skills-save-custom', skills),
  skillsExport:     (skills)  => ipcRenderer.invoke('skills-export', skills),
  skillsOpenAiPrompt: ()      => ipcRenderer.invoke('skills-open-ai-prompt'),
});
