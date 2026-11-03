'use strict';

// Plans and runs image generation from the parsed game: maps, dungeons, battle
// backdrops, class sprites and menu screens. Each job records which source files
// it used, and a job with no reference image is marked as invented from text.

const crypto = require('crypto');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { slug } = require('./slug');

const NESIFY = path.join(__dirname, '..', 'tools', 'nesify.py');

const TARGETS = {
  'world-map': { width: 512, height: 480, colors: 16 },
  'area-map': { width: 512, height: 480, colors: 16 },
  'battle-backdrop': { width: 256, height: 64, colors: 8, crop: true },
  'class-sprite': { width: 64, height: 64, colors: 8, key: true },
  'enemy-sprite': { width: 96, height: 96, colors: 12, key: true },
  // A menu's navy has no close NES palette entry, and small sprites inside it need the colors.
  'menu-screen': { width: 256, height: 240, colors: 16, keepColors: true },
};

const DEFAULT_KINDS = ['world-map', 'area-map', 'battle-backdrop', 'class-sprite', 'menu-screen'];

const STYLE = '8-bit NES-era pixel art with a limited palette and large visible pixels.';

function loadImageLib() {
  const candidates = [path.resolve(__dirname, '..', '..', 'robos-lib', 'ai-image'), '/usr/local/share/robos/robos-lib/ai-image'];
  for (const c of candidates) { try { return require(c); } catch {} }
  throw new Error('robos-lib/ai-image is not available');
}

function byRole(sources, ...roles) {
  return sources.filter(s => s.use !== false && s.kind === 'image' && roles.includes(s.role));
}

// The largest image of a role is the best reference when a folder holds several.
function largest(list) {
  const area = s => (s.size ? s.size.width * s.size.height : 0);
  return [...list].sort((a, b) => area(b) - area(a))[0];
}

function job(kind, id, title, prompt, references, depicts) {
  return { id: `${kind}-${slug(id)}`, kind, title, prompt, references, depicts, basis: references.length ? 'reference' : 'text-only' };
}

/** Every image the parsed game calls for. */
function planJobs(parsed, { kinds = DEFAULT_KINDS } = {}) {
  const { game, sources, places = [], classes = [], enemies = [] } = parsed;
  const title = game.title;
  const jobs = [];
  const battle = byRole(sources, 'battle-screen');
  const world = byRole(sources, 'world-map');
  const sheet = byRole(sources, 'sprite-sheet');
  const select = byRole(sources, 'class-select');

  if (world.length) {
    jobs.push(job('world-map', 'world', `${title} world map`,
      `The full world map of ${title}, seen from directly above, with no text, labels, or interface. Follow the coastlines and terrain of the reference. ${STYLE}`,
      [largest(world).name], 'game'));
  }
  for (const place of places) {
    if (!['town', 'castle', 'dungeon'].includes(place.type)) continue;
    const description = [place.description, place.evidence].filter(Boolean).join(' ');
    const refs = byRole(sources, 'area-map').filter(s => slug(s.name).includes(slug(place.name))).map(s => s.name);
    jobs.push(job('area-map', place.name, `${place.name} map`,
      `A top-down tile map of ${place.name}, a ${place.type} in ${title}, with no text or interface. What a guide says about it: ${description || 'nothing further'}. ${STYLE}`,
      refs, `place:${slug(place.name)}`));
  }
  for (const screen of battle) {
    jobs.push(job('battle-backdrop', screen.name.replace(/\.[^.]+$/, ''), `Battle backdrop from ${screen.name}`,
      `Only the scenery strip behind the fighters at the top of this battle screen, redrawn as a wide seamless strip. No characters, enemies, windows, or text. ${STYLE}`,
      [screen.name], 'game'));
  }
  for (const cls of classes) {
    jobs.push(job('class-sprite', cls.name, `${cls.name} sprite`,
      `A full-body battle sprite of the ${cls.name} class from ${title}, facing left, centered on a solid magenta background, with nothing else in the frame. ${cls.description ? `About the class: ${cls.description}. ` : ''}${STYLE}`,
      [...select, ...sheet].map(s => s.name).slice(0, 2), `class:${slug(cls.name)}`));
  }
  for (const enemy of enemies) {
    jobs.push(job('enemy-sprite', enemy.name, `${enemy.name} sprite`,
      `A battle sprite of the enemy ${enemy.name} from ${title}, facing right, centered on a solid magenta background, with nothing else in the frame. ${STYLE}`,
      sheet.map(s => s.name).slice(0, 1), `enemy:${slug(enemy.name)}`));
  }
  for (const screen of byRole(sources, 'menu-screen', 'equip-screen', 'class-select', 'shop-screen')) {
    jobs.push(job('menu-screen', screen.name.replace(/\.[^.]+$/, ''), `Menu screen from ${screen.name}`,
      `The same screen layout as the reference: the same windows in the same places, with the same kinds of text and icons. ${STYLE}`,
      [screen.name], `menu:${slug(screen.name.replace(/\.[^.]+$/, ''))}`));
  }
  return jobs.filter(j => kinds.includes(j.kind));
}

