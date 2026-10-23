'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function launchCommand(executable, host, packaged, id, env = process.env) {
  const childEnv = { ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  return { executable, args: [...(packaged ? [] : [host]), `--app=${id}`], env: childEnv };
}

function launchApp({ executable, host, packaged, id, logDir, env, watch = () => {} }) {
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
    const onExit = code => code === 0 ? finish(null, { existing: true }) : finish(`App exited before opening a window (${code})`);
    const timer = setTimeout(() => finish('The app did not open a window within 30 seconds'), 30000);
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
  return ready;
}
module.exports = { launchCommand, launchApp };
