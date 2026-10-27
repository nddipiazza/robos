/**
 * Virtual Cinema Host Hook for RobOS Movie Player
 *
 * Pre-generates short spoken cinema host introductions a few movies ahead in the queue
 * and speaks them between movies via RobOS Voice (`window.robosAudio.synthesizeDjSpeech`)
 * or Web Speech API fallback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export function useVirtualDj({
  enabled = false,
  djStyle = 'warm classic cinema host',
  playlistName = 'Screening Queue',
  queue = [],
  currentIndex = -1,
  activeCastDevice = null,
  onAdvanceToIndex
} = {}) {
  const [djSpeaking, setDjSpeaking] = useState(false);
  const [djStatus, setDjStatus] = useState('');
  const [currentIntroText, setCurrentIntroText] = useState('');
  const introsCacheRef = useRef({});
  const audioRef = useRef(null);

  // Pre-fetch intros for the upcoming slice of movies
  useEffect(() => {
    if (!enabled || queue.length === 0) return;
    const start = Math.max(0, currentIndex);
    const slice = queue.slice(start, start + 5).filter(t => t && t.id && !introsCacheRef.current[t.id]);
    if (slice.length === 0) return;

    let cancelled = false;
    window.robosAudio.generateDjIntros({
      tracks: slice,
      playlistName,
      djStyle
    }).then(res => {
      if (cancelled || !res || !res.intros) return;
      introsCacheRef.current = { ...introsCacheRef.current, ...res.intros };
      const cur = queue[currentIndex];
      if (cur && introsCacheRef.current[cur.id]) {
        setCurrentIntroText(introsCacheRef.current[cur.id]);
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [enabled, djStyle, playlistName, currentIndex, queue.length]);

  const TransitionWithDj = useCallback(async (nextIndex) => {
    const nextTrack = queue[nextIndex];
    if (!enabled || !nextTrack) {
      if (onAdvanceToIndex) onAdvanceToIndex(nextIndex);
      return;
    }

    let line = introsCacheRef.current[nextTrack.id];
    if (!line) {
      const yearBit = nextTrack.year ? ` (${nextTrack.year})` : '';
      line = `Up next in our screening: ${nextTrack.title}${yearBit}, directed by ${nextTrack.artist || 'Unknown Director'}.`;
    }

    setDjSpeaking(true);
    setCurrentIntroText(line);
    setDjStatus(`Cinema Host introducing "${nextTrack.title}": “${line}”`);

    const finish = () => {
      setDjSpeaking(false);
      setDjStatus('');
      if (onAdvanceToIndex) onAdvanceToIndex(nextIndex);
    };

    try {
      const res = await window.robosAudio.synthesizeDjSpeech({ text: line });
      if (res && res.ok && res.fileUrl) {
        if (activeCastDevice && res.filePath) {
          await window.robosAudio.castTrack(activeCastDevice, {
            id: `dj-intro-${Date.now()}`,
            title: `Cinema Host Intro: ${nextTrack.title}`,
            artist: 'RobOS Virtual Cinema Host',
            path: res.filePath
          }, 0);
          setTimeout(finish, 4500);
          return;
        }
        const a = new Audio(res.fileUrl);
        audioRef.current = a;
        a.onended = finish;
        a.onerror = finish;
        await a.play();
        return;
      }
    } catch (_) {}

    if (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      try {
        const u = new SpeechSynthesisUtterance(line);
        u.onend = finish;
        u.onerror = finish;
        window.speechSynthesis.speak(u);
        setTimeout(finish, 6000);
        return;
      } catch (_) {}
    }

    setTimeout(finish, 1800);
  }, [enabled, queue, activeCastDevice, onAdvanceToIndex]);

  return {
    djSpeaking,
    djStatus,
    currentIntroText,
    TransitionWithDj
  };
}
