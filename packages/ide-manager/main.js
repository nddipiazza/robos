'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const cp   = require('child_process');


let win;
function createWindow() {
  win = new BrowserWindow({
    skipTaskbar: true,
    width: 1100, height: 820,
    minWidth: 800, minHeight: 500,
    title: 'RobOS Development Apps and IDEs',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.setName('ide-manager');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IDE catalogue ─────────────────────────────────────────────────────────────
const IDE_CATALOGUE = [
  {
    id: 'cursor',
    name: 'Cursor',
    vendor: 'Anysphere',
    description: 'AI-first code editor built on VS Code. Native Claude integration, chat with your codebase.',
    icon: '🖱',
    category: 'AI Editors',
    detectCmd: 'cursor',
    detectPaths: ['/usr/bin/cursor', '/usr/local/bin/cursor', '/opt/cursor/cursor'],
    installMethod: 'appimage',
    installUrl: 'https://cursor.sh',
    installScript: `
      set -e
      echo "Downloading Cursor AppImage…"
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
    icon: '🔵',
    category: 'Code Editors',
    detectCmd: 'code',
    detectPaths: ['/usr/bin/code', '/usr/share/code/code', '/snap/bin/code'],
    installMethod: 'deb',
    installUrl: 'https://code.visualstudio.com',
    installScript: `
      set -e
      echo "Installing VS Code via apt…"
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
    icon: '🟠',
    isJetBrains: true,
    productCode: 'IIC',
    category: 'JetBrains IDEs',
    detectCmd: 'idea',
    detectPaths: ['/opt/idea/bin/idea', '/usr/local/bin/idea'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/idea/',
    toolboxId: 'IDEA-C',
    wmClass: 'jetbrains-idea-ce',
    optDirPattern: '/opt/idea-IC-*',
    comment: 'The IDE for Java, Kotlin, Groovy, and JVM languages',
    categories: 'Development;IDE;Java;',
    installScript: `
      set -e
      echo "Downloading IntelliJ IDEA…"
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
    icon: '🟣',
    isJetBrains: true,
    productCode: 'WS',
    category: 'JetBrains IDEs',
    detectCmd: 'webstorm',
    detectPaths: ['/opt/webstorm/bin/webstorm', '/usr/local/bin/webstorm'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/webstorm/',
    toolboxId: 'WS',
    wmClass: 'jetbrains-webstorm',
    optDirPattern: '/opt/WebStorm-*',
    comment: 'The smartest JavaScript and TypeScript IDE',
    categories: 'Development;IDE;WebDevelopment;',
    installScript: `
      set -e
      echo "Downloading WebStorm…"
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
    icon: '🐍',
    isJetBrains: true,
    productCode: 'PCC',
    category: 'JetBrains IDEs',
    detectCmd: 'pycharm',
    detectPaths: ['/opt/pycharm/bin/pycharm', '/usr/local/bin/pycharm'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/pycharm/',
    toolboxId: 'PCC',
    wmClass: 'jetbrains-pycharm-ce',
    optDirPattern: '/opt/pycharm-community-*',
    comment: 'The IDE for professional Python development',
    categories: 'Development;IDE;Python;',
    installScript: `
      set -e
      echo "Downloading PyCharm Community…"
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
    icon: '🐹',
    isJetBrains: true,
    productCode: 'GO',
    category: 'JetBrains IDEs',
    detectCmd: 'goland',
    detectPaths: ['/opt/goland/bin/goland', '/usr/local/bin/goland'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/go/',
    toolboxId: 'GO',
    wmClass: 'jetbrains-goland',
    optDirPattern: '/opt/GoLand-*',
    comment: 'A Go IDE by JetBrains',
    categories: 'Development;IDE;',
    installScript: `
      set -e
      echo "Downloading GoLand…"
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
    icon: '⚙️',
    isJetBrains: true,
    productCode: 'CL',
    category: 'JetBrains IDEs',
    detectCmd: 'clion',
    detectPaths: ['/opt/clion/bin/clion', '/usr/local/bin/clion'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/clion/',
    toolboxId: 'CL',
    wmClass: 'jetbrains-clion',
    optDirPattern: '/opt/clion-*',
    comment: 'A cross-platform C and C++ IDE by JetBrains',
    categories: 'Development;IDE;',
    installScript: `
      set -e
      echo "Downloading CLion…"
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
    icon: '🎯',
    isJetBrains: true,
    productCode: 'RD',
    category: 'JetBrains IDEs',
    detectCmd: 'rider',
    detectPaths: ['/opt/rider/bin/rider', '/usr/local/bin/rider'],
    installMethod: 'toolbox',
    installUrl: 'https://www.jetbrains.com/rider/',
    toolboxId: 'RD',
    wmClass: 'jetbrains-rider',
    optDirPattern: '/opt/Rider-*',
    comment: 'Cross-platform .NET IDE by JetBrains',
    categories: 'Development;IDE;',
    installScript: `
      set -e
      echo "Downloading Rider…"
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
    icon: '🧰',
    isJetBrains: true,
    category: 'Tools',
    detectCmd: 'jetbrains-toolbox',
    detectPaths: ['/usr/local/bin/jetbrains-toolbox', os.homedir() + '/.local/share/JetBrains/Toolbox/bin/jetbrains-toolbox'],
    installMethod: 'tarball',
    installUrl: 'https://www.jetbrains.com/toolbox-app/',
    wmClass: 'jetbrains-toolbox',
    comment: 'Manage all your JetBrains IDEs in one place',
    categories: 'Development;',
    installScript: `
      set -e
      echo "Downloading JetBrains Toolbox…"
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
    description: 'Standalone GitHub Copilot CLI binary. AI-powered terminal assistant for code suggestions, explanations, and dev questions — no gh extension required.',
    icon: '🐙',
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
      echo "Fetching latest GitHub Copilot CLI release…"
      LATEST_TAG=$(curl -fsSL "https://api.github.com/repos/github/copilot-cli/releases/latest" | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])")
      echo "Latest version: $LATEST_TAG"
      DOWNLOAD_URL="https://github.com/github/copilot-cli/releases/download/\${LATEST_TAG}/copilot-linux-\${COPILOT_ARCH}.tar.gz"
      echo "Downloading from \$DOWNLOAD_URL…"
      curl -fsSL "\$DOWNLOAD_URL" -o /tmp/copilot-cli.tar.gz
      tar -xzf /tmp/copilot-cli.tar.gz -C /tmp/
      sudo mv /tmp/copilot /usr/local/bin/copilot
      sudo chmod +x /usr/local/bin/copilot
      rm -f /tmp/copilot-cli.tar.gz
      echo ""
      echo "✓ GitHub Copilot CLI installed: $(copilot --version)"
      echo "  Usage: copilot"
      echo "         copilot --help"
      echo ""
      echo "Press Enter to close…"
      read -r
    `,
  },
  {
    id: 'claude-code',
    name: 'Claude Code CLI',
    vendor: 'Anthropic',
    description: 'Agentic coding CLI. Claude works autonomously in your terminal — reads files, edits code, runs tests, and commits fixes. Installed via npm.',
    icon: '🟣',
    category: 'CLI Tools',
    detectCmd: 'claude',
    detectPaths: [
      '/usr/local/bin/claude',
      os.homedir() + '/.npm-global/bin/claude',
      os.homedir() + '/.local/bin/claude',
    ],
    installMethod: 'npm',
    installUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    installScript: `
      set -e
      echo "Checking for Node.js / npm…"
      if ! command -v npm >/dev/null 2>&1; then
        echo "npm not found — installing Node.js LTS via NodeSource…"
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt install -y nodejs
      fi
      echo "Installing Claude Code CLI…"
      sudo npm install -g @anthropic-ai/claude-code
      echo ""
      echo "✓ Claude Code CLI installed."
      echo "  Usage: claude"
      echo "         claude --help"
      echo ""
      echo "Set ANTHROPIC_API_KEY in your environment before first use."
    `,
  },
  // ── Cloud & Infrastructure ──────────────────────────────────────────────────
  {
    id: 'gcloud',
    name: 'Google Cloud SDK',
    vendor: 'Google',
    description: 'CLI tools for Google Cloud Platform: gcloud, gsutil, bq. Manage GCE, GKE, Cloud Run, Cloud Storage, and all GCP services from the terminal.',
    icon: '☁️',
    category: 'Cloud & Infrastructure',
    detectCmd: 'gcloud',
    detectPaths: [
      '/usr/lib/google-cloud-sdk/bin/gcloud',
      os.homedir() + '/google-cloud-sdk/bin/gcloud',
      '/snap/bin/gcloud',
    ],
    installMethod: 'apt',
    installUrl: 'https://cloud.google.com/sdk/docs/install',
    installScript: `
      set -e
      echo "Installing Google Cloud SDK…"
      curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
        | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
      echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
        | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list > /dev/null
      sudo apt-get update -q
      sudo apt-get install -y google-cloud-cli
      echo ""
      echo "✓ Google Cloud SDK installed."
      echo "  Run: gcloud init"
      echo "       gcloud auth login"
      echo ""
      echo "Press Enter to close…"
      read -r
    `,
  },
  {
    id: 'awscli',
    name: 'AWS CLI',
    vendor: 'Amazon',
    description: 'Command-line interface for Amazon Web Services. Manage EC2, S3, Lambda, ECS, EKS, IAM, and every other AWS service from your terminal.',
    icon: '🟡',
    category: 'Cloud & Infrastructure',
    detectCmd: 'aws',
    detectPaths: ['/usr/local/bin/aws', '/usr/bin/aws'],
    installMethod: 'curl',
    installUrl: 'https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html',
    installScript: `
      set -e
      echo "Installing AWS CLI v2…"
      curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
      unzip -q /tmp/awscliv2.zip -d /tmp/awscliv2
      sudo /tmp/awscliv2/aws/install --update
      rm -rf /tmp/awscliv2 /tmp/awscliv2.zip
      echo ""
      echo "✓ AWS CLI installed: $(aws --version)"
      echo "  Run: aws configure"
      echo ""
      echo "Press Enter to close…"
      read -r
    `,
  },
  {
    id: 'docker',
    name: 'Docker',
    vendor: 'Docker Inc.',
    description: 'Build, ship, and run containerised applications. Includes Docker Engine, CLI, BuildKit, and Docker Compose. Essential for local dev environment parity.',
    icon: '🐳',
    category: 'Cloud & Infrastructure',
    detectCmd: 'docker',
    detectPaths: ['/usr/bin/docker', '/usr/local/bin/docker'],
    installMethod: 'apt',
    installUrl: 'https://docs.docker.com/engine/install/ubuntu/',
    installScript: `
      set -e
      echo "Installing Docker Engine…"
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
      echo ""
      echo "✓ Docker installed: $(docker --version)"
      echo "  Docker Compose: $(docker compose version)"
      echo ""
      echo "⚠ Log out and back in for the docker group to take effect."
      echo ""
      echo "Press Enter to close…"
      read -r
    `,
  },
];

// ── Detect installed tools ────────────────────────────────────────────────────
function detectIDE(ide) {
  // Check which
  try {
    const out = cp.execSync(`which ${ide.detectCmd} 2>/dev/null`).toString().trim();
    if (out) {
      const verOut = tryGetVersion(ide);
      return { installed: true, path: out, version: verOut };
    }
  } catch {}
  // Check known paths
  for (const p of ide.detectPaths) {
    if (fs.existsSync(p)) {
      const verOut = tryGetVersion(ide);
      return { installed: true, path: p, version: verOut };
    }
  }
  return { installed: false, path: '', version: '' };
}

function tryGetVersion(ide) {
  try {
    if (ide.id === 'code') {
      return cp.execSync('code --version 2>/dev/null').toString().trim().split('\n')[0];
    }
    if (ide.id === 'cursor') {
      // Cursor is an AppImage — any invocation (even --version) can launch the full GUI.
      // Skip version detection entirely to avoid accidentally starting Cursor.
      return '';
    }
    if (ide.id === 'copilot-cli') {
      return cp.execSync('copilot --version 2>/dev/null').toString().trim().split('\n')[0];
    }
    if (ide.id === 'claude-code') {
      return cp.execSync('claude --version 2>/dev/null').toString().trim().split('\n')[0];
    }
    if (ide.id === 'gcloud') {
      return cp.execSync('gcloud --version 2>/dev/null').toString().trim().split('\n')[0];
    }
    if (ide.id === 'awscli') {
      return cp.execSync('aws --version 2>/dev/null').toString().trim().split('\n')[0];
    }
    if (ide.id === 'docker') {
      return cp.execSync('docker --version 2>/dev/null').toString().trim().split('\n')[0];
    }
  } catch {}
  return '';
}

// ── Process detection ─────────────────────────────────────────────────────────
// Returns an array of PIDs for running instances of the given IDE.
// Uses pgrep with patterns tailored to each IDE type.
function findIdePids(ide) {
  const patterns = [];
  if (ide.id === 'code') {
    patterns.push('code --unity-launch', '/usr/share/code/');
  } else if (ide.id === 'cursor') {
    patterns.push('cursor', '/opt/cursor/');
  } else if (ide.id === 'copilot-cli') {
    patterns.push('/usr/local/bin/copilot');
  } else if (ide.id === 'claude-code') {
    patterns.push('/usr/local/bin/claude', '.npm-global/bin/claude');
  } else if (ide.id === 'gcloud') {
    // gcloud is typically not a long-running process; skip
    return [];
  } else if (ide.id === 'awscli') {
    return [];
  } else if (ide.id === 'docker') {
    // Don't kill the docker daemon; skip
    return [];
  } else if (ide.id === 'toolbox') {
    patterns.push('jetbrains-toolbox');
  } else if (ide.optDirPattern) {
    // JetBrains IDEs: match their /opt install dir in the cmdline
    patterns.push(ide.optDirPattern.replace('*', ''));
  }
  if (ide.detectCmd && patterns.length === 0) {
    patterns.push(ide.detectCmd);
  }

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

function countIdePids(ide) {
  return findIdePids(ide).length;
}

// ── Desktop integration helpers ───────────────────────────────────────────────

// Generates a bash snippet that creates a .desktop file and adds the IDE to the tint2 launcher.
function buildPostInstallScript(ide) {
  const desktopPath = `/usr/local/share/applications/${ide.id}.desktop`;
  const exec = `/usr/local/bin/${ide.id}`;

  // Find icon: JetBrains IDEs ship SVG icons in their bin/ dir
  const iconFind = ide.optDirPattern
    ? `IDE_ICON=$(ls -d ${ide.optDirPattern} 2>/dev/null | head -1); IDE_ICON="${'${IDE_ICON}'}/bin/${ide.id}.svg"; [ ! -f "$IDE_ICON" ] && IDE_ICON="${ide.id}"`
    : `IDE_ICON="${ide.id}"`;

  return `

# ── Post-install: desktop icon + tint2 launcher ──────────────────────────────
echo "Creating desktop entry for ${ide.name}…"
${iconFind}
sudo tee ${desktopPath} > /dev/null << DESKTOP_EOF
[Desktop Entry]
Type=Application
Name=${ide.name}
Comment=${ide.comment || ide.description}
Exec=${exec}
Icon=$IDE_ICON
Categories=${ide.categories || 'Development;IDE;'}
StartupWMClass=${ide.wmClass || ''}
StartupNotify=true
X-RobOS-Category=Developer/IDE
DESKTOP_EOF

# Add to tint2 launcher (once only)
TINT2RC="$HOME/.config/tint2/tint2rc"
if [ -f "$TINT2RC" ] && ! grep -qF "${desktopPath}" "$TINT2RC"; then
  LAST_LINE=\$(grep -n "^launcher_item_app" "$TINT2RC" | tail -1 | cut -d: -f1)
  if [ -n "\${LAST_LINE}" ]; then
    sed -i "\${LAST_LINE}a launcher_item_app = ${desktopPath}" "$TINT2RC"
  fi
  # Restart tint2 to pick up the new entry
  TPID=\$(pgrep -x tint2 | head -1)
  [ -n "\$TPID" ] && kill "\$TPID" && sleep 1
  nohup tint2 -c "$TINT2RC" >/tmp/tint2.log 2>&1 &
  echo "tint2 launcher updated for ${ide.name}."
fi
echo "${ide.name} desktop integration complete."
`;
}

// Generates a bash snippet that removes the IDE, its symlink, .desktop file, and tint2 entry.
function buildUninstallScript(ide) {
  const desktopPath = `/usr/local/share/applications/${ide.id}.desktop`;
  const symlinkPath = `/usr/local/bin/${ide.id}`;
  let removeSteps = '';

  if (ide.id === 'code') {
    removeSteps = `sudo apt-get remove -y code || true`;
  } else if (ide.id === 'cursor') {
    removeSteps = `sudo rm -f /usr/local/bin/cursor /usr/local/share/applications/cursor.desktop`;
  } else if (ide.id === 'copilot-cli') {
    removeSteps = `sudo rm -f /usr/local/bin/copilot`;
  } else if (ide.id === 'claude-code') {
    removeSteps = `sudo npm uninstall -g @anthropic-ai/claude-code || true`;
  } else if (ide.id === 'gcloud') {
    removeSteps = `sudo apt-get remove -y google-cloud-cli google-cloud-sdk || true`;
  } else if (ide.id === 'awscli') {
    removeSteps = `sudo rm -f /usr/local/bin/aws /usr/local/bin/aws_completer && sudo rm -rf /usr/local/aws-cli`;
  } else if (ide.id === 'docker') {
    removeSteps = `sudo apt-get remove -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || true`;
  } else if (ide.optDirPattern) {
    // JetBrains: remove extracted /opt dir(s) and symlink
    removeSteps = `
sudo rm -f ${symlinkPath}
for d in $(ls -d ${ide.optDirPattern} 2>/dev/null); do
  echo "Removing $d…"
  sudo rm -rf "$d"
done`;
  } else {
    removeSteps = `sudo rm -f ${symlinkPath}`;
  }

  return `#!/usr/bin/env bash
set -e
echo "Uninstalling ${ide.name}…"
${removeSteps}

# Remove .desktop file
sudo rm -f ${desktopPath}

# Remove from tint2 launcher
TINT2RC="$HOME/.config/tint2/tint2rc"
if [ -f "$TINT2RC" ] && grep -qF "${desktopPath}" "$TINT2RC"; then
  sed -i '\\|launcher_item_app = ${desktopPath}|d' "$TINT2RC"
  TPID=$(pgrep -x tint2 | head -1)
  [ -n "$TPID" ] && kill "$TPID" && sleep 1
  nohup tint2 -c "$TINT2RC" >/tmp/tint2.log 2>&1 &
  echo "tint2 launcher entry removed."
fi

echo "${ide.name} has been uninstalled."
echo
echo "Press Enter to close…"
read -r
`;
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-ide-catalogue', () => {
  return IDE_CATALOGUE.map(ide => {
    const status = detectIDE(ide);
    const runningCount = countIdePids(ide);
    return { ...ide, installScript: undefined, ...status, runningCount };
  });
});

ipcMain.handle('launch-ide', (_, { ideId }) => {
  const ide = IDE_CATALOGUE.find(i => i.id === ideId);
  if (!ide) return { ok: false, error: 'IDE not found' };
  try {
    // Use the actual detected path; fall back to detectCmd
    const status = detectIDE(ide);
    const cmd = status.path || ide.detectCmd;
    cp.spawn(cmd, [], { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('install-ide', (_, { ideId }) => {
  const ide = IDE_CATALOGUE.find(i => i.id === ideId);
  if (!ide) return { ok: false, error: 'IDE not found' };

  // Run install in a terminal so user can see progress
  try {
    // Write script to temp file — append desktop integration for JetBrains IDEs
    let script = ide.installScript;
    if (ide.isJetBrains) script += buildPostInstallScript(ide);

    const scriptPath = `/tmp/robos-install-${ideId}.sh`;
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });
    openTerminalScript(scriptPath, `Install ${ide.name}`);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('uninstall-ide', (_, { ideId }) => {
  const ide = IDE_CATALOGUE.find(i => i.id === ideId);
  if (!ide) return { ok: false, error: 'IDE not found' };
  try {
    const script = buildUninstallScript(ide);
    const scriptPath = `/tmp/robos-uninstall-${ideId}.sh`;
    fs.writeFileSync(scriptPath, script, { mode: 0o755 });
    openTerminalScript(scriptPath, `Uninstall ${ide.name}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});


ipcMain.handle('launch-install-script', (_, ideId) => {
  const scriptPath = `/tmp/robos-install-${ideId}.sh`;
  if (!fs.existsSync(scriptPath)) return { ok: false, error: 'Script not found' };
  openTerminalScript(scriptPath, `Install`);
  return { ok: true };
});


ipcMain.handle('kill-ide', (_, { ideId }) => {
  const ide = IDE_CATALOGUE.find(i => i.id === ideId);
  if (!ide) return { ok: false, error: 'IDE not found', killed: 0 };
  try {
    const pids = findIdePids(ide);
    if (pids.length === 0) return { ok: true, killed: 0 };
    for (const pid of pids) {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
    return { ok: true, killed: pids.length };
  } catch (e) { return { ok: false, error: e.message, killed: 0 }; }
});

ipcMain.handle('open-url', (_, { url }) => {
  shell.openExternal(url);
  return true;
});

// ── RobOS IntelliJ Plugin ─────────────────────────────────────────────────────
const PLUGIN_CONFIG_FILE = path.join(os.homedir(), '.config', 'robos', 'ide-manager.json');

function readPluginConfig() {
  try { return JSON.parse(fs.readFileSync(PLUGIN_CONFIG_FILE, 'utf8')); }
  catch { return {}; }
}

// Auto-detect plugin source in common locations if not configured
const PLUGIN_AUTO_DETECT_PATHS = [
  path.join(os.homedir(), 'source', 'github', 'nddipiazza', 'roboto-os', 'packages', 'robos-intellij-plugin'),
  path.join(os.homedir(), 'roboto-os', 'packages', 'robos-intellij-plugin'),
  '/usr/local/share/robos/robos-intellij-plugin',
];

function getEffectiveSourcePath() {
  const cfg = readPluginConfig();
  if (cfg.pluginSourcePath) return cfg.pluginSourcePath;
  // Auto-detect
  for (const p of PLUGIN_AUTO_DETECT_PATHS) {
    if (fs.existsSync(path.join(p, 'gradlew'))) return p;
  }
  return '';
}

function writePluginConfig(cfg) {
  fs.mkdirSync(path.dirname(PLUGIN_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(PLUGIN_CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

// Pre-deployed plugin ZIP (placed here by install.sh)
const PREDEPLOYED_PLUGIN_ZIP = '/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip';

function findBuiltPluginZip(sourcePath) {
  // Check pre-deployed ZIP first (installed by RobOS installer)
  if (fs.existsSync(PREDEPLOYED_PLUGIN_ZIP)) return PREDEPLOYED_PLUGIN_ZIP;
  if (!sourcePath) return null;
  const distDir = path.join(sourcePath, 'platform', 'robos', 'build', 'distributions');
  try {
    const zips = fs.readdirSync(distDir).filter(f => f.endsWith('.zip'));
    if (zips.length) return path.join(distDir, zips.sort().pop());
  } catch {}
  return null;
}

// Resolve JetBrains IDE plugin dirs for all installed versions.
// Strategy:
//  1. Scan ~/.local/share/JetBrains/ for existing version dirs (IDE has been run before).
//  2. If none found, locate the IDE install dir via optDirPattern or detectPaths,
//     read product-info.json for dataDirectoryName, and derive the path.
//     The dir is created on demand — JetBrains loads plugins from there even on first run.
function findJBPluginDirs(ide) {
  const home = os.homedir();
  const productDirPrefixes = {
    idea:     ['IdeaIC', 'IntelliJIdea'],
    webstorm: ['WebStorm'],
    pycharm:  ['PyCharm', 'PyCharmCE'],
    goland:   ['GoLand'],
    clion:    ['CLion'],
    rider:    ['Rider'],
  };
  const prefixes = productDirPrefixes[ide.id] || [];
  const localShare = path.join(home, '.local', 'share', 'JetBrains');
  const pluginDirs = [];

  // 1. Scan existing dirs
  try {
    for (const entry of fs.readdirSync(localShare)) {
      if (prefixes.some(p => entry.startsWith(p))) {
        pluginDirs.push(path.join(localShare, entry, 'robos'));
      }
    }
  } catch {}

  // 2. Derive from install dir via product-info.json (handles pre-first-launch case)
  if (pluginDirs.length === 0 && ide.optDirPattern) {
    try {
      const glob = ide.optDirPattern.replace(/\*/g, '');  // prefix before wildcard
      const parentDir = path.dirname(ide.optDirPattern);
      const pattern = path.basename(ide.optDirPattern).replace(/\*/g, '');
      const entries = fs.readdirSync(parentDir).filter(e => e.startsWith(pattern));
      for (const entry of entries) {
        const installDir = path.join(parentDir, entry);
        const productInfoPath = path.join(installDir, 'product-info.json');
        try {
          const info = JSON.parse(fs.readFileSync(productInfoPath, 'utf8'));
          if (info.dataDirectoryName) {
            pluginDirs.push(path.join(localShare, info.dataDirectoryName, 'robos'));
          }
        } catch {}
      }
    } catch {}
  }

  return pluginDirs;
}

function isPluginInstalled(ide) {
  const dirs = findJBPluginDirs(ide);
  return dirs.some(d => fs.existsSync(d));
}

ipcMain.handle('get-robos-plugin-config', () => {
  const cfg = readPluginConfig();
  const sourcePath = getEffectiveSourcePath();
  const builtZip = findBuiltPluginZip(sourcePath);
  // Include install status per JetBrains IDE
  const installStatus = {};
  for (const ide of IDE_CATALOGUE.filter(i => i.isJetBrains)) {
    installStatus[ide.id] = isPluginInstalled(ide);
  }
  return { sourcePath, builtZip, installStatus };
});

ipcMain.handle('set-robos-plugin-source', (_, sourcePath) => {
  const cfg = readPluginConfig();
  cfg.pluginSourcePath = sourcePath;
  writePluginConfig(cfg);
  const builtZip = findBuiltPluginZip(sourcePath);
  return { ok: true, builtZip };
});

ipcMain.handle('build-robos-plugin', () => {
  const srcPath = getEffectiveSourcePath();
  if (!srcPath) return { ok: false, error: 'Plugin source path not configured' };
  const scriptPath = '/tmp/robos-build-plugin.sh';
  fs.writeFileSync(scriptPath, `#!/usr/bin/env bash
set -e
cd "${srcPath}"
echo "Building RobOS IntelliJ plugin…"
./gradlew :platform:robos:buildPlugin
echo
echo "=== Build complete. Press Enter to close ==="
read -r
`, { mode: 0o755 });
  openTerminalScript(scriptPath, 'Build RobOS Plugin');
  return { ok: true };
});

ipcMain.handle('install-robos-plugin', (_, { ideId }) => {
  const ide = IDE_CATALOGUE.find(i => i.id === ideId);
  if (!ide) return { ok: false, error: 'IDE not found' };

  const srcPath = getEffectiveSourcePath();
  let builtZip = findBuiltPluginZip(srcPath);

  // Find the IDE binary for installPlugins command
  let ideBin = '';
  try { ideBin = cp.execSync(`which ${ide.detectCmd} 2>/dev/null`).toString().trim(); } catch {}
  if (!ideBin) {
    for (const p of ide.detectPaths) { if (fs.existsSync(p)) { ideBin = p; break; } }
  }

  const pluginDirs = findJBPluginDirs(ide);
  if (pluginDirs.length === 0) return { ok: false, error: `No ${ide.name} installation found. Please install ${ide.name} first.` };

  // Create plugin dirs if they don't exist yet (pre-first-launch case)
  for (const dir of pluginDirs) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }

  const scriptPath = `/tmp/robos-install-plugin-${ideId}.sh`;
  const logPath = `/tmp/robos-install-plugin-${ideId}.log`;
  let scriptContent = `#!/usr/bin/env bash
LOG="${logPath}"
exec > >(tee -a "$LOG") 2>&1
trap 'echo; echo "--- DONE (exit \$?) --- Press Enter to close ---"; read -r' EXIT

PLUGIN_ZIP="${builtZip || '/usr/local/share/robos/robos-intellij-plugin/robos-plugin.zip'}"

if [ ! -f "$PLUGIN_ZIP" ]; then
  echo "✗ Plugin ZIP not found: $PLUGIN_ZIP"
  exit 1
fi

# Stop ${ide.name} if running (match JVM, exclude this script's own PID)
IDE_PIDS=\$(pgrep -f '/opt/idea' | grep -v "^\$\$\$" | tr '\\n' ' ')
if [ -n "\$IDE_PIDS" ]; then
  echo "Stopping ${ide.name}…"
  kill \$IDE_PIDS 2>/dev/null || true
  sleep 2
fi

# Clean any stale copies from old install locations
rm -rf ~/.config/JetBrains/*/plugins/robos 2>/dev/null || true
rm -rf ~/.local/share/JetBrains/*/plugins/robos 2>/dev/null || true

# Install to idea.plugins.path
`;

  for (const dir of pluginDirs) {
    const parentDir = path.dirname(dir);
    scriptContent += `
echo "Installing to ${dir}…"
rm -rf "${dir}"
unzip -qo "$PLUGIN_ZIP" -d "${parentDir}" || { echo "✗ unzip failed"; exit 1; }
echo "✓ Installed"
`;
  }

  scriptContent += `
# Relaunch ${ide.name}
echo "Relaunching ${ide.name}…"
DISPLAY=\${DISPLAY:-:0} nohup "${ideBin || ide.detectCmd}" >/dev/null 2>&1 &
echo "✓ ${ide.name} started with RobOS plugin active."
`;

  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });
  openTerminalScript(scriptPath, `Install RobOS Plugin → ${ide.name}`);
  return { ok: true };
});

function openTerminalScript(scriptPath, title) {
  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ':0', XAUTHORITY: process.env.XAUTHORITY || `${os.homedir()}/.Xauthority` };
  // Wrap script so terminal stays open until user presses Enter
  const cmd = `bash -c 'bash "${scriptPath}"; echo; echo "=== Press Enter to close ==="; read'`;
  const terms = [
    ['tilix', ['--title', title, '-e', cmd]],
    ['gnome-terminal', ['--title', title, '--', 'bash', '-c', cmd]],
    ['xterm', ['-title', title, '-e', cmd]],
  ];
  for (const [term, args] of terms) {
    try {
      // Verify the terminal binary exists before spawning — cp.spawn ENOENT is async
      // and would crash the main process with an unhandled error event if not guarded.
      cp.execSync(`which ${term} 2>/dev/null`, { timeout: 1000 });
      const child = cp.spawn(term, args, { detached: true, stdio: 'ignore', env });
      child.on('error', () => {}); // swallow any residual async errors
      child.unref();
      return;
    } catch {}
  }
}
