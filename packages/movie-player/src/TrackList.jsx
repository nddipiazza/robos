/**
 * Multi-Column Resizable & Reorderable Movie Table for RobOS Movie Player
 *
 * Adapted from Audio Player's TrackList for movies & video libraries:
 *   - Supports drag-to-resize column widths
 *   - Supports drag-and-drop column header reordering
 *   - Supports click-to-sort ascending/descending on any column
 *   - Supports multi-row selection + context menu (Play, Add to Watchlist,
 *     AI Fix Metadata & Poster, Cast to TV, Movie Info)
 */

import React, { useState, useRef, useEffect } from 'react';
import { VirtualTable } from './virtual';
import { Icon } from './Icon';
import { CoverThumb, formatTime } from './library-ui';

const DEFAULT_COLUMNS = [
  { id: 'num', label: '#', width: 42, minWidth: 34, sortable: true, sortKey: 'trackNumber' },
  { id: 'loved', label: '♥', width: 34, minWidth: 30, sortable: false },
  { id: 'title', label: 'Movie / Episode', flex: 2.2, minWidth: 180, sortable: true, sortKey: 'title' },
  { id: 'artist', label: 'Director / Creator', flex: 1.3, minWidth: 120, sortable: true, sortKey: 'artist' },
  { id: 'album', label: 'Collection / Series', flex: 1.3, minWidth: 120, sortable: true, sortKey: 'album' },
  { id: 'genre', label: 'Genre', width: 110, minWidth: 80, sortable: true, sortKey: 'genre' },
  { id: 'year', label: 'Year', width: 64, minWidth: 52, sortable: true, sortKey: 'year' },
  { id: 'plays', label: 'Watched', width: 68, minWidth: 54, sortable: true, sortKey: 'playCount' },
  { id: 'duration', label: 'Runtime', width: 76, minWidth: 62, sortable: true, sortKey: 'duration' }
];

