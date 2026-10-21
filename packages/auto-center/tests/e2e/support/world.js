'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { execFileSync } = require('node:child_process');
const { setWorldConstructor, setDefaultTimeout } = require('@cucumber/cucumber');
const { _electron: electron } = require('../../../../robos-test/node_modules/playwright-core');
setDefaultTimeout(60000);
const fixtureCatalog = require('./fixture-catalog');
const ROOT = path.resolve(__dirname, '../../..');
const EVIDENCE = process.env.E2E_EVIDENCE_DIR ? path.resolve(process.env.E2E_EVIDENCE_DIR) : path.join(ROOT, 'evidence');
const PEOPLE = [['person-maria', 'Maria Lopez', 'maria@lopezauto.example'], ['person-dan', 'Dan Okafor', 'dan@lopezauto.example'], ['person-priya', 'Priya Shah', 'priya@example.com'], ['person-sam', 'Sam Rivera', 'sam@example.com']];
const GROUPS = [['shop-team', 'Shop team', ['person-maria', 'person-dan']], ['fleet-customers', 'Fleet customers', ['person-priya']]];
function fixtures(base) {
  const people = path.join(base, 'people'), groups = path.join(base, 'groups'); fs.mkdirSync(people, { recursive: true }); fs.mkdirSync(groups, { recursive: true });
  for (const [uid, displayName, email] of PEOPLE) fs.writeFileSync(path.join(people, uid + '.json'), JSON.stringify({ uid, displayName, email }));
  for (const [id, name, members] of GROUPS) fs.writeFileSync(path.join(groups, id + '.json'), JSON.stringify({ id, name, members }));
  return { people, groups };
}
class AutoWorld {
  constructor({ attach }) { this.attach = attach; this.ticket = null; this.lastMessage = ''; }
  async launch(scenarioSlug) {
    this.base = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-lifecycle-'));
    this.privateRoot = path.join(this.base, 'private'); const cache = path.join(this.base, 'cache'); fs.mkdirSync(cache, { recursive: true }); fixtureCatalog.build(cache);
    const { people, groups } = fixtures(this.base);
    this.videoDir = path.join(EVIDENCE, 'videos', '_raw', scenarioSlug); fs.rmSync(this.videoDir, { recursive: true, force: true }); fs.mkdirSync(this.videoDir, { recursive: true });
    this.app = await electron.launch({ executablePath: require(path.join(ROOT, 'node_modules/electron')), args: [path.join(ROOT, 'main.js'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      recordVideo: { dir: this.videoDir, size: { width: 1280, height: 800 } },
      env: { ...process.env, ...(process.env.E2E_OBD_LIVE ? {} : { ROBOS_AUTO_OBD_REPLAY: path.join(ROOT, 'tests/fixtures/obd', this.obdFixture || 'grand-caravan-2014-codes.json') }), ROBOS_AUTO_PRIVATE: this.privateRoot, ROBOS_AUTO_CACHE: cache, ROBOS_PEOPLE_DIR: people, ROBOS_GROUPS_DIR: groups } });
    this.page = await this.app.firstWindow(); this.errors = []; this.page.on('pageerror', e => this.errors.push(e.message));
    await this.page.setViewportSize({ width: 1280, height: 800 });
    await this.page.waitForFunction(() => document.querySelector('#count')?.textContent.includes('graph entries'));
  }
  async openShop() {
    const p = this.page; await p.locator('#mode').selectOption('shop');
    await p.waitForFunction(() => document.querySelector('#workspace-label').textContent === 'AUTO MAINTENANCE CENTER');
    await p.locator('[data-view="workshop"]').click(); await p.locator('#ws-pipeline .pipe-step').first().waitFor();
  }
  async drawer(id) { const d = this.page.locator('#' + id); if (!(await d.getAttribute('open')) && (await d.getAttribute('open')) !== '') await d.locator('summary').click(); this.focus = '#' + id; return d; }
  async fill(form, values) { for (const [name, value] of Object.entries(values)) { const c = this.page.locator(`${form} [name="${name}"]`); if ((await c.getAttribute('type')) === 'hidden') { await this.page.locator(`${form} [data-for="${name}"]`).fill(String(value)); continue; } if ((await c.evaluate(e => e.tagName)) === 'SELECT') await this.pick(c, value); else await c.fill(String(value)); } }
  async pick(select, label) { await select.selectOption({ label }).catch(async () => { const opts = await select.locator('option').allInnerTexts(); const hit = opts.find(o => o.startsWith(label)); if (!hit) throw new Error(`No option "${label}" in [${opts.join(' | ')}]`); await select.selectOption({ label: hit }); }); }
  async submit(form) {
    await this.page.locator(`${form} button`).last().click();
    await this.page.waitForTimeout(500); this.lastMessage = (await this.page.locator('#message').innerText()).trim();
  }
  ticketEl(key) { return this.page.locator(`article.ticket[data-key="${key || this.ticket}"]`); }
  async shot(name) {
    if (!this.page) return null;
    try { if (this.focus) await this.page.locator(this.focus).first().scrollIntoViewIfNeeded({ timeout: 1500 }); } catch {}
    const file = path.join(EVIDENCE, 'screens', name + '.jpg'); fs.mkdirSync(path.dirname(file), { recursive: true });
    const buf = await this.page.screenshot({ type: 'jpeg', quality: 82 }); fs.writeFileSync(file, buf); return { file, buf };
  }
  gitLog() { return execFileSync('git', ['log', '--format=%s'], { cwd: path.join(this.privateRoot, 'shop'), encoding: 'utf8' }); }
}
setWorldConstructor(AutoWorld);
module.exports = { EVIDENCE, ROOT };
