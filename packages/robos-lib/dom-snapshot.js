/**
 * RobOS DOM Snapshot — Playwright-style accessibility snapshots for Electron apps.
 *
 * Usage in main.js:
 *   const { registerSnapshotIPC } = require('robos-lib/dom-snapshot');
 *   registerSnapshotIPC(mainWindow);
 *
 * Capture from host via SSH:
 *   ssh -p 2224 robos@localhost \
 *     "DISPLAY=:0 electron /usr/local/share/robos/<app-id>/main.js --snapshot"
 *
 * Or via the debug HTTP endpoint (if enabled):
 *   curl http://localhost:<debug-port>/snapshot
 */

const { ipcMain } = require('electron');
const http = require('http');

// JavaScript to inject into the renderer to capture DOM state
const SNAPSHOT_SCRIPT = `
(function() {
  function snapshot(el, depth) {
    if (depth > 15) return null;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;

    const rect = el.getBoundingClientRect();
    const node = {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
    };

    // Useful attributes
    if (el.id) node.id = el.id;
    if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim();
      if (cls) node.class = cls;
    }
    if (el.getAttribute('aria-label')) node.ariaLabel = el.getAttribute('aria-label');
    if (el.title) node.title = el.title;
    if (el.placeholder) node.placeholder = el.placeholder;
    if (el.value !== undefined && el.value !== '') node.value = el.value;
    if (el.href) node.href = el.href;
    if (el.src) node.src = el.src;
    if (el.disabled) node.disabled = true;
    if (el.checked) node.checked = true;

    // Text content (direct text only, not children)
    const text = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .filter(Boolean)
      .join(' ');
    if (text) node.text = text;

    // Bounding box (rounded)
    if (rect.width > 0 && rect.height > 0) {
      node.bounds = {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      };
    }

    // Visible state
    if (el.classList.contains('hidden') || style.opacity === '0') {
      node.hidden = true;
    }

    // Children
    const children = Array.from(el.children)
      .map(c => snapshot(c, depth + 1))
      .filter(Boolean);
    if (children.length > 0) node.children = children;

    return node;
  }

  return JSON.stringify(snapshot(document.body, 0), null, 2);
})()
`;

// Compact text-based snapshot (like Playwright's toMatchAriaSnapshot)
const TEXT_SNAPSHOT_SCRIPT = `
(function() {
  function textSnapshot(el, indent) {
    if (indent > 10) return '';
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    if (el.classList.contains('hidden')) return '';

    const pad = '  '.repeat(indent);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || '';
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
      : '';

    // Direct text
    const text = Array.from(el.childNodes)
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent.trim())
      .filter(Boolean)
      .join(' ');

    let line = pad + tag;
    if (role && role !== tag) line += '[role=' + role + ']';
    if (id) line += id;
    if (cls && cls !== '.') line += cls;
    if (el.placeholder) line += ' placeholder="' + el.placeholder + '"';
    if (el.value) line += ' value="' + el.value + '"';
    if (el.disabled) line += ' [disabled]';
    if (text) line += ' "' + text.substring(0, 80) + '"';

    const lines = [line];
    for (const child of el.children) {
      const childLines = textSnapshot(child, indent + 1);
      if (childLines) lines.push(childLines);
    }
    return lines.join('\\n');
  }

  return textSnapshot(document.body, 0);
})()
`;

/**
 * Register snapshot IPC handlers on a BrowserWindow.
 * Call this after creating the window.
 */
function registerSnapshotIPC(win) {
  ipcMain.handle('__robos_dom_snapshot', async () => {
    const result = await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
    return JSON.parse(result);
  });

  ipcMain.handle('__robos_text_snapshot', async () => {
    return await win.webContents.executeJavaScript(TEXT_SNAPSHOT_SCRIPT);
  });

  ipcMain.handle('__robos_screenshot', async () => {
    const img = await win.webContents.capturePage();
    return img.toPNG().toString('base64');
  });

  ipcMain.handle('__robos_eval', async (_event, js) => {
    return await win.webContents.executeJavaScript(js);
  });
}

// ── Interaction scripts ───────────────────────────────────────────────────────

/**
 * Click the first element matching a CSS selector.
 * Fires mousedown → mouseup → click in sequence so React/Vue listeners fire.
 */
