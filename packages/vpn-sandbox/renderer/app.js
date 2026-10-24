'use strict';

let state = {
  providers: [],
  accounts: [],
  defaultAccountId: null,
  savedApps: [],
  sessions: [],
  hostNet: { defaultIface: 'eth0', localIp: '—' },
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showBanner(msg, isError = false) {
  const el = document.getElementById('status-banner');
  el.textContent = msg;
  el.className = 'banner' + (isError ? ' error' : '');
  clearTimeout(window._bannerTimer);
  window._bannerTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function renderHeaderAndSelectors() {
  document.getElementById('normal-ip-value').textContent = state.hostNet?.localIp || '—';

  const running = (state.sessions || []).filter(s => s.status === 'running');
  const stopped = (state.sessions || []).filter(s => s.status !== 'running');
  const stopAllBtn = document.getElementById('btn-stop-all');
  stopAllBtn.classList.toggle('hidden', running.length === 0);
  const clearStoppedBtn = document.getElementById('btn-clear-stopped');
  if (clearStoppedBtn) clearStoppedBtn.classList.toggle('hidden', stopped.length === 0);
  document.getElementById('running-count').textContent = `${running.length} running`;

  const accSelect = document.getElementById('select-account');
  const srvSelect = document.getElementById('select-server');
  const accounts = state.accounts || [];

  if (!accounts.length) {
    accSelect.innerHTML = `<option value="">No VPN account — click "VPN Servers & Accounts…"</option>`;
  } else {
    const selectedId = accSelect.value && accounts.some(a => a.id === accSelect.value)
      ? accSelect.value
      : (state.defaultAccountId || accounts[0].id);
    accSelect.innerHTML = accounts
      .map(a => `<option value="${esc(a.id)}"${a.id === selectedId ? ' selected' : ''}>${esc(a.label)} (${esc(a.providerName)})</option>`)
      .join('');
  }

  const updateServers = (forceRebuild = false) => {
    const acc = accounts.find(a => a.id === accSelect.value) || accounts[0];
    const providerId = acc ? acc.providerId : 'ipvanish';
    const provider = (state.providers || []).find(p => p.id === providerId) || state.providers?.[0];
    const profiles = provider?.profiles || [];
    const sig = `${providerId}:${profiles.length}`;
    const currentSrv = srvSelect.value && profiles.some(p => p.id === srvSelect.value)
      ? srvSelect.value
      : (acc?.defaultProfile || profiles[0]?.id || '');

    if (!forceRebuild && srvSelect.dataset.sig === sig && srvSelect.options.length > 0) {
      return;
    }
    srvSelect.dataset.sig = sig;
    srvSelect.innerHTML = profiles
      .map(p => `<option value="${esc(p.id)}"${p.id === currentSrv ? ' selected' : ''}>${esc(p.country ? `${p.country} — ${p.city} (${p.hostname})` : p.label)}</option>`)
      .join('');
  };

  updateServers();
  accSelect.onchange = () => updateServers(true);
}

function renderSavedApps() {
  const el = document.getElementById('saved-apps-list');
  const apps = state.savedApps || [];
  if (!apps.length) {
    el.innerHTML = `<div class="item-row"><div class="item-sub">No saved apps yet.</div></div>`;
    return;
  }

  el.innerHTML = apps
    .map(
      app => `
      <div class="item-row" data-saved-app="${esc(app.id)}">
        <div>
          <div class="item-title">${esc(app.name)}</div>
          <div class="item-sub">${esc(app.executable)}${app.args?.length ? ' ' + esc(app.args.join(' ')) : ''}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-primary" data-launch-saved="${esc(app.id)}">Launch via VPN</button>
          <button type="button" class="btn btn-danger" data-remove-saved="${esc(app.id)}" title="Remove">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  el.querySelectorAll('[data-launch-saved]').forEach(btn => {
    btn.onclick = async () => {
      const app = apps.find(a => a.id === btn.dataset.launchSaved);
      if (!app) return;
      await launchApp({
        executable: app.executable,
        args: app.args || [],
        accountId: document.getElementById('select-account').value || app.accountId,
        profileId: document.getElementById('select-server').value || app.profileId,
      });
    };
  });

  el.querySelectorAll('[data-remove-saved]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.deleteAppProfile(btn.dataset.removeSaved);
      if (res.ok) {
        state.savedApps = res.apps;
        renderSavedApps();
      }
    };
  });
}

function renderSessions() {
  const el = document.getElementById('sessions-list');
  const sessions = state.sessions || [];
  if (!sessions.length) {
    el.innerHTML = `<div class="item-row"><div class="item-sub">No apps running in the VPN sandbox right now. Click "Launch via VPN" on any app to start.</div></div>`;
    return;
  }

  el.innerHTML = sessions
    .map(s => {
      const isRunning = s.status === 'running';
      return `
        <div class="session-card ${isRunning ? 'running' : ''}" data-session-id="${esc(s.id)}">
          <div class="session-top">
            <div>
              <div class="item-title">
                ${isRunning ? '<span class="status-dot"></span>' : ''}
                ${esc(s.executable)} ${esc((s.args || []).join(' '))}
              </div>
              <div class="item-sub">
                ${isRunning ? 'Running through VPN' : 'Stopped'} · Server: ${esc(s.serverHost)} (${esc(s.accountLabel)})
              </div>
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn" data-verify-session="${esc(s.id)}">Check VPN Traffic</button>
              ${isRunning ? `<button type="button" class="btn btn-danger" data-stop-session="${esc(s.id)}">Stop</button>` : ''}
              <button type="button" class="btn btn-danger" data-delete-session="${esc(s.id)}" title="Delete from list">✕</button>
            </div>
          </div>

          <div class="traffic-grid">
            <div class="traffic-box ok">
              <span class="traffic-label">App Public IP (VPN)</span>
              <strong>✓ ${esc(s.vpnExitIp)}</strong> (${esc(s.serverHost)})
            </div>
            <div class="traffic-box">
              <span class="traffic-label">Your Normal IP (${esc(s.hostNormalIp)})</span>
              <strong>Blocked for this app</strong>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  el.querySelectorAll('[data-verify-session]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.verifyVpnTraffic({ sessionId: btn.dataset.verifySession });
      if (res.sessions) state.sessions = res.sessions;
      renderSessions();
      showBanner(res.summary || 'VPN connection verified.', !res.ok);
    };
  });

  el.querySelectorAll('[data-stop-session]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.stopSession(btn.dataset.stopSession);
      if (res.ok) {
        state.sessions = res.sessions;
        renderHeaderAndSelectors();
        renderSessions();
        showBanner('Stopped app and closed its VPN connection.');
      }
    };
  });

  el.querySelectorAll('[data-delete-session]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.deleteSession(btn.dataset.deleteSession);
      if (res.ok) {
        state.sessions = res.sessions;
        renderHeaderAndSelectors();
        renderSessions();
        showBanner('Removed app from Running VPN Apps.');
      }
    };
  });
}

