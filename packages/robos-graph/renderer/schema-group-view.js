'use strict';
window.RobosSchemaGroupView = (() => {
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  function render(container, group, nodes) {
    const byId = new Map(nodes.map(node => [node['@id'], node]));
    const label = window.RobosInspectorPropertyGroups.label;
    const inspect = (id, title) => {
      const button = el('button', title || id, 'btn btn-secondary btn-sm');
      button.dataset.inspectId = id;
      return button;
    };
    function valueView(value) {
      const block = el('div', undefined, 'schema-value');
      if (Array.isArray(value)) {
        const list = el('ul');
        let shown = 0;
        const more = el('button', '', 'btn btn-secondary schema-array-more');
        const appendPage = () => {
          more.remove();
          for (const entry of value.slice(shown, shown + 40)) { const item = el('li'); item.append(valueView(entry)); list.append(item); }
          shown = Math.min(value.length, shown + 40);
          if (shown < value.length) { more.textContent = `Show more values (${value.length - shown} remaining)`; block.append(more); }
        };
        block.append(list); more.addEventListener('click', appendPage); appendPage(); return block;
      }
      const id = typeof value === 'string' ? value : value?.['@id'];
      if (byId.has(id)) block.append(inspect(id, byId.get(id)['dcterms:title'] || id));
      else if (value && typeof value === 'object' && value['@id']) {
        block.append(el('code', id), el('span', ' — reference not available in this graph', 'schema-unresolved'));
      } else if (value && typeof value === 'object') block.append(el('pre', JSON.stringify(value, null, 2), 'json-pre'));
      else {
        const url = window.RobosInspector.safeUrl(value);
        if (url) { const link = el('a', value); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; block.append(link); }
        else block.append(el('span', value));
      }
      if (value && typeof value === 'object' && value['@id']) {
        const embedded = Object.entries(value).filter(([key]) => key !== '@id');
        if (embedded.length) block.append(fieldsView(embedded.map(([predicate, value]) => ({ predicate, value }))));
      }
      return block;
    }
    function fieldsView(fields) {
      const fieldsEl = el('dl', undefined, 'schema-fields');
      for (const field of fields) {
        const wrapper = el('div', undefined, 'schema-property'); wrapper.dataset.predicate = field.predicate;
        const name = el('dt', label(field.predicate)); name.title = field.predicate;
        const value = el('dd'); value.append(valueView(field.value)); wrapper.append(name, value); fieldsEl.append(wrapper);
      }
      return fieldsEl;
    }
    const view = el('section', undefined, 'schema-group-view'); view.dataset.group = group.id;
    view.append(el('h2', group.label));
    const selected = byId.get(group.nodeId);
    if (selected) view.append(el('h3', selected['dcterms:title'] || selected['@id'], 'schema-subject'));
    if (selected?.['dcterms:description']) view.append(el('p', selected['dcterms:description'], 'schema-description'));
    if (group.description) view.append(el('p', group.description));
    if (group.fields.length) view.append(fieldsView(group.fields));
    if (window.RobosTryItRunner && window.RobosTryItRunner.hasEndpoints(selected, nodes)) {
      window.RobosTryItRunner.render(view, selected, nodes);
    }
    const sections = new Map(), unique = new Map();
    for (const relation of group.related) {
      const id = relation.node['@id'];
      if (!unique.has(id)) unique.set(id, { node: relation.node, links: [] });
      unique.get(id).links.push(relation);
    }
    const typeLabels = { MCPTool: 'Actions / tools', MCPResource: 'Resources', MCPPrompt: 'Prompts',
      APIEndpoint: 'Endpoints', Microservice: 'Services', Contract: 'Contracts', ProtobufContract: 'Protobuf contracts',
      DatabaseSchema: 'Schemas', DatabaseTable: 'Tables', DatabaseColumn: 'Columns', DatabaseIndex: 'Indexes',
      PipelineStage: 'Stages', PipelineJob: 'Jobs', PipelineStep: 'Steps', WebRoute: 'Routes', CLICommand: 'Commands',
      Scenario: 'Scenarios', ScenarioStep: 'Steps', LearningModule: 'Modules', LearningLesson: 'Lessons' };
    for (const item of unique.values()) {
      const types = [].concat(item.node['@type'] || []).map(window.RobosInspectorPropertyGroups.compact);
      const type = (types.find(type => type.startsWith('robos:')) || types[0] || 'Objects').split(':').pop();
      const heading = typeLabels[type] || label(type);
      if (!sections.has(heading)) sections.set(heading, []);
      sections.get(heading).push(item);
    }
    for (const [heading, relations] of sections) {
      const section = el('section', undefined, 'schema-relation-group');
      section.append(el('h3', `${heading} (${relations.length})`));
      let shown = 0;
      const more = el('button', 'Show more', 'btn btn-secondary');
      const appendPage = () => {
        more.remove();
        for (const { node, links } of relations.slice(shown, shown + 40)) {
          const card = el('article', undefined, 'inspector-card schema-related-node'); card.dataset.nodeId = node['@id'];
          card.append(inspect(node['@id'], node['dcterms:title'] || node['@id']));
          card.append(el('code', Array.isArray(node['@type']) ? node['@type'].join(', ') : node['@type'] || ''));
          if (node['dcterms:description']) card.append(el('p', node['dcterms:description'], 'schema-description'));
          card.append(el('p', links.map(link => `${link.direction === 'incoming' ? 'Incoming' : 'Outgoing'}: ${link.predicate}`).join(' · '), 'schema-relation-context'));
          const summary = new Map();
          for (const candidate of window.RobosInspectorPropertyGroups.groups(node, nodes)) for (const field of candidate.fields) summary.set(field.predicate, field);
          const fields = [...summary.values()];
          card.append(fieldsView(fields.slice(0, 16)));
          if (fields.length > 16) card.append(el('p', `${fields.length - 16} more properties are available by opening this object.`));
          if (window.RobosInspector.capabilities(node, nodes).evidence.length) {
            const evidence = el('button', 'Source Evidence', 'btn btn-secondary btn-sm');
            evidence.addEventListener('click', async () => { await window.selectNode(node['@id']); await window.switchTab('evidence'); });
            card.append(evidence);
          }
          section.append(card);
        }
        shown = Math.min(relations.length, shown + 40);
        if (shown < relations.length) { more.textContent = `Show more (${relations.length - shown} remaining)`; section.append(more); }
      };
      more.addEventListener('click', appendPage); appendPage(); view.append(section);
    }
    container.append(view);
  }
  return { render };
})();
