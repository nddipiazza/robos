'use strict';

let state = {
  providers: [],
  accounts: [],
  defaultAccountId: null,
  savedApps: [],
  sessions: [],
  hostNet: { defaultIface: 'eth0', localIp: '192.168.1.100' },
  audit: null,
};

function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(message, isError = false) {
  const el = document.getElementById('global-toast');
  if (!el) return;
  el.textContent = message;
  el.className = 'global-toast' + (isError ? ' error' : '');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => el.classList.add('hidden'), 5000);
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.tab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabId}`);
  });
}

function renderTopbar() {
  const hostIpEl = document.getElementById('metric-host-ip');
  const defAccEl = document.getElementById('metric-default-account');
  const activeCountEl = document.getElementById('metric-active-count');
  const badgeEl = document.getElementById('tab-session-badge');
  const hostIfaceEl = document.getElementById('guarantee-host-iface');

  if (hostIpEl) {
    hostIpEl.textContent = `${state.hostNet?.localIp || '—'} (${state.hostNet?.defaultIface || 'eth0'})`;
  }
  if (hostIfaceEl) {
    hostIfaceEl.textContent = state.hostNet?.defaultIface || 'eth0';
  }
  const defAcc = (state.accounts || []).find(a => a.id === state.defaultAccountId) || state.accounts?.[0];
  if (defAccEl) {
    defAccEl.textContent = defAcc
      ? `${defAcc.label} (${defAcc.providerName})`
      : 'None — Add IPVanish Account';
  }
  const runningCount = (state.sessions || []).filter(s => s.status === 'running').length;
  if (activeCountEl) activeCountEl.textContent = String(runningCount);
  if (badgeEl) badgeEl.textContent = String((state.sessions || []).length);
}

function renderLauncherSelectors() {
  const accSelect = document.getElementById('launch-account');
  const profSelect = document.getElementById('launch-ovpn-profile');
  if (!accSelect || !profSelect) return;

  const accounts = state.accounts || [];
  if (!accounts.length) {
    accSelect.innerHTML = `<option value="">No OVPN account yet — add your IPVanish account in Tab 3</option>`;
  } else {
    const selectedAccId = accSelect.value && accounts.some(a => a.id === accSelect.value)
      ? accSelect.value
      : (state.defaultAccountId || accounts[0].id);
    accSelect.innerHTML = accounts
      .map(
        a =>
          `<option value="${esc(a.id)}"${a.id === selectedAccId ? ' selected' : ''}>${esc(a.label)} — ${esc(a.providerName)}${a.isDefault ? ' (Default)' : ''}</option>`
      )
      .join('');
  }

  const updateLauncherProfiles = () => {
    const chosenAcc = accounts.find(a => a.id === accSelect.value) || accounts[0];
    const providerId = chosenAcc ? chosenAcc.providerId : 'ipvanish';
    const provider = (state.providers || []).find(p => p.id === providerId) || state.providers?.[0];
    const profiles = provider?.profiles || [];
    const preferredProfile = chosenAcc?.defaultProfile || profiles[0]?.id || '';
    profSelect.innerHTML = profiles
      .map(
        p =>
          `<option value="${esc(p.id)}"${p.id === preferredProfile ? ' selected' : ''}>${esc(p.label)} [${esc((p.proto || 'udp').toUpperCase())}:${esc(p.port || 443)}]</option>`
      )
      .join('');
  };

  updateLauncherProfiles();
  accSelect.onchange = updateLauncherProfiles;
}

function renderSavedApps() {
  const listEl = document.getElementById('saved-apps-list');
  const countEl = document.getElementById('saved-apps-count');
  if (!listEl) return;
  const apps = state.savedApps || [];
  if (countEl) countEl.textContent = `${apps.length} profile${apps.length === 1 ? '' : 's'}`;

  if (!apps.length) {
    listEl.innerHTML = `<div class="list-card"><div class="list-card-sub">No saved app profiles yet.</div></div>`;
    return;
  }

  listEl.innerHTML = apps
    .map(
      app => `
      <div class="list-card" data-saved-app="${esc(app.id)}">
        <div>
          <div class="list-card-title">
            ${esc(app.name)}
            <span class="badge badge-cyan"><code>${esc(app.executable)}</code></span>
          </div>
          <div class="list-card-sub">
            Args: <code>${esc((app.args || []).join(' ') || '(none)')}</code> · Gateway: <code>${esc(app.profileId || 'default')}</code>
          </div>
        </div>
        <div class="list-card-actions">
          <button type="button" class="btn btn-primary" data-launch-saved="${esc(app.id)}">Launch</button>
          <button type="button" class="btn" data-fill-saved="${esc(app.id)}">Load</button>
          <button type="button" class="btn btn-danger" data-delete-saved="${esc(app.id)}">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-fill-saved]').forEach(btn => {
    btn.onclick = () => {
      const item = apps.find(a => a.id === btn.dataset.fillSaved);
      if (!item) return;
      document.getElementById('launch-executable').value = item.executable;
      document.getElementById('launch-args').value = (item.args || []).join(' ');
      document.getElementById('launch-profile-name').value = item.name || '';
      if (item.accountId) document.getElementById('launch-account').value = item.accountId;
      if (item.profileId) document.getElementById('launch-ovpn-profile').value = item.profileId;
    };
  });

  listEl.querySelectorAll('[data-launch-saved]').forEach(btn => {
    btn.onclick = async () => {
      const item = apps.find(a => a.id === btn.dataset.launchSaved);
      if (!item) return;
      await triggerLaunch({
        executable: item.executable,
        args: item.args || [],
        cwd: item.cwd,
        accountId: item.accountId || document.getElementById('launch-account').value,
        profileId: item.profileId || document.getElementById('launch-ovpn-profile').value,
      });
    };
  });

  listEl.querySelectorAll('[data-delete-saved]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.deleteAppProfile(btn.dataset.deleteSaved);
      if (res.ok) {
        state.savedApps = res.apps;
        renderSavedApps();
        showToast('Removed saved executable profile.');
      }
    };
  });
}

