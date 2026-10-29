'use strict';

// Final Fantasy (NES, USA, 1990), acquired from fan resources:
//   - Final Fantasy Wiki (Fandom) through its MediaWiki API: enemies with NES
//     stats and sprites, jobs, equipment, items, magic, shops, statuses,
//     elements, stats and formations, menus, locations, walkthrough
//   - VGMaps.com NES atlas: world map and every town, castle and dungeon map
//   - Older fan shrines (RPGamer, GameFAQs) are recorded and cited; they refuse
//     automated clients, so they are read through the Internet Archive or left
//     for a person to check.
// Only what exists in the NES release is kept; remake-only content is skipped.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const wt = require('../wikitext');
const { MediaWikiConnector } = require('../connectors/mediawiki');
const { VGMapsConnector, imageSize } = require('../connectors/vgmaps');
const { WaybackConnector } = require('../connectors/wayback');
const { RPGamerConnector } = require('../connectors/rpgamer');
const { slug } = require('../kgraph-writer');
const { sourceNode } = require('./dragon-warrior-usa');
const DATA = require('./final-fantasy-usa.data');
const NES_PLACE_PAGES = new Set(DATA.LOCATIONS.map(l => l.page));

const GAME_SLUG = 'final-fantasy';
const FANDOM_API = 'https://finalfantasy.fandom.com/api.php';
const id = (kind, key) => `urn:robos:jrpg:${GAME_SLUG}:${kind}:${slug(key)}`;
const ref = (kind, key) => ({ '@id': id(kind, key) });

const SOURCES = [
  { key: 'ffwiki', title: 'Final Fantasy Wiki (Fandom) — Final Fantasy', url: 'https://finalfantasy.fandom.com/wiki/Final_Fantasy', kind: 'mediawiki', license: 'Text CC BY-SA 3.0; game images © Square Enix', assetTypes: ['places', 'character-sprites', 'npcs', 'enemies', 'bosses', 'formations', 'weapons', 'armor', 'items', 'spells', 'shops', 'menus', 'rule-engine', 'story', 'music'] },
  { key: 'ffwiki-walkthrough', title: 'Final Fantasy Wiki walkthrough by Apoqliphoth (parts 1-14)', url: 'https://finalfantasy.fandom.com/wiki/Walkthrough:Final_Fantasy/Apoqliphoth', kind: 'walkthrough', license: 'CC BY-SA 3.0', assetTypes: ['story'] },
  { key: 'strategywiki', title: 'StrategyWiki — Final Fantasy gameplay', url: 'https://strategywiki.org/wiki/Final_Fantasy/Gameplay', kind: 'mediawiki', license: 'CC BY-SA 3.0', assetTypes: ['rule-engine'] },
  { key: 'rpgclassics', title: "RPGClassics Final Fantasy shrine", url: 'https://shrines.rpgclassics.com/nes/ff1/', kind: 'fan-site', license: 'Cited, not copied', assetTypes: ['area-maps', 'enemies', 'shops'], status: 'cited' },
  { key: 'datacrystal', title: 'Data Crystal — Final Fantasy ROM map', url: 'https://datacrystal.tcrf.net/wiki/Final_Fantasy', kind: 'rom-map', license: 'Cited, not copied', assetTypes: ['rule-engine', 'formations'], status: 'manual' },
  { key: 'vgmaps', title: 'VGMaps.com NES atlas — Final Fantasy maps', url: 'https://www.vgmaps.com/Atlas/NES/index.htm#F', kind: 'map-atlas', license: 'Fan-made maps; credit VGMaps.com, not re-hosted', assetTypes: ['world-map', 'area-maps'] },
  { key: 'rpgamer', title: 'RPGamer archive — Final Fantasy fan music (MIDI, MOD, S3M)', url: 'https://archive.rpgamer.com/games/ff/ff1/ff1mid.html', kind: 'fan-site', license: 'Fan arrangements; linked with arranger credit, not re-hosted', assetTypes: ['music'], probe: true },
  { key: 'gamefaqs', title: 'GameFAQs — Final Fantasy (NES) FAQs and walkthroughs', url: 'https://gamefaqs.gamespot.com/nes/522595-final-fantasy/faqs', kind: 'faq', license: 'Cited, not copied', assetTypes: ['story', 'rule-engine'], status: 'manual' },
  { key: 'spriters-resource', title: "The Spriters Resource — Final Fantasy (NES)", url: 'https://www.spriters-resource.com/nes/ff/', kind: 'sprite-archive', license: 'Ripped sprites; credit rippers, not re-hosted', assetTypes: ['character-sprites', 'enemies'], status: 'manual' },
];

const FFWIKI_CREDIT = 'Final Fantasy Wiki (Fandom)';
const SPRITE_LICENSE = 'Game art © Square Enix; linked from Final Fantasy Wiki, not re-hosted';

function nesAlias(raw) {
  const a = String(raw || '').match(/\{\{A\|([^}|]+)\}\}/i);
  if (a) return a[1].trim();
  const n = String(raw || '').match(/NES:\s*([^;<\n/]+)/);
  if (n) return wt.stripMarkup(n[1]).trim();
  const p = wt.stripMarkup(raw).match(/\(([A-Z][A-Za-z0-9.' -]{1,12})\)\s*$/);
  return p ? p[1] : '';
}

function firstLinkTarget(raw) {
  const la = String(raw || '').match(/\{\{LA\|([^}|]+)(?:\|([^}]*))?\}\}/i) || String(raw || '').match(/\{\{A\|([^}|]+)\|([^}]*)\}\}/);
  if (la) return { target: la[1].trim(), label: (la[2] || cleanTitle(la[1])).trim() };
  const l = wt.extractLinks(raw)[0];
  return l || { target: wt.stripMarkup(raw), label: wt.stripMarkup(raw) };
}

function cleanTitle(page) {
  return String(page).replace(/\s*\((Final Fantasy|Final Fantasy boss|Final Fantasy enemy)\)$/i, '').trim();
}

