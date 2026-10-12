'use strict';
/**
 * Helpers for driving real Electron apps through the debug server and
 * recording the virtual display: pointer/ripple overlay, typewriter, text
 * buttons, shadow-DOM clicks, step marks and an ffmpeg x11grab recorder.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { evalJS, maximizeWindow } = require('../snapshot');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function screenshot(port, file) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}/screenshot`, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => { fs.writeFileSync(file, Buffer.concat(chunks)); resolve(file); });
    }).on('error', reject);
  });
}

/** Records the whole X display. Marks are seconds from the start of the recording. */
class Recorder {
  constructor(file, { display = process.env.DISPLAY, size = '1920x1080', fps = 20 } = {}) {
    this.file = file; this.display = display; this.size = size; this.fps = fps;
    this.marks = []; this.t0 = null;
  }
  start() {
    this.proc = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-framerate', String(this.fps),
      '-video_size', this.size, '-i', this.display + '.0', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
      '-pix_fmt', 'yuv420p', this.file], { stdio: ['pipe', 'inherit', 'inherit'] });
    this.t0 = Date.now();
    return sleep(800);
  }
  now() { return (Date.now() - this.t0) / 1000; }
  /** Begin a captioned segment. */
  step(id, extra = {}) { this.marks.push({ t: this.now(), type: 'step', id, ...extra }); }
  /** Cut dead time (app launching, waiting) out of the final video. */
  cutStart() { this.marks.push({ t: this.now(), type: 'cut-start' }); }
  cutEnd() { this.marks.push({ t: this.now(), type: 'cut-end' }); }
  /** Overlay an extra caption line (e.g. the gh command the owner ran). */
  note(text) { this.marks.push({ t: this.now(), type: 'note', text }); }
  async stop() {
    this.marks.push({ t: this.now(), type: 'end' });
    this.proc.stdin.write('q');
    await new Promise(r => this.proc.on('close', r));
    fs.writeFileSync(this.file + '.marks.json', JSON.stringify(this.marks, null, 2));
  }
}

const POINTER_JS = `
(() => {
  if (window.__rbPointer) return;
  const s = document.createElement('style');
  s.textContent = '@keyframes rbRipple{from{transform:translate(-50%,-50%) scale(.2);opacity:.9}to{transform:translate(-50%,-50%) scale(2.2);opacity:0}}';
  document.head.appendChild(s);
  const c = document.createElement('div');
  c.style.cssText = 'position:fixed;left:70%;top:92%;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:left .75s cubic-bezier(.4,0,.2,1),top .75s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))';
  c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#0b1220" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  document.body.appendChild(c);
  window.__rbPointer = c;
})()`;

/** Resolve a target to its viewport rect. target: CSS selector, or {text, within}. */
function rectJs(target) {
  const t = JSON.stringify(target);
  return `
  (() => {
    const target = ${t};
    const deep = (root) => { const out = [root]; root.querySelectorAll('*').forEach(e => { out.push(e); if (e.shadowRoot) out.push(...deep(e.shadowRoot)); }); return out; };
    let el = null;
    if (typeof target === 'string') el = document.querySelector(target);
    else {
      const root = target.within ? document.querySelector(target.within) : document;
      const nodes = root ? [...root.querySelectorAll(target.tag || 'button, a, summary, label, [role=button], [role=tab]')] : [];
      el = nodes.find(n => (n.textContent || '').trim().replace(/\\s+/g, ' ').includes(target.text) && n.getClientRects().length);
    }
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    window.__rbEl = el;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  })()`;
}

/** Move the on-screen pointer to the target, ripple, then click it for real. */
async function click(port, target, { settle = 700, after = 600, ripple = true } = {}) {
  await evalJS(port, POINTER_JS);
  const r = await evalJS(port, rectJs(target));
  if (!r) throw new Error('Click target not found: ' + JSON.stringify(target));
  await evalJS(port, `(() => { const c = window.__rbPointer; c.style.left = ${r.x - 4}+'px'; c.style.top = ${r.y - 4}+'px'; })()`);
  await sleep(settle);
  if (ripple) await evalJS(port, `(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:${r.x}px;top:${r.y}px;width:46px;height:46px;border-radius:50%;border:3px solid #38bdf8;z-index:2147483646;pointer-events:none;animation:rbRipple .6s ease-out forwards';
    document.body.appendChild(d); setTimeout(() => d.remove(), 700);
  })()`);
  await evalJS(port, `(() => { const el = window.__rbEl; el.click(); })()`);
  await sleep(after);
}

/** Type into an input / robos-ai-textarea one character at a time. */
async function type(port, selector, text, { delay = 28 } = {}) {
  await evalJS(port, `(async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.focus(); el.value = '';
    for (const ch of ${JSON.stringify(text)}) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, ${delay}));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`, 120000);
}

async function waitFor(port, js, { timeout = 30000, interval = 400 } = {}) {
  const start = Date.now();
  for (;;) {
    let v;
    try { v = await evalJS(port, js); } catch { v = null; }
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for: ' + js.slice(0, 120));
    await sleep(interval);
  }
}

module.exports = { sleep, screenshot, Recorder, click, type, waitFor, evalJS, maximizeWindow };
