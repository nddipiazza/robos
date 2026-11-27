'use strict';

window.robosRecordToLibrary = (() => {
  let activeDialog;
  const CHUNK_BYTES = 2 * 1024 * 1024;
  const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;


  async function cropDisplay(display, region) {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = new MediaStream(display.getVideoTracks());
    let timeout;
    try {
      await Promise.race([
        video.play(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('The selected display did not start sending video.')), 6000);
        }),
      ]);
      const width = Math.max(2, Math.floor(video.videoWidth * region.width / 2) * 2);
      const height = Math.max(2, Math.floor(video.videoHeight * region.height / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('The selected region could not be recorded.');
      const [track] = canvas.captureStream(0).getVideoTracks();
      const draw = () => {
        const { videoWidth, videoHeight } = video;
        if (!videoWidth || !videoHeight) return;
        context.drawImage(video,
          region.x * videoWidth, region.y * videoHeight, region.width * videoWidth, region.height * videoHeight,
          0, 0, width, height);
        track.requestFrame();
      };
      const timer = setInterval(draw, 1000 / 30);
      return {
        stream: new MediaStream([track, ...display.getAudioTracks()]),
        stop() {
          clearInterval(timer);
          track.stop();
          video.pause();
          video.srcObject = null;
        },
      };
    } catch (err) {
      video.srcObject = null;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  function createRegionPicker(form, player, onChange) {
    const panel = form.querySelector('.record-to-library-region');
    const preview = panel.querySelector('.record-to-library-preview');
    const image = preview.querySelector('img');
    const outline = preview.querySelector('.record-to-library-outline');
    const caption = panel.querySelector('[role="status"]');
    const refresh = panel.querySelector('button');
    let sourceId;
    let selection;
    let drag;
    let loading = false;

    function paint(area) {
      outline.hidden = !area?.width || !area?.height;
      if (outline.hidden) return;
      outline.style.left = `${area.x * 100}%`;
      outline.style.top = `${area.y * 100}%`;
      outline.style.width = `${area.width * 100}%`;
      outline.style.height = `${area.height * 100}%`;
    }

    function select(area) {
      selection = area;
      paint(selection);
      caption.textContent = selection ? 'Region selected. Drag again to redraw it.' : 'Drag over the preview to select an area.';
      onChange();
    }

    async function load() {
      if (loading) return;
      loading = true;
      refresh.disabled = true;
      preview.hidden = true;
      sourceId = null;
      selection = null;
      drag = null;
      paint(null);
      caption.textContent = 'Loading screen preview…';
      onChange();
      try {
        const result = await player.getDesktopRecordingPreview();
        if (!result.ok) throw new Error(result.error);
        image.src = result.image;
        await image.decode();
        sourceId = result.sourceId;
        preview.hidden = false;
        select(null);
      } catch (err) {
        caption.textContent = err.message;
      } finally {
        loading = false;
        refresh.disabled = false;
      }
    }

    function point(event) {
      const bounds = preview.getBoundingClientRect();
      const clamp = value => Math.max(0, Math.min(1, value));
      return {
        x: clamp((event.clientX - bounds.left) / bounds.width),
        y: clamp((event.clientY - bounds.top) / bounds.height),
      };
    }

    function selectionAt(event) {
      const end = point(event);
      return {
        x: Math.min(drag.start.x, end.x), y: Math.min(drag.start.y, end.y),
        width: Math.abs(drag.start.x - end.x), height: Math.abs(drag.start.y - end.y),
      };
    }

    preview.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      preview.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, start: point(event) };
      paint(null);
    });
    preview.addEventListener('pointermove', (event) => {
      if (drag?.id === event.pointerId) paint(selectionAt(event));
    });
    preview.addEventListener('pointerup', (event) => {
      if (drag?.id !== event.pointerId) return;
      const area = selectionAt(event);
      drag = null;
      if (area.width * preview.clientWidth >= 6 && area.height * preview.clientHeight >= 6) select(area);
      else paint(selection);
    });
    preview.addEventListener('lostpointercapture', () => {
      drag = null;
      paint(selection);
    });
    preview.addEventListener('keydown', (event) => {
      const step = 0.02;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (!Object.hasOwn(delta, event.key)) return;
      event.preventDefault();
      const [dx, dy] = delta[event.key];
      const area = selection ? { ...selection } : { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
      if (event.shiftKey) {
        area.width = Math.min(1 - area.x, Math.max(step, area.width + dx));
        area.height = Math.min(1 - area.y, Math.max(step, area.height + dy));
      } else {
        area.x = Math.max(0, Math.min(1 - area.width, area.x + dx));
        area.y = Math.max(0, Math.min(1 - area.height, area.y + dy));
      }
      select(area);
    });
    refresh.addEventListener('click', load);
    return {
      panel, load,
      get sourceId() { return sourceId; },
      get selection() { return selection; },
    };
  }

  function open({ kind, player, onSaved }) {
    if (activeDialog) return;
    const video = kind === 'video';
    const systemAudio = player.canCaptureSystemAudio;
    const hasRegionPicker = video && typeof player.getDesktopRecordingPreview === 'function';
    const dialog = document.createElement('dialog');
    dialog.className = 'record-to-library-dialog';
    dialog.setAttribute('aria-labelledby', 'record-to-library-title');
    const videoLabel = `
      <label class="recording-label-field">Type
        <select name="videoKind">
          <option value="movie">Movie</option>
          <option value="tv">TV show</option>
        </select>
      </label>
      <label class="recording-label-field"><span data-recording-title-label>Movie title</span>
        <input type="text" name="recordingTitle" maxlength="200" spellcheck="false">
      </label>
      <label class="recording-label-field" data-movie-label>Release year
        <input type="number" name="releaseYear" min="1870" max="2200" inputmode="numeric">
      </label>
      <div class="recording-label-tv" data-tv-label hidden>
        <label class="recording-label-field">Season
          <input type="number" name="season" disabled min="0" max="99" inputmode="numeric">
        </label>
        <label class="recording-label-field">Episode
          <input type="number" name="episode" disabled min="1" max="999" inputmode="numeric">
        </label>
      </div>
      <label class="recording-label-field recording-label-wide" data-tv-label hidden>Episode title
        <input type="text" name="episodeTitle" disabled maxlength="200" spellcheck="false">
      </label>`;
    const audioLabel = `
      <label class="recording-label-field recording-label-wide">Song title
        <input type="text" name="recordingTitle" maxlength="200" spellcheck="false">
      </label>
      <label class="recording-label-field">Artist
        <input type="text" name="recordingArtist" maxlength="200" spellcheck="false">
      </label>
      <label class="recording-label-field">Album
        <input type="text" name="recordingAlbum" maxlength="200" spellcheck="false">
      </label>`;
    dialog.innerHTML = `
      <form>
        <h2 id="record-to-library-title">Record to Library</h2>
        <div class="record-to-library-modes" role="group" aria-label="Recording source">
          <button type="button" class="btn-secondary" data-mode="live">${video ? 'Desktop' : 'PC audio'}</button>
          <button type="button" class="btn-secondary" data-mode="link">Media link</button>
        </div>
        <div class="record-to-library-source" data-panel="live">
          <p>${video ? 'Records the display this window is on.' : 'Records sound from your current audio output.'}</p>
          <label class="record-to-library-area" hidden>
            Capture area
            <select name="captureArea">
              <option value="screen" selected>Full screen</option>
              <option value="region">Region</option>
            </select>
          </label>
          <div class="record-to-library-region" hidden>
            <div class="record-to-library-region-tools">
              <p role="status"></p>
              <button type="button" class="btn-secondary">Refresh preview</button>
            </div>
            <div class="record-to-library-preview" tabindex="0" role="group" aria-label="Select a region"
              aria-description="Drag a rectangle, or use the arrow keys to move it and Shift plus arrow keys to resize it." hidden>
              <img alt="Screen preview" draggable="false">
              <span class="record-to-library-outline" aria-hidden="true" hidden></span>
            </div>
          </div>
          <label class="record-to-library-audio" ${video && systemAudio ? '' : 'hidden'}>
            <input name="desktopAudio" type="checkbox" checked> Include system audio
          </label>
          <p ${video && !systemAudio ? '' : 'hidden'}>System audio capture is available on Windows.</p>
        </div>
        <div class="record-to-library-source" data-panel="link">
          <label for="record-media-link">Media link</label>
          <div class="record-to-library-link">
            <input id="record-media-link" name="url" type="url" placeholder="https://…" required>
            <button class="btn-secondary record-to-library-paste" type="button">Paste</button>
          </div>
          <label class="record-to-library-audio" ${video ? '' : 'hidden'}>
            <input name="includeAudio" type="checkbox" checked> Include audio
          </label>
        </div>
        <fieldset class="recording-label">
          <legend>Label recording (optional)</legend>
          <div class="recording-label-grid">${video ? videoLabel : audioLabel}</div>
        </fieldset>
        <div class="record-to-library-live" hidden>
          <span class="record-to-library-dot" aria-hidden="true"></span> Recording
          <time aria-hidden="true">0:00</time>
        </div>
        <progress aria-label="Recording progress" max="100" hidden></progress>
        <p class="record-to-library-status" role="status"></p>
        <button class="btn-secondary record-to-library-setup" type="button" hidden>Installation instructions</button>
        <footer>
          <button class="btn-secondary record-to-library-cancel" type="button">Close</button>
          <button class="btn-accent" type="submit"></button>
        </footer>
      </form>`;
    const form = dialog.querySelector('form');
    const { url, includeAudio, desktopAudio, captureArea } = form.elements;
    const submit = form.querySelector('[type="submit"]');
    const cancel = form.querySelector('.record-to-library-cancel');
    const setup = form.querySelector('.record-to-library-setup');
    const paste = form.querySelector('.record-to-library-paste');
    const progress = form.querySelector('progress');
    const status = form.querySelector('.record-to-library-status');
    const indicator = form.querySelector('.record-to-library-live');
    const elapsed = indicator.querySelector('time');
    const modes = [...form.querySelectorAll('[data-mode]')];
    const livePanel = form.querySelector('[data-panel="live"]');
    const linkPanel = form.querySelector('[data-panel="link"]');
    const labelFields = form.querySelector('.recording-label');
    let mode = video || systemAudio ? 'live' : 'link';
    let phase = 'idle';
    let missingTool;
    let recording;
    const regionPicker = hasRegionPicker ? createRegionPicker(form, player, updateControls) : null;
    captureArea.parentElement.hidden = !regionPicker;

    const { recordingTitle, videoKind, releaseYear, season, episode, episodeTitle, recordingArtist, recordingAlbum } = form.elements;
    if (video) {
      videoKind.addEventListener('change', () => {
        const tv = videoKind.value === 'tv';
        labelFields.querySelector('[data-recording-title-label]').textContent = tv ? 'Show name' : 'Movie title';
        labelFields.querySelector('[data-movie-label]').hidden = tv;
        for (const field of labelFields.querySelectorAll('[data-tv-label]')) field.hidden = !tv;
        recordingTitle.required = tv;
        releaseYear.disabled = tv;
        season.disabled = episode.disabled = episodeTitle.disabled = !tv;
      });
    }

    function recordingLabel() {
      const title = recordingTitle.value;
      if (!video) return { title, artist: recordingArtist.value, album: recordingAlbum.value };
      if (videoKind.value === 'tv') return { type: 'tv', title, season: season.value, episode: episode.value, episodeTitle: episodeTitle.value };
      return { type: 'movie', title, year: releaseYear.value };
    }

    function updateControls() {
      const idle = phase === 'idle';
      const capturing = phase === 'recording';
      const working = phase === 'link' || phase === 'stopping' || phase === 'starting';
      const selectingRegion = regionPicker && idle && mode === 'live' && captureArea.value === 'region';
      if (regionPicker) {
        regionPicker.panel.hidden = !selectingRegion;
        captureArea.disabled = !idle;
        dialog.classList.toggle('record-to-library-with-region', selectingRegion);
      }
      livePanel.hidden = mode !== 'live';
      linkPanel.hidden = mode !== 'link';
      for (const button of modes) {
        button.disabled = !idle || (button.dataset.mode === 'live' && !video && !systemAudio);
        button.setAttribute('aria-pressed', String(mode === button.dataset.mode));
      }
      if (!video && !systemAudio) modes[0].title = 'PC audio capture is available on Windows.';
      url.disabled = !idle || mode !== 'link';
      includeAudio.disabled = desktopAudio.disabled = paste.disabled = !idle;
      submit.disabled = (!idle && !capturing) || (selectingRegion && !regionPicker.selection);
      submit.textContent = capturing ? 'Stop & save' : (mode === 'live' ? 'Start recording' : `Save ${video ? 'video' : 'audio'}`);
      cancel.disabled = phase === 'starting' || phase === 'stopping';
      cancel.textContent = capturing ? 'Discard' : (phase === 'link' ? 'Cancel recording' : 'Close');
      indicator.hidden = !capturing;
      labelFields.hidden = labelFields.disabled = !idle;
      progress.hidden = !working;
      progress.removeAttribute('value');
    }

    function setPhase(value) {
      phase = value;
      updateControls();
    }

    function showResult(result) {
      setPhase('idle');
      if (result?.ok) {
        dialog.close();
        onSaved(result.track);
        return;
      }
      status.textContent = result?.canceled ? 'Recording canceled.' : result?.error || 'The recording could not be saved.';
      missingTool = result?.tool;
      setup.hidden = !missingTool;
      (mode === 'link' ? url : submit).focus();
    }

    async function recordLink() {
      setPhase('link');
      status.textContent = 'Finding media…';
      try { showResult(await player.startRecording({ url: url.value, includeAudio: includeAudio.checked, label: recordingLabel() })); }
      catch (err) { showResult({ error: err.message }); }
    }

    async function finishLive(save, failure) {
      if (phase !== 'recording') return;
      setPhase('stopping');
      status.textContent = save ? 'Preparing recording…' : 'Discarding recording…';
      const current = recording;
      clearInterval(current.timer);
      if (current.recorder.state !== 'inactive') current.recorder.stop();
      current.crop?.stop();
      for (const track of current.display.getTracks()) track.stop();
      try {
        await current.stopped;
        await current.writes.catch((err) => { if (save) throw err; });
        if (current.failure) throw current.failure;
        if (save) showResult(await player.finishDesktopRecording());
        else {
          await player.discardDesktopRecording();
          showResult(failure ? { error: failure.message } : { canceled: true });
        }
      } catch (err) {
        await player.discardDesktopRecording().catch(() => {});
        showResult({ error: err.message });
      } finally {
        recording = null;
      }
    }

    async function recordLive() {
      const withAudio = !video || (systemAudio && desktopAudio.checked);
      const region = captureArea.value === 'region' ? regionPicker.selection : null;
      const sourceId = region ? regionPicker.sourceId : undefined;
      setPhase('starting');
      status.textContent = 'Starting capture…';
      let display;
      let crop;
      try {
        const ready = await player.startDesktopRecording({ includeAudio: withAudio, sourceId, label: recordingLabel() });
        if (!ready.ok) { showResult(ready); return; }
        display = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor', frameRate: { ideal: 30, max: 30 } },
          audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        });
        if (withAudio && !display.getAudioTracks().length) throw new Error('System audio is unavailable. Check your current audio output and try again.');
        if (region) crop = await cropDisplay(display, region);
        const stream = crop?.stream || (video ? display : new MediaStream(display.getAudioTracks()));
        const mimeType = video ? (withAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8') : 'audio/webm;codecs=opus';
        const media = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 });
        const current = {
          display, crop, recorder: media, writes: Promise.resolve(), bufferedBytes: 0,
          stopped: new Promise(resolve => media.addEventListener('stop', resolve, { once: true })),
        };
        media.addEventListener('dataavailable', ({ data }) => {
          if (!data.size || current.failure) return;
          current.bufferedBytes += data.size;
          if (current.bufferedBytes > MAX_BUFFERED_BYTES) {
            current.failure = new Error('The recording could not be written to disk fast enough.');
            finishLive(false, current.failure);
            return;
          }
          current.writes = current.writes.then(async () => {
            for (let offset = 0; offset < data.size; offset += CHUNK_BYTES) {
              const chunk = await data.slice(offset, offset + CHUNK_BYTES).arrayBuffer();
              await player.appendDesktopRecording(new Uint8Array(chunk));
            }
          }).finally(() => { current.bufferedBytes -= data.size; });
          current.writes.catch(error => finishLive(false, error));
        });
        media.addEventListener('error', (event) => {
          current.failure = event.error || new Error('The capture stopped unexpectedly.');
          finishLive(false, current.failure);
        });
        for (const track of display.getTracks()) {
          track.addEventListener('ended', () => finishLive(true), { once: true });
        }
        media.start(500);
        recording = current;
        const started = Date.now();
        elapsed.textContent = '0:00';
        current.timer = setInterval(() => {
          const total = Math.floor((Date.now() - started) / 1000);
          elapsed.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
        }, 1000);
        status.textContent = '';
        setPhase('recording');
        submit.focus();
      } catch (err) {
        crop?.stop();
        display?.getTracks().forEach(track => track.stop());
        await player.discardDesktopRecording().catch(() => {});
        const denied = region
          ? 'Could not capture the selected display. Refresh the preview and try again.'
          : 'Screen capture was denied. Check your screen recording permissions and try again.';
        showResult({ error: err.name === 'NotAllowedError' ? denied : err.message });
      }
    }

    async function requestCancel() {
      if (phase === 'idle') dialog.close();
      else if (phase === 'recording') finishLive(false);
      else if (phase === 'link' && !cancel.disabled) {
        cancel.disabled = true;
        try {
          if (await player.cancelRecording()) status.textContent = 'Canceling recording…';
        } catch (err) {
          status.textContent = err.message;
          cancel.disabled = false;
        }
      }
    }

    const unsubscribe = player.onRecordingProgress(({ message, percent, saving }) => {
      status.textContent = message;
      if (Number.isFinite(percent)) progress.value = percent;
      else progress.removeAttribute('value');
      if (saving) cancel.disabled = true;
    });

    for (const button of modes) {
      button.addEventListener('click', () => {
        mode = button.dataset.mode;
        status.textContent = '';
        setup.hidden = true;
        updateControls();
        (mode === 'link' ? url : submit).focus();
      });
    }

    if (regionPicker) {
      captureArea.addEventListener('change', () => {
        updateControls();
        if (captureArea.value === 'region') regionPicker.load();
      });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (phase === 'recording') { finishLive(true); return; }
      if (phase !== 'idle' || submit.disabled) return;
      setup.hidden = true;
      if (mode === 'link') recordLink();
      else recordLive();
    });

    paste.addEventListener('click', async () => {
      try {
        const text = await player.pasteRecordingLink();
        if (phase !== 'idle') return;
        if (text) url.value = text;
        status.textContent = text ? '' : 'The clipboard is empty.';
        url.focus();
      } catch (err) { status.textContent = err.message; }
    });
    setup.addEventListener('click', async () => {
      try { await player.openRecordingSetup(missingTool); }
      catch (err) { status.textContent = err.message; }
    });
    cancel.addEventListener('click', requestCancel);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (phase !== 'recording') requestCancel();
    });
    dialog.addEventListener('close', () => {
      unsubscribe();
      dialog.remove();
      activeDialog = null;
    }, { once: true });
    updateControls();
    document.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();
    (mode === 'link' ? url : submit).focus();
  }

  return { open };
})();
