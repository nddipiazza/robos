'use strict';
const api = window.robosManager, $ = id => document.getElementById(id);
let state = { installed: {}, busy: false }, selected = new Set(), view = 'all', previewToken = 0;
const bytes = n => n < 1024 ** 2 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const notice = message => { $('notice').textContent = message; };
const attempt = async work => { try { return await work(); } catch (error) { notice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } };
const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
function visible() {
  const query = $('search').value.toLowerCase();
  return (state.catalog?.components || Object.values(state.installed)).filter(item => item.kind === 'app' &&
    (view !== 'installed' || state.installed[item.id]) && (view !== 'updates' || state.installed[item.id] && state.installed[item.id].sha256 !== item.sha256) &&
    `${item.label} ${item.description || ''} ${item.group}`.toLowerCase().includes(query));
}
function checkbox(items) {
  const box = document.createElement('input'); box.type = 'checkbox'; box.disabled = state.busy || !state.catalog;
  const n = items.filter(item => selected.has(item.id)).length;
  box.checked = n > 0 && n === items.length; box.indeterminate = n > 0 && n < items.length;
  box.onchange = () => { items.forEach(item => box.checked ? selected.add(item.id) : selected.delete(item.id)); render(); };
  return box;
}
function render() {
  const open = new Map(Array.from($('tree').querySelectorAll('details')).map(node => [node.dataset.group, node.open]));
  $('tree').replaceChildren();
  const order = ['Everyday & business', 'Developer tools', 'AI & agents', 'Games & game tools', 'System & security'];
  const apps = visible(), groups = [...new Set(apps.map(item => item.group))].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b));
  for (const group of groups) {
    const items = apps.filter(item => item.group === group), details = element('details'); details.open = open.get(group) ?? true; details.dataset.group = group;
    const summary = element('summary'), label = element('label');
    label.onclick = event => event.stopPropagation(); label.append(checkbox(items), document.createTextNode(group));
    summary.append(label, element('span', `(${items.length})`, 'group-count')); details.append(summary);
    for (const item of items) {
      const row = element('div', '', 'app'); row.dataset.id = item.id;
      const label = element('label'), box = checkbox([item]); box.setAttribute('aria-label', `Select ${item.label}`);
      const copy = element('span', '', 'copy'); copy.append(element('strong', item.label), element('small', item.description || 'RobOS desktop application')); copy.title = item.description || item.label;
      const icon = element('span', '', 'app-icon');
      if (typeof item.iconSvg === 'string' && item.iconSvg.length < 16000) { const image = element('img'); image.alt = ''; image.src = `data:image/svg+xml,${encodeURIComponent(item.iconSvg)}`; icon.append(image); }
      else { const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 20 20'); const rect = document.createElementNS(svg.namespaceURI, 'rect'); for (const [key, value] of Object.entries({ x: 3, y: 3, width: 14, height: 14, rx: 3 })) rect.setAttribute(key, value); svg.append(rect); icon.append(svg); }
      label.append(box, icon, copy); row.append(label);
      const actions = element('div', '', 'app-actions'), current = state.installed[item.id];
      row.append(element('span', current?.version || '—', 'version'), element('span', item.version, `version${current && current.sha256 !== item.sha256 ? ' available' : ''}`), element('span', bytes(item.bytes), 'size'));
      if (current) {
        for (const [text, fn] of [['Open', () => api.launch(item.id)], ['Uninstall', () => api.uninstall(item.id)]]) {
          const button = element('button', text); button.disabled = state.busy;
          if (text === 'Uninstall') button.className = 'remove';
          button.onclick = () => attempt(async () => { const result = await fn(); if (result?.installed) { state = result; selected.delete(item.id); render(); } else if (text === 'Open') notice(`Opened ${item.label}.`); }); actions.append(button);
        }
      }
      row.append(actions); details.append(row);
    }
    $('tree').append(details);
  }
  if (!apps.length) $('tree').append(element('p', state.catalog ? 'No apps match this view.' : 'The app catalog is unavailable. Use Refresh catalog to try again.', 'empty'));
  $('count').textContent = Object.values(state.installed).filter(item => item.kind === 'app').length;
  $('update-count').textContent = (state.catalog?.components || []).filter(item => item.kind === 'app' && state.installed[item.id] && state.installed[item.id].sha256 !== item.sha256).length;
  $('app-total').textContent = `${apps.length} applications`;
  $('view-title').textContent = { all: 'All apps', installed: 'Installed apps', updates: 'Updates' }[view];
  $('platform').textContent = `${state.platform === 'win32' ? 'Windows' : 'Linux'} · v${state.version || ''}`;
  $('browse').classList.toggle('active', view === 'all'); $('installed').classList.toggle('active', view === 'installed'); $('updates').classList.toggle('active', view === 'updates');
  $('select-all').checked = apps.length > 0 && apps.every(item => selected.has(item.id));
  $('select-all').indeterminate = apps.some(item => selected.has(item.id)) && !$('select-all').checked;
  for (const id of ['refresh', 'clear', 'select-all', 'remove-all']) $(id).disabled = state.busy;
  $('install').disabled = state.busy || !selected.size; $('progress-area').hidden = !state.busy;
  $('selection').textContent = selected.size ? `${selected.size} apps selected` : 'No apps selected';
  $('estimate').textContent = 'Select apps using the checkboxes.';
  const token = ++previewToken;
  if (selected.size && !state.busy) attempt(async () => {
    const preview = await api.preview([...selected]); if (token !== previewToken) return;
    $('estimate').textContent = preview.items.length ? `${bytes(preview.bytes)} to download · ${bytes(preview.unpackedBytes)} on disk` : 'Selected apps are up to date.';
    $('install').disabled = !preview.items.length;
    $('install').textContent = preview.items.some(item => state.installed[item.id]) ? 'Apply updates' : 'Install selected';
  });
}
$('search').oninput = render;
$('browse').onclick = () => { view = 'all'; render(); };
$('installed').onclick = () => { view = 'installed'; render(); };
$('updates').onclick = () => { view = 'updates'; render(); };
$('select-all').onchange = () => { visible().forEach(item => $('select-all').checked ? selected.add(item.id) : selected.delete(item.id)); render(); };
$('clear').onclick = () => { selected.clear(); render(); };
$('refresh').onclick = () => attempt(async () => { notice('Refreshing app catalog…'); state = await api.refresh(); notice(''); render(); });
$('install').onclick = () => attempt(async () => { notice(''); state = await api.install([...selected]); selected.clear(); render(); notice('Selected apps are ready to open.'); });
$('cancel').onclick = () => attempt(() => api.cancel());
$('remove-all').onclick = () => attempt(() => api.removeAll());
api.onState(value => { state = value; render(); });
api.onProgress(value => { $('progress-label').textContent = `${value.phase}: ${state.catalog.components.find(item => item.id === value.id)?.label || value.id}`; if (value.total) $('progress').value = value.received / value.total * 100; else $('progress').removeAttribute('value'); });
attempt(async () => { state = await api.state(); render(); try { state = await api.refresh(); render(); } catch (error) { notice(`${error.message}\n${state.catalog ? 'Showing the saved catalog. Installed apps can still be opened.' : 'Your installed apps remain on this computer.'}`); } });
