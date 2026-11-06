'use strict';

// Shared cameras, for other RobOS machines on the private network.
//
// Listens on 127.0.0.1:19221 ("camera-watch-share" in the App Mesh catalog), so it
// is reached only through the mesh gateway, which lets in only pinned peers that
// were given this app. Each request must also carry the camera's share secret,
// so a peer sees only the cameras whose invite it holds.
//
//   GET /cameras/<id>?s=SECRET           { id, name, state, live } as JSON
//   GET /cameras/<id>/live?s=SECRET      live view, multipart MJPEG
//   GET /cameras/<id>/frame.jpg?s=SECRET latest still

const http = require('node:http');
const crypto = require('node:crypto');

const SHARE_PORT = 19221;

function secretMatches(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * @param {object} o
 * @param {(id) => object|null} o.getCamera saved camera (with share.secret)
 * @param {(id) => object|null} o.getRunner the camera's running CameraRunner
 * @param {(event) => void} [o.onAccess] called for each request, for the activity log
 */
function createShareServer({ getCamera, getRunner, onAccess = () => {} }) {
  let server = null;
  let port = 0;
  const viewers = new Map(); // cameraId -> open live streams

  function deny(res, status, msg) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: msg }));
  }

  function handle(req, res) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const m = /^\/cameras\/([\w-]+)(\/live|\/frame\.jpg)?$/.exec(url.pathname);
    if (!m || req.method !== 'GET') { deny(res, 404, 'Not found'); return; }
    const cam = getCamera(m[1]);
    // The same answer for "no such camera", "not shared" and "wrong secret".
    if (!cam || !cam.share?.enabled || !secretMatches(url.searchParams.get('s'), cam.share.secret)) {
      onAccess({ cameraId: m[1], ok: false });
      deny(res, 403, 'This camera is not shared with you.');
      return;
    }
    const runner = getRunner(cam.id);
    onAccess({ cameraId: cam.id, ok: true, what: m[2] || 'info' });

    if (!m[2]) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        id: cam.id,
        name: cam.name,
        state: runner ? runner.state : 'stopped',
        live: Boolean(runner && runner.state === 'live'),
      }));
      return;
    }
    if (!runner) { deny(res, 503, 'The camera is turned off.'); return; }
    if (m[2] === '/frame.jpg') {
      if (!runner.latestFrame) { deny(res, 503, 'No picture yet.'); return; }
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': runner.latestFrame.length, 'Cache-Control': 'no-store' });
      res.end(runner.latestFrame);
      return;
    }
    // Live: the runner already makes JPEG frames for this machine's own view;
    // remote viewers get the same frames, so sharing costs no extra encoding.
    runner.addClient(res);
    viewers.set(cam.id, (viewers.get(cam.id) || 0) + 1);
    res.on('close', () => viewers.set(cam.id, Math.max(0, (viewers.get(cam.id) || 1) - 1)));
  }

  return {
    get port() { return port; },
    get running() { return Boolean(server); },
    viewerCount: (cameraId) => viewers.get(cameraId) || 0,
    start() {
      if (server) return Promise.resolve(port);
      return new Promise((resolve, reject) => {
        const srv = http.createServer(handle);
        srv.once('error', reject);
        srv.listen(Number(process.env.ROBOS_CAMERA_SHARE_PORT || SHARE_PORT), '127.0.0.1', () => {
          server = srv;
          port = srv.address().port;
          resolve(port);
        });
      });
    },
    stop() {
      return new Promise((resolve) => {
        if (!server) { resolve(); return; }
        const srv = server;
        server = null;
        port = 0;
        srv.closeAllConnections?.();
        srv.close(() => resolve());
      });
    },
  };
}

module.exports = { createShareServer, secretMatches, SHARE_PORT };
