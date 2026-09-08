'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const SLUG = 'skills-manager';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../../docs/assets/images/screenshots');
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/b3eec328-5b7c-4d20-9d65-749de9fa59ce';
const TEMPMEDIA_DIR = path.join(BRAIN_DIR, '.tempmediaStorage');

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchScreenshot(port, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}/screenshot`, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Screenshot failed with status code ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Screenshot timeout')); });
  });
}

function saveFrame(filename, buffer) {
  const targets = [
    path.join(PERSIST_DIR, filename),
    path.join(DOCS_DIR, filename),
    path.join(BRAIN_DIR, filename),
    path.join(TEMPMEDIA_DIR, filename),
  ];
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
    } catch (err) {
      console.warn(`Could not save frame to ${target}: ${err.message}`);
    }
  }
}

describe('Skills Manager End-to-End & Screenshot Test Suite', () => {
  it('exercises full workflow across skills, categories, search, modal, and packs while capturing documentation screenshots', async () => {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.mkdirSync(TEMPMEDIA_DIR, { recursive: true });

    const app = await launchApp('skills-manager', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'skills-manager debug port should be allocated');
      await sleep(2000);

      // ─────────────────────────────────────────────────────────────────────────
      // 1. Initial State & Overview
      // ─────────────────────────────────────────────────────────────────────────
      const skillCount = await evalJS(app.port, `document.querySelectorAll('.skill-card').length`);
      assert.ok(skillCount >= 50, `Expected at least 50 skills loaded, got ${skillCount}`);

      const frame1 = await fetchScreenshot(app.port);
      assert.ok(frame1.length > 30000, 'Frame 1 must be valid PNG');
      saveFrame('skills-manager-overview.png', frame1);

      // ─────────────────────────────────────────────────────────────────────────
      // 2. Filter by Git Category
      // ─────────────────────────────────────────────────────────────────────────
      await evalJS(app.port, `
        (() => {
          const tab = [...document.querySelectorAll('#category-tabs .cat-tab')]
            .find(t => t.textContent.trim() === 'Git');
          if (tab) tab.click();
        })()
      `);
      await sleep(400);

      const gitCount = await evalJS(app.port, `document.querySelectorAll('.skill-card').length`);
      assert.ok(gitCount >= 7, `Expected at least 7 Git skills, got ${gitCount}`);

      const frame2 = await fetchScreenshot(app.port);
      assert.ok(frame2.length > 30000, 'Frame 2 must be valid PNG');
      saveFrame('skills-manager-git-category.png', frame2);

      // ─────────────────────────────────────────────────────────────────────────
      // 3. Search Filter & Parameterization
      // ─────────────────────────────────────────────────────────────────────────
      await evalJS(app.port, `
        (() => {
          const allTab = document.querySelector('#category-tabs .cat-tab');
          if (allTab) allTab.click();
          const s = document.getElementById('search-input');
          if (s) {
            s.value = 'port';
            s.dispatchEvent(new Event('input', { bubbles: true }));
          }
        })()
      `);
      await sleep(400);

      const portCount = await evalJS(app.port, `document.querySelectorAll('.skill-card').length`);
      assert.ok(portCount > 0 && portCount < skillCount, `Expected filtered port skills, got ${portCount}`);

      const frame3 = await fetchScreenshot(app.port);
      assert.ok(frame3.length > 30000, 'Frame 3 must be valid PNG');
      saveFrame('skills-manager-search-parameter.png', frame3);

      // ─────────────────────────────────────────────────────────────────────────
      // 4. Create Custom Skill Modal
      // ─────────────────────────────────────────────────────────────────────────
      await evalJS(app.port, `
        (() => {
          const s = document.getElementById('search-input');
          if (s) {
            s.value = '';
            s.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.getElementById('btn-add-skill')?.click();
        })()
      `);
      await sleep(300);

      const modalVisible = await evalJS(app.port, `document.getElementById('skill-modal').style.display !== 'none'`);
      assert.ok(modalVisible, 'Skill modal should be open');

      await evalJS(app.port, `
        (() => {
          const name = document.getElementById('field-name');
          if (name) { name.value = 'Recent System Errors'; name.dispatchEvent(new Event('input', { bubbles: true })); }
          const cat = document.getElementById('field-category');
          if (cat) { cat.value = 'System'; cat.dispatchEvent(new Event('input', { bubbles: true })); }
          const desc = document.getElementById('field-description');
          if (desc) { desc.value = 'Show the last 50 error-level systemd journal entries'; desc.dispatchEvent(new Event('input', { bubbles: true })); }
          const cmd = document.getElementById('field-command');
          if (cmd) { cmd.value = 'journalctl -p err -n 50 --no-pager'; cmd.dispatchEvent(new Event('input', { bubbles: true })); }
        })()
      `);
      await sleep(300);

      const frame4 = await fetchScreenshot(app.port);
      assert.ok(frame4.length > 30000, 'Frame 4 must be valid PNG');
      saveFrame('skills-manager-create-modal.png', frame4);

      // Save skill
      await evalClick(app.port, '#btn-modal-save');
      await sleep(400);

      const createdFound = await evalJS(app.port, `
        [...document.querySelectorAll('.skill-card')].some(c => c.textContent.includes('Recent System Errors'))
      `);
      assert.ok(createdFound, 'New custom skill should be rendered in grid');

      // ─────────────────────────────────────────────────────────────────────────
      // 5. Skill Packs Marketplace
      // ─────────────────────────────────────────────────────────────────────────
      await evalClick(app.port, '#tab-skill-packs');
      await sleep(500);

      const packsCount = await evalJS(app.port, `document.querySelectorAll('#packs-grid .pack-card').length`);
      assert.ok(packsCount >= 3, `Expected at least 3 featured skill packs, got ${packsCount}`);

      const frame5 = await fetchScreenshot(app.port);
      assert.ok(frame5.length > 30000, 'Frame 5 must be valid PNG');
      saveFrame('skills-manager-packs-marketplace.png', frame5);

      // ─────────────────────────────────────────────────────────────────────────
      // 6. Pattern Browser & AI Prompt Preview
      // ─────────────────────────────────────────────────────────────────────────
      await evalJS(app.port, `
        (() => {
          const btn = document.querySelector('[data-action="browse-pack"][data-pack-id="robos/sdlc-essentials"]');
          if (btn) btn.click();
        })()
      `);
      await sleep(600);

      const patternsCount = await evalJS(app.port, `document.querySelectorAll('#pattern-list .pattern-row').length`);
      assert.ok(patternsCount >= 10, `Expected SDLC patterns rendered, got ${patternsCount}`);

      // Click first pattern preview button to open preview pane
      await evalJS(app.port, `
        (() => {
          const previewBtn = document.querySelector('#pattern-list [data-action="preview"]');
          if (previewBtn) previewBtn.click();
        })()
      `);
      await sleep(600);

      const previewVisible = await evalJS(app.port, `document.getElementById('preview-pane').style.display !== 'none'`);
      assert.ok(previewVisible, 'Preview pane should be visible');

      const previewText = await evalJS(app.port, `document.getElementById('preview-content')?.textContent || ''`);
      assert.ok(previewText.length > 20, 'Preview content should show prompt template');

      const frame6 = await fetchScreenshot(app.port);
      assert.ok(frame6.length > 30000, 'Frame 6 must be valid PNG');
      saveFrame('skills-manager-pattern-browser.png', frame6);

      // Switch back to My Skills
      await evalClick(app.port, '#btn-back-to-packs');
      await sleep(200);
      await evalClick(app.port, '#tab-my-skills');
      await sleep(300);

    } finally {
      await killApp(app);
    }
  });
});
