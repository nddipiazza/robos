/* Characters: a base renderer for anything with sprites and stats, and
 * specific ones for enemies (bestiary) and playable classes. Bosses have no
 * renderer of their own and use the enemy one through jrpg:Boss → jrpg:Enemy. */
(function () {
  const sprites = (n, c) => {
    const imgs = c.images(n);
    return imgs.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">${imgs.map(c.figure).join('')}</div>` : '';
  };
  const sourcesLine = (n, c) => {
    const refs = c.refs(n['jrpg:sources']);
    const page = n['jrpg:wikiPage'];
    return `<p class="muted">Sources: ${refs.map(r => c.link(r)).join(', ')}${page ? ` · <a href="${c.h(page['schema:url'])}" rel="noopener">${c.h(page['dcterms:title'])}</a>` : ''}</p>`;
  };

  KGraphSite.registerRenderer({
    id: 'jrpg-character',
    types: ['jrpg:Character'],
    render(n, c) {
      return `<h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}${n['jrpg:nesName'] ? `<span class="badge">NES: ${c.h(n['jrpg:nesName'])}</span>` : ''}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        ${sprites(n, c)}
        <div class="panel">${c.propsTable(n, { omit: ['jrpg:sources', 'jrpg:wikiPage', 'jrpg:nesName'] })}</div>
        ${sourcesLine(n, c)}${c.incomingList(n)}`;
    },
    card(n, c) {
      const img = c.images(n)[0];
      return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="thumb">${img ? c.img(img) : ''}</div><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(n['jrpg:nesName'] || '')}</div></a>`;
    },
  });

  const STAT_ORDER = ['hp', 'attack', 'defense', 'magic defense', 'agility', 'accuracy', 'evasion', 'intellect', 'exp', 'gil', 'hits', 'crit', 'morale'];
  const enemyStats = n => {
    const s = n['jrpg:stats'];
    if (s) return Object.fromEntries(STAT_ORDER.filter(k => s[k] !== undefined).map(k => [k.toUpperCase(), s[k]]).concat(Object.entries(s).filter(([k]) => !STAT_ORDER.includes(k)).map(([k, v]) => [k.toUpperCase(), v])));
    // Dragon Warrior style flat fields.
    const flat = {};
    for (const [k, label] of [['jrpg:hp', 'HP'], ['jrpg:strength', 'STR'], ['jrpg:agility', 'AGI'], ['jrpg:experience', 'EXP'], ['jrpg:gold', 'GOLD'], ['jrpg:resistSleep', 'Sleep resist'], ['jrpg:resistStopspell', 'Stopspell resist'], ['jrpg:resistHurt', 'Hurt resist'], ['jrpg:dodge', 'Dodge']]) if (n[k] !== undefined) flat[label] = n[k];
    return flat;
  };

  KGraphSite.registerRenderer({
    id: 'jrpg-enemy',
    types: ['jrpg:Enemy'],
    render(n, c) {
      const img = c.images(n)[0];
      const elements = n['jrpg:elements'] ? Object.entries(n['jrpg:elements']).map(([k, v]) => `<span class="badge">${c.h(k)}: ${c.h(v)}</span>`).join('') : '';
      return `<div class="split"><div>
          <h1>${c.h(c.title(n))}</h1>
          <p class="subtitle">${c.typeBadges(n)}${n['jrpg:nesName'] ? `<span class="badge">NES: ${c.h(n['jrpg:nesName'])}</span>` : ''}${n['jrpg:family'] ? `<span class="badge">${c.h(n['jrpg:family'])}</span>` : ''}</p>
          ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        </div>${img ? c.figure(img) : ''}</div>
        <h2>Stats</h2>${c.stats(enemyStats(n))}
        ${elements ? `<h2>Elements</h2><p>${elements}</p>` : ''}
        ${n['jrpg:abilities'] ? `<h2>Abilities</h2><p>${c.h(n['jrpg:abilities'])}</p>` : ''}
        ${n['jrpg:locations'] ? `<h2>Found in</h2><p>${c.h(n['jrpg:locations'])}</p>` : ''}
        ${sourcesLine(n, c)}
        ${c.incomingList(n, { heading: 'Appears in' })}`;
    },
    card(n, c) {
      const img = c.images(n)[0];
      const s = n['jrpg:stats'] || {};
      const hp = s.hp ?? n['jrpg:hp'];
      return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="thumb">${img ? c.img(img) : ''}</div><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(n['jrpg:nesName'] || '')}${hp !== undefined ? ` · HP ${c.h(hp)}` : ''}</div></a>`;
    },
    collection(nodes, c) {
      const rows = nodes.map(n => {
        const s = n['jrpg:stats'] || {};
        const img = c.images(n)[0];
        return [img ? c.img(img, { style: 'max-height:40px' }) : '', c.link(n), c.h(n['jrpg:nesName'] || ''),
          c.h(s.hp ?? n['jrpg:hp'] ?? ''), c.h(s.attack ?? n['jrpg:strength'] ?? ''), c.h(s.defense ?? n['jrpg:agility'] ?? ''),
          c.h(s.exp ?? n['jrpg:experience'] ?? ''), c.h(s.gil ?? n['jrpg:gold'] ?? ''), n['@type'].includes('jrpg:Boss') ? '<span class="badge accent">Boss</span>' : ''];
      });
      const flat = nodes.some(n => !n['jrpg:stats']);
      return c.table(['', 'Name', 'NES name', 'HP', flat ? 'STR/ATK' : 'ATK', flat ? 'AGI/DEF' : 'DEF', 'EXP', flat ? 'Gold' : 'Gil', ''], rows, { raw: true });
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-class',
    types: ['jrpg:PlayableClass'],
    render(n, c) {
      const up = c.refs(n['jrpg:upgradesTo'])[0];
      const from = c.refs(n['jrpg:upgradeOf'])[0];
      return `<h1>${c.h(c.title(n))}</h1>
        <p class="subtitle">${c.typeBadges(n)}${n['jrpg:nesName'] ? `<span class="badge">NES: ${c.h(n['jrpg:nesName'])}</span>` : ''}${up ? ` Class change → ${c.link(up)}` : ''}${from ? ` Class change of ${c.link(from)}` : ''}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        <h2>Sprites</h2>${sprites(n, c) || '<p class="muted">No sprites recorded.</p>'}
        ${n['jrpg:initialStats'] ? `<h2>Starting stats</h2>${c.stats(n['jrpg:initialStats'])}` : ''}
        ${n['jrpg:weapons'] ? `<h2>Equipment</h2><p><b>Weapons:</b> ${c.h(n['jrpg:weapons'])}</p><p><b>Armor:</b> ${c.h(n['jrpg:armor'] || '')}</p>` : ''}
        ${sourcesLine(n, c)}`;
    },
    collection(nodes, c) {
      return `<div class="grid">${nodes.map(n => {
        const imgs = c.images(n);
        return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="thumb">${imgs.slice(0, 2).map(i => c.img(i)).join(' ')}</div><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(n['jrpg:nesName'] || '')}</div></a>`;
      }).join('')}</div>`;
    },
  });
})();
