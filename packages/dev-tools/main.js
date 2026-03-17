'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// Each RobOS app needs its own user-data dir to avoid singleton lock conflicts
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'dev-tools'));

const lock = app.requestSingleInstanceLock();
if (!lock) { app.quit(); }

app.setName('robos-dev-tools');

let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1100, height: 820,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Dev Tools',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Tool catalogue ───────────────────────────────────────────────────────────
const TOOL_CATALOGUE = [
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    description: 'AI-first code editor built on VS Code. Native Claude integration, chat with your codebase.',
    icon: 'cursor',
    category: 'AI Editors',
    detectCmd: 'cursor',
    detectPaths: ['/usr/bin/cursor', '/usr/local/bin/cursor', '/opt/cursor/cursor'],
    installMethod: 'appimage',
    installUrl: 'https://cursor.sh',
    installScript: `
      set -e
      echo "Downloading Cursor AppImage..."
      DOWNLOAD_URL=$(curl -fsSL "https://cursor.com/api/download?platform=linux-x64&releaseTrack=stable" | python3 -c "import sys,json; print(json.load(sys.stdin)['downloadUrl'])")
      echo "URL: $DOWNLOAD_URL"
      curl -fSL "$DOWNLOAD_URL" -o /tmp/cursor.AppImage
      chmod +x /tmp/cursor.AppImage
      sudo mv /tmp/cursor.AppImage /usr/local/bin/cursor
      echo "Cursor installed at /usr/local/bin/cursor"
    `,
  },
  {
    id: 'code',
    name: 'Visual Studio Code',
    vendor: 'Microsoft',
    description: 'Lightweight but powerful source code editor with built-in Git, debugging, and extensions.',
    icon: 'vscode',
    category: 'Code Editors',
    detectCmd: 'code',
    detectPaths: ['/usr/bin/code', '/usr/share/code/code', '/snap/bin/code'],
    installMethod: 'deb',
    installUrl: 'https://code.visualstudio.com',
    installScript: `
      set -e
      echo "Installing VS Code via apt..."
      wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > /tmp/packages.microsoft.gpg
      sudo install -D -o root -g root -m 644 /tmp/packages.microsoft.gpg /etc/apt/keyrings/packages.microsoft.gpg
      echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null
      sudo apt update -q
      sudo apt install -y code
      echo "VS Code installed."
    `,
  },
  {
    id: 'idea',
    name: 'IntelliJ IDEA',
    vendor: 'JetBrains',
    description: 'The IDE for Java, Kotlin, Groovy, and other JVM languages. Deep code intelligence.',
    icon: 'intellij',
    isJetBrains: true,
    productCode: 'IIC',
    category: 'JetBrains IDEs',
    detectCmd: 'idea',
    detectPaths: ['/opt/idea/bin/idea', '/usr/local/bin/idea'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/idea/',
    wmClass: 'jetbrains-idea-ce',
    optDirPattern: '/opt/idea-IC-*',
    installScript: `
      set -e
      echo "Downloading IntelliJ IDEA..."
      IDEA_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=IIC&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['IIC'][0]['downloads']['linux']['link'])")
      curl -L "$IDEA_URL" -o /tmp/idea.tar.gz
      sudo tar -xzf /tmp/idea.tar.gz -C /opt/
      IDEA_DIR=$(ls -d /opt/idea-IC-* | head -1)
      sudo ln -sf "$IDEA_DIR/bin/idea" /usr/local/bin/idea
      echo "IntelliJ IDEA installed."
    `,
  },
  {
    id: 'webstorm',
    name: 'WebStorm',
    vendor: 'JetBrains',
    description: 'The smartest IDE for JavaScript, TypeScript, React, Node.js, and modern web development.',
    icon: 'webstorm',
    isJetBrains: true,
    productCode: 'WS',
    category: 'JetBrains IDEs',
    detectCmd: 'webstorm',
    detectPaths: ['/opt/webstorm/bin/webstorm', '/usr/local/bin/webstorm'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/webstorm/',
    wmClass: 'jetbrains-webstorm',
    optDirPattern: '/opt/WebStorm-*',
    installScript: `
      set -e
      echo "Downloading WebStorm..."
      WS_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=WS&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['WS'][0]['downloads']['linux']['link'])")
      curl -L "$WS_URL" -o /tmp/webstorm.tar.gz
      sudo tar -xzf /tmp/webstorm.tar.gz -C /opt/
      WS_DIR=$(ls -d /opt/WebStorm-* | head -1)
      sudo ln -sf "$WS_DIR/bin/webstorm" /usr/local/bin/webstorm
      echo "WebStorm installed."
    `,
  },
  {
    id: 'pycharm',
    name: 'PyCharm',
    vendor: 'JetBrains',
    description: 'The IDE for professional Python development. Smart code editor, debugger, and test runner.',
    icon: 'pycharm',
    isJetBrains: true,
    productCode: 'PCC',
    category: 'JetBrains IDEs',
    detectCmd: 'pycharm',
    detectPaths: ['/opt/pycharm/bin/pycharm', '/usr/local/bin/pycharm'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/pycharm/',
    wmClass: 'jetbrains-pycharm-ce',
    optDirPattern: '/opt/pycharm-community-*',
    installScript: `
      set -e
      echo "Downloading PyCharm Community..."
      PC_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=PCC&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['PCC'][0]['downloads']['linux']['link'])")
      curl -L "$PC_URL" -o /tmp/pycharm.tar.gz
      sudo tar -xzf /tmp/pycharm.tar.gz -C /opt/
      PC_DIR=$(ls -d /opt/pycharm-community-* | head -1)
      sudo ln -sf "$PC_DIR/bin/pycharm" /usr/local/bin/pycharm
      echo "PyCharm installed."
    `,
  },
  {
    id: 'goland',
    name: 'GoLand',
    vendor: 'JetBrains',
    description: 'A Go IDE with extended support for JavaScript, TypeScript, and databases.',
    icon: 'goland',
    isJetBrains: true,
    productCode: 'GO',
    category: 'JetBrains IDEs',
    detectCmd: 'goland',
    detectPaths: ['/opt/goland/bin/goland', '/usr/local/bin/goland'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/go/',
    wmClass: 'jetbrains-goland',
    optDirPattern: '/opt/GoLand-*',
    installScript: `
      set -e
      echo "Downloading GoLand..."
      GL_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=GO&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['GO'][0]['downloads']['linux']['link'])")
      curl -L "$GL_URL" -o /tmp/goland.tar.gz
      sudo tar -xzf /tmp/goland.tar.gz -C /opt/
      GL_DIR=$(ls -d /opt/GoLand-* | head -1)
      sudo ln -sf "$GL_DIR/bin/goland" /usr/local/bin/goland
      echo "GoLand installed."
    `,
  },
  {
    id: 'clion',
    name: 'CLion',
    vendor: 'JetBrains',
    description: 'A cross-platform IDE for C and C++. CMake support, memory analysis, Valgrind integration.',
    icon: 'clion',
    isJetBrains: true,
    productCode: 'CL',
    category: 'JetBrains IDEs',
    detectCmd: 'clion',
    detectPaths: ['/opt/clion/bin/clion', '/usr/local/bin/clion'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/clion/',
    wmClass: 'jetbrains-clion',
    optDirPattern: '/opt/clion-*',
    installScript: `
      set -e
      echo "Downloading CLion..."
      CL_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=CL&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['CL'][0]['downloads']['linux']['link'])")
      curl -L "$CL_URL" -o /tmp/clion.tar.gz
      sudo tar -xzf /tmp/clion.tar.gz -C /opt/
      CL_DIR=$(ls -d /opt/clion-* | head -1)
      sudo ln -sf "$CL_DIR/bin/clion" /usr/local/bin/clion
      echo "CLion installed."
    `,
  },
  {
    id: 'rider',
    name: 'Rider',
    vendor: 'JetBrains',
    description: 'Cross-platform .NET IDE. Full support for C#, VB.NET, ASP.NET Core, .NET Framework.',
    icon: 'rider',
    isJetBrains: true,
    productCode: 'RD',
    category: 'JetBrains IDEs',
    detectCmd: 'rider',
    detectPaths: ['/opt/rider/bin/rider', '/usr/local/bin/rider'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/rider/',
    wmClass: 'jetbrains-rider',
    optDirPattern: '/opt/Rider-*',
    installScript: `
      set -e
      echo "Downloading Rider..."
      RD_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=RD&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['RD'][0]['downloads']['linux']['link'])")
      curl -L "$RD_URL" -o /tmp/rider.tar.gz
      sudo tar -xzf /tmp/rider.tar.gz -C /opt/
      RD_DIR=$(ls -d /opt/Rider-* | head -1)
      sudo ln -sf "$RD_DIR/bin/rider" /usr/local/bin/rider
      echo "Rider installed."
    `,
  },
  {
    id: 'toolbox',
    name: 'JetBrains Toolbox',
    vendor: 'JetBrains',
    description: 'The easy way to install and maintain all JetBrains IDEs. Manages updates automatically.',
    icon: 'toolbox',
    isJetBrains: true,
    category: 'Tools',
    detectCmd: 'jetbrains-toolbox',
    detectPaths: ['/usr/local/bin/jetbrains-toolbox', path.join(os.homedir(), '.local/share/JetBrains/Toolbox/bin/jetbrains-toolbox')],
    installMethod: 'tarball',
    installUrl: 'https://www.jetbrains.com/toolbox-app/',
    wmClass: 'jetbrains-toolbox',
    installScript: `
      set -e
      echo "Downloading JetBrains Toolbox..."
      TB_URL=$(curl -sL "https://data.services.jetbrains.com/products/releases?code=TBA&latest=true&type=release" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['TBA'][0]['downloads']['linux']['link'])")
      curl -L "$TB_URL" -o /tmp/toolbox.tar.gz
      mkdir -p /tmp/toolbox-extract
      tar -xzf /tmp/toolbox.tar.gz -C /tmp/toolbox-extract
      TB_BIN=$(find /tmp/toolbox-extract -name 'jetbrains-toolbox' | head -1)
      sudo mv "$TB_BIN" /usr/local/bin/jetbrains-toolbox
      chmod +x /usr/local/bin/jetbrains-toolbox
      echo "JetBrains Toolbox installed."
    `,
  },
  {
    id: 'copilot-cli',
    name: 'GitHub Copilot CLI',
    vendor: 'GitHub',
    description: 'AI-powered terminal assistant for code suggestions, explanations, and dev questions.',
    icon: 'copilot',
    category: 'CLI Tools',
    detectCmd: 'copilot',
    detectPaths: ['/usr/local/bin/copilot'],
    installMethod: 'tarball',
    installUrl: 'https://github.com/github/copilot-cli/releases',
    installScript: `
      set -e
      ARCH=$(uname -m)
      case "$ARCH" in
        x86_64)  COPILOT_ARCH="x64" ;;
        aarch64) COPILOT_ARCH="arm64" ;;
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
      esac
      echo "Fetching latest GitHub Copilot CLI release..."
      LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/github/copilot-cli/releases/latest" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
      echo "Latest version: $LATEST_TAG"
      DOWNLOAD_URL="https://github.com/github/copilot-cli/releases/download/\${LATEST_TAG}/copilot-linux-\${COPILOT_ARCH}.tar.gz"
      curl -fsSL "\$DOWNLOAD_URL" -o /tmp/copilot-cli.tar.gz
      tar -xzf /tmp/copilot-cli.tar.gz -C /tmp/
      sudo mv /tmp/copilot /usr/local/bin/copilot
      sudo chmod +x /usr/local/bin/copilot
      rm -f /tmp/copilot-cli.tar.gz
      echo "GitHub Copilot CLI installed."
    `,
  },
  {
    id: 'claude-code',
    name: 'Claude Code CLI',
    vendor: 'Anthropic',
    description: 'Agentic coding CLI. Claude works autonomously in your terminal -- reads files, edits code, runs tests.',
    icon: 'claude',
    category: 'CLI Tools',
    detectCmd: 'claude',
    detectPaths: ['/usr/local/bin/claude', path.join(os.homedir(), '.npm-global/bin/claude'), path.join(os.homedir(), '.local/bin/claude')],
    installMethod: 'npm',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    installScript: `
      set -e
      echo "Checking for Node.js / npm..."
      if ! command -v npm >/dev/null 2>&1; then
        echo "npm not found -- installing Node.js LTS via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt install -y nodejs
      fi
      echo "Installing Claude Code CLI..."
      sudo npm install -g @anthropic-ai/claude-code
      echo "Claude Code CLI installed."
    `,
  },
  {
    id: 'gcloud',
    name: 'Google Cloud SDK',
    vendor: 'Google',
    description: 'CLI tools for Google Cloud Platform: gcloud, gsutil, bq.',
    icon: 'gcloud',
    category: 'Cloud & Infrastructure',
    detectCmd: 'gcloud',
    detectPaths: ['/usr/lib/google-cloud-sdk/bin/gcloud', path.join(os.homedir(), 'google-cloud-sdk/bin/gcloud'), '/snap/bin/gcloud'],
    installMethod: 'apt',
    installUrl: 'https://cloud.google.com/sdk/docs/install',
    installScript: `
      set -e
      echo "Installing Google Cloud SDK..."
      curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
        | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
        | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
      sudo apt-get update -q
      sudo apt-get install -y google-cloud-cli
      echo "Google Cloud SDK installed. Run: gcloud init"
    `,
  },
  {
    id: 'awscli',
    name: 'AWS CLI',
    vendor: 'Amazon',
    description: 'Command-line interface for Amazon Web Services. Manage EC2, S3, Lambda, and all AWS services.',
    icon: 'aws',
    category: 'Cloud & Infrastructure',
    detectCmd: 'aws',
    detectPaths: ['/usr/local/bin/aws', '/usr/bin/aws'],
    installMethod: 'curl',
    installUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html',
    installScript: `
      set -e
      echo "Installing AWS CLI v2..."
      curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
      unzip -q /tmp/awscliv2.zip -d /tmp/awscliv2
      sudo /tmp/awscliv2/aws/install --update
      rm -rf /tmp/awscliv2 /tmp/awscliv2.zip
      echo "AWS CLI installed."
    `,
  },
  {
    id: 'docker',
    name: 'Docker',
    vendor: 'Docker Inc.',
    description: 'Build, ship, and run containerised applications. Includes Engine, CLI, BuildKit, and Compose.',
    icon: 'docker',
    category: 'Cloud & Infrastructure',
    detectCmd: 'docker',
    detectPaths: ['/usr/bin/docker', '/usr/local/bin/docker'],
    installMethod: 'apt',
    installUrl: 'https://docs.docker.com/engine/install/ubuntu/',
    installScript: `
      set -e
      echo "Installing Docker Engine..."
      sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
      sudo apt-get install -y ca-certificates curl gnupg lsb-release
      sudo install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
      sudo apt-get update -q
      sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
      sudo usermod -aG docker "$USER"
      sudo systemctl enable --now docker
      echo "Docker installed. Log out and back in for docker group."
    `,
  },
];

// ── Detect installed tools ────────────────────────────────────────────────────
function detectTool(tool) {
  try {
    const out = cp.execSync(`which ${tool.detectCmd} 2>/dev/null`).toString().trim();
    if (out) return { installed: true, path: out, version: tryGetVersion(tool) };
  } catch {}
  for (const p of tool.detectPaths) {
    if (fs.existsSync(p)) return { installed: true, path: p, version: tryGetVersion(tool) };
  }
  return { installed: false, path: '', version: '' };
}

function tryGetVersion(tool) {
  try {
    if (tool.id === 'cursor') return ''; // AppImage launches GUI on --version
    const cmds = {
      'code': 'code --version 2>/dev/null',
      'copilot-cli': 'copilot --version 2>/dev/null',
      'claude-code': 'claude --version 2>/dev/null',
      'gcloud': 'gcloud --version 2>/dev/null',
      'awscli': 'aws --version 2>/dev/null',
      'docker': 'docker --version 2>/dev/null',
    };
    if (cmds[tool.id]) return cp.execSync(cmds[tool.id]).toString().trim().split('\n')[0];
  } catch {}
  return '';
}

// ── Process detection ─────────────────────────────────────────────────────────
function findToolPids(tool) {
  const skipPids = ['gcloud', 'awscli', 'docker'];
  if (skipPids.includes(tool.id)) return [];
  const patterns = [];
  if (tool.id === 'code') patterns.push('code --unity-launch', '/usr/share/code/');
  else if (tool.id === 'cursor') patterns.push('cursor', '/opt/cursor/');
  else if (tool.id === 'toolbox') patterns.push('jetbrains-toolbox');
  else if (tool.optDirPattern) patterns.push(tool.optDirPattern.replace('*', ''));
  if (tool.detectCmd && patterns.length === 0) patterns.push(tool.detectCmd);

  const pidSet = new Set();
  for (const pat of patterns) {
    try {
      const out = cp.execSync(`pgrep -f "${pat}" 2>/dev/null`, { timeout: 3000 }).toString().trim();
      for (const line of out.split('\n')) {
        const pid = parseInt(line, 10);
        if (pid > 0 && pid !== process.pid) pidSet.add(pid);
      }
    } catch {}
  }
  return [...pidSet];
}

// ── Uninstall script generation ───────────────────────────────────────────────
function buildUninstallScript(tool) {
  const desktopPath = `/usr/share/applications/${tool.id}.desktop`;
  const symlinkPath = `/usr/local/bin/${tool.id}`;
  let removeSteps = '';

  if (tool.id === 'code') removeSteps = `sudo apt-get remove -y code || true`;
  else if (tool.id === 'cursor') removeSteps = `sudo rm -f /usr/local/bin/cursor`;
  else if (tool.id === 'copilot-cli') removeSteps = `sudo rm -f /usr/local/bin/copilot`;
  else if (tool.id === 'claude-code') removeSteps = `sudo npm uninstall -g @anthropic-ai/claude-code || true`;
  else if (tool.id === 'gcloud') removeSteps = `sudo apt-get remove -y google-cloud-cli google-cloud-sdk || true`;
  else if (tool.id === 'awscli') removeSteps = `sudo rm -f /usr/local/bin/aws /usr/local/bin/aws_completer && sudo rm -rf /usr/local/aws-cli`;
  else if (tool.id === 'docker') removeSteps = `sudo apt-get remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || true`;
  else if (tool.optDirPattern) {
    removeSteps = `sudo rm -f ${symlinkPath}\nfor d in $(ls -d ${tool.optDirPattern} 2>/dev/null); do sudo rm -rf "$d"; done`;
  } else removeSteps = `sudo rm -f ${symlinkPath}`;

  return `#!/usr/bin/env bash
set -e
echo "Uninstalling ${tool.name}..."
${removeSteps}
sudo rm -f ${desktopPath}
echo "${tool.name} has been uninstalled."
echo
echo "Press Enter to close..."
read -r
`;
}

// ── Terminal launcher ─────────────────────────────────────────────────────────
function openTerminalScript(scriptPath, title) {
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0', XAUTHORITY: process.env.XAUTHORITY || `${os.homedir()}/.Xauthority` };
  const cmd = `bash -c 'bash "${scriptPath}"; echo; echo "=== Press Enter to close ==="; read'`;
  const terms = [
    ['tilix', ['--title', title, '-e', cmd]],
    ['gnome-terminal', ['--title', title, '--', 'bash', '-c', cmd]],
    ['xterm', ['-title', title, '-e', cmd]],
  ];
  for (const [term, args] of terms) {
    try {
      cp.execSync(`which ${term} 2>/dev/null`, { timeout: 1000 });
      const child = cp.spawn(term, args, { detached: true, stdio: 'ignore', env });
      child.on('error', () => {});
      child.unref();
      return;
    } catch {}
  }
}

// ── RobOS IntelliJ Plugin ─────────────────────────────────────────────────────
const PREDEPLOYED_PLUGIN_ZIP = '/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip';

function findBuiltPluginZip() {
  if (fs.existsSync(PREDEPLOYED_PLUGIN_ZIP)) return PREDEPLOYED_PLUGIN_ZIP;
  return null;
}

function findJBPluginDirs(tool) {
  const home = os.homedir();
  const prefixes = {
    idea: ['IdeaIC', 'IntelliJIdea'], webstorm: ['WebStorm'], pycharm: ['PyCharm', 'PyCharmCE'],
    goland: ['GoLand'], clion: ['CLion'], rider: ['Rider'],
  };
  const plist = prefixes[tool.id] || [];
  const localShare = path.join(home, '.local', 'share', 'JetBrains');
  const pluginDirs = [];
  try {
    for (const entry of fs.readdirSync(localShare)) {
      if (plist.some(p => entry.startsWith(p))) pluginDirs.push(path.join(localShare, entry, 'robos'));
    }
  } catch {}
  if (pluginDirs.length === 0 && tool.optDirPattern) {
    try {
      const parentDir = path.dirname(tool.optDirPattern);
      const pattern = path.basename(tool.optDirPattern).replace(/\*/g, '');
      const entries = fs.readdirSync(parentDir).filter(e => e.startsWith(pattern));
      for (const entry of entries) {
        try {
          const info = JSON.parse(fs.readFileSync(path.join(parentDir, entry, 'product-info.json'), 'utf8'));
          if (info.dataDirectoryName) pluginDirs.push(path.join(localShare, info.dataDirectoryName, 'robos'));
        } catch {}
      }
    } catch {}
  }
  return pluginDirs;
}

function isPluginInstalled(tool) {
  return findJBPluginDirs(tool).some(d => fs.existsSync(d));
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('dt-get-catalogue', () => {
  return TOOL_CATALOGUE.map(tool => {
    const status = detectTool(tool);
    const runningCount = findToolPids(tool).length;
    return { ...tool, installScript: undefined, ...status, runningCount };
  });
});

ipcMain.handle('dt-launch', (_, { ideId }) => {
  const tool = TOOL_CATALOGUE.find(i => i.id === ideId);
  if (!tool) return { ok: false, error: 'Tool not found' };
  try {
    const status = detectTool(tool);
    const cmd = status.path || tool.detectCmd;
    cp.spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dt-install', (_, { ideId }) => {
  const tool = TOOL_CATALOGUE.find(i => i.id === ideId);
  if (!tool) return { ok: false, error: 'Tool not found' };
  try {
    const scriptPath = `/tmp/robos-install-${ideId}.sh`;
    fs.writeFileSync(scriptPath, tool.installScript, { mode: 0o755 });
    openTerminalScript(scriptPath, `Install ${tool.name}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dt-uninstall', (_, { ideId }) => {
  const tool = TOOL_CATALOGUE.find(i => i.id === ideId);
  if (!tool) return { ok: false, error: 'Tool not found' };
  try {
    const scriptPath = `/tmp/robos-uninstall-${ideId}.sh`;
    fs.writeFileSync(scriptPath, buildUninstallScript(tool), { mode: 0o755 });
    openTerminalScript(scriptPath, `Uninstall ${tool.name}`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('dt-kill', (_, { ideId }) => {
  const tool = TOOL_CATALOGUE.find(i => i.id === ideId);
  if (!tool) return { ok: false, error: 'Tool not found', killed: 0 };
  try {
    const pids = findToolPids(tool);
    for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch {} }
    return { ok: true, killed: pids.length };
  } catch (e) { return { ok: false, error: e.message, killed: 0 }; }
});

ipcMain.handle('dt-open-url', (_, { url }) => {
  shell.openExternal(url);
  return true;
});

ipcMain.handle('dt-get-plugin-config', () => {
  const builtZip = findBuiltPluginZip();
  const installStatus = {};
  for (const tool of TOOL_CATALOGUE.filter(i => i.isJetBrains)) {
    installStatus[tool.id] = isPluginInstalled(tool);
  }
  return { builtZip, installStatus };
});

ipcMain.handle('dt-install-plugin', (_, { ideId }) => {
  const tool = TOOL_CATALOGUE.find(i => i.id === ideId);
  if (!tool) return { ok: false, error: 'Tool not found' };
  const builtZip = findBuiltPluginZip();
  const pluginDirs = findJBPluginDirs(tool);
  if (pluginDirs.length === 0) return { ok: false, error: `No ${tool.name} installation found.` };
  for (const dir of pluginDirs) { try { fs.mkdirSync(dir, { recursive: true }); } catch {} }

  let ideBin = '';
  try { ideBin = cp.execSync(`which ${tool.detectCmd} 2>/dev/null`).toString().trim(); } catch {}
  if (!ideBin) for (const p of tool.detectPaths) { if (fs.existsSync(p)) { ideBin = p; break; } }

  let script = `#!/usr/bin/env bash
set -e
PLUGIN_ZIP="${builtZip || PREDEPLOYED_PLUGIN_ZIP}"
if [ ! -f "$PLUGIN_ZIP" ]; then echo "Plugin ZIP not found: $PLUGIN_ZIP"; exit 1; fi
`;
  for (const dir of pluginDirs) {
    script += `echo "Installing to ${dir}..."\nrm -rf "${dir}"\nunzip -qo "$PLUGIN_ZIP" -d "${path.dirname(dir)}" || { echo "unzip failed"; exit 1; }\n`;
  }
  script += `echo "${tool.name} RobOS plugin installed."\necho "Press Enter to close..."\nread -r\n`;

  const scriptPath = `/tmp/robos-install-plugin-${ideId}.sh`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  openTerminalScript(scriptPath, `Install RobOS Plugin -> ${tool.name}`);
  return { ok: true };
});
