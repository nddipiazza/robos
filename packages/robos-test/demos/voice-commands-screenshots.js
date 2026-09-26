'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const { launchApp, killApp } = require('../lib/harness');
const scenarios = require('../lib/scenarios');

const DOCS_DIR = path.resolve(__dirname, '../../../docs/assets/images/screenshots');
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', 'voice-commands');

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

function evalJS(port, code, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ js: code });
    const req = http.request({
      hostname: 'localhost',
      port,
      path: '/eval',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed.result);
        } catch (err) {
          resolve(null);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function saveFrame(filename, buffer) {
  const targets = [
    path.join(PERSIST_DIR, filename),
    path.join(DOCS_DIR, filename),
  ];
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
  console.log('Starting Voice Commands Screenshot Capture...');
  fs.mkdirSync(PERSIST_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });

  const app = await launchApp('voice-prompt', {
    ...scenarios['all-good'],
    env: { ROBOS_TEST: '1' },
  });

  try {
    const port = app.port || 19188;
    console.log(`Voice prompt app online on port ${port}. Setting up HUD state...`);
    await sleep(2000);

    // 1. Setup speech bubbles with voice command execution card and bounce state
    await evalJS(port, `
      (function() {
        const chatFeed = document.getElementById('chat-feed');
        const welcomeEl = document.getElementById('welcome-placeholder');
        if (welcomeEl) welcomeEl.classList.add('hidden');
        if (chatFeed) {
          chatFeed.innerHTML = '';

          // Bubble 1: open git projects
          const b1 = document.createElement('div');
          b1.className = 'dictation-bubble';
          b1.innerHTML = \`
            <div class="bubble-header">
              <span class="bubble-time">10:41 AM</span>
              <button type="button" class="btn-copy-msg"><span class="copy-label">Copy</span></button>
            </div>
            <div class="bubble-text">open git projects</div>
            <div class="bubble-command-card">
              <div class="command-card-header">
                <div class="command-card-title-group">
                  <span class="command-card-icon">⚡</span>
                  <span class="command-type-badge app">App</span>
                  <span class="command-card-title">Open Git Projects</span>
                </div>
                <span class="command-status-badge done">✓ Done</span>
              </div>
              <div class="command-card-result">Launched Git Projects desktop repository workspace.</div>
            </div>
          \`;
          chatFeed.appendChild(b1);

          // Bubble 2: validate knowledge graph
          const b2 = document.createElement('div');
          b2.className = 'dictation-bubble command-matched-bounce';
          b2.innerHTML = \`
            <div class="bubble-header">
              <span class="bubble-time">10:42 AM</span>
              <button type="button" class="btn-copy-msg"><span class="copy-label">Copy</span></button>
            </div>
            <div class="bubble-text">validate knowledge graph</div>
            <div class="bubble-command-card">
              <div class="command-card-header">
                <div class="command-card-title-group">
                  <span class="command-card-icon">⚡</span>
                  <span class="command-type-badge skill">Skill</span>
                  <span class="command-card-title">Validate Knowledge Graph SHACL Shapes</span>
                </div>
                <span class="command-status-badge done">✓ Done</span>
              </div>
              <div class="command-card-result">✔ Knowledge Graph passes 100% of W3C SHACL shape constraints (0 violations).</div>
            </div>
          \`;
          chatFeed.appendChild(b2);

          // Bubble 3: active listening interim bubble
          const b3 = document.createElement('div');
          b3.className = 'dictation-bubble interim';
          b3.innerHTML = \`
            <div class="bubble-header">
              <span class="bubble-time">10:42 AM</span>
              <span class="bubble-live-badge"><span class="live-dot"></span><span>Listening</span></span>
            </div>
            <div class="bubble-text">what is the git status in the active window</div>
          \`;
          chatFeed.appendChild(b3);
        }
      })()
    `);
    await sleep(600);

    console.log('Capturing Screenshot 1: robos-voice-hud-bubble-command.png');
    const shot1 = await fetchScreenshot(port);
    saveFrame('robos-voice-hud-bubble-command.png', shot1);

    // 2. Open Voice Activated Commands configuration modal
    console.log('Opening Voice Activated Commands Modal...');
    await evalJS(port, `
      (function() {
        const btn = document.getElementById('btn-voice-commands');
        if (btn) btn.click();
      })()
    `);
    await sleep(1000);

    console.log('Capturing Screenshot 2: robos-voice-commands-modal.png');
    const shot2 = await fetchScreenshot(port);
    saveFrame('robos-voice-commands-modal.png', shot2);

    // 3. Filter modal by "knowledge" search term
    console.log('Filtering modal search by "knowledge"...');
    await evalJS(port, `
      (function() {
        const input = document.getElementById('commands-search-input');
        if (input) {
          input.value = 'knowledge';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()
    `);
    await sleep(600);

    console.log('Capturing Screenshot 3: robos-voice-commands-search.png');
    const shot3 = await fetchScreenshot(port);
    saveFrame('robos-voice-commands-search.png', shot3);

    console.log('✔ All 3 voice command screenshots generated and saved successfully!');
  } finally {
    await killApp(app);
  }
}

main().catch(err => {
  console.error('Screenshot generator error:', err);
  process.exit(1);
});
