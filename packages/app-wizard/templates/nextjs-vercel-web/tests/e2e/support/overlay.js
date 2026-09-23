// Injected into every page during E2E recording (NOT part of the app).
// Draws a RobOS virtual pointer and tap ripples so viewers can see each interaction.
(() => {
  if (window.__robosOverlay) return;
  window.__robosOverlay = true;
  const css = `
    #robos-cursor{position:fixed;z-index:2147483647;pointer-events:none;left:-40px;top:-40px;width:26px;height:26px;
      transition:left .28s cubic-bezier(.2,.8,.2,1),top .28s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 6px rgba(0,188,212,.9))}
    .robos-ripple{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid #00bcd4;
      background:rgba(0,188,212,.35);transform:translate(-50%,-50%);width:10px;height:10px;animation:robosRipple .6s ease-out forwards}
    @keyframes robosRipple{to{width:70px;height:70px;opacity:0}}`;
  function mount() {
    if (document.getElementById('robos-cursor')) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.documentElement.appendChild(style);
    const c = document.createElement('div');
    c.id = 'robos-cursor';
    c.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.45 0 .67-.54.35-.85L6.35 2.86a.5.5 0 0 0-.85.35z" fill="#00bcd4" stroke="#060a12" stroke-width="1.5"/></svg>';
    document.documentElement.appendChild(c);
  }
  function move(x, y) {
    const c = document.getElementById('robos-cursor');
    if (!c) return;
    c.style.left = x - 3 + 'px';
    c.style.top = y - 3 + 'px';
  }
  function ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'robos-ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }
  document.addEventListener('DOMContentLoaded', mount);
  if (document.readyState !== 'loading') mount();
  window.addEventListener('mousemove', (e) => move(e.clientX, e.clientY), true);
  window.addEventListener('pointerdown', (e) => { move(e.clientX, e.clientY); ripple(e.clientX, e.clientY); }, true);
  window.addEventListener('touchstart', (e) => { const t = e.touches[0]; if (t) { move(t.clientX, t.clientY); ripple(t.clientX, t.clientY); } }, true);
})();
