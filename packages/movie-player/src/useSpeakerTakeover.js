import { useCallback, useEffect, useRef } from 'react';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Answers the control API other RobOS apps call (lib/control-server.js).
 *
 * speak-clip borrows the speaker the music is cast to, like a Virtual DJ break:
 * the clip replaces the song on the speaker, and when it ends the song is cast
 * again from where it was (paused if it was paused). Clips that arrive while
 * one is playing queue behind it, and the song waits `holdMs` after the last
 * one in case another line follows.
 *
 * `getPlayer()` returns the App's latest playback state and actions:
 * { outputTarget, speakers, song, castActive, position, playing, djSpeaking, holdClock, resumeCastAt, pauseMusic, resumeMusic }.
 */
export function useSpeakerTakeover({ getPlayer, showStatus }) {
  const takeover = useRef(null); // { target, song, position, wasPlaying, queue, item, loads, timer, hold }

  const finish = useCallback(() => {
    const t = takeover.current;
    if (!t) return;
    takeover.current = null;
    if (t.timer) clearTimeout(t.timer);
    const p = getPlayer();
    // The user may have picked another song or output meanwhile; then leave it be.
    if (t.song && p.song === t.song && p.outputTarget === t.target) p.resumeCastAt(t.song, t.position, t.wasPlaying);
  }, [getPlayer]);

  const playNext = useCallback(() => {
    const t = takeover.current;
    if (!t) return;
    if (t.timer) clearTimeout(t.timer);
    const item = t.queue.shift();
    t.item = item || null;
    if (!item) {
      t.timer = setTimeout(() => { if (takeover.current === t && !t.queue.length) finish(); }, t.hold);
      return;
    }
    t.hold = item.holdMs;
    t.loads = new Set();
    const meta = { title: item.title, artist: item.artist, role: 'clip' };
    const castOne = (ip) => (item.filePath ? window.robosAudio.castFile(ip, item.filePath, meta) : window.robosAudio.castUrl(ip, item.url, meta))
      .then(res => { if (res && res.loadId != null) t.loads.add(res.loadId); return res; });
    const p = getPlayer();
    const ips = t.target === 'all' ? p.speakers.map(s => s.ip) : [t.target];
    // Never hold the music longer than the clip plus a margin.
    t.timer = setTimeout(() => { if (t.item === item) playNext(); }, (item.durationMs || 4000) + 30000);
    item.started = Promise.all(ips.map(castOne)).then(results => {
      const failed = results.find(r => !r || r.ok === false);
      if (t.item !== item) return failed ? { ok: false, error: (failed && failed.error) || 'cast failed' } : { ok: true };
      if (failed && results.every(r => !r || r.ok === false)) {
        showStatus(`Could not play a clip on the speaker (${(failed && failed.error) || 'unknown error'}).`);
        playNext();
        return { ok: false, error: (failed && failed.error) || 'cast failed' };
      }
      clearTimeout(t.timer);
      t.timer = setTimeout(() => { if (t.item === item) playNext(); }, (item.durationMs || 4000) + 2500);
      return { ok: true };
    }).catch(err => {
      if (t.item === item) playNext();
      return { ok: false, error: err.message };
    });
  }, [getPlayer, finish, showStatus]);

  /** The speaker reports a clip finished (status.role === 'clip'). */
  const clipFinished = useCallback((loadId) => {
    const t = takeover.current;
    if (!t || !t.item || !t.loads || !t.loads.has(loadId)) return; // an earlier clip, or already handled
    t.loads = null;
    playNext();
  }, [playNext]);

  const speakClip = useCallback(async (clip) => {
    let p = getPlayer();
    if (p.outputTarget === 'local') return { ok: true, handled: false, reason: 'not-casting' };
    const onTarget = !clip.speakerIp || clip.speakerIp === p.outputTarget
      || (p.outputTarget === 'all' && p.speakers.some(s => s.ip === clip.speakerIp));
    if (!onTarget) return { ok: true, handled: false, reason: 'other-speaker', output: p.outputTarget };

    let t0 = takeover.current;
    if (t0 && t0.target !== p.outputTarget) {
      // The music moved to another output; that break is over.
      if (t0.timer) clearTimeout(t0.timer);
      takeover.current = t0 = null;
    }
    if (t0) {
      if (t0.item) {
        t0.queue.push(clip);
        return { ok: true, handled: true, queued: true };
      }
      // Between clips (holding the song back): play this one now.
      t0.queue.push(clip);
      playNext();
      return { ok: true, handled: true, ...(await clip.started) };
    }

    // Let a Virtual DJ line finish first; the clip then borrows whatever plays next.
    for (let i = 0; i < 120 && p.djSpeaking; i++) { await sleep(250); p = getPlayer(); }
    if (p.djSpeaking) return { ok: false, handled: true, error: 'The Virtual DJ is still talking' };
    if (takeover.current) return speakClip(clip);

    // The song's place is kept while the clip has the speaker.
    p.holdClock(p.position);
    takeover.current = { target: p.outputTarget, song: p.castActive ? p.song : null, position: p.position, wasPlaying: p.playing, queue: [clip], item: null, loads: null, timer: null, hold: clip.holdMs };
    showStatus(`🔊 ${clip.title}${clip.artist ? ` — ${clip.artist}` : ''} on the speaker`);
    playNext();
    return { ok: true, handled: true, ...(await clip.started) };
  }, [getPlayer, playNext, showStatus]);

  const status = useCallback(() => {
    const p = getPlayer();
    const casting = p.outputTarget !== 'local';
    return {
      ok: true,
      running: true,
      output: p.outputTarget,
      speakerIps: !casting ? [] : p.outputTarget === 'all' ? p.speakers.map(s => s.ip) : [p.outputTarget],
      playing: !!p.playing,
      track: p.song ? { title: p.song.title || '', artist: p.song.artist || '', album: p.song.album || '' } : null,
      position: p.position,
      speakingClip: !!takeover.current,
    };
  }, [getPlayer]);

  // Pause and resume apply to the song even while a clip has the speaker.
  const pause = useCallback(async () => {
    if (takeover.current) { takeover.current.wasPlaying = false; return { ok: true, paused: true }; }
    return getPlayer().pauseMusic();
  }, [getPlayer]);

  const resume = useCallback(async () => {
    if (takeover.current) { takeover.current.wasPlaying = true; return { ok: true, playing: true }; }
    return getPlayer().resumeMusic();
  }, [getPlayer]);

  const handlers = useRef({});
  handlers.current = { status, 'speak-clip': speakClip, pause, resume };
  useEffect(() => {
    if (!window.robosAudio?.onControlRequest) return undefined;
    return window.robosAudio.onControlRequest((action, payload) => {
      const fn = handlers.current[action];
      return fn ? fn(payload || {}) : { ok: false, error: `Unknown action: ${action}` };
    });
  }, []);

  return { clipFinished, active: () => !!takeover.current };
}
