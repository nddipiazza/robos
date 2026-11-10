'use strict';

(() => {
  let state = null;
  let selectedBadge = '';
  let filterMode = 'all';
  let searchQuery = '';
  let lastListId = null;

  const urlListParam = new URLSearchParams(window.location.search).get('list');

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('m-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function burstConfetti() {
    const layer = document.getElementById('confetti-layer');
    const colors = ['#10b981', '#00bcd4', '#f59e0b', '#ec4899', '#3b82f6', '#a855f7'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = `${30 + Math.random() * 40}%`;
      p.style.top = '28%';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 260}px`);
      p.style.setProperty('--dy', `${80 + Math.random() * 240}px`);
      layer.appendChild(p);
      setTimeout(() => p.remove(), 950);
    }
  }

  async function apiPost(endpoint, body) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
    if (data.state) {
      state = data.state;
      render();
    }
    return data;
  }

  function getActiveList() {
    if (!state || !state.lists?.length) return null;
    return state.lists.find((l) => l.id === state.activeListId) || state.lists[0];
  }

  function render() {
    const list = getActiveList();
    if (!list) return;

    document.documentElement.style.setProperty('--accent', list.accent || '#10b981');
    document.documentElement.style.setProperty('--accent-glow', list.accentGlow || 'rgba(16,185,129,0.24)');

    document.getElementById('m-title').textContent = `${list.name} List`;
    document.getElementById('m-add-store-label').textContent = list.name;
    document.getElementById('m-doc-preview-link').href = list.docUrl || `/doc-preview/${encodeURIComponent(list.id)}`;

    // Tabs
    document.getElementById('m-store-tabs').innerHTML = state.lists.map((l) => `
      <button type="button" class="m-store-tab ${l.id === list.id ? 'active' : ''}" data-list-id="${esc(l.id)}">
        <span>${esc(l.icon)} ${esc(l.name)}</span>
        <span class="m-tab-count">${l.stats.toBuyCount}</span>
      </button>
    `).join('');

    // Stats & progress
    document.getElementById('m-stats-text').textContent = `${list.stats.toBuyCount} to buy · ${list.stats.checkedCount} in cart (${list.stats.progressPct}%)`;
    document.getElementById('m-est-text').textContent = `Est. $${list.stats.estRemaining.toFixed(2)} left · $${list.stats.estTotal.toFixed(2)} total`;
    document.getElementById('m-progress-fill').style.width = `${list.stats.progressPct}%`;

    // Google Docs / Drive quick links bar
    const docLinks = [];
    if (list.docUrl) {
      docLinks.push(`<a class="m-doc-chip" href="${esc(list.docUrl)}" target="_blank" rel="noopener">📄 Open ${esc(list.name)} in Google Docs</a>`);
    }
    if (state.sync?.folderUrl) {
      docLinks.push(`<a class="m-doc-chip" href="${esc(state.sync.folderUrl)}" target="_blank" rel="noopener">📁 Google Drive Folder</a>`);
    }
    docLinks.push(`<button type="button" class="m-doc-chip" id="m-sync-drive-btn" style="cursor:pointer;border:1px solid #30363d;background:#161b22;color:#e2e8f0">🔄 Sync Docs</button>`);
    docLinks.push(`<a class="m-doc-chip" href="/qr" target="_blank" rel="noopener">📱 QR / Phone Link</a>`);
    document.getElementById('m-docs-bar').innerHTML = docLinks.join('');

    // Units & Aisles (repopulate when active list changes)
    if (lastListId !== list.id) {
      lastListId = list.id;
      document.getElementById('m-item-unit').innerHTML = (state.units || ['ea']).map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('');
      document.getElementById('m-item-aisle').innerHTML = `<option value="auto">✨ Auto-detect aisle</option>`
        + (list.aisles || []).map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
    }

    // Badges
    document.getElementById('m-badge-row').innerHTML = (state.badges || []).map((b) => `
      <button type="button" class="m-badge-pill ${selectedBadge === b.id ? 'active' : ''}" data-badge="${esc(b.id)}">
        ${b.icon ? `${esc(b.icon)} ` : ''}${esc(b.label)}
      </button>
    `).join('');

    // Staples
    document.getElementById('m-staple-chips').innerHTML = (list.staples || []).map((s, idx) => `
      <button type="button" class="m-chip" data-staple-idx="${idx}">＋ ${esc(s.name)}</button>
    `).join('');

    // Filter items
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

    const formatShortTs = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    };

    const renderCard = (it) => {
      const b = badgeMap.get(it.badge);
      const tagHtml = b ? `<span class="m-tag" style="color:${esc(b.color)}">${esc(b.icon)} ${esc(b.label)}</span>` : '';
      const priceStr = it.estPrice != null ? ` · $${(it.estPrice * it.qty).toFixed(2)}` : '';
      const noteStr = it.note ? ` · ${esc(it.note)}` : '';
      const tsLabel = it.checked
        ? (formatShortTs(it.checkedAt || it.updatedAt) ? ` · Checked ${formatShortTs(it.checkedAt || it.updatedAt)}` : '')
        : (formatShortTs(it.addedAt || it.updatedAt) ? ` · Added ${formatShortTs(it.addedAt || it.updatedAt)}` : '');
      return `
        <div class="m-item-card ${it.checked ? 'checked' : ''}" data-item-id="${esc(it.id)}">
          <button type="button" class="m-check-btn" data-action="toggle" data-id="${esc(it.id)}" aria-label="Check off ${esc(it.name)}">
            ${it.checked ? '✓' : ''}
          </button>
          <div class="m-item-body">
            <div class="m-item-name-row">
              <span class="m-item-name">${esc(it.name)}</span>
              ${tagHtml}
            </div>
            <div class="m-item-sub">${esc(it.aisle)}${priceStr}${noteStr}${esc(tsLabel)}</div>
          </div>
          <div class="m-item-actions">
            <button type="button" class="m-row-step" data-action="dec" data-id="${esc(it.id)}" aria-label="Decrease quantity">−</button>
            <span class="m-row-qty">${it.qty} ${esc(it.unit)}</span>
            <button type="button" class="m-row-step" data-action="inc" data-id="${esc(it.id)}" aria-label="Increase quantity">+</button>
            <button type="button" class="m-remove-btn" data-action="remove" data-id="${esc(it.id)}" aria-label="Remove ${esc(it.name)}">Remove</button>
          </div>
        </div>
      `;
    };

    let html = '';
    for (const [aisle, arr] of groups.entries()) {
      if (!arr.length) continue;
      html += `<div class="m-aisle-group"><div class="m-aisle-head"><span>${esc(aisle)}</span><span>${arr.length}</span></div>${arr.map(renderCard).join('')}</div>`;
    }
    if (checked.length) {
      html += `<div class="m-aisle-group"><div class="m-aisle-head" style="color:#94a3b8"><span>✅ In Cart</span><span>${checked.length}</span></div>${checked.map(renderCard).join('')}</div>`;
    }
    if (!html) {
      html = `<div class="m-empty">No matching items. Use the form or 1-tap chips above to add items!</div>`;
    }
    document.getElementById('m-items-container').innerHTML = html;

    document.getElementById('m-undo-btn').disabled = !state.canUndo;
  }

  // Event listeners
  document.getElementById('m-docs-bar').addEventListener('click', async (e) => {
    const syncBtn = e.target.closest('#m-sync-drive-btn');
    if (!syncBtn) return;
    syncBtn.disabled = true;
    syncBtn.textContent = '⏳ Syncing…';
    try {
      await apiPost('/api/sync', {});
      showToast('Synced all 3 lists with Google Docs!');
    } catch (err) {
      showToast(err.message);
    } finally {
      render();
    }
  });

  document.getElementById('m-store-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-list-id]');
    if (!btn) return;
    apiPost('/api/list/select', { listId: btn.dataset.listId }).catch((err) => showToast(err.message));
  });

  document.getElementById('m-qty-dec').addEventListener('click', () => {
    const input = document.getElementById('m-item-qty');
    input.value = String(Math.max(1, (Number(input.value) || 1) - 1));
  });
  document.getElementById('m-qty-inc').addEventListener('click', () => {
    const input = document.getElementById('m-item-qty');
    input.value = String((Number(input.value) || 1) + 1);
  });

  document.getElementById('m-badge-row').addEventListener('click', (e) => {
    const pill = e.target.closest('[data-badge]');
    if (!pill) return;
    selectedBadge = pill.dataset.badge;
    render();
  });

  document.getElementById('m-toggle-batch').addEventListener('click', () => {
    const single = document.getElementById('m-single-fields');
    const batch = document.getElementById('m-batch-fields');
    const toggle = document.getElementById('m-toggle-batch');
    const showBatch = batch.hidden;
    batch.hidden = !showBatch;
    single.hidden = showBatch;
    toggle.textContent = showBatch ? '← Single item form' : 'Multi-item / Recipe paste';
  });

  document.getElementById('m-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const list = getActiveList();
    if (!list) return;
    const nameEl = document.getElementById('m-item-name');
    const name = nameEl.value.trim();
    if (!name) return;
    try {
      const res = await apiPost('/api/item/add', {
        listId: list.id,
        name,
        qty: Number(document.getElementById('m-item-qty').value || 1),
        unit: document.getElementById('m-item-unit').value,
        aisle: document.getElementById('m-item-aisle').value,
        estPrice: document.getElementById('m-item-price').value,
        note: document.getElementById('m-item-note').value.trim(),
        badge: selectedBadge,
      });
      nameEl.value = '';
      document.getElementById('m-item-qty').value = '1';
      document.getElementById('m-item-price').value = '';
      document.getElementById('m-item-note').value = '';
      selectedBadge = '';
      render();
      showToast(res.merged ? `Updated ${res.item.name} (×${res.item.qty})` : `Added ${res.item.name}`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('m-batch-submit').addEventListener('click', async () => {
    const list = getActiveList();
    const box = document.getElementById('m-batch-input');
    const text = box.value.trim();
    if (!text) return;
    try {
      const res = await apiPost('/api/smart-add', { text, listId: list?.id });
      box.value = '';
      showToast(`Routed & added ${res.added?.length || 0} items`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('m-staple-chips').addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-staple-idx]');
    if (!chip) return;
    const list = getActiveList();
    const staple = list?.staples?.[Number(chip.dataset.stapleIdx)];
    if (!staple) return;
    try {
      const res = await apiPost('/api/item/add', { listId: list.id, ...staple });
      showToast(res.merged ? `${staple.name} → ×${res.item.qty}` : `Added ${staple.name}`);
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('m-filter-pills').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    filterMode = btn.dataset.filter;
    for (const b of document.querySelectorAll('#m-filter-pills button')) {
      b.classList.toggle('active', b === btn);
    }
    render();
  });

  document.getElementById('m-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    render();
  });

  document.getElementById('m-items-container').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const list = getActiveList();
    const itemId = btn.dataset.id;
    const action = btn.dataset.action;
    try {
      if (action === 'toggle') {
        const prevPct = list.stats.progressPct;
        await apiPost('/api/item/toggle', { listId: list.id, itemId });
        const nextList = getActiveList();
        if (nextList.stats.progressPct === 100 && prevPct < 100) {
          burstConfetti();
          showToast(`🎉 ${nextList.name} list 100% complete!`);
        }
      } else if (action === 'inc') {
        await apiPost('/api/item/qty', { listId: list.id, itemId, delta: 1 });
      } else if (action === 'dec') {
        await apiPost('/api/item/qty', { listId: list.id, itemId, delta: -1 });
      } else if (action === 'remove') {
        const res = await apiPost('/api/item/remove', { listId: list.id, itemId });
        showToast(`Removed ${res.removed?.name || 'item'} (tap Undo to restore)`);
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('m-undo-btn').addEventListener('click', async () => {
    try {
      const res = await apiPost('/api/list/undo', {});
      if (res.restored) showToast('Restored item');
    } catch (err) {
      showToast(err.message);
    }
  });

  document.getElementById('m-clear-btn').addEventListener('click', async () => {
    const list = getActiveList();
    if (!list) return;
    try {
      const res = await apiPost('/api/list/clear-checked', { listId: list.id });
      showToast(res.removedCount ? `Cleared ${res.removedCount} checked item(s)` : 'No checked items to clear');
    } catch (err) {
      showToast(err.message);
    }
  });

  // ── Voice Dictation -> Whisper STT -> RobOS Agent (`/shopping-lists` skill) ──
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let speechRec = null;
  let browserTranscript = '';
  let recordTimer = null;
  let recordSeconds = 0;

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function setDictateBanner(html, show = true) {
    const el = document.getElementById('m-dictate-banner');
    if (!el) return;
    el.innerHTML = html;
    el.hidden = !show;
  }

  async function toggleDictation() {
    const btn = document.getElementById('m-dictate-btn');
    const icon = document.getElementById('m-dictate-icon');
    const label = document.getElementById('m-dictate-label');

    // If currently recording, stop and send audio to RobOS Agent
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      clearInterval(recordTimer);
      try { if (speechRec) speechRec.stop(); } catch {}
      mediaRecorder.stop();
      return;
    }

    // Start recording microphone audio
    try {
      browserTranscript = '';
      audioChunks = [];
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';
      mediaRecorder = preferredMime ? new MediaRecorder(mediaStream, { mimeType: preferredMime }) : new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
      };

      // Optional browser SpeechRecognition hint alongside raw audio
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          speechRec = new SR();
          speechRec.lang = 'en-US';
          speechRec.continuous = true;
          speechRec.interimResults = true;
          speechRec.onresult = (event) => {
            let text = '';
            for (let i = 0; i < event.results.length; i++) {
              text += event.results[i][0].transcript + ' ';
            }
            browserTranscript = text.trim();
            if (browserTranscript) {
              setDictateBanner(`🔴 <strong>Listening (${recordSeconds}s):</strong> "${esc(browserTranscript)}" — tap <strong>Stop &amp; Send</strong> when done.`);
            }
          };
          speechRec.start();
        } catch {}
      }

      mediaRecorder.onstop = async () => {
        try {
          if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
        } catch {}
        btn.classList.remove('recording');
        btn.classList.add('busy');
        btn.disabled = true;
        icon.textContent = '⏳';
        label.textContent = 'Agent…';
        setDictateBanner('⏳ <strong>Transcribing audio &amp; running RobOS Agent (<code>/shopping-lists</code> skill)…</strong>');

        try {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const blob = new Blob(audioChunks, { type: mimeType });
          const audioBase64 = await blobToBase64(blob);
          const list = getActiveList();
          const res = await apiPost('/api/dictate', {
            audioBase64,
            mimeType,
            transcriptHint: browserTranscript,
            listId: list?.id,
          });
          const cmdsHtml = (res.skillCommands || []).map((c) => `<code>${esc(c)}</code>`).join(' · ');
          setDictateBanner(
            `<div>🎙️ <strong>Heard:</strong> "${esc(res.transcript)}"</div>`
            + `<div style="margin-top:4px;color:#34d399;">🤖 <strong>RobOS Agent (<code>/shopping-lists</code>):</strong> ${esc(res.summary)}</div>`
            + (cmdsHtml ? `<div style="margin-top:4px;font-size:11px;color:#94a3b8;">Skill commands: ${cmdsHtml}</div>` : ''),
            true,
          );
          showToast(res.summary || 'Dictation applied to shopping list!');
        } catch (err) {
          setDictateBanner(`⚠️ <strong>Dictation failed:</strong> ${esc(err.message)}`, true);
          showToast(err.message);
        } finally {
          btn.classList.remove('busy');
          btn.disabled = false;
          icon.textContent = '🎙️';
          label.textContent = 'Dictate';
          mediaRecorder = null;
          mediaStream = null;
        }
      };

      mediaRecorder.start(250);
      recordSeconds = 0;
      btn.classList.add('recording');
      icon.textContent = '🔴';
      label.textContent = 'Stop & Send (0s)';
      setDictateBanner('🔴 <strong>Listening…</strong> Speak your items or recipe (e.g. <em>"Add 2 gallons of whole milk and avocados to grocery, and laundry pods to Target"</em>), then tap <strong>Stop &amp; Send</strong>.');
      recordTimer = setInterval(() => {
        recordSeconds += 1;
        label.textContent = `Stop & Send (${recordSeconds}s)`;
      }, 1000);
    } catch (err) {
      showToast(`Microphone error: ${err.message || 'Check browser mic permission'}`);
    }
  }

  document.getElementById('m-dictate-btn')?.addEventListener('click', toggleDictation);

  // Initial load + SSE live updates
  async function boot() {
    const res = await fetch('/api/state');
    state = await res.json();
    if (urlListParam && state.lists.some((l) => l.id === urlListParam)) {
      await apiPost('/api/list/select', { listId: urlListParam });
    } else {
      render();
    }

    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.state) {
          state = msg.state;
          render();
        }
      } catch {}
    };
    es.onerror = () => {
      document.getElementById('m-live-text').textContent = 'Reconnecting…';
    };
    es.onopen = () => {
      document.getElementById('m-live-text').textContent = 'Live Sync';
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }

  boot().catch((err) => showToast(err.message));
})();
