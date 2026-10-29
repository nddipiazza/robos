'use strict';

/**
 * RobOS Config Sync & Sharing — end-to-end through RobOS Preferences.
 *
 * Every person and machine is its own sandbox HOME with its own Google sign-in, against
 * an in-memory Google Drive that enforces sharing permissions. The scenarios run in order
 * and build on each other, like a real week:
 *
 *   1. Full backup     Alex creates a vault on Google Drive from the desktop.
 *   2. Second machine  Alex's new laptop pastes the vault link and loads everything.
 *   3. Two-way sync    Edits flow both ways; an edit on both machines is a conflict Alex resolves;
 *                      a restore point undoes it.
 *   4. Family          Alex shares the home network, movies and smart home with Sam (encrypted,
 *                      with the network join secret); Sam joins and keeps their own setup.
 *   5. Onboarding      Alex onboards Jordan, a new hire; publishes an update; Jordan applies it.
 *   6. Coworker        Alex hands a project to Priya; Eve (not invited) is refused; Priya leaves
 *                      and only the shared items go.
 *   7. Background      With Preferences closed, Desktop Manager syncs at login, after an edit and on
 *                      its interval; an edit on both machines becomes a notification, not a write,
 *                      and the notification opens Preferences on the conflict.
 *
 * Screenshots: set ROBOS_SHOT_DIR (for example site/assets/config-management) to save them.
 *
 *   Xvfb :99 &  ROBOS_TEST=1 ROBOS_SHOT_DIR=$PWD/../../site/assets/config-management \
 *     node --test tests/robos-preferences/config-sync-e2e.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');
const { execFileSync, execFile } = require('node:child_process');

const { launchApp, killApp, setupHome } = require('../../lib/harness');
const { evalJS, httpPost } = require('../../lib/snapshot');
const { startMockDrive } = require('../../lib/mock-gdrive-server');

const SHOTS = process.env.ROBOS_SHOT_DIR || '';
const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-config-sync-e2e-'));

const PEOPLE = {
  alex: { token: 'tok-alex', email: 'alex.rivera@example.com', name: 'Alex Rivera' },
  sam: { token: 'tok-sam', email: 'sam.rivera@example.com', name: 'Sam Rivera' },
  jordan: { token: 'tok-jordan', email: 'jordan.lee@acme.dev', name: 'Jordan Lee' },
  priya: { token: 'tok-priya', email: 'priya.shah@acme.dev', name: 'Priya Shah' },
  eve: { token: 'tok-eve', email: 'eve@example.net', name: 'Eve' },
};
const accountId = email => `google-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

function googleSignIn(p) {
  return {
    '.config/robos/cloud-accounts.json': { version: 1, defaultAccountId: accountId(p.email), accounts: [{ id: accountId(p.email), provider: 'google', email: p.email, accessToken: p.token, refreshToken: `1//refresh-${p.token}`, scopes: ['https://www.googleapis.com/auth/drive'] }] },
    '.config/robos/identity.json': { displayName: p.name, email: p.email },
  };
}

function alexDesktop(home) {
  const a = PEOPLE.alex;
  return {
    ...googleSignIn(a),
    '.config/robos/identity.json': { displayName: a.name, email: a.email, role: 'Staff Engineer, Acme Platform' },
    '.config/robos/settings.json': { default_ide: 'intellij', theme: 'dark', toast_enabled: true, prompt_security_mode: 'redact', ai_api_enabled: false, default_code_reviewer_group: 'platform' },
    '.config/robos/ai-provider.json': { active: 'claude-code' },
    '.config/robos/data-sources.json': [
      { id: 'gdrive-alex-drive', name: 'Alex Google Drive', driverType: 'gdrive', category: 'storage', user: a.email, accessToken: a.token, refreshToken: '1//alex-refresh', loggedIn: true, authStatus: 'authenticated' },
      { id: 'sftp-basement-nas', name: 'Basement NAS', driverType: 'sftp', category: 'storage', host: 'nas.local', port: 22, user: 'alex', password: 'nas-pass-123' },
    ],
    '.config/robos/movie-folders.json': [
      { id: 'fld-family-movies', label: 'Family Movies', kind: 'cloud', connectionId: 'gdrive-alex-drive', path: '/Movies', syncEnabled: true, lastSynced: '2026-10-28T20:00:00.000Z' },
      { id: 'fld-nas-4k', label: 'NAS 4K Remuxes', kind: 'cloud', connectionId: 'sftp-basement-nas', path: '/media/4k', syncEnabled: true },
    ],
    '.config/robos/movie-playlists.json': [
      { id: 'pl-friday', name: 'Friday Movie Night', items: ['the-iron-giant', 'paddington-2', 'spirited-away'] },
      { id: 'pl-holiday', name: 'Holiday Classics', items: ['elf', 'home-alone'] },
    ],
    '.config/robos/movie-track-stats.json': { 'paddington-2': { plays: 7 } },
    '.config/robos/audio-playlists.json': [{ id: 'ap-dinner', name: 'Dinner Jazz', tracks: 42 }, { id: 'ap-focus', name: 'Deep Focus', tracks: 120 }],
    '.config/robos/smart-lights.json': {
      rooms: [{ id: 'living-room', name: 'Living Room', floor: 'Main Floor' }, { id: 'kitchen', name: 'Kitchen', floor: 'Main Floor' }],
      lights: [{ id: 'wiz-sofa', name: 'Sofa lamp', room: 'living-room', type: 'wiz', ip: '192.168.1.41' }, { id: 'hue-strip', name: 'TV backlight', room: 'living-room', type: 'hue', bridge: '192.168.1.20' }],
      scenes: [{ id: 'movie-night', name: 'Movie night', brightness: 18 }],
    },
    '.config/robos/home-speakers.json': { updatedAt: '2026-10-28T19:00:00.000Z', speakers: [{ id: 'kitchen-nest', name: 'Kitchen speaker', host: '192.168.1.60' }] },
    '.config/robos/tv-studio.json': { portalPort: 19210, lastRemoteKey: 'HOME', tvs: [{ id: 'lg-living', name: 'Living room LG C3', ip: '192.168.1.30', platform: 'webos' }] },
    '.config/robos/dashboards.json': { activeDashboardId: 'family-board', dashboards: [{ id: 'family-board', name: 'Family board', widgets: ['calendar-today', 'weather'] }] },
    '.config/robos/app-mesh/identity.json': { nodeId: 'node-alex-desktop', nodeName: 'alex-desktop', keyPem: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----', certPem: '-----BEGIN CERTIFICATE-----x', fingerprint: 'AB:12:CD:34' },
    '.config/robos/app-mesh/mesh-state.json': {
      activeDriver: 'mtls', networkName: 'rivera-home', networkSecret: 'rn-7f3a9c-join-secret', listenHost: '0.0.0.0', listenPort: 19290,
      shareAllIpcPorts: false, sharedAppIds: ['movie-player', 'robos-tv'],
      peers: [{ id: 'node-media-vault', name: 'Basement media server', fingerprint: 'EF:56:78:90', endpoint: 'robos-net://media-vault' }], tunnels: [],
    },
    '.config/robos/git-projects.json': { projects: [
      { id: 'acme-platform-api', label: 'platform-api', host: 'github.com', org: 'acme', repo: 'platform-api', url: 'https://github.com/acme/platform-api', localPath: `${home}/source/github.com/acme/platform-api` },
      { id: 'acme-web', label: 'web', host: 'github.com', org: 'acme', repo: 'web', url: 'https://github.com/acme/web', localPath: `${home}/source/github.com/acme/web` },
    ] },
    '.config/robos/kgraph-repos.json': { repositories: [{ id: 'acme-enterprise-kgraph', name: 'Acme Enterprise KGraph', url: 'https://github.com/acme/enterprise-kgraph', tag: 'v2.3.0' }] },
    '.config/robos/mcp/servers.json': {
      'acme-jira': { command: 'npx', args: ['-y', '@acme/jira-mcp'], env: { JIRA_URL: 'https://acme.atlassian.net', JIRA_API_TOKEN: 'jira-token-999' } },
      kgraph: { command: 'robos-kgraph-mcp', args: ['--package', 'acme-platform'] },
    },
    '.config/robos/db-manager-connections.json': [{ id: 'orders-replica', name: 'Orders (read replica)', type: 'postgres', host: 'orders-ro.acme.internal', port: 5432, database: 'orders', user: 'readonly', password: 'pg-pass-xyz' }],
    '.config/robos/agent-personas.json': [{ id: 'strict-reviewer', name: 'Strict reviewer', model: 'tier3' }],
    '.config/robos/groups/platform.json': { id: 'platform', name: 'Platform team', members: ['alex.rivera@example.com', 'priya.shah@acme.dev'] },
    '.config/robos/tabletop-saves/campaign-1.json': { campaign: 'Warrior Dragon', chapter: 3 },
    '.robos/kgraph.yaml': `packages:\n  - id: acme-platform\n    path: ${home}/.robos/kgraphs/acme-platform/package.jsonld\n`,
    '.robos/kgraphs/acme-platform/package.jsonld': { '@context': 'https://rowbose.com/ns', '@graph': [{ '@id': 'urn:acme:platform-api', '@type': 'robos:Microservice', name: 'platform-api' }] },
    // Noise that must never leave the machine.
    '.config/robos/logs/preferences.log': 'log line',
    '.config/robos/electron/robos-preferences/Cookies': 'cookie-db',
    '.config/robos/voice-cache/intro.mp3': 'mp3',
    '.config/robos/movie-public-metadata-cache.json': { cached: true },
    '.config/robos/notifications.json': [{ id: 'n1', text: 'Build passed' }],
  };
}

const SECRETS = ['tok-alex', '1//alex-refresh', 'nas-pass-123', 'jira-token-999', 'pg-pass-xyz', 'BEGIN PRIVATE KEY', 'rn-7f3a9c-join-secret'];

function makeHome(name, files) {
  const home = path.join(RUN, name);
  setupHome(home, {});
  const resolved = typeof files === 'function' ? files(home) : files;
  for (const [rel, content] of Object.entries(resolved)) {
    const abs = path.join(home, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return home;
}
const readJson = (home, rel) => JSON.parse(fs.readFileSync(path.join(home, rel), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getPng(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/screenshot`, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); }).on('error', reject);
  });
}

let drive;

const CLI = path.resolve(__dirname, '../../../robos-lib/config-sync-cli.js');
/** The config-sync CLI as another machine (the same engine Desktop Manager runs). Async: the mock Drive runs in this process. */
const cli = (home, machine, ...args) => new Promise((resolve, reject) => execFile(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, HOME: home, ROBOS_GDRIVE_API_BASE: drive.url, ROBOS_MACHINE_NAME: machine },
}, (err, stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve(stdout))));

