'use strict';
window.RobosGraphStatus = (() => {
  let revision = 0;
  const count = value => Number.isInteger(value) && value >= 0 ? value : null;
  const text = value => typeof value === 'string' && value.trim() ? value : null;
  const set = (id, value, title = value) => {
    const element = document.getElementById(id);
    if (!element) return;
    if (element.textContent !== value) element.textContent = value;
    element.title = title;
  };
  function updateNodeCount(value) {
    const total = count(value);
    set('graph-status-nodes', `Nodes: ${total === null ? '—' : total.toLocaleString()}`);
  }
  function render(info) {
    const name = text(info?.title) || 'Knowledge graph';
    const location = text(info?.root) || text(info?.path) || 'Location unavailable';
    const schemaCount = count(info?.schemaCount);
    set('graph-status-name', name);
    set('graph-status-path', location);
    updateNodeCount(info?.nodeCount);
    set('graph-status-schemas', `Schemas: ${schemaCount === null ? '—' : schemaCount.toLocaleString()}`,
      'Registered validation schemas');
  }
  async function refresh(info) {
    const request = ++revision;
    try {
      const metadata = info ?? (window.sdlcGraph.graphInfo
        ? await window.sdlcGraph.graphInfo()
        : await window.sdlcGraph.workspaceInfo());
      if (request === revision) render(metadata);
      return metadata;
    } catch (error) {
      if (request === revision) {
        render(null);
        set('graph-status-name', 'Graph metadata unavailable', String(error?.message || error));
      }
      return null;
    }
  }
  return { refresh, updateNodeCount };
})();
