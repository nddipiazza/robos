import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// Where the song is on the speaker while casting. The speaker reports its position
// about once a second; in between, the time is extrapolated. Kept outside React
// state so only the progress bars re-render as it moves.
let state = { position: 0, duration: 0, playing: false, at: 0 };
const listeners = new Set();

export const castClock = {
  get: () => state,
  set(patch) {
    state = { ...state, ...patch, at: Date.now() };
    if (typeof window !== 'undefined') {
      window.__robosCastPlaying = Boolean(state.playing);
    }
    listeners.forEach(fn => fn());
  },
  now() {
    if (!state.playing) return state.position;
    const t = state.position + (Date.now() - state.at) / 1000;
    return state.duration ? Math.min(state.duration, t) : t;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

function useCastTime() {
  const s = useSyncExternalStore(castClock.subscribe, castClock.get);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!s.playing) return undefined;
    const timer = setInterval(() => tick(n => n + 1), 250);
    return () => clearInterval(timer);
  }, [s.playing]);
  return { current: castClock.now(), duration: s.duration, playing: s.playing };
}

const fmt = (sec) => {
  if (!sec || !isFinite(sec)) return '0:00';
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${ss < 10 ? '0' : ''}${ss}`;
  }
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
};

/** Seek bar that follows the speaker; dragging it seeks the speaker. */
export function CastProgress({ onSeek, className = 'mini-progress', id }) {
  const { current, duration } = useCastTime();
  const [dragging, setDragging] = useState(null);
  const commitTimer = useRef(null);
  const value = dragging != null ? dragging : current;
  const maxVal = duration > 0 ? duration : Math.max(value, 1);
  const pct = maxVal ? (Math.min(value, maxVal) / maxVal) * 100 : 0;
  const commit = (v, immediate = false) => {
    clearTimeout(commitTimer.current);
    if (immediate) {
      castClock.set({ position: v });
      setDragging(null);
      onSeek(v);
      return;
    }
    commitTimer.current = setTimeout(() => {
      castClock.set({ position: v });
      setDragging(null);
      onSeek(v);
    }, 180);
  };
  useEffect(() => () => clearTimeout(commitTimer.current), []);
  return (
    <div className={`cast-progress ${className}`} id={id}>
      <span>{fmt(value)}</span>
      <input
        type="range"
        min="0"
        max={maxVal}
        step="0.5"
        value={Math.min(value, maxVal)}
        style={{ '--pct': `${pct}%` }}
        aria-label="Seek on the Smart TV"
        onChange={(e) => { const v = Number(e.target.value); setDragging(v); commit(v, false); }}
        onMouseUp={() => { if (dragging != null) commit(dragging, true); }}
        onTouchEnd={() => { if (dragging != null) commit(dragging, true); }}
        onKeyUp={() => { if (dragging != null) commit(dragging, true); }}
      />
      <span>{fmt(duration)}</span>
    </div>
  );
}

export function useCastPlaying() {
  return useSyncExternalStore(castClock.subscribe, () => castClock.get().playing);
}
