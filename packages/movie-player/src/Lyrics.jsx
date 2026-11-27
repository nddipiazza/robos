import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { Splitter, useLayoutPref } from './resizable.jsx';

const DEFAULT_HEIGHT = 240;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 720;
const NO_LINES = [];

// Time-synced lyrics. `getTime()` is the song position (the local player, or the
// speaker while casting) and `onSeek(t)` jumps there. Both switches stick: lyrics
// on/off, and "Follow" (center the current line). Scrolling the lyrics by
// hand turns Follow off; the Follow button turns it back on.
export default function Lyrics({ track, getTime, onSeek }) {
  const [enabled, setEnabled] = useLayoutPref('lyricsEnabled', true);
  const [follow, setFollow] = useLayoutPref('lyricsFollow', true);
  const [height, setHeight] = useLayoutPref('lyricsHeight', DEFAULT_HEIGHT);
  const [data, setData] = useState(null); // null = loading
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const followedLineRef = useRef(null);
  const timeRef = useRef(getTime);
  useLayoutEffect(() => { timeRef.current = getTime; }, [getTime]);

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
  }, [enabled, track?.id, track?.filePath, track?.title, track?.artist, track?.album, track?.duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const synced = (enabled && data?.synced) || NO_LINES;

  useEffect(() => {
    if (!synced.length) return undefined;
    const tick = () => {
      const time = timeRef.current();
      if (!Number.isFinite(time)) return;
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
  }, [synced]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const line = followedLineRef.current;
    if (!follow || !box || !line) return undefined;
    const centerLine = () => {
      if (!box.clientHeight) return;
      const lineBounds = line.getBoundingClientRect();
      const viewportTop = box.getBoundingClientRect().top + box.clientTop;
      box.scrollTop += lineBounds.top + lineBounds.height / 2 - viewportTop - box.clientHeight / 2;
    };
    centerLine();
    const observer = new ResizeObserver(centerLine);
    observer.observe(box);
    observer.observe(line);
    return () => observer.disconnect();
  }, [active, follow, synced]);

  // Only the user's own scrolling (wheel, touch, scrollbar drag, keys) stops Follow;
  // programmatic centering must keep Follow enabled.
  const stopFollowing = () => { if (follow && synced.length) setFollow(false); };

  let body;
  if (data === null) body = <div className="lyrics-empty">Looking up subtitles & dialogue...</div>;
  else if (synced.length) {
    body = (
      <div className="lyrics-timed">
        {synced.map((line, index) => (
          <div
            key={index}
            ref={index === Math.max(active, 0) ? followedLineRef : null}
            className={`lyric-line ${index === active ? 'active' : index < active ? 'past' : ''}`}
            aria-current={index === active ? 'true' : undefined}
            onClick={() => onSeek(line.t)}
          >
            {line.text || ' '}
          </div>
        ))}
      </div>
    );
  } else if (data.plain) body = <pre className="lyrics-plain">{data.plain}</pre>;
  else body = <div className="lyrics-empty">{data.error || 'No synced subtitles (.srt / .vtt) found for this title.'}</div>;

  return (
    <div className={`lyrics-panel ${enabled ? '' : 'off'}`} style={{ '--lyrics-height': `${height}px` }}>
      <div className="lyrics-head">
        <span><Icon name="mic" size={14} /> Subtitles & Dialogue</span>
        <span className="lyrics-tools">
          {enabled && synced.length > 0 && <span className="lyrics-src">{
            data.source === 'lrclib' ? 'Synced via OpenSubtitles / LRCLIB' : 'Synced from .srt / .vtt file'
          }</span>}
          {enabled && !synced.length && data?.plain && <span className="lyrics-src">Plain transcript</span>}
          {enabled && synced.length > 0 && (
            <button
              id="btn-lyrics-follow"
              className={`btn-chip lyrics-btn ${follow ? 'on' : ''}`}
              aria-pressed={follow}
              title="Center the current subtitle during playback"
              onClick={() => setFollow(value => !value)}
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
        <>
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
          <Splitter
            id="lyrics-height-splitter"
            className="height-grip"
            label="Subtitles and dialogue height"
            orientation="horizontal"
            size={height}
            onChange={setHeight}
            min={MIN_HEIGHT}
            max={MAX_HEIGHT}
            defaultSize={DEFAULT_HEIGHT}
          />
        </>
      )}
    </div>
  );
}
