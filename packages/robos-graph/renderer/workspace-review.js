'use strict';
(() => {
  const el = id => document.getElementById(id);
  const presentation = window.WorkspacePresentation;
  let proposal = null;
  const input = () => ({ prompt: el('workspace-prompt').value, query: el('workspace-scope').value });
  function discard() { proposal = null; el('workspace-apply').disabled = true; el('workspace-diff').textContent = ''; }
  async function updateInfo() {
    const info = await window.sdlcGraph.workspaceInfo();
    await window.RobosGraphStatus?.refresh();
    if (!info) return;
    const oldCopilot = document.querySelector('.copilot-bar');
    if (oldCopilot) oldCopilot.hidden = true;
    el('workspace-coverage-details').hidden = !info.sourceSummary;
    el('workspace-coverage').replaceChildren(...(info.sourceSummary ? [presentation.value(info.sourceSummary), presentation.raw(info.sourceSummary)] : []));
    el('workspace-summary').textContent = `${info.title} · ${info.nodeCount} nodes`;
    el('workspace-revision').textContent = `Revision ${info.revision.slice(0, 12)} · ${info.root}`;
    el('workspace-packages').replaceChildren(...Object.entries(info.packages).map(([name, count]) => {
      const span = document.createElement('span');
      span.textContent = `${name}: ${count}`;
      span.style.cssText = 'background:#1f2937;padding:5px 9px;border-radius:6px';
      return span;
    }));
  }
  function preview(p, questions = []) {
    proposal = p;
    const { delta, conflicts, stale, validation } = p;
    el('workspace-status').textContent = `${delta.added.length} added · ${delta.changed.length} changed · ${delta.removed.length} removed · ${conflicts.length} conflicts · ${validation.errors.length} validation errors`;
    presentation.preview(el('workspace-diff'), p, questions);
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
    presentation.brief(el('workspace-context-output'), brief);
    el('workspace-context-details').open = true;
    el('workspace-status').textContent = `${brief.nodes.length} of ${brief.totalMatches} matching records included. Review the evidence, then ask your AI agent or import its edits under Advanced.`;
  });
  action('workspace-agent', async () => {
    discard(); el('workspace-status').textContent = 'Asking your AI agent for a proposal. A CLI agent can take a minute…';
    const result = await window.sdlcGraph.askWorkspaceAgent(input());
    preview(result.proposal, result.questions);
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