/** Logs a machine in: Desktop Manager starts and runs background Config Sync (short timers for the test). */
function loginDesktopManager(home, machine, intervalMs) {
  return launchApp('desktop-manager', {
    name: 'config-sync-background', home,
    env: {
      ROBOS_TEST: '1', ROBOS_GDRIVE_API_BASE: drive.url, ROBOS_MACHINE_NAME: machine,
      ROBOS_CONFIG_SYNC_LOGIN_DELAY_MS: '300', ROBOS_CONFIG_SYNC_DEBOUNCE_MS: '700', ROBOS_CONFIG_SYNC_INTERVAL_MS: String(intervalMs),
    },
  });
}

/** Saves the top-right corner of the X display (where robos-toast shows toasts), when ffmpeg is there. */
function screenCorner(name) {
  if (!SHOTS) return;
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'x11grab', '-i', process.env.DISPLAY || ':99', '-frames:v', '1', '-vf', 'crop=440:130:iw-440:0', path.join(SHOTS, `${name}.png`)], { timeout: 15000 });
  } catch (err) { console.log(`# screen capture skipped: ${err.message.split('\n')[0]}`); }
}

async function waitFor(fn, what, detail = () => '', ms = 30000) {
  const start = Date.now();
  for (;;) {
    let v; try { v = fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() - start > ms) { let d = ''; try { d = detail(); } catch {} throw new Error(`Timed out waiting for ${what}${d ? `\n${d}` : ''}`); }
    await sleep(150);
  }
}

