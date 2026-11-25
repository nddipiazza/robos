'use strict';

let state = {
  providers: [],
  accounts: [],
  defaultAccountId: null,
  savedApps: [],
  sessions: [],
  guardedApps: [],
  guardEvents: [],
  service: {},
  qbittorrentInstalled: false,
  qbittorrentBin: null,
  transmissionInstalled: false,
  transmissionBin: null,
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

function formatShortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  window._bannerTimer = setTimeout(() => el.classList.add('hidden'), 6500);
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
        <div style="min-width:0;">
          <div class="item-title">${esc(app.name)}</div>
          <div class="item-sub">
            ${esc(app.executable)}${app.args?.length ? ' ' + esc(app.args.join(' ')) : ''}${app.vpnOnly ? ' · <span style="color:#86efac;">VPN-Only Guard Active</span>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button
            type="button"
            class="btn btn-vpn-only${app.vpnOnly ? ' locked' : ''}"
            data-toggle-vpn-only="${esc(app.id)}"
            title="${app.vpnOnly ? 'VPN-Only active: cannot launch outside VPN and any outside instance is killed. Click to unlock.' : 'Lock this app so it cannot launch from its base state and is killed if ever started outside the VPN sandbox.'}"
          >${app.vpnOnly ? '🔒 VPN-Only' : 'Lock VPN-Only'}</button>
          <button type="button" class="btn btn-primary" data-launch-saved="${esc(app.id)}">Launch via VPN</button>
          <button type="button" class="btn btn-danger" data-remove-saved="${esc(app.id)}" title="Remove">✕</button>
        </div>
      </div>
    `
    )
    .join('');

  el.querySelectorAll('[data-toggle-vpn-only]').forEach(btn => {
    btn.onclick = async () => {
      const app = apps.find(a => a.id === btn.dataset.toggleVpnOnly);
      if (!app) return;
      const nextVpnOnly = !app.vpnOnly;
      const res = await window.robos.setAppVpnOnly({
        executable: app.executable,
        name: app.name,
        vpnOnly: nextVpnOnly,
        blockBaseLaunch: true,
      });
      if (!res.ok) {
        showBanner(res.error || 'Could not update VPN-Only lock.', true);
        return;
      }
      applyGuardResponse(res);
      if (nextVpnOnly) {
        const killedMsg = res.killedNow?.length
          ? ` (also killed ${res.killedNow.length} running outside-VPN instance)`
          : '';
        showBanner(`🔒 Locked "${app.name}" (${app.executable}) to VPN-Only mode — blocked outside VPN sandbox${killedMsg}.`);
      } else {
        showBanner(`Unlocked "${app.name}" — normal base-state launch restored.`);
      }
    };
  });

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

function applyGuardResponse(res) {
  if (Array.isArray(res.guardedApps)) state.guardedApps = res.guardedApps;
  if (Array.isArray(res.guardEvents)) state.guardEvents = res.guardEvents;
  if (Array.isArray(res.savedApps)) state.savedApps = res.savedApps;
  if (res.service) state.service = res.service;
  renderSavedApps();
  renderGuardSection();
}

function renderGuardSection() {
  const pill = document.getElementById('guard-status-pill');
  const listEl = document.getElementById('guarded-apps-list');
  const suggestionsEl = document.getElementById('guard-quick-suggestions');
  const eventsWrap = document.getElementById('guard-events-wrap');
  const eventsList = document.getElementById('guard-events-list');

  const guarded = state.guardedApps || [];
  const activeCount = guarded.filter(g => g.enabled !== false).length;

  if (pill) {
    pill.textContent = activeCount > 0 ? `🛡 Guard Active · ${activeCount} locked` : '0 locked';
    pill.classList.toggle('guard-active', activeCount > 0);
  }

  // Quick-lock chips for common apps like qBittorrent / Transmission if not yet locked
  if (suggestionsEl) {
    const guardedBases = new Set(guarded.map(g => String(g.executable || '').split('/').pop().toLowerCase()));
    const quickCandidates = [];
    if (state.qbittorrentBin && !guardedBases.has(String(state.qbittorrentBin).split('/').pop().toLowerCase())) {
      quickCandidates.push({ label: 'qBittorrent', executable: state.qbittorrentBin });
    } else if (!guardedBases.has('qbittorrent')) {
      quickCandidates.push({ label: 'qbittorrent', executable: 'qbittorrent' });
    }
    if (state.transmissionBin && !guardedBases.has(String(state.transmissionBin).split('/').pop().toLowerCase())) {
      quickCandidates.push({ label: 'Transmission', executable: state.transmissionBin });
    }

    if (quickCandidates.length > 0) {
      suggestionsEl.classList.remove('hidden');
      suggestionsEl.innerHTML =
        `<span>Quick Lock:</span>` +
        quickCandidates
          .map(
            c =>
              `<button type="button" class="chip-btn" data-quick-guard-exec="${esc(c.executable)}" data-quick-guard-name="${esc(c.label)}">+ Lock ${esc(c.label)}</button>`
          )
          .join('');
      suggestionsEl.querySelectorAll('[data-quick-guard-exec]').forEach(btn => {
        btn.onclick = async () => {
          const blockBase = document.getElementById('input-guard-block-base')?.checked !== false;
          const res = await window.robos.addGuardedApp({
            executable: btn.dataset.quickGuardExec,
            name: btn.dataset.quickGuardName,
            blockBaseLaunch: blockBase,
            killOutsideSandbox: true,
          });
          if (!res.ok) {
            showBanner(res.error || 'Could not lock app.', true);
            return;
          }
          applyGuardResponse(res);
          const killedExtra = res.killedNow?.length
            ? ` Killed ${res.killedNow.length} outside-VPN instance immediately.`
            : '';
          showBanner(`🔒 Locked ${btn.dataset.quickGuardName} to VPN-Only mode.${killedExtra}`);
        };
      });
    } else {
      suggestionsEl.classList.add('hidden');
      suggestionsEl.innerHTML = '';
    }
  }

  if (listEl) {
    if (!guarded.length) {
      listEl.innerHTML = `<div class="item-row"><div class="item-sub">No apps locked to VPN-Only yet. Lock an app like <strong>qbittorrent</strong> above (or click "Lock VPN-Only" on any Saved App) so it can never run outside the VPN Sandbox.</div></div>`;
    } else {
      listEl.innerHTML = guarded
        .map(g => {
          const isEnabled = g.enabled !== false;
          const badges = [];
          if (isEnabled) {
            badges.push(`<span class="guard-badge ok">Kill Outside VPN (/proc SIGKILL)</span>`);
            if (g.binaryGateActive) {
              badges.push(`<span class="guard-badge ok">Base Binary Gate (${esc(g.resolvedBinaryPath || g.executable)})</span>`);
            } else if (g.localShimActive) {
              badges.push(`<span class="guard-badge">PATH Gate (~/.local/bin)</span>`);
            }
            if (g.desktopLockedCount > 0) {
              badges.push(`<span class="guard-badge">Desktop Launcher Locked (${g.desktopLockedCount})</span>`);
            }
            if (state.service?.serviceActive) {
              badges.push(`<span class="guard-badge ok">24/7 Background Guard</span>`);
            }
          } else {
            badges.push(`<span class="guard-badge warn">Paused</span>`);
          }
          if ((g.killedCount || 0) > 0 || (g.blockedCount || 0) > 0) {
            badges.push(
              `<span class="guard-badge warn">Killed outside VPN: ${g.killedCount || 0} · Blocked base launches: ${g.blockedCount || 0}</span>`
            );
          }

          return `
            <div class="item-row" data-guarded-id="${esc(g.id)}">
              <div style="min-width:0;">
                <div class="item-title">
                  ${isEnabled ? '🔒' : '⏸'} ${esc(g.name || g.executable)}
                  <span style="font-weight:400;color:var(--muted);font-size:12px;">(${esc(g.executable)})</span>
                </div>
                <div class="guard-badges">${badges.join('')}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <button type="button" class="btn btn-primary btn-sm" data-launch-guarded="${esc(g.executable)}">Launch via VPN</button>
                <button type="button" class="btn btn-sm" data-toggle-guarded="${esc(g.id)}" data-enabled="${isEnabled ? '1' : '0'}">${isEnabled ? 'Pause' : 'Resume'}</button>
                <button type="button" class="btn btn-danger btn-sm" data-unlock-guarded="${esc(g.id)}" title="Remove VPN-Only lock and restore normal base launch">Unlock</button>
              </div>
            </div>
          `;
        })
        .join('');

      listEl.querySelectorAll('[data-launch-guarded]').forEach(btn => {
        btn.onclick = async () => {
          await launchApp({
            executable: btn.dataset.launchGuarded,
            args: [],
            accountId: document.getElementById('select-account').value,
            profileId: document.getElementById('select-server').value,
          });
        };
      });

      listEl.querySelectorAll('[data-toggle-guarded]').forEach(btn => {
        btn.onclick = async () => {
          const currentlyEnabled = btn.dataset.enabled === '1';
          const res = await window.robos.setGuardedAppEnabled(btn.dataset.toggleGuarded, !currentlyEnabled);
          if (!res.ok) {
            showBanner(res.error || 'Could not update guard rule.', true);
            return;
          }
          applyGuardResponse(res);
          showBanner(!currentlyEnabled ? 'Resumed VPN-Only protection.' : 'Paused VPN-Only protection.');
        };
      });

      listEl.querySelectorAll('[data-unlock-guarded]').forEach(btn => {
        btn.onclick = async () => {
          const res = await window.robos.removeGuardedApp(btn.dataset.unlockGuarded);
          if (!res.ok) {
            showBanner(res.error || 'Could not unlock app.', true);
            return;
          }
          applyGuardResponse(res);
          showBanner('Unlocked app and restored normal base-state launch.');
        };
      });
    }
  }

  const events = state.guardEvents || [];
  if (eventsWrap && eventsList) {
    eventsWrap.classList.toggle('hidden', events.length === 0);
    eventsList.innerHTML = events
      .slice(0, 20)
      .map(ev => {
        const actionBadge =
          ev.action === 'blocked-launch'
            ? '⛔ Blocked Base Launch'
            : '⚡ Killed Outside VPN (SIGKILL)';
        return `
          <div class="guard-event-row">
            <div>
              <strong>${actionBadge}:</strong> <code>${esc(ev.executable)}</code> (PID ${esc(ev.pid)}, namespace <code>${esc(ev.netns || 'host')}</code>)
            </div>
            <span class="guard-event-time">${esc(formatShortTime(ev.at))}</span>
          </div>
        `;
      })
      .join('');
  }
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
                ${esc(statusLabel)} · Namespace: ${esc(s.netnsName)} · Server: ${esc(s.serverHost)} (${esc(s.accountLabel)})${nextText}
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

  if (typeof window.robos.onGuardEvent === 'function') {
    window.robos.onGuardEvent(async ev => {
      const fresh = await window.robos.getGuardState();
      if (fresh.ok) applyGuardResponse(fresh);
      if (ev?.executable) {
        showBanner(
          ev.action === 'blocked-launch'
            ? `⛔ Blocked base-state launch of "${ev.executable}" outside the VPN Sandbox.`
            : `⚡ Killed "${ev.executable}" (PID ${ev.pid}) because it was launched outside the VPN Sandbox!`,
          true
        );
      }
    });
  }

  renderHeaderAndSelectors();
  renderSavedApps();
  renderSessions();
  renderGuardSection();

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
    const name = document.getElementById('input-profile-name').value.trim() || executable;
    const lockVpnOnly = document.getElementById('input-vpn-only')?.checked;
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;

    if (lockVpnOnly && executable) {
      const gRes = await window.robos.addGuardedApp({
        executable,
        name,
        blockBaseLaunch: true,
        killOutsideSandbox: true,
      });
      if (!gRes.ok) {
        showBanner(gRes.error || 'Could not lock app to VPN-Only.', true);
        return;
      }
      applyGuardResponse(gRes);
    }
    await launchApp({ executable, args, accountId, profileId });
  };

  document.getElementById('btn-save-profile').onclick = async () => {
    const executable = document.getElementById('input-executable').value.trim();
    const args = document.getElementById('input-args').value.trim();
    const name = document.getElementById('input-profile-name').value.trim() || executable;
    const vpnOnly = document.getElementById('input-vpn-only')?.checked ? true : undefined;
    const accountId = document.getElementById('select-account').value;
    const profileId = document.getElementById('select-server').value;
    const res = await window.robos.saveAppProfile({
      name,
      executable,
      args,
      accountId,
      profileId,
      autoFailover: state.autoFailover,
      vpnOnly,
    });
    if (!res.ok) {
      showBanner(res.error || 'Could not save app.', true);
      return;
    }
    state.savedApps = res.apps;
    const gFresh = await window.robos.getGuardState();
    if (gFresh.ok) applyGuardResponse(gFresh);
    else renderSavedApps();
    showBanner(
      vpnOnly
        ? `Saved "${res.profile.name}" and locked it to VPN-Only mode.`
        : `Saved "${res.profile.name}" to your app list.`
    );
  };

  const addGuardBtn = document.getElementById('btn-add-guarded-app');
  if (addGuardBtn) {
    addGuardBtn.onclick = async () => {
      const inputEl = document.getElementById('input-guard-exec');
      const executable = inputEl.value.trim();
      if (!executable) {
        showBanner('Enter an executable name (such as qbittorrent) to lock to VPN-Only mode.', true);
        return;
      }
      const blockBaseLaunch = document.getElementById('input-guard-block-base')?.checked !== false;
      const res = await window.robos.addGuardedApp({
        executable,
        blockBaseLaunch,
        killOutsideSandbox: true,
      });
      if (!res.ok) {
        showBanner(res.error || 'Could not lock app.', true);
        return;
      }
      inputEl.value = '';
      applyGuardResponse(res);
      const killedExtra = res.killedNow?.length
        ? ` Immediately killed ${res.killedNow.length} outside-sandbox instance(s).`
        : '';
      showBanner(`🔒 Locked "${executable}" to VPN-Only mode.${killedExtra}`);
    };
  }

  const guardExecInput = document.getElementById('input-guard-exec');
  if (guardExecInput) {
    guardExecInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        document.getElementById('btn-add-guarded-app')?.click();
      }
    });
  }

  const scanGuardBtn = document.getElementById('btn-scan-guard-now');
  if (scanGuardBtn) {
    scanGuardBtn.onclick = async () => {
      const res = await window.robos.enforceGuardNow();
      if (!res.ok) {
        showBanner(res.error || 'Guard scan failed.', true);
        return;
      }
      applyGuardResponse(res);
      if (res.killedCount > 0) {
        showBanner(`⚡ Terminated ${res.killedCount} outside-sandbox instance(s) via SIGKILL.`, true);
      } else {
        const inside = res.insideSandbox?.length || 0;
        showBanner(
          `✓ Guard scan clean: 0 guarded apps running outside VPN Sandbox${inside ? ` (${inside} running safely inside VPN namespace)` : ''}.`
        );
      }
    };
  }

  const clearGuardEventsBtn = document.getElementById('btn-clear-guard-events');
  if (clearGuardEventsBtn) {
    clearGuardEventsBtn.onclick = async () => {
      const res = await window.robos.clearGuardEvents();
      if (res.ok) {
        state.guardEvents = [];
        renderGuardSection();
      }
    };
  }

  const proveGuardBtn = document.getElementById('btn-prove-guard');
  if (proveGuardBtn) {
    proveGuardBtn.onclick = async () => {
      const origText = proveGuardBtn.textContent;
      proveGuardBtn.disabled = true;
      proveGuardBtn.textContent = 'Proving Guard…';
      showBanner('Running 5-step VPN-Only Guard Proof: testing base-state block, outside-VPN SIGKILL, and in-namespace survival…');
      const res = await window.robos.proveVpnOnlyGuard();
      proveGuardBtn.disabled = false;
      proveGuardBtn.textContent = origText;
      if (!res.ok) {
        showBanner(res.error || 'VPN-Only Guard proof failed.', true);
        return;
      }
      showBanner(
        `✓ VPN-Only Guard Proven (${res.mode}): Base launch blocked (exit ${res.baseLaunchBlockedExitCode}), rogue outside-VPN process SIGKILLed immediately, and sandboxed instance stayed alive!`
      );
    };
  }

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
      state.guardedApps = fresh.guardedApps || [];
      state.guardEvents = fresh.guardEvents || [];
      state.service = fresh.service || {};
      renderHeaderAndSelectors();
      renderSavedApps();
      renderSessions();
      renderGuardSection();
    }
  }, 2500);
}

init();
