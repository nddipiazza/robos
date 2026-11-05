'use strict';

// Records the course's demo clips. Nothing on screen is mocked: the embedded browser
// loads the practice site, and the terminal pane shows the real tools' real output.
// Run it through record.sh, which gives it a private virtual screen.

const { app, BrowserWindow, webContents } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const demo = path.resolve(__dirname, '..');
const repo = path.resolve(demo, '../../..');
const { build } = require(path.join(demo, 'practice-site'));
const { serve } = require(path.join(demo, 'serve'));
const { buildGame } = require(path.join(demo, 'build-game'));
const { startRecording, stopRecording } = require(path.join(repo, 'packages/robos-test/lib/recorder'));

const [workDir, outDir] = process.argv.slice(-2).map(p => path.resolve(p));
const SIZE = { w: 1280, h: 720 };
const SITE_PORT = 8765;
const GAME_PORT = 8766;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const short = text => String(text).split(workDir).join('ember-quest').replace(/ {3,}/g, '  ');

let win;
let guest;
let siteRequests = () => {};
let gameSite;

const stage = (method, ...args) => win.webContents.executeJavaScript(`stage.${method}(${args.map(a => JSON.stringify(a)).join(',')})`);
const inGuest = code => guest.executeJavaScript(code);

async function load(url, settle = 500) {
  await guest.loadURL(url);
  await sleep(settle);
}

/** Runs a real command and streams what it prints into the terminal pane. */
async function run(cmd, args, { shown, onLine } = {}) {
  await stage('typeCommand', short(shown || [cmd, ...args].join(' ')));
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: repo, env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    let partial = '';
    const feed = (chunk) => {
      partial += chunk;
      const lines = partial.split('\n');
      partial = lines.pop();
      for (const line of lines) {
        stage('print', short(line));
        if (onLine) onLine(line);
      }
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', reject);
    child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))));
  });
}

