/* World: maps (load on request, the image stays on its host) and places
 * (towns, castles, dungeons and regions all use the jrpg:Place renderer). */
(function () {
  KGraphSite.registerRenderer({
    id: 'jrpg-map',
    types: ['jrpg:Map'],
    render(n, c) {
      const imgs = c.images(n);
      const place = c.refs(n['jrpg:place'])[0];
      const main = imgs[0];
      const local = main && !/^https?:/.test(main['schema:contentUrl']);
      const size = main && main['schema:width'] ? `${main['schema:width']}×${main['schema:height']} px${main['jrpg:tilesWide'] ? ` · about ${main['jrpg:tilesWide']}×${main['jrpg:tilesHigh']} tiles of 16 px` : ''}` : '';
      const credit = main ? `${c.h(main['schema:creditText'] || '')}${main['jrpg:license'] ? ` — ${c.h(main['jrpg:license'])}` : ''}` : '';
      const viewer = !main ? '<p class="muted">No image recorded.</p>' : local
        ? `<div class="map-frame">${c.img(main)}</div>`
        : `<div class="map-frame"><button class="load-map" data-src="${c.h(main['schema:contentUrl'])}" data-alt="${c.h(c.title(n))}" onclick="var i=new Image();i.referrerPolicy='no-referrer';i.alt=this.dataset.alt;i.src=this.dataset.src;this.replaceWith(i)">Load map from ${c.h(new URL(main['schema:contentUrl']).host)}</button></div>`;
      return `<h1>${c.h(c.title(n))}</h1>
        <p class="subtitle">${c.typeBadges(n)}${place ? ` Map of ${c.link(place)}` : ''}${size ? ` <span class="badge">${c.h(size)}</span>` : ''}</p>
        ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        ${viewer}
        <p class="credit">${credit}${main && main['schema:url'] ? ` · <a href="${c.h(main['schema:url'])}" rel="noopener">source</a>` : ''}</p>
        ${imgs.length > 1 ? `<h2>Other versions</h2><ul>${imgs.slice(1).map(i => `<li><a href="${c.h(i['schema:contentUrl'])}" rel="noopener">${c.h(i['schema:caption'] || 'image')}</a></li>`).join('')}</ul>` : ''}`;
    },
    card(n, c) {
      const i = c.images(n)[0];
      const local = i && !/^https?:/.test(i['schema:contentUrl']);
      return `<a class="card" href="${c.nodeHref(n['@id'])}">${local ? `<div class="thumb">${c.img(i)}</div>` : ''}<div class="title">${c.h(c.title(n))}</div><div class="meta">${i && i['jrpg:tilesWide'] ? `${i['jrpg:tilesWide']}×${i['jrpg:tilesHigh']} tiles` : c.h(c.typeLabel([].concat(n['@type'])[0]))}</div></a>`;
    },
  });

  KGraphSite.registerRenderer({
    id: 'jrpg-place',
    types: ['jrpg:Place'],
    render(n, c) {
      const incoming = (c.graph.incoming.get(n['@id']) || []);
      const by = type => [...new Map(incoming.filter(x => x.from['@type'].includes(type) || (type === 'jrpg:StoryMilestone' && x.from['@type'].includes('jrpg:StoryMilestone'))).map(x => [x.from['@id'], x.from])).values()];
      const shops = by('jrpg:Shop');
      const story = by('jrpg:StoryMilestone').sort((a, b) => (a['jrpg:sequence'] || 0) - (b['jrpg:sequence'] || 0));
      const maps = c.refs(n['jrpg:maps']);
      const enemies = c.refs(n['jrpg:enemies']);
      const shot = c.images(n)[0];
      return `<div class="split"><div>
          <h1>${c.h(c.title(n))}</h1>
          <p class="subtitle">${c.typeBadges(n)}${n['jrpg:nesName'] && n['jrpg:nesName'] !== c.title(n) ? `<span class="badge">NES: ${c.h(n['jrpg:nesName'])}</span>` : ''}${n['jrpg:innPrice'] ? `<span class="badge">Inn ${c.h(n['jrpg:innPrice'])}</span>` : ''}</p>
          ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
        </div>${shot ? c.figure(shot) : ''}</div>
        ${maps.length ? `<h2>Maps</h2><div class="grid">${maps.map(m => c.card(m)).join('')}</div>` : ''}
        ${story.length ? `<h2>Story here</h2><ul class="timeline">${story.map(s => `<li><span class="chapter">${c.h(s['jrpg:chapter'] || '')} · step ${c.h(s['jrpg:sequence'])}</span><br>${c.link(s)}</li>`).join('')}</ul>` : ''}
        ${shops.length ? `<h2>Shops</h2><div class="grid">${shops.map(s => `<a class="card" href="${c.nodeHref(s['@id'])}"><div class="title">${c.h(c.title(s))}</div><div class="meta">${(s['jrpg:stock'] || []).length} items</div></a>`).join('')}</div>` : ''}
        ${enemies.length ? `<h2>Enemies</h2><div class="grid">${enemies.map(e => c.card(e)).join('')}</div>` : ''}`;
    },
    card(n, c) {
      return `<a class="card" href="${c.nodeHref(n['@id'])}"><div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h([].concat(n['@type']).map(c.typeLabel).join(', '))}${n['jrpg:nesName'] && n['jrpg:nesName'] !== c.title(n) ? ` · NES: ${c.h(n['jrpg:nesName'])}` : ''}</div></a>`;
    },
  });
})();
