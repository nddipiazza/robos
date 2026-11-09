'use strict';

// Where the face is shown besides the app window:
//
//   a desktop window   on any monitor, full screen or not
//   a TV               paired in RobOS Smart TV Studio, through the shared
//                      tv-engine app cast. Browser TVs (LG webOS, Samsung Tizen,
//                      Android TV) open the face page from this computer. Roku has
//                      no browser, so a hidden window renders the page here and
//                      its frames go to the RobOS TV portal (as Party Game does).
//
// The voice keeps playing on the sound device picked under Voice; the TV shows
// the face, captions and what the eyes see.

const http = require('node:http');

const APP_ID = 'personality';
const FRAME_INTERVAL_MS = 500;

function postFrame(portalPort, tvId, jpg) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: portalPort,
      path: `/api/app-cast-frame?tv=${encodeURIComponent(tvId)}`,
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'Content-Length': jpg.length },
      timeout: 2000,
    }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end(jpg);
  });
}

function createCast({ BrowserWindow, screen: initialScreen = null, stage, tvEngine, getLanIp, getName, iconPath, log = () => {} }) {
  let screen = initialScreen;
  let faceWindow = null;
  let portalPort = 0;
  const tvStreams = new Map(); // tvId → { win, timer }
  const casting = new Map(); // tvId → { name, mode }

  function listDisplays() {
    if (!screen) return [];
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `${d.label || `Display ${i + 1}`} (${d.size.width}×${d.size.height})${d.id === primary ? ', main' : ''}`,
      primary: d.id === primary,
    }));
  }

  function openWindow({ displayId = null, fullscreen = false } = {}) {
    const display = screen && displayId != null
      ? screen.getAllDisplays().find((d) => String(d.id) === String(displayId))
      : null;
    if (!faceWindow || faceWindow.isDestroyed()) {
      const bounds = display ? display.workArea : null;
      faceWindow = new BrowserWindow({
        title: `${getName()} · RobOS Personality`,
        width: 1280,
        height: 720,
        ...(bounds ? { x: bounds.x + 40, y: bounds.y + 40 } : {}),
        backgroundColor: '#070b12',
        icon: iconPath,
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
      });
      faceWindow.setMenuBarVisibility(false);
      faceWindow.loadURL(stage.localUrl('mode=window'));
      // F11 or double-click toggles full screen; Escape leaves it.
      faceWindow.webContents.on('before-input-event', (_e, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F11') faceWindow.setFullScreen(!faceWindow.isFullScreen());
        if (input.key === 'Escape' && faceWindow.isFullScreen()) faceWindow.setFullScreen(false);
      });
      faceWindow.on('closed', () => { faceWindow = null; });
    } else if (display) {
      const b = display.workArea;
      faceWindow.setFullScreen(false);
      faceWindow.setBounds({ x: b.x + 40, y: b.y + 40, width: 1280, height: 720 });
    }
    if (fullscreen) faceWindow.setFullScreen(true);
    faceWindow.show();
    return { open: true };
  }

  function closeWindow() {
    if (faceWindow && !faceWindow.isDestroyed()) faceWindow.close();
    faceWindow = null;
    return { open: false };
  }

  function listTvs() {
    if (!tvEngine) return [];
    try {
      return (tvEngine.getOverview().tvs || []).map((t) => ({
        id: t.id,
        name: t.name,
        platformName: t.platformName,
        browser: t.platformId !== 'roku-os',
        online: t.online !== false,
        casting: casting.has(t.id),
      }));
    } catch {
      return [];
    }
  }

  function startFrames(tvId) {
    stopFrames(tvId);
    const win = new BrowserWindow({
      width: 1920,
      height: 1080,
      show: false,
      frame: false,
      backgroundColor: '#070b12',
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: `personality-roku-${tvId}` },
    });
    let latest = null;
    let fresh = false;
    win.webContents.on('paint', (_e, _dirty, image) => { latest = image; fresh = true; });
    win.webContents.setFrameRate(12);
    win.loadURL(stage.localUrl('mode=tv&capture=1'));
    win.webContents.setAudioMuted(true);
    let busy = false;
    let lastPost = 0;
    const timer = setInterval(async () => {
      if (busy || win.isDestroyed() || !latest) return;
      if (!fresh && Date.now() - lastPost < 5000) return;
      busy = true;
      fresh = false;
      try {
        const jpg = latest.toJPEG(78);
        if (jpg.length > 2000) await postFrame(portalPort, tvId, jpg);
        lastPost = Date.now();
      } catch (err) {
        log({ msg: 'frame capture failed', tvId, err: err.message });
      } finally {
        busy = false;
      }
    }, FRAME_INTERVAL_MS);
    tvStreams.set(tvId, { win, timer });
  }

  function stopFrames(tvId) {
    const s = tvStreams.get(tvId);
    if (!s) return;
    clearInterval(s.timer);
    try { if (!s.win.isDestroyed()) s.win.destroy(); } catch {}
    tvStreams.delete(tvId);
  }

  async function castToTv(tvId) {
    if (!tvEngine) throw new Error('RobOS Smart TV Studio is not installed, so there are no TVs to cast to.');
    const tv = listTvs().find((t) => t.id === tvId);
    if (!tv) throw new Error('That TV is not paired in Smart TV Studio.');
    if (!portalPort) {
      // Reuses :19210 when Smart TV Studio or another app already serves the portal.
      const portal = await tvEngine.startPortalServer();
      portalPort = (portal && portal.port) || 19210;
    }
    stage.setAllowLan(true);
    const url = stage.lanUrl(getLanIp(), 'mode=tv');
    const res = await tvEngine.castAppToTv({ tvId, appId: APP_ID, title: `${getName()} · Personality`, url });
    if (!res.ok) throw new Error(res.error || 'The TV did not take the cast.');
    if (!tv.browser) startFrames(tvId);
    casting.set(tvId, { name: tv.name, mode: tv.browser ? 'page' : 'frames' });
    return { tvId, name: tv.name, mode: tv.browser ? 'page' : 'frames', message: res.message };
  }

  function stopTv(tvId) {
    stopFrames(tvId);
    casting.delete(tvId);
    try { tvEngine?.stopAppCast({ tvId, appId: APP_ID }); } catch {}
    if (!casting.size) stage.setAllowLan(false);
    return { tvId, casting: false };
  }

  function stopAll() {
    for (const id of [...casting.keys()]) stopTv(id);
    closeWindow();
  }

  return {
    setScreen(s) { screen = s; },
    listDisplays,
    openWindow,
    closeWindow,
    windowOpen: () => Boolean(faceWindow && !faceWindow.isDestroyed()),
    listTvs,
    castToTv,
    stopTv,
    stopAll,
    async shutdown() {
      stopAll();
      if (portalPort) { try { await tvEngine?.stopPortalServer(); } catch {} }
    },
  };
}

module.exports = { createCast, APP_ID };
