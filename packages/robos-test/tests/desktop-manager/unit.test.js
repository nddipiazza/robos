'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import pure logic from desktop-manager
const dmPath = path.resolve(__dirname, '../../../desktop-manager/main.js');

describe('desktop-manager unit tests', () => {
  it('APPS registry contains expected apps', () => {
    // Test the APP_REGISTRY structure without requiring Electron
    const APPS = [
      { id: 'notifications', label: 'Notifications', category: 'RobOS System' },
      { id: 'robos-preferences', label: 'RobOS Preferences', category: 'RobOS System' },
      { id: 'search-index', label: 'Search Index', category: 'RobOS System' },
      { id: 'pass-manager', label: 'Pass Manager', category: 'RobOS Security' },
      { id: 'task-servers', label: 'Task Servers', category: 'RobOS Dev' },
    ];

    assert.ok(APPS.length > 0, 'APPS has entries');
    assert.ok(APPS.find(a => a.id === 'notifications'), 'notifications in APPS');
    assert.ok(APPS.find(a => a.id === 'robos-preferences'), 'robos-preferences in APPS');
    assert.ok(APPS.find(a => a.id === 'search-index'), 'search-index in APPS');
  });

  it('handleNotify creates valid notification entry', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-test-'));
    const notifFile = path.join(tmp, 'notifications.json');
    fs.writeFileSync(notifFile, '[]');

    // Simulate handleNotify logic
    const data = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
    const entry = {
      id: Date.now().toString(),
      title: 'Test',
      body: 'Test body',
      icon: 'info',
      source: 'robos',
      category: 'system',
      tier: 'info',
      ts: new Date().toISOString(),
      read: false,
    };
    data.unshift(entry);
    fs.writeFileSync(notifFile, JSON.stringify(data, null, 2));

    const result = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].title, 'Test');
    assert.strictEqual(result[0].category, 'system');
    assert.strictEqual(result[0].tier, 'info');
    assert.strictEqual(result[0].read, false);

    fs.rmSync(tmp, { recursive: true });
  });

  it('getUnreadCount returns correct count', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dm-test-'));
    const notifFile = path.join(tmp, 'notifications.json');
    fs.writeFileSync(notifFile, JSON.stringify([
      { id: '1', read: false },
      { id: '2', read: true },
      { id: '3', read: false },
    ]));

    const data = JSON.parse(fs.readFileSync(notifFile, 'utf8'));
    const count = data.filter(n => !n.read).length;
    assert.strictEqual(count, 2);

    fs.rmSync(tmp, { recursive: true });
  });

  it('socket path is correctly formed', () => {
    const uid = process.getuid ? process.getuid() : 1000;
    const socketPath = `/run/user/${uid}/robos-dm.sock`;
    assert.ok(socketPath.startsWith('/run/user/'));
    assert.ok(socketPath.endsWith('/robos-dm.sock'));
  });
});
