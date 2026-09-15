'use strict';
// Render tracker-provided Markdown without allowing embedded scripts or controls.
window.renderReviewMarkdown = function(source) {
  const html = window.marked.parse(String(source || ''), { gfm: true });
  return window.DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style'],
  });
};
document.addEventListener('click', event => {
  const link = event.target.closest('.review-markdown a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#')) return;
  event.preventDefault();
  if (/^https?:\/\//i.test(href)) window.api.openUrl(href);
});
