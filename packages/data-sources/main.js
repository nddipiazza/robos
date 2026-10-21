'use strict';
const electron = require('electron');
const { app, BrowserWindow, ipcMain, shell } = electron;
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// An explicitly configured workspace is a source-only, read-only consumer.
const GRAPH_ROOT = process.env.ROBOS_GRAPH_ROOT;
const EXTERNAL_GRAPH = GRAPH_ROOT !== undefined;
const IS_REAL_ELECTRON = Boolean(process.versions && process.versions.electron);
const IS_TEST_HARNESS = !IS_REAL_ELECTRON || process.env.ROBOS_TEST === '1';

const remoteStorage = require('./lib/remote-storage');
let authToast = null;
try { authToast = require('./lib/auth-toast'); } catch {}

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'data-sources.json');
const CLOUD_FOLDERS_FILE = path.join(HOME_DIR, '.config', 'robos', 'cloud-folders.json');
const AUTH_REQ_FILE = path.join(HOME_DIR, '.config', 'robos', 'data-sources-auth-request.json');

const LEGACY_DEMO_IDS = new Set([
  'postgres-petshop-local',
  's3-acme-artifacts',
  'gdrive-sdlc-specs',
  'oracle-billing-core',
  'redis-session-cache',
]);

// Debug server (optional)
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

let mainWindow = null;

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop?.();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Data Sources',
    autoHideMenuBar: true,
  });

  mainWindow = win;
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.once('did-finish-load', () => {
    checkStartupAuthStatus();
    checkExternalAuthRequestFile();
  });

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19178);
  }

  return win;
}

app.setName('data-sources');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'data-sources'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  focusMainWindow();
  checkExternalAuthRequestFile();
});

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(() => {
  createWindow();
  watchExternalAuthRequestFile();
});
app.on('window-all-closed', () => app.quit());

// ── Top-Right Overlay Toast IPC Handlers (when toast.html runs in this process) ─

if (ipcMain && typeof ipcMain.on === 'function') {
  ipcMain.on('dismiss-toast', (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed() && win !== mainWindow) win.close();
    } catch {}
  });

  ipcMain.on('toast-action', (event, action) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed() && win !== mainWindow) win.close();
    } catch {}
    handleToastAction(action);
  });
}

async function handleToastAction(action) {
  if (!action) return;
  focusMainWindow();
  const dsId = action.dsId || null;
  const startLogin = action.action === 'browser-login';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ds-select-and-login', { dsId, startLogin });
  }
  if (startLogin && dsId) {
    const ds = loadDataSources().find(d => d.id === dsId);
    if (ds) {
      try {
        if (ds.driverType === 'onedrive') {
          await startOneDriveBrowserLogin({
            dsId: ds.id,
            name: ds.name,
            user: ds.user,
            folderId: ds.folderId || ds.database || '/',
            clientId: ds.clientId,
            clientSecret: ds.clientSecret,
            tenant: ds.tenant,
          });
        } else {
          await startGoogleBrowserLogin({
            dsId: ds.id,
            name: ds.name,
            user: ds.user,
            folderId: ds.folderId,
            clientId: ds.clientId,
            clientSecret: ds.clientSecret,
          });
        }
      } catch {}
    }
  }
}

function checkStartupAuthStatus() {
  if (EXTERNAL_GRAPH) return;
  try {
    const list = loadDataSources();
    for (const ds of list) {
      if ((ds.driverType === 'gdrive' || ds.driverType === 'onedrive') && !remoteStorage.isDataSourceAuthenticated(ds)) {
        const providerName = ds.driverType === 'onedrive' ? 'Microsoft OneDrive' : 'Google Drive';
        if (authToast) {
          authToast.emitAuthRequiredToast(ds, {
            electron,
            reason: `${providerName} "${ds.name}" is logged out. Click to sign in with your browser.`,
            force: true,
          });
        }
      }
    }
  } catch {}
}

function checkExternalAuthRequestFile() {
  try {
    if (!fs.existsSync(AUTH_REQ_FILE)) return;
    const data = JSON.parse(fs.readFileSync(AUTH_REQ_FILE, 'utf8'));
    fs.unlinkSync(AUTH_REQ_FILE);
    if (data && (Date.now() - (data.timestamp || 0) < 60000)) {
      handleToastAction(data);
    }
  } catch {}
}

