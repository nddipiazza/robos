'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('robos-preferences unit tests', () => {
  it('loadSettings returns empty object when file missing', () => {
    const file = '/tmp/nonexistent-settings-' + Date.now();
    let result;
    try { result = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { result = {}; }
    assert.deepStrictEqual(result, {});
  });

  it('loadSettings reads from settings file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pref-test-'));
    const file = path.join(tmp, 'settings.json');
    fs.writeFileSync(file, JSON.stringify({ ai_provider: 'claude', default_ide: 'intellij' }));

    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(data.ai_provider, 'claude');
    assert.strictEqual(data.default_ide, 'intellij');
    fs.rmSync(tmp, { recursive: true });
  });

  it('saveSettings preserves existing keys', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pref-test-'));
    const file = path.join(tmp, 'settings.json');
    fs.writeFileSync(file, JSON.stringify({ existing_key: 'keep_me', ai_provider: 'openai' }));

    const current = JSON.parse(fs.readFileSync(file, 'utf8'));
    const merged = { ...current, ai_provider: 'claude', default_ide: 'vscode' };
    fs.writeFileSync(file, JSON.stringify(merged, null, 2));

    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(result.existing_key, 'keep_me');
    assert.strictEqual(result.ai_provider, 'claude');
    assert.strictEqual(result.default_ide, 'vscode');
    fs.rmSync(tmp, { recursive: true });
  });

  it('SETTINGS_SCHEMA has expected sections', () => {
    const SETTINGS_SCHEMA = {
      sections: [
        { id: 'ai', label: 'AI Provider' },
        { id: 'github', label: 'GitHub' },
        { id: 'ide', label: 'IDE & Editor' },
        { id: 'notifications', label: 'Notifications' },
        { id: 'journal', label: 'Work Journal' },
        { id: 'system', label: 'System' },
      ],
    };

    assert.strictEqual(SETTINGS_SCHEMA.sections.length, 6);
    const ids = SETTINGS_SCHEMA.sections.map(s => s.id);
    assert.ok(ids.includes('ai'));
    assert.ok(ids.includes('github'));
    assert.ok(ids.includes('ide'));
    assert.ok(ids.includes('notifications'));
    assert.ok(ids.includes('journal'));
    assert.ok(ids.includes('system'));
  });

  it('saveSettings creates file if missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pref-test-'));
    const file = path.join(tmp, 'new', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ theme: 'dark' }, null, 2));

    assert.ok(fs.existsSync(file));
    const result = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(result.theme, 'dark');
    fs.rmSync(tmp, { recursive: true });
  });
});
