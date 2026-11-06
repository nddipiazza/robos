'use strict';
// Renders packages/<app>/icon.png (256×256, transparent) from icon.svg for every desktop app
// that has no PNG yet. Windows shortcuts and taskbar icons need a raster icon: App Manager
// turns icon.png into icon.ico when it installs an app (packages/app-manager/lib/win-icon.cjs).
// Run with Electron:
//   packages/app-manager/node_modules/electron/dist/electron scripts/app-manager/render-icons.cjs [--force]
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const repo = path.resolve(__dirname, '../..');
const SIZE = 256;
const force = process.argv.includes('--force');

function apps() {
  return fs.readdirSync(path.join(repo, 'packages')).filter(id => {
    const dir = path.join(repo, 'packages', id);
    const main = path.join(dir, 'main.js');
    return fs.existsSync(path.join(dir, 'icon.svg')) && (force || !fs.existsSync(path.join(dir, 'icon.png'))) &&
      fs.existsSync(main) && /require\(['"]electron['"]\)/.test(fs.readFileSync(main, 'utf8'));
  });
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: SIZE, height: SIZE, frame: false, transparent: true, backgroundColor: '#00000000',
    useContentSize: true, webPreferences: { offscreen: true } });
  const rendered = [];
  for (const id of apps()) {
    const svg = fs.readFileSync(path.join(repo, 'packages', id, 'icon.svg'), 'utf8');
    const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="display:block;width:${SIZE}px;height:${SIZE}px"></body></html>`;
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await new Promise(r => setTimeout(r, 150));
    const image = (await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })).resize({ width: SIZE, height: SIZE, quality: 'best' });
    fs.writeFileSync(path.join(repo, 'packages', id, 'icon.png'), image.toPNG());
    rendered.push(id);
  }
  console.log(`Rendered ${rendered.length} icon(s)${rendered.length ? `: ${rendered.join(', ')}` : ''}`);
  app.quit();
}).catch(err => { console.error(err); app.exit(1); });
