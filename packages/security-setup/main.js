const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec, execSync, execFileSync } = require('child_process');

const GNUPG_DIR  = path.join(process.env.HOME, '.gnupg');
const AGENT_CONF = path.join(GNUPG_DIR, 'gpg-agent.conf');
const PASS_STORE = path.join(process.env.HOME, '.password-store');
const SSH_DIR    = path.join(os.homedir(), '.ssh');

// ── Debug server (optional) ──────────────────────────────────────────────────
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

// ── Window ───────────────────────────────────────────────────────────────────
let win;
app.setName('security-setup');
app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 640, height: 680,
    title: 'RobOS Security Setup',
    backgroundColor: '#0d1117',
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.setMenuBarVisibility(false);
  if (_debugServer) _debugServer.startDebugServer(win, 19114);
});
app.on('window-all-closed', () => app.quit());

// ── Helpers ───────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 30000, env: { ...process.env, DISPLAY: ':0' }, ...opts },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout.trim());
      });
  });
}

function configureGpgAgent() {
  fs.mkdirSync(GNUPG_DIR, { recursive: true, mode: 0o700 });
  let pinentry = '/usr/bin/pinentry-gtk-2';
  for (const p of ['/usr/bin/pinentry-gtk-2', '/usr/bin/pinentry-qt', '/usr/bin/pinentry-gnome3', '/usr/bin/pinentry']) {
    if (fs.existsSync(p)) { pinentry = p; break; }
  }
  const conf = [
    `pinentry-program ${pinentry}`,
    'default-cache-ttl 86400',
    'max-cache-ttl 86400',
    'allow-preset-passphrase',
  ].join('\n') + '\n';
  fs.writeFileSync(AGENT_CONF, conf, { mode: 0o600 });
  try { execSync('gpgconf --reload gpg-agent 2>/dev/null', { timeout: 3000 }); } catch {}
}

