'use strict';

/**
 * RobOS AI Multiplayer Game Theater — Smart TV & Roku 1080p Spectator Cast Bridge.
 *
 * Casts the secret-safe RobOS Spectator Dashboard (`/tv` mounting `<robos-dashboard>`)
 * to any Smart TV paired in RobOS Smart TV Studio:
 *   - Browser TVs (LG webOS, Samsung Tizen, Android TV / Google TV): opens `/tv` directly.
 *   - Roku TVs (e.g. 65" TCL Roku TV, `platformId: 'roku-os'`): Roku OS has no web browser,
 *     so an offscreen 1920×1080 Electron `BrowserWindow` renders `/tv` (`offscreen: true,
 *     backgroundThrottling: false`) and streams live 1080p JPEG frames to the RobOS TV
 *     Portal (`/api/app-cast-frame?tv=<tvId>`), displayed live by the `RobOS TV` Roku channel.
 */

const http = require('node:http');

const DEFAULT_PORTAL_PORT = 19210;
const FRAME_INTERVAL_MS = 150;
const MIN_PAINT_PUSH_MS = 65;
const CAPTURE_WIDTH = 1280;
const CAPTURE_HEIGHT = 720;
const CAPTURE_ZOOM = CAPTURE_WIDTH / 1920;

function postFrame(portalPort, tvId, jpgBuffer, postImpl = null) {
  if (typeof postImpl === 'function') {
    return Promise.resolve(postImpl(portalPort, tvId, jpgBuffer));
  }
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: portalPort,
        path: `/api/app-cast-frame?tv=${encodeURIComponent(tvId)}`,
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': jpgBuffer.length,
        },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      },
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end(jpgBuffer);
  });
}

