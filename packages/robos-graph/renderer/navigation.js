'use strict';
window.RobosGraphNavigation = (() => {
  let ledger = null, restore = null, validIds = new Set(), moving = false;
  const backButton = () => document.getElementById('btn-nav-back');
  const forwardButton = () => document.getElementById('btn-nav-forward');
  const key = 'robos.graph.navigation';
  function save() {
    try { sessionStorage.setItem(key, JSON.stringify(ledger)); } catch {}
    updateButtons();
  }
  function destination(direction) {
    if (!ledger) return -1;
    for (let index = ledger.index + direction; index >= 0 && index < ledger.entries.length; index += direction) {
      if (validIds.has(ledger.entries[index].node)) return index;
    }
    return -1;
  }
  function updateButtons() {
    if (backButton()) backButton().disabled = moving || destination(-1) < 0;
    if (forwardButton()) forwardButton().disabled = moving || destination(1) < 0;
  }
  const state = () => ({ robosGraphNavigation: ledger.token, index: ledger.index });
  function initialize(scope, ids, apply) {
    validIds = new Set(ids); restore = apply;
    if (!ledger) {
      try { ledger = JSON.parse(sessionStorage.getItem(key)); } catch {}
    }
    if (!ledger || !Array.isArray(ledger.entries) || !Number.isInteger(ledger.index) || typeof ledger.token !== 'string' ||
        ledger.index < -1 || ledger.index >= ledger.entries.length ||
        ledger.entries.some(entry => !entry || typeof entry.node !== 'string') ||
        ledger.scope !== scope || history.state?.robosGraphNavigation !== ledger.token) {
      ledger = { scope, token: crypto.randomUUID(), entries: [], index: -1 };
      history.replaceState(state(), '');
    }
    if (Number.isInteger(history.state?.index) && history.state.index >= -1 && history.state.index < ledger.entries.length) ledger.index = history.state.index;
    save();
    const entry = ledger.entries[ledger.index];
    return entry && validIds.has(entry.node) ? entry : null;
  }
  function record(view) {
    if (!ledger || !validIds.has(view.node)) return;
    const current = ledger.entries[ledger.index];
    if (current?.node === view.node) {
      ledger.entries[ledger.index] = view;
      history.replaceState(state(), '');
    } else if (!ledger.entries.length) {
      ledger.entries.push(view); ledger.index = 0; history.replaceState(state(), '');
    } else {
      ledger.entries = ledger.entries.slice(0, ledger.index + 1);
      ledger.entries.push(view); ledger.index++; history.pushState(state(), '');
    }
    save();
  }
  function updateView(view) {
    if (!ledger || ledger.entries[ledger.index]?.node !== view.node) return;
    ledger.entries[ledger.index] = view; save();
  }
  function updateNodes(ids) { validIds = new Set(ids); updateButtons(); }
  function go(direction) {
    if (moving) return;
    const next = destination(direction);
    if (next < 0) return;
    moving = true; updateButtons(); history.go(next - ledger.index);
  }
  window.addEventListener('popstate', async event => {
    if (!ledger) return;
    const target = event.state;
    if (target?.robosGraphNavigation !== ledger.token || !ledger.entries[target.index]) {
      history.replaceState(state(), ''); moving = false; updateButtons(); return;
    }
    const direction = target.index < ledger.index ? -1 : 1;
    ledger.index = target.index;
    if (!validIds.has(ledger.entries[ledger.index].node)) {
      moving = false;
      if (destination(direction) >= 0) { go(direction); return; }
      if (destination(-direction) >= 0) { go(-direction); return; }
      updateButtons(); return;
    }
    try { await restore(ledger.entries[ledger.index]); }
    finally { moving = false; save(); }
  });
  window.addEventListener('keydown', event => {
    const back = (event.altKey && event.key === 'ArrowLeft') || (event.metaKey && event.key === '[');
    const forward = (event.altKey && event.key === 'ArrowRight') || (event.metaKey && event.key === ']');
    if (back || forward) { event.preventDefault(); go(back ? -1 : 1); }
  });
  // Prevent Chromium's default mouse navigation from duplicating our graph visit.
  for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, event => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  }, true);
  window.addEventListener('auxclick', event => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault(); go(event.button === 3 ? -1 : 1);
  }, true);
  window.addEventListener('DOMContentLoaded', () => {
    backButton()?.addEventListener('click', () => go(-1));
    forwardButton()?.addEventListener('click', () => go(1));
    window.sdlcGraph.onNavigate?.(direction => go(direction === 'back' ? -1 : 1));
    updateButtons();
  });
  return { initialize, record, updateView, updateNodes, back: () => go(-1), forward: () => go(1) };
})();
