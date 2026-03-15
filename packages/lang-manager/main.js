'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const os   = require('os');
const cp   = require('child_process');


let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 860,
    minWidth: 900, minHeight: 600,
    title: 'RobOS Programming Languages',
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}
app.setName('lang-manager');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── helpers ──────────────────────────────────────────────────────────────────
function exec(cmd) {
  try {
    return cp.execSync(cmd, { encoding: 'utf8', timeout: 8000 }).trim();
  } catch { return ''; }
}

function which(bin) {
  return exec(`which ${bin} 2>/dev/null`);
}

function sdkmanInstalled() {
  const dir = path.join(os.homedir(), '.sdkman', 'bin', 'sdkman-init.sh');
  return require('fs').existsSync(dir);
}

function nvmInstalled() {
  const dir = path.join(os.homedir(), '.nvm', 'nvm.sh');
  return require('fs').existsSync(dir);
}

function pyenvInstalled() {
  return !!which('pyenv') || require('fs').existsSync(path.join(os.homedir(), '.pyenv', 'bin', 'pyenv'));
}

function rbenvInstalled() {
  return !!which('rbenv') || require('fs').existsSync(path.join(os.homedir(), '.rbenv', 'bin', 'rbenv'));
}

function rustupInstalled() {
  return !!which('rustup') || require('fs').existsSync(path.join(os.homedir(), '.cargo', 'bin', 'rustup'));
}

