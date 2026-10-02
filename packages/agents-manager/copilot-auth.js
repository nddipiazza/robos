'use strict';
const cp = require('node:child_process');
const os = require('node:os');

// Scope token overrides to Copilot; never change gh's saved account or Git config.
// Run env after the login shell so shell startup files cannot reintroduce GH_TOKEN.
const command = 'env -u GH_TOKEN -u GITHUB_TOKEN -u ROBOS_COPILOT_SELECTED_TOKEN COPILOT_GITHUB_TOKEN="$ROBOS_COPILOT_SELECTED_TOKEN" copilot';
const accounts = require('../robos-lib/github-accounts');
function terminalArgs(action = 'open', args = []) {
  if (action !== 'open') throw Error('Manage GitHub accounts in RobOS Preferences');
  return ['-e', 'bash', '-lc', `${command} "$@"; read -r -p "Press Enter to close..."`, 'copilot', ...args];
}
async function launch(action, args = [], cwd, { spawn = cp.spawn, env } = {}) {
  try { env = env || await accounts.copilotEnv(); } catch (error) { return { error: error.message }; }
  return new Promise(resolve => {
    env = { ...env, ROBOS_COPILOT_SELECTED_TOKEN: env.COPILOT_GITHUB_TOKEN };
    const child = spawn('x-terminal-emulator', terminalArgs(action, args), {
      cwd: typeof cwd === 'string' && cwd.trim() ? cwd.trim() : os.homedir(),
      env, detached: true, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-4000); });
    const timer = setTimeout(() => { child.unref(); resolve({ ok: true }); }, 1000);
    child.once('error', error => { clearTimeout(timer); resolve({ error: error.message }); });
    child.once('exit', code => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true } : { error: stderr.trim() || `Terminal exited with code ${code}` });
    });
  });
}

// Copilot SDK's read-only JSON-RPC methods. No sessions or model prompts created.
async function rpc(methods, { spawn = cp.spawn, timeout = 15000, env } = {}) {
  env = env || await accounts.copilotEnv();
  env = { ...env, ROBOS_COPILOT_SELECTED_TOKEN: env.COPILOT_GITHUB_TOKEN };
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', `exec ${command} --server --stdio`], {
      cwd: os.homedir(), env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = Buffer.alloc(0), done = false;
    const results = {};
    const finish = (error) => {
      if (done) return;
      done = true; clearTimeout(timer); child.kill();
      error ? reject(error) : resolve(results);
    };
    const timer = setTimeout(() => finish(Error('Copilot status request timed out')), timeout);
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stderr.resume(); // Do not expose CLI diagnostics that could contain credentials.
    child.on('exit', () => finish(Error('Copilot CLI exited before returning its status')));
    child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        while (!done) {
          const end = buffer.indexOf('\r\n\r\n');
          if (end < 0) return;
          const match = /Content-Length:\s*(\d+)/i.exec(buffer.subarray(0, end).toString());
          if (!match) throw Error('Invalid Copilot response framing');
          const length = Number(match[1]);
          if (buffer.length < end + 4 + length) return;
          const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
          buffer = buffer.subarray(end + 4 + length);
          if (!Number.isInteger(message.id) || !methods[message.id - 1]) continue;
          if (message.error) throw Error(message.error.message || 'Copilot request failed');
          results[methods[message.id - 1]] = message.result;
          if (Object.keys(results).length === methods.length) finish();
        }
      } catch (error) { finish(error); }
    });
    methods.forEach((method, index) => {
      const body = JSON.stringify({ jsonrpc: '2.0', id: index + 1, method, params: {} });
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    });
  });
}
async function detect() {
  const base = { id: 'github-copilot', name: 'GitHub Copilot', authenticated: false, user: '' };
  try {
    const result = await rpc(['status.get', 'auth.getStatus']);
    const auth = result['auth.getStatus'];
    return { ...base, installed: true, version: result['status.get'].version,
      authenticated: !!auth.isAuthenticated, user: auth.login || '', authType: auth.authType || '',
      authStatus: auth.statusMessage || '' };
  } catch (error) {
    // A timeout or expired login must not be reported as a missing installation.
    const installed = await new Promise(resolve => cp.execFile('bash', ['-lc', 'command -v copilot'],
      { timeout: 3000 }, error => resolve(!error)));
    return { ...base, installed, authStatus: installed ? 'Unable to check Copilot login: ' + error.message : 'Copilot CLI is not installed' };
  }
}
async function models() {
  try {
    const result = await rpc(['models.list']);
    return { models: result['models.list'].models.map(model => model.id).filter(Boolean).sort() };
  } catch (error) { return { error: error.message }; }
}
module.exports = { terminalArgs, launch, rpc, detect, models };
