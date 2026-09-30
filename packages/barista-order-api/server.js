'use strict';
const http = require('http');

const PORT = process.env.PORT || 3000;
const APP_NAME = "Barista Order API";

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/api/health' || req.url === '/health') {
    res.writeHead(200);
    return res.end(JSON.stringify({ status: 'ok', service: APP_NAME, uptime: process.uptime() }));
  }

  if (req.url.startsWith('/api/')) {
    res.writeHead(200);
    return res.end(JSON.stringify({
      service: APP_NAME,
      version: '1.0.0',
      message: 'Resource endpoint responding',
      data: [{ id: 1, name: 'Sample Item', active: true }]
    }));
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not Found', path: req.url }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`⚡ ${APP_NAME} listening on http://localhost:${PORT}`);
  });
}

module.exports = server;
