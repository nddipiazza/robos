'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('robos', {
  listSkills:          ()         => ipcRenderer.invoke('ap-list-skills'),
  runPrompt:           (params)   => ipcRenderer.invoke('ap-run-prompt', params),
  historyList:         ()         => ipcRenderer.invoke('ap-history-list'),
  historyClear:        ()         => ipcRenderer.invoke('ap-history-clear'),
  openSkillsManager:   ()         => ipcRenderer.invoke('ap-open-skills-manager'),
  searchIndex:         (prefix)   => ipcRenderer.invoke('ap-list-path', prefix),
  checkAgentAuth:      (agentId)  => ipcRenderer.invoke('robos-check-agent-auth', agentId),
  openLoginTerminal:   (cmd)      => ipcRenderer.invoke('ap-open-login-terminal', cmd),
});

// Default answer for the textarea's quick-ask button (robos-lib/quick-ask).
contextBridge.exposeInMainWorld('robosQuickAsk', (question, context, contextFiles, onChunk, onDone, onError) => {
  ipcRenderer.invoke('robos-quick-ask', { question, context, contextFiles })
    .then(r => { if (r && r.ok) { onChunk(r.text); onDone(); } else onError((r && r.error) || 'No answer'); })
    .catch(e => onError(e.message));
});
