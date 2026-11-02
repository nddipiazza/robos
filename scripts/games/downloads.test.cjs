'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'site/assets/game-downloads.js'), 'utf8');
async function page(userAgent, response = { ok: false, status: 503 }, extraNavigator = {}) {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const link = (dataset, textContent = '') => ({ dataset, textContent, href: 'static-download', hasAttribute: name => name === 'data-game-download' && !!dataset.gameDownload });
  const button = link({ gameDownload: 'quest-warrior-dragon', gameVersion: version });
  const alternative = link({ gameAsset: `quest-warrior-dragon-v${version}-Linux-x64.zip` }, 'Linux (.zip)');
  const status = { textContent: '' };
  const document = { querySelectorAll: selector => selector === '[data-game-download]' ? [button] : selector === '[data-game-download-status]' ? [status] : [button, alternative].filter(item => item.dataset.gameAsset) };
  vm.runInNewContext(script, { document, navigator: { userAgent, ...extraNavigator }, AbortSignal, fetch: async () => response });
  await new Promise(resolve => setImmediate(resolve));
  return { button, alternative, status, version };
}
for (const [agent, target, label] of [['Windows NT 10.0', 'Windows-Setup.exe', 'Windows'], ['X11; Linux x86_64', 'Linux-x64.zip', 'Linux'], ['Macintosh; Intel Mac OS X', 'macOS.zip', 'macOS']]) {
  test(`${label} primary button downloads the standalone game for that OS`, async () => {
    const { button, version } = await page(agent);
    assert.equal(button.href, `https://github.com/nddipiazza/robos/releases/download/games-v${version}/quest-warrior-dragon-v${version}-${target}`);
    assert.match(button.textContent, new RegExp(label));
  });
}
test('phones and touch iPads are directed to desktop choices', async () => {
  for (const [agent, extra] of [['Android; Linux', {}], ['Macintosh', { platform: 'MacIntel', maxTouchPoints: 5 }]]) {
    const { button, status } = await page(agent, undefined, extra);
    assert.equal(button.href, '#download'); assert.match(status.textContent, /computer/);
  }
});
test('a missing release gives a readable status instead of a broken asset link', async () => {
  const { button, alternative, status } = await page('Windows', { ok: false, status: 404 });
  assert.equal(button.href, 'https://github.com/nddipiazza/robos/releases');
  assert.match(alternative.textContent, /pending/); assert.match(status.textContent, /prepared/);
});
test('uploaded assets resolve to their direct verified release URLs', async () => {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const url = `https://github.com/nddipiazza/robos/releases/download/games-v${version}/quest-warrior-dragon-v${version}-Windows-Setup.exe`;
  const { button } = await page('Windows', { ok: true, json: async () => ({ assets: [{ name: `quest-warrior-dragon-v${version}-Windows-Setup.exe`, state: 'uploaded', browser_download_url: url }] }) });
  assert.equal(button.href, url); assert.match(button.textContent, /Download & play/);
});
test('every standalone game page has the shared download controls and actual source project', () => {
  const games = require('../../site/_data/games.json');
  for (const [id, game] of Object.entries(games)) {
    const source = fs.readFileSync(path.join(root, 'site/games', id, 'index.md'), 'utf8');
    assert.ok(source.includes(`game_id: ${id}`));
    assert.ok(source.includes('{% include game-download-button.html %}'));
    assert.ok(source.includes('{% include game-downloads.html %}'));
    assert.ok(fs.existsSync(path.join(root, 'games', game.project, 'project.godot')));
  }
});
test('uninstall removes only packaged files and uses filesystem-safe shortcut names', () => {
  const { nsisInstaller } = require('./build.cjs');
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'game-package-test-'));
  try {
    fs.writeFileSync(path.join(temp, 'QuestWarriorDragon.exe'), 'fixture');
    const nsi = nsisInstaller({ id: 'quest-warrior-dragon', game: { title: 'Quest: Warrior Dragon', executable: 'QuestWarriorDragon' }, version: '1.0.0', payload: temp, output: temp });
    assert.ok(nsi.includes('$DESKTOP\\Quest Warrior Dragon.lnk'));
    assert.ok(!nsi.includes('RMDir /r'));
    assert.ok(nsi.includes('Delete "$INSTDIR\\QuestWarriorDragon.exe"'));
    assert.ok(nsi.includes('RequestExecutionLevel user'));
    assert.ok(nsi.includes('MUI_FINISHPAGE_RUN'));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
