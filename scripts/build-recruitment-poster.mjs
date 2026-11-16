#!/usr/bin/env node
/**
 * Build the RobOS contributor recruitment poster assets from the single source page:
 *   - site/assets/contribute/qr/*.svg                    (7 crisp single-path vector QR codes via qrencode)
 *   - site/contribute/poster/robos-recruitment-poster.pdf (1-page 8.5x11 in US Letter print-ready PDF)
 *   - site/assets/contribute/robos-recruitment-poster.png (2448x3168 ~288 DPI high-res PNG)
 *   - site/assets/contribute/robos-recruitment-poster-og.png (1200x630 Open Graph social card)
 *
 * Zero npm dependencies: uses Node 20+/22+ built-in WebSocket + qrencode + Google Chrome CDP.
 * Usage:
 *   node scripts/build-recruitment-poster.mjs [--screenshots <dir>]
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SITE_DIR = path.join(ROOT, 'site');
const QR_DIR = path.join(SITE_DIR, 'assets/contribute/qr');
const OUT_PDF = path.join(SITE_DIR, 'contribute/poster/robos-recruitment-poster.pdf');
const OUT_PNG = path.join(SITE_DIR, 'assets/contribute/robos-recruitment-poster.png');
const OUT_OG = path.join(SITE_DIR, 'assets/contribute/robos-recruitment-poster-og.png');

const QR_TARGETS = [
  { slug: 'contribute', url: 'https://rowbose.com/contribute/' },
  { slug: 'point-of-sale', url: 'https://rowbose.com/point-of-sale/' },
  { slug: 'auto-center', url: 'https://rowbose.com/auto-center/' },
  { slug: 'family-finances', url: 'https://rowbose.com/family-finances/' },
  { slug: 'games', url: 'https://rowbose.com/games/' },
  { slug: 'movie-player', url: 'https://rowbose.com/movie-player/' },
  { slug: 'elearning', url: 'https://rowbose.com/elearning/' },
];

function generateVectorQrSvg(url, { level = 'M', quietZone = 4, dark = '#181712', light = '#ffffff' } = {}) {
  const ascii = execFileSync('qrencode', ['-t', 'ASCII', '-l', level, '-m', '0', '-o', '-', url], {
    encoding: 'utf8',
  });
  const lines = ascii.split(/\r?\n/).filter((l) => l.length > 0);
  const modules = lines.length;
  const total = modules + quietZone * 2;
  const subpaths = [];

  for (let y = 0; y < modules; y++) {
    const line = lines[y];
    let x = 0;
    while (x < modules) {
      if (line.slice(x * 2, x * 2 + 2) === '##') {
        let run = 1;
        while (x + run < modules && line.slice((x + run) * 2, (x + run) * 2 + 2) === '##') {
          run++;
        }
        subpaths.push(`M${x + quietZone} ${y + quietZone}h${run}v1h-${run}z`);
        x += run;
      } else {
        x++;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${url}">`,
    `  <!-- Encodes: ${url} (ECC ${level}, ${modules}x${modules} modules, ${quietZone}-module quiet zone) -->`,
    `  <rect width="${total}" height="${total}" fill="${light}"/>`,
    `  <path fill="${dark}" d="${subpaths.join('')}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
};

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { meta, body: match[2] };
}

function renderPosterHtml() {
  const layoutRaw = fs.readFileSync(path.join(SITE_DIR, '_layouts/default.html'), 'utf8');
  const pageRaw = fs.readFileSync(path.join(SITE_DIR, 'contribute/poster/index.html'), 'utf8');
  const release = JSON.parse(fs.readFileSync(path.join(SITE_DIR, '_data/release.json'), 'utf8'));
  const { meta, body } = parseFrontMatter(pageRaw);

  const cleanLiquid = (str) =>
    str
      .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, '$1')
      .replace(/\{\{\s*"([^"]+)"\s*\|\s*relative_url\s*\}\}/g, '$1')
      .replace(/\{\{\s*site\.data\.release\.version\s*\}\}/g, release.version || '0.1.0');

  let html = layoutRaw
    .replace(/\{%\s*include\s+seo\.html\s*%\}/g, `<title>${meta.title || 'Poster'} · RobOS</title>`)
    .replace(
      /\{%-?\s*if\s+page\.extra_css\s*%\}[\s\S]*?\{%-?\s*endif\s*-?%\}/g,
      meta.extra_css ? `<link rel="stylesheet" href="${meta.extra_css}">` : ''
    )
    .replace(/\{\{\s*page\.body_class\s*\}\}/g, meta.body_class || '')
    .replace(/\{\{\s*content\s*\}\}/g, cleanLiquid(body));

  return cleanLiquid(html);
}

function renderOgCardHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@500;700&family=Inter:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f7f7f4; color: #22211a; font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  .og { width: 1200px; height: 630px; display: grid; grid-template-columns: 1fr 340px; gap: 36px; padding: 48px 56px; position: relative; border-bottom: 10px solid #f54e00; }
  .og::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 7px; background: linear-gradient(90deg, #f54e00 0%, #ff7e29 55%, #14205e 100%); }
  .left { display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand img { height: 42px; background: #f5f5f0; border: 1px solid #dfded6; border-radius: 10px; padding: 4px 8px; }
  .brand b { font-size: 28px; font-weight: 800; letter-spacing: -0.03em; }
  .pill { font: 700 13px/1 'Fira Code', monospace; text-transform: uppercase; letter-spacing: 0.08em; color: #c23d00; background: rgba(245,78,0,.09); border: 1px solid rgba(245,78,0,.35); border-radius: 999px; padding: 7px 14px; }
  h1 { font-size: 56px; font-weight: 800; line-height: 1.04; letter-spacing: -0.035em; margin: 14px 0 14px; }
  h1 em { font-style: normal; color: #f54e00; }
  p.lead { font-size: 20px; line-height: 1.42; color: #595850; margin: 0; max-width: 42ch; }
  .suites { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 18px; }
  .suites span { font: 600 14px/1 'Inter', sans-serif; background: #fcfcfa; border: 1px solid #dfded6; border-radius: 8px; padding: 8px 13px; color: #22211a; }
  .url-bar { display: inline-flex; align-items: center; gap: 14px; background: #efeee8; border: 2px solid #f54e00; border-radius: 12px; padding: 10px 18px 10px 12px; align-self: flex-start; }
  .url-bar i { font-style: normal; background: #f54e00; color: #fff; font-weight: 800; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 10px; border-radius: 7px; }
  .url-bar code { font: 700 24px/1 'Fira Code', monospace; color: #22211a; }
  .right { background: #1d1c16; color: #fff; border-radius: 20px; padding: 28px 24px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; border: 2px solid rgba(245,78,0,.6); }
  .kicker { font: 700 13px/1 'Fira Code', monospace; text-transform: uppercase; letter-spacing: 0.1em; color: #ff7e42; }
  .qr { width: 256px; height: 256px; background: #fff; border-radius: 14px; padding: 10px; display: grid; place-items: center; }
  .qr img { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
  .cap b { display: block; font: 700 18px/1.3 'Fira Code', monospace; }
  .cap span { font-size: 14px; color: #b8b6ac; }
</style>
</head>
<body>
  <div class="og">
    <div class="left">
      <div class="brand">
        <img src="/assets/logo-mark.png" alt="">
        <b>RobOS</b>
        <span class="pill">Open Call for Contributors · Apache-2.0</span>
      </div>
      <div>
        <h1>Steer coding agents.<br>Ship <em>public software.</em></h1>
        <p class="lead">Self-directed context-engineering internship across one open-source app suite and knowledge graph. Scan to join or explore 6 featured suites.</p>
        <div class="suites">
          <span>Point of Sale</span>
          <span>Auto Center</span>
          <span>Household</span>
          <span>Games</span>
          <span>Media &amp; Smart TVs</span>
          <span>eLearning</span>
        </div>
      </div>
      <div class="url-bar"><i>Main Link</i><code>rowbose.com/contribute</code></div>
    </div>
    <div class="right">
      <span class="kicker">★ Scan to Contribute</span>
      <div class="qr"><img src="/assets/contribute/qr/contribute.svg" alt=""></div>
      <div class="cap"><b>rowbose.com/contribute</b><span>Printable 8.5×11 Poster Inside</span></div>
    </div>
  </div>
</body>
</html>`;
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function startSiteServer() {
  const renderedPoster = renderPosterHtml();
  const renderedOg = renderOgCardHtml();
  const server = http.createServer((req, res) => {
    const urlPath = new URL(req.url, 'http://127.0.0.1').pathname;
    if (urlPath === '/contribute/poster/' || urlPath === '/contribute/poster/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderedPoster);
      return;
    }
    if (urlPath === '/__og') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderedOg);
      return;
    }
    const safeRel = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.(\/|\\|$))+/, '');
    let diskPath = path.join(SITE_DIR, safeRel);
    if (fs.existsSync(diskPath) && fs.statSync(diskPath).isDirectory()) {
      diskPath = path.join(diskPath, 'index.html');
    }
    if (!fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    const ext = path.extname(diskPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(diskPath));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    server.on('error', reject);
  });
}

async function launchChromeCdp() {
  const chromeBin = process.env.CHROME_BIN || '/usr/bin/google-chrome';
  const debugPort = await findFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-poster-chrome-'));
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  // Wait for /json/list endpoint
  let targetWsUrl = null;
  for (let i = 0; i < 60; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (resp.ok) {
        const pages = await resp.json();
        const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
        if (page) {
          targetWsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!targetWsUrl) {
    proc.kill('SIGKILL');
    throw new Error('Timed out waiting for Chrome DevTools WebSocket');
  }

  const ws = new WebSocket(targetWsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const close = async () => {
    try {
      ws.close();
    } catch {}
    proc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 150));
    fs.rmSync(userDataDir, { recursive: true, force: true });
  };

  return { send, close };
}

async function navigateAndReady(send, url) {
  await send('Page.enable');
  await send('Page.navigate', { url });
  // Poll until document.readyState === 'complete', fonts ready, and all images decoded
  for (let i = 0; i < 80; i++) {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => {
        if (document.readyState !== 'complete') return { ready: false };
        await document.fonts.ready;
        const imgs = Array.from(document.images);
        const allLoaded = imgs.every(img => img.complete && img.naturalWidth > 0);
        return { ready: allLoaded, totalImages: imgs.length, broken: imgs.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src) };
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const val = res?.result?.value;
    if (val?.ready) return val;
    if (i === 79) throw new Error(`Assets failed to finish loading on ${url}: ${JSON.stringify(val)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const shotsIdx = args.indexOf('--screenshots');
  const shotsDir = shotsIdx !== -1 ? path.resolve(args[shotsIdx + 1]) : null;

  // 1. Generate the 7 crisp vector QR SVGs
  fs.mkdirSync(QR_DIR, { recursive: true });
  for (const { slug, url } of QR_TARGETS) {
    const svg = generateVectorQrSvg(url, { level: 'M', quietZone: 4 });
    const outFile = path.join(QR_DIR, `${slug}.svg`);
    fs.writeFileSync(outFile, svg, 'utf8');
    console.log(`wrote QR SVG: ${path.relative(ROOT, outFile)} -> ${url}`);
  }

  // 2. Render PDF, high-res PNG, OG card (and optional web verification screenshots)
  const { server, port } = await startSiteServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const cdp = await launchChromeCdp();

  try {
    // A. Standalone 8.5x11 export (816 x 1056 CSS px)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 816,
      height: 1056,
      deviceScaleFactor: 3,
      mobile: false,
    });
    await navigateAndReady(cdp.send, `${baseUrl}/contribute/poster/`);
    const layoutMetrics = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        document.documentElement.classList.add('poster-export');
        document.documentElement.dataset.theme = 'light';
        const sheet = document.querySelector('.poster-sheet');
        const rect = sheet.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollHeight: sheet.scrollHeight,
          clientHeight: sheet.clientHeight,
          qrCount: sheet.querySelectorAll('img[src*="/assets/contribute/qr/"]').length
        };
      })()`,
      returnByValue: true,
    });
    const m = layoutMetrics.result.value;
    console.log('poster sheet metrics:', m);
    if (m.qrCount !== 7) {
      throw new Error(`Expected 7 QR codes on poster, found ${m.qrCount}`);
    }
    if (m.scrollHeight > m.clientHeight + 2) {
      throw new Error(`Poster sheet overflows vertically: scrollHeight=${m.scrollHeight} > clientHeight=${m.clientHeight}`);
    }

    // High-res PNG (2448 x 3168 px)
    const pngShot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 816, height: 1056, scale: 1 },
      captureBeyondViewport: true,
    });
    fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
    fs.writeFileSync(OUT_PNG, Buffer.from(pngShot.data, 'base64'));
    console.log(`wrote PNG: ${path.relative(ROOT, OUT_PNG)}`);

    // Print-ready 1-page US Letter PDF
    const pdfRes = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.5,
      paperHeight: 11,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      pageRanges: '1',
    });
    fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
    fs.writeFileSync(OUT_PDF, Buffer.from(pdfRes.data, 'base64'));
    console.log(`wrote PDF: ${path.relative(ROOT, OUT_PDF)}`);

    // B. Social share OG card (1200 x 630 px)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1200,
      height: 630,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await navigateAndReady(cdp.send, `${baseUrl}/__og`);
    const ogShot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 },
    });
    fs.writeFileSync(OUT_OG, Buffer.from(ogShot.data, 'base64'));
    console.log(`wrote OG card: ${path.relative(ROOT, OUT_OG)}`);

    // C. Optional web preview screenshots (light desktop, dark desktop, mobile)
    if (shotsDir) {
      fs.mkdirSync(shotsDir, { recursive: true });
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 1440,
        deviceScaleFactor: 1.5,
        mobile: false,
      });
      await navigateAndReady(cdp.send, `${baseUrl}/contribute/poster/`);
      const lightWeb = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(shotsDir, 'web-light.png'), Buffer.from(lightWeb.data, 'base64'));

      await cdp.send('Runtime.evaluate', {
        expression: `document.documentElement.dataset.theme = 'dark';`,
      });
      await new Promise((r) => setTimeout(r, 120));
      const darkWeb = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      fs.writeFileSync(path.join(shotsDir, 'web-dark.png'), Buffer.from(darkWeb.data, 'base64'));

      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 900,
        deviceScaleFactor: 2,
        mobile: true,
      });
      await cdp.send('Runtime.evaluate', {
        expression: `document.documentElement.dataset.theme = 'light';`,
      });
      await new Promise((r) => setTimeout(r, 120));
      const mobileWeb = await cdp.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shotsDir, 'web-mobile.png'), Buffer.from(mobileWeb.data, 'base64'));
      console.log(`wrote verification screenshots to ${shotsDir}`);
    }
  } finally {
    await cdp.close();
    server.close();
  }

  // 3. Verify PDF page count and Letter geometry via pdfinfo
  try {
    const info = execFileSync('pdfinfo', [OUT_PDF], { encoding: 'utf8' });
    const pagesMatch = info.match(/^Pages:\s+(\d+)/m);
    const sizeMatch = info.match(/^Page size:\s+([^\r\n]+)/m);
    console.log(`PDF verified: Pages=${pagesMatch?.[1]} | Size=${sizeMatch?.[1]}`);
    if (pagesMatch && Number(pagesMatch[1]) !== 1) {
      throw new Error(`Expected 1-page PDF, got ${pagesMatch[1]} pages`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
