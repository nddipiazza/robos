#!/usr/bin/env node
'use strict';

/**
 * RobOS Media Server CLI
 *
 * Commands:
 *   status [--url URL]
 *   services [--url URL]
 *   add-service --kind <movies|shows|music|books|education> --folder <dir> [--name Name] [--id id]
 *   scan [--service id] [--force]
 *   serve [--port 19234]
 */

const http = require('node:http');
const { MediaCatalogStore } = require('../lib/catalog-store');
const { createMediaServer, DEFAULT_PORT } = require('../server');

function flag(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function flagsAll(args, name) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
  }
  return out;
}

function httpJson(method, url, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port || DEFAULT_PORT,
      path: u.pathname + u.search,
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      timeout: 60000,
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'status';
  const serverUrl = (flag(args, '--url') || process.env.ROBOS_MEDIA_SERVER_URL || `http://127.0.0.1:${DEFAULT_PORT}`).replace(/\/+$/, '');

  if (cmd === 'serve') {
    const port = Number(flag(args, '--port') || DEFAULT_PORT);
    const srv = createMediaServer({ port });
    const info = await srv.start();
    console.log(JSON.stringify({ ok: true, url: info.url, mcpUrl: info.mcpUrl, port: info.port }, null, 2));
    return;
  }

  if (cmd === 'status') {
    try {
      const info = await httpJson('GET', `${serverUrl}/api/info`);
      console.log(JSON.stringify(info, null, 2));
    } catch {
      const store = new MediaCatalogStore();
      console.log(JSON.stringify({ ...store.getSummary(serverUrl), serverRunning: false }, null, 2));
    }
    return;
  }

  if (cmd === 'services') {
    try {
      console.log(JSON.stringify(await httpJson('GET', `${serverUrl}/api/services`), null, 2));
    } catch {
      const store = new MediaCatalogStore();
      console.log(JSON.stringify({ ok: true, services: store.listServices() }, null, 2));
    }
    return;
  }

  if (cmd === 'add-service') {
    const kind = flag(args, '--kind') || 'movies';
    const name = flag(args, '--name') || undefined;
    const id = flag(args, '--id') || undefined;
    const folders = flagsAll(args, '--folder');
    const appendFolders = args.includes('--append');
    if (!folders.length) {
      console.error('Usage: robos-media-server add-service --kind <movies|shows|music|books|education> --folder <path> [--folder <path2>]');
      process.exit(1);
    }
    try {
      const res = await httpJson('POST', `${serverUrl}/api/services`, { id, name, kind, folders, appendFolders, scanNow: true });
      console.log(JSON.stringify(res, null, 2));
    } catch {
      const store = new MediaCatalogStore();
      const svc = store.upsertService({ id, name, kind, folders, appendFolders });
      const scan = await store.scan({ serviceId: svc.id });
      console.log(JSON.stringify({ ok: true, service: svc, scan }, null, 2));
    }
    return;
  }

  if (cmd === 'scan') {
    const serviceId = flag(args, '--service') || null;
    const force = args.includes('--force');
    try {
      const res = await httpJson('POST', `${serverUrl}/api/scan`, { serviceId, force, wait: true });
      console.log(JSON.stringify(res, null, 2));
    } catch {
      const store = new MediaCatalogStore();
      console.log(JSON.stringify(await store.scan({ serviceId, force }), null, 2));
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
