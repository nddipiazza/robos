import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import FolderPanel from './FolderPanel.jsx';
import TrackList from './TrackList.jsx';
import {
  buildIndex, searchIndex, sortTracks, sortAlbums, sortArtists, indexLetter, fold,
  lovedTracks, recentlyAddedTracks, recentlyPlayedTracks, mostPlayedTracks,
  formatLongDuration, plural, VARIOUS_ARTISTS,
} from '../lib/library-index.js';
import { useLibrary, Cover, Collage, collectionMenuItems } from './library-ui.jsx';
import { ScrollContainerContext, VirtualGrid } from './virtual.jsx';
import { Splitter, useLayoutPref } from './resizable.jsx';

const NAV_WIDTH = 196;

export const LIBRARY_SECTIONS = [
  { id: 'albums', label: 'Albums', icon: 'disc' },
  { id: 'artists', label: 'Artists', icon: 'artist' },
  { id: 'songs', label: 'Songs', icon: 'note' },
  { id: 'genres', label: 'Genres', icon: 'tag' },
  { id: 'decades', label: 'Decades', icon: 'calendar' },
  { id: 'composers', label: 'Composers', icon: 'pen' },
];

export const LIBRARY_COLLECTIONS = [
  { id: 'loved', label: 'Loved', icon: 'heart' },
  { id: 'recent', label: 'Recently Added', icon: 'clock' },
  { id: 'history', label: 'Recently Played', icon: 'history' },
  { id: 'top', label: 'Most Played', icon: 'chart' },
];

