'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const kdbx = require('../../robos-lib/kdbx-vault');

describe('RobOS KeePassXC .kdbx Single-Archive Keystore & Physical Key Engine', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-kdbx-test-'));
  const dbPath = path.join(tmpDir, 'robos-vault.kdbx');

  after(() => {
    try { kdbx.lockDatabase(); } catch {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  it('creates an encrypted KDBX 4.1 single-file archive and binds a Physical Key (FIDO2 hmac-secret)', async () => {
    const res = await kdbx.initDatabase({
      dbPath,
      password: 'TestMasterPassword!2026',
      mode: 'hardware-unlock',
      useHardwareKey: true,
      simulate: true,
    });
    assert.equal(res.ok, true, res.error || 'initDatabase should succeed');
    assert.equal(fs.existsSync(dbPath), true, '.kdbx file should exist on disk');
    assert.equal(fs.existsSync(`${dbPath}.fido2.json`), true, 'FIDO2 hmac-secret envelope should exist');
    assert.equal(res.hardwareEnrolled, true);

    const st = kdbx.getVaultStatus({ dbPath });
    assert.equal(st.exists, true);
    assert.equal(st.unlocked, true);
    assert.equal(st.hasFido2Binding, true);
    assert.equal(st.fido2Enrollment.mode, 'hardware-unlock');
  });

  it('adds, lists, reads, moves, and deletes entries inside the .kdbx archive', () => {
    const add1 = kdbx.saveEntry({
      dbPath,
      entryPath: 'work/github',
      username: 'ndipiazza',
      password: 'ghp_SecretTokenValue123!',
      url: 'https://github.com',
      notes: 'GitHub PAT stored inside single .kdbx archive',
    });
    assert.equal(add1.ok, true, add1.error);

    const add2 = kdbx.saveEntry({
      dbPath,
      entryPath: 'cloud/aws-prod',
      username: 'admin@robos.local',
      password: 'AKIA_SecretPassword456!',
      url: 'https://console.aws.amazon.com',
      notes: 'Production AWS console',
    });
    assert.equal(add2.ok, true, add2.error);

    const list = kdbx.listEntries({ dbPath });
    assert.equal(list.ok, true, list.error);
    assert.ok(list.entries.includes('work/github'));
    assert.ok(list.entries.includes('cloud/aws-prod'));

    const item = kdbx.getEntry({ dbPath, entryPath: 'work/github' });
    assert.equal(item.ok, true, item.error);
    assert.equal(item.entry.username, 'ndipiazza');
    assert.equal(item.entry.password, 'ghp_SecretTokenValue123!');
    assert.equal(item.entry.url, 'https://github.com');

    // Move entry
    const mv = kdbx.moveEntry({ dbPath, fromPath: 'cloud/aws-prod', toPath: 'infra/aws-prod' });
    assert.equal(mv.ok, true, mv.error);
    const listAfterMove = kdbx.listEntries({ dbPath });
    assert.ok(listAfterMove.entries.includes('infra/aws-prod'));

    // Delete entry
    const del = kdbx.deleteEntry({ dbPath, entryPath: 'infra/aws-prod' });
    assert.equal(del.ok, true, del.error);
    const listAfterDel = kdbx.listEntries({ dbPath });
    assert.ok(!listAfterDel.entries.includes('infra/aws-prod'));
  });

  it('locks the .kdbx keystore and unlocks it using Physical Key FIDO2 hmac-secret touch', async () => {
    const lockRes = kdbx.lockDatabase();
    assert.equal(lockRes.ok, true);

    const lockedStatus = kdbx.getVaultStatus({ dbPath });
    assert.equal(lockedStatus.unlocked, false);

    // Listing while locked should report locked: true
    const lockedList = kdbx.listEntries({ dbPath });
    assert.equal(lockedList.locked, true);

    // Unlock using Physical Key FIDO2 hmac-secret
    const unlockRes = await kdbx.unlockWithHardwareKey({
      dbPath,
      simulate: true,
    });
    assert.equal(unlockRes.ok, true, unlockRes.error);
    assert.equal(unlockRes.unlockedVia, 'hardware-key');

    // Verify we can read entries again
    const item = kdbx.getEntry({ dbPath, entryPath: 'work/github' });
    assert.equal(item.ok, true);
    assert.equal(item.entry.password, 'ghp_SecretTokenValue123!');
  });

  it('locks and unlocks with Master Password and inspects KDBX cipher metadata', () => {
    kdbx.lockDatabase();
    const pwUnlock = kdbx.unlockWithPassword({
      dbPath,
      password: 'TestMasterPassword!2026',
    });
    assert.equal(pwUnlock.ok, true, pwUnlock.error);

    const info = kdbx.getDatabaseInfo({ dbPath });
    assert.equal(info.ok, true, info.error);
    assert.match(info.raw, /AES 256-bit|KDF/i);

    const gen = kdbx.generatePassword({ length: 28, upper: true, lower: true, digits: true, special: true });
    assert.equal(gen.ok, true);
    assert.equal(gen.password.length, 28);
  });
});
