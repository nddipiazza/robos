'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const sync = require('./config-sync');
const { startMockDrive } = require('../robos-test/lib/mock-gdrive-server');

function makeHome(name, files = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `robos-config-sync-${name}-`));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(home, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  }
  return home;
}
const read = (home, rel) => JSON.parse(fs.readFileSync(path.join(home, rel), 'utf8'));
const exists = (home, rel) => fs.existsSync(path.join(home, rel));

function alexFiles(home) {
  return {
    '.config/robos/settings.json': { default_ide: 'intellij', toast_enabled: true },
    '.config/robos/identity.json': { displayName: 'Alex Rivera', email: 'alex@example.com' },
    '.config/robos/cloud-accounts.json': { version: 1, defaultAccountId: 'google-alex', accounts: [{ id: 'google-alex', provider: 'google', email: 'alex@example.com', accessToken: 'tok-alex', refreshToken: '1//alex-refresh' }] },
    '.config/robos/git-projects.json': { projects: [{ id: 'p1', repo: 'petstore-api', localPath: `${home}/source/petstore-api` }] },
    '.config/robos/db-manager-connections.json': [{ id: 'db1', name: 'orders', host: 'db.internal', user: 'app', password: 'hunter2' }],
    '.config/robos/app-mesh/identity.json': { nodeId: 'n1', keyPem: '-----BEGIN PRIVATE KEY-----abc' },
    '.config/robos/app-mesh/mesh-state.json': { networkName: 'rivera-home', networkSecret: 'net-s3cret', peers: [{ id: 'peer-tv', name: 'Living room TV' }] },
    '.config/robos/movie-playlists.json': [{ id: 'pl1', name: 'Friday night' }],
    '.config/robos/logs/app.log': 'noise',
    '.config/robos/electron/x/Cookies': 'cookie',
    '.config/robos/movie-public-metadata-cache.json': { big: true },
    '.robos/kgraphs/core/package.jsonld': { '@graph': [{ '@id': 'urn:a', path: `${home}/.robos/kgraphs/core` }] },
    '.robos/videos/demo.mp4': 'binary',
  };
}

test('exportBuffer removes credentials and writes the home directory as ${HOME}; importBuffer reverses it', () => {
  const { exportBuffer, importBuffer } = sync._internal;
  const local = Buffer.from(JSON.stringify({ accounts: [{ id: 'a', accessToken: 'x', path: '/home/alex/Music', passPath: 'robos/a' }] }));
  const out = exportBuffer('config/cloud-accounts.json', local, { home: '/home/alex' });
  const data = JSON.parse(out.buf);
  assert.equal(data.accounts[0].accessToken, undefined);
  assert.equal(data.accounts[0].passPath, 'robos/a', 'pass references are not secrets');
  assert.equal(data.accounts[0].path, '${HOME}/Music');
  assert.deepEqual(out.removed, [{ key: 'accessToken', at: 'accounts › a' }]);

  const machine2Local = Buffer.from(JSON.stringify({ accounts: [{ id: 'a', accessToken: 'y' }] }));
  const back = JSON.parse(importBuffer('config/cloud-accounts.json', out.buf, machine2Local, { home: '/home/alexr' }));
  assert.equal(back.accounts[0].path, '/home/alexr/Music');
  assert.equal(back.accounts[0].accessToken, 'y', "the receiving machine's own token is kept");
});

test('home rewriting does not touch a longer path that merely starts with the home path', () => {
  const { exportBuffer } = sync._internal;
  const out = JSON.parse(exportBuffer('config/x.json', Buffer.from(JSON.stringify({ a: '/home/al/x', b: '/home/alex/x' })), { home: '/home/al' }).buf);
  assert.deepEqual(out, { a: '${HOME}/x', b: '/home/alex/x' });
});