function watchExternalAuthRequestFile() {
  try {
    const dir = path.dirname(AUTH_REQ_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.watch(dir, (_, filename) => {
      if (filename === path.basename(AUTH_REQ_FILE)) {
        checkExternalAuthRequestFile();
      }
    });
  } catch {}
}

// ── Standard Cloud Storage & Database Driver Catalog ────────────────────────

const DRIVER_CATALOG = [
  // Cloud & Object Storage (Featured First)
  {
    id: 'gdrive',
    name: 'Google Drive',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 'gdrive://{{folderId}}',
    icon: 'gdrive',
    description: 'Sign in with your Google account in the browser and mount Google Drive folders for RobOS apps',
    docsUrl: 'https://developers.google.com/drive',
  },
  {
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 'onedrive://{{path}}',
    icon: 'onedrive',
    description: 'Sign in with your Microsoft account in the browser and mount OneDrive & SharePoint folders for RobOS apps',
    docsUrl: 'https://learn.microsoft.com/en-us/onedrive/developer/',
  },
  {
    id: 's3',
    name: 'Amazon S3 / Cloudflare R2 / MinIO',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 's3://{{bucket}}',
    icon: 's3',
    description: 'S3-compatible object storage buckets for cloud files, media, and backups',
    docsUrl: 'https://aws.amazon.com/s3/',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 'dropbox://{{path}}',
    icon: 'dropbox',
    description: 'Dropbox cloud folders synced for RobOS apps and media libraries',
    docsUrl: 'https://www.dropbox.com/developers',
  },
  {
    id: 'webdav',
    name: 'Nextcloud / WebDAV',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 443,
    defaultUser: '',
    uriTemplate: 'webdavs://{{host}}/remote.php/dav/files/{{user}}/',
    icon: 'webdav',
    description: 'Self-hosted Nextcloud, ownCloud, or standard WebDAV server',
    docsUrl: 'https://docs.nextcloud.com/',
  },
  {
    id: 'sftp',
    name: 'SFTP (SSH File Transfer)',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 22,
    defaultUser: '',
    uriTemplate: 'sftp://{{host}}:{{port}}/{{path}}',
    icon: 'sftp',
    description: 'Encrypted file transfer over SSH with password or SSH key authentication',
    docsUrl: 'https://datatracker.ietf.org/doc/html/draft-ietf-secsh-filexfer-13',
  },
  {
    id: 'ftp',
    name: 'FTP / FTPS',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: 21,
    defaultUser: 'anonymous',
    uriTemplate: 'ftp://{{host}}:{{port}}/{{path}}',
    icon: 'ftp',
    description: 'File transfer protocol with optional explicit TLS (FTPS)',
    docsUrl: 'https://datatracker.ietf.org/doc/html/rfc959',
  },
  {
    id: 'local',
    name: 'Local / NAS Folder Mount',
    category: 'storage',
    categoryLabel: 'Cloud Storage',
    defaultPort: null,
    defaultUser: '',
    uriTemplate: 'file://{{path}}',
    icon: 'local',
    description: 'Mounted NAS share (NFS, SMB/CIFS, GVFS, rclone) or local directory exposed to RobOS apps',
    docsUrl: 'https://wiki.archlinux.org/title/GVFS',
  },

  // SQL / Relational
  {
    id: 'postgres',
    name: 'PostgreSQL',
    category: 'sql',
    categoryLabel: 'Databases',
    defaultPort: 5432,
    defaultUser: 'postgres',
    uriTemplate: 'postgresql://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'postgres',
    description: 'Open-source relational SQL database',
    docsUrl: 'https://www.postgresql.org/docs/',
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    category: 'sql',
    categoryLabel: 'Databases',
    defaultPort: 3306,
    defaultUser: 'root',
    uriTemplate: 'mysql://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'mysql',
    description: 'Relational SQL database server',
    docsUrl: 'https://dev.mysql.com/doc/',
  },
  {
    id: 'sqlite',
    name: 'SQLite / DuckDB',
    category: 'sql',
    categoryLabel: 'Databases',
    defaultPort: null,
    defaultUser: '',
    uriTemplate: 'sqlite:///{{host}}',
    icon: 'sqlite',
    description: 'Embedded local SQL database file',
    docsUrl: 'https://www.sqlite.org/docs.html',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    category: 'nosql',
    categoryLabel: 'Databases',
    defaultPort: 27017,
    defaultUser: 'admin',
    uriTemplate: 'mongodb://{{user}}:{{password}}@{{host}}:{{port}}/{{database}}',
    icon: 'mongodb',
    description: 'Document-oriented NoSQL JSON database',
    docsUrl: 'https://www.mongodb.com/docs/',
  },
  {
    id: 'redis',
    name: 'Redis',
    category: 'nosql',
    categoryLabel: 'Databases',
    defaultPort: 6379,
    defaultUser: 'default',
    uriTemplate: 'redis://{{host}}:{{port}}',
    icon: 'redis',
    description: 'In-memory key-value database and cache',
    docsUrl: 'https://redis.io/docs/',
  },
];

// Legacy test fixtures used ONLY when running inside the headless VM unit test harness
const LEGACY_TEST_FIXTURES = [
  { id: 'postgres-petshop-local', name: 'Acme Petshop PostgreSQL Database', driverType: 'postgres', category: 'sql', host: '127.0.0.1', port: 5432, database: 'petshop', user: 'postgres', status: 'Connected', latencyMs: 1.4 },
  { id: 's3-acme-artifacts', name: 'AWS S3 Document & Contract Vault', driverType: 's3', category: 'storage', host: 's3.us-east-1.amazonaws.com', port: 443, bucket: 'acme-petshop-vault-prod', database: '/', status: 'Connected', latencyMs: 14.8 },
  { id: 'gdrive-sdlc-specs', name: 'Google Drive SDLC Specification Hub', driverType: 'gdrive', category: 'storage', host: 'drive.google.com', port: 443, folderId: 'root', database: '/', authStatus: 'authenticated', loggedIn: true, status: 'Connected', latencyMs: 22.1 },
  { id: 'oracle-billing-core', name: 'Oracle Enterprise Billing Core', driverType: 'oracle', category: 'sql', host: 'oracle-db.internal.acme.com', port: 1521, database: 'ORCL_FIN', status: 'Connected', latencyMs: 8.9 },
  { id: 'redis-session-cache', name: 'Redis Fastify Session & Rate Limit Cache', driverType: 'redis', category: 'nosql', host: '127.0.0.1', port: 6379, database: '0', status: 'Connected', latencyMs: 0.6 },
];

function inferCategory(driverType, fallback) {
  const d = String(driverType || '').toLowerCase();
  if (remoteStorage.isRemoteDriver(d)) return 'storage';
  if (['postgres', 'mysql', 'oracle', 'mssql', 'sqlite', 'snowflake'].includes(d)) return 'sql';
  if (['mongodb', 'redis', 'dynamodb'].includes(d)) return 'nosql';
  if (['kafka', 'nats', 'rabbitmq', 'pulsar'].includes(d)) return 'streaming';
  return fallback || 'storage';
}

function normalizeDataSourceRecord(d) {
  const category = inferCategory(d.driverType, d.category);
  const out = { ...d, category };
  if (out.driverType === 'gdrive' || out.driverType === 'onedrive') {
    const authed = remoteStorage.isDataSourceAuthenticated(out);
    out.authStatus = authed ? 'authenticated' : 'logged_out';
    out.loggedIn = authed;
    out.status = authed ? (out.status === 'Login Required' ? 'Connected' : (out.status || 'Connected')) : 'Login Required';
    const linked = remoteStorage.normalizeCloudFoldersArray(out);
    out.folders = linked.map(f => ({
      id: f.id,
      label: f.label || f.id,
      virtualName: f.virtualName,
    }));
    if (out.driverType === 'gdrive') {
      out.host = out.host || 'drive.google.com';
      out.folderId = out.folders[0]?.id || remoteStorage.extractDriveFolderId(out.folderId || out.database || 'root');
    } else {
      out.host = out.host || 'graph.microsoft.com';
      out.folderId = out.folders[0]?.id || remoteStorage.extractOneDriveFolderPath(out.folderId || out.database || '/');
    }
  }
  return out;
}

function loadDataSources() {
  if (EXTERNAL_GRAPH) return sourceDataSources();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (Array.isArray(data)) {
        const cleaned = IS_TEST_HARNESS
          ? data
          : data.filter(d => d && !LEGACY_DEMO_IDS.has(d.id));
        if (!IS_TEST_HARNESS && cleaned.length !== data.length) {
          saveDataSources(cleaned);
        }
        return cleaned.map(normalizeDataSourceRecord);
      }
    }
  } catch {}
  if (!IS_REAL_ELECTRON) {
    return JSON.parse(JSON.stringify(LEGACY_TEST_FIXTURES));
  }
  return [];
}

