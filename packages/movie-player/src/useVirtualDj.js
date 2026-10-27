import { useCallback, useEffect, useRef, useState } from 'react';

const LOOKAHEAD = 3;
// DJ voice level in % of the music's loudness (lines are loudness-normalised).
export const DJ_LEVEL_DEFAULT = 150;
const FREQUENCY_EVERY = { every: 1, alternate: 2, sometimes: 3 };
// How long a song change may wait for a line or its audio that is still being made.
const LINE_WAIT_MS = 30000;
const CLIP_WAIT_MS = 15000;

const fileUrl = (filePath) => `file://${filePath.split('/').map(encodeURIComponent).join('/')}`;

// Only what the agent needs to write a line; keeps the IPC payload small.
const slim = (t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, year: t.year, genre: t.genre, duration: t.duration });

// Resolves with the promise's value, or `fallback` after `ms`.
const within = (promise, ms, fallback = null) => new Promise(resolve => {
  const timer = setTimeout(() => resolve(fallback), ms);
  Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
});

const systemVoiceAvailable = () => !!(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'
  && window.speechSynthesis.getVoices().length > 0);

/**
 * Virtual DJ: between songs that end naturally, a short spoken intro for the next
 * song. Lines come from the user's RobOS agent (ahead of time, a few songs out)
 * and are rendered to audio by RobOS voice while the current song plays. If a
 * line or its audio is still being made when the song ends, the music waits for
 * it (the banner shows that, and Skip moves on).
 */
