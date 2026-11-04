'use strict';

// Turns parsed records and generated images into a kgraph folder with the same
// layout as a RobOS workspace, so KGraph Explorer can open it directly:
//
//   <out>/.robos/kgraph.yaml                   package catalog (JSON-formatted YAML)
//   <out>/.robos/ontology.jsonld               JRPG types and their parents
//   <out>/.robos/kgraphs/<pkg>/package.jsonld  nodes, one package per asset group
//   <out>/coverage.json                        what is covered and what to collect
//   <out>/README.md
//
// Source files are referenced by name and hash, never copied.

const fs = require('fs');
const path = require('path');
const { PACKAGES, ontologyDocument, coverage } = require('./ontology');
const { slug } = require('./slug');

const CONTEXT = {
  robos: 'https://robos.dev/ns/sdlc#',
  jrpg: 'https://robos.dev/ns/jrpg#',
  dcterms: 'http://purl.org/dc/terms/',
  schema: 'https://schema.org/',
  oslc_am: 'http://open-services.net/ns/am#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

const PLACE_TYPES = { town: 'jrpg:Town', castle: 'jrpg:Castle', dungeon: 'jrpg:Dungeon', region: 'jrpg:Region' };
const ITEM_TYPES = { weapon: 'jrpg:Weapon', armor: 'jrpg:Armor', consumable: 'jrpg:Consumable', 'key-item': 'jrpg:KeyItem' };
const RULE_TYPES = { formula: 'jrpg:Formula', stat: 'jrpg:StatDefinition', status: 'jrpg:StatusEffect', element: 'jrpg:Element', mechanic: 'jrpg:Rule' };
const ART_TYPES = {
  'world-map': ['jrpg:WorldMap'], 'area-map': ['jrpg:AreaMap'], 'battle-backdrop': ['jrpg:BattleBackdrop'],
  'class-sprite': ['jrpg:Sprite'], 'enemy-sprite': ['jrpg:Sprite'], 'menu-screen': ['jrpg:MenuArt'],
};
const ART_PACKAGES = {
  'world-map': 'world', 'area-map': 'world', 'battle-backdrop': 'world',
  'class-sprite': 'characters', 'enemy-sprite': 'bestiary', 'menu-screen': 'ui',
};

function clean(node) {
  for (const [key, value] of Object.entries(node)) {
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) delete node[key];
  }
  return node;
}

function ref(id) {
  return { '@id': id };
}

