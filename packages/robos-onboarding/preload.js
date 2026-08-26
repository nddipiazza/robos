const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onboardingAPI', {
  getState: () => ipcRenderer.invoke('get-onboarding-state'),
  saveStep: (stepId, data) => ipcRenderer.invoke('save-onboarding-step', { stepId, data }),
  
  // Security / GPG / Pass
  getSecurityStatus: () => ipcRenderer.invoke('get-security-status'),
  createGpgKey: (opts) => ipcRenderer.invoke('create-gpg-key', opts),
  initPass: (opts) => ipcRenderer.invoke('init-pass', opts),
  configurePinentry: () => ipcRenderer.invoke('configure-pinentry'),

  // SSH / Git
  getSshStatus: () => ipcRenderer.invoke('get-ssh-status'),
  generateSshKey: (opts) => ipcRenderer.invoke('generate-ssh-key', opts),
  addSshKeyToGithub: () => ipcRenderer.invoke('add-ssh-key-to-github'),
  testSshConnection: () => ipcRenderer.invoke('test-ssh-connection'),
  getGitConfig: () => ipcRenderer.invoke('get-git-config'),
  saveGitConfig: (opts) => ipcRenderer.invoke('save-git-config', opts),
  getGhAuthStatus: () => ipcRenderer.invoke('get-gh-auth-status'),
  startGhLogin: () => ipcRenderer.invoke('start-gh-login'),

  // AI Agents
  getAiAgentConfig: () => ipcRenderer.invoke('get-ai-agent-config'),
  saveAiAgentConfig: (opts) => ipcRenderer.invoke('save-ai-agent-config', opts),
  testAgentConnection: (opts) => ipcRenderer.invoke('test-agent-connection', opts),

  // Catalog & Projects
  getDevAppsCatalog: () => ipcRenderer.invoke('get-dev-apps-catalog'),
  getGitProjectsList: () => ipcRenderer.invoke('get-git-projects-list'),

  // Completion
  completeOnboarding: (details) => ipcRenderer.invoke('complete-onboarding', details),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  launchApp: (appId) => ipcRenderer.invoke('launch-app', appId),
});
