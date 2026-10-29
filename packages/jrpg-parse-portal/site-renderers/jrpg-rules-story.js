/* Rule engine (formulas, stats, statuses, elements, tables), story
 * progression and music. */
(function () {
  KGraphSite.registerRenderer({
    id: 'jrpg-rule',
    types: ['jrpg:Rule'],
    render(n, c) {
      const page = n['jrpg:wikiPage'];
      return `<h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}</p>
        ${n['dcterms:description'] ? `<pre class="rule">${c.h(n['dcterms:description'])}</pre>` : ''}
        ${n['jrpg:expression'] ? `<pre class="rule">${c.h(n['jrpg:expression'])}</pre>` : ''}
        ${n['jrpg:columns'] ? c.table(n['jrpg:columns'], n['jrpg:rows'] || []) : ''}
        <p class="muted">Sources: ${c.refs(n['jrpg:sources']).map(s => c.link(s)).join(', ')}${page ? ` · <a href="${c.h(page['schema:url'])}" rel="noopener">${c.h(page['dcterms:title'])}</a>` : ''}</p>`;
    },
    card(n, c) {
      const text = n['dcterms:description'] || n['jrpg:expression'] || (n['jrpg:rows'] ? `${n['jrpg:rows'].length} rows` : '');
      return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(c.typeLabel([].concat(n['@type'])[0]))} · ${c.h(String(text).slice(0, 90))}</div></a>`;
    },
  });

  const chip = (c, refs) => refs.map(r => c.link(r)).join(', ') || '<span class="muted">—</span>';

  KGraphSite.registerRenderer({
    id: 'jrpg-milestone',
    types: ['jrpg:StoryMilestone'],
    render(n, c) {
      const all = c.nodesOfType('jrpg:StoryMilestone');
      const next = all.find(m => (c.refs(m['jrpg:after'])[0] || {})['@id'] === n['@id']);
      const prev = c.refs(n['jrpg:after'])[0];
      const place = c.refs(n['jrpg:place'])[0];
      const boss = c.refs(n['jrpg:boss'])[0];
      const wt = n['jrpg:walkthrough'];
      return `<p class="muted">${c.h(n['jrpg:chapter'] || '')} · step ${c.h(n['jrpg:sequence'])}${n['jrpg:optional'] ? ' · optional' : ''}</p>
        <h1>${c.h(c.title(n))}</h1>
        <div class="panel"><table class="props">
          ${place ? `<tr><th>Where</th><td>${c.link(place)}</td></tr>` : n['jrpg:where'] ? `<tr><th>Where</th><td>${c.h(n['jrpg:where'])}</td></tr>` : ''}
          ${boss ? `<tr><th>Boss</th><td>${c.card(boss)}</td></tr>` : n['jrpg:bossName'] ? `<tr><th>Boss</th><td>${c.h(n['jrpg:bossName'])}</td></tr>` : ''}
          <tr><th>Needs</th><td>${chip(c, c.refs(n['jrpg:requires']))}</td></tr>
          <tr><th>Unlocks</th><td>${chip(c, c.refs(n['jrpg:grants']))}</td></tr>
          ${n['jrpg:minLevel'] ? `<tr><th>Suggested level</th><td>${c.h(n['jrpg:minLevel'])}</td></tr>` : ''}
          ${n['jrpg:doneWhen'] ? `<tr><th>Done when</th><td class="mono">${c.h(n['jrpg:doneWhen'])}</td></tr>` : ''}
          ${wt ? `<tr><th>Walkthrough</th><td><a href="${c.h(wt['schema:url'])}" rel="noopener">${c.h(wt['dcterms:title'])}</a></td></tr>` : ''}
        </table></div>
        <p>${prev ? `← ${c.link(prev)}` : ''}${prev && next ? ' · ' : ''}${next ? `${c.link(next)} →` : ''}</p>`;
    },
    collection(nodes, c) {
      const groups = [];
      for (const n of nodes) {
        const ch = n['jrpg:chapter'] || '';
        if (!groups.length || groups[groups.length - 1].ch !== ch) groups.push({ ch, items: [] });
        groups[groups.length - 1].items.push(n);
      }
      return groups.map(g => `<h2>${c.h(g.ch)}</h2><ul class="timeline">${g.items.map(n => {
        const grants = c.refs(n['jrpg:grants']);
        return `<li class="${n['jrpg:optional'] ? 'optional' : ''}"><span class="chapter">Step ${c.h(n['jrpg:sequence'])}${n['jrpg:optional'] ? ' · optional' : ''}</span><br>${c.link(n)}${grants.length ? `<div class="muted">Unlocks: ${grants.map(x => c.h(c.title(x))).join(', ')}</div>` : ''}</li>`;
      }).join('')}</ul>`).join('');
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-music',
    types: ['jrpg:MusicTrack'],
    render(n, c) {
      const fans = n['jrpg:fanArrangements'] || [];
      const page = n['jrpg:wikiPage'];
      return `<h1>${c.h(c.title(n))}</h1><p class="subtitle">${c.typeBadges(n)}${n['jrpg:track'] ? `<span class="badge">Track ${c.h(n['jrpg:track'])}</span>` : ''}${n['jrpg:length'] ? `<span class="badge">${c.h(n['jrpg:length'])}</span>` : ''}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        ${n['jrpg:album'] ? `<p class="muted">${c.h(n['jrpg:album'])}${page ? ` · <a href="${c.h(page['schema:url'])}" rel="noopener">${c.h(page['dcterms:title'])}</a>` : ''}</p>` : ''}
        ${fans.length ? `<h2>Fan arrangements</h2>${c.table(['Arrangement', 'Format', 'Arranger'], fans.map(f => [`<a href="${c.h(f['schema:contentUrl'])}" rel="noopener">${c.h(f['schema:name'])}</a>`, c.h(f['jrpg:format'] || ''), c.h(f['schema:creator'] || '')]), { raw: true })}<p class="credit">${c.h(fans[0]['schema:creditText'] || '')}</p>` : ''}`;
    },
    collection(nodes, c) {
      return c.table(['#', 'Theme', 'Length', 'Where it plays', 'Fan arrangements'], nodes.map(n => [c.h(n['jrpg:track'] ?? ''), c.link(n), c.h(n['jrpg:length'] || ''), c.h(n['dcterms:description'] || ''), c.h((n['jrpg:fanArrangements'] || []).length || '')]), { raw: true });
    },
  });
})();
