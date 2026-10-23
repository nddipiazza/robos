'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');

function launchCommand(executable, host, packaged, id, env = process.env) {
  const childEnv = { ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  return { executable, args: [...(packaged ? [] : [host]), `--app=${id}`, `--robos-owner=${childEnv.HOME || childEnv.USERPROFILE || os.homedir()}`], env: childEnv };
}

async function launchApp({ executable, host, packaged, id, logDir, env, watch = () => {}, focusExisting = async () => null, retry = true }) {
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${id}-windows.log`);
  const log = fs.openSync(logPath, 'a');
  const command = launchCommand(executable, host, packaged, id, env);
  let child;
  try {
    child = spawn(command.executable, command.args, { env: command.env, detached: true,
      // windowsHide also hides the first GUI window. Only CLI helpers use it.
      windowsHide: false, stdio: ['ignore', log, log, 'ipc'] });
  } finally { fs.closeSync(log); }
  watch(child);
  const ready = new Promise((resolve, reject) => {
    const finish = (error, result) => {
      clearTimeout(timer);
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      if (child.connected) child.disconnect();
      if (error) reject(new Error(`${error}. Details: ${logPath}`)); else resolve(result);
    };
    const onMessage = message => {
      if (message?.type === 'robos:window-ready' && message.id === id && message.visible)
        finish(null, { pid: child.pid, title: message.title, visible: true });
    };
    const onError = error => finish(error.message);
    const onExit = code => finish(code === 0 ? 'An existing app did not confirm an open window' : `App exited before opening a window (${code})`);
    const timer = setTimeout(() => finish('The app did not open a window within 30 seconds'), 30000);
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
  try { return await ready; }
  catch (error) {
    if (child.exitCode !== 0) throw error;
    const existing = await focusExisting();
    if (existing) return existing;
    // A window can close just before the old process releases its lock.
    if (retry) {
      await new Promise(resolve => setTimeout(resolve, 400));
      return launchApp({ executable, host, packaged, id, logDir, env, watch, focusExisting, retry: false });
    }
    throw error;
  }
}
module.exports = { launchCommand, launchApp };
