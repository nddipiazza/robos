'use strict';

// A vault or share folder typed as ~/Dropbox (the form's own hint) goes under the user's home,
// not into a literal "~" folder in the app's working directory.
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { connectVault, publishShare } = require('../../../robos-lib/config-sync');

describe('Config Sync folders typed with ~', () => {
  it('creates a vault under the home folder', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-home-'));
    const cwd = process.cwd();
    const work = path.join(home, 'work');
    fs.mkdirSync(work);
    process.chdir(work);
    try {
      await connectVault({ homeDir: home, create: { kind: 'folder', path: '~/Dropbox', name: 'RobOS Config Vault' } });
      assert.ok(fs.existsSync(path.join(home, 'Dropbox', 'RobOS Config Vault', 'robos-config.json')));
      assert.ok(!fs.existsSync(path.join(work, '~')));
    } finally {
      process.chdir(cwd);
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('treats ~\\folder, as typed on Windows, the same way', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-home-'));
    try {
      await connectVault({ homeDir: home, create: { kind: 'folder', path: '~\\Dropbox', name: 'V' } });
      assert.ok(fs.existsSync(path.join(home, 'Dropbox', 'V', 'robos-config.json')));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('keeps a full path as typed', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-home-'));
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-vault-disk-'));
    try {
      await connectVault({ homeDir: home, create: { kind: 'folder', path: elsewhere, name: 'V' } });
      assert.ok(fs.existsSync(path.join(elsewhere, 'V', 'robos-config.json')));
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('publishes a share under the home folder', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-share-home-'));
    try {
      await publishShare({ homeDir: home, name: 'Menu', categories: ['business'], target: { kind: 'folder', path: '~/Dropbox' } }).catch(err => {
        // An empty home may have nothing to share; the folder choice is what this test checks.
        if (err.code !== 'NOTHING_TO_SHARE') throw err;
      });
      assert.ok(!fs.existsSync(path.join(process.cwd(), '~')));
      assert.ok(fs.existsSync(path.join(home, 'Dropbox')), 'the folder is under the home folder');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
