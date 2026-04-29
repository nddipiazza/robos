const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path  = require('path');
const os    = require('os');
const fs    = require('fs');
const { execSync, spawn } = require('child_process');

app.setPath('userData', path.join(os.homedir(), '.config', 'robos', 'electron', 'git-login-manager'));
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

let win = null;
let loginProc = null;
let pollTimer = null;
let lastOverallOk = null;

const CHECK_INTERVAL_MS = 60_000;
const SSH_DIR  = path.join(os.homedir(), '.ssh');
const KEY_FILES = ['id_ed25519', 'id_ecdsa', 'id_rsa'];

// Debug server (optional) — checks env override, local dev path, then VM install path
var _debugServer = null;
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

app.on('second-instance', () => showWindow());

app.setName('git-login-manager');
app.whenReady().then(() => {
  createWindow();
  startPoller();
});

// ── window ────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 580, height: 700,
    minHeight: 480,
    title: 'RobOS Git Login Manager',
    backgroundColor: '#0d1117',
    show: false,
    resizable: true,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19123);
  win.on('close', () => { app.quit(); });
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.focus();
  win.moveTop();
}

// ── individual checks ─────────────────────────────────────────────────────────

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 12_000 }).trim(); }
  catch { return null; }
}

function checkGhAuth() {
  const out   = run('gh auth status 2>&1') || '';
  const ok    = out.toLowerCase().includes('logged in');
  const match = out.match(/account\s+(\S+)/i) || out.match(/logged in to \S+ account (\S+)/i);
  const user  = match ? match[1] : null;
  return {
    ok,
    label: 'gh CLI authenticated',
    detail: ok ? `Logged in as ${user || 'unknown'}` : 'Not authenticated — click Login →',
    username: user,
  };
}

function checkSshKey() {
  const found = KEY_FILES.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  return {
    ok: !!found,
    label: 'SSH key exists',
    detail: found ? `~/.ssh/${found}` : `No key found (${KEY_FILES.join(', ')})`,
    keyFile: found || null,
  };
}

function checkSshConnection() {
  if (!checkSshKey().ok) {
    return { ok: false, label: 'SSH → github.com', detail: 'No key — generate one first', skipped: true };
  }
  // GitHub SSH always exits with code 1 even on success, so we can't use run().
  // Capture both stdout+stderr from the error object instead.
  try {
    execSync('ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=8 -T git@github.com', { timeout: 12_000 });
    return { ok: true, label: 'SSH → github.com', detail: 'Connected ✓' };
  } catch (e) {
    const out = [e.stderr, e.stdout].map(b => b ? b.toString() : '').join('').trim();
    const ok  = out.includes('successfully authenticated');
    return { ok, label: 'SSH → github.com', detail: ok ? 'Connected ✓' : (out || 'Connection failed — key not on GitHub?') };
  }
}

function checkGitConfig() {
  let name  = run('git config --global user.name');
  let email = run('git config --global user.email');

  // Auto-fill from GitHub profile if git identity is missing and gh is authenticated
  if ((!name || !email)) {
    try {
      const profile = run('gh api user --jq ".login, .name, .id, .email" 2>/dev/null');
      if (profile) {
        const [login, ghName, ghId, ghEmail] = profile.split('\n');
        if (!name && ghName) {
          try { execSync(`git config --global user.name ${JSON.stringify(ghName)}`, { timeout: 5000 }); name = ghName; } catch {}
        }
        if (!email) {
          const resolvedEmail = ghEmail || `${ghId}+${login}@users.noreply.github.com`;
          try { execSync(`git config --global user.email ${JSON.stringify(resolvedEmail)}`, { timeout: 5000 }); email = resolvedEmail; } catch {}
        }
      }
    } catch {}
  }

  const ok    = !!(name && email);
  const missing = [!name && 'user.name', !email && 'user.email'].filter(Boolean).join(', ');

  // Always ensure HTTPS GitHub URLs are rewritten to SSH so clones work without prompts
  const insteadOf = run("git config --global url.'git@github.com:'.insteadOf");
  if (!insteadOf) {
    try { execSync("git config --global url.'git@github.com:'.insteadOf 'https://github.com/'", { timeout: 5000 }); } catch {}
  }

  return {
    ok, label: 'git identity configured',
    detail: ok ? `${name} <${email}>` : `Missing: ${missing}`,
    name: name || '', email: email || '',
  };
}