// ── language catalogue ────────────────────────────────────────────────────────
const CATALOGUE = [
  // ── JVM ──
  {
    id: 'java',
    name: 'Java',
    icon: '☕',
    category: 'JVM',
    description: 'Java Development Kit — run and compile Java applications. Multiple JDK vendors: Temurin, GraalVM, Corretto, Zulu.',
    versionManager: 'sdkman',
    versionManagerInstallScript: `
curl -s "https://get.sdkman.io" | bash
`,
    installScript: (ver) => `
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java ${ver}
`,
    setDefaultScript: (ver) => `
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk default java ${ver}
`,
    removeScript: (ver) => `
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk uninstall java ${ver}
`,
    listInstalled: () => {
      if (!sdkmanInstalled()) return [];
      const out = exec(`bash -c 'source "$HOME/.sdkman/bin/sdkman-init.sh" 2>/dev/null && sdk list java 2>/dev/null | grep "installed\\|local" | head -40'`);
      const versions = [];
      for (const line of out.split('\n')) {
        const m = line.match(/\|\s*([\w.+_-]+)\s*\|\s*installed/i) || line.match(/>\s*([\w.+_-]+)/);
        if (m) versions.push({ version: m[1].trim(), active: line.includes('>') });
      }
      // Also try java -version directly
      const jv = exec('java -version 2>&1 | head -1');
      const jvm = jv.match(/version "([^"]+)"/);
      if (jvm && versions.length === 0) {
        versions.push({ version: jvm[1], active: true, detected: true });
      }
      return versions;
    },
    website: 'https://sdkman.io',
    availableVersionsHint: 'Run: sdk list java   (via SDKMAN)',
    buildTools: ['maven', 'gradle'],
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    icon: '🎯',
    category: 'JVM',
    description: 'Kotlin — modern JVM language by JetBrains. Runs on JVM, Android, and compiles to JavaScript or native.',
    versionManager: 'sdkman',
    installScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install kotlin ${ver || ''}`,
    setDefaultScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk default kotlin ${ver}`,
    removeScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk uninstall kotlin ${ver}`,
    listInstalled: () => {
      const kv = exec('kotlin -version 2>&1 | head -1');
      const km = kv.match(/kotlinc-jvm ([\d.]+)/);
      if (km) return [{ version: km[1], active: true }];
      return [];
    },
    website: 'https://kotlinlang.org',
    buildTools: ['gradle', 'maven'],
  },
  {
    id: 'scala',
    name: 'Scala',
    icon: '🔺',
    category: 'JVM',
    description: 'Scala — combines OOP and functional programming on the JVM.',
    versionManager: 'sdkman',
    installScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install scala ${ver || ''}`,
    setDefaultScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk default scala ${ver}`,
    removeScript: (ver) => `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk uninstall scala ${ver}`,
    listInstalled: () => {
      const sv = exec('scala -version 2>&1');
      const sm = sv.match(/version ([\d.]+)/);
      if (sm) return [{ version: sm[1], active: true }];
      return [];
    },
    website: 'https://scala-lang.org',
    buildTools: ['sbt', 'gradle'],
  },
  // ── Systems ──
  {
    id: 'go',
    name: 'Go',
    icon: '🐹',
    category: 'Systems',
    description: 'Go (Golang) — fast, statically typed language by Google. Built-in build system, first-class concurrency.',
    versionManager: 'g (go version manager)',
    installScript: (ver) => {
      const v = ver || 'latest';
      return `
# Install g (go version manager) if not present
if ! command -v g &>/dev/null; then
  curl -sSL https://git.io/g-install | sh -s -- -y
  source ~/.bashrc
fi
g install ${v}
`;
    },
    setDefaultScript: (ver) => `g set ${ver}`,
    removeScript: (ver) => `g remove ${ver}`,
    listInstalled: () => {
      const versions = [];
      // g list
      const gl = exec('g list 2>/dev/null');
      for (const line of gl.split('\n')) {
        const m = line.match(/([*>]?)\s*([\d.]+(?:rc\d+|beta\d+)?)/);
        if (m) versions.push({ version: m[2].trim(), active: m[1].includes('*') || m[1].includes('>') });
      }
      if (versions.length === 0) {
        const gv = exec('go version 2>/dev/null');
        const gm = gv.match(/go([\d.]+)/);
        if (gm) versions.push({ version: gm[1], active: true });
      }
      return versions;
    },
    website: 'https://go.dev',
    buildTools: [],  // go build is built-in
  },
  {
    id: 'rust',
    name: 'Rust',
    icon: '🦀',
    category: 'Systems',
    description: 'Rust — systems language focused on safety, speed, and concurrency. Managed via rustup.',
    versionManager: 'rustup',
    versionManagerInstallScript: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`,
    installScript: (ver) => {
      if (ver && ver !== 'stable' && ver !== 'beta' && ver !== 'nightly') {
        return `rustup install ${ver} && rustup default ${ver}`;
      }
      return `rustup install ${ver || 'stable'} && rustup default ${ver || 'stable'}`;
    },
    setDefaultScript: (ver) => `rustup default ${ver}`,
    removeScript: (ver) => `rustup uninstall ${ver}`,
    listInstalled: () => {
      const versions = [];
      if (!rustupInstalled()) {
        const rv = exec('rustc --version 2>/dev/null');
        const rm = rv.match(/rustc ([\d.]+)/);
        if (rm) return [{ version: rm[1], active: true }];
        return [];
      }
      const rl = exec('rustup toolchain list 2>/dev/null');
      for (const line of rl.split('\n')) {
        if (!line.trim()) continue;
        versions.push({ version: line.replace('(default)', '').trim(), active: line.includes('(default)') });
      }
      return versions;
    },
    website: 'https://rustup.rs',
    buildTools: ['cargo'],
  },
  {
    id: 'dotnet',
    name: '.NET',
    icon: '🔷',
    category: 'Systems',
    description: 'Microsoft .NET — cross-platform runtime for C#, F#, and VB. Includes dotnet CLI.',
    versionManager: 'dotnet-install script',
    installScript: (ver) => `
curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --version ${ver || 'latest'} --install-dir $HOME/.dotnet
echo 'export DOTNET_ROOT=$HOME/.dotnet' >> ~/.bashrc
echo 'export PATH=$PATH:$HOME/.dotnet' >> ~/.bashrc
`,
    setDefaultScript: (ver) => `echo "Set DOTNET_ROOT to the ${ver} install directory in ~/.bashrc"`,
    removeScript: (ver) => `rm -rf $HOME/.dotnet/${ver}`,
    listInstalled: () => {
      const versions = [];
      const dl = exec('dotnet --list-sdks 2>/dev/null');
      for (const line of dl.split('\n')) {
        const m = line.match(/^([\d.]+)/);
        if (m) versions.push({ version: m[1], active: false });
      }
      const dv = exec('dotnet --version 2>/dev/null');
      if (dv && versions.length === 0) versions.push({ version: dv, active: true });
      else if (dv) {
        const found = versions.find(v => dv.startsWith(v.version));
        if (found) found.active = true;
      }
      return versions;
    },
    website: 'https://dotnet.microsoft.com',
    buildTools: ['nuget'],
  },
  // ── Scripting ──
  {
    id: 'nodejs',
    name: 'Node.js',
    icon: '🟢',
    category: 'Scripting',
    description: 'Node.js — JavaScript runtime. Manage versions via nvm (Node Version Manager).',
    versionManager: 'nvm',
    versionManagerInstallScript: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash`,
    installScript: (ver) => `
source "$HOME/.nvm/nvm.sh"
nvm install ${ver || 'lts/*'}
`,
    setDefaultScript: (ver) => `
source "$HOME/.nvm/nvm.sh"
nvm alias default ${ver}
`,
    removeScript: (ver) => `
source "$HOME/.nvm/nvm.sh"
nvm uninstall ${ver}
`,
    listInstalled: () => {
      const versions = [];
      if (nvmInstalled()) {
        const nl = exec(`bash -c 'source "$HOME/.nvm/nvm.sh" 2>/dev/null && nvm list 2>/dev/null'`);
        for (const line of nl.split('\n')) {
          if (!line.trim() || line.includes('->') === false && !line.match(/v?\d+\.\d+/)) continue;
          const m = line.match(/v?([\d.]+)/);
          if (m) versions.push({ version: m[1], active: line.includes('->') || line.includes('*') || line.startsWith('->') });
        }
      }
      if (versions.length === 0) {
        const nv = exec('node --version 2>/dev/null');
        const nm = nv.match(/v?([\d.]+)/);
        if (nm) versions.push({ version: nm[1], active: true });
      }
      return versions;
    },
    website: 'https://nodejs.org',
    buildTools: ['npm', 'yarn', 'pnpm', 'bun'],
  },
  {
    id: 'python',
    name: 'Python',
    icon: '🐍',
    category: 'Scripting',
    description: 'Python — versatile, high-level language. Manage multiple versions via pyenv.',
    versionManager: 'pyenv',
    versionManagerInstallScript: `
curl https://pyenv.run | bash
echo 'export PYENV_ROOT="$HOME/.pyenv"' >> ~/.bashrc
echo 'export PATH="$PYENV_ROOT/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(pyenv init -)"' >> ~/.bashrc
`,
    installScript: (ver) => `
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
pyenv install ${ver}
`,
    setDefaultScript: (ver) => `
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
eval "$(pyenv init -)"
pyenv global ${ver}
`,
    removeScript: (ver) => `
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"
pyenv uninstall -f ${ver}
`,
    listInstalled: () => {
      const versions = [];
      if (pyenvInstalled()) {
        const pyenvBin = which('pyenv') || path.join(os.homedir(), '.pyenv', 'bin', 'pyenv');
        const pl = exec(`${pyenvBin} versions 2>/dev/null`);
        for (const line of pl.split('\n')) {
          const m = line.match(/\*?\s*([\d.]+)/);
          if (m) versions.push({ version: m[1], active: line.trim().startsWith('*') });
        }
      }
      if (versions.length === 0) {
        for (const cmd of ['python3', 'python']) {
          const pv = exec(`${cmd} --version 2>/dev/null`);
          const pm = pv.match(/Python ([\d.]+)/);
          if (pm) { versions.push({ version: pm[1], active: true }); break; }
        }
      }
      return versions;
    },
    website: 'https://python.org',
    buildTools: ['pip', 'poetry', 'conda', 'uv'],
  },
  {
    id: 'ruby',
    name: 'Ruby',
    icon: '💎',
    category: 'Scripting',
    description: 'Ruby — dynamic, elegant language. Manage versions via rbenv or RVM.',
    versionManager: 'rbenv',
    versionManagerInstallScript: `
git clone https://github.com/rbenv/rbenv.git ~/.rbenv
echo 'export PATH="$HOME/.rbenv/bin:$PATH"' >> ~/.bashrc
echo 'eval "$(rbenv init - bash)"' >> ~/.bashrc
git clone https://github.com/rbenv/ruby-build.git ~/.rbenv/plugins/ruby-build
`,
    installScript: (ver) => `
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init - bash)"
rbenv install ${ver}
`,
    setDefaultScript: (ver) => `