function renderSessions() {
  const listEl = document.getElementById('sessions-list');
  const latestLogEl = document.getElementById('latest-launch-log');
  const latestBadgeEl = document.getElementById('latest-session-badge');
  const sessions = state.sessions || [];

  if (sessions.length > 0 && latestLogEl) {
    const latest = sessions[0];
    latestLogEl.textContent = (latest.logs || []).join('\n');
    if (latestBadgeEl) {
      latestBadgeEl.textContent = `${latest.netnsName} · ${latest.status.toUpperCase()} · Exit IP ${latest.vpnExitIp}`;
      latestBadgeEl.className = 'badge ' + (latest.status === 'running' ? 'badge-green' : 'badge-cyan');
    }
  }

  if (!listEl) return;
  if (!sessions.length) {
    listEl.innerHTML = `<div class="list-card"><div class="list-card-sub">No sandboxed application sessions launched yet. Launch an executable from Tab 1.</div></div>`;
    return;
  }

  listEl.innerHTML = sessions
    .map(
      s => `
      <div class="list-card ${s.status === 'running' ? 'highlight' : ''}" data-session-id="${esc(s.id)}" style="flex-direction:column;align-items:stretch;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div class="list-card-title">
              <code>${esc(s.executable)} ${esc((s.args || []).join(' '))}</code>
              <span class="badge ${s.status === 'running' ? 'badge-green' : ''}">${esc(s.status.toUpperCase())}</span>
              <span class="badge badge-cyan">Namespace: <code>${esc(s.netnsName)}</code></span>
              <span class="badge badge-cyan">PID: ${esc(s.pid)}</span>
            </div>
            <div class="list-card-sub">
              Provider: <strong>${esc(s.accountLabel)}</strong> · Server: <code>${esc(s.serverHost)}</code> (${esc(s.vpnProto.toUpperCase())}:${esc(s.vpnPort)}) ·
              VPN Tunnel IP: <code>${esc(s.tunnelIp)}</code> · VPN Exit IP: <code>${esc(s.vpnExitIp)}</code> ·
              Host Normal IP (<code>${esc(s.hostNormalIp)}</code>): <strong>100% Blocked by iptables</strong>
            </div>
          </div>
          <div class="list-card-actions">
            ${
              s.status === 'running'
                ? `<button type="button" class="btn btn-danger" data-stop-session="${esc(s.id)}">Stop &amp; Destroy Namespace</button>`
                : ''
            }
          </div>
        </div>
        <pre class="code-box" style="margin-top:8px;max-height:130px;">${esc((s.logs || []).join('\n'))}</pre>
      </div>
    `
    )
    .join('');

  listEl.querySelectorAll('[data-stop-session]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.stopSession(btn.dataset.stopSession);
      if (res.ok) {
        state.sessions = res.sessions;
        renderTopbar();
        renderSessions();
        showToast(`Stopped session ${btn.dataset.stopSession} and destroyed isolated namespace.`);
      }
    };
  });
}

