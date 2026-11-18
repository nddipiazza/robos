#!/usr/bin/env node
'use strict';
const { Manager } = require('./lib/manager.cjs');
const { token } = require('./lib/store.cjs');
async function execute(request) {
  const manager = new Manager();
  switch (request.command) {
    case 'list': return manager.list();
    case 'install': return manager.install(request.ids);
    case 'action': return manager.action(request);
    case 'linger': return manager.linger();
    case 'connection': return { token: token(), gateway: 'http://127.0.0.1:19400', transport: 'Use an SSH tunnel for remote clients' };
    default: throw new Error('Unknown command');
  }
}
if (require.main === module) (async () => {
  let request;
  if (process.argv[2] === '--rpc') { let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (raw.length > 65536) throw new Error('Request too large'); } request = JSON.parse(raw); }
  else if (process.argv[2] === 'action') request = { command: 'action', unit: process.argv[3], action: process.argv[4], scope: process.argv[5] || 'user' };
  else request = { command: process.argv[2] || 'list', ...(process.argv[2] === 'install' && process.argv.length > 3 ? { ids: process.argv.slice(3) } : {}) };
  console.log(JSON.stringify({ ok: true, result: await execute(request) }));
})().catch(e => { console.log(JSON.stringify({ ok: false, error: e.message })); process.exitCode = 1; });
module.exports = { execute };
