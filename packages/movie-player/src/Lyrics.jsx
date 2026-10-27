/**
 * Synced Subtitles, Closed Captions & Dialogue Panel for RobOS Movie Player
 *
 * Mirrors the Audio Player's Synced Lyrics panel (`Lyrics.jsx`), adapted for movies:
 *   - Displays synced `.srt`, `.vtt`, `.lrc`, or embedded subtitle streams
 *   - Highlights and auto-scrolls the current dialogue line at `currentTime`
 *   - Clicking any subtitle line seeks the movie directly to that timestamp
 *   - Supports importing an external `.srt`/`.vtt` file and notifies the parent
 *     `<video>` stage of the active subtitle line so live on-screen captions render
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icon } from './Icon';
import { formatTime } from './library-ui';

export function LyricsPanel({ currentTrack, currentTime = 0, onSeek, onActiveCueChange }) {
  const [lyrics, setLyrics] = useState({ found: false, source: 'none', synced: [], plain: '' });
  const [loading, setLoading] = useState(false);
  const [autoFollow, setAutoFollow] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const activeLineRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!currentTrack || !currentTrack.id) {
      setLyrics({ found: false, source: 'none', synced: [], plain: '' });
      if (onActiveCueChange) onActiveCueChange(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.robosAudio.getLyrics(currentTrack.id).then(res => {
      if (!cancelled) {
        setLyrics(res || { found: false, source: 'none', synced: [], plain: '' });
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setLyrics({ found: false, source: 'none', synced: [], plain: '' });
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [currentTrack && currentTrack.id]);

  const activeIdx = useMemo(() => {
    const list = lyrics.synced || [];
    if (list.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < list.length; i++) {
      if (currentTime + 0.12 >= list[i].t) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics.synced, currentTime]);

  useEffect(() => {
    if (!onActiveCueChange) return;
    const list = lyrics.synced || [];
    if (activeIdx >= 0 && list[activeIdx]) {
      const cue = list[activeIdx];
      const end = cue.end != null ? cue.end : (list[activeIdx + 1] ? list[activeIdx + 1].t : cue.t + 5);
      if (currentTime <= end + 0.25) {
        onActiveCueChange(cue);
        return;
      }
    }
    onActiveCueChange(null);
  }, [activeIdx, currentTime, lyrics.synced]);

  useEffect(() => {
    if (!autoFollow || collapsed || activeIdx < 0 || !activeLineRef.current || !containerRef.current) return;
    const el = activeLineRef.current;
    const parent = containerRef.current;
    const targetTop = el.offsetTop - parent.clientHeight / 2 + el.clientHeight / 2;
    parent.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
  }, [activeIdx, autoFollow, collapsed]);

  const handleImportSubtitles = async () => {
    if (!currentTrack || !window.robosMovie || !window.robosMovie.importSubtitles) return;
    const res = await window.robosMovie.importSubtitles(currentTrack.id);
    if (res && res.ok && res.subtitles) {
      setLyrics(res.subtitles);
    }
  };

  return (
    <div className={`lyrics-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="lyrics-header">
        <div className="lyrics-title-row">
          <Icon name="subtitles" size={14} />
          <span>Subtitles &amp; Synced Dialogue</span>
          {lyrics.found && (
            <span className="lyrics-source-badge">
              {lyrics.synced && lyrics.synced.length > 0 ? `Synced (${lyrics.source})` : lyrics.source}
            </span>
          )}
        </div>
        <div className="lyrics-actions">
          {currentTrack && (
            <button
              className="btn btn-xs"
              onClick={handleImportSubtitles}
              title="Load external .srt, .vtt, or .lrc subtitle file"
            >
              Load .SRT/.VTT
            </button>
          )}
          {lyrics.synced && lyrics.synced.length > 0 && !collapsed && (
            <button
              className={`btn btn-xs ${autoFollow ? 'btn-active-pill' : ''}`}
              onClick={() => setAutoFollow(v => !v)}
              title="Auto-scroll subtitles with movie playback"
            >
              Follow
            </button>
          )}
          <button
            className="btn btn-xs"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Show subtitles panel' : 'Hide subtitles panel'}
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="lyrics-body" ref={containerRef}>
          {!currentTrack ? (
            <div className="lyrics-empty">Select a movie or video to view synchronized subtitles &amp; dialogue</div>
          ) : loading ? (
            <div className="lyrics-empty">Loading subtitles for &ldquo;{currentTrack.title}&rdquo;…</div>
          ) : !lyrics.found ? (
            <div className="lyrics-empty">
              No subtitles found for &ldquo;{currentTrack.title}&rdquo;.
              <div className="lyrics-hint">
                Drop a <code>.srt</code> or <code>.vtt</code> file next to the video or click <strong>Load .SRT/.VTT</strong> above.
              </div>
            </div>
          ) : lyrics.synced && lyrics.synced.length > 0 ? (
            <div className="lyrics-synced-list">
              {lyrics.synced.map((line, i) => {
                const isActive = i === activeIdx;
                const isPast = i < activeIdx;
                return (
                  <div
                    key={`${line.t}-${i}`}
                    ref={isActive ? activeLineRef : null}
                    className={`lyrics-line ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}`}
                    onClick={() => onSeek && onSeek(line.t)}
                    title={`Jump to ${formatTime(line.t)}`}
                  >
                    <span style={{ fontSize: 11, opacity: 0.55, marginRight: 8, fontFamily: 'monospace' }}>
                      {formatTime(line.t)}
                    </span>
                    {line.text}
                  </div>
                );
              })}
            </div>
          ) : (
            <pre className="lyrics-plain">{lyrics.plain}</pre>
          )}
        </div>
      )}
    </div>
  );
}
