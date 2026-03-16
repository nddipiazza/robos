'use strict';

let allIcons = {};
const grid   = document.getElementById('icon-grid');
const count  = document.getElementById('icon-count');
const status = document.getElementById('sync-status');
const search = document.getElementById('search-input');

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shortPath(p) {
  if (!p) return 'builtin (Lucide)';
  if (p.startsWith('/usr/local/share/robos/')) return p.replace('/usr/local/share/robos/', '.../');
  if (p.startsWith('/usr/local/share/'))       return p.replace('/usr/local/share/', '.../share/');
  if (p.startsWith('/usr/share/'))             return p.replace('/usr/share/', '.../usr/share/');
  return p;
}

// ── Render ────────────────────────────────────────────────────────────────────
async function render(icons) {
  const entries = Object.values(icons).sort((a, b) =>
    (a.label || a.appId).localeCompare(b.label || b.appId));

  if (!entries.length) {
    grid.innerHTML = '<div class="empty">No icons registered yet.</div>';
    return;
  }

  const imgData = await Promise.all(
    entries.map(e =>
      !e.iconSvg && e.iconPath && e.iconPath.startsWith('/')
        ? window.robos.readImage(e.iconPath)
        : Promise.resolve(null)
    )
  );

  grid.innerHTML = entries.map((e, i) => {
    const fileImg = imgData[i];
    let imgHtml;
    if (e.iconSvg && !fileImg) {
      imgHtml = `<div class="card-svg">${e.iconSvg}</div>`;
    } else if (fileImg) {
      imgHtml = `<img class="card-img" src="${esc(fileImg)}" alt="${esc(e.label)}">`;
    } else {
      imgHtml = `<span class="card-placeholder">?</span>`;
    }

    const iconLabel = fileImg ? shortPath(e.iconPath) : (e.category ? `${e.category} (builtin)` : '(none)');
    const hasCustom = !!fileImg;

    return `
      <div class="icon-card${hasCustom ? ' has-custom' : ''}" data-appid="${esc(e.appId)}" title="${esc(e.label || e.appId)}">
        <span class="card-change-hint">change</span>
        <div class="card-img-wrap">${imgHtml}</div>
        <div class="card-label">${esc(e.label || e.appId)}</div>
        <div class="card-appid">${esc(e.appId)}</div>
        <div class="card-path">${esc(iconLabel)}</div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.icon-card').forEach(card => {
    card.addEventListener('click', () => changeIcon(card.dataset.appid));
  });
}

// ── Filter ────────────────────────────────────────────────────────────────────
function applyFilter(q) {
  const lower = q.toLowerCase();
  const filtered = Object.fromEntries(
    Object.entries(allIcons).filter(([id, e]) =>
      !q || id.includes(lower) || (e.label || '').toLowerCase().includes(lower)
    )
  );
  render(filtered);
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  grid.innerHTML = '<div class="empty">Loading icons...</div>';
  const res = await window.robos.listIcons();
  allIcons = res.icons || {};
  const n = Object.keys(allIcons).length;
  count.textContent = `${n} app${n !== 1 ? 's' : ''}`;
  applyFilter(search.value);
}

// ── Change icon ───────────────────────────────────────────────────────────────
async function changeIcon(appId) {
  const res = await window.robos.updateIcon(appId);
  if (!res.ok) return;
  allIcons[appId] = { ...allIcons[appId], iconPath: res.iconPath };
  applyFilter(search.value);
  showStatus(`Icon updated for ${appId}`, 'ok');
}

// ── Push Icons (write icon.svg + sync .desktop) ───────────────────────────────
document.getElementById('btn-push-icons').addEventListener('click', async () => {
  const btn      = document.getElementById('btn-push-icons');
  const progress = document.getElementById('push-progress');
  const msgEl    = progress.querySelector('.push-msg');
  const fillEl   = progress.querySelector('.push-bar-fill');

  btn.disabled = true;
  btn.textContent = 'Pushing...';
  progress.classList.remove('hidden');
  msgEl.textContent = 'Starting...';
  fillEl.style.width = '0%';

  window.robos.onPushProgress((data) => {
    const pct  = Math.round((data.step / data.total) * 100);
    const icon = data.ok ? 'OK' : 'FAIL';
    const note = data.error ? ` - ${data.error}` : '';
    msgEl.textContent = `${icon} (${data.step}/${data.total}) ${data.label || data.appId}${note}`;
    fillEl.style.width = `${pct}%`;
  });

  const res = await window.robos.pushIcons();

  btn.disabled = false;
  btn.textContent = 'Push Icons';
  progress.classList.add('hidden');
  fillEl.style.width = '0%';

  showStatus(
    res.ok
      ? `Pushed ${res.pushed} icons - SVG files written & .desktop entries updated`
      : `${res.pushed} pushed, ${res.failed} failed - check console for details`,
    res.ok ? 'ok' : 'err'
  );

  await load();
});

document.getElementById('btn-refresh').addEventListener('click', load);

search.addEventListener('input', () => applyFilter(search.value));

// ── Status banner ─────────────────────────────────────────────────────────────
function showStatus(msg, type) {
  status.textContent = msg;
  status.className = type;
  setTimeout(() => { status.className = 'hidden'; }, 4000);
}

load();