/** Moves the visible pointer and sends a real mouse click into the embedded browser. */
async function clickLink(text) {
  const box = await inGuest(`(() => {
    const a = [...document.querySelectorAll('a,button')].find(e => e.textContent.trim() === ${JSON.stringify(text)});
    const r = a.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  const origin = await stage('viewOrigin');
  await stage('cursor', origin.x + box.x, origin.y + box.y);
  await sleep(750);
  const at = { x: Math.round(box.x), y: Math.round(box.y) };
  guest.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  guest.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  await sleep(700);
}

async function parkCursor() {
  await stage('cursor', 1290, 730);
}

const markRow = (text, color, note) => inGuest(`(() => {
  const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes(${JSON.stringify(text)}));
  if (!row) throw new Error('No row with ' + ${JSON.stringify(text)});
  row.style.background = ${JSON.stringify(color)};
  row.style.outline = '2px solid #111';
  ${note ? `const td = row.lastElementChild; td.innerHTML += ' <b style="background:#111;color:#fff;padding:1px 6px">' + ${JSON.stringify(note)} + '</b>';` : ''}
  row.scrollIntoView({ block: 'center' });
})()`);

async function still(name) {
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG());
}

/** Readies the first thing on screen before recording, so a clip never opens on a blank frame. */
async function record(name, prepare, scene) {
  await stage('clear');
  await stage('side', '');
  await parkCursor();
  await prepare();
  await sleep(900);
  const file = path.join(workDir, 'clips', `${name}.webm`);
  const rec = startRecording({ geometry: { x: 0, y: 0, ...SIZE, display: process.env.DISPLAY }, outPath: file, framerate: 12, drawMouse: false });
  await sleep(1000);
  await scene();
  await sleep(600);
  await stopRecording(rec);
}

const COLLECT = 'packages/robos-jrpg-parser/demo/collect.js';
const HARVESTER = 'packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py';
const PARSER = 'packages/robos-jrpg-parser/bin/jrpg-parser.js';
const SITE = `http://127.0.0.1:${SITE_PORT}`;
const collection = path.join(workDir, 'collection');
const kgraph = path.join(workDir, 'kgraph');
const manifest = path.join(collection, 'sources-manifest.json');

async function discoverStart() {
  await stage('titles', 'Terminal: the commands your AI agent runs for you', 'What the website sees (its own log)');
  siteRequests = r => stage('sideLine', `${r.status} ${r.url}`);
  await stage('caption', 'Step 1 of 2: find what to download', 'You can look at the site in a browser. You will not download anything by hand.');
  await load(`${SITE}/`);
}

async function discoverScene() {
  const label = 'Step 1 of 2: find what to download';
  await sleep(1800);
  await stage('caption', label, 'This page lists every map. A program will read this same page.');
  await clickLink('Map atlas');
  await sleep(1800);
  await parkCursor();
  await stage('caption', label, 'The page lists two games. We only want files whose names start with EmberQuest-');
  await inGuest(`[...document.querySelectorAll('tr')].slice(1).forEach((row) => {
    const ours = row.textContent.includes('EmberQuest-');
    row.style.background = ours ? '#b9f6ca' : '#ffcdd2';
    if (!ours) row.style.opacity = '.55';
    row.lastElementChild.innerHTML += ours ? ' <b>&larr; keep</b>' : ' <b>&larr; ignore</b>';
  })`);
  await sleep(4200);
  await still('atlas-keep-and-ignore');
  await stage('caption', label, 'Your agent runs a program called the harvester. It reads the page and writes a shopping list. Nothing is downloaded yet.');
  await run('python3', [HARVESTER, '--out-dir', collection, '--vgmaps-index', `${SITE}/atlas/`, '--base-url', `${SITE}/atlas/`, '--map-prefix', 'EmberQuest-', '--discover-only'],
    { shown: `python3 harvest_jrpg_assets.py --out-dir ${collection} --vgmaps-index ${SITE}/atlas/ --map-prefix EmberQuest- --discover-only` });
  await sleep(1800);
  await stage('caption', label, 'Here is the list. Three Ember Quest maps, and nothing from the other game.');
  await run('python3', ['-c', `import json;[print(m['file']) for m in json.load(open(${JSON.stringify(manifest)}))['maps']]`], { shown: '# show the files on the list (sources-manifest.json)' });
  await sleep(1500);
  await still('harvester-shopping-list');
  await sleep(2500);
}

const showFolder = () => {
  const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
  const files = walk(collection).filter(f => !f.endsWith('.json'));
  return stage('side', files.length ? files.join('\n') : '(empty)');
};

async function downloadStart() {
  await stage('titles', 'Terminal: the commands your AI agent runs for you', 'The collection folder on our disk');
  await showFolder();
  await stage('caption', 'Step 2 of 2: download everything on the list', 'The folder on your computer starts empty. Next, a small helper program adds the guide pages to the list.');
  await load(`${SITE}/guide/weapons.html`);
}

async function downloadScene() {
  const label = 'Step 2 of 2: download everything on the list';
  await sleep(2400);
  await run('node', [COLLECT, collection, SITE], { shown: `node collect.js ${collection} ${SITE}` });
  await sleep(1800);
  await stage('caption', label, 'Now the harvester downloads everything on the list, one file at a time, pausing between each.');
  siteRequests = () => {};
  const follow = {
    'EmberQuest-World.png': `${SITE}/atlas/EmberQuest-World.png`,
    'EmberQuest-AshfordTown.png': `${SITE}/atlas/EmberQuest-AshfordTown.png`,
    'EmberQuest-EmberfallCave.png': `${SITE}/atlas/EmberQuest-EmberfallCave.png`,
    'guide/bestiary.html': `${SITE}/guide/bestiary.html`,
    'guide/magic.html': `${SITE}/guide/magic.html`,
    'guide/walkthrough.html': `${SITE}/guide/walkthrough.html`,
  };
  await run('python3', [HARVESTER, '--out-dir', collection, '--manifest', manifest, '--delay', '1'], {
    shown: `python3 harvest_jrpg_assets.py --out-dir ${collection} --manifest sources-manifest.json --delay 1`,
    onLine: (line) => {
      showFolder();
      const hit = Object.keys(follow).find(f => line.includes(` ${f} `));
      if (hit) guest.loadURL(follow[hit]).catch(() => {});
    },
  });
  await showFolder();
  await still('download-finished');
  await stage('caption', label, 'Done: 10 files, each with a fingerprint (sha256) in a receipt, so we can prove what we collected.');
  await sleep(5000);
}

async function parseStart() {
  await stage('titles', 'Terminal: the commands your AI agent runs for you', 'What the parser noticed');
  await stage('caption', 'Turning the pile of files into facts', 'The guide says an Iron Sword costs 40 gold. Remember that number.');
  await load(`${SITE}/guide/weapons.html`);
  await markRow('Iron Sword', '#fff59d', '40 gold');
}

async function parseScene() {
  const label = 'Turning the pile of files into facts';
  const parsedFile = path.join(kgraph, 'parsed.json');
  await sleep(2800);
  await stage('caption', label, 'Your agent runs the parser. First it sorts the files. The remake page is set aside: its prices belong to a different game.');
  await run('node', [PARSER, 'scan', collection], { shown: `node jrpg-parser.js scan ${collection}` });
  await load(`${SITE}/guide/anniversary-prices.html`, 400);
  await markRow('Iron Sword', '#ffcdd2', 'skipped');
  await sleep(4200);
  await still('scan-sets-remake-aside');
  await stage('clear');
  await stage('caption', label, 'Then it reads every table into structured facts, and compares sources while it goes.');
  await run('node', [PARSER, 'parse', collection, '--out', kgraph, '--title', 'Ember Quest', '--edition', 'Retro (1989)', '--no-agent'], { shown: `node jrpg-parser.js parse ${collection} --out ${kgraph} --title "Ember Quest" --no-agent` });
  const parsed = JSON.parse(fs.readFileSync(parsedFile, 'utf8'));
  await stage('side', parsed.conflicts.join('\n'));
  await load(`${SITE}/guide/shopkeeper-notes.html`, 400);
  await markRow('Iron Sword', '#ffe0b2', 'says 45!');
  await stage('caption', label, 'A second page says 45. The parser keeps 40 from the main guide and flags the disagreement for a human.');
  await sleep(5000);
  await still('parser-flags-conflict');
  await stage('clear');
  await stage('caption', label, 'The Iron Sword is now a fact a program can use, and it remembers which page it came from.');
  await run('python3', ['-c', `import json;e=[x for x in json.load(open(${JSON.stringify(parsedFile)}))['equipment'] if x['name']=='Iron Sword'][0];print(json.dumps({k:e[k] for k in ['name','kind','damage','price','source']},indent=2))`], { shown: '# show the Iron Sword in parsed.json' });
  await sleep(5500);
  await still('iron-sword-as-data');
}

async function playStart() {
  buildGame(collection, path.join(kgraph, 'parsed.json'), path.join(workDir, 'game'));
  gameSite = await serve(path.join(workDir, 'game'), { port: GAME_PORT });
  await stage('wide', true);
  await stage('titles', 'The game\'s live state, read while it runs', 'The numbers came from the guide');
  await stage('side', `Iron Sword price 40: guide/weapons.html\nMossling HP 12: guide/bestiary.html\nCinder Wyrm HP 40: guide/bestiary.html`);
  await stage('caption', 'The automated playthrough', 'You click one button. A robot inside the page presses the keys and checks each sentence in its script.');
  await load(`http://127.0.0.1:${GAME_PORT}/?pace=190`, 800);
}

async function playScene() {
  await sleep(2800);
  await clickLink('Let the robot play');
  await parkCursor();
  await stage('clear');
  const poll = setInterval(async () => {
    const s = await inGuest('JSON.stringify({ map: __game.state.map, x: __game.state.x, y: __game.state.y, gold: __game.state.gold, hp: __game.state.hp, weapon: __game.state.weapon && __game.state.weapon.name, carrying: __game.state.inventory, screen: __game.state.mode, beaten: __game.state.defeated }, null, 1)').catch(() => null);
    if (s) { await stage('clear'); await stage('print', s); }
  }, 250);
  let shopShot = false;
  let battleShot = false;
  while (!(await inGuest('window.__robotDone === true'))) {
    const mode = await inGuest('__game.state.mode');
    if (mode === 'shop' && !shopShot) { shopShot = true; await still('robot-in-the-shop'); }
    if (mode === 'battle' && (await inGuest('__game.state.battle && __game.state.battle.boss')) && !battleShot) { battleShot = true; await still('robot-fights-the-boss'); }
    await sleep(120);
  }
  clearInterval(poll);
  const results = await inGuest('window.__robotResults');
  if (results.some(r => r.status !== 'passed')) throw new Error(`The robot failed: ${JSON.stringify(results.filter(r => r.status !== 'passed'))}`);
  await sleep(300);
  await stage('caption', 'The automated playthrough', `All ${results.length} sentences checked out. The robot bought the sword, opened the chest and beat the boss.`);
  await sleep(5500);
  await still('robot-wins');
  await load(`http://127.0.0.1:${GAME_PORT}/?spawn=10,8`, 800);
  const start = await inGuest('JSON.stringify({ map: __game.state.map, x: __game.state.x, y: __game.state.y, gold: __game.state.gold, hp: __game.state.hp, screen: __game.state.mode, standingOn: __game.tileAt(__game.state.map, __game.state.x, __game.state.y).kind }, null, 1)');
  await stage('clear');
  await stage('print', start);
  await stage('titles', 'The game\'s live state, read while it runs', 'The check that still passes');
  await stage('side', 'Then the current map is Ashford Town   \u2713');
  await stage('caption', 'Why a person still watches', 'The map name is right, so a simple check passes. But look: the hero is standing inside a tree.');
  await sleep(600);
  await still('hero-in-a-tree');
  await sleep(5000);
  gameSite.server.close();
  await stage('wide', false);
}

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.mkdirSync(workDir, { recursive: true });
    build(path.join(workDir, 'site'));
    await serve(path.join(workDir, 'site'), { port: SITE_PORT, onRequest: r => siteRequests(r) });
    win = new BrowserWindow({ x: 0, y: 0, width: SIZE.w, height: SIZE.h, frame: false, show: true, webPreferences: { webviewTag: true, contextIsolation: false, nodeIntegration: false } });
    await win.loadFile(path.join(__dirname, 'stage.html'));
    await sleep(500);
    guest = webContents.fromId(await stage('guestReady'));
    await record('scrape-discover', discoverStart, discoverScene);
    await record('scrape-download', downloadStart, downloadScene);
    await record('parse', parseStart, parseScene);
    await record('playthrough', playStart, playScene);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
