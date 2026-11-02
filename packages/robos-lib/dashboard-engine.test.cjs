'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { renderDashboardTvWallboardHtml } = require('./dashboard-engine');

test('the TV wallboard page has a script that parses', () => {
  const html = renderDashboardTvWallboardHtml({ hostIp: '127.0.0.1', portalPort: 19210, tvName: 'Test TV', tvIp: '192.0.2.1',
    resolvedDashboard: { id: 'test', title: 'Test', layout: 'grid', cards: [] } });
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.ok(scripts.length > 0);
  // A \n in the page's source becomes a real line break inside a string unless it is escaped twice.
  for (const script of scripts) assert.doesNotThrow(() => new vm.Script(script));
});
