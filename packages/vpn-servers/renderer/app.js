'use strict';

let state = {
  providers: [],
  accounts: [],
  defaultAccountId: null,
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(window._t);
  window._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

function activeProvider() {
  const sel = document.getElementById('acc-provider')?.value || 'ipvanish';
  return (state.providers || []).find(p => p.id === sel) || state.providers?.[0];
}

function defaultAccount() {
  return (state.accounts || []).find(a => a.id === state.defaultAccountId) || state.accounts?.[0] || null;
}

function renderAccounts() {
  const listEl = document.getElementById('accounts-list');
  const accounts = state.accounts || [];
  if (!accounts.length) {
    listEl.innerHTML = `<div class="row-card"><div class="row-sub">No accounts added yet. Enter your IPVanish username and password below.</div></div>`;
    return;
  }

  listEl.innerHTML = accounts
    .map(
      acc => `
      <div class="row-card ${acc.isDefault ? 'active' : ''}" data-account-id="${esc(acc.id)}">
        <div>
          <div class="row-title">
            ${esc(acc.label)}
            <span class="tag">${esc(acc.providerName)}</span>
            ${acc.isDefault ? `<span class="tag green">Active</span>` : ''}
          </div>
          <div class="row-sub">
            User: ${esc(acc.username)} · Server: ${esc(acc.defaultProfile || 'default')}
          </div>
        </div>
        <div style="display:flex;gap:6px;">
          ${!acc.isDefault ? `<button type="button" class="btn" data-use-acc="${esc(acc.id)}">Use</button>` : ''}
          <button type="button" class="btn" data-edit-acc="${esc(acc.id)}">Edit</button>
          <button type="button" class="btn btn-danger" data-del-acc="${esc(acc.id)}">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-use-acc]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.setDefaultAccount(btn.dataset.useAcc);
      if (res.ok) {
        state = { ...state, ...res };
        renderAll();
        await loadAccountIntoForm(btn.dataset.useAcc);
      }
    };
  });

  listEl.querySelectorAll('[data-edit-acc]').forEach(btn => {
    btn.onclick = async () => {
      await loadAccountIntoForm(btn.dataset.editAcc);
    };
  });

  listEl.querySelectorAll('[data-del-acc]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.deleteAccount(btn.dataset.delAcc);
      if (res.ok) {
        state = { ...state, ...res };
        renderAll();
        showToast('Removed VPN account.');
      }
    };
  });
}

async function loadAccountIntoForm(accountId) {
  const acc = (state.accounts || []).find(a => a.id === accountId) || defaultAccount();
  if (!acc) return;
  document.getElementById('acc-provider').value = acc.providerId || 'ipvanish';
  renderFormSelects();
  document.getElementById('acc-label').value = acc.label || '';
  document.getElementById('acc-username').value = acc.username || '';
  document.getElementById('acc-protocol').value = acc.protocol || 'udp';
  if (acc.defaultProfile) {
    document.getElementById('acc-default-profile').value = acc.defaultProfile;
  }
  if (typeof window.robos.getAccountCredentials === 'function') {
    const creds = await window.robos.getAccountCredentials(acc.id);
    if (creds?.ok && creds.password) {
      document.getElementById('acc-password').value = creds.password;
    }
  }
}

function renderFormSelects() {
  const provSelect = document.getElementById('acc-provider');
  const profSelect = document.getElementById('acc-default-profile');
  const currentProvId = provSelect.value || 'ipvanish';

  provSelect.innerHTML = (state.providers || [])
    .map(p => `<option value="${esc(p.id)}"${p.id === currentProvId ? ' selected' : ''}>${esc(p.name)}</option>`)
    .join('');

  const prov = activeProvider();
  const profiles = prov?.profiles || [];
  const defAcc = defaultAccount();
  const selectedProf = defAcc?.defaultProfile || profiles[0]?.id || '';

  const countrySelect = document.getElementById('server-country');
  if (countrySelect) {
    const prevCountry = countrySelect.value || '';
    const counts = new Map();
    for (const p of profiles) {
      const c = p.country || 'OTHER';
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    const sortedCountries = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    countrySelect.innerHTML =
      `<option value="">All Countries (${profiles.length})</option>` +
      sortedCountries
        .map(([c, n]) => `<option value="${esc(c)}"${c === prevCountry ? ' selected' : ''}>${esc(c)} (${n})</option>`)
        .join('');
    countrySelect.onchange = () => {
      window._serverLimit = 150;
      renderServers();
    };
  }

  profSelect.innerHTML = profiles
    .map(p => `<option value="${esc(p.id)}"${p.id === selectedProf ? ' selected' : ''}>${esc(p.label)}</option>`)
    .join('');

  provSelect.onchange = () => {
    renderFormSelects();
    renderServers();
  };
}

function renderServers() {
  const listEl = document.getElementById('servers-list');
  const headingEl = document.getElementById('servers-heading');
  const q = (document.getElementById('server-search')?.value || '').trim().toLowerCase();
  const countryFilter = document.getElementById('server-country')?.value || '';
  const prov = activeProvider();
  const defAcc = defaultAccount();
  const currentServerId = defAcc?.defaultProfile || document.getElementById('acc-default-profile')?.value || '';
  const allProfiles = prov?.profiles || [];

  const profiles = allProfiles.filter(p => {
    if (countryFilter && (p.country || 'OTHER') !== countryFilter) return false;
    if (!q) return true;
    return (
      (p.label || '').toLowerCase().includes(q) ||
      (p.hostname || '').toLowerCase().includes(q) ||
      (p.country || '').toLowerCase().includes(q) ||
      (p.city || '').toLowerCase().includes(q)
    );
  });

  if (headingEl) {
    headingEl.textContent = `2. Server Locations (${profiles.length.toLocaleString()} of ${allProfiles.length.toLocaleString()})`;
  }

  if (!profiles.length) {
    listEl.innerHTML = `<div class="row-card"><div class="row-sub">No matching servers found.</div></div>`;
    return;
  }

  const limit = window._serverLimit || 150;
  const visible = profiles.slice(0, limit);
  const selectedObj = allProfiles.find(p => p.id === currentServerId);
  if (selectedObj && !visible.some(p => p.id === selectedObj.id)) {
    visible.unshift(selectedObj);
  }

  listEl.innerHTML =
    visible
      .map(p => {
        const isSelected = p.id === currentServerId;
        return `
        <div class="row-card ${isSelected ? 'active' : ''}" data-server-id="${esc(p.id)}">
          <div>
            <div class="row-title">
              ${esc(p.country ? `${p.country} — ${p.city}` : p.label)}
              ${isSelected ? `<span class="tag green">Selected Server</span>` : ''}
            </div>
            <div class="row-sub">${esc(p.hostname || p.filename)} · ${(p.proto || 'udp').toUpperCase()} port ${esc(p.port || 443)}</div>
          </div>
          <div>
            ${
              isSelected
                ? `<span class="tag green">Active</span>`
                : `<button type="button" class="btn" data-select-server="${esc(p.id)}">Use Server</button>`
            }
          </div>
        </div>
      `;
      })
      .join('') +
    (profiles.length > limit
      ? `<button type="button" class="btn full-width" id="btn-show-more-servers">Show More (${(profiles.length - limit).toLocaleString()} remaining)…</button>`
      : '');

  const moreBtn = document.getElementById('btn-show-more-servers');
  if (moreBtn) {
    moreBtn.onclick = () => {
      window._serverLimit = limit + 250;
      renderServers();
    };
  }

  listEl.querySelectorAll('[data-select-server]').forEach(btn => {
    btn.onclick = async () => {
      const serverId = btn.dataset.selectServer;
      document.getElementById('acc-default-profile').value = serverId;
      if (defaultAccount()) {
        const res = await window.robos.setAccountServer({ profileId: serverId });
        if (res.ok) {
          state = { ...state, ...res };
          renderAll();
          showToast(`Selected server: ${serverId}`);
        }
      } else {
        showToast('Server selected in form — enter your username & password and click Save Account.');
      }
    };
  });
}

function renderAll() {
  renderAccounts();
  renderFormSelects();
  renderServers();
}

async function init() {
  const res = await window.robos.getState();
  if (res.ok) state = { ...state, ...res };
  renderAll();
  if (defaultAccount()) {
    await loadAccountIntoForm(defaultAccount().id);
  }

  const pwInput = document.getElementById('acc-password');
  const pwToggle = document.getElementById('btn-toggle-password');
  if (pwInput && pwToggle) {
    pwToggle.onclick = () => {
      const showing = pwInput.type === 'text';
      pwInput.type = showing ? 'password' : 'text';
      pwToggle.textContent = showing ? 'Show' : 'Hide';
      pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    };
  }

  document.getElementById('server-search').oninput = renderServers;

  document.getElementById('btn-save-account').onclick = async () => {
    const providerId = document.getElementById('acc-provider').value || 'ipvanish';
    const label = document.getElementById('acc-label').value.trim();
    const username = document.getElementById('acc-username').value.trim();
    const password = document.getElementById('acc-password').value;
    const defaultProfile = document.getElementById('acc-default-profile').value;
    const protocol = document.getElementById('acc-protocol').value;

    const saved = await window.robos.saveAccount({
      providerId,
      label,
      username,
      password,
      defaultProfile,
      protocol,
      setDefault: true,
    });
    if (!saved.ok) {
      showToast(saved.error || 'Could not save account.', true);
      return;
    }
    if (pwInput && pwToggle) {
      pwInput.type = 'password';
      pwToggle.textContent = 'Show';
    }
    state = { ...state, ...saved };
    renderAll();
    showToast(`Saved ${saved.account.label}.`);
  };

  document.getElementById('btn-sync-servers').onclick = async () => {
    showToast('Refreshing IPVanish server list…');
    const synced = await window.robos.syncProfiles('ipvanish');
    if (synced.ok) {
      state = { ...state, ...synced };
      renderAll();
      showToast(synced.message || 'Servers updated.');
    }
  };

  document.getElementById('btn-import-ovpn').onclick = async () => {
    const providerId = document.getElementById('acc-provider').value || 'ipvanish';
    const imported = await window.robos.importProfile({ providerId });
    if (imported.canceled) return;
    if (!imported.ok) {
      showToast(imported.error || 'Import failed.', true);
      return;
    }
    state = { ...state, ...imported };
    renderAll();
    showToast(`Imported ${imported.profileId}.ovpn`);
  };

  document.getElementById('btn-open-sandbox').onclick = () => {
    window.robos.openVpnSandbox();
  };
}

init();
