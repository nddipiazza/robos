/**
 * Clementine / MusicBee / Plex-inspired 100,000-Movie Library Browser for RobOS Movie Player
 *
 * Features:
 *   - Sub-tab switcher:
 *       Collections/Series | Directors | Movies | Genres | Decades | Studios |
 *       Watchlist (Loved) | Recently Added | Recently Watched | Most Watched | Folders
 *   - View Mode switcher on Collections / Directors: Poster Grid | Detail List
 *   - Multi-column resizable/reorderable `TrackList` with right-click context menu
 *   - Movie Details inspector modal (`TrackInfoModal`)
 *   - Managed Library Folders (`FolderManagerPanel`) with per-folder counts & byte totals
 */

import React, { useState, useEffect, useMemo } from 'react';
import { VirtualTable, VirtualGrid } from './virtual';
import { Icon } from './Icon';
import { CoverThumb, formatTime, formatBytes } from './library-ui';
import { TrackList } from './TrackList';
import { TrackInfoModal } from './TrackInfo';
import { FolderManagerPanel } from './FolderPanel';

const SUB_TABS = [
  { id: 'albums', label: 'Collections', icon: 'disc' },
  { id: 'artists', label: 'Directors', icon: 'mic' },
  { id: 'songs', label: 'Movies', icon: 'film' },
  { id: 'genres', label: 'Genres', icon: 'tag' },
  { id: 'decades', label: 'Decades', icon: 'calendar' },
  { id: 'composers', label: 'Studios', icon: 'feather' },
  { id: 'loved', label: 'Watchlist', icon: 'heart' },
  { id: 'recent-added', label: 'Recently Added', icon: 'clock' },
  { id: 'recent-played', label: 'Recently Watched', icon: 'play' },
  { id: 'most-played', label: 'Most Watched', icon: 'flame' },
  { id: 'folders', label: 'Folders', icon: 'folder' }
];