function buildNodes(parsed, art = { images: [] }) {
  const g = parsed.game;
  const gameSlug = slug(g.title);
  const urn = (kind, name) => `urn:robos:jrpg:${gameSlug}:${kind}:${slug(name)}`;
  const gameId = urn('game', g.title);
  const sourceRef = name => (name ? ref(urn('source', name)) : undefined);
  const placeSlugs = new Set((parsed.places || []).map(p => slug(p.name)));
  const nodes = [];
  const usedIds = new Map();

  const add = (id, pkg, types, title, props) => {
    const n = usedIds.get(id) || 0;
    usedIds.set(id, n + 1);
    nodes.push(clean({
      '@id': n ? `${id}-${n + 1}` : id,
      '@type': ['oslc_am:Resource', ...types],
      'dcterms:title': title,
      'robos:package': pkg,
      ...props,
    }));
  };

  add(gameId, 'game', ['robos:Game', 'schema:VideoGame', 'jrpg:Game'], g.title, {
    'dcterms:description': `${g.title} (${g.edition}), parsed from files a person collected.`,
    'robos:gameType': 'jrpg',
    'robos:ruleset': g.ruleset || `${slug(g.title)}-${slug(g.edition)}`,
    'jrpg:edition': g.edition,
  });

  for (const s of parsed.sources) {
    add(urn('source', s.name), 'game', ['jrpg:Source'], s.title || s.name, {
      'jrpg:fileName': s.name,
      'jrpg:sha256': s.sha256,
      'jrpg:sourceRole': s.role,
      'jrpg:savedFrom': s.savedFrom,
      'jrpg:depictsName': s.depicts,
      'jrpg:width': s.size && s.size.width,
      'jrpg:height': s.size && s.size.height,
      'jrpg:used': s.use !== false,
      'dcterms:description': s.note,
    });
  }

  for (const e of parsed.enemies || []) {
    add(urn(e.boss ? 'boss' : 'enemy', e.name), 'bestiary',
      ['robos:GameMonster', 'schema:Person', 'jrpg:Enemy', ...(e.boss ? ['jrpg:Boss'] : [])], e.name, {
        'robos:hpMin': e.hp, 'robos:hpMax': e.hp, 'robos:xpReward': e.xp,
        'robos:goldMin': e.gold, 'robos:goldMax': e.gold,
        'jrpg:gameId': e.gameId,
        'jrpg:attack': e.attack, 'jrpg:accuracy': e.accuracy, 'jrpg:hits': e.hits, 'jrpg:critRate': e.critRate,
        'jrpg:defense': e.defense, 'jrpg:evade': e.evade, 'jrpg:magicDefense': e.magicDefense, 'jrpg:morale': e.morale,
        'jrpg:categories': e.categories, 'jrpg:weakness': e.weakness, 'jrpg:resistances': e.resistances,
        'jrpg:statusAttack': e.statusAttack, 'jrpg:ai': e.ai,
        'jrpg:altName': e.altNames, 'jrpg:source': sourceRef(e.source),
      });
  }

  for (const s of parsed.spells || []) {
    add(urn('spell', `${s.school || 'x'}-${s.level}-${s.name}`), 'magic', ['robos:GameSpell', 'schema:Action', 'jrpg:Spell'], s.name, {
      'jrpg:altName': s.otherNames || s.altName, 'jrpg:school': s.school, 'jrpg:spellLevel': s.level, 'jrpg:range': s.range,
      'jrpg:power': s.power, 'jrpg:accuracy': s.accuracy, 'jrpg:element': s.element,
      'jrpg:soldIn': (parsed.shops || []).filter(shop => placeSlugs.has(slug(shop.town)) && (shop.stock || []).some(i => i && i.name === s.name)).map(shop => ref(urn('place', shop.town))),
      'robos:cost': s.price, 'dcterms:description': s.description, 'jrpg:source': sourceRef(s.source),
    });
  }

  for (const c of parsed.classes || []) {
    add(urn('class', c.name), 'characters', ['robos:GameClass', 'schema:Role', 'jrpg:PlayableClass'], c.name, {
      'jrpg:altName': c.altNames, 'jrpg:upgradesTo': c.upgradesTo,
      'jrpg:startingStats': c.startingStats,
      'dcterms:description': c.description, 'jrpg:evidence': c.evidence, 'jrpg:source': sourceRef(c.source),
    });
  }

  for (const p of parsed.places || []) {
    add(urn('place', p.name), 'world', ['schema:Place', PLACE_TYPES[p.type] || 'jrpg:Place'], p.name, {
      'robos:locationType': p.type, 'jrpg:altName': p.altNames,
      'jrpg:referenceMap': parsed.sources.filter(s => s.role === 'area-map' && s.depicts === p.name).map(s => ref(urn('source', s.name))),
      'dcterms:description': p.description, 'jrpg:evidence': p.evidence, 'jrpg:source': sourceRef(p.source),
    });
  }

  for (const it of parsed.equipment || []) {
    add(urn('item', it.name), 'items', ['robos:GameItem', 'schema:Product', ITEM_TYPES[it.kind] || 'jrpg:Item'], it.name, {
      'robos:itemCategory': it.kind, 'jrpg:altName': it.altNames, 'jrpg:usableBy': it.usableBy, 'jrpg:foundAt': it.foundAt,
      'robos:attackBonus': it.damage, 'robos:defenseBonus': it.absorb, 'robos:cost': it.price,
      'jrpg:slot': it.slot, 'jrpg:gameId': it.gameId, 'jrpg:hitBonus': it.hit, 'jrpg:critRate': it.crit,
      'jrpg:evadePenalty': it.weight, 'jrpg:sellPrice': it.sell, 'jrpg:effect': it.effect,
      'dcterms:description': it.description, 'jrpg:evidence': it.evidence, 'jrpg:source': sourceRef(it.source),
    });
  }

  for (const s of parsed.shops || []) {
    add(urn('shop', `${s.town}-${s.kind}`), 'economy', ['jrpg:Shop'], `${s.town} ${s.kind} shop`, {
      // Prose can describe a town without naming it, so only a known place becomes a link.
      'jrpg:town': placeSlugs.has(slug(s.town)) ? ref(urn('place', s.town)) : s.town, 'jrpg:shopKind': s.kind, 'jrpg:stock': s.stock, 'robos:cost': s.price,
      'jrpg:evidence': s.evidence, 'jrpg:source': sourceRef(s.source),
    });
  }

  for (const r of parsed.rules || []) {
    add(urn('rule', r.name), 'rules', [RULE_TYPES[r.kind] || 'jrpg:Rule'], r.name, {
      'jrpg:expression': r.expression, 'dcterms:description': r.description, 'jrpg:evidence': r.evidence, 'jrpg:source': sourceRef(r.source),
    });
  }

  for (const t of parsed.music || []) {
    add(urn('music', t.name), 'audio', ['jrpg:MusicTrack', 'schema:MusicRecording'], t.name, {
      'jrpg:track': t.track, 'jrpg:usedFor': t.usedFor, 'jrpg:source': sourceRef(t.source),
    });
  }

  (parsed.milestones || []).forEach((m, i) => {
    add(urn('milestone', m.title), 'story', ['jrpg:StoryMilestone'], m.title, {
      'jrpg:order': i + 1, 'jrpg:place': m.place, 'jrpg:requires': m.requires, 'jrpg:grants': m.grants, 'jrpg:boss': m.boss,
      'dcterms:description': m.description, 'jrpg:evidence': m.evidence, 'jrpg:source': sourceRef(m.source),
    });
  });

  for (const m of parsed.menus || []) {
    add(urn('menu', m.source.replace(/\.[^.]+$/, '')), 'ui', ['jrpg:MenuScreen'], m.title || m.source, {
      'dcterms:description': m.purpose, 'jrpg:commands': m.commands, 'jrpg:windows': m.windows,
      'jrpg:cursor': m.cursor, 'jrpg:palette': m.palette, 'jrpg:source': sourceRef(m.source),
    });
  }

  for (const enc of parsed.encounters || []) {
    add(urn('encounter', `${enc.domainId || ''}-${enc.area}`), 'bestiary', ['jrpg:EncounterZone'], `Encounter Table: ${enc.area}`, {
      'jrpg:domainId': enc.domainId, 'jrpg:area': enc.area, 'jrpg:encounterRate': enc.rate,
      'jrpg:formationSlots': enc.slots, 'jrpg:source': sourceRef(enc.source),
    });
  }

  for (const ch of parsed.chests || []) {
    add(urn('chest', `${ch.chestId}-${ch.mapName || 'world'}`), 'world', ['jrpg:TreasureChest'], `Chest ${ch.chestId}: ${ch.contents}`, {
      'jrpg:chestId': ch.chestId, 'jrpg:mapName': ch.mapName, 'jrpg:coordinates': ch.coordinates,
      'jrpg:contents': ch.contents, 'jrpg:requiresMysticKey': ch.requiresKey, 'jrpg:source': sourceRef(ch.source),
    });
  }

  // A folder can hold more screenshots of a screen than there are layouts, so a
  // target that has no node falls back to the game.
  const nodeIds = new Set(nodes.map(n => n['@id']));
  // An image made before a place or class took its edition's name still depicts it.
  const renamed = new Map();
  for (const [kind, rows] of [['place', parsed.places], ['class', parsed.classes]]) {
    for (const row of rows || []) for (const alt of row.altNames || []) renamed.set(`${kind}:${slug(alt)}`, urn(kind, row.name));
  }
  const depictsRef = d => {
    if (d === 'game') return gameId;
    const [kind, name] = d.split(':');
    const id = `urn:robos:jrpg:${gameSlug}:${kind}:${name}`;
    return nodeIds.has(id) ? id : renamed.get(d) || gameId;
  };
  for (const img of art.images) {
    add(urn('image', img.id), ART_PACKAGES[img.kind], [...ART_TYPES[img.kind], 'jrpg:GeneratedImage'], img.title, {
      'schema:contentUrl': img.file,
      'jrpg:depicts': ref(depictsRef(img.depicts)),
      'jrpg:basis': img.basis,
      'jrpg:model': img.model,
      'jrpg:promptSha256': img.promptSha256,
      'jrpg:references': img.references.map(name => ref(urn('source', name))),
    });
  }

  return nodes;
}

