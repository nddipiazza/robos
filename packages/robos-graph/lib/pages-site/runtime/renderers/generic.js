/* Generic renderer: used for any node whose type and parent types have no
 * renderer of their own. Shows title, types, description, images, every
 * property and what links to the node. */
KGraphSite.registerRenderer({
  id: 'generic',
  types: [],
  render(n, c) {
    const imgs = c.images(n);
    return `<h1>${c.h(c.title(n))}</h1>
      <p class="subtitle">${c.typeBadges(n)}</p>
      ${n['dcterms:description'] ? `<p class="lead">${c.h(n['dcterms:description'])}</p>` : ''}
      ${imgs.length ? `<div class="grid">${imgs.map(c.figure).join('')}</div>` : ''}
      <div class="panel">${c.propsTable(n) || '<span class="muted">No other properties.</span>'}</div>
      ${c.incomingList(n)}`;
  },
  card(n, c) {
    const img = c.images(n)[0];
    const types = [].concat(n['@type'] || []).map(c.typeLabel).join(', ');
    return `<a class="card" href="${c.nodeHref(n['@id'])}">${img ? `<div class="thumb">${c.img(img)}</div>` : ''}<div class="title">${c.h(c.title(n))}</div><div class="meta">${c.h(types)}</div></a>`;
  },
});
