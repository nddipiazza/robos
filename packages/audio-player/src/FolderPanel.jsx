import React, { useState } from 'react';
import { Icon } from './Icon.jsx';

const when = (iso) => {
  if (!iso) return 'Not indexed yet';
  const d = new Date(iso);
  return `Synced ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};

const providerLabel = (protocol) => {
  const p = (protocol || '').toLowerCase();
  if (p === 'gdrive') return 'Google Drive';
  if (p === 'onedrive') return 'OneDrive';
  if (p === 'dropbox') return 'Dropbox';
  if (p === 's3') return 'S3';
  return p ? p.toUpperCase() : 'Cloud';
};

export default function FolderPanel({ folders, activeId, onSelect, onAddLocal, onAddCloud, onRescan, onRename, onRemove, busyId }) {
  const [confirmId, setConfirmId] = useState(null);
  const [alsoTracks, setAlsoTracks] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const commitRename = (id) => {
    if (editValue.trim()) onRename(id, editValue);
    setEditId(null);
  };

  return (
    <aside className="folder-panel">
      <div className="folder-panel-head">
        <span>Library Folders ({folders.length})</span>
        <div className="folder-head-actions">
          <button className="row-btn" title="Add a folder from this computer" onClick={onAddLocal}>+ Local</button>
          <button className="row-btn" title="Browse Cloud Storage folders" onClick={onAddCloud}>+ Cloud</button>
          <button className="row-btn" title="Rescan and sync every folder" onClick={() => onRescan(null)} disabled={!folders.length}>Sync all</button>
        </div>
      </div>

      <div className={`folder-row ${activeId === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <Icon name="library" size={15} />
        <div className="folder-text">
          <span className="folder-name">All Library Tracks</span>
          <span className="folder-sub">Combined view across all folders</span>
        </div>
      </div>

      {folders.length === 0 && (
        <p className="folder-empty">No folders linked yet. Add a local folder or link folders in RobOS Data Sources (Google Drive, OneDrive, SFTP, FTP).</p>
      )}

      {folders.map(f => (
        <div key={f.id} className={`folder-item ${activeId === f.id ? 'active' : ''} ${f.available ? '' : 'unavailable'}`}>
          <div className="folder-row" onClick={() => onSelect(f.id)}>
            <Icon name={f.kind === 'cloud' ? 'cloud' : 'folder'} size={15} />
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
              <span className="folder-sub" title={f.kind === 'cloud' ? `${providerLabel(f.protocol)} · ${f.connectionName || ''} (${f.path})` : f.path}>
                {f.kind === 'cloud'
                  ? (f.connectionMissing ? 'Connection removed from Data Sources' : `${providerLabel(f.protocol)} · ${f.connectionName}`)
                  : (f.available ? f.path : `${f.path} (not found)`)}
              </span>
              <span className="folder-sub">
                <strong>{f.trackCount} track{f.trackCount === 1 ? '' : 's'}</strong> · {when(f.lastSynced)}
              </span>
            </div>
          </div>
          <div className="folder-actions">
            <button
              className="row-btn"
              style={f.trackCount === 0 && !f.lastSynced ? { color: '#00bcd4', borderColor: 'rgba(0,188,212,0.4)' } : undefined}
              onClick={() => onRescan(f.id)}
              disabled={busyId === f.id || f.connectionMissing}
            >
              {busyId === f.id ? 'Syncing...' : (f.trackCount === 0 && !f.lastSynced ? 'Sync Tracks' : 'Sync')}
            </button>
            <button className="row-btn row-btn-stop" onClick={() => { setConfirmId(confirmId === f.id ? null : f.id); setAlsoTracks(true); }}>Remove</button>
          </div>
          {confirmId === f.id && (
            <div className="folder-confirm">
              <label>
                <input type="checkbox" checked={alsoTracks} onChange={(e) => setAlsoTracks(e.target.checked)} />
                Also remove its {f.trackCount} track{f.trackCount === 1 ? '' : 's'} from the library{f.kind === 'cloud' ? ' and delete the downloaded copies' : ''}
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
