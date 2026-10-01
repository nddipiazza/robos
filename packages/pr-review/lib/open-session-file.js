'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);
async function openSessionFile(file, shell) {
  if (!file || !fs.existsSync(file)) throw new Error('No saved conversation file is available yet.');
  if (process.platform !== 'linux') {
    const error = await shell.openPath(file); if (error) throw new Error(error); return;
  }
  const {stdout} = await run('xdg-mime', ['query', 'default', 'text/plain']);
  const desktop = stdout.trim();
  if (!desktop || path.basename(desktop) !== desktop || !desktop.endsWith('.desktop')) throw new Error('Choose a default text editor in your desktop settings first.');
  const roots = [process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), ...(process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')];
  const launcher = roots.map(root => path.join(root, 'applications', desktop)).find(file => fs.existsSync(file));
  if (!launcher) throw new Error('The default text editor launcher could not be found.');
  await run('gio', ['launch', launcher, file]);
}
module.exports = {openSessionFile};