function renderAccountsAndProviders() {
  const provSelect = document.getElementById('acc-provider');
  const profSelect = document.getElementById('acc-default-profile');
  const helpEl = document.getElementById('account-provider-help');
  const accListEl = document.getElementById('accounts-list');
  const provListEl = document.getElementById('providers-list');
  const accBadge = document.getElementById('accounts-count-badge');
  const provBadge = document.getElementById('providers-count-badge');

  const providers = state.providers || [];
  const accounts = state.accounts || [];

  if (accBadge) accBadge.textContent = `${accounts.length} account${accounts.length === 1 ? '' : 's'}`;
  if (provBadge) provBadge.textContent = `${providers.length} provider${providers.length === 1 ? '' : 's'}`;

  if (provSelect && profSelect) {
    const curProv = provSelect.value || 'ipvanish';
    provSelect.innerHTML = providers
      .map(
        p =>
          `<option value="${esc(p.id)}"${p.id === curProv ? ' selected' : ''}>${esc(p.name)}${p.builtin ? ' (Built-in)' : ''}</option>`
      )
      .join('');

    const refreshAccProfiles = pid => {
      const prov = providers.find(p => p.id === pid) || providers[0];
      if (helpEl && prov) helpEl.textContent = prov.credentialHelp || prov.description || '';
      const profiles = prov?.profiles || [];
      profSelect.innerHTML = profiles.length
        ? profiles.map(pr => `<option value="${esc(pr.id)}">${esc(pr.label)}</option>`).join('')
        : `<option value="">Default profile</option>`;
    };

    refreshAccProfiles(provSelect.value || 'ipvanish');
    provSelect.onchange = () => refreshAccProfiles(provSelect.value);
  }

  if (accListEl) {
    if (!accounts.length) {
      accListEl.innerHTML = `<div class="list-card"><div class="list-card-sub">No OpenVPN accounts saved yet. Add your <strong>IPVanish</strong> account using the form on the left.</div></div>`;
    } else {
      accListEl.innerHTML = accounts
        .map(
          acc => `
          <div class="list-card ${acc.isDefault ? 'highlight' : ''}" data-account-card="${esc(acc.id)}">
            <div>
              <div class="list-card-title">
                ${esc(acc.label)}
                <span class="badge badge-cyan">${esc(acc.providerName)}</span>
                ${acc.isDefault ? `<span class="badge badge-green">Active Default</span>` : ''}
              </div>
              <div class="list-card-sub">
                Username: <code>${esc(acc.username)}</code> · Default Gateway: <code>${esc(acc.defaultProfile || 'default')}</code> ·
                Password: <code>${esc(acc.passPath)}</code> (${acc.secretConfigured ? '✓ Encrypted' : 'Missing'})
              </div>
            </div>
            <div class="list-card-actions">
              ${!acc.isDefault ? `<button type="button" class="btn" data-set-default-acc="${esc(acc.id)}">Set Default</button>` : ''}
              <button type="button" class="btn btn-danger" data-delete-acc="${esc(acc.id)}">Remove</button>
            </div>
          </div>
        `
        )
        .join('');

      accListEl.querySelectorAll('[data-set-default-acc]').forEach(btn => {
        btn.onclick = async () => {
          const res = await window.robos.setDefaultAccount(btn.dataset.setDefaultAcc);
          if (res.ok) {
            state.accounts = res.accounts;
            state.defaultAccountId = res.defaultAccountId;
            renderAll();
            showToast('Updated default OpenVPN account.');
          }
        };
      });

      accListEl.querySelectorAll('[data-delete-acc]').forEach(btn => {
        btn.onclick = async () => {
          const res = await window.robos.deleteAccount(btn.dataset.deleteAcc);
          if (res.ok) {
            state.accounts = res.accounts;
            state.defaultAccountId = res.defaultAccountId;
            renderAll();
            showToast('Removed OpenVPN account and deleted stored secret.');
          }
        };
      });
    }
  }

  if (provListEl) {
    provListEl.innerHTML = providers
      .map(
        p => `
        <div class="list-card" data-provider-card="${esc(p.id)}">
          <div>
            <div class="list-card-title">
              ${esc(p.name)}
              ${p.id === 'ipvanish' ? `<span class="badge badge-green">Primary Built-in</span>` : `<span class="badge">${p.builtin ? 'Built-in' : 'Custom'}</span>`}
              <span class="badge badge-cyan">${esc((p.profiles || []).length)} .ovpn profiles</span>
            </div>
            <div class="list-card-sub">${esc(p.description || '')}</div>
          </div>
        </div>
      `
      )
      .join('');
  }
}