// ── IPC: status ───────────────────────────────────────────────────────────────
ipcMain.handle('get-security-status', async () => {
  let gpgKeys = [];
  try {
    const out = execSync('gpg --list-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    const uids = out.split('\n').filter(l => l.startsWith('uid:'));
    gpgKeys = uids.map(l => {
      const parts = l.split(':');
      return parts[9] || parts[7] || '';
    }).filter(Boolean);
  } catch {}

  const passReady = fs.existsSync(path.join(PASS_STORE, '.gpg-id'));

  let pinentryConfigured = false;
  try {
    const conf = fs.readFileSync(AGENT_CONF, 'utf8');
    pinentryConfigured = conf.includes('pinentry-program');
  } catch {}

  // SSH key check
  const sshKeyFiles = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
  const sshKeyFound = sshKeyFiles.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  let sshPubKey = null;
  if (sshKeyFound) {
    try { sshPubKey = fs.readFileSync(path.join(SSH_DIR, sshKeyFound + '.pub'), 'utf8').trim(); } catch {}
  }

  return { gpgKeys, passReady, pinentryConfigured, sshKeyFound: sshKeyFound || null, sshPubKey };
});

// ── IPC: create GPG key ───────────────────────────────────────────────────────
ipcMain.handle('create-gpg-key', async (_, { name, email, passphrase }) => {
  const batch = `
%echo Generating RobOS GPG key
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: ${name}
Name-Email: ${email}
Expire-Date: 0
Passphrase: ${passphrase}
%commit
%echo done
`.trim();

  const batchFile = path.join(process.env.HOME, '.config', 'robos', '_gpg_batch.tmp');
  fs.mkdirSync(path.dirname(batchFile), { recursive: true });
  fs.writeFileSync(batchFile, batch, { mode: 0o600 });

  try {
    await run(`gpg --batch --gen-key "${batchFile}"`);
    fs.unlinkSync(batchFile);
    return { ok: true };
  } catch (e) {
    try { fs.unlinkSync(batchFile); } catch {}
    return { ok: false, error: e.message };
  }
});

// ── IPC: init pass ────────────────────────────────────────────────────────────
ipcMain.handle('init-pass', async (_, { gpgId }) => {
  try {
    await run(`pass init "${gpgId}"`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: generate SSH key ─────────────────────────────────────────────────────
ipcMain.handle('generate-ssh-key', async (_, { comment, passphrase }) => {
  const privPath = path.join(SSH_DIR, 'id_ed25519');
  const pubPath  = privPath + '.pub';
  if (fs.existsSync(privPath)) return { ok: false, error: 'SSH key already exists at ' + privPath };
  try {
    fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    const cmt = comment || ('robos@' + os.hostname());
    const pp  = passphrase || '';
    const cmd = `ssh-keygen -t ed25519 -C ${JSON.stringify(cmt)} -f ${JSON.stringify(privPath)} -N ${JSON.stringify(pp)} -q`;
    execSync(cmd, { timeout: 30000 });
    fs.chmodSync(privPath, 0o600);
    const pubKey = fs.readFileSync(pubPath, 'utf8').trim();
    return { ok: true, pubKey, privPath, pubPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: add SSH key to GitHub ────────────────────────────────────────────────
ipcMain.handle('add-ssh-key-to-github', async () => {
  const sshKeyFiles = ['id_ed25519', 'id_ecdsa', 'id_rsa'];
  const found = sshKeyFiles.find(f => fs.existsSync(path.join(SSH_DIR, f)));
  if (!found) return { ok: false, error: 'No SSH key found' };
  const pubPath = path.join(SSH_DIR, found + '.pub');
  if (!fs.existsSync(pubPath)) return { ok: false, error: 'No public key file' };
  const title = 'RobOS ' + os.hostname() + ' ' + new Date().toISOString().slice(0, 10);
  try {
    execSync(`gh ssh-key add ${JSON.stringify(pubPath)} --title ${JSON.stringify(title)}`,
      { encoding: 'utf8', timeout: 15000 });
    return { ok: true };
  } catch (e) {
    const msg = (e.stderr || e.stdout || e.message || '').toString();
    if (msg.includes('already in use')) return { ok: true, alreadyAdded: true };
    const needsScope = msg.includes('admin:public_key');
    return { ok: false, needsScope, error: needsScope
      ? 'Your gh token is missing the admin:public_key scope. Click "Re-auth gh" to fix.'
      : msg.trim() || 'Upload failed' };
  }
});

// ── IPC: refresh gh auth scope ────────────────────────────────────────────────
ipcMain.handle('refresh-gh-scope', async () => {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const proc = spawn('gh', ['auth', 'refresh', '-h', 'github.com', '-s', 'admin:public_key'], {
      env: { ...process.env, GH_PROMPT_DISABLED: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', d => {
      output += d.toString();
      if (win && !win.isDestroyed()) win.webContents.send('gh-refresh-output', d.toString());
    });
    proc.stderr.on('data', d => {
      output += d.toString();
      if (win && !win.isDestroyed()) win.webContents.send('gh-refresh-output', d.toString());
    });
    proc.on('close', code => {
      resolve({ ok: code === 0, output });
    });
  });
});

// ── IPC: reset everything ─────────────────────────────────────────────────────
ipcMain.handle('reset-all', async () => {
  try {
    const gpgIdFile = path.join(PASS_STORE, '.gpg-id');
    if (fs.existsSync(gpgIdFile)) {
      const gpgId = fs.readFileSync(gpgIdFile, 'utf8').trim();
      if (gpgId) {
        try { execSync(`gpg --batch --yes --delete-secret-and-public-key "${gpgId}" 2>/dev/null`); } catch {}
      }
    }
    if (fs.existsSync(PASS_STORE)) {
      execSync(`rm -rf "${PASS_STORE}"`);
    }
    try { execSync('gpgconf --kill gpg-agent 2>/dev/null'); } catch {}
    try { fs.unlinkSync(AGENT_CONF); } catch {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('configure-pinentry', async () => {
  try {
    configureGpgAgent();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: list GPG key IDs ─────────────────────────────────────────────────────
ipcMain.handle('list-gpg-keys', async () => {
  try {
    const out = execSync('gpg --list-keys --with-colons 2>/dev/null', { encoding: 'utf8' });
    const keys = [];
    let curFpr = '';
    for (const line of out.split('\n')) {
      const parts = line.split(':');
      if (parts[0] === 'fpr') curFpr = parts[9];
      if (parts[0] === 'uid') {
        keys.push({ id: curFpr, label: parts[9] || curFpr });
      }
    }
    return keys;
  } catch { return []; }
});