function createTvBridge({
  tvEngine = null,
  BrowserWindow = null,
  getTheaterPort = () => 19228,
  getLanIp = () => '127.0.0.1',
  getPortalPort = () => DEFAULT_PORTAL_PORT,
  postFrameImpl = null,
  log = () => {},
} = {}) {
  const streams = new Map(); // tvId -> { win, timer, tvName, startedAt, framesSent }

  async function ensurePortalStarted() {
    if (!tvEngine || typeof tvEngine.startPortalServer !== 'function') return;
    try {
      await tvEngine.startPortalServer();
    } catch {
      // Portal may already be bound on :19210 by RobOS Smart TV Studio or RobOS Dashboards
    }
  }

  function listTvs() {
    if (!tvEngine || typeof tvEngine.getOverview !== 'function') return [];
    try {
      const ov = tvEngine.getOverview();
      return (ov.tvs || []).map((t) => ({
        id: t.id,
        name: t.name,
        ip: t.ip,
        platformId: t.platformId,
        platformName: t.platformName,
        online: t.online !== false,
        browser: t.platformId !== 'roku-os',
      }));
    } catch {
      return [];
    }
  }

  function buildTvUrl(host, tvName = '') {
    const qs = tvName ? `?tvName=${encodeURIComponent(tvName)}` : '';
    return `http://${host}:${getTheaterPort()}/tv${qs}`;
  }

  function stopFrameStream(tvId) {
    const s = streams.get(tvId);
    if (!s) return false;
    clearInterval(s.timer);
    if (s.paintDebounceTimer) clearTimeout(s.paintDebounceTimer);
    if (s.sseCaptureTimer) clearTimeout(s.sseCaptureTimer);
    try {
      if (s.sseReq) s.sseReq.destroy();
    } catch {}
    try {
      if (s.win && typeof s.win.isDestroyed === 'function' && !s.win.isDestroyed()) {
        s.win.destroy();
      }
    } catch {}
    streams.delete(tvId);
    return true;
  }

  async function startRokuFrameStream(tv) {
    stopFrameStream(tv.id);
    if (!BrowserWindow || typeof BrowserWindow !== 'function') return { started: false };

    let win;
    try {
      win = new BrowserWindow({
        width: CAPTURE_WIDTH,
        height: CAPTURE_HEIGHT,
        show: false,
        frame: false,
        backgroundColor: '#070b12',
        webPreferences: {
          offscreen: true,
          zoomFactor: CAPTURE_ZOOM,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          partition: `theater-roku-${tv.id}`,
        },
      });
    } catch (err) {
      log({ msg: 'offscreen BrowserWindow init failed', err: err.message });
      return { started: false, error: err.message };
    }

    if (!win.webContents || typeof win.webContents.on !== 'function') {
      return { started: false };
    }

    const entry = {
      win,
      timer: null,
      paintDebounceTimer: null,
      sseCaptureTimer: null,
      sseReq: null,
      tvName: tv.name,
      startedAt: new Date().toISOString(),
      framesSent: 0,
    };

    let latestImage = null;
    let fresh = false;
    let busy = false;
    let lastPaintMs = 0;
    let lastPostMs = 0;
    let lastSentBuf = null;
    let resolveFirstFrame;
    const firstFramePromise = new Promise((r) => {
      resolveFirstFrame = r;
    });

    function scheduleImmediatePaintFlush() {
      if (win.isDestroyed()) return;
      const elapsed = Date.now() - lastPostMs;
      const waitMs = lastPostMs === 0 ? 0 : Math.max(0, MIN_PAINT_PUSH_MS - elapsed);
      if (waitMs === 0 && !busy) {
        flushFrame();
        return;
      }
      if (!entry.paintDebounceTimer) {
        entry.paintDebounceTimer = setTimeout(() => {
          entry.paintDebounceTimer = null;
          flushFrame();
        }, Math.max(8, waitMs));
        entry.paintDebounceTimer.unref?.();
      }
    }

    async function flushFrame(forceCapture = false) {
      if (busy || win.isDestroyed()) return;
      busy = true;
      try {
        if ((forceCapture || !fresh) && typeof win.webContents?.capturePage === 'function') {
          try {
            const snap = await win.webContents.capturePage();
            if (snap) {
              latestImage = snap;
              fresh = true;
            }
          } catch {}
        }
        if (!latestImage || win.isDestroyed()) return;
        if (!fresh && Date.now() - lastPostMs < 3500) return;
        fresh = false;
        const size = latestImage.getSize();
        const img =
          size.width > CAPTURE_WIDTH && typeof latestImage.resize === 'function'
            ? latestImage.resize({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, quality: 'good' })
            : latestImage;
        const jpg = img.toJPEG(72);
        if (jpg && jpg.length > 1500) {
          if (lastSentBuf && jpg.equals(lastSentBuf) && Date.now() - lastPostMs < 3000) {
            return;
          }
          const code = await postFrame(getPortalPort(), tv.id, jpg, postFrameImpl);
          if (code >= 200 && code < 300) {
            lastSentBuf = jpg;
            entry.framesSent += 1;
            lastPostMs = Date.now();
            resolveFirstFrame?.(true);
            resolveFirstFrame = null;
          }
        }
      } catch (err) {
        log({ msg: 'roku frame capture error', tvId: tv.id, err: err.message });
      } finally {
        busy = false;
        if (fresh && !win.isDestroyed()) {
          scheduleImmediatePaintFlush();
        }
      }
    }

    win.webContents.on('paint', (_ev, _dirty, image) => {
      latestImage = image;
      lastPaintMs = Date.now();
      fresh = true;
      scheduleImmediatePaintFlush();
    });
    win.webContents.setFrameRate?.(30);
    win.webContents.setAudioMuted?.(true);

    // Subscribe directly to Game Theater SSE updates and request an immediate zero-copy
    // offscreen paint (`invalidate()`) rather than a blocking `capturePage()` IPC readback.
    try {
      const sseReq = http.get(
        {
          hostname: '127.0.0.1',
          port: getTheaterPort(),
          path: '/api/spectator-events',
          headers: { Accept: 'text/event-stream' },
        },
        (sseRes) => {
          sseRes.on('data', () => {
            if (win.isDestroyed()) return;
            if (entry.sseCaptureTimer) clearTimeout(entry.sseCaptureTimer);
            entry.sseCaptureTimer = setTimeout(() => {
              entry.sseCaptureTimer = null;
              if (win.isDestroyed()) return;
              win.webContents?.invalidate?.();
              flushFrame(true);
            }, 22);
            entry.sseCaptureTimer.unref?.();
          });
        },
      );
      sseReq.on('error', () => {});
      entry.sseReq = sseReq;
    } catch {}

    const localCaptureUrl = `${buildTvUrl('127.0.0.1', tv.name)}${tv.name ? '&' : '?'}capture=1`;
    const loadFn =
      typeof win.loadURL === 'function'
        ? win.loadURL.bind(win)
        : typeof win.webContents?.loadURL === 'function'
          ? win.webContents.loadURL.bind(win.webContents)
          : null;
    if (loadFn) {
      Promise.resolve(loadFn(localCaptureUrl)).catch(() => {});
    }

    // Also trigger an explicit capturePage fallback after load so initial frame is guaranteed
    win.webContents.once?.('did-finish-load', () => {
      setTimeout(async () => {
        if (win.isDestroyed()) return;
        try {
          if (entry.framesSent === 0 && typeof win.webContents.capturePage === 'function') {
            const snap = await win.webContents.capturePage();
            latestImage = snap;
            fresh = true;
            await flushFrame();
          }
        } catch {}
      }, 450);
    });

    entry.timer = setInterval(flushFrame, FRAME_INTERVAL_MS);
    entry.timer.unref?.();
    streams.set(tv.id, entry);

    // Wait up to 1.6s for the first 1080p frame to land in the portal before launching Roku channel
    await Promise.race([
      firstFramePromise,
      new Promise((r) => setTimeout(() => r(false), 1600)),
    ]);

    return { started: true, framesSent: entry.framesSent };
  }

  async function castToTv({ tvId, gameTitle = '' } = {}) {
    await ensurePortalStarted();
    const tvs = listTvs();
    const tv =
      (tvId && tvs.find((t) => t.id === tvId)) ||
      tvs.find((t) => t.platformId === 'roku-os') ||
      tvs[0];
    if (!tv) {
      return {
        ok: false,
        error: 'No Smart TV is paired yet. Open RobOS Smart TV Studio to pair your Roku or Smart TV.',
      };
    }

    const url = buildTvUrl(getLanIp(), tv.name);
    let streamInfo = { started: false };
    if (!tv.browser) {
      streamInfo = await startRokuFrameStream(tv);
    }

    if (!tvEngine || typeof tvEngine.castAppToTv !== 'function') {
      if (!tv.browser) stopFrameStream(tv.id);
      return { ok: false, error: 'RobOS TV engine is not available.' };
    }

    const castTitle = gameTitle
      ? `Game Theater · ${gameTitle} (Live Spectator)`
      : 'RobOS Game Theater · Live Spectator Dashboard';

    const res = await tvEngine.castAppToTv({
      tvId: tv.id,
      appId: 'game-theater',
      title: castTitle,
      url,
    });

    if (!res?.ok && !tv.browser) {
      stopFrameStream(tv.id);
    }

    return {
      ok: Boolean(res?.ok),
      tv,
      url,
      mode: tv.browser ? 'browser-url' : 'roku-live-frames',
      framesStreaming: !tv.browser && streams.has(tv.id),
      framesSent: streams.get(tv.id)?.framesSent || streamInfo.framesSent || 0,
      rokuChannelLaunched: res?.rokuChannelLaunched,
      message:
        res?.message ||
        res?.error ||
        (res?.ok ? `Casting Game Theater Spectator Dashboard to ${tv.name}` : 'Failed to cast to TV'),
    };
  }

  function stopCast({ tvId } = {}) {
    if (tvId) {
      stopFrameStream(tvId);
    } else {
      for (const id of [...streams.keys()]) stopFrameStream(id);
    }
    try {
      tvEngine?.stopAppCast?.({ tvId: tvId || undefined, appId: 'game-theater' });
    } catch {}
    return {
      ok: true,
      streamingTvIds: [...streams.keys()],
      message: 'Stopped casting Game Theater Spectator Dashboard.',
    };
  }

  function getStatus() {
    const tvs = listTvs();
    let appCasts = [];
    try {
      appCasts = (tvEngine?.listAppCasts?.() || []).filter((c) => c && c.appId === 'game-theater' && c.active);
    } catch {}
    const streamingTvIds = [...streams.keys()];
    return {
      ok: true,
      tvs,
      streamingTvIds,
      activeCasts: appCasts,
      portalPort: getPortalPort(),
      wallboardUrl: buildTvUrl(getLanIp()),
    };
  }

  return {
    ensurePortalStarted,
    listTvs,
    castToTv,
    stopCast,
    getStatus,
    buildTvUrl,
  };
}

module.exports = {
  DEFAULT_PORTAL_PORT,
  FRAME_INTERVAL_MS,
  postFrame,
  createTvBridge,
};
