/* KGraph static viewer. Loads data/graph.json, builds indexes, routes
 * #/, #/type/<type>, #/node/<id>, #/package/<id> and #/search/<query>, and
 * hands every node to the renderer the registry resolves for it. */
(function () {
  'use strict';

  const queued = [];
  let registry = null;
  let G = null; // graph indexes
  const state = { scriptsLoaded: false, graphLoaded: false };

  const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const enc = s => encodeURIComponent(s);
  const nodeHref = id => `#/node/${enc(id)}`;
  const typeHref = t => `#/type/${enc(t)}`;

  const SKIP_PROPS = new Set(['@id', '@type', '@context', 'dcterms:title', 'dcterms:description', 'schema:image', 'robos:package', 'robos:namespace', 'site:renderer']);

  function indexGraph(data) {
    const byId = new Map();
    const byType = new Map();
    const incoming = new Map();
    for (const n of data.nodes) {
      byId.set(n['@id'], n);
      for (const t of [].concat(n['@type'] || [])) {
        if (!byType.has(t)) byType.set(t, []);
        byType.get(t).push(n);
      }
    }
    const walk = (from, pred, v) => {
      if (Array.isArray(v)) return v.forEach(x => walk(from, pred, x));
      if (v && typeof v === 'object') {
        if (v['@id'] && byId.has(v['@id']) && Object.keys(v).length === 1) {
          if (!incoming.has(v['@id'])) incoming.set(v['@id'], []);
          incoming.get(v['@id']).push({ from, pred });
        } else for (const [k, x] of Object.entries(v)) if (k !== '@id') walk(from, pred, x);
      }
    };
    for (const n of data.nodes) for (const [k, v] of Object.entries(n)) if (!SKIP_PROPS.has(k)) walk(n, k, v);
    const ontology = data.ontology || {};
    const children = new Map();
    for (const [t, info] of Object.entries(ontology)) for (const p of [].concat(info.parents || [])) {
      if (!children.has(p)) children.set(p, []);
      children.get(p).push(t);
    }
    return { data, nodes: data.nodes, byId, byType, incoming, ontology, children, meta: data.meta || {}, packages: data.packages || [] };
  }

  function typeLabel(t) {
    const info = G.ontology[t];
    if (info && info.label) return info.label;
    return String(t).replace(/^[a-z]+:/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  // A type and all its subtypes.
  function withSubtypes(t) {
    const out = [t];
    for (let i = 0; i < out.length; i++) for (const c of G.children.get(out[i]) || []) if (!out.includes(c)) out.push(c);
    return out;
  }

  function nodesOfType(t) {
    const seen = new Set();
    const out = [];
    for (const s of withSubtypes(t)) for (const n of G.byType.get(s) || []) if (!seen.has(n['@id'])) { seen.add(n['@id']); out.push(n); }
    return out.sort((a, b) => sortKey(a) - sortKey(b) || title(a).localeCompare(title(b)));
  }

  function sortKey(n) {
    const s = n['jrpg:sequence'] ?? n['jrpg:formationNumber'] ?? n['jrpg:track'];
    return typeof s === 'number' ? s : Number.MAX_SAFE_INTEGER;
  }

  function title(n) { return n ? String(n['dcterms:title'] || n['schema:name'] || n['@id']) : ''; }

  function images(n) { return [].concat(n && n['schema:image'] || []).filter(i => i && i['schema:contentUrl']); }

  function img(image, opts = {}) {
    if (!image) return '';
    const src = image['schema:contentUrl'];
    const alt = opts.alt || image['schema:caption'] || '';
    return `<img src="${h(src)}" alt="${h(alt)}" loading="lazy" referrerpolicy="no-referrer" class="${h(opts.cls || 'pixel')}"${opts.style ? ` style="${h(opts.style)}"` : ''}>`;
  }

  function figure(image) {
    if (!image) return '';
    const credit = image['schema:creditText'] ? `<div class="credit">${image['schema:url'] ? `<a href="${h(image['schema:url'])}" rel="noopener">${h(image['schema:creditText'])}</a>` : h(image['schema:creditText'])}</div>` : '';
    return `<figure class="figure">${img(image)}<figcaption>${h(image['schema:caption'] || '')}${credit}</figcaption></figure>`;
  }

  function link(idOrNode, text) {
    const n = typeof idOrNode === 'string' ? G.byId.get(idOrNode) : idOrNode;
    if (!n) return h(text || idOrNode);
    return `<a href="${nodeHref(n['@id'])}">${h(text || title(n))}</a>`;
  }

  function value(v) {
    if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
    if (Array.isArray(v)) return v.length ? v.map(value).join(', ') : '<span class="muted">—</span>';
    if (typeof v === 'object') {
      if (v['@id'] && Object.keys(v).length === 1) return link(v['@id'], G.byId.has(v['@id']) ? undefined : v['@id']);
      if (v['schema:url']) return `<a href="${h(v['schema:url'])}" rel="noopener">${h(v['dcterms:title'] || v['schema:name'] || v['schema:url'])}</a>`;
      if (v['schema:contentUrl']) return `<a href="${h(v['schema:contentUrl'])}" rel="noopener">${h(v['schema:name'] || v['schema:caption'] || 'file')}</a>`;
      return `<span class="mono">${Object.entries(v).map(([k, x]) => `${h(prop(k))}: ${typeof x === 'object' ? h(JSON.stringify(x)) : h(x)}`).join(' · ')}</span>`;
    }
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return `<a href="${h(v)}" rel="noopener">${h(v)}</a>`;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return h(v);
  }

  function prop(k) {
    return String(k).replace(/^[a-z]+:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  }

  function propsTable(n, opts = {}) {
    const omit = new Set([...(opts.omit || []), ...SKIP_PROPS]);
    const rows = Object.entries(n).filter(([k]) => !omit.has(k));
    if (!rows.length) return '';
    return `<table class="props">${rows.map(([k, v]) => `<tr><th>${h(prop(k))}</th><td>${value(v)}</td></tr>`).join('')}</table>`;
  }

  function stats(obj) {
    const entries = Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
    if (!entries.length) return '';
    return `<div class="stats">${entries.map(([k, v]) => `<div class="stat"><div class="k">${h(k)}</div><div class="v">${h(v)}</div></div>`).join('')}</div>`;
  }

  function table(columns, rows, opts = {}) {
    const numeric = columns.map((_, i) => rows.length && rows.every(r => r[i] === '' || r[i] === undefined || /^-?[\d,.]+$/.test(String(r[i]).replace(/<[^>]+>/g, ''))));
    return `<div class="table-wrap"><table class="data"><thead><tr>${columns.map((c, i) => `<th class="${numeric[i] ? 'num' : ''}">${h(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${numeric[i] ? 'num' : ''}">${opts.raw ? (c ?? '') : h(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function incomingList(n, opts = {}) {
    const list = (G.incoming.get(n['@id']) || []).filter(x => !opts.exclude || !opts.exclude.includes(x.pred));
    if (!list.length) return '';
    const groups = new Map();
    for (const { from, pred } of list) {
      const key = `${prop(pred)}`;
      if (!groups.has(key)) groups.set(key, new Map());
      groups.get(key).set(from['@id'], from);
    }
    return `<h2>${h(opts.heading || 'Referenced by')}</h2>` + [...groups].map(([pred, m]) => `<div class="panel"><div class="muted">${h(pred)}</div>${[...m.values()].slice(0, 200).map(x => link(x)).join(' · ')}</div>`).join('');
  }

  function typeBadges(n) {
    return [].concat(n['@type'] || []).map(t => `<a class="badge accent" href="${typeHref(t)}">${h(typeLabel(t))}</a>`).join('');
  }

  function renderWith(r, n) {
    try { return r.render(n, ctxFor(r, n)); }
    catch (error) { return `<div class="panel">Renderer <code>${h(r.id)}</code> failed: ${h(error.message)}</div>${G.generic ? G.generic.render(n, ctxFor(G.generic, n)) : ''}`; }
  }

  function card(n) {
    const { renderer } = registry.resolve(n);
    const r = renderer && renderer.card ? renderer : registry.renderers.get('generic');
    try { return r.card(n, ctxFor(r, n)); } catch { return `<a class="card" href="${nodeHref(n['@id'])}">${h(title(n))}</a>`; }
  }

  function ctxFor(renderer, node) {
    return {
      graph: G, h, link, value, prop, propsTable, stats, table, img, figure, images, title, typeLabel, typeBadges, incomingList, card,
      nodeHref, typeHref, nodesOfType, get: id => G.byId.get(id), refs: v => [].concat(v || []).map(x => x && x['@id'] && G.byId.get(x['@id'])).filter(Boolean),
      parent: () => { const p = node ? registry.resolveParent(node, renderer.id) : null; return p ? renderWith(p, node) : ''; },
      generic: () => (node ? renderWith(registry.renderers.get('generic'), node) : ''),
    };
  }

  // ── Pages ────────────────────────────────────────────────────────────────
  function nodePage(id) {
    const n = G.byId.get(id);
    if (!n) return `<h1>Not found</h1><p class="muted">${h(id)} is not in this graph.</p>`;
    const res = registry.resolve(n);
    const why = res.via === 'type' ? `its type ${typeLabel(res.type)}` : res.via === 'parent' ? `parent type ${typeLabel(res.type)}` : res.via === 'node' ? 'this node' : 'no type-specific renderer';
    document.title = `${title(n)} · ${G.meta.title || 'KGraph'}`;
    return `${renderWith(res.renderer, n)}<div class="renderer-note" data-renderer="${h(res.renderer.id)}" data-via="${h(res.via)}">Rendered by <code>${h(res.renderer.id)}</code> for ${h(why)} · <span class="mono">${h(n['@id'])}</span></div>`;
  }

  function typePage(t) {
    const nodes = nodesOfType(t);
    const res = registry.resolveType([t]);
    document.title = `${typeLabel(t)} · ${G.meta.title || 'KGraph'}`;
    const info = G.ontology[t] || {};
    const head = `<h1>${h(typeLabel(t))}</h1><p class="subtitle">${h(info.comment || '')} <span class="badge">${nodes.length}</span>${(info.parents || []).map(p => ` <a class="badge" href="${typeHref(p)}">↑ ${h(typeLabel(p))}</a>`).join('')}</p>`;
    let body;
    if (res.renderer && res.renderer.collection) {
      try { body = res.renderer.collection(nodes, ctxFor(res.renderer, null), t); } catch (error) { body = `<p>Collection view failed: ${h(error.message)}</p>`; }
    } else body = `<div class="grid">${nodes.map(card).join('')}</div>`;
    // A collection view may bring its own heading.
    return `${/^\s*<h1/.test(body) ? '' : head}${body}<div class="renderer-note" data-renderer="${h(res.renderer ? res.renderer.id : '')}" data-via="${h(res.via)}">Listed by <code>${h(res.renderer ? res.renderer.id : 'generic')}</code></div>`;
  }

  function packagePage(id) {
    const pkg = G.packages.find(p => p.id === id);
    const nodes = G.nodes.filter(n => n['robos:package'] === id);
    document.title = `${pkg ? pkg.title : id} · ${G.meta.title || 'KGraph'}`;
    return `<h1>${h(pkg ? pkg.title : id)}</h1><p class="subtitle">${h(pkg ? pkg.description : '')} <span class="badge">${nodes.length}</span></p><div class="grid">${nodes.map(card).join('')}</div>`;
  }

  function searchPage(q) {
    const needle = q.toLowerCase();
    const hits = G.nodes.filter(n => [title(n), n['dcterms:description'], n['jrpg:nesName'], n['@id']].some(v => v && String(v).toLowerCase().includes(needle))).slice(0, 300);
    document.title = `Search: ${q}`;
    return `<h1>Search</h1><p class="subtitle">${hits.length} results for “${h(q)}”</p><div class="grid">${hits.map(card).join('')}</div>`;
  }

  function homePage() {
    document.title = G.meta.title || 'KGraph';
    const home = G.meta.home && G.byId.get(G.meta.home);
    if (home) return nodePage(home['@id']);
    const types = [...G.byType.keys()].sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
    return `<h1>${h(G.meta.title || 'Knowledge graph')}</h1><p class="lead">${h(G.meta.description || '')}</p><h2>Types</h2><div class="coverage">${types.map(t => `<a href="${typeHref(t)}"><span>${h(typeLabel(t))}</span><span class="n">${G.byType.get(t).length}</span></a>`).join('')}</div>`;
  }

  function sidebar() {
    const present = new Set(G.byType.keys());
    const count = t => nodesOfType(t).length;
    // Show ontology roots that have nodes, then their children, depth-first.
    const known = Object.keys(G.ontology);
    const roots = known.filter(t => !(G.ontology[t].parents || []).some(p => known.includes(p)));
    const lines = [];
    const visit = (t, depth) => {
      const c = count(t);
      if (!c) return;
      lines.push(`<a href="${typeHref(t)}" data-type="${h(t)}" class="${depth > 1 ? 'sub' : ''}" style="padding-left:${8 + Math.max(0, depth - 1) * 12}px"><span>${h(typeLabel(t))}</span><span class="count">${c}</span></a>`);
      for (const ch of (G.children.get(t) || []).sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))) visit(ch, depth + 1);
    };
    for (const r of roots) {
      if (G.children.get(r) && (G.ontology[r].parents || []).length === 0 && !present.has(r)) for (const ch of G.children.get(r)) visit(ch, 1);
      else visit(r, 1);
    }
    const untyped = [...present].filter(t => !known.includes(t) && !/^schema:/.test(t)).sort();
    const pk = G.packages.map(p => `<a href="#/package/${enc(p.id)}"><span>${h(p.title || p.id)}</span><span class="count">${p.nodeCount ?? ''}</span></a>`).join('');
    return `<h2>Browse</h2>${lines.join('')}${untyped.length ? `<h2>Other types</h2>${untyped.map(t => `<a href="${typeHref(t)}" data-type="${h(t)}"><span>${h(typeLabel(t))}</span><span class="count">${G.byType.get(t).length}</span></a>`).join('')}` : ''}${pk ? `<h2>Packages</h2>${pk}` : ''}`;
  }

  function route() {
    const content = document.getElementById('content');
    const hash = location.hash.replace(/^#\/?/, '');
    const [kind, ...rest] = hash.split('/');
    const arg = decodeURIComponent(rest.join('/'));
    let html;
    if (kind === 'node') html = nodePage(arg);
    else if (kind === 'type') html = typePage(arg);
    else if (kind === 'package') html = packagePage(arg);
    else if (kind === 'search') html = searchPage(arg);
    else html = homePage();
    content.innerHTML = html;
    content.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    for (const a of document.querySelectorAll('.sidebar a')) a.classList.toggle('active', a.getAttribute('href') === `#/${hash}`);
    document.getElementById('sidebar').classList.remove('open');
    document.body.dataset.route = kind || 'home';
  }

  function boot() {
    if (!state.scriptsLoaded || !state.graphLoaded) return;
    registry = window.KGraphRegistry.createRegistry(G.ontology);
    for (const r of queued) { try { registry.registerRenderer(r); } catch (error) { console.error(error); } }
    G.generic = registry.renderers.get('generic');
    document.getElementById('sidebar').innerHTML = sidebar();
    document.getElementById('site-footer').innerHTML = G.meta.footer || `${h(G.meta.title || '')} · built with RobOS KGraph Explorer`;
    window.addEventListener('hashchange', route);
    route();
    document.documentElement.dataset.ready = 'true';
  }

  window.KGraphSite = {
    registerRenderer(r) { if (registry) registry.registerRenderer(r); else queued.push(r); },
    // Load renderer scripts in order, then start.
    load(files) {
      let i = 0;
      const next = () => {
        if (i >= files.length) { state.scriptsLoaded = true; return boot(); }
        const s = document.createElement('script');
        s.src = files[i++];
        s.onload = next;
        s.onerror = () => { console.error(`Renderer failed to load: ${s.src}`); next(); };
        document.body.appendChild(s);
      };
      next();
    },
    helpers: { h },
  };

  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    if (q) location.hash = `#/search/${enc(q)}`;
  });
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('open');
    document.getElementById('menu-toggle').setAttribute('aria-expanded', sb.classList.contains('open'));
  });

  fetch('data/graph.json').then(r => r.json()).then(data => {
    G = indexGraph(data);
    document.getElementById('site-title').textContent = G.meta.title || 'KGraph';
    state.graphLoaded = true;
    boot();
  }).catch(error => {
    document.getElementById('content').innerHTML = `<h1>Could not load the graph</h1><p>${h(error.message)}</p><p class="muted">Serve this folder over HTTP (GitHub Pages, or <code>npx serve</code>); browsers block data files opened from disk.</p>`;
  });
})();