export function LibraryBrowser({
  summary = {},
  albums = [],
  artists = [],
  genres = [],
  decades = [],
  composers = [],
  folders = [],
  currentTrack,
  isPlaying,
  scanStatus,
  playlists = [],
  onPlayTrack,
  onQueueTrack,
  onQueueTracks,
  onAddTrackToPlaylist,
  onOpenAiPlaylist,
  onOpenFixMetadata,
  onLibraryChanged,
  onAddFolder,
  onAddFiles,
  onRescan
}) {
  const [subTab, setSubTab] = useState('songs');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('title');
  const [sortDir, setSortDir] = useState('asc');
  const [drillFilter, setDrillFilter] = useState(null);
  const [tracksResult, setTracksResult] = useState({ tracks: [], total: 0 });
  const [inspectingTrack, setInspectingTrack] = useState(null);

  const isSmartTab = ['loved', 'recent-added', 'recent-played', 'most-played'].includes(subTab);
  const showTrackTable = subTab === 'songs' || isSmartTab || Boolean(drillFilter);

  const refreshTracks = () => {
    const queryOpts = {
      search,
      sortBy,
      sortDir,
      offset: 0,
      limit: 50000
    };
    if (isSmartTab) queryOpts.smartFilter = subTab;
    if (drillFilter) {
      if (drillFilter.type === 'album') queryOpts.albumKey = drillFilter.value;
      else if (drillFilter.type === 'artist') queryOpts.artist = drillFilter.value;
      else if (drillFilter.type === 'genre') queryOpts.genre = drillFilter.value;
      else if (drillFilter.type === 'decade') queryOpts.decade = drillFilter.value;
      else if (drillFilter.type === 'composer') queryOpts.composer = drillFilter.value;
      else if (drillFilter.type === 'folder') queryOpts.folder = drillFilter.value;
    }
    window.robosAudio.queryTracks(queryOpts).then(res => {
      if (res) setTracksResult(res);
    }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) refreshTracks();
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, sortBy, sortDir, subTab, drillFilter, summary.trackCount, summary.lovedCount]);

  const qLower = search.trim().toLowerCase();

  const filteredAlbums = useMemo(() => {
    if (!qLower) return albums;
    return albums.filter(a =>
      a.name.toLowerCase().includes(qLower) ||
      a.artist.toLowerCase().includes(qLower) ||
      (a.genre || '').toLowerCase().includes(qLower)
    );
  }, [albums, qLower]);

  const filteredArtists = useMemo(() => {
    if (!qLower) return artists;
    return artists.filter(a =>
      a.name.toLowerCase().includes(qLower) ||
      (a.genre || '').toLowerCase().includes(qLower)
    );
  }, [artists, qLower]);

  const filteredGenres = useMemo(() => {
    if (!qLower) return genres;
    return genres.filter(g => g.name.toLowerCase().includes(qLower));
  }, [genres, qLower]);

  const filteredComposers = useMemo(() => {
    if (!qLower) return composers;
    return composers.filter(c => c.name.toLowerCase().includes(qLower));
  }, [composers, qLower]);

  const handleToggleLoved = async (track) => {
    await window.robosAudio.toggleLoved(track.id);
    refreshTracks();
    if (inspectingTrack && inspectingTrack.id === track.id) {
      setInspectingTrack({ ...inspectingTrack, loved: !inspectingTrack.loved });
    }
  };

  const openDrill = (type, value, label, meta = null) => {
    setDrillFilter({ type, value, label, meta });
  };

  const clearDrill = () => setDrillFilter(null);

  const handlePlayAllMatching = async (shuffle = false) => {
    let list = tracksResult.tracks || [];
    if (list.length === 0) return;
    if (shuffle) {
      list = [...list].sort(() => Math.random() - 0.5);
    }
    onPlayTrack(list[0], list);
  };

  return (
    <div className="lib-root">
      <div className="lib-topbar">
        <div className="lib-subtabs">
          {SUB_TABS.map(t => (
            <button
              key={t.id}
              className={`lib-subtab ${subTab === t.id && !drillFilter ? 'active' : ''}`}
              onClick={() => { setSubTab(t.id); setDrillFilter(null); }}
              title={t.label}
            >
              <Icon name={t.icon} size={14} />
              <span className="lib-subtab-label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="lib-controls">
          <div className="lib-search-box">
            <Icon name="search" size={14} />
            <input
              type="text"
              className="input lib-search-input"
              placeholder={`Search ${(summary.trackCount || 0).toLocaleString()} movies, directors, 4K…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="lib-clear-btn" onClick={() => setSearch('')}>✕</button>
            )}
          </div>

          {(subTab === 'albums' || subTab === 'artists') && !drillFilter && (
            <div className="view-mode-toggle" title="Switch Poster Grid / List view">
              <button
                className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Poster Grid"
              >
                <Icon name="grid" size={14} />
              </button>
              <button
                className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
              >
                <Icon name="list" size={14} />
              </button>
            </div>
          )}

          {onOpenAiPlaylist && (
            <button
              className="btn btn-sm btn-accent"
              onClick={onOpenAiPlaylist}
              title="Build an AI Watchlist & Virtual Cinema Host from your library"
            >
              <Icon name="sparkles" size={14} /> ✦ AI Watchlist
            </button>
          )}
          {onOpenFixMetadata && (
            <button
              className="btn btn-sm"
              onClick={() => onOpenFixMetadata([])}
              title="Fix missing movie titles, directors, collections, and poster art"
            >
              <Icon name="sparkles" size={14} /> ✦ AI Fix Metadata
            </button>
          )}
          <button className="btn btn-sm" onClick={onAddFolder} title="Scan a movie folder">
            <Icon name="folder" size={14} /> + Folder
          </button>
          <button className="btn btn-sm" onClick={onAddFiles} title="Add movie files">
            <Icon name="plus" size={14} /> + Files
          </button>
          <button className="btn btn-sm" onClick={onRescan} title="Rescan ~/Videos and ~/Movies">
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      <div className="lib-stats-strip">
        <div className="lib-stats-left">
          {drillFilter ? (
            <div className="lib-breadcrumb">
              <button className="crumb-back" onClick={clearDrill}>← Back to {subTab}</button>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{drillFilter.label}</span>
              <span className="crumb-count">({tracksResult.total.toLocaleString()} films)</span>
            </div>
          ) : (
            <span>
              <strong>{(summary.trackCount || 0).toLocaleString()}</strong> movies •{' '}
              <strong>{(summary.albumCount || 0).toLocaleString()}</strong> collections •{' '}
              <strong>{(summary.artistCount || 0).toLocaleString()}</strong> directors •{' '}
              {formatBytes(summary.totalSize || 0)}
              {summary.cloudCount > 0 && ` • ${summary.cloudCount.toLocaleString()} cloud`}
            </span>
          )}
        </div>

        <div className="lib-stats-right">
          {scanStatus && scanStatus.active && (
            <span className="scan-pill">
              Scanning {scanStatus.processed.toLocaleString()} / {(scanStatus.total || 0).toLocaleString()}…
            </span>
          )}
          {showTrackTable && tracksResult.total > 0 && (
            <>
              <button className="btn btn-xs btn-accent" onClick={() => handlePlayAllMatching(false)}>
                <Icon name="play" size={12} /> Play All ({tracksResult.total.toLocaleString()})
              </button>
              <button className="btn btn-xs" onClick={() => handlePlayAllMatching(true)}>
                <Icon name="shuffle" size={12} /> Shuffle
              </button>
            </>
          )}
        </div>
      </div>

      <div className="lib-body">
        {subTab === 'albums' && !drillFilter && (
          viewMode === 'grid' ? (
            <VirtualGrid
              items={filteredAlbums}
              minCardWidth={168}
              cardHeight={224}
              gap={14}
              renderItem={(alb) => (
                <div
                  className="media-card"
                  onClick={() => openDrill('album', alb.key, `${alb.name} — ${alb.artist}`, alb)}
                >
                  <CoverThumb artId={alb.artId} fallback="film" className="media-card-art" />
                  <div className="media-card-title" title={alb.name}>{alb.name}</div>
                  <div className="media-card-sub" title={alb.artist}>{alb.artist}</div>
                  <div className="media-card-meta">
                    <span>{alb.trackCount} films</span>
                    {alb.year && <span>{alb.year}</span>}
                  </div>
                </div>
              )}
            />
          ) : (
            <VirtualTable
              items={filteredAlbums}
              rowHeight={54}
              renderRow={(alb) => (
                <div
                  className="artist-row"
                  onClick={() => openDrill('album', alb.key, `${alb.name} — ${alb.artist}`, alb)}
                >
                  <CoverThumb artId={alb.artId} fallback="film" className="artist-row-art" />
                  <div className="artist-row-main">
                    <div className="artist-row-name">{alb.name}</div>
                    <div className="artist-row-sub">
                      {alb.artist} • {alb.trackCount} films • {formatTime(alb.duration)}
                    </div>
                  </div>
                  <span className="pill">{alb.year || alb.genre || 'Collection'}</span>
                </div>
              )}
            />
          )
        )}

        {subTab === 'artists' && !drillFilter && (
          viewMode === 'grid' ? (
            <VirtualGrid
              items={filteredArtists}
              minCardWidth={168}
              cardHeight={214}
              gap={14}
              renderItem={(art) => (
                <div
                  className="media-card"
                  onClick={() => openDrill('artist', art.name, art.name, art)}
                >
                  <CoverThumb artId={art.artId} fallback="mic" className="media-card-art artist-circle" />
                  <div className="media-card-title" title={art.name}>{art.name}</div>
                  <div className="media-card-sub">{art.albumCount} collections • {art.trackCount} films</div>
                </div>
              )}
            />
          ) : (
            <VirtualTable
              items={filteredArtists}
              rowHeight={54}
              renderRow={(art) => (
                <div
                  className="artist-row"
                  onClick={() => openDrill('artist', art.name, art.name, art)}
                >
                  <CoverThumb artId={art.artId} fallback="mic" className="artist-row-art" />
                  <div className="artist-row-main">
                    <div className="artist-row-name">{art.name}</div>
                    <div className="artist-row-sub">
                      {art.albumCount} collections • {art.trackCount} films • {formatTime(art.duration)}
                    </div>
                  </div>
                  <span className="pill">{art.genre}</span>
                </div>
              )}
            />
          )
        )}

        {subTab === 'genres' && !drillFilter && (
          <VirtualGrid
            items={filteredGenres}
            minCardWidth={180}
            cardHeight={116}
            gap={12}
            renderItem={(g) => (
              <div
                className="genre-card"
                onClick={() => openDrill('genre', g.name, g.name, g)}
              >
                <div className="genre-card-name">{g.name}</div>
                <div className="genre-card-meta">
                  {g.trackCount.toLocaleString()} films • {formatTime(g.duration)}
                </div>
              </div>
            )}
          />
        )}

        {subTab === 'decades' && !drillFilter && (
          <VirtualGrid
            items={decades}
            minCardWidth={180}
            cardHeight={116}
            gap={12}
            renderItem={(d) => (
              <div
                className="genre-card decade-card"
                onClick={() => openDrill('decade', d.decade, d.name, d)}
              >
                <div className="genre-card-name">{d.name}</div>
                <div className="genre-card-meta">
                  {d.trackCount.toLocaleString()} films • {formatTime(d.duration)}
                </div>
              </div>
            )}
          />
        )}

        {subTab === 'composers' && !drillFilter && (
          <VirtualTable
            items={filteredComposers}
            rowHeight={50}
            renderRow={(c) => (
              <div
                className="artist-row"
                onClick={() => openDrill('composer', c.name, `Studio / Writer: ${c.name}`, c)}
              >
                <CoverThumb artId={c.artId} fallback="feather" className="artist-row-art" />
                <div className="artist-row-main">
                  <div className="artist-row-name">{c.name}</div>
                  <div className="artist-row-sub">
                    {c.trackCount.toLocaleString()} films • {formatTime(c.duration)}
                  </div>
                </div>
              </div>
            )}
          />
        )}

        {subTab === 'folders' && !drillFilter && (
          <FolderManagerPanel
            onSelectFolder={(dirPath) => openDrill('folder', dirPath, dirPath)}
            onLibraryChanged={(lib) => {
              if (onLibraryChanged) onLibraryChanged(lib);
              refreshTracks();
            }}
          />
        )}

        {showTrackTable && (
          <div className="vt-outer">
            {drillFilter && drillFilter.meta && (
              <div className="drill-hero">
                <CoverThumb artId={drillFilter.meta.artId} fallback="film" className="drill-hero-art" />
                <div className="drill-hero-info">
                  <div className="drill-hero-type">{drillFilter.type.toUpperCase()}</div>
                  <h3>{drillFilter.meta.name || drillFilter.label}</h3>
                  <div className="drill-hero-sub">
                    {drillFilter.meta.artist && <span>{drillFilter.meta.artist} • </span>}
                    <span>{tracksResult.total.toLocaleString()} movies</span>
                    {drillFilter.meta.year && <span> • {drillFilter.meta.year}</span>}
                  </div>
                </div>
              </div>
            )}

            <TrackList
              tracks={tracksResult.tracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              sortBy={sortBy}
              sortDir={sortDir}
              onChangeSort={(key, dir) => { setSortBy(key); setSortDir(dir); }}
              onPlayTrack={onPlayTrack}
              onQueueTrack={onQueueTrack}
              onQueueTracks={onQueueTracks}
              onToggleLoved={handleToggleLoved}
              onAddTrackToPlaylist={onAddTrackToPlaylist}
              onFixMetadata={onOpenFixMetadata}
              onInspectTrack={setInspectingTrack}
              playlists={playlists}
            />
          </div>
        )}
      </div>

      {inspectingTrack && (
        <TrackInfoModal
          track={inspectingTrack}
          onClose={() => setInspectingTrack(null)}
          onToggleLoved={handleToggleLoved}
        />
      )}
    </div>
  );
}
