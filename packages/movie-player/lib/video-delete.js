'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

function registerVideoDelete({ ipcMain, dialog, shell, getWindow, findTrack, isLocalVideo, removeFromLibrary }) {
  let pending = false;
  const trash = process.platform === 'win32' ? 'Recycle Bin' : 'Trash';

  ipcMain.handle('movie:delete-video', async (event, trackId) => {
    const window = getWindow();
    if (window?.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame
      || !event.senderFrame?.url.startsWith('file:')) {
      return { ok: false, error: 'Open Delete video in Movie Player.' };
    }
    if (pending) return { ok: false, error: 'A video deletion is already in progress.' };
    pending = true;

    try {
      const track = findTrack(trackId);
      if (!isLocalVideo(track)) return { ok: false, error: 'Select a local video to delete.' };
      const filePath = path.resolve(track.filePath);
      const original = await fs.lstat(filePath);
      if (!original.isFile()) return { ok: false, error: 'The source must be a regular video file.' };
      const { response } = await dialog.showMessageBox(window, {
        type: 'warning',
        title: 'Delete video',
        message: `Move “${track.title || path.basename(filePath)}” to the ${trash}?`,
        detail: `${filePath}\n\nThe source file will be moved to the ${trash} and removed from the library, watch queue, and saved watchlists.`,
        buttons: ['Cancel', `Move to ${trash}`],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response !== 1) return { ok: false, canceled: true };

      const current = await fs.lstat(filePath);
      if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino
        || current.size !== original.size || current.ctimeMs !== original.ctimeMs) {
        return { ok: false, error: 'The source file changed after you opened the confirmation. Open Delete video again.' };
      }
      await shell.trashItem(filePath);
      const trackIds = removeFromLibrary(track);
      return { ok: true, trackIds, trash };
    } catch (err) {
      return { ok: false, error: err.code === 'ENOENT' ? 'The source file could not be found.' : err.message };
    } finally {
      pending = false;
    }
  });
}

module.exports = { registerVideoDelete };