const PREFS_KEY = 'robos-audio-player.library-prefs.v1';
const LETTER_SECTION_MIN = 40;
const ALBUM_GRID = { minWidth: 150, textHeight: 46 };
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
  onAiPlaylist,
  onAiFixMetadata,
}) {
  const { stats, actions } = useLibrary();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [query, setQuery] = useState('');
  const contentRef = useRef(null);
  const [navWidth, setNavWidth] = useLayoutPref('libNavWidth', NAV_WIDTH);

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);
  const setPref = (key, value) => setPrefs(p => ({ ...p, [key]: value }));

  // A new destination clears the search box and scrolls to the top.
  useEffect(() => {
    setQuery('');
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [nav]);

  const scopeFolder = folders.find(f => f.id === prefs.scope) || null;
  const scopedTracks = useMemo(
    () => (scopeFolder ? tracks.filter(t => folderOwnsTrack(scopeFolder, t.filePath)) : tracks),
    [tracks, scopeFolder]
  );
  const index = useMemo(() => buildIndex(scopedTracks), [scopedTracks]);

  const go = (view) => onNavigate(view);
  const section = nav.section || 'albums';
  const detail = nav.detail || null;

  const counts = useMemo(() => ({
    albums: index.albums.length,
    artists: index.artists.filter(a => !a.isPlaceholder).length,
    songs: index.tracks.length,
    genres: index.genres.length,
    decades: index.decades.length,
    composers: index.composers.length,
  }), [index]);
  const lovedCount = useMemo(() => index.tracks.filter(t => (stats[t.id] || {}).loved).length, [index, stats]);

  // Typing stays responsive on 100k tracks: results follow the deferred query.
  const searching = query.trim().length > 0;
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => (deferredQuery.trim() ? searchIndex(index, deferredQuery, { artists: 12, albums: 12, genres: 8 }) : null),
    [index, deferredQuery]
  );

  const pageTitle = searching ? `Results for “${query.trim()}”` : titleFor(nav, index);

  let body;
  if (!tracks.length) {
    body = <EmptyLibrary onAddFolder={onAddFolder} onAddFiles={onAddFiles} onCloud={folderProps.onAddCloud} isScanning={isScanning} />;
  } else if (searching) {
    body = results ? <SearchResults results={results} go={go} /> : null;
  } else if (detail) {
    body = <DetailView detail={detail} index={index} go={go} stats={stats} />;
  } else {
    body = (
      <SectionView
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
          onSelect: (id) => { setPref('scope', id); go({ section: 'songs' }); },
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
        defaultWidth={NAV_WIDTH}
      />
      <nav className="lib-nav" aria-label="Library categories">
        <div className="lib-nav-group">
          <span className="lib-nav-heading">Library</span>
          {LIBRARY_SECTIONS.map(s => (
            <NavItem key={s.id} item={s} count={counts[s.id]} active={!detail && !searching && section === s.id} onClick={() => go({ section: s.id })} />
          ))}
        </div>
        <div className="lib-nav-group">
          <span className="lib-nav-heading">Collections</span>
          {LIBRARY_COLLECTIONS.map(s => (
            <NavItem key={s.id} item={s} count={s.id === 'loved' ? lovedCount : null} active={!detail && !searching && section === s.id} onClick={() => go({ section: s.id })} />
          ))}
        </div>
        <div className="lib-nav-group">
          <span className="lib-nav-heading">Sources</span>
          <NavItem item={{ id: 'folders', label: 'Folders', icon: 'folder' }} count={folders.length} active={!detail && !searching && section === 'folders'} onClick={() => go({ section: 'folders' })} />
        </div>
        <div className="lib-nav-footer">
          <span>{plural(index.tracks.length, 'song')}</span>
          <span>{plural(index.albums.length, 'album')} · {formatLongDuration(index.totalDuration)}</span>
          {onAiPlaylist && (
            <button
              id="btn-library-ai-playlist"
              className="btn-accent ai-btn lib-shuffle-all"
              disabled={!index.tracks.length}
              title="Describe a playlist and let your RobOS agent build it from your library"
              onClick={onAiPlaylist}
            >
              ✦ AI Playlist
            </button>
          )}
          {onAiFixMetadata && (
            <button
              id="btn-library-ai-fix-metadata"
              className="btn-secondary lib-shuffle-all"
              disabled={!index.tracks.length}
              title="Repair and enrich track metadata & cover art using your RobOS agent and open-source media tools"
              onClick={() => onAiFixMetadata(scopeFolder ? index.tracks : [])}
            >
              ✦ AI Fix Metadata
            </button>
          )}
          <button
            id="btn-shuffle-library"
            className="btn-secondary lib-shuffle-all"
            disabled={!index.tracks.length}
            onClick={() => actions.playTracks(index.tracks, 0, { shuffle: true })}
          >
            <Icon name="shuffle" size={14} /> Shuffle library
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
              placeholder="Search songs, artists, albums, genres…  (Ctrl+F)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            />
          </div>
          {folders.length > 0 && (
            <select
              id="library-scope"
              className="lib-select"
              title="Limit the library to one folder"
              value={scopeFolder ? scopeFolder.id : ''}
              onChange={(e) => setPref('scope', e.target.value || null)}
            >
              <option value="">All folders</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          )}
          <button id="btn-browse-refresh" className="btn-icon-only" onClick={onRefresh} title="Reload library index">
            <Icon name="history" size={15} />
          </button>
          <button id="btn-browse-add-folder" className="btn-accent" onClick={onAddFolder} title="Add a music folder">
            <Icon name="plus" size={14} /><span>Add folder</span>
          </button>
          <button className="btn-secondary" onClick={onAddFiles} title="Add individual audio files">
            <span>Add files</span>
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

function titleFor(nav, index) {
  if (nav.detail) {
    const { type, key } = nav.detail;
    const map = { album: index.albumByKey, artist: index.artistByKey, genre: index.genreByKey, decade: index.decadeByKey, composer: index.composerByKey }[type];
    const item = map && map.get(key);
    return item ? (item.title || item.name) : 'Library';
  }
  const all = [...LIBRARY_SECTIONS, ...LIBRARY_COLLECTIONS, { id: 'folders', label: 'Folders' }];
  return (all.find(s => s.id === (nav.section || 'albums')) || {}).label || 'Library';
}

function EmptyLibrary({ onAddFolder, onAddFiles, onCloud, isScanning }) {
  return (
    <div className="lib-empty">
      <Icon name="library" size={40} />
      <h3>{isScanning ? 'Indexing your music…' : 'Your library is empty'}</h3>
      <p>Add a music folder from this computer, link a cloud folder, or drag &amp; drop folders and files anywhere in this window.</p>
      <div className="lib-empty-actions">
        <button className="btn-accent" onClick={onAddFolder}><Icon name="folder" size={14} /> Add folder</button>
        <button className="btn-secondary" onClick={onAddFiles}>Add files</button>
        <button className="btn-secondary" onClick={onCloud}><Icon name="cloud" size={14} /> Cloud storage</button>
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
            <button className="btn-accent" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0)}><Icon name="play" size={12} /> Play</button>
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

function AlbumsSection({ index, go, prefs, setPref }) {
  const sortKey = prefs.albumSort || 'title';
  const albums = useMemo(() => sortAlbums(index.albums, sortKey), [index, sortKey]);
  const lettered = (sortKey === 'title' || sortKey === 'artist') && albums.length >= LETTER_SECTION_MIN;
  return (
    <>
      <SectionHeader subtitle={plural(albums.length, 'album')} tracks={index.tracks}>
        <SortSelect id="album-sort" value={sortKey} onChange={(v) => setPref('albumSort', v)} options={[['title', 'Title'], ['artist', 'Artist'], ['year', 'Year (newest)'], ['addedAt', 'Recently added'], ['tracks', 'Most tracks']]} />
      </SectionHeader>
      <AlbumGrid albums={albums} go={go} letterOf={lettered ? (sortKey === 'title' ? albumLetter : albumArtistLetter) : null} />
    </>
  );
}

function ArtistsSection({ index, go, prefs, setPref, stats }) {
  const sortKey = prefs.artistSort || 'name';
  const artists = useMemo(() => sortArtists(index.artists, sortKey, stats), [index, sortKey, statsDep(sortKey, stats)]); // eslint-disable-line react-hooks/exhaustive-deps
  const lettered = sortKey === 'name' && artists.length >= LETTER_SECTION_MIN;
  return (
    <>
      <SectionHeader subtitle={plural(artists.length, 'artist')} tracks={index.tracks}>
        <SortSelect id="artist-sort" value={sortKey} onChange={(v) => setPref('artistSort', v)} options={[['name', 'Name'], ['tracks', 'Most songs'], ['albums', 'Most albums'], ['plays', 'Most played']]} />
      </SectionHeader>
      <ArtistGrid artists={artists} go={go} letterOf={lettered ? artistLetter : null} />
    </>
  );
}

function SongsSection({ index, prefs, setPref, stats }) {
  const sort = prefs.songSort || { key: 'artist', dir: 'asc' };
  const sorted = useMemo(
    () => sortTracks(index.tracks, sort.key, sort.dir, stats),
    [index, sort.key, sort.dir, statsDep(sort.key, stats)] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <>
      <SectionHeader subtitle={`${plural(sorted.length, 'song')} · ${formatLongDuration(index.totalDuration)}`} tracks={sorted} />
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
      <SectionHeader subtitle={plural(genres.length, 'genre')}>
        <SortSelect id="genre-sort" value={sortKey} onChange={(v) => setPref('genreSort', v)} options={[['name', 'Name'], ['tracks', 'Most songs']]} />
      </SectionHeader>
      {genres.length ? <GroupGrid groups={genres} type="genre" go={go} /> : <div className="empty-inline">No genre tags found in your music.</div>}
    </>
  );
}

function DecadesSection({ index, go }) {
  return (
    <>
      <SectionHeader subtitle={plural(index.decades.length, 'decade')} />
      {index.decades.length ? <GroupGrid groups={index.decades} type="decade" go={go} big /> : <div className="empty-inline">No release years found in your music tags.</div>}
    </>
  );
}

function ComposersSection({ index, go }) {
  return (
    <>
      <SectionHeader subtitle={plural(index.composers.length, 'composer')} />
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
              <span className="name-list-meta">{plural(c.tracks.length, 'song')}</span>
            </button>
          )}
        />
      ) : <div className="empty-inline">No composer tags found in your music.</div>}
    </>
  );
}

