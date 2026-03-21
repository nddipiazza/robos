'use strict';

let indexes = [];
let selectedId = null;
let rebuildingIds = new Set();
let searchDebounce;

async function load() {
  indexes = await si.listIndexes();
  renderList();
  if (selectedId) showDetail(selectedId);
}

si.onProgress(({ id, fileCount }) => {
  const el = document.getElementById('progress-' + id);
  if (el) el.textContent = fileCount.toLocaleString() + ' files found...';
  if (selectedId === id) {
    document.getElementById('progress-label').textContent = fileCount.toLocaleString() + ' files found...';
  }
});

si.onDone(({ id }) => {
  rebuildingIds.delete(id);
  load();
  if (selectedId === id) {
    document.getElementById('rebuild-progress').classList.add('hidden');
    document.getElementById('progress-label').textContent = '';
  }
});

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
    return '<div class="index-card' + (selectedId === idx.id ? ' selected' : '') + '" data-id="' + idx.id + '">' +
      '<div class="index-card-top">' +
        '<span class="index-card-name">' + esc(idx.name) + '</span>' +
        (idx.system ? '<span class="badge badge-sys">SYSTEM</span>' : '<span class="badge badge-custom">CUSTOM</span>') +
      '</div>' +
      '<div class="index-card-meta">' +
        (isRebuilding
          ? '<span class="rebuilding" id="progress-' + idx.id + '">Indexing...</span>'
          : '<span class="' + (stale ? 'stale' : 'fresh') + '">' + (idx.fileCount > 0 ? idx.fileCount.toLocaleString() + ' files' : 'empty') + '</span>' +
            '<span class="meta-sep">&middot;</span>' +
            '<span class="age">' + age + '</span>'
        ) +
      '</div>' +
    '</div>';
  }).join('');

  el.querySelectorAll('.index-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedId = card.dataset.id;
      renderList();
      showDetail(selectedId);
    });
  });
}

function showDetail(id) {
  const idx = indexes.find(i => i.id === id);
  if (!idx) return;
  document.getElementById('detail-empty').classList.add('hidden');
  document.getElementById('detail-panel').classList.remove('hidden');
  document.getElementById('detail-name').textContent = idx.name;
  const age = idx.lastIndexed ? 'Last indexed ' + timeAgo(idx.lastIndexed) : 'Never indexed';
  document.getElementById('detail-meta').textContent =
    (idx.fileCount > 0 ? idx.fileCount.toLocaleString() + ' files' : 'No index yet') + '  --  ' + age;
  document.getElementById('detail-paths').innerHTML = idx.paths.map(p =>
    '<div class="path-chip">' + esc(p) + '</div>'
  ).join('');
  const delBtn = document.getElementById('btn-delete-sel');
  delBtn.classList.toggle('hidden', !!idx.system);
  delBtn.onclick = () => doDelete(id);
  document.getElementById('btn-rebuild-sel').onclick = () => doRebuild(id);
}

async function doRebuild(id) {
  if (rebuildingIds.has(id)) return;
  rebuildingIds.add(id);
  renderList();
  const prog = document.getElementById('rebuild-progress');
  prog.classList.remove('hidden');
  document.getElementById('progress-label').textContent = 'Starting...';
  document.getElementById('progress-bar').style.width = '0%';
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

async function doDelete(id) {
  if (!confirm('Delete this index?')) return;
  await si.deleteIndex(id);
  selectedId = null;
  document.getElementById('detail-panel').classList.add('hidden');
  document.getElementById('detail-empty').classList.remove('hidden');
  load();
}

document.getElementById('search-input').addEventListener('input', e => {
  clearTimeout(searchDebounce);
  const q = e.target.value.trim();
  if (!q) { document.getElementById('search-results').innerHTML = ''; return; }
  searchDebounce = setTimeout(() => doSearch(q), 250);
});

async function doSearch(query) {
  const res = document.getElementById('search-results');
  res.innerHTML = '<div class="search-loading">Searching...</div>';
  const r = await si.searchIndex({ query, limit: 40 });
  if (!r.results || !r.results.length) {
    res.innerHTML = '<div class="search-empty">No results found.</div>';
    return;
  }
  res.innerHTML = r.results.map(item => {
    const dir = item.path.replace(/\/[^/]+\/?$/, '/');
    const icon = item.isDir ? '\uD83D\uDCC1' : '\uD83D\uDCC4';
    return '<div class="search-result-row">' +
      '<span class="sr-icon">' + icon + '</span>' +
      '<span class="sr-body">' +
        '<span class="sr-name">' + esc(item.name) + '</span>' +
        '<span class="sr-path">' + esc(dir) + '</span>' +
      '</span>' +
    '</div>';
  }).join('');
}

// Add modal
document.getElementById('btn-add').onclick = () => {
  document.getElementById('add-name').value = '';
  document.getElementById('add-paths').value = '';
  document.getElementById('add-error').classList.add('hidden');
  document.getElementById('modal-add').classList.remove('hidden');
};
document.getElementById('btn-add-cancel').onclick = () => {
  document.getElementById('modal-add').classList.add('hidden');
};
document.getElementById('btn-add-confirm').onclick = async () => {
  const name = document.getElementById('add-name').value.trim();
  const paths = document.getElementById('add-paths').value.split('\n').map(l => l.trim()).filter(Boolean);
  const errEl = document.getElementById('add-error');
  if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
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

document.getElementById('modal-add').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  if (hours < 24) return hours + 'h ago';
  return days + 'd ago';
}

load();