test('vault: machine 1 seeds a folder vault, machine 2 does a full load, then changes flow both ways', async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-'));
  const m1 = makeHome('m1');
  for (const [rel, c] of Object.entries(alexFiles(m1))) { fs.mkdirSync(path.dirname(path.join(m1, rel)), { recursive: true }); fs.writeFileSync(path.join(m1, rel), typeof c === 'string' ? c : JSON.stringify(c, null, 2)); }
  const m2 = makeHome('m2', {
    '.config/robos/cloud-accounts.json': { version: 1, accounts: [{ id: 'google-alex', provider: 'google', email: 'alex@example.com', accessToken: 'tok-alex-m2' }, { id: 'google-work', provider: 'google', email: 'alex@work.example', accessToken: 'tok-work' }] },
  });

  process.env.ROBOS_MACHINE_NAME = 'alex-desktop';
  const c1 = await sync.connectVault({ homeDir: m1, create: { kind: 'folder', path: vaultDir, name: 'RobOS Config Vault' } });
  assert.equal(c1.plan.firstSync, true);
  assert.equal(c1.plan.recommended, 'use-local', 'an empty vault is seeded from this machine');
  const s1 = await sync.applyVaultSync({ homeDir: m1, strategy: 'use-local' });
  assert.ok(s1.pushed.includes('config/settings.json'));
  for (const rel of ['config/logs/app.log', 'config/electron/x/Cookies', 'config/movie-public-metadata-cache.json', 'robos/videos/demo.mp4', 'config/app-mesh/identity.json']) {
    assert.ok(!s1.pushed.includes(rel), `${rel} must not be pushed`);
  }
  assert.ok(s1.pushed.includes('config/identity.json') && s1.pushed.includes('robos/kgraphs/core/package.jsonld'));

  // Nothing secret is stored in the vault.
  const vaultBytes = fs.readdirSync(path.join(vaultDir, 'RobOS Config Vault', 'blobs')).map(f => require('node:zlib').gunzipSync(fs.readFileSync(path.join(vaultDir, 'RobOS Config Vault', 'blobs', f))).toString()).join('\n');
  for (const secret of ['tok-alex', '1//alex-refresh', 'hunter2', 'net-s3cret', 'BEGIN PRIVATE KEY', m1]) assert.ok(!vaultBytes.includes(secret), `vault must not contain ${secret}`);

  process.env.ROBOS_MACHINE_NAME = 'alex-laptop';
  const c2 = await sync.connectVault({ homeDir: m2, ref: path.join(vaultDir, 'RobOS Config Vault') });
  assert.equal(c2.plan.recommended, 'use-vault', 'a nearly empty machine loads the vault');
  const s2 = await sync.applyVaultSync({ homeDir: m2, strategy: 'use-vault' });
  assert.ok(s2.pulled.includes('config/git-projects.json'));
  assert.ok(s2.restorePointId);
  assert.equal(read(m2, '.config/robos/git-projects.json').projects[0].localPath, `${m2}/source/petstore-api`, 'paths follow the new home');
  assert.equal(read(m2, '.robos/kgraphs/core/package.jsonld')['@graph'][0].path, `${m2}/.robos/kgraphs/core`);
  const accounts = read(m2, '.config/robos/cloud-accounts.json').accounts;
  assert.equal(accounts.find(a => a.id === 'google-alex').accessToken, 'tok-alex-m2', 'pulling keeps this machine sign-in');
  assert.equal(accounts.find(a => a.id === 'google-work').accessToken, 'tok-work', 'a sign-in that only exists here is kept');
  assert.equal(read(m2, '.config/robos/db-manager-connections.json')[0].password, undefined, 'passwords are not copied');

  // The machine-2-only account is uploaded next time, without its token, and no conflict appears.
  const p2 = await sync.planVaultSync({ homeDir: m2 });
  assert.deepEqual(p2.actions.map(a => [a.rel, a.action]), [['config/cloud-accounts.json', 'push']]);
  await sync.applyVaultSync({ homeDir: m2 });

  // Cloud Accounts rewrites its file with fresh timestamps whenever it is read. That is
  // machine-local state and must not show up as a change to sync.
  // (The first read normalizes the hand-written fixture, a real one-time change.)
  require('./cloud-accounts').listAccounts({ homeDir: m2 });
  await sync.applyVaultSync({ homeDir: m2 });
  await new Promise(r => setTimeout(r, 20));
  const before = fs.readFileSync(path.join(m2, '.config/robos/cloud-accounts.json'), 'utf8');
  require('./cloud-accounts').listAccounts({ homeDir: m2 });
  assert.notEqual(fs.readFileSync(path.join(m2, '.config/robos/cloud-accounts.json'), 'utf8'), before, 'the file really was rewritten');
  assert.deepEqual((await sync.planVaultSync({ homeDir: m2 })).actions, [], 'refreshing Cloud Accounts is not a config change');

  // Edit on machine 2 → machine 1 pulls it.
  fs.writeFileSync(path.join(m2, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'vscode', toast_enabled: true }));
  await sync.applyVaultSync({ homeDir: m2 });
  process.env.ROBOS_MACHINE_NAME = 'alex-desktop';
  const p1 = await sync.planVaultSync({ homeDir: m1 });
  assert.deepEqual(p1.actions.map(a => a.action).sort(), ['pull', 'pull']);
  await sync.applyVaultSync({ homeDir: m1 });
  assert.equal(read(m1, '.config/robos/settings.json').default_ide, 'vscode');
  assert.equal(read(m1, '.config/robos/cloud-accounts.json').accounts.find(a => a.id === 'google-alex').accessToken, 'tok-alex');

  // Both sides edit the same file → a conflict that must be resolved.
  fs.writeFileSync(path.join(m1, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'zed' }));
  process.env.ROBOS_MACHINE_NAME = 'alex-laptop';
  fs.writeFileSync(path.join(m2, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'neovim' }));
  await sync.applyVaultSync({ homeDir: m2 });
  process.env.ROBOS_MACHINE_NAME = 'alex-desktop';
  await assert.rejects(sync.applyVaultSync({ homeDir: m1 }), err => err.code === 'CONFLICTS' && err.conflicts[0].rel === 'config/settings.json' && err.conflicts[0].remote.by === 'alex-laptop');
  const resolved = await sync.applyVaultSync({ homeDir: m1, resolutions: { 'config/settings.json': 'remote' } });
  assert.equal(read(m1, '.config/robos/settings.json').default_ide, 'neovim');

  // The restore point brings the overwritten version back.
  sync.restoreRestorePoint({ homeDir: m1, id: resolved.restorePointId });
  assert.equal(read(m1, '.config/robos/settings.json').default_ide, 'zed');

  // Deleting a file on one machine deletes it on the other.
  fs.rmSync(path.join(m1, '.config/robos/movie-playlists.json'));
  const pd = await sync.planVaultSync({ homeDir: m1 });
  assert.ok(pd.actions.some(a => a.rel === 'config/movie-playlists.json' && a.action === 'delete-remote'));
  await sync.applyVaultSync({ homeDir: m1, resolutions: { 'config/settings.json': 'local' } });
  process.env.ROBOS_MACHINE_NAME = 'alex-laptop';
  await sync.applyVaultSync({ homeDir: m2 });
  assert.equal(exists(m2, '.config/robos/movie-playlists.json'), false);
  delete process.env.ROBOS_MACHINE_NAME;
});

