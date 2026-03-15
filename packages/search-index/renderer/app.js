'use strict';

let indexes = [];
let selectedId = null;
let rebuildingIds = new Set();
let searchDebounce;

// ── Init ──────────────────────────────────────────────────────────────────────
async function load() {
  indexes = await si.listIndexes();
  renderList();
  if (selectedId) showDetail(selectedId);
}

// ── Progress events ───────────────────────────────────────────────────────────
si.onProgress(({ id, fileCount }) => {
  const el = document.getElementById(`progress-${id}`);
  if (el) el.textContent = `${fileCount.toLocaleString()} files found…`;
  if (selectedId === id) {
    document.getElementById('progress-label').textContent = `${fileCount.toLocaleString()} files found…`;
  }
});

si.onDone(({ id, fileCount }) => {
  rebuildingIds.delete(id);
  load();
  if (selectedId === id) {
    document.getElementById('rebuild-progress').classList.add('hidden');
    document.getElementById('progress-label').textContent = '';
  }
});

// ── Render list ───────────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('index-list');
  if (!indexes.length) {
    el.innerHTML = '<div class="loading">No indexes configured.</div>';
    return;
  }
  el.innerHTML = indexes.map(idx => {
    const isRebuilding = rebuildingIds.has(idx.id);
    const age = idx.lastIndexed ? timeAgo(idx.lastIndexed) : 'never indexed';
    const stale = !idx.lastIndexed || (Date.now() - new Date(idx.lastIndexed)) > 3600000;
    return `<div class="index-card${selectedId === idx.id ? ' selected' : ''}" data-id="${idx.id}">
      <div class="index-card-top">
        <span class="index-icon">${idx.system ? '⚙️' : '📂'}</span>
        <span class="index-card-name">${esc(idx.name)}</span>
        ${idx.system ? '<span class="badge badge-sys">SYSTEM</span>' : '<span class="badge badge-custom">CUSTOM</span>'}
      </div>
      <div class="index-card-meta">
        ${isRebuilding
          ? `<span class="rebuilding" id="progress-${idx.id}">⏳ Indexing…</span>`
          : `<span class="${stale ? 'stale' : 'fresh'}">${idx.fileCount > 0 ? idx.fileCount.toLocaleString() + ' files' : 'empty'}</span>
             <span class="meta-sep">·</span>
             <span class="age">${age}</span>`
        }
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('.index-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedId = card.dataset.id;
      renderList();
      showDetail(selectedId);
    });
  });
}

// ── Detail panel ──────────────────────────────────────────────────────────────
function showDetail(id) {
  const idx = indexes.find(i => i.id === id);
  if (!idx) return;
  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');

  document.getElementById('detail-name').textContent = idx.name;
  const age = idx.lastIndexed ? `Last indexed ${timeAgo(idx.lastIndexed)}` : 'Never indexed';
  document.getElementById('detail-meta').textContent =
    `${idx.fileCount > 0 ? idx.fileCount.toLocaleString() + ' files' : 'No index yet'}  ·  ${age}`;

  document.getElementById('detail-paths').innerHTML = idx.paths.map(p =>
    `<div class="path-chip">📂 ${esc(p)}</div>`
  ).join('');

  const delBtn = document.getElementById('btn-delete-sel');
  delBtn.classList.toggle('hidden', !!idx.system);
  delBtn.onclick = () => doDelete(id);

  document.getElementById('btn-rebuild-sel').onclick = () => doRebuild(id);
}

// ── Rebuild ───────────────────────────────────────────────────────────────────
async function doRebuild(id) {
  if (rebuildingIds.has(id)) return;
  rebuildingIds.add(id);
  renderList();

  const prog = document.getElementById('rebuild-progress');
  prog.classList.remove('hidden');
  document.getElementById('progress-label').textContent = 'Starting…';
  document.getElementById('progress-bar').style.width = '0%';

  // Animate bar while rebuilding
  let w = 0;
  const anim = setInterval(() => {
    w = Math.min(w + 0.5, 90);
    document.getElementById('progress-bar').style.width = w + '%';
  }, 200);

  await si.rebuildIndex(id);
  clearInterval(anim);
  document.getElementById('progress-bar').style.width = '100%';
}

async function doRebuildAll() {
  for (const idx of indexes) {
    if (!rebuildingIds.has(idx.id)) doRebuild(idx.id);
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function doDelete(id) {
  if (!confirm('Delete this index? The index file will be removed.')) return;
  await si.deleteIndex(id);
  selectedId = null;
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('detail-empty').classList.remove('hidden');
  load();
}

// ── Search ────────────────────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (!q) { document.getElementById('search-results').innerHTML = ''; return; }
  searchDebounce = setTimeout(() => doSearch(q), 250);
});

async function doSearch(query) {
  const res = document.getElementById('search-results');
  res.innerHTML = '<div class="search-loading">Searching…</div>';
  const r = await si.searchIndex({ query, limit: 40 });
  if (!r.results || !r.results.length) {
    res.innerHTML = '<div class="search-empty">No results found.</div>';
    return;
  }
  const q = query.toLowerCase();
  res.innerHTML = r.results.map(item => {
    const nameParts = fuzzyHighlight(item.name, q);
    const dir = item.path.replace(/\/[^/]+\/?$/, '/');
    const icon = item.isDir ? '📁' : fileIcon(item.name);
    return `<div class="search-result-row">
      <span class="sr-icon">${icon}</span>
      <span class="sr-body">
        <span class="sr-name">${nameParts}</span>
        <span class="sr-path">${esc(dir)}</span>
      </span>
    </div>`;
  }).join('');
}

// ── Add modal ─────────────────────────────────────────────────────────────────
document.getElementById('btn-add').onclick = () => {
  document.getElementById('add-name').value = '';
  document.getElementById('add-paths').value = '';
  document.getElementById('add-error').classList.add('hidden');
  document.getElementById('modal-add').classList.remove('hidden');
  setTimeout(() => document.getElementById('add-name').focus(), 50);
};
document.getElementById('btn-add-cancel').onclick = () => {
  document.getElementById('modal-add').classList.add('hidden');
};
document.getElementById('btn-add-confirm').onclick = async () => {
  const name  = document.getElementById('add-name').value.trim();
  const paths = document.getElementById('add-paths').value.split('\n').map(l => l.trim()).filter(Boolean);
  const errEl = document.getElementById('add-error');
  if (!name)         { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
  if (!paths.length) { errEl.textContent = 'At least one path is required'; errEl.classList.remove('hidden'); return; }
  const r = await si.addIndex({ name, paths });
  if (!r.ok) { errEl.textContent = r.error; errEl.classList.remove('hidden'); return; }
  document.getElementById('modal-add').classList.add('hidden');
  await load();
  selectedId = r.index.id;
  renderList();
  showDetail(selectedId);
};

document.getElementById('btn-rebuild-all').onclick = doRebuildAll;

// Close modal on backdrop click
document.getElementById('modal-add').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function fuzzyHighlight(text, query) {
  if (!query) return esc(text);
  const t = text.toLowerCase(), q = query.toLowerCase();
  const indices = new Set();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { indices.add(ti); qi++; }
  }
  return text.split('').map((ch, i) =>
    indices.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch)
  ).join('');
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const m = { js:'📜',ts:'📜',jsx:'📜',tsx:'📜',py:'🐍',rb:'💎',go:'🐹',rs:'🦀',
    java:'☕',json:'📋',yaml:'📋',yml:'📋',md:'📝',txt:'📝',sh:'🔧',
    html:'🌐',css:'🎨',png:'🖼️',jpg:'🖼️',svg:'🖼️',pdf:'📕',zip:'📦',log:'📋' };
  return m[ext] || '📄';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
load();


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'search-index');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
