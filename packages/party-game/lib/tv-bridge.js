'use strict';

// Puts the party on RobOS TVs through the shared tv-engine app-cast API.
//
// Browser TVs (LG webOS, Samsung Tizen, Android TV) load the game's TV page
// straight from the party LAN server. Roku has no browser, so a hidden
// 1920×1080 window renders that page here and its frames are pushed to the
// RobOS TV portal, where the RobOS TV channel shows them.

const http = require('node:http');

const FRAME_INTERVAL_MS = 700;

function postFrame(portalPort, tvId, jpg) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: portalPort,
        path: `/api/app-cast-frame?tv=${encodeURIComponent(tvId)}`,
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': jpg.length },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      }
    );
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end(jpg);
  });
}

function createTvBridge({ tvEngine, BrowserWindow = null, getGamePort, getLanIp, getPortalPort = () => 19210, log = () => {} }) {
  const streams = new Map(); // tvId → { win, timer }

  function listTvs() {
    if (!tvEngine) return [];
    try {
      return (tvEngine.getOverview().tvs || []).map((t) => ({
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

  function tvPageUrl(screen, host) {
    return `http://${host}:${getGamePort()}/tv?screen=${encodeURIComponent(screen)}`;
  }

  function startFrameStream(tvId, screen) {
    stopFrameStream(tvId);
    if (!BrowserWindow) return false;
    // Offscreen rendering keeps painting even when no RobOS window is visible
    // (a hidden normal window only paints its first frame, which froze the TV
    // whenever the console was minimized).
    const win = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      frame: false,
      backgroundColor: '#070b12',
      webPreferences: {
        offscreen: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        // Its own session, so its live-update stream does not count against the
        // six-connections-per-host limit shared by the console and its previews.
        partition: `party-roku-${tvId}`,
      },
    });
    let latest = null;
    let fresh = false;
    win.webContents.on('paint', (_e, _dirty, image) => {
      latest = image;
      fresh = true;
    });
    win.webContents.setFrameRate(10);
    win.loadURL(`${tvPageUrl(screen, '127.0.0.1')}&capture=1`);
    win.webContents.setAudioMuted(true);
    let busy = false;
    let lastPost = 0;
    const timer = setInterval(async () => {
      if (busy || win.isDestroyed() || !latest) return;
      // Re-send an unchanged frame every few seconds so the portal keeps it live.
      if (!fresh && Date.now() - lastPost < 5000) return;
      busy = true;
      fresh = false;
      try {
        const size = latest.getSize();
        const jpg = (size.width > 1920 ? latest.resize({ width: 1920, height: 1080, quality: 'good' }) : latest).toJPEG(80);
        if (jpg.length > 2000) await postFrame(getPortalPort(), tvId, jpg);
        lastPost = Date.now();
      } catch (err) {
        log({ msg: 'frame capture failed', tvId, err: err.message });
      } finally {
        busy = false;
      }
    }, FRAME_INTERVAL_MS);
    streams.set(tvId, { win, timer });
    return true;
  }

  function stopFrameStream(tvId) {
    const s = streams.get(tvId);
    if (!s) return;
    clearInterval(s.timer);
    try {
      if (!s.win.isDestroyed()) s.win.destroy();
    } catch {}
    streams.delete(tvId);
  }

  // selection: [{ tvId, screen }] from the engine.
  async function castAll(selection = []) {
    const results = [];
    for (const sel of selection) {
      const tv = listTvs().find((t) => t.id === sel.tvId);
      if (!tv) {
        results.push({ tvId: sel.tvId, ok: false, error: 'TV is not paired in Smart TV Studio' });
        continue;
      }
      const url = tvPageUrl(sel.screen, getLanIp());
      let res = { ok: false, error: 'RobOS TV engine is not installed' };
      if (tvEngine) {
        res = await tvEngine.castAppToTv({ tvId: tv.id, appId: 'party-game', title: `Party Game · ${sel.screen}`, url });
      }
      if (res.ok && !tv.browser) startFrameStream(tv.id, sel.screen);
      results.push({ tvId: tv.id, name: tv.name, screen: sel.screen, url, ok: res.ok, mode: tv.browser ? 'url' : 'frames', message: res.message || res.error });
    }
    return results;
  }

  function stopAll() {
    for (const tvId of [...streams.keys()]) stopFrameStream(tvId);
    try {
      tvEngine?.stopAppCast({ appId: 'party-game' });
    } catch {}
  }

  return { listTvs, castAll, stopAll, tvPageUrl, streaming: () => [...streams.keys()] };
}

module.exports = { createTvBridge, postFrame };
