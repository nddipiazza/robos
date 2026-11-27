'use strict';

(() => {
  const videoEl = document.getElementById('vw-video');
  const liveImgEl = document.getElementById('vw-live-img');
  const slateEl = document.getElementById('vw-empty-slate');
  const slateTitleEl = document.getElementById('vw-slate-title');
  const slateSubEl = document.getElementById('vw-slate-sub');
  const tcEl = document.getElementById('vw-timecode');
  const modePillEl = document.getElementById('vw-mode-pill');
  const trackSelEl = document.getElementById('vw-track-select');
  const aotBtn = document.getElementById('vw-btn-aot');

  const karaokeBgEl = document.getElementById('vw-karaoke-bg');
  const karaokeOverlayEl = document.getElementById('vw-karaoke-overlay');
  const karaokeSongEl = document.getElementById('vw-karaoke-song');
  const karaokeDotsEl = document.getElementById('vw-karaoke-dots');
  const karaokeCurrentEl = document.getElementById('vw-karaoke-current');
  const karaokeNextEl = document.getElementById('vw-karaoke-next');
  const karaokePitchEl = document.getElementById('vw-karaoke-pitch');

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  let state = {
    isPlaying: false,
    isRecording: false,
    playheadSec: 0,
    syncWallMs: Date.now(),
    selectedVideoTrackId: '',
    videoTracks: [],
    activeClip: null,
    activeLyricsClip: null,
    hasLyricsTrack: false,
    livePreviewUrl: '',
    liveSnapshotDataUrl: '',
    alwaysOnTop: false,
  };

  let loadedVideoSrc = '';
  let isSeekingVideo = false;
  let pendingSeekSec = null;
  let renderedLineSig = '';

  videoEl.addEventListener('seeking', () => { isSeekingVideo = true; });
  videoEl.addEventListener('seeked', () => {
    isSeekingVideo = false;
    if (pendingSeekSec !== null) {
      const next = pendingSeekSec;
      pendingSeekSec = null;
      safeSeekVideo(next);
    }
  });

  function escHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function midiToNoteName(midi) {
    const m = Math.max(0, Math.min(127, Math.round(Number(midi) || 60)));
    return `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
  }

  function formatTimecode(sec) {
    const safe = Math.max(0, Number(sec) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.floor((safe - Math.floor(safe)) * 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  function toFileUrl(filePath) {
    if (!filePath) return '';
    if (/^(file|https?|blob|data):/i.test(filePath)) return filePath;
    return `file://${encodeURI(filePath).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
  }

  function safeSeekVideo(targetSec) {
    const clamped = Math.max(0, Number(targetSec) || 0);
    if (isSeekingVideo) {
      pendingSeekSec = clamped;
      return;
    }
    try {
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        videoEl.currentTime = Math.min(Math.max(0, videoEl.duration - 0.01), clamped);
      } else {
        videoEl.currentTime = clamped;
      }
    } catch {}
  }

  function getInterpolatedPlayheadSec() {
    if (!state.isPlaying) return Number(state.playheadSec) || 0;
    const dt = Math.max(0, (Date.now() - (Number(state.syncWallMs) || Date.now())) / 1000);
    return (Number(state.playheadSec) || 0) + dt;
  }

  function renderTrackDropdown() {
    const list = Array.isArray(state.videoTracks) ? state.videoTracks : [];
    const html = list.length
      ? list.map(t => `<option value="${escHtml(t.id)}" ${t.id === state.selectedVideoTrackId ? 'selected' : ''}>${escHtml(t.name)}</option>`).join('')
      : '<option value="">No Video / Lyrics Tracks</option>';
    if (trackSelEl.innerHTML !== html) {
      trackSelEl.innerHTML = html;
    }
    if (state.selectedVideoTrackId && trackSelEl.value !== state.selectedVideoTrackId) {
      trackSelEl.value = state.selectedVideoTrackId;
    }
    aotBtn.classList.toggle('active', Boolean(state.alwaysOnTop));
  }

  function renderKaraokeFrame(curSec, hasOtherVideoVisual) {
    const lyrClip = state.activeLyricsClip;
    if (!lyrClip || !Array.isArray(lyrClip.lines) || !lyrClip.lines.length) {
      karaokeBgEl?.classList.add('hidden');
      karaokeOverlayEl?.classList.add('hidden');
      renderedLineSig = '';
      return false;
    }

    if (hasOtherVideoVisual) {
      karaokeBgEl?.classList.add('hidden');
      karaokeOverlayEl?.classList.remove('hidden', 'stage-mode');
      karaokeOverlayEl?.classList.add('over-video');
    } else {
      karaokeBgEl?.classList.remove('hidden');
      karaokeBgEl?.classList.toggle('playing', Boolean(state.isPlaying));
      karaokeOverlayEl?.classList.remove('hidden', 'over-video');
      karaokeOverlayEl?.classList.add('stage-mode');
    }

    const shift = Number(lyrClip.timelineShiftSec) || 0;
    const lines = lyrClip.lines;
    let activeIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      const lStart = (Number(lines[i].startSec) || 0) + shift;
      const lEnd = (Number(lines[i].endSec) || (lStart + 2)) + shift;
      const nextStart = i + 1 < lines.length ? ((Number(lines[i + 1].startSec) || 0) + shift) : Infinity;
      const holdUntil = Math.min(lEnd + 0.65, nextStart - 0.05);
      if (curSec >= lStart - 2.2 && curSec <= Math.max(lEnd, holdUntil)) {
        activeIdx = i;
        if (curSec >= lStart - 0.15) break;
      }
    }
    if (activeIdx === -1) {
      activeIdx = lines.findIndex(l => ((Number(l.startSec) || 0) + shift) > curSec);
      if (activeIdx === -1) activeIdx = lines.length - 1;
    }

    const curLine = lines[activeIdx] || null;
    const nextLine = lines[activeIdx + 1] || null;
    if (karaokeSongEl) {
      const headerTxt = lyrClip.artist ? `${lyrClip.title} — ${lyrClip.artist}` : (lyrClip.title || lyrClip.trackName || 'Karaoke Track');
      if (karaokeSongEl.textContent !== headerTxt) karaokeSongEl.textContent = headerTxt;
    }

    if (!curLine) {
      if (karaokeCurrentEl) karaokeCurrentEl.innerHTML = '';
      if (karaokeNextEl) karaokeNextEl.textContent = '';
      karaokeDotsEl?.classList.add('hidden');
      karaokePitchEl?.classList.add('hidden');
      return !hasOtherVideoVisual;
    }

    const lineStart = (Number(curLine.startSec) || 0) + shift;
    const preSec = lineStart - curSec;

    // 4-dot pre-phrase karaoke lead-in countdown (2.0s -> 0.0s before line starts)
    if (karaokeDotsEl) {
      if (preSec > 0.05 && preSec <= 2.2) {
        karaokeDotsEl.classList.remove('hidden');
        const litCount = Math.min(4, Math.max(1, Math.ceil(((2.2 - preSec) / 2.2) * 4)));
        const dots = karaokeDotsEl.querySelectorAll('.rk-dot');
        dots.forEach((d, idx) => d.classList.toggle('lit', idx < litCount));
      } else {
        karaokeDotsEl.classList.add('hidden');
      }
    }

    const words = Array.isArray(curLine.words) && curLine.words.length
      ? curLine.words
      : [{ text: curLine.text || '', startSec: curLine.startSec, endSec: curLine.endSec, midiNote: 60 }];

    const sig = `${lyrClip.id}:${activeIdx}:${words.length}`;
    if (renderedLineSig !== sig && karaokeCurrentEl) {
      renderedLineSig = sig;
      karaokeCurrentEl.innerHTML = words
        .map((w, wi) => `<span class="rk-word" data-wi="${wi}">${escHtml(w.text)}</span>`)
        .join(' ');
    }

    let activeMidi = null;
    if (karaokeCurrentEl) {
      const spans = karaokeCurrentEl.querySelectorAll('.rk-word');
      for (let wi = 0; wi < words.length; wi++) {
        const w = words[wi];
        const ws = (Number(w.startSec) || 0) + shift;
        const we = Math.max(ws + 0.05, (Number(w.endSec) || (ws + 0.25)) + shift);
        const sp = spans[wi];
        if (!sp) continue;
        if (curSec >= we) {
          sp.classList.add('sung');
          sp.classList.remove('active');
          sp.style.setProperty('--kw-fill', '100%');
        } else if (curSec >= ws) {
          const pct = Math.max(0, Math.min(100, ((curSec - ws) / (we - ws)) * 100));
          sp.classList.remove('sung');
          sp.classList.add('active');
          sp.style.setProperty('--kw-fill', `${pct.toFixed(1)}%`);
          activeMidi = w.midiNote || 60;
        } else {
          sp.classList.remove('sung', 'active');
          sp.style.setProperty('--kw-fill', '0%');
        }
      }
    }

    if (karaokeNextEl) {
      const nextTxt = nextLine?.text || '';
      if (karaokeNextEl.textContent !== nextTxt) karaokeNextEl.textContent = nextTxt;
    }

    if (karaokePitchEl) {
      if (activeMidi !== null) {
        karaokePitchEl.classList.remove('hidden');
        karaokePitchEl.textContent = `${midiToNoteName(activeMidi)} · MIDI ${activeMidi}`;
      } else {
        karaokePitchEl.classList.add('hidden');
      }
    }

    return !hasOtherVideoVisual;
  }

  function applySync(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    state = { ...state, ...incoming };
    renderTrackDropdown();

    const nowPlayhead = getInterpolatedPlayheadSec();
    tcEl.textContent = formatTimecode(nowPlayhead);

    const clip = state.activeClip;
    if (clip && clip.videoFile) {
      const srcUrl = toFileUrl(clip.videoFile);
      if (loadedVideoSrc !== srcUrl) {
        loadedVideoSrc = srcUrl;
        videoEl.src = srcUrl;
        videoEl.load();
      }
      liveImgEl.classList.add('hidden');
      if (liveImgEl.src) liveImgEl.removeAttribute('src');
      slateEl.classList.add('hidden');
      videoEl.classList.remove('hidden');

      const intoClip = Math.max(0, nowPlayhead - (Number(clip.startSec) || 0));
      const targetSec = (Number(clip.offsetSec) || 0) + intoClip;

      if (state.isPlaying) {
        modePillEl.textContent = state.activeLyricsClip ? 'VIDEO + KARAOKE' : 'PLAYING';
        modePillEl.className = 'vw-mode-pill playing';
        if (Math.abs((videoEl.currentTime || 0) - targetSec) > 0.09) {
          safeSeekVideo(targetSec);
        }
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      } else {
        modePillEl.textContent = state.activeLyricsClip ? 'SCRUB · KARAOKE' : 'SCRUB';
        modePillEl.className = 'vw-mode-pill';
        if (!videoEl.paused) videoEl.pause();
        if (Math.abs((videoEl.currentTime || 0) - targetSec) > 0.02) {
          safeSeekVideo(targetSec);
        }
      }
      renderKaraokeFrame(nowPlayhead, true);
      return;
    }

    if (!videoEl.paused) videoEl.pause();
    videoEl.classList.add('hidden');

    const liveSrc = state.livePreviewUrl || state.liveSnapshotDataUrl || '';
    if (liveSrc) {
      slateEl.classList.add('hidden');
      liveImgEl.classList.remove('hidden');
      if (liveImgEl.getAttribute('src') !== liveSrc) {
        liveImgEl.setAttribute('src', liveSrc);
      }
      modePillEl.textContent = state.isRecording ? 'RECORDING CAM' : 'LIVE CAM';
      modePillEl.className = 'vw-mode-pill live';
      renderKaraokeFrame(nowPlayhead, true);
      return;
    }

    liveImgEl.classList.add('hidden');
    if (liveImgEl.src) liveImgEl.removeAttribute('src');

    // No other video playing: if a Lyrics Track is active, show the RobOS Branded Dark Karaoke Stage!
    const showingKaraokeStage = renderKaraokeFrame(nowPlayhead, false);
    if (showingKaraokeStage) {
      slateEl.classList.add('hidden');
      modePillEl.textContent = state.isPlaying ? 'KARAOKE LIVE' : 'KARAOKE STAGE';
      modePillEl.className = 'vw-mode-pill karaoke';
      return;
    }

    slateEl.classList.remove('hidden');
    modePillEl.textContent = state.videoTracks?.length ? 'STANDBY' : 'NO TRACK';
    modePillEl.className = 'vw-mode-pill';
    slateTitleEl.textContent = state.videoTracks?.length
      ? 'No Video or Lyrics Region at Current Playhead'
      : 'No Video or Lyrics Tracks in Session';
    slateSubEl.textContent = state.videoTracks?.length
      ? 'Move playhead over a video/lyrics clip or toggle Live Cam in DAW Studio.'
      : 'Click "+ Add Video" or right-click a music track -> "Create Lyrics Track".';
  }

  function rafLoop() {
    if (state.isPlaying) {
      const cur = getInterpolatedPlayheadSec();
      tcEl.textContent = formatTimecode(cur);
      const hasVideo = Boolean(state.activeClip && state.activeClip.videoFile && !videoEl.classList.contains('hidden'));
      const hasLive = !liveImgEl.classList.contains('hidden');
      if (hasVideo) {
        const into = cur - (Number(state.activeClip.startSec) || 0);
        const clipDur = Number(state.activeClip.durationSec) || 0;
        if (into >= 0 && (clipDur <= 0 || into <= clipDur + 0.05)) {
          const target = (Number(state.activeClip.offsetSec) || 0) + into;
          if (Math.abs((videoEl.currentTime || 0) - target) > 0.11) {
            safeSeekVideo(target);
          }
        }
      }
      if (state.activeLyricsClip) {
        renderKaraokeFrame(cur, hasVideo || hasLive);
      }
    }
    requestAnimationFrame(rafLoop);
  }

  trackSelEl.addEventListener('change', (e) => {
    const trackId = e.target.value;
    if (trackId) window.robosVideoOut?.selectVideoTrack(trackId);
  });

  aotBtn.addEventListener('click', async () => {
    const res = await window.robosVideoOut?.toggleAlwaysOnTop();
    if (res && typeof res.alwaysOnTop === 'boolean') {
      state.alwaysOnTop = res.alwaysOnTop;
      aotBtn.classList.toggle('active', state.alwaysOnTop);
    }
  });

  document.getElementById('vw-btn-fullscreen')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  document.getElementById('vw-btn-dock')?.addEventListener('click', () => {
    window.robosVideoOut?.dockBackToDaw();
  });

  window.robosVideoOut?.onSyncState((payload) => applySync(payload));
  window.robosVideoOut?.onLiveFrame?.((frame) => {
    if (!frame?.dataUrl) return;
    // Only apply live frames belonging to the selected video track (or when no track filter is set)
    if (state.selectedVideoTrackId && frame.trackId && frame.trackId !== state.selectedVideoTrackId) {
      return;
    }
    // If an offline recorded clip is actively playing in `<video>`, keep playing that clip;
    // otherwise (during Recording OR Live Cam monitoring) push the live MJPEG frame immediately!
    if (state.activeClip && state.activeClip.videoFile && !state.isRecording) {
      return;
    }
    state.liveSnapshotDataUrl = frame.dataUrl;
    if (!videoEl.paused) videoEl.pause();
    videoEl.classList.add('hidden');
    slateEl.classList.add('hidden');
    liveImgEl.classList.remove('hidden');
    liveImgEl.setAttribute('src', frame.dataUrl);
    modePillEl.textContent = state.isRecording ? 'RECORDING CAM' : 'LIVE CAM';
    modePillEl.className = 'vw-mode-pill live';
  });
  window.robosVideoOut?.requestInitialState().then((initPayload) => {
    if (initPayload) applySync(initPayload);
  }).catch(() => {});

  requestAnimationFrame(rafLoop);
})();
