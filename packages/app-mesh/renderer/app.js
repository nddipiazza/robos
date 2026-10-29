'use strict';

let meshState = null;

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

function renderAll() {
  if (!meshState) return;

  // Header
  const id = meshState.identity || {};
  document.getElementById('node-id-value').textContent = id.nodeId || '—';
  const shortFp = id.fingerprint ? id.fingerprint.slice(0, 26) + '…' : '—';
  document.getElementById('node-fp-short').textContent = shortFp;

  const gw = meshState.gateway || {};
  const gwPill = document.getElementById('gateway-status-pill');
  gwPill.textContent = gw.listening
    ? `TLS 1.3 Gateway :${gw.port} (${gw.activeDriver})`
    : 'Gateway Stopped';

  // Transport drivers
  const drvSelect = document.getElementById('select-driver');
  const drivers = meshState.drivers || [];
  const activeDriver = meshState.policy?.activeDriver || 'mtls';
  drvSelect.innerHTML = drivers
    .map(d => `<option value="${esc(d.id)}"${d.id === activeDriver ? ' selected' : ''}>${esc(d.name)} — ${esc(d.badge)}</option>`)
    .join('');

  const curDrv = drivers.find(d => d.id === activeDriver) || drivers[0];
  document.getElementById('driver-hint').textContent = curDrv
    ? `${curDrv.description} [${curDrv.statusNote}]`
    : '';

  // Enrollment token & network info
  document.getElementById('input-my-token').value = meshState.enrollment?.token || '';
  const netInfo = meshState.netInfo || {};
  document.getElementById('net-endpoints-hint').textContent =
    `LAN IP: ${netInfo.lanIp || '127.0.0.1'} | Overlay IP: ${netInfo.overlayIp || 'none (using direct mTLS)'} | Gateway Port: :${gw.port || 19290}`;

  // Share-all checkbox
  document.getElementById('chk-share-all').checked = Boolean(meshState.policy?.shareAllIpcPorts);

  renderPeers();
  renderBridgeControlsAndTunnels();
  renderCatalogAndManifest();
  renderAuditLog();
}

function renderPeers() {
  const peers = meshState.peers || [];
  document.getElementById('peers-count').textContent = `${peers.length} peer${peers.length === 1 ? '' : 's'}`;

  const el = document.getElementById('peers-list');
  if (!peers.length) {
    el.innerHTML = `<div class="item-row"><div class="item-sub">No peers enrolled yet. Paste a peer's <code>robos-mesh://</code> token above or click "Add Self-Test Peer".</div></div>`;
    return;
  }

  el.innerHTML = peers
    .map(p => `
      <div class="item-row" data-peer-id="${esc(p.id)}">
        <div>
          <div class="item-title">${esc(p.name)} <span class="fp-chip">${esc(p.nodeId)}</span></div>
          <div class="item-sub">${esc(p.host)}:${esc(p.port)} • ${esc((p.fingerprint || '').slice(0, 23))}…</div>
        </div>
        <div style="display:flex;gap:5px;">
          <button type="button" class="btn btn-sm" data-ping-peer="${esc(p.id)}">Ping mTLS</button>
          <button type="button" class="btn btn-sm btn-danger" data-remove-peer="${esc(p.id)}" title="Revoke Peer">✕</button>
        </div>
      </div>
    `)
    .join('');

  el.querySelectorAll('[data-ping-peer]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.pingPeer(btn.dataset.pingPeer);
      if (res.ok) {
        meshState = res.state;
        renderAll();
        showBanner(`mTLS 1.3 Ping Verified: ${res.pong.nodeName} (${res.pong.nodeId}) [${res.pong.fingerprint.slice(0, 23)}…]`);
      } else {
        showBanner(`Peer Ping Failed: ${res.error}`, true);
      }
    };
  });

  el.querySelectorAll('[data-remove-peer]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.removePeer(btn.dataset.removePeer);
      if (res.ok) {
        meshState = res;
        renderAll();
        showBanner('Peer revoked from Zero-Trust registry.');
      }
    };
  });
}