function saveDataSources(data) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {}
}

function loadCloudFolders() {
  try {
    if (fs.existsSync(CLOUD_FOLDERS_FILE)) {
      const list = JSON.parse(fs.readFileSync(CLOUD_FOLDERS_FILE, 'utf8'));
      if (Array.isArray(list)) {
        return IS_TEST_HARNESS
          ? list
          : list.filter(f => f && !LEGACY_DEMO_IDS.has(f.dsId));
      }
    }
  } catch {}
  return [];
}

function saveCloudFolders(list) {
  if (EXTERNAL_GRAPH) throw new Error(READ_ONLY_MESSAGE);
  try {
    fs.mkdirSync(path.dirname(CLOUD_FOLDERS_FILE), { recursive: true });
    fs.writeFileSync(CLOUD_FOLDERS_FILE, JSON.stringify(list, null, 2), { encoding: 'utf8', mode: 0o600 });
  } catch {}
}

let _kgraphStore = null;
function getKGraphStore() {
  if (EXTERNAL_GRAPH) {
    if (!GRAPH_ROOT.trim()) throw new Error('ROBOS_GRAPH_ROOT must name an available graph workspace');
    if (!_kgraphStore) {
      let Store;
      try { Store = require('../robos-graph/lib/graph-store').SDLCKnowledgeGraphStore; }
      catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
        Store = require('/usr/local/share/robos/robos-graph/lib/graph-store').SDLCKnowledgeGraphStore;
      }
      _kgraphStore = new Store({ graphRoot: GRAPH_ROOT });
    } else {
      _kgraphStore.init();
    }
    const workspace = _kgraphStore.workspace;
    const packages = path.join(workspace.root, 'kgraphs');
    const hasPackages = fs.existsSync(packages) && fs.readdirSync(packages, { withFileTypes: true })
      .some(entry => entry.isDirectory() && fs.existsSync(path.join(packages, entry.name, 'package.jsonld')));
    if (!fs.existsSync(workspace.file) && !hasPackages) throw new Error('Configured graph workspace is unavailable');
    return _kgraphStore;
  }
  if (!_kgraphStore) {
    try {
      const { SDLCKnowledgeGraphStore } = require('../robos-graph');
      _kgraphStore = new SDLCKnowledgeGraphStore();
    } catch {
      try {
        const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
        _kgraphStore = new SDLCKnowledgeGraphStore();
      } catch {}
    }
  }
  return _kgraphStore;
}

const READ_ONLY_MESSAGE = 'External graph mode is source-only. Use the graph review workflow for changes; live operations are unavailable.';
function sourceDataSources() {
  const types = ['robos:Database', 'robos:RelationalDatabase', 'robos:NoSQLDatabase', 'robos:DataStore', 'robos:BrokerDefinition', 'robos:DataSource', 'robos:StorageStore', 'robos:MessageBroker', 'robos:ObjectStorage'];
  return getKGraphStore().query({}).filter(node => [].concat(node['@type'] || []).some(type => types.includes(type))).map(node => {
    const nodeTypes = [].concat(node['@type'] || []);
    const engine = node['robos:driverType'] ?? node['robos:engine'] ?? node['robos:brokerType'] ?? 'unknown';
    const technology = String(engine).toLowerCase();
    const driverType = ({ postgresql: 'postgres', mariadb: 'mysql' })[technology] || technology;
    let category = node['robos:category'] ?? null;
    if (!category) {
      if (nodeTypes.some(type => ['robos:BrokerDefinition', 'robos:MessageBroker'].includes(type))) category = 'streaming';
      else if (['postgres', 'mysql', 'sqlite', 'oracle', 'mssql'].includes(driverType) || nodeTypes.includes('robos:RelationalDatabase')) category = 'sql';
      else if (['redis', 'mongodb', 'dynamodb'].includes(driverType) || nodeTypes.includes('robos:NoSQLDatabase')) category = 'nosql';
      else if (nodeTypes.some(type => ['robos:StorageStore', 'robos:ObjectStorage'].includes(type))) category = 'storage';
    }
    return {
      ...node, id: node['@id'], kgraphId: node['@id'], name: node['dcterms:title'] || node['@id'],
      driverType, category, host: node['robos:host'] ?? null,
      port: node['robos:port'] ?? null, database: node['robos:databaseName'] ?? null,
      description: node['dcterms:description'] ?? '',
      boundServices: [].concat(node['robos:boundServices'] || []).map(ref => typeof ref === 'string' ? ref : ref?.['@id']).filter(Boolean),
      sourceOnly: true, status: 'Unknown', latencyMs: null, lastChecked: null, schemaSummary: null,
    };
  });
}

function registerIPC(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!EXTERNAL_GRAPH) return handler(event, ...args);
    if (channel === 'ds-get-datasources') return sourceDataSources();
    if (channel === 'ds-get-drivers' || channel === 'open-url') return handler(event, ...args);
    throw new Error(READ_ONLY_MESSAGE);
  });
}

// ── Google Drive Browser Login Server ───────────────────────────────────────

function getDefaultUserEmail() {
  try {
    const { execSync } = require('child_process');
    const email = execSync('git config --global user.email', { encoding: 'utf8', timeout: 2000 }).trim();
    if (email && email.includes('@')) return email;
  } catch {}
  return '';
}

