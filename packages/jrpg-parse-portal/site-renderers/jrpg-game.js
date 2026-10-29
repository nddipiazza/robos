/* JRPG game home page: the game, its asset coverage and its fan sources. */
(function () {
  const ASSETS = [
    ['World map', ['jrpg:WorldMap']], ['Area maps', ['jrpg:AreaMap']], ['Places', ['jrpg:Place']],
    ['Playable classes', ['jrpg:PlayableClass']], ['NPCs', ['jrpg:NPC']], ['Enemies', ['jrpg:Enemy']], ['Bosses', ['jrpg:Boss']],
    ['Encounter formations', ['jrpg:EncounterFormation']], ['Weapons', ['jrpg:Weapon']], ['Armor', ['jrpg:Armor']],
    ['Items', ['jrpg:Consumable', 'jrpg:KeyItem']], ['Spells', ['jrpg:Spell']], ['Shops', ['jrpg:Shop']], ['Menus', ['jrpg:MenuScreen']],
    ['Rule engine', ['jrpg:Rule']], ['Story milestones', ['jrpg:StoryMilestone']], ['Music', ['jrpg:MusicTrack']],
  ];
  KGraphSite.registerRenderer({
    id: 'jrpg-game',
    types: ['jrpg:Game'],
    render(n, c) {
      const img = c.images(n)[0];
      const coverage = ASSETS.map(([label, types]) => {
        const count = types.reduce((s, t) => s + c.nodesOfType(t).length, 0);
        return `<a href="${c.typeHref(types[0])}" class="${count ? '' : 'muted'}"><span>${c.h(label)}</span><span class="n">${count}</span></a>`;
      }).join('');
      const sources = c.nodesOfType('jrpg:Source');
      const facts = ['jrpg:platform', 'jrpg:region', 'jrpg:year', 'jrpg:developer', 'jrpg:publisher'].filter(k => n[k]).map(k => `<span class="badge">${c.h(n[k])}</span>`).join('');
      return `<div class="split"><div>
          <h1>${c.h(c.title(n))}</h1><p class="subtitle">${facts}</p>
          <p class="lead">${c.h(n['dcterms:description'] || '')}</p>
          ${n['jrpg:story'] ? `<h2>Story</h2><p>${c.h(n['jrpg:story'])}</p>` : ''}
        </div>${img ? c.figure(img) : ''}</div>
        <h2>What a remake needs</h2><div class="coverage">${coverage}</div>
        <h2>Fan resources</h2>
        ${c.table(['Source', 'Kind', 'Status', 'License'], sources.map(s => [c.link(s), c.h(s['jrpg:sourceKind'] || ''), c.h(s['jrpg:status'] || ''), c.h(s['jrpg:license'] || '')]), { raw: true })}
        <p class="muted">This graph is unofficial fan research. Facts are cited to the sources above; images and maps are linked where they are hosted, with credit.</p>`;
    },
  });
})();
