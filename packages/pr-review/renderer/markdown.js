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
document.addEventListener('click', async event => {
  const link = event.target.closest('.review-markdown a');
  if (!link) return;
  const href = link.getAttribute('href') || '';
  if (href.startsWith('#')) return;
  event.preventDefault();
  link.setAttribute('aria-busy','true');
  const old=link.nextElementSibling;if(old?.classList.contains('review-link-error'))old.remove();
  try{const url=window.resolveReviewLink(href,theaterContext?.pr);if(url){const result=await window.api.openUrl(url);if(result?.ok===false)throw Error(result.error);}}
  catch(error){const status=document.createElement('span');status.className='review-link-error';status.setAttribute('role','alert');status.textContent=' — '+error.message;link.after(status);}
  finally{link.removeAttribute('aria-busy');}
});