export PATH="$HOME/.rbenv/bin:$PATH"
eval "$(rbenv init - bash)"
rbenv global ${ver}
`,
    removeScript: (ver) => `
export PATH="$HOME/.rbenv/bin:$PATH"
rbenv uninstall ${ver}
`,
    listInstalled: () => {
      const versions = [];
      const rbenvBin = which('rbenv') || path.join(os.homedir(), '.rbenv', 'bin', 'rbenv');
      if (rbenvBin) {
        const rl = exec(`${rbenvBin} versions 2>/dev/null`);
        for (const line of rl.split('\n')) {
          const m = line.match(/\*?\s*([\d.]+(?:-[a-z0-9]+)?)/);
          if (m) versions.push({ version: m[1], active: line.trim().startsWith('*') });
        }
      }
      if (versions.length === 0) {
        const rv = exec('ruby --version 2>/dev/null');
        const rm = rv.match(/ruby ([\d.]+)/);
        if (rm) versions.push({ version: rm[1], active: true });
      }
      return versions;
    },
    website: 'https://ruby-lang.org',
    buildTools: ['bundler', 'gem'],
  },
  {
    id: 'php',
    name: 'PHP',
    icon: '🐘',
    category: 'Scripting',
    description: 'PHP — server-side scripting language. Install via apt or phpenv for multi-version.',
    versionManager: 'apt / phpenv',
    installScript: (ver) => {
      if (ver) return `sudo apt-get install -y php${ver} php${ver}-cli php${ver}-fpm`;
      return `sudo apt-get install -y php php-cli`;
    },
    setDefaultScript: (ver) => `sudo update-alternatives --set php /usr/bin/php${ver}`,
    removeScript: (ver) => `sudo apt-get remove -y php${ver} php${ver}-cli`,
    listInstalled: () => {
      const versions = [];
      const dpkg = exec('dpkg -l | grep "^ii  php[0-9]" 2>/dev/null | head -20');
      const seen = new Set();
      for (const line of dpkg.split('\n')) {
        const m = line.match(/php([\d.]+)\s/);
        if (m && !seen.has(m[1])) { seen.add(m[1]); versions.push({ version: m[1], active: false }); }
      }
      const pv = exec('php --version 2>/dev/null | head -1');
      const pm = pv.match(/PHP ([\d.]+)/);
      if (pm) {
        const found = versions.find(v => pm[1].startsWith(v.version));
        if (found) found.active = true;
        else if (versions.length === 0) versions.push({ version: pm[1], active: true });
      }
      return versions;
    },
    website: 'https://php.net',
    buildTools: ['composer'],
  },
  // ── Build/Other ──
  {
    id: 'swift',
    name: 'Swift',
    icon: '🦅',
    category: 'Systems',
    description: 'Swift — Apple\'s open-source systems language. Runs on Linux via swiftenv.',
    versionManager: 'swiftenv',
    installScript: (ver) => `
