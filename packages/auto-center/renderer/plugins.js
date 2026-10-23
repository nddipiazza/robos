'use strict';
// Renderer side of RobOS Auto plugins. For each enabled plugin it adds the plugin's menus to the Shop desk
// navigation (with an empty <section> for each view) and loads the plugin's scripts and styles once. Plugin
// scripts extend the shared screens through hooks:
//   frontDeskChoices(ctx)  -> { title, sub, onClick }            extra choices on the Front desk home
//   intakeConfirm(s, ctx)  -> { element, hidesLocation }          a block on the intake Confirm step; it may set s.addons[key]
//   intakeDone(result)     -> { notice, choice: { title, sub, onClick } }
//   ticketNotices(job, ctx) -> element                            on a Front desk ticket
//   repairInvoiceNotices(job, ctx) -> element                     on the repair invoice step at Checkout
//   checkout               provider objects (see checkout.js)
//   adminTabs              { id, label, render(ctx) }
window.autoPlugins = (() => {
  const hooks = { frontDeskChoices: [], intakeConfirm: [], intakeDone: [], ticketNotices: [], repairInvoiceNotices: [], checkout: [], adminTabs: [] };
  const loaded = new Set(), enabled = new Set();
  let current = null;
  const load = (tag, attrs) => new Promise((resolve, reject) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = resolve; e.onerror = () => reject(new Error('Could not load ' + (attrs.src || attrs.href))); document.head.append(e); });
  function button(plugin, menu) {
    const b = document.createElement('button'); b.dataset.view = menu.view; b.dataset.order = menu.order; b.dataset.plugin = plugin.id; b.hidden = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', menu.icon); svg.append(p);
    const label = document.createElement('span'); label.textContent = menu.label; b.append(svg, label); b.onclick = () => navigate(menu.view);
    const desk = [...document.querySelectorAll('nav button[data-order]')].find(x => Number(x.dataset.order) > menu.order);
    desk ? desk.before(b) : document.querySelector('nav .nav-group.desk-end').before(b);
    if (!document.getElementById(menu.view)) { const s = document.createElement('section'); s.id = menu.view; s.className = 'view'; s.hidden = true; document.querySelector('main').append(s); }
  }
  // Show the menus of enabled plugins and load their files. Called on every refresh.
  async function apply(state) {
    const shop = state.mode === 'shop'; enabled.clear(); current = state.plugins || [];
    for (const p of current.filter(p => p.enabled && shop)) {
      enabled.add(p.id);
      if (loaded.has(p.id)) continue; loaded.add(p.id);
      for (const m of p.menus) button(p, m);
      for (const href of p.styles) await load('link', { rel: 'stylesheet', href });
      for (const src of p.scripts) await load('script', { src });
    }
    document.querySelectorAll('nav button[data-plugin]').forEach(b => { b.hidden = !enabled.has(b.dataset.plugin); });
  }
  const isOn = id => enabled.has(id), of = name => hooks[name].filter(h => !h.plugin || enabled.has(h.plugin));
  return { hooks, apply, isOn, enabled, of, on: (name, plugin, h) => { hooks[name].push(Object.assign(h, { plugin })); }, list: () => current || [] };
})();