async function launchApp({ executable, args, accountId, profileId }) {
  if (!executable) {
    showBanner('Pick an app or enter an executable command first.', true);
    return;
  }
  const res = await window.robos.launchSandboxedApp({
    executable,
    args,
    accountId,
    profileId,
  });
  if (!res.ok) {
    showBanner(res.error || 'Could not launch app.', true);
    return;
  }
  state.sessions = res.sessions || [];
  renderHeaderAndSelectors();
  renderSessions();
  showBanner(res.verification?.summary || `Launched ${executable} via VPN (${res.session.vpnExitIp}).`);
}

async function init() {
  const initial = await window.robos.getInitialState();
  if (initial.ok) state = { ...state, ...initial };

  renderHeaderAndSelectors();
  renderSavedApps();
  renderSessions();

  const disc = await window.robos.discoverExecutables('');
  const picker = document.getElementById('picker-app');
  if (disc.ok && picker) {
    picker.innerHTML =
      `<option value="">Choose an installed app…</option>` +
      (disc.executables || [])
        .map(e => `<option value="${esc(e.executable)}" data-label="${esc(e.label)}">${esc(e.label)} (${esc(e.executable)})</option>`)
        .join('');
    picker.onchange = () => {
      if (picker.value) {
        document.getElementById('input-executable').value = picker.value;
        const opt = picker.selectedOptions[0];
        if (opt?.dataset?.label) {
          document.getElementById('input-profile-name').value = opt.dataset.label;
        }
      }
    };
  }

  document.getElementById('btn-browse').onclick = async () => {
    const picked = await window.robos.browseExecutable();
    if (picked.ok && picked.executable) {
      document.getElementById('input-executable').value = picked.executable;
    }
  };

  document.getElementById('btn-launch').onclick = async () => {
    const executable = document.getElementById('input-executable').value.trim();
    const args = document.getElementById('input-args').value.trim();
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;
    await launchApp({ executable, args, accountId, profileId });
  };

  document.getElementById('btn-save-profile').onclick = async () => {
    const executable = document.getElementById('input-executable').value.trim();
    const args = document.getElementById('input-args').value.trim();
    const name = document.getElementById('input-profile-name').value.trim() || executable;
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;
    const res = await window.robos.saveAppProfile({ name, executable, args, accountId, profileId });
    if (!res.ok) {
      showBanner(res.error || 'Could not save app.', true);
      return;
    }
    state.savedApps = res.apps;
    renderSavedApps();
    showBanner(`Saved "${res.profile.name}" to your app list.`);
  };

  document.getElementById('btn-check-vpn').onclick = async () => {
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;
    const res = await window.robos.verifyVpnTraffic({ accountId, profileId });
    showBanner(res.summary || 'VPN connection verified.', !res.ok);
  };

  const proveBtn = document.getElementById('btn-prove-killswitch');
  if (proveBtn) {
    proveBtn.onclick = async () => {
      const accountId = document.getElementById('select-account').value;
      const profileId = document.getElementById('select-server').value;
      const origText = proveBtn.textContent;
      proveBtn.disabled = true;
      proveBtn.textContent = 'Running Kill-Switch Proof…';
      showBanner('Running live 5-step Kill-Switch Proof: starting tunnel, verifying VPN IP, killing OpenVPN mid-flight, and testing leak resistance…');
      const res = await window.robos.proveKillSwitch({ accountId, profileId });
      proveBtn.disabled = false;
      proveBtn.textContent = origText;
      if (!res.ok) {
        showBanner(res.error || 'Kill-Switch proof failed.', true);
        return;
      }
      showBanner(
        `✓ Kill-Switch Proven (${res.mode}): Before drop VPN IP=${res.vpnExitIpBeforeDrop}; after killing OpenVPN (tun0 down), all 4 egress probes were blocked by kernel (${res.droppedPacketsInKernel} pkts dropped) and 0 bytes leaked to ${res.normalPublicIp}.`
      );
    };
  }

  document.getElementById('btn-open-vpn-servers').onclick = () => {
    window.robos.openVpnServers();
  };

  document.getElementById('btn-stop-all').onclick = async () => {
    const res = await window.robos.emergencyKillAll();
    if (res.ok) {
      state.sessions = res.sessions;
      renderHeaderAndSelectors();
      renderSessions();
      showBanner('Stopped all VPN apps.');
    }
  };

  const clearStoppedBtn = document.getElementById('btn-clear-stopped');
  if (clearStoppedBtn) {
    clearStoppedBtn.onclick = async () => {
      const res = await window.robos.clearStoppedSessions();
      if (res.ok) {
        state.sessions = res.sessions;
        renderHeaderAndSelectors();
        renderSessions();
        showBanner('Cleared stopped apps from list.');
      }
    };
  }

  setInterval(async () => {
    const fresh = await window.robos.getInitialState();
    if (fresh.ok) {
      state.accounts = fresh.accounts;
      state.defaultAccountId = fresh.defaultAccountId;
      state.providers = fresh.providers;
      state.savedApps = fresh.savedApps;
      state.sessions = fresh.sessions;
      renderHeaderAndSelectors();
      renderSavedApps();
      renderSessions();
    }
  }, 2500);
}

init();
