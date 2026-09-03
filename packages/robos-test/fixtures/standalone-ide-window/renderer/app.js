'use strict';

window.ideBridge.onOpenFile((params) => {
  const tabHello = document.getElementById('ij-tab-hello');
  const tabPom = document.getElementById('ij-tab-pom');
  if (params.file && params.file.includes('HelloWorld.java')) {
    tabHello.classList.add('active');
    tabPom.classList.remove('active');
  }
  const lineEl = document.getElementById('code-line-6');
  if (lineEl) lineEl.classList.add('ij-suspended-line');
});

window.ideBridge.onSetBreakpoint((params) => {
  const dot = document.getElementById('bp-dot-6');
  if (dot) dot.style.display = 'inline';
});

window.ideBridge.onRun((params) => {
  const statusEl = document.getElementById('ij-debug-status');
  if (statusEl) {
    statusEl.textContent = '⏸️ SUSPENDED AT BREAKPOINT: HelloWorld.java:6';
  }
  const lineEl = document.getElementById('code-line-6');
  if (lineEl) lineEl.classList.add('ij-suspended-line');
});
