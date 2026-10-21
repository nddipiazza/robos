import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useViewport, scrollRootTo } from './virtual.jsx';
import { Icon } from './Icon.jsx';
import { formatDuration } from '../lib/library-index.js';
import { useLibrary, sameTrack, trackMenuItems, collectionMenuItems, LoveButton, Cover, useStableArray, TRACK_DRAG_TYPE } from './library-ui.jsx';

// Must match `.tl-row` / `.tl-disc` height in style.css: rows are absolutely
// positioned so only the visible slice of a 100k-track list is in the DOM.
const ROW_HEIGHT = 44;
const OVERSCAN_PX = 500;
const HEADER_HEIGHT = 30;

const relativeDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString();
};

// Column sets. `album` numbers rows by track number and hides the album column.
const COLUMNS = {
  full: ['num', 'love', 'title', 'album', 'year', 'genre', 'plays', 'duration', 'more'],
  album: ['num', 'love', 'title', 'plays', 'duration', 'more'],
  compact: ['num', 'art', 'title', 'album', 'plays', 'duration', 'more'],
};

const HEADERS = {
  num: { label: '#', sort: null },
  love: { label: '', sort: 'loved' },
  art: { label: '', sort: null },
  title: { label: 'Title', sort: 'title' },
  album: { label: 'Album', sort: 'album' },
  year: { label: 'Year', sort: 'year' },
  genre: { label: 'Genre', sort: 'genre' },
  plays: { label: 'Plays', sort: 'plays' },
  added: { label: 'Added', sort: 'addedAt' },
  lastPlayed: { label: 'Last played', sort: 'lastPlayed' },
  duration: { label: 'Time', sort: 'duration' },
  more: { label: '', sort: null },
};

/**
 * Library track table.
 *  - double-click / Enter plays the list starting at that row
 *  - click, Ctrl/⌘-click and Shift-click select; Ctrl+A selects everything
 *  - right-click or ⋯ opens the track menu; rows drag onto the Now Playing panel
 */
