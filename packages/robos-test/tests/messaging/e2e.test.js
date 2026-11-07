'use strict';

// RobOS Messaging end to end: the window lists the five networks, opens Snapchat's
// web sign-in in its own isolated session (a local page stands in for the site in
// test mode), links Signal through a fake signal-cli, shows a received message in the
// inbox with an unread count, and sends a reply and a new message.
//
// Set ROBOS_MESSAGING_SHOTS=<dir> to save a screenshot of each step.

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { launchApp, killApp } = require('../../lib/harness');
const { evalJS } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

const FAKE_SIGNAL = path.join(__dirname, 'fake-signal-cli.js');
const NUMBER = '+15550001111';

async function waitUntil(port, js, label, timeoutMs = 10000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    try {
      last = await evalJS(port, js);
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${label} (last: ${JSON.stringify(last)})`);
}

const click = (port, selector) => evalJS(port, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('missing ${selector}'); el.click(); return true; })()`);
const fill = (port, selector, value) => evalJS(port, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const text = (port, selector) => evalJS(port, `(document.querySelector(${JSON.stringify(selector)})?.innerText || '')`);

async function shot(port, name) {
  const dir = process.env.ROBOS_MESSAGING_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await new Promise((r) => setTimeout(r, 300));
  await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/screenshot`, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        let png = body;
        try {
          const parsed = JSON.parse(body.toString());
          const data = parsed.image || parsed.png || parsed.data || parsed.screenshot;
          if (data) png = Buffer.from(String(data).replace(/^data:image\/png;base64,/, ''), 'base64');
        } catch {}
        fs.writeFileSync(path.join(dir, `${name}.png`), png);
        resolve();
      });
    }).on('error', reject);
  });
}

describe('RobOS Messaging', () => {
  it('opens web sign-ins in their own sessions, links Signal, and reads and sends from the inbox', async () => {
    const signalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-messaging-signal-'));
    fs.writeFileSync(path.join(signalDir, 'accounts.json'), JSON.stringify([NUMBER]));
    const app = await launchApp('messaging', {
      ...scenarios['all-good'],
      name: 'messaging',
      env: {
        ROBOS_TEST: '1',
        ROBOS_MESSAGING_SIGNAL_BIN: FAKE_SIGNAL,
        FAKE_SIGNAL_DIR: signalDir,
        FAKE_SIGNAL_LINK_MS: '1500',
      },
    });
    const { port } = app;

    try {
      // Five networks, none set up.
      await waitUntil(port, `document.querySelectorAll('#network-list .nav-item').length === 5`, 'network list');
      const names = await evalJS(port, `[...document.querySelectorAll('#network-list .nav-label')].map((n) => n.firstChild.textContent)`);
      assert.deepStrictEqual(names, ['Messenger', 'Instagram', 'Snapchat', 'Signal', 'SMS']);
      assert.match(await text(port, '#nav-signal'), /Not set up/);
      assert.ok(await evalJS(port, `!document.getElementById('inbox-empty').hidden`), 'empty inbox explains what to connect');
      await shot(port, '01-inbox-empty');

      // Snapchat: web only. Its webview gets its own partition and no Node.
      await click(port, '#nav-snapchat');
      assert.match(await text(port, '#web-intro'), /Snapchat for Web/);
      await click(port, '#tab-api');
      assert.match(await text(port, '#api-card'), /no public messaging API/);
      await click(port, '#tab-web');
      await click(port, '#btn-web-on');
      await waitUntil(port, `!!document.getElementById('webview-snapchat')`, 'snapchat webview');
      const webview = await evalJS(port, `(() => { const w = document.getElementById('webview-snapchat'); return { partition: w.getAttribute('partition'), src: w.getAttribute('src'), ua: w.getAttribute('useragent') }; })()`);
      assert.strictEqual(webview.partition, 'persist:robos-messaging-snapchat');
      assert.match(webview.src, /^data:text\/html/, 'test mode never loads the real site');
      assert.doesNotMatch(webview.ua, /Electron/);
      await waitUntil(port, `(() => { try { return document.getElementById('webview-snapchat').getWebContentsId() > 0; } catch { return false; } })()`, 'snapchat webview attached');
      assert.match(await text(port, '#nav-snapchat'), /Web/);
      // A webview pointed anywhere else is refused by the main process.
      const refused = await evalJS(port, `new Promise((resolve) => {
        const w = document.createElement('webview');
        w.setAttribute('partition', 'persist:robos-messaging-snapchat');
        w.setAttribute('src', 'https://example.com/');
        document.body.append(w);
        setTimeout(() => { let attached = false; try { attached = w.getWebContentsId() > 0; } catch {} w.remove(); resolve(!attached); }, 1500);
      })`);
      assert.strictEqual(refused, true, 'a webview for another site is not attached');
      await shot(port, '02-snapchat-web');

      // Signal: link through signal-cli, then connect the number.
      await click(port, '#nav-signal');
      assert.ok(await evalJS(port, `document.getElementById('tab-api').classList.contains('active')`), 'Signal opens on its connector');
      assert.match(await text(port, '#api-card'), /Linked devices/);
      await click(port, '#btn-signal-link');
      await waitUntil(port, `/sgnl:\\/\\/linkdevice|QR code/.test(document.getElementById('signal-link').innerHTML)`, 'link address');
      assert.doesNotMatch(await text(port, '#api-card'), /\bnull\b|undefined/);
      await shot(port, '03-signal-link');
      await waitUntil(port, `/Linked\\./.test(document.getElementById('signal-link').innerText)`, 'linked', 8000);
      await fill(port, '#api-field-number', NUMBER);
      await click(port, '#btn-api-connect');
      await waitUntil(port, `/Connected as \\+15550001111/.test(document.getElementById('api-card').innerText)`, 'signal connected');
      assert.match(await text(port, '#nav-signal'), /\+15550001111/);
      await shot(port, '04-signal-connected');

      // A message arrives; the inbox shows it as unread.
      fs.appendFileSync(path.join(signalDir, 'inbox.jsonl'), `${JSON.stringify({ envelope: {
        sourceNumber: '+15552223333', sourceName: 'Dana', timestamp: Date.now(),
        dataMessage: { timestamp: Date.now(), message: 'Dinner at 7? <b>bold</b>' },
      } })}\n`);
      await click(port, '#nav-inbox');
      await click(port, '#btn-refresh');
      await waitUntil(port, `document.querySelectorAll('#conv-list .conv').length === 1`, 'conversation in inbox');
      assert.strictEqual(await text(port, '#inbox-count'), '1');
      assert.match(await text(port, '#conv-list'), /Dana/);
      assert.ok(await evalJS(port, `document.querySelector('#conv-list .conv').classList.contains('unread')`));
      await shot(port, '05-inbox-unread');

      // Open it: text is shown as text, never HTML, and reading clears the count.
      await click(port, '#conv-list .conv');
      await waitUntil(port, `!document.getElementById('thread').hidden`, 'thread');
      assert.strictEqual(await evalJS(port, `document.querySelector('#messages .msg-bubble').textContent`), 'Dinner at 7? <b>bold</b>');
      assert.strictEqual(await evalJS(port, `document.querySelectorAll('#messages b').length`), 0);
      await waitUntil(port, `document.getElementById('inbox-count').hidden`, 'unread cleared');

      // Reply.
      await fill(port, '#composer-text', 'Yes, see you there');
      await click(port, '#btn-send');
      await waitUntil(port, `document.querySelectorAll('#messages .msg.out').length === 1`, 'reply bubble');
      await shot(port, '06-thread-reply');

      // A new conversation from the New message form.
      await click(port, '#btn-new');
      assert.strictEqual(await evalJS(port, `document.getElementById('new-network').value`), 'signal');
      await fill(port, '#new-to', '+15556667777');
      await fill(port, '#new-text', 'Running late');
      await evalJS(port, `document.getElementById('new-form').requestSubmit()`);
      await waitUntil(port, `document.querySelectorAll('#conv-list .conv').length === 2`, 'new conversation');

      const sent = fs.readFileSync(path.join(signalDir, 'sent.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.deepStrictEqual(sent.map((s) => [s.recipient, s.message]), [
        ['+15552223333', 'Yes, see you there'],
        ['+15556667777', 'Running late'],
      ]);

      // The token-free files are where the CLI expects them.
      const accounts = JSON.parse(fs.readFileSync(path.join(app.sandboxHome, '.config', 'robos', 'messaging', 'accounts.json'), 'utf8'));
      assert.strictEqual(accounts.networks.signal.api.settings.number, NUMBER);
      assert.strictEqual(accounts.networks.snapchat.webEnabled, true);

      await click(port, '#nav-help');
      assert.match(await text(port, '#view-help'), /robos-messaging send --network signal/);
    } finally {
      await killApp(app);
      fs.rmSync(signalDir, { recursive: true, force: true });
    }
  });
});
