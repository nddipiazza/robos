'use strict';
// GitHub Pages KGraph viewer: build a static site from a kgraph folder,
// show which renderer each type gets, and let the robos agent write
// renderers for types that would only get the generic one.
(() => {
  const el = id => document.getElementById(id);
  const api = window.sdlcGraph;
  let siteDir = null;

  const status = (text, kind = '') => {
    const s = el('pages-status');
    s.textContent = text;
    s.className = `pages-status ${kind}`;
  };
  const why = t => (t.via === 'type' ? 'its own type' : t.via === 'parent' ? `parent type ${t.viaType}` : t.via === 'node' ? 'node-specific' : 'no renderer: generic');

  function showResolution(table) {
    const body = el('pages-resolution').querySelector('tbody');
    body.replaceChildren(...table.types.map(t => {
      const tr = document.createElement('tr');
      tr.className = `via-${t.via}`;
      for (const v of [t.type, String(t.count), t.renderer || '', why(t)]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.appendChild(td);
      }
      return tr;
    }));
    el('pages-resolution').hidden = false;
  }

  async function open() {
    el('pages-site-modal').style.display = 'flex';
    if (!el('pages-graph-dir').value) {
      const d = await api.pagesSiteDefaults();
      if (d && d.graphDir) el('pages-graph-dir').value = d.graphDir;
    }
  }
  const close = () => { el('pages-site-modal').style.display = 'none'; };
  const graphDir = () => el('pages-graph-dir').value.trim();

  async function build() {
    if (!graphDir()) return status('Choose a kgraph folder first.', 'error');
    status('Building…', 'busy');
    try {
      const res = await api.buildPagesSite({ graphDir: graphDir(), outDir: el('pages-out-dir').value.trim(), title: el('pages-title').value.trim(), workflow: el('pages-workflow').checked });
      siteDir = res.outDir;
      showResolution(res.resolution);
      el('btn-pages-preview').disabled = false;
      const generic = res.resolution.types.filter(t => t.via === 'generic').length;
      status(`Built ${res.nodeCount} nodes into ${res.outDir} with ${res.renderers.length} renderer files; ${generic} types use the generic renderer.${res.workflow ? ' Pages workflow written.' : ''}`, 'ok');
    } catch (error) { status(error.message, 'error'); }
  }

  async function agent() {
    if (!graphDir()) return status('Choose a kgraph folder first.', 'error');
    status('Asking the robos agent to write renderers for types on the generic renderer…', 'busy');
    try {
      const results = await api.pagesAgentRenderers({ graphDir: graphDir() });
      if (!results.length) return status('Every type already has a renderer.', 'ok');
      const ok = results.filter(r => r.ok).length;
      status(`${ok} of ${results.length} agent renderers accepted (${results.map(r => `${r.type} ${r.ok ? '✓' : '✗ ' + r.errors.join('; ')}`).join(' · ')}). Rebuilding…`, ok ? 'busy' : 'error');
      if (ok) await build();
    } catch (error) { status(error.message, 'error'); }
  }

  el('btn-open-pages-site')?.addEventListener('click', open);
  el('btn-close-pages-site')?.addEventListener('click', close);
  el('btn-pages-choose-graph')?.addEventListener('click', async () => {
    const dir = await api.choosePagesGraph(graphDir());
    if (dir) el('pages-graph-dir').value = dir;
  });
  el('btn-pages-build')?.addEventListener('click', build);
  el('btn-pages-agent')?.addEventListener('click', agent);
  el('btn-pages-preview')?.addEventListener('click', async () => { if (siteDir) status(`Preview at ${await api.previewPagesSite(siteDir)}`, 'ok'); });
  window.PagesSiteView = { open, build };
})();
