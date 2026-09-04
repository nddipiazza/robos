'use strict';

let planExecuted = false;
let isProvisioning = false;

window.selectTask = function(taskKey) {
  const items = document.querySelectorAll('.backlog-item');
  items.forEach(el => el.classList.remove('active-task'));
  const target = document.getElementById(`task-item-${taskKey.replace('PET-', '')}`);
  if (target) {
    target.classList.add('active-task');
  }
};

window.startWorkspaceProvisioning = function() {
  if (isProvisioning) return;
  isProvisioning = true;

  const modal = document.getElementById('ws-provision-modal');
  if (modal) modal.classList.remove('hidden');

  const steps = [
    { id: 1, text: '✓ Branch checked out', delay: 400 },
    { id: 2, text: '✓ Secrets injected from pass', delay: 1000 },
    { id: 3, text: '✓ Services active (:8443)', delay: 1600 },
    { id: 4, text: '⏸️ Breakpoint hit at PetService.java:48', delay: 2200 },
  ];

  steps.forEach(s => {
    setTimeout(() => {
      const stepEl = document.getElementById(`prov-step-${s.id}`);
      const statEl = document.getElementById(`prov-stat-${s.id}`);
      if (stepEl) {
        stepEl.classList.remove('running');
        stepEl.classList.add('done');
      }
      if (statEl) statEl.textContent = s.text;

      // Next step running
      if (s.id < 4) {
        const nextStep = document.getElementById(`prov-step-${s.id + 1}`);
        const nextStat = document.getElementById(`prov-stat-${s.id + 1}`);
        if (nextStep) nextStep.classList.add('running');
        if (nextStat) nextStat.textContent = 'Running…';
      }
    }, s.delay);
  });

  // After 2.8s, reveal IntelliJ IDEA IDE Workspace
  setTimeout(() => {
    const taskView = document.getElementById('robos-task-view');
    const ijWindow = document.getElementById('intellij-window');
    if (taskView) taskView.classList.add('hidden');
    if (ijWindow) ijWindow.classList.remove('hidden');
  }, 2900);
};

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

// Demo automation hooks
window._demoSelectTask = function(key) {
  window.selectTask(key);
};

window._demoStartProvisioning = function() {
  window.startWorkspaceProvisioning();
};

window._demoApprovePlan = function() {
  window.approveAndExecutePlan();
};

// Listen for external IPC triggers if present
if (window.electronAPI) {
  window.electronAPI.on('ide-run', () => window.approveAndExecutePlan());
}

