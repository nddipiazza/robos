'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { searchPets } = require('./pets');

const PUBLIC = path.join(__dirname, '..', 'public');
// Dev convenience: reload open pages when public/index.html changes.
const RELOAD = '<script>(function(){var v;setInterval(function(){fetch("/__version").then(function(r){return r.text()}).then(function(t){if(v&&v!==t)location.reload();v=t}).catch(function(){})},500)})()</script>';

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/pets') {
    return send(res, 200, 'application/json', JSON.stringify(searchPets(url.searchParams.get('q') || '')));
  }
  if (url.pathname === '/__version') {
    return send(res, 200, 'text/plain', String(fs.statSync(path.join(PUBLIC, 'index.html')).mtimeMs));
  }
  if (url.pathname === '/') {
    const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8').replace('</body>', RELOAD + '</body>');
    return send(res, 200, 'text/html; charset=utf-8', html);
  }
  send(res, 404, 'text/plain', 'Not found');
});

if (require.main === module) {
  server.listen(Number(process.env.PORT) || 4173, '127.0.0.1', () => console.log('Pawfinder on http://127.0.0.1:' + server.address().port));
}
module.exports = server;
