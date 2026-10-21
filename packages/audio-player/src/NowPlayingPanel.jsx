import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { formatDuration, formatLongDuration, fold } from '../lib/library-index.js';
import { useLibrary, trackMenuItems, Cover, TRACK_DRAG_TYPE } from './library-ui.jsx';

const ROW_HEIGHT = 30;
const OVERSCAN = 12;
const QUEUE_DRAG_TYPE = 'application/x-robos-queue';

const REPEAT_LABEL = { off: 'Repeat: off', all: 'Repeat: whole queue', one: 'Repeat: current track' };

/**
 * Always-visible play queue, modelled on VLC's playlist dock:
 *  - double-click (or Enter) jumps to a track; the playing row is bold with ▶
 *  - drag rows to reorder, drop library tracks to insert, Delete removes
 *  - click a column header to sort, filter box narrows the view
 *  - shuffle / repeat / locate / save / clear in the footer
 */
export default function NowPlayingPanel({
  queue,
  currentIndex,
  collapsed,
  onToggleCollapsed,
  onPlayIndex,
  onRemove,
  onMove,
  onInsert,
  onSort,
  onClear,
  onSave,
  onShuffleOrder,
  shuffle,
  repeat,
  onToggleShuffle,
  onCycleRepeat,
  dj = null,
}) {
  const ctx = useLibrary();
  const { isPlaying, actions, openMenu } = ctx;
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(400);
  const [dropAt, setDropAt] = useState(null);
  const [sortState, setSortState] = useState(null);
  const anchorRef = useRef(null);
  const scrollRef = useRef(null);

  // Rows shown: indices into the real queue so every action maps back correctly.
  const rows = useMemo(() => {
    const all = queue.map((t, i) => i);
    const terms = fold(filter).split(/\s+/).filter(Boolean);
    if (!terms.length) return all;
    return all.filter(i => {
      const t = queue[i];
      const hay = fold(`${t.title} ${t.artist} ${t.album}`);
      return terms.every(term => hay.includes(term));
    });
  }, [queue, filter]);

  const totalDuration = useMemo(() => queue.reduce((n, t) => n + (t.duration || 0), 0), [queue]);
  const remaining = useMemo(() => queue.slice(currentIndex + 1).reduce((n, t) => n + (t.duration || 0), 0), [queue, currentIndex]);

  useEffect(() => { setSelected(new Set()); }, [queue.length, filter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight || 400));
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  const locateCurrent = (smooth = false) => {
    const el = scrollRef.current;
    const pos = rows.indexOf(currentIndex);
    if (!el || pos < 0) return;
    const top = pos * ROW_HEIGHT;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2 + ROW_HEIGHT), behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // Follow the playing track as it advances.
  useEffect(() => { locateCurrent(); }, [currentIndex, collapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (collapsed) {
    return (
      <aside className="np-dock collapsed" aria-label="Now Playing">
        <button id="btn-expand-queue-panel" className="np-rail" title="Show the Now Playing playlist" onClick={onToggleCollapsed}>
          <Icon name="list" size={16} />
          <span className="np-rail-label">Now Playing · {queue.length}</span>
        </button>
      </aside>
    );
  }

  const selectedIndices = () => [...selected].sort((a, b) => a - b);

  const handleClick = (e, qIdx) => {
    const next = new Set(e.ctrlKey || e.metaKey ? selected : []);
    if (e.shiftKey && anchorRef.current != null) {
      const a = rows.indexOf(anchorRef.current);
      const b = rows.indexOf(qIdx);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(rows[i]);
    } else if ((e.ctrlKey || e.metaKey) && next.has(qIdx)) {
      next.delete(qIdx);
    } else {
      next.add(qIdx);
      anchorRef.current = qIdx;
    }
    setSelected(next);
  };

  const handleKeyDown = (e) => {
    if (e.target !== scrollRef.current) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selected.size) { e.preventDefault(); onRemove(selectedIndices()); setSelected(new Set()); }
    } else if (e.key === 'Enter') {
      if (selected.size) { e.preventDefault(); onPlayIndex(selectedIndices()[0]); }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(rows));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = anchorRef.current == null ? -1 : rows.indexOf(anchorRef.current);
      const nextPos = Math.max(0, Math.min(rows.length - 1, pos + (e.key === 'ArrowDown' ? 1 : -1)));
      const qIdx = rows[nextPos];
      anchorRef.current = qIdx;
      setSelected(new Set([qIdx]));
      const el = scrollRef.current;
      const top = nextPos * ROW_HEIGHT;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
    } else if (e.key === 'Escape') {
      setSelected(new Set());
    }
  };

  const handleContextMenu = (e, qIdx) => {
    e.preventDefault();
    let sel = selected;
    if (!sel.has(qIdx)) { sel = new Set([qIdx]); setSelected(sel); anchorRef.current = qIdx; }
    const indices = [...sel].sort((a, b) => a - b);
    const tracks = indices.map(i => queue[i]);
    const items = trackMenuItems(tracks, ctx);
    // items[0] is the (optional) header; swap the library play/queue entries for queue ones.
    items.splice(1, 3,
      { label: 'Play', icon: 'play', onClick: () => onPlayIndex(indices[0]) },
      { label: 'Play next', icon: 'playNext', disabled: indices.includes(currentIndex), onClick: () => onMove(indices, currentIndex + 1) },
      { label: 'Move to top', icon: 'up', onClick: () => onMove(indices, 0) },
      { label: 'Move to bottom', icon: 'down', onClick: () => onMove(indices, queue.length) },
      { label: indices.length > 1 ? `Remove ${indices.length} from queue` : 'Remove from queue', icon: 'x', danger: true, onClick: () => onRemove(indices) },
    );
    openMenu(e, items);
  };

  // ── Drag & drop: reorder queue rows, or insert tracks dragged from the library ──
  const dropIndexFor = (e) => {
    const el = scrollRef.current;
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top + el.scrollTop;
    const pos = Math.max(0, Math.min(rows.length, Math.round(y / ROW_HEIGHT)));
    return pos >= rows.length ? queue.length : rows[pos];
  };

  const handleDragStart = (e, qIdx) => {
    const indices = selected.has(qIdx) ? selectedIndices() : [qIdx];
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(QUEUE_DRAG_TYPE, JSON.stringify(indices));
    e.dataTransfer.setData(TRACK_DRAG_TYPE, JSON.stringify(indices.map(i => queue[i])));
  };

  const acceptsDrag = (e) => {
    const types = Array.from(e.dataTransfer.types || []);
    return types.includes(QUEUE_DRAG_TYPE) || types.includes(TRACK_DRAG_TYPE);
  };

  const handleDragOver = (e) => {
    if (!acceptsDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = Array.from(e.dataTransfer.types).includes(QUEUE_DRAG_TYPE) ? 'move' : 'copy';
    setDropAt(dropIndexFor(e));
  };

  const handleDrop = (e) => {
    if (!acceptsDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const at = dropIndexFor(e);
    setDropAt(null);
    const moving = e.dataTransfer.getData(QUEUE_DRAG_TYPE);
    if (moving) {
      try { onMove(JSON.parse(moving), at); } catch {}
      return;
    }
    try {
      const tracks = JSON.parse(e.dataTransfer.getData(TRACK_DRAG_TYPE) || '[]');
      if (tracks.length) onInsert(tracks, at);
    } catch {}
  };

  const sortBy = (key) => {
    const dir = sortState && sortState.key === key && sortState.dir === 'asc' ? 'desc' : 'asc';
    setSortState({ key, dir });
    onSort(key, dir);
  };
  const sortMark = (key) => (sortState && sortState.key === key ? (sortState.dir === 'asc' ? ' ↑' : ' ↓') : '');

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const current = queue[currentIndex] || null;
  const dropPos = dropAt == null ? null : (dropAt >= queue.length ? rows.length : rows.indexOf(dropAt));

  return (
    <aside className="np-dock" aria-label="Now Playing">
      <div className="np-head">
        <div className="np-head-title">
          <Icon name="list" size={15} />
          <span>Now Playing</span>
          <span className="np-count">{queue.length.toLocaleString()}</span>
        </div>
        <button id="btn-collapse-queue-panel" className="btn-icon-only small" title="Hide panel" onClick={onToggleCollapsed}>
          <Icon name="chevron" size={14} />
        </button>
      </div>

      {current && (
        <div className="np-current" onDoubleClick={() => locateCurrent(true)} title="Double-click to locate in the list">
          <Cover artId={current.artId} name={current.album || current.title} size={44} />
          <div className="np-current-text">
            <span className="np-current-title">{current.title}</span>
            <span className="np-current-sub">
              <a className="link" onClick={() => actions.goToArtist(current.artist)}>{current.artist || 'Unknown Artist'}</a>
              {current.album ? <> · <a className="link" onClick={() => actions.goToAlbumOf(current)}>{current.album}</a></> : null}
            </span>
          </div>
        </div>
      )}

      {dj && dj.speaking && (
        <div className="np-dj-banner" role="status">
          <Icon name="mic" size={15} />
          <div className="np-dj-text">
            <span className="np-dj-label">{dj.speaking.warming ? 'DJ is warming up…' : 'DJ on the mic'}</span>
            <span className="np-dj-line">{dj.speaking.text}</span>
          </div>
          <button id="btn-dj-skip" className="btn-chip" onClick={dj.onSkip} title="Skip the DJ and play the next song">Skip</button>
        </div>
      )}

      <div className="np-filter search-box">
        <Icon name="search" size={13} />
        <input
          id="queue-filter"
          type="search"
          placeholder="Filter playlist…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') setFilter(''); }}
        />
      </div>

      <div className="np-cols">
        <span className="np-col-state" />
        <button className="np-col-title" onClick={() => sortBy('title')} title="Sort by title">Title{sortMark('title')}</button>
        <button className="np-col-artist" onClick={() => sortBy('artist')} title="Sort by artist">Artist{sortMark('artist')}</button>
        <button className="np-col-dur" onClick={() => sortBy('duration')} title="Sort by duration">Time{sortMark('duration')}</button>
      </div>

      <div
        id="queue-list"
        className={`np-list ${dropAt != null ? 'dragging' : ''}`}
        ref={scrollRef}
        tabIndex={0}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropAt(null); }}
        onDrop={handleDrop}
      >
        {rows.length === 0 ? (
          <div className="np-empty">
            {queue.length ? 'No tracks match the filter.' : 'The queue is empty. Double-click songs in the Library, or drag them here.'}
          </div>
        ) : (
          <div className="np-spacer" style={{ height: rows.length * ROW_HEIGHT }}>
            {rows.slice(start, end).map((qIdx, i) => {
              const t = queue[qIdx];
              const pos = start + i;
              const isCurrent = qIdx === currentIndex;
              return (
                <div
                  key={`${qIdx}-${t.id || t.src}`}
                  className={`np-row ${isCurrent ? 'current' : ''} ${selected.has(qIdx) ? 'selected' : ''} ${qIdx < currentIndex ? 'played' : ''}`}
                  style={{ top: pos * ROW_HEIGHT, height: ROW_HEIGHT }}
                  title={`${t.title}\n${t.artist || ''}${t.album ? ` — ${t.album}` : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, qIdx)}
                  onClick={(e) => handleClick(e, qIdx)}
                  onDoubleClick={() => onPlayIndex(qIdx)}
                  onContextMenu={(e) => handleContextMenu(e, qIdx)}
                >
                  <span className="np-col-state">
                    {isCurrent
                      ? (isPlaying ? <span className="eq-bars"><i></i><i></i><i></i></span> : <Icon name="play" size={10} />)
                      : <span className="np-num">{qIdx + 1}</span>}
                  </span>
                  <span className="np-col-title">{t.title}</span>
                  <span className="np-col-artist">{t.artist}</span>
                  <span className="np-col-dur">{formatDuration(t.duration)}</span>
                </div>
              );
            })}
            {dropPos != null && dropPos >= 0 && <div className="np-drop-line" style={{ top: dropPos * ROW_HEIGHT - 1 }} />}
          </div>
        )}
      </div>

      <div className="np-footer">
        <div className="np-footer-stats">
          <span>{queue.length.toLocaleString()} tracks · {formatLongDuration(totalDuration)}</span>
          {currentIndex >= 0 && queue.length > 1 && <span>{formatLongDuration(remaining)} left</span>}
        </div>
        <div className="np-footer-actions">
          <button id="btn-queue-shuffle-mode" className={`btn-icon-only small ${shuffle ? 'on' : ''}`} title={shuffle ? 'Random playback: on' : 'Random playback: off'} aria-pressed={shuffle} onClick={onToggleShuffle}>
            <Icon name="shuffle" size={14} />
          </button>
          <button id="btn-queue-repeat-mode" className={`btn-icon-only small ${repeat !== 'off' ? 'on' : ''}`} title={REPEAT_LABEL[repeat]} onClick={onCycleRepeat}>
            <Icon name={repeat === 'one' ? 'repeatOne' : 'repeat'} size={14} />
          </button>
          <button className="btn-icon-only small" title="Locate the playing track" onClick={() => locateCurrent(true)}>
            <Icon name="locate" size={14} />
          </button>
          {dj && (
            <>
              <button
                id="btn-dj-toggle"
                className={`btn-icon-only small ${dj.enabled ? 'on' : ''}`}
                title={dj.enabled ? `Virtual DJ is on: ${dj.persona}` : 'Virtual DJ between songs'}
                aria-pressed={dj.enabled}
                onClick={dj.onSettings}
              >
                <Icon name="mic" size={14} />
              </button>
              <button id="btn-queue-ai-playlist" className="btn-icon-only small ai-btn-icon" title="AI Playlist: describe it, your RobOS agent builds it" onClick={dj.onAiPlaylist}>
                ✦
              </button>
            </>
          )}
          <span className="np-footer-spacer" />
          <button id="btn-shuffle-queue" className="btn-icon-only small" title="Shuffle the order of the queue" onClick={onShuffleOrder}>
            <Icon name="rows" size={14} />
          </button>
          <button id="btn-save-queue-as-playlist" className="btn-icon-only small" title="Save queue as a playlist" onClick={onSave} disabled={!queue.length}>
            <Icon name="save" size={14} />
          </button>
          <button id="btn-clear-queue" className="btn-icon-only small danger" title="Clear the queue (keeps the playing track)" onClick={onClear} disabled={queue.length <= 1}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