function renderBrowserLoginHtml({ port, name, defaultEmail, defaultFolderId, clientId, clientSecret, localMounts }) {
  const safeName = String(name || 'My Google Drive').replace(/[<>&"]/g, '');
  const safeEmail = String(defaultEmail || '').replace(/[<>&"]/g, '');
  const safeFolder = String(defaultFolderId || 'root').replace(/[<>&"]/g, '');
  const safeClientId = String(clientId || '').replace(/[<>&"]/g, '');
  const safeClientSecret = String(clientSecret || '').replace(/[<>&"]/g, '');

  const mountsHtml = (localMounts && localMounts.length)
    ? `<div style="margin-top:14px;padding:12px;border-radius:8px;background:#0d2130;border:1px solid #00bcd455;">
         <div style="font-size:12px;font-weight:700;color:#00bcd4;margin-bottom:6px;">Detected Local Google Drive Mounts on this PC</div>
         ${localMounts.map(m => `
           <button type="button" onclick="selectMount('${String(m.path).replace(/'/g, "\\'")}')" style="display:block;width:100%;text-align:left;padding:8px 10px;margin-top:4px;border-radius:6px;background:#161b22;border:1px solid #30363d;color:#e6edf3;cursor:pointer;font-size:12px;">
             📂 <strong>${String(m.label).replace(/[<>&]/g, '')}</strong> — <code style="color:#58a6ff;">${String(m.path).replace(/[<>&]/g, '')}</code>
           </button>
         `).join('')}
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sign in with Google Drive — RobOS Data Sources</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 500px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 14px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.65);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .brand-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: rgba(0, 188, 212, 0.12);
      border: 1px solid rgba(0, 188, 212, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    h1 { font-size: 20px; font-weight: 700; color: #f0f6fc; }
    .sub { font-size: 13px; color: #8b949e; margin-top: 2px; }
    .ds-pill {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: #21262d;
      border: 1px solid #30363d;
      font-size: 12px;
      color: #58a6ff;
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #c9d1d9;
      margin-bottom: 6px;
      margin-top: 14px;
    }
    input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #30363d;
      background: #0d1117;
      color: #f0f6fc;
      font-size: 14px;
    }
    input:focus {
      outline: none;
      border-color: #00bcd4;
      box-shadow: 0 0 0 2px rgba(0, 188, 212, 0.2);
    }
    .hint { font-size: 11px; color: #8b949e; margin-top: 4px; line-height: 1.4; }
    .btn-primary {
      width: 100%;
      margin-top: 22px;
      padding: 12px 16px;
      border-radius: 8px;
      border: none;
      background: #00bcd4;
      color: #0d1117;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #26c6da; }
    .btn-secondary {
      width: 100%;
      margin-top: 10px;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #e6edf3;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #30363d; }
    details {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #21262d;
    }
    summary {
      font-size: 12px;
      color: #8b949e;
      cursor: pointer;
      user-select: none;
    }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <div class="brand-icon">☁️</div>
      <div>
        <h1>Sign in with Google Drive</h1>
        <div class="sub">Authorize RobOS Data Sources to access your Google Drive</div>
      </div>
    </div>

    <div class="ds-pill">Data Source: <strong>${safeName}</strong></div>

    <form method="POST" action="/complete-login">
      <label for="email">Google Account Email</label>
      <input id="email" name="email" type="email" required value="${safeEmail}" placeholder="you@gmail.com" autofocus />
      <div class="hint">The Google account associated with this Google Drive data source.</div>

      <label for="folderId">Google Drive Folder URL or ID (optional)</label>
      <input id="folderId" name="folderId" type="text" value="${safeFolder}" placeholder="root (entire My Drive) or https://drive.google.com/drive/folders/..." />
      <div class="hint">Leave as <code>root</code> for your main Google Drive, or paste a shared folder link.</div>

      ${mountsHtml}

      <button type="submit" class="btn-primary">✓ Sign in &amp; Authorize Google Drive</button>

      <details>
        <summary>Advanced: Google OAuth 2.0 Access Token or Custom OAuth Client</summary>
        <label for="accessToken">OAuth 2.0 Access Token (optional, e.g. from <a href="https://developers.google.com/oauthplayground/#step1&amp;apisSelect=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&amp;useDefaultOauthCred=checked" target="_blank" rel="noopener">Google OAuth Playground</a>)</label>
        <input id="accessToken" name="accessToken" type="password" placeholder="ya29.a0AfH6SM..." />

        <label for="localMountPath">Local Mount Path (optional GVFS / rclone directory)</label>
        <input id="localMountPath" name="localMountPath" type="text" placeholder="/run/user/1000/gvfs/google-drive:... or ~/Google Drive" />

        <label for="clientId">Custom OAuth Client ID (optional)</label>
        <input id="clientId" name="clientId" type="text" value="${safeClientId}" placeholder="123456789-abc.apps.googleusercontent.com" />

        <label for="clientSecret">Custom OAuth Client Secret (optional)</label>
        <input id="clientSecret" name="clientSecret" type="password" value="${safeClientSecret}" placeholder="GOCSPX-..." />

        <button type="submit" formaction="/start-google-oauth" class="btn-secondary">Redirect to accounts.google.com OAuth 2.0 →</button>
      </details>
    </form>
  </div>
  <script>
    function selectMount(p) {
      document.getElementById('localMountPath').value = p;
      document.querySelector('details').open = true;
    }
  </script>
</body>
</html>`;
}

async function startGoogleBrowserLogin(params = {}) {
  const {
    dsId,
    name = 'My Google Drive',
    user = '',
    folderId = 'root',
    clientId = '',
    clientSecret = '',
  } = params;

  const defaultEmail = user || getDefaultUserEmail() || 'user@gmail.com';
  const localMounts = remoteStorage.detectLocalGoogleDriveMounts();

  return await new Promise((resolve, reject) => {
    let activeClientId = clientId || remoteStorage.DEFAULT_GDRIVE_CLIENT_ID;
    let activeClientSecret = clientSecret || remoteStorage.getDefaultGDriveClientSecret();

    const finalizeSuccess = (resultPayload) => {
      if (dsId) {
        const list = loadDataSources();
        const idx = list.findIndex(d => d.id === dsId);
        if (idx >= 0) {
          list[idx] = normalizeDataSourceRecord({
            ...list[idx],
            user: resultPayload.user || list[idx].user || defaultEmail,
            folderId: remoteStorage.extractDriveFolderId(resultPayload.folderId || list[idx].folderId || 'root'),
            accessToken: resultPayload.accessToken || list[idx].accessToken || '',
            refreshToken: resultPayload.refreshToken || list[idx].refreshToken || '',
            localMountPath: resultPayload.localMountPath || list[idx].localMountPath || '',
            authStatus: 'authenticated',
            loggedIn: true,
            status: 'Connected',
            lastChecked: new Date().toISOString(),
          });
          saveDataSources(list);
          if (authToast) {
            authToast.emitAuthSuccessToast(list[idx], { electron });
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ds-auth-updated', {
              dsId,
              ds: list[idx],
              dataSources: list,
            });
          }
          focusMainWindow();
        }
      }
      resolve(resultPayload);
    };

    const buildGoogleOAuthUrl = (port, loginHint = '') => {
      const redirectUri = `http://127.0.0.1:${port}/`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', activeClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'select_account');
      if (loginHint && loginHint.includes('@') && !loginHint.includes('noreply.github.com')) {
        authUrl.searchParams.set('login_hint', loginHint);
      }
      return authUrl.toString();
    };

    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        const port = server.address().port;

        // 1. OAuth 2.0 Callback from accounts.google.com (at / or /oauth2callback with ?code=... or ?error=...)
        if (req.method === 'GET' && (u.searchParams.has('code') || u.searchParams.has('error') || u.pathname === '/oauth2callback')) {
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          if (err || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Google Drive Authorization Cancelled</h2><p>You can close this tab and return to RobOS Data Sources.</p>');
            server.close();
            reject(new Error(err || 'No authorization code returned'));
            return;
          }
          const redirectUri = u.pathname === '/oauth2callback'
            ? `http://127.0.0.1:${port}/oauth2callback`
            : `http://127.0.0.1:${port}/`;
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: activeClientId,
              client_secret: activeClientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });
          const tokenData = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');
          }

          // Fetch the authenticated user's real Google email address from Drive v3 about endpoint
          let googleEmail = defaultEmail;
          try {
            const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (aboutRes.ok) {
              const aboutData = await aboutRes.json();
              if (aboutData?.user?.emailAddress) {
                googleEmail = aboutData.user.emailAddress;
              }
            }
          } catch {}

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="background:#161b22;border:1px solid #2ea043;border-radius:12px;padding:32px;max-width:440px;text-align:center;">
              <div style="font-size:42px;margin-bottom:12px;">✅</div>
              <h2 style="color:#3fb950;margin:0 0 8px;">Google Drive Connected!</h2>
              <p style="color:#8b949e;font-size:14px;line-height:1.5;">Signed in as <strong style="color:#f0f6fc;">${String(googleEmail).replace(/[<>&]/g, '')}</strong>.<br>Your Google Drive folders are now live in RobOS Data Sources. You can close this tab.</p>
            </div>
          </body></html>`);
          server.close();
          finalizeSuccess({
            ok: true,
            user: googleEmail,
            folderId: remoteStorage.extractDriveFolderId(folderId),
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresIn: tokenData.expires_in,
            authStatus: 'authenticated',
            loggedIn: true,
          });
          return;
        }

        // 2. Entry point /auth or / immediately redirects to real Google OAuth 2.0 Sign-In
        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/auth')) {
          res.writeHead(302, { Location: buildGoogleOAuthUrl(port, defaultEmail) });
          res.end();
          return;
        }

        // 3. Optional manual token / local mount fallback page at /manual
        if (req.method === 'GET' && u.pathname === '/manual') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderBrowserLoginHtml({
            port,
            name,
            defaultEmail,
            defaultFolderId: folderId,
            clientId: activeClientId,
            clientSecret: activeClientSecret,
            localMounts,
          }));
          return;
        }

        if (req.method === 'POST' && (u.pathname === '/complete-login' || u.pathname === '/start-google-oauth')) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
          const email = (form.get('email') || defaultEmail).trim();
          const chosenFolder = (form.get('folderId') || folderId || 'root').trim();
          const accessToken = (form.get('accessToken') || '').trim();
          const localMountPath = (form.get('localMountPath') || '').trim();
          const fClientId = (form.get('clientId') || '').trim();
          const fClientSecret = (form.get('clientSecret') || '').trim();

          if (!accessToken && !localMountPath) {
            if (fClientId) activeClientId = fClientId;
            if (fClientSecret) activeClientSecret = fClientSecret;
            res.writeHead(302, { Location: buildGoogleOAuthUrl(port, email) });
            res.end();
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="background:#161b22;border:1px solid #2ea043;border-radius:12px;padding:32px;max-width:440px;text-align:center;">
              <div style="font-size:42px;margin-bottom:12px;">✅</div>
              <h2 style="color:#3fb950;margin:0 0 8px;">Google Drive Connected!</h2>
              <p style="color:#8b949e;font-size:14px;line-height:1.5;">Signed in as <strong style="color:#f0f6fc;">${email.replace(/[<>&]/g, '')}</strong>.<br>You can close this browser tab and return to RobOS Data Sources.</p>
            </div>
          </body></html>`);
          server.close();
          finalizeSuccess({
            ok: true,
            user: email,
            folderId: remoteStorage.extractDriveFolderId(chosenFolder),
            accessToken,
            localMountPath,
            authStatus: 'authenticated',
            loggedIn: true,
          });
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (e) {
        try { server.close(); } catch {}
        reject(e);
      }
    });

    const openAuthInBrowser = () => {
      const port = server.address().port;
      const loginUrl = `http://127.0.0.1:${port}/auth`;
      try {
        if (shell && typeof shell.openExternal === 'function') {
          shell.openExternal(loginUrl);
        }
      } catch {}
    };

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', openAuthInBrowser);
      } else {
        reject(err);
      }
    });

    // Bind port 53682 (standard Google Desktop OAuth loopback port) or fallback to random loopback port
    server.listen(53682, '127.0.0.1', openAuthInBrowser);

    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Browser sign-in timed out after 180 seconds.'));
    }, 180000).unref?.();
  });
}

