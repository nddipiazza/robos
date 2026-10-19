import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';

// Time-synced lyrics that follow the playing audio element.
export default function Lyrics({ track, getAudio }) {
  const [data, setData] = useState(null); // null = loading
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const lineRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setActive(-1);
    if (!track || !window.robosAudio?.getLyrics) { setData({ found: false }); return; }
    window.robosAudio.getLyrics({ title: track.title, artist: track.artist, album: track.album, duration: track.duration, filePath: track.filePath })
      .then(r => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData({ found: false }); });
    return () => { cancelled = true; };
  }, [track?.id, track?.filePath, track?.title, track?.artist]);

  const synced = data?.synced || [];

  useEffect(() => {
    if (!synced.length) return;
    const tick = () => {
      const audio = getAudio();
      if (!audio) return;
      const t = audio.currentTime + 0.15; // read slightly ahead so the line lands on the beat
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
  }, [data]);

  useEffect(() => {
    const el = lineRefs.current[active];
    const box = boxRef.current;
    if (el && box) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [active]);

  const seek = (t) => {
    const audio = getAudio();
    if (audio) audio.currentTime = t;
  };

  let body;
  if (data === null) body = <div className="lyrics-empty">Looking up lyrics...</div>;
  else if (synced.length) {
    body = synced.map((l, i) => (
      <div key={i} ref={el => { lineRefs.current[i] = el; }}
        className={`lyric-line ${i === active ? 'active' : i < active ? 'past' : ''}`}
        onClick={() => seek(l.t)}>
        {l.text || ' '}
      </div>
    ));
  } else if (data.plain) body = <pre className="lyrics-plain">{data.plain}</pre>;
  else body = <div className="lyrics-empty">{data.error || 'No synced lyrics found for this track.'}</div>;

  return (
    <div className="lyrics-panel">
      <div className="lyrics-head">
        <span><Icon name="mic" size={14} /> Lyrics</span>
        {synced.length > 0 && <span className="lyrics-src">Synced{data.source === 'lrclib' ? ' via LRCLIB' : ' from .lrc file'}</span>}
      </div>
      <div className="lyrics-scroll" ref={boxRef}>{body}</div>
    </div>
  );
}
