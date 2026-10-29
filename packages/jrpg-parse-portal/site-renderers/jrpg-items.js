/* Items, equipment, spells, shops and menus. Weapons and armor have no
 * renderer of their own: they use jrpg:Item through jrpg:Equipment. */
(function () {
  const FIELDS = [
    ['jrpg:nesName', 'NES name'], ['jrpg:category', 'Category'], ['jrpg:slot', 'Slot'], ['jrpg:attack', 'Attack'], ['jrpg:accuracy', 'Accuracy'], ['jrpg:critical', 'Critical'],
    ['jrpg:defense', 'Defense'], ['jrpg:evasionPenalty', 'Weight'], ['jrpg:price', 'Price'], ['jrpg:priceText', 'Price'], ['jrpg:usableBy', 'Usable by'],
    ['jrpg:soldIn', 'Sold in'], ['jrpg:acquire', 'How to get it'], ['jrpg:foundAt', 'Found at'],
  ];
  const icon = (n, c) => { const i = c.images(n)[0]; return i ? c.img(i, { style: 'height:32px' }) : ''; };

  KGraphSite.registerRenderer({
    id: 'jrpg-item',
    types: ['jrpg:Item'],
    render(n, c) {
      const rows = FIELDS.filter(([k]) => n[k] !== undefined && n[k] !== '').map(([k, label]) => `<tr><th>${c.h(label)}</th><td>${c.value(n[k])}</td></tr>`).join('');
      const shops = (c.graph.incoming.get(n['@id']) || []).map(x => x.from);
      return `<h1>${icon(n, c)} ${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        <div class="panel"><table class="props">${rows}</table></div>
        ${shops.length ? `<h2>Referenced by</h2><p>${shops.map(s => c.link(s)).join(' · ')}</p>` : ''}
        <p class="muted">Sources: ${c.refs(n['jrpg:sources']).map(s => c.link(s)).join(', ')}</p>`;
    },
    card(n, c) {
      const stat = n['jrpg:attack'] !== undefined ? `ATK ${n['jrpg:attack']}` : n['jrpg:defense'] !== undefined ? `DEF ${n['jrpg:defense']}` : (n['dcterms:description'] || '').slice(0, 60);
      return `<a class="card" href="${c.nodeHref(n['@id'])}">${icon(n, c) ? `<div class="thumb" style="height:48px">${icon(n, c)}</div>` : ''}<div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(stat)}${n['jrpg:price'] ? ` · ${c.h(n['jrpg:price'])} G` : ''}</div></a>`;
    },
    collection(nodes, c) {
      const weapons = nodes.some(n => n['jrpg:attack'] !== undefined);
      const armor = nodes.some(n => n['jrpg:defense'] !== undefined);
      const cols = ['', 'Name', 'NES', 'Category', ...(weapons ? ['ATK', 'ACC', 'CRIT'] : []), ...(armor ? ['DEF', 'WT'] : []), 'Price', 'Usable by / effect'];
      const rows = nodes.map(n => [icon(n, c), c.link(n), c.h(n['jrpg:nesName'] || ''), c.h(n['jrpg:category'] || n['jrpg:slot'] || c.typeLabel([].concat(n['@type'])[0])),
        ...(weapons ? [c.h(n['jrpg:attack'] ?? ''), c.h(n['jrpg:accuracy'] ?? ''), c.h(n['jrpg:critical'] ?? '')] : []),
        ...(armor ? [c.h(n['jrpg:defense'] ?? ''), c.h(n['jrpg:evasionPenalty'] ?? '')] : []),
        c.h(n['jrpg:price'] ?? n['jrpg:priceText'] ?? ''), c.h(n['jrpg:usableBy'] || n['dcterms:description'] || '')]);
      return c.table(cols, rows, { raw: true });
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-spell',
    types: ['jrpg:Spell'],
    render(n, c) {
      const facts = { School: n['jrpg:school'], Level: n['jrpg:spellLevel'] ?? n['jrpg:levelLearned'], Cost: n['jrpg:cost'], Power: n['jrpg:power'], Accuracy: n['jrpg:accuracy'], Element: n['jrpg:element'], Target: n['jrpg:target'] };
      return `<h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}${n['jrpg:nesName'] ? `<span class="badge">NES: ${c.h(n['jrpg:nesName'])}</span>` : ''}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        ${c.images(n).map(c.figure).join('')}
        ${c.stats(Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== undefined && v !== '')))}
        <div class="panel">${c.propsTable(n, { omit: ['jrpg:school', 'jrpg:spellLevel', 'jrpg:levelLearned', 'jrpg:cost', 'jrpg:power', 'jrpg:accuracy', 'jrpg:element', 'jrpg:target', 'jrpg:nesName', 'jrpg:sources'] })}</div>`;
    },
    collection(nodes, c) {
      const sorted = nodes.slice().sort((a, b) => String(a['jrpg:school'] || '').localeCompare(String(b['jrpg:school'] || '')) || (a['jrpg:spellLevel'] ?? a['jrpg:levelLearned'] ?? 0) - (b['jrpg:spellLevel'] ?? b['jrpg:levelLearned'] ?? 0));
      return c.table(['School', 'Lv', 'Spell', 'NES', 'Cost / price', 'Target', 'Effect'], sorted.map(n => [c.h(n['jrpg:school'] || ''), c.h(n['jrpg:spellLevel'] ?? n['jrpg:levelLearned'] ?? ''), c.link(n), c.h(n['jrpg:nesName'] || ''), c.h(n['jrpg:cost'] || n['jrpg:priceText'] || ''), c.h(n['jrpg:target'] || ''), c.h(n['dcterms:description'] || '')]), { raw: true });
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-shop',
    types: ['jrpg:Shop'],
    render(n, c) {
      const place = c.refs(n['jrpg:place'])[0];
      const items = c.nodesOfType('jrpg:Item').concat(c.nodesOfType('jrpg:Spell'));
      const find = name => items.find(i => [c.title(i), i['jrpg:nesName']].filter(Boolean).some(x => String(x).toLowerCase() === String(name).toLowerCase().replace(/_/g, ' ')) || i['@id'].endsWith(':' + String(name).toLowerCase().replace(/_/g, '-')));
      const rows = (n['jrpg:stock'] || []).map(s => { const it = find(s['jrpg:item']); return [it ? c.link(it) : c.h(s['jrpg:item']), c.h(s['jrpg:price'])]; });
      return `<h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}${place ? ` in ${c.link(place)}` : ''}</p>${c.table(['Item', 'Price'], rows, { raw: true })}`;
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-menu',
    types: ['jrpg:MenuScreen'],
    render(n, c) {
      return `<div class="split"><div><h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        <h2>Layout and commands</h2><p>${c.h(n['jrpg:commands'] || '')}</p></div>${c.images(n).map(c.figure).join('')}</div>`;
    },
    card(n, c) {
      const i = c.images(n)[0];
      return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="thumb">${i ? c.img(i) : ''}</div><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h((n['jrpg:commands'] || '').slice(0, 70))}</div></a>`;
    },
  });
})();
