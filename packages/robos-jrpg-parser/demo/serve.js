#!/usr/bin/env node
'use strict';

// A tiny static web server bound to this machine only. It logs each request so
// the demo can show what the website sees while the harvester runs.

const fs = require('fs');
const http = require('http');
const path = require('path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain', '.feature': 'text/plain; charset=utf-8', '.js': 'text/javascript' };

function serve(root, { port = 0, onRequest = () => {} } = {}) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(base, url);
    if (file !== base && !file.startsWith(base + path.sep)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { onRequest({ method: req.method, url, status: 404, ua: req.headers['user-agent'] }); res.writeHead(404); res.end('Not found'); return; }
    onRequest({ method: req.method, url, status: 200, ua: req.headers['user-agent'] });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}` })));
}

module.exports = { serve };

if (require.main === module) {
  const [root = '.', port = '8765'] = process.argv.slice(2);
  serve(root, { port: Number(port), onRequest: r => console.log(`${r.status} ${r.method} ${r.url}`) })
    .then(s => console.log(`Serving ${path.resolve(root)} at ${s.url}`));
}
