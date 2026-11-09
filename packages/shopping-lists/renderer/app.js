'use strict';

(() => {
  const api = window.shoppingLists;
  let state = null;
  let selectedBadge = '';
  let filterMode = 'all';
  let searchQuery = '';
  let qrMode = 'mobile-form';
  let previewMode = 'doc';
  let lastHydratedListId = null;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function fireConfetti() {
    const stage = document.getElementById('confetti-stage');
    const palette = ['#10b981', '#00bcd4', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];
    for (let i = 0; i < 32; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.left = `${35 + Math.random() * 30}%`;
      bit.style.top = '22%';
      bit.style.background = palette[i % palette.length];
      bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 380}px`);
      bit.style.setProperty('--dy', `${90 + Math.random() * 300}px`);
      stage.appendChild(bit);
      setTimeout(() => bit.remove(), 1000);
    }
  }

  function activeList() {
    if (!state?.lists?.length) return null;
    return state.lists.find((l) => l.id === state.activeListId) || state.lists[0];
  }

  function currentQrTargetUrl() {
    if (!state) return 'http://127.0.0.1:19225';
    const lanBase = state.mobileServer?.lanUrl || state.mobileServer?.localUrl || 'http://127.0.0.1:19225';
    const webApp = state.sync?.appsScriptWebAppUrl || '';
    if (qrMode === 'mobile-form') {
      const list = activeList();
      return webApp ? `${webApp}?list=${encodeURIComponent(list?.id || 'grocery')}` : `${lanBase}/?list=${encodeURIComponent(list?.id || 'grocery')}`;
    }
    if (qrMode.startsWith('doc-')) {
      const id = qrMode.slice(4);
      return state.sync?.docUrls?.[id] || `${lanBase}/doc-preview/${encodeURIComponent(id)}`;
    }
    return lanBase;
  }

  async function refreshQr() {
    const target = currentQrTargetUrl();
    document.getElementById('qr-url-text').textContent = target;
    try {
      const res = await api.getQrSvg(target, 186);
      document.getElementById('qr-frame').innerHTML = res.svg;
    } catch {}
  }

  function render() {
    const list = activeList();
    if (!list) return;

    document.documentElement.style.setProperty('--accent', list.accent || '#10b981');
    document.documentElement.style.setProperty('--accent-glow', list.accentGlow || 'rgba(16,185,129,0.24)');

    // Topbar metrics
    document.getElementById('overall-counts').textContent = `${state.overall.toBuyCount} to buy · ${state.overall.checkedCount} in cart`;
    document.getElementById('overall-est').textContent = `$${state.overall.estTotal.toFixed(2)}`;

    // Store Deck
    document.getElementById('store-deck').innerHTML = state.lists.map((l, idx) => `
      <button type="button" class="store-card ${l.id === list.id ? 'active' : ''}" data-select-list="${esc(l.id)}" style="--card-accent:${esc(l.accent)}">
        <div class="store-card-top">
          <div class="store-card-title">
            <span>${esc(l.icon)}</span>
            <span>${idx + 1}) ${esc(l.name)}</span>
          </div>
          <span class="store-card-badge">${l.stats.toBuyCount} left</span>
        </div>
        <div class="store-card-meta">
          <span>${l.stats.checkedCount}/${l.stats.totalCount} in cart</span>
          <span>Est. $${l.stats.estTotal.toFixed(2)}</span>
        </div>
        <div class="store-mini-bar">
          <div class="store-mini-fill" style="width:${l.stats.progressPct}%;background:${esc(l.accent)}"></div>
        </div>
      </button>
    `).join('');

    // Hero
    document.getElementById('hero-icon').textContent = list.icon || '🛒';
    document.getElementById('hero-name').textContent = `${list.name} Shopping List`;
    document.getElementById('hero-subtitle').textContent = list.subtitle || '';
    document.getElementById('hero-doc-pill').textContent = list.docUrl ? '☁️ Synced to Google Docs' : '📱 Mobile & Google Docs Ready';

    const circumference = 113.1;
    const offset = circumference - (circumference * list.stats.progressPct) / 100;
    document.getElementById('hero-ring-fg').style.strokeDashoffset = String(offset);
    document.getElementById('hero-pct').textContent = `${list.stats.progressPct}%`;
    document.getElementById('hero-tobuy').textContent = String(list.stats.toBuyCount);
    document.getElementById('hero-checked').textContent = String(list.stats.checkedCount);
    document.getElementById('hero-est-rem').textContent = `$${list.stats.estRemaining.toFixed(2)}`;
    document.getElementById('hero-est-tot').textContent = `$${list.stats.estTotal.toFixed(2)}`;

    // Form header & selects
    document.getElementById('form-store-name').textContent = list.name;
    if (lastHydratedListId !== list.id) {
      lastHydratedListId = list.id;
      document.getElementById('input-unit').innerHTML = (state.units || ['ea']).map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
      document.getElementById('input-aisle').innerHTML = `<option value="auto">✨ Auto-detect</option>`
        + (list.aisles || []).map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    }

    document.getElementById('badge-selector').innerHTML = (state.badges || []).map((b) => `
      <button type="button" class="badge-opt ${selectedBadge === b.id ? 'active' : ''}" data-badge="${esc(b.id)}">
        ${b.icon ? `${esc(b.icon)} ` : ''}${esc(b.label)}
      </button>
    `).join('');

    // Staples
    document.getElementById('staple-pills').innerHTML = (list.staples || []).map((s, idx) => `
      <button type="button" class="staple-pill" data-staple-idx="${idx}">＋ ${esc(s.name)}</button>
    `).join('');

    // Undo button
    const undoBtn = document.getElementById('btn-undo');
    undoBtn.disabled = !state.canUndo;
    undoBtn.title = state.lastUndoLabel || 'Undo last remove';

    // Items list
    const q = searchQuery.trim().toLowerCase();
    const badgeMap = new Map((state.badges || []).filter((b) => b.id).map((b) => [b.id, b]));
    const filtered = (list.items || []).filter((it) => {
      if (filterMode === 'todo' && it.checked) return false;
      if (filterMode === 'done' && !it.checked) return false;
      if (q && !(`${it.name} ${it.aisle} ${it.note}`).toLowerCase().includes(q)) return false;
      return true;
    });

    const unchecked = filtered.filter((i) => !i.checked);
    const checked = filtered.filter((i) => i.checked);
    const groups = new Map();
    for (const a of list.aisles || []) groups.set(a, []);
    for (const it of unchecked) {
      const a = it.aisle || 'General';
      if (!groups.has(a)) groups.set(a, []);
      groups.get(a).push(it);
    }

    const renderRow = (it) => {
      const b = badgeMap.get(it.badge);
      const badgeHtml = b ? `<span class="item-badge" style="color:${esc(b.color)}">${esc(b.icon)} ${esc(b.label)}</span>` : '';
      const priceHtml = it.estPrice != null ? ` · <strong>$${(it.estPrice * it.qty).toFixed(2)}</strong> ($${it.estPrice.toFixed(2)}/${esc(it.unit)})` : '';
      const noteHtml = it.note ? ` · ${esc(it.note)}` : '';
      return `
        <div class="item-row ${it.checked ? 'checked' : ''}" data-item-id="${esc(it.id)}">
          <button type="button" class="chk-circle" data-row-action="toggle" data-id="${esc(it.id)}" aria-label="Toggle ${esc(it.name)}">
            ${it.checked ? '✓' : ''}
          </button>
          <div class="item-info">
            <div class="item-title-line">
              <span class="item-title">${esc(it.name)}</span>
              ${badgeHtml}
            </div>
            <div class="item-meta">${esc(it.aisle)}${priceHtml}${noteHtml}</div>
          </div>
          <div class="item-controls">
            <div class="qty-pill-group">
              <button type="button" class="qty-btn" data-row-action="dec" data-id="${esc(it.id)}" aria-label="Decrease quantity">−</button>
              <span class="qty-val">${it.qty} ${esc(it.unit)}</span>
              <button type="button" class="qty-btn" data-row-action="inc" data-id="${esc(it.id)}" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" class="btn-edit-row" data-row-action="edit" data-id="${esc(it.id)}">Edit</button>
            <button type="button" class="btn-remove-row" data-row-action="remove" data-id="${esc(it.id)}">🗑️ Remove</button>
          </div>
        </div>
      `;
    };

    let itemsHtml = '';
    for (const [aisle, arr] of groups.entries()) {
      if (!arr.length) continue;
      itemsHtml += `
        <section class="aisle-section">
          <div class="aisle-header"><span>${esc(aisle)}</span><span>${arr.length} item${arr.length === 1 ? '' : 's'}</span></div>
          ${arr.map(renderRow).join('')}
        </section>
      `;
    }
    if (checked.length) {
      itemsHtml += `
        <section class="aisle-section">
          <div class="aisle-header" style="color:#94a3b8"><span>✅ Checked Off / In Cart</span><span>${checked.length}</span></div>
          ${checked.map(renderRow).join('')}
        </section>
      `;
    }
    if (!itemsHtml) {
      itemsHtml = `<div class="empty-box">No items match this view. Add items using the form or 1-tap staple pills above!</div>`;
    }
    document.getElementById('items-list').innerHTML = itemsHtml;

    // Google Drive sidebar controls
    const acctSelect = document.getElementById('gdrive-account');
    const accounts = state.googleAccounts || [];
    if (accounts.length) {
      const selectedAcct = state.sync.accountId || accounts.find((a) => a.signedIn)?.id || accounts[0].id;
      acctSelect.innerHTML = accounts.map((a) => `
        <option value="${esc(a.id)}" ${a.id === selectedAcct ? 'selected' : ''}>
          ${esc(a.email || a.label)}${a.signedIn ? ' (Signed in)' : ' (Needs sign-in)'}
        </option>
      `).join('');
    } else {
      acctSelect.innerHTML = `<option value="">No Google account connected yet</option>`;
    }

    const folderInput = document.getElementById('gdrive-folder');
    if (document.activeElement !== folderInput && state.sync.folderUrl) {
      folderInput.value = state.sync.folderUrl;
    }
    const webAppInput = document.getElementById('gdrive-webapp-url');
    if (document.activeElement !== webAppInput) {
      webAppInput.value = state.sync.appsScriptWebAppUrl || '';
    }
    document.getElementById('chk-auto-sync').checked = Boolean(state.sync.autoSync);

    const statusBox = document.getElementById('sync-status-box');
    if (state.sync.lastSyncedAt) {
      statusBox.textContent = `✓ ${state.sync.lastSyncMessage || 'Synced'} (${new Date(state.sync.lastSyncedAt).toLocaleTimeString()})`;
    }

    // Doc links list
    const docLinks = [];
    for (const l of state.lists) {
      const url = state.sync.docUrls?.[l.id];
      if (url) {
        docLinks.push(`
          <button type="button" class="doc-link-btn" data-open-url="${esc(url)}">
            <span>${esc(l.icon)} ${esc(l.name)} — Google Doc</span>
            <span>Open ↗</span>
          </button>
        `);
      }
    }
    if (state.sync.folderUrl) {
      docLinks.push(`
        <button type="button" class="doc-link-btn" data-open-url="${esc(state.sync.folderUrl)}">
          <span>📁 RobOS Household Shopping Lists Folder</span>
          <span>Drive ↗</span>
        </button>
      `);
    }
    document.getElementById('doc-links-list').innerHTML = docLinks.join('');

    refreshQr();
  }

  // Store switcher
  document.getElementById('store-deck').addEventListener('click', async (e) => {
    const card = e.target.closest('[data-select-list]');
    if (!card) return;
    state = await api.selectList(card.dataset.selectList);
    render();
  });

  // Form quantity stepper
  document.getElementById('btn-form-dec').addEventListener('click', () => {
    const el = document.getElementById('input-qty');
    el.value = String(Math.max(1, (Number(el.value) || 1) - 1));
  });
  document.getElementById('btn-form-inc').addEventListener('click', () => {
    const el = document.getElementById('input-qty');
    el.value = String((Number(el.value) || 1) + 1);
  });

  // Badge pills
  document.getElementById('badge-selector').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-badge]');
    if (!btn) return;
    selectedBadge = btn.dataset.badge;
    render();
  });

  // Add item form submit
  document.getElementById('add-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = activeList();
    const nameInput = document.getElementById('input-name');
    const name = nameInput.value.trim();
    if (!list || !name) return;
    try {
      const res = await api.addItem(list.id, {
        name,
        qty: Number(document.getElementById('input-qty').value || 1),
        unit: document.getElementById('input-unit').value,
        aisle: document.getElementById('input-aisle').value,
        estPrice: document.getElementById('input-price').value,
        note: document.getElementById('input-note').value.trim(),
        badge: selectedBadge,
      });
      state = res.state;
      nameInput.value = '';
      document.getElementById('input-qty').value = '1';
      document.getElementById('input-price').value = '';
      document.getElementById('input-note').value = '';
      selectedBadge = '';
      render();
      nameInput.focus();
      showToast(res.merged ? `Updated ${res.item.name} → ×${res.item.qty}` : `Added "${res.item.name}" to ${list.name}`);
    } catch (err) {
      showToast(err.message);
    }
  });

  // Smart paste drawer & optional AI button (following RobOS Optional AI convention: ✦ button enabled only when text present)
  document.getElementById('btn-toggle-smart-paste').addEventListener('click', () => {
    const drawer = document.getElementById('smart-paste-card');
    drawer.hidden = !drawer.hidden;
  });
  document.getElementById('btn-close-smart-paste').addEventListener('click', () => {
    document.getElementById('smart-paste-card').hidden = true;
  });
  document.getElementById('smart-paste-input').addEventListener('input', (e) => {
    document.getElementById('btn-smart-ai').disabled = !e.target.value.trim();
  });
  async function triggerSmartPaste(useAi) {
    const input = document.getElementById('smart-paste-input');
    const text = input.value.trim();
    if (!text) return;
    try {
      const res = await api.smartAdd(text, activeList()?.id, useAi);
      state = res.state;
      input.value = '';
      document.getElementById('btn-smart-ai').disabled = true;
      render();
      showToast(`Added ${res.added?.length || 0} item(s) across your lists`);
    } catch (err) {
      showToast(err.message);
    }
  }
  document.getElementById('btn-smart-offline').addEventListener('click', () => triggerSmartPaste(false));
  document.getElementById('btn-smart-ai').addEventListener('click', () => triggerSmartPaste(true));

  // Quick-add staple pills
  document.getElementById('staple-pills').addEventListener('click', async (e) => {
    const pill = e.target.closest('[data-staple-idx]');
    if (!pill) return;
    const list = activeList();
    const staple = list?.staples?.[Number(pill.dataset.stapleIdx)];
    if (!staple) return;
    const res = await api.addItem(list.id, staple);
    state = res.state;
    render();
    showToast(res.merged ? `${staple.name} → ×${res.item.qty}` : `Added ${staple.name}`);
  });

  // Filters & search
  document.getElementById('filter-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filterMode = btn.dataset.filter;
    for (const b of document.querySelectorAll('#filter-tabs button')) b.classList.toggle('active', b === btn);
    render();
  });
  document.getElementById('search-items').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  // Item row actions (Toggle, +, -, Edit, Remove)
  document.getElementById('items-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-row-action]');
    if (!btn) return;
    const list = activeList();
    const itemId = btn.dataset.id;
    const action = btn.dataset.rowAction;
    try {
      if (action === 'toggle') {
        const beforePct = list.stats.progressPct;
        const res = await api.toggleItem(list.id, itemId);
        state = res.state;
        render();
        const afterList = activeList();
        if (afterList.stats.progressPct === 100 && beforePct < 100) {
          fireConfetti();
          showToast(`🎉 Every item on ${afterList.name} is in your cart!`);
        }
      } else if (action === 'inc') {
        const res = await api.adjustItemQty(list.id, itemId, 1);
        state = res.state;
        render();
      } else if (action === 'dec') {
        const res = await api.adjustItemQty(list.id, itemId, -1);
        state = res.state;
        render();
      } else if (action === 'remove') {
        const res = await api.removeItem(list.id, itemId);
        state = res.state;
        render();
        showToast(`Removed "${res.removed?.name || 'item'}" (click Undo to restore)`);
      } else if (action === 'edit') {
        const it = list.items.find((x) => x.id === itemId);
        if (!it) return;
        document.getElementById('edit-item-id').value = it.id;
        document.getElementById('edit-item-name').value = it.name;
        document.getElementById('edit-item-qty').value = String(it.qty);
        document.getElementById('edit-item-unit').innerHTML = (state.units || ['ea'])
          .map((u) => `<option value="${esc(u)}" ${u === it.unit ? 'selected' : ''}>${esc(u)}</option>`).join('');
        document.getElementById('edit-item-aisle').innerHTML = (list.aisles || [])
          .map((a) => `<option value="${esc(a)}" ${a === it.aisle ? 'selected' : ''}>${esc(a)}</option>`).join('');
        document.getElementById('edit-item-price').value = it.estPrice != null ? String(it.estPrice) : '';
        document.getElementById('edit-item-note').value = it.note || '';
        document.getElementById('edit-item-modal').hidden = false;
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  // Edit modal save
  document.getElementById('btn-close-edit-item').addEventListener('click', () => {
    document.getElementById('edit-item-modal').hidden = true;
  });
  document.getElementById('edit-item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = activeList();
    const itemId = document.getElementById('edit-item-id').value;
    const res = await api.updateItem(list.id, itemId, {
      name: document.getElementById('edit-item-name').value.trim(),
      qty: Number(document.getElementById('edit-item-qty').value || 1),
      unit: document.getElementById('edit-item-unit').value,
      aisle: document.getElementById('edit-item-aisle').value,
      estPrice: document.getElementById('edit-item-price').value,
      note: document.getElementById('edit-item-note').value.trim(),
    });
    state = res.state;
    document.getElementById('edit-item-modal').hidden = true;
    render();
    showToast('Saved item changes');
  });

  // Toolbar Undo / Clear / Export CSV
  document.getElementById('btn-undo').addEventListener('click', async () => {
    const res = await api.undo();
    state = res.state;
    render();
    if (res.restored) showToast('Restored removed item(s)');
  });

  document.getElementById('btn-clear-checked').addEventListener('click', async () => {
    const list = activeList();
    const res = await api.clearChecked(list.id);
    state = res.state;
    render();
    showToast(res.removedCount ? `Cleared ${res.removedCount} checked item(s)` : 'No checked items to clear');
  });

  document.getElementById('btn-export-csv').addEventListener('click', async () => {
    const list = activeList();
    const res = await api.exportHouseholdCsv(list.id, { saveDialog: true });
    if (res.saved) {
      showToast(`Exported ${res.filename}`);
    } else {
      await api.copyText(res.csv);
      showToast(`Copied ${res.filename} CSV to clipboard`);
    }
  });

  // New List Modal
  document.getElementById('btn-new-list').addEventListener('click', () => {
    document.getElementById('new-list-modal').hidden = false;
  });
  document.getElementById('btn-close-new-list').addEventListener('click', () => {
    document.getElementById('new-list-modal').hidden = true;
  });
  document.getElementById('new-list-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await api.createList({
      name: document.getElementById('new-list-name').value.trim(),
      icon: document.getElementById('new-list-icon').value.trim() || '🛍️',
      accent: document.getElementById('new-list-accent').value || '#00bcd4',
      subtitle: document.getElementById('new-list-sub').value.trim(),
    });
    state = res.state;
    document.getElementById('new-list-name').value = '';
    document.getElementById('new-list-modal').hidden = true;
    render();
    showToast('Created new shopping list');
  });

  // Google Drive Sync & Sign-in
  document.getElementById('btn-google-signin').addEventListener('click', async () => {
    try {
      showToast('Opening Google Sign-In in your browser…');
      const res = await api.signInGoogle();
      state = res.state;
      render();
      showToast('Signed in to Google Drive!');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('chk-auto-sync').addEventListener('change', async (e) => {
    state = await api.updateSyncConfig({
      autoSync: e.target.checked,
      accountId: document.getElementById('gdrive-account').value,
    });
    render();
  });

  document.getElementById('gdrive-webapp-url').addEventListener('change', async (e) => {
    state = await api.updateSyncConfig({ appsScriptWebAppUrl: e.target.value.trim() });
    render();
  });

  document.getElementById('btn-sync-drive').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-drive');
    const statusBox = document.getElementById('sync-status-box');
    btn.disabled = true;
    btn.textContent = '⏳ Syncing Google Docs & Drive…';
    statusBox.textContent = 'Uploading native Google Docs (Grocery, Target, Costco) + shopping-lists.json…';
    try {
      const res = await api.syncGoogleDrive({
        accountId: document.getElementById('gdrive-account').value,
        folderInput: document.getElementById('gdrive-folder').value.trim(),
        appsScriptWebAppUrl: document.getElementById('gdrive-webapp-url').value.trim(),
        pullFromDocs: document.getElementById('chk-pull-docs').checked,
      });
      state = res.state;
      render();
      fireConfetti();
      showToast('☁️ Synced Grocery, Target & Costco Google Docs!');
    } catch (err) {
      statusBox.textContent = `⚠ ${err.message}`;
      showToast(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '☁️ Sync All 3 Lists to Google Docs & Drive';
    }
  });

  document.getElementById('doc-links-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-url]');
    if (!btn) return;
    api.openExternal(btn.dataset.openUrl);
  });

  document.getElementById('btn-share-drive').addEventListener('click', async () => {
    const emailInput = document.getElementById('share-email');
    const email = emailInput.value.trim();
    if (!email) return;
    try {
      const res = await api.shareGoogleFolder({
        accountId: document.getElementById('gdrive-account').value,
        emails: [email],
        role: 'writer',
      });
      const r = res.results?.[0];
      if (r?.ok) {
        emailInput.value = '';
        showToast(`Shared Google Drive folder & Docs with ${email}`);
      } else {
        showToast(r?.error || 'Could not share folder');
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  // QR mode pills & copy
  document.getElementById('qr-mode-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-qr]');
    if (!btn) return;
    qrMode = btn.dataset.qr;
    for (const b of document.querySelectorAll('#qr-mode-pills button')) b.classList.toggle('active', b === btn);
    refreshQr();
  });

  document.getElementById('btn-copy-qr-url').addEventListener('click', async () => {
    const url = currentQrTargetUrl();
    await api.copyText(url);
    showToast('Copied mobile link');
  });

  // Phone Preview Modal
  async function refreshPhoneIframe() {
    const list = activeList();
    if (!list) return;
    const iframe = document.getElementById('phone-preview-iframe');
    if (previewMode === 'doc') {
      const res = await api.previewGoogleDoc(list.id);
      iframe.src = res.previewUrl;
    } else {
      const base = state.mobileServer?.localUrl || 'http://127.0.0.1:19225';
      iframe.src = `${base}/?list=${encodeURIComponent(list.id)}`;
    }
  }

  document.getElementById('btn-open-phone-modal').addEventListener('click', () => {
    document.getElementById('phone-preview-modal').hidden = false;
    refreshPhoneIframe();
  });
  document.getElementById('btn-close-phone-modal').addEventListener('click', () => {
    document.getElementById('phone-preview-modal').hidden = true;
  });
  document.getElementById('preview-mode-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    previewMode = btn.dataset.mode;
    for (const b of document.querySelectorAll('#preview-mode-tabs button')) b.classList.toggle('active', b === btn);
    refreshPhoneIframe();
  });

  // Serverless Google Drive Apps Script Wizard Modal
  document.getElementById('btn-open-apps-script').addEventListener('click', async () => {
    const bundle = await api.getAppsScriptBundle();
    document.getElementById('textarea-codegs').value = bundle.codeGs;
    document.getElementById('textarea-indexhtml').value = bundle.indexHtml;
    document.getElementById('apps-script-modal').hidden = false;
  });
  document.getElementById('btn-close-apps-script').addEventListener('click', () => {
    document.getElementById('apps-script-modal').hidden = true;
  });
  document.getElementById('btn-copy-codegs').addEventListener('click', async () => {
    await api.copyText(document.getElementById('textarea-codegs').value);
    showToast('Copied Code.gs to clipboard');
  });
  document.getElementById('btn-copy-indexhtml').addEventListener('click', async () => {
    await api.copyText(document.getElementById('textarea-indexhtml').value);
    showToast('Copied Index.html to clipboard');
  });

  // Live IPC state updates (e.g. when a phone adds/checks/removes an item!)
  api.onState((payload) => {
    if (payload?.state) {
      state = payload.state;
      render();
    }
  });

  // Boot
  api.getState().then((initial) => {
    state = initial;
    render();
  });
})();
