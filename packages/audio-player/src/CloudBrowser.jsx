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
    const res = await window.robosAudio.cloudList(id, normPath);
    setLoading(false);
    if (!res.ok) { setError(res.error); setListing(null); return; }
    dirCacheRef.current.set(cacheKey, res);
    setListing(res);
  };

  const loadConnections = async (forceRefresh = false) => {
    if (forceRefresh) dirCacheRef.current.clear();
    const list = await window.robosAudio.cloudConnections();
    setConnections(list);
    if (list.length) {
      const target = list.find(c => c.id === connId && c.browsable) || list.find(c => c.browsable);
      if (target) {
        setConnId(target.id);
        browse(target.id, target.startPath || '/', forceRefresh);
      }
    }
    loadCacheStats();
  };

  useEffect(() => {
    loadConnections(false);
    return window.robosAudio.onCloudProgress(setProgress);
  }, []);

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
    const res = await window.robosAudio.addCloudFolder(targetConnId, p);
    importing.current = false;
    setProgress(null);
    if (!res.ok) { showStatus(`Could not add folder: ${res.error}`); return; }
    onFolders(res);
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

      {/* Visual Cloud Data Sources & Linked Folders Selector */}
      <div className="cloud-sources-panel" style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 style={{ fontSize: '0.95rem', margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name="cloud" size={17} />
              <span>Cloud Data Sources &amp; Linked Folders</span>
            </h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Select a linked cloud folder below to browse its music or sync it directly into your Library tab
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => loadConnections(true)} title="Reload connections and linked folders from RobOS Data Sources">
              Reload Data Sources
            </button>
            <button className="btn-accent" disabled={!selected.size || !!progress} onClick={() => doImport([...selected])}>
              Add {selected.size ? `${selected.size} selected` : 'selected'} to library
            </button>
            {listing && listing.path !== '/' && (
              <button
                className="btn-secondary"
                disabled={!!progress}
                onClick={() => addFolder(listing.path, connId)}
                title="Index this cloud folder in your library; songs stream on play and cache locally"
              >
                + Sync Current Folder to Library
              </button>
            )}
          </div>
        </div>

        {/* Data Source Cards */}
        {usable.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {usable.map(c => {
              const badge = providerBadge(c.driverType);
              const isConnActive = c.id === connId;
              const linkedFolders = Array.isArray(c.folders) ? c.folders : [];
              return (
                <div
                  key={c.id}
                  style={{
                    background: 'var(--bg-primary)',
                    border: `1px solid ${isConnActive ? 'rgba(232, 163, 61, 0.45)' : 'var(--border-color)'}`,
                    borderRadius: '6px',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                      onClick={() => browse(c.id, '/')}
                    >
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        color: badge.color,
                        background: badge.bg,
                        border: `1px solid ${badge.color}33`
                      }}>
                        {badge.label}
                      </span>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>{c.name}</strong>
                      {c.user && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({c.user})</span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                      {linkedFolders.length} linked folder{linkedFolders.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {/* Interactive Linked Folder Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                    {linkedFolders.length > 1 && (
                      <div
                        onClick={() => browse(c.id, '/')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: (isConnActive && currentPath === '/') ? 'rgba(232, 163, 61, 0.14)' : 'var(--bg-secondary)',
                          border: `1px solid ${(isConnActive && currentPath === '/') ? 'var(--accent)' : 'var(--border-color)'}`,
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Icon name="folder" size={16} />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              All Linked Folders ({linkedFolders.length})
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Overview of all linked folders
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {linkedFolders.map(lf => {
                      const isFolderSelected = isConnActive && (
                        currentPath === lf.remotePath ||
                        currentPath.startsWith(lf.remotePath + '/') ||
                        (linkedFolders.length === 1 && currentPath === '/')
                      );
                      return (
                        <div
                          key={lf.id || lf.remotePath}
                          onClick={() => browse(c.id, lf.remotePath)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                            padding: '8px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            background: isFolderSelected ? 'rgba(232, 163, 61, 0.14)' : 'var(--bg-secondary)',
                            border: `1px solid ${isFolderSelected ? 'var(--accent)' : 'var(--border-color)'}`,
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <Icon name="folder" size={16} />
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                              <span
                                style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                title={lf.label}
                              >
                                {lf.label}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {lf.remotePath}
                              </span>
                            </div>
                          </div>
                          <button
                            className="row-btn"
                            style={{ flexShrink: 0, fontSize: '0.72rem', padding: '3px 8px' }}
                            disabled={!!progress}
                            title={`Sync "${lf.label}" into your Library`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              addFolder(lf.remotePath, c.id);
                            }}
                          >
                            Sync
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                <span className="cloud-check" onClick={(ev) => { ev.stopPropagation(); toggle(e.path); }}>
                  <input type="checkbox" readOnly checked={selected.has(e.path)} aria-label={`Select ${e.name}`} />
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
