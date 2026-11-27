'use strict';

window.robosRecordToLibrary = (() => {
  let activeDialog;

  function open({ kind, player, onSaved }) {
    if (activeDialog) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'record-to-library-dialog';
    dialog.setAttribute('aria-labelledby', 'record-to-library-title');
    dialog.innerHTML = `
      <form>
        <h2 id="record-to-library-title">Record to Library</h2>
        <label for="record-media-link">Media link</label>
        <div class="record-to-library-link">
          <input id="record-media-link" name="url" type="url" placeholder="https://…" required autofocus>
          <button class="btn-secondary record-to-library-paste" type="button">Paste</button>
        </div>
        <label class="record-to-library-audio">
          <input name="includeAudio" type="checkbox" checked> Include audio
        </label>
        <progress aria-label="Recording progress" max="100" hidden></progress>
        <p class="record-to-library-status" role="status"></p>
        <button class="btn-secondary record-to-library-setup" type="button" hidden>Installation instructions</button>
        <footer>
          <button class="btn-secondary record-to-library-cancel" type="button">Close</button>
          <button class="btn-accent" type="submit">Save ${kind === 'video' ? 'video' : 'audio'}</button>
        </footer>
      </form>`;
    const form = dialog.querySelector('form');
    const { url, includeAudio } = form.elements;
    const submit = form.querySelector('[type="submit"]');
    const cancel = form.querySelector('.record-to-library-cancel');
    const setup = form.querySelector('.record-to-library-setup');
    const paste = form.querySelector('.record-to-library-paste');
    const progress = form.querySelector('progress');
    const status = form.querySelector('[role="status"]');
    includeAudio.parentElement.hidden = kind !== 'video';
    let busy = false;
    let missingTool;

    function setBusy(value) {
      busy = value;
      url.disabled = submit.disabled = includeAudio.disabled = paste.disabled = value;
      cancel.disabled = false;
      cancel.textContent = value ? 'Cancel recording' : 'Close';
      progress.hidden = !value;
      progress.removeAttribute('value');
    }

    async function requestCancel() {
      if (!busy) {
        dialog.close();
        return;
      }
      cancel.disabled = true;
      try {
        if (await player.cancelRecording()) status.textContent = 'Canceling recording…';
      } catch (err) {
        status.textContent = err.message;
        cancel.disabled = false;
      }
    }

    const unsubscribe = player.onRecordingProgress(({ message, percent, saving }) => {
      status.textContent = message;
      if (Number.isFinite(percent)) progress.value = percent;
      else progress.removeAttribute('value');
      if (saving) cancel.disabled = true;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      setup.hidden = true;
      status.textContent = 'Finding media…';
      let result;
      try {
        result = await player.startRecording({ url: url.value, includeAudio: includeAudio.checked });
      } catch (err) {
        result = { error: err.message };
      }
      setBusy(false);
      if (result.ok) {
        dialog.close();
        onSaved(result.track);
        return;
      }
      status.textContent = result.canceled ? 'Recording canceled.' : result.error;
      missingTool = result.tool;
      setup.hidden = !missingTool;
      url.focus();
    });

    paste.addEventListener('click', async () => {
      try {
        const text = await player.pasteRecordingLink();
        if (busy) return;
        if (text) url.value = text;
        status.textContent = text ? '' : 'The clipboard is empty.';
        url.focus();
      } catch (err) {
        status.textContent = err.message;
      }
    });
    setup.addEventListener('click', async () => {
      try { await player.openRecordingSetup(missingTool); }
      catch (err) { status.textContent = err.message; }
    });
    cancel.addEventListener('click', requestCancel);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      requestCancel();
    });
    dialog.addEventListener('close', () => {
      unsubscribe();
      dialog.remove();
      activeDialog = null;
    }, { once: true });
    document.body.append(dialog);
    activeDialog = dialog;
    dialog.showModal();
  }

  return { open };
})();
