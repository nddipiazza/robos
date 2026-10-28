import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import FolderPanel from './FolderPanel.jsx';
import TrackList from './TrackList.jsx';
import {
  buildIndex, searchIndex, sortTracks, sortAlbums, sortArtists, indexLetter, fold,
  lovedTracks, recentlyAddedTracks, recentlyPlayedTracks, mostPlayedTracks, inProgressTracks,
  getTrackWatchState, getShowWatchState,
  formatDuration, formatLongDuration, plural, inferTvShowEpisode, VARIOUS_ARTISTS,
} from '../lib/library-index.js';
import { useLibrary, Cover, Collage, LoveButton, sameTrack, trackMenuItems, collectionMenuItems } from './library-ui.jsx';
import { ScrollContainerContext, VirtualGrid } from './virtual.jsx';
import { Splitter, useLayoutPref } from './resizable.jsx';

const NAV_WIDTH = 196;

export const MOVIE_SECTIONS = [
  { id: 'albums', label: 'All Movies', icon: 'disc' },
  { id: 'franchises', label: 'Franchises & Box Sets', icon: 'grid' },
  { id: 'genres', label: 'Movie Genres', icon: 'tag' },
  { id: 'artists', label: '4K & BluRay Formats', icon: 'tv' },
  { id: 'decades', label: 'Release Decades', icon: 'calendar' },
  { id: 'songs', label: 'All Movies (A–Z List)', icon: 'list' },
];

export const SHOW_SECTIONS = [
  { id: 'tv_navigator', label: 'Show & Season Navigator', icon: 'tv' },
  { id: 'tv_shows', label: 'All TV Series (Poster Grid)', icon: 'grid' },
  { id: 'tv_networks', label: 'Networks & Studios', icon: 'disc' },
  { id: 'genres', label: 'TV Show Genres', icon: 'tag' },
  { id: 'decades', label: 'Premiere Decades', icon: 'calendar' },
  { id: 'songs', label: 'All Episodes (A–Z)', icon: 'list' },
];

export const LIBRARY_SECTIONS = MOVIE_SECTIONS;

export const LIBRARY_COLLECTIONS = [
  { id: 'history', label: 'Continue Watching', icon: 'history' },
  { id: 'loved', label: 'My Watchlist', icon: 'heart' },
  { id: 'recent', label: 'Recently Added', icon: 'clock' },
  { id: 'top', label: 'Most Watched', icon: 'chart' },
];

const PREFS_KEY = 'robos-audio-player.library-prefs.v1';
const LETTER_SECTION_MIN = 40;
const ALBUM_GRID = { minWidth: 168, textHeight: 56, aspectRatio: 1 };
const ARTIST_GRID = { minWidth: 132, textHeight: 46 };

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

export function folderOwnsTrack(folder, filePath) {
  if (!folder || !filePath) return false;
  const normalize = p => String(p || '').replace(/\\/g, '/').replace(/\/$/, '');
  filePath = normalize(filePath);
  if ([folder.localRoot, ...(folder.aliasRoots || [])].some(root => root &&
    (filePath === normalize(root) || filePath.startsWith(normalize(root) + '/')))) return true;
  const legacyRoot = normalize(folder.legacyRootDir);
  if (legacyRoot && filePath.startsWith(legacyRoot + '/')) {
    const rel = filePath.slice(legacyRoot.length + 1);
    if (rel && !rel.includes('/')) return true;
  }
  return false;
}

/**
 * Library browser: category navigation (albums, artists, songs, genres, decades,
 * composers), smart collections, detail pages and grouped search.
 *
 * Navigation lives in App (`nav` + `onNavigate`) so the Now Playing panel and the
 * player can deep-link into album/artist pages.
 */