test('an encrypted vault rejects a wrong passphrase and stores no plaintext', async () => {
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-enc-'));
  const m1 = makeHome('enc1', { '.config/robos/settings.json': { motto: 'plaintext-marker' } });
  await sync.connectVault({ homeDir: m1, create: { kind: 'folder', path: vaultDir, name: 'v' }, passphrase: 'correct horse' });
  await sync.applyVaultSync({ homeDir: m1 });
  const dir = path.join(vaultDir, 'v');
  const all = [fs.readFileSync(path.join(dir, 'robos-config.json')), ...fs.readdirSync(path.join(dir, 'blobs')).map(f => fs.readFileSync(path.join(dir, 'blobs', f)))];
  assert.ok(!Buffer.concat(all).toString('latin1').includes('settings.json'), 'paths are hidden inside the encrypted manifest');
  const m2 = makeHome('enc2');
  await assert.rejects(sync.connectVault({ homeDir: m2, ref: dir }), err => err.code === 'PASSPHRASE_REQUIRED');
  await assert.rejects(sync.connectVault({ homeDir: m2, ref: dir, passphrase: 'wrong' }), err => err.code === 'WRONG_PASSPHRASE');
  await sync.connectVault({ homeDir: m2, ref: dir, passphrase: 'correct horse' });
  await sync.applyVaultSync({ homeDir: m2 });
  assert.equal(read(m2, '.config/robos/settings.json').motto, 'plaintext-marker');
});