export function TrackList({
  tracks = [],
  currentTrack = null,
  isPlaying = false,
  sortBy = 'title',
  sortDir = 'asc',
  onChangeSort,
  onPlayTrack,
  onQueueTrack,
  onQueueTracks,
  onToggleLoved,
  onAddTrackToPlaylist,
  onFixMetadata,
  onInspectTrack,
  playlists = []
}) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [lastClickedIdx, setLastClickedIdx] = useState(-1);
  const [contextMenu, setContextMenu] = useState(null);
  const dragColId = useRef(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const handleSortClick = (col) => {
    if (!col.sortable || !onChangeSort) return;
    const key = col.sortKey || col.id;
    if (sortBy === key) {
      onChangeSort(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onChangeSort(key, 'asc');
    }
  };

  const startColumnResize = (e, colId) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const target = columns.find(c => c.id === colId);
    const initialW = target.width || 160;

    const onMove = (ev) => {
      const nextW = Math.max(target.minWidth || 40, initialW + (ev.clientX - startX));
      setColumns(prev => prev.map(c => c.id === colId ? { ...c, width: nextW, flex: undefined } : c));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleColDragStart = (colId) => {
    dragColId.current = colId;
  };

  const handleColDrop = (targetId) => {
    const fromId = dragColId.current;
    dragColId.current = null;
    if (!fromId || fromId === targetId) return;
    setColumns(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(c => c.id === fromId);
      const toIdx = next.findIndex(c => c.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  };

  const handleRowClick = (e, track, idx) => {
    if (e.shiftKey && lastClickedIdx >= 0) {
      const start = Math.min(lastClickedIdx, idx);
      const end = Math.max(lastClickedIdx, idx);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        if (tracks[i]) next.add(tracks[i].id);
      }
      setSelectedIds(next);
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(selectedIds);
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      setSelectedIds(next);
      setLastClickedIdx(idx);
    } else {
      setSelectedIds(new Set([track.id]));
      setLastClickedIdx(idx);
    }
  };

  const handleContextMenu = (e, track, idx) => {
    e.preventDefault();
    let activeSet = selectedIds;
    if (!selectedIds.has(track.id)) {
      activeSet = new Set([track.id]);
      setSelectedIds(activeSet);
      setLastClickedIdx(idx);
    }
    const selectedTracks = tracks.filter(t => activeSet.has(t.id));
    setContextMenu({
      x: Math.min(window.innerWidth - 230, e.clientX),
      y: Math.min(window.innerHeight - 280, e.clientY),
      track,
      selectedTracks: selectedTracks.length > 0 ? selectedTracks : [track]
    });
  };

  const colStyle = (col) => (col.width
    ? { width: col.width, minWidth: col.minWidth || 36, flexShrink: 0 }
    : { flex: col.flex || 1, minWidth: col.minWidth || 90 });

  const renderCell = (col, track, idx, active) => {
    switch (col.id) {
      case 'num':
        return (
          <div key="num" className="vt-cell vt-col-num" style={colStyle(col)}>
            {active ? (
              <span className="playing-eq">
                <Icon name={isPlaying ? 'volume' : 'pause'} size={13} />
              </span>
            ) : (track.trackNumber || idx + 1)}
          </div>
        );
      case 'loved':
        return (
          <div key="loved" className="vt-cell vt-col-love" style={colStyle(col)}>
            <button
              className={`love-btn ${track.loved ? 'loved' : ''}`}
              onClick={e => { e.stopPropagation(); onToggleLoved && onToggleLoved(track); }}
              title={track.loved ? 'In Watchlist (Loved)' : 'Add to Watchlist (Love)'}
            >
              <Icon name="heart" size={13} fill={track.loved ? 'currentColor' : 'none'} />
            </button>
          </div>
        );
      case 'title':
        return (
          <div key="title" className="vt-cell vt-col-title" style={colStyle(col)}>
            <CoverThumb artId={track.artId} fallback="film" className="vt-art" />
            <div className="vt-title-wrap">
              <span className="vt-title-text">{track.title}</span>
              <span className="vt-badges">
                {track.resolution && <span className="vt-cloud-pill">{track.resolution}</span>}
                {track.source === 'cloud' && <span className="vt-cloud-pill">CLOUD</span>}
                {track.hasSubtitles && <span className="vt-cloud-pill">CC</span>}
              </span>
            </div>
          </div>
        );
      case 'artist':
        return <div key="artist" className="vt-cell" style={colStyle(col)}>{track.artist}</div>;
      case 'album':
        return <div key="album" className="vt-cell" style={colStyle(col)}>{track.album}</div>;
      case 'genre':
        return <div key="genre" className="vt-cell" style={colStyle(col)}>{track.genre || '—'}</div>;
      case 'year':
        return <div key="year" className="vt-cell" style={colStyle(col)}>{track.year || '—'}</div>;
      case 'plays':
        return <div key="plays" className="vt-cell" style={colStyle(col)}>{track.playCount || 0}</div>;
      case 'duration':
        return <div key="duration" className="vt-cell" style={colStyle(col)}>{formatTime(track.duration)}</div>;
      default:
        return null;
    }
  };

  return (
    <div className="vt-wrapper">
      <div className="vt-header">
        {columns.map(col => {
          const isSorted = sortBy === (col.sortKey || col.id);
          return (
            <div
              key={col.id}
              className={`vt-hcell ${col.sortable ? 'sortable' : ''} ${isSorted ? 'sorted' : ''}`}
              style={colStyle(col)}
              draggable
              onDragStart={() => handleColDragStart(col.id)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleColDrop(col.id)}
              onClick={() => handleSortClick(col)}
            >
              <span className="vt-hcell-label">{col.label}</span>
              {isSorted && <span className="vt-sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>}
              <div
                className="vt-col-resizer"
                onMouseDown={e => startColumnResize(e, col.id)}
                onClick={e => e.stopPropagation()}
              />
            </div>
          );
        })}
        <div className="vt-hcell vt-col-actions" style={{ width: 92, flexShrink: 0 }} />
      </div>

      <VirtualTable
        items={tracks}
        rowHeight={40}
        renderRow={(track, idx) => {
          const active = currentTrack && currentTrack.id === track.id;
          const selected = selectedIds.has(track.id);
          return (
            <div
              key={track.id || idx}
              className={`vt-row ${active ? 'active' : ''} ${selected ? 'selected' : ''}`}
              onClick={e => handleRowClick(e, track, idx)}
              onDoubleClick={() => onPlayTrack(track, tracks)}
              onContextMenu={e => handleContextMenu(e, track, idx)}
            >
              {columns.map(col => renderCell(col, track, idx, active))}
              <div className="vt-cell vt-col-actions" style={{ width: 92, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button
                  className="btn-icon"
                  title="Queue Next"
                  onClick={() => onQueueTrack && onQueueTrack(track)}
                >+</button>
                <button
                  className="btn-icon"
                  title="Movie Info & Streams"
                  onClick={() => onInspectTrack && onInspectTrack(track)}
                >
                  <Icon name="info" size={14} />
                </button>
              </div>
            </div>
          );
        }}
      />

      {contextMenu && (
        <div
          className="track-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="ctx-header">
            {contextMenu.selectedTracks.length > 1
              ? `${contextMenu.selectedTracks.length} movies selected`
              : contextMenu.track.title}
          </div>
          <button
            className="ctx-item"
            onClick={() => {
              onPlayTrack(contextMenu.track, contextMenu.selectedTracks.length > 1 ? contextMenu.selectedTracks : tracks);
              setContextMenu(null);
            }}
          >
            <Icon name="play" size={13} /> Play Now
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              if (onQueueTracks) onQueueTracks(contextMenu.selectedTracks);
              else if (onQueueTrack) contextMenu.selectedTracks.forEach(t => onQueueTrack(t));
              setContextMenu(null);
            }}
          >
            <Icon name="plus" size={13} /> Add to Screening Queue
          </button>
          <button
            className="ctx-item"
            onClick={() => {
              contextMenu.selectedTracks.forEach(t => onToggleLoved && onToggleLoved(t));
              setContextMenu(null);
            }}
          >
            <Icon name="heart" size={13} /> Toggle Watchlist (Love)
          </button>
          {onFixMetadata && (
            <button
              className="ctx-item"
              onClick={() => {
                onFixMetadata(contextMenu.selectedTracks);
                setContextMenu(null);
              }}
            >
              <Icon name="sparkles" size={13} /> ✦ AI Fix Metadata &amp; Poster
            </button>
          )}
          <div className="ctx-divider" />
          <div className="ctx-sublabel">Add to Watchlist / Playlist</div>
          {playlists.map(pl => (
            <button
              key={pl.id}
              className="ctx-item"
              onClick={() => {
                contextMenu.selectedTracks.forEach(t => onAddTrackToPlaylist && onAddTrackToPlaylist(pl.id, t));
                setContextMenu(null);
              }}
            >
              <Icon name="list" size={13} /> {pl.name}
            </button>
          ))}
          <div className="ctx-divider" />
          <button
            className="ctx-item"
            onClick={() => {
              onInspectTrack && onInspectTrack(contextMenu.track);
              setContextMenu(null);
            }}
          >
            <Icon name="info" size={13} /> Movie Details &amp; Streams…
          </button>
        </div>
      )}
    </div>
  );
}
