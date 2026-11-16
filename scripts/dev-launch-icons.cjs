'use strict';
// Electron preloads this before running the source package's own entry point.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { app, BrowserWindow, BrowserView, WebContentsView, nativeImage } = require('electron');

const hook = process.argv.indexOf('--require');
const dir = process.argv[hook + 2];
const id = path.basename(dir);
const identity = 'com.rowbose.robos.source.' + id;
const relaunch = [process.execPath, ...process.argv.slice(1, hook + 3)];
process.argv.splice(hook, 2); // Keep the original app path and user arguments.

const png = path.join(dir, 'icon.png');
const svg = path.join(dir, 'icon.svg');
const artwork = fs.existsSync(svg) ? fs.readFileSync(svg) : null;
const manifest = require(path.join(dir, 'package.json'));
const desktop = fs.readdirSync(dir).sort().find(file => file.endsWith('.desktop'));
const label = (desktop && /^Name=(.+)$/m.exec(fs.readFileSync(path.join(dir, desktop), 'utf8'))?.[1]?.trim())
  || manifest.productName || manifest.name || id;

function cacheDir() {
  const configured = process.platform === 'win32' ? process.env.LOCALAPPDATA : process.env.XDG_CACHE_HOME;
  const fallback = process.platform === 'win32' ? 'AppData/Local' : process.platform === 'darwin' ? 'Library/Caches' : '.cache';
  return path.join(path.isAbsolute(configured || '') ? configured : path.join(os.homedir(), fallback), 'robos', 'source-icons');
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, data);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const warn = error => console.warn('Source icon for ' + id + ': ' + error.message);

function desktopString(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t');
}

function desktopArgument(value) {
  return desktopString('"' + value.replace(/[\\"$\x60]/g, '\\$&').replaceAll('%', '%%') + '"');
}

if (process.platform === 'linux') {
  app.once('will-finish-launching', () => {
    // Electron's default loader has now applied package metadata. Older versions
    // use the app name for WM_CLASS and the desktop name for Wayland.
    app.setDesktopName(identity + '.desktop');
    try {
      const dataHome = process.env.XDG_DATA_HOME;
      const file = path.join(path.isAbsolute(dataHome || '') ? dataHome : path.join(os.homedir(), '.local/share'),
        'applications', identity + '.desktop');
      const icon = artwork ? svg : fs.existsSync(png) ? png : 'applications-other';
      const contents = [
        '[Desktop Entry]', 'Type=Application', 'Name=' + desktopString(label),
        'Exec=' + relaunch.map(desktopArgument).join(' '),
        'Path=' + desktopString(path.resolve(__dirname, '..')),
        'Icon=' + desktopString(icon), 'StartupWMClass=' + desktopString(app.getName()),
        'Terminal=false', 'NoDisplay=true', '',
      ].join('\n');
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) save(file, contents);
    } catch (error) { warn(error); }
  });
}

function writeIco(image) {
  // ICO stores each PNG frame behind a 16-byte directory entry.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = sizes.map(size => image.resize({ width: size, height: size }).toPNG());
  const header = Buffer.alloc(6 + 16 * sizes.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [i, size] of sizes.entries()) {
    const entry = 6 + 16 * i;
    header[entry] = header[entry + 1] = size % 256;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(pngs[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += pngs[i].length;
  }
  const file = path.join(cacheDir(), id + '-' + digest(image.toPNG()) + '.ico');
  if (!fs.existsSync(file)) save(file, Buffer.concat([header, ...pngs]));
  return file;
}

async function rasterizeSvg() {
  // Render as an image in an unattached view: no SVG scripts, no Node and no extra window.
  const view = new (WebContentsView || BrowserView)({ webPreferences: { sandbox: true, contextIsolation: true } });
  const contents = view.webContents;
  try {
    await contents.loadURL('about:blank');
    const source = 'data:image/svg+xml;base64,' + artwork.toString('base64');
    const data = await contents.executeJavaScript(
      '(async () => { const image = new Image(); image.src = ' + JSON.stringify(source) + '; await image.decode();' +
      'const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;' +
      'const scale = 512 / Math.max(image.naturalWidth, image.naturalHeight);' +
      'const w = image.naturalWidth * scale, h = image.naturalHeight * scale;' +
      'canvas.getContext("2d").drawImage(image, (512-w)/2, (512-h)/2, w, h); return canvas.toDataURL(); })()');
    return nativeImage.createFromDataURL(data);
  } finally {
    if (!contents.isDestroyed()) contents.close();
  }
}

const cachedPng = artwork && path.join(cacheDir(), id + '-' + digest(artwork) + '.png');
let image = nativeImage.createFromPath(cachedPng || png);
const needsRaster = artwork && image.isEmpty();
if (needsRaster) image = nativeImage.createFromPath(png);
let iconFile;

if (process.platform === 'win32') {
  app.setAppUserModelId(identity);
  if (!image.isEmpty()) {
    try { iconFile = writeIco(image); } catch (error) { warn(error); }
  }
}

function applyWindow(window) {
  if (window.isDestroyed()) return;
  if (process.platform === 'win32') {
    window.setAppDetails({
      appId: identity, appIconPath: iconFile,
      relaunchCommand: relaunch.map(arg => '"' + arg + '"').join(' '),
      relaunchDisplayName: label,
    });
  }
  if (!image.isEmpty()) window.setIcon(image);
}

if (process.platform !== 'darwin') app.on('browser-window-created', (_event, window) => applyWindow(window));
app.once('ready', async () => {
  if (process.platform === 'darwin' && !image.isEmpty()) app.dock.setIcon(image);
  if (!needsRaster) return;
  try {
    const rendered = await rasterizeSvg();
    if (rendered.isEmpty()) throw new Error('SVG did not produce a usable image');
    image = rendered;
    try {
      save(cachedPng, image.toPNG());
      if (process.platform === 'win32') iconFile = writeIco(image);
    } catch (error) { warn(error); }
    if (process.platform === 'darwin') app.dock.setIcon(image);
    else for (const window of BrowserWindow.getAllWindows()) applyWindow(window);
  } catch (error) { warn(error); }
});