test('shares over Google Drive: access is enforced, items merge by id, updates arrive, leaving removes only shared items', async () => {
  const drive = await startMockDrive({ users: { 'tok-alex': 'alex@example.com', 'tok-bob': 'bob@example.com', 'tok-eve': 'eve@example.com' } });
  process.env.ROBOS_GDRIVE_API_BASE = drive.url;
  try {
    const alex = makeHome('alex');
    for (const [rel, c] of Object.entries(alexFiles(alex))) { fs.mkdirSync(path.dirname(path.join(alex, rel)), { recursive: true }); fs.writeFileSync(path.join(alex, rel), typeof c === 'string' ? c : JSON.stringify(c, null, 2)); }
    fs.writeFileSync(path.join(alex, '.config/robos/data-sources.json'), JSON.stringify([{ id: 'gdrive-alex', name: 'Alex Drive', driverType: 'gdrive', accessToken: 'tok-alex' }]));
    fs.writeFileSync(path.join(alex, '.config/robos/movie-folders.json'), JSON.stringify([{ id: 'f1', label: 'Movies', connectionId: 'gdrive-alex', path: '/Movies' }]));
    const bob = makeHome('bob', {
      '.config/robos/cloud-accounts.json': { accounts: [{ id: 'google-bob', provider: 'google', email: 'bob@example.com', accessToken: 'tok-bob' }] },
      '.config/robos/data-sources.json': [{ id: 'gdrive-bob', name: 'Bob Drive', driverType: 'gdrive', accessToken: 'tok-bob', loggedIn: true }],
      '.config/robos/git-projects.json': { projects: [{ id: 'mine', repo: 'bobs-dotfiles' }] },
      '.config/robos/app-mesh/mesh-state.json': { listenPort: 19290, peers: [] },
    });
    fs.writeFileSync(path.join(alex, '.config/robos/cloud-accounts.json'), JSON.stringify({ accounts: [{ id: 'google-alex', provider: 'google', email: 'alex@example.com', accessToken: 'tok-alex' }] }));

    // Without a passphrase the network secret cannot be included.
    await assert.rejects(sync.publishShare({ homeDir: alex, name: 'Family', categories: ['private-network'], includeNetworkSecret: true, target: { kind: 'gdrive', accountId: 'google-alex' } }), /encrypted share/);

    const pub = await sync.publishShare({
      homeDir: alex, name: 'Rivera family', template: 'family', categories: ['private-network', 'movie-library', 'smart-home', 'profile'],
      passphrase: 'popcorn', includeNetworkSecret: true, recipients: [], target: { kind: 'gdrive', accountId: 'google-alex' },
    });
    assert.deepEqual(pub.share.categories, ['private-network', 'movie-library', 'smart-home'], 'profile is never shareable');
    assert.match(pub.url, /\/drive\/folders\//);

    // Bob cannot open it until Alex shares it.
    await assert.rejects(sync.previewJoin({ homeDir: bob, ref: pub.url, accountId: 'google-bob', passphrase: 'popcorn' }), /not find|access/i);
    const grant = await sync.grantShare({ homeDir: alex, shareId: pub.share.id, recipients: ['Bob@Example.com'] });
    assert.equal(grant.grants[0].ok, true);
    assert.equal(drive.notifications[0].to, 'bob@example.com');
    await assert.rejects(sync.previewJoin({ homeDir: bob, ref: pub.url, accountId: 'google-bob', passphrase: 'nope' }), err => err.code === 'WRONG_PASSPHRASE');

    const preview = await sync.previewJoin({ homeDir: bob, ref: pub.url, accountId: 'google-bob', passphrase: 'popcorn' });
    assert.equal(preview.share.publisher.name, 'Alex Rivera');
    assert.deepEqual(preview.connections.map(c => [c.id, c.mappedTo]), [['gdrive-alex', 'gdrive-bob']]);
    const joined = await sync.joinShare({ homeDir: bob, ref: pub.url, accountId: 'google-bob', passphrase: 'popcorn' });
    const mesh = read(bob, '.config/robos/app-mesh/mesh-state.json');
    assert.equal(mesh.networkSecret, 'net-s3cret', 'the sealed network secret arrives inside the encrypted share');
    assert.equal(mesh.listenPort, 19290);
    assert.equal(read(bob, '.config/robos/movie-folders.json')[0].connectionId, 'gdrive-bob', "the movie folder uses Bob's own Drive sign-in");
    assert.equal(exists(bob, '.config/robos/identity.json'), false);
    assert.ok(joined.subscription.ownedItems > 0);

    // A second, unencrypted onboarding share merges into Bob's existing projects.
    const onboard = await sync.publishShare({ homeDir: alex, name: 'Acme onboarding', template: 'onboarding', categories: ['developer', 'kgraph'], recipients: ['bob@example.com'], target: { kind: 'gdrive', accountId: 'google-alex' } });
    assert.ok(onboard.requires.some(r => r.rel === 'config/db-manager-connections.json' && r.keys.includes('password')));
    await sync.joinShare({ homeDir: bob, ref: onboard.url, accountId: 'google-bob' });
    assert.deepEqual(read(bob, '.config/robos/git-projects.json').projects.map(p => p.id), ['mine', 'p1']);
    assert.equal(read(bob, '.config/robos/git-projects.json').projects[1].localPath, `${bob}/source/petstore-api`);

    // Alex adds a repository and republishes; Bob sees an update and applies it.
    const gp = read(alex, '.config/robos/git-projects.json');
    gp.projects.push({ id: 'p2', repo: 'billing-svc' });
    fs.writeFileSync(path.join(alex, '.config/robos/git-projects.json'), JSON.stringify(gp));
    await sync.updateShare({ homeDir: alex, shareId: onboard.share.id });
    const check = await sync.checkSubscriptions({ homeDir: bob });
    assert.equal(check.subscriptions.find(s => s.id === onboard.share.id).updateAvailable, true);
    await sync.updateSubscription({ homeDir: bob, subscriptionId: onboard.share.id });
    assert.deepEqual(read(bob, '.config/robos/git-projects.json').projects.map(p => p.id), ['mine', 'p1', 'p2']);

    // Leaving removes the shared projects and keeps Bob's own.
    const left = sync.leaveShare({ homeDir: bob, subscriptionId: onboard.share.id, removeItems: true });
    assert.ok(left.removedItems >= 2);
    assert.deepEqual(read(bob, '.config/robos/git-projects.json').projects.map(p => p.id), ['mine']);

    // Eve was never invited.
    const eve = makeHome('eve', { '.config/robos/cloud-accounts.json': { accounts: [{ id: 'google-eve', provider: 'google', email: 'eve@example.com', accessToken: 'tok-eve' }] } });
    await assert.rejects(sync.previewJoin({ homeDir: eve, ref: onboard.url, accountId: 'google-eve' }), /not find|access/i);

    // A share opened as a vault is refused with a clear message, and vice versa.
    await assert.rejects(sync.connectVault({ homeDir: bob, ref: onboard.url, accountId: 'google-bob' }), err => err.code === 'WRONG_KIND');
  } finally {
    delete process.env.ROBOS_GDRIVE_API_BASE;
    await drive.close();
  }
});

test('background sync applies one-sided changes, and a conflict or missing key notifies instead of writing', async () => {
  const auto = require('./config-sync-auto');
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-auto-'));
  const m1 = makeHome('auto1', alexFiles(os.tmpdir()));
  const m2 = makeHome('auto2');
  const notes = home => { try { return read(home, '.config/robos/notifications.json').filter(n => n.source === auto.SOURCE); } catch { return []; } };
  const ref = path.join(vaultDir, 'RobOS Config Vault');
  await sync.connectVault({ homeDir: m1, create: { kind: 'folder', path: vaultDir, name: 'RobOS Config Vault' } });
  assert.equal((await auto.runAutoSync({ homeDir: m1 })).outcome, 'first-sync-pending', 'the first sync is the user’s choice');
  await sync.applyVaultSync({ homeDir: m1, strategy: 'use-local' });
  await sync.connectVault({ homeDir: m2, ref });
  await sync.applyVaultSync({ homeDir: m2, strategy: 'use-vault' });

  assert.deepEqual(
    (({ enabled, intervalMinutes, watch }) => ({ enabled, intervalMinutes, watch }))(sync.getVault({ homeDir: m2 }).auto),
    { enabled: true, intervalMinutes: 5, watch: true }, 'on by default, every 5 minutes');
  assert.equal((await auto.runAutoSync({ homeDir: m2 })).outcome, 'up-to-date');

  // An edit on machine 1 reaches machine 2 with no one clicking Sync.
  fs.writeFileSync(path.join(m1, '.config/robos/movie-playlists.json'), JSON.stringify([{ id: 'pl1', name: 'Friday night' }, { id: 'pl2', name: 'Road trip' }]));
  const pushed = await auto.runAutoSync({ homeDir: m1 });
  assert.equal(pushed.outcome, 'synced');
  assert.deepEqual(pushed.pushed, ['config/movie-playlists.json']);
  const pulled = await auto.runAutoSync({ homeDir: m2 });
  assert.deepEqual([pulled.outcome, pulled.pulled], ['synced', ['config/movie-playlists.json']]);
  assert.ok(pulled.restorePointId, 'background pulls save a restore point too');
  assert.equal(read(m2, '.config/robos/movie-playlists.json')[1].name, 'Road trip');

  // Both machines change settings.json: machine 2 writes nothing and gets one notification.
  fs.writeFileSync(path.join(m1, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'zed' }));
  assert.equal((await auto.runAutoSync({ homeDir: m1 })).outcome, 'synced');
  fs.writeFileSync(path.join(m2, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'helix' }));
  fs.writeFileSync(path.join(m1, '.config/robos/ai-provider.json'), JSON.stringify({ active: 'codex' }));
  assert.equal((await auto.runAutoSync({ homeDir: m1 })).outcome, 'synced');
  const conflict = await auto.runAutoSync({ homeDir: m2 });
  assert.equal(conflict.outcome, 'conflicts');
  assert.equal(read(m2, '.config/robos/settings.json').default_ide, 'helix', 'the local edit is untouched');
  assert.equal(exists(m2, '.config/robos/ai-provider.json') && read(m2, '.config/robos/ai-provider.json').active, false, 'nothing else is applied while a conflict is open');
  assert.deepEqual((await sync.planVaultSync({ homeDir: m1 })).actions, [], 'the vault is not overwritten');
  let n = notes(m2);
  assert.equal(n.length, 1);
  assert.equal(n[0].title, 'Config Sync needs you: 1 conflict');
  assert.match(n[0].body, /settings\.json/);
  assert.deepEqual(n[0].action, { type: 'open-app', app: 'robos-preferences', label: 'Review in Preferences', open: { section: 'config_sync', tab: 'vault', reason: 'conflicts' } });
  assert.equal(sync.getVault({ homeDir: m2 }).auto.attention.kind, 'conflicts');
  assert.equal((await auto.runAutoSync({ homeDir: m2 })).notified, false, 'the same conflict is not announced twice');
  assert.equal(notes(m2).length, 1);

  // Resolving in Preferences clears it.
  await sync.applyVaultSync({ homeDir: m2, resolutions: { 'config/settings.json': 'local' } });
  assert.deepEqual(auto.clearAttention({ homeDir: m2 }), { ok: true, cleared: true });
  assert.equal(notes(m2)[0].read, true);
  assert.equal(sync.getVault({ homeDir: m2 }).auto.attention, null);
  assert.equal(read(m2, '.config/robos/ai-provider.json').active, 'codex');

  // Machine 1 picks up the version Alex kept.
  assert.deepEqual((await auto.runAutoSync({ homeDir: m1 })).pulled, ['config/settings.json']);
  assert.equal(read(m1, '.config/robos/settings.json').default_ide, 'helix');

  // Off means off; intervals are a fixed set.
  sync.setAutoSync({ homeDir: m2, enabled: false });
  fs.writeFileSync(path.join(m1, '.config/robos/settings.json'), JSON.stringify({ default_ide: 'vscode' }));
  assert.equal((await auto.runAutoSync({ homeDir: m1 })).outcome, 'synced');
  assert.equal((await auto.runAutoSync({ homeDir: m2 })).outcome, 'disabled');
  assert.equal(read(m2, '.config/robos/settings.json').default_ide, 'helix');
  assert.throws(() => sync.setAutoSync({ homeDir: m2, intervalMinutes: 7 }), err => err.code === 'BAD_INTERVAL');
  sync.setAutoSync({ homeDir: m2, enabled: true, intervalMinutes: 15 });
  assert.equal(sync.getVault({ homeDir: m2 }).auto.intervalMinutes, 15);

  // Preferences and the background never sync at the same time.
  fs.writeFileSync(path.join(m2, '.config/robos/config-sync/sync.lock'), String(process.pid));
  assert.equal((await auto.runAutoSync({ homeDir: m2 })).outcome, 'busy');
  await assert.rejects(sync.applyVaultSync({ homeDir: m2 }), err => err.code === 'BUSY');
  fs.writeFileSync(path.join(m2, '.config/robos/config-sync/sync.lock'), '999999999');
  assert.equal((await auto.runAutoSync({ homeDir: m2 })).outcome, 'synced', 'a lock left by a dead process is taken over');
  assert.equal(read(m2, '.config/robos/settings.json').default_ide, 'vscode');
});

