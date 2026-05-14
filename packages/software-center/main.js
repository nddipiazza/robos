const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.setName('robos-software-center');
app.setPath('userData', path.join(process.env.HOME || '/home/robos', '.config', 'robos', 'electron', 'software-center'));
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  const w = require('electron').BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

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

  {
    id: 'openai-codex',
    name: 'OpenAI Codex CLI',
    description: 'OpenAI Codex — AI coding agent in your terminal',
    category: 'AI',
    source: 'npm (@openai/codex)',
    checkCmd: 'which codex',
    installCmd: 'sudo npm install -g @openai/codex && sudo apt-get install -y sqlite3',
    uninstallCmd: 'sudo npm uninstall -g @openai/codex',
  },


  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Visual Studio Code — lightweight code editor',
    category: 'IDE',
    source: 'code.visualstudio.com (deb package)',
    checkCmd: 'which code',
    installCmd: 'wget -qO /tmp/vscode.deb "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" && sudo dpkg -i /tmp/vscode.deb || sudo apt-get install -f -y && rm -f /tmp/vscode.deb && sudo cp /usr/share/applications/code.desktop /usr/share/applications/code.desktop.bak 2>/dev/null',
    uninstallCmd: 'sudo apt-get remove -y code && sudo rm -f /usr/share/applications/code.desktop',
  },
  {
    id: 'intellij-idea-community',
    name: 'IntelliJ IDEA Community',
    description: 'JetBrains Java/Kotlin IDE (free)',
    category: 'IDE',
    source: 'jetbrains.com (tar.gz)',
    checkCmd: 'ls /opt/idea-IC-*/bin/idea.sh 2>/dev/null | grep -q .',
    // Install via tarball so the IDE launches directly as Community Edition without a Trial/activation prompt.
    // The snap package triggers JetBrains' new licensing wizard even for the free tier.
    // JetBrains merged Community+Ultimate into a single tarball in 2025.x (code=IIC API now returns idea-IU).
    // Use the last version that ships a dedicated Community (idea-IC) tarball to avoid the Trial/activation prompt.
    installCmd: [
      'curl -L --retry 3 -o /tmp/ideaIC.tar.gz "https://download-cdn.jetbrains.com/idea/ideaIC-2024.3.tar.gz"',
      '&& sudo tar -xzf /tmp/ideaIC.tar.gz -C /opt',
      '&& IDEA_DIR=$(ls -d /opt/idea-IC-* | tail -1)',
      '&& sudo ln -sf "$IDEA_DIR/bin/idea.sh" /usr/local/bin/idea',
      '&& ICON="$IDEA_DIR/bin/idea.svg"',
      // Use echo+tee to avoid printf treating %f as a format specifier
      '&& { echo "[Desktop Entry]"; echo "Type=Application"; echo "Name=IntelliJ IDEA Community"; echo "Exec=idea %f"; echo "Icon=$ICON"; echo "Categories=Development;IDE;"; echo "StartupWMClass=jetbrains-idea-ce"; echo "Terminal=false"; } | sudo tee /usr/share/applications/intellij-idea-community.desktop > /dev/null',
      // Pre-seed config so first-run wizard (Trial nag) is suppressed
      '&& mkdir -p "$HOME/.config/JetBrains/IdeaIC2024.3/options"',
      '&& [ -f "$HOME/.config/JetBrains/IdeaIC2024.3/options/other.xml" ] || printf \'<?xml version="1.0" encoding="UTF-8"?>\\n<application>\\n  <component name="GeneralSettings"><option name="confirmExit" value="false" /></component>\\n  <component name="WelcomeScreen"><option name="showOnStartup" value="false" /></component>\\n</application>\\n\' > "$HOME/.config/JetBrains/IdeaIC2024.3/options/other.xml"',
      '&& rm -f /tmp/ideaIC.tar.gz',
    ].join(' '),
    uninstallCmd: 'sudo rm -rf /opt/idea-IC-* /usr/local/bin/idea /usr/share/applications/intellij-idea-community.desktop',
  },
  {
    id: 'pycharm-community',
    name: 'PyCharm Community',
    description: 'JetBrains Python IDE (free)',
    category: 'IDE',
    source: 'snap (pycharm-community)',
    checkCmd: 'ls /snap/pycharm-community/current 2>/dev/null',
    installCmd: 'sudo snap install pycharm-community --classic && sudo cp /var/lib/snapd/desktop/applications/pycharm-community_pycharm-community.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=PyCharm Community\nExec=pycharm-community %f\nIcon=/snap/pycharm-community/current/bin/pycharm.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-pycharm-ce\nTerminal=false" > /usr/share/applications/pycharm-community.desktop\'',
    uninstallCmd: 'sudo snap remove pycharm-community && sudo rm -f /usr/share/applications/pycharm-community*.desktop',
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    description: 'JetBrains JavaScript/TypeScript IDE',
    category: 'IDE',
    source: 'snap (webstorm)',
    checkCmd: 'ls /snap/webstorm/current 2>/dev/null',
    installCmd: 'sudo snap install webstorm --classic && sudo cp /var/lib/snapd/desktop/applications/webstorm_webstorm.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=WebStorm\nExec=webstorm %f\nIcon=/snap/webstorm/current/bin/webstorm.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-webstorm\nTerminal=false" > /usr/share/applications/webstorm.desktop\'',
    uninstallCmd: 'sudo snap remove webstorm && sudo rm -f /usr/share/applications/webstorm*.desktop',
  },
  {
    id: 'goland',
    name: 'GoLand',
    description: 'JetBrains Go IDE',
    category: 'IDE',
    source: 'snap (goland)',
    checkCmd: 'ls /snap/goland/current 2>/dev/null',
    installCmd: 'sudo snap install goland --classic && sudo cp /var/lib/snapd/desktop/applications/goland_goland.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=GoLand\nExec=goland %f\nIcon=/snap/goland/current/bin/goland.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-goland\nTerminal=false" > /usr/share/applications/goland.desktop\'',
    uninstallCmd: 'sudo snap remove goland && sudo rm -f /usr/share/applications/goland*.desktop',
  },
  {
    id: 'clion',
    name: 'CLion',
    description: 'JetBrains C/C++ IDE',
    category: 'IDE',
    source: 'snap (clion)',
    checkCmd: 'ls /snap/clion/current 2>/dev/null',
    installCmd: 'sudo snap install clion --classic && sudo cp /var/lib/snapd/desktop/applications/clion_clion.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=CLion\nExec=clion %f\nIcon=/snap/clion/current/bin/clion.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-clion\nTerminal=false" > /usr/share/applications/clion.desktop\'',
    uninstallCmd: 'sudo snap remove clion && sudo rm -f /usr/share/applications/clion*.desktop',
  },
  {
    id: 'rider',
    name: 'Rider',
    description: 'JetBrains .NET IDE',
    category: 'IDE',
    source: 'snap (rider)',
    checkCmd: 'ls /snap/rider/current 2>/dev/null',
    installCmd: 'sudo snap install rider --classic && sudo cp /var/lib/snapd/desktop/applications/rider_rider.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=Rider\nExec=rider %f\nIcon=/snap/rider/current/bin/rider.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-rider\nTerminal=false" > /usr/share/applications/rider.desktop\'',
    uninstallCmd: 'sudo snap remove rider && sudo rm -f /usr/share/applications/rider*.desktop',
  },
  {
    id: 'rustrover',
    name: 'RustRover',
    description: 'JetBrains Rust IDE',
    category: 'IDE',
    source: 'snap (rustrover)',
    checkCmd: 'ls /snap/rustrover/current 2>/dev/null',
    installCmd: 'sudo snap install rustrover --classic && sudo cp /var/lib/snapd/desktop/applications/rustrover_rustrover.desktop /usr/share/applications/ 2>/dev/null || sudo bash -c \'echo "[Desktop Entry]\nType=Application\nName=RustRover\nExec=rustrover %f\nIcon=/snap/rustrover/current/bin/rustrover.svg\nCategories=Development;IDE;\nStartupWMClass=jetbrains-rustrover\nTerminal=false" > /usr/share/applications/rustrover.desktop\'',
    uninstallCmd: 'sudo snap remove rustrover && sudo rm -f /usr/share/applications/rustrover*.desktop',
  },

  // ── Browsers ──
  {
    id: 'firefox',
    name: 'Firefox',
    description: 'Mozilla Firefox web browser (pre-installed as snap)',
    category: 'Browser',
    source: 'snap (firefox)',
    checkCmd: 'snap list firefox 2>/dev/null | grep -q firefox || which firefox',
    installCmd: 'sudo snap install firefox',
    uninstallCmd: 'sudo snap remove firefox',
  },
  {
    id: 'chromium',
    name: 'Chromium',
    description: 'Open-source browser from the Chromium project',
    category: 'Browser',
    source: 'snap (chromium)',
    checkCmd: 'snap list chromium 2>/dev/null | grep -q chromium || which chromium-browser || which chromium',
    installCmd: 'sudo snap install chromium',
    uninstallCmd: 'sudo snap remove chromium',
  },
  {
    id: 'google-chrome',
    name: 'Google Chrome',
    description: 'Google Chrome browser — downloaded directly from Google',
    category: 'Browser',
    source: 'dl.google.com (deb package)',
    checkCmd: 'which google-chrome || which google-chrome-stable',
    installCmd: 'wget -qO /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && sudo dpkg -i /tmp/google-chrome.deb; sudo apt-get install -f -y; rm -f /tmp/google-chrome.deb',
    uninstallCmd: 'sudo apt-get remove -y google-chrome-stable',
  },

  // ── Dev Tools ──  (Software Center)
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
    id: 'gh-copilot',
    name: 'GitHub Copilot CLI',
    description: 'GitHub Copilot coding agent for the terminal',
    category: 'Dev',
    source: 'npm (@github/copilot)',
    checkCmd: 'which copilot || test -f /usr/bin/copilot',
    installCmd: 'sudo npm install -g @github/copilot',
    uninstallCmd: 'sudo npm uninstall -g @github/copilot',
    updateCmd: 'sudo npm install -g @github/copilot@latest',
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

  // ── Screen Capture ──
  {
    id: 'flameshot',
    name: 'Flameshot',
    description: 'Powerful screenshot tool with annotation and upload support',
    category: 'Media',
    source: 'apt (flameshot)',
    checkCmd: 'which flameshot',
    installCmd: 'sudo apt-get install -y flameshot',
    uninstallCmd: 'pgrep flameshot | xargs -r kill; sudo apt-get remove -y flameshot',
    postInstallCmd: 'mkdir -p ~/.config/autostart && SRC=$(find /usr/share/applications -name "*lameshot*" | head -1) && [ -n "$SRC" ] && cp "$SRC" ~/.config/autostart/$(basename "$SRC"); DISPLAY=:0 nohup flameshot >/dev/null 2>&1 &',
    postUninstallCmd: 'rm -f ~/.config/autostart/*lameshot*',
  },
  {
    id: 'kazam',
    name: 'Kazam',
    description: 'Simple screen recorder with audio support',
    category: 'Media',
    source: 'apt (kazam)',
    checkCmd: 'which kazam',
    installCmd: 'sudo apt-get install -y kazam',
    uninstallCmd: 'sudo apt-get remove -y kazam',
  },
  {
    id: 'vlc',
    name: 'VLC Media Player',
    description: 'Free and open source cross-platform multimedia player',
    category: 'Media',
    source: 'apt (vlc)',
    checkCmd: 'which vlc',
    installCmd: 'sudo apt-get install -y vlc',
    uninstallCmd: 'sudo apt-get remove -y vlc',
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
  {
    id: 'sqlite3',
    name: 'SQLite3',
    description: 'Lightweight serverless SQL database engine and CLI',
    category: 'CLI',
    source: 'apt (sqlite3)',
    checkCmd: 'which sqlite3',
    installCmd: 'sudo apt-get install -y sqlite3',
    uninstallCmd: 'sudo apt-get remove -y sqlite3',
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
    if (code === 0) {
      const postCmd = action === 'uninstall' ? tool.postUninstallCmd : tool.postInstallCmd;
      if (postCmd) spawn('bash', ['-c', postCmd], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }, detached: true, stdio: 'ignore' }).unref();
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

  // Debug server (optional) — same resolution order as every other RobOS app.
  let _debug = null;
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debug = require(p); break; } catch {}
  }
  if (_debug) {
    try {
      _debug.registerSnapshotIPC(mainWindow);
      _debug.startDebugServer(mainWindow, 19137, 'software-center');
    } catch {}
  }
});

app.on('window-all-closed', () => app.quit());
