import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { useLayoutPref } from './resizable.jsx';

// Time-synced lyrics. `getTime()` is the song position (the local player, or the
// speaker while casting) and `onSeek(t)` jumps there. Both switches stick: lyrics
// on/off, and "Follow" (keep the current line in view). Scrolling the lyrics by
// hand turns Follow off; the Follow button turns it back on.
export default function Lyrics({ track, getTime, onSeek }) {
  const [enabled, setEnabled] = useLayoutPref('lyricsEnabled', true);
  const [follow, setFollow] = useLayoutPref('lyricsFollow', true);
  const [data, setData] = useState(null); // null = loading
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const lineRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setActive(-1);
    if (!enabled) return undefined;
    if (!track || !window.robosAudio?.getLyrics) { setData({ found: false }); return undefined; }
    window.robosAudio.getLyrics({ title: track.title, artist: track.artist, album: track.album, duration: track.duration, filePath: track.filePath })
      .then(r => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData({ found: false }); });
    return () => { cancelled = true; };
  }, [enabled, track?.id, track?.filePath, track?.title, track?.artist]); // eslint-disable-line react-hooks/exhaustive-deps

  const synced = (enabled && data?.synced) || [];

  useEffect(() => {
    if (!synced.length) return undefined;
    const tick = () => {
      const time = getTime();
      if (time == null) return;
      const t = time + 0.15; // read slightly ahead so the line lands on the beat
      let lo = 0, hi = synced.length - 1, idx = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (synced[mid].t <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
      }
      setActive(prev => (prev === idx ? prev : idx));
    };
    const timer = setInterval(tick, 120);
    tick();
    return () => clearInterval(timer);
  }, [data, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToActive = (smooth = true) => {
    const el = lineRefs.current[active];
    const box = boxRef.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => { if (follow) scrollToActive(); }, [active, follow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only the user's own scrolling (wheel, touch, scrollbar drag, keys) stops Follow;
  // the panel's own smooth scrolling also fires "scroll" events, so those don't count.
  const stopFollowing = () => { if (follow && synced.length) setFollow(false); };

  let body;
  if (data === null) body = <div className="lyrics-empty">Looking up subtitles & dialogue...</div>;
  else if (synced.length) {
    body = synced.map((l, i) => (
      <div key={i} ref={el => { lineRefs.current[i] = el; }}
        className={`lyric-line ${i === active ? 'active' : i < active ? 'past' : ''}`}
        onClick={() => onSeek(l.t)}>
        {l.text || ' '}
      </div>
    ));
  } else if (data.plain) body = <pre className="lyrics-plain">{data.plain}</pre>;
  else body = <div className="lyrics-empty">{data.error || 'No synced subtitles (.srt / .vtt) found for this title.'}</div>;

  return (
    <div className={`lyrics-panel ${enabled ? '' : 'off'}`}>
      <div className="lyrics-head">
        <span><Icon name="mic" size={14} /> Subtitles & Dialogue</span>
        <span className="lyrics-tools">
          {enabled && synced.length > 0 && <span className="lyrics-src">Synced{data.source === 'lrclib' ? ' via OpenSubtitles / LRCLIB' : ' from .srt / .vtt file'}</span>}
          {enabled && synced.length > 0 && (
            <button
              id="btn-lyrics-follow"
              className={`btn-chip lyrics-btn ${follow ? 'on' : ''}`}
              aria-pressed={follow}
              title={follow ? 'Following playback: the current subtitle line stays in view' : 'Follow playback: keep the current subtitle line in view'}
              onClick={() => { const next = !follow; setFollow(next); if (next) scrollToActive(); }}
            >
              <Icon name="locate" size={12} /> Follow
            </button>
          )}
          <button
            id="btn-lyrics-toggle"
            className={`btn-chip lyrics-btn ${enabled ? 'on' : ''}`}
            aria-pressed={enabled}
            title={enabled ? 'Turn subtitles off' : 'Turn subtitles on'}
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? 'On' : 'Off'}
          </button>
        </span>
      </div>
      {enabled && (
        <div
          className="lyrics-scroll"
          ref={boxRef}
          tabIndex={0}
          onWheel={stopFollowing}
          onTouchMove={stopFollowing}
          onPointerDown={(e) => { if (e.target === boxRef.current) stopFollowing(); }}
          onKeyDown={(e) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) stopFollowing(); }}
        >
          {body}
        </div>
      )}
    </div>
  );
}
