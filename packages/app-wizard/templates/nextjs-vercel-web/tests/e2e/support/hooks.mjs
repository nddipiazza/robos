import { Before, After, BeforeStep, AfterStep, AfterAll, Status } from '@cucumber/cucumber';
import fs from 'node:fs';
import path from 'node:path';
import { BASE_URL, closeBrowser } from './world.mjs';

const TYPE_TO_KEYWORD = { Context: 'GIVEN', Action: 'WHEN', Outcome: 'THEN', Unknown: 'AND' };

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);
}

Before(function ({ pickle, gherkinDocument }) {
  const feature = gherkinDocument.feature;
  const idx = String(path.basename(pickle.uri)).split('_')[0];
  this.timeline = {
    slug: `${idx}-${slugify(pickle.name)}`,
    scenario: pickle.name,
    feature: feature.name,
    featureDescription: (feature.description || '').trim().replace(/\s+/g, ' '),
    tags: pickle.tags.map((t) => t.name),
    baseUrl: BASE_URL,
    start: Date.now(),
    actors: [],
    steps: [],
  };
  fs.rmSync(this.scenarioDir, { recursive: true, force: true });
  fs.mkdirSync(this.scenarioDir, { recursive: true });
});

BeforeStep(function () {
  this.stepStart = Date.now();
  this.stepActors = new Set();
  this.stepApiLog = [];
});

AfterStep(async function ({ pickleStep, result }) {
  // Let the final state of the step sit on screen for a beat.
  await new Promise((r) => setTimeout(r, 600));
  let lastKeyword = this.timeline.steps.at(-1)?.keyword || 'GIVEN';
  const kw = TYPE_TO_KEYWORD[pickleStep.type] || 'AND';
  this.timeline.steps.push({
    keyword: kw === 'AND' ? lastKeyword : kw,
    text: pickleStep.text,
    actors: [...this.stepActors],
    api: this.stepApiLog,
    start: this.stepStart,
    end: Date.now(),
    status: result.status,
    error: result.status === Status.FAILED ? String(result.message || '').slice(0, 400) : undefined,
  });
  if (result.status === Status.FAILED) {
    for (const a of this.actors.values()) {
      try {
        await a.page.screenshot({ path: path.join(this.scenarioDir, `failure-${a.name.toLowerCase()}.png`) });
      } catch {}
    }
  }
});

After(async function ({ result }) {
  // Clean up test accounts (cascades everything the account owns).
  for (const a of this.actors.values()) {
    if (!a.email) continue;
    try {
      const res = await a.context.request.delete(`${BASE_URL}/api/account`, { data: { confirm: a.email } });
      this.timeline.cleanup = [...(this.timeline.cleanup || []), { actor: a.name, status: res.status() }];
    } catch (err) {
      this.timeline.cleanup = [...(this.timeline.cleanup || []), { actor: a.name, error: String(err) }];
    }
  }
  for (const a of this.actors.values()) {
    if (a.cdp) {
      await a.cdp.send('Page.stopScreencast').catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
    await a.context.close();
    await a.browser?.close();
    const entry = this.timeline.actors.find((x) => x.name === a.name);
    entry.label = a.label || null;
    if (a.frames.length) {
      const idx = `${a.name.toLowerCase()}-frames.json`;
      fs.writeFileSync(path.join(this.scenarioDir, idx), JSON.stringify({ dir: path.relative(this.scenarioDir, a.frameDir), frames: a.frames }));
      entry.frames = idx;
      entry.video = `${a.name.toLowerCase()}.mp4`;
      entry.videoStart = a.frames[0].t;
    }
  }
  this.timeline.end = Date.now();
  this.timeline.status = result.status;
  this.timeline.apiLog = this.apiLog;
  fs.writeFileSync(path.join(this.scenarioDir, 'timeline.json'), JSON.stringify(this.timeline, null, 2));
});

AfterAll(async function () {
  await closeBrowser();
});
