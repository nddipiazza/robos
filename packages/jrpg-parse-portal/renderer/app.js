'use strict';

const api = window.jrpgPortal;
const $ = sel => document.querySelector(sel);
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { profiles: [], current: null, siteDir: null, outDirs: {} };

function log(line) {
  const el = $('#log');
  el.textContent += `${line}\n`;
  el.scrollTop = el.scrollHeight;
}
api.onLog(log);

function setStatus(sel, text, kind = '') {
  const el = $(sel);
  el.textContent = text;
  el.className = `status ${kind}`;
}

function showTab(name) {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('active', b.dataset.tab === name);
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== name;
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => showTab(b.dataset.tab));

function outDir() { return $('#out-dir').value.trim(); }

async function selectProfile(id) {
  state.current = state.profiles.find(p => p.id === id);
  for (const el of document.querySelectorAll('.profile')) el.classList.toggle('active', el.dataset.id === id);
  const p = state.current;
  $('#game-head').innerHTML = `<h2>${h(p.title)}</h2><div class="meta"><span class="badge">${h(p.platform)}</span><span class="badge">${h(p.region)}</span><span class="badge">${h(p.year)}</span></div><p>${h(p.description)}</p>`;
  $('#out-dir').value = state.outDirs[id] || p.defaultOut;
  const plan = await api.plan(id);
  $('#plan-grid').innerHTML = plan.map(a => `
    <div class="asset ${a.sources.length ? '' : 'empty'}" data-asset="${h(a.id)}">
      <div class="asset-title">${h(a.label)}</div>
      ${a.sources.length ? a.sources.map(s => `<div class="src"><span class="pill ${h(s.status)}">${h(s.status)}</span> ${h(s.title)}</div>`).join('') : `<div class="src muted">No source yet: try the agent. Typical: ${h(a.hints.join('; '))}</div>`}
    </div>`).join('');
  $('#discover-table').hidden = true;
  setStatus('#discover-status', '');
  setStatus('#acquire-status', '');
  $('#coverage-grid').innerHTML = '';
  $('#acquire-notes').innerHTML = '';
}

async function loadProfiles() {
  state.profiles = await api.profiles();
  $('#profile-list').innerHTML = state.profiles.map(p => `
    <button class="profile" role="option" data-id="${h(p.id)}">
      <span class="pname">${h(p.title)}</span>
      <span class="pmeta">${h(p.platform)} · ${h(p.region)} · ${h(p.year)} · ${p.sources.length} sources</span>
    </button>`).join('');
  for (const el of document.querySelectorAll('.profile')) el.addEventListener('click', () => selectProfile(el.dataset.id));
  if (state.profiles.length) await selectProfile(state.profiles.find(p => p.id === 'final-fantasy-usa') ? 'final-fantasy-usa' : state.profiles[0].id);
}

$('#btn-discover').addEventListener('click', async () => {
  const btn = $('#btn-discover');
  btn.disabled = true;
  setStatus('#discover-status', 'Asking the robos agent… this can take a minute or two.', 'busy');
  try {
    const res = await api.discover({ profileId: state.current.id });
    const tbody = $('#discover-table tbody');
    tbody.innerHTML = res.suggestions.map(s => `<tr><td><a href="${h(s.url)}" target="_blank" rel="noopener">${h(s.title)}</a></td><td>${h(s.kind)}</td><td>${h(s.assetTypes.join(', '))}</td><td><span class="pill ${/^reachable/.test(s.status) ? 'reachable' : 'unreachable'}">${h(s.status)}</span></td></tr>`).join('');
    $('#discover-table').hidden = false;
    setStatus('#discover-status', `${res.suggestions.length} new fan resources suggested (${res.rejected} rejected by validation).`, 'ok');
  } catch (error) {
    setStatus('#discover-status', error.message, 'error');
  } finally { btn.disabled = false; }
});

$('#btn-choose-out').addEventListener('click', async () => {
  const dir = await api.chooseFolder(outDir());
  if (dir) $('#out-dir').value = dir;
});

function renderCoverage(cov) {
  $('#coverage-grid').innerHTML = cov.map(c => `<div class="asset ${c.covered ? 'covered' : 'missing'}" data-asset="${h(c.id)}"><div class="asset-title">${c.covered ? '✓' : '✗'} ${h(c.label)}</div><div class="count">${c.count}</div></div>`).join('');
}

$('#btn-acquire').addEventListener('click', async () => {
  const btn = $('#btn-acquire');
  btn.disabled = true;
  setStatus('#acquire-status', 'Acquiring…', 'busy');
  try {
    const res = await api.acquire({ profileId: state.current.id, outDir: outDir(), measureMaps: $('#opt-measure').checked, downloadImages: $('#opt-images').checked, includeDiscovery: $('#opt-discovery').checked });
    state.outDirs[state.current.id] = res.outDir;
    renderCoverage(res.coverage);
    $('#acquire-notes').innerHTML = res.warnings.map(w => `<li>${h(w)}</li>`).join('');
    setStatus('#acquire-status', `${res.nodeCount} nodes in ${res.packages.length} packages written to ${res.outDir} (${res.http.network} requests, ${res.http.cached} from cache).`, 'ok');
  } catch (error) {
    setStatus('#acquire-status', error.message, 'error');
  } finally { btn.disabled = false; }
});

function renderResolution(table) {
  const why = t => (t.via === 'type' ? 'its own type' : t.via === 'parent' ? `parent type ${t.viaType}` : t.via === 'node' ? 'node-specific' : 'no renderer: generic');
  $('#resolution-table tbody').innerHTML = table.types.map(t => `<tr class="via-${h(t.via)}"><td>${h(t.type)}</td><td>${t.count}</td><td><code>${h(t.renderer || '')}</code></td><td>${h(why(t))}</td></tr>`).join('');
  $('#resolution-table').hidden = false;
}

$('#btn-build-site').addEventListener('click', async () => {
  setStatus('#publish-status', 'Building…', 'busy');
  try {
    const res = await api.buildSite({ graphDir: outDir(), workflow: $('#opt-workflow').checked });
    state.siteDir = res.outDir;
    renderResolution(res.resolution);
    $('#btn-preview').disabled = false;
    $('#btn-open-folder').disabled = false;
    const generic = res.resolution.types.filter(t => t.via === 'generic').length;
    setStatus('#publish-status', `Site for ${res.nodeCount} nodes written to ${res.outDir}. ${generic} types use the generic renderer.${res.workflow ? ' Pages workflow added.' : ''}`, 'ok');
  } catch (error) {
    setStatus('#publish-status', error.message, 'error');
  }
});

$('#btn-agent-renderers').addEventListener('click', async () => {
  setStatus('#publish-status', 'Asking the robos agent to write renderers for types on the generic renderer…', 'busy');
  try {
    const results = await api.agentRenderers({ graphDir: outDir() });
    const ok = results.filter(r => r.ok);
    setStatus('#publish-status', results.length ? `${ok.length} of ${results.length} renderers accepted: ${results.map(r => `${r.type} ${r.ok ? '✓' : `✗ ${r.errors.join('; ')}`}`).join(' · ')}. Build the site again to use them.` : 'Every type already has a renderer.', ok.length === results.length ? 'ok' : 'error');
  } catch (error) {
    setStatus('#publish-status', error.message, 'error');
  }
});

$('#btn-preview').addEventListener('click', async () => {
  const url = await api.previewSite({ siteDir: state.siteDir });
  log(`Preview at ${url}`);
});
$('#btn-open-folder').addEventListener('click', () => api.openFolder(state.siteDir));

loadProfiles().catch(error => log(`Could not load profiles: ${error.message}`));
