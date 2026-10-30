'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const hk = require('../lib/hardware-keys-core');
const { BUILTIN_APPS } = require('../../robos-icons');
const { PORT_REGISTRY } = require('../../robos-lib/snapshot-cli');

describe('RobOS Hardware Keys — Core & Registry Suite', () => {
  it('formats AAGUIDs and decodes firmware integers accurately', () => {
    const raw = 'e77e3c6405e3428b88240cbeb04b829d';
    const formatted = hk.formatAaguid(raw);
    assert.equal(formatted, 'e77e3c64-05e3-428b-8824-0cbeb04b829d');
    assert.equal(hk.KNOWN_AAGUIDS[formatted], 'Yubico Security Key C NFC (Firmware 5.7)');
    assert.equal(hk.decodeFirmwareInt(329473), '5.7.1');
  });

  it('parses ykman info and ykman fido info for Security Key C NFC (5.7.1)', () => {
    const sampleInfo = [
      'Device type: Security Key C NFC',
      'Firmware version: 5.7.1',
      'Form factor: Keychain (USB-C)',
      'Enabled USB interfaces: FIDO',
      'NFC transport is enabled',
      '',
      'Applications\tUSB          \tNFC          ',
      'Yubico OTP  \tNot available\tNot available',
      'FIDO U2F    \tEnabled      \tEnabled',
      'FIDO2       \tEnabled      \tEnabled',
    ].join('\n');

    const sampleFido = [
      'AAGUID:                       e77e3c64-05e3-428b-8824-0cbeb04b829d',
      'PIN:                          Not set',
      'Minimum PIN length:           4',
      'Always Require UV:            Off',
      'Credential storage remaining: 100',
    ].join('\n');

    const parsed = hk.parseYkmanInfo(sampleInfo, sampleFido, 'Security Key C NFC (5.7.1) [FIDO]');
    assert.equal(parsed.deviceType, 'Security Key C NFC');
    assert.equal(parsed.firmwareVersion, '5.7.1');
    assert.equal(parsed.formFactor, 'Keychain (USB-C)');
    assert.equal(parsed.nfcEnabled, true);
    assert.deepEqual(parsed.enabledUsbInterfaces, ['FIDO']);
    assert.equal(parsed.applications['FIDO2'].usb, 'Enabled');
    assert.equal(parsed.applications['FIDO2'].nfc, 'Enabled');
    assert.equal(parsed.fido.aaguid, 'e77e3c64-05e3-428b-8824-0cbeb04b829d');
    assert.equal(parsed.fido.pinSet, false);
    assert.equal(parsed.fido.remainingCredentials, 100);
  });

  it('detects hardware keys cleanly via detectHardwareKeys()', () => {
    const res = hk.detectHardwareKeys();
    assert.equal(res.ok, true);
    assert.equal(typeof res.connected, 'boolean');
    assert.ok(Array.isArray(res.keys));
    if (res.connected) {
      const k = res.keys[0];
      assert.ok(k.name.length > 0);
      assert.ok(k.fido);
      assert.ok(Array.isArray(k.fido.algorithms));
    }
  });

  it('executes simulated physical touch challenge and returns cryptographic proof fields', async () => {
    const statuses = [];
    const res = await hk.runPhysicalTouchChallenge({
      rpId: 'robos.local',
      simulate: true,
      onStatus: (s) => statuses.push(s),
    });
    assert.equal(res.ok, true);
    assert.equal(res.simulated, true);
    assert.equal(res.rpId, 'robos.local');
    assert.equal(res.userPresent, true);
    assert.equal(res.challengeHex.length, 64);
    assert.equal(res.signatureHex.length, 128);
    assert.ok(statuses.some(s => s.state === 'waiting-touch'));
  });

  it('identifies hardware-backed (-sk) SSH keys vs standard SSH keys', () => {
    const tmpSsh = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-hk-ssh-'));
    try {
      fs.writeFileSync(
        path.join(tmpSsh, 'id_ed25519_sk'),
        '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----\n'
      );
      fs.writeFileSync(
        path.join(tmpSsh, 'id_ed25519_sk.pub'),
        'sk-ssh-ed25519@openssh.com AAAAGnNrLXNzaC1lZDI1NTE5QG9wZW5zc2guY29tAAAAI... robos-yubikey@host\n'
      );
      fs.writeFileSync(
        path.join(tmpSsh, 'id_ed25519.pub'),
        'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... standard@host\n'
      );

      const keys = hk.listSshKeys(tmpSsh);
      assert.equal(keys.length, 2);
      const skKey = keys.find(k => k.name === 'id_ed25519_sk');
      const stdKey = keys.find(k => k.name === 'id_ed25519');
      assert.ok(skKey);
      assert.equal(skKey.isHardwareSk, true);
      assert.equal(skKey.hasPrivateKey, true);
      assert.ok(stdKey);
      assert.equal(stdKey.isHardwareSk, false);
    } finally {
      fs.rmSync(tmpSsh, { recursive: true, force: true });
    }
  });

  it('persists config and parses PAM U2F enrollment in ~/.config/Yubico/u2f_keys', () => {
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-hk-home-'));
    try {
      const cfg = hk.loadConfig(tmpHome);
      cfg.policies.requireTouchForPassUnlock = true;
      hk.saveConfig(cfg, tmpHome);

      const reloaded = hk.loadConfig(tmpHome);
      assert.equal(reloaded.policies.requireTouchForPassUnlock, true);

      const yubiDir = path.join(tmpHome, '.config', 'Yubico');
      fs.mkdirSync(yubiDir, { recursive: true });
      fs.writeFileSync(path.join(yubiDir, 'u2f_keys'), 'ndipiazza:KeyHandle123,PubKey456,es256,+presence\n');

      const sysStatus = hk.getSystemIntegrationStatus(tmpHome);
      assert.equal(sysStatus.pamEnrolled, true);
      assert.equal(sysStatus.pamKeys.length, 1);
      assert.equal(sysStatus.pamKeys[0].user, 'ndipiazza');
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it('is registered in robos-icons, snapshot-cli.js, and hardware-keys.desktop', () => {
    const iconEntry = BUILTIN_APPS.find(a => a.appId === 'hardware-keys');
    assert.ok(iconEntry, 'hardware-keys must be registered in BUILTIN_APPS');
    assert.equal(iconEntry.category, 'Security');
    assert.equal(PORT_REGISTRY['hardware-keys'], 19218);

    const desktopPath = path.join(__dirname, '..', 'hardware-keys.desktop');
    const desktopContent = fs.readFileSync(desktopPath, 'utf8');
    assert.ok(desktopContent.includes('X-RobOS-App=true'));
    assert.ok(desktopContent.includes('X-RobOS-Category=Security'));
  });
});
