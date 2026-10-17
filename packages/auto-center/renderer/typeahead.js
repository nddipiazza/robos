'use strict';
// Accessible type-ahead (ARIA combobox). Always allows free text; suggestions never replace what you type
// unless you pick one. `source(query)` returns [{label, detail, ...}] (sync or async).
(() => {
  let uid = 0;
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function attach(input, { source, onPick, multi = false, openOnFocus = false, minChars = 1 }) {
    if (!input || input.dataset.ta) return;
    input.dataset.ta = '1'; const id = 'ta-' + (++uid);
    const wrap = make('span', 'ta-wrap'); input.parentNode.insertBefore(wrap, input); wrap.append(input);
    const list = make('ul', 'ta-list'); list.id = id; list.setAttribute('role', 'listbox'); list.hidden = true; wrap.append(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id); input.autocomplete = 'off';
    let items = [], active = -1, ticket = 0, timer = 0;
    const tail = () => multi ? input.value.split(/[,;\s]+/).pop() : input.value;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
    const mark = n => { active = n; [...list.children].forEach((li, i) => { li.setAttribute('aria-selected', String(i === n)); if (i === n) { input.setAttribute('aria-activedescendant', li.id); li.scrollIntoView({ block: 'nearest' }); } }); };
    const pick = n => {
      const item = items[n]; if (!item) return;
      if (multi) { const parts = input.value.split(/([,;\s]+)/); parts[parts.length - 1] = item.label; input.value = parts.join(''); } else input.value = item.value ?? item.label;
      close(); input.dispatchEvent(new Event('input', { bubbles: true })); onPick?.(item, input); input.dispatchEvent(new CustomEvent('ta-pick', { detail: item }));
    };
    const render = () => {
      list.replaceChildren(...items.map((item, n) => { const li = make('li', 'ta-opt'); li.id = `${id}-${n}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false'); li.append(make('span', 'ta-label', item.label)); if (item.detail) li.append(make('span', 'ta-detail', item.detail)); li.addEventListener('mousedown', ev => { ev.preventDefault(); pick(n); }); return li; }));
      const show = items.length > 0; list.hidden = !show; input.setAttribute('aria-expanded', String(show)); active = -1;
    };
    async function run() {
      const q = tail(), mine = ++ticket;
      if (q.length < minChars && !openOnFocus) { items = []; close(); return; }
      let found = []; try { found = await source(q); } catch { found = []; }
      if (mine !== ticket) return; items = found || []; render();
    }
    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 60); });
    input.addEventListener('focus', () => { if (openOnFocus || input.value.length >= minChars) run(); });
    input.addEventListener('blur', () => { ticket++; setTimeout(close, 120); });
    input.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (list.hidden) run(); else mark((active + 1) % items.length); }
      else if (ev.key === 'ArrowUp' && !list.hidden) { ev.preventDefault(); mark((active - 1 + items.length) % items.length); }
      else if (ev.key === 'Enter' && !list.hidden && active >= 0) { ev.preventDefault(); pick(active); }
      else if (ev.key === 'Escape' && !list.hidden) { ev.preventDefault(); close(); }
    });
  }
  const remote = (kind, ctx) => q => window.auto.catalog({ kind, query: q, ctx: ctx ? ctx() : {} });
  const val = (root, name) => root.querySelector(`[name="${name}"]`)?.value || '';
  // Make / model / year inputs inside any form that has them.
  function vehicleFields(form) {
    const f = n => form.querySelector(`[name="${n}"]`); if (!f('make') || !f('model')) return;
    attach(f('make'), { source: remote('make'), onPick: () => { if (f('model')) f('model').value = ''; } });
    attach(f('model'), { source: remote('model', () => ({ make: val(form, 'make') })), openOnFocus: true, onPick: it => { if (it.make && !val(form, 'make')) f('make').value = it.make; } });
    if (f('year')) attach(f('year'), { source: remote('year', () => ({ make: val(form, 'make'), model: val(form, 'model') })), openOnFocus: true, minChars: 0 });
  }
  function local(input, itemsFn, onPick) { attach(input, { source: q => { const t = q.toLowerCase(); return itemsFn().filter(i => i.label.toLowerCase().includes(t) || (i.detail || '').toLowerCase().includes(t)).slice(0, 12); }, onPick, openOnFocus: true, minChars: 0 }); }
  window.typeahead = { attach, remote, vehicleFields, local };
  document.querySelectorAll('#vehicle-form').forEach(vehicleFields);
})();