const CLICK_SCRIPT = (selector) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'No element matched: ' + ${JSON.stringify(selector)} };
  el.scrollIntoView({ block: 'center' });
  ['mousedown','mouseup','click'].forEach(type => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  });
  el.focus && el.focus();
  return { ok: true, tag: el.tagName, text: (el.textContent || '').trim().slice(0, 80) };
})()`;

/**
 * Fill an input / textarea / contenteditable element and fire input + change.
 */
const FILL_SCRIPT = (selector, value) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'No element matched: ' + ${JSON.stringify(selector)} };
  el.focus && el.focus();
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    'value'
  );
  if (nativeInputValueSetter) {
    nativeInputValueSetter.set.call(el, ${JSON.stringify(value)});
  } else if (el.isContentEditable) {
    el.textContent = ${JSON.stringify(value)};
  } else {
    el.value = ${JSON.stringify(value)};
  }
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: el.value || el.textContent };
})()`;

/**
 * Select an <option> by value or visible text in a <select>.
 */
const SELECT_SCRIPT = (selector, value) => `
(function() {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return { ok: false, error: 'No element matched: ' + ${JSON.stringify(selector)} };
  const opt = Array.from(el.options).find(o => o.value === ${JSON.stringify(value)} || o.text === ${JSON.stringify(value)});
  if (!opt) return { ok: false, error: 'No option matched: ' + ${JSON.stringify(value)} };
  el.value = opt.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selected: opt.text };
})()`;

// ── DOM event recorder (LogRocket-style session replay) ───────────────────────

/**
 * Install a MutationObserver + event listeners in the renderer.
 * Events accumulate in window.__robosEventLog until drained or stopped.
 *
 * Each event entry:
 *   { t: <ms since start>, type: 'mutation'|'click'|'input'|'change'|'keydown', ... }
 */
const RECORDER_START_SCRIPT = `
(function() {
  if (window.__robosRecorder) return { ok: true, status: 'already running' };

  const log = [];
  const start = Date.now();
  const ts = () => Date.now() - start;

  function sel(el) {
    if (!el || el === document.body) return 'body';
    const id   = el.id ? '#' + el.id : '';
    const cls  = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  }

  // MutationObserver for DOM mutations
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      const entry = { t: ts(), type: 'mutation', kind: m.type, target: sel(m.target) };
      if (m.type === 'attributes') {
        entry.attr = m.attributeName;
        entry.newValue = m.target.getAttribute(m.attributeName);
      } else if (m.type === 'characterData') {
        entry.value = m.target.textContent.slice(0, 120);
      } else if (m.type === 'childList') {
        entry.added   = m.addedNodes.length;
        entry.removed = m.removedNodes.length;
        // Capture added node text for context
        if (m.addedNodes.length) {
          const first = m.addedNodes[0];
          entry.addedText = (first.textContent || '').trim().slice(0, 80);
        }
      }
      log.push(entry);
    }
  });
  mo.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
    attributeOldValue: false,
  });

  // User interaction events
  function onEvent(e) {
    const entry = { t: ts(), type: e.type, target: sel(e.target) };
    if (e.type === 'click')    { entry.x = Math.round(e.clientX); entry.y = Math.round(e.clientY); }
    if (e.type === 'input' || e.type === 'change') entry.value = (e.target.value || '').slice(0, 120);
    if (e.type === 'keydown')  { entry.key = e.key; entry.code = e.code; }
    log.push(entry);
  }

  for (const t of ['click','input','change','keydown','focus','blur']) {
    document.addEventListener(t, onEvent, { capture: true, passive: true });
  }

  window.__robosEventLog      = log;
  window.__robosRecorderStart = start;
  window.__robosRecorder      = { mo, onEvent };

  return { ok: true, status: 'started', startTime: start };
})()`;

const RECORDER_DRAIN_SCRIPT = `
(function() {
  if (!window.__robosEventLog) return { ok: false, error: 'recorder not running' };
  const events = window.__robosEventLog.splice(0);
  return { ok: true, count: events.length, events };
})()`;