function num(v) {
  const s = wt.stripMarkup(v).replace(/,/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

// Group the rows of a record table: a row-spanning name cell followed by
// description rows (one wide cell each).
function recordRows(table) {
  const out = [];
  let cur = null;
  for (const row of table.rows) {
    if (!row || !row[0]) continue;
    if (cur && row[0] === cur.name) {
      const desc = row.find((c, i) => i > 0 && c && c.text);
      if (desc && !cur.extra.includes(desc.text)) cur.extra.push(desc.text);
      continue;
    }
    cur = { name: row[0], cells: row, extra: [] };
    out.push(cur);
  }
  return out;
}

// True when an item can be bought, found or given somewhere in the NES game.
// Drops do not count: NES enemies never drop items, the remakes added drops.
function nesAcquirable(raw, nesPlacePages) {
  for (const seg of String(raw || '').split(/<br\s*\/?>/i)) {
    if (/'''\s*Drop/i.test(seg) || /^\s*Drop/i.test(wt.stripMarkup(seg))) continue;
    if (wt.extractLinks(seg).some(l => nesPlacePages.has(l.target))) return true;
  }
  return false;
}

function onlyRemakePlaces(text) {
  const t = wt.stripMarkup(text);
  if (!t) return false;
  const named = DATA.REMAKE_ONLY_PLACES.filter(p => t.includes(p));
  if (!named.length) return false;
  // Remove remake place names and see whether anything location-like remains.
  let rest = t;
  for (const p of DATA.REMAKE_ONLY_PLACES) rest = rest.split(p).join('');
  rest = rest.replace(/\b(Buy|Find|Drop|Steal|Prize|Gift|Trade)\b:?/g, '').replace(/\(x\d+\)|\([^)]*\)|[,.:;\/]|\s+/g, '');
  return rest.length === 0;
}

module.exports = {
  id: 'final-fantasy-usa',
  title: 'Final Fantasy',
  platform: 'NES',
  region: 'USA',
  year: 1990,
  description: 'Final Fantasy (NES, USA): four Light Warriors, four Fiends, four crystals and a 2000-year time loop. Acquired from the Final Fantasy Wiki, VGMaps and fan walkthroughs.',
  sources: SOURCES,

  async acquire(ctx) {
    const log = ctx.log || (() => {});
    const warnings = [];
    const wiki = new MediaWikiConnector({ apiUrl: FANDOM_API, http: ctx.http, siteName: FFWIKI_CREDIT });
    const vgmaps = new VGMapsConnector({ http: ctx.http, console: 'NES' });
    const wayback = new WaybackConnector({ http: ctx.http });
    const nodes = [];
    const byId = new Map();
    const add = n => { if (byId.has(n['@id'])) { Object.assign(byId.get(n['@id']), n); return byId.get(n['@id']); } nodes.push(n); byId.set(n['@id'], n); return n; };
    const src = (...keys) => keys.map(k => ({ '@id': id('source', k) }));
    const cite = (title) => ({ 'schema:url': wiki.pageUrl(title), 'dcterms:title': title });
    const pendingImages = []; // { node, file, caption, variant }
    const wantImage = (node, file, caption, variant) => { if (file) pendingImages.push({ node, file: file.trim(), caption, variant }); };

    // ── Index pages ───────────────────────────────────────────────────────
    log('Final Fantasy Wiki: reading index pages');
    const indexTitles = ['Final Fantasy', 'Final Fantasy enemies', 'Final Fantasy jobs', 'Final Fantasy locations', 'Final Fantasy weapons', 'Final Fantasy armor', 'Final Fantasy items', 'Magic (Final Fantasy)', 'Final Fantasy shops', 'Final Fantasy stats', 'Final Fantasy statuses', 'Final Fantasy elements', 'Final Fantasy enemy formations', 'Menu (Final Fantasy)', 'Final Fantasy characters', 'Original soundtracks of Final Fantasy I & II'];
    const pages = await wiki.pages(indexTitles);
    const text = t => { const p = pages.get(t); if (!p || p.missing) { warnings.push(`Missing wiki page: ${t}`); return ''; } return p.wikitext; };

    // ── Enemies & bosses ──────────────────────────────────────────────────
    const enemyIndex = text('Final Fantasy enemies');
    const enemyPages = new Map(); // page → { boss }
    for (const sec of wt.sections(enemyIndex)) {
      for (const g of wt.extractFiles(sec.body)) {
        const cap = g.rawCaption || '';
        if (!cap || /^\s*''/.test(cap)) continue; // italics: remake-only enemies
        const link = wt.extractLinks(cap)[0];
        if (!link) continue;
        enemyPages.set(link.target, { boss: sec.title === 'Bosses', listedNes: (cap.match(/<br\s*\/?>\s*([^<]+?)\s*\(NES\)/i) || [])[1] || '' });
      }
    }
    log(`Final Fantasy Wiki: ${enemyPages.size} NES enemies listed; reading their pages`);
    const enemyText = await wiki.pages([...enemyPages.keys()]);
    const STAT_KEYS = ['hp', 'attack', 'defense', 'magic defense', 'agility', 'accuracy', 'evasion', 'exp', 'gil', 'hits', 'crit', 'morale', 'intellect', 'intelligence', 'luck'];
    const ELEMENT_KEYS = ['fire', 'ice', 'lightning', 'earth', 'death', 'poison', 'time', 'status', 'dia', 'spirit'];
    const enemyByPage = new Map();
    for (const [page, meta] of enemyPages) {
      const entry = enemyText.get(page);
      if (!entry || entry.missing) { warnings.push(`Enemy page missing: ${page}`); continue; }
      const info = wt.parseTemplates(entry.wikitext, 'infobox enemy')[0] || { params: {} };
      const statsTpl = wt.parseTemplates(entry.wikitext, 'infobox enemy stats ffi')[0] || { params: {} };
      const p = statsTpl.params;
      // Bosses fought twice keep each fight's stats under "1 hp", "2 hp", ...
      const forms = [...new Set(Object.keys(p).map(k => (k.match(/^(\d+) /) || [])[1]).filter(Boolean))].sort();
      const pickIn = (form, k) => {
        const pre = form ? `${form} ` : '';
        const nes = p[`${pre}nes ${k}`];
        return nes !== undefined && nes !== '' ? nes : p[`${pre}${k}`];
      };
      const statsFor = form => {
        const out = {};
        for (const k of STAT_KEYS) { const v = pickIn(form, k); if (v !== undefined && wt.stripMarkup(v) !== '') out[k] = num(v); }
        return out;
      };
      const pick = k => pickIn(forms[0] || '', k);
      const stats = statsFor(forms[0] || '');
      const extraForms = forms.slice(1).map(f => ({ 'jrpg:form': Number(f), 'jrpg:location': wt.stripMarkup(pickIn(f, 'location') || ''), 'jrpg:stats': statsFor(f) })).filter(f => Object.keys(f['jrpg:stats']).length);
      const elements = {};
      for (const k of ELEMENT_KEYS) { const v = pick(k); const t = wt.stripMarkup(v); if (t && t !== '-') elements[k] = t; }
      const files = wt.extractFiles(info.params.image || '');
      const nesFile = files.find(f => /^NES$/i.test(f.caption)) || files.find(f => /NES/i.test(f.file));
      const prFile = files.find(f => /^PR$/i.test(f.caption));
      const isBoss = meta.boss || /boss/i.test(info.params.type || '') || /boss/i.test(page);
      const title = wt.stripMarkup(info.params.name) || cleanTitle(page);
      const nesName = (wt.stripMarkup(meta.listedNes || p.nes || p[`${forms[0]} nes`] || '').split('/')[0] || wt.stripMarkup(info.params.aka || '').split(/[,/]/)[0]).trim();
      const node = add({
        '@id': id('enemy', cleanTitle(page)),
        '@type': [isBoss ? 'jrpg:Boss' : 'jrpg:Enemy'],
        'dcterms:title': title,
        'robos:package': 'bestiary',
        ...(nesName ? { 'jrpg:nesName': nesName } : {}),
        ...(info.params.japanese ? { 'jrpg:japaneseName': wt.stripMarkup(info.params.japanese) } : {}),
        ...(wt.stripMarkup(p.type || info.params.type) ? { 'jrpg:family': wt.stripMarkup(p.type || info.params.type).replace(/\s*\(pre-.*$/, '') } : {}),
        'jrpg:stats': stats,
        ...(extraForms.length ? { 'jrpg:otherForms': extraForms } : {}),
        ...(Object.keys(elements).length ? { 'jrpg:elements': elements } : {}),
        ...(wt.stripMarkup(pick('abilities')) && wt.stripMarkup(pick('abilities')) !== 'None' ? { 'jrpg:abilities': wt.stripMarkup(pick('abilities')) } : {}),
        'jrpg:locations': wt.stripMarkup(pick('location') || info.params.location || ''),
        'dcterms:description': firstParagraph(entry.wikitext),
        'jrpg:wikiPage': cite(entry.title),
        'jrpg:sources': src('ffwiki'),
      });
      wantImage(node, nesFile?.file, `${nesName || title} NES battle sprite`, 'nes');
      if (!nesFile) wantImage(node, prFile?.file, `${title} Pixel Remaster sprite`, 'pixel-remaster');
      enemyByPage.set(page, node);
      enemyByPage.set(cleanTitle(page), node);
    }

    // ── Encounter formations (NES/original releases table) ───────────────
    const formText = wt.sectionTree(text('Final Fantasy enemy formations'), 'Original releases');
    const formMain = formText.split(/====\s*Soul of Chaos/)[0];
    let formCount = 0;
    for (const table of wt.parseTables(formMain)) {
      const groups = new Map();
      for (const row of table.rows) {
        if (!row[0] || !row[1]) continue;
        const number = row[0].text;
        if (!/^\d+$/.test(number)) continue;
        if (!groups.has(number)) groups.set(number, { row, places: [] });
        const where = row[6]?.text; const rate = row[7]?.text;
        if (where) groups.get(number).places.push({ 'jrpg:where': where, 'jrpg:ratePer64': num(rate || '') });
      }
      for (const [number, g] of groups) {
        const r = g.row;
        const members = wt.extractLinks(r[1].raw).map(l => enemyByPage.get(l.target)).filter(Boolean).map(n => ({ '@id': n['@id'] }));
        if (g.places.every(pl => DATA.REMAKE_ONLY_PLACES.some(rp => pl['jrpg:where'].includes(rp)))) continue;
        add({
          '@id': id('formation', number), '@type': ['jrpg:EncounterFormation'], 'dcterms:title': `Formation ${number}: ${r[1].text}`, 'robos:package': 'bestiary',
          'jrpg:formationNumber': Number(number), 'jrpg:enemies': r[1].text, 'jrpg:members': members, 'jrpg:maximum': r[2]?.text || '',
          'jrpg:canFlee': /yes/i.test(r[3]?.text || ''), 'jrpg:ambushPercent': num(r[4]?.text || ''), 'jrpg:appears': g.places,
          'jrpg:sources': src('ffwiki'),
        });
        formCount++;
      }
    }
    log(`Formations: ${formCount}`);

    // ── Playable classes ──────────────────────────────────────────────────
    const jobs = [
      ['Warrior (Final Fantasy)', 'Fighter', 'Knight'], ['Thief (Final Fantasy)', 'Thief', 'Ninja'], ['Monk (Final Fantasy)', 'Black Belt', 'Master'],
      ['Red Mage (Final Fantasy)', 'Red Mage', 'Red Wizard'], ['White Mage (Final Fantasy)', 'White Mage', 'White Wizard'], ['Black Mage (Final Fantasy)', 'Black Mage', 'Black Wizard'],
    ];
    const jobPages = await wiki.pages(jobs.map(j => j[0]));
    const initial = statColumns(wt.parseTables(wt.sectionTree(text('Final Fantasy stats'), 'Initial stats'))[0]);
    const growthTable = wt.parseTables(wt.sectionTree(text('Final Fantasy stats'), 'Guaranteed stat growth'))[0];
    for (const [page, nesName, upgrade] of jobs) {
      const entry = jobPages.get(page);
      if (!entry || entry.missing) { warnings.push(`Job page missing: ${page}`); continue; }
      const info = wt.parseTemplates(entry.wikitext, 'infobox job')[0] || { params: {} };
      const sprite = info.params.sprite || '';
      // The upgrade's sprites follow a ";Knight" or "'''Ninja'''" line.
      const cut = sprite.search(new RegExp(`(^|\\n)\\s*(;|''')\\s*${upgrade}`));
      const [baseSprites, upSprites] = cut > 0 ? [sprite.slice(0, cut), sprite.slice(cut)] : [sprite, ''];
      const base = cleanTitle(page);
      // The stats table abbreviates mages ("W. Mage").
      const short = (base.endsWith('Mage') ? base[0] + 'mage' : base).toLowerCase();
      const statKey = Object.keys(initial).find(k => k.replace(/[.\s]/g, '').toLowerCase() === short);
      const baseNode = add({
        '@id': id('class', base), '@type': ['jrpg:PlayableClass'], 'dcterms:title': base, 'robos:package': 'characters', 'jrpg:nesName': nesName,
        'dcterms:description': firstParagraph(entry.wikitext), 'jrpg:weapons': wt.stripMarkup(info.params.weapons || ''), 'jrpg:armor': wt.stripMarkup(info.params.armor || ''),
        ...(statKey ? { 'jrpg:initialStats': initial[statKey] } : {}), 'jrpg:upgradesTo': ref('class', upgrade),
        'jrpg:wikiPage': cite(entry.title), 'jrpg:sources': src('ffwiki'),
      });
      const upNode = add({
        '@id': id('class', upgrade), '@type': ['jrpg:PlayableClass'], 'dcterms:title': upgrade, 'robos:package': 'characters', 'jrpg:nesName': upgrade,
        'dcterms:description': `Class change of the ${nesName}, granted by Bahamut for the Rat's Tail.`, 'jrpg:upgradeOf': ref('class', base),
        'jrpg:wikiPage': cite(`${entry.title}#${upgrade}`), 'jrpg:sources': src('ffwiki'),
      });
      for (const [node, part] of [[baseNode, baseSprites], [upNode, upSprites]]) {
        const files = wt.extractFiles(part || '');
        const battle = files.find(f => /^NES\.?$/i.test(f.caption)) || files.find(f => /nes/i.test(f.file) && !/map/i.test(f.file));
        const map = files.find(f => /Map sprite \(NES\)/i.test(f.caption));
        wantImage(node, battle?.file, `${node['dcterms:title']} NES battle sprite`, 'nes-battle');
        wantImage(node, map?.file, `${node['dcterms:title']} NES map sprite`, 'nes-map');
      }
    }
    if (growthTable) {
      add({
        '@id': id('rule', 'guaranteed-stat-growth'), '@type': ['jrpg:ProgressionTable'], 'dcterms:title': 'Guaranteed stat growth by class level', 'robos:package': 'rules',
        'dcterms:description': 'Stats each class is guaranteed to gain at each level; other stats have a chance to grow. HP/MP marks a greater boost.',
        'jrpg:columns': growthTable.headers, 'jrpg:rows': growthTable.rows.map(r => r.map(c => c?.text || '')),
        'jrpg:wikiPage': cite('Final Fantasy stats'), 'jrpg:sources': src('ffwiki'),
      });
    }

    // ── Weapons & armor ───────────────────────────────────────────────────
    const equipment = (pageTitle, type) => {
      const page = text(pageTitle);
      let count = 0;
      for (const sec of wt.sections(page)) {
        if (sec.level !== 2 && sec.level !== 3) continue;
        for (const table of wt.parseTables(sec.body)) {
          const h = table.headers.map(x => x.toLowerCase());
          const col = name => h.findIndex(x => x.startsWith(name));
          if (col('name') !== 0 || (col('atk') === -1 && col('defense') === -1)) continue;
          for (const rec of recordRows(table)) {
            const c = rec.cells;
            const link = firstLinkTarget(rec.name.raw);
            const nesImg = col('nes image') >= 0 ? wt.extractFiles(c[col('nes image')]?.raw || '')[0] : null;
            const acq = c[col('acqui')]?.raw || '';
            const alias = nesAlias(rec.name.raw);
            const isDefault = /default/i.test(wt.stripMarkup(acq));
            if (!nesImg && !isDefault && !nesAcquirable(acq, NES_PLACE_PAGES)) continue;
            const cost = c[col('cost')]?.text || '';
            const normal = (cost.match(/([\d,]+)\s*(?:gil)?\s*\(Normal\)/i) || [])[1];
            const node = add({
              '@id': id(type === 'jrpg:Weapon' ? 'weapon' : 'armor', link.label), '@type': [type], 'dcterms:title': link.label, 'robos:package': 'items',
              ...(alias ? { 'jrpg:nesName': alias } : {}), 'jrpg:category': sec.title,
              'jrpg:usableBy': c[col('jobs')]?.text || '',
              ...(col('atk') >= 0 ? { 'jrpg:attack': num(c[col('atk')]?.text), 'jrpg:accuracy': num(c[col('acc')]?.text), 'jrpg:critical': num(c[col('crit')]?.text) } : {}),
              ...(col('defense') >= 0 ? { 'jrpg:defense': num(c[col('defense')]?.text), 'jrpg:evasionPenalty': num(c[col('weight')]?.text || c[col('evasion')]?.text) } : {}),
              'jrpg:acquire': wt.stripMarkup(acq), ...(normal ? { 'jrpg:price': Number(normal.replace(/,/g, '')) } : { 'jrpg:priceText': cost }),
              'dcterms:description': rec.extra[0] || '', 'jrpg:sources': src('ffwiki'),
            });
            wantImage(node, nesImg?.file, `${alias || link.label} NES icon`, 'nes');
            count++;
          }
        }
      }
      return count;
    };
    log(`Weapons: ${equipment('Final Fantasy weapons', 'jrpg:Weapon')}, armor: ${equipment('Final Fantasy armor', 'jrpg:Armor')}`);

    // ── Items & key items ─────────────────────────────────────────────────
    const itemsPage = text('Final Fantasy items');
    const nesConsumables = new Set(wt.extractLinks((itemsPage.match(/For consumable items, only the([\s\S]*?)existed in the/) || [])[1] || '').map(l => l.label));
    for (const sec of wt.sections(wt.sectionTree(itemsPage, 'Usable items'))) {
      for (const table of wt.parseTables(sec.body)) {
        for (const rec of recordRows(table)) {
          const link = firstLinkTarget(rec.name.raw);
          if (!nesConsumables.has(link.label)) continue;
          add({
            '@id': id('item', link.label), '@type': ['jrpg:Consumable'], 'dcterms:title': link.label, 'robos:package': 'items',
            ...(nesAlias(rec.name.raw) ? { 'jrpg:nesName': nesAlias(rec.name.raw) } : {}), 'jrpg:category': sec.title,
            'jrpg:acquire': rec.cells[2]?.text || '', 'dcterms:description': rec.cells[3]?.text || rec.extra[0] || '',
            'jrpg:priceText': rec.cells[1]?.text || '', 'jrpg:sources': src('ffwiki'),
          });
        }
      }
    }
    const keyTable = wt.parseTables(wt.sectionTree(itemsPage, 'Key items'))[0];
    for (const row of keyTable ? keyTable.rows : []) {
      if (!row[0]) continue;
      const link = firstLinkTarget(row[0].raw);
      if (onlyRemakePlaces(row[1]?.raw || '') || /Whisperwind|trading sequence|Labyrinth|Lifespring|Hellfire|Earthgift/i.test(row[1]?.text || '')) continue;
      add({
        '@id': id('key-item', link.label), '@type': ['jrpg:KeyItem'], 'dcterms:title': link.label, 'robos:package': 'items',
        ...(nesAlias(row[0].raw) || /\(([A-Z]+)\)/.test(row[0].text) ? { 'jrpg:nesName': nesAlias(row[0].raw) || row[0].text.match(/\(([A-Z]+)\)/)[1] } : {}),
        'jrpg:acquire': row[1]?.text || '', 'dcterms:description': row[2]?.text || '', 'jrpg:sources': src('ffwiki'),
      });
    }

    // ── Magic ─────────────────────────────────────────────────────────────
    const magicPage = text('Magic (Final Fantasy)');
    for (const school of ['Black Magic', 'White Magic']) {
      for (const table of wt.parseTables(wt.sectionTree(magicPage, school))) {
        const h = table.headers.map(x => x.toLowerCase());
        if (h[0] !== 'name') continue;
        for (const rec of recordRows(table)) {
          const c = rec.cells;
          const link = firstLinkTarget(rec.name.raw);
          const alias = nesAlias(rec.name.raw);
          const get = k => c[h.indexOf(k)]?.text || '';
          add({
            '@id': id('spell', link.label), '@type': ['jrpg:Spell'], 'dcterms:title': link.label, 'robos:package': 'magic',
            ...(alias ? { 'jrpg:nesName': alias } : {}), 'jrpg:school': school, 'jrpg:spellLevel': num(get('level')),
            'jrpg:power': num(get('power')), 'jrpg:accuracy': num(get('accuracy')), 'jrpg:element': get('element'), 'jrpg:target': get('target'),
            'jrpg:priceText': get('price'), 'jrpg:soldIn': get('buy'), 'jrpg:usableBy': get('jobs'),
            'dcterms:description': rec.extra[0] || '', 'jrpg:sources': src('ffwiki'),
          });
        }
      }
    }
    for (const sec of wt.sections(wt.sectionTree(magicPage, 'Formulas'))) {
      if (!sec.title || !sec.body.trim()) continue;
      add({ '@id': id('rule', `magic-${sec.title}`), '@type': ['jrpg:Formula'], 'dcterms:title': `Magic: ${sec.title}`, 'robos:package': 'rules', 'jrpg:expression': formulaText(sec.body), 'jrpg:wikiPage': cite('Magic (Final Fantasy)'), 'jrpg:sources': src('ffwiki') });
    }

    // ── Rules: stats, statuses, elements ──────────────────────────────────
    const statsPage = text('Final Fantasy stats');
    for (const sec of wt.sections(wt.sectionTree(statsPage, 'List of stats'))) {
      if (!sec.title || /Initial stats|Greater HP|Guaranteed/i.test(sec.title) || !sec.body.trim()) continue;
      add({ '@id': id('rule', `stat-${sec.title}`), '@type': ['jrpg:StatDefinition'], 'dcterms:title': sec.title, 'robos:package': 'rules', 'jrpg:expression': formulaText(sec.body), 'jrpg:wikiPage': cite('Final Fantasy stats'), 'jrpg:sources': src('ffwiki') });
    }
    const levelText = (await wiki.page('Level')).wikitext || '';
    const ffLevel = (levelText.split(/===\s*''\[\[Final Fantasy\]\]''\s*===/)[1] || '').split(/\n===/)[0];
    if (ffLevel.trim()) add({ '@id': id('rule', 'leveling'), '@type': ['jrpg:ProgressionTable'], 'dcterms:title': 'Levelling', 'robos:package': 'rules', 'dcterms:description': formulaText(ffLevel), 'jrpg:wikiPage': cite('Level'), 'jrpg:sources': src('ffwiki') });
    warnings.push('NES experience-per-level table not acquired: the Final Fantasy Wiki has none, and GameFAQs and Data Crystal refuse automated clients. Add it by hand from a cited FAQ.');
    try {
      const sw = new MediaWikiConnector({ apiUrl: 'https://strategywiki.org/w/api.php', http: ctx.http, siteName: 'StrategyWiki' });
      const gp = await sw.page('Final Fantasy/Gameplay');
      for (const sec of wt.sections(gp.wikitext).filter(x => x.level === 2 && x.title)) {
        const body = wt.sectionTree(gp.wikitext, sec.title);
        const type = /Battle|fleeing/i.test(sec.title) ? 'jrpg:Formula' : /Status/i.test(sec.title) ? 'jrpg:Rule' : 'jrpg:Rule';
        add({ '@id': id('rule', `strategywiki-${sec.title}`), '@type': [type], 'dcterms:title': sec.title, 'robos:package': 'rules', 'jrpg:expression': formulaText(body), 'jrpg:wikiPage': { 'schema:url': sw.pageUrl(gp.title), 'dcterms:title': `StrategyWiki: ${gp.title}` }, 'jrpg:sources': src('strategywiki') });
      }
    } catch (error) { warnings.push(`StrategyWiki unavailable: ${error.message}`); }
    const statusPage = text('Final Fantasy statuses');
    add({ '@id': id('rule', 'status-hit-chance'), '@type': ['jrpg:Formula'], 'dcterms:title': 'Status hit chance', 'robos:package': 'rules', 'jrpg:expression': formulaText(wt.sectionTree(statusPage, 'Mechanics')), 'jrpg:wikiPage': cite('Final Fantasy statuses'), 'jrpg:sources': src('ffwiki') });
    for (const sec of wt.sections(wt.sectionTree(statusPage, 'List of statuses'))) {
      if (!sec.title) continue;
      add({ '@id': id('status', sec.title), '@type': ['jrpg:StatusEffect'], 'dcterms:title': sec.title, 'robos:package': 'rules', 'dcterms:description': formulaText(sec.body), 'jrpg:sources': src('ffwiki') });
    }
    const elemPage = text('Final Fantasy elements');
    for (const sec of wt.sections(wt.sectionTree(elemPage, 'List of elements'))) {
      if (!sec.title) continue;
      add({ '@id': id('element', sec.title), '@type': ['jrpg:Element'], 'dcterms:title': sec.title, 'robos:package': 'rules', 'dcterms:description': formulaText(sec.body), 'jrpg:sources': src('ffwiki') });
    }

    // ── Places, maps and shops ────────────────────────────────────────────
    log('Final Fantasy Wiki: reading location pages; VGMaps: listing NES maps');
    const locPages = await wiki.pages(DATA.LOCATIONS.map(l => l.page));
    let atlas = [];
    try { atlas = await vgmaps.listMaps('FinalFantasy-'); } catch (error) { warnings.push(`VGMaps atlas unavailable: ${error.message}`); }
    const atlasByFile = new Map(atlas.map(m => [m.file, m]));
    const measureMaps = ctx.measureMaps !== false;
    const mapNode = async (file, title, place, type) => {
      const m = atlasByFile.get(file);
      if (!m) { warnings.push(`VGMaps map not listed: ${file}`); return null; }
      const img = { '@type': 'schema:ImageObject', 'schema:contentUrl': m.url, 'schema:caption': `${title} (NES)`, 'schema:creditText': 'VGMaps.com NES atlas', 'jrpg:license': 'Fan-made map; linked from VGMaps.com, not re-hosted', 'schema:url': vgmaps.indexUrl };
      if (measureMaps) {
        const res = await ctx.http.binary(m.url);
        if (res.ok) {
          const size = imageSize(res.body);
          if (size) Object.assign(img, { 'schema:width': size.width, 'schema:height': size.height, 'jrpg:tilesWide': Math.round(size.width / 16), 'jrpg:tilesHigh': Math.round(size.height / 16) });
          img['jrpg:sha256'] = crypto.createHash('sha256').update(res.body).digest('hex');
          if (ctx.cacheDir) {
            const dest = path.join(ctx.cacheDir, 'maps', file);
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, res.body);
          }
        } else warnings.push(`Could not fetch ${m.url}: ${res.error}`);
      }
      return add({
        '@id': id('map', file.replace(/^FinalFantasy-/, '').replace(/\.png$/, '')), '@type': [type], 'dcterms:title': title, 'robos:package': 'world',
        ...(place ? { 'jrpg:place': { '@id': place } } : {}), 'schema:image': [img], 'jrpg:sources': src('vgmaps'),
      });
    };
    const world = await mapNode('FinalFantasy-World.png', 'World map', null, 'jrpg:WorldMap');
    if (world) {
      world['dcterms:description'] = 'The overworld: one continent ring around the Aldean (Inner) Sea, reached by ship, canoe and airship as the story opens it.';
      const variants = [['FinalFantasy-World(Unmarked).png', 'World map (unmarked)'], ['FinalFantasy-World(In-GameMap).png', 'World map (in-game map screen)']];
      for (const [f, cap] of variants) { const m = atlasByFile.get(f); if (m) world['schema:image'].push({ '@type': 'schema:ImageObject', 'schema:contentUrl': m.url, 'schema:caption': cap, 'schema:creditText': 'VGMaps.com NES atlas' }); }
    }
    const placeIdByPage = new Map();
    for (const loc of DATA.LOCATIONS) {
      const entry = locPages.get(loc.page);
      const info = entry && !entry.missing ? (wt.parseTemplates(entry.wikitext, 'infobox location')[0] || { params: {} }) : { params: {} };
      const title = cleanTitle(loc.page);
      const node = add({
        '@id': id('place', title), '@type': [loc.type], 'dcterms:title': title, 'robos:package': 'world', 'jrpg:nesName': loc.nes,
        'dcterms:description': entry && !entry.missing ? firstParagraph(entry.wikitext) : '',
        ...(entry && !entry.missing ? { 'jrpg:wikiPage': cite(entry.title) } : {}), 'jrpg:sources': src('ffwiki', ...(loc.maps.length ? ['vgmaps'] : [])),
      });
      placeIdByPage.set(loc.page, node['@id']);
      placeIdByPage.set(title, node['@id']);
      const mapRefs = [];
      for (const f of loc.maps) {
        const suffix = (f.match(/\(([^)]+)\)\.png$/) || [])[1];
        const m = await mapNode(f, `${loc.nes}${suffix ? ` (${suffix})` : ''}`, node['@id'], 'jrpg:AreaMap');
        if (m) mapRefs.push({ '@id': m['@id'] });
      }
      if (mapRefs.length) node['jrpg:maps'] = mapRefs;
      const nesShot = wt.extractFiles(entry?.wikitext || '').find(f => /\(NES\)/.test(f.caption) && !/world map/i.test(f.caption));
      wantImage(node, nesShot?.file, `${loc.nes} (NES screenshot)`, 'nes');
      // Encounter table on the place page.
      const enc = wt.sectionTree(entry?.wikitext || '', 'Encounters');
      const met = [...new Set(wt.extractLinks(enc).map(l => enemyByPage.get(l.target)).filter(Boolean).map(n => n['@id']))];
      if (met.length) node['jrpg:enemies'] = met.map(x => ({ '@id': x }));
    }

    const shopsPage = text('Final Fantasy shops');
    let shopCount = 0;
    for (const town of wt.sections(shopsPage).filter(s => s.level === 2 && s.title)) {
      const townBody = wt.sectionTree(shopsPage, town.title);
      const townLink = wt.extractLinks(town.rawTitle)[0];
      const placeId = placeIdByPage.get(townLink?.target || town.title) || placeIdByPage.get(town.title);
      if (DATA.REMAKE_ONLY_PLACES.some(p => town.title.includes(p))) continue;
      for (const shop of wt.sections(townBody).filter(s => s.level === 3 && s.title)) {
        const table = wt.parseTables(shop.body + '\n|}')[0];
        if (!table) continue;
        const stock = [];
        for (const row of table.rows) {
          if (!row[0] || !row[1] || !row[0].header || row[1].header) continue;
          const price = row[1].text;
          if (!price || /N\/A|—/.test(price)) continue;
          stock.push({ 'jrpg:item': row[0].text, 'jrpg:price': num(price.replace(/\s*gil/i, '')) });
        }
        if (!stock.length) continue;
        add({
          '@id': id('shop', `${town.title} ${shop.title}`), '@type': ['jrpg:Shop'], 'dcterms:title': `${town.title} ${shop.title} shop`, 'robos:package': 'economy',
          'jrpg:shopType': shop.title, ...(placeId ? { 'jrpg:place': { '@id': placeId } } : {}), 'jrpg:stock': stock, 'jrpg:sources': src('ffwiki'),
        });
        shopCount++;
      }
    }
    log(`Shops: ${shopCount}`);

    // ── NPCs ──────────────────────────────────────────────────────────────
    const charPage = text('Final Fantasy characters');
    const npcSection = wt.sectionTree(charPage, 'Non-player characters');
    for (const f of wt.extractFiles(npcSection)) {
      const link = wt.extractLinks(f.rawCaption || '')[0];
      if (!link || /^\s*''/.test(f.rawCaption) || /Chronodia/i.test(link.target)) continue;
      const title = cleanTitle(link.target);
      const enemy = enemyByPage.get(link.target) || enemyByPage.get(title) || enemyByPage.get(`${title} (Final Fantasy boss)`);
      const node = add({
        '@id': id('npc', title), '@type': ['jrpg:NPC'], 'dcterms:title': f.caption || title, 'robos:package': 'characters',
        ...(enemy ? { 'jrpg:fightsAs': { '@id': enemy['@id'] } } : {}), 'jrpg:wikiPage': cite(link.target), 'jrpg:sources': src('ffwiki'),
      });
      wantImage(node, f.file, `${f.caption || title} map sprite`, 'map');
    }

    // ── Menus ─────────────────────────────────────────────────────────────
    for (const m of DATA.MENUS) {
      const node = add({ '@id': id('menu', m.key), '@type': ['jrpg:MenuScreen'], 'dcterms:title': m.title, 'robos:package': 'ui', 'jrpg:commands': m.commands, 'jrpg:wikiPage': cite('Menu (Final Fantasy)'), 'jrpg:sources': src('ffwiki') });
      wantImage(node, m.file, `${m.title} (NES)`, 'nes');
    }
    add({ '@id': id('menu', 'battle'), '@type': ['jrpg:MenuScreen'], 'dcterms:title': 'Battle command window', 'robos:package': 'ui', 'jrpg:commands': 'FIGHT, MAGIC, DRINK, ITEM, RUN; enemies on the left, party on the right, messages in a box below', 'jrpg:sources': src('ffwiki') });

    // ── Music ─────────────────────────────────────────────────────────────
    // "All Sounds of Final Fantasy I & II" track list: FF1 is the block under
    // ";FINAL FANTASY (ORIGINAL SOUND)", up to the next ";<big>" heading.
    const ostPage = text('Original soundtracks of Final Fantasy I & II');
    const allSounds = wt.sectionTree(ostPage, "All Sounds of Final Fantasy I & II");
    const range = allSounds.match(/Tracks\s+(\d+)\s*-\s*(\d+)\s+are from ''Final Fantasy''/);
    const ff1Tracks = range ? [Number(range[1]), Number(range[2])] : [2, 21];
    let track = 0, inFF1 = false, lastTrack = null;
    for (const line of allSounds.split('\n')) {
      if (/^#?:*;\s*<big>/i.test(line)) { inFF1 = /FINAL FANTASY \(ORIGINAL/i.test(line); continue; }
      if (/^#:/.test(line)) { if (lastTrack && inFF1) lastTrack['dcterms:description'] = wt.stripMarkup(line.replace(/^#:\s*/, '')); continue; }
      if (!/^#[^#:;]/.test(line)) continue;
      track++;
      if (!inFF1 || track < ff1Tracks[0] || track > ff1Tracks[1]) { lastTrack = null; continue; }
      const head = line.slice(1).split(/<br\s*\/?>/i)[0];
      const m = wt.stripMarkup(head).match(/^(.*?)\s+-\s+(\d+:\d{2})\s*$/);
      const name = m ? m[1] : wt.stripMarkup(head);
      const link = firstLinkTarget(head);
      lastTrack = add({
        '@id': id('music', name), '@type': ['jrpg:MusicTrack'], 'dcterms:title': name, 'robos:package': 'audio', 'jrpg:track': track,
        ...(m ? { 'jrpg:length': m[2] } : {}), ...(link.target && link.target !== name ? { 'jrpg:wikiPage': cite(link.target.split('#')[0]) } : {}),
        'jrpg:album': 'All Sounds of Final Fantasy I & II (1988)', 'jrpg:sources': src('ffwiki'),
      });
    }

    // ── Fan arrangements from RPGamer ─────────────────────────────────────
    const rpgamer = new RPGamerConnector({ http: ctx.http });
    const trackByTitle = new Map(nodes.filter(n => n['@type'].includes('jrpg:MusicTrack')).map(n => [n['dcterms:title'], n]));
    let fanCount = 0;
    for (const page of ['https://archive.rpgamer.com/games/ff/ff1/ff1mid.html', 'https://archive.rpgamer.com/games/ff/ff1/ff1dm.html']) {
      let files = [];
      try { files = await rpgamer.fanMusic(page); } catch (error) { warnings.push(`RPGamer fan music unavailable (${page}): ${error.message}`); continue; }
      for (const f of files) {
        const track = trackByTitle.get(DATA.FAN_MUSIC_THEMES[f.theme]);
        if (!track) continue;
        (track['jrpg:fanArrangements'] = track['jrpg:fanArrangements'] || []).push({ 'schema:name': f.title, 'schema:contentUrl': f.url, 'jrpg:format': f.format, ...(f.arranger ? { 'schema:creator': f.arranger } : {}), 'schema:creditText': 'RPGamer archive (SquareNet)' });
        if (!track['jrpg:sources'].some(s => s['@id'] === id('source', 'rpgamer'))) track['jrpg:sources'].push(...src('rpgamer'));
        fanCount++;
      }
    }
    log(`Fan arrangements linked: ${fanCount}`);

    // ── Story milestones ──────────────────────────────────────────────────
    log('Story: linking walkthrough milestones');
    const keyItemByName = new Map(nodes.filter(n => n['@type'].includes('jrpg:KeyItem')).map(n => [n['dcterms:title'].toLowerCase(), n['@id']]));
    const flagId = name => keyItemByName.get(name.toLowerCase()) || id('flag', name);
    const flags = new Set();
    let prev = null;
    DATA.STORY.forEach((s, i) => {
      const seq = i + 1;
      const node = add({
        '@id': id('milestone', `${String(seq).padStart(2, '0')}-${s.title.split(':')[0].slice(0, 48)}`), '@type': ['jrpg:StoryMilestone'], 'dcterms:title': s.title, 'robos:package': 'story',
        'jrpg:sequence': seq, 'jrpg:chapter': s.chapter, 'jrpg:optional': Boolean(s.optional),
        ...(placeIdByPage.get(s.place) ? { 'jrpg:place': { '@id': placeIdByPage.get(s.place) } } : {}),
        ...(s.boss ? (enemyByPage.get(s.boss) ? { 'jrpg:boss': { '@id': enemyByPage.get(s.boss)['@id'] } } : { 'jrpg:bossName': cleanTitle(s.boss) }) : {}),
        'jrpg:requires': s.requires.map(r => ({ '@id': flagId(r) })), 'jrpg:grants': s.grants.map(g => ({ '@id': flagId(g) })),
        ...(prev ? { 'jrpg:after': { '@id': prev } } : {}),
        'jrpg:walkthrough': { 'schema:url': wiki.pageUrl(`${DATA.WALKTHROUGH}${s.part}`), 'dcterms:title': `Apoqliphoth walkthrough, part ${s.part}` },
        'jrpg:sources': src('ffwiki-walkthrough', 'ffwiki'),
      });
      if (s.boss && !enemyByPage.get(s.boss)) warnings.push(`Story boss page not among enemies: ${s.boss}`);
      [...s.requires, ...s.grants].forEach(f => { if (!keyItemByName.has(f.toLowerCase())) flags.add(f); });
      prev = node['@id'];
    });
    for (const f of flags) add({ '@id': id('flag', f), '@type': ['jrpg:StoryFlag'], 'dcterms:title': f, 'robos:package': 'story', 'dcterms:description': 'A story state or vehicle that later milestones check for.', 'jrpg:sources': src('ffwiki-walkthrough') });

    // ── Images: resolve file names to URLs in batches ────────────────────
    log(`Final Fantasy Wiki: resolving ${pendingImages.length} image URLs`);
    const infos = await wiki.imageInfo(pendingImages.map(p => p.file));
    let missingImages = 0;
    for (const p of pendingImages) {
      const info = infos.get(p.file) || infos.get(p.file.replace(/_/g, ' '));
      if (!info) { missingImages++; continue; }
      const img = { '@type': 'schema:ImageObject', 'schema:contentUrl': info.url, 'schema:caption': p.caption, 'jrpg:variant': p.variant, 'schema:width': info.width, 'schema:height': info.height, 'schema:creditText': FFWIKI_CREDIT, 'schema:url': info.descriptionUrl, 'jrpg:license': SPRITE_LICENSE };
      if (ctx.downloadImages) {
        const res = await ctx.http.binary(info.url);
        if (res.ok && ctx.cacheDir) {
          const dest = path.join(ctx.cacheDir, 'images', slug(info.file.replace(/\.[a-z]+$/i, '')) + path.extname(info.file).toLowerCase());
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, res.body);
          img['jrpg:sha256'] = crypto.createHash('sha256').update(res.body).digest('hex');
        }
      }
      (p.node['schema:image'] = p.node['schema:image'] || []).push(img);
    }
    if (missingImages) warnings.push(`${missingImages} referenced wiki images had no file info`);

    // ── Probe fan sites that may refuse automated clients ─────────────────
    const sources = [];
    for (const s of SOURCES) {
      let status = s.status || 'used';
      if (s.probe) {
        const res = await ctx.http.text(s.url);
        if (res.ok) status = 'reachable';
        else {
          const snap = await wayback.latestSnapshot(s.url);
          status = snap.ok ? 'archived' : `unreachable (${res.error})`;
          if (snap.ok) s.archiveUrl = snap.url;
          warnings.push(`${s.title}: ${res.error}${snap.ok ? `; using archived copy ${snap.url}` : '; no archived copy reachable'}`);
        }
      }
      const node = sourceNode(GAME_SLUG, { ...s, status });
      if (s.archiveUrl) node['jrpg:archiveUrl'] = s.archiveUrl;
      sources.push(node);
    }

    const gamePage = text('Final Fantasy');
    const gameInfo = wt.parseTemplates(gamePage, 'infobox game')[0] || { params: {} };
    const game = {
      '@id': id('game', 'final-fantasy'), '@type': ['jrpg:Game', 'schema:VideoGame'], 'dcterms:title': 'Final Fantasy', 'robos:package': 'game',
      'dcterms:description': 'Final Fantasy (NES, USA, 1990). Four Light Warriors carrying darkened orbs restore the four crystals by defeating the Fiends of Earth, Fire, Water and Wind, then break a 2000-year time loop by defeating Chaos.',
      'jrpg:platform': 'NES', 'jrpg:region': 'USA', 'jrpg:year': 1990, 'jrpg:developer': wt.stripMarkup(gameInfo.params.developer || 'Square'), 'jrpg:publisher': 'Nintendo (North America)',
      'jrpg:story': paragraphs(wt.sectionTree(gamePage, 'Story')).slice(0, 4).join('\n\n'),
      'jrpg:wikiPage': cite('Final Fantasy'), 'jrpg:sources': src('ffwiki', 'vgmaps'),
    };
    const boxArt = wt.extractFiles(gamePage).find(f => /NES/i.test(f.file) && /(box|cover|NA|US)/i.test(f.file));
    if (boxArt) {
      const info = (await wiki.imageInfo([boxArt.file])).get(boxArt.file);
      if (info) game['schema:image'] = [{ '@type': 'schema:ImageObject', 'schema:contentUrl': info.url, 'schema:caption': 'NES box art', 'schema:creditText': FFWIKI_CREDIT, 'schema:url': info.descriptionUrl, 'jrpg:license': SPRITE_LICENSE }];
    }
    return { game, nodes, sources, warnings };
  },
};

