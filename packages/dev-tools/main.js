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
  {
    id: 'github-copilot-cli',
    name: 'GitHub Copilot CLI',
    description: 'AI-powered CLI assistant from GitHub',
    category: 'AI',
    checkCmd: 'npm list -g @githubnext/github-copilot-cli 2>/dev/null | grep copilot',
    installCmd: 'sudo npm install -g @githubnext/github-copilot-cli',
    uninstallCmd: 'sudo npm uninstall -g @githubnext/github-copilot-cli',
  },
  {
    id: 'gh-cli',
    name: 'GitHub CLI',
    description: 'Official GitHub command-line tool',
    category: 'Dev',
    checkCmd: 'which gh',
    installCmd: 'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt-get update -qq && sudo apt-get install -y gh',
    uninstallCmd: 'sudo apt-get remove -y gh',
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Container runtime',
    category: 'Dev',
    checkCmd: 'which docker',
    installCmd: 'curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker robos',
    uninstallCmd: 'sudo apt-get remove -y docker-ce docker-ce-cli containerd.io',
  },
  {
    id: 'lazygit',
    name: 'Lazygit',
    description: 'Terminal UI for git commands',
    category: 'Dev',
    checkCmd: 'which lazygit',
    installCmd: 'LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep \'"tag_name"\' | sed -E \'s/.*"v([^"]+)".*/\\1/\') && curl -Lo /tmp/lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz" && cd /tmp && tar xf lazygit.tar.gz lazygit && sudo install lazygit /usr/local/bin/',
    uninstallCmd: 'sudo rm -f /usr/local/bin/lazygit',
  },
  {
    id: 'ripgrep',
    name: 'ripgrep',
    description: 'Fast recursive search tool',
    category: 'Dev',
    checkCmd: 'which rg',
    installCmd: 'sudo apt-get install -y ripgrep',
    uninstallCmd: 'sudo apt-get remove -y ripgrep',
  },
  {
    id: 'fd-find',
    name: 'fd',
    description: 'Fast file finder (alternative to find)',
    category: 'Dev',
    checkCmd: 'which fdfind || which fd',
    installCmd: 'sudo apt-get install -y fd-find',
    uninstallCmd: 'sudo apt-get remove -y fd-find',
  },
  {
    id: 'bat',
    name: 'bat',
    description: 'Cat clone with syntax highlighting',
    category: 'Dev',
    checkCmd: 'which batcat || which bat',
    installCmd: 'sudo apt-get install -y bat',
    uninstallCmd: 'sudo apt-get remove -y bat',
  },
  {
    id: 'jq',
    name: 'jq',
    description: 'Command-line JSON processor',
    category: 'Dev',
    checkCmd: 'which jq',
    installCmd: 'sudo apt-get install -y jq',
    uninstallCmd: 'sudo apt-get remove -y jq',
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
  installLogs[tool.id] = { installing: true, log: '', action };

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
