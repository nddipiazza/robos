'use strict';

const STEPS = [
  { id: 1, title: 'Check out feature branch & verify environment', status: 'completed' },
  { id: 2, title: 'Analyze code differences and AST dependencies', status: 'completed' },
  { id: 3, title: 'Execute regression test suite', status: 'active' },
  { id: 4, title: 'Submit proof of work verification artifact', status: 'pending' },
];

const TOOLS = [
  { name: 'view_file', time: '16:42:01', output: 'Loaded src/auth/jwt.ts (240 lines)' },
  { name: 'run_command', time: '16:42:05', output: '$ npm run lint -> 0 errors found' },
  { name: 'run_command', time: '16:42:10', output: '$ npm test -> 14 passed, 0 failed' },
];

function init() {
  const ctx = window.sidebar ? window.sidebar.getAgentContext() : {
    taskId: 'TASK-101',
    role: 'Senior Code Reviewer',
    username: 'agent-task-101',
  };

  document.getElementById('agent-role').textContent = ctx.role;
  document.getElementById('agent-id').textContent = ctx.username;
  document.getElementById('task-badge').textContent = `${ctx.taskId}: Refactor Auth Pipeline`;

  renderSteps();
  renderTools();
  attachEvents();
}

function renderSteps() {
  const list = document.getElementById('step-list');
  list.innerHTML = STEPS.map(s => {
    let icon = '⚪';
    if (s.status === 'completed') icon = '✅';
    if (s.status === 'active') icon = '🔄';

    return `
      <div class="step-item ${s.status}" id="step-${s.id}">
        <span class="step-icon">${icon}</span>
        <span class="step-text">${s.title}</span>
      </div>
    `;
  }).join('');
}

function renderTools() {
  const stream = document.getElementById('tool-stream');
  stream.innerHTML = TOOLS.map(t => `
    <div class="tool-entry">
      <div class="tool-header">
        <span class="tool-name">&gt; ${t.name}</span>
        <span class="tool-time">${t.time}</span>
      </div>
      <div class="tool-output">${t.output}</div>
    </div>
  `).join('');
  stream.scrollTop = stream.scrollHeight;
}

function attachEvents() {
  document.getElementById('btn-approve-step').addEventListener('click', () => {
    // Progress Step 3 to completed, Step 4 to active
    const step3 = STEPS.find(s => s.id === 3);
    const step4 = STEPS.find(s => s.id === 4);
    if (step3 && step4) {
      step3.status = 'completed';
      step4.status = 'active';
      renderSteps();

      // Add tool entry
      TOOLS.push({
        name: 'submit_verification',
        time: new Date().toLocaleTimeString(),
        output: 'Verification approved by developer. Artifact generated.',
      });
      renderTools();

      document.getElementById('agent-status-pill').textContent = 'VERIFIED';
      document.getElementById('agent-status-pill').style.background = 'rgba(0,188,212,0.2)';
      document.getElementById('agent-status-pill').style.color = '#00bcd4';
    }
  });

  document.getElementById('btn-request-change').addEventListener('click', () => {
    TOOLS.push({
      name: 'human_feedback',
      time: new Date().toLocaleTimeString(),
      output: 'Feedback requested: Please rerun coverage check.',
    });
    renderTools();
  });
}

init();