function readme(parsed, catalog, cov, warnings) {
  const missing = cov.filter(c => !c.covered);
  const invented = '`jrpg:basis` is `text-only` on images made without a reference image, so those are invented from the guide\'s text.';
  return [
    `# ${parsed.game.title} Knowledge Graph`,
    '',
    `${parsed.game.title} (${parsed.game.edition}), parsed by the RobOS JRPG parser from files a person collected. Source files are referenced by name and hash, and are not stored here. ${invented}`,
    '',
    '**This working folder is private.** It names downloaded files and quotes them. To share the game, run `jrpg-parser publish`, which makes a copy holding only what was parsed and generated.',
    '',
    '## Coverage',
    '',
    '| Asset type | Count | Covered |',
    '| --- | ---: | :---: |',
    ...cov.map(c => `| ${c.label} | ${c.count} | ${c.covered ? 'yes' : 'no'} |`),
    '',
    ...(missing.length ? ['## Still to collect', '', ...missing.map(c => `- ${c.label}: ${c.collect}`), ''] : []),
    '## Packages',
    '',
    '| Package | Nodes |',
    '| --- | ---: |',
    ...catalog.map(p => `| \`${p.id}\` | ${p.nodeCount} |`),
    '',
    ...(warnings.length ? ['## Parser notes', '', ...warnings.map(w => `- ${w}`), ''] : []),
  ].join('\n');
}

