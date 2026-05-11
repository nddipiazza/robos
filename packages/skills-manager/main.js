'use strict';

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const https   = require('https');
const http    = require('http');
const { execFile } = require('child_process');

app.setName('robos-skills-manager');
app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'skills-manager'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

// ── Debug snapshot server ─────────────────────────────────────────────────────
let _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

// ── Logger ────────────────────────────────────────────────────────────────────
let log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'logger'),
    path.resolve(__dirname, '..', 'robos-lib', 'logger'),
    '/usr/local/share/robos/robos-lib/logger',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { const m = require(p); log = m.createLogger('skills-manager'); m.registerLogsIPC && m.registerLogsIPC(ipcMain); break; } catch {}
  }
} catch {}

// ── Skills store ──────────────────────────────────────────────────────────────
const SKILLS_FILE = path.join(os.homedir(), '.config', 'robos', 'skills.json');

const BUILTIN_SKILLS = [
  // File Operations
  { id: 'find-large-files',       name: 'Find Large Files',              category: 'File Operations',    tags: ['find','disk','storage'],    command: 'find ~ -type f -size +100M 2>/dev/null | head -20',                                  description: 'List files larger than 100MB in your home directory', source: 'builtin' },
  { id: 'find-recent-files',      name: 'Find Recent Files',             category: 'File Operations',    tags: ['find','recent','mtime'],    command: 'find . -type f -mtime -1 2>/dev/null | head -30',                                    description: 'List files modified in the last 24 hours', source: 'builtin' },
  { id: 'disk-usage-summary',     name: 'Disk Usage Summary',            category: 'File Operations',    tags: ['disk','du','storage'],      command: 'du -sh */ 2>/dev/null | sort -rh | head -20',                                        description: 'Show disk usage per directory, sorted by size', source: 'builtin' },
  { id: 'disk-space',             name: 'Disk Space Overview',           category: 'File Operations',    tags: ['disk','df','space'],        command: 'df -h',                                                                              description: 'Show disk space usage for all mounted filesystems', source: 'builtin' },
  { id: 'count-files-by-type',    name: 'Count Files by Extension',      category: 'File Operations',    tags: ['find','count','stats'],     command: "find . -type f | sed 's/.*\\.//' | sort | uniq -c | sort -rn | head -20",             description: 'Count files grouped by extension in current directory', source: 'builtin' },
  { id: 'find-empty-dirs',        name: 'Find Empty Directories',        category: 'File Operations',    tags: ['find','cleanup','dirs'],    command: 'find . -type d -empty 2>/dev/null | head -20',                                       description: 'Find empty directories that can be cleaned up', source: 'builtin' },
  { id: 'find-duplicates',        name: 'Find Duplicate Files',          category: 'File Operations',    tags: ['find','duplicates','md5'],  command: "find . -type f | xargs md5sum 2>/dev/null | sort | awk 'NR>1 && prev==$1{print} {prev=$1}' | head -20", description: 'Find files with identical content', source: 'builtin' },

  // Process Management
  { id: 'top-memory',             name: 'Top Memory Consumers',          category: 'Process Management', tags: ['ps','memory','ram'],        command: 'ps aux --sort=-%mem | head -11',                                                     description: 'List top 10 processes by memory usage', source: 'builtin' },
  { id: 'top-cpu',                name: 'Top CPU Consumers',             category: 'Process Management', tags: ['ps','cpu','performance'],   command: 'ps aux --sort=-%cpu | head -11',                                                     description: 'List top 10 processes by CPU usage', source: 'builtin' },
  { id: 'list-open-ports',        name: 'List Open Ports',               category: 'Process Management', tags: ['ports','network','ss'],     command: 'ss -tlnp',                                                                           description: 'Show all open TCP ports with process info', source: 'builtin' },
  { id: 'free-memory',            name: 'Memory Overview',               category: 'Process Management', tags: ['memory','free','ram'],      command: 'free -h && echo "---" && vmstat 1 1',                                                description: 'Show memory usage and virtual memory statistics', source: 'builtin' },
  { id: 'zombie-processes',       name: 'Find Zombie Processes',         category: 'Process Management', tags: ['ps','zombie','cleanup'],    command: "ps aux | awk '$8 == \"Z\" {print}'",                                                 description: 'List zombie processes that need cleanup', source: 'builtin' },
  { id: 'process-tree',           name: 'Process Tree',                  category: 'Process Management', tags: ['ps','tree','pstree'],       command: 'pstree -p | head -40',                                                               description: 'Show process hierarchy as a tree', source: 'builtin' },

  // Git Operations
  { id: 'git-recent-commits',     name: 'Recent Commits',                category: 'Git',                tags: ['git','log','history'],      command: 'git log --oneline --graph --decorate -20',                                           description: 'Show last 20 commits with branch graph', source: 'builtin' },
  { id: 'git-changed-files',      name: 'Changed Files Status',          category: 'Git',                tags: ['git','status','diff'],      command: 'git status --short && echo "---" && git diff --stat',                                description: 'Show current working tree status and diff summary', source: 'builtin' },
  { id: 'git-stash-list',         name: 'Stash List',                    category: 'Git',                tags: ['git','stash'],              command: 'git stash list',                                                                     description: 'List all stashed changes', source: 'builtin' },
  { id: 'git-branch-list',        name: 'Branch Overview',               category: 'Git',                tags: ['git','branch','remote'],    command: 'git branch -vv && echo "---" && git remote -v',                                     description: 'Show all local branches with tracking info and remotes', source: 'builtin' },
  { id: 'git-contributors',       name: 'Top Contributors',              category: 'Git',                tags: ['git','log','authors'],      command: 'git shortlog -sn --all | head -20',                                                  description: 'Show top contributors by commit count', source: 'builtin' },
  { id: 'git-large-files',        name: 'Find Large Git Objects',        category: 'Git',                tags: ['git','objects','size'],     command: "git rev-list --objects --all | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | sed -n 's/^blob //p' | sort -n | tail -10", description: 'Find the largest objects in git history', source: 'builtin' },
  { id: 'git-cleanup',            name: 'Cleanup Merged Branches',       category: 'Git',                tags: ['git','branch','cleanup'],   command: "git branch --merged main 2>/dev/null | grep -v '\\*\\|main\\|master\\|develop' | head -20", description: 'List local branches already merged into main', source: 'builtin' },

  // Network
  { id: 'check-connectivity',     name: 'Check Internet Connectivity',   category: 'Network',            tags: ['curl','ping','internet'],   command: 'curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s" https://github.com && echo " (GitHub OK)"', description: 'Test internet connectivity to GitHub', source: 'builtin' },
  { id: 'list-interfaces',        name: 'Network Interfaces',            category: 'Network',            tags: ['ip','network','interfaces'],command: 'ip addr show',                                                                       description: 'Show all network interfaces and their IP addresses', source: 'builtin' },
  { id: 'active-connections',     name: 'Active Connections',            category: 'Network',            tags: ['ss','connections','tcp'],   command: 'ss -tp | head -30',                                                                  description: 'Show active TCP connections with process info', source: 'builtin' },
  { id: 'dns-lookup',             name: 'DNS Lookup Test',               category: 'Network',            tags: ['dig','dns','nslookup'],     command: 'dig google.com +short && echo "---" && dig github.com +short',                       description: 'Test DNS resolution for common domains', source: 'builtin' },
  { id: 'bandwidth-usage',        name: 'Network Bandwidth',             category: 'Network',            tags: ['ifstat','bandwidth','eth'], command: 'cat /proc/net/dev | grep -v lo | awk "NR>2{print $1, $2/1024/1024 \"MB rx\", $10/1024/1024 \"MB tx\"}"', description: 'Show cumulative network rx/tx per interface', source: 'builtin' },

  // Docker / Containers
  { id: 'docker-containers',      name: 'List All Containers',           category: 'Docker',             tags: ['docker','containers','ps'], command: 'docker ps -a --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}\\t{{.Image}}"',  description: 'List all Docker containers with status and ports', source: 'builtin' },
  { id: 'docker-stats',           name: 'Container Resource Stats',      category: 'Docker',             tags: ['docker','stats','memory'],  command: 'docker stats --no-stream --format "table {{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}"', description: 'Show CPU and memory usage for running containers', source: 'builtin' },
  { id: 'docker-images',          name: 'List Docker Images',            category: 'Docker',             tags: ['docker','images','layers'], command: 'docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}\\t{{.CreatedSince}}"', description: 'List all Docker images with sizes', source: 'builtin' },
  { id: 'docker-volumes',         name: 'Docker Volumes',                category: 'Docker',             tags: ['docker','volumes'],         command: 'docker volume ls && echo "---" && docker system df',                                 description: 'List volumes and overall Docker disk usage', source: 'builtin' },
  { id: 'docker-prune',           name: 'Docker System Cleanup',         category: 'Docker',             tags: ['docker','prune','cleanup'], command: 'docker system prune -f --volumes',                                                   description: 'Remove stopped containers, unused images, and volumes', source: 'builtin' },

  // System Info
  { id: 'system-overview',        name: 'System Overview',               category: 'System',             tags: ['uname','uptime','cpu'],     command: 'echo "=== System ===" && uname -a && echo "=== Uptime ===" && uptime && echo "=== CPU ===" && lscpu | grep "Model name"', description: 'Show kernel, uptime, and CPU model', source: 'builtin' },
  { id: 'cpu-info',               name: 'CPU Details',                   category: 'System',             tags: ['cpu','lscpu','cores'],      command: 'lscpu | grep -E "Model name|Socket|Core|Thread|CPU MHz"',                           description: 'Show CPU model, cores, threads, and speed', source: 'builtin' },
  { id: 'os-version',             name: 'OS Version',                    category: 'System',             tags: ['os','release','version'],   command: 'lsb_release -a 2>/dev/null || cat /etc/os-release',                                 description: 'Show operating system version and distribution info', source: 'builtin' },
  { id: 'running-services',       name: 'Running System Services',       category: 'System',             tags: ['systemctl','services'],     command: 'systemctl list-units --type=service --state=running --no-pager | head -25',          description: 'List all currently running systemd services', source: 'builtin' },
  { id: 'failed-services',        name: 'Failed System Services',        category: 'System',             tags: ['systemctl','failed','logs'], command: 'systemctl --failed --no-pager',                                                     description: 'List systemd services that have failed', source: 'builtin' },
  { id: 'system-logs',            name: 'Recent System Errors',          category: 'System',             tags: ['journalctl','logs','errors'],command: 'journalctl -p err -n 30 --no-pager',                                                description: 'Show last 30 system error log entries', source: 'builtin' },

  // Package Management
  { id: 'npm-globals',            name: 'Installed npm Global Packages', category: 'Package Management', tags: ['npm','global','packages'],  command: 'npm list -g --depth=0 2>/dev/null',                                                  description: 'List globally installed npm packages', source: 'builtin' },
  { id: 'npm-outdated',           name: 'Outdated npm Globals',          category: 'Package Management', tags: ['npm','outdated','update'],  command: 'npm outdated -g 2>/dev/null',                                                        description: 'Check for outdated global npm packages', source: 'builtin' },
  { id: 'pip-packages',           name: 'Installed Python Packages',     category: 'Package Management', tags: ['pip','python','packages'],  command: 'pip list 2>/dev/null | head -30',                                                    description: 'List installed Python packages', source: 'builtin' },
  { id: 'apt-recent',             name: 'Recently Installed Packages',   category: 'Package Management', tags: ['apt','installed','dpkg'],   command: 'grep " install " /var/log/dpkg.log 2>/dev/null | tail -20',                         description: 'Show recently installed apt/dpkg packages', source: 'builtin' },

  // Text Processing
  { id: 'json-pretty',            name: 'Pretty-Print JSON',             category: 'Text Processing',    tags: ['jq','json','format'],       command: 'cat $FILE | jq . 2>/dev/null || python3 -m json.tool $FILE',                         description: 'Format and validate a JSON file', source: 'builtin' },
  { id: 'count-lines',            name: 'Count & Sort Lines',            category: 'Text Processing',    tags: ['sort','uniq','count'],      command: 'sort "$FILE" | uniq -c | sort -rn | head -20',                                       description: 'Count occurrences of each unique line, sorted by frequency', source: 'builtin' },
  { id: 'csv-summary',            name: 'CSV File Summary',              category: 'Text Processing',    tags: ['awk','csv','head'],         command: "awk -F',' 'NR<=5{print NR\": \"$0}' \"$FILE\" && echo \"Total lines: $(wc -l < \"$FILE\")\"", description: 'Preview first 5 rows of a CSV with line count', source: 'builtin' },
  { id: 'grep-recursive',         name: 'Search Text in Files',          category: 'Text Processing',    tags: ['grep','search','recursive'],command: 'grep -rn "$PATTERN" . --include="*.txt" --include="*.md" --include="*.js" | head -20', description: 'Recursively search for a pattern in text/code files', source: 'builtin' },

  // Security
  { id: 'ssh-keys',               name: 'SSH Key Inventory',             category: 'Security',           tags: ['ssh','keys','auth'],        command: 'ls -la ~/.ssh/ && echo "---" && for f in ~/.ssh/*.pub; do echo "$f:"; ssh-keygen -lf "$f" 2>/dev/null; done', description: 'List SSH keys and show their fingerprints', source: 'builtin' },
  { id: 'gpg-keys',               name: 'GPG Key List',                  category: 'Security',           tags: ['gpg','keys','encrypt'],     command: 'gpg --list-keys 2>/dev/null && echo "---" && gpg --list-secret-keys 2>/dev/null',   description: 'List public and private GPG keys', source: 'builtin' },
  { id: 'last-logins',            name: 'Recent Login History',          category: 'Security',           tags: ['last','who','auth'],        command: 'last | head -20',                                                                    description: 'Show recent user login history', source: 'builtin' },
  { id: 'sudo-log',               name: 'Recent Sudo Usage',             category: 'Security',           tags: ['sudo','auth','log'],        command: 'grep "sudo" /var/log/auth.log 2>/dev/null | tail -20 || journalctl _COMM=sudo -n 20 --no-pager 2>/dev/null', description: 'Show recent sudo command usage from auth logs', source: 'builtin' },
  { id: 'open-files',             name: 'Open File Descriptors',         category: 'Security',           tags: ['lsof','files','fds'],       command: 'lsof -nP | wc -l && echo "total open fds" && lsof -nP | awk \'{print $1}\' | sort | uniq -c | sort -rn | head -10', description: 'Count open file descriptors and top processes using them', source: 'builtin' },

  // Development
  { id: 'node-version',           name: 'Node / npm Versions',           category: 'Development',        tags: ['node','npm','version'],     command: 'node --version && npm --version && echo "nvm: $(nvm --version 2>/dev/null || echo n/a)"', description: 'Show installed Node.js, npm, and nvm versions', source: 'builtin' },
  { id: 'python-version',         name: 'Python Version',                category: 'Development',        tags: ['python','version'],         command: 'python3 --version && pip3 --version 2>/dev/null',                                    description: 'Show installed Python and pip versions', source: 'builtin' },
  { id: 'env-vars',               name: 'Current Environment Variables', category: 'Development',        tags: ['env','vars','export'],      command: 'env | sort | grep -v -E "^(LS_COLORS|BASH_FUNC)" | head -40',                        description: 'List all current environment variables (sorted)', source: 'builtin' },
  { id: 'port-in-use',            name: 'What is Using a Port?',         category: 'Development',        tags: ['ss','lsof','port'],         command: 'ss -tlnp | grep "$PORT" || lsof -i :"$PORT" 2>/dev/null',                            description: 'Find which process is using a specific port', source: 'builtin' },
];