function LovedSection({ index, stats }) {
  const loved = useMemo(() => lovedTracks(index.tracks, stats), [index, stats]);
  return (
    <>
      <SectionHeader subtitle={`${plural(loved.length, 'loved song')} · newest first`} tracks={loved} />
      <TrackList id="library-loved" tracks={loved} emptyText="Tap the ♥ on any track to keep it here." />
    </>
  );
}

function RecentSection({ index, go }) {
  const recentAlbums = useMemo(() => sortAlbums(index.albums, 'addedAt').slice(0, 12), [index]);
  const recentTracks = useMemo(() => recentlyAddedTracks(index.tracks).slice(0, 500), [index]);
  return (
    <>
      <SectionHeader title="Recently added albums" />
      <AlbumGrid albums={recentAlbums} go={go} />
      <SectionHeader title="Recently added songs" subtitle={recentTracks.length >= 500 ? 'Latest 500' : null} tracks={recentTracks} />
      <TrackList id="library-recent" tracks={recentTracks} extraColumn="added" />
    </>
  );
}

function HistorySection({ index, stats }) {
  const played = useMemo(() => recentlyPlayedTracks(index.tracks, stats).slice(0, 500), [index, stats]);
  return (
    <>
      <SectionHeader subtitle="Songs you listened to for at least 30 seconds" tracks={played} />
      <TrackList id="library-history" tracks={played} extraColumn="lastPlayed" emptyText="Nothing played yet — your listening history will show up here." />
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
          <SectionHeader title="Top artists" />
          <ArtistGrid artists={topArtists} go={go} />
        </>
      )}
      <SectionHeader title="Top songs" subtitle={top.length ? `Top ${top.length}` : null} tracks={top} />
      <TrackList id="library-top" tracks={top} emptyText="Play some music and your favourites will rise to the top." />
    </>
  );
}