export function useVirtualDj({ initial, upcoming, outputTarget, getVolume, showStatus, getAgent, castClip }) {
  const [settings, setSettings] = useState(() => ({ enabled: false, persona: '', voice: '', frequency: 'every', level: DJ_LEVEL_DEFAULT, ...(initial || {}) }));
  const [speaking, setSpeaking] = useState(null); // { text, warming?, preview? }
  const lines = useRef(new Map());   // trackId -> text
  const clips = useRef(new Map());   // trackId -> { filePath, durationMs } | { failed: true, error }
  const lineRequests = useRef(new Map()); // trackId -> Promise (the batch request writing its line)
  const clipRequests = useRef(new Map()); // trackId -> Promise<clip>
  const generation = useRef(0);      // bumps when the persona changes, so stale answers are dropped
  const transitions = useRef(0);
  const active = useRef(null);       // { audio, timer, finish }
  const latest = useRef({});
  latest.current = { settings, outputTarget, getVolume, showStatus, getAgent, castClip };

  const active_ = settings.enabled && settings.persona.trim().length > 0;

  // A new persona makes earlier lines stale; a new voice, the rendered audio.
  const updateSettings = useCallback((patch) => {
    const prev = latest.current.settings;
    const next = { ...prev, ...patch };
    if (next.persona !== prev.persona) {
      generation.current += 1;
      lines.current.clear(); clips.current.clear(); lineRequests.current.clear(); clipRequests.current.clear();
    } else if (next.voice !== prev.voice || next.level !== prev.level) { clips.current.clear(); clipRequests.current.clear(); }
    latest.current.settings = next;
    setSettings(next);
  }, []);

  // Asks the agent for lines for `tracks` (one call); each track's pending promise is the same.
  const requestLines = useCallback((tracks) => {
    const missing = tracks.filter(t => t && t.id && !lines.current.has(t.id) && !lineRequests.current.has(t.id));
    if (!missing.length || !window.robosAudio?.djLines) return;
    const gen = generation.current;
    const req = window.robosAudio.djLines(latest.current.settings.persona, missing.map(slim), latest.current.getAgent())
      .then(res => {
        if (gen !== generation.current) return;
        for (const [id, text] of Object.entries((res && res.lines) || {})) lines.current.set(id, text);
        if (res && !res.ok && res.error) latest.current.showStatus(`Virtual DJ: ${res.error}`);
      })
      .catch(err => latest.current.showStatus(`Virtual DJ: ${err.message}`))
      .finally(() => missing.forEach(t => { if (lineRequests.current.get(t.id) === req) lineRequests.current.delete(t.id); }));
    missing.forEach(t => lineRequests.current.set(t.id, req));
  }, []);

  // Renders the track's line to audio (once); resolves with the clip.
  const requestClip = useCallback((track) => {
    if (!track || !track.id) return Promise.resolve(null);
    const text = lines.current.get(track.id);
    if (!text) return Promise.resolve(null);
    const done = clips.current.get(track.id);
    // A failed line is tried again after a while (the voice engine may have been starting up).
    if (done && !(done.failed && Date.now() - done.at > 20000)) return Promise.resolve(done);
    if (clipRequests.current.has(track.id)) return clipRequests.current.get(track.id);
    const gen = generation.current;
    const req = window.robosAudio.djSynthesize(text, latest.current.settings.voice, latest.current.settings.level)
      .then(res => (res && res.ok ? { filePath: res.filePath, castPath: res.castPath, durationMs: res.durationMs } : { failed: true, at: Date.now(), error: (res && res.error) || 'no audio' }))
      .catch(err => ({ failed: true, at: Date.now(), error: err.message }))
      .then(clip => {
        if (gen === generation.current) clips.current.set(track.id, clip);
        clipRequests.current.delete(track.id);
        return clip;
      });
    clipRequests.current.set(track.id, req);
    return req;
  }, []);

  // The track's line, waiting (up to `ms`) for one being written, or asking for it now.
  const lineFor = useCallback(async (track, ms) => {
    if (lines.current.has(track.id)) return lines.current.get(track.id);
    if (!lineRequests.current.has(track.id)) requestLines([track]);
    await within(lineRequests.current.get(track.id), ms);
    return lines.current.get(track.id) || null;
  }, [requestLines]);

  // Start the voice engine early: Kokoro takes a while to load its model.
  useEffect(() => {
    if (active_ && window.robosAudio?.djWarmup) window.robosAudio.djWarmup().catch(() => {});
  }, [active_]);

  // Write lines for the next few songs and render the very next one.
  const upcomingKey = upcoming.map(t => t && t.id).join('|');
  useEffect(() => {
    if (!active_) return;
    const next = upcoming.filter(Boolean).slice(0, LOOKAHEAD);
    requestLines(next);
    const first = next[0];
    if (first && first.id) {
      if (lines.current.has(first.id)) requestClip(first);
      else if (lineRequests.current.has(first.id)) lineRequests.current.get(first.id).then(() => requestClip(first));
    }
  }, [active_, upcomingKey, settings.persona, settings.voice, settings.level, requestLines, requestClip]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // While casting, the clip plays on the speaker(s).
  const playLine = useCallback((text, clip, then, { preview = false, clipError = '' } = {}) => {
    const { outputTarget: target, getVolume: volume, settings: s, castClip: sendToSpeaker } = latest.current;
    const entry = { finish: then, audio: null, timer: null };
    active.current = entry;
    setSpeaking({ text, preview });
    const done = () => {
      if (active.current !== entry) return;
      active.current = null;
      if (entry.timer) clearTimeout(entry.timer);
      setSpeaking(null);
      then();
    };

    if (clip && clip.filePath && target !== 'local') {
      // Speakers: cast the line (as MP3), then hand back when the speaker reports it
      // finished, or once it has had time to play after loading.
      entry.cast = true;
      const meta = { title: 'Virtual DJ', artist: s.persona.slice(0, 60), role: 'dj' };
      const failed = (msg) => { latest.current.showStatus(`Virtual DJ: the speaker could not play the line (${msg}).`); done(); };
      entry.timer = setTimeout(done, (clip.durationMs || 4000) + 30000); // never stall the music
      Promise.resolve(sendToSpeaker ? sendToSpeaker(clip.castPath || clip.filePath, meta) : null)
        .then(res => {
          if (active.current !== entry) return;
          if (res && res.ok === false) { failed(res.error || 'unknown error'); return; }
          clearTimeout(entry.timer);
          entry.timer = setTimeout(done, (clip.durationMs || 4000) + 2500);
        })
        .catch(err => failed(err.message));
      return;
    }
    if (target !== 'local') {
      latest.current.showStatus(`Virtual DJ: no recorded voice for the speaker${clipError ? ` (${clipError})` : ''}; speaking on this computer.`);
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
    if (systemVoiceAvailable()) {
      const u = new SpeechSynthesisUtterance(text);
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      entry.timer = setTimeout(done, Math.max(4000, text.split(/\s+/).length * 450));
      return;
    }
    // No voice at all: say so instead of a silent pause.
    latest.current.showStatus(`Virtual DJ could not speak${clipError ? `: ${clipError}` : ' (no voice available)'}. Pick another voice in the DJ settings.`);
    entry.timer = setTimeout(done, preview ? 6000 : 2500); // leave the line on screen for a moment
  }, []);

  // Gets the track's line and audio ready (waiting if needed), then speaks it.
  const speakFor = useCallback((track, then, { preview = false } = {}) => {
    const waiting = { finish: then, audio: null, timer: null };
    active.current = waiting;
    setSpeaking({ text: `Getting the intro for “${track.title || 'the next song'}” ready…`, warming: true, preview });
    (async () => {
      const text = await lineFor(track, LINE_WAIT_MS);
      if (active.current !== waiting) return; // skipped while waiting
      if (!text) {
        latest.current.showStatus(`Virtual DJ had nothing ready for “${track.title || 'this song'}” — playing on.`);
        active.current = null;
        setSpeaking(null);
        then();
        return;
      }
      setSpeaking({ text, warming: true, preview });
      const clip = await within(requestClip(track), CLIP_WAIT_MS);
      if (active.current !== waiting) return;
      playLine(text, clip && !clip.failed ? clip : null, then, { preview, clipError: clip && clip.failed ? clip.error : '' });
    })();
  }, [lineFor, requestClip, playLine]);

  /**
   * Called between songs. Returns true if the DJ talks (and calls `then` after),
   * false to go straight to the next song.
   */
  const talkBefore = useCallback((track, then) => {
    const { settings: s } = latest.current;
    if (!s.enabled || !s.persona.trim() || !track || !track.id) return false;
    transitions.current += 1;
    if (transitions.current % (FREQUENCY_EVERY[s.frequency] || 1) !== 0) return false;
    speakFor(track, then);
    return true;
  }, [speakFor]);

  /**
   * "Announce this song": speak the DJ's intro for `track` now (on the speaker when
   * casting), then call `then`. Returns false when no DJ persona is set up.
   */
  const preview = useCallback((track, then) => {
    const { settings: s } = latest.current;
    if (!s.persona.trim() || !track || !track.id) return false;
    if (active.current) stop();
    speakFor(track, then, { preview: true });
    return true;
  }, [speakFor, stop]);

  /** Speak a one-off line now (the playlist intro), rendering it first. */
  const announce = useCallback(async (text, then) => {
    const { settings: s } = latest.current;
    if (!text) { then(); return; }
    setSpeaking({ text, warming: true });
    let clip = null;
    let clipError = '';
    try {
      const res = await window.robosAudio.djSynthesize(text, s.voice, s.level);
      if (res && res.ok) clip = { filePath: res.filePath, castPath: res.castPath, durationMs: res.durationMs };
      else clipError = (res && res.error) || '';
    } catch (err) { clipError = err.message; }
    playLine(text, clip, then, { clipError });
  }, [playLine]);

  /** Adopt a DJ script written with an AI playlist. */
  const loadScript = useCallback((dj) => {
    if (!dj) return;
    updateSettings({
      enabled: true,
      persona: dj.persona || '',
      voice: dj.voice || latest.current.settings.voice,
      frequency: dj.frequency || 'every',
      level: dj.level || latest.current.settings.level || DJ_LEVEL_DEFAULT,
    });
    for (const [id, text] of Object.entries(dj.lines || {})) lines.current.set(id, text);
    transitions.current = 0;
  }, [updateSettings]);

  /** The speaker says the DJ line it was playing has finished. */
  const castLineFinished = useCallback(() => {
    const a = active.current;
    if (!a || !a.cast) return;
    active.current = null;
    if (a.timer) clearTimeout(a.timer);
    setSpeaking(null);
    a.finish();
  }, []);

  return { settings, setSettings: updateSettings, speaking, talkBefore, preview, announce, loadScript, skip: stop, castLineFinished, active: active_ };
}
