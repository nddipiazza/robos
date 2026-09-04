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
  copilotLaunchTerminal:    (id, extraArgs, cwd)  => ipcRenderer.invoke('copilot-launch-terminal', id, extraArgs, cwd),
  copilotLogin:             ()    => ipcRenderer.invoke('copilot-login'),
  copilotLogout:            ()    => ipcRenderer.invoke('copilot-logout'),
  copilotUpdate:            ()    => ipcRenderer.invoke('copilot-update'),
  copilotInstallExtension:  ()    => ipcRenderer.invoke('copilot-install-extension'),

  // Claude Code
  claudeSessions:        ()              => ipcRenderer.invoke('claude-sessions'),
  claudeConfig:          ()              => ipcRenderer.invoke('claude-config'),
  claudeFetchModels:     ()              => ipcRenderer.invoke('claude-fetch-models'),
  claudeLaunchTerminal:  (id, extraArgs, cwd) => ipcRenderer.invoke('claude-launch-terminal', id, extraArgs, cwd),
  claudeInstall:         ()              => ipcRenderer.invoke('claude-install'),
  claudeLogin:           ()              => ipcRenderer.invoke('claude-login'),
  claudeLogout:          ()              => ipcRenderer.invoke('claude-logout'),
  claudeWriteSettings:   (s)             => ipcRenderer.invoke('claude-write-settings', s),

  // Codex
  codexSessions:       ()              => ipcRenderer.invoke('codex-sessions'),
  codexFetchModels:    ()              => ipcRenderer.invoke('codex-fetch-models'),
  codexLaunchTerminal: (id, extraArgs) => ipcRenderer.invoke('codex-launch-terminal', id, extraArgs),
  codexLogin:          ()              => ipcRenderer.invoke('codex-login'),
  codexLogout:         ()              => ipcRenderer.invoke('codex-logout'),

  // Antigravity (AGY) / Gemini CLI
  antigravitySessions:       ()                     => ipcRenderer.invoke('antigravity-sessions'),
  antigravityFetchModels:    ()                     => ipcRenderer.invoke('antigravity-fetch-models'),
  antigravityLaunchTerminal: (id, extraArgs, cwd)   => ipcRenderer.invoke('antigravity-launch-terminal', id, extraArgs, cwd),
  antigravityRunMcpWorkflow: (workflowParams)       => ipcRenderer.invoke('antigravity-run-mcp-workflow', workflowParams),

  // MCP Server Management across Providers
  getMcpServers:    (providerId) => ipcRenderer.invoke('mcp-get-provider-servers', providerId),
  saveMcpServer:    (providerId, server) => ipcRenderer.invoke('mcp-save-provider-server', { providerId, server }),
  deleteMcpServer:  (providerId, serverId) => ipcRenderer.invoke('mcp-delete-provider-server', { providerId, serverId }),
  authMcpServer:    (providerId, serverId, credentials) => ipcRenderer.invoke('mcp-auth-provider-server', { providerId, serverId, credentials }),

  // General
  readSettings:   ()    => ipcRenderer.invoke('read-settings'),
  writeSettings:  (d)   => ipcRenderer.invoke('write-settings', d),
  openDirDialog:  ()    => ipcRenderer.invoke('open-dir-dialog'),

  // Events
  onOpenProvider: (cb) => ipcRenderer.on('open-provider', (_, id) => cb(id)),
});
