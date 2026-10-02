'use strict';
(async () => {
  const accounts = require('./github-accounts');
  const cp = require('node:child_process');
  const before = await accounts.list().catch(() => ({ selected: {} }));
  const code = await new Promise(resolve => {
    const child = cp.spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web'], { env: accounts.cleanEnv(), stdio: 'inherit' });
    child.on('error', () => resolve(1)); child.on('exit', code => resolve(code ?? 1));
  });
  if (before.selected.git) {
    const restore = cp.spawnSync('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', before.selected.git], { env: accounts.cleanEnv(), stdio: 'inherit' });
    if (restore.status !== 0) throw Error('Restore the Git client account in Preferences → GitHub accounts.');
  }
  process.exitCode = code;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
