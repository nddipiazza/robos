'use strict';

window.robosRecordToLibrary = (() => {
  let activeDialog;
  const CHUNK_BYTES = 2 * 1024 * 1024;
  const MAX_BUFFERED_BYTES = 32 * 1024 * 1024;

  function open({ kind, player, onSaved }) {
    if (activeDialog) return;
    const video = kind === 'video';
    const systemAudio = player.canCaptureSystemAudio;
    const dialog = document.createElement('dialog');
    dialog.className = 'record-to-library-dialog';
    dialog.setAttribute('aria-labelledby', 'record-to-library-title');
    dialog.innerHTML = `
      <form>
        <h2 id="record-to-library-title">Record to Library</h2>
        <div class="record-to-library-modes" role="group" aria-label="Recording source">
          <button type="button" class="btn-secondary" data-mode="live">${video ? 'Desktop' : 'PC audio'}</button>
          <button type="button" class="btn-secondary" data-mode="link">Media link</button>
        </div>
        <div class="record-to-library-source" data-panel="live">
          <p>${video ? 'Records the display this window is on.' : 'Records sound from your current audio output.'}</p>
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
    const { url, includeAudio, desktopAudio } = form.elements;
    const submit = form.querySelector('[type="submit"]');
    const cancel = form.querySelector('.record-to-library-cancel');
    const setup = form.querySelector('.record-to-library-setup');
    const paste = form.querySelector('.record-to-library-paste');
    const progress = form.querySelector('progress');
    const status = form.querySelector('[role="status"]');
    const indicator = form.querySelector('.record-to-library-live');
    const elapsed = indicator.querySelector('time');
    const modes = [...form.querySelectorAll('[data-mode]')];
    const livePanel = form.querySelector('[data-panel="live"]');
    const linkPanel = form.querySelector('[data-panel="link"]');
    let mode = video || systemAudio ? 'live' : 'link';
    let phase = 'idle';
    let missingTool;
    let recording;

    function updateControls() {
      const idle = phase === 'idle';
      const capturing = phase === 'recording';
      const working = phase === 'link' || phase === 'stopping' || phase === 'starting';
      livePanel.hidden = mode !== 'live';
      linkPanel.hidden = mode !== 'link';
      for (const button of modes) {
        button.disabled = !idle || (button.dataset.mode === 'live' && !video && !systemAudio);
        button.setAttribute('aria-pressed', String(mode === button.dataset.mode));
      }
      if (!video && !systemAudio) modes[0].title = 'PC audio capture is available on Windows.';
      url.disabled = !idle || mode !== 'link';
      includeAudio.disabled = desktopAudio.disabled = paste.disabled = !idle;
      submit.disabled = !idle && !capturing;
      submit.textContent = capturing ? 'Stop & save' : (mode === 'live' ? 'Start recording' : `Save ${video ? 'video' : 'audio'}`);
      cancel.disabled = phase === 'starting' || phase === 'stopping';
      cancel.textContent = capturing ? 'Discard' : (phase === 'link' ? 'Cancel recording' : 'Close');
      indicator.hidden = !capturing;
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
      try { showResult(await player.startRecording({ url: url.value, includeAudio: includeAudio.checked })); }
      catch (err) { showResult({ error: err.message }); }
    }

    async function finishLive(save, failure) {
      if (phase !== 'recording') return;
      setPhase('stopping');
      status.textContent = save ? 'Preparing recording…' : 'Discarding recording…';
      const current = recording;
      clearInterval(current.timer);
      if (current.recorder.state !== 'inactive') current.recorder.stop();
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
      setPhase('starting');
      status.textContent = 'Starting capture…';
      let display;
      try {
        const ready = await player.startDesktopRecording({ includeAudio: withAudio });
        if (!ready.ok) { showResult(ready); return; }
        display = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'monitor', frameRate: { ideal: 30, max: 30 } },
          audio: withAudio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        });
        if (withAudio && !display.getAudioTracks().length) throw new Error('System audio is unavailable. Check your current audio output and try again.');
        const stream = video ? display : new MediaStream(display.getAudioTracks());
        const mimeType = video ? (withAudio ? 'video/webm;codecs=vp8,opus' : 'video/webm;codecs=vp8') : 'audio/webm;codecs=opus';
        const media = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 160_000 });
        const current = {
          display, recorder: media, writes: Promise.resolve(), bufferedBytes: 0,
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
        display?.getTracks().forEach(track => track.stop());
        await player.discardDesktopRecording().catch(() => {});
        showResult({ error: err.name === 'NotAllowedError'
          ? 'Screen capture was denied. Check your screen recording permissions and try again.' : err.message });
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

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (phase === 'recording') { finishLive(true); return; }
      if (phase !== 'idle') return;
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
