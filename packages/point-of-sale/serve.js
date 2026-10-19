#!/usr/bin/env node
'use strict';
// Headless server for a shop's touchscreens: node serve.js [--port 3410] [--host 0.0.0.0] [--data DIR]
const os = require('node:os');
const path = require('node:path');
const { PointOfSale } = require('./lib/pos');
const { createServer, listen } = require('./lib/server');

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const dir = arg('data', process.env.ROBOS_POS_DATA || path.join(os.homedir(), '.config', 'robos', 'point-of-sale'));
const host = arg('host', process.env.ROBOS_POS_HOST || '127.0.0.1');
const lan = !['127.0.0.1', 'localhost', '::1'].includes(host);
const pos = new PointOfSale({ dir });
listen(createServer(pos, { lan }), { port: Number(arg('port', process.env.ROBOS_POS_PORT || 3410)), host })
  .then(port => {
    console.log(`RobOS Point of Sale on http://${host}:${port}  (register /, self-checkout /kiosk, ready board /ready)`);
    if (lan) console.log('Listening beyond this computer: there is no TLS, so use a trusted shop network only.');
  });