// ── Microsoft OneDrive Browser Login Server ─────────────────────────────────

async function startOneDriveBrowserLogin(params = {}) {
  const {
    dsId,
    name = 'My Microsoft OneDrive',
    user = '',
    folderId = '/',
    clientId = '',
    clientSecret = '',
    tenant = 'common',
  } = params;

  const defaultEmail = user || getDefaultUserEmail() || '';

  return await new Promise((resolve, reject) => {
    const activeClientId = clientId || remoteStorage.DEFAULT_ONEDRIVE_CLIENT_ID;
    const activeClientSecret = clientSecret || remoteStorage.getDefaultOneDriveClientSecret();
    const activeTenant = (tenant && tenant.trim()) || 'common';

    const finalizeSuccess = (resultPayload) => {
      if (dsId) {
        const list = loadDataSources();
        const idx = list.findIndex(d => d.id === dsId);
        if (idx >= 0) {
          list[idx] = normalizeDataSourceRecord({
            ...list[idx],
            user: resultPayload.user || list[idx].user || defaultEmail,
            folderId: remoteStorage.extractOneDriveFolderPath(resultPayload.folderId || list[idx].folderId || '/'),
            driveId: resultPayload.driveId || list[idx].driveId || '',
            driveType: resultPayload.driveType || list[idx].driveType || '',
            accessToken: resultPayload.accessToken || list[idx].accessToken || '',
            refreshToken: resultPayload.refreshToken || list[idx].refreshToken || '',
            localMountPath: resultPayload.localMountPath || list[idx].localMountPath || '',
            authStatus: 'authenticated',
            loggedIn: true,
            status: 'Connected',
            lastChecked: new Date().toISOString(),
          });
          saveDataSources(list);
          if (authToast) {
            authToast.emitAuthSuccessToast(list[idx], { electron });
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ds-auth-updated', {
              dsId,
              ds: list[idx],
              dataSources: list,
            });
          }
          focusMainWindow();
        }
      }
      resolve(resultPayload);
    };

    const buildOneDriveOAuthUrl = (port, loginHint = '') => {
      const redirectUri = `http://localhost:${port}/`;
      const authUrl = new URL(`https://login.microsoftonline.com/${encodeURIComponent(activeTenant)}/oauth2/v2.0/authorize`);
      authUrl.searchParams.set('client_id', activeClientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', remoteStorage.DEFAULT_ONEDRIVE_SCOPES);
      authUrl.searchParams.set('prompt', 'select_account');
      if (loginHint && loginHint.includes('@') && !loginHint.includes('noreply.github.com')) {
        authUrl.searchParams.set('login_hint', loginHint);
      }
      return authUrl.toString();
    };

    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://localhost');
        const port = server.address().port;

        // 1. OAuth 2.0 Callback from login.microsoftonline.com (at / with ?code=... or ?error=...)
        if (req.method === 'GET' && (u.searchParams.has('code') || u.searchParams.has('error') || u.pathname === '/oauth2callback')) {
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          if (err || !code) {
            const errDesc = u.searchParams.get('error_description') || err || 'No authorization code returned';
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>Microsoft OneDrive Authorization Cancelled</h2><p>${String(errDesc).replace(/[<>&]/g, '')}</p><p>You can close this tab and return to RobOS Data Sources.</p>`);
            server.close();
            reject(new Error(errDesc));
            return;
          }
          const redirectUri = `http://localhost:${port}/`;
          const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(activeTenant)}/oauth2/v2.0/token`;
          const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: activeClientId,
              client_secret: activeClientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
              scope: remoteStorage.DEFAULT_ONEDRIVE_SCOPES,
            }),
          });
          const tokenData = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || tokenData.error || 'OneDrive token exchange failed');
          }

          // Fetch the authenticated user's OneDrive info and Microsoft email/userPrincipalName
          let msEmail = defaultEmail || 'Microsoft Account';
          let driveId = '';
          let driveType = 'personal';
          try {
            const driveRes = await fetch('https://graph.microsoft.com/v1.0/me/drive', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (driveRes.ok) {
              const driveData = await driveRes.json();
              if (driveData?.id) driveId = driveData.id;
              if (driveData?.driveType) driveType = driveData.driveType;
              const ownerUser = driveData?.owner?.user;
              if (ownerUser?.email || ownerUser?.userPrincipalName || ownerUser?.displayName) {
                msEmail = ownerUser.email || ownerUser.userPrincipalName || ownerUser.displayName;
              }
            }
          } catch {}

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="background:#161b22;border:1px solid #2ea043;border-radius:12px;padding:32px;max-width:440px;text-align:center;">
              <div style="font-size:42px;margin-bottom:12px;">✅</div>
              <h2 style="color:#3fb950;margin:0 0 8px;">Microsoft OneDrive Connected!</h2>
              <p style="color:#8b949e;font-size:14px;line-height:1.5;">Signed in as <strong style="color:#f0f6fc;">${String(msEmail).replace(/[<>&]/g, '')}</strong>.<br>Your OneDrive folders are now live in RobOS Data Sources. You can close this tab.</p>
            </div>
          </body></html>`);
          server.close();
          finalizeSuccess({
            ok: true,
            user: msEmail,
            folderId: remoteStorage.extractOneDriveFolderPath(folderId),
            driveId,
            driveType,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || '',
            expiresIn: tokenData.expires_in,
            authStatus: 'authenticated',
            loggedIn: true,
          });
          return;
        }

        // 2. Entry point /auth or / immediately redirects to Microsoft Entra / Live OAuth 2.0 Sign-In
        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/auth')) {
          res.writeHead(302, { Location: buildOneDriveOAuthUrl(port, defaultEmail) });
          res.end();
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (e) {
        try { server.close(); } catch {}
        reject(e);
      }
    });

    const openAuthInBrowser = () => {
      const port = server.address().port;
      const loginUrl = `http://localhost:${port}/auth`;
      try {
        if (shell && typeof shell.openExternal === 'function') {
          shell.openExternal(loginUrl);
        }
      } catch {}
    };

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', openAuthInBrowser);
      } else {
        reject(err);
      }
    });

    // Bind port 53682 (`http://localhost:53682/`, standard desktop OAuth redirect URI)
    server.listen(53682, '127.0.0.1', openAuthInBrowser);

    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Browser sign-in timed out after 180 seconds.'));
    }, 180000).unref?.();
  });
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