const RECORDER_STOP_SCRIPT = `
(function() {
  if (!window.__robosRecorder) return { ok: false, error: 'recorder not running' };
  window.__robosRecorder.mo.disconnect();
  for (const t of ['click','input','change','keydown','focus','blur']) {
    document.removeEventListener(t, window.__robosRecorder.onEvent, { capture: true });
  }
  const events = (window.__robosEventLog || []).splice(0);
  window.__robosRecorder = null;
  return { ok: true, status: 'stopped', count: events.length, events };
})()`;

// ── Helper: read POST body ────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { resolve({ __raw: body }); }
    });
    req.on('error', reject);
  });
}

/**
 * Start a debug HTTP server for remote snapshot and interaction.
 *
 * Interaction endpoints (Electron-native, no xdotool):
 *   POST /click          { "selector": "button#add" }
 *   POST /fill           { "selector": "input#name", "value": "hello" }
 *   POST /select         { "selector": "select#type", "value": "jira" }
 *
 * Snapshot endpoints:
 *   GET  /snapshot       — JSON DOM tree
 *   GET  /text-snapshot  — text accessibility snapshot
 *   GET  /screenshot     — PNG image
 *   POST /eval           — raw JS body → { result }
 *
 * Event recorder (LogRocket-style DOM session replay):
 *   POST /events/start   — install MutationObserver + event listeners
 *   GET  /events/drain   — return+clear buffered events since last drain
 *   GET  /events/stop    — stop recorder, return all remaining events
 *
 *   GET  /health         — { ok, appId, title }
 */
function startDebugServer(win, port, appId) {
  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    try {
      // ── Snapshots ────────────────────────────────────────────────────────
      if (url === '/snapshot' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);

      } else if (url === '/text-snapshot' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(TEXT_SNAPSHOT_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(result);

      } else if (url === '/screenshot' && req.method === 'GET') {
        const img = await win.webContents.capturePage();
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img.toPNG());

      // ── Raw eval ─────────────────────────────────────────────────────────
      } else if (url === '/eval' && req.method === 'POST') {
        const body = await readBody(req);
        const js   = body.__raw || (typeof body === 'string' ? body : body.js || '');
        const result = await win.webContents.executeJavaScript(js || 'null');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ result }));

      // ── Interaction ──────────────────────────────────────────────────────
      } else if (url === '/click' && req.method === 'POST') {
        const { selector } = await readBody(req);
        if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'selector required' })); return; }
        const result = await win.webContents.executeJavaScript(CLICK_SCRIPT(selector));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } else if (url === '/fill' && req.method === 'POST') {
        const { selector, value } = await readBody(req);
        if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'selector required' })); return; }
        const result = await win.webContents.executeJavaScript(FILL_SCRIPT(selector, value ?? ''));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } else if (url === '/select' && req.method === 'POST') {
        const { selector, value } = await readBody(req);
        if (!selector) { res.writeHead(400); res.end(JSON.stringify({ error: 'selector required' })); return; }
        const result = await win.webContents.executeJavaScript(SELECT_SCRIPT(selector, value ?? ''));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      // ── Event recorder ───────────────────────────────────────────────────
      } else if (url === '/events/start' && req.method === 'POST') {
        const result = await win.webContents.executeJavaScript(RECORDER_START_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } else if (url === '/events/drain' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(RECORDER_DRAIN_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      } else if (url === '/events/stop' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(RECORDER_STOP_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));

      // ── Health ───────────────────────────────────────────────────────────
      } else if (url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, appId, title: win.getTitle() }));

      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[robos-debug] port ${port} already in use (another user may have this app open); debug server not started`);
    } else {
      console.error(`[robos-debug] server error: ${err.message}`);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[robos-debug] ${appId} debug server on http://0.0.0.0:${port}`);
  });

  return server;
}

module.exports = {
  registerSnapshotIPC,
  startDebugServer,
  // Scripts exported for use in test harnesses and snapshot-cli
  SNAPSHOT_SCRIPT,
  TEXT_SNAPSHOT_SCRIPT,
  CLICK_SCRIPT,
  FILL_SCRIPT,
  SELECT_SCRIPT,
  RECORDER_START_SCRIPT,
  RECORDER_DRAIN_SCRIPT,
  RECORDER_STOP_SCRIPT,
};
