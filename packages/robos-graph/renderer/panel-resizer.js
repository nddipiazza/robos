'use strict';
(() => {
  const grid = document.querySelector('.workspace-grid');
  const divider = document.getElementById('nodes-resizer');
  const key = 'robos.graph.nodesWidth';
  let preferred = 360;
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isFinite(saved) && saved > 0) preferred = saved;
  } catch { /* Resizing remains available without browser storage. */ }
  const limits = () => {
    const available = Math.max(0, grid.clientWidth - 12);
    return { min: Math.min(240, available / 2), max: Math.max(available / 2, available - 360) };
  };
  function render() {
    const { min, max } = limits();
    const width = Math.round(Math.max(min, Math.min(max, preferred)));
    grid.style.setProperty('--nodes-width', `${width}px`);
    divider.setAttribute('aria-valuemin', Math.ceil(min));
    divider.setAttribute('aria-valuemax', Math.floor(max));
    divider.setAttribute('aria-valuenow', width);
    divider.setAttribute('aria-valuetext', `${width} pixels`);
  }
  function update(width) {
    const { min, max } = limits();
    preferred = Math.max(min, Math.min(max, width));
    render();
    try { localStorage.setItem(key, String(preferred)); } catch {}
  }
  let drag = null;
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    divider.focus();
    drag = { id: event.pointerId, x: event.clientX, width: Number(divider.getAttribute('aria-valuenow')) };
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('resizing');
    document.body.classList.add('resizing-nodes');
  });
  divider.addEventListener('pointermove', event => {
    if (drag && event.pointerId === drag.id) update(drag.width + event.clientX - drag.x);
  });
  function finish() {
    drag = null;
    divider.classList.remove('resizing');
    document.body.classList.remove('resizing-nodes');
  }
  divider.addEventListener('pointerup', event => {
    if (drag && event.pointerId === drag.id) {
      divider.releasePointerCapture(event.pointerId);
      finish();
    }
  });
  divider.addEventListener('pointercancel', finish);
  divider.addEventListener('lostpointercapture', finish);
  divider.addEventListener('dblclick', () => update(360));
  divider.addEventListener('keydown', event => {
    const { min, max } = limits();
    const current = Number(divider.getAttribute('aria-valuenow'));
    const step = event.shiftKey ? 50 : 10;
    const values = { ArrowLeft: current - step, ArrowRight: current + step, Home: min, End: max };
    if (!(event.key in values)) return;
    event.preventDefault();
    update(values[event.key]);
  });
  new ResizeObserver(render).observe(grid);
  render();
})();