if ! command -v swiftenv &>/dev/null; then
  git clone https://github.com/kylef/swiftenv.git ~/.swiftenv
  echo 'export SWIFTENV_ROOT="$HOME/.swiftenv"' >> ~/.bashrc
  echo 'export PATH="$SWIFTENV_ROOT/bin:$PATH"' >> ~/.bashrc
  echo 'eval "$(swiftenv init -)"' >> ~/.bashrc
fi
export SWIFTENV_ROOT="$HOME/.swiftenv"
export PATH="$SWIFTENV_ROOT/bin:$PATH"
eval "$(swiftenv init -)"
swiftenv install ${ver || 'latest'}
`,
    setDefaultScript: (ver) => `swiftenv global ${ver}`,
    removeScript: (ver) => `swiftenv uninstall ${ver}`,
    listInstalled: () => {
      const sv = exec('swift --version 2>/dev/null | head -1');
      const sm = sv.match(/Swift version ([\d.]+)/);
      if (sm) return [{ version: sm[1], active: true }];
      return [];
    },
    website: 'https://swift.org',
    buildTools: ['swift-package-manager'],
  },
  {
    id: 'elixir',
    name: 'Elixir',
    icon: '💜',
    category: 'Functional',
    description: 'Elixir — functional, concurrent language built on Erlang VM (BEAM). Managed via asdf.',
    versionManager: 'asdf',
    installScript: (ver) => `