function writeKgraph(outDir, parsed, art = { images: [] }) {
  const nodes = buildNodes(parsed, art);
  const ns = `jrpg.${slug(parsed.game.title)}`;
  const robosDir = path.join(outDir, '.robos');
  fs.mkdirSync(path.join(robosDir, 'kgraphs'), { recursive: true });

  const catalog = [];
  for (const meta of PACKAGES) {
    const pkgNodes = nodes.filter(n => n['robos:package'] === meta.id)
      .map(n => ({ ...n, 'robos:namespace': `${ns}.${meta.id}` }))
      .sort((a, b) => a['@id'].localeCompare(b['@id']));
    if (!pkgNodes.length) continue;
    const rel = `kgraphs/${meta.id}/package.jsonld`;
    fs.mkdirSync(path.join(robosDir, 'kgraphs', meta.id), { recursive: true });
    fs.writeFileSync(path.join(robosDir, rel), JSON.stringify({
      '@context': CONTEXT,
      '@id': `urn:robos:package:${slug(parsed.game.title)}:${meta.id}`,
      '@type': ['robos:Package'],
      'robos:package': meta.id,
      'robos:namespace': `${ns}.${meta.id}`,
      'robos:version': '1.0.0',
      'dcterms:title': `${parsed.game.title}: ${meta.title}`,
      'dcterms:description': meta.description,
      'robos:nodes': pkgNodes,
    }, null, 2) + '\n');
    catalog.push({ id: meta.id, namespace: `${ns}.${meta.id}`, title: meta.title, description: meta.description, path: rel, nodeCount: pkgNodes.length });
  }

  fs.writeFileSync(path.join(robosDir, 'kgraph.yaml'), JSON.stringify({
    version: '1.0.0',
    title: `${parsed.game.title} Knowledge Graph`,
    generator: 'robos-jrpg-parser',
    ontology: 'ontology.jsonld',
    repositories: [{ id: 'local', path: '.robos', packagesPath: 'kgraphs', default: true }],
    dependencies: [],
    packages: catalog,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(robosDir, 'ontology.jsonld'), JSON.stringify(ontologyDocument(), null, 2) + '\n');

  const cov = coverage(nodes, parsed.sources);
  const warnings = parsed.warnings || [];
  const report = { game: parsed.game, nodeCount: nodes.length, assetTypes: cov, stillToCollect: cov.filter(c => !c.covered).map(c => ({ id: c.id, collect: c.collect })), warnings };
  fs.writeFileSync(path.join(outDir, 'coverage.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), readme(parsed, catalog, cov, warnings));
  // This folder holds downloaded material, so git must not pick it up. `publish` makes the copy to share.
  fs.writeFileSync(path.join(outDir, '.gitignore'), '# Private working folder. Use `jrpg-parser publish` to make a copy to share.\n*\n');
  return { nodes, catalog, coverage: cov };
}

module.exports = { buildNodes, writeKgraph };
