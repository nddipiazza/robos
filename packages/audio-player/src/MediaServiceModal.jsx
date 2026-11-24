import React, { useEffect, useState } from 'react';

export default function MediaServiceModal({ open, onClose, onConnect, appKind = 'movie' }) {
  const [configured, setConfigured] = useState([]);
  const [discovered, setDiscovered] = useState([]);
  const [discovering, setDiscovering] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [endpoint, setEndpoint] = useState('http://192.168.1.25:19234');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (window.robosAudio?.listMediaServices) {
      window.robosAudio.listMediaServices().then((res) => {
        const list = res?.servers || [];
        setConfigured(list);
        if (list[0]?.url) setEndpoint(list[0].url);
      }).catch(() => {});
    }
    handleDiscover();
  }, [open]);

  const handleDiscover = async () => {
    if (!window.robosAudio?.discoverMediaServices) return;
    setDiscovering(true);
    try {
      const res = await window.robosAudio.discoverMediaServices();
      const found = res?.servers || [];
      setDiscovered(found);
      if (found[0]?.url) setEndpoint(found[0].url);
    } catch {}
    setDiscovering(false);
  };

  const connectServer = async (targetUrl, targetName) => {
    if (!targetUrl) return;
    setConnecting(true);
    setError('');
    try {
      const res = await onConnect(targetUrl, targetName || undefined);
      if (res && res.ok === false) {
        setError(res.error || 'Could not connect to RobOS Media Server');
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  if (!open) return null;

  const summaryFor = (counts = {}) => {
    if (appKind === 'audio') {
      return `${(counts.musicTracks || 0).toLocaleString()} songs · ${(counts.albums || 0).toLocaleString()} albums`;
    }
    return `${(counts.movies || 0).toLocaleString()} movies · ${(counts.shows || 0).toLocaleString()} TV shows (${(counts.episodes || 0).toLocaleString()} episodes)`;
  };

  const candidates = [...configured];
  for (const d of discovered) {
    if (!candidates.some(c => c.url === d.url)) {
      candidates.push({
        id: d.serverId,
        name: d.serverName,
        url: d.url,
        mcpUrl: d.mcpUrl,
        online: true,
        cachedCounts: d.counts,
      });
    }
  }

  return (
    <div
      id="media-service-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(5, 8, 14, 0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: '100%', maxWidth: '620px',
          background: '#161b22', border: '1px solid rgba(0,188,212,0.45)',
          borderRadius: '12px', padding: '22px', color: '#e6edf3',
          boxShadow: '0 20px 60px rgba(0,0,0,0.65)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#67e8f9' }}>Choose RobOS Media Service</h3>
          <button className="btn-secondary" onClick={onClose}>Close ✕</button>
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
          Stream {appKind === 'audio' ? 'all your music albums & tracks' : 'all your movies & TV shows'} directly from a <strong>RobOS Media Server</strong> on your network — no local library scanning needed. RobOS Preferences keeps this service synced across all your machines.
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong style={{ fontSize: '12.5px', color: '#cbd5e1' }}>
            {discovering ? 'Scanning LAN for RobOS Media Servers (:19234)…' : `Available RobOS Media Services (${candidates.length})`}
          </strong>
          <button type="button" className="row-btn" onClick={handleDiscover} disabled={discovering || connecting}>
            {discovering ? 'Scanning…' : 'Rescan LAN'}
          </button>
        </div>

        {candidates.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto', marginBottom: '16px' }}>
            {candidates.map((srv) => (
              <div
                key={srv.url}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '8px',
                  background: '#0d1117', border: '1px solid #29323e',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13.5px' }}>
                    {srv.name || srv.url}
                    {srv.online !== false && (
                      <span style={{ fontSize: '11px', marginLeft: '8px', padding: '2px 7px', borderRadius: '10px', background: '#153626', color: '#94e6b5' }}>
                        Online · MCP
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>
                    <code>{srv.url}</code> {srv.cachedCounts ? `· ${summaryFor(srv.cachedCounts)}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-accent"
                  disabled={connecting}
                  onClick={() => connectServer(srv.url, srv.name)}
                >
                  {connecting ? 'Syncing…' : 'Use Service'}
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); connectServer(endpoint.trim(), label.trim()); }}
          style={{ borderTop: '1px solid #29323e', paddingTop: '14px' }}
        >
          <div style={{ fontSize: '12.5px', fontWeight: 600, marginBottom: '8px', color: '#cbd5e1' }}>
            Or connect by Server URL / IP Address
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <input
              className="folder-edit"
              style={{ flex: '2 1 240px', padding: '8px 10px' }}
              placeholder="http://192.168.1.25:19234"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
            <input
              className="folder-edit"
              style={{ flex: '1 1 160px', padding: '8px 10px' }}
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button type="submit" className="btn-accent" disabled={connecting || !endpoint.trim()}>
              {connecting ? 'Connecting…' : 'Connect & Sync'}
            </button>
          </div>
          {error && <div style={{ color: '#f87171', fontSize: '12.5px', marginTop: '6px' }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