if ! command -v asdf &>/dev/null; then
  git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
  echo '. "$HOME/.asdf/asdf.sh"' >> ~/.bashrc
fi
source "$HOME/.asdf/asdf.sh"
asdf plugin add elixir 2>/dev/null || true
asdf install elixir ${ver || 'latest'}
`,
    setDefaultScript: (ver) => `source "$HOME/.asdf/asdf.sh" && asdf global elixir ${ver}`,
    removeScript: (ver) => `source "$HOME/.asdf/asdf.sh" && asdf uninstall elixir ${ver}`,
    listInstalled: () => {
      const ev = exec('elixir --version 2>/dev/null | grep Elixir');
      const em = ev.match(/Elixir ([\d.]+)/);
      if (em) return [{ version: em[1], active: true }];
      return [];
    },
    website: 'https://elixir-lang.org',
    buildTools: ['mix', 'hex'],
  },
];

// ── build tool catalogue ──────────────────────────────────────────────────────
const BUILD_TOOL_CATALOGUE = {
  maven: {
    name: 'Apache Maven', icon: '🪶',
    detect: () => exec('mvn --version 2>/dev/null | head -1'),
    versionRegex: /Apache Maven ([\d.]+)/,
    versionManager: 'sdkman',
    installScript: `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install maven`,
    website: 'https://maven.apache.org',
    configFile: 'pom.xml',
  },
  gradle: {
    name: 'Gradle', icon: '🐘',
    detect: () => exec('gradle --version 2>/dev/null | grep "^Gradle"'),
    versionRegex: /Gradle ([\d.]+)/,
    versionManager: 'sdkman',
    installScript: `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install gradle`,
    website: 'https://gradle.org',
    configFile: 'build.gradle / build.gradle.kts',
  },
  sbt: {
    name: 'sbt', icon: '⚡',
    detect: () => exec('sbt --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    versionManager: 'sdkman',
    installScript: `source "$HOME/.sdkman/bin/sdkman-init.sh" && sdk install sbt`,
    website: 'https://scala-sbt.org',
    configFile: 'build.sbt',
  },
  npm: {
    name: 'npm', icon: '📦',
    detect: () => exec('npm --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `# npm comes with Node.js`,
    website: 'https://npmjs.com',
    configFile: 'package.json',
  },
  yarn: {
    name: 'Yarn', icon: '🧶',
    detect: () => exec('yarn --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `npm install -g yarn`,
    website: 'https://yarnpkg.com',
    configFile: 'package.json / yarn.lock',
  },
  pnpm: {
    name: 'pnpm', icon: '⚡',
    detect: () => exec('pnpm --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `npm install -g pnpm`,
    website: 'https://pnpm.io',
    configFile: 'package.json / pnpm-lock.yaml',
  },
  bun: {
    name: 'Bun', icon: '🥟',
    detect: () => exec('bun --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `curl -fsSL https://bun.sh/install | bash`,
    website: 'https://bun.sh',
    configFile: 'package.json / bun.lockb',
  },
  pip: {
    name: 'pip', icon: '🥧',
    detect: () => exec('pip3 --version 2>/dev/null || pip --version 2>/dev/null'),
    versionRegex: /pip ([\d.]+)/,
    installScript: `python3 -m ensurepip --upgrade`,
    website: 'https://pip.pypa.io',
    configFile: 'requirements.txt',
  },
  poetry: {
    name: 'Poetry', icon: '📖',
    detect: () => exec('poetry --version 2>/dev/null'),
    versionRegex: /Poetry \(version ([\d.]+)\)/,
    installScript: `curl -sSL https://install.python-poetry.org | python3 -`,
    website: 'https://python-poetry.org',
    configFile: 'pyproject.toml',
  },
  conda: {
    name: 'Conda', icon: '🐍',
    detect: () => exec('conda --version 2>/dev/null'),
    versionRegex: /conda ([\d.]+)/,
    installScript: `
curl -sO https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh -b -p $HOME/miniconda3
$HOME/miniconda3/bin/conda init bash
`,
    website: 'https://anaconda.com',
    configFile: 'environment.yml',
  },
  uv: {
    name: 'uv', icon: '⚡',
    detect: () => exec('uv --version 2>/dev/null'),
    versionRegex: /uv ([\d.]+)/,
    installScript: `curl -LsSf https://astral.sh/uv/install.sh | sh`,
    website: 'https://docs.astral.sh/uv',
    configFile: 'pyproject.toml',
  },
  cargo: {
    name: 'Cargo', icon: '📦',
    detect: () => exec('cargo --version 2>/dev/null'),
    versionRegex: /cargo ([\d.]+)/,
    installScript: `# cargo comes with rustup`,
    website: 'https://doc.rust-lang.org/cargo/',
    configFile: 'Cargo.toml',
  },
  nuget: {
    name: 'NuGet', icon: '📦',
    detect: () => exec('dotnet nuget --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `# NuGet is included with .NET SDK`,
    website: 'https://nuget.org',
    configFile: '*.csproj / packages.config',
  },
  bundler: {
    name: 'Bundler', icon: '📦',
    detect: () => exec('bundle --version 2>/dev/null'),
    versionRegex: /Bundler version ([\d.]+)/,
    installScript: `gem install bundler`,
    website: 'https://bundler.io',
    configFile: 'Gemfile',
  },
  gem: {
    name: 'RubyGems', icon: '💎',
    detect: () => exec('gem --version 2>/dev/null'),
    versionRegex: /([\d.]+)/,
    installScript: `# gem comes with Ruby`,
    website: 'https://rubygems.org',
    configFile: '*.gemspec',
  },
  composer: {
    name: 'Composer', icon: '🎵',
    detect: () => exec('composer --version 2>/dev/null | head -1'),
    versionRegex: /Composer version ([\d.]+)/,
    installScript: `
php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
php composer-setup.php --install-dir=/usr/local/bin --filename=composer
php -r "unlink('composer-setup.php');"
`,
    website: 'https://getcomposer.org',
    configFile: 'composer.json',
  },
  mix: {
    name: 'Mix (Elixir)', icon: '🔀',
    detect: () => exec('mix --version 2>/dev/null'),
    versionRegex: /Mix ([\d.]+)/,
    installScript: `# mix comes with Elixir`,
    website: 'https://hexdocs.pm/mix/',
    configFile: 'mix.exs',
  },
  hex: {
    name: 'Hex', icon: '🔷',
    detect: () => exec('mix hex.info 2>/dev/null | head -1'),
    versionRegex: /Hex ([\d.]+)/,
    installScript: `mix local.hex --force`,
    website: 'https://hex.pm',
    configFile: 'mix.exs',
  },
  'swift-package-manager': {
    name: 'Swift Package Manager', icon: '📦',
    detect: () => exec('swift package --version 2>/dev/null'),
    versionRegex: /Swift Package Manager - Swift ([\d.]+)/,
    installScript: `# SPM comes with Swift`,
    website: 'https://github.com/apple/swift-package-manager',
    configFile: 'Package.swift',
  },
};

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-catalogue', () => CATALOGUE.map(l => ({
  id: l.id, name: l.name, icon: l.icon, category: l.category,
  description: l.description, versionManager: l.versionManager,
  website: l.website, buildTools: l.buildTools || [],
})));

