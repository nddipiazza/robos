/**
 * Managed Library Folders Panel for RobOS Movie Player
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { formatBytes, formatTime } from './library-ui';

export function FolderManagerPanel({
  onSelectFolder,
  onLibraryChanged
}) {
  const [folders, setFolders] = useState([]);
  const [busyPath, setBusyPath] = useState(null);

  const refresh = async () => {
    const list = await window.robosAudio.listLibraryFolders();
    setFolders(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleAdd = async () => {
    setBusyPath('__adding__');
    try {
      const res = await window.robosAudio.addLibraryFolder();
      if (res && res.folders) {
        setFolders(res.folders);
        if (onLibraryChanged && res.library) onLibraryChanged(res.library);
      }
    } finally {
      setBusyPath(null);
    }
  };

  const handleRemove = async (dirPath) => {
    setBusyPath(dirPath);
    try {
      const res = await window.robosAudio.removeLibraryFolder(dirPath);
      if (res && res.folders) {
        setFolders(res.folders);
        if (onLibraryChanged && res.library) onLibraryChanged(res.library);
      }
    } finally {
      setBusyPath(null);
    }
  };

  const handleRescan = async (dirPath = null) => {
    setBusyPath(dirPath || '__all__');
    try {
      const res = await window.robosAudio.rescanLibraryFolder(dirPath);
      if (res && res.folders) {
        setFolders(res.folders);
        if (onLibraryChanged && res.library) onLibraryChanged(res.library);
      }
    } finally {
      setBusyPath(null);
    }
  };

  return (
    <div className="folder-manager-panel">
      <div className="folder-manager-header">
        <div>
          <h4>Watched Movie &amp; Video Folders</h4>
          <p className="muted">
            Folders scanned in the background for movies, series episodes, and sidecar subtitles.
          </p>
        </div>
        <div className="folder-manager-actions">
          <button
            className="btn btn-sm"
            disabled={busyPath !== null}
            onClick={() => handleRescan(null)}
          >
            <Icon name="refresh" size={14} /> Rescan All
          </button>
          <button
            className="btn btn-sm btn-accent"
            disabled={busyPath !== null}
            onClick={handleAdd}
          >
            <Icon name="plus" size={14} /> Add Folder
          </button>
        </div>
      </div>

      <div className="folder-cards-list">
        {folders.length === 0 ? (
          <div className="empty-state">
            No library folders configured. Click <strong>Add Folder</strong> to index local movies and videos.
          </div>
        ) : (
          folders.map(f => (
            <div key={f.path} className="folder-managed-card">
              <div className="folder-managed-main" onClick={() => onSelectFolder && onSelectFolder(f.path)}>
                <div className="folder-managed-icon">
                  <Icon name="folder" size={20} />
                </div>
                <div className="folder-managed-info">
                  <div className="folder-managed-title">
                    <span>{f.label}</span>
                    {!f.exists && <span className="pill pill-warn">Missing on disk</span>}
                  </div>
                  <div className="folder-managed-path">{f.path}</div>
                  <div className="folder-managed-stats">
                    <span>{(f.trackCount || 0).toLocaleString()} movies/videos</span>
                    <span>•</span>
                    <span>{formatBytes(f.totalBytes || 0)}</span>
                    <span>•</span>
                    <span>{formatTime(f.totalDuration || 0)}</span>
                    {f.lastScanAt && (
                      <>
                        <span>•</span>
                        <span>Scanned {new Date(f.lastScanAt).toLocaleTimeString()}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="folder-managed-btns">
                <button
                  className="btn btn-xs"
                  onClick={() => onSelectFolder && onSelectFolder(f.path)}
                  title="Browse movies in this folder"
                >
                  Browse
                </button>
                <button
                  className="btn btn-xs"
                  disabled={busyPath !== null}
                  onClick={() => handleRescan(f.path)}
                  title="Rescan this folder"
                >
                  {busyPath === f.path ? 'Scanning…' : 'Rescan'}
                </button>
                <button
                  className="btn btn-xs btn-danger"
                  disabled={busyPath !== null}
                  onClick={() => handleRemove(f.path)}
                  title="Remove folder and its movies from library"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
