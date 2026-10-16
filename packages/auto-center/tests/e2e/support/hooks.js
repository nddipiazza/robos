'use strict';
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { Before, After, AfterStep, AfterAll, BeforeAll, Status } = require('@cucumber/cucumber');
const { EVIDENCE } = require('./world');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const manifest = [];
BeforeAll(() => { for (const d of ['videos', 'screens']) fs.rmSync(path.join(EVIDENCE, d), { recursive: true, force: true }); fs.mkdirSync(path.join(EVIDENCE, 'videos'), { recursive: true }); });
Before(async function ({ pickle, gherkinDocument }) {
  const feature = path.basename(pickle.uri, '.feature');
  this.slug = feature + '--' + slug(pickle.name); this.shotIndex = 0; this.shots = [];
  await this.launch(this.slug); await this.openShop();
});
AfterStep(async function ({ pickleStep, result }) {
  if (!this.page) return;
  const kind = pickleStep.type;
  if (kind === 'Context' && result.status === Status.PASSED) return;
  await this.page.waitForTimeout(450);
  const name = `${this.slug}--${String(++this.shotIndex).padStart(2, '0')}`;
  const s = await this.shot(name); if (!s) return;
  this.attach(s.buf, 'image/jpeg');
  if (this.afterShot) { const f = this.afterShot; this.afterShot = null; await f(); }
  this.shots.push({ step: pickleStep.text, type: kind, file: path.relative(EVIDENCE, s.file), status: result.status });
});
After(async function ({ pickle, result }) {
  if (!this.app) return;
  const video = this.page.video(); const errors = this.errors;
  await this.app.close();
  let rel = null;
  try { const raw = await video.path(); const dest = path.join(EVIDENCE, 'videos', this.slug + '.webm'); fs.renameSync(raw, dest); rel = path.relative(EVIDENCE, dest); } catch {}
  manifest.push({ scenario: pickle.name, uri: pickle.uri, slug: this.slug, status: result.status, video: rel, shots: this.shots, pageErrors: errors });
  if (errors.length && result.status === Status.PASSED) throw new Error('Page errors: ' + errors.join('; '));
});
AfterAll(() => {
  fs.writeFileSync(path.join(EVIDENCE, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.rmSync(path.join(EVIDENCE, 'videos', '_raw'), { recursive: true, force: true });
  const vids = manifest.map(m => m.video).filter(Boolean).sort();
  if (!vids.length) return;
  try {
    const list = path.join(EVIDENCE, 'videos', 'list.txt');
    fs.writeFileSync(list, vids.map(v => `file '${path.join(EVIDENCE, v)}'`).join('\n'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(EVIDENCE, 'auto-center-suite.mp4')], { timeout: 600000 });
    fs.rmSync(list);
  } catch (e) { console.error('Combined suite video failed:', e.message); }
});