ipcMain.handle('detect-versions', (_, id) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return { versions: [], versionManagerInstalled: false };
  let vmInstalled = false;
  if (lang.versionManager === 'sdkman') vmInstalled = sdkmanInstalled();
  else if (lang.versionManager === 'nvm') vmInstalled = nvmInstalled();
  else if (lang.versionManager === 'pyenv') vmInstalled = pyenvInstalled();
  else if (lang.versionManager === 'rbenv') vmInstalled = rbenvInstalled();
  else if (lang.versionManager === 'rustup') vmInstalled = rustupInstalled();
  else vmInstalled = true; // apt-based etc
  const versions = lang.listInstalled();
  return { versions, vmInstalled };
});

ipcMain.handle('detect-build-tools', (_, id) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return [];
  return (lang.buildTools || []).map(btId => {
    const bt = BUILD_TOOL_CATALOGUE[btId];
    if (!bt) return { id: btId, name: btId, installed: false };
    const out = bt.detect();
    const m = out && out.match(bt.versionRegex);
    return {
      id: btId,
      name: bt.name,
      icon: bt.icon,
      version: m ? m[1] : null,
      installed: !!m || !!out.trim(),
      installScript: bt.installScript,
      website: bt.website,
      configFile: bt.configFile,
    };
  });
});

