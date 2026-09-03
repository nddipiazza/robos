'use strict';

let agents = [];
let selectedAgentId = 'claude';

async function load() {
  agents = await window.agentAutoconfig.getSupportedAgents();
  render();
  selectAgent(selectedAgentId);
}

function render() {
  document.getElementById('stat-agents').textContent = `${agents.length} Agents`;

  const listEl = document.getElementById('agents-list');
  listEl.innerHTML = agents.map(a => `
    <div class="agent-item ${a.id === selectedAgentId ? 'selected' : ''}" onclick="window.selectAgent('${a.id}')">
      <div class="agent-header">
        <span class="agent-name">${a.name}</span>
        <span class="status-badge synced">SYNCED</span>
      </div>
      <div class="agent-meta">
        Config: <code>${a.configFile || 'N/A'}</code> &middot; Doc: <code>${a.docFile}</code>
      </div>
    </div>
  `).join('');
}

window.selectAgent = async function(id) {
  selectedAgentId = id;
  render();

  const agent = agents.find(a => a.id === id) || agents[0];
  const config = await window.agentAutoconfig.getMCPConfig(id);
  const doc = await window.agentAutoconfig.getAgentMarkdown(id);

  document.getElementById('config-title').textContent = `Generated MCP Configuration (${agent.configFile || 'Universal Standard'})`;
  document.getElementById('config-text').textContent = JSON.stringify(config, null, 2);

  document.getElementById('doc-title').textContent = `Project Instruction & Context Sync (${agent.docFile})`;
  document.getElementById('doc-text').textContent = doc;
};

window.syncAll = async function() {
  const result = await window.agentAutoconfig.sync();
  document.getElementById('sync-status').textContent = `🟢 Synced ${result.writtenConfigs.length} configs & ${result.writtenDocs.length} docs at ${new Date().toLocaleTimeString()}`;
  await selectAgent(selectedAgentId);
};

document.getElementById('btn-select-universal').addEventListener('click', () => {
  window.selectAgent('universal');
});

document.getElementById('btn-sync-all').addEventListener('click', () => {
  window.syncAll();
});

load();
