'use strict';
// Renders the task's evidence bundle. Safe to call again while an agent is regenerating it:
// the previous view stays on screen until the new one is ready, so the page never flashes.
window.renderTaskEvidence = async function () {
  const stage = document.getElementById('stage-5');
  if (!stage) return;
  const first = !stage.querySelector('[data-evidence-heading]');
  let heading = stage.querySelector('[data-evidence-heading]');
  let state = stage.querySelector('[data-evidence-state]');
  if (first) {
    stage.replaceChildren();
    heading = document.createElement('h3'); heading.textContent = 'Evidence'; heading.dataset.evidenceHeading = '';
    state = document.createElement('p'); state.textContent = 'Loading captured evidence…'; state.dataset.evidenceState = '';
    stage.append(heading, state);
  }
  try {
    const result = await window.api.taskEvidenceBundle();
    if (!result.ok) throw Error(result.error);
    const current = stage.querySelector('[data-evidence-view]');
    if (!result.bundle) { current?.remove(); state.hidden = false; state.textContent = 'No evidence bundle is linked to this task.'; return; }
    const bundle = result.bundle;
    if (!['robos-evidence-transcript','robos-evidence-gallery','robos-evidence-checks'].includes(bundle.template['robos:webElement'])) throw Error('Unknown evidence component.');
    const view = document.createElement(bundle.template['robos:webElement']);
    view.dataset.evidenceView = '';
    view.readArtifact = id => window.api.taskEvidenceText(id);
    view.evidence = bundle;
    state.hidden = true;
    if (current) current.replaceWith(view); else stage.append(view);
  } catch(error) { state.hidden = false; state.textContent = error.message; }
};
