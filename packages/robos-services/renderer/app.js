'use strict';
const $ = id => document.getElementById(id);
let hostId = 'local', hosts = [], snapshot = { services: [] }, selected = '', busy = false, generation = 0, logView = null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : ''; }
async function invoke(name, ...args) { const response = await window.services[name](...args); if (!response.ok) throw new Error(response.error); return response.result; }
async function operation(fn, text = 'Working…') {
  if (busy) return; busy = true; message(text); render();
  try { await fn(); } catch (e) { message(e.message, true); } finally { busy = false; render(); }
}
function renderHosts() {
  $('hosts').replaceChildren(...hosts.map(h => { const button = document.createElement('button'); button.textContent = `${h.local ? '▣' : '▤'}  ${h.name}`; button.className = h.id === hostId ? 'active' : ''; button.disabled = busy; button.onclick = () => { hostId = h.id; selected = ''; snapshot = { services: [] }; renderHosts(); refresh(); }; return button; }));
  const h = hosts.find(h => h.id === hostId); $('host-title').textContent = h?.name || hostId; $('host-subtitle').textContent = h?.local ? 'Services on this computer' : `${h?.user}@${h?.address} · SSH ${h?.port}`;
}
async function refresh() {
  const current = ++generation, id = hostId;
  message('Checking services…');
  try { const result = await invoke('list', id); if (current !== generation || id !== hostId) return; snapshot = result; message(result.errors?.join('\n') || 'Service status is up to date.', !!result.errors?.length); }
  catch (e) { if (current === generation) { snapshot = { services: [] }; message(e.message, true); } }
  render();
}
const keyOf = s => `${s.scope || ''}:${s.id}`;
function render() {
  renderHosts();
  for (const id of ['install', 'boot', 'refresh', 'test-ssh', 'connection', 'add-host']) $(id).disabled = busy;
  $('boot').disabled = busy || snapshot.platform === 'win32';
  $('boot').textContent = snapshot.platform === 'win32' ? 'Starts at sign-in' : snapshot.bootStartup ? 'Boot startup enabled' : 'Enable boot startup';
  $('running-count').textContent = snapshot.services.filter(s => ['active', 'running', 'Running'].includes(s.status)).length;
  $('installed-count').textContent = snapshot.services.filter(s => s.control).length;
  $('catalog-count').textContent = snapshot.services.filter(s => ['catalog', 'embedded'].includes(s.kind)).length;
  $('startup-note').textContent = snapshot.startupNote || 'Add a host or install the server to get started.';
  const search = $('search').value.toLowerCase(), view = $('view').value;
  const rows = snapshot.services.filter(s => (view === 'all' || s.kind === view || view === 'installed' && s.control) && JSON.stringify(s).toLowerCase().includes(search));
  $('service-rows').innerHTML = rows.length ? rows.map(s => `<tr data-key="${esc(keyOf(s))}" class="${selected === keyOf(s) ? 'selected' : ''}"><td><strong>${esc(s.name)}</strong><small>${esc(s.group || s.kind)}</small></td><td><span class="badge ${['active', 'running', 'Running'].includes(s.status) ? 'running' : ''}">${esc(s.status)}</span></td><td>${esc(s.startup || 'with app')}</td><td>${esc(s.port ? `127.0.0.1:${s.port}` : s.endpoint ? JSON.stringify(s.endpoint) : s.scope || s.source || '—')}</td></tr>`).join('') : '<tr><td colspan="4">No services in this view. Install the server or choose another filter.</td></tr>';
  for (const row of $('service-rows').querySelectorAll('tr[data-key]')) row.onclick = () => { selected = row.dataset.key; logView = null; render(); };
  const s = snapshot.services.find(s => keyOf(s) === selected);
  if (!s) { $('detail').innerHTML = '<p>Select a service to see its controls, storage and logs.</p>'; return; }
  $('detail').innerHTML = `<h3>${esc(s.name)}</h3><p>${esc(s.description || s.unit || s.source)}</p><p>${esc(s.control ? `${s.scope} service · PID ${s.pid || '—'}` : s.kind === 'embedded' ? 'This listener runs with its owning app. Its lifecycle belongs to that app.' : 'Install the server to manage this service.')}</p><div class="actions"></div><pre id="service-output" hidden></pre>`;
  if (logView?.key === `${hostId}:${selected}`) { $('service-output').hidden = false; $('service-output').textContent = logView.text; }
  const actions = s.control ? ['start', 'stop', 'restart', 'enable', 'disable', 'logs'] : s.installable ? ['install'] : [];
  for (const action of actions) {
    const button = document.createElement('button'); button.textContent = ({ enable: 'Enable startup', disable: 'Disable startup', logs: 'View logs', install: 'Install suite' })[action] || action[0].toUpperCase() + action.slice(1); button.disabled = busy;
    button.onclick = () => operation(async () => {
      if (action === 'install') { snapshot = await invoke('install', hostId); message('Service suite installed and enabled.'); }
      else { const result = await invoke('action', hostId, { unit: s.unit, scope: s.scope, action }); if (action === 'logs') { logView = { key: `${hostId}:${selected}`, text: result.logs || 'No log entries yet.' }; message('Recent service logs.'); return; } snapshot = result; message(`${s.name}: ${action} completed.`); }
    }, `${action} ${s.name}…`);
    $('detail').querySelector('.actions').append(button);
  }
}
$('refresh').onclick = refresh; $('search').oninput = render; $('view').onchange = render;
$('install').onclick = () => operation(async () => { snapshot = await invoke('install', hostId); message('Server installed. Services are enabled and running.'); }, 'Installing server and runtime. This may take a few minutes…');
$('test-ssh').onclick = () => operation(async () => message(JSON.stringify(await invoke('probe', hostId))), 'Testing authenticated connection…');
$('boot').onclick = () => operation(async () => message(`Boot startup: ${JSON.stringify(await invoke('linger', hostId))}`));
$('add-host').onclick = () => $('host-dialog').showModal(); $('cancel-host').onclick = () => $('host-dialog').close();
$('create-key').onclick = async () => { try { const result = await invoke('key'); $('host-form').elements.identity.value = result.identity; $('public-key').textContent = result.publicKey + '\n\n' + result.instruction; } catch (e) { $('public-key').textContent = e.message; } };
$('host-form').onsubmit = async event => { event.preventDefault(); try { const value = Object.fromEntries(new FormData(event.target)); hosts = await invoke('saveHost', value); hostId = value.id; $('host-dialog').close(); renderHosts(); await refresh(); } catch (e) { $('public-key').textContent = e.message; } };
$('connection').onclick = () => operation(async () => { const result = await invoke('connection', hostId), h = hosts.find(h => h.id === hostId); $('connection-details').textContent = JSON.stringify({ ...result, ...(h?.local ? {} : { tunnel: `ssh ${h.identity ? `-i "${h.identity}" ` : ''}-N -L 19400:127.0.0.1:19400 -p ${h.port} ${h.user}@${h.address}` }) }, null, 2); $('connection-dialog').showModal(); message('Connection details ready.'); });
$('close-connection').onclick = () => { $('connection-dialog').close(); $('connection-details').textContent = ''; };
(async () => { try { hosts = await invoke('hosts'); renderHosts(); await refresh(); } catch (e) { message(e.message, true); } })();
