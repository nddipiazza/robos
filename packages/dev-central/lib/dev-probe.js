'use strict';
/**
 * Dev Central — dev-mode probe (only started with `npm run dev` / --dev).
 *
 * Lets an agent (or you) inspect the RUNNING app without a debugger: write `.debug/request.json` and the app
 * answers with `.debug/result.json` (+ `.debug/screenshot.png`).
 *
 *   request.json  { "id": "any-string", "eval": "document.querySelector('th[data-sort=key]').click()", "wait": 300 }
 *   result.json   { id, ok, evalResult, error, state, console[], at }
 *
 * `state` is whatever window.__dcDebug() returns in the renderer (view, mode, sort, visible rows, epics, …).
 * `eval` and `wait` are optional; with neither, it just takes a fresh snapshot. Dev mode only — never ship enabled.
 */
const fs = require('node:fs');
const path = require('node:path');

function start({ getWindow, dir }) {
  fs.mkdirSync(dir, { recursive: true });
  const reqFile = path.join(dir, 'request.json');
  const logs = [];
  let attached = null;
  const attach = w => {
    if (!w || w.isDestroyed() || attached === w) return;
    attached = w;
    w.webContents.on('console-message', (_e, level, message, line, source) => {
      logs.push({ level, message: String(message).slice(0, 400), at: `${path.basename(String(source || ''))}:${line}` });
      if (logs.length > 60) logs.shift();
    });
  };
  let busy = false;
  async function snapshot(req) {
    const w = getWindow();
    attach(w);
    const out = { id: req.id || null, ok: true, at: new Date().toISOString() };
    if (!w || w.isDestroyed()) { out.ok = false; out.error = 'no window'; return out; }
    try {
      if (req.eval) {
        try { out.evalResult = await w.webContents.executeJavaScript(String(req.eval), true); }
        catch (e) { out.ok = false; out.error = String((e && e.message) || e); }
      }
      await new Promise(r => setTimeout(r, Math.min(Number(req.wait) || 300, 5000)));
      try { out.state = await w.webContents.executeJavaScript('window.__dcDebug ? window.__dcDebug() : null', true); } catch (e) { out.stateError = String(e.message || e); }
      const img = await w.webContents.capturePage();
      fs.writeFileSync(path.join(dir, 'screenshot.png'), img.toPNG());
    } catch (e) { out.ok = false; out.error = String((e && e.message) || e); }
    out.console = logs.slice(-30);
    return out;
  }
  async function handle() {
    if (busy) return; busy = true;
    try {
      let req = {};
      try { req = JSON.parse(fs.readFileSync(reqFile, 'utf8')); } catch { busy = false; return; }
      const res = await snapshot(req);
      fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(res, null, 2));
    } finally { busy = false; }
  }
  let t = null;
  try { fs.watch(dir, (evt, file) => { if (file === 'request.json') { clearTimeout(t); t = setTimeout(handle, 150); } }); } catch (e) { console.error('[dev-probe] cannot watch', e.message); }
  // First snapshot once the UI has loaded, so there is always something to look at.
  const w = getWindow(); attach(w);
  if (w) w.webContents.on('did-finish-load', () => setTimeout(async () => fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(await snapshot({ id: 'startup' }), null, 2)), 2500));
  console.log('[dev-central] dev probe: write', reqFile, 'to inspect the running app');
}
module.exports = { start };
