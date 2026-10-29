'use strict';

const api = window.privateNetworksAPI;

let currentState = null;
let lastVideoBridgePort = null;

function setBanner(msg, isError = false) {
  const el = document.getElementById('join-status');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = isError ? '#f85149' : 'rgba(0, 188, 212, 0.4)';
  el.style.color = isError ? '#f85149' : '#3fb950';
  el.classList.remove('hidden');
}

function renderState(state) {
  if (!state || !state.ok) return;
  currentState = state;

  document.getElementById('node-id-pill').textContent = state.identity.nodeId;
  document.getElementById('node-lan').textContent = `${state.identity.nodeName} (${state.netInfo.lanIp}:${state.gateway.port})`;
  document.getElementById('node-overlay').textContent = state.netInfo.overlayIp || 'None detected (use WAN Relay)';
  document.getElementById('node-fp').textContent = state.identity.fingerprint;

  const relayEl = document.getElementById('node-relay');
  const relayBadge = document.getElementById('relay-badge');
  const relayBtn = document.getElementById('btn-enable-relay');

  if (state.wanRelay && state.wanRelay.active && state.wanRelay.relayUrl) {
    relayEl.textContent = `${state.wanRelay.relayUrl} (mTLS 1.3 Pinning)`;
    relayBadge.textContent = `WAN Relay: ${state.wanRelay.relayUrl}`;
    relayBadge.className = 'badge badge-cyan';
    relayBtn.textContent = 'Stop WAN Relay';
  } else {
    relayEl.textContent = 'Not active (LAN / Overlay only)';
    relayBadge.textContent = 'WAN Relay Idle';
    relayBadge.className = 'badge badge-muted';
    relayBtn.textContent = 'Enable Cross-Network WAN Relay';
  }

  const netToken = state.enrollment.netToken || state.enrollment.token;
  document.getElementById('invite-token').value = netToken;
  const cmd = `node packages/private-networks/cli.js join "${netToken}"`;
  document.getElementById('join-cmd-preview').textContent = cmd;

  // Render peers
  const peersContainer = document.getElementById('peers-list');
  if (!state.peers || state.peers.length === 0) {
    peersContainer.innerHTML = '<div class="empty-state">No remote peers linked yet. Run the Box A Join Command on Box A or paste Box A\'s token above.</div>';
  } else {
    peersContainer.innerHTML = state.peers.map(p => `
      <div class="peer-item">
        <div>
          <div class="peer-title">
            <span>${p.name}</span>
            <span class="badge ${p.reverseMuxActive ? 'badge-online' : 'badge-cyan'}">
              ${p.reverseMuxActive ? 'Reverse-Mux Active' : (p.relayUrl ? 'WAN Relay' : 'Direct mTLS')}
            </span>
          </div>
          <div class="peer-meta">
            Node: ${p.nodeId} | Endpoint: ${p.relayUrl || `${p.host}:${p.port}`}
          </div>
          <div class="peer-meta">
            Cert Pin: ${p.fingerprint.slice(0, 35)}…
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" data-bridge-peer="${p.id}">Bridge Video (:19215)</button>
          <button class="btn btn-sm" data-ping-peer="${p.id}">Ping</button>
          <button class="btn btn-sm" data-remove-peer="${p.id}">Remove</button>
        </div>
      </div>
    `).join('');
  }

  // Render tunnels
  const tunnelsContainer = document.getElementById('tunnels-list');
  if (!state.tunnels || state.tunnels.length === 0) {
    tunnelsContainer.innerHTML = '<div class="empty-state">No active local bridge tunnels.</div>';
  } else {
    tunnelsContainer.innerHTML = state.tunnels.map(t => {
      if (t.remotePort === 19215 || t.remoteAppId === 'movie-player-stream') {
        lastVideoBridgePort = t.localPort;
      }
      return `
        <div class="tunnel-item">
          <div>
            <div class="peer-title">
              <span>127.0.0.1:${t.localPort} &rarr; ${t.peerName}:${t.remotePort} (${t.remoteLabel})</span>
            </div>
            <div class="peer-meta">
              Connections: ${t.stats.connections} | In: ${(t.stats.bytesIn / 1024).toFixed(1)} KB | Out: ${(t.stats.bytesOut / 1024).toFixed(1)} KB
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" data-probe-port="${t.localPort}">Inspect Videos</button>
            <button class="btn btn-sm" data-stop-tunnel="${t.id}">Close</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render audit log
  const auditContainer = document.getElementById('audit-list');
  auditContainer.innerHTML = (state.auditLog || []).slice(0, 15).map(a => `
    <div class="audit-row ${a.severity || 'info'}">
      [${new Date(a.timestamp).toLocaleTimeString()}] <strong>${a.type}</strong> — ${a.detail}
    </div>
  `).join('');

  if (Array.isArray(state.remoteVideoCatalog) && state.remoteVideoCatalog.length > 0) {
    renderDiscoveredVideos(state.remoteVideoCatalog, state.remoteVideoEndpoint || (lastVideoBridgePort ? `http://127.0.0.1:${lastVideoBridgePort}` : ''));
  }
}

function renderDiscoveredVideos(items, endpoint) {
  const box = document.getElementById('remote-videos-box');
  const list = document.getElementById('remote-videos-list');
  if (!items || items.length === 0) {
    box.classList.add('hidden');
    return;
  }
  box.classList.remove('hidden');
  list.innerHTML = items.map(v => `
    <div class="video-row">
      <div>
        <strong>${v.title}</strong>
        <div class="peer-meta">${v.streamUrl}</div>
      </div>
      <button class="btn btn-sm btn-primary" data-open-player="${endpoint}">Stream in Video Player</button>
    </div>
  `).join('');
}

async function init() {
  const state = await api.getState();
  renderState(state);

  document.getElementById('btn-enable-relay').addEventListener('click', async () => {
    const btn = document.getElementById('btn-enable-relay');
    if (currentState?.wanRelay?.active) {
      const next = await api.stopWanRelay();
      renderState(next);
      return;
    }
    btn.textContent = 'Allocating WAN Relay...';
    btn.disabled = true;
    const next = await api.startWanRelay();
    btn.disabled = false;
    if (next.ok) {
      renderState(next);
      setBanner(`Cross-Network WAN Relay active: ${next.wanRelay?.relayUrl}`);
    } else {
      setBanner(`WAN Relay error: ${next.error}`, true);
    }
  });

  document.getElementById('btn-copy-token').addEventListener('click', async () => {
    const val = document.getElementById('invite-token').value;
    await api.copyText(val);
    setBanner('Copied Private Network invite token (robos-net://) to clipboard.');
  });

  document.getElementById('btn-copy-cmd').addEventListener('click', async () => {
    const cmd = document.getElementById('join-cmd-preview').textContent;
    await api.copyText(cmd);
    setBanner('Copied Box A 1-line join command to clipboard.');
  });

  document.getElementById('btn-join-network').addEventListener('click', async () => {
    const token = document.getElementById('join-token-input').value.trim();
    if (!token) {
      setBanner('Please paste a robos-net:// or robos-mesh:// token first.', true);
      return;
    }
    setBanner('Connecting over Mutual TLS 1.3 and establishing bidirectional Reverse-Mux...');
    const res = await api.joinPrivateNetwork({ token, bridgeMoviePlayer: true });
    if (!res.ok) {
      setBanner(`Join failed: ${res.error}`, true);
      return;
    }
    renderState(res);
    setBanner(`Linked with ${res.joinResult.peer.name} over Mutual TLS 1.3!`);
  });

  document.getElementById('btn-zt-proof').addEventListener('click', async () => {
    const res = await api.runZeroTrustProof();
    if (res.ok) {
      renderState(res);
      setBanner(`Zero-Trust Proof Verified: Rogue Certificate Rejected=${res.proof.rogueRejected}, Pin Verified=${res.proof.authorizedHealth?.zeroTrustVerified}`);
    }
  });

  document.getElementById('btn-launch-player').addEventListener('click', async () => {
    const endpoint = lastVideoBridgePort ? `http://127.0.0.1:${lastVideoBridgePort}` : '';
    await api.launchMoviePlayer(endpoint);
  });

  document.body.addEventListener('click', async (e) => {
    const bridgePeerId = e.target.getAttribute('data-bridge-peer');
    if (bridgePeerId) {
      const res = await api.bridgePeerVideo({ peerId: bridgePeerId });
      if (res.ok) {
        renderState(res);
        if (res.createdTunnel) {
          lastVideoBridgePort = res.createdTunnel.localPort;
          renderDiscoveredVideos(res.remoteVideoCatalog || [], `http://127.0.0.1:${res.createdTunnel.localPort}`);
          setBanner(`Mounted remote Movie Player (:19215) on local http://127.0.0.1:${res.createdTunnel.localPort}`);
        }
      } else {
        setBanner(`Bridge failed: ${res.error}`, true);
      }
    }

    const pingPeerId = e.target.getAttribute('data-ping-peer');
    if (pingPeerId) {
      const res = await api.pingPeer(pingPeerId);
      if (res.ok) {
        renderState(res.state);
        setBanner(`Verified mTLS 1.3 ping from ${res.pong.nodeName} (${res.pong.nodeId})`);
      } else {
        setBanner(`Ping error: ${res.error}`, true);
      }
    }

    const removePeerId = e.target.getAttribute('data-remove-peer');
    if (removePeerId) {
      const res = await api.removePeer(removePeerId);
      renderState(res);
    }

    const probePort = e.target.getAttribute('data-probe-port');
    if (probePort) {
      const res = await api.probeVideoBridge(Number(probePort));
      if (res.ok) {
        renderDiscoveredVideos(res.items, res.endpoint);
        setBanner(`Discovered ${res.items.length} video(s) at ${res.endpoint}`);
      } else {
        setBanner(`Video probe error: ${res.error}`, true);
      }
    }

    const stopTunnel = e.target.getAttribute('data-stop-tunnel');
    if (stopTunnel) {
      const res = await api.stopBridgeTunnel(stopTunnel);
      renderState(res);
    }

    const openPlayerEndpoint = e.target.getAttribute('data-open-player');
    if (openPlayerEndpoint) {
      await api.launchMoviePlayer(openPlayerEndpoint);
    }
  });

  setInterval(async () => {
    const next = await api.getState();
    if (next && next.ok) renderState(next);
  }, 3000);
}

init();
