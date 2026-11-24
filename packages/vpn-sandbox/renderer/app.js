'use strict';

let state = {
  providers: [],
  accounts: [],
  defaultAccountId: null,
  savedApps: [],
  sessions: [],
  hostNet: { defaultIface: 'eth0', localIp: '—' },
  showNormalIp: false,
  autoFailover: true,
};

function deriveProfileSeriesKey(profile = {}) {
  if (profile.country && profile.city) {
    return `loc:${String(profile.country).trim().toUpperCase()}:${String(profile.city).trim().toLowerCase()}`;
  }
  const raw = String(profile.id || profile.hostname || '').trim().toLowerCase().replace(/\.ovpn$/, '');
  if (!raw) return '';
  const sepMatch = raw.match(/^(.+?)[-_.\s]+[a-z]?\d+$/i);
  if (sepMatch) return `stem:${sepMatch[1]}`;
  const numMatch = raw.match(/^([a-z][a-z0-9-_.\s]*?[a-z])\d+$/i);
  if (numMatch) return `stem:${numMatch[1]}`;
  return `stem:${raw}`;
}

function findNextProfileInLine(profiles = [], currentId = '') {
  if (!profiles.length) return null;
  const idx = profiles.findIndex(p => p.id === currentId);
  if (idx === -1) return profiles[0] || null;
  const cur = profiles[idx];
  const curKey = deriveProfileSeriesKey(cur);
  const curCountry = (cur.country || '').toUpperCase();
  const rotated = [...profiles.slice(idx + 1), ...profiles.slice(0, idx)];
  return (
    rotated.find(p => curKey && deriveProfileSeriesKey(p) === curKey) ||
    rotated.find(p => curCountry && (p.country || '').toUpperCase() === curCountry) ||
    rotated[0] ||
    null
  );
}

function formatProfileLabel(p) {
  if (!p) return '';
  return p.country ? `${p.country} — ${p.city} (${p.hostname})` : p.label;
}

function maskIp(ip) {
  const s = String(ip || '').trim();
  if (!s || s === '—') return '—';
  const m = s.match(/^(\d+)\.\d+\.\d+\.\d+$/);
  if (m) return `${m[1]}.***.***.***`;
  if (s.includes(':')) return `${s.split(':')[0]}:****`;
  return s;
}

