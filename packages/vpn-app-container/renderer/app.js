'use strict';
const $ = id => document.getElementById(id);
let ready = false, imported = false, building = false;
const savedApp = localStorage.getItem('vpn-protected-app');
if (['qbittorrent', 'transmission'].includes(savedApp)) $('app').value = savedApp;
function refresh() { $('start').disabled = !ready || !imported || building; }
async function action(fn) {
  $('error').textContent = '';
  try { return await fn(); } catch (error) { $('error').textContent = error.message; }
}
$('import').onclick = () => action(async () => {
  const profile = await window.vpn.import();
  if (!profile) return;
  imported = true;
  $('profile').textContent = `${profile.hostname}:${profile.port} (${profile.protocol})`;
  refresh();
});
$('build').onclick = () => action(async () => {
  building = true; $('build').disabled = true; refresh(); $('build-state').textContent = ' Building…';
  try { await window.vpn.build(); $('build-state').textContent = ' Container image ready'; }
  finally { building = false; $('build').disabled = !ready; refresh(); }
});
$('start').onclick = () => action(async () => {
  $('start').disabled = true;
  const credentials = { username: $('username').value, password: $('password').value };
  $('password').value = '';
  try {
    const result = await window.vpn.start($('app').value, credentials);
    $('state').textContent = result.message;
    $('web-auth').textContent = `App login: admin · Password: ${result.webPassword}`;
  } finally { credentials.password = ''; refresh(); }
});
$('stop').onclick = () => action(() => window.vpn.stop($('app').value));
$('open').onclick = () => action(() => window.vpn.open($('app').value));
$('app').onchange = () => { localStorage.setItem('vpn-protected-app', $('app').value); $('web-auth').textContent = ''; };
action(async () => {
  const result = await window.vpn.prerequisites(); ready = result.ready;
  $('runtime').textContent = result.message; $('build').disabled = !ready; refresh();
});
setInterval(async () => {
  const id = $('app').value;
  try {
    const result = await window.vpn.status(id);
    if (id !== $('app').value) return;
    $('state').textContent = result.state;
    $('logs').textContent = result.logs;
    $('open').disabled = result.state !== 'running';
  } catch (error) { $('error').textContent = error.message; }
}, 2000);
