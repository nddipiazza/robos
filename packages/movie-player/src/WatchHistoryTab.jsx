import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';
import {
  fold,
  formatDuration,
  getTrackWatchState,
  inferTvShowEpisode,
  albumKeyOf,
} from '../lib/library-index.js';
import { sameTrack } from './library-ui.jsx';
import { useColumns } from './resizable.jsx';

const HISTORY_COLUMNS = [
  { key: 'play', label: 'Play', width: '36px', fixed: true },
  { key: 'type', label: 'Type', width: '64px', min: 56 },
  { key: 'show', label: 'Show / Movie', width: 'minmax(0, 1.6fr)', min: 96, sortKey: 'title' },
  { key: 'episode', label: 'Episode / Details', width: 'minmax(0, 1.5fr)', min: 88 },
  { key: 'state', label: 'Current State', width: 'minmax(0, 1.3fr)', min: 84, sortKey: 'status' },
  { key: 'plays', label: 'Views', width: '62px', min: 52, sortKey: 'plays' },
  { key: 'when', label: 'Last Watched', width: '146px', min: 96, sortKey: 'lastPlayed' },
  { key: 'actions', label: 'Actions', width: '110px', fixed: true },
];

function normalizePortableKey(track) {
  if (!track) return null;
  const clean = (v) => String(v || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const tv = inferTvShowEpisode(track);
  if (tv && tv.isTvShow && clean(tv.showName)) {
    return `tv:${clean(tv.showName)}:s${tv.seasonNumber ?? 1}:e${tv.episodeNumber ?? 1}`;
  }
  const title = clean(track.movieTitle || track.title);
  if (title) return `movie:${title}:${track.year ?? ''}`;
  return null;
}

function formatHistoryTimestamp(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${timeStr}`;
  if (yesterday) return `Yesterday, ${timeStr}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  const dateStr = d.toLocaleDateString([], sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  return `${dateStr}, ${timeStr}`;
}

export default function WatchHistoryTab({
  tracks = [],
  stats = {},
  portableEntries = {},
  currentTrack = null,
  isPlaying = false,
  onPlayTrack,
  onStartOverTrack,
  onToggleWatched,
  onClearHistoryRow,
  onOpenShow,
  onOpenMovie,
  onRefreshHistory,
  onImportHistory,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | 'in_progress' | 'watched' | 'tv' | 'movie'
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'lastPlayed', dir: 'desc' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [visibleLimit, setVisibleLimit] = useState(300);
  const { template, handleFor } = useColumns('watch-history', HISTORY_COLUMNS);

  useEffect(() => {
    setVisibleLimit(300);
  }, [filter, query, sort.key, sort.dir]);

  const historyRows = useMemo(() => {
    const rows = [];
    const seenPortableKeys = new Set();

    for (const t of tracks) {
      if (!t || !t.id) continue;
      const st = stats[t.id];
      const ws = getTrackWatchState(t, stats);
      const hasAnyHistory = ws.completed || ws.inProgress || ws.plays > 0 || Boolean(ws.lastPlayed);
      if (!hasAnyHistory) continue;

      const pKey = normalizePortableKey(t);
      if (pKey) seenPortableKeys.add(pKey);
      const pEntry = (pKey && portableEntries && portableEntries[pKey]) || null;

      const tv = inferTvShowEpisode(t);
      const isTv = Boolean((tv && tv.isTvShow) || t.mediaType === 'tv');
      const showTitle = isTv ? (tv?.showName || t.showName || t.album || 'TV Series') : (t.title || 'Untitled Movie');
      const epCode = isTv
        ? (tv?.episodeCode || t.episodeCode || `S${String(t.seasonNumber || 1).padStart(2, '0')}E${String(t.episodeNumber || 1).padStart(2, '0')}`)
        : null;
      const rawEpTitle = isTv
        ? String(tv?.episodeTitle || t.episodeTitle || t.title || '').replace(/^\d{1,3}\s*[-–—:]\s*/, '').trim()
        : '';
      const episodeDisplay = isTv
        ? (rawEpTitle && fold(rawEpTitle) !== fold(showTitle) ? rawEpTitle : `Episode ${tv?.episodeNumber || t.episodeNumber || 1}`)
        : `${t.year ? `${t.year} · ` : ''}${t.artist || t.genre || 'Feature Film'}`;

      const lastPlayed = ws.lastPlayed || pEntry?.lastPlayed || pEntry?.updatedAt || st?.updatedAt || '';
      const durationSec = ws.durationSec || Number(pEntry?.durationSec) || Number(t.duration) || 0;
      const syncedFrom = ws.syncedFrom || pEntry?.by || null;

      rows.push({
        rowKey: `trk:${t.id}`,
        track: t,
        trackId: t.id,
        portableKey: pKey,
        kind: isTv ? 'tv' : 'movie',
        showTitle,
        epCode,
        episodeDisplay,
        completed: ws.completed,
        inProgress: ws.inProgress,
        positionSec: ws.positionSec,
        durationSec,
        progressPct: ws.progressPct,
        plays: Math.max(ws.plays || 0, Number(pEntry?.plays) || 0, (ws.completed || ws.inProgress) ? 1 : 0),
        lastPlayed,
        syncedFrom,
      });
    }

    // Include portable history entries from other machines / Roku TV not yet matched by local track
    for (const [k, e] of Object.entries(portableEntries || {})) {
      if (!e || e.kind === 'audio' || seenPortableKeys.has(k)) continue;
      const hasState = Boolean(e.completed || e.inProgress || Number(e.positionSec) >= 1 || Number(e.plays) > 0 || e.lastPlayed);
      if (!hasState) continue;
      const isTv = e.kind === 'tv' || Boolean(e.show);
      const season = Number(e.season) || 1;
      const episode = Number(e.episode) || 1;
      const epCode = isTv ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : null;
      const completed = Boolean(e.completed);
      const pos = completed ? 0 : Math.max(0, Math.round(Number(e.positionSec) || 0));
      const dur = Math.max(0, Math.round(Number(e.durationSec) || 0));
      const inProgress = !completed && Boolean(e.inProgress || pos >= 1);
      const pct = completed ? 100 : (Number(e.progressPct) || (dur > 0 && pos > 0 ? Math.min(99, Math.max(1, Math.round((pos / dur) * 100))) : (inProgress ? 1 : 0)));
      rows.push({
        rowKey: `port:${k}`,
        track: null,
        trackId: null,
        portableKey: k,
        kind: isTv ? 'tv' : 'movie',
        showTitle: isTv ? (e.show || e.title || 'TV Series') : (e.title || 'Movie'),
        epCode,
        episodeDisplay: isTv ? (e.episodeTitle || e.title || `Episode ${episode}`) : `${e.year ? `${e.year} · ` : ''}Feature Film`,
        completed,
        inProgress,
        positionSec: pos,
        durationSec: dur,
        progressPct: pct,
        plays: Math.max(Number(e.plays) || 0, (completed || inProgress) ? 1 : 0),
        lastPlayed: e.lastPlayed || e.updatedAt || '',
        syncedFrom: e.by || null,
      });
    }

    return rows;
  }, [tracks, stats, portableEntries]);

  const counts = useMemo(() => ({
    all: historyRows.length,
    in_progress: historyRows.filter(r => r.inProgress).length,
    watched: historyRows.filter(r => r.completed).length,
    tv: historyRows.filter(r => r.kind === 'tv').length,
    movie: historyRows.filter(r => r.kind === 'movie').length,
  }), [historyRows]);

  const visibleRows = useMemo(() => {
    let list = historyRows;
    if (filter === 'in_progress') list = list.filter(r => r.inProgress);
    else if (filter === 'watched') list = list.filter(r => r.completed);
    else if (filter === 'tv') list = list.filter(r => r.kind === 'tv');
    else if (filter === 'movie') list = list.filter(r => r.kind === 'movie');

    const q = fold(query);
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      list = list.filter(r => {
        const hay = fold(`${r.showTitle} ${r.epCode || ''} ${r.episodeDisplay} ${r.completed ? 'watched' : ''} ${r.inProgress ? 'in progress resume' : ''} ${r.syncedFrom || ''}`);
        return terms.every(t => hay.includes(t));
      });
    }

    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort.key === 'title') {
        const c = a.showTitle.localeCompare(b.showTitle) || String(a.epCode || '').localeCompare(String(b.epCode || ''));
        return dir * c;
      }
      if (sort.key === 'status') {
        const score = (r) => (r.inProgress ? 2 : r.completed ? 1 : 0) * 1000 + (r.progressPct || 0);
        return dir * (score(a) - score(b)) || String(b.lastPlayed).localeCompare(String(a.lastPlayed));
      }
      if (sort.key === 'plays') {
        return dir * ((a.plays || 0) - (b.plays || 0)) || String(b.lastPlayed).localeCompare(String(a.lastPlayed));
      }
      return dir * String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || '')) || a.showTitle.localeCompare(b.showTitle);
    });
  }, [historyRows, filter, query, sort]);

  const toggleSort = (key) => {
    setSort(prev => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'title' ? 'asc' : 'desc' }));
  };

  const sortArrow = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '');

  const handleRefresh = async () => {
    if (!onRefreshHistory) return;
    setIsRefreshing(true);
    try {
      await onRefreshHistory();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImportClick = async (opts = {}) => {
    if (!onImportHistory) return;
    setIsImporting(true);
    try {
      const res = await onImportHistory(opts);
      if (res && !res.canceled) {
        setImportReport(res);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDropFile = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!onImportHistory) return;
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    setIsImporting(true);
    try {
      let res;
      if (f.path) {
        res = await onImportHistory({ filePath: f.path });
      } else {
        const text = await f.text();
        res = await onImportHistory({ data: text, filePath: f.name });
      }
      if (res && !res.canceled) setImportReport(res);
    } finally {
      setIsImporting(false);
    }
  };

  const renderedRows = visibleRows.slice(0, visibleLimit);

  return (
    <div
      className={`watch-history-tab ${isDragOver ? 'wh-drag-over' : ''}`}
      id="watch-history-tab"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragOver(false); }}
      onDrop={handleDropFile}
    >
      <div className="wh-toolbar">
        <div className="wh-toolbar-left">
          <h2 className="wh-heading">
            <Icon name="history" size={16} />
            <span>Watch History</span>
          </h2>
          <div className="wh-filter-pills" role="tablist" aria-label="Watch History Filters">
            {[
              ['all', `All (${counts.all})`],
              ['in_progress', `▶ In Progress (${counts.in_progress})`],
              ['watched', `✓ Watched (${counts.watched})`],
              ['tv', `TV Episodes (${counts.tv})`],
              ['movie', `Movies (${counts.movie})`],
            ].map(([id, label]) => (
              <button
                key={id}
                id={`wh-filter-${id}`}
                type="button"
                className={`wh-pill ${filter === id ? 'active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="wh-toolbar-right">
          <div className="search-box wh-search">
            <Icon name="search" size={13} />
            <input
              id="watch-history-search"
              type="search"
              placeholder="Filter history by show, S01E01, movie…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            />
          </div>
          {onImportHistory && (
            <button
              id="btn-import-watch-history"
              type="button"
              className="btn-accent wh-import-btn"
              disabled={isImporting}
              onClick={() => handleImportClick()}
              title="Import Watch History from Plex JSON, Tautulli, Trakt, Letterboxd CSV, or RobOS History file (or drag & drop a file here)"
            >
              <Icon name="file" size={13} />
              <span>{isImporting ? 'Importing…' : 'Import History…'}</span>
            </button>
          )}
          <button
            id="btn-refresh-watch-history"
            type="button"
            className="btn-secondary wh-sync-btn"
            disabled={isRefreshing}
            onClick={handleRefresh}
            title="Sync latest watch progress & history from RobOS Media Server and Config Vault"
          >
            <Icon name="history" size={13} />
            <span>{isRefreshing ? 'Syncing…' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {importReport && (
        <div className={`wh-import-banner ${importReport.ok ? 'ok' : 'err'}`} role="status">
          <div className="wh-import-banner-main">
            <strong>{importReport.ok ? '✓ Watch History Imported' : '⚠ Import Error'}:</strong>{' '}
            <span>{importReport.spoken || importReport.error}</span>
            {importReport.ok && Array.isArray(importReport.accounts) && importReport.accounts.length > 1 && (
              <span className="wh-import-accounts">
                Accounts: {importReport.accounts.join(', ')}
              </span>
            )}
          </div>
          <button
            type="button"
            className="wh-action-btn"
            title="Dismiss"
            onClick={() => setImportReport(null)}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="wh-empty">
          <Icon name="history" size={32} />
          <h3>{historyRows.length === 0 ? 'No watch history yet' : 'No matching history entries'}</h3>
          <p>
            {historyRows.length === 0
              ? 'Play any TV episode or movie — or import your watch history file (Plex JSON, Tautulli, Trakt, Letterboxd CSV) to mark everything you have already watched.'
              : 'Try clearing the search box or switching the filter pill above.'}
          </p>
          {historyRows.length === 0 && onImportHistory && (
            <button
              type="button"
              className="btn-accent"
              style={{ marginTop: '10px' }}
              disabled={isImporting}
              onClick={() => handleImportClick()}
            >
              <Icon name="file" size={14} />
              <span>{isImporting ? 'Importing…' : 'Import Watch History File…'}</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="wh-table-wrap"
          onScroll={(e) => {
            if (visibleLimit >= visibleRows.length) return;
            const el = e.currentTarget;
            if (el.scrollHeight - el.scrollTop - el.clientHeight < 320) {
              setVisibleLimit(prev => Math.min(visibleRows.length, prev + 300));
            }
          }}
        >
          <table className="wh-skinny-table" role="table" aria-label="Watch History Table" style={{ '--wh-grid': template }}>
            <thead role="rowgroup">
              <tr role="row">
                {HISTORY_COLUMNS.map(({ key, label, sortKey }) => (
                  <th
                    key={key}
                    role="columnheader"
                    scope="col"
                    className={`wh-col-${key}`}
                    aria-label={key === 'play' ? label : undefined}
                    aria-sort={sortKey && sort.key === sortKey ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortKey ? (
                      <button type="button" className="wh-sortable wh-column-label" onClick={() => toggleSort(sortKey)}>
                        {label}{sortArrow(sortKey)}
                      </button>
                    ) : key !== 'play' && <span className="wh-column-label">{label}</span>}
                    {handleFor(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {renderedRows.map((r) => {
                const isCurrent = Boolean(r.track && sameTrack(currentTrack, r.track));
                const canPlay = Boolean(r.track && onPlayTrack);
                const posLabel = formatDuration(r.positionSec);
                const durLabel = r.durationSec > 0 ? formatDuration(r.durationSec) : null;
                return (
                  <tr
                    key={r.rowKey}
                    role="row"
                    className={`wh-row ${isCurrent ? 'current' : ''} ${r.completed ? 'is-watched' : ''} ${r.inProgress ? 'is-progress' : ''}`}
                    onDoubleClick={() => { if (canPlay) onPlayTrack(r.track); }}
                  >
                    <td className="wh-col-play">
                      {canPlay ? (
                        <button
                          type="button"
                          className="wh-play-btn"
                          title={r.inProgress && r.positionSec >= 1
                            ? `Resume at ${posLabel}`
                            : `Play ${r.showTitle}${r.epCode ? ` ${r.epCode}` : ''}`}
                          onClick={() => onPlayTrack(r.track)}
                        >
                          {isCurrent && isPlaying
                            ? <span className="eq-bars"><i></i><i></i><i></i></span>
                            : <Icon name="play" size={11} />}
                        </button>
                      ) : (
                        <span className="wh-play-disabled" title="Synced from another device">·</span>
                      )}
                    </td>
                    <td className="wh-col-type">
                      <span className={`wh-type-pill ${r.kind}`}>
                        {r.kind === 'tv' ? 'TV' : 'FILM'}
                      </span>
                    </td>
                    <td className="wh-col-show" title={r.showTitle}>
                      {r.track ? (
                        <button
                          type="button"
                          className="wh-show-link"
                          onClick={() => {
                            if (r.kind === 'tv' && onOpenShow) onOpenShow(r.track, albumKeyOf(r.track));
                            else if (onOpenMovie) onOpenMovie(r.track, albumKeyOf(r.track));
                          }}
                        >
                          {r.showTitle}
                        </button>
                      ) : (
                        <span className="wh-show-text">{r.showTitle}</span>
                      )}
                    </td>
                    <td className="wh-col-episode" title={`${r.epCode ? `${r.epCode} — ` : ''}${r.episodeDisplay}`}>
                      {r.epCode && <span className="wh-ep-code">{r.epCode}</span>}
                      <span className="wh-ep-title">{r.episodeDisplay}</span>
                    </td>
                    <td className="wh-col-state">
                      <div className="wh-state-cell">
                        {isCurrent && isPlaying ? (
                          <span className="wh-state-badge playing">
                            ● Playing{r.positionSec >= 1 ? ` · ${posLabel}` : ''}
                          </span>
                        ) : r.completed ? (
                          <span className="wh-state-badge watched">
                            ✓ Watched
                          </span>
                        ) : r.inProgress ? (
                          <span className="wh-state-badge resume">
                            ▶ {r.positionSec >= 1
                              ? `Stopped ${posLabel}${durLabel ? ` / ${durLabel}` : ''}${r.progressPct > 0 ? ` (${r.progressPct}%)` : ''}`
                              : 'Started'}
                          </span>
                        ) : (
                          <span className="wh-state-badge played">Played</span>
                        )}
                        {(r.completed || r.inProgress) && (
                          <span className="wh-micro-bar" aria-hidden="true">
                            <i
                              className={r.completed ? 'watched' : 'resume'}
                              style={{ width: `${r.completed ? 100 : Math.max(5, r.progressPct || 5)}%` }}
                            />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="wh-col-plays">{r.plays ? `${r.plays}×` : '1×'}</td>
                    <td
                      className="wh-col-when"
                      title={`${r.lastPlayed || ''}${r.syncedFrom ? ` · Device: ${r.syncedFrom}` : ''}`}
                    >
                      {formatHistoryTimestamp(r.lastPlayed)}
                    </td>
                    <td className="wh-col-actions">
                      {r.track && r.inProgress && r.positionSec >= 1 && onStartOverTrack && (
                        <button
                          type="button"
                          className="wh-action-btn"
                          title="Start over from 0:00"
                          onClick={() => onStartOverTrack(r.track)}
                        >
                          ↺
                        </button>
                      )}
                      {r.track && onToggleWatched && (
                        <button
                          type="button"
                          className={`wh-action-btn ${r.completed ? 'active-watched' : ''}`}
                          title={r.completed ? 'Mark as Unwatched' : 'Mark as Watched'}
                          onClick={() => onToggleWatched([r.track], !r.completed)}
                        >
                          <Icon name="check" size={12} />
                        </button>
                      )}
                      {onClearHistoryRow && (
                        <button
                          type="button"
                          className="wh-action-btn danger"
                          title="Remove from Watch History"
                          onClick={() => onClearHistoryRow(r)}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleLimit < visibleRows.length && (
            <div className="wh-load-more">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setVisibleLimit(prev => Math.min(visibleRows.length, prev + 500))}
              >
                Showing {renderedRows.length.toLocaleString()} of {visibleRows.length.toLocaleString()} — Show More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
