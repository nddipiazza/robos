'use strict';
// Credential values are inherited in memory, never interpolated into shell commands.
(async () => {
  try {
    const env = await require('./github-accounts').copilotEnv();
    const child = require('node:child_process').spawn('copilot', process.argv.slice(2), { env, stdio: 'inherit' });
    child.on('error', () => { console.error('Could not start Copilot CLI.'); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
})();
