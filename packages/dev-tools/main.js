const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setName('robos-dev-tools');

let mainWindow = null;
const installLogs = {};

// Tool registry — each tool has an install command and a check command
const TOOLS = [
  // ── AI ──
  {
    id: 'claude-cli',
    name: 'Claude CLI',
    description: 'Anthropic Claude Code — AI coding assistant',
    category: 'AI',
    source: 'npm (@anthropic-ai/claude-code)',
    checkCmd: 'which claude',
    installCmd: 'sudo npm install -g @anthropic-ai/claude-code',
    uninstallCmd: 'sudo npm uninstall -g @anthropic-ai/claude-code',
  },
  {
    id: 'github-copilot-cli',
    name: 'GitHub Copilot CLI',
    description: 'AI-powered CLI assistant from GitHub',
    category: 'AI',
    source: 'npm (@githubnext/github-copilot-cli)',
    checkCmd: 'npm list -g @githubnext/github-copilot-cli 2>/dev/null | grep copilot',
    installCmd: 'sudo npm install -g @githubnext/github-copilot-cli',
    uninstallCmd: 'sudo npm uninstall -g @githubnext/github-copilot-cli',
  },

  // ── IDEs & Editors ──
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Visual Studio Code — lightweight code editor',
    category: 'IDE',
    source: 'code.visualstudio.com (deb package)',
    checkCmd: 'which code',
    installCmd: 'wget -qO /tmp/vscode.deb "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" && sudo dpkg -i /tmp/vscode.deb || sudo apt-get install -f -y && rm -f /tmp/vscode.deb',
    uninstallCmd: 'sudo apt-get remove -y code',
  },
  {
    id: 'intellij-idea-community',
    name: 'IntelliJ IDEA Community',
    description: 'JetBrains Java/Kotlin IDE (free)',
    category: 'IDE',
    source: 'snap (intellij-idea-community)',
    checkCmd: 'ls /opt/idea-IC-*/bin/idea.sh 2>/dev/null || ls /snap/intellij-idea-community/current 2>/dev/null',
    installCmd: 'sudo snap install intellij-idea-community --classic',
    uninstallCmd: 'sudo snap remove intellij-idea-community',
  },
  {
    id: 'pycharm-community',
    name: 'PyCharm Community',
    description: 'JetBrains Python IDE (free)',
    category: 'IDE',
    source: 'snap (pycharm-community)',
    checkCmd: 'ls /snap/pycharm-community/current 2>/dev/null',
    installCmd: 'sudo snap install pycharm-community --classic',
    uninstallCmd: 'sudo snap remove pycharm-community',
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    description: 'JetBrains JavaScript/TypeScript IDE',
    category: 'IDE',
    source: 'snap (webstorm)',
    checkCmd: 'ls /snap/webstorm/current 2>/dev/null',
    installCmd: 'sudo snap install webstorm --classic',
    uninstallCmd: 'sudo snap remove webstorm',
  },
  {
    id: 'goland',
    name: 'GoLand',
    description: 'JetBrains Go IDE',
    category: 'IDE',
    source: 'snap (goland)',
    checkCmd: 'ls /snap/goland/current 2>/dev/null',
    installCmd: 'sudo snap install goland --classic',
    uninstallCmd: 'sudo snap remove goland',
  },
  {
    id: 'clion',
    name: 'CLion',
    description: 'JetBrains C/C++ IDE',
    category: 'IDE',
    source: 'snap (clion)',
    checkCmd: 'ls /snap/clion/current 2>/dev/null',
    installCmd: 'sudo snap install clion --classic',
    uninstallCmd: 'sudo snap remove clion',
  },
  {
    id: 'rider',
    name: 'Rider',
    description: 'JetBrains .NET IDE',
    category: 'IDE',
    source: 'snap (rider)',
    checkCmd: 'ls /snap/rider/current 2>/dev/null',
    installCmd: 'sudo snap install rider --classic',
    uninstallCmd: 'sudo snap remove rider',
  },
  {
    id: 'rustrover',
    name: 'RustRover',
    description: 'JetBrains Rust IDE',
    category: 'IDE',
    source: 'snap (rustrover)',
    checkCmd: 'ls /snap/rustrover/current 2>/dev/null',
    installCmd: 'sudo snap install rustrover --classic',
    uninstallCmd: 'sudo snap remove rustrover',
  },

  // ── Dev Tools ──
  {
    id: 'gh-cli',
    name: 'GitHub CLI',
    description: 'Official GitHub command-line tool',
    category: 'Dev',
    source: 'cli.github.com (apt)',
    checkCmd: 'which gh',
    installCmd: 'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update -qq && sudo apt-get install -y gh',
    uninstallCmd: 'sudo apt-get remove -y gh',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Container runtime',
    category: 'Dev',
    source: 'get.docker.com',
    checkCmd: 'which docker',
    installCmd: 'curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker robos',
    uninstallCmd: 'sudo apt-get remove -y docker-ce docker-ce-cli containerd.io',
  },
  {
    id: 'lazygit',
    name: 'Lazygit',
    description: 'Terminal UI for git commands',
    category: 'Dev',
    source: 'github.com/jesseduffield/lazygit',
    checkCmd: 'which lazygit',
    installCmd: 'LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep \'"tag_name"\' | sed -E \'s/.*"v([^"]+)".*/\\1/\') && curl -Lo /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" && cd /tmp && tar xf lazygit.tar.gz lazygit && sudo install lazygit /usr/local/bin/',
    uninstallCmd: 'sudo rm -f /usr/local/bin/lazygit',
  },

  // ── CLI Utilities ──
  {
    id: 'ripgrep',
    name: 'ripgrep',
    description: 'Fast recursive search tool',
    category: 'CLI',
    source: 'apt (ripgrep)',
    checkCmd: 'which rg',
    installCmd: 'sudo apt-get install -y ripgrep',
    uninstallCmd: 'sudo apt-get remove -y ripgrep',
  },
  {
    id: 'fd-find',
    name: 'fd',
    description: 'Fast file finder (alternative to find)',
    category: 'CLI',
    source: 'apt (fd-find)',
    checkCmd: 'which fdfind || which fd',
    installCmd: 'sudo apt-get install -y fd-find',
    uninstallCmd: 'sudo apt-get remove -y fd-find',
  },
  {
    id: 'bat',
    name: 'bat',
    description: 'Cat clone with syntax highlighting',
    category: 'CLI',
    source: 'apt (bat)',
    checkCmd: 'which batcat || which bat',
    installCmd: 'sudo apt-get install -y bat',
    uninstallCmd: 'sudo apt-get remove -y bat',
  },
  {
    id: 'jq',
    name: 'jq',
    description: 'Command-line JSON processor',
    category: 'CLI',
    source: 'apt (jq)',
    checkCmd: 'which jq',
    installCmd: 'sudo apt-get install -y jq',
    uninstallCmd: 'sudo apt-get remove -y jq',
  },
  {
    id: 'fzf',
    name: 'fzf',
    description: 'Fuzzy finder for the terminal',
    category: 'CLI',
    source: 'apt (fzf)',
    checkCmd: 'which fzf',
    installCmd: 'sudo apt-get install -y fzf',
    uninstallCmd: 'sudo apt-get remove -y fzf',
  },
  {
    id: 'htop',
    name: 'htop',
    description: 'Interactive process viewer',
    category: 'CLI',
    source: 'apt (htop)',
    checkCmd: 'which htop',
    installCmd: 'sudo apt-get install -y htop',
    uninstallCmd: 'sudo apt-get remove -y htop',
  },
];

