'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('desktop-customizer unit tests', () => {
  // Test command parsing logic (extracted patterns)
  describe('slash command parsing', () => {
    it('parses /move-clock left correctly', () => {
      const input = '/move-clock left';
      const parts = input.slice(1).split(/\s+/);
      assert.strictEqual(parts[0], 'move-clock');
      assert.strictEqual(parts[1], 'left');
    });

    it('parses /theme accent #ff6b6b correctly', () => {
      const input = '/theme accent #ff6b6b';
      const parts = input.slice(1).split(/\s+/);
      assert.strictEqual(parts[0], 'theme');
      assert.strictEqual(parts[1], 'accent');
      assert.strictEqual(parts[2], '#ff6b6b');
    });

    it('parses /taskbar height 48px correctly', () => {
      const input = '/taskbar height 48px';
      const parts = input.slice(1).split(/\s+/);
      assert.strictEqual(parts[0], 'taskbar');
      assert.strictEqual(parts[1], 'height');
      assert.strictEqual(parts[2], '48px');
    });

    it('parses /shortcut ctrl+shift+t open terminal', () => {
      const input = '/shortcut ctrl+shift+t open terminal';
      const parts = input.slice(1).split(/\s+/);
      assert.strictEqual(parts[0], 'shortcut');
      assert.strictEqual(parts[1], 'ctrl+shift+t');
      assert.strictEqual(parts[2], 'open');
      assert.strictEqual(parts[3], 'terminal');
    });

    it('detects slash commands vs natural language', () => {
      assert.ok('/help'.startsWith('/'), 'Slash command detected');
      assert.ok(!'Move the clock'.startsWith('/'), 'Natural language detected');
    });

    it('parses /theme css with spaces in value', () => {
      const input = '/theme css .panel { height: 40px; }';
      const parts = input.slice(1).split(/\s+/);
      assert.strictEqual(parts[0], 'theme');
      assert.strictEqual(parts[1], 'css');
      const cssValue = parts.slice(2).join(' ');
      assert.strictEqual(cssValue, '.panel { height: 40px; }');
    });
  });

  describe('snapshot naming', () => {
    it('generates descriptive snapshot message from command', () => {
      const cmd = '/move-clock left';
      const message = `Before: ${cmd}`;
      assert.ok(message.includes('move-clock'));
      assert.ok(message.includes('left'));
    });
  });

  describe('history management', () => {
    it('trims history to 200 entries', () => {
      const history = Array.from({ length: 250 }, (_, i) => ({ role: 'user', content: `msg ${i}` }));
      const trimmed = history.length > 200 ? history.slice(-200) : history;
      assert.strictEqual(trimmed.length, 200);
      assert.strictEqual(trimmed[0].content, 'msg 50');
    });
  });
});
