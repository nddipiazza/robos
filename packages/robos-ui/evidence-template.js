/* Templates select named slots; captured text is never interpreted as HTML. */
'use strict';
(() => {
  const make = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  class EvidenceView extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    set evidence(value) { this.value = value; this.render(); }
    render() {
      const root = this.shadowRoot;
      root.replaceChildren();
      const bundle = this.value;
      if (!bundle?.template) return;
      const style = make('style');
      style.textContent = `:host{display:block;color:var(--text-primary,#dce3ec);font:14px/1.5 system-ui}*{box-sizing:border-box}h3,h4,p{margin:0 0 10px}small{color:#9daaba}header{margin-bottom:20px}details{border:1px solid #36404c;border-radius:5px;margin:12px 0;background:var(--bg-card,#161b22)}summary{cursor:pointer;padding:14px 16px;display:flex;gap:12px;align-items:center}summary span:first-child{flex:1}summary::before{content:"▸";color:#9daaba}details[open]>summary::before{content:"▾"}.status{font-size:12px;color:#c5cfdb;white-space:nowrap}.failed,.blocked{color:#f3bc72}.body{padding:0 16px 16px}.slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));gap:14px}.slot{min-width:0}h4{font-size:13px;font-weight:600}pre{margin:8px 0;padding:12px;background:#0d1117;border:1px solid #303b48;white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font:12px/1.6 ui-monospace,monospace}button{background:none;border:1px solid #526171;color:inherit;border-radius:4px;padding:6px 10px;cursor:pointer}img{max-width:100%;max-height:420px;object-fit:contain} .source{font-size:12px;color:#9daaba;overflow-wrap:anywhere}.missing{color:#f3bc72} .metadata{margin:16px 0;font-size:12px} .metadata summary{padding:8px 12px}`;
      root.append(style);
      const header = make('header');
      header.append(make('h3', bundle.template['dcterms:title']));
      header.append(make('small', 'Captured ' + (bundle.finishedAt || 'date not recorded') + ' · Revision ' + (bundle.revision || 'not recorded').slice(0, 12)));
      if (bundle.regeneration?.note) header.append(make('p', bundle.regeneration.note, 'source'));
      if (bundle.limitations?.length) { const limitations=make('details'); limitations.append(make('summary','What remains unverified')); const list=make('ul'); for(const text of bundle.limitations)list.append(make('li',text)); limitations.append(list); header.append(limitations); }
      root.append(header);
      for (const [index, scenario] of (bundle.scenarios || []).entries()) {
        const section = make('details');
        const summary = make('summary');
        summary.append(make('span', scenario.title || scenario.id), make('span', scenario.status === 'passed' ? 'Captured' : scenario.status, 'status ' + scenario.status));
        section.append(summary);
        let loaded = false;
        const load = () => {
          if (loaded || !section.open) return;
          loaded = true;
          const body = make('div', '', 'body');
          body.append(make('p', scenario.summary));
          const slots = make('div', '', 'slots');
          for (const slot of bundle.template['robos:artifactSlots']) {
            const artifacts = (bundle.templateBindings || []).filter(b => b.scenarioId === scenario.id && b.slotId === slot.id).map(b => bundle.artifacts.find(a => a.id === b.artifactId)).filter(Boolean);
            if (!artifacts.length && !slot.required) continue;
            const card = make('section', '', 'slot'); card.append(make('h4', slot.name));
            if (!artifacts.length) card.append(make('p', 'Not captured', 'missing'));
            for (const artifact of artifacts) {
              const capture = make('details'); capture.append(make('summary', artifact.label || slot.name));
              let read = false;
              capture.addEventListener('toggle', async () => {
                if (!capture.open || read) return;
                read = true;
                const content = make('div', '', 'body'); capture.append(content);
                content.append(make('p', artifact.source || 'Capture environment not recorded', 'source'));
                if (slot.kind === 'screenshot') {
                  const image = make('img'); image.alt = artifact.label || slot.name;
                  image.src = 'robos-evidence://screenshot/' + artifact.id; content.append(image);
                } else if (slot.kind === 'text' && this.readArtifact) {
                  const pre = make('pre', 'Loading capture…'); content.append(pre);
                  try {
                    const result = await this.readArtifact(artifact.id);
                    if (!result.ok) throw Error(result.error || 'Unable to read capture');
                    const lines = result.text.split('\n');
                    pre.textContent = lines.slice(0, 40).join('\n').slice(0, 6000);
                    if (pre.textContent !== result.text) {
                      const expand = make('button', 'Show more captured output');
                      expand.onclick = () => { pre.textContent = result.text; expand.remove(); };
                      content.append(expand);
                    }
                    if (result.truncated) content.append(make('p', 'File preview limited to 128 KB.', 'source'));
                  } catch (error) { pre.textContent = error.message; }
                } else content.append(make('p', artifact.path, 'source'));
              });
              card.append(capture);
              if (artifacts.length === 1) capture.open = true;
            }
            slots.append(card);
          }
          body.append(slots); section.append(body);
        };
        section.addEventListener('toggle', load); root.append(section);
        if (index === 0) { section.open = true; load(); }
      }
      const metadata = make('details', '', 'metadata');
      metadata.append(make('summary', 'Evidence template'), make('p', bundle.template['@id'] + ' · version ' + bundle.template['robos:version']));
      root.append(metadata);
    }
  }
  for (const name of ['robos-evidence-transcript', 'robos-evidence-gallery', 'robos-evidence-checks']) {
    if (!customElements.get(name)) customElements.define(name, class extends EvidenceView {});
  }
})();