function runAllChecks() {
  const ghAuth  = checkGhAuth();
  const sshKey  = checkSshKey();
  const sshConn = checkSshConnection();
  const gitCfg  = checkGitConfig();
  const overallOk = ghAuth.ok && sshKey.ok && sshConn.ok && gitCfg.ok;
  return { overallOk, checks: { ghAuth, sshKey, sshConn, gitCfg } };
}

// ── repo cache ───────────────────────────────────────────────────────────────

const REPO_CACHE_FILE = path.join(os.homedir(), '.config', 'robos', 'gh-repos-cache.json');

function fetchAndCacheRepos() {
  // Run in background — don't block startup
  setImmediate(() => {
    try {
      const JSON_FIELDS = 'nameWithOwner,url,description,isPrivate,isFork';
      const seen = new Set();
      const repos = [];

      function collect(args) {
        const r = require('child_process').spawnSync(
          'gh', [...args, '--json', JSON_FIELDS],
          { encoding: 'utf8', timeout: 30000, env: { ...process.env } }
        );
        if (r.status !== 0) return;
        try {
          JSON.parse(r.stdout || '[]').forEach(repo => {
            if (!seen.has(repo.nameWithOwner)) {
              seen.add(repo.nameWithOwner);
              repos.push(repo);
            }
          });
        } catch {}
      }

      collect(['repo', 'list', '--limit', '200']);
      collect(['repo', 'list', '--limit', '200', '--fork']);

      const orgR = require('child_process').spawnSync(
        'gh', ['org', 'list', '--limit', '100'],
        { encoding: 'utf8', timeout: 15000, env: { ...process.env } }
      );
      const orgs = (orgR.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
      for (const org of orgs) {
        collect(['repo', 'list', org, '--limit', '200']);
        collect(['repo', 'list', org, '--limit', '200', '--fork']);
      }

      if (repos.length) {
        fs.mkdirSync(path.dirname(REPO_CACHE_FILE), { recursive: true });
        fs.writeFileSync(REPO_CACHE_FILE, JSON.stringify({ repos, fetchedAt: Date.now() }), 'utf8');
      }
    } catch { /* non-fatal */ }
  });
}

// ── poller ────────────────────────────────────────────────────────────────────

function poll() {
  const result = runAllChecks();
  if (win && !win.isDestroyed()) win.webContents.send('check-results', result);
  // Pop window on first detection of any failure
  if (!result.overallOk && lastOverallOk !== false) showWindow();
  lastOverallOk = result.overallOk;
  // Refresh repo cache whenever credentials are healthy
  if (result.overallOk) fetchAndCacheRepos();
  return result;
}

function startPoller() {
  poll();
  pollTimer = setInterval(poll, CHECK_INTERVAL_MS);
}

// ── IPC ────────────────────────────────────────────────────────────────────────────────

ipcMain.handle("get-results",  () => runAllChecks());
ipcMain.handle("force-check",  () => poll());
ipcMain.handle("hide-window",  () => { if (win && !win.isDestroyed()) win.hide(); return { ok: true }; });
ipcMain.handle("open-url",     (_, url) => { shell.openExternal(url); return { ok: true }; });

ipcMain.handle("set-git-config", (_, { name, email }) => {
  try {
    if (name)  execSync("git config --global user.name " + JSON.stringify(name),  { timeout: 5000 });
    if (email) execSync("git config --global user.email " + JSON.stringify(email), { timeout: 5000 });
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("generate-ssh-key", (_, { keyType, comment, passphrase }) => {
  const types = {
    ed25519: { file: "id_ed25519", args: ["-t", "ed25519"] },
    rsa4096: { file: "id_rsa",     args: ["-t", "rsa", "-b", "4096"] },
  };
  const cfg      = types[keyType] || types.ed25519;
  const privPath = path.join(SSH_DIR, cfg.file);
  const pubPath  = privPath + ".pub";
  if (fs.existsSync(privPath)) return { error: "Key already exists at " + privPath };
  try {
    fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    const cmt = comment || ("robos@" + os.hostname());
    const pp  = passphrase || "";
    const cmd = "ssh-keygen " + cfg.args.join(" ") + " -C " + JSON.stringify(cmt) + " -f " + JSON.stringify(privPath) + " -N " + JSON.stringify(pp) + " -q";
    execSync(cmd, { timeout: 30000 });
    fs.chmodSync(privPath, 0o600);
    const pubKey      = fs.readFileSync(pubPath, "utf8").trim();
    const fingerprint = run("ssh-keygen -lf " + JSON.stringify(pubPath)) || "";
    return { ok: true, privPath, pubPath, pubKey, fingerprint };
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle("add-ssh-key-to-github", (_, { pubPath, title }) => {
  const keyTitle = title || ("RobOS " + os.hostname() + " " + new Date().toISOString().slice(0, 10));
  try {
    execSync("gh ssh-key add " + JSON.stringify(pubPath) + " --title " + JSON.stringify(keyTitle),
      { encoding: 'utf8', timeout: 15_000 });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString();
    const needsScope = msg.includes('admin:public_key');
    return { error: needsScope
      ? 'gh token missing admin:public_key scope — click "Re-auth gh" to fix'
      : msg.trim() || 'Unknown error', needsScope };
  }
});

ipcMain.handle("get-pubkey", () => {
  const found = KEY_FILES.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  if (!found) return { error: "No key found" };
  const pubPath = path.join(SSH_DIR, found + ".pub");
  if (!fs.existsSync(pubPath)) return { error: "No public key file" };
  return { ok: true, pubKey: fs.readFileSync(pubPath, "utf8").trim(), pubPath, keyFile: found };
});

ipcMain.handle("refresh-gh-scope", () => {
  if (loginProc) return { error: 'Login already in progress.' };
  loginProc = spawn('gh', ['auth', 'refresh', '-h', 'github.com', '-s', 'admin:public_key'], {
    env: { ...process.env, GH_PROMPT_DISABLED: '0' },
  });
  loginProc.stdout.on('data', d => { if (win && !win.isDestroyed()) win.webContents.send('login-output', d.toString()); });
  loginProc.stderr.on('data', d => { if (win && !win.isDestroyed()) win.webContents.send('login-output', d.toString()); });
  loginProc.on('close', code => {
    loginProc = null;
    if (win && !win.isDestroyed()) win.webContents.send('login-done', { code, ok: code === 0 });
  });
  return { ok: true };
});


ipcMain.handle("start-gh-login", () => {
  if (loginProc) {
    try { process.kill(loginProc.pid, 0); return { error: "Login already in progress." }; } catch {}
  }
  loginProc = spawn("gh", ["auth", "login", "--web", "--hostname", "github.com", "--scopes", "admin:public_key"], {
    env: { ...process.env, GH_PROMPT_DISABLED: "0" },
  });
  loginProc.stdout.on("data", d => { if (win && !win.isDestroyed()) win.webContents.send("login-output", d.toString()); });
  loginProc.stderr.on("data", d => { if (win && !win.isDestroyed()) win.webContents.send("login-output", d.toString()); });
  loginProc.on("close", code => {
    loginProc = null;
    const result = poll();
    if (win && !win.isDestroyed()) win.webContents.send("login-done", { code, ok: result && result.overallOk });
  });
  return { ok: true };
});

ipcMain.handle("cancel-login", () => {
  if (loginProc) { try { process.kill(loginProc.pid, 15); } catch {} loginProc = null; }
  return { ok: true };
});
