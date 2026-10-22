'use strict';
// A self-extracting portable EXE cleans up when its main process exits. Keep
// that process alive while independently launched RobOS apps use its resources.
function portableLifetime(app, BrowserWindow, portable) {
  const children = new Set();
  app.on('window-all-closed', () => {
    if (!portable || children.size === 0) app.quit();
  });
  if (portable) app.on('before-quit', event => {
    if (!children.size) return;
    event.preventDefault();
    for (const window of BrowserWindow.getAllWindows()) window.close();
  });
  return {
    watch(child) {
      if (!portable) { child.unref(); return; }
      children.add(child);
      const finished = () => {
        if (!children.delete(child)) return;
        if (!children.size && !BrowserWindow.getAllWindows().length) app.quit();
      };
      child.once('exit', finished);
      child.once('error', finished);
    },
  };
}
module.exports = { portableLifetime };
