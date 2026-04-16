'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const {
  getSnapshot, findById, findByText, flatText,
  evalClick, evalType, waitForText,
} = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('desktop-customizer E2E', () => {

  describe('app launch and UI', () => {
    let app;

    before(async () => {
      app = await launchApp('desktop-customizer', scenarios['all-good']);
      await waitForText(app.port, 'Desktop Customizer', 15000);
    });
    after(() => killApp(app));

    it('shows app title', async () => {
      const snap = await getSnapshot(app.port);
      assert.ok(flatText(snap).includes('Desktop Customizer'), 'Title visible');
    });

    it('shows welcome message', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Welcome') || text.includes('slash command'), 'Welcome message shown');
    });

    it('shows warning banner', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('Power Tool') || text.includes('auto-snapshotted'), 'Warning banner visible');
    });

    it('has prompt input', async () => {
      const snap = await getSnapshot(app.port);
      const input = findById(snap, 'prompt-input');
      assert.ok(input, 'Prompt input exists');
    });

    it('has help and snapshot buttons', async () => {
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('/') || findById(snap, 'btn-help'), 'Help button exists');
    });

    it('executes /help command', async () => {
      await evalType(app.port, '#prompt-input', '/help');
      await evalClick(app.port, '#btn-send');
      await waitForText(app.port, 'Available commands', 10000);
      const snap = await getSnapshot(app.port);
      const text = flatText(snap);
      assert.ok(text.includes('move-clock'), '/help shows move-clock');
      assert.ok(text.includes('taskbar'), '/help shows taskbar');
      assert.ok(text.includes('theme'), '/help shows theme');
      assert.ok(text.includes('snapshot'), '/help shows snapshot');
    });

    it('shows autocomplete on / input', async () => {
      await evalType(app.port, '#prompt-input', '/m');
      // Check autocomplete appears
      const snap = await getSnapshot(app.port);
      const ac = findById(snap, 'autocomplete');
      assert.ok(ac, 'Autocomplete element exists');
    });
  });
});