test('background sync of an encrypted vault without a stored key asks for the passphrase', async () => {
  const auto = require('./config-sync-auto');
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-auto-enc-'));
  const m1 = makeHome('autoenc', { '.config/robos/settings.json': { a: 1 } });
  await sync.connectVault({ homeDir: m1, create: { kind: 'folder', path: vaultDir, name: 'v' }, passphrase: 'pw' });
  await sync.applyVaultSync({ homeDir: m1 });
  fs.rmSync(path.join(m1, '.config/robos/config-sync/keys.json'));
  const r = await auto.runAutoSync({ homeDir: m1 });
  assert.equal(r.outcome, 'locked');
  const n = read(m1, '.config/robos/notifications.json');
  assert.equal(n[0].title, 'Config Sync needs you: vault passphrase');
  assert.equal(n[0].action.open.reason, 'locked');
});

test('startAutoSync syncs at login and soon after a backed-up file changes', async () => {
  const auto = require('./config-sync-auto');
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-loop-'));
  const m1 = makeHome('loop', { '.config/robos/settings.json': { a: 1 }, '.config/robos/movie-playlists.json': [] });
  await sync.connectVault({ homeDir: m1, create: { kind: 'folder', path: vaultDir, name: 'v' } });
  await sync.applyVaultSync({ homeDir: m1 });
  fs.writeFileSync(path.join(m1, '.config/robos/settings.json'), JSON.stringify({ a: 2 }));
  const gen = () => sync.getVault({ homeDir: m1 }).lastGeneration;
  const until = async (fn, ms = 5000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 25)); } };
  const loop = auto.startAutoSync({ homeDir: m1, loginDelayMs: 50, debounceMs: 150, intervalMs: 60000 });
  try {
    await until(() => gen() === 2);
    assert.equal(sync.getVault({ homeDir: m1 }).auto.lastOutcome, 'synced', 'the login run pushed the pending edit');
    await new Promise(r => setTimeout(r, 1600)); // past the quiet period after our own writes
    fs.writeFileSync(path.join(m1, '.config/robos/movie-playlists.json'), JSON.stringify([{ id: 'x' }]));
    await until(() => gen() === 3);
    // Files that are never backed up (logs, caches, notifications) do not start a sync.
    const runs = sync.getVault({ homeDir: m1 }).auto.lastRunAt;
    fs.writeFileSync(path.join(m1, '.config/robos/notifications.json'), '[]');
    fs.writeFileSync(path.join(m1, '.config/robos/x-cache.json'), '{}');
    await new Promise(r => setTimeout(r, 500));
    assert.equal(sync.getVault({ homeDir: m1 }).auto.lastRunAt, runs);
  } finally { loop.stop(); }
});

test('the catalog puts unknown app files in "other" and excludes caches, logs and machine identity', () => {
  assert.equal(sync.categoryOf('config/brand-new-app.json'), 'other');
  assert.equal(sync.categoryOf('config/git-projects.json'), 'developer');
  assert.equal(sync.categoryOf('robos/kgraphs/core/package.jsonld'), 'kgraph');
  for (const rel of ['config/electron/a/Cookies', 'config/logs/x.log', 'config/app-mesh/identity.json', 'config/movie-public-metadata-cache.json', 'robos/videos/a.mp4', 'config/config-sync/state.json', 'config/profiled/profiled.sock']) {
    assert.equal(sync.isExcluded(rel), true, rel);
  }
  assert.equal(sync.isExcluded('config/movie-cache-settings.json'), false);
});