function formatNormalIp(ip) {
  return state.showNormalIp ? (ip || '—') : maskIp(ip);
}

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
  document.getElementById('normal-ip-value').textContent = formatNormalIp(state.hostNet?.localIp || '—');
  const toggleBtn = document.getElementById('btn-toggle-normal-ip');
  if (toggleBtn) {
    toggleBtn.textContent = state.showNormalIp ? 'Hide' : 'Show';
  }

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

  const updateNextHint = profiles => {
    const hintEl = document.getElementById('next-server-hint');
    if (!hintEl) return;
    if (!state.autoFailover) {
      hintEl.textContent = 'Auto-failover disabled (stays strictly on selected server).';
      return;
    }
    const nextProf = findNextProfileInLine(profiles, srvSelect.value);
    hintEl.textContent = nextProf && nextProf.id !== srvSelect.value
      ? `Next in line if down: ${formatProfileLabel(nextProf)}`
      : '';
  };

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
      updateNextHint(profiles);
      return;
    }
    srvSelect.dataset.sig = sig;
    srvSelect.innerHTML = profiles
      .map(p => `<option value="${esc(p.id)}"${p.id === currentSrv ? ' selected' : ''}>${esc(formatProfileLabel(p))}</option>`)
      .join('');
    updateNextHint(profiles);
    srvSelect.onchange = () => updateNextHint(profiles);
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
      const isReconnecting = isRunning && s.tunnelState === 'reconnecting';
      const isTunnelDown = isRunning && (s.tunnelState === 'down' || s.tunnelState === 'auth-error');
      const lastFailover = Array.isArray(s.failoverHistory) && s.failoverHistory.length
        ? s.failoverHistory[s.failoverHistory.length - 1]
        : null;
      const statusLabel = !isRunning
        ? 'Stopped'
        : isReconnecting
          ? `VPN down — switching to ${s.failoverTarget || s.nextFailoverServerHost || 'next server'}…`
          : isTunnelDown
            ? 'VPN down (Kill-Switch blocking leaks)'
            : 'Running through VPN';
      const nextText = isRunning && s.autoFailover !== false && s.nextFailoverServerHost
        ? ` · Next if down: ${esc(s.nextFailoverServerHost)}`
        : '';

      return `
        <div class="session-card ${isRunning ? 'running' : ''}" data-session-id="${esc(s.id)}">
          <div class="session-top">
            <div>
              <div class="item-title">
                ${isRunning ? `<span class="status-dot${isReconnecting || isTunnelDown ? ' reconnecting' : ''}"></span>` : ''}
                ${esc(s.executable)} ${esc((s.args || []).join(' '))}
              </div>
              <div class="item-sub">
                ${esc(statusLabel)} · Server: ${esc(s.serverHost)} (${esc(s.accountLabel)})${nextText}
              </div>
              ${
                lastFailover
                  ? `<div class="failover-badge">↻ Auto-switched (${esc(s.failoverCount || 1)}×): ${esc(lastFailover.fromServerHost)} → ${esc(s.serverHost)}</div>`
                  : ''
              }
            </div>
            <div style="display:flex;gap:6px;">
              <button type="button" class="btn" data-verify-session="${esc(s.id)}">Check VPN Traffic</button>
              ${isRunning ? `<button type="button" class="btn" data-failover-session="${esc(s.id)}" title="Switch this running app to the next VPN server in line without restarting it">Next Server ↻</button>` : ''}
              ${isRunning ? `<button type="button" class="btn btn-danger" data-stop-session="${esc(s.id)}">Stop</button>` : ''}
              <button type="button" class="btn btn-danger" data-delete-session="${esc(s.id)}" title="Delete from list">✕</button>
            </div>
          </div>

          <div class="traffic-grid">
            <div class="traffic-box ok">
              <span class="traffic-label">VPN Exit IP (What Websites &amp; Peers See)</span>
              <strong>✓ ${esc(s.vpnExitIp)}</strong> (${esc(s.serverHost)})
            </div>
            <div class="traffic-box ok">
              <span class="traffic-label">Kill-Switch &amp; Auto-Failover Protection</span>
              <strong>🔒 Protected</strong> — Real IP (${esc(formatNormalIp(s.hostNormalIp))}) hidden; ${s.autoFailover !== false ? 'auto-switches to next server if VPN drops' : 'traffic stops if VPN drops'}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  el.querySelectorAll('[data-verify-session]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.verifyVpnTraffic({
        sessionId: btn.dataset.verifySession,
        autoFailover: state.autoFailover,
      });
      if (res.sessions) state.sessions = res.sessions;
      renderSessions();
      showBanner(res.summary || 'VPN connection verified.', !res.ok);
    };
  });

  el.querySelectorAll('[data-failover-session]').forEach(btn => {
    btn.onclick = async () => {
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Switching…';
      showBanner('Switching running sandbox session to the next VPN server in line…');
      const res = await window.robos.failoverSession(btn.dataset.failoverSession, {
        reason: 'Manual switch to next server in line',
      });
      btn.disabled = false;
      btn.textContent = orig;
      if (res.sessions) state.sessions = res.sessions;
      if (res.ok && res.toProfileId) {
        const srvSelect = document.getElementById('select-server');
        if (srvSelect && [...srvSelect.options].some(o => o.value === res.toProfileId)) {
          srvSelect.value = res.toProfileId;
        }
      }
      renderHeaderAndSelectors();
      renderSessions();
      showBanner(
        res.ok
          ? `↻ Switched ${res.fromServerHost} → ${res.toServerHost} (new VPN IP ${res.newExitIp}).`
          : (res.error || 'Could not switch VPN server.'),
        !res.ok
      );
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
  showBanner(`Connecting VPN tunnel and launching ${executable}…`);
  const res = await window.robos.launchSandboxedApp({
    executable,
    args,
    accountId,
    profileId,
    autoFailover: state.autoFailover,
  });
  if (!res.ok) {
    showBanner(res.error || 'Could not launch app.', true);
    return;
  }
  state.sessions = res.sessions || [];
  if (res.session?.profileId && res.session.profileId !== profileId) {
    const srvSelect = document.getElementById('select-server');
    if (srvSelect && [...srvSelect.options].some(o => o.value === res.session.profileId)) {
      srvSelect.value = res.session.profileId;
    }
  }
  renderHeaderAndSelectors();
  renderSessions();
  if (res.session?.failoverCount > 0 && res.session.failoverHistory?.length) {
    const last = res.session.failoverHistory[res.session.failoverHistory.length - 1];
    showBanner(
      `↻ ${last.fromServerHost} was down — automatically switched to next server ${res.session.serverHost} (✓ ${res.session.vpnExitIp}) and launched ${executable}.`
    );
    return;
  }
  showBanner(res.verification?.summary || `Launched ${executable} via VPN (${res.session.vpnExitIp}).`);
}

async function init() {
  const initial = await window.robos.getInitialState();
  if (initial.ok) state = { ...state, ...initial };

  const autoFailoverToggle = document.getElementById('toggle-auto-failover');
  if (autoFailoverToggle) {
    autoFailoverToggle.checked = state.autoFailover;
    autoFailoverToggle.onchange = async () => {
      state.autoFailover = autoFailoverToggle.checked;
      for (const s of state.sessions || []) {
        if (s.status === 'running' && typeof window.robos.setSessionAutoFailover === 'function') {
          await window.robos.setSessionAutoFailover(s.id, state.autoFailover);
        }
      }
      renderHeaderAndSelectors();
      renderSessions();
    };
  }

  if (typeof window.robos.onFailover === 'function') {
    window.robos.onFailover(async ev => {
      const fresh = await window.robos.getInitialState();
      if (fresh.ok) {
        state.sessions = fresh.sessions;
        if (ev?.toProfileId) {
          const srvSelect = document.getElementById('select-server');
          if (srvSelect && [...srvSelect.options].some(o => o.value === ev.toProfileId)) {
            srvSelect.value = ev.toProfileId;
          }
        }
        renderHeaderAndSelectors();
        renderSessions();
      }
      if (ev?.phase === 'runtime') {
        showBanner(
          `↻ VPN ${ev.fromServerHost} went down — automatically switched ${ev.executable || 'sandbox'} to next server ${ev.toServerHost} (new VPN IP ${ev.newExitIp}).`
        );
      }
    });
  }

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
    const res = await window.robos.saveAppProfile({
      name,
      executable,
      args,
      accountId,
      profileId,
      autoFailover: state.autoFailover,
    });
    if (!res.ok) {
      showBanner(res.error || 'Could not save app.', true);
      return;
    }
    state.savedApps = res.apps;
    renderSavedApps();
    showBanner(`Saved "${res.profile.name}" to your app list.`);
  };

  document.getElementById('btn-check-vpn').onclick = async () => {
    const checkBtn = document.getElementById('btn-check-vpn');
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;
    const orig = checkBtn.textContent;
    checkBtn.disabled = true;
    checkBtn.textContent = 'Testing VPN…';
    const res = await window.robos.verifyVpnTraffic({
      accountId,
      profileId,
      autoFailover: state.autoFailover,
    });
    checkBtn.disabled = false;
    checkBtn.textContent = orig;
    if (res.failoverOccurred && res.profileId) {
      const srvSelect = document.getElementById('select-server');
      if (srvSelect && [...srvSelect.options].some(o => o.value === res.profileId)) {
        srvSelect.value = res.profileId;
        renderHeaderAndSelectors();
      }
    }
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
        `✓ Kill-Switch Proven (${res.mode}): Before drop VPN IP=${res.vpnExitIpBeforeDrop}; after killing OpenVPN (tun0 down), all 4 egress probes were blocked by kernel (${res.droppedPacketsInKernel} pkts dropped) and 0 bytes leaked to ${formatNormalIp(res.normalPublicIp)}.`
      );
    };
  }

  const toggleNormalIpBtn = document.getElementById('btn-toggle-normal-ip');
  if (toggleNormalIpBtn) {
    toggleNormalIpBtn.onclick = () => {
      state.showNormalIp = !state.showNormalIp;
      renderHeaderAndSelectors();
      renderSessions();
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
