'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { getSnapshot, findById, findByText, flatText, findAllNodes } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('git-login-manager E2E', () => {
  describe('all-broken scenario', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('git-login-manager', scenarios['all-broken']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows failure badge', () => {
      const badge = findById(snap, 'overall-badge');
      assert.ok(badge, 'overall-badge exists');
      assert.ok(badge.class.includes('badge-fail'), `badge class should be fail, got: ${badge.class}`);
      assert.ok(badge.text.includes('issue'), `badge text should mention issues, got: ${badge.text}`);
    });

    it('shows all check rows as failed', () => {
      for (const id of ['row-ghAuth', 'row-sshKey', 'row-sshConn', 'row-gitCfg']) {
        const row = findById(snap, id);
        assert.ok(row, `${id} exists`);
        const dots = findAllNodes(row, n => n.class && n.class.includes('check-dot'));
        assert.ok(dots.length > 0, `${id} has a check-dot`);
        assert.ok(dots[0].class.includes('fail'), `${id} dot should be fail, got: ${dots[0].class}`);
      }
    });

    it('shows fix buttons for failed checks', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Login'), 'Login button visible');
      assert.ok(allText.includes('Generate Key'), 'Generate Key button visible');
    });
  });

  describe('fresh-install scenario (same as all-broken for git-login-manager)', () => {
    let app, snap;

    before(async () => {
      app = await launchApp('git-login-manager', scenarios['fresh-install']);
      snap = await getSnapshot(app.port);
    });
    after(() => killApp(app));

    it('shows git identity as missing', () => {
      const allText = flatText(snap);
      assert.ok(allText.includes('Missing'), 'Should show Missing for git config');
    });
  });
});
