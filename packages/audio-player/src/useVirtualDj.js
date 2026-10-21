import { useCallback, useEffect, useRef, useState } from 'react';

const LOOKAHEAD = 3;
const FREQUENCY_EVERY = { every: 1, alternate: 2, sometimes: 3 };

const fileUrl = (filePath) => `file://${filePath.split('/').map(encodeURIComponent).join('/')}`;

// Only what the agent needs to write a line; keeps the IPC payload small.
const slim = (t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, year: t.year, genre: t.genre, duration: t.duration });

/**
 * Virtual DJ: between songs that end naturally, a short spoken intro for the next
 * song. Lines come from the user's RobOS agent (ahead of time, a few songs out)
 * and are rendered to audio by RobOS voice while the current song plays, so the
 * transition doesn't wait on either.
 */
export function useVirtualDj({ initial, upcoming, outputTarget, getVolume, showStatus }) {
  const [settings, setSettings] = useState(() => ({ enabled: false, persona: '', voice: '', frequency: 'every', ...(initial || {}) }));
  const [speaking, setSpeaking] = useState(null); // { text }
  const lines = useRef(new Map());   // trackId -> text
  const clips = useRef(new Map());   // trackId -> { filePath, durationMs } | { failed: true }
  const pendingLines = useRef(new Set());
  const pendingClips = useRef(new Set());
  const transitions = useRef(0);
  const active = useRef(null);       // { audio, timer, finish }
  const latest = useRef({});
  latest.current = { settings, outputTarget, getVolume, showStatus };

  const active_ = settings.enabled && settings.persona.trim().length > 0;

  // A new persona makes earlier lines stale; a new voice, the rendered audio.
  const updateSettings = useCallback((patch) => {
    const prev = latest.current.settings;
    const next = { ...prev, ...patch };
    if (next.persona !== prev.persona) { lines.current.clear(); clips.current.clear(); }
    else if (next.voice !== prev.voice) clips.current.clear();
    latest.current.settings = next;
    setSettings(next);
  }, []);

  const prepareClip = useCallback((track) => {
    if (!track || !track.id) return;
    const text = lines.current.get(track.id);
    if (!text || clips.current.has(track.id) || pendingClips.current.has(track.id)) return;
    pendingClips.current.add(track.id);
    window.robosAudio.djSynthesize(text, latest.current.settings.voice)
      .then(res => clips.current.set(track.id, res && res.ok ? { filePath: res.filePath, durationMs: res.durationMs } : { failed: true }))
      .catch(() => clips.current.set(track.id, { failed: true }))
      .finally(() => pendingClips.current.delete(track.id));
  }, []);

  // Write lines for the next few songs and render the very next one.
  const upcomingKey = upcoming.map(t => t && t.id).join('|');
  useEffect(() => {
    if (!active_ || !window.robosAudio?.djLines) return;
    const next = upcoming.filter(Boolean).slice(0, LOOKAHEAD);
    const missing = next.filter(t => t.id && !lines.current.has(t.id) && !pendingLines.current.has(t.id));
    if (missing.length) {
      missing.forEach(t => pendingLines.current.add(t.id));
      window.robosAudio.djLines(settings.persona, missing.map(slim))
        .then(res => {
          for (const [id, text] of Object.entries((res && res.lines) || {})) lines.current.set(id, text);
          if (res && !res.ok && res.error) latest.current.showStatus(`Virtual DJ: ${res.error}`);
        })
        .catch(() => {})
        .finally(() => {
          missing.forEach(t => pendingLines.current.delete(t.id));
          prepareClip(next[0]);
        });
    }
    prepareClip(next[0]);
  }, [active_, upcomingKey, settings.persona, settings.voice, prepareClip]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    const a = active.current;
    if (!a) return;
    active.current = null;
    if (a.audio) { a.audio.onended = null; a.audio.onerror = null; a.audio.pause(); }
    if (a.timer) clearTimeout(a.timer);
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeaking(null);
    a.finish();
  }, []);

  // Plays a rendered clip (or the system voice as a fallback), then calls `then`.
  const playLine = useCallback((text, clip, then) => {
    const { outputTarget: target, getVolume: volume, settings: s } = latest.current;
    const finish = () => { if (active.current) { active.current = null; setSpeaking(null); } then(); };
    const entry = { finish: then, audio: null, timer: null };
    active.current = entry;
    setSpeaking({ text });
    const done = () => { if (active.current === entry) finish(); };

    if (clip && clip.filePath && target !== 'local') {
      // Speakers: cast the clip, then move on once it has had time to play.
      const meta = { title: 'Virtual DJ', artist: s.persona.slice(0, 60) };
      Promise.resolve(target === 'all' ? null : window.robosAudio.castFile(target, clip.filePath, meta)).catch(() => {});
      entry.timer = setTimeout(done, (clip.durationMs || 4000) + 600);
      return;
    }
    if (clip && clip.filePath) {
      const audio = new Audio(fileUrl(clip.filePath));
      audio.volume = Math.max(0, Math.min(1, typeof volume === 'function' ? volume() : 1));
      audio.onended = done;
      audio.onerror = done;
      entry.audio = audio;
      audio.play().catch(done);
      entry.timer = setTimeout(done, (clip.durationMs || 15000) + 4000); // never stall the music
      return;
    }
    if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(text);
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      entry.timer = setTimeout(done, Math.max(4000, text.split(/\s+/).length * 450));
      return;
    }
    done();
  }, []);

  /**
   * Called between songs. Returns true if the DJ talks (and calls `then` after),
   * false to go straight to the next song.
   */
  const talkBefore = useCallback((track, then) => {
    const { settings: s } = latest.current;
    if (!s.enabled || !s.persona.trim() || !track || !track.id) return false;
    transitions.current += 1;
    if (transitions.current % (FREQUENCY_EVERY[s.frequency] || 1) !== 0) return false;
    const text = lines.current.get(track.id);
    const clip = clips.current.get(track.id);
    if (!text || pendingClips.current.has(track.id)) return false; // not ready: keep the music going
    playLine(text, clip && !clip.failed ? clip : null, then);
    return true;
  }, [playLine]);

  /** Speak a one-off line now (the playlist intro), rendering it first. */
  const announce = useCallback(async (text, then) => {
    const { settings: s } = latest.current;
    if (!text) { then(); return; }
    setSpeaking({ text, warming: true });
    let clip = null;
    try {
      const res = await window.robosAudio.djSynthesize(text, s.voice);
      if (res && res.ok) clip = { filePath: res.filePath, durationMs: res.durationMs };
    } catch {}
    playLine(text, clip, then);
  }, [playLine]);

  /** Adopt a DJ script written with an AI playlist. */
  const loadScript = useCallback((dj) => {
    if (!dj) return;
    updateSettings({
      enabled: true,
      persona: dj.persona || '',
      voice: dj.voice || latest.current.settings.voice,
      frequency: dj.frequency || 'every',
    });
    for (const [id, text] of Object.entries(dj.lines || {})) lines.current.set(id, text);
    transitions.current = 0;
  }, [updateSettings]);

  return { settings, setSettings: updateSettings, speaking, talkBefore, announce, loadScript, skip: stop, active: active_ };
}
