import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';

// Everything a library row, card or queue entry needs to act on tracks. Provided
// by App so deeply nested views don't need a dozen pass-through props.
export const LibraryContext = createContext({
  artBase: null,
  stats: {},
  currentTrack: null,
  isPlaying: false,
  actions: {},
  openMenu: () => {},
});

export const useLibrary = () => useContext(LibraryContext);

export const sameTrack = (a, b) => !!(a && b && (
  (a.id && b.id && a.id === b.id) || (a.filePath && b.filePath && a.filePath === b.filePath)
));

export function artUrlFor(artBase, artId) {
  return artBase && artId ? `${artBase}${artId}.jpg` : null;
}

function hashHue(text) {
  let h = 0;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function placeholderBackground(name) {
  const hue = hashHue(name);
  return `linear-gradient(135deg, hsl(${hue}, 32%, 30%), hsl(${(hue + 40) % 360}, 38%, 16%))`;
}

function initials(name) {
  const words = String(name || '?').replace(/^(the|a|an)\s+/i, '').split(/\s+/).filter(Boolean);
  return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

/**
 * Album / artist artwork with a generated gradient + initials fallback.
 */
export function Cover({ artId, name, round = false, size, className = '', icon = null }) {
  const { artBase } = useLibrary();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [artId, artBase]);
  const url = !failed ? artUrlFor(artBase, artId) : null;
  const style = size ? { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) } : {};
  if (!url) style.background = placeholderBackground(name);
  return (
    <div className={`cover ${round ? 'round' : ''} ${className}`} style={style}>
      {url
        ? <img src={url} alt="" loading="lazy" draggable={false} onError={() => setFailed(true)} />
        : (icon ? <Icon name={icon} size={size ? Math.max(14, Math.round(size / 3)) : 32} /> : <span className="cover-initials">{initials(name)}</span>)}
    </div>
  );
}

/**
 * 2×2 artwork collage for genres and decades.
 */
export function Collage({ artIds = [], name }) {
  if (artIds.length < 4) return <Cover artId={artIds[0]} name={name} icon={artIds[0] ? null : 'tag'} />;
  return (
    <div className="cover collage">
      {artIds.slice(0, 4).map(id => <Cover key={id} artId={id} name={name} />)}
    </div>
  );
}

/**
 * Fixed-position right-click menu. `menu` is { x, y, items } or null.
 * Items: { label, icon, onClick, disabled, danger } | { separator: true } | { header }.
 */
