'use strict';
(() => {
  const el = id => document.getElementById(id);
  let proposal = null;
  const input = () => ({ prompt: el('workspace-prompt').value, query: el('workspace-scope').value });
  function discard() { proposal = null; el('workspace-apply').disabled = true; el('workspace-diff').textContent = ''; }
  async function updateInfo() {
    const info = await window.sdlcGraph.workspaceInfo();
    if (!info) return;
    const oldCopilot = document.querySelector('.copilot-bar');
    if (oldCopilot) oldCopilot.hidden = true;
    el('stat-traceability-status').textContent = info.validation.conforms ? 'STRUCTURE VALID' : 'NEEDS REVIEW';
    el('stat-traceability-status').nextElementSibling.textContent = 'Source evidence and validation';
    el('stat-bdd-scenarios').textContent = `${nodes.filter(n => [].concat(n['@type']).includes('robos:Scenario')).length} Scenarios`;
    el('workspace-coverage-details').hidden = !info.sourceSummary;
    el('workspace-coverage').textContent = info.sourceSummary ? JSON.stringify(info.sourceSummary, null, 2) : '';
    el('workspace-summary').textContent = `${info.title} · ${info.nodeCount} nodes`;
    el('workspace-revision').textContent = `Revision ${info.revision.slice(0, 12)} · ${info.root}`;
    el('workspace-packages').replaceChildren(...Object.entries(info.packages).map(([name, count]) => {
      const span = document.createElement('span');
      span.textContent = `${name}: ${count}`;
      span.style.cssText = 'background:#1f2937;padding:5px 9px;border-radius:6px';
      return span;
    }));
  }
  function preview(p) {
    proposal = p;
    const { delta, conflicts, stale, validation } = p;
    el('workspace-status').textContent = `${delta.added.length} added · ${delta.changed.length} changed · ${delta.removed.length} removed · ${conflicts.length} conflicts · ${validation.errors.length} validation errors`;
    el('workspace-diff').textContent = JSON.stringify({ changes: delta, conflicts, stale, validation, sourceEvidence: p.candidate['robos:nodes'].filter(n => delta.added.some(a => a['@id'] === n['@id']) || delta.changed.some(c => c.id === n['@id'])).map(n => ({ id: n['@id'], evidence: n['robos:evidence'] })) }, null, 2);
    el('workspace-apply').disabled = !validation.conforms || !!conflicts.length;
  }
  function action(id, fn) {
    el(id).addEventListener('click', async () => {
      const button = el(id);
      button.disabled = true;
      try { await fn(); }
      catch (error) { el('workspace-status').textContent = error.message; }
      finally { button.disabled = id === 'workspace-apply' ? !proposal || !proposal.validation.conforms || !!proposal.conflicts.length : false; }
    });
  }
  action('btn-workspace-review', async () => { el('workspace-review').showModal(); await updateInfo(); });
  action('workspace-close', async () => el('workspace-review').close());
  action('workspace-open', async () => {
    const selected = await window.sdlcGraph.openWorkspace();
    if (selected) { discard(); await load(); await updateInfo(); }
  });
  action('workspace-context', async () => {
    const brief = await window.sdlcGraph.workspaceContext(input());
    el('workspace-context-output').textContent = JSON.stringify(brief, null, 2);
    el('workspace-context-details').open = true;
    el('workspace-status').textContent = `${brief.nodes.length} of ${brief.totalMatches} matching nodes included. Use this brief with your coding agent and paste its proposed edits below.`;
  });
  action('workspace-agent', async () => {
    discard(); el('workspace-status').textContent = 'Preparing a proposal with the configured agent…';
    const result = await window.sdlcGraph.askWorkspaceAgent(input());
    preview(result.proposal);
    if (result.questions.length) el('workspace-diff').textContent += '\nOpen questions:\n' + JSON.stringify(result.questions, null, 2);
  });
  action('workspace-propose', async () => { discard(); const file = el('workspace-file').files[0]; const edits = JSON.parse(file ? await file.text() : el('workspace-edits').value); preview(await window.sdlcGraph.proposeWorkspace({ ...edits, prompt: el('workspace-prompt').value || edits.prompt || '' })); });
  action('workspace-apply', async () => {
    if (!proposal) return;
    const result = await window.sdlcGraph.applyWorkspace({ id: proposal.id });
    discard(); await load(); await updateInfo();
    el('workspace-status').textContent = `Saved revision ${result.revision.slice(0, 12)}. Continue refining or close to inspect the graph.`;
  });
  action('workspace-discard', async () => { discard(); el('workspace-status').textContent = 'Proposal discarded. The accepted graph is unchanged.'; });
  el('workspace-file').addEventListener('change', () => { el('workspace-edits').value = ''; discard(); });
  el('workspace-edits').addEventListener('input', () => { el('workspace-file').value = ''; discard(); });
  window.addEventListener('DOMContentLoaded', () => updateInfo().catch(error => { el('workspace-status').textContent = error.message; }));
})();
