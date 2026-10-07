'use strict';
window.renderTaskEvidence = async function () {
  const stage = document.getElementById('stage-5');
  if (!stage) return;
  stage.replaceChildren();
  const heading = document.createElement('h3'); heading.textContent = 'Evidence';
  const state = document.createElement('p'); state.textContent = 'Loading captured evidence…';
  stage.append(heading, state);
  try {
    const result = await window.api.taskEvidenceBundle();
    if (!result.ok) throw Error(result.error);
    if (!result.bundle) { state.textContent = 'No evidence bundle is linked to this task.'; return; }
    const bundle = result.bundle;
    if (!['robos-evidence-transcript','robos-evidence-gallery','robos-evidence-checks'].includes(bundle.template['robos:webElement'])) throw Error('Unknown evidence component.');
    const view = document.createElement(bundle.template['robos:webElement']);
    view.readArtifact = id => window.api.taskEvidenceText(id);
    view.evidence = bundle;
    state.remove(); stage.append(view);
  } catch(error) { state.textContent = error.message; }
};