export default function Library({
  mode = 'movies',
  tracks,
  folders,
  nav,
  onNavigate,
  onBack,
  canGoBack,
  searchInputRef,
  folderProps,
  onRefresh,
  onAddFolder,
  onAddFiles,
  isScanning,
  isFetchingMetadata,
  onFetchMetadata,
  onAiPlaylist,
  onAiFixMetadata,
}) {
  const { stats, actions } = useLibrary();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [query, setQuery] = useState('');
  const contentRef = useRef(null);
  const [navWidth, setNavWidth] = useLayoutPref(mode === 'shows' ? 'libShowsNavWidth' : 'libNavWidth', mode === 'shows' ? 218 : NAV_WIDTH);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  const setPref = (key, value) => setPrefs(p => ({ ...p, [key]: value }));

  // A new destination clears the search box and scrolls to the top.
  useEffect(() => {
    setQuery('');
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nav, mode]);

  const isShowsMode = mode === 'shows';
  const modeTracks = useMemo(() => {
    if (mode === 'shows') return tracks.filter(t => t && t.mediaType === 'tv');
    if (mode === 'movies') return tracks.filter(t => t && t.mediaType !== 'tv');
    return tracks;
  }, [tracks, mode]);

  const scopeFolder = folders.find(f => f.id === prefs.scope) || null;
  const scopedTracks = useMemo(
    () => (scopeFolder ? modeTracks.filter(t => folderOwnsTrack(scopeFolder, t.filePath)) : modeTracks),
    [modeTracks, scopeFolder]
  );
  const index = useMemo(() => buildIndex(scopedTracks), [scopedTracks]);

  const defaultSection = isShowsMode ? 'tv_navigator' : 'albums';
  const go = (view) => onNavigate(view);
  const rawSection = nav.section || defaultSection;
  const section = (isShowsMode && (rawSection === 'albums' || rawSection === 'movies_only'))
    ? 'tv_navigator'
    : (!isShowsMode && (rawSection === 'tv_navigator' || rawSection === 'tv_shows' || rawSection === 'tv_networks'))
      ? 'albums'
      : rawSection;
  const detail = nav.detail || null;

  const networksCount = useMemo(() => {
    if (!isShowsMode) return 0;
    const set = new Set();
    for (const s of (index.tvShows || [])) {
      if (s.network) set.add(s.network);
    }
    return set.size;
  }, [index, isShowsMode]);

  const counts = useMemo(() => ({
    albums: index.albums.length,
    movies_only: (index.moviesOnly || []).length,
    tv_navigator: (index.tvShows || []).length,
    tv_shows: (index.tvShows || []).length,
    tv_networks: networksCount,
    franchises: (index.franchises || []).length,
    artists: index.artists.filter(a => !a.isPlaceholder).length,
    songs: index.tracks.length,
    genres: index.genres.length,
    decades: index.decades.length,
    composers: index.composers.length,
  }), [index, networksCount]);
  const lovedCount = useMemo(() => index.tracks.filter(t => (stats[t.id] || {}).loved).length, [index, stats]);
  const inProgressCount = useMemo(() => {
    if (isShowsMode) {
      return (index.tvShows || []).filter(s => {
        const ws = getShowWatchState(s, stats);
        return ws.hasActivity && !ws.completed;
      }).length;
    }
    return inProgressTracks(index.tracks, stats).length;
  }, [index, stats, isShowsMode]);

  // Typing stays responsive on 100k tracks: results follow the deferred query.
  const searching = query.trim().length > 0;
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => (deferredQuery.trim() ? searchIndex(index, deferredQuery, { artists: 12, albums: 12, genres: 8 }) : null),
    [index, deferredQuery]
  );

  const activeSections = isShowsMode ? SHOW_SECTIONS : MOVIE_SECTIONS;
  const pageTitle = searching ? `Results for “${query.trim()}”` : titleFor({ ...nav, section }, index, isShowsMode);

  let body;
  if (!modeTracks.length) {
    body = <EmptyLibrary mode={mode} onAddFolder={onAddFolder} onAddFiles={onAddFiles} onCloud={folderProps.onAddCloud} isScanning={isScanning} />;
  } else if (searching) {
    body = results ? <SearchResults results={results} go={go} isShowsMode={isShowsMode} /> : null;
  } else if (detail) {
    body = <DetailView detail={detail} index={index} go={go} stats={stats} />;
  } else {
    body = (
      <SectionView
        mode={mode}
        section={section}
        index={index}
        go={go}
        prefs={prefs}
        setPref={setPref}
        stats={stats}
        folders={folders}
        folderProps={{
          ...folderProps,
          activeId: prefs.scope || null,
          onSelect: (id) => { setPref('scope', id); go({ section: defaultSection }); },
        }}
      />
    );
  }

  return (
    <div className="lib" style={{ gridTemplateColumns: `${navWidth}px minmax(0, 1fr)` }}>
      <Splitter
        id="lib-nav-splitter"
        className="overlay"
        style={{ left: navWidth - 5 }}
        label="Library sidebar width"
        width={navWidth}
        onChange={setNavWidth}
        min={140}
        max={420}
        defaultWidth={isShowsMode ? 218 : NAV_WIDTH}
      />
      <nav className="lib-nav" aria-label={isShowsMode ? 'TV Shows navigation' : 'Movies navigation'}>
        <div className="lib-nav-group">
          <span className="lib-nav-heading">{isShowsMode ? 'Browse TV Shows' : 'Browse Movies'}</span>
          {activeSections.map(s => (
            <NavItem key={s.id} item={s} count={counts[s.id]} active={!detail && !searching && section === s.id} onClick={() => go({ section: s.id })} />
          ))}
        </div>
        <div className="lib-nav-group">
          <span className="lib-nav-heading">{isShowsMode ? 'Show Progress & Lists' : 'Movie Watchlist & Activity'}</span>
          {LIBRARY_COLLECTIONS.map(s => (
            <NavItem
              key={s.id}
              item={s}
              count={s.id === 'loved' ? lovedCount : s.id === 'history' && inProgressCount > 0 ? inProgressCount : null}
              active={!detail && !searching && section === s.id}
              onClick={() => go({ section: s.id })}
            />
          ))}
        </div>
        {isShowsMode && (index.tvShows || []).length > 0 && (
          <div className="lib-nav-group lib-nav-shows-jump">
            <span className="lib-nav-heading">Quick Jump to Series ({index.tvShows.length})</span>
            <div className="lib-nav-series-scroll">
              {index.tvShows.map(show => {
                const ws = getShowWatchState(show, stats);
                const isSelectedDetail = detail && detail.type === 'album' && detail.key === show.key;
                const isSelectedNav = !detail && section === 'tv_navigator' && (prefs.selectedShowKey || index.tvShows[0]?.key) === show.key;
                return (
                  <button
                    key={show.key}
                    className={`lib-nav-item lib-nav-series-item ${(isSelectedDetail || isSelectedNav) ? 'active' : ''}`}
                    onClick={() => {
                      setPref('selectedShowKey', show.key);
                      if (section !== 'tv_navigator' || detail) {
                        go({ section: 'tv_navigator' });
                      }
                    }}
                    title={`${show.title} — ${plural(show.seasonCount || 1, 'Season')}, ${plural(show.episodeCount || show.tracks.length, 'Episode')}`}
                  >
                    <Cover artId={show.artId} name={show.title} size={22} />
                    <span className="lib-nav-label">{show.title}</span>
                    <span className="lib-nav-count">
                      {ws.completed ? '✓' : ws.hasActivity ? `▶ S${String(ws.resumeTrack?.seasonNumber || 1).padStart(2, '0')}E${String(ws.resumeTrack?.episodeNumber || 1).padStart(2, '0')}` : `${show.seasonCount || 1}S`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="lib-nav-group">
          <span className="lib-nav-heading">Media Sources</span>
          <NavItem item={{ id: 'folders', label: 'Folders & Cloud', icon: 'folder' }} count={folders.length} active={!detail && !searching && section === 'folders'} onClick={() => go({ section: 'folders' })} />
        </div>
        <div className="lib-nav-footer">
          {isShowsMode ? (
            <>
              <span>{plural((index.tvShows || []).length, 'TV series')} · {plural((index.tvShows || []).reduce((acc, s) => acc + (s.seasonCount || 1), 0), 'season')}</span>
              <span>{plural(index.tracks.length, 'episode')} · {formatLongDuration(index.totalDuration)}</span>
            </>
          ) : (
            <>
              <span>{plural(index.albums.length, 'feature film')} · {plural((index.franchises || []).length, 'franchise')}</span>
              <span>{formatLongDuration(index.totalDuration)} total runtime</span>
            </>
          )}
          {onFetchMetadata && (
            <button
              id="btn-fetch-public-metadata"
              className="btn-accent lib-shuffle-all"
              disabled={!index.tracks.length || isFetchingMetadata}
              title="Fetch official posters, plot synopses, cast, ratings & episode guides from public APIs (IMDb, TVmaze, Wikipedia — no AI required)"
              onClick={() => onFetchMetadata(index.tracks, { force: true })}
            >
              <Icon name="locate" size={14} /> {isFetchingMetadata ? 'Fetching Metadata…' : 'Fetch Posters & Metadata'}
            </button>
          )}
          {onAiPlaylist && (
            <button
              id="btn-library-ai-playlist"
              className="btn-secondary lib-shuffle-all"
              disabled={!index.tracks.length}
              title="Describe a watchlist and let your RobOS agent build it"
              onClick={onAiPlaylist}
            >
              ✦ AI Watchlist
            </button>
          )}
          <button
            id="btn-shuffle-library"
            className="btn-secondary lib-shuffle-all"
            disabled={!index.tracks.length}
            onClick={() => actions.playTracks(index.tracks, 0, { shuffle: true })}
          >
            <Icon name="shuffle" size={14} /> {isShowsMode ? 'Shuffle Episodes' : 'Shuffle Movies'}
          </button>
        </div>
      </nav>

      <div className="lib-main">
        <div className="lib-toolbar">
          <button className="btn-icon-only" title="Back" disabled={!canGoBack && !searching} onClick={() => (searching ? setQuery('') : onBack())}>
            <Icon name="back" size={16} />
          </button>
          <h2 className="lib-title" title={pageTitle}>{pageTitle}</h2>
          <div className="search-box lib-search">
            <Icon name="search" size={15} />
            <input
              id="library-search"
              ref={searchInputRef}
              type="search"
              placeholder={isShowsMode ? 'Search TV shows, episodes (S01E01), networks, cast… (Ctrl+F)' : 'Search movies, franchises, directors, cast, genres, years… (Ctrl+F)'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            />
          </div>
          {folders.length > 0 && (
            <select
              id="library-scope"
              className="lib-select"
              title="Limit the library to one media folder"
              value={scopeFolder ? scopeFolder.id : ''}
              onChange={(e) => setPref('scope', e.target.value || null)}
            >
              <option value="">All media sources</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          <button id="btn-browse-refresh" className="btn-icon-only" onClick={onRefresh} title="Reload movie & TV library index">
            <Icon name="history" size={15} />
          </button>
          {onFetchMetadata && (
            <button
              id="btn-toolbar-fetch-metadata"
              className="btn-secondary"
              disabled={!index.tracks.length || isFetchingMetadata}
              onClick={() => onFetchMetadata(scopeFolder ? index.tracks : null, { force: true })}
              title="Fetch official posters, descriptions, ratings & episode guides from public APIs (IMDb / TVmaze / Wikipedia)"
            >
              <Icon name="locate" size={14} />
              <span>{isFetchingMetadata ? 'Fetching…' : 'Fetch Metadata'}</span>
            </button>
          )}
          <button id="btn-browse-add-folder" className="btn-accent" onClick={onAddFolder} title="Add a movie or TV show folder">
            <Icon name="plus" size={14} /><span>Add folder</span>
          </button>
          <button className="btn-secondary" onClick={onAddFiles} title="Add individual movie or video files">
            <span>Add videos</span>
          </button>
        </div>
        <div className="lib-content" ref={contentRef}>
          <ScrollContainerContext.Provider value={contentRef}>
            {body}
          </ScrollContainerContext.Provider>
        </div>
      </div>
    </div>
  );
}

function NavItem({ item, count, active, onClick }) {
  return (
    <button id={`lib-nav-${item.id}`} className={`lib-nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon name={item.icon} size={15} />
      <span className="lib-nav-label">{item.label}</span>
      {count != null && <span className="lib-nav-count">{count.toLocaleString()}</span>}
    </button>
  );
}

function titleFor(nav, index, isShowsMode = false) {
  if (nav.detail) {
    const { type, key } = nav.detail;
    const map = { album: index.albumByKey, artist: index.artistByKey, genre: index.genreByKey, franchise: index.franchiseByKey, decade: index.decadeByKey, composer: index.composerByKey }[type];
    const item = map && map.get(key);
    return item ? (item.title || item.name) : (isShowsMode ? 'TV Shows' : 'Movies');
  }
  const all = [...MOVIE_SECTIONS, ...SHOW_SECTIONS, ...LIBRARY_COLLECTIONS, { id: 'folders', label: 'Folders & Cloud' }];
  return (all.find(s => s.id === (nav.section || (isShowsMode ? 'tv_navigator' : 'albums'))) || {}).label || (isShowsMode ? 'TV Shows' : 'Movies');
}

function EmptyLibrary({ mode = 'movies', onAddFolder, onAddFiles, onCloud, isScanning }) {
  const isShows = mode === 'shows';
  return (
    <div className="lib-empty">
      <Icon name={isShows ? 'tv' : 'library'} size={40} />
      <h3>{isScanning ? `Indexing your ${isShows ? 'TV shows' : 'movies'}…` : `Your ${isShows ? 'TV Shows' : 'Movies'} library is empty`}</h3>
      <p>Add a {isShows ? 'TV show series' : 'movie'} folder from this computer, link a cloud/SFTP server, or drag &amp; drop video files anywhere in this window.</p>
      <div className="lib-empty-actions">
        <button className="btn-accent" onClick={onAddFolder}><Icon name="folder" size={14} /> Add folder</button>
        <button className="btn-secondary" onClick={onAddFiles}>Add videos</button>
        <button className="btn-secondary" onClick={onCloud}><Icon name="cloud" size={14} /> Cloud / SFTP storage</button>
      </div>
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────────

function SortSelect({ value, options, onChange, id }) {
  return (
    <label className="lib-sort">
      <span>Sort</span>
      <select id={id} className="lib-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    </label>
  );
}

function SectionHeader({ title, subtitle, tracks, children }) {
  const { actions } = useLibrary();
  return (
    <div className="section-header">
      <div className="section-header-text">
        {title && <h3>{title}</h3>}
        {subtitle && <span className="section-sub">{subtitle}</span>}
      </div>
      <div className="section-header-actions">
        {children}
        {tracks && (
          <>
            <button className="btn-accent" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0)}><Icon name="play" size={12} /> Watch All</button>
            <button className="btn-secondary" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0, { shuffle: true })}><Icon name="shuffle" size={13} /> Shuffle</button>
          </>
        )}
      </div>
    </div>
  );
}

function SectionView({ section, ...props }) {
  switch (section) {
    case 'albums': return <AlbumsSection {...props} />;
    case 'movies_only': return <MoviesOnlySection {...props} />;
    case 'tv_navigator': return <TvNavigatorSection {...props} />;
    case 'tv_shows': return <TvShowsSection {...props} />;
    case 'tv_networks': return <TvNetworksSection {...props} />;
    case 'franchises': return <FranchisesSection {...props} />;
    case 'artists': return <ArtistsSection {...props} />;
    case 'songs': return <SongsSection {...props} />;
    case 'genres': return <GenresSection {...props} />;
    case 'decades': return <DecadesSection {...props} />;
    case 'composers': return <ComposersSection {...props} />;
    case 'loved': return <LovedSection {...props} />;
    case 'recent': return <RecentSection {...props} />;
    case 'history': return <HistorySection {...props} />;
    case 'top': return <TopSection {...props} />;
    case 'folders': return <FoldersSection {...props} />;
    default: return null;
  }
}

// Sorts that read play counts / loved marks must re-run when stats change; the
// others only when the library does, so playback events don't re-sort 100k songs.
const STATS_SORTS = new Set(['plays', 'lastPlayed', 'loved']);
const statsDep = (key, stats) => (STATS_SORTS.has(key) ? stats : null);

const albumLetter = (a) => indexLetter(a.title);
const albumArtistLetter = (a) => indexLetter(a.artist);
const artistLetter = (a) => (a.isPlaceholder ? '?' : indexLetter(a.name));

function CinemaHeroSpotlight({ albums, go }) {
  const ctx = useLibrary();
  const [spotIdx, setSpotIdx] = useState(0);
  const featured = useMemo(() => {
    const withRich = albums.filter(a => (a.artId && a.overview) || a.year >= 2000 || a.franchise);
    return (withRich.length ? withRich : albums).slice(0, 12);
  }, [albums]);
  if (!featured.length) return null;
  const movie = featured[spotIdx % featured.length] || featured[0];
  const qualBadge = movie.quality?.badge || movie.artist || '1080p HD';
  return (
    <div className="cinema-hero-billboard">
      <div className="cinema-hero-poster" onClick={() => go({ section: 'albums', detail: { type: 'album', key: movie.key } })}>
        <Cover artId={movie.artId} name={movie.title} />
        <span className="poster-badge-top">{qualBadge}</span>
      </div>
      <div className="cinema-hero-info">
        <div className="cinema-hero-eyebrow-row">
          <span className="cinema-spotlight-pill">{movie.isTvShow ? '📺 TV SERIES SPOTLIGHT' : '🎬 FEATURE FILM SPOTLIGHT'}</span>
          <span className="cinema-hero-collection">
            {movie.isTvShow ? `TV Series · ${plural(movie.seasonCount || 1, 'Season')} · ${plural(movie.episodeCount || movie.tracks.length, 'Episode')}` : (movie.franchise || movie.genre || 'Feature Film')}
          </span>
        </div>
        <h2 className="cinema-hero-title" onClick={() => go({ section: 'albums', detail: { type: 'album', key: movie.key } })}>{movie.title}</h2>
        <div className="cinema-hero-badges">
          {movie.year && <span className="cinema-meta-pill gold">{movie.year}</span>}
          {movie.rating && <span className="cinema-meta-pill gold">★ {movie.rating}</span>}
          {movie.network && <span className="cinema-meta-pill cyan">{movie.network}</span>}
          <span className="cinema-meta-pill cyan">{qualBadge}</span>
          {(movie.genres || [movie.genre]).filter(Boolean).map(g => (
            <span key={g} className="cinema-meta-pill purple" onClick={() => ctx.actions.goToGenre(g)}>{g}</span>
          ))}
        </div>
        <p className="cinema-hero-desc">
          {movie.overview
            ? (movie.overview.length > 260 ? `${movie.overview.slice(0, 260).trim()}…` : movie.overview)
            : `${movie.franchise ? `Part of the ${movie.franchise} collection. ` : ''}Instant HTTP 206 byte-range streaming to desktop or 10-foot Smart TV with zero-cloud LAN cast.`}
        </p>
        {(movie.cast || movie.director) && (
          <div className="cinema-hero-credits">
            {movie.director && <span><strong>Director:</strong> {movie.director}</span>}
            {movie.cast && <span><strong>Starring:</strong> {movie.cast}</span>}
          </div>
        )}
        <div className="cinema-hero-actions">
          <button className="btn-cinema-play" onClick={() => ctx.actions.playTracks(movie.tracks, 0)}>
            <Icon name="play" size={14} /> {movie.isTvShow ? 'Start / Resume Series' : 'Watch Movie'}
          </button>
          {ctx.actions.hasSpeakers && (
            <button className="btn-secondary" onClick={() => ctx.actions.castTracks(movie.tracks)}>
              <Icon name="cast" size={14} /> Cast to TV
            </button>
          )}
          <button className="btn-secondary" onClick={() => go({ section: 'albums', detail: { type: 'album', key: movie.key } })}>
            <Icon name="info" size={14} /> {movie.isTvShow ? 'Seasons & Episodes' : 'Movie Details'}
          </button>
          {featured.length > 1 && (
            <button className="btn-secondary" onClick={() => setSpotIdx((spotIdx + 1) % featured.length)} title="Next Featured Title">
              Next Spotlight ▸
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AlbumsSection({ index, go, prefs, setPref }) {
  const sortKey = prefs.albumSort || 'title';
  const activeGenre = prefs.categoryFilter || 'all';
  const filteredAlbums = useMemo(() => {
    const base = sortAlbums(index.albums, sortKey);
    if (activeGenre === 'all' || activeGenre === '__movies__' || activeGenre === '__tv__') return base;
    if (activeGenre === '__franchises__') return base.filter(a => !!a.franchise);
    return base.filter(a => (a.genres || [a.genre]).some(g => fold(g) === activeGenre));
  }, [index, sortKey, activeGenre]);
  const lettered = (activeGenre === 'all' || activeGenre === '__movies__') && (sortKey === 'title' || sortKey === 'artist') && filteredAlbums.length >= LETTER_SECTION_MIN;
  return (
    <>
      <CinemaHeroSpotlight albums={index.albums} go={go} />
      <div className="cinema-category-bar" role="tablist" aria-label="Movie Categories">
        <button
          className={`cinema-cat-chip ${(activeGenre === 'all' || activeGenre === '__movies__') ? 'active' : ''}`}
          onClick={() => setPref('categoryFilter', 'all')}
        >
          🎬 All Movies <span className="chip-count">{index.albums.length}</span>
        </button>
        {(index.franchises || []).length > 0 && (
          <button
            className={`cinema-cat-chip ${activeGenre === '__franchises__' ? 'active' : ''}`}
            onClick={() => setPref('categoryFilter', '__franchises__')}
          >
            🎞️ Franchises &amp; Box Sets <span className="chip-count">{index.franchises.length}</span>
          </button>
        )}
        {index.genres.map(g => (
          <button
            key={g.key}
            className={`cinema-cat-chip ${activeGenre === g.key ? 'active' : ''}`}
            onClick={() => setPref('categoryFilter', g.key)}
          >
            {g.name} <span className="chip-count">{g.albums.length}</span>
          </button>
        ))}
      </div>
      <SectionHeader subtitle={`${plural(filteredAlbums.length, 'feature film')} · Theatrical & home cinema`} tracks={filteredAlbums.flatMap(a => a.tracks)}>
        <SortSelect id="album-sort" value={sortKey} onChange={(v) => setPref('albumSort', v)} options={[['title', 'Title (A–Z)'], ['year', 'Release Year (newest)'], ['addedAt', 'Recently added'], ['artist', 'Quality / Format']]} />
      </SectionHeader>
      <AlbumGrid albums={filteredAlbums} go={go} letterOf={lettered ? (sortKey === 'title' ? albumLetter : albumArtistLetter) : null} />
    </>
  );
}

function MoviesOnlySection({ index, go, prefs, setPref }) {
  return <AlbumsSection index={index} go={go} prefs={prefs} setPref={setPref} />;
}

/**
 * Purpose-built TV Show Navigator (`Show -> Season -> Episode` split browser).
 * Unlike Movies (which are flat single files), TV Shows have a 3-tier hierarchy:
 *   1. Series Picker (with Network / Genre / Search / In-Progress filter)
 *   2. Show Overview Banner + Interactive Season Tabs (`All Seasons`, `Season 1`, `Season 2`, ...)
 *   3. Episode Guide (with `S01E01` codes, episode titles, air dates, ratings, plot synopses, and resume bars)
 */
function TvNavigatorSection({ index, go, prefs, setPref, stats }) {
  const shows = useMemo(() => sortAlbums(index.tvShows || [], prefs.tvSort || 'title'), [index, prefs.tvSort]);
  const [seriesFilter, setSeriesFilter] = useState('all'); // 'all' | 'continue' | network
  const [seriesQuery, setSeriesQuery] = useState('');

  const networks = useMemo(() => {
    const counts = new Map();
    for (const s of shows) {
      if (s.network) counts.set(s.network, (counts.get(s.network) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [shows]);

  const inProgressShows = useMemo(() => {
    return shows.filter(s => {
      const ws = getShowWatchState(s, stats);
      return ws.hasActivity && !ws.completed;
    });
  }, [shows, stats]);

  const filteredShows = useMemo(() => {
    let list = shows;
    if (seriesFilter === 'continue') {
      list = inProgressShows;
    } else if (seriesFilter.startsWith('net:')) {
      const net = seriesFilter.slice(4);
      list = list.filter(s => s.network === net);
    } else if (seriesFilter.startsWith('genre:')) {
      const gKey = seriesFilter.slice(6);
      list = list.filter(s => (s.genres || [s.genre]).some(g => fold(g) === gKey));
    }
    if (seriesQuery.trim()) {
      const q = seriesQuery.trim().toLowerCase();
      list = list.filter(s =>
        String(s.title || '').toLowerCase().includes(q)
        || String(s.network || '').toLowerCase().includes(q)
        || String(s.overview || '').toLowerCase().includes(q)
        || String(s.cast || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [shows, inProgressShows, seriesFilter, seriesQuery]);

  const selectedKey = prefs.selectedShowKey && index.albumByKey.has(prefs.selectedShowKey)
    ? prefs.selectedShowKey
    : (filteredShows[0]?.key || shows[0]?.key || null);
  const activeShow = (selectedKey && index.albumByKey.get(selectedKey)) || filteredShows[0] || shows[0] || null;

  if (!shows.length) {
    return <div className="empty-inline">No TV shows or episodes found in your library yet.</div>;
  }

  return (
    <div className="tv-navigator-workspace">
      {/* Top Filter & View Switcher Bar */}
      <div className="cinema-category-bar tv-nav-filter-bar" role="tablist" aria-label="TV Series Filters">
        <button
          className={`cinema-cat-chip ${seriesFilter === 'all' ? 'active' : ''}`}
          onClick={() => setSeriesFilter('all')}
        >
          📺 All Series <span className="chip-count">{shows.length}</span>
        </button>
        {inProgressShows.length > 0 && (
          <button
            className={`cinema-cat-chip ${seriesFilter === 'continue' ? 'active' : ''}`}
            onClick={() => setSeriesFilter('continue')}
          >
            ▶ Continue Watching <span className="chip-count">{inProgressShows.length}</span>
          </button>
        )}
        {networks.slice(0, 8).map(([net, cnt]) => (
          <button
            key={net}
            className={`cinema-cat-chip ${seriesFilter === `net:${net}` ? 'active' : ''}`}
            onClick={() => setSeriesFilter(`net:${net}`)}
          >
            {net} <span className="chip-count">{cnt}</span>
          </button>
        ))}
        {index.genres.slice(0, 5).map(g => (
          <button
            key={g.key}
            className={`cinema-cat-chip ${seriesFilter === `genre:${g.key}` ? 'active' : ''}`}
            onClick={() => setSeriesFilter(`genre:${g.key}`)}
          >
            {g.name} <span className="chip-count">{g.albums.length}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button
          className="btn-secondary"
          onClick={() => go({ section: 'tv_shows' })}
          title="Switch to full-width TV Series Poster Grid"
        >
          <Icon name="grid" size={13} /> Poster Grid View
        </button>
      </div>

      <div className="tv-navigator-split">
        {/* Left Column: Series List (Show Picker) */}
        <aside className="tv-navigator-series-list" aria-label="TV Series List">
          <div className="tv-navigator-series-header">
            <input
              type="search"
              className="tv-series-filter-input"
              placeholder="Filter shows by title, network, cast…"
              value={seriesQuery}
              onChange={(e) => setSeriesQuery(e.target.value)}
            />
            <SortSelect
              id="tv-nav-sort"
              value={prefs.tvSort || 'title'}
              onChange={(v) => setPref('tvSort', v)}
              options={[['title', 'A–Z'], ['year', 'Newest'], ['addedAt', 'Added']]}
            />
          </div>
          <div className="tv-navigator-series-items">
            {filteredShows.map(show => {
              const ws = getShowWatchState(show, stats);
              const isSelected = activeShow && activeShow.key === show.key;
              const epCode = ws.resumeTrack?.episodeCode
                || (ws.resumeTrack?.seasonNumber != null
                  ? `S${String(ws.resumeTrack.seasonNumber).padStart(2, '0')}E${String(ws.resumeTrack.episodeNumber || 1).padStart(2, '0')}`
                  : null);
              return (
                <div
                  key={show.key}
                  className={`tv-series-rail-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setPref('selectedShowKey', show.key)}
                >
                  <div className="tv-series-rail-poster">
                    <Cover artId={show.artId} name={show.title} />
                  </div>
                  <div className="tv-series-rail-body">
                    <div className="tv-series-rail-title-row">
                      <span className="tv-series-rail-title">{show.title}</span>
                      {show.rating && <span className="tv-series-rail-rating">★ {show.rating}</span>}
                    </div>
                    <div className="tv-series-rail-meta">
                      <span>{plural(show.seasonCount || 1, 'Season')} · {plural(show.episodeCount || show.tracks.length, 'Ep')}</span>
                      {show.network && <span className="tv-series-rail-net">{show.network}</span>}
                    </div>
                    {ws.completed ? (
                      <span className="tv-series-rail-status watched">✓ All {ws.totalEpisodes} Watched</span>
                    ) : ws.hasActivity ? (
                      <span className="tv-series-rail-status resume">
                        ▶ {ws.resumePositionSec >= 5 ? `Resume ${epCode} (${formatDuration(ws.resumePositionSec)})` : `Next: ${epCode} (${ws.completedCount}/${ws.totalEpisodes})`}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Active Show Banner + Season Tabs + Episode Guide */}
        <section className="tv-navigator-show-stage">
          {activeShow ? (
            <>
              <DetailHeader
                album={activeShow}
                cover={<Cover artId={activeShow.artId} name={activeShow.title} />}
                eyebrow="TV Series"
                title={activeShow.title}
                subtitle={activeShow.network ? <span>{activeShow.network}{activeShow.year ? ` · Premiered ${activeShow.year}` : ''}</span> : null}
                meta={[
                  activeShow.year,
                  activeShow.genre,
                  plural(activeShow.seasonCount || 1, 'Season'),
                  plural(activeShow.episodeCount || activeShow.tracks.length, 'Episode'),
                  formatLongDuration(activeShow.duration),
                ]}
                tracks={activeShow.tracks}
                menuLabel={activeShow.title}
              />
              <TvShowSeasonsBreakdown key={activeShow.key} album={activeShow} />
            </>
          ) : (
            <div className="empty-inline">Select a TV show on the left to browse its seasons and episodes.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function TvShowsSection({ index, go, prefs, setPref, stats }) {
  const sortKey = prefs.albumSort || 'title';
  const [netFilter, setNetFilter] = useState('all');
  const shows = useMemo(() => sortAlbums(index.tvShows || [], sortKey), [index, sortKey]);
  const networks = useMemo(() => {
    const counts = new Map();
    for (const s of shows) {
      if (s.network) counts.set(s.network, (counts.get(s.network) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [shows]);

  const inProgressShows = useMemo(() => {
    return shows.filter(s => {
      const ws = getShowWatchState(s, stats || {});
      return ws.hasActivity && !ws.completed;
    });
  }, [shows, stats]);

  const filteredShows = useMemo(() => {
    if (netFilter === 'all') return shows;
    if (netFilter === '__continue__') return inProgressShows;
    return shows.filter(s => s.network === netFilter);
  }, [shows, inProgressShows, netFilter]);

  const allEpisodes = useMemo(() => filteredShows.flatMap(s => s.tracks), [filteredShows]);
  const totalSeasons = useMemo(() => filteredShows.reduce((sum, s) => sum + (s.seasonCount || 1), 0), [filteredShows]);
  return (
    <>
      <CinemaHeroSpotlight albums={shows} go={go} />
      <div className="cinema-category-bar" role="tablist" aria-label="TV Networks & Filters">
        <button
          className={`cinema-cat-chip ${netFilter === 'all' ? 'active' : ''}`}
          onClick={() => setNetFilter('all')}
        >
          📺 All TV Series <span className="chip-count">{shows.length}</span>
        </button>
        {inProgressShows.length > 0 && (
          <button
            className={`cinema-cat-chip ${netFilter === '__continue__' ? 'active' : ''}`}
            onClick={() => setNetFilter('__continue__')}
          >
            ▶ Continue Watching <span className="chip-count">{inProgressShows.length}</span>
          </button>
        )}
        {networks.map(([net, cnt]) => (
          <button
            key={net}
            className={`cinema-cat-chip ${netFilter === net ? 'active' : ''}`}
            onClick={() => setNetFilter(net)}
          >
            {net} <span className="chip-count">{cnt}</span>
          </button>
        ))}
      </div>
      <SectionHeader
        subtitle={`${plural(filteredShows.length, 'TV show')} · ${plural(totalSeasons, 'season')} · ${plural(allEpisodes.length, 'episode')}`}
        tracks={allEpisodes}
      >
        <button className="btn-secondary" onClick={() => go({ section: 'tv_navigator' })}>
          <Icon name="tv" size={13} /> Split Season/Episode Navigator
        </button>
        <SortSelect id="tv-sort" value={sortKey} onChange={(v) => setPref('albumSort', v)} options={[['title', 'Show Title (A–Z)'], ['year', 'Release Year (newest)'], ['addedAt', 'Recently added']]} />
      </SectionHeader>
      {filteredShows.length ? (
        <AlbumGrid
          albums={filteredShows}
          go={(view) => {
            if (view?.detail?.type === 'album') {
              setPref('selectedShowKey', view.detail.key);
            }
            go(view);
          }}
        />
      ) : (
        <div className="empty-inline">No TV shows match this filter.</div>
      )}
    </>
  );
}

function TvNetworksSection({ index, go, setPref }) {
  const shows = index.tvShows || [];
  const networkGroups = useMemo(() => {
    const map = new Map();
    for (const s of shows) {
      const net = s.network || 'Other Networks';
      if (!map.has(net)) map.set(net, []);
      map.get(net).push(s);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [shows]);

  if (!networkGroups.length) {
    return <div className="empty-inline">No TV network metadata found yet. Click “Fetch Metadata” to enrich your shows.</div>;
  }

  return (
    <div className="tv-networks-page">
      {networkGroups.map(([netName, netShows]) => (
        <div key={netName} className="tv-show-section-block">
          <SectionHeader
            title={netName}
            subtitle={`${plural(netShows.length, 'TV series')} · ${plural(netShows.reduce((acc, s) => acc + (s.episodeCount || s.tracks.length), 0), 'episode')}`}
            tracks={netShows.flatMap(s => s.tracks)}
          />
          <AlbumGrid
            albums={netShows}
            go={(view) => {
              if (view?.detail?.type === 'album' && setPref) setPref('selectedShowKey', view.detail.key);
              go(view);
            }}
          />
        </div>
      ))}
    </div>
  );
}

function FranchisesSection({ index, go }) {
  const franchises = index.franchises || [];
  return (
    <>
      <SectionHeader subtitle={`${plural(franchises.length, 'collection')} · Multi-movie box sets & series`} />
      {franchises.length ? <GroupGrid groups={franchises} type="franchise" go={go} big /> : <div className="empty-inline">No multi-movie franchises detected yet.</div>}
    </>
  );
}

function ArtistsSection({ index, go, prefs, setPref, stats }) {
  const sortKey = prefs.artistSort || 'name';
  const artists = useMemo(() => sortArtists(index.artists, sortKey, stats), [index, sortKey, statsDep(sortKey, stats)]); // eslint-disable-line react-hooks/exhaustive-deps
  const lettered = sortKey === 'name' && artists.length >= LETTER_SECTION_MIN;
  return (
    <>
      <SectionHeader subtitle={plural(artists.length, 'release format')} tracks={index.tracks}>
        <SortSelect id="artist-sort" value={sortKey} onChange={(v) => setPref('artistSort', v)} options={[['name', 'Format Name'], ['tracks', 'Most titles'], ['albums', 'Most releases'], ['plays', 'Most watched']]} />
      </SectionHeader>
      <ArtistGrid artists={artists} go={go} letterOf={lettered ? artistLetter : null} />
    </>
  );
}

function SongsSection({ index, prefs, setPref, stats }) {
  const sort = prefs.songSort || { key: 'title', dir: 'asc' };
  const sorted = useMemo(
    () => sortTracks(index.tracks, sort.key, sort.dir, stats),
    [index, sort.key, sort.dir, statsDep(sort.key, stats)] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <>
      <SectionHeader subtitle={`${plural(sorted.length, 'title')} · ${formatLongDuration(index.totalDuration)}`} tracks={sorted} />
      <TrackList id="library-songs" tracks={sorted} sort={sort} onSort={(key) => setPref('songSort', toggleSort(sort, key))} />
    </>
  );
}

function GenresSection({ index, go, prefs, setPref }) {
  const sortKey = prefs.genreSort || 'name';
  const genres = useMemo(
    () => (sortKey === 'tracks' ? [...index.genres].sort((a, b) => b.tracks.length - a.tracks.length) : index.genres),
    [index, sortKey]
  );
  return (
    <>
      <SectionHeader subtitle={plural(genres.length, 'category')}>
        <SortSelect id="genre-sort" value={sortKey} onChange={(v) => setPref('genreSort', v)} options={[['name', 'Category Name'], ['tracks', 'Most titles']]} />
      </SectionHeader>
      {genres.length ? <GroupGrid groups={genres} type="genre" go={go} /> : <div className="empty-inline">No genre categories found in your library.</div>}
    </>
  );
}

function DecadesSection({ index, go }) {
  return (
    <>
      <SectionHeader subtitle={plural(index.decades.length, 'decade')} />
      {index.decades.length ? <GroupGrid groups={index.decades} type="decade" go={go} big /> : <div className="empty-inline">No release years found in your library.</div>}
    </>
  );
}

function ComposersSection({ index, go }) {
  return (
    <>
      <SectionHeader subtitle={plural(index.composers.length, 'director / studio')} />
      {index.composers.length ? (
        <VirtualGrid
          items={index.composers}
          keyOf={(c) => c.key}
          className="name-list"
          minWidth={240}
          gapX={6}
          gapY={6}
          itemHeight={42}
          letterOf={index.composers.length >= LETTER_SECTION_MIN ? (c) => indexLetter(c.name) : null}
          renderItem={(c) => (
            <button className="name-list-item" onClick={() => go({ section: 'composers', detail: { type: 'composer', key: c.key } })}>
              <Icon name="pen" size={14} />
              <span className="name-list-name">{c.name}</span>
              <span className="name-list-meta">{plural(c.tracks.length, 'title')}</span>
            </button>
          )}
        />
      ) : <div className="empty-inline">No director or studio tags found in your library.</div>}
    </>
  );
}

function LovedSection({ index, stats }) {
  const loved = useMemo(() => lovedTracks(index.tracks, stats), [index, stats]);
  return (
    <>
      <SectionHeader subtitle={`${plural(loved.length, 'watchlist title')} · newest first`} tracks={loved} />
      <TrackList id="library-loved" tracks={loved} emptyText="Tap the ♥ on any movie or episode to add it to My Watchlist." />
    </>
  );
}

function RecentSection({ index, go }) {
  const recentAlbums = useMemo(() => sortAlbums(index.albums, 'addedAt').slice(0, 12), [index]);
  const recentTracks = useMemo(() => recentlyAddedTracks(index.tracks).slice(0, 500), [index]);
  return (
    <>
      <SectionHeader title="Recently Added Movies &amp; Shows" />
      <AlbumGrid albums={recentAlbums} go={go} />
      <SectionHeader title="Recently Added Video Files" subtitle={recentTracks.length >= 500 ? 'Latest 500' : null} tracks={recentTracks} />
      <TrackList id="library-recent" tracks={recentTracks} extraColumn="added" />
    </>
  );
}

function HistorySection({ index, go, stats }) {
  const inProgress = useMemo(() => inProgressTracks(index.tracks, stats), [index, stats]);
  const inProgressShows = useMemo(() => {
    return (index.tvShows || []).filter(show => {
      const st = getShowWatchState(show, stats);
      return st.hasActivity && !st.completed;
    });
  }, [index, stats]);
  const played = useMemo(() => recentlyPlayedTracks(index.tracks, stats).slice(0, 500), [index, stats]);
  return (
    <>
      {inProgress.length > 0 && (
        <>
          <SectionHeader
            title="Continue Watching — Pick Up Where You Left Off"
            subtitle={`${plural(inProgress.length, 'title')} paused mid-stream`}
            tracks={inProgress}
          />
          <TrackList id="library-continue-watching" tracks={inProgress} extraColumn="lastPlayed" />
        </>
      )}
      {inProgressShows.length > 0 && (
        <>
          <SectionHeader
            title="TV Series In Progress"
            subtitle={`${plural(inProgressShows.length, 'show')} with active episode progress`}
          />
          <AlbumGrid albums={inProgressShows} go={go} />
        </>
      )}
      <SectionHeader
        title="Recently Watched History"
        subtitle="Movies and episodes you recently watched"
        tracks={played}
      />
      <TrackList id="library-history" tracks={played} extraColumn="lastPlayed" emptyText="Nothing watched yet — start watching any movie or TV episode and your progress will be saved automatically." />
    </>
  );
}

function TopSection({ index, go, stats }) {
  const top = useMemo(() => mostPlayedTracks(index.tracks, stats).slice(0, 200), [index, stats]);
  const topArtists = useMemo(() => sortArtists(index.artists.filter(a => !a.isPlaceholder), 'plays', stats)
    .filter(a => a.tracks.some(t => (stats[t.id] || {}).plays)).slice(0, 8), [index, stats]);
  return (
    <>
      {topArtists.length > 0 && (
        <>
          <SectionHeader title="Top Release Formats" />
          <ArtistGrid artists={topArtists} go={go} />
        </>
      )}
      <SectionHeader title="Most Watched Titles" subtitle={top.length ? `Top ${top.length}` : null} tracks={top} />
      <TrackList id="library-top" tracks={top} emptyText="Watch some movies or shows and your favorites will rise to the top." />
    </>
  );
}

function FoldersSection({ folders, folderProps }) {
  return (
    <div className="lib-folders">
      <p className="section-sub">Local folders and Cloud / SFTP servers feed your cinema library. Pick one to browse only its videos, or use “All media sources” in the toolbar.</p>
      <FolderPanel folders={folders} {...folderProps} />
    </div>
  );
}

function toggleSort(sort, key) {
  if (sort && sort.key === key) return { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' };
  const descFirst = ['plays', 'addedAt', 'lastPlayed', 'loved', 'year'];
  return { key, dir: descFirst.includes(key) ? 'desc' : 'asc' };
}

// ── Cards & grids ───────────────────────────────────────────────────────────

function AlbumGrid({ albums, go, showArtist = true, letterOf = null }) {
  if (!albums.length) return <div className="empty-inline">No movies or shows found.</div>;
  return (
    <VirtualGrid
      items={albums}
      keyOf={(a) => a.key}
      letterOf={letterOf}
      {...ALBUM_GRID}
      renderItem={(a) => <AlbumCard album={a} go={go} showArtist={showArtist} />}
    />
  );
}

function AlbumCard({ album, go, showArtist }) {
  const ctx = useLibrary();
  const { stats, actions } = ctx;
  const open = () => go({ section: 'albums', detail: { type: 'album', key: album.key } });
  const qualBadge = album.quality?.resolution || album.quality?.badge || null;
  const topBadge = album.isTvShow ? `📺 TV SERIES${qualBadge ? ` · ${qualBadge}` : ''}` : qualBadge;
  const bottomBadge = album.isTvShow
    ? `${album.seasonCount || 1}S · ${album.episodeCount || album.tracks.length}E`
    : album.year;

  const showWatch = album.isTvShow ? getShowWatchState(album, stats) : null;
  const movieWatch = (!album.isTvShow && album.tracks.length) ? getTrackWatchState(album.tracks[0], stats) : null;

  let watchBadge = null;
  let watchProgressPct = 0;
  let playLabel = `Watch ${album.title}`;
  let handleCardPlay = (e) => {
    e.stopPropagation();
    actions.playTracks(album.tracks, 0);
  };

  if (album.isTvShow && showWatch) {
    watchProgressPct = showWatch.progressPct;
    if (showWatch.completed) {
      watchBadge = { text: '✓ All Watched', cls: 'watched' };
    } else if (showWatch.hasActivity) {
      const epCode = showWatch.resumeTrack?.episodeCode
        || (showWatch.resumeTrack?.seasonNumber != null
          ? `S${String(showWatch.resumeTrack.seasonNumber).padStart(2, '0')}E${String(showWatch.resumeTrack.episodeNumber || 1).padStart(2, '0')}`
          : 'Next');
      if (showWatch.resumePositionSec >= 5) {
        watchBadge = { text: `▶ ${epCode} · ${formatDuration(showWatch.resumePositionSec)}`, cls: 'resume' };
        playLabel = `Resume ${album.title} (${epCode} at ${formatDuration(showWatch.resumePositionSec)})`;
      } else {
        watchBadge = { text: `▶ Next: ${epCode} (${showWatch.completedCount}/${showWatch.totalEpisodes})`, cls: 'resume' };
        playLabel = `Continue ${album.title} (${epCode})`;
      }
      handleCardPlay = (e) => {
        e.stopPropagation();
        actions.playTracks(album.tracks, showWatch.resumeIndex, { startAt: showWatch.resumePositionSec });
      };
    }
  } else if (movieWatch) {
    watchProgressPct = movieWatch.progressPct;
    if (movieWatch.completed) {
      watchBadge = { text: '✓ Watched', cls: 'watched' };
    } else if (movieWatch.inProgress) {
      watchBadge = { text: `▶ ${formatDuration(movieWatch.positionSec)} (${movieWatch.progressPct}%)`, cls: 'resume' };
      playLabel = `Resume ${album.title} at ${formatDuration(movieWatch.positionSec)}`;
      handleCardPlay = (e) => {
        e.stopPropagation();
        actions.playTracks(album.tracks, 0, { startAt: movieWatch.positionSec });
      };
    }
  }

  return (
    <div
      className="media-card album-card movie-poster-card"
      onClick={open}
      onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(e, [...collectionMenuItems(album.tracks, ctx, { label: album.title }), { separator: true }, { label: 'View release format', icon: 'tv', onClick: () => ctx.actions.goToArtist(album.artist) }]); }}
      title={`${album.title} — ${album.isTvShow ? `${plural(album.seasonCount || 1, 'Season')}, ${plural(album.episodeCount || album.tracks.length, 'Episode')}` : (album.genre || album.artist)}`}
    >
      <div className="media-card-art movie-poster-art">
        <Cover artId={album.artId} name={album.title} />
        {topBadge && <span className={`poster-badge-top ${album.isTvShow ? 'tv-badge' : ''}`}>{topBadge}</span>}
        {album.rating && <span className="poster-badge-rating">★ {album.rating}</span>}
        {watchBadge && <span className={`poster-badge-watch ${watchBadge.cls}`}>{watchBadge.text}</span>}
        {bottomBadge && <span className="poster-badge-year">{bottomBadge}</span>}
        {watchProgressPct > 0 && (
          <div className={`poster-watch-progress ${watchProgressPct >= 100 ? 'completed' : ''}`}>
            <div className="poster-watch-progress-fill" style={{ width: `${Math.min(100, watchProgressPct)}%` }} />
          </div>
        )}
        <button className="card-play" title={playLabel} onClick={handleCardPlay}>
          <Icon name="play" size={18} />
        </button>
      </div>
      <span className="media-card-title">{album.title}</span>
      <span className="media-card-sub">
        {album.isTvShow
          ? <span className="poster-franchise-tag">{plural(album.seasonCount || 1, 'Season')} · {plural(album.episodeCount || album.tracks.length, 'Episode')}{album.network ? ` · ${album.network}` : ''}{showWatch?.completedCount ? ` · ${showWatch.completedCount}/${showWatch.totalEpisodes} watched` : ''}</span>
          : album.franchise
            ? <span className="poster-franchise-tag">{album.franchise}</span>
            : (album.genre || (showArtist ? album.artist : plural(album.tracks.length, 'title')))}
      </span>
    </div>
  );
}

function ArtistGrid({ artists, go, letterOf = null }) {
  return (
    <VirtualGrid
      items={artists}
      keyOf={(a) => a.key}
      letterOf={letterOf}
      className="artists"
      {...ARTIST_GRID}
      renderItem={(a) => <ArtistCard artist={a} go={go} />}
    />
  );
}

function ArtistCard({ artist: a, go }) {
  const ctx = useLibrary();
  return (
    <div
      className="media-card artist-card"
      onClick={() => go({ section: 'artists', detail: { type: 'artist', key: a.key } })}
      onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(e, collectionMenuItems(a.tracks, ctx, { label: a.name })); }}
    >
      <div className="media-card-art">
        <Cover artId={a.artId} name={a.name} round />
        <button className="card-play" title={`Watch ${a.name}`} onClick={(e) => { e.stopPropagation(); ctx.actions.playTracks(a.tracks, 0, { shuffle: true }); }}>
          <Icon name="shuffle" size={16} />
        </button>
      </div>
      <span className="media-card-title">{a.name}</span>
      <span className="media-card-sub">
        {plural(a.tracks.length, 'title')}
      </span>
    </div>
  );
}

function GroupGrid({ groups, type, go, big = false }) {
  const ctx = useLibrary();
  const section = type === 'genre' ? 'genres' : type === 'franchise' ? 'franchises' : 'decades';
  return (
    <VirtualGrid
      items={groups}
      keyOf={(g) => g.key}
      className={`groups ${big ? 'big' : ''}`}
      minWidth={big ? 210 : 170}
      textHeight={24}
      renderItem={(g) => (
        <div
          className="media-card group-card"
          onClick={() => go({ section, detail: { type, key: g.key } })}
          onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(e, collectionMenuItems(g.tracks, ctx, { label: g.name })); }}
        >
          <div className="media-card-art">
            <Collage artIds={g.artIds} name={g.name} />
            <span className="group-card-name">{g.name}</span>
            <button className="card-play" title={`Watch ${g.name}`} onClick={(e) => { e.stopPropagation(); ctx.actions.playTracks(g.tracks, 0); }}>
              <Icon name="play" size={16} />
            </button>
          </div>
          <span className="media-card-sub">{plural(g.albums.length, 'title')} · {formatLongDuration(g.duration)}</span>
        </div>
      )}
    />
  );
}

function ArtistChips({ tracks, index, go, limit = 12 }) {
  const top = useMemo(() => {
    const counts = new Map();
    for (const t of tracks) counts.set(fold(t.artist), (counts.get(fold(t.artist)) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
      .map(([key]) => index.artistByKey.get(key)).filter(a => a && !a.isPlaceholder).slice(0, limit);
  }, [tracks, index, limit]);
  if (!top.length) return null;
  return (
    <div className="chip-row">
      {top.map(a => (
        <button key={a.key} className="artist-chip" onClick={() => go({ section: 'artists', detail: { type: 'artist', key: a.key } })}>
          <Cover artId={a.artId} name={a.name} round size={24} />
          <span>{a.name}</span>
        </button>
      ))}
    </div>
  );
}

// ── Detail pages ────────────────────────────────────────────────────────────

function DetailHeader({ cover, eyebrow, title, subtitle, meta = [], tracks, menuLabel, album = null }) {
  const ctx = useLibrary();
  const { actions, stats } = ctx;
  const allLoved = tracks.length > 0 && tracks.every(t => (stats[t.id] || {}).loved);
  const allWatched = tracks.length > 0 && tracks.every(t => getTrackWatchState(t, stats).completed);
  const showWatch = (album && album.isTvShow) ? getShowWatchState(album, stats) : null;
  const movieWatch = (album && !album.isTvShow && tracks.length) ? getTrackWatchState(tracks[0], stats) : null;

  let primaryPlayLabel = 'Watch Now';
  let handlePrimaryPlay = () => actions.playTracks(tracks, 0);
  let showStartOver = false;

  if (showWatch && showWatch.hasActivity && !showWatch.completed) {
    const epCode = showWatch.resumeTrack?.episodeCode
      || (showWatch.resumeTrack?.seasonNumber != null
        ? `S${String(showWatch.resumeTrack.seasonNumber).padStart(2, '0')}E${String(showWatch.resumeTrack.episodeNumber || 1).padStart(2, '0')}`
        : 'Next Episode');
    if (showWatch.resumePositionSec >= 5) {
      primaryPlayLabel = `Resume ${epCode} (${formatDuration(showWatch.resumePositionSec)})`;
      showStartOver = true;
    } else {
      primaryPlayLabel = `Continue: ${epCode}`;
    }
    handlePrimaryPlay = () => actions.playTracks(tracks, showWatch.resumeIndex, { startAt: showWatch.resumePositionSec });
  } else if (movieWatch && movieWatch.inProgress) {
    primaryPlayLabel = `Resume at ${formatDuration(movieWatch.positionSec)} (${movieWatch.progressPct}%)`;
    showStartOver = true;
    handlePrimaryPlay = () => actions.playTracks(tracks, 0, { startAt: movieWatch.positionSec });
  }

  return (
    <div className="detail-header">
      <div className="detail-cover">{cover}</div>
      <div className="detail-text">
        <span className="detail-eyebrow">
          {eyebrow}
          {album?.rating ? ` · ★ ${album.rating}` : ''}
          {album?.network ? ` · ${album.network}` : ''}
          {album?.showStatus ? ` · ${album.showStatus}` : ''}
        </span>
        <h2 className="detail-title">{title}</h2>
        {subtitle && <div className="detail-subtitle">{subtitle}</div>}
        <div className="detail-meta">{meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}</div>
        {album?.overview && (
          <p className="detail-overview">{album.overview}</p>
        )}
        {(album?.director || album?.cast) && (
          <div className="detail-credits">
            {album.director && <span><strong>Director:</strong> {album.director}</span>}
            {album.cast && <span><strong>Starring:</strong> {album.cast}</span>}
          </div>
        )}
        <div className="detail-actions">
          <button id="btn-detail-play" className="btn-accent" disabled={!tracks.length} onClick={handlePrimaryPlay}><Icon name="play" size={13} /> {primaryPlayLabel}</button>
          {showStartOver && (
            <button
              className="btn-secondary"
              onClick={() => actions.playTracks(tracks, showWatch ? showWatch.resumeIndex : 0, { startAt: 0 })}
              title="Start over from 0:00"
            >
              <Icon name="history" size={14} /> Start Over
            </button>
          )}
          {actions.hasSpeakers && (
            <button
              className="btn-secondary"
              disabled={!tracks.length}
              onClick={() => actions.castTracks(tracks, title, {
                startIndex: showWatch ? showWatch.resumeIndex : 0,
                startAt: showWatch ? showWatch.resumePositionSec : (movieWatch?.inProgress ? movieWatch.positionSec : null),
              })}
            >
              <Icon name="cast" size={14} /> Cast to TV
            </button>
          )}
          <button id="btn-detail-shuffle" className="btn-secondary" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0, { shuffle: true })}><Icon name="shuffle" size={14} /> Shuffle</button>
          <button className="btn-secondary" disabled={!tracks.length} onClick={() => actions.queueTracks(tracks, 'next')}><Icon name="playNext" size={14} /> Watch next</button>
          <button className="btn-secondary" disabled={!tracks.length} onClick={() => actions.queueTracks(tracks, 'end')}><Icon name="queueAdd" size={14} /> Add to queue</button>
          {actions.setWatched && (
            <button
              className="btn-secondary"
              disabled={!tracks.length}
              onClick={() => actions.setWatched(tracks, !allWatched)}
              title={allWatched ? 'Mark all as unwatched' : 'Mark as watched'}
            >
              <Icon name="check" size={14} /> {allWatched ? 'Watched ✓' : 'Mark Watched'}
            </button>
          )}
          {actions.fetchMetadata && (
            <button
              id="btn-detail-fetch-metadata"
              className="btn-secondary"
              disabled={!tracks.length || ctx.isFetchingMetadata}
              onClick={() => actions.fetchMetadata(tracks, { force: true })}
              title="Refresh poster, plot synopsis, ratings & episode guide from public APIs (IMDb / TVmaze / Wikipedia)"
            >
              <Icon name="locate" size={14} /> Refresh Metadata
            </button>
          )}
          <button className={`btn-icon-only ${allLoved ? 'loved' : ''}`} title={allLoved ? 'Remove from Watchlist' : 'Add to Watchlist'} onClick={() => actions.setLoved(tracks, !allLoved)}>
            <Icon name={allLoved ? 'heartFill' : 'heart'} size={15} />
          </button>
          <button className="btn-icon-only" title="More" onClick={(e) => ctx.openMenu(e, collectionMenuItems(tracks, ctx, { label: menuLabel }))}>
            <Icon name="more" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function NotFound({ go }) {
  return (
    <div className="lib-empty">
      <h3>Not in your library anymore</h3>
      <p>It may have been removed by a folder sync, or it lives outside the selected folder.</p>
      <button className="btn-secondary" onClick={() => go({ section: 'albums' })}>Browse Movies &amp; Shows</button>
    </div>
  );
}

function DetailView({ detail, index, go, stats }) {
  const { type, key } = detail;
  if (type === 'album') {
    const album = index.albumByKey.get(key);
    return album ? <AlbumDetail album={album} index={index} go={go} /> : <NotFound go={go} />;
  }
  if (type === 'artist') {
    const artist = index.artistByKey.get(key);
    return artist ? <ArtistDetail artist={artist} go={go} stats={stats} /> : <NotFound go={go} />;
  }
  if (type === 'genre' || type === 'decade' || type === 'franchise') {
    const map = type === 'genre' ? index.genreByKey : type === 'franchise' ? index.franchiseByKey : index.decadeByKey;
    const group = map && map.get(key);
    return group ? <GroupDetail group={group} type={type} index={index} go={go} /> : <NotFound go={go} />;
  }
  if (type === 'composer') {
    const composer = index.composerByKey.get(key);
    return composer ? <ComposerDetail composer={composer} /> : <NotFound go={go} />;
  }
  return <NotFound go={go} />;
}

function TvShowSeasonsBreakdown({ album }) {
  const ctx = useLibrary();
  const { actions, currentTrack, isPlaying, openMenu, stats } = ctx;
  const seasons = album.seasons && album.seasons.length
    ? album.seasons
    : [{ seasonNumber: 1, label: 'Season 1', code: 'S01', episodes: album.tracks, episodeCount: album.tracks.length, duration: album.duration }];
  const [selectedSeason, setSelectedSeason] = useState('all');

  const visibleSeasons = selectedSeason === 'all'
    ? seasons
    : seasons.filter(s => String(s.seasonNumber) === String(selectedSeason));

  return (
    <div className="tv-seasons-breakdown">
      <div className="tv-season-tabs" role="tablist" aria-label="Seasons">
        <button
          className={`cinema-cat-chip ${selectedSeason === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedSeason('all')}
        >
          📺 All Seasons <span className="chip-count">{seasons.length}</span>
        </button>
        {seasons.map(s => {
          const watchedInSeason = s.episodes.filter(ep => getTrackWatchState(ep, stats).completed).length;
          return (
            <button
              key={s.seasonNumber}
              className={`cinema-cat-chip ${String(selectedSeason) === String(s.seasonNumber) ? 'active' : ''}`}
              onClick={() => setSelectedSeason(String(s.seasonNumber))}
            >
              {s.label} <span className="chip-count">{watchedInSeason > 0 ? `${watchedInSeason}/${s.episodeCount}` : plural(s.episodeCount, 'Episode')}</span>
            </button>
          );
        })}
      </div>

      {visibleSeasons.map(season => {
        const watchedCount = season.episodes.filter(ep => getTrackWatchState(ep, stats).completed).length;
        const allSeasonWatched = season.episodes.length > 0 && watchedCount === season.episodes.length;
        const seasonState = getShowWatchState({ tracks: season.episodes }, stats);
        return (
          <div key={season.seasonNumber} className="tv-season-card">
            <div className="tv-season-card-header">
              <div className="tv-season-card-title">
                <span className="tv-season-badge">{season.code}</span>
                <h4>{season.label}</h4>
                <span className="tv-season-meta">
                  {plural(season.episodeCount, 'Episode')}
                  {watchedCount > 0 ? ` · ${watchedCount}/${season.episodeCount} Watched` : ''}
                  {season.duration > 0 ? ` · ${formatLongDuration(season.duration)}` : ''}
                </span>
              </div>
              <div className="tv-season-card-actions">
                <button
                  className="btn-accent"
                  onClick={() => actions.playTracks(season.episodes, seasonState.resumeIndex, { startAt: seasonState.resumePositionSec })}
                >
                  <Icon name="play" size={12} />
                  {seasonState.hasActivity && !seasonState.completed
                    ? (seasonState.resumePositionSec >= 5
                      ? `Resume E${String(seasonState.resumeTrack?.episodeNumber || seasonState.resumeIndex + 1).padStart(2, '0')} (${formatDuration(seasonState.resumePositionSec)})`
                      : `Continue E${String(seasonState.resumeTrack?.episodeNumber || seasonState.resumeIndex + 1).padStart(2, '0')}`)
                    : `Watch ${season.label}`}
                </button>
                {actions.setWatched && (
                  <button
                    className="btn-secondary"
                    onClick={() => actions.setWatched(season.episodes, !allSeasonWatched)}
                    title={allSeasonWatched ? `Mark ${season.label} unwatched` : `Mark all episodes in ${season.label} watched`}
                  >
                    <Icon name="check" size={12} /> {allSeasonWatched ? 'Season Watched ✓' : 'Mark Season Watched'}
                  </button>
                )}
                <button className="btn-secondary" onClick={() => actions.playTracks(season.episodes, 0, { shuffle: true })}>
                  <Icon name="shuffle" size={12} /> Shuffle
                </button>
              </div>
            </div>

            <div className="tv-episode-list">
              {season.episodes.map((ep, idx) => {
                const tv = inferTvShowEpisode(ep);
                const epNum = (tv && tv.episodeNumber) || ep.episodeNumber || ep.trackNumber || (idx + 1);
                const epCode = (tv && tv.episodeCode) || ep.episodeCode || `S${String(season.seasonNumber).padStart(2, '0')}E${String(epNum).padStart(2, '0')}`;
                const epTitle = (tv && tv.episodeTitle) || ep.episodeTitle || ep.title;
                const isCurrent = sameTrack(currentTrack, ep);
                const ws = getTrackWatchState(ep, stats);
                return (
                  <div
                    key={ep.id || ep.filePath || idx}
                    className={`tv-episode-row ${isCurrent ? 'current' : ''} ${ws.completed ? 'ep-completed' : ''} ${ws.inProgress ? 'ep-in-progress' : ''}`}
                    onDoubleClick={() => actions.playTracks(season.episodes, idx)}
                    onContextMenu={(e) => { e.preventDefault(); openMenu(e, trackMenuItems([ep], ctx, { allTracks: season.episodes, index: idx })); }}
                  >
                    <button
                      className="tv-episode-play"
                      title={ws.inProgress ? `Resume ${epCode} at ${formatDuration(ws.positionSec)}` : `Play ${epCode} — ${epTitle}`}
                      onClick={() => actions.playTracks(season.episodes, idx)}
                    >
                      {isCurrent && isPlaying ? <span className="eq-bars"><i></i><i></i><i></i></span> : <Icon name="play" size={13} />}
                    </button>
                    <span className="tv-episode-code">{epCode}</span>
                    <div className="tv-episode-info">
                      <span className="tv-episode-title">
                        Episode {epNum}: {epTitle}
                        {ep.rating && <span className="tv-ep-rating">★ {ep.rating}</span>}
                        {ws.inProgress && (
                          <span className="tv-ep-status-badge resume">
                            ▶ Resume {formatDuration(ws.positionSec)}{ws.progressPct > 0 ? ` (${ws.progressPct}%)` : ''}
                          </span>
                        )}
                        {ws.completed && (
                          <span className="tv-ep-status-badge watched">
                            ✓ Watched
                          </span>
                        )}
                      </span>
                      <span className="tv-episode-sub">
                        {album.title} · {season.label}
                        {ep.airdate ? ` · Aired ${ep.airdate}` : ''}
                        {ep.artist && ep.artist !== album.title ? ` · ${ep.artist}` : ''}
                        {ep.cloud ? ` · ${ep.cloud.cached ? 'Cloud (Cached)' : 'Cloud Stream'}` : ''}
                      </span>
                      {ep.overview && ep.overview !== album.overview && (
                        <span className="tv-episode-overview">{ep.overview}</span>
                      )}
                      {(ws.inProgress || ws.completed) && (
                        <div className="tv-episode-progress-bar">
                          <div
                            className={`tv-episode-progress-fill ${ws.completed ? 'completed' : ''}`}
                            style={{ width: `${ws.completed ? 100 : Math.max(4, ws.progressPct)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="tv-ep-actions-cell">
                      {ws.inProgress && (
                        <button
                          className="btn-chip tv-ep-start-over"
                          title="Start episode over from 0:00"
                          onClick={(e) => { e.stopPropagation(); actions.playTracks(season.episodes, idx, { startAt: 0 }); }}
                        >
                          ↺ Start Over
                        </button>
                      )}
                      {actions.setWatched && (
                        <button
                          className={`btn-icon-only tv-ep-watched-btn ${ws.completed ? 'watched' : ''}`}
                          title={ws.completed ? 'Mark as unwatched' : 'Mark as watched'}
                          onClick={(e) => { e.stopPropagation(); actions.setWatched([ep], !ws.completed); }}
                        >
                          <Icon name="check" size={13} />
                        </button>
                      )}
                      <LoveButton track={ep} size={14} />
                    </div>
                    <span className="tv-episode-duration">{formatDuration(ep.duration)}</span>
                    <button
                      className="tl-more-btn"
                      title="More actions"
                      onClick={(e) => { e.stopPropagation(); openMenu(e, trackMenuItems([ep], ctx, { allTracks: season.episodes, index: idx })); }}
                    >
                      <Icon name="more" size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AlbumDetail({ album, index, go }) {
  const { actions } = useLibrary();
  const artist = index.artistByKey.get(album.artistKey);
  const more = useMemo(() => (artist ? artist.albums.filter(a => a.key !== album.key) : []), [artist, album]);
  const codec = [album.codec, album.lossless ? 'Lossless' : null].filter(Boolean).join(' · ');
  return (
    <>
      <DetailHeader
        album={album}
        cover={<Cover artId={album.artId} name={album.title} />}
        eyebrow={album.isTvShow ? 'TV Show / Series' : (album.franchise || 'Feature Film')}
        title={album.title}
        subtitle={album.artist === VARIOUS_ARTISTS
          ? <span>{album.artist}</span>
          : <a className="link strong" onClick={() => actions.goToArtist(album.artist)}>{album.artist}</a>}
        meta={album.isTvShow
          ? [
              album.year,
              album.genre && <a className="link" onClick={() => actions.goToGenre(album.genre)}>{album.genre}</a>,
              plural(album.seasonCount || 1, 'Season'),
              plural(album.episodeCount || album.tracks.length, 'Episode'),
              formatLongDuration(album.duration),
              codec,
            ]
          : [
              album.year,
              album.genre && <a className="link" onClick={() => actions.goToGenre(album.genre)}>{album.genre}</a>,
              plural(album.tracks.length, 'video file'),
              formatLongDuration(album.duration),
              codec,
            ]}
        tracks={album.tracks}
        menuLabel={album.title}
      />
      {album.isTvShow ? (
        <TvShowSeasonsBreakdown album={album} />
      ) : (
        <TrackList id="album-tracks" tracks={album.tracks} variant="album" albumArtist={album.artist} showDiscs={album.discCount > 1} />
      )}
      {more.length > 0 && (
        <>
          <SectionHeader title={`More in ${album.artist}`} />
          <AlbumGrid albums={more} go={go} showArtist={false} />
        </>
      )}
    </>
  );
}

function ArtistDetail({ artist, go, stats }) {
  const { actions } = useLibrary();
  const allSongs = useMemo(() => sortTracks(artist.tracks, 'year', 'asc'), [artist]);
  const top = useMemo(() => mostPlayedTracks(artist.tracks, stats).slice(0, 5), [artist, stats]);
  return (
    <>
      <DetailHeader
        cover={<Cover artId={artist.artId} name={artist.name} round />}
        eyebrow="Release Format / Quality"
        title={artist.name}
        subtitle={artist.genres.length ? (
          <span className="detail-genres">
            {artist.genres.map(g => <a key={g} className="link" onClick={() => actions.goToGenre(g)}>{g}</a>)}
          </span>
        ) : null}
        meta={[
          artist.albums.length ? plural(artist.albums.length, 'release') : null,
          plural(artist.tracks.length, 'title'),
          formatLongDuration(artist.duration),
        ]}
        tracks={allSongs}
        menuLabel={artist.name}
      />
      {top.length > 0 && (
        <>
          <SectionHeader title="Most Watched" />
          <TrackList tracks={top} variant="compact" />
        </>
      )}
      {artist.albums.length > 0 && (
        <>
          <SectionHeader title="Movies &amp; Shows" subtitle="By release year" />
          <AlbumGrid albums={artist.albums} go={go} showArtist={false} />
        </>
      )}
      {artist.appearsOn.length > 0 && (
        <>
          <SectionHeader title="Also Included In" />
          <AlbumGrid albums={artist.appearsOn} go={go} />
        </>
      )}
      <SectionHeader title="All Titles" subtitle={plural(allSongs.length, 'title')} />
      <TrackList id="artist-tracks" tracks={allSongs} />
    </>
  );
}

function GroupDetail({ group, type, index, go }) {
  const songs = useMemo(() => sortTracks(group.tracks, 'title', 'asc'), [group]);
  const albums = useMemo(() => sortAlbums(group.albums, type === 'decade' || type === 'franchise' ? 'year' : 'title'), [group, type]);
  const years = useMemo(() => (type === 'decade' ? [...new Set(group.tracks.map(t => t.year).filter(Boolean))].sort() : []), [group, type]);
  return (
    <>
      <DetailHeader
        cover={<Collage artIds={group.artIds} name={group.name} />}
        eyebrow={type === 'genre' ? 'Category / Genre' : type === 'franchise' ? 'Franchise & Box Set' : 'Release Decade'}
        title={group.name}
        subtitle={years.length ? <span className="detail-genres">{years.map(y => <span key={y}>{y}</span>)}</span> : null}
        meta={[plural(group.albums.length, 'title'), plural(group.tracks.length, 'video file'), formatLongDuration(group.duration)]}
        tracks={songs}
        menuLabel={group.name}
      />
      <SectionHeader title="Release Formats" />
      <ArtistChips tracks={group.tracks} index={index} go={go} />
      <SectionHeader title="Movies &amp; Shows" subtitle={plural(albums.length, 'title')} />
      <AlbumGrid albums={albums} go={go} />
      <SectionHeader title="All Video Files" subtitle={plural(songs.length, 'title')} />
      <TrackList id={`${type}-tracks`} tracks={songs} />
    </>
  );
}

function ComposerDetail({ composer }) {
  const songs = useMemo(() => sortTracks(composer.tracks, 'album', 'asc'), [composer]);
  return (
    <>
      <DetailHeader
        cover={<Cover name={composer.name} round icon="pen" />}
        eyebrow="Director / Studio"
        title={composer.name}
        meta={[plural(composer.albums.length, 'release'), plural(songs.length, 'title'), formatLongDuration(composer.duration)]}
        tracks={songs}
        menuLabel={composer.name}
      />
      <TrackList id="composer-tracks" tracks={songs} />
    </>
  );
}

// ── Search ──────────────────────────────────────────────────────────────────

function SearchResults({ results, go }) {
  const { actions } = useLibrary();
  const { artists, albums, genres, tracks, totals } = results;
  if (!tracks.length && !artists.length && !albums.length && !genres.length) {
    return <div className="lib-empty"><h3>No matches</h3><p>Try fewer words, or search by movie title, TV show, franchise, genre, or release year.</p></div>;
  }
  return (
    <div className="search-results">
      {albums.length > 0 && (
        <>
          <SectionHeader title="Movies &amp; Shows" subtitle={totals.albums > albums.length ? `Top ${albums.length} of ${totals.albums.toLocaleString()}` : null} />
          <AlbumGrid albums={albums} go={go} />
        </>
      )}
      {genres.length > 0 && (
        <>
          <SectionHeader title="Genres &amp; Categories" />
          <div className="chip-row">
            {genres.map(g => <button key={g.key} className="artist-chip" onClick={() => actions.goToGenre(g.name)}><Icon name="tag" size={13} /> {g.name} <span className="chip-count">{g.tracks.length}</span></button>)}
          </div>
        </>
      )}
      {artists.length > 0 && (
        <>
          <SectionHeader title="Release Formats" subtitle={totals.artists > artists.length ? `Top ${artists.length} of ${totals.artists.toLocaleString()}` : null} />
          <ArtistGrid artists={artists} go={go} />
        </>
      )}
      {tracks.length > 0 && (
        <>
          <SectionHeader title="Matching Titles" subtitle={plural(tracks.length, 'match', 'matches')} tracks={tracks} />
          <TrackList id="search-tracks" tracks={tracks} />
        </>
      )}
    </div>
  );
}
