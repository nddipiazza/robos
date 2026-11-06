'use strict';

// Local HTTP server that the Camera Watch window reads video from.
// Listens on 127.0.0.1 only, on a random port, and every request must carry
// the per-launch token, so other machines and other local pages cannot watch.
//
//   GET /live/<cameraId>?t=TOKEN      multipart MJPEG live view (<img src>)
//   GET /frame/<cameraId>.jpg?t=TOKEN latest still frame
//   GET /media?path=<file>&t=TOKEN    a recording or thumbnail, with Range support

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mkv': 'video/x-matroska' };

function isInside(child, parent) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function createStreamServer({ getRunner, getMediaRoot }) {
  const token = crypto.randomBytes(16).toString('hex');
  let server = null;
  let port = 0;

  function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.searchParams.get('t') !== token) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    let m = /^\/live\/([\w-]+)$/.exec(url.pathname);
    if (m) {
      const runner = getRunner(m[1]);
      if (!runner) { res.writeHead(404).end('No such camera'); return; }
      runner.addClient(res);
      return;
    }
    m = /^\/frame\/([\w-]+)\.jpg$/.exec(url.pathname);
    if (m) {
      const frame = getRunner(m[1])?.latestFrame;
      if (!frame) { res.writeHead(404).end('No frame yet'); return; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': frame.length, 'Cache-Control': 'no-store' });
      res.end(frame);
      return;
    }
    if (url.pathname === '/media') {
      serveFile(url.searchParams.get('path') || '', req, res);
      return;
    }
    res.writeHead(404).end('Not found');
  }

  function serveFile(file, req, res) {
    const root = getMediaRoot();
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!file || !type || !isInside(file, root)) { res.writeHead(404).end('Not found'); return; }
    let stat;
    try { stat = fs.statSync(file); } catch { res.writeHead(404).end('Not found'); return; }
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] ? Number(range[1]) : 0;
      let end = range[2] ? Number(range[2]) : stat.size - 1;
      if (!range[1] && range[2]) { start = Math.max(0, stat.size - Number(range[2])); end = stat.size - 1; }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  }

  return {
    token,
    get port() { return port; },
    get baseUrl() { return port ? `http://127.0.0.1:${port}` : ''; },
    start() {
      return new Promise((resolve, reject) => {
        server = http.createServer(handle);
        server.on('error', reject);
        server.listen(Number(process.env.ROBOS_CAMERA_STREAM_PORT || 0), '127.0.0.1', () => {
          port = server.address().port;
          resolve(port);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) return resolve();
        server.closeAllConnections?.();
        server.close(() => resolve());
        server = null;
      });
    },
  };
}

module.exports = { createStreamServer, isInside };
