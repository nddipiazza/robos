#!/usr/bin/env node
'use strict';

/**
 * RobOS Media Server — Unified HTTP Web Service, Streaming/Transcoding Engine,
 * eBook Reader, Smart TV / Cast Feed & Model Context Protocol (MCP) Server (:19234)
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { MediaCatalogStore } = require('./lib/catalog-store');
const {
  probeMediaFile,
  analyzePlaybackSupport,
  streamFileWithRanges,
  streamTranscodedVideo,
  streamTranscodedAudio,
  serveHlsPlaylist,
  serveHlsSegment,
  serveSubtitlesVtt,
  serveItemArtwork,
} = require('./lib/transcoder');
const { readEpubChapters, readEpubChapterContent } = require('./lib/epub-reader');
const { createMcpDispatcher } = require('./lib/mcp-handler');
const { renderWebPortalHtml, renderBookReaderHtml } = require('./lib/web-ui');

const DEFAULT_PORT = 19234;

function detectLanIp() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (!i.internal && i.family === 'IPv4' && (i.address.startsWith('192.168.') || i.address.startsWith('10.') || i.address.startsWith('100.'))) {
        return i.address;
      }
    }
  }
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (!i.internal && i.family === 'IPv4') return i.address;
    }
  }
  return '127.0.0.1';
}

function readJsonBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RobOS-Token',
  });
  res.end(body);
}

function cleanItemId(segment) {
  return decodeURIComponent(String(segment || '')).replace(/\.[a-z0-9]{1,6}$/i, '');
}

function createMediaServer(options = {}) {
  const port = Number(options.port ?? process.env.ROBOS_MEDIA_SERVER_PORT ?? DEFAULT_PORT);
  const host = options.host || process.env.ROBOS_MEDIA_SERVER_HOST || '0.0.0.0';
  const lanIp = detectLanIp();
  const store = options.store || new MediaCatalogStore(options);
  const artCacheDir = path.join(store.cacheDir, 'art');
  const sseClients = new Map(); // sessionId -> res
  let activeRokuCast = null;

  const baseUrlForReq = (req) => {
    const hdrHost = req?.headers?.host;
    if (hdrHost) return `http://${hdrHost}`;
    const addr = server.address();
    const p = (addr && typeof addr === 'object' ? addr.port : port) || DEFAULT_PORT;
    return `http://${lanIp}:${p}`;
  };

  const mcp = createMcpDispatcher(store, () => {
    const addr = server.address();
    const p = (addr && typeof addr === 'object' ? addr.port : port) || DEFAULT_PORT;
    return `http://${lanIp}:${p}`;
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-RobOS-Token',
        });
        res.end();
        return;
      }

      const baseUrl = baseUrlForReq(req);
      const url = new URL(req.url || '/', baseUrl);
      const pathname = url.pathname;

      // Optional bearer token check if configured
      const requiredToken = process.env.ROBOS_MEDIA_SERVER_TOKEN || store.config.authToken || '';
      if (requiredToken && pathname.startsWith('/api/') && pathname !== '/api/health' && pathname !== '/api/info' && !pathname.startsWith('/api/art/') && !pathname.startsWith('/api/subtitles/') && !pathname.startsWith('/api/playback-info/') && !pathname.startsWith('/api/roku-cinema') && !pathname.startsWith('/api/tv-progress')) {
        const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
          || req.headers['x-robos-token']
          || url.searchParams.get('token')
          || '';
        if (provided !== requiredToken) {
          return sendJson(res, 401, { ok: false, error: 'RobOS Media Server access token required' });
        }
      }

      // ── Web Portal & Health ────────────────────────────────────────────────
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        const html = renderWebPortalHtml();
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/health') {
        return sendJson(res, 200, {
          ok: true,
          service: 'robos-media-server',
          serverId: store.config.serverId,
          serverName: store.config.serverName,
          catalogRevision: store.catalogRevision,
          uptime: process.uptime(),
        });
      }

      if (req.method === 'GET' && pathname === '/api/info') {
        return sendJson(res, 200, store.getSummary(baseUrl));
      }

      // ── Model Context Protocol (HTTP JSON-RPC + SSE) ──────────────────────
      if (pathname === '/mcp') {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            protocol: 'mcp',
            transport: ['http-jsonrpc', 'sse', 'stdio'],
            endpoint: `${baseUrl}/mcp`,
            sseEndpoint: `${baseUrl}/mcp/sse`,
            toolsCount: mcp.tools.length,
            resourcesCount: mcp.resources.length,
            tools: mcp.tools.map(t => t.name),
          });
        }
        if (req.method === 'POST') {
          const rpcReq = await readJsonBody(req);
          const batch = Array.isArray(rpcReq) ? rpcReq : [rpcReq];
          const responses = [];
          for (const entry of batch) {
            try {
              const result = await mcp.dispatch(entry);
              if (entry.id !== undefined && result !== undefined) {
                responses.push({ jsonrpc: '2.0', id: entry.id, result });
              }
            } catch (err) {
              if (entry?.id !== undefined) {
                responses.push({ jsonrpc: '2.0', id: entry.id, error: { code: err.code || -32603, message: err.message } });
              }
            }
          }
          if (!responses.length) {
            res.writeHead(202, { 'Access-Control-Allow-Origin': '*' });
            res.end();
            return;
          }
          return sendJson(res, 200, Array.isArray(rpcReq) ? responses : responses[0]);
        }
      }

      if (req.method === 'GET' && pathname === '/mcp/sse') {
        const sessionId = crypto.randomUUID();
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });
        res.write(`event: endpoint\ndata: /mcp/messages?sessionId=${sessionId}\n\n`);
        sseClients.set(sessionId, res);
        req.on('close', () => sseClients.delete(sessionId));
        return;
      }

      if (req.method === 'POST' && pathname === '/mcp/messages') {
        const sessionId = url.searchParams.get('sessionId') || '';
        const sseRes = sseClients.get(sessionId);
        const rpcReq = await readJsonBody(req);
        try {
          const result = await mcp.dispatch(rpcReq);
          const msg = { jsonrpc: '2.0', id: rpcReq.id, result };
          if (sseRes) sseRes.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
          return sendJson(res, 202, msg);
        } catch (err) {
          const errMsg = { jsonrpc: '2.0', id: rpcReq?.id ?? null, error: { code: err.code || -32603, message: err.message } };
          if (sseRes) sseRes.write(`event: message\ndata: ${JSON.stringify(errMsg)}\n\n`);
          return sendJson(res, 200, errMsg);
        }
      }

      // ── Media Services CRUD & Scan ─────────────────────────────────────────
      if (pathname === '/api/services') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, services: store.listServices() });
        }
        if (req.method === 'POST') {
          const payload = await readJsonBody(req);
          const svc = store.upsertService(payload);
          if (payload.scanNow !== false) {
            store.scan({ serviceId: svc.id }).catch(() => {});
          }
          return sendJson(res, 201, { ok: true, service: svc, services: store.listServices() });
        }
      }

      if (pathname.startsWith('/api/services/')) {
        const parts = pathname.slice('/api/services/'.length).split('/').filter(Boolean);
        const svcId = decodeURIComponent(parts[0] || '');
        if (parts[1] === 'scan' && req.method === 'POST') {
          const result = await store.scan({ serviceId: svcId });
          return sendJson(res, 200, result);
        }
        if (parts.length === 1 && req.method === 'PATCH') {
          const patch = await readJsonBody(req);
          const svc = store.updateService(svcId, patch);
          return sendJson(res, 200, { ok: true, service: svc });
        }
        if (parts.length === 1 && req.method === 'DELETE') {
          return sendJson(res, 200, { ok: true, ...store.removeService(svcId) });
        }
      }

      if (pathname === '/api/scan' && req.method === 'POST') {
        const payload = await readJsonBody(req);
        if (payload.wait) {
          const r = await store.scan({ serviceId: payload.serviceId || null, force: Boolean(payload.force) });
          return sendJson(res, 200, r);
        }
        store.scan({ serviceId: payload.serviceId || null, force: Boolean(payload.force) }).catch(() => {});
        return sendJson(res, 202, { ok: true, started: true, scanState: store.scanState });
      }

      // ── Catalog, Movies, TV Shows, Music, Books & Courses ─────────────────
      if (req.method === 'GET' && pathname === '/api/catalog') {
        return sendJson(res, 200, store.queryCatalog({
          type: url.searchParams.get('type') || '',
          serviceId: url.searchParams.get('serviceId') || '',
          q: url.searchParams.get('q') || '',
          genre: url.searchParams.get('genre') || '',
          year: url.searchParams.get('year') || null,
          limit: Number(url.searchParams.get('limit')) || 0,
          offset: Number(url.searchParams.get('offset')) || 0,
          baseUrl,
        }));
      }

      // Smart TV / P2P Movie Player backwards-compatible endpoint
      if (req.method === 'GET' && pathname === '/api/tv-library') {
        const vidRes = store.queryCatalog({ type: 'movie,tv', baseUrl });
        return sendJson(res, 200, {
          ok: true,
          nodeName: store.config.serverName,
          serverId: store.config.serverId,
          catalogRevision: store.catalogRevision,
          totalCount: vidRes.total,
          items: vidRes.items,
        });
      }

      // Dedicated 10-Foot Roku SceneGraph Cinema+ Feed (Grouped Movies + TV Series + Watch Progress + Active Cast)
      if (req.method === 'GET' && pathname === '/api/roku-cinema') {
        const knownRev = url.searchParams.get('knownRev') || '';
        const currentRev = `${store.catalogRevision}:${store.progressRevision}`;
        const castPayload = activeRokuCast && activeRokuCast.active ? activeRokuCast : null;
        if (knownRev && (knownRev === currentRev || castPayload)) {
          return sendJson(res, 200, {
            ok: true,
            unchanged: true,
            rev: knownRev === currentRev ? currentRev : knownRev,
            cinemaCast: castPayload,
          });
        }
        const lib = store.getRokuCinemaLibrary(baseUrl);
        return sendJson(res, 200, {
          ok: true,
          rev: lib.rev,
          serverName: store.config.serverName,
          counts: lib.counts,
          cinemaLibrary: {
            active: true,
            defaultTab: url.searchParams.get('tab') || 'movies',
            items: lib.items,
          },
          cinemaCast: castPayload,
        });
      }

      if (pathname === '/api/roku-cast') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, cinemaCast: activeRokuCast });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (body && body.active === false) {
            activeRokuCast = null;
          } else if (activeRokuCast && !body.mediaUrl && (body.paused !== undefined || body.seekKey)) {
            activeRokuCast = {
              ...activeRokuCast,
              ...(body.paused !== undefined ? { paused: Boolean(body.paused) } : {}),
              ...(body.seekKey ? { seekKey: String(body.seekKey), seekSeconds: Number(body.seekSeconds) || 0 } : {}),
              updatedAt: new Date().toISOString(),
            };
          } else {
            activeRokuCast = {
              active: true,
              loadKey: body.loadKey || `cast-${Date.now()}`,
              trackId: body.trackId || '',
              mediaUrl: body.mediaUrl || '',
              hlsUrl: body.hlsUrl || '',
              streamFormat: body.streamFormat || 'mp4',
              title: body.title || 'RobOS Movie Player',
              startAt: Number(body.startAt) || 0,
              paused: Boolean(body.paused),
              seekKey: body.seekKey || '',
              seekSeconds: Number(body.seekSeconds) || 0,
              updatedAt: new Date().toISOString(),
            };
          }
          return sendJson(res, 200, { ok: true, cinemaCast: activeRokuCast });
        }
        if (req.method === 'DELETE') {
          activeRokuCast = null;
          return sendJson(res, 200, { ok: true, cinemaCast: null });
        }
      }

      if (req.method === 'GET' && pathname === '/api/tv-progress') {
        const id = url.searchParams.get('id') || '';
        if (!id) return sendJson(res, 400, { ok: false, error: 'id required' });
        const watched = url.searchParams.get('watched') === 'true';
        const pos = Number(url.searchParams.get('positionSec') || 0);
        const dur = Number(url.searchParams.get('durationSec') || 0);
        const entry = store.updateProgress({
          itemId: id,
          positionSec: pos,
          durationSec: dur,
          completed: watched,
          deviceName: url.searchParams.get('device') || 'Roku TV',
        });
        return sendJson(res, 200, { ok: true, entry });
      }

      if (req.method === 'GET' && pathname === '/api/shows') {
        const shows = store.listShows(baseUrl).map(({ seasons, ...s }) => s);
        return sendJson(res, 200, { ok: true, shows });
      }

      if (req.method === 'GET' && pathname.startsWith('/api/shows/')) {
        const slug = decodeURIComponent(pathname.slice('/api/shows/'.length));
        const show = store.getShow(slug, baseUrl);
        if (!show) return sendJson(res, 404, { ok: false, error: 'Show not found' });
        return sendJson(res, 200, { ok: true, ...show });
      }

      if (req.method === 'GET' && pathname === '/api/albums') {
        return sendJson(res, 200, { ok: true, albums: store.listAlbums(baseUrl) });
      }

      if (req.method === 'GET' && pathname.startsWith('/api/items/')) {
        const id = cleanItemId(pathname.slice('/api/items/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        return sendJson(res, 200, { ok: true, item: store.hydrateItem(raw, baseUrl) });
      }

      if (req.method === 'GET' && pathname.startsWith('/api/probe/')) {
        const id = cleanItemId(pathname.slice('/api/probe/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        const probe = await probeMediaFile(raw.filePath);
        return sendJson(res, 200, { ok: true, id, probe });
      }

      if (req.method === 'GET' && pathname.startsWith('/api/playback-info/')) {
        const id = cleanItemId(pathname.slice('/api/playback-info/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        const analysis = await analyzePlaybackSupport(raw.filePath, Boolean(raw.needsTranscode));
        if (analysis.durationSec > 0) raw.duration = Math.round(analysis.durationSec);
        raw.needsTranscode = analysis.needsTranscode;
        const hydrated = store.hydrateItem(raw, baseUrl);
        return sendJson(res, 200, {
          ok: true,
          id: raw.id,
          durationSec: analysis.durationSec,
          canDirectPlay: analysis.canDirectPlay,
          needsTranscode: analysis.needsTranscode,
          recommendedUrl: analysis.canDirectPlay ? hydrated.directStreamUrl : hydrated.transcodeUrl,
          directStreamUrl: hydrated.directStreamUrl,
          transcodeUrl: hydrated.transcodeUrl,
          subtitlesUrl: hydrated.subtitlesUrl,
          hasSubtitles: analysis.hasSubtitles || Boolean(raw.sidecarSubtitle),
          video: analysis.video,
          audio: analysis.audio,
        });
      }

      // ── Books Reader Endpoints ─────────────────────────────────────────────
      if (req.method === 'GET' && pathname.startsWith('/books/read/')) {
        const id = cleanItemId(pathname.slice('/books/read/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Book not found' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderBookReaderHtml(raw));
        return;
      }

      if (req.method === 'GET' && pathname.startsWith('/api/books/')) {
        const parts = pathname.slice('/api/books/'.length).split('/').filter(Boolean);
        const id = decodeURIComponent(parts[0] || '');
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Book not found' });
        if (parts[1] === 'toc') {
          if (raw.ext === '.epub') {
            const toc = readEpubChapters(raw.filePath);
            return sendJson(res, 200, toc ? { ok: true, ...toc } : { ok: false, error: 'Could not parse EPUB structure' });
          }
          if (raw.ext === '.txt' || raw.ext === '.md') {
            const text = fs.readFileSync(raw.filePath, 'utf8').slice(0, 500000);
            return sendJson(res, 200, { ok: true, plainText: true, text });
          }
          return sendJson(res, 200, { ok: false, error: `Download ${raw.bookFormat} file to open in your reader.` });
        }
        if (parts[1] === 'chapter') {
          const chIdx = Number(parts[2] || 0);
          const ch = readEpubChapterContent(raw.filePath, chIdx);
          return sendJson(res, ch ? 200 : 404, ch ? { ok: true, ...ch } : { ok: false, error: 'Chapter not found' });
        }
      }

      // ── Progress & Playlists ───────────────────────────────────────────────
      if (pathname === '/api/progress') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { ok: true, progress: store.progress });
        }
        if (req.method === 'POST') {
          const body = await readJsonBody(req);
          if (body && Array.isArray(body.items)) {
            const entries = store.updateProgressBatch(body.items, { deviceName: body.deviceName || '' });
            return sendJson(res, 200, { ok: true, count: entries.length, entries });
          }
          const entry = store.updateProgress(body);
          return sendJson(res, 200, { ok: true, entry });
        }
      }

      if (req.method === 'GET' && pathname === '/api/continue') {
        return sendJson(res, 200, {
          ok: true,
          items: store.getContinueItems({ limit: Number(url.searchParams.get('limit')) || 20, baseUrl }),
        });
      }

      if (pathname === '/api/playlists') {
        if (req.method === 'GET') return sendJson(res, 200, { ok: true, playlists: store.listPlaylists() });
        if (req.method === 'POST') {
          const pl = store.upsertPlaylist(await readJsonBody(req));
          return sendJson(res, 201, { ok: true, playlist: pl });
        }
      }

      if (req.method === 'GET' && pathname.startsWith('/api/playlists/') && pathname.endsWith('.m3u')) {
        const plId = cleanItemId(pathname.slice('/api/playlists/'.length));
        const pl = store.listPlaylists().find(p => p.id === plId);
        if (!pl) return sendJson(res, 404, { ok: false, error: 'Playlist not found' });
        const lines = ['#EXTM3U', `#PLAYLIST:${pl.name}`];
        for (const id of pl.itemIds) {
          const it = store.byId.get(id);
          if (!it) continue;
          const h = store.hydrateItem(it, baseUrl);
          lines.push(`#EXTINF:-1,${it.artist ? `${it.artist} - ` : ''}${it.title}`);
          lines.push(h.streamUrl);
        }
        res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl; charset=utf-8' });
        res.end(lines.join('\n') + '\n');
        return;
      }

      // ── Artwork, Subtitles, Direct Byte-Range Stream, Transcode & Download ─
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/api/art/')) {
        const id = cleanItemId(pathname.slice('/api/art/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        await serveItemArtwork(res, raw, artCacheDir);
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/api/subtitles/')) {
        const id = cleanItemId(pathname.slice('/api/subtitles/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        await serveSubtitlesVtt(res, raw);
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/stream/')) {
        const id = cleanItemId(pathname.slice('/stream/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        streamFileWithRanges(req, res, raw.filePath, raw.mimeType);
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/download/')) {
        const id = cleanItemId(pathname.slice('/download/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        streamFileWithRanges(req, res, raw.filePath, raw.mimeType, {
          downloadName: path.basename(raw.filePath),
        });
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/transcode/')) {
        const id = cleanItemId(pathname.slice('/transcode/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        await streamTranscodedVideo(req, res, raw, {
          startSec: Number(url.searchParams.get('start') || 0),
          quality: url.searchParams.get('quality') || '',
        });
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/transcode-audio/')) {
        const id = cleanItemId(pathname.slice('/transcode-audio/'.length));
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        streamTranscodedAudio(req, res, raw);
        return;
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/hls/')) {
        const parts = pathname.slice('/hls/'.length).split('/').filter(Boolean);
        const id = decodeURIComponent(parts[0] || '');
        const sub = parts[1] || 'index.m3u8';
        const raw = store.byId.get(id);
        if (!raw) return sendJson(res, 404, { ok: false, error: 'Item not found' });
        if (sub.endsWith('.m3u8')) {
          await serveHlsPlaylist(res, raw, baseUrl);
          return;
        }
        const segMatch = sub.match(/^seg_(\d+)\.ts$/i);
        if (segMatch) {
          await serveHlsSegment(req, res, raw, Number(segMatch[1]));
          return;
        }
        return sendJson(res, 404, { ok: false, error: 'Unknown HLS segment' });
      }

      return sendJson(res, 404, { ok: false, error: `Unknown endpoint: ${pathname}` });
    } catch (err) {
      if (!res.headersSent) {
        sendJson(res, err.status || 500, { ok: false, error: err.message || 'Internal server error' });
      } else {
        try { res.end(); } catch {}
      }
    }
  });

  async function start() {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

    // Register runtime evidence for RobOS Services if available
    try {
      const regPaths = [
        path.resolve(__dirname, '..', 'robos-lib', 'service-registry.cjs'),
        '/usr/local/share/robos/robos-lib/service-registry.cjs',
      ];
      for (const p of regPaths) {
        if (fs.existsSync(p)) {
          require(p).trackServer(server, { appId: 'media-server', name: 'RobOS Media Server' });
          break;
        }
      }
    } catch {}

    if (options.autoScanOnStart !== false) {
      if (store.items.length === 0) {
        store.scan().catch(() => {});
      } else {
        setTimeout(() => store.scan().catch(() => {}), 3000).unref?.();
      }
    }
    if (options.autoWatch !== false) {
      store.startAutoWatch();
    }

    const addr = server.address();
    const actualPort = (addr && typeof addr === 'object' ? addr.port : port) || DEFAULT_PORT;
    return {
      port: actualPort,
      host,
      lanIp,
      url: `http://${lanIp}:${actualPort}`,
      mcpUrl: `http://${lanIp}:${actualPort}/mcp`,
      store,
      server,
    };
  }

  async function stop() {
    store.stopAutoWatch();
    for (const r of sseClients.values()) { try { r.end(); } catch {} }
    sseClients.clear();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return { server, store, mcp, start, stop };
}

if (require.main === module) {
  const instance = createMediaServer();
  instance.start().then((info) => {
    console.log(`[RobOS Media Server] Listening on ${info.host}:${info.port} (${info.url})`);
    console.log(`[RobOS Media Server] MCP HTTP endpoint: ${info.mcpUrl}`);
  }).catch((err) => {
    console.error('[RobOS Media Server] Failed to start:', err.message);
    process.exit(1);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      instance.stop().finally(() => process.exit(0));
    });
  }
}

module.exports = { createMediaServer, DEFAULT_PORT, detectLanIp };