export function ContextMenu({ menu, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) { setPos(null); return; }
    const rect = ref.current.getBoundingClientRect();
    const x = Math.min(menu.x, window.innerWidth - rect.width - 8);
    const y = menu.y + rect.height > window.innerHeight - 8 ? Math.max(8, menu.y - rect.height) : menu.y;
    setPos({ x: Math.max(8, x), y });
  }, [menu]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!ref.current || !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    document.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      document.removeEventListener('scroll', onClose, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos ? pos.x : menu.x, top: pos ? pos.y : menu.y, visibility: pos ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.filter(Boolean).map((item, i) => {
        if (item.separator) return <div key={i} className="context-sep" />;
        if (item.header) return <div key={i} className="context-header">{item.header}</div>;
        return (
          <button
            key={i}
            role="menuitem"
            className={`context-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => { onClose(); item.onClick && item.onClick(); }}
          >
            <span className="context-icon">{item.icon && <Icon name={item.icon} size={14} />}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Menu builders shared by library rows, album cards and the queue panel ────

export function collectionMenuItems(tracks, ctx, { label } = {}) {
  const { actions, stats } = ctx;
  const allLoved = tracks.length > 0 && tracks.every(t => (stats[t.id] || {}).loved);
  return [
    label ? { header: label } : null,
    { label: 'Play', icon: 'play', onClick: () => actions.playTracks(tracks, 0) },
    { label: 'Shuffle', icon: 'shuffle', onClick: () => actions.playTracks(tracks, 0, { shuffle: true }) },
    { label: 'Play next', icon: 'playNext', onClick: () => actions.queueTracks(tracks, 'next') },
    { label: 'Add to queue', icon: 'queueAdd', onClick: () => actions.queueTracks(tracks, 'end') },
    { separator: true },
    { label: 'Add to playlist…', icon: 'list', onClick: () => actions.addToPlaylist(tracks) },
    actions.fixMetadata ? { label: '✦ AI Fix Metadata…', icon: 'sparkle', onClick: () => actions.fixMetadata(tracks) } : null,
    { label: allLoved ? 'Remove from Loved' : 'Love', icon: allLoved ? 'heartFill' : 'heart', onClick: () => actions.setLoved(tracks, !allLoved) },
    actions.hasSpeakers ? { label: 'Cast to Smart TV', icon: 'cast', onClick: () => actions.castTracks(tracks) } : null,
  ];
}

export function trackMenuItems(tracks, ctx, { allTracks = null, index = 0, extra = [] } = {}) {
  const { actions, stats } = ctx;
  const single = tracks.length === 1 ? tracks[0] : null;
  const allLoved = tracks.every(t => (stats[t.id] || {}).loved);
  const items = [
    tracks.length > 1 ? { header: `${tracks.length} tracks selected` } : null,
    {
      label: 'Play',
      icon: 'play',
      // A single row plays "from here" through the surrounding list, like a music app.
      onClick: () => (single && allTracks ? actions.playTracks(allTracks, index) : actions.playTracks(tracks, 0)),
    },
    { label: 'Play next', icon: 'playNext', onClick: () => actions.queueTracks(tracks, 'next') },
    { label: 'Add to queue', icon: 'queueAdd', onClick: () => actions.queueTracks(tracks, 'end') },
    ...extra,
    { separator: true },
    { label: 'Add to playlist…', icon: 'list', onClick: () => actions.addToPlaylist(tracks) },
    actions.fixMetadata ? { label: '✦ AI Fix Metadata…', icon: 'sparkle', onClick: () => actions.fixMetadata(tracks) } : null,
    { label: allLoved ? 'Remove from Loved' : 'Love', icon: allLoved ? 'heartFill' : 'heart', onClick: () => actions.setLoved(tracks, !allLoved) },
    actions.hasSpeakers ? { label: 'Cast to Smart TV', icon: 'cast', onClick: () => actions.castTracks(tracks) } : null,
  ];
  if (single) {
    items.push({ separator: true });
    items.push({ label: 'Go to album', icon: 'disc', onClick: () => actions.goToAlbumOf(single) });
    items.push({ label: 'Go to artist', icon: 'artist', onClick: () => actions.goToArtist(single.artist) });
    items.push({ label: 'Track info', icon: 'info', onClick: () => actions.showInfo(single) });
    if (single.filePath && !single.cloud) {
      items.push({ label: 'Show in file manager', icon: 'external', onClick: () => actions.showInFolder(single) });
    }
  }
  return items;
}

export function LoveButton({ track, size = 14 }) {
  const { stats, actions } = useLibrary();
  const loved = !!(track && (stats[track.id] || {}).loved);
  if (!track) return null;
  return (
    <button
      className={`love-btn ${loved ? 'loved' : ''}`}
      title={loved ? 'Remove from Loved' : 'Love this track'}
      aria-pressed={loved}
      onClick={(e) => { e.stopPropagation(); actions.setLoved([track], !loved); }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Icon name={loved ? 'heartFill' : 'heart'} size={size} />
    </button>
  );
}

// Views re-sort on every render; return the previous array when the contents are
// identical so selection and scroll position survive unrelated re-renders.
export function useStableArray(items) {
  const ref = useRef(items);
  const prev = ref.current;
  if (prev !== items && (prev.length !== items.length || items.some((v, i) => v !== prev[i]))) {
    ref.current = items;
  }
  return ref.current;
}

export const TRACK_DRAG_TYPE = 'application/x-robos-tracks';
