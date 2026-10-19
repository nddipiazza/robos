'use strict';
const { Renderer } = require('marked');

// Readiness lists are static guide content, not form controls. Keep the marker
// separate from the text so emphasis, links and wrapped lines stay together.
function createGuideRenderer() {
  const renderer = new Renderer();
  renderer.checkbox = () => '';
  renderer.listitem = (text, task, checked) => {
    if (!task) return `<li>${text}</li>\n`;
    return `<li class="check${checked ? ' done' : ''}"><span class="box" aria-hidden="true">${checked ? '✓' : ''}</span><div class="check-text">${text.trim()}</div></li>\n`;
  };
  return renderer;
}
module.exports = { createGuideRenderer };