async function open(home, machine) {
  const app = await launchApp('robos-preferences', {
    name: 'config-sync', home,
    env: { ROBOS_TEST: '1', ROBOS_GDRIVE_API_BASE: drive.url, ROBOS_MACHINE_NAME: machine },
  });
  await httpPost(`http://localhost:${app.port}/window/bounds`, JSON.stringify({ x: 0, y: 0, width: 1280, height: 900 }));
  await until(app.port, `Boolean(window.cs && window.cs.status && document.getElementById('cs-panel')?.children.length)`);
  await evalJS(app.port, `document.getElementById('section-config_sync').scrollIntoView({ block: 'start' }); true`);
  return app;
}

async function until(port, expr, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = await evalJS(port, `(() => { try { return ${expr}; } catch { return false; } })()`);
    if (v) return v;
    await sleep(200);
  }
  const status = await evalJS(port, `document.getElementById('cs-status')?.textContent`);
  throw new Error(`Timed out waiting for: ${expr}\nConfig Sync status: ${status}`);
}

const q = s => JSON.stringify(s);
const click = (port, sel) => evalJS(port, `(() => { const el = document.querySelector(${q(sel)}); if (!el) return 'missing ${sel}'; el.click(); return true; })()`).then(r => assert.strictEqual(r, true, String(r)));
const fill = (port, sel, value) => evalJS(port, `(() => { const el = document.querySelector(${q(sel)}); if (!el) return 'missing'; el.value = ${q(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`).then(r => assert.strictEqual(r, true, `fill ${sel}: ${r}`));
const check = (port, sel, on = true) => evalJS(port, `(() => { const el = document.querySelector(${q(sel)}); if (!el) return 'missing'; if (el.checked !== ${on}) el.click(); return true; })()`).then(r => assert.strictEqual(r, true, `check ${sel}: ${r}`));
const statusText = port => evalJS(port, `document.getElementById('cs-status').textContent`);
const tab = (port, id) => click(port, `#cs-tab-${id}`);

async function shot(port, name, scrollTo) {
  if (scrollTo) await evalJS(port, `(() => { const el = document.querySelector(${q(scrollTo)}); if (el) el.scrollIntoView({ block: 'start' }); return true; })()`);
  await sleep(350);
  const png = await getPng(port);
  assert.ok(png.length > 10000, `screenshot ${name} looks empty`);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `${name}.png`), png); }
}

/** All Drive file bodies owned by someone, gunzipped where possible. */
function driveText(email) {
  return drive.filesOwnedBy(email).filter(f => f.content).map(f => { try { return zlib.gunzipSync(f.content).toString(); } catch { return f.content.toString('latin1'); } }).join('\n');
}

