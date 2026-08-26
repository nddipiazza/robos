#!/usr/bin/env node
/**
 * RobOS Failure & Log Reader CLI.
 *
 * Usage:
 *   node logs-cli.js [--errors-only] [--app <app-id>] [--limit <n>] [--vm] [--json]
 *
 * Examples:
 *   node logs-cli.js --errors-only --vm
 *   node logs-cli.js --app git-login-manager --limit 20
 */

const { execSync } = require('child_process');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    errorsOnly: args.includes('--errors-only') || args.includes('-e'),
    vm: args.includes('--vm'),
    json: args.includes('--json'),
    limit: 50,
  };

  const appIdx = args.indexOf('--app');
  if (appIdx !== -1 && args[appIdx + 1]) {
    opts.appId = args[appIdx + 1];
  }

  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    opts.limit = parseInt(args[limitIdx + 1], 10) || 50;
  }

  return opts;
}

function runRemoteInVM(opts) {
  const flags = [];
  if (opts.errorsOnly) flags.push('--errors-only');
  if (opts.appId) flags.push(`--app ${opts.appId}`);
  if (opts.limit) flags.push(`--limit ${opts.limit}`);
  if (opts.json) flags.push('--json');

  const cmd = `ssh -p 2224 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null robos@localhost "node /usr/local/share/robos/robos-lib/logs-cli.js ${flags.join(' ')}"`;
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    process.stdout.write(out);
  } catch (err) {
    console.error('Failed to query logs from VM:', err.message);
    process.exit(1);
  }
}

function main() {
  const opts = parseArgs();

  if (opts.vm) {
    runRemoteInVM(opts);
    return;
  }

  let loggerModule;
  try {
    loggerModule = require('/usr/local/share/robos/robos-lib/logger');
  } catch {
    try {
      loggerModule = require(path.join(__dirname, 'logger'));
    } catch (e) {
      console.error('Could not load robos logger:', e.message);
      process.exit(1);
    }
  }

  const { readLogs } = loggerModule;
  const entries = readLogs(opts);

  if (opts.json) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(opts.errorsOnly ? '✅ No error log entries found.' : 'No log entries found.');
    return;
  }

  console.log(`=== RobOS Log Entries (${entries.length}) ===\n`);
  entries.forEach((e, idx) => {
    const icon = e.level === 'error' ? '❌' : e.level === 'warn' ? '⚠️' : 'ℹ️';
    console.log(`[${idx + 1}] ${icon} ${e.ts || ''} | App: ${e.app || 'unknown'} | Level: ${e.level || 'info'}`);
    console.log(`    Event:   ${e.event || ''}`);
    console.log(`    Message: ${e.msg || ''}`);
    if (e.content) {
      console.log(`    Content: ${e.content}`);
    }
    if (e.stack) {
      console.log(`    Stack:\n${e.stack.split('\n').map(l => '      ' + l).join('\n')}`);
    }
    console.log('');
  });
}

main();
