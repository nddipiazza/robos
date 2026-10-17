'use strict';
// Shared helpers for the register, back office and self-checkout screens. No framework, no build step.
(function () {
  const POS = window.POS = { token: null, settings: null };

  // DOM append/replaceChildren turn null/false into the text "null"; conditional UI pieces rely on them being skipped.
  for (const name of ['append', 'replaceChildren']) {
    const native = Element.prototype[name];
    Element.prototype[name] = function (...kids) { return native.apply(this, kids.flat(Infinity).filter(k => k !== null && k !== undefined && k !== false)); };
  }

  POS.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const h = POS.h;

  POS.money = function (cents) {
    const cur = (POS.settings && POS.settings.business.currency) || 'USD';
    const symbol = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' }[cur] || cur + ' ';
    const abs = Math.abs(cents);
    return `${cents < 0 ? '-' : ''}${symbol}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  };

  // "12.5" -> 1250; returns null when the text is not a valid amount.
  POS.parseMoney = function (text) {
    const t = String(text).trim().replace(/^\$/, '');
    if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
    const [w, f = ''] = t.split('.');
    return Number(w) * 100 + Number((f + '00').slice(0, 2));
  };

  POS.api = async function api(method, path, body, opts = {}) {
    const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(POS.token && !opts.anon ? { Authorization: `Bearer ${POS.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    if (!res.ok) {
      const e = new Error(data && data.error ? data.error.message : `Request failed (${res.status})`);
      e.code = data && data.error && data.error.code; e.status = res.status;
      if (res.status === 401 && POS.onSignedOut && !opts.anon) POS.onSignedOut();
      throw e;
    }
    return data;
  };

  POS.toast = function (message, kind) {
    let box = document.getElementById('toasts');
    if (!box) { box = h('div', { id: 'toasts', 'aria-live': 'assertive' }); document.body.append(box); }
    const t = h('div', { class: `toast ${kind || ''}`, role: 'alert', 'data-testid': 'toast' }, message);
    box.append(t);
    setTimeout(() => t.remove(), kind === 'ok' ? 2500 : 5000);
  };

  // Wrap an async handler so failures become a visible message instead of silence.
  POS.guard = fn => async (...args) => { try { return await fn(...args); } catch (e) { POS.toast(e.message); } };

  POS.dialog = function (title, content, { actions = [], wide = false, testid = 'dialog', onClose } = {}) {
    const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, 'data-testid': testid });
    const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); if (onClose) onClose(); };
    const esc = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    const foot = actions.length ? h('div', { class: 'foot' }, actions.map(a => h('button', {
      class: a.kind || '', 'data-testid': a.testid || undefined,
      onclick: POS.guard(async () => { const keep = a.onclick ? await a.onclick(api) : undefined; if (keep !== false && !a.keepOpen) close(); }),
    }, a.label))) : null;
    const api = { close, el: overlay };
    overlay.append(h('div', { class: `modal ${wide ? 'wide' : ''}` }, h('h2', null, title), content, foot));
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) close(); });
    document.body.append(overlay);
    const first = overlay.querySelector('input,textarea,select');
    if (first && !first.closest('.numpad-wrap')) first.focus();
    return api;
  };

  // On-screen number pad. `get()` returns the current text; used for PINs, cash, quantities.
  POS.numpad = function ({ value = '', decimal = false, mask = false, max = 12, onChange, label, testid = 'numpad' }) {
    let text = String(value);
    const display = h('div', { class: 'numpad-display', 'data-testid': `${testid}-display`, 'aria-live': 'polite' });
    const paint = () => { display.textContent = mask ? '•'.repeat(text.length) : (label ? label(text) : text || '0'); };
    const press = k => {
      if (k === 'C') text = '';
      else if (k === '⌫') text = text.slice(0, -1);
      else if (k === '.') { if (decimal && !text.includes('.')) text = (text || '0') + '.'; }
      else if (text.length < max && !(decimal && /\.\d\d$/.test(text))) text += k;
      paint();
      if (onChange) onChange(text);
    };
    paint();
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', decimal ? '.' : 'C', '0', '⌫'];
    const el = h('div', { class: 'numpad-wrap' }, display, h('div', { class: 'numpad' }, keys.map(k => h('button', { type: 'button', 'data-key': k, 'aria-label': k === '⌫' ? 'Backspace' : k, onclick: () => press(k) }, k))));
    el.get = () => text;
    el.set = v => { text = String(v); paint(); if (onChange) onChange(text); };
    return el;
  };

  POS.askPin = function (title) {
    return new Promise(resolve => {
      let done = false;
      const pad = POS.numpad({ mask: true, max: 8, testid: 'pin' });
      POS.dialog(title, pad, {
        testid: 'pin-dialog', onClose: () => { if (!done) resolve(null); },
        actions: [{ label: 'Cancel', onclick: () => { } }, { label: 'Approve', kind: 'primary', testid: 'pin-ok', onclick: () => { done = true; resolve(pad.get()); } }],
      });
    });
  };

  // Run `fn(managerPin)`. If a manager must approve, ask for their PIN on the spot and retry once.
  POS.withOverride = async function (fn) {
    try { return await fn(undefined); } catch (e) {
      if (e.code !== 'manager_required') throw e;
      const pin = await POS.askPin('Manager approval needed');
      if (!pin) return undefined;
      return fn(pin);
    }
  };

  POS.stepper = function (value, { min = 1, max = 99, onChange }) {
    let v = value;
    const out = h('output', { 'data-testid': 'stepper-value' }, v);
    const set = n => { v = Math.max(min, Math.min(max, n)); out.textContent = v; if (onChange) onChange(v); };
    const el = h('div', { class: 'stepper' }, h('button', { type: 'button', 'aria-label': 'Less', 'data-testid': 'stepper-minus', onclick: () => set(v - 1) }, '−'), out, h('button', { type: 'button', 'aria-label': 'More', 'data-testid': 'stepper-plus', onclick: () => set(v + 1) }, '+'));
    el.get = () => v;
    return el;
  };

  // Item customisation sheet shared by the register and the self-checkout: size/variant, options, note, quantity.
  POS.customize = function (item, groups, { allowNote = true } = {}) {
    return new Promise(resolve => {
      let variantId = item.variants.length === 1 ? item.variants[0].id : null;
      const chosen = new Set();
      const qty = POS.stepper(1, { min: 1, max: 99 });
      const note = h('input', { placeholder: 'Note (optional)', maxlength: 140, 'data-testid': 'item-note' });
      const body = h('div');
      const price = () => {
        const v = item.variants.find(x => x.id === variantId);
        const base = v && v.price !== null && v.price !== undefined ? v.price : item.price;
        return base + groups.flatMap(g => g.options).filter(o => chosen.has(o.id)).reduce((s, o) => s + o.price, 0);
      };
      const addBtn = h('button', { class: 'primary', 'data-testid': 'add-to-order' }, '');
      const render = () => {
        body.replaceChildren();
        if (item.variants.length) {
          body.append(h('div', { class: 'opt-group' }, h('h3', null, 'Choose one ', h('small', null, '(required)')), h('div', { class: 'choices' }, item.variants.map(v => h('button', { type: 'button', class: variantId === v.id ? 'on' : '', 'data-testid': `variant-${v.name}`, onclick: () => { variantId = v.id; render(); } }, v.name)))));
        }
        for (const g of groups) {
          const multi = g.max > 1;
          body.append(h('div', { class: 'opt-group' }, h('h3', null, g.name, ' ', h('small', null, g.required ? '(required)' : multi ? `(up to ${g.max})` : '(optional)')),
            h('div', { class: 'choices' }, g.options.map(o => h('button', {
              type: 'button', class: chosen.has(o.id) ? 'on' : '', 'data-testid': `option-${g.name}-${o.name}`, onclick: () => {
                if (chosen.has(o.id)) { if (!g.required || multi || [...chosen].filter(id => g.options.some(x => x.id === id)).length > 1) chosen.delete(o.id); } else {
                  if (!multi) g.options.forEach(x => chosen.delete(x.id));
                  else if (g.options.filter(x => chosen.has(x.id)).length >= g.max) return;
                  chosen.add(o.id);
                }
                render();
              },
            }, o.price ? `${o.name} +${POS.money(o.price)}` : o.name)))));
        }
        const missing = (item.variants.length && !variantId) ? 'Choose an option' : (groups.find(g => g.options.filter(o => chosen.has(o.id)).length < g.min) ? `Choose ${groups.find(g => g.options.filter(o => chosen.has(o.id)).length < g.min).name}` : '');
        addBtn.disabled = !!missing;
        addBtn.textContent = missing || `Add · ${POS.money(price() * qty.get())}`;
      };
      qty.addEventListener('click', render);
      render();
      let done = false;
      addBtn.addEventListener('click', () => { done = true; dlg.close(); resolve({ itemId: item.id, variantId, qty: qty.get(), modifiers: [...chosen], note: note.value }); });
      const dlg = POS.dialog(`${item.emoji || ''} ${item.name}`.trim(), h('div', null, body, h('div', { class: 'row', style: 'justify-content:space-between;margin-top:8px' }, qty, allowNote ? note : null)), { testid: 'customize-dialog', onClose: () => { if (!done) resolve(null); } });
      dlg.el.querySelector('.modal').append(h('div', { class: 'foot' }, h('button', { onclick: () => dlg.close() }, 'Cancel'), addBtn));
    });
  };
})();
