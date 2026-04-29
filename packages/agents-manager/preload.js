const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agents', {
  // Provider detection
  detectProviders:      ()     => ipcRenderer.invoke('detect-providers'),
  getActiveProvider:    ()     => ipcRenderer.invoke('get-active-provider'),
  setActiveProvider:    (id)   => ipcRenderer.invoke('set-active-provider', id),

  // GitHub Copilot
  copilotSessions:          ()    => ipcRenderer.invoke('copilot-sessions'),
  copilotDeleteSession:     (id)  => ipcRenderer.invoke('copilot-delete-session', id),
  copilotFetchModels:       ()             => ipcRenderer.invoke('copilot-fetch-models'),
  copilotLaunchTerminal:    (id, extraArgs)  => ipcRenderer.invoke('copilot-launch-terminal', id, extraArgs),
  copilotLogin:             ()    => ipcRenderer.invoke('copilot-login'),
  copilotUpdate:            ()    => ipcRenderer.invoke('copilot-update'),
  copilotInstallExtension:  ()    => ipcRenderer.invoke('copilot-install-extension'),

  // Claude Code
  claudeSessions:        ()    => ipcRenderer.invoke('claude-sessions'),
  claudeConfig:          ()    => ipcRenderer.invoke('claude-config'),
  claudeLaunchTerminal:  (id)  => ipcRenderer.invoke('claude-launch-terminal', id),
  claudeInstall:         ()    => ipcRenderer.invoke('claude-install'),
  claudeWriteSettings:   (s)   => ipcRenderer.invoke('claude-write-settings', s),

  // Codex
  codexSessions:       ()              => ipcRenderer.invoke('codex-sessions'),
  codexFetchModels:    ()              => ipcRenderer.invoke('codex-fetch-models'),
  codexLaunchTerminal: (id, extraArgs) => ipcRenderer.invoke('codex-launch-terminal', id, extraArgs),
  codexLogin:          ()              => ipcRenderer.invoke('codex-login'),

  // General
  readSettings:   ()    => ipcRenderer.invoke('read-settings'),
  writeSettings:  (d)   => ipcRenderer.invoke('write-settings', d),
  openDirDialog:  ()    => ipcRenderer.invoke('open-dir-dialog'),

  // Events
  onOpenProvider: (cb) => ipcRenderer.on('open-provider', (_, id) => cb(id)),
});