describe('Config Sync & Sharing — full backup, second machine, family, onboarding and coworker scenarios', () => {
  const homes = {};
  const links = {};

  before(async () => {
    drive = await startMockDrive({ users: Object.fromEntries(Object.values(PEOPLE).map(p => [p.token, p.email])) });
    homes.desktop = makeHome('alex-desktop', alexDesktop);
    homes.laptop = makeHome('alex-laptop', googleSignIn(PEOPLE.alex));
  });

  after(async () => { await drive?.close(); fs.rmSync(RUN, { recursive: true, force: true }); });

  it('1. Full backup: Alex creates a Google Drive vault from the desktop and uploads everything except secrets and caches', async () => {
    const app = await open(homes.desktop, 'alex-desktop');
    try {
      assert.match(await evalJS(app.port, `document.querySelector('.sidebar-item').textContent`), /Config Sync/);
      await until(app.port, `document.querySelector('#cs-create-target')?.value === 'gdrive:${accountId(PEOPLE.alex.email)}'`);
      await shot(app.port, '01-vault-setup');

      await fill(app.port, '#cs-create-name', 'RobOS Config Vault');
      await click(app.port, '#cs-create');
      await until(app.port, `Boolean(document.getElementById('cs-first-sync'))`);
      assert.strictEqual(await evalJS(app.port, `cs.plan.recommended`), 'use-local', 'an empty vault is seeded from this machine');
      const pushes = await evalJS(app.port, `cs.plan.actions.filter(a => a.action === 'push').map(a => a.rel)`);
      for (const rel of ['config/settings.json', 'config/movie-folders.json', 'config/app-mesh/mesh-state.json', 'robos/kgraphs/acme-platform/package.jsonld']) assert.ok(pushes.includes(rel), `${rel} is backed up`);
      for (const rel of ['config/app-mesh/identity.json', 'config/logs/preferences.log', 'config/voice-cache/intro.mp3', 'config/movie-public-metadata-cache.json', 'config/notifications.json']) assert.ok(!pushes.includes(rel), `${rel} is never backed up`);
      await shot(app.port, '02-first-sync-seed', '#cs-first-sync');

      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
      await until(app.port, `Boolean(document.getElementById('cs-uptodate'))`);
      await evalJS(app.port, `document.querySelector('.cs-cats').open = true; true`);
      await shot(app.port, '03-vault-connected', '#section-config_sync');

      links.vault = await evalJS(app.port, `document.getElementById('cs-vault-url').textContent`);
      assert.match(links.vault, /^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]+$/);
      const vaultFolder = drive.filesOwnedBy(PEOPLE.alex.email).find(f => f.name === 'RobOS Config Vault');
      assert.ok(vaultFolder, 'the vault folder exists in Alex’s Drive');
      assert.ok(drive.childrenOf(vaultFolder.id).some(f => f.name === 'robos-config.json'));
      const stored = driveText(PEOPLE.alex.email);
      for (const s of SECRETS) assert.ok(!stored.includes(s), `Drive must not contain ${s}`);
      assert.ok(!stored.includes(homes.desktop), 'home paths are stored as ${HOME}');
      assert.ok(stored.includes('Friday Movie Night'));
    } finally { await killApp(app); }
  });

  it('2. Second machine: the laptop pastes the vault link, reviews, and loads the whole setup', async () => {
    const app = await open(homes.laptop, 'alex-laptop');
    try {
      await fill(app.port, '#cs-connect-ref', links.vault);
      await shot(app.port, '04-laptop-connect');
      await click(app.port, '#cs-connect');
      await until(app.port, `Boolean(document.getElementById('cs-first-sync'))`);
      assert.strictEqual(await evalJS(app.port, `cs.plan.recommended`), 'use-vault');
      assert.strictEqual(await evalJS(app.port, `document.querySelector('input[name="cs-strategy"]:checked').value`), 'use-vault');
      await shot(app.port, '05-laptop-first-sync', '#cs-first-sync');

      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
      await shot(app.port, '06-laptop-loaded', '#section-config_sync');

      const L = homes.laptop;
      assert.strictEqual(readJson(L, '.config/robos/git-projects.json').projects[0].localPath, `${L}/source/github.com/acme/platform-api`, 'paths follow the laptop’s home');
      assert.match(fs.readFileSync(path.join(L, '.robos/kgraph.yaml'), 'utf8'), new RegExp(`${L}/.robos/kgraphs`));
      assert.strictEqual(readJson(L, '.config/robos/movie-playlists.json')[0].name, 'Friday Movie Night');
      assert.strictEqual(readJson(L, '.config/robos/app-mesh/mesh-state.json').networkSecret, undefined, 'secrets are not restored from the vault');
      assert.ok(!fs.existsSync(path.join(L, '.config/robos/app-mesh/identity.json')), 'the laptop keeps its own mesh identity');
      const acc = readJson(L, '.config/robos/cloud-accounts.json').accounts.find(a => a.email === PEOPLE.alex.email);
      assert.strictEqual(acc.accessToken, PEOPLE.alex.token, 'the laptop stays signed in');
      assert.strictEqual(readJson(L, '.config/robos/db-manager-connections.json')[0].password, undefined);
    } finally { await killApp(app); }
  });

  it('3. Two-way sync: laptop edits reach the desktop, a both-sides edit is a conflict, and a restore point undoes it', async () => {
    // On the laptop Alex adds a playlist and switches IDE.
    fs.writeFileSync(path.join(homes.laptop, '.config/robos/movie-playlists.json'), JSON.stringify([...readJson(homes.laptop, '.config/robos/movie-playlists.json'), { id: 'pl-road-trip', name: 'Road Trip', items: ['cars'] }], null, 2));
    const s = readJson(homes.laptop, '.config/robos/settings.json');
    fs.writeFileSync(path.join(homes.laptop, '.config/robos/settings.json'), JSON.stringify({ ...s, default_ide: 'vscode' }, null, 2));
    let app = await open(homes.laptop, 'alex-laptop');
    try {
      await click(app.port, '#cs-review');
      await until(app.port, `cs.plan && cs.plan.counts.push === 2`);
      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
    } finally { await killApp(app); }

    // Meanwhile the desktop changed the same setting.
    const d = readJson(homes.desktop, '.config/robos/settings.json');
    fs.writeFileSync(path.join(homes.desktop, '.config/robos/settings.json'), JSON.stringify({ ...d, default_ide: 'zed' }, null, 2));
    app = await open(homes.desktop, 'alex-desktop');
    try {
      await click(app.port, '#cs-review');
      await until(app.port, `cs.plan && cs.plan.counts.conflict === 1 && cs.plan.counts.pull === 1`);
      assert.strictEqual(await evalJS(app.port, `document.getElementById('cs-apply').disabled`), true, 'cannot apply with an unresolved conflict');
      const conflict = await evalJS(app.port, `cs.plan.actions.find(a => a.action === 'conflict')`);
      assert.strictEqual(conflict.rel, 'config/settings.json');
      assert.strictEqual(conflict.remote.by, 'alex-laptop');
      await shot(app.port, '07-conflict', '#cs-plan');

      await click(app.port, `input[data-cs-res="config/settings.json"][value="remote"]`);
      await until(app.port, `!document.getElementById('cs-apply').disabled`);
      await shot(app.port, '08-conflict-resolved', '#cs-plan');
      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
      assert.strictEqual(readJson(homes.desktop, '.config/robos/settings.json').default_ide, 'vscode');
      assert.ok(readJson(homes.desktop, '.config/robos/movie-playlists.json').some(p => p.id === 'pl-road-trip'));
      assert.strictEqual(readJson(homes.desktop, '.config/robos/cloud-accounts.json').accounts[0].accessToken, PEOPLE.alex.token);

      await tab(app.port, 'restore');
      await until(app.port, `document.querySelectorAll('[data-cs-restore]').length >= 1`);
      await shot(app.port, '09-restore-points', '#section-config_sync');
      // Alex changes their mind about the IDE only: restore that one file, keep the new playlist.
      const settingsBtn = `[data-cs-restore-file][data-rel="config/settings.json"]`;
      await click(app.port, settingsBtn);
      await until(app.port, `/click again/.test(document.querySelector('${settingsBtn}').textContent)`);
      await click(app.port, settingsBtn);
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Restored settings.json')`);
      assert.strictEqual(readJson(homes.desktop, '.config/robos/settings.json').default_ide, 'zed', 'the restore point brings back the overwritten version');
      assert.ok(readJson(homes.desktop, '.config/robos/movie-playlists.json').some(p => p.id === 'pl-road-trip'), 'other files from that sync are untouched');
      // Sync the restored setting so later scenarios start from a clean, synced desktop.
      await tab(app.port, 'vault');
      await click(app.port, '#cs-review');
      await until(app.port, `cs.plan && cs.plan.counts.push === 1`);
      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
    } finally { await killApp(app); }
  });

  it('4. Family: Alex shares the home network, movies and smart home with Sam; Sam keeps their own setup', async () => {
    homes.sam = makeHome('sam', {
      ...googleSignIn(PEOPLE.sam),
      '.config/robos/data-sources.json': [{ id: 'gdrive-sam-drive', name: 'Sam Google Drive', driverType: 'gdrive', user: PEOPLE.sam.email, accessToken: PEOPLE.sam.token, loggedIn: true }],
      '.config/robos/smart-lights.json': { rooms: [{ id: 'sams-room', name: "Sam's room", floor: 'Upper Floor' }], lights: [{ id: 'sam-desk', name: 'Desk lamp', room: 'sams-room', type: 'wiz' }], scenes: [] },
      '.config/robos/movie-playlists.json': [{ id: 'pl-sam-anime', name: 'Anime marathon', items: ['your-name'] }],
      '.config/robos/app-mesh/mesh-state.json': { activeDriver: 'mtls', listenHost: '0.0.0.0', listenPort: 19390, peers: [], tunnels: [] },
    });

    let app = await open(homes.desktop, 'alex-desktop');
    try {
      await tab(app.port, 'share');
      await until(app.port, `Boolean(document.getElementById('cs-share-name'))`);
      await click(app.port, 'input[name="cs-template"][value="family"]');
      await until(app.port, `document.querySelector('[data-cs-share-cat="private-network"]').checked`);
      await fill(app.port, '#cs-share-name', 'Rivera family home');
      await fill(app.port, '#cs-share-desc', 'Our home network, movie nights, lights and the living-room TV. Passphrase is the dog’s name.');
      await fill(app.port, '#cs-share-to', PEOPLE.sam.email);
      await fill(app.port, '#cs-share-pass', 'biscuit-the-beagle');
      await check(app.port, '#cs-share-seal');
      await click(app.port, '#cs-share-preview');
      await until(app.port, `Boolean(document.getElementById('cs-share-preview-card'))`);
      const preview = await evalJS(app.port, `cs.sharePreview`);
      assert.deepStrictEqual(preview.categories.map(c => c.id).sort(), ['audio-library', 'movie-library', 'private-network', 'smart-home']);
      assert.ok(!preview.files.some(f => f.rel === 'config/movie-track-stats.json'), 'watch history is not shared');
      assert.ok(!preview.files.some(f => f.rel === 'config/app-mesh/identity.json'));
      assert.strictEqual(preview.sealedNetworkSecret, true);
      await shot(app.port, '10-family-share-preview', '.cs-templates');

      await click(app.port, '#cs-share-publish');
      await until(app.port, `Boolean(document.getElementById('cs-published-card'))`);
      links.family = await evalJS(app.port, `document.getElementById('cs-share-link').textContent`);
      await shot(app.port, '11-family-share-published', '#cs-published-card');
      assert.deepStrictEqual(drive.notifications.map(n => n.to), [PEOPLE.sam.email], 'Drive emails Sam the share');
      const stored = driveText(PEOPLE.alex.email);
      assert.ok(!stored.includes('rn-7f3a9c-join-secret'), 'the sealed network secret is encrypted at rest');
    } finally { await killApp(app); }

    app = await open(homes.sam, 'sam-laptop');
    try {
      await tab(app.port, 'joined');
      await fill(app.port, '#cs-join-ref', links.family);
      await fill(app.port, '#cs-join-pass', 'wrong-guess');
      await click(app.port, '#cs-join-preview');
      await until(app.port, `/Wrong passphrase/.test(document.getElementById('cs-status').textContent)`);
      await fill(app.port, '#cs-join-pass', 'biscuit-the-beagle');
      await click(app.port, '#cs-join-preview');
      await until(app.port, `Boolean(document.getElementById('cs-join-preview-card'))`);
      const p = await evalJS(app.port, `cs.joinPreview`);
      assert.strictEqual(p.share.publisher.name, PEOPLE.alex.name);
      assert.deepStrictEqual(p.connections.map(c => [c.id, c.mappedTo]), [['gdrive-alex-drive', 'gdrive-sam-drive'], ['sftp-basement-nas', null]]);
      await shot(app.port, '12-family-join-preview', '#cs-join-preview-card');

      await click(app.port, '#cs-join-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Joined')`);
      await shot(app.port, '13-family-joined', '#section-config_sync');

      const S = homes.sam;
      const mesh = readJson(S, '.config/robos/app-mesh/mesh-state.json');
      assert.strictEqual(mesh.networkName, 'rivera-home');
      assert.strictEqual(mesh.networkSecret, 'rn-7f3a9c-join-secret', 'Sam can join the network without a separate invite');
      assert.strictEqual(mesh.listenPort, 19390, 'Sam’s own listen port is kept');
      assert.ok(mesh.peers.some(x => x.id === 'node-media-vault'));
      const lights = readJson(S, '.config/robos/smart-lights.json');
      assert.deepStrictEqual(lights.rooms.map(r => r.id), ['sams-room', 'living-room', 'kitchen'], 'Sam’s room stays; the family rooms are added');
      assert.deepStrictEqual(readJson(S, '.config/robos/movie-playlists.json').map(x => x.id), ['pl-sam-anime', 'pl-friday', 'pl-holiday', 'pl-road-trip']);
      assert.strictEqual(readJson(S, '.config/robos/movie-folders.json')[0].connectionId, 'gdrive-sam-drive');
      assert.ok(!fs.existsSync(path.join(S, '.config/robos/git-projects.json')), 'developer settings were not part of the family share');
    } finally { await killApp(app); }
  });

  it('5. Onboarding: Jordan joins the team share, sees what to sign in to, and later applies an update', async () => {
    homes.jordan = makeHome('jordan', googleSignIn(PEOPLE.jordan));
    let app = await open(homes.desktop, 'alex-desktop');
    try {
      await tab(app.port, 'share');
      await click(app.port, 'input[name="cs-template"][value="onboarding"]');
      await until(app.port, `document.querySelector('[data-cs-share-cat="developer"]').checked && !document.querySelector('[data-cs-share-cat="private-network"]').checked`);
      await fill(app.port, '#cs-share-name', 'Acme Platform onboarding');
      await fill(app.port, '#cs-share-desc', 'Day-one setup for the Platform team: repos, KGraph, MCP servers, the orders replica and our reviewer persona.');
      await fill(app.port, '#cs-share-to', PEOPLE.jordan.email);
      await click(app.port, '#cs-share-publish');
      await until(app.port, `Boolean(document.getElementById('cs-published-card'))`);
      links.onboarding = await evalJS(app.port, `document.getElementById('cs-share-link').textContent`);
    } finally { await killApp(app); }

    app = await open(homes.jordan, 'jordan-new-laptop');
    try {
      await tab(app.port, 'joined');
      await fill(app.port, '#cs-join-ref', links.onboarding);
      await click(app.port, '#cs-join-preview');
      await until(app.port, `Boolean(document.getElementById('cs-join-preview-card'))`);
      const req = await evalJS(app.port, `cs.joinPreview.requires.map(r => r.rel)`);
      for (const rel of ['config/mcp/servers.json', 'config/db-manager-connections.json']) assert.ok(req.includes(rel), `Jordan is told to sign in for ${rel}`);
      await shot(app.port, '14-onboarding-preview', '#cs-join-preview-card');
      await click(app.port, '#cs-join-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Joined')`);
      const J = homes.jordan;
      assert.deepStrictEqual(readJson(J, '.config/robos/git-projects.json').projects.map(p => p.id), ['acme-platform-api', 'acme-web']);
      assert.strictEqual(readJson(J, '.config/robos/git-projects.json').projects[0].localPath, `${J}/source/github.com/acme/platform-api`);
      assert.strictEqual(readJson(J, '.config/robos/mcp/servers.json')['acme-jira'].env.JIRA_API_TOKEN, undefined);
      assert.strictEqual(readJson(J, '.config/robos/mcp/servers.json')['acme-jira'].env.JIRA_URL, 'https://acme.atlassian.net');
      assert.ok(fs.existsSync(path.join(J, '.robos/kgraphs/acme-platform/package.jsonld')));
      assert.strictEqual(readJson(J, '.config/robos/identity.json').displayName, PEOPLE.jordan.name, 'Jordan’s profile is untouched');
    } finally { await killApp(app); }

    // A week later the team adds a service; Alex publishes an update.
    const gp = readJson(homes.desktop, '.config/robos/git-projects.json');
    gp.projects.push({ id: 'acme-billing-svc', label: 'billing-svc', host: 'github.com', org: 'acme', repo: 'billing-svc', url: 'https://github.com/acme/billing-svc', localPath: `${homes.desktop}/source/github.com/acme/billing-svc` });
    fs.writeFileSync(path.join(homes.desktop, '.config/robos/git-projects.json'), JSON.stringify(gp, null, 2));
    app = await open(homes.desktop, 'alex-desktop');
    try {
      await tab(app.port, 'share');
      const id = await evalJS(app.port, `cs.status.shares.find(s => s.name === 'Acme Platform onboarding').id`);
      await click(app.port, `[data-cs-update="${id}"]`);
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Published version 2')`);
      await shot(app.port, '15-shares-published-list', '#cs-published');
    } finally { await killApp(app); }

    app = await open(homes.jordan, 'jordan-new-laptop');
    try {
      await tab(app.port, 'joined');
      await click(app.port, '#cs-check-updates');
      await until(app.port, `Boolean(document.querySelector('[data-cs-apply-update]'))`);
      await shot(app.port, '16-onboarding-update-available', '#section-config_sync');
      await click(app.port, '[data-cs-apply-update]');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Applied version 2')`);
      assert.ok(readJson(homes.jordan, '.config/robos/git-projects.json').projects.some(p => p.id === 'acme-billing-svc'));
    } finally { await killApp(app); }
  });

  it('6. Coworker handoff: Eve cannot open it, Priya joins and later leaves, keeping only her own projects', async () => {
    homes.priya = makeHome('priya', { ...googleSignIn(PEOPLE.priya), '.config/robos/git-projects.json': { projects: [{ id: 'priya-notes', label: 'notes', repo: 'notes', host: 'github.com', org: 'priya' }] } });
    homes.eve = makeHome('eve', googleSignIn(PEOPLE.eve));
    let app = await open(homes.desktop, 'alex-desktop');
    try {
      await tab(app.port, 'share');
      await click(app.port, 'input[name="cs-template"][value="coworker"]');
      await fill(app.port, '#cs-share-name', 'billing-svc handoff');
      await fill(app.port, '#cs-share-to', PEOPLE.priya.email);
      await click(app.port, '#cs-share-publish');
      await until(app.port, `Boolean(document.getElementById('cs-published-card'))`);
      links.coworker = await evalJS(app.port, `document.getElementById('cs-share-link').textContent`);
    } finally { await killApp(app); }

    app = await open(homes.eve, 'eve-pc');
    try {
      await tab(app.port, 'joined');
      await fill(app.port, '#cs-join-ref', links.coworker);
      await click(app.port, '#cs-join-preview');
      await until(app.port, `/could not find|access/i.test(document.getElementById('cs-status').textContent)`);
      await shot(app.port, '17-not-shared-with-you', '#section-config_sync');
      assert.ok(!fs.existsSync(path.join(homes.eve, '.config/robos/git-projects.json')));
    } finally { await killApp(app); }

    app = await open(homes.priya, 'priya-workstation');
    try {
      await tab(app.port, 'joined');
      await fill(app.port, '#cs-join-ref', links.coworker);
      await click(app.port, '#cs-join-preview');
      await until(app.port, `Boolean(document.getElementById('cs-join-preview-card'))`);
      await click(app.port, '#cs-join-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Joined')`);
      assert.deepStrictEqual(readJson(homes.priya, '.config/robos/git-projects.json').projects.map(p => p.id), ['priya-notes', 'acme-platform-api', 'acme-web', 'acme-billing-svc']);
      await shot(app.port, '18-coworker-joined', '#section-config_sync');

      const id = await evalJS(app.port, `cs.status.subscriptions[0].id`);
      await click(app.port, `[data-cs-leave="${id}"]`);
      await until(app.port, `/Click again/.test(document.querySelector('[data-cs-leave]').textContent)`);
      await click(app.port, `[data-cs-leave="${id}"]`);
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('Left the share')`);
      assert.deepStrictEqual(readJson(homes.priya, '.config/robos/git-projects.json').projects.map(p => p.id), ['priya-notes']);
      await shot(app.port, '19-coworker-left', '#section-config_sync');
    } finally { await killApp(app); }
  });

  it('7. Background sync: with Preferences closed, edits reach the other machine; a conflict becomes a notification, not a write', async () => {
    const D = homes.desktop, L = homes.laptop;
    const vaultOf = home => readJson(home, '.config/robos/config-sync/state.json').vault;
    const notes = home => { try { return readJson(home, '.config/robos/notifications.json').filter(n => n.source === 'robos-config-sync'); } catch { return []; } };
    const editJson = (home, rel, fn) => fs.writeFileSync(path.join(home, rel), JSON.stringify(fn(readJson(home, rel)), null, 2));
    const why = (home, dm) => () => `background sync: ${JSON.stringify(vaultOf(home).auto)}\n${dm?.stderr?.().slice(-2000) || ''}`;

    // The Backup vault tab: "Sync automatically" is on, every 5 minutes, and soon after a change.
    let app = await open(L, 'alex-laptop');
    try {
      await until(app.port, `Boolean(document.getElementById('cs-auto-enabled'))`);
      assert.deepStrictEqual(await evalJS(app.port, `[document.getElementById('cs-auto-enabled').checked, document.getElementById('cs-auto-interval').value, document.getElementById('cs-auto-watch').checked]`), [true, '5', true]);
      await fill(app.port, '#cs-auto-interval', '15');
      await until(app.port, `/every 15 min/.test(document.getElementById('cs-status').textContent)`);
      assert.strictEqual(vaultOf(L).auto.intervalMinutes, 15, 'stored in state.json (vault.auto)');
      await fill(app.port, '#cs-auto-interval', '5');
      await until(app.port, `/every 5 min/.test(document.getElementById('cs-status').textContent)`);
      await shot(app.port, '20-sync-automatically', '#section-config_sync');
    } finally { await killApp(app); }

    // The desktop logs in. Desktop Manager pushes the project Alex added in scenario 5, then a
    // playlist edited a moment later (the file watcher; the interval is far away).
    const before = vaultOf(D).lastGeneration;
    let dm = await loginDesktopManager(D, 'alex-desktop', 600000);
    try {
      await waitFor(() => vaultOf(D).lastGeneration > before && vaultOf(D).auto.lastOutcome === 'synced', 'the desktop login sync', why(D, dm));
      const afterLogin = vaultOf(D).lastGeneration;
      await sleep(1700);
      editJson(D, '.config/robos/movie-playlists.json', l => [...l, { id: 'pl-matinee', name: 'Sunday Matinee', items: ['wall-e'] }]);
      await waitFor(() => vaultOf(D).lastGeneration > afterLogin, 'the desktop pushing the edited playlist', why(D, dm));
    } finally { await killApp(dm); }

    // The laptop logs in: everything arrives without opening Preferences or clicking Sync.
    dm = await loginDesktopManager(L, 'alex-laptop', 2500);
    try {
      await waitFor(() => readJson(L, '.config/robos/movie-playlists.json').some(p => p.id === 'pl-matinee'), 'the playlist reaching the laptop', why(L, dm));
      assert.ok(readJson(L, '.config/robos/git-projects.json').projects.some(p => p.id === 'acme-billing-svc'));
      assert.strictEqual(readJson(L, '.config/robos/settings.json').default_ide, 'zed', 'the setting restored on the desktop in scenario 3');
      assert.strictEqual(readJson(L, '.config/robos/cloud-accounts.json').accounts[0].accessToken, PEOPLE.alex.token, 'the laptop stays signed in');

      // While the laptop is on, the desktop syncs again; the laptop's interval picks it up.
      editJson(D, '.config/robos/audio-playlists.json', l => [...l, { id: 'ap-rainy', name: 'Rainy Day', tracks: 12 }]);
      assert.match(await cli(D, 'alex-desktop', 'vault', 'auto', 'run'), /Background sync: synced ↑1 ↓0/);
      await waitFor(() => readJson(L, '.config/robos/audio-playlists.json').some(p => p.id === 'ap-rainy'), 'the laptop interval sync', why(L, dm));
      assert.strictEqual(notes(L).length, 0, 'nothing needed Alex');
    } finally { await killApp(dm); }

    // Both machines change the IDE while the laptop is off.
    editJson(D, '.config/robos/settings.json', x => ({ ...x, default_ide: 'emacs' }));
    assert.match(await cli(D, 'alex-desktop', 'vault', 'auto', 'run'), /synced ↑1/);
    editJson(L, '.config/robos/settings.json', x => ({ ...x, default_ide: 'helix' }));
    const vaultGeneration = vaultOf(D).lastGeneration;

    dm = await loginDesktopManager(L, 'alex-laptop', 2500);
    const toast = await launchApp('robos-toast', { name: 'config-sync-toast', home: L, env: { ROBOS_TEST: '1' } });
    let action;
    try {
      await waitFor(() => notes(L).length === 1, 'the conflict notification', why(L, dm));
      const [n] = notes(L);
      assert.strictEqual(n.title, 'Config Sync needs you: 1 conflict');
      assert.match(n.body, /settings\.json changed on this machine and in your backup vault/);
      assert.deepStrictEqual(n.action, { type: 'open-app', app: 'robos-preferences', label: 'Review in Preferences', open: { section: 'config_sync', tab: 'vault', reason: 'conflicts' } });
      assert.strictEqual(readJson(L, '.config/robos/settings.json').default_ide, 'helix', 'the laptop edit is not overwritten');
      assert.deepStrictEqual(vaultOf(L).auto.attention.rels, ['config/settings.json']);
      await until(toast.port, `window.toast.getActiveToasts().then(t => t.some(x => x.title === 'Config Sync needs you: 1 conflict'))`);
      screenCorner('22-conflict-toast');

      // More interval runs go by: still one notification, and the vault still has the desktop's version.
      const runAt = vaultOf(L).auto.lastRunAt;
      await waitFor(() => vaultOf(L).auto.lastRunAt !== runAt, 'another interval run', why(L, dm));
      assert.strictEqual(notes(L).length, 1, 'the same conflict is announced once');
      assert.strictEqual(vaultOf(L).auto.lastOutcome, 'conflicts');
      assert.match(await cli(D, 'alex-desktop', 'vault', 'plan'), /Up to date/);
      assert.strictEqual(vaultOf(D).lastGeneration, vaultGeneration);

      // "Review in Preferences" on the toast.
      action = n.action;
      await evalJS(toast.port, `setTimeout(() => window.toast.action(${JSON.stringify(action)}), 50); true`);
      await waitFor(() => fs.existsSync(path.join(L, '.config/robos/open-requests/robos-preferences.json')), 'the toast asking Preferences to open Config Sync');
    } finally { await killApp(toast); await killApp(dm); }

    // Preferences opens on Backup vault with the conflict listed.
    app = await open(L, 'alex-laptop');
    try {
      await until(app.port, `cs.tab === 'vault' && cs.plan && cs.plan.counts.conflict === 1`);
      assert.ok(!fs.existsSync(path.join(L, '.config/robos/open-requests/robos-preferences.json')), 'the request is used once');
      assert.match(await evalJS(app.port, `document.getElementById('cs-attention').textContent`), /Background sync is paused: 1 conflict/);
      await shot(app.port, '21-conflict-from-notification', '#section-config_sync');
      await click(app.port, `input[data-cs-res="config/settings.json"][value="local"]`);
      await until(app.port, `!document.getElementById('cs-apply').disabled`);
      await click(app.port, '#cs-apply');
      await until(app.port, `document.getElementById('cs-status').textContent.startsWith('✓ Synced')`);
      await until(app.port, `!document.getElementById('cs-attention')`);
      assert.strictEqual(notes(L)[0].read, true, 'the notification is cleared');
      assert.strictEqual(vaultOf(L).auto.attention, null);
    } finally { await killApp(app); }

    // The desktop's next background run takes the version Alex kept.
    assert.match(await cli(D, 'alex-desktop', 'vault', 'auto', 'run'), /synced ↑0 ↓1/);
    assert.strictEqual(readJson(D, '.config/robos/settings.json').default_ide, 'helix');
  });
});
