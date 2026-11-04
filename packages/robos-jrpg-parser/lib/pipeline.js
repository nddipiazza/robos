'use strict';

// scan → parse → write the kgraph; art adds generated images and rewrites it.
// parsed.json in the output folder is the record the art step and reruns read.

const fs = require('fs');
const path = require('path');
const { scan } = require('./scan');
const { decodeHtml, visibleText, tables, markdownTables, markdownProse } = require('./html');
const { readCharts, crossCheckEquipment, applySpellNames, isChartTable } = require('./charts');
const { extractProse, consolidate, linkImages, mergeRecord, extractScreenLayout, classifyImage } = require('./extract');
const { generateArt, refitArt, planJobs } = require('./art');
const { writeKgraph } = require('./kgraph');
const { publish } = require('./publish');
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
    if (seen.has(key)) mergeRecord(seen.get(key), row);
    else seen.set(key, row);
  }
  return [...seen.values()];
}

/** A page's tables, and the text the agent should read: Markdown tables and shop sections are already read by code. */
function readPage(page) {
  const html = decodeHtml(fs.readFileSync(page.path));
  if (/\.md$/i.test(page.path)) {
    return { tableRows: markdownTables(html), chartText: html, proseText: markdownProse(html, /\bshops?\b/i) };
  }
  // Tables code does not read still go to the agent, with their rows as lines of text.
  const tableRows = tables(html);
  let index = 0;
  const unread = html.replace(/<table\b[\s\S]*?<\/table>/gi, block => (isChartTable(tableRows[index++] || []) ? '\n' : block));
  return { tableRows, chartText: visibleText(html), proseText: visibleText(unread, { keepTables: true }) };
}

/** Whether a page says it covers this edition, such as "NES" in "(NES USA)". */
function namesEdition(page, edition) {
  const word = String(edition || '').split(/[\s(]+/).find(Boolean);
  return !!word && new RegExp(`\\b${word}\\b`, 'i').test(page.title || '');
}

/**
 * @param {string[]} dirs folders or single files a person collected
 * @param {{ out: string, title: string, edition: string, manifest?: string, agent?: boolean, providerId?: string, model?: string, log?: Function, ask?: Function }} opts
 */
async function parse(dirs, opts) {
  const { out, title, edition, agent = true, providerId, model, log = () => {}, ask } = opts;
  if (!title) throw new Error('A game title is required');
  fs.mkdirSync(out, { recursive: true });
  const cacheDir = path.join(out, '.cache', 'agent');
  const sources = scan(dirs, readManifest(opts.manifest), { edition });
  const warnings = [];
  const parsed = { game: { title, edition: edition || 'unspecified' }, sources, enemies: [], spells: [], music: [], menus: [], encounters: [], chests: [], warnings };
  for (const kind of PROSE_KINDS) parsed[kind] = [];

  for (const s of sources) if (s.note) warnings.push(`${s.name}: ${s.note}`);

  // A page for this edition goes first, so its numbers win.
  const pages = sources.filter(s => s.kind === 'page' && s.use !== false)
    .sort((a, b) => Number(namesEdition(b, edition)) - Number(namesEdition(a, edition)));
  const exactRows = { equipment: [], shops: [], classes: [] };
  const otherEquipment = [];
  const spellNames = [];
  for (const page of pages) {
    const { tableRows, chartText, proseText } = readPage(page);
    const charts = readCharts(tableRows, chartText, page.name);
    parsed.enemies.push(...charts.enemies);
    parsed.spells.push(...charts.spells);
    parsed.music.push(...charts.music);
    if (charts.classes && charts.classes.length) exactRows.classes.push(...charts.classes);
    if (charts.encounters && charts.encounters.length) parsed.encounters.push(...charts.encounters);
    if (charts.chests && charts.chests.length) parsed.chests.push(...charts.chests);
    // Tables go first, so their numbers win when the agent finds the same thing in prose.
    (namesEdition(page, edition) ? exactRows.equipment : otherEquipment).push(...charts.equipment);
    spellNames.push(...charts.spellNames);
    exactRows.shops.push(...charts.shops);
    warnings.push(...charts.problems.map(p => `${page.name}: ${p}`));
    log(`${page.name}: charts have ${charts.enemies.length} enemies, ${charts.spells.length} spells, ${charts.equipment.length} equipment, ${charts.shops.length} shops, ${charts.music.length} music tracks`);
    if (!agent) continue;
    const records = await extractProse({ gameTitle: title, edition, text: proseText, sourceName: page.name, cacheDir, providerId, model, ask });
    for (const kind of PROSE_KINDS) parsed[kind].push(...records[kind]);
    warnings.push(...records.warnings);
    log(`${page.name}: ${PROSE_KINDS.map(k => `${records[k].length} ${k}`).join(', ')}`);
  }
  // With a source for this edition, other sources check its numbers and add no gear of their own.
  if (exactRows.equipment.length) {
    const { conflicts, unmatched } = crossCheckEquipment(exactRows.equipment, otherEquipment);
    parsed.conflicts = conflicts;
    if (conflicts.length) warnings.push(`${conflicts.length} equipment numbers disagree between sources; see "conflicts" in parsed.json.`);
    if (unmatched) warnings.push(`Left out ${unmatched} equipment rows that only pages about other editions list.`);
  } else exactRows.equipment.push(...otherEquipment);
  applySpellNames(parsed.spells, spellNames, edition);
  // Merge duplicate spells by school+name so chart spells and NES spell tables combine cleanly.
  const mergedSpells = new Map();
  for (const s of parsed.spells) {
    const key = `${slug(s.school || 'x')}-${slug(s.name)}`;
    if (mergedSpells.has(key)) mergeRecord(mergedSpells.get(key), s);
    else mergedSpells.set(key, s);
  }
  parsed.spells = [...mergedSpells.values()];
  parsed.classes = [...exactRows.classes, ...parsed.classes];
  parsed.equipment = [...exactRows.equipment, ...parsed.equipment];
  parsed.shops = [...exactRows.shops, ...parsed.shops];
  for (const kind of PROSE_KINDS) parsed[kind] = mergeByName(parsed[kind]);
  parsed.enemies = mergeByName(parsed.enemies);

  if (agent) {
    log('Merging duplicate names');
    warnings.push(...await consolidate(parsed, { gameTitle: title, edition, cacheDir, providerId, model, ask }));
    log('Matching image files to places and classes');
    warnings.push(...await linkImages(parsed, { gameTitle: title, edition, cacheDir, providerId, model, ask }));
    for (const s of sources.filter(x => x.kind === 'image' && x.role === 'unknown' && x.use !== false)) {
      log(`Classifying ${s.name}`);
      const role = await classifyImage({ gameTitle: title, imagePath: s.path, roles: IMAGE_ROLE_NAMES, cacheDir, providerId, model, ask });
      if (role) s.role = role;
    }
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

module.exports = { parse, art, plan, refit: refitArt, publish, readParsed, scan };
