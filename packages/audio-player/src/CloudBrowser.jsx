import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

const formatSize = (b) => (b == null ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const CACHE_LIMIT_OPTIONS = [
  { label: '250 MB', bytes: 250 * 1024 * 1024 },
  { label: '500 MB (Default)', bytes: 500 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '2 GB', bytes: 2048 * 1024 * 1024 },
  { label: '5 GB', bytes: 5120 * 1024 * 1024 },
];

export default function CloudBrowser({ onLibrary, onFolders, showStatus }) {
  const [connections, setConnections] = useState(null);
  const [connId, setConnId] = useState('');
  const [listing, setListing] = useState(null); // { path, entries }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const importing = useRef(false);

  const loadCacheStats = async () => {
    try {
      if (window.robosAudio?.cloudCacheStats) {
        setCacheStats(await window.robosAudio.cloudCacheStats());
      }
    } catch {}
  };

  const loadConnections = async () => {
    const list = await window.robosAudio.cloudConnections();
    setConnections(list);
    if (list.length && !list.some(c => c.id === connId)) {
      const first = list.find(c => c.browsable);
      if (first) setConnId(first.id);
    }
    loadCacheStats();
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
    loadCacheStats();
    showStatus(res.added ? `Indexed ${res.added} cloud track${res.added === 1 ? '' : 's'} (streamed on play, cached up to limit).` : 'No audio files found in the selection.');
  };

  const addFolder = async (p) => {
    if (importing.current) return;
    importing.current = true;
    setProgress({ phase: 'scanning' });
    const res = await window.robosAudio.addCloudFolder(connId, p);
    importing.current = false;
    setProgress(null);
    if (!res.ok) { showStatus(`Could not add folder: ${res.error}`); return; }
    onFolders(res);
    loadCacheStats();
    showStatus(`Cloud folder added: ${res.added} track${res.added === 1 ? '' : 's'} indexed for on-demand streaming.`);
  };

  const handleMaxCacheChange = async (e) => {
    const bytes = Number(e.target.value);
    if (!window.robosAudio?.cloudCacheSetMax) return;
    const stats = await window.robosAudio.cloudCacheSetMax(bytes);
    setCacheStats(stats);
    showStatus(`Cloud audio LRU cache limit set to ${formatSize(stats.maxCacheBytes)}.`);
  };

  const handleClearCache = async () => {
    if (!window.robosAudio?.cloudCacheClear) return;
    const res = await window.robosAudio.cloudCacheClear();
    setCacheStats(res);
    showStatus(`Cleared ${res.removed || 0} cached cloud audio file(s). Tracks will stream on demand when played.`);
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
            <button className="btn-secondary" disabled={!!progress} onClick={() => addFolder(listing.path)}
              title="Index this cloud folder in your library; songs stream on play and cache locally">
              Add as library folder
            </button>
          )}
        </div>
      </div>

      {cacheStats && (
        <div className="cloud-cache-bar" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '12px', padding: '8px 12px', marginBottom: '10px',
          background: 'rgba(0, 188, 212, 0.06)', border: '1px solid rgba(0, 188, 212, 0.2)',
          borderRadius: '6px', fontSize: '12px', color: '#94a3b8'
        }}>
          <div>
            <strong style={{ color: '#e2e8f0' }}>On-Demand Stream &amp; LRU Cache:</strong>{' '}
            <span>{formatSize(cacheStats.usedBytes || 0)} used of {formatSize(cacheStats.maxCacheBytes)} ({cacheStats.fileCount || 0} cached song{cacheStats.fileCount === 1 ? '' : 's'})</span>
            <span style={{ marginLeft: '8px', opacity: 0.8 }}>· Songs stream on play and evict oldest files automatically</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="cloud-cache-limit" style={{ fontSize: '11px' }}>Max Cache:</label>
            <select
              id="cloud-cache-limit"
              value={cacheStats.maxCacheBytes}
              onChange={handleMaxCacheChange}
              style={{ padding: '3px 6px', fontSize: '11px', background: '#0d1117', color: '#e2e8f0', border: '1px solid #30363d', borderRadius: '4px' }}
            >
              {CACHE_LIMIT_OPTIONS.map(opt => (
                <option key={opt.bytes} value={opt.bytes}>{opt.label}</option>
              ))}
            </select>
            <button className="btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={handleClearCache} disabled={!cacheStats.fileCount}>
              Clear Cache
            </button>
          </div>
        </div>
      )}

      {connections && !connections.length && (
        <div className="empty-state">
          <p>No cloud storage is linked yet.</p>
          <p className="hint">Open RobOS Data Sources, add a Google Drive, Microsoft OneDrive, S3, Dropbox, SFTP, or FTP connection under Cloud &amp; Object Storage, and it will appear here.</p>
        </div>
      )}
      {other.length > 0 && (
        <p className="cloud-note">{other.map(c => c.name).join(', ')}: browsing {other.length === 1 ? 'this' : 'these'} storage type{other.length === 1 ? ' is' : 's are'} not supported yet.</p>
      )}

      {progress && (
        <div className="cloud-progress">
          {progress.phase === 'scanning' && 'Indexing remote cloud metadata (no bulk download)...'}
          {progress.phase === 'downloading' && `Streaming ${progress.done + 1} of ${progress.total}: ${progress.name}`}
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
