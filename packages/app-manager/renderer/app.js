'use strict';
const api = window.robosManager, $ = id => document.getElementById(id);
let state = { installed: {}, busy: false }, selected = new Set(), installedOnly = false, previewToken = 0;
const bytes = n => n < 1024 ** 2 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
const notice = message => { $('notice').textContent = message; };
const attempt = async work => { try { return await work(); } catch (error) { notice(error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')); } };
const element = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
function visible() {
  const query = $('search').value.toLowerCase();
  return (state.catalog?.components || Object.values(state.installed)).filter(item => item.kind === 'app' && (!installedOnly || state.installed[item.id]) && `${item.label} ${item.description || ''} ${item.group}`.toLowerCase().includes(query));
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
  const apps = visible(), groups = [...new Set(apps.map(item => item.group))].sort();
  for (const group of groups) {
    const items = apps.filter(item => item.group === group), details = element('details'); details.open = open.get(group) ?? true; details.dataset.group = group;
    const summary = element('summary'), label = element('label');
    label.onclick = event => event.stopPropagation(); label.append(checkbox(items), document.createTextNode(group));
    summary.append(label, element('span', `${items.length} apps`, 'group-count')); details.append(summary);
    for (const item of items) {
      const row = element('div', '', 'app'); row.dataset.id = item.id;
      const label = element('label'), box = checkbox([item]); box.setAttribute('aria-label', `Select ${item.label}`);
      const copy = element('span', '', 'copy'); copy.append(element('strong', item.label), element('small', item.description || 'RobOS desktop application'));
      label.append(box, element('span', '▦', 'app-icon'), copy); row.append(label);
      const actions = element('div', '', 'app-actions'), current = state.installed[item.id];
      if (current) {
        actions.append(element('span', current.sha256 === item.sha256 ? 'Installed' : 'Update available', 'badge'));
        for (const [text, fn] of [['Open', () => api.launch(item.id)], ['Uninstall', () => api.uninstall(item.id)]]) {
          const button = element('button', text); button.disabled = state.busy;
          button.onclick = () => attempt(async () => { const result = await fn(); if (result?.installed) { state = result; selected.delete(item.id); render(); } else if (text === 'Open') notice(`Opened ${item.label}.`); }); actions.append(button);
        }
      } else actions.append(element('span', bytes(item.bytes), 'size'));
      row.append(actions); details.append(row);
    }
    $('tree').append(details);
  }
  if (!apps.length) $('tree').append(element('p', state.catalog ? 'No apps match this view.' : 'The app catalog is unavailable. Use Refresh catalog to try again.', 'empty'));
  $('count').textContent = Object.values(state.installed).filter(item => item.kind === 'app').length;
  $('platform').textContent = `${state.platform === 'win32' ? 'Windows' : 'Linux'} · v${state.version || ''}`;
  $('browse').classList.toggle('active', !installedOnly); $('installed').classList.toggle('active', installedOnly);
  $('select-all').checked = apps.length > 0 && apps.every(item => selected.has(item.id));
  $('select-all').indeterminate = apps.some(item => selected.has(item.id)) && !$('select-all').checked;
  for (const id of ['refresh', 'clear', 'select-all', 'remove-all']) $(id).disabled = state.busy;
  $('install').disabled = state.busy || !selected.size; $('progress-area').hidden = !state.busy;
  $('selection').textContent = selected.size ? `${selected.size} apps selected` : 'No apps selected';
  $('estimate').textContent = 'Choose individual apps or a whole group.';
  const token = ++previewToken;
  if (selected.size && !state.busy) attempt(async () => {
    const preview = await api.preview([...selected]); if (token !== previewToken) return;
    $('estimate').textContent = preview.items.length ? `${bytes(preview.bytes)} download · ${bytes(preview.unpackedBytes)} installed · includes needed shared components` : 'Your selected apps are already up to date.';
    $('install').disabled = !preview.items.length;
    $('install').textContent = preview.items.some(item => state.installed[item.id]) ? 'Install / update selected' : 'Install selected apps';
  });
}
$('search').oninput = render;
$('browse').onclick = () => { installedOnly = false; render(); };
$('installed').onclick = () => { installedOnly = true; render(); };
$('select-all').onchange = () => { visible().forEach(item => $('select-all').checked ? selected.add(item.id) : selected.delete(item.id)); render(); };
$('clear').onclick = () => { selected.clear(); render(); };
$('refresh').onclick = () => attempt(async () => { notice('Refreshing app catalog…'); state = await api.refresh(); notice(''); render(); });
$('install').onclick = () => attempt(async () => { notice(''); state = await api.install([...selected]); selected.clear(); render(); notice('Selected apps are ready to open.'); });
$('cancel').onclick = () => attempt(() => api.cancel());
$('remove-all').onclick = () => attempt(() => api.removeAll());
api.onState(value => { state = value; render(); });
api.onProgress(value => { $('progress-label').textContent = `${value.phase}: ${state.catalog.components.find(item => item.id === value.id)?.label || value.id}`; if (value.total) $('progress').value = value.received / value.total * 100; else $('progress').removeAttribute('value'); });
attempt(async () => { state = await api.state(); render(); try { state = await api.refresh(); render(); } catch (error) { notice(`${error.message}\n${state.catalog ? 'Showing the saved catalog. Installed apps can still be opened.' : 'Your installed apps remain on this computer.'}`); } });
