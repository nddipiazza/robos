/**
 * Cloud Storage Browser & LRU Stream Cache Manager for RobOS Movie Player
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { formatBytes } from './library-ui';

const CACHE_BUDGET_PRESETS = [
  { label: '512 MB', bytes: 512 * 1024 * 1024 },
  { label: '1 GB', bytes: 1024 * 1024 * 1024 },
  { label: '2 GB', bytes: 2 * 1024 * 1024 * 1024 },
  { label: '5 GB', bytes: 5 * 1024 * 1024 * 1024 },
  { label: '10 GB', bytes: 10 * 1024 * 1024 * 1024 }
];

export function CloudBrowser({
  cloudSources = [],
  cloudCache = null,
  onIndexCloudSource,
  onRemoveCloudSourceTracks,
  onPlayCloudItem,
  onOpenDataSources,
  onRefreshCloudSources
}) {
  const [selectedSourceId, setSelectedSourceId] = useState(() => (cloudSources[0] ? cloudSources[0].id : null));
  const [remotePath, setRemotePath] = useState('/');
  const [listing, setListing] = useState({ items: [], mode: '', hint: '' });
  const [loading, setLoading] = useState(false);
  const [indexingId, setIndexingId] = useState(null);
  const [indexProgress, setIndexProgress] = useState(null);
  const [cacheState, setCacheState] = useState(cloudCache);

  useEffect(() => {
    setCacheState(cloudCache);
  }, [cloudCache]);

  useEffect(() => {
    if (!selectedSourceId && cloudSources.length > 0) {
      setSelectedSourceId(cloudSources[0].id);
    }
  }, [cloudSources]);

  useEffect(() => {
    if (!window.robosAudio || !window.robosAudio.onCloudIndexProgress) return undefined;
    return window.robosAudio.onCloudIndexProgress(prog => setIndexProgress(prog));
  }, []);

  const loadFolder = async (sourceId, targetPath = '/') => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const res = await window.robosAudio.browseCloud(sourceId, targetPath);
      setRemotePath(targetPath);
      setListing(res || { items: [], mode: '' });
    } catch (err) {
      setListing({ items: [], mode: 'error', hint: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSourceId) {
      loadFolder(selectedSourceId, '/');
    }
  }, [selectedSourceId]);

  const handleIndex = async (sourceId, folderPath = '/') => {
    setIndexingId(sourceId);
    setIndexProgress({ sourceId, indexed: 0, currentPath: folderPath });
    try {
      await onIndexCloudSource(sourceId, folderPath);
    } finally {
      setIndexingId(null);
      setIndexProgress(null);
    }
  };

  const handleChangeBudget = async (bytes) => {
    const next = await window.robosAudio.setCloudCacheMaxBytes(bytes);
    setCacheState(next);
  };

  const handleClearCache = async () => {
    const next = await window.robosAudio.clearCloudCache();
    setCacheState(next);
  };

  const breadcrumbs = remotePath.split('/').filter(Boolean);

  return (
    <div className="cloud-view">
      <div className="section-header">
        <div>
          <h2>Cloud Cinema Storage (Google Drive / OneDrive / Dropbox / S3)</h2>
          <p className="muted">
            Index 50,000+ cloud movies by metadata only — video streams on-demand over HTTP Range with bounded LRU disk caching.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn btn-sm" onClick={onRefreshCloudSources}>
            <Icon name="refresh" size={14} /> Refresh Sources
          </button>
          <button
            className="btn btn-sm"
            onClick={() => window.robosAudio.openCloudAccountsApp && window.robosAudio.openCloudAccountsApp()}
            title="Sign in to Google Drive or OneDrive in RobOS Cloud Accounts"
          >
            <Icon name="cloud" size={14} /> Cloud Accounts
          </button>
          <button className="btn btn-sm btn-accent" onClick={onOpenDataSources}>
            <Icon name="plus" size={14} /> Configure in Data Sources
          </button>
        </div>
      </div>

      {cacheState && (
        <div className="cloud-cache-bar">
          <div className="cloud-cache-info">
            <span className="pill">On-Demand Video LRU Cache</span>
            <span>
              <strong>{formatBytes(cacheState.usedBytes)}</strong> / {formatBytes(cacheState.maxBytes)} used
              ({cacheState.fileCount || 0} cached movies)
            </span>
          </div>
          <div className="cloud-cache-controls">
            <label className="muted" style={{ fontSize: 11 }}>Max Budget:</label>
            <select
              className="select-sm"
              value={cacheState.maxBytes}
              onChange={e => handleChangeBudget(Number(e.target.value))}
            >
              {CACHE_BUDGET_PRESETS.map(p => (
                <option key={p.bytes} value={p.bytes}>{p.label}</option>
              ))}
            </select>
            <button className="btn btn-xs" onClick={handleClearCache}>
              Clear Cache
            </button>
          </div>
        </div>
      )}

      {indexProgress && (
        <div className="scan-progress-banner">
          <span>
            Indexing <strong>{indexProgress.sourceId}</strong>: {indexProgress.indexed} movies discovered
            ({indexProgress.currentPath})
          </span>
        </div>
      )}

      <div className="cloud-split">
        <div className="cloud-sources-col">
          {cloudSources.length === 0 ? (
            <div className="empty-state">
              No cloud sources found in <code>~/.config/robos/data-sources.json</code>.
            </div>
          ) : (
            cloudSources.map(src => (
              <div
                key={src.id}
                className={`cloud-source-card ${selectedSourceId === src.id ? 'active' : ''}`}
                onClick={() => setSelectedSourceId(src.id)}
              >
                <div className="cloud-source-top">
                  <span className="cloud-type-badge">{src.type}</span>
                  <span className={`status-dot ${src.status === 'connected' ? 'online' : ''}`} />
                </div>
                <div className="cloud-source-name">{src.name}</div>
                <div className="cloud-source-desc">{src.description || src.id}</div>
                <div className="cloud-source-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-xs btn-accent"
                    disabled={indexingId === src.id}
                    onClick={() => handleIndex(src.id, '/')}
                  >
                    {indexingId === src.id ? 'Indexing…' : 'Index Movies'}
                  </button>
                  <button
                    className="btn btn-xs"
                    onClick={() => onRemoveCloudSourceTracks(src.id)}
                  >
                    Purge Index
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="cloud-browser-col">
          <div className="cloud-breadcrumb-bar">
            <div className="cloud-breadcrumbs">
              <button className="crumb-btn" onClick={() => loadFolder(selectedSourceId, '/')}>root</button>
              {breadcrumbs.map((part, idx) => {
                const sub = '/' + breadcrumbs.slice(0, idx + 1).join('/');
                return (
                  <React.Fragment key={sub}>
                    <span className="crumb-sep">/</span>
                    <button className="crumb-btn" onClick={() => loadFolder(selectedSourceId, sub)}>
                      {part}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            {selectedSourceId && (
              <button
                className="btn btn-xs btn-accent"
                disabled={indexingId !== null}
                onClick={() => handleIndex(selectedSourceId, remotePath)}
              >
                Index This Folder
              </button>
            )}
          </div>

          {listing.hint && (
            <div className="cloud-hint-banner">{listing.hint}</div>
          )}

          <div className="cloud-file-list">
            {loading ? (
              <div className="empty-state">Browsing remote folder…</div>
            ) : (listing.items || []).length === 0 ? (
              <div className="empty-state">No movie files or subfolders found at this path.</div>
            ) : (
              listing.items.map(item => (
                <div
                  key={item.path}
                  className="cloud-file-row"
                  onDoubleClick={() => {
                    if (item.type === 'folder') loadFolder(selectedSourceId, item.path);
                    else if (onPlayCloudItem) onPlayCloudItem(selectedSourceId, item);
                  }}
                >
                  <span className="cloud-file-icon">
                    <Icon name={item.type === 'folder' ? 'folder' : 'film'} size={15} />
                  </span>
                  <span className="cloud-file-name">{item.name}</span>
                  <span className="cloud-file-size">
                    {item.type === 'folder' ? 'Folder' : formatBytes(item.size)}
                  </span>
                  <div className="cloud-file-btns">
                    {item.type === 'folder' ? (
                      <>
                        <button className="btn btn-xs" onClick={() => loadFolder(selectedSourceId, item.path)}>
                          Open
                        </button>
                        <button className="btn btn-xs btn-accent" onClick={() => handleIndex(selectedSourceId, item.path)}>
                          Index
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-xs btn-accent"
                        onClick={() => onPlayCloudItem && onPlayCloudItem(selectedSourceId, item)}
                      >
                        Stream
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
