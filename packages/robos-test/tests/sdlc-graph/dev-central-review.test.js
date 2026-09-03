'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Dev Central Interactive Proof-of-Work Review & Merge Hub Tests with In-Depth Assertions', () => {
  it('launches Dev Central, opens Interactive Review Hub, seeks chapters, and performs 1-Click Sign-Off & Merge', async () => {
    const app = await launchApp('dev-central', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'dev-central debug port should be allocated');

      // 1. Open Proof-of-Work Review Hub Modal
      await evalClick(app.port, '#btn-open-review-hub');
      await new Promise(r => setTimeout(r, 400));

      const isModalVisible = await evalJS(app.port, `!document.getElementById('review-modal').classList.contains('hidden')`);
      assert.strictEqual(isModalVisible, true, 'Review modal should be visible');

      // 2. Verify Quality Gates and Video Specs
      const qualityGatesCount = await evalJS(app.port, `document.querySelectorAll('.gate-card').length`);
      assert.strictEqual(qualityGatesCount, 4, 'Must render 4 quality gate badges');

      const videoResText = await evalJS(app.port, `document.querySelector('#review-video-player-card .type-badge').textContent`);
      assert.ok(videoResText.includes('1080p'), 'Must display 1080p resolution tag');

      // 3. Interactive Chapter Seeking
      await evalClick(app.port, '#chapter-seek-3');
      await new Promise(r => setTimeout(r, 300));

      const isChapter3Active = await evalJS(app.port, `document.getElementById('chapter-seek-3').classList.contains('active')`);
      assert.strictEqual(isChapter3Active, true, 'Chapter 3 should be active');

      const activeCaption = await evalJS(app.port, `document.getElementById('video-caption-hud').textContent.trim()`);
      assert.ok(activeCaption.includes('Apply Minimal Implementation'), 'Video caption should update on seek');

      // 4. Execute 1-Click Sign-Off & Merge
      await evalClick(app.port, '#btn-signoff-merge');
      await new Promise(r => setTimeout(r, 500));

      const statusText = await evalJS(app.port, `document.getElementById('review-status-pill').textContent`);
      assert.ok(statusText.includes('MERGED TO MAIN'), 'Status pill should reflect merged production reality');
    } finally {
      await killApp(app);
    }
  });
});