// Prose paragraphs of a wikitext fragment: template, image, table and
// heading lines are dropped before splitting on blank lines.
function paragraphs(wikitext) {
  const kept = [];
  let depth = 0;
  for (const line of String(wikitext || '').split('\n')) {
    const opens = (line.match(/\{\{/g) || []).length;
    const closes = (line.match(/\}\}/g) || []).length;
    const inTemplate = depth > 0 || (line.trim().startsWith('{{') && opens > 0);
    depth = Math.max(0, depth + opens - closes);
    if (inTemplate) { if (depth === 0) kept.push(''); continue; }
    if (/^\s*(\[\[(File|Image):|\{\||\||!|=|<gallery|__)/i.test(line)) { kept.push(''); continue; }
    kept.push(line);
  }
  return kept.join('\n').split(/\n\s*\n/).map(p => wt.stripMarkup(p)).filter(p => p.length > 40 && !/^\*/.test(p));
}

function firstParagraph(wikitext) {
  const p = paragraphs(wikitext)[0] || '';
  return p.length > 700 ? p.slice(0, 697) + '...' : p;
}

// Readable rule text: paragraphs and ":"-indented formulas, without tables or images.
function formulaText(body) {
  return String(body || '').split('\n')
    .filter(l => !/^\s*(\{\||\||!|\[\[File|\{\{main|\{\{see)/i.test(l))
    .map(l => (l.startsWith(':') ? '    ' + wt.stripMarkup(l.replace(/^:+/, '')) : wt.stripMarkup(l)))
    .filter((l, i, a) => l.trim() || (i > 0 && a[i - 1].trim()))
    .join('\n').trim().slice(0, 4000);
}

// "Initial stats" table → { 'Warrior': { HP: 35, ... }, ... }
function statColumns(table) {
  const out = {};
  if (!table) return out;
  const classes = table.headers.slice(1);
  classes.forEach(c => { out[c] = {}; });
  for (const row of table.rows) {
    const stat = row[0]?.text;
    if (!stat) continue;
    classes.forEach((c, i) => { out[c][stat] = num(row[i + 1]?.text || ''); });
  }
  return out;
}
