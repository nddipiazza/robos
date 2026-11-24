'use strict';

/**
 * RobOS Media Server — Built-in Web Console, Cinema/Audio Player & eBook Reader UI
 */

function renderBookReaderHtml(item) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const isPdf = item.ext === '.pdf';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(item.title)} — RobOS Book Reader</title>
<style>
  :root { --bg:#0d1117; --card:#161b22; --border:#29323e; --fg:#e6edf3; --muted:#8b949e; --accent:#00bcd4; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,sans-serif; display:flex; flex-direction:column; height:100vh; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 18px; background:var(--card); border-bottom:1px solid var(--border); }
  .title-wrap { min-width:0; }
  .title-wrap strong { display:block; font-size:15px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .title-wrap span { font-size:12px; color:var(--muted); }
  .controls { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  button, a.btn, select { background:#1f2937; color:var(--fg); border:1px solid var(--border); border-radius:6px; padding:6px 12px; font-size:13px; cursor:pointer; text-decoration:none; }
  button:hover, a.btn:hover { border-color:var(--accent); }
  main { flex:1; display:grid; grid-template-columns:${isPdf ? '1fr' : '260px 1fr'}; min-height:0; }
  aside { border-right:1px solid var(--border); background:#11161d; overflow-y:auto; padding:12px; }
  .toc-item { display:block; width:100%; text-align:left; background:transparent; border:none; color:var(--muted); padding:8px 10px; border-radius:6px; margin-bottom:2px; font-size:13px; }
  .toc-item.active, .toc-item:hover { background:#1c2531; color:var(--fg); }
  article { overflow-y:auto; padding:36px 24px 80px; line-height:1.75; font-size:18px; }
  .reader-inner { max-width:720px; margin:0 auto; font-family:Georgia,'Iowan Old Style',serif; }
  .reader-inner h1,.reader-inner h2,.reader-inner h3 { font-family:system-ui,sans-serif; line-height:1.3; color:#f8fafc; }
  iframe.pdf-frame { width:100%; height:100%; border:none; }
  @media (max-width:760px) { main { grid-template-columns:1fr; } aside { display:none; } }
</style>
</head>
<body>
<header>
  <div class="title-wrap">
    <strong>${esc(item.title)}</strong>
    <span>${esc(item.author || 'Unknown Author')} · ${esc(item.bookFormat)}</span>
  </div>
  <div class="controls">
    ${isPdf ? '' : `<button id="prev-btn">← Prev</button><select id="chapter-sel"></select><button id="next-btn">Next →</button>`}
    <a class="btn" href="/download/${encodeURIComponent(item.id)}${esc(item.ext)}">Download ${esc(item.bookFormat)}</a>
    <a class="btn" href="/">Back to Server</a>
  </div>
</header>
<main>
  ${isPdf
    ? `<iframe class="pdf-frame" src="/stream/${encodeURIComponent(item.id)}.pdf"></iframe>`
    : `<aside id="toc-list"></aside><article id="reader-scroll"><div class="reader-inner" id="chapter-body">Loading book…</div></article>`}
</main>
${isPdf ? '' : `<script>
const itemId = ${JSON.stringify(item.id)};
let chapters = [];
let currentIdx = Number(localStorage.getItem('robos_book_ch_' + itemId) || 0);
async function init() {
  const res = await fetch('/api/books/' + encodeURIComponent(itemId) + '/toc').then(r => r.json());
  if (!res.ok) {
    document.getElementById('chapter-body').textContent = res.error || 'Preview unavailable — use Download above.';
    return;
  }
  if (res.plainText) {
    document.getElementById('toc-list').innerHTML = '<div style="color:#8b949e;font-size:12px;">Plain text document</div>';
    document.getElementById('chapter-body').innerHTML = '<pre style="white-space:pre-wrap;font-family:inherit;">' + res.text.replace(/</g,'&lt;') + '</pre>';
    return;
  }
  chapters = res.chapters || [];
  const sel = document.getElementById('chapter-sel');
  const toc = document.getElementById('toc-list');
  sel.innerHTML = chapters.map(c => '<option value="' + c.index + '">' + (c.index + 1) + '. ' + c.title + '</option>').join('');
  toc.innerHTML = chapters.map(c => '<button class="toc-item" data-idx="' + c.index + '">' + (c.index + 1) + '. ' + c.title + '</button>').join('');
  toc.querySelectorAll('.toc-item').forEach(b => b.onclick = () => loadChapter(Number(b.dataset.idx)));
  sel.onchange = () => loadChapter(Number(sel.value));
  document.getElementById('prev-btn').onclick = () => { if (currentIdx > 0) loadChapter(currentIdx - 1); };
  document.getElementById('next-btn').onclick = () => { if (currentIdx + 1 < chapters.length) loadChapter(currentIdx + 1); };
  await loadChapter(Math.min(currentIdx, Math.max(0, chapters.length - 1)));
}
async function loadChapter(idx) {
  currentIdx = idx;
  localStorage.setItem('robos_book_ch_' + itemId, String(idx));
  document.getElementById('chapter-sel').value = String(idx);
  document.querySelectorAll('.toc-item').forEach(b => b.classList.toggle('active', Number(b.dataset.idx) === idx));
  const data = await fetch('/api/books/' + encodeURIComponent(itemId) + '/chapter/' + idx).then(r => r.json());
  document.getElementById('chapter-body').innerHTML = data.ok ? (data.html || '<p>(Empty section)</p>') : ('<p>' + (data.error || 'Failed') + '</p>');
  document.getElementById('reader-scroll').scrollTop = 0;
  fetch('/api/progress', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ itemId, chapterIndex: idx }) }).catch(() => {});
}
init();
</script>`}
</body>
</html>`;
}

function renderWebPortalHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>RobOS Media Server</title>
<style>
  :root {
    --bg:#0d1117; --panel:#161b22; --panel-2:#1c2330; --border:#29323e;
    --fg:#e6edf3; --muted:#8b949e; --accent:#00bcd4; --green:#22c55e; --amber:#f59e0b;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; display:grid; grid-template-columns:236px 1fr; height:100vh; overflow:hidden; }
  aside { background:var(--panel); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:16px 12px; gap:6px; overflow-y:auto; }
  .brand { display:flex; align-items:center; gap:10px; padding:6px 10px 14px; border-bottom:1px solid var(--border); margin-bottom:6px; }
  .brand-dot { width:12px; height:12px; border-radius:50%; background:var(--accent); box-shadow:0 0 12px var(--accent); }
  .brand strong { font-size:15px; letter-spacing:0.2px; }
  .brand small { display:block; font-size:11px; color:var(--muted); }
  .nav-btn { display:flex; align-items:center; justify-content:space-between; width:100%; background:transparent; border:1px solid transparent; color:var(--muted); padding:9px 12px; border-radius:8px; font-size:13.5px; cursor:pointer; text-align:left; }
  .nav-btn:hover { background:var(--panel-2); color:var(--fg); }
  .nav-btn.active { background:rgba(0,188,212,0.14); border-color:rgba(0,188,212,0.45); color:#67e8f9; font-weight:600; }
  .pill { font-size:11px; padding:2px 7px; border-radius:999px; background:#212835; color:var(--muted); }
  main { display:flex; flex-direction:column; min-width:0; height:100vh; overflow:hidden; }
  .topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 22px; background:var(--panel); border-bottom:1px solid var(--border); }
  .search-input { flex:1; max-width:440px; background:#0d1117; border:1px solid var(--border); border-radius:8px; color:var(--fg); padding:8px 12px; font-size:13.5px; }
  .btn { background:#1f2937; color:var(--fg); border:1px solid var(--border); border-radius:7px; padding:7px 13px; font-size:13px; cursor:pointer; }
  .btn:hover { border-color:var(--accent); }
  .btn-primary { background:rgba(0,188,212,0.18); border-color:rgba(0,188,212,0.6); color:#67e8f9; font-weight:600; }
  .content { flex:1; overflow-y:auto; padding:22px; padding-bottom:110px; }
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:12px; margin-bottom:22px; }
  .stat-card { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px 16px; }
  .stat-card .num { font-size:26px; font-weight:700; color:#f8fafc; }
  .stat-card .lbl { font-size:12px; color:var(--muted); margin-top:2px; }
  .media-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:16px; }
  .card { background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; cursor:pointer; transition:transform .12s,border-color .12s; display:flex; flex-direction:column; }
  .card:hover { transform:translateY(-2px); border-color:var(--accent); }
  .poster { aspect-ratio:2/3; width:100%; background:#111827; object-fit:cover; display:block; }
  .poster.square { aspect-ratio:1/1; }
  .card-body { padding:10px 12px; }
  .card-title { font-size:13.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .card-sub { font-size:12px; color:var(--muted); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .svc-row { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:14px 16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; }
  .code-box { background:#090d12; border:1px solid var(--border); border-radius:8px; padding:12px 14px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; color:#a5f3fc; overflow-x:auto; }
  .player-modal { position:fixed; inset:0; background:rgba(5,8,13,0.92); display:none; flex-direction:column; z-index:50; }
  .player-modal.open { display:flex; }
  .player-head { display:flex; justify-content:space-between; align-items:center; padding:12px 20px; background:var(--panel); border-bottom:1px solid var(--border); }
  .player-stage { flex:1; display:flex; align-items:center; justify-content:center; min-height:0; padding:12px; }
  .player-stage video { max-width:100%; max-height:100%; border-radius:8px; background:#000; }
  .audio-dock { position:fixed; left:236px; right:0; bottom:0; background:var(--panel); border-top:1px solid var(--border); padding:10px 20px; display:none; align-items:center; gap:16px; z-index:30; }
  .audio-dock.open { display:flex; }
  .form-box { background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:16px; margin-bottom:18px; }
  .form-row { display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }
  .form-row input, .form-row select { background:#0d1117; border:1px solid var(--border); color:var(--fg); border-radius:6px; padding:8px 10px; font-size:13px; }
  @media (max-width:760px) { body { grid-template-columns:1fr; } aside { display:none; } .audio-dock { left:0; } }
</style>
</head>
<body>
<aside>
  <div class="brand">
    <span class="brand-dot"></span>
    <div>
      <strong id="srv-name">RobOS Media Server</strong>
      <small id="srv-rev">All Media + MCP Active</small>
    </div>
  </div>
  <button class="nav-btn active" data-tab="overview"><span>Overview &amp; Services</span><span class="pill" id="cnt-total">0</span></button>
  <button class="nav-btn" data-tab="movies"><span>Movies</span><span class="pill" id="cnt-movies">0</span></button>
  <button class="nav-btn" data-tab="shows"><span>TV Shows</span><span class="pill" id="cnt-shows">0</span></button>
  <button class="nav-btn" data-tab="music"><span>Music &amp; Audio</span><span class="pill" id="cnt-music">0</span></button>
  <button class="nav-btn" data-tab="books"><span>Books &amp; eBooks</span><span class="pill" id="cnt-books">0</span></button>
  <button class="nav-btn" data-tab="education"><span>Courses &amp; Education</span><span class="pill" id="cnt-edu">0</span></button>
  <button class="nav-btn" data-tab="mcp"><span>MCP &amp; RobOS Sync</span><span class="pill" style="color:#67e8f9;">MCP</span></button>
</aside>
<main>
  <div class="topbar">
    <input class="search-input" id="search-box" placeholder="Search movies, shows, episodes, music, books, courses…"/>
    <div style="display:flex;gap:8px;align-items:center;">
      <span id="scan-badge" style="font-size:12px;color:var(--muted);"></span>
      <button class="btn btn-primary" id="btn-scan-all">Scan All Folders</button>
    </div>
  </div>
  <div class="content" id="main-content"></div>
</main>

<div class="player-modal" id="video-modal">
  <div class="player-head">
    <div>
      <strong id="vm-title">Playing</strong>
      <span id="vm-sub" style="margin-left:10px;font-size:12px;color:var(--muted);"></span>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn" id="vm-force-transcode" title="Force FFmpeg H.264 + AAC stream">Switch Stream Mode</button>
      <button class="btn" id="vm-close">Close ✕</button>
    </div>
  </div>
  <div class="player-stage">
    <video id="vm-video" controls playsinline crossorigin="anonymous">
      <track id="vm-track" kind="subtitles" srclang="en" label="English" default />
    </video>
  </div>
</div>

<div class="audio-dock" id="audio-dock">
  <div style="min-width:180px;max-width:300px;">
    <div id="ad-title" style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
    <div id="ad-sub" style="font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>
  </div>
  <audio id="ad-audio" controls style="flex:1;height:36px;"></audio>
  <button class="btn" id="ad-close">✕</button>
</div>

<script>
let state = { tab: 'overview', summary: null, query: '', activeItem: null, usingTranscode: false };
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

async function api(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

async function refreshSummary() {
  const s = await api('/api/info');
  state.summary = s;
  document.getElementById('srv-name').textContent = s.serverName || 'RobOS Media Server';
  document.getElementById('srv-rev').textContent = 'Rev ' + s.catalogRevision + ' · MCP Active';
  document.getElementById('cnt-total').textContent = s.counts.total.toLocaleString();
  document.getElementById('cnt-movies').textContent = s.counts.movies.toLocaleString();
  document.getElementById('cnt-shows').textContent = s.counts.shows.toLocaleString();
  document.getElementById('cnt-music').textContent = s.counts.musicTracks.toLocaleString();
  document.getElementById('cnt-books').textContent = s.counts.books.toLocaleString();
  document.getElementById('cnt-edu').textContent = s.counts.education.toLocaleString();
  document.getElementById('scan-badge').textContent = s.scanState?.running
    ? ('Scanning: ' + s.scanState.scannedFiles + ' files (' + (s.scanState.currentFile || '') + ')')
    : '';
}

async function render() {
  await refreshSummary();
  const el = document.getElementById('main-content');
  const q = state.query.trim();
  if (q) {
    const res = await api('/api/catalog?q=' + encodeURIComponent(q) + '&limit=120');
    el.innerHTML = '<h2>Search results for “' + esc(q) + '” (' + res.total + ')</h2>' + renderItemsGrid(res.items);
    bindItemClicks(el, res.items);
    return;
  }

  if (state.tab === 'overview') return renderOverview(el);
  if (state.tab === 'movies') {
    const res = await api('/api/catalog?type=movie&limit=240');
    el.innerHTML = '<h2>Movies (' + res.total + ')</h2>' + renderItemsGrid(res.items);
    bindItemClicks(el, res.items);
  } else if (state.tab === 'shows') {
    const res = await api('/api/shows');
    el.innerHTML = '<h2>TV Shows (' + res.shows.length + ')</h2><div class="media-grid">' +
      res.shows.map(s => '<div class="card" data-show="' + esc(s.slug) + '">' +
        '<img class="poster" loading="lazy" src="' + esc(s.artUrl) + '" alt=""/>' +
        '<div class="card-body"><div class="card-title">' + esc(s.showName) + '</div>' +
        '<div class="card-sub">' + s.seasonCount + ' Season(s) · ' + s.episodeCount + ' Episodes</div></div></div>').join('') + '</div>';
    el.querySelectorAll('[data-show]').forEach(c => c.onclick = () => renderShowDetail(el, c.dataset.show));
  } else if (state.tab === 'music') {
    const res = await api('/api/albums');
    el.innerHTML = '<h2>Music Albums (' + res.albums.length + ')</h2><div class="media-grid">' +
      res.albums.slice(0, 240).map((a, idx) => '<div class="card" data-album-idx="' + idx + '">' +
        '<img class="poster square" loading="lazy" src="' + esc(a.artUrl) + '" alt=""/>' +
        '<div class="card-body"><div class="card-title">' + esc(a.album) + '</div>' +
        '<div class="card-sub">' + esc(a.artist) + ' · ' + a.trackCount + ' tracks</div></div></div>').join('') + '</div>';
    el.querySelectorAll('[data-album-idx]').forEach(c => c.onclick = () => renderAlbumDetail(el, res.albums[Number(c.dataset.albumIdx)]));
  } else if (state.tab === 'books') {
    const res = await api('/api/catalog?type=book&limit=240');
    el.innerHTML = '<h2>Books &amp; eBooks (' + res.total + ')</h2>' + renderItemsGrid(res.items);
    bindItemClicks(el, res.items);
  } else if (state.tab === 'education') {
    const res = await api('/api/catalog?type=education&limit=240');
    el.innerHTML = '<h2>Courses &amp; Education (' + res.total + ')</h2>' + renderItemsGrid(res.items);
    bindItemClicks(el, res.items);
  } else if (state.tab === 'mcp') {
    return renderMcpTab(el);
  }
}

function renderOverview(el) {
  const s = state.summary;
  const c = s.counts;
  const origin = window.location.origin;
  el.innerHTML = \`
    <div class="stats-grid">
      <div class="stat-card"><div class="num">\${c.movies.toLocaleString()}</div><div class="lbl">Movies</div></div>
      <div class="stat-card"><div class="num">\${c.shows.toLocaleString()}</div><div class="lbl">TV Series (\${c.episodes.toLocaleString()} Eps)</div></div>
      <div class="stat-card"><div class="num">\${c.musicTracks.toLocaleString()}</div><div class="lbl">Songs (\${c.albums.toLocaleString()} Albums)</div></div>
      <div class="stat-card"><div class="num">\${c.books.toLocaleString()}</div><div class="lbl">Books &amp; eBooks</div></div>
      <div class="stat-card"><div class="num">\${c.education.toLocaleString()}</div><div class="lbl">Course Videos</div></div>
    </div>
    <div class="form-box">
      <strong>Connect in RobOS Preferences, Movie Player &amp; Audio Player</strong>
      <p style="margin:6px 0 10px;color:var(--muted);font-size:13px;">Add this server URL once in <strong>RobOS Preferences → RobOS Media Services</strong>. RobOS Preferences automatically keeps Movie Player, Audio Player, and MCP synced across all your RobOS machines.</p>
      <div class="code-box">Server URL: \${esc(origin)}   |   MCP Endpoint: \${esc(origin)}/mcp</div>
    </div>
    <h3>Media Services &amp; Library Folders</h3>
    <div class="form-box">
      <strong style="font-size:13.5px;">+ Add or Update Media Service</strong>
      <div class="form-row">
        <select id="add-svc-kind">
          <option value="movies">Movies</option>
          <option value="shows">TV Shows</option>
          <option value="music">Music &amp; Audio</option>
          <option value="books">Books &amp; eBooks</option>
          <option value="education">Courses &amp; Education</option>
        </select>
        <input id="add-svc-name" placeholder="Service Name (e.g. Kids Shows)" style="min-width:180px;"/>
        <input id="add-svc-folder" placeholder="/downloads/movies (comma-separated paths)" style="flex:1;min-width:260px;"/>
        <button class="btn btn-primary" id="btn-add-svc">Save &amp; Scan Service</button>
      </div>
    </div>
    \${(s.services || []).map(svc => \`
      <div class="svc-row">
        <div>
          <strong>\${esc(svc.name)}</strong>
          <span class="pill" style="margin-left:6px;">\${esc(svc.kind)}</span>
          \${svc.mcpEnabled !== false ? '<span class="pill" style="color:#67e8f9;margin-left:4px;">MCP</span>' : ''}
          <div style="font-size:12px;color:var(--muted);margin-top:4px;">Folders: <code>\${esc((svc.folders || []).join(', '))}</code></div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">Indexed items: <strong>\${svc.itemCount.toLocaleString()}</strong> · Last scan: \${svc.lastScannedAt ? new Date(svc.lastScannedAt).toLocaleString() : 'Pending'}</div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn" data-scan-svc="\${esc(svc.id)}">Scan</button>
          <button class="btn" data-del-svc="\${esc(svc.id)}">Remove</button>
        </div>
      </div>
    \`).join('')}
  \`;

  document.getElementById('btn-add-svc').onclick = async () => {
    const kind = document.getElementById('add-svc-kind').value;
    const name = document.getElementById('add-svc-name').value.trim();
    const folders = document.getElementById('add-svc-folder').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!folders.length) return alert('Enter at least one directory path.');
    await api('/api/services', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, name: name || undefined, folders, appendFolders: true }) });
    render();
  };
  el.querySelectorAll('[data-scan-svc]').forEach(b => b.onclick = async () => {
    await api('/api/services/' + encodeURIComponent(b.dataset.scanSvc) + '/scan', { method: 'POST' });
    render();
  });
  el.querySelectorAll('[data-del-svc]').forEach(b => b.onclick = async () => {
    if (!confirm('Remove service ' + b.dataset.delSvc + '? (Files on disk are never deleted)')) return;
    await api('/api/services/' + encodeURIComponent(b.dataset.delSvc), { method: 'DELETE' });
    render();
  });
}

async function renderShowDetail(el, slug) {
  const show = await api('/api/shows/' + encodeURIComponent(slug));
  if (!show.ok) return;
  let allEps = [];
  el.innerHTML = '<button class="btn" id="back-shows">← All TV Shows</button><h2 style="margin-top:14px;">' + esc(show.showName) + '</h2>' +
    show.seasons.map(sn => {
      const rows = sn.episodes.map(ep => {
        const idx = allEps.push(ep) - 1;
        return '<div class="svc-row" style="padding:10px 14px;cursor:pointer;" data-item-idx="' + idx + '">' +
          '<div><strong>' + esc(ep.episodeCode) + ' — ' + esc(ep.episodeTitle || ep.title) + '</strong>' +
          '<div style="font-size:12px;color:var(--muted);">' + esc(ep.qualityBadge || '') + '</div></div>' +
          '<button class="btn btn-primary">▶ Play</button></div>';
      }).join('');
      return '<h3>Season ' + sn.seasonNumber + ' (' + sn.episodeCount + ' episodes)</h3>' + rows;
    }).join('');
  document.getElementById('back-shows').onclick = () => render();
  bindItemClicks(el, allEps);
}

function renderAlbumDetail(el, album) {
  el.innerHTML = '<button class="btn" id="back-albums">← All Albums</button><h2 style="margin-top:14px;">' + esc(album.album) + ' — ' + esc(album.artist) + '</h2>' +
    album.tracks.map((t, i) => '<div class="svc-row" style="padding:10px 14px;cursor:pointer;" data-item-idx="' + i + '">' +
      '<div><strong>' + (t.trackNumber ? t.trackNumber + '. ' : '') + esc(t.title) + '</strong>' +
      '<div style="font-size:12px;color:var(--muted);">' + esc(t.codec || '') + '</div></div>' +
      '<button class="btn btn-primary">▶ Play</button></div>').join('');
  document.getElementById('back-albums').onclick = () => render();
  bindItemClicks(el, album.tracks);
}

async function renderMcpTab(el) {
  const origin = window.location.origin;
  const listRes = await api('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const tools = listRes?.result?.tools || [];
  el.innerHTML = \`
    <h2>Model Context Protocol (MCP) &amp; RobOS Integration</h2>
    <div class="form-box">
      <p style="margin-top:0;color:var(--muted);font-size:13.5px;">Every media service (Movies, TV Shows, Music, Books, Education) is exposed over MCP HTTP JSON-RPC 2.0 and SSE, plus stdio.</p>
      <div class="code-box">HTTP MCP Endpoint: \${esc(origin)}/mcp
Claude / Gemini / Codex CLI: claude mcp add --transport http robos-media-server \${esc(origin)}/mcp</div>
    </div>
    <h3>Available MCP Tools (\${tools.length})</h3>
    \${tools.map(t => \`
      <div class="svc-row">
        <div>
          <code>\${esc(t.name)}</code>
          <div style="font-size:12.5px;color:var(--muted);margin-top:4px;">\${esc(t.description)}</div>
        </div>
      </div>
    \`).join('')}
  \`;
}

function renderItemsGrid(items) {
  if (!items.length) return '<p style="color:var(--muted);">No items indexed yet.</p>';
  return '<div class="media-grid">' + items.map((it, idx) => \`
    <div class="card" data-item-idx="\${idx}">
      <img class="poster \${it.mediaType === 'music' ? 'square' : ''}" loading="lazy" src="\${esc(it.artUrl)}" alt=""/>
      <div class="card-body">
        <div class="card-title">\${esc(it.title)}</div>
        <div class="card-sub">\${esc(it.author || it.artist || it.qualityBadge || it.bookFormat || '')}\${it.year ? ' · ' + it.year : ''}</div>
      </div>
    </div>
  \`).join('') + '</div>';
}

function bindItemClicks(container, items) {
  container.querySelectorAll('[data-item-idx]').forEach(node => {
    node.onclick = () => openMediaItem(items[Number(node.dataset.itemIdx)]);
  });
}

function openMediaItem(item) {
  if (!item) return;
  if (item.mediaType === 'book') {
    window.open(item.readerUrl || item.downloadUrl, '_blank');
    return;
  }
  if (item.mediaType === 'music') {
    document.getElementById('ad-title').textContent = item.title;
    document.getElementById('ad-sub').textContent = (item.artist || '') + (item.album ? ' — ' + item.album : '');
    const audio = document.getElementById('ad-audio');
    audio.src = item.streamUrl;
    audio.play().catch(() => {});
    document.getElementById('audio-dock').classList.add('open');
    return;
  }
  state.activeItem = item;
  state.usingTranscode = Boolean(item.needsTranscode);
  document.getElementById('vm-title').textContent = item.title;
  document.getElementById('vm-sub').textContent = (item.qualityBadge || '') + (state.usingTranscode ? ' · FFmpeg Live MP4' : ' · Direct Play');
  const video = document.getElementById('vm-video');
  const track = document.getElementById('vm-track');
  track.src = item.subtitlesUrl || '';
  video.src = state.usingTranscode && item.transcodeUrl ? item.transcodeUrl : item.directStreamUrl;
  video.onerror = () => {
    if (!state.usingTranscode && item.transcodeUrl) {
      state.usingTranscode = true;
      document.getElementById('vm-sub').textContent = (item.qualityBadge || '') + ' · Auto-Switched to FFmpeg Live MP4';
      video.src = item.transcodeUrl;
      video.play().catch(() => {});
    }
  };
  document.getElementById('video-modal').classList.add('open');
  video.play().catch(() => {});
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    state.query = '';
    document.getElementById('search-box').value = '';
    render();
  };
});

let searchTimer = null;
document.getElementById('search-box').oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.query = e.target.value; render(); }, 250);
};

document.getElementById('btn-scan-all').onclick = async () => {
  api('/api/scan', { method: 'POST' });
  setTimeout(refreshSummary, 400);
};

document.getElementById('vm-close').onclick = () => {
  const v = document.getElementById('vm-video');
  v.pause(); v.removeAttribute('src'); v.load();
  document.getElementById('video-modal').classList.remove('open');
};

document.getElementById('vm-force-transcode').onclick = () => {
  const item = state.activeItem;
  if (!item || !item.transcodeUrl) return;
  state.usingTranscode = !state.usingTranscode;
  const v = document.getElementById('vm-video');
  const t = Math.floor(v.currentTime || 0);
  v.src = state.usingTranscode ? (item.transcodeUrl + (t > 2 ? '?start=' + t : '')) : item.directStreamUrl;
  document.getElementById('vm-sub').textContent = (item.qualityBadge || '') + (state.usingTranscode ? ' · FFmpeg Live MP4' : ' · Direct Play');
  v.play().catch(() => {});
};

document.getElementById('ad-close').onclick = () => {
  const a = document.getElementById('ad-audio');
  a.pause(); a.removeAttribute('src');
  document.getElementById('audio-dock').classList.remove('open');
};

setInterval(() => { if (state.summary?.scanState?.running) refreshSummary(); }, 2000);
render();
</script>
</body>
</html>`;
}

module.exports = {
  renderWebPortalHtml,
  renderBookReaderHtml,
};
