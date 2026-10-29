import React, { useState } from 'react';
import { Icon } from './Icon.jsx';

const when = (iso) => {
  if (!iso) return 'Not indexed yet';
  const d = new Date(iso);
  return `Synced ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const providerLabel = (protocol) => {
  const p = (protocol || '').toLowerCase();
  if (p === 'p2p') return 'RobOS P2P mTLS 1.3';
  if (p === 'gdrive') return 'Google Drive';
  if (p === 'onedrive') return 'OneDrive';
  if (p === 'dropbox') return 'Dropbox';
  if (p === 's3') return 'S3';
  return p ? p.toUpperCase() : 'Cloud';
};

export function formatFolderMediaSummary(f) {
  if (!f) return '0 movies';
  const movies = f.movieCount != null ? f.movieCount : f.trackCount || 0;
  const shows = f.showCount || 0;
  const seasons = f.seasonCount || 0;
  const episodes = f.episodeCount || 0;
  const parts = [];
  if (movies > 0 || shows === 0) {
    parts.push(`${movies} Movie${movies === 1 ? '' : 's'}`);
  }
  if (shows > 0) {
    parts.push(`${shows} TV Show${shows === 1 ? '' : 's'} (${seasons} Season${seasons === 1 ? '' : 's'} · ${episodes} Episode${episodes === 1 ? '' : 's'})`);
  }
  return parts.join(' · ');
}

export default function FolderPanel({ folders, activeId, onSelect, onAddLocal, onAddCloud, onAddPeer, onRescan, onRename, onRemove, onEnabled, busyId }) {
  const [confirmId, setConfirmId] = useState(null);
  const [alsoTracks, setAlsoTracks] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showPeerForm, setShowPeerForm] = useState(false);
  const [peerEndpoint, setPeerEndpoint] = useState('http://127.0.0.1:19225');
  const [peerLabel, setPeerLabel] = useState('');

  const commitRename = (id) => {
    if (editValue.trim()) onRename(id, editValue);
    setEditId(null);
  };

  const openPeerForm = async () => {
    if (!showPeerForm && window.robosAudio?.getActivePeerBridge) {
      try {
        const active = await window.robosAudio.getActivePeerBridge();
        if (active && active.endpoint) {
          setPeerEndpoint(active.endpoint);
          if (active.label) setPeerLabel(active.label);
        }
      } catch {}
    }
    setShowPeerForm(v => !v);
  };

  const submitPeerForm = async (e) => {
    e.preventDefault();
    if (!onAddPeer) return;
    await onAddPeer(peerEndpoint.trim(), peerLabel.trim() || undefined);
    setShowPeerForm(false);
  };

  return (
    <aside className="folder-panel">
      <div className="folder-panel-head">
        <span>Library Folders ({folders.length})</span>
        <div className="folder-head-actions">
          <button className="row-btn" title="Add a folder from this computer" onClick={onAddLocal}>+ Local</button>
          <button className="row-btn" title="Browse Cloud Storage folders" onClick={onAddCloud}>+ Cloud</button>
          {onAddPeer && (
            <button
              className="row-btn"
              style={{ color: '#00bcd4', borderColor: 'rgba(0,188,212,0.45)' }}
              title="Stream movies & shows from a remote RobOS Private Network peer (Box A)"
              onClick={openPeerForm}
            >
              + P2P Peer
            </button>
          )}
          <button className="row-btn" title="Refresh folders marked Keep synced" onClick={() => onRescan(null)} disabled={!folders.length || !!busyId}>Refresh all</button>
        </div>
      </div>

      {showPeerForm && (
        <form className="folder-confirm" onSubmit={submitPeerForm} style={{ margin: '8px', padding: '10px', border: '1px solid rgba(0,188,212,0.4)', borderRadius: '8px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#00bcd4', marginBottom: '6px' }}>
            Link RobOS Private Network Peer Stream (:19215)
          </div>
          <input
            className="folder-edit"
            style={{ width: '100%', marginBottom: '6px' }}
            placeholder="http://127.0.0.1:19225 or robos-net://..."
            value={peerEndpoint}
            onChange={(e) => setPeerEndpoint(e.target.value)}
          />
          <input
            className="folder-edit"
            style={{ width: '100%', marginBottom: '8px' }}
            placeholder="Optional label (e.g. Box A Cinema)"
            value={peerLabel}
            onChange={(e) => setPeerLabel(e.target.value)}
          />
          <div className="folder-confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setShowPeerForm(false)}>Cancel</button>
            <button type="submit" className="btn-accent">Connect &amp; Sync Peer</button>
          </div>
        </form>
      )}

      <div className={`folder-row ${activeId === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <Icon name="library" size={15} />
        <div className="folder-text">
          <span className="folder-name">All Movies &amp; Shows</span>
          <span className="folder-sub">Combined view across all library folders</span>
        </div>
      </div>

      {folders.length === 0 && (
        <p className="folder-empty">No folders linked yet. Add a local folder, link a P2P Peer via RobOS Private Networks, or link Cloud Storage.</p>
      )}

      {folders.map(f => (
        <div key={f.id} className={`folder-item ${activeId === f.id ? 'active' : ''} ${f.available ? '' : 'unavailable'}`}>
          <div className="folder-row" onClick={() => onSelect(f.id)}>
            <Icon name={f.kind === 'cloud' || f.kind === 'peer' ? 'cloud' : 'folder'} size={15} />
            <div className="folder-text">
              {editId === f.id ? (
                <input className="folder-edit" autoFocus value={editValue}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitRename(f.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(f.id); if (e.key === 'Escape') setEditId(null); }} />
              ) : (
                <span className="folder-name" onDoubleClick={() => { setEditId(f.id); setEditValue(f.label); }} title="Double-click to rename">
                  {f.label}
                </span>
              )}
              <span className="folder-sub" title={f.kind === 'cloud' || f.kind === 'peer' ? `${providerLabel(f.protocol)} · ${f.connectionName || ''} (${f.path})` : f.path}>
                {f.kind === 'peer'
                  ? `RobOS P2P mTLS 1.3 · ${f.endpoint || f.path}`
                  : f.kind === 'cloud'
                    ? (f.connectionMissing ? 'Connection removed from Data Sources' : `${providerLabel(f.protocol)} · ${f.connectionName}`)
                    : (f.available ? f.path : `${f.path} (not found)`)}
              </span>
              <span className="folder-sub">
                <strong>{formatFolderMediaSummary(f)}</strong> · {when(f.lastSynced)}
              </span>
              {Array.isArray(f.shows) && f.shows.length > 0 && (
                <div className="folder-shows-breakdown">
                  {f.shows.slice(0, 4).map(s => (
                    <span key={s.showName} className="folder-show-pill">
                      📺 <strong>{s.showName}</strong>: {s.seasons.length === 1
                        ? `Season ${s.seasons[0].seasonNumber} (${s.seasons[0].episodeCount} ep${s.seasons[0].episodeCount === 1 ? '' : 's'})`
                        : `${s.seasons.length} Seasons (${s.seasons.reduce((n, sn) => n + sn.episodeCount, 0)} eps)`}
                    </span>
                  ))}
                  {f.shows.length > 4 && (
                    <span className="folder-show-pill">
                      +{f.shows.length - 4} more TV series
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="folder-actions">
            <label className="folder-sub" title="Keep this folder synced and check for updates at startup">
              <input type="checkbox" aria-label={`Keep ${f.label} synced`} checked={f.syncEnabled !== false}
                disabled={!!busyId} onChange={e => onEnabled(f.id, e.target.checked)} /> Keep synced
            </label>
            <button
              className="row-btn"
              style={f.trackCount === 0 && !f.lastSynced ? { color: '#00bcd4', borderColor: 'rgba(0,188,212,0.4)' } : undefined}
              onClick={() => onRescan(f.id)}
              disabled={!!busyId || f.connectionMissing || f.syncEnabled === false}
            >
              {busyId === f.id ? 'Syncing...' : 'Refresh'}
            </button>
            <button className="row-btn row-btn-stop" onClick={() => { setConfirmId(confirmId === f.id ? null : f.id); setAlsoTracks(true); }}>Remove</button>
          </div>
          {f.syncError && <p className="cloud-error" role="status">Could not check for updates: {f.syncError}. Existing tracks are available; refresh to retry.</p>}
          {confirmId === f.id && (
            <div className="folder-confirm">
              <label>
                <input type="checkbox" checked={alsoTracks} onChange={(e) => setAlsoTracks(e.target.checked)} />
                Also remove its {f.trackCount} video{f.trackCount === 1 ? '' : 's'} ({formatFolderMediaSummary(f)}) from the library{f.kind === 'cloud' ? ' and delete the downloaded copies' : ''}
              </label>
              <div className="folder-confirm-actions">
                <button className="btn-secondary" onClick={() => setConfirmId(null)}>Cancel</button>
                <button className="btn-accent" onClick={() => { setConfirmId(null); onRemove(f.id, alsoTracks); }}>Remove folder</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </aside>
  );
}
