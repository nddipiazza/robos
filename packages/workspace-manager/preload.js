const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scanWorkspaces:      (opts) => ipcRenderer.invoke('scan-workspaces', opts),
  detectIDEs:          ()     => ipcRenderer.invoke('detect-ides'),
  openInIDE:           (opts) => ipcRenderer.invoke('open-in-ide', opts),
  openInFiles:         (opts) => ipcRenderer.invoke('open-in-files', opts),
  openTerminal:        (opts) => ipcRenderer.invoke('open-terminal', opts),
  getHome:             ()     => ipcRenderer.invoke('get-home'),
  readVscodeSettings:  (opts) => ipcRenderer.invoke('read-vscode-settings', opts),
  listRobosDesktops:   ()     => ipcRenderer.invoke('list-robos-desktops'),
  getGitInfo:          (opts) => ipcRenderer.invoke('get-git-info', opts),
  loadWorkspaceConfig: ()     => ipcRenderer.invoke('load-workspace-config'),
  saveWorkspaceConfig: (cfg)  => ipcRenderer.invoke('save-workspace-config', cfg),
  saveWorkspaceState:  (opts) => ipcRenderer.invoke('save-workspace-state', opts),
  loadWorkspaceState:  (opts) => ipcRenderer.invoke('load-workspace-state', opts),
  listWorkspaceStates: ()     => ipcRenderer.invoke('list-workspace-states'),

  // Multi-Repo Worktree Engine
  getProjects:         ()     => ipcRenderer.invoke('ws-get-projects'),
  listBranches:        ()     => ipcRenderer.invoke('ws-list-branches'),
  switchBranch:        (b)    => ipcRenderer.invoke('ws-switch-branch', b),
  syncWorktrees:       (id)   => ipcRenderer.invoke('ws-sync-worktrees', id),
  teardownWorktree:    (id)   => ipcRenderer.invoke('ws-teardown-worktree', id),
  openMultiRepoIDE:    (ide)  => ipcRenderer.invoke('ws-open-ide', ide),
});