function runNesify(args) {
  const res = cp.spawnSync('python3', ['-I', NESIFY, ...args], { encoding: 'utf8' });
  if (res.error) throw new Error(`Could not run python3: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`nesify failed: ${(res.stderr || '').trim().split('\n').pop()}`);
}

function fitToGame(raw, file, kind) {
  const target = TARGETS[kind];
  runNesify([
    raw, file, '--width', target.width, '--height', target.height, '--colors', target.colors,
    ...(target.key ? ['--key'] : []), ...(target.crop ? ['--crop'] : []), ...(target.keepColors ? ['--keep-colors'] : []),
  ].map(String));
}

// A large or webp source is converted first, so the model always gets a readable PNG.
function prepareReference(source, dir) {
  const out = path.join(dir, `${slug(source.name)}.png`);
  runNesify([source.path, out, '--max', '1024']);
  return out;
}

/**
 * Runs jobs one at a time and records them in <out>/assets/generated/manifest.json.
 * A job already in the manifest is skipped, so an interrupted run can be resumed.
 */
async function generateArt(parsed, outDir, opts = {}) {
  const { kinds, only, limit, model, force = false, log = () => {}, generateImage = loadImageLib().generateImage } = opts;
  const root = path.join(outDir, 'assets', 'generated');
  const manifestFile = path.join(root, 'manifest.json');
  fs.mkdirSync(root, { recursive: true });
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { images: [] };
  const done = new Map(manifest.images.map(i => [i.id, i]));
  const sourcesByName = new Map(parsed.sources.map(s => [s.name, s]));

  const planned = planJobs(parsed, { kinds: only ? Object.keys(TARGETS) : kinds || DEFAULT_KINDS });
  const todo = only ? planned.filter(j => only.includes(j.id)) : planned.filter(j => force || !done.has(j.id));
  const jobs = limit ? todo.slice(0, limit) : todo;
  const refDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jrpg-refs-'));
  const failures = [];
  try {
    for (const [i, j] of jobs.entries()) {
      log(`[${i + 1}/${jobs.length}] ${j.title} (${j.basis})`);
      const references = j.references.map(name => prepareReference(sourcesByName.get(name), refDir));
      const raw = path.join(root, 'raw', `${j.id}.img`);
      const res = await generateImage({ prompt: j.prompt, references, outFile: raw, model });
      if (!res.ok) {
        log(`  failed: ${res.error}`);
        failures.push({ id: j.id, error: res.error });
        continue;
      }
      const rel = path.join(j.kind, `${j.id}.png`);
      const file = path.join(root, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        fitToGame(raw, file, j.kind);
      } catch (e) {
        log(`  failed: ${e.message}`);
        failures.push({ id: j.id, error: e.message });
        continue;
      }
      done.set(j.id, {
        id: j.id, kind: j.kind, title: j.title, depicts: j.depicts, basis: j.basis,
        references: j.references, model: res.model,
        promptSha256: crypto.createHash('sha256').update(j.prompt).digest('hex'),
        file: path.join('assets', 'generated', rel),
        raw: path.join('assets', 'generated', 'raw', `${j.id}.img`),
      });
      manifest.images = [...done.values()];
      fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    }
  } finally {
    fs.rmSync(refDir, { recursive: true, force: true });
  }
  manifest.images = [...done.values()];
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  return { planned: jobs.length, generated: jobs.length - failures.length, failures, manifest };
}

/** Redoes the shrink step from the stored raw images, without calling the model. */
function refitArt(outDir, { log = () => {} } = {}) {
  const manifestFile = path.join(outDir, 'assets', 'generated', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const failures = [];
  for (const image of manifest.images) {
    try {
      fitToGame(path.join(outDir, image.raw), path.join(outDir, image.file), image.kind);
    } catch (e) {
      log(`${image.id} failed: ${e.message}`);
      failures.push({ id: image.id, error: e.message });
    }
  }
  return { count: manifest.images.length, failures };
}

module.exports = { planJobs, generateArt, refitArt, TARGETS, DEFAULT_KINDS };
