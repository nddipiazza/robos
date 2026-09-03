const { contextBridge, ipcRenderer } = require('electron');

// 1. RobOS Onboarding Primary API
contextBridge.exposeInMainWorld('onboardingAPI', {
  getState: () => ipcRenderer.invoke('get-onboarding-state'),
  saveStep: (stepId, data) => ipcRenderer.invoke('save-onboarding-step', { stepId, data }),
  
  // Security / GPG / Pass
  checkPassPrerequisite: () => ipcRenderer.invoke('check-pass-prerequisite'),
  getSecurityStatus: () => ipcRenderer.invoke('get-security-status'),
  createGpgKey: (opts) => ipcRenderer.invoke('create-gpg-key', opts),
  initPass: (opts) => ipcRenderer.invoke('init-pass', opts),
  configurePinentry: () => ipcRenderer.invoke('configure-pinentry'),

  // SSH / Git / Browser
  getSshStatus: () => ipcRenderer.invoke('get-ssh-status'),
  generateSshKey: (opts) => ipcRenderer.invoke('generate-ssh-key', opts),
  addSshKeyToGithub: () => ipcRenderer.invoke('add-ssh-key-to-github'),
  testSshConnection: () => ipcRenderer.invoke('test-ssh-connection'),
  getGitConfig: () => ipcRenderer.invoke('get-git-config'),
  saveGitConfig: (opts) => ipcRenderer.invoke('save-git-config', opts),
  getBrowserStatus: () => ipcRenderer.invoke('get-browser-status'),
  installGoogleChrome: () => ipcRenderer.invoke('install-google-chrome'),
  setChromeDefaultBrowser: () => ipcRenderer.invoke('set-chrome-default-browser'),
  openUrlInBrowser: (url) => ipcRenderer.invoke('open-url-in-browser', url),
  getGhAuthStatus: () => ipcRenderer.invoke('get-gh-auth-status'),
  startGhLogin: () => ipcRenderer.invoke('start-gh-login'),
  loginGhWithToken: (token) => ipcRenderer.invoke('login-gh-with-token', token),

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

// 2. Embedded Agents Manager API
contextBridge.exposeInMainWorld('agents', {
  detectProviders:      ()     => ipcRenderer.invoke('detect-providers'),
  getActiveProvider:    ()     => ipcRenderer.invoke('get-active-provider'),
  setActiveProvider:    (id)   => ipcRenderer.invoke('set-active-provider', id),
  copilotSessions:          ()    => ipcRenderer.invoke('copilot-sessions'),
  copilotDeleteSession:     (id)  => ipcRenderer.invoke('copilot-delete-session', id),
  copilotFetchModels:       ()             => ipcRenderer.invoke('copilot-fetch-models'),
  copilotLaunchTerminal:    (id, extraArgs, cwd)  => ipcRenderer.invoke('copilot-launch-terminal', id, extraArgs, cwd),
  copilotLogin:             ()    => ipcRenderer.invoke('copilot-login'),
  copilotLogout:            ()    => ipcRenderer.invoke('copilot-logout'),
  copilotUpdate:            ()    => ipcRenderer.invoke('copilot-update'),
  copilotInstallExtension:  ()    => ipcRenderer.invoke('copilot-install-extension'),
  claudeSessions:        ()              => ipcRenderer.invoke('claude-sessions'),
  claudeConfig:          ()              => ipcRenderer.invoke('claude-config'),
  claudeFetchModels:     ()              => ipcRenderer.invoke('claude-fetch-models'),
  claudeLaunchTerminal:  (id, extraArgs, cwd) => ipcRenderer.invoke('claude-launch-terminal', id, extraArgs, cwd),
  claudeInstall:         ()              => ipcRenderer.invoke('claude-install'),
  claudeLogin:           ()              => ipcRenderer.invoke('claude-login'),
  claudeLogout:          ()              => ipcRenderer.invoke('claude-logout'),
  claudeWriteSettings:   (s)             => ipcRenderer.invoke('claude-write-settings', s),
  codexSessions:       ()              => ipcRenderer.invoke('codex-sessions'),
  codexFetchModels:    ()              => ipcRenderer.invoke('codex-fetch-models'),
  codexLaunchTerminal: (id, extraArgs) => ipcRenderer.invoke('codex-launch-terminal', id, extraArgs),
  codexLogin:          ()              => ipcRenderer.invoke('codex-login'),
  codexLogout:         ()              => ipcRenderer.invoke('codex-logout'),
  readSettings:   ()    => ipcRenderer.invoke('read-settings'),
  writeSettings:  (d)   => ipcRenderer.invoke('write-settings', d),
  openDirDialog:  ()    => ipcRenderer.invoke('open-dir-dialog'),
  onOpenProvider: (cb) => ipcRenderer.on('open-provider', (_, id) => cb(id)),
});

// 3. Embedded Software Center API
contextBridge.exposeInMainWorld('robos', {
  getTools: () => ipcRenderer.invoke('get-tools'),
  installTool: (toolId) => ipcRenderer.invoke('install-tool', toolId),
  uninstallTool: (toolId) => ipcRenderer.invoke('uninstall-tool', toolId),
  getInstallLog: (toolId) => ipcRenderer.invoke('get-install-log', toolId),
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_event, data) => callback(data));
  }
});

