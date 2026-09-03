'use strict';

let servers = {};
let config = { agents: {} };
let selectedTool = { appId: 'task-manager', name: 'robos_task_manager_get_task' };

async function load() {
  servers = await window.mcpManager.getServers();
  config = await window.mcpManager.getConfig();
  render();
  window.selectTool(selectedTool.appId, selectedTool.name);
}

function render() {
  const serverList = Object.values(servers);
  document.getElementById('stat-servers').textContent = serverList.length;

  let totalTools = 0;
  let totalResources = 0;
  for (const s of serverList) {
    totalTools += (s.tools || []).length;
    totalResources += (s.resources || []).length;
  }
  document.getElementById('stat-tools').textContent = totalTools;
  document.getElementById('stat-resources').textContent = totalResources;

  // Render Server Grid
  const grid = document.getElementById('server-grid');
  grid.innerHTML = serverList.map(s => `
    <div class="server-card" id="card-${s.appId}">
      <div class="server-card-header">
        <span class="server-card-title">${s.name}</span>
        <span class="server-badge">${s.status || 'RUNNING'}</span>
      </div>
      <div class="server-meta">
        <div><strong>App ID:</strong> ${s.appId} &middot; <strong>Version:</strong> ${s.version || '1.0.0'}</div>
        <div><strong>Endpoint:</strong> ${s.endpoint || 'stdio transport'}</div>
      </div>
      <div class="server-tools-preview">
        ${(s.tools || []).map(t => `<span class="tool-tag">${t}</span>`).join('')}
      </div>
    </div>
  `).join('');

  // Render Tool Picker
  const picker = document.getElementById('tool-picker-list');
  const allTools = [];
  for (const s of serverList) {
    for (const t of (s.tools || [])) {
      allTools.push({ appId: s.appId, name: t });
    }
  }

  picker.innerHTML = allTools.map(t => `
    <div class="tool-pick-item ${selectedTool.name === t.name ? 'active' : ''}" onclick="window.selectTool('${t.appId}', '${t.name}')">
      🛠️ ${t.name}
    </div>
  `).join('');

  // Render Access Matrix
  const matrixBody = document.getElementById('access-matrix-body');
  matrixBody.innerHTML = serverList.map(s => {
    const claudeHas = (config.agents['claude-code'] || []).includes(s.appId);
    const geminiHas = (config.agents['gemini-cli'] || []).includes(s.appId);
    const copilotHas = (config.agents['copilot-cli'] || []).includes(s.appId);

    return `
      <tr>
        <td>${s.name} (<code>${s.appId}</code>)</td>
        <td><input type="checkbox" data-agent="claude-code" data-app="${s.appId}" ${claudeHas ? 'checked' : ''} /></td>
        <td><input type="checkbox" data-agent="gemini-cli" data-app="${s.appId}" ${geminiHas ? 'checked' : ''} /></td>
        <td><input type="checkbox" data-agent="copilot-cli" data-app="${s.appId}" ${copilotHas ? 'checked' : ''} /></td>
      </tr>
    `;
  }).join('');
}

window.selectTool = function(appId, name) {
  selectedTool = { appId, name };
  document.getElementById('selected-tool-name').textContent = name;
  document.querySelectorAll('.tool-pick-item').forEach(el => {
    el.classList.toggle('active', el.textContent.includes(name));
  });

  const paramsInput = document.getElementById('tool-params-input');
  if (name.includes('get_task')) {
    paramsInput.value = JSON.stringify({ taskId: 'TASK-101' }, null, 2);
  } else if (name.includes('create_branch')) {
    paramsInput.value = JSON.stringify({ branchName: 'feature/mcp-flow' }, null, 2);
  } else {
    paramsInput.value = '{}';
  }
};

window.executeTool = async function() {
  const outputBox = document.getElementById('tool-output-box');
  outputBox.textContent = '// Executing JSON-RPC tools/call...';

  let params = {};
  try {
    params = JSON.parse(document.getElementById('tool-params-input').value);
  } catch {
    outputBox.textContent = 'Error: Invalid JSON parameters';
    return;
  }

  const res = await window.mcpManager.callTool(selectedTool.appId, selectedTool.name, params);
  outputBox.textContent = JSON.stringify(res, null, 2);
};

window.saveAccessConfig = async function() {
  const checkboxes = document.querySelectorAll('#access-matrix-body input[type="checkbox"]');
  const newAgents = {
    'claude-code': [],
    'gemini-cli': [],
    'copilot-cli': [],
  };

  checkboxes.forEach(cb => {
    if (cb.checked) {
      const agent = cb.getAttribute('data-agent');
      const app = cb.getAttribute('data-app');
      if (newAgents[agent] && !newAgents[agent].includes(app)) {
        newAgents[agent].push(app);
      }
    }
  });

  config.agents = newAgents;
  await window.mcpManager.saveConfig(config);

  const status = document.getElementById('save-status');
  status.textContent = '✓ Configuration saved successfully!';
  setTimeout(() => { status.textContent = ''; }, 3000);
};

// Navigation
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.getElementById(`view-${tabId}`).classList.remove('hidden');
}

document.getElementById('tab-servers').addEventListener('click', () => switchTab('servers'));
document.getElementById('tab-tester').addEventListener('click', () => switchTab('tester'));
document.getElementById('tab-access').addEventListener('click', () => switchTab('access'));
document.getElementById('btn-open-tester').addEventListener('click', () => switchTab('tester'));
document.getElementById('btn-refresh').addEventListener('click', load);
document.getElementById('btn-exec-tool').addEventListener('click', window.executeTool);
document.getElementById('btn-save-access').addEventListener('click', window.saveAccessConfig);

load();
