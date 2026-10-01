'use strict';
// Pass this function's source and a data object to Chrome DevTools MCP
// evaluate_script. No app state is changed; only our demo overlay is managed.
function showDemoCallout({ id, title = '', summary = '' }) {
  if (!id || !summary) throw new Error('Callout needs a step id and descriptive summary.');
  const state = window.__robosDemoCallouts ||= { dismissed: new Set() };
  // Includes the previous prototype IDs so an upgrade cannot stack old guidance.
  document.querySelectorAll('[data-robos-demo-callout], #robos-callout, #robos-demo-callout, #filter-demo-caption').forEach(el => el.remove());
  if (state.dismissed.has(id)) return { visible: false, dismissed: true };
  const host = document.createElement('aside');
  host.dataset.robosDemoCallout = id; host.setAttribute('aria-label', 'Demo guidance');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;width:480px;max-width:calc(100vw - 32px);max-height:65vh;overflow:auto;box-sizing:border-box;padding:20px 46px 20px 22px;border:1px solid #8194aa66;border-radius:10px;background:rgba(15,23,34,.82);backdrop-filter:blur(3px);color:#eef4fa;font:18px/1.55 system-ui;box-shadow:0 5px 22px #0004;pointer-events:auto';
  if (title) { const heading = document.createElement('strong'); heading.textContent = title; heading.style.cssText = 'display:block;margin-bottom:12px;color:#a9dcf5;font-size:22px;line-height:1.3'; host.append(heading); }
  const body = document.createElement('div');
  // Render a small, safe formatting subset; never interpret agent text as HTML.
  const inline = (element, text) => {
    for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong'); strong.textContent = part.slice(2, -2); element.append(strong);
      } else element.append(document.createTextNode(part));
    }
  };
  let list = null;
  for (const line of summary.split(/\r?\n/)) {
    if (!line.trim()) { list = null; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!list) { list = document.createElement('ul'); list.style.cssText = 'margin:10px 0;padding-left:22px'; body.append(list); }
      const item = document.createElement('li'); item.style.margin = '6px 0'; inline(item, line.replace(/^\s*[-*]\s+/, '')); list.append(item);
    } else {
      list = null; const paragraph = document.createElement('p'); paragraph.style.cssText = 'margin:0 0 12px'; inline(paragraph, line); body.append(paragraph);
    }
  }
  host.append(body);
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', 'Hide demo guidance');
  close.style.cssText = 'position:absolute;right:7px;top:7px;width:28px;height:28px;border:1px solid #8194aa66;border-radius:6px;background:#1c2a3b;color:#fff;font:22px/22px system-ui;cursor:pointer;pointer-events:auto';
  close.addEventListener('click', () => { state.dismissed.add(id); host.remove(); });
  host.append(close); document.documentElement.append(host);
  return { visible: true, id };
}
module.exports = { showDemoCallout };