// 4. Embedded Git Projects API
contextBridge.exposeInMainWorld('gp', {
  readProjects:  ()              => ipcRenderer.invoke('read-projects'),
  writeProjects: (data)          => ipcRenderer.invoke('write-projects', data),
  parseUrl:      (url)           => ipcRenderer.invoke('parse-url', url),
  checkCloned:   (localPath)     => ipcRenderer.invoke('check-cloned', localPath),
  clone:         (url, lp)       => ipcRenderer.invoke('clone', { url, localPath: lp }),
  pull:          (lp)            => ipcRenderer.invoke('pull', { localPath: lp }),
  openVsCode:         (lp)                              => ipcRenderer.invoke('open-vscode', lp),
  openVsCodeScript:   (projectId, script, type)         => ipcRenderer.invoke('open-vscode-script', { projectId, script, type }),
  getInstalledIDEs:   ()                                => ipcRenderer.invoke('get-installed-ides'),
  openInIDE:          (cmd, lp)                         => ipcRenderer.invoke('open-in-ide', { cmd, localPath: lp }),
  openTerminal:  (lp)            => ipcRenderer.invoke('open-terminal', lp),
  openBrowser:   (url)           => ipcRenderer.invoke('open-browser', url),
  getBranches:   (lp)            => ipcRenderer.invoke('get-branches', lp),
  getLog:        (lp)            => ipcRenderer.invoke('get-log', lp),
  onCloneOutput: (cb)            => ipcRenderer.on('clone-output', (_, d) => cb(d)),
  listGhRepos:   ()              => ipcRenderer.invoke('list-gh-repos'),
  searchGhRepos: (q)             => ipcRenderer.invoke('search-gh-repos', { query: q }),
  runDevSetup:   (lp, script)    => ipcRenderer.invoke('run-dev-setup', { localPath: lp, script }),
  openInExplorer:(lp)            => ipcRenderer.invoke('open-in-explorer', lp),
  aiFixScript:        (lp, url, script, err, type)     => ipcRenderer.invoke('ai-fix-devsetup-script', { localPath: lp, repoUrl: url, script, errorOutput: err, type }),
  aiDevSetupStep:     (lp, url, p, step)                  => ipcRenderer.invoke('ai-dev-setup-step', { localPath: lp, repoUrl: url, extraPrompt: p, step }),
  aiDevSetupInterview:(lp, url, p)                      => ipcRenderer.invoke('ai-dev-setup-interview', { localPath: lp, repoUrl: url, extraPrompt: p }),
  aiRefineDevSetup:   (lp, url, field, current, feedback) => ipcRenderer.invoke('ai-refine-devsetup', { localPath: lp, repoUrl: url, field, current, feedback }),
  aiDetectSecrets: (lp, url)     => ipcRenderer.invoke('ai-detect-secrets', { localPath: lp, repoUrl: url }),
  listPath:        (prefix)      => ipcRenderer.invoke('list-path', prefix),
  listGroups:      ()            => ipcRenderer.invoke('list-groups'),
  listOrgRepos:    (org)         => ipcRenderer.invoke('list-org-repos', org),
  listAIProviders: ()            => ipcRenderer.invoke('gp-list-ai-providers'),
  aiCreateRepos:   (prompt, pid) => ipcRenderer.invoke('gp-ai-create-repos', { prompt, providerId: pid || null }),
  onIntellijWait: (cb) => ipcRenderer.on('intellij-wait', (_, info) => cb(info)),
  runInIntellij:   (projectId, projectPath, scripts, scriptKey) => ipcRenderer.invoke('run-in-intellij', { projectId, projectPath, scripts, scriptKey }),
  logsSearch:      (opts)        => ipcRenderer.invoke('logs-search', opts),
  logsListApps:    ()            => ipcRenderer.invoke('logs-list-apps'),
});

// Bridge preload APIs to child iframes automatically
function bridgeToFrame(frame) {
  try {
    if (frame && frame.contentWindow) {
      if (!frame.contentWindow.agents) frame.contentWindow.agents = window.agents;
      if (!frame.contentWindow.robos) frame.contentWindow.robos = window.robos;
      if (!frame.contentWindow.gp) frame.contentWindow.gp = window.gp;
    }
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('iframe').forEach(iframe => {
    iframe.addEventListener('load', () => bridgeToFrame(iframe));
    bridgeToFrame(iframe);
  });
  setInterval(() => {
    document.querySelectorAll('iframe').forEach(bridgeToFrame);
  }, 250);
});
