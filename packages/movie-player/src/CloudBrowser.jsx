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

const providerBadge = (driverType) => {
  const d = (driverType || '').toLowerCase();
  if (d === 'gdrive') return { label: 'Google Drive', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)' };
  if (d === 'onedrive') return { label: 'OneDrive', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.12)' };
  if (d === 'dropbox') return { label: 'Dropbox', color: '#818cf8', bg: 'rgba(129, 140, 248, 0.12)' };
  if (d === 's3') return { label: 'Amazon S3', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)' };
  return { label: (driverType || 'Cloud').toUpperCase(), color: '#e8a33d', bg: 'rgba(232, 163, 61, 0.12)' };
};

export default function CloudBrowser({ onLibrary, onFolders, showStatus, folders = [], onEnabled, onRescan, busyId }) {
  const [connections, setConnections] = useState(null);
  const [connId, setConnId] = useState('');
  const [listing, setListing] = useState(null); // { path, entries }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [progress, setProgress] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const importing = useRef(false);
  const dirCacheRef = useRef(new Map());

  const loadCacheStats = async () => {
    try {
      if (window.robosAudio?.cloudCacheStats) {
        setCacheStats(await window.robosAudio.cloudCacheStats());
      }
    } catch {}
  };

  const browse = async (id, p, force = false) => {
    if (!id) return;
    if (id !== connId) setConnId(id);
    const normPath = p || '/';
    const cacheKey = `${id}::${normPath}`;
    if (!force && dirCacheRef.current.has(cacheKey)) {
      setError('');
      setSelected(new Set());
      setListing(dirCacheRef.current.get(cacheKey));
      return;
    }
    setLoading(true);
    setError('');
    setSelected(new Set());
    const res = await window.robosAudio.cloudList(id, normPath, force);
    setLoading(false);
    if (!res.ok) { setError(res.error); setListing(null); return; }
    dirCacheRef.current.set(cacheKey, res);
    setListing(res);
  };

  const loadConnections = async (forceRefresh = false) => {
    if (forceRefresh) dirCacheRef.current.clear();
    const list = await window.robosAudio.cloudConnections();
    // A folder linked through duplicate Google connections gets one choice.
    const seen = new Set();
    const unique = list.map(c => ({ ...c, folders: (c.folders || []).filter(f => {
      if (!f.cloudKey || !f.cloudKey.startsWith('gdrive:')) return true;
      if (seen.has(f.cloudKey)) return false;
      seen.add(f.cloudKey); return true;
    }) })).filter((c, i) => !list[i].folders?.length || c.folders.length);
    setConnections(unique);
    if (list.length) {
      const target = unique.find(c => c.id === connId && c.browsable) || unique.find(c => c.browsable);
      if (target) {
        setConnId(target.id);
        browse(target.id, target.startPath || '/', forceRefresh);
      }
    }
    loadCacheStats();
  };

  useEffect(() => {
    loadConnections(false);
    return window.robosAudio.onCloudProgress(p => setProgress(p.phase === 'done' ? null : p));
  }, []);

  useEffect(() => { setProgress(null); }, [folders]);

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

  const addFolder = async (p, targetConnId = connId) => {
    if (importing.current) return;
    importing.current = true;
    setProgress({ phase: 'scanning' });
    let res;
    try { res = await window.robosAudio.addCloudFolder(targetConnId, p); }
    catch (err) { res = { ok: false, error: err.message }; }
    importing.current = false;
    setProgress(null);
    onFolders(res);
    if (!res.ok) { showStatus(`Could not add folder: ${res.error}`); return; }
    loadCacheStats();
    showStatus(`Cloud folder synced: ${res.added} track${res.added === 1 ? '' : 's'} indexed for on-demand streaming.`);
  };

  const handleMaxCacheChange = async (e) => {
    const bytes = Number(e.target.value);
    if (!window.robosAudio?.cloudCacheSetMax) return;
    const stats = await window.robosAudio.cloudCacheSetMax(bytes);
    setCacheStats(stats);
    showStatus(`Cloud audio LRU cache limit set to ${formatSize(stats.maxCacheBytes)}.`);
  };

  const refreshFolder = async (id) => {
    await onRescan(id);
    dirCacheRef.current.clear();
    if (listing) await browse(connId, listing.path, true);
  };

  const handleClearCache = async () => {
    if (!window.robosAudio?.cloudCacheClear) return;
    const res = await window.robosAudio.cloudCacheClear();
    setCacheStats(res);
    showStatus(`Cleared ${res.removed || 0} cached cloud audio file(s). Tracks will stream on demand when played.`);
  };

  const usable = (connections || []).filter(c => c.browsable);
  const other = (connections || []).filter(c => !c.browsable);
  const activeConn = usable.find(c => c.id === connId) || usable[0] || null;
  const currentPath = listing ? listing.path : '/';

  return (
    <div className="cloud-browser">
      {/* Hidden select preserved for automated test selectors */}
      <select
        id="cloud-conn-select"
        style={{ display: 'none' }}
        value={connId}
        onChange={(e) => setConnId(e.target.value)}
        disabled={!usable.length}
      >
        {!usable.length && <option value="">No Cloud Storage connections</option>}
        {usable.map(c => <option key={c.id} value={c.id}>{c.name} ({c.driverType.toUpperCase()})</option>)}
      </select>

      <section className="cloud-sync-panel" aria-label="Cloud folder sync settings">
        <header className="cloud-sync-heading">
          <div><h3><Icon name="cloud" size={20} /> Your cloud &amp; SFTP movies</h3>
            <p>Choose the folders to keep synced. Checked folders are saved and checked for updates every time Movie Player starts.</p></div>
          <button className="btn-secondary" onClick={() => loadConnections(true)}>Reload Data Sources</button>
        </header>
        <p className="cloud-sync-summary">{folders.filter(f => f.kind === 'cloud' && f.syncEnabled !== false).length} cloud folders selected · Movies stream on demand when played</p>
        {usable.map(c => {
          const badge = providerBadge(c.driverType);
          const linked = c.folders || [];
          const rows = [...linked.map(lf => ({ ...lf, saved: folders.find(f => f.cloudKey === lf.cloudKey) })),
            ...folders.filter(f => f.kind === 'cloud' && f.connectionId === c.id && !linked.some(lf => lf.cloudKey === f.cloudKey))
              .map(f => ({ label: f.label, remotePath: f.path, cloudKey: f.cloudKey, saved: f }))];
          return <div className="cloud-sync-source" key={c.id}>
            <div className="cloud-sync-source-head"><span style={{ color: badge.color }}>{badge.label}</span>
              <strong>{c.name}</strong>{c.user && <span>{c.user}</span>}
              <button className="row-btn" onClick={() => browse(c.id, c.startPath || '/')}>Browse folders</button>
            </div>
            {rows.map(lf => {
              const f = lf.saved;
              const checked = !!f && f.syncEnabled !== false;
              const busy = !!progress || !!busyId;
              return <div className="cloud-sync-folder" key={lf.cloudKey || lf.remotePath}>
                <label className="cloud-sync-choice">
                  <input type="checkbox" aria-label={'Keep ' + lf.label + ' synced'} checked={checked} disabled={busy}
                    onChange={e => f ? onEnabled(f.id, e.target.checked) : addFolder(lf.remotePath, c.id)} />
                  <span><strong>{lf.label}</strong><small>{checked ? 'Kept in sync · checks at startup' : 'Sync paused'} · {lf.remotePath}</small>
                    {f && <small>{f.trackCount} tracks · {f.lastSynced ? 'Last synced ' + new Date(f.lastSynced).toLocaleString() : 'Not synced yet'}</small>}
                    {f?.syncError && <small className="cloud-error">{f.syncError} · Refresh to retry</small>}
                  </span>
                </label>
                <button className="btn-secondary" disabled={busy || !checked} onClick={() => refreshFolder(f.id)}
                  aria-label={'Refresh ' + lf.label}>{busyId === f?.id ? 'Syncing…' : 'Refresh'}</button>
                <button className="row-btn" onClick={() => browse(c.id, lf.remotePath)}>Browse</button>
              </div>;
            })}
            {!rows.length && <p className="cloud-sync-hint">Browse this source and choose a folder to keep synced.</p>}
          </div>;
        })}
      </section>

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
          <div className="cloud-sync-heading">
            <button className="btn-accent" disabled={!selected.size || !!progress} onClick={() => doImport([...selected])}>Add selected movies</button>
            <button className="btn-secondary" disabled={!!progress || !!busyId} onClick={() => addFolder(listing.path, connId)}>Keep this folder synced</button>
          </div>
          <div className="cloud-path">
            <button className="crumb" onClick={() => browse(connId, '/')}>
              {activeConn && Array.isArray(activeConn.folders) && activeConn.folders.length === 1
                ? activeConn.folders[0].label
                : 'Linked Folders'}
            </button>
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
                <span className="cloud-check" onClick={(ev) => ev.stopPropagation()}>
                  <input type="checkbox" checked={e.type === 'dir'
                    ? folders.some(f => f.connectionId === connId && f.path === e.path && f.syncEnabled !== false)
                    : selected.has(e.path)} disabled={e.type === 'dir' && (!!progress || !!busyId)}
                    onChange={ev => {
                      if (e.type !== 'dir') { toggle(e.path); return; }
                      const folder = folders.find(f => f.connectionId === connId && f.path === e.path);
                      folder ? onEnabled(folder.id, ev.target.checked) : addFolder(e.path, connId);
                    }} aria-label={e.type === 'dir' ? `Keep ${e.name} synced` : `Select ${e.name}`} />
                </span>
                <span className="cloud-name"><Icon name={e.type === 'dir' ? 'folder' : 'note'} size={15} /> {e.name}</span>
                <span className="cloud-size">
                  {e.type === 'dir' ? (
                    <button
                      className="row-btn"
                      style={{ fontSize: '0.7rem', padding: '2px 7px' }}
                      disabled={!!progress}
                      title={`Sync folder "${e.name}" to Library`}
                      onClick={(ev) => { ev.stopPropagation(); addFolder(e.path, connId); }}
                    >
                      + Library
                    </button>
                  ) : formatSize(e.size)}
                </span>
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