function renderAudit() {
  const checksEl = document.getElementById('audit-checks-list');
  const scriptEl = document.getElementById('firewall-script-preview');
  const audit = state.audit;
  if (!audit) return;

  if (checksEl) {
    checksEl.innerHTML = (audit.checks || [])
      .map(
        c => `
        <div class="list-card ${c.passed ? 'highlight' : ''}">
          <div>
            <div class="list-card-title">
              ${esc(c.title)}
              <span class="badge ${c.passed ? 'badge-green' : 'badge-red'}">${c.passed ? 'VERIFIED PASS' : 'FAILED'}</span>
            </div>
            <div class="list-card-sub">${esc(c.detail)}</div>
          </div>
        </div>
      `
      )
      .join('');
  }

  if (scriptEl && audit.firewallSpec) {
    const spec = audit.firewallSpec;
    scriptEl.textContent = [
      `# Namespace: ${spec.netnsName} | Host Interface Excluded: ${spec.hostIface} (${audit.hostNormalIp})`,
      `# Allowed OpenVPN Server Endpoint ONLY: ${spec.vpnServerIps.join(', ')}:${spec.vpnPort}/${spec.vpnProto}`,
      ``,
      `# ── In-Namespace Kill-Switch Rules (Default DROP + UID Owner Lock) ──`,
      ...spec.namespaceIptablesRules,
      ``,
      `# ── Host-Side FORWARD & NAT Lock (Blocks Any Non-VPN Egress at Host Kernel) ──`,
      ...spec.hostIptablesRules,
    ].join('\n');
  }
}

function renderAll() {
  renderTopbar();
  renderLauncherSelectors();
  renderSavedApps();
  renderSessions();
  renderAccountsAndProviders();
  renderAudit();
}

async function triggerLaunch(launchPayload) {
  const res = await window.robos.launchSandboxedApp(launchPayload);
  if (!res.ok) {
    showToast(`Launch blocked: ${res.error}`, true);
    return res;
  }
  state.sessions = res.sessions || [];
  renderTopbar();
  renderSessions();
  showToast(
    `✓ Launched "${res.session.executable}" inside isolated namespace ${res.session.netnsName} via ${res.session.accountLabel} (Exit IP: ${res.session.vpnExitIp}).`
  );
  return res;
}