function checkInstalled(tool) {
  try {
    execSync(tool.checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function getToolsWithStatus() {
  return TOOLS.map(t => ({
    ...t,
    installed: checkInstalled(t),
    installing: !!installLogs[t.id]?.installing,
  }));
}

function runInstall(tool, action) {
  const cmd = action === 'uninstall' ? tool.uninstallCmd : tool.installCmd;
  const src = tool.source ? ` from ${tool.source}` : '';
  const label = action === 'uninstall'
    ? `Uninstalling ${tool.name}...\n`
    : `Downloading and installing ${tool.name}${src}...\n\n`;
  installLogs[tool.id] = { installing: true, log: label, action };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('install-progress', {
      toolId: tool.id, text: label, done: false, action
    });
  }

  const proc = spawn('bash', ['-c', cmd], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } });

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    installLogs[tool.id].log += text;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-progress', {
        toolId: tool.id, text, done: false, action
      });
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    installLogs[tool.id].log += text;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-progress', {
        toolId: tool.id, text, done: false, action
      });
    }
  });

  proc.on('close', (code) => {
    installLogs[tool.id].installing = false;
    installLogs[tool.id].exitCode = code;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('install-progress', {
        toolId: tool.id,
        text: `\n${action === 'uninstall' ? 'Uninstall' : 'Install'} ${code === 0 ? 'completed successfully' : 'failed (exit ' + code + ')'}.\n`,
        done: true,
        success: code === 0,
        action
      });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  ipcMain.handle('get-tools', () => getToolsWithStatus());
  ipcMain.handle('install-tool', (_e, toolId) => {
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool) runInstall(tool, 'install');
  });
  ipcMain.handle('uninstall-tool', (_e, toolId) => {
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool) runInstall(tool, 'uninstall');
  });
  ipcMain.handle('get-install-log', (_e, toolId) => {
    return installLogs[toolId]?.log || '';
  });

  createWindow();

  // Debug server
  try {
    const { registerSnapshotIPC, startDebugServer } = require('/usr/local/share/robos/robos-lib/dom-snapshot');
    registerSnapshotIPC(mainWindow);
    startDebugServer(mainWindow, 19122, 'dev-tools');
  } catch { /* robos-lib not deployed yet */ }
});

app.on('window-all-closed', () => app.quit());
