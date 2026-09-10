'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const { evalJS, maximizeWindow } = require('../lib/snapshot');
const scenarios = require('../lib/scenarios');

const SLUG = 'pr-review-theater';
const HOME_DIR = process.env.HOME || '/home/ndipiazza';
const PERSIST_DIR = path.join(HOME_DIR, '.robos', 'development', 'walkthroughs', SLUG);
const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const BRAIN_DIR = process.env.BRAIN_DIR || null;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchScreenshot(port, timeoutMs = 15000) {
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
  ];
  if (BRAIN_DIR) {
    targets.push(path.join(BRAIN_DIR, filename));
  }
  for (const target of targets) {
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
      console.log(`Saved ${filename} (${buffer.length} bytes) -> ${target}`);
    } catch (err) {
      console.warn(`Could not save to ${target}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('Starting PR Review Theater screenshot generation...');
  const app = await launchApp('pr-review', scenarios['pr-review-github']);
  console.log(`pr-review launched on port ${app.port}`);

  try {
    await maximizeWindow(app.port);
    await sleep(2500);

    // 1. Capture PR Queue / List
    console.log('Capturing Frame 1: PR Queue List...');
    const frame1 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-01-queue.png', frame1);

    // 2. Select PR #12
    console.log('Selecting PR #12...');
    await evalJS(app.port, `
      (() => {
        const card = document.querySelector('.pr-card[data-number="12"]') || document.querySelector('.pr-card');
        if (card) card.click();
      })()
    `);
    await sleep(2000);

    console.log('Capturing Frame 2: PR Detail Overview...');
    const frame2 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-02-pr-detail.png', frame2);

    // 3. Launch PR Review Theater
    console.log('Opening PR Review Theater...');
    await evalJS(app.port, `
      (() => {
        const btn = document.getElementById('btn-enter-theater');
        if (btn) btn.click();
      })()
    `);
    await sleep(1500);

    // Frame 3: Stage 1 - eLearning Curriculum & Knowledge Check
    console.log('Capturing Frame 3: Stage 1 - Training & eLearning...');
    const frame3 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-03-stage1-elearning.png', frame3);

    // Submit knowledge check to get 100% and show verified credential
    console.log('Submitting Knowledge Check Quiz...');
    await evalJS(app.port, `
      (async () => {
        // Select correct answers: q1 -> index 1, q2 -> index 2, q3 -> index 1
        const r1 = document.querySelector('input[name="q-q1-mtls"][value="1"]');
        if (r1) r1.checked = true;
        const r2 = document.querySelector('input[name="q-q2-transaction"][value="2"]');
        if (r2) r2.checked = true;
        const r3 = document.querySelector('input[name="q-q3-kgraph-merge"][value="1"]');
        if (r3) r3.checked = true;
        await window.submitTheaterQuiz();
      })()
    `);
    await sleep(1500);

    console.log('Capturing Frame 4: Stage 1 - Verified Certificate of Completion...');
    const frame4 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-04-stage1-certificate.png', frame4);

    // 4. Switch to Stage 2: Living Docs & Flow
    console.log('Switching to Stage 2: Living Docs...');
    await evalJS(app.port, `window.setTheaterStage(2)`);
    await sleep(1200);

    console.log('Capturing Frame 5: Stage 2 - Living Architecture Docs & Sequence Flow...');
    const frame5 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-05-stage2-living-docs.png', frame5);

    // 5. Switch to Stage 3: File Diff Viewer
    console.log('Switching to Stage 3: File Diff Viewer...');
    await evalJS(app.port, `
      (() => {
        window.setTheaterStage(3);
        window.selectDiffFile(1); // select PetService.java
      })()
    `);
    await sleep(1200);

    console.log('Capturing Frame 6: Stage 3 - In-App File Diff Viewer...');
    const frame6 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-06-stage3-diff-viewer.png', frame6);

    // 6. Switch to Stage 4: IDE Branch Diff Bridge
    console.log('Switching to Stage 4: IDE Branch Diffs...');
    await evalJS(app.port, `window.setTheaterStage(4)`);
    await sleep(1200);

    console.log('Capturing Frame 7: Stage 4 - IDE Branch Diff Bridge...');
    const frame7 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-07-stage4-ide-bridge.png', frame7);

    // 7. Switch to Stage 5: Proof-of-Work Video Walkthrough
    console.log('Switching to Stage 5: Proof-of-Work Video...');
    await evalJS(app.port, `window.setTheaterStage(5)`);
    await sleep(1200);

    console.log('Capturing Frame 8: Stage 5 - Proof-of-Work Video Walkthrough...');
    const frame8 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-08-stage5-video.png', frame8);

    // 8. Switch to Stage 6: Validation Gates & Sign-Off
    console.log('Switching to Stage 6: Sign-Off & Merge...');
    await evalJS(app.port, `window.setTheaterStage(6)`);
    await sleep(1200);

    console.log('Capturing Frame 9: Stage 6 - Validation Gates & Sign-Off...');
    const frame9 = await fetchScreenshot(app.port);
    saveFrame('pr-review-theater-09-stage6-signoff.png', frame9);

    console.log('✔ All 9 PR Review Theater screenshots captured successfully!');
  } finally {
    await killApp(app);
    console.log('Terminated pr-review.');
  }

  // Also capture RobOS eLearning Hub app
  try {
    console.log('Launching robos-elearning app...');
    const elearningApp = await launchApp('robos-elearning', scenarios['fresh-install']);
    await maximizeWindow(elearningApp.port);
    await sleep(2500);

    console.log('Capturing Frame 10: RobOS eLearning Hub...');
    const frame10 = await fetchScreenshot(elearningApp.port);
    saveFrame('robos-elearning-hub-player.png', frame10);
    await killApp(elearningApp);
    console.log('Terminated robos-elearning.');
  } catch (err) {
    console.warn('Could not capture robos-elearning screenshot:', err.message);
  }
}

main().catch(err => {
  console.error('Failure:', err);
  process.exit(1);
});