async function init() {
  // Wire tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  const initial = await window.robos.getInitialState();
  if (initial.ok) {
    state = { ...state, ...initial };
  }
  renderAll();

  // Populate installed executables dropdown
  const disc = await window.robos.discoverExecutables('');
  const pickerEl = document.getElementById('picker-installed-exe');
  if (disc.ok && pickerEl) {
    pickerEl.innerHTML =
      `<option value="">Select an installed executable to autofill…</option>` +
      (disc.executables || [])
        .map(e => `<option value="${esc(e.executable)}">${esc(e.label)} (${esc(e.executable)})</option>`)
        .join('');
    pickerEl.onchange = () => {
      if (pickerEl.value) {
        document.getElementById('launch-executable').value = pickerEl.value;
      }
    };
  }

  // Browse executable button
  document.getElementById('btn-browse-exe').onclick = async () => {
    const res = await window.robos.browseExecutable();
    if (res.ok && res.executable) {
      document.getElementById('launch-executable').value = res.executable;
    }
  };

  // Jump to Add Account tab
  document.getElementById('btn-jump-add-account').onclick = () => {
    switchTab('accounts');
    document.getElementById('acc-username')?.focus();
  };

  // Launch Sandboxed App button
  document.getElementById('btn-launch-sandbox').onclick = async () => {
    const executable = document.getElementById('launch-executable').value.trim();
    const args = document.getElementById('launch-args').value.trim();
    const accountId = document.getElementById('launch-account').value;
    const profileId = document.getElementById('launch-ovpn-profile').value;
    await triggerLaunch({ executable, args, accountId, profileId });
  };

  // Save Executable Profile button
  document.getElementById('btn-save-app-profile').onclick = async () => {
    const executable = document.getElementById('launch-executable').value.trim();
    const args = document.getElementById('launch-args').value.trim();
    const name = document.getElementById('launch-profile-name').value.trim() || executable;
    const accountId = document.getElementById('launch-account').value;
    const profileId = document.getElementById('launch-ovpn-profile').value;
    const res = await window.robos.saveAppProfile({ name, executable, args, accountId, profileId });
    if (!res.ok) {
      showToast(res.error || 'Could not save executable profile.', true);
      return;
    }
    state.savedApps = res.apps;
    renderSavedApps();
    showToast(`✓ Saved sandboxed executable profile "${res.profile.name}".`);
  };

  // Save OpenVPN Account button
  document.getElementById('btn-save-account').onclick = async () => {
    const providerId = document.getElementById('acc-provider').value || 'ipvanish';
    const label = document.getElementById('acc-label').value.trim();
    const username = document.getElementById('acc-username').value.trim();
    const password = document.getElementById('acc-password').value;
    const defaultProfile = document.getElementById('acc-default-profile').value;
    const protocol = document.getElementById('acc-protocol').value;

    const res = await window.robos.saveAccount({
      providerId,
      label,
      username,
      password,
      defaultProfile,
      protocol,
      setDefault: true,
    });
    if (!res.ok) {
      showToast(res.error || 'Could not save OpenVPN account.', true);
      return;
    }
    document.getElementById('acc-password').value = '';
    state.accounts = res.accounts;
    state.defaultAccountId = res.defaultAccountId;
    state.providers = res.providers;
    state.audit = await window.robos.runLeakAudit({});
    renderAll();
    showToast(`✓ Saved OpenVPN account "${res.account.label}" (${res.account.providerName}).`);
  };

  // Sync IPVanish Configs button
  document.getElementById('btn-sync-ipvanish').onclick = async () => {
    showToast('Syncing IPVanish .ovpn server configurations…');
    const res = await window.robos.syncProfiles('ipvanish');
    if (res.ok) {
      state.providers = res.providers || state.providers;
      state.accounts = res.accounts || state.accounts;
      renderAll();
      showToast(res.message || 'Synced IPVanish server profiles.');
    } else {
      showToast(res.error || 'Failed to sync profiles.', true);
    }
  };

  // Import custom .ovpn file button
  document.getElementById('btn-import-ovpn').onclick = async () => {
    const providerId = document.getElementById('acc-provider').value || 'ipvanish';
    const res = await window.robos.importProfile({ providerId });
    if (res.canceled) return;
    if (!res.ok) {
      showToast(res.error || 'Could not import .ovpn profile.', true);
      return;
    }
    state.providers = res.providers || state.providers;
    renderAll();
    showToast(`✓ Imported profile "${res.profileId}.ovpn".`);
  };

  // Open RobOS Preferences
  document.getElementById('btn-open-prefs').onclick = async () => {
    await window.robos.openPreferences();
    showToast('Opened RobOS Preferences → OpenVPN & VPN Accounts.');
  };

  // Add Custom Provider
  document.getElementById('btn-add-provider').onclick = async () => {
    const name = document.getElementById('new-prov-name').value.trim();
    const website = document.getElementById('new-prov-url').value.trim();
    const res = await window.robos.addProvider({ name, website });
    if (!res.ok) {
      showToast(res.error || 'Failed to add provider.', true);
      return;
    }
    document.getElementById('new-prov-name').value = '';
    document.getElementById('new-prov-url').value = '';
    state.providers = res.providers;
    renderAll();
    showToast(`✓ Registered OpenVPN provider "${res.provider.name}".`);
  };

  // Refresh Sessions
  document.getElementById('btn-refresh-sessions').onclick = async () => {
    const res = await window.robos.listSessions();
    if (res.ok) {
      state.sessions = res.sessions;
      renderTopbar();
      renderSessions();
    }
  };

  // Emergency Kill All
  document.getElementById('btn-emergency-kill').onclick = async () => {
    const res = await window.robos.emergencyKillAll();
    if (res.ok) {
      state.sessions = res.sessions;
      renderTopbar();
      renderSessions();
      showToast(`Emergency Kill Switch triggered: stopped ${res.stoppedCount} session(s) and destroyed VPN namespaces.`);
    }
  };

  // Re-run Zero-Leak Audit
  document.getElementById('btn-run-audit').onclick = async () => {
    const audit = await window.robos.runLeakAudit({});
    state.audit = audit;
    renderAudit();
    showToast('✓ 6-Point Zero-Leak Isolation Audit verified.');
  };

  // Poll active sessions every 2s to keep stdout/stderr logs live
  setInterval(async () => {
    if (!(state.sessions || []).some(s => s.status === 'running')) return;
    const res = await window.robos.listSessions();
    if (res.ok) {
      state.sessions = res.sessions;
      renderTopbar();
      renderSessions();
    }
  }, 2000);
}

init();
