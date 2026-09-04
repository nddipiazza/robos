'use strict';

let planExecuted = false;

window.approveAndExecutePlan = async function() {
  if (planExecuted) return;
  planExecuted = true;

  const badge = document.getElementById('ai-plan-status');
  if (badge) {
    badge.textContent = '⚡ EXECUTING';
    badge.style.background = 'rgba(0, 188, 212, 0.15)';
    badge.style.color = '#00bcd4';
    badge.style.borderColor = '#00bcd4';
  }

  const steps = document.querySelectorAll('.plan-step');
  steps.forEach((step, idx) => {
    setTimeout(() => {
      step.classList.add('active');
      const num = step.querySelector('.step-num');
      if (num) {
        num.textContent = '✓';
        num.style.background = '#3fb950';
        num.style.color = '#ffffff';
      }
    }, (idx + 1) * 600);
  });

  setTimeout(() => {
    const execCard = document.getElementById('ai-execution-card');
    if (execCard) execCard.classList.remove('hidden');

    // Update code line from suspended to resolved
    const codeLine = document.getElementById('code-line-48');
    if (codeLine) {
      codeLine.classList.remove('ij-suspended-line');
      codeLine.style.background = 'rgba(63, 185, 80, 0.15)';
      codeLine.style.borderLeft = '3px solid #3fb950';
    }

    // Update debug status
    const dbgStatus = document.getElementById('ij-debug-status');
    if (dbgStatus) {
      dbgStatus.textContent = '🟢 RESUMED — 200 OK (Adoption Certified & Kafka Event Published)';
      dbgStatus.style.color = '#3fb950';
    }

    // Update action button
    const btnApprove = document.getElementById('btn-approve-plan');
    if (btnApprove) {
      btnApprove.textContent = '✓ Plan Executed & Verified';
      btnApprove.disabled = true;
      btnApprove.style.background = '#21262d';
      btnApprove.style.borderColor = '#30363d';
      btnApprove.style.color = '#3fb950';
    }

    if (badge) {
      badge.textContent = 'VERIFIED';
      badge.style.background = 'rgba(63, 185, 80, 0.15)';
      badge.style.color = '#3fb950';
      badge.style.borderColor = '#3fb950';
    }
  }, 2800);
};

// Listen for external IPC triggers if present
if (window.electronAPI) {
  window.electronAPI.on('ide-run', () => window.approveAndExecutePlan());
}