function FoldersSection({ folders, folderProps }) {
  return (
    <div className="lib-folders">
      <p className="section-sub">Folders feed the library. Pick one to browse only its music, or use “All folders” in the toolbar.</p>
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
  if (!albums.length) return <div className="empty-inline">No albums.</div>;
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
  const open = () => go({ section: 'albums', detail: { type: 'album', key: album.key } });
  return (
    <div
      className="media-card album-card"
      onClick={open}
      onContextMenu={(e) => { e.preventDefault(); ctx.openMenu(e, [...collectionMenuItems(album.tracks, ctx, { label: album.title }), { separator: true }, { label: 'Go to artist', icon: 'artist', onClick: () => ctx.actions.goToArtist(album.artist) }]); }}
      title={`${album.title} — ${album.artist}`}
    >
      <div className="media-card-art">
        <Cover artId={album.artId} name={album.title} />
        <button className="card-play" title={`Play ${album.title}`} onClick={(e) => { e.stopPropagation(); ctx.actions.playTracks(album.tracks, 0); }}>
          <Icon name="play" size={18} />
        </button>
      </div>
      <span className="media-card-title">{album.title}</span>
      <span className="media-card-sub">
        {showArtist && (album.artist === VARIOUS_ARTISTS
          ? <span>{album.artist}</span>
          : <a className="link" onClick={(e) => { e.stopPropagation(); ctx.actions.goToArtist(album.artist); }}>{album.artist}</a>)}
        {showArtist && album.year ? ' · ' : ''}
        {album.year || (!showArtist ? plural(album.tracks.length, 'song') : '')}
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
        <button className="card-play" title={`Play ${a.name}`} onClick={(e) => { e.stopPropagation(); ctx.actions.playTracks(a.tracks, 0, { shuffle: true }); }}>
          <Icon name="shuffle" size={16} />
        </button>
      </div>
      <span className="media-card-title">{a.name}</span>
      <span className="media-card-sub">
        {a.albums.length ? `${plural(a.albums.length, 'album')} · ` : ''}{plural(a.tracks.length, 'song')}
      </span>
    </div>
  );
}

function GroupGrid({ groups, type, go, big = false }) {
  const ctx = useLibrary();
  const section = type === 'genre' ? 'genres' : 'decades';
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
            <button className="card-play" title={`Shuffle ${g.name}`} onClick={(e) => { e.stopPropagation(); ctx.actions.playTracks(g.tracks, 0, { shuffle: true }); }}>
              <Icon name="shuffle" size={16} />
            </button>
          </div>
          <span className="media-card-sub">{plural(g.tracks.length, 'song')} · {plural(g.artistCount, 'artist')}</span>
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

function DetailHeader({ cover, eyebrow, title, subtitle, meta = [], tracks, menuLabel }) {
  const ctx = useLibrary();
  const { actions } = ctx;
  const allLoved = tracks.length > 0 && tracks.every(t => (ctx.stats[t.id] || {}).loved);
  return (
    <div className="detail-header">
      <div className="detail-cover">{cover}</div>
      <div className="detail-text">
        <span className="detail-eyebrow">{eyebrow}</span>
        <h2 className="detail-title">{title}</h2>
        {subtitle && <div className="detail-subtitle">{subtitle}</div>}
        <div className="detail-meta">{meta.filter(Boolean).map((m, i) => <span key={i}>{m}</span>)}</div>
        <div className="detail-actions">
          <button id="btn-detail-play" className="btn-accent" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0)}><Icon name="play" size={13} /> Play</button>
          <button id="btn-detail-shuffle" className="btn-secondary" disabled={!tracks.length} onClick={() => actions.playTracks(tracks, 0, { shuffle: true })}><Icon name="shuffle" size={14} /> Shuffle</button>
          <button className="btn-secondary" disabled={!tracks.length} onClick={() => actions.queueTracks(tracks, 'next')}><Icon name="playNext" size={14} /> Play next</button>
          <button className="btn-secondary" disabled={!tracks.length} onClick={() => actions.queueTracks(tracks, 'end')}><Icon name="queueAdd" size={14} /> Add to queue</button>
          <button className={`btn-icon-only ${allLoved ? 'loved' : ''}`} title={allLoved ? 'Remove from Loved' : 'Love all'} onClick={() => actions.setLoved(tracks, !allLoved)}>
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
      <button className="btn-secondary" onClick={() => go({ section: 'albums' })}>Browse albums</button>
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
  if (type === 'genre' || type === 'decade') {
    const group = (type === 'genre' ? index.genreByKey : index.decadeByKey).get(key);
    return group ? <GroupDetail group={group} type={type} index={index} go={go} /> : <NotFound go={go} />;
  }
  if (type === 'composer') {
    const composer = index.composerByKey.get(key);
    return composer ? <ComposerDetail composer={composer} /> : <NotFound go={go} />;
  }
  return <NotFound go={go} />;
}

function AlbumDetail({ album, index, go }) {
  const { actions } = useLibrary();
  const artist = index.artistByKey.get(album.artistKey);
  const more = useMemo(() => (artist ? artist.albums.filter(a => a.key !== album.key) : []), [artist, album]);
  const codec = [album.codec, album.lossless ? 'Lossless' : null].filter(Boolean).join(' · ');
  return (
    <>
      <DetailHeader
        cover={<Cover artId={album.artId} name={album.title} />}
        eyebrow={album.isCompilation ? 'Compilation' : 'Album'}
        title={album.title}
        subtitle={album.artist === VARIOUS_ARTISTS
          ? <span>{album.artist}</span>
          : <a className="link strong" onClick={() => actions.goToArtist(album.artist)}>{album.artist}</a>}
        meta={[
          album.year,
          album.genre && <a className="link" onClick={() => actions.goToGenre(album.genre)}>{album.genre}</a>,
          plural(album.tracks.length, 'song'),
          formatLongDuration(album.duration),
          codec,
        ]}
        tracks={album.tracks}
        menuLabel={album.title}
      />
      <TrackList id="album-tracks" tracks={album.tracks} variant="album" albumArtist={album.artist} showDiscs={album.discCount > 1} />
      {more.length > 0 && (
        <>
          <SectionHeader title={`More by ${album.artist}`} />
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
        eyebrow="Artist"
        title={artist.name}
        subtitle={artist.genres.length ? (
          <span className="detail-genres">
            {artist.genres.map(g => <a key={g} className="link" onClick={() => actions.goToGenre(g)}>{g}</a>)}
          </span>
        ) : null}
        meta={[
          artist.albums.length ? plural(artist.albums.length, 'album') : null,
          plural(artist.tracks.length, 'song'),
          formatLongDuration(artist.duration),
        ]}
        tracks={allSongs}
        menuLabel={artist.name}
      />
      {top.length > 0 && (
        <>
          <SectionHeader title="Most played" />
          <TrackList tracks={top} variant="compact" />
        </>
      )}
      {artist.albums.length > 0 && (
        <>
          <SectionHeader title="Albums" subtitle="Oldest first" />
          <AlbumGrid albums={artist.albums} go={go} showArtist={false} />
        </>
      )}
      {artist.appearsOn.length > 0 && (
        <>
          <SectionHeader title="Appears on" />
          <AlbumGrid albums={artist.appearsOn} go={go} />
        </>
      )}
      <SectionHeader title="All songs" subtitle={plural(allSongs.length, 'song')} />
      <TrackList id="artist-tracks" tracks={allSongs} />
    </>
  );
}

function GroupDetail({ group, type, index, go }) {
  const songs = useMemo(() => sortTracks(group.tracks, 'artist', 'asc'), [group]);
  const albums = useMemo(() => sortAlbums(group.albums, type === 'decade' ? 'year' : 'artist'), [group, type]);
  const years = useMemo(() => (type === 'decade' ? [...new Set(group.tracks.map(t => t.year).filter(Boolean))].sort() : []), [group, type]);
  return (
    <>
      <DetailHeader
        cover={<Collage artIds={group.artIds} name={group.name} />}
        eyebrow={type === 'genre' ? 'Genre' : 'Decade'}
        title={group.name}
        subtitle={years.length ? <span className="detail-genres">{years.map(y => <span key={y}>{y}</span>)}</span> : null}
        meta={[plural(group.albums.length, 'album'), plural(group.tracks.length, 'song'), plural(group.artistCount, 'artist'), formatLongDuration(group.duration)]}
        tracks={songs}
        menuLabel={group.name}
      />
      <SectionHeader title="Artists" />
      <ArtistChips tracks={group.tracks} index={index} go={go} />
      <SectionHeader title="Albums" subtitle={plural(albums.length, 'album')} />
      <AlbumGrid albums={albums} go={go} />
      <SectionHeader title="Songs" subtitle={plural(songs.length, 'song')} />
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
        eyebrow="Composer"
        title={composer.name}
        meta={[plural(composer.albums.length, 'album'), plural(songs.length, 'song'), formatLongDuration(composer.duration)]}
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
    return <div className="lib-empty"><h3>No matches</h3><p>Try fewer words, or search by artist, album, genre, composer or year.</p></div>;
  }
  return (
    <div className="search-results">
      {artists.length > 0 && (
        <>
          <SectionHeader title="Artists" subtitle={totals.artists > artists.length ? `Top ${artists.length} of ${totals.artists.toLocaleString()}` : null} />
          <ArtistGrid artists={artists} go={go} />
        </>
      )}
      {albums.length > 0 && (
        <>
          <SectionHeader title="Albums" subtitle={totals.albums > albums.length ? `Top ${albums.length} of ${totals.albums.toLocaleString()}` : null} />
          <AlbumGrid albums={albums} go={go} />
        </>
      )}
      {genres.length > 0 && (
        <>
          <SectionHeader title="Genres" />
          <div className="chip-row">
            {genres.map(g => <button key={g.key} className="artist-chip" onClick={() => actions.goToGenre(g.name)}><Icon name="tag" size={13} /> {g.name} <span className="chip-count">{g.tracks.length}</span></button>)}
          </div>
        </>
      )}
      {tracks.length > 0 && (
        <>
          <SectionHeader title="Songs" subtitle={plural(tracks.length, 'match', 'matches')} tracks={tracks} />
          <TrackList id="search-tracks" tracks={tracks} />
        </>
      )}
    </div>
  );
}
