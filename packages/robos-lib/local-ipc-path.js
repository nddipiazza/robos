'use strict';
const os = require('node:os');
const crypto = require('node:crypto');
// net.Server needs a named pipe on Windows, rather than a Unix socket filename.
function localIpcPath(name, unixPath, { platform = process.platform, home = process.env.HOME || os.homedir() } = {}) {
  if (platform !== 'win32') return unixPath;
  const owner = crypto.createHash('sha256').update(home.toLowerCase()).digest('hex').slice(0, 16);
  return `\\\\.\\pipe\\robos-${name}-${owner}`;
}
module.exports = { localIpcPath };
