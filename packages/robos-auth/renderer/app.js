'use strict';

const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let providers = [];
let activeId  = null;
let identity  = null;

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await reload();
  document.getElementById('btn-add-provider').addEventListener('click', addCustomProvider);
  document.getElementById('btn-reset').addEventListener('click', resetProviders);
  document.getElementById('provider-form').addEventListener('submit', saveProvider);
  document.getElementById('btn-connect').addEventListener('click', () => {
    alert('OAuth flow not yet implemented.\n\nOnce your Client ID & Secret are filled in and saved, the OAuth flow button will open the provider\'s authorization page in a browser window and capture the token automatically.\n\nFor now, identity is sourced from the RobOS People Directory.');
  });
});

async function reload() {
  [providers, identity] = await Promise.all([
    window.api.listProviders(),
    window.api.getIdentity(),
  ]);
  renderIdentityBadge();
  renderProviderList();
  renderIdentityPanel();
}

// ── Identity badge (header) ───────────────────────────────────────────────────
function renderIdentityBadge() {
  if (!identity) return;
  const p = identity.person;
  const initials = p ? ((p.firstName||'')[0]+(p.lastName||'')[0]).toUpperCase() || (p.displayName||'?')[0].toUpperCase() : identity.uid[0].toUpperCase();
  const name     = p ? (p.displayName || `${p.firstName} ${p.lastName}`.trim()) : identity.uid;
  document.getElementById('id-avatar').textContent = initials;
  document.getElementById('id-name').textContent   = name;
  document.getElementById('id-source').textContent = identity.source === 'hardcoded' ? 'hardcoded · robos' : identity.source;
}

// ── Provider list ─────────────────────────────────────────────────────────────
function renderProviderList() {
  const ul = document.getElementById('provider-list');
  ul.innerHTML = providers.map(p => `
    <li class="${p.id===activeId?'active':''}" data-id="${esc(p.id)}">
      <span class="prov-icon">${p.icon||'🔑'}</span>
      <div class="prov-info">
        <div class="prov-name">${esc(p.name)}</div>
        <div class="prov-sub">${p.type.toUpperCase()}</div>
      </div>
      <span class="prov-dot${p.enabled?' enabled':''}"></span>
    </li>`).join('');
  ul.querySelectorAll('li').forEach(li =>
    li.addEventListener('click', () => selectProvider(li.dataset.id)));
}

function selectProvider(id) {
  activeId = id;
  renderProviderList();
  const p = providers.find(x => x.id === id);
  if (p) showProviderPanel(p);
}

// ── Provider panel ────────────────────────────────────────────────────────────
function showProviderPanel(p) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('provider-panel').classList.remove('hidden');

  document.getElementById('provider-icon').textContent = p.icon || '🔑';
  document.getElementById('provider-name').textContent = p.name;
  const badge = document.getElementById('provider-status-badge');
  badge.textContent = p.enabled ? '● Enabled' : '○ Disabled';
  badge.className   = p.enabled ? 'enabled' : '';

  document.getElementById('provider-notice').classList.toggle('hidden', p.enabled && !!p.clientId);
  document.getElementById('f-client-id').value     = p.clientId || '';
  document.getElementById('f-client-secret').value = p.clientSecret || '';
  document.getElementById('f-scopes').value         = p.scopes || '';
  document.getElementById('f-auth-url').value       = p.authUrl || '';
  document.getElementById('f-token-url').value      = p.tokenUrl || '';
  document.getElementById('f-callback-url').value   = p.callbackUrl || '';
  document.getElementById('f-enabled').checked      = !!p.enabled;
  document.getElementById('f-issuer-url').value     = p.issuerUrl || '';
  document.getElementById('oidc-row').classList.toggle('hidden', p.type !== 'oidc');

  const tokenStatus = document.getElementById('f-token-status');
  if (p.accessToken) {
    tokenStatus.textContent = `✓ Connected (expires: ${p.tokenExpiry||'unknown'})`;
    tokenStatus.className   = 'token-status connected';
  } else {
    tokenStatus.textContent = 'Not connected';
    tokenStatus.className   = 'token-status';
  }

  const btnDel = document.getElementById('btn-delete-provider');
  btnDel.onclick = () => deleteProvider(p.id);
}