ipcMain.handle('install-version', (_, { id, version }) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return { ok: false, error: 'Unknown language' };
  const script = lang.installScript(version);
  openTerminalWithScript(script, `Install ${lang.name} ${version || 'latest'}`);
  return { ok: true };
});

ipcMain.handle('set-default-version', (_, { id, version }) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return { ok: false, error: 'Unknown language' };
  const script = lang.setDefaultScript(version);
  openTerminalWithScript(script, `Set ${lang.name} ${version} as default`);
  return { ok: true };
});

ipcMain.handle('remove-version', (_, { id, version }) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return { ok: false, error: 'Unknown language' };
  const script = lang.removeScript(version);
  openTerminalWithScript(script, `Remove ${lang.name} ${version}`);
  return { ok: true };
});

ipcMain.handle('install-build-tool', (_, { toolId }) => {
  const bt = BUILD_TOOL_CATALOGUE[toolId];
  if (!bt) return { ok: false };
  openTerminalWithScript(bt.installScript, `Install ${bt.name}`);
  return { ok: true };
});

ipcMain.handle('get-env-info', (_, id) => {
  const lang = CATALOGUE.find(l => l.id === id);
  if (!lang) return {};
  const info = {};
  // Generic env vars
  const envVars = ['JAVA_HOME', 'GOROOT', 'GOPATH', 'PYTHONPATH', 'RUSTUP_HOME', 'CARGO_HOME',
    'NVM_DIR', 'PYENV_ROOT', 'RBENV_ROOT', 'DOTNET_ROOT', 'SDKMAN_DIR'];
  for (const v of envVars) {
    const val = process.env[v] || exec(`bash -l -c 'echo $${v}' 2>/dev/null`);
    if (val && val.trim()) info[v] = val.trim();
  }
  const pathEntries = exec(`bash -l -c 'echo $PATH' 2>/dev/null`).split(':').filter(Boolean);
  return { envVars: info, pathEntries };
});

ipcMain.handle('open-url', (_, url) => { shell.openExternal(url); return { ok: true }; });
ipcMain.handle('open-terminal', (_, cmd) => { openTerminalWithScript(cmd, 'Terminal'); return { ok: true }; });

function openTerminalWithScript(script, title) {
  const tmp = require('os').tmpdir();
  const scriptFile = path.join(tmp, `robos-lang-${Date.now()}.sh`);
  require('fs').writeFileSync(scriptFile, `#!/usr/bin/env bash\n# ${title}\n${script}\necho\necho "=== Done. Press Enter to close ==="\nread -r\n`, { mode: 0o755 });
  const terms = [
    `tilix -e bash "${scriptFile}"`,
    `gnome-terminal -- bash "${scriptFile}"`,
    `xterm -e bash "${scriptFile}"`,
  ];
  for (const t of terms) {
    try { cp.exec(t); return; } catch {}
  }
}