function readSkills() {
  try {
    const data = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8'));
    // Merge builtins (preserve user edits of custom skills)
    const custom = (data.custom || []);
    return { builtin: BUILTIN_SKILLS, custom };
  } catch {
    return { builtin: BUILTIN_SKILLS, custom: [] };
  }
}

function saveCustomSkills(customSkills) {
  const dir = path.dirname(SKILLS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SKILLS_FILE, JSON.stringify({ custom: customSkills }, null, 2), 'utf8');
}

// ── App window ────────────────────────────────────────────────────────────────
let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 760,
    minWidth: 700, minHeight: 500,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    title: 'RobOS Skills Manager',
    autoHideMenuBar: true,
  });
  mainWindow.loadFile('renderer/index.html');
  if (_debugServer) {
    _debugServer.registerSnapshotIPC && _debugServer.registerSnapshotIPC(mainWindow);
    _debugServer.startDebugServer(mainWindow, 19139, 'skills-manager');
  }
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('skills-list', () => {
  const { builtin, custom } = readSkills();
  return { ok: true, builtin, custom };
});

ipcMain.handle('skills-save-custom', (_, customSkills) => {
  try {
    saveCustomSkills(customSkills);
    log.info('skills-saved', 'Saved custom skills', { count: customSkills.length });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-export', (_, skills) => {
  try {
    const dir = path.join(os.homedir(), '.config', 'robos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'skills-export.json');
    fs.writeFileSync(outPath, JSON.stringify(skills, null, 2), 'utf8');
    log.info('skills-exported', 'Exported skills', { path: outPath, count: skills.length });
    shell.openPath(dir);
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-open-ai-prompt', () => {
  try {
    const { spawn } = require('child_process');
    const appBase = '/usr/local/share/robos/ai-prompt';
    const electronBin = path.join(appBase, 'node_modules/electron/dist/electron');
    spawn(electronBin, [appBase, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      { detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Skill Packs ───────────────────────────────────────────────────────────────

const SKILL_PACKS_DIR = path.join(os.homedir(), '.config', 'robos', 'skill-packs');

const FEATURED_PACKS = [
  {
    id: 'danielmiessler/fabric',
    name: 'Fabric Patterns',
    owner: 'danielmiessler',
    repo: 'fabric',
    description: 'The definitive AI augmentation framework — 255 battle-tested patterns for analysis, writing, summarization, security, coding, and more. Used by thousands of developers worldwide.',
    stars: '57k+',
    patternCount: 255,
    patternsPath: 'data/patterns',
    branch: 'main',
    cloneUrl: 'https://github.com/danielmiessler/fabric.git',
    localPath: path.join(SKILL_PACKS_DIR, 'fabric'),
    badgeColor: '#7c3aed',
    tags: ['AI', 'Patterns', 'Analysis', 'Writing', 'Security'],
  },
];

function deriveFabricCategory(name) {
  if (/^analyze_|^ai$/.test(name))                                  return 'Analyze';
  if (/^write_|essay/.test(name))                                   return 'Write';
  if (/^create_|^draft/.test(name))                                 return 'Create';
  if (/^summarize|^extract|^youtube/.test(name))                    return 'Summarize';
  if (/^explain|^label|^answer/.test(name))                         return 'Explain';
  if (/^improve|^enhance|^refine|^clean/.test(name))                return 'Improve';
  if (/^find_|^get_|^rate_|^compare/.test(name))                    return 'Research';
  if (/^check_|^identify|^review/.test(name))                       return 'Review';
  if (/^convert|^translate|^transform/.test(name))                  return 'Transform';
  if (/^recommend|^suggest/.test(name))                             return 'Advise';
  if (/^generate|^make_/.test(name))                                return 'Generate';
  if (/^security|^agility|^coding|^tweet|^official|^pattern/.test(name)) return 'Productivity';
  return 'General';
}

function patternToLabel(name) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'RobOS-Skills-Manager/1.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
  });
}

ipcMain.handle('skills-packs-list', () => {
  return {
    ok: true,
    packs: FEATURED_PACKS.map(p => ({
      ...p,
      isCloned: fs.existsSync(p.localPath),
    })),
  };
});

ipcMain.handle('skills-packs-browse', async (_, packId) => {
  const pack = FEATURED_PACKS.find(p => p.id === packId);
  if (!pack) return { ok: false, error: 'Unknown pack' };

  const localPatternsPath = path.join(pack.localPath, pack.patternsPath);
  const isCloned = fs.existsSync(localPatternsPath);

  if (isCloned) {
    try {
      const dirs = fs.readdirSync(localPatternsPath).filter(name => {
        try { return fs.statSync(path.join(localPatternsPath, name)).isDirectory(); } catch { return false; }
      }).sort();
      const { custom } = readSkills();
      const installedIds = new Set(custom.map(s => s.id));
      const patterns = dirs.map(name => ({
        id: name,
        name: patternToLabel(name),
        category: deriveFabricCategory(name),
        localPath: path.join(localPatternsPath, name, 'system.md'),
        local: true,
        installed: installedIds.has(`fabric-${name}`),
      }));
      return { ok: true, patterns, source: 'local', count: patterns.length };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // GitHub API
  try {
    const res = await fetchUrl(
      `https://api.github.com/repos/${pack.owner}/${pack.repo}/contents/${pack.patternsPath}`
    );
    if (res.status !== 200) return { ok: false, error: `GitHub API returned ${res.status}` };
    const items = JSON.parse(res.body);
    const { custom } = readSkills();
    const installedIds = new Set(custom.map(s => s.id));
    const patterns = items
      .filter(i => i.type === 'dir')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.name,
        name: patternToLabel(i.name),
        category: deriveFabricCategory(i.name),
        rawUrl: `https://raw.githubusercontent.com/${pack.owner}/${pack.repo}/${pack.branch}/${pack.patternsPath}/${i.name}/system.md`,
        local: false,
        installed: installedIds.has(`fabric-${i.name}`),
      }));
    return { ok: true, patterns, source: 'github', count: patterns.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-packs-preview', async (_, pattern) => {
  try {
    if (pattern.local && pattern.localPath) {
      const content = fs.readFileSync(pattern.localPath, 'utf8');
      return { ok: true, content };
    }
    const res = await fetchUrl(pattern.rawUrl);
    if (res.status !== 200) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, content: res.body };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('skills-packs-clone', async (_, packId) => {
  const pack = FEATURED_PACKS.find(p => p.id === packId);
  if (!pack) return { ok: false, error: 'Unknown pack' };

  return new Promise(resolve => {
    fs.mkdirSync(SKILL_PACKS_DIR, { recursive: true });

    if (fs.existsSync(pack.localPath)) {
      execFile('git', ['-C', pack.localPath, 'pull', '--ff-only'], { timeout: 60000 }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: stderr || err.message });
        else resolve({ ok: true, action: 'updated', path: pack.localPath });
      });
    } else {
      execFile('git', ['clone', '--depth=1', pack.cloneUrl, pack.localPath], { timeout: 120000 }, (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: stderr || err.message });
        else resolve({ ok: true, action: 'cloned', path: pack.localPath });
      });
    }
  });
});

ipcMain.handle('skills-packs-import', async (_, { patterns }) => {
  try {
    const { custom } = readSkills();
    const installedIds = new Set(custom.map(s => s.id));
    let added = 0;

    for (const p of patterns) {
      const skillId = `fabric-${p.id}`;
      if (installedIds.has(skillId)) continue;

      let systemMd = p.systemMd || '';
      if (!systemMd && p.local && p.localPath) {
        try { systemMd = fs.readFileSync(p.localPath, 'utf8'); } catch {}
      }

      // First paragraph after headings = description
      let description = '';
      if (systemMd) {
        const lines = systemMd.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
        description = (lines[0] || p.name).slice(0, 150);
      }

      custom.push({
        id: skillId,
        name: p.name,
        category: `Fabric: ${p.category}`,
        description,
        command: '',
        systemPrompt: systemMd,
        tags: ['fabric', p.category.toLowerCase(), 'pattern'],
        source: 'pack',
        packId: 'danielmiessler/fabric',
      });
      installedIds.add(skillId);
      added++;
    }

    saveCustomSkills(custom);
    return { ok: true, added, total: custom.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