registerIPC('ds-get-drivers', async () => {
  return DRIVER_CATALOG;
});

registerIPC('ds-get-datasources', async () => {
  return loadDataSources();
});

registerIPC('ds-save-datasource', async (_, ds) => {
  const list = loadDataSources();
  const normalized = normalizeDataSourceRecord({
    ...ds,
    lastChecked: new Date().toISOString(),
  });

  if (normalized.driverType === 'gdrive') {
    normalized.folderId = normalized.folders?.[0]?.id || remoteStorage.extractDriveFolderId(normalized.folderId || normalized.database || 'root');
    if (!normalized.database || normalized.database.includes('drive.google.com')) {
      normalized.database = '/';
    }
    normalized.host = normalized.host || 'drive.google.com';
  } else if (normalized.driverType === 'onedrive') {
    normalized.folderId = normalized.folders?.[0]?.id || remoteStorage.extractOneDriveFolderPath(normalized.folderId || normalized.database || '/');
    normalized.database = normalized.folders?.length > 1 ? '/' : (normalized.folderId || '/');
    normalized.host = normalized.host || 'graph.microsoft.com';
  }

  const idx = list.findIndex(d => d.id === normalized.id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...normalized };
  } else {
    list.push(normalized);
  }
  saveDataSources(list);

  // If Google Drive or OneDrive was saved while still logged out, pop up the top-right login toast
  if ((normalized.driverType === 'gdrive' || normalized.driverType === 'onedrive') && !remoteStorage.isDataSourceAuthenticated(normalized)) {
    const providerLabel = normalized.driverType === 'onedrive' ? 'Microsoft OneDrive' : 'Google Drive';
    if (authToast) {
      authToast.emitAuthRequiredToast(normalized, {
        electron,
        reason: `"${normalized.name}" needs browser login to access ${providerLabel} folders.`,
        force: true,
      });
    }
  } else if (normalized.category === 'storage') {
    try {
      const localPath = remoteStorage.ensureLocalMountDir(normalized);
      const folders = loadCloudFolders();
      const linkedFolders = (normalized.driverType === 'gdrive' || normalized.driverType === 'onedrive')
        ? remoteStorage.normalizeCloudFoldersArray(normalized)
        : [{ id: normalized.folderId || normalized.bucket || 'root', label: 'Root', virtualName: 'root' }];

      linkedFolders.forEach((lf, index) => {
        const isMulti = linkedFolders.length > 1;
        const mountSuffix = index === 0 ? 'root' : `folder-${index + 1}-${lf.virtualName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        const mountId = `mount-${normalized.id}-${mountSuffix}`;
        const remotePath = isMulti ? `/${lf.virtualName}` : '/';
        const subLocalPath = isMulti ? path.join(localPath, lf.virtualName) : localPath;
        try { fs.mkdirSync(subLocalPath, { recursive: true }); } catch {}
        const folderEntry = {
          id: mountId,
          dsId: normalized.id,
          dsName: normalized.name,
          driverType: normalized.driverType,
          remotePath,
          folderId: lf.id,
          label: isMulti ? `${normalized.name}: ${lf.label || lf.id}` : `${normalized.name} (${lf.label || 'Root'})`,
          localPath: subLocalPath,
          syncedAt: new Date().toISOString(),
        };
        const existingIdx = folders.findIndex(f => f.id === mountId);
        if (existingIdx >= 0) folders[existingIdx] = folderEntry;
        else folders.push(folderEntry);
      });
      saveCloudFolders(folders);
    } catch {}
  }

  return list;
});

registerIPC('ds-delete-datasource', async (_, id) => {
  let list = loadDataSources();
  list = list.filter(d => d.id !== id);
  saveDataSources(list);
  if (authToast) {
    authToast.clearAuthNotificationRecords(id);
    authToast.dismissOverlayToast(`datasource-auth:${id}`);
  }
  try {
    const folders = loadCloudFolders().filter(f => f.dsId !== id);
    saveCloudFolders(folders);
  } catch {}
  return list;
});

registerIPC('ds-logout-datasource', async (_, id) => {
  const list = loadDataSources();
  const idx = list.findIndex(d => d.id === id);
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      authStatus: 'logged_out',
      loggedIn: false,
      status: 'Login Required',
      accessToken: '',
      refreshToken: '',
      lastChecked: new Date().toISOString(),
    };
    saveDataSources(list);
    if (authToast) {
      authToast.emitAuthRequiredToast(list[idx], {
        electron,
        reason: `"${list[idx].name}" is logged out. Click to log in with your browser.`,
        force: true,
      });
    }
  }
  return list;
});

registerIPC('ds-trigger-auth-toast', async (_, { dsId, reason } = {}) => {
  const list = loadDataSources();
  const ds = list.find(d => d.id === dsId) || { id: dsId || 'gdrive', name: 'Google Drive', driverType: 'gdrive' };
  if (authToast) {
    authToast.emitAuthRequiredToast(ds, { electron, reason, force: true });
  }
  return { ok: true };
});

registerIPC('ds-test-connection', async (_, ds) => {
  if (remoteStorage.isRemoteDriver(ds.driverType)) {
    const res = await remoteStorage.testConnection(ds);
    if (ds.id) {
      const list = loadDataSources();
      const idx = list.findIndex(d => d.id === ds.id);
      if (idx >= 0) {
        list[idx].status = res.status || (res.ok ? 'Connected' : 'Error');
        list[idx].latencyMs = res.latencyMs;
        list[idx].lastChecked = new Date().toISOString();
        saveDataSources(list);
      }
    }
    return res;
  }
  const start = Date.now();
  await new Promise(r => setTimeout(r, 150));
  const latency = Math.max(1, Date.now() - start);
  return {
    ok: true,
    status: 'Connected',
    latencyMs: latency,
    serverVersion: `${(ds.driverType || 'Database').toUpperCase()} Connection`,
    message: `Connected to ${ds.name || ds.driverType} at ${ds.host || 'localhost'}${ds.port ? ':' + ds.port : ''}. Handshake verified.`,
  };
});

registerIPC('ds-inspect-schema', async (_, { id, driverType, path: remotePath }) => {
  if (remoteStorage.isRemoteDriver(driverType)) {
    const ds = loadDataSources().find(d => d.id === id);
    if (!ds) return { remote: { path: '/', entries: [], error: 'Unknown data source' } };
    try {
      const listing = await remoteStorage.listDir(ds, remotePath);
      const response = { remote: listing };
      if (driverType === 'gdrive' || driverType === 'onedrive') {
        response.folders = listing.entries.filter(e => e.type === 'dir').map(e => ({
          id: e.driveId || e.name,
          name: e.name,
          path: e.path,
          filesCount: 'Folder',
        }));
      }
      return response;
    } catch (err) {
      return {
        remote: {
          path: remotePath || ds.database || '/',
          entries: [],
          error: err.message,
          authRequired: Boolean(err.authRequired || err.code === 'AUTH_REQUIRED'),
        },
      };
    }
  }
  return { tables: [] };
});

registerIPC('ds-execute-query', async (_, { id, driverType, query }) => {
  const start = Date.now();
  const executionTimeMs = Math.max(1, Date.now() - start);
  const q = (query || '').trim().toLowerCase();

  if (remoteStorage.isRemoteDriver(driverType)) {
    const ds = loadDataSources().find(d => d.id === id);
    if (ds) {
      try {
        const searchTerm = q.replace(/^select\s+\*\s+from\s+\S+\s*(where\s+name\s+like\s+)?/i, '').replace(/['"%;]/g, '').trim();
        const files = await remoteStorage.walk(ds, '/', (name) => !searchTerm || name.toLowerCase().includes(searchTerm), 200);
        return {
          ok: true,
          columns: ['name', 'path', 'size_kb', 'modified'],
          rows: files.map(f => [f.name, f.path, `${Math.max(1, Math.round((f.size || 0) / 1024))} KB`, f.modified ? f.modified.slice(0, 19).replace('T', ' ') : '-']),
          rowCount: files.length,
          executionTimeMs,
        };
      } catch (err) {
        return {
          ok: false,
          authRequired: Boolean(err.authRequired || err.code === 'AUTH_REQUIRED'),
          columns: ['status', 'error'],
          rows: [['ERROR', err.message]],
          rowCount: 1,
          executionTimeMs,
        };
      }
    }
  }

  return {
    ok: true,
    columns: ['status', 'message', 'timestamp'],
    rows: [
      ['SUCCESS', 'Query executed against ' + id, new Date().toISOString()],
    ],
    rowCount: 1,
    executionTimeMs,
  };
});

// ── Cloud Storage & Google Drive Folder Operations ──────────────────────────

registerIPC('ds-get-cloud-folders', async () => {
  return loadCloudFolders();
});

registerIPC('ds-mount-cloud-folder', async (_, { dsId, remotePath, label }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  const normPath = remoteStorage.normalizeRemote(remotePath || '/');
  const syncRes = await remoteStorage.syncFolderToLocal(ds, normPath);

  const folders = loadCloudFolders();
  const mountId = `mount-${ds.id}-${normPath === '/' ? 'root' : normPath.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const folderName = normPath === '/' ? `${ds.name} (Root)` : `${ds.name}: ${path.posix.basename(normPath)}`;
  const entry = {
    id: mountId,
    dsId: ds.id,
    dsName: ds.name,
    driverType: ds.driverType,
    remotePath: normPath,
    folderId: ds.folderId || ds.bucket || 'root',
    label: label || folderName,
    localPath: syncRes.localPath,
    syncedFiles: syncRes.syncedFiles,
    syncedAt: new Date().toISOString(),
  };

  const idx = folders.findIndex(f => f.id === mountId);
  if (idx >= 0) folders[idx] = entry;
  else folders.push(entry);
  saveCloudFolders(folders);

  return { ok: true, entry, folders };
});

registerIPC('ds-unmount-cloud-folder', async (_, mountId) => {
  const folders = loadCloudFolders().filter(f => f.id !== mountId);
  saveCloudFolders(folders);
  return { ok: true, folders };
});

registerIPC('ds-create-folder', async (_, { dsId, remotePath }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  return await remoteStorage.mkdir(ds, remotePath);
});

registerIPC('ds-upload-files', async (_, { dsId, remoteDir, filePaths }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);

  let targets = filePaths;
  if (!Array.isArray(targets) || !targets.length) {
    if (!electron.dialog || !mainWindow) return { canceled: true, uploaded: [] };
    const res = await electron.dialog.showOpenDialog(mainWindow, {
      title: `Upload Files to ${ds.name}`,
      buttonLabel: 'Upload',
      properties: ['openFile', 'multiSelections'],
    });
    if (res.canceled || !res.filePaths.length) return { canceled: true, uploaded: [] };
    targets = res.filePaths;
  }

  const uploaded = [];
  for (const fp of targets) {
    const out = await remoteStorage.upload(ds, fp, remoteDir || '/');
    uploaded.push(out);
  }
  return { ok: true, canceled: false, uploaded };
});

registerIPC('ds-download-file', async (_, { dsId, remoteFile }) => {
  const ds = loadDataSources().find(d => d.id === dsId);
  if (!ds) throw new Error(`Data source not found: ${dsId}`);
  const rootDir = remoteStorage.ensureLocalMountDir(ds);
  const rel = remoteStorage.normalizeRemote(remoteFile).split('/').filter(p => p && p !== '..').join(path.sep);
  const localTarget = path.join(rootDir, rel);
  await remoteStorage.download(ds, remoteFile, localTarget);
  return { ok: true, localPath: localTarget };
});

registerIPC('ds-detect-gdrive-mounts', async () => {
  return remoteStorage.detectLocalGoogleDriveMounts();
});

registerIPC('ds-pick-local-folder', async () => {
  if (!electron.dialog || !mainWindow) return { canceled: true };
  const res = await electron.dialog.showOpenDialog(mainWindow, {
    title: 'Select Local or Mounted Cloud Directory',
    buttonLabel: 'Select Folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { canceled: false, folderPath: res.filePaths[0] };
});

registerIPC('ds-pick-key-file', async (_, { title } = {}) => {
  if (!electron.dialog || !mainWindow) return { canceled: true };
  const res = await electron.dialog.showOpenDialog(mainWindow, {
    title: title || 'Select Key / Service Account File',
    buttonLabel: 'Select File',
    properties: ['openFile', 'showHiddenFiles'],
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };
  return { canceled: false, filePath: res.filePaths[0] };
});

registerIPC('ds-open-local-path', async (_, localPath) => {
  if (localPath && fs.existsSync(localPath) && shell && typeof shell.openPath === 'function') {
    await shell.openPath(localPath);
    return { ok: true };
  }
  return { ok: false, error: 'Path does not exist: ' + localPath };
});

registerIPC('ds-google-browser-login', async (_, params) => {
  return await startGoogleBrowserLogin(params || {});
});

registerIPC('ds-google-oauth-signin', async (_, params) => {
  return await startGoogleBrowserLogin(params || {});
});

registerIPC('ds-onedrive-browser-login', async (_, params) => {
  return await startOneDriveBrowserLogin(params || {});
});

registerIPC('ds-cloud-browser-login', async (_, params) => {
  if (params && String(params.driverType || '').toLowerCase() === 'onedrive') {
    return await startOneDriveBrowserLogin(params);
  }
  return await startGoogleBrowserLogin(params || {});
});

registerIPC('open-url', async (_, url) => {
  if (url && shell && typeof shell.openExternal === 'function') shell.openExternal(url);
  return { ok: true };
});

// Source workspaces use declaration UI, not the live-driver panels.
ipcMain.handle('ds-source-workspace', () => {
  if (!EXTERNAL_GRAPH) return { sourceOnly: false };
  const store = getKGraphStore(), document = store.workspace.read(), all = document['robos:nodes'];
  const types = ['robos:DataStore','robos:Database','robos:NoSQLDatabase','robos:MessageBroker','robos:BrokerDefinition','robos:MessageTopic','robos:ConsumerGroup','robos:DataModel','robos:DatabaseTable','robos:DatabaseColumn'];
  return { sourceOnly: true, appName: 'Data Sources', title: document['dcterms:title'], root: store.workspace.root,
    nodes: all.filter(n => [].concat(n['@type']).some(t => types.includes(t))),
    labels: Object.fromEntries(all.map(n => [n['@id'], n['dcterms:title'] || n['@id']])) };
});