export default function TrackList({
  tracks: rawTracks,
  variant = 'full',
  extraColumn = null,      // 'added' | 'lastPlayed'
  sort = null,             // { key, dir } — headers are clickable when onSort is given
  onSort = null,
  albumArtist = null,      // in album view, only show a row's artist if it differs
  showDiscs = false,
  emptyText = 'No tracks here yet.',
  id,
}) {
  const tracks = useStableArray(rawTracks);
  const ctx = useLibrary();
  const { stats, currentTrack, isPlaying, actions, openMenu } = ctx;
  const [selected, setSelected] = useState(() => new Set());
  const anchorRef = useRef(null);
  const listRef = useRef(null);
  const view = useViewport(listRef, tracks.length > 0);

  // Disc headings occupy a row of their own; without them row i is track i.
  const discRows = useMemo(() => {
    if (!showDiscs) return null;
    const rows = [];
    let last = null;
    tracks.forEach((t, idx) => {
      const disc = t.discNumber || 1;
      if (disc !== last) { rows.push({ disc }); last = disc; }
      rows.push({ idx });
    });
    return rows;
  }, [tracks, showDiscs]);
  const rowCount = discRows ? discRows.length : tracks.length;
  const rowOfTrack = (idx) => (discRows ? discRows.findIndex(r => r.idx === idx) : idx);

  const ensureVisible = (idx) => {
    if (!view) return;
    const y = rowOfTrack(idx) * ROW_HEIGHT;
    if (y < view.top + HEADER_HEIGHT) scrollRootTo(view, listRef, y, HEADER_HEIGHT + 8);
    else if (y + ROW_HEIGHT > view.bottom) scrollRootTo(view, listRef, y + ROW_HEIGHT, view.bottom - view.top);
  };

  useEffect(() => { setSelected(new Set()); anchorRef.current = null; }, [tracks]);

  const columns = useMemo(() => {
    const cols = [...COLUMNS[variant]];
    if (extraColumn) cols.splice(cols.indexOf('duration'), 0, extraColumn);
    return cols;
  }, [variant, extraColumn]);

  const selectedTracks = () => [...selected].sort((a, b) => a - b).map(i => tracks[i]).filter(Boolean);

  const handleClick = (e, idx) => {
    const next = new Set(e.ctrlKey || e.metaKey ? selected : []);
    if (e.shiftKey && anchorRef.current != null) {
      const [a, b] = [Math.min(anchorRef.current, idx), Math.max(anchorRef.current, idx)];
      for (let i = a; i <= b; i++) next.add(i);
    } else if ((e.ctrlKey || e.metaKey) && next.has(idx)) {
      next.delete(idx);
      anchorRef.current = idx;
    } else {
      next.add(idx);
      anchorRef.current = idx;
    }
    setSelected(next);
  };

  const handleContextMenu = (e, idx) => {
    e.preventDefault();
    let sel = selected;
    if (!sel.has(idx)) {
      sel = new Set([idx]);
      setSelected(sel);
      anchorRef.current = idx;
    }
    const chosen = [...sel].sort((a, b) => a - b).map(i => tracks[i]);
    openMenu(e, trackMenuItems(chosen, ctx, { allTracks: tracks, index: idx }));
  };

  const handleKeyDown = (e) => {
    if (e.target !== listRef.current) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(tracks.map((_, i) => i)));
    } else if (e.key === 'Escape') {
      setSelected(new Set());
    } else if (e.key === 'Enter' && selected.size) {
      e.preventDefault();
      const first = Math.min(...selected);
      if (selected.size === 1) actions.playTracks(tracks, first);
      else actions.playTracks(selectedTracks(), 0);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cur = anchorRef.current == null ? -1 : anchorRef.current;
      const nextIdx = Math.max(0, Math.min(tracks.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
      anchorRef.current = nextIdx;
      setSelected(new Set([nextIdx]));
      ensureVisible(nextIdx);
    }
  };

  const handleDragStart = (e, idx) => {
    const chosen = selected.has(idx) ? selectedTracks() : [tracks[idx]];
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(TRACK_DRAG_TYPE, JSON.stringify(chosen));
    e.dataTransfer.setData('text/plain', chosen.map(t => `${t.artist} – ${t.title}`).join('\n'));
  };

  if (!tracks.length) return <div className="empty-inline">{emptyText}</div>;

  const header = (
    <div className={`tl-row tl-head tl-${variant}`} style={{ gridTemplateColumns: gridFor(columns) }}>
      {columns.map(col => {
        const h = HEADERS[col];
        const sortable = onSort && h.sort;
        const active = sort && sort.key === h.sort;
        return sortable ? (
          <button key={col} className={`tl-cell tl-${col} tl-sort ${active ? 'active' : ''}`} onClick={() => onSort(h.sort)}>
            {col === 'love' ? <Icon name="heart" size={12} /> : h.label}
            {active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
          </button>
        ) : <span key={col} className={`tl-cell tl-${col}`}>{h.label}</span>;
      })}
    </div>
  );

  // Visible slice; before the first measurement only a screenful is rendered.
  const firstRow = view ? Math.max(0, Math.floor((view.top - OVERSCAN_PX) / ROW_HEIGHT)) : 0;
  const lastRow = view ? Math.min(rowCount, Math.ceil((view.bottom + OVERSCAN_PX) / ROW_HEIGHT)) : Math.min(rowCount, 40);
  const template = gridFor(columns);
  const rows = [];
  for (let r = firstRow; r < lastRow; r++) {
    const top = r * ROW_HEIGHT;
    const entry = discRows ? discRows[r] : null;
    if (entry && entry.disc != null) {
      rows.push(<div key={`disc-${entry.disc}`} className="tl-disc" style={{ top }}><Icon name="disc" size={13} /> Disc {entry.disc}</div>);
      continue;
    }
    const idx = entry ? entry.idx : r;
    const t = tracks[idx];
    const isCurrent = sameTrack(currentTrack, t);
    const st = stats[t.id] || {};
    rows.push(
      <div
        key={`${idx}-${t.id || t.filePath}`}
        data-idx={idx}
        className={`tl-row tl-${variant} ${isCurrent ? 'current' : ''} ${selected.has(idx) ? 'selected' : ''}`}
        style={{ gridTemplateColumns: template, top }}
        draggable
        onDragStart={(e) => handleDragStart(e, idx)}
        onClick={(e) => handleClick(e, idx)}
        onDoubleClick={() => actions.playTracks(tracks, idx)}
        onContextMenu={(e) => handleContextMenu(e, idx)}
      >
        {columns.map(col => renderCell(col, t, idx, { isCurrent, isPlaying, st, variant, albumArtist, actions, tracks, openMenu, ctx }))}
      </div>
    );
  }

  return (
    <div className="track-list" id={id}>
      {selected.size > 1 && (
        <div className="selection-bar">
          <span><strong>{selected.size}</strong> selected</span>
          <button className="btn-chip" onClick={() => actions.playTracks(selectedTracks(), 0)}><Icon name="play" size={11} /> Play</button>
          <button className="btn-chip" onClick={() => actions.queueTracks(selectedTracks(), 'next')}>Play next</button>
          <button className="btn-chip" onClick={() => actions.queueTracks(selectedTracks(), 'end')}>Add to queue</button>
          <button className="btn-chip" onClick={() => actions.addToPlaylist(selectedTracks())}>Add to playlist…</button>
          <button className="btn-chip" onClick={(e) => openMenu(e, collectionMenuItems(selectedTracks(), ctx))}><Icon name="more" size={12} /></button>
          <button className="btn-chip" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
      {header}
      <div className="tl-body" ref={listRef} tabIndex={0} onKeyDown={handleKeyDown} style={{ height: rowCount * ROW_HEIGHT }}>
        {rows}
      </div>
    </div>
  );
}

function gridFor(columns) {
  const widths = {
    num: '42px',
    love: '26px',
    art: '40px',
    title: 'minmax(0, 3fr)',
    album: 'minmax(0, 2fr)',
    year: '52px',
    genre: 'minmax(0, 1.2fr)',
    plays: '60px',
    added: '96px',
    lastPlayed: '104px',
    duration: '56px',
    more: '34px',
  };
  return columns.map(c => widths[c]).join(' ');
}

function renderCell(col, t, idx, { isCurrent, isPlaying, st, variant, albumArtist, actions, tracks, openMenu, ctx }) {
  switch (col) {
    case 'num':
      return (
        <span key={col} className="tl-cell tl-num">
          {isCurrent && isPlaying
            ? <span className="eq-bars"><i></i><i></i><i></i></span>
            : <span className="tl-index">{variant === 'album' ? (t.trackNumber || idx + 1) : idx + 1}</span>}
          <button className="tl-play" title="Play" onClick={(e) => { e.stopPropagation(); actions.playTracks(tracks, idx); }}>
            <Icon name="play" size={12} />
          </button>
        </span>
      );
    case 'love':
      return <span key={col} className="tl-cell tl-love"><LoveButton track={t} size={13} /></span>;
    case 'art':
      return <span key={col} className="tl-cell tl-art"><Cover artId={t.artId} name={t.album} size={32} /></span>;
    case 'title': {
      const showArtist = variant !== 'album' || (t.artist && albumArtist && t.artist !== albumArtist);
      return (
        <span key={col} className="tl-cell tl-title">
          <span className="tl-title-text" title={t.title}>{t.title}</span>
          {showArtist && (
            <span className="tl-sub">
              <a className="link" onClick={(e) => { e.stopPropagation(); actions.goToArtist(t.artist); }}>{t.artist || 'Unknown Artist'}</a>
              {t.cloud && <span className="tl-badge">{t.cloud.cached ? 'Cloud · cached' : 'Cloud'}</span>}
            </span>
          )}
        </span>
      );
    }
    case 'album':
      return (
        <span key={col} className="tl-cell tl-album" title={t.album}>
          <a className="link" onClick={(e) => { e.stopPropagation(); actions.goToAlbumOf(t); }}>{t.album || '—'}</a>
        </span>
      );
    case 'year':
      return <span key={col} className="tl-cell tl-year">{t.year || '—'}</span>;
    case 'genre':
      return (
        <span key={col} className="tl-cell tl-genre" title={t.genre || ''}>
          {t.genre ? <a className="link" onClick={(e) => { e.stopPropagation(); actions.goToGenre(t.genre); }}>{t.genre}</a> : '—'}
        </span>
      );
    case 'plays':
      return <span key={col} className="tl-cell tl-plays">{st.plays || ''}</span>;
    case 'added':
      return <span key={col} className="tl-cell tl-added">{relativeDate(t.addedAt)}</span>;
    case 'lastPlayed':
      return <span key={col} className="tl-cell tl-lastPlayed">{relativeDate(st.lastPlayed)}</span>;
    case 'duration':
      return <span key={col} className="tl-cell tl-duration">{formatDuration(t.duration)}</span>;
    case 'more':
      return (
        <span key={col} className="tl-cell tl-more">
          <button
            className="tl-more-btn"
            title="More actions"
            onClick={(e) => { e.stopPropagation(); openMenu(e, trackMenuItems([t], ctx, { allTracks: tracks, index: idx })); }}
          >
            <Icon name="more" size={14} />
          </button>
        </span>
      );
    default:
      return null;
  }
}
