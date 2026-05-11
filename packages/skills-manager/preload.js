'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  skillsList:           ()           => ipcRenderer.invoke('skills-list'),
  skillsSaveCustom:     (skills)     => ipcRenderer.invoke('skills-save-custom', skills),
  skillsExport:         (skills)     => ipcRenderer.invoke('skills-export', skills),
  skillsOpenAiPrompt:   ()           => ipcRenderer.invoke('skills-open-ai-prompt'),
  // Skill Packs
  skillsPacksList:      ()           => ipcRenderer.invoke('skills-packs-list'),
  skillsPacksBrowse:    (packId)     => ipcRenderer.invoke('skills-packs-browse', packId),
  skillsPacksPreview:   (pattern)    => ipcRenderer.invoke('skills-packs-preview', pattern),
  skillsPacksClone:     (packId)     => ipcRenderer.invoke('skills-packs-clone', packId),
  skillsPacksImport:    (payload)    => ipcRenderer.invoke('skills-packs-import', payload),
});
