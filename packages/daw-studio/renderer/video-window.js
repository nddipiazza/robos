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

  let state = {
    isPlaying: false,
    isRecording: false,
    playheadSec: 0,
    syncWallMs: Date.now(),
    selectedVideoTrackId: '',
    videoTracks: [],
    activeClip: null,
    livePreviewUrl: '',
    liveSnapshotDataUrl: '',
    alwaysOnTop: false,
  };

  let loadedVideoSrc = '';
  let isSeekingVideo = false;
  let pendingSeekSec = null;

  videoEl.addEventListener('seeking', () => { isSeekingVideo = true; });
  videoEl.addEventListener('seeked', () => {
    isSeekingVideo = false;
    if (pendingSeekSec !== null) {
      const next = pendingSeekSec;
      pendingSeekSec = null;
      safeSeekVideo(next);
    }
  });

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
      ? list.map(t => `<option value="${t.id}" ${t.id === state.selectedVideoTrackId ? 'selected' : ''}>${t.name}</option>`).join('')
      : '<option value="">No Video Tracks</option>';
    if (trackSelEl.innerHTML !== html) {
      trackSelEl.innerHTML = html;
    }
    if (state.selectedVideoTrackId && trackSelEl.value !== state.selectedVideoTrackId) {
      trackSelEl.value = state.selectedVideoTrackId;
    }
    aotBtn.classList.toggle('active', Boolean(state.alwaysOnTop));
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
        modePillEl.textContent = 'PLAYING';
        modePillEl.className = 'vw-mode-pill playing';
        if (Math.abs((videoEl.currentTime || 0) - targetSec) > 0.09) {
          safeSeekVideo(targetSec);
        }
        if (videoEl.paused) {
          videoEl.play().catch(() => {});
        }
      } else {
        modePillEl.textContent = 'SCRUB';
        modePillEl.className = 'vw-mode-pill';
        if (!videoEl.paused) videoEl.pause();
        if (Math.abs((videoEl.currentTime || 0) - targetSec) > 0.02) {
          safeSeekVideo(targetSec);
        }
      }
      return;
    }

    // No active clip at playhead — show Live Camera stream/snapshot if available!
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
      return;
    }

    liveImgEl.classList.add('hidden');
    if (liveImgEl.src) liveImgEl.removeAttribute('src');
    slateEl.classList.remove('hidden');
    modePillEl.textContent = state.videoTracks?.length ? 'STANDBY' : 'NO TRACK';
    modePillEl.className = 'vw-mode-pill';
    slateTitleEl.textContent = state.videoTracks?.length
      ? 'No Video Region at Current Playhead'
      : 'No Video Tracks in Session';
    slateSubEl.textContent = state.videoTracks?.length
      ? 'Move playhead over a video clip or toggle Live Cam in DAW Studio.'
      : 'Click "+ Add Video" in RobOS DAW Studio to add a RobOS Android IP Cam, ONVIF cam, or USB webcam.';
  }

  function rafLoop() {
    if (state.isPlaying) {
      const cur = getInterpolatedPlayheadSec();
      tcEl.textContent = formatTimecode(cur);
      if (state.activeClip && state.activeClip.videoFile && !videoEl.classList.contains('hidden')) {
        const into = cur - (Number(state.activeClip.startSec) || 0);
        const clipDur = Number(state.activeClip.durationSec) || 0;
        if (into >= 0 && (clipDur <= 0 || into <= clipDur + 0.05)) {
          const target = (Number(state.activeClip.offsetSec) || 0) + into;
          if (Math.abs((videoEl.currentTime || 0) - target) > 0.11) {
            safeSeekVideo(target);
          }
        }
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
  window.robosVideoOut?.requestInitialState().then((initPayload) => {
    if (initPayload) applySync(initPayload);
  }).catch(() => {});

  requestAnimationFrame(rafLoop);
})();
