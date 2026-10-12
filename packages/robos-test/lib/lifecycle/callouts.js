'use strict';
/**
 * Speech-bubble callouts, anchored to real elements. The same function runs inside
 * the Electron windows (via the debug server /eval) and the popped-up app (via CDP),
 * so bubbles appear in the recording and in the screenshots alike.
 *
 * item: { target, text, side?, n?, width?, dx?, dy? }
 *   target: CSS selector | { text, within?, tag? } (find by visible text) | { x, y, w?, h? } (viewport box)
 *   side:   'top' | 'bottom' | 'left' | 'right' (which side of the target the bubble sits on)
 *   n:      optional step number shown in a badge
 */
const INSTALL = `
(function () {
  if (window.__rbCallouts) return;
  const style = document.createElement('style');
  style.id = 'rb-callout-style';
  style.textContent = [
    '@keyframes rbPop{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:none}}',
    '.rb-callout{position:fixed;z-index:2147483645;box-sizing:border-box;padding:14px 18px 15px;border-radius:16px;background:#fff;color:#0b1220;',
    'border:3px solid #00e5ff;box-shadow:0 14px 40px rgba(0,0,0,.6);font:600 23px/1.28 "Plus Jakarta Sans","Inter","Segoe UI",system-ui,sans-serif;',
    'letter-spacing:-.005em;pointer-events:none;animation:rbPop .32s cubic-bezier(.2,.9,.3,1.2) both}',
    '.rb-callout .rb-n{display:inline-grid;place-items:center;width:30px;height:30px;margin-right:10px;border-radius:50%;background:#00e5ff;color:#04121a;font-size:17px;font-weight:800;vertical-align:1px}',
    '.rb-callout b{color:#0a7c8c}',
    '.rb-callout .rb-tail{position:absolute;width:20px;height:20px;background:#fff;border:3px solid #00e5ff;transform:rotate(45deg)}'
  ].join('');
  document.head.appendChild(style);

  const deepAll = (root, out) => { root.querySelectorAll('*').forEach(e => { out.push(e); if (e.shadowRoot) deepAll(e.shadowRoot, out); }); return out; };
  function locate(t) {
    if (t && typeof t === 'object' && 'x' in t) return { left: t.x, top: t.y, width: t.w || 0, height: t.h || 0 };
    if (t && typeof t === 'object' && t.sel) {   // a point inside an element, as fractions of its box
      const host = document.querySelector(t.sel);
      if (!host) return null;
      const r = host.getBoundingClientRect();
      return { left: r.left + r.width * (t.ax == null ? 0.5 : t.ax), top: r.top + r.height * (t.ay == null ? 0.5 : t.ay), width: 0, height: 0 };
    }
    let el = null;
    if (typeof t === 'string') el = document.querySelector(t);
    else if (t && t.text) {
      const root = t.within ? document.querySelector(t.within) : document;
      const pool = root ? deepAll(root, []) : [];
      const tag = (t.tag || 'button,a,summary,label,span,h1,h2,h3,h4,p,div,strong,li,b,[role=button],[role=tab]');
      el = pool.filter(n => n.matches && n.matches(tag) && n.getClientRects().length && (n.textContent || '').trim().replace(/\\s+/g, ' ').includes(t.text))
               .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0] || null;
    }
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }

  window.__rbCallouts = function (items, opts) {
    opts = opts || {};
    document.querySelectorAll('.rb-callout').forEach(n => n.remove());
    const vw = innerWidth, vh = innerHeight, bottom = vh - (opts.avoidBottom || 0), M = 16, GAP = 22;
    const missing = [];
    for (const it of items) {
      const box = locate(it.target);
      if (!box) { missing.push(JSON.stringify(it.target)); continue; }
      const el = document.createElement('div');
      el.className = 'rb-callout';
      el.style.maxWidth = (it.width || 400) + 'px';
      el.innerHTML = (it.n ? '<span class="rb-n">' + it.n + '</span>' : '') + it.text;
      const tail = document.createElement('i'); tail.className = 'rb-tail'; el.appendChild(tail);
      el.style.visibility = 'hidden'; el.style.left = '0px'; el.style.top = '0px';
      (document.querySelector('dialog[open]') || document.body).appendChild(el);
      const bw = el.offsetWidth, bh = el.offsetHeight;
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      let side = it.side || 'bottom';
      let x, y;
      const place = (s) => {
        if (s === 'top') { x = cx - bw / 2; y = box.top - bh - GAP; }
        else if (s === 'bottom') { x = cx - bw / 2; y = box.top + box.height + GAP; }
        else if (s === 'left') { x = box.left - bw - GAP; y = cy - bh / 2; }
        else { x = box.left + box.width + GAP; y = cy - bh / 2; }
        x += it.dx || 0; y += it.dy || 0;
      };
      place(side);
      // Flip to the opposite side if it would leave the screen (or cover the caption area).
      if (y < M && side === 'top') { side = 'bottom'; place(side); }
      else if (y + bh > bottom && side === 'bottom') { side = 'top'; place(side); }
      else if (x < M && side === 'left') { side = 'right'; place(side); }
      else if (x + bw > vw - M && side === 'right') { side = 'left'; place(side); }
      x = Math.max(M, Math.min(vw - bw - M, x));
      y = Math.max(M, Math.min(bottom - bh, y));
      el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.visibility = '';
      // Tail: on the edge facing the target, as close to the target's centre as the bubble allows.
      const clampX = Math.max(22, Math.min(bw - 22, cx - x)), clampY = Math.max(22, Math.min(bh - 22, cy - y));
      if (side === 'top') { tail.style.left = (clampX - 10) + 'px'; tail.style.bottom = '-12px'; tail.style.borderTop = 'none'; tail.style.borderLeft = 'none'; }
      else if (side === 'bottom') { tail.style.left = (clampX - 10) + 'px'; tail.style.top = '-12px'; tail.style.borderBottom = 'none'; tail.style.borderRight = 'none'; }
      else if (side === 'left') { tail.style.top = (clampY - 10) + 'px'; tail.style.right = '-12px'; tail.style.borderLeft = 'none'; tail.style.borderBottom = 'none'; }
      else { tail.style.top = (clampY - 10) + 'px'; tail.style.left = '-12px'; tail.style.borderRight = 'none'; tail.style.borderTop = 'none'; }
    }
    return missing;
  };
  window.__rbClearCallouts = () => document.querySelectorAll('.rb-callout').forEach(n => n.remove());
})()`;

const show = (items, opts) => `${INSTALL};JSON.stringify(window.__rbCallouts(${JSON.stringify(items)}, ${JSON.stringify(opts || {})}))`;
const clear = () => `${INSTALL};window.__rbClearCallouts();true`;

module.exports = { INSTALL, show, clear };
