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

/**
 * Start a debug HTTP server for remote snapshot access.
 * Useful for capturing state from SSH without needing IPC.
 *
 * Endpoints:
 *   GET /snapshot       — JSON DOM tree
 *   GET /text-snapshot  — Text-based accessibility snapshot
 *   GET /screenshot     — base64 PNG
 *   POST /eval          — execute JS in renderer, body = raw JS string
 *   GET /health         — { ok: true, appId, title }
 */
function startDebugServer(win, port, appId) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/snapshot' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(SNAPSHOT_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(result);
      } else if (req.url === '/text-snapshot' && req.method === 'GET') {
        const result = await win.webContents.executeJavaScript(TEXT_SNAPSHOT_SCRIPT);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(result);
      } else if (req.url === '/screenshot' && req.method === 'GET') {
        const img = await win.webContents.capturePage();
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img.toPNG());
      } else if (req.url === '/eval' && req.method === 'POST') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
          const result = await win.webContents.executeJavaScript(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result }));
        });
        return;
      } else if (req.url === '/health' && req.method === 'GET') {
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

  server.listen(port, '0.0.0.0', () => {
    console.log(`[robos-debug] ${appId} debug server on http://0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { registerSnapshotIPC, startDebugServer };