function renderBridgeControlsAndTunnels() {
  const peerSelect = document.getElementById('select-bridge-peer');
  const peers = meshState.peers || [];
  const options = [
    `<option value="self-loopback">${esc(meshState.identity?.nodeName || 'Local')} (Self-Loopback Test Node)</option>`,
    ...peers.map(p => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.host)}:${esc(p.port)})</option>`),
  ];
  const prevPeer = peerSelect.value;
  peerSelect.innerHTML = options.join('');
  if (prevPeer && Array.from(peerSelect.options).some(o => o.value === prevPeer)) {
    peerSelect.value = prevPeer;
  }

  const appSelect = document.getElementById('select-bridge-app');
  const catalog = meshState.catalog || [];
  const prevApp = appSelect.value;
  appSelect.innerHTML = catalog
    .map(c => `<option value="${esc(c.appId)}">:${c.port} — ${esc(c.label)} (${c.listening ? 'Running' : 'Idle'})</option>`)
    .join('');
  if (prevApp && catalog.some(c => c.appId === prevApp)) {
    appSelect.value = prevApp;
  }

  const tunnels = meshState.tunnels || [];
  document.getElementById('tunnels-count').textContent = `${tunnels.length} active`;
  const listEl = document.getElementById('tunnels-list');
  if (!tunnels.length) {
    listEl.innerHTML = `<div class="item-row"><div class="item-sub">No active IPC port bridges. Select a peer and RobOS app above and click "Bridge IPC Port".</div></div>`;
    return;
  }

  listEl.innerHTML = tunnels
    .map(t => `
      <div class="item-row" data-tunnel-id="${esc(t.id)}">
        <div>
          <div class="item-title"><span class="dot dot-on"></span>127.0.0.1:${t.localPort} ⇄ ${esc(t.peerName)}:${t.remotePort}</div>
          <div class="item-sub">${esc(t.remoteLabel)} (${esc(t.remoteAppId)}) • ${t.stats?.connections || 0} conns (${t.stats?.bytesIn || 0}B in / ${t.stats?.bytesOut || 0}B out)</div>
        </div>
        <button type="button" class="btn btn-sm btn-danger" data-stop-tunnel="${esc(t.id)}">Disconnect</button>
      </div>
    `)
    .join('');

  listEl.querySelectorAll('[data-stop-tunnel]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.stopBridgeTunnel(btn.dataset.stopTunnel);
      if (res.ok) {
        meshState = res;
        renderAll();
        showBanner('Closed local IPC port bridge.');
      }
    };
  });
}

function renderCatalogAndManifest() {
  const catalog = meshState.catalog || [];
  const filter = (document.getElementById('input-filter-ports').value || '').trim().toLowerCase();
  const filtered = filter
    ? catalog.filter(c => c.appId.toLowerCase().includes(filter) || c.label.toLowerCase().includes(filter) || String(c.port).includes(filter))
    : catalog;

  const listeningCount = catalog.filter(c => c.listening).length;
  document.getElementById('catalog-count').textContent = `${catalog.length} ports (${listeningCount} live)`;

  const listEl = document.getElementById('catalog-list');
  listEl.innerHTML = filtered
    .map(c => `
      <div class="item-row" data-catalog-app="${esc(c.appId)}">
        <div>
          <div class="item-title">
            <span class="dot ${c.listening ? 'dot-on' : 'dot-off'}" title="${c.listening ? 'Listening locally on 127.0.0.1' : 'App not currently running'}"></span>
            :${c.port} — ${esc(c.appId)}
          </div>
          <div class="item-sub">${esc(c.label)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="fp-chip">${c.shared ? 'Shared' : 'Blocked'}</span>
          <button type="button" class="btn btn-sm" data-toggle-app="${esc(c.appId)}">${c.shared ? 'Block' : 'Allow'}</button>
        </div>
      </div>
    `)
    .join('');

  listEl.querySelectorAll('[data-toggle-app]').forEach(btn => {
    btn.onclick = async () => {
      const res = await window.robos.updatePolicy({ toggleAppId: btn.dataset.toggleApp });
      if (res.ok) {
        meshState = res;
        renderAll();
      }
    };
  });

  const manifest = meshState.manifest || {};
  document.getElementById('manifest-driver-label').textContent = manifest.driverId || 'mtls';
  document.getElementById('manifest-preview').textContent = manifest.content || '';
}

function renderAuditLog() {
  const logs = meshState.auditLog || [];
  const el = document.getElementById('audit-list');
  if (!logs.length) {
    el.innerHTML = `<div class="item-row"><div class="item-sub">No security events recorded yet.</div></div>`;
    return;
  }
  el.innerHTML = logs
    .slice(0, 15)
    .map(item => `
      <div class="item-row">
        <div>
          <div class="item-title" style="font-size:11.5px;">${esc(item.type)}</div>
          <div class="item-sub">${esc(item.detail)}</div>
        </div>
      </div>
    `)
    .join('');
}

async function init() {
  const res = await window.robos.getMeshState();
  if (res && res.ok) {
    meshState = res;
    renderAll();
  } else {
    showBanner(res?.error || 'Could not load App Mesh state', true);
  }

  document.getElementById('btn-refresh').onclick = async () => {
    const fresh = await window.robos.getMeshState();
    if (fresh.ok) {
      meshState = fresh;
      renderAll();
      showBanner('Refreshed RobOS App Mesh status and live IPC port scan.');
    }
  };

  document.getElementById('select-driver').onchange = async (e) => {
    const updated = await window.robos.updatePolicy({ activeDriver: e.target.value });
    if (updated.ok) {
      meshState = updated;
      renderAll();
      showBanner(`Switched Zero-Trust transport fabric to ${e.target.value}.`);
    }
  };

  document.getElementById('chk-share-all').onchange = async (e) => {
    const updated = await window.robos.updatePolicy({ shareAllIpcPorts: e.target.checked });
    if (updated.ok) {
      meshState = updated;
      renderAll();
    }
  };

  document.getElementById('btn-copy-token').onclick = async () => {
    const token = document.getElementById('input-my-token').value;
    await window.robos.copyText(token);
    showBanner('Copied Zero-Trust Enrollment Token to clipboard.');
  };

  document.getElementById('btn-copy-manifest').onclick = async () => {
    const text = document.getElementById('manifest-preview').textContent;
    await window.robos.copyText(text);
    showBanner('Copied overlay provisioning manifest to clipboard.');
  };

  document.getElementById('btn-enroll-peer').onclick = async () => {
    const token = document.getElementById('input-peer-token').value.trim();
    const name = document.getElementById('input-peer-name').value.trim();
    const host = document.getElementById('input-peer-host').value.trim();
    if (!token) {
      showBanner('Paste a peer robos-mesh:// token first.', true);
      return;
    }
    const payload = { token };
    if (name) payload.name = name;
    if (host) payload.host = host;

    const r = await window.robos.enrollPeer(payload);
    if (r.ok) {
      meshState = r;
      document.getElementById('input-peer-token').value = '';
      renderAll();
      showBanner(`Enrolled and pinned Zero-Trust peer: ${r.enrolledPeer.name}`);
    } else {
      showBanner(r.error || 'Failed to enroll peer', true);
    }
  };

  document.getElementById('btn-enroll-loopback').onclick = async () => {
    if (!meshState?.enrollment?.token) return;
    const r = await window.robos.enrollPeer({
      token: meshState.enrollment.token,
      name: `${meshState.identity.nodeName} (Local Peer)`,
      host: '127.0.0.1',
    });
    if (r.ok) {
      meshState = r;
      renderAll();
      showBanner(`Enrolled local self-test peer (${r.enrolledPeer.nodeId}).`);
    }
  };

  document.getElementById('btn-create-bridge').onclick = async () => {
    const peerId = document.getElementById('select-bridge-peer').value;
    const remoteAppId = document.getElementById('select-bridge-app').value;
    const localPort = Number(document.getElementById('input-local-port').value || 0);
    const r = await window.robos.createBridgeTunnel({ peerId, remoteAppId, localPort });
    if (r.ok) {
      meshState = r;
      renderAll();
      const t = r.createdTunnel;
      showBanner(`Mounted Zero-Trust IPC Bridge: 127.0.0.1:${t.localPort} -> ${t.peerName}:${t.remotePort} (${t.remoteAppId})`);
    } else {
      showBanner(r.error || 'Could not create IPC bridge', true);
    }
  };

  document.getElementById('btn-run-zt-proof').onclick = async () => {
    const r = await window.robos.runZtProof();
    if (r.ok && r.proof?.ok) {
      meshState = r;
      renderAll();
      showBanner(
        `Zero-Trust Proof PASSED: Rogue cert rejected (${r.proof.rogueError}), authorized IPC tunnel 127.0.0.1:${r.proof.tunnelLocalPort} -> :${r.proof.targetIpcPort} verified!`
      );
    } else {
      showBanner(`Zero-Trust Proof Failed: ${r.error || 'unexpected result'}`, true);
    }
  };

  document.getElementById('input-filter-ports').oninput = () => {
    renderCatalogAndManifest();
  };
}

window.addEventListener('DOMContentLoaded', init);
