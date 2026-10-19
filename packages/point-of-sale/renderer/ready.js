'use strict';
// Customer-facing board: shows order numbers whose items are all ready for pick-up.
const box = document.querySelector('.numbers');
async function poll() {
  try {
    const { ready, business } = await (await fetch('/api/public/ready-board')).json();
    document.title = `${business} · Orders ready`;
    box.replaceChildren(...ready.map(n => Object.assign(document.createElement('div'), { className: 'n', textContent: `#${n}` })));
    if (!ready.length) box.replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Your order number will appear here when it is ready.' }));
  } catch { /* server restarting: try again */ }
}
poll(); setInterval(poll, 3000);