async function saveProvider(e) {
  e.preventDefault();
  const p = providers.find(x => x.id === activeId);
  if (!p) return;
  p.clientId     = document.getElementById('f-client-id').value.trim();
  p.clientSecret = document.getElementById('f-client-secret').value.trim();
  p.scopes       = document.getElementById('f-scopes').value.trim();
  p.authUrl      = document.getElementById('f-auth-url').value.trim();
  p.tokenUrl     = document.getElementById('f-token-url').value.trim();
  p.callbackUrl  = document.getElementById('f-callback-url').value.trim();
  p.enabled      = document.getElementById('f-enabled').checked;
  if (p.type === 'oidc') p.issuerUrl = document.getElementById('f-issuer-url').value.trim();
  await window.api.saveProvider(p);
  await reload();
  selectProvider(activeId);
}

async function deleteProvider(id) {
  const p = providers.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete provider "${p.name}"?`)) return;
  await window.api.deleteProvider(id);
  activeId = null;
  document.getElementById('provider-panel').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  await reload();
}

async function resetProviders() {
  if (!confirm('Reset all providers to defaults? This will clear all credentials.')) return;
  await window.api.resetProviders();
  activeId = null;
  document.getElementById('provider-panel').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  await reload();
}

async function addCustomProvider() {
  const name = prompt('Provider name:');
  if (!name) return;
  const newProv = {
    id: 'custom-' + Date.now().toString(36),
    name, type: 'oauth2', icon: '🔑', enabled: false,
    clientId: '', clientSecret: '', scopes: 'openid email profile',
    authUrl: '', tokenUrl: '',
    callbackUrl: 'http://localhost:9871/callback/custom',
  };
  await window.api.saveProvider(newProv);
  await reload();
  selectProvider(newProv.id);
}

// ── Identity panel (empty state) ──────────────────────────────────────────────
function renderIdentityPanel() {
  const panel = document.getElementById('identity-panel');
  if (!identity) return;
  panel.classList.remove('hidden');
  const p = identity.person;
  if (!p) {
    panel.innerHTML = `<div class="id-panel-header">Current Identity</div><div style="color:#8888aa;font-size:13px;">UID: ${esc(identity.uid)} (no People Directory profile found)</div>`;
    return;
  }
  const initials = ((p.firstName||'')[0]+(p.lastName||'')[0]).toUpperCase() || (p.displayName||'?')[0].toUpperCase();
  const name     = p.displayName || `${p.firstName} ${p.lastName}`.trim();
  panel.innerHTML = `
    <div class="id-panel-header">Current Identity</div>
    <div class="id-avatar-lg">${esc(initials)}</div>
    <div class="id-name-lg">${esc(name)}</div>
    <div class="id-sub">${esc(p.title||'')}${p.title&&p.department?' · ':''}${esc(p.department||'')}</div>
    <div class="id-fields">
      ${p.email    ? `<div class="id-field"><span class="id-label">Email</span><span class="id-value">${esc(p.email)}</span></div>` : ''}
      ${p.username ? `<div class="id-field"><span class="id-label">Username</span><span class="id-value">${esc(p.username)}</span></div>` : ''}
      ${p.location ? `<div class="id-field"><span class="id-label">Location</span><span class="id-value">${esc(p.location)}</span></div>` : ''}
      <div class="id-field"><span class="id-label">UID</span><span class="id-value"><code>${esc(p.uid)}</code></span></div>
    </div>
    <div class="hardcoded-notice">
      <strong>ℹ Hardcoded identity</strong><br/>
      Identity is currently sourced from the RobOS People Directory (uid: <code>${esc(identity.uid)}</code>).
      Configure an OAuth provider above and click <em>Connect</em> to authenticate with a real identity provider.
      Set up the matching People Directory profile and the identity will be resolved automatically.
    </div>`;
}


// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'robos-auth');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();
// ─────────────────────────────────────────────────────────────────────
