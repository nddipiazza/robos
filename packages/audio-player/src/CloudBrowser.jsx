import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const formatSize = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function CloudBrowser({ onLibrary, showStatus }) {
  const [connections, setConnections] = useState(null);
  const [connId, setConnId] = useState('');
  const [listing, setListing] = useState(null); // { path, entries }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState(null);
  const importing = useRef(false);

  const loadConnections = async () => {
    const list = await window.robosAudio.cloudConnections();
    setConnections(list);
    if (list.length && !list.some(c => c.id === connId)) {
      const first = list.find(c => c.browsable);
      if (first) setConnId(first.id);
    }
  };

  useEffect(() => {
    loadConnections();
    return window.robosAudio.onCloudProgress(setProgress);
  }, []);

  const browse = async (id, p) => {
    setLoading(true);
    setError('');
    setSelected(new Set());
    const res = await window.robosAudio.cloudList(id, p);
    setLoading(false);
    if (!res.ok) { setError(res.error); setListing(null); return; }
    setListing(res);
  };

  useEffect(() => {
    if (!connId) { setListing(null); return; }
    const c = (connections || []).find(x => x.id === connId);
    browse(connId, c ? c.startPath : '/');
  }, [connId]);

  const toggle = (p) => setSelected(prev => {
    const next = new Set(prev);
    next.has(p) ? next.delete(p) : next.add(p);
    return next;
  });

  const parentPath = listing && listing.path !== '/' ? (listing.path.replace(/\/[^/]*$/, '') || '/') : null;
  const crumbs = listing ? listing.path.split('/').filter(Boolean) : [];

  const doImport = async (paths) => {
    if (importing.current || !paths.length) return;
    importing.current = true;
    setProgress({ phase: 'scanning' });
    const res = await window.robosAudio.cloudImport(connId, paths);
    importing.current = false;
    setProgress(null);
    if (!res.ok) { showStatus(`Cloud import failed: ${res.error}`); return; }
    onLibrary(res.library);
    setSelected(new Set());
    showStatus(res.added ? `Added ${res.added} track${res.added === 1 ? '' : 's'} from cloud storage to your library.` : 'No audio files found in the selection.');
  };

  const usable = (connections || []).filter(c => c.browsable);
  const other = (connections || []).filter(c => !c.browsable);

  return (
    <div className="cloud-browser">
      <div className="cloud-toolbar">
        <div className="cloud-conn">
          <label htmlFor="cloud-conn-select">Connection</label>
          <select id="cloud-conn-select" value={connId} onChange={(e) => setConnId(e.target.value)} disabled={!usable.length}>
            {!usable.length && <option value="">No Cloud Storage connections</option>}
            {usable.map(c => <option key={c.id} value={c.id}>{c.name} ({c.driverType.toUpperCase()} {c.host})</option>)}
          </select>
          <button className="btn-secondary" onClick={loadConnections}>Reload</button>
        </div>
        <div className="cloud-import-actions">
          <button className="btn-accent" disabled={!selected.size || !!progress} onClick={() => doImport([...selected])}>
            Add {selected.size ? `${selected.size} selected` : 'selected'} to library
          </button>
          {listing && (
            <button className="btn-secondary" disabled={!!progress} onClick={() => doImport([listing.path])}>
              Add this folder
            </button>
          )}
        </div>
      </div>

      {connections && !connections.length && (
        <div className="empty-state">
          <p>No cloud storage is linked yet.</p>
          <p className="hint">Open RobOS Data Sources, add a Google Drive, S3, Dropbox, SFTP, or FTP connection under Cloud &amp; Object Storage, and it will appear here.</p>
        </div>
      )}
      {other.length > 0 && (
        <p className="cloud-note">{other.map(c => c.name).join(', ')}: browsing {other.length === 1 ? 'this' : 'these'} storage type{other.length === 1 ? ' is' : 's are'} not supported yet.</p>
      )}

      {progress && (
        <div className="cloud-progress">
          {progress.phase === 'scanning' && 'Scanning remote folders...'}
          {progress.phase === 'downloading' && `Downloading ${progress.done + 1} of ${progress.total}: ${progress.name}`}
          {progress.phase === 'done' && 'Finishing up...'}
        </div>
      )}

      {listing && (
        <div className="cloud-listing">
          <div className="cloud-path">
            <button className="crumb" onClick={() => browse(connId, '/')}>root</button>
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <span className="crumb-sep">/</span>
                <button className="crumb" onClick={() => browse(connId, '/' + crumbs.slice(0, i + 1).join('/'))}>{c}</button>
              </React.Fragment>
            ))}
          </div>
          <div className="cloud-rows">
            {parentPath && (
              <div className="cloud-row" onClick={() => browse(connId, parentPath)}>
                <span className="cloud-check"></span>
                <span className="cloud-name"><Icon name="up" size={14} /> Parent folder</span>
                <span className="cloud-size"></span>
              </div>
            )}
            {listing.entries.length === 0 && <div className="cloud-empty">No folders or audio files here.</div>}
            {listing.entries.map(e => (
              <div key={e.path} className={`cloud-row ${selected.has(e.path) ? 'selected' : ''}`}
                onClick={() => e.type === 'dir' ? browse(connId, e.path) : toggle(e.path)}>
                <span className="cloud-check" onClick={(ev) => { ev.stopPropagation(); toggle(e.path); }}>
                  <input type="checkbox" readOnly checked={selected.has(e.path)} aria-label={`Select ${e.name}`} />
                </span>
                <span className="cloud-name"><Icon name={e.type === 'dir' ? 'folder' : 'note'} size={15} /> {e.name}</span>
                <span className="cloud-size">{e.type === 'dir' ? '' : formatSize(e.size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading && <div className="cloud-progress">Loading...</div>}
      {error && <div className="cloud-error">{error}</div>}
    </div>
  );
}
