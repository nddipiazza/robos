'use strict';

// scan → parse → write the kgraph; art adds generated images and rewrites it.
// parsed.json in the output folder is the record the art step and reruns read.

const fs = require('fs');
const path = require('path');
const { scan } = require('./scan');
const { decodeHtml, visibleText, tables } = require('./html');
const { readCharts } = require('./charts');
const { extractProse, consolidate, extractScreenLayout, classifyImage } = require('./extract');
const { generateArt, refitArt, planJobs } = require('./art');
const { writeKgraph } = require('./kgraph');
const { slug } = require('./slug');

const LAYOUT_ROLES = ['menu-screen', 'equip-screen', 'class-select', 'shop-screen', 'battle-screen'];
const IMAGE_ROLE_NAMES = ['class-select', 'equip-screen', 'shop-screen', 'battle-screen', 'menu-screen', 'world-map', 'area-map', 'sprite-sheet'];
const PROSE_KINDS = ['classes', 'places', 'milestones', 'equipment', 'shops', 'rules'];

function readManifest(file) {
  return file ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
}

function mergeByName(rows) {
  const seen = new Map();
  for (const row of rows) {
    const key = slug(row.name || row.title || `${row.town}-${row.kind}`);
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
}

/**
 * @param {string[]} dirs folders of collected files
 * @param {{ out: string, title: string, edition: string, manifest?: string, agent?: boolean, providerId?: string, model?: string, log?: Function, ask?: Function }} opts
 */
async function parse(dirs, opts) {
  const { out, title, edition, agent = true, providerId, model, log = () => {}, ask } = opts;
  if (!title) throw new Error('A game title is required');
  fs.mkdirSync(out, { recursive: true });
  const cacheDir = path.join(out, '.cache', 'agent');
  const sources = scan(dirs, readManifest(opts.manifest));
  const warnings = [];
  const parsed = { game: { title, edition: edition || 'unspecified' }, sources, enemies: [], spells: [], menus: [], warnings };
  for (const kind of PROSE_KINDS) parsed[kind] = [];

  for (const s of sources) if (s.note) warnings.push(`${s.name}: ${s.note}`);

  if (agent) {
    for (const s of sources.filter(x => x.kind === 'image' && x.role === 'unknown' && x.use !== false)) {
      log(`Classifying ${s.name}`);
      const role = await classifyImage({ gameTitle: title, imagePath: s.path, roles: IMAGE_ROLE_NAMES, cacheDir, providerId, model, ask });
      if (role) s.role = role;
    }
  }

  const pages = sources.filter(s => s.kind === 'page' && s.use !== false);
  for (const page of pages) {
    const html = decodeHtml(fs.readFileSync(page.path));
    const text = visibleText(html);
    const { enemies, spells } = readCharts(tables(html), text, page.name);
    parsed.enemies.push(...enemies);
    parsed.spells.push(...spells);
    log(`${page.name}: ${enemies.length} enemies and ${spells.length} spells from charts`);
    if (!agent) continue;
    const records = await extractProse({ gameTitle: title, edition, text, sourceName: page.name, cacheDir, providerId, model, ask });
    for (const kind of PROSE_KINDS) parsed[kind].push(...records[kind]);
    warnings.push(...records.warnings);
    log(`${page.name}: ${PROSE_KINDS.map(k => `${records[k].length} ${k}`).join(', ')}`);
  }
  for (const kind of PROSE_KINDS) parsed[kind] = mergeByName(parsed[kind]);
  parsed.enemies = mergeByName(parsed.enemies);

  if (agent) {
    log('Merging duplicate names');
    warnings.push(...await consolidate(parsed, { gameTitle: title, edition, cacheDir, providerId, model, ask }));
    // One layout per screen type: more screenshots of a battle add nothing to its layout.
    const done = new Set();
    for (const s of sources.filter(x => x.kind === 'image' && x.use !== false && LAYOUT_ROLES.includes(x.role))) {
      if (done.has(s.role)) continue;
      done.add(s.role);
      log(`Reading the layout of ${s.name}`);
      const res = await extractScreenLayout({ gameTitle: title, imagePath: s.path, role: s.role, cacheDir, providerId, model, ask });
      if (res.ok) parsed.menus.push({ ...res.layout, source: s.name });
      else warnings.push(`${s.name}: could not read its layout: ${res.error}`);
    }
  } else {
    warnings.push('Parsed without the agent, so classes, places, story, items, shops, rules and menu layouts are empty.');
  }

  fs.writeFileSync(path.join(out, 'parsed.json'), JSON.stringify(parsed, null, 2) + '\n');
  const result = writeKgraph(out, parsed, readArt(out));
  return { parsed, ...result };
}

function readArt(out) {
  const file = path.join(out, 'assets', 'generated', 'manifest.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { images: [] };
}

function readParsed(out) {
  const file = path.join(out, 'parsed.json');
  if (!fs.existsSync(file)) throw new Error(`${file} does not exist. Run parse first.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Generates images for a parsed game and adds them to its kgraph. */
async function art(out, opts = {}) {
  const parsed = readParsed(out);
  const result = await generateArt(parsed, out, opts);
  writeKgraph(out, parsed, result.manifest);
  return result;
}

function plan(out, opts = {}) {
  return planJobs(readParsed(out), opts);
}

module.exports = { parse, art, plan, refit: refitArt, readParsed, scan };
