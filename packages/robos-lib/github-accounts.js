'use strict';
// Store account names only. Credentials stay in GitHub CLI's existing credential store.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const file = path.join(os.homedir(), '.config/robos/github-accounts.json');
function cleanEnv(env = process.env) {
  const result = { ...env };
  delete result.GH_TOKEN; delete result.GITHUB_TOKEN; delete result.GH_DEBUG;
  return result;
}
function command(args) {
  return new Promise((resolve, reject) => cp.execFile('gh', args, {
    env: cleanEnv(), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  }, (error, stdout) => error ? reject(Error('GitHub account command failed. Check the saved account in Git Login Manager.')) : resolve(stdout.trim())));
}
function create({ configFile = file, run = command } = {}) {
  function read() {
    try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function list() {
    const result = JSON.parse(await run(['auth', 'status', '--hostname', 'github.com', '--json', 'hosts']));
    const accounts = (result.hosts?.['github.com'] || []).filter(a => a.tokenSource !== 'GH_TOKEN' && a.tokenSource !== 'GITHUB_TOKEN')
      .map(a => ({ login: a.login, active: !!a.active, valid: a.state === 'success' }));
    const selected = read();
    return { accounts, selected: { git: selected.git || accounts.find(a => a.active)?.login || '', copilot: selected.copilot || '' } };
  }
  async function copilotEnv(login = read().copilot, env = process.env) {
    if (!login || !/^[\w-]+$/.test(login)) throw Error('Choose a Copilot account in Preferences → GitHub accounts.');
    let token;
    try { token = await run(['auth', 'token', '--hostname', 'github.com', '--user', login]); }
    catch { throw Error(`The saved GitHub credential for ${login} is unavailable. Add the account again in Preferences → GitHub accounts.`); }
    if (!token?.trim()) throw Error(`No saved credential for ${login}.`);
    const result = cleanEnv(env);
    // Only Copilot understands this override. gh/git subprocesses keep the Git client identity.
    result.COPILOT_GITHUB_TOKEN = token.trim();
    return result;
  }
  async function save(selection, verifyCopilot) {
    const { accounts } = await list();
    for (const key of ['git', 'copilot']) {
      if (typeof selection?.[key] !== 'string' || !accounts.some(a => a.login === selection[key] && a.valid))
        throw Error(`Choose a signed-in ${key === 'git' ? 'Git client' : 'Copilot'} account from the list.`);
    }
    if (verifyCopilot) await verifyCopilot(await copilotEnv(selection.copilot));
    const previousSelection = read();
    const previous = accounts.find(a => a.active)?.login;
    await run(['auth', 'switch', '--hostname', 'github.com', '--user', selection.git]);
    try {
      fs.mkdirSync(path.dirname(configFile), { recursive: true });
      const temp = configFile + '.' + process.pid + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ git: selection.git, copilot: selection.copilot }, null, 2), { mode: 0o600 });
      fs.renameSync(temp, configFile);
    } catch (error) {
      if (previous) await run(['auth', 'switch', '--hostname', 'github.com', '--user', previous]);
      throw error;
    }
    if (previousSelection.git !== selection.git || previous !== selection.git) {
      // Do not keep another account's repository list after switching.
      const cache = path.join(path.dirname(configFile), 'gh-repos-cache.json');
      try { fs.writeFileSync(cache, JSON.stringify({ repos: [], fetchedAt: 0 }), { mode: 0o600 }); } catch {}
    }
    return list();
  }
  return { read, list, copilotEnv, save };
}
function openPreferences() {
  let bundled; try { bundled = require('../robos-graph/node_modules/electron'); } catch {}
  const bin = [process.versions.electron && process.execPath, bundled, '/usr/bin/electron'].find(p => typeof p === 'string' && fs.existsSync(p));
  if (!bin) throw Error('Open RobOS Preferences from the app launcher.');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  return new Promise((resolve, reject) => {
    const child = cp.spawn(bin, [path.join(__dirname, '../robos-preferences'), '--github-accounts', '--no-sandbox', '--disable-gpu'], { env, detached: true, stdio: 'ignore' });
    child.on('error', reject); child.on('spawn', () => { child.unref(); resolve({ ok: true }); });
  });
}
module.exports = { ...create(), create, cleanEnv, openPreferences };
