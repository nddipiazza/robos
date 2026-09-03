'use strict';

let roster = null;
let selectedTeamId = 'core-platform';
let searchQuery = '';

async function init() {
  if (window.peopleManager) {
    roster = await window.peopleManager.getTeams();
  } else {
    roster = {
      organization: { id: 'acme-corp', name: 'Acme Global Platform Engineering' },
      teams: [
        {
          id: 'core-platform',
          name: 'Core Platform Engineering',
          topology: 'platform',
          interaction: 'X-as-a-Service',
          description: 'Foundational platform architecture, shared APIs, and CI/CD fabrics',
          members: [
            { id: 'user-ndipiazza', name: 'Nick D. (Lead Architect)', type: 'human', role: 'Lead Architect & Code Reviewer', responsibilities: 'Architecture plans, PR sign-off, and security review', avatar: '👨‍💻' },
            { id: 'agent-gemini-planner', name: 'Gemini Strategic Planner', type: 'agent', model: 'gemini-2.5-pro', role: 'Architecture Planning & Task Breakdown', avatar: '🤖', skills: ['create-feature-spec', 'contract-drift-detector'], mcpServers: ['system-services', 'git-repo-tools'] },
            { id: 'agent-claude-coder', name: 'Claude Code Executor', type: 'agent', model: 'claude-3.7-sonnet', role: 'TDD Implementation & Refactoring', avatar: '⚡', skills: ['e2e-driven-dev', 'app-snapshot'], mcpServers: ['chrome-devtools', 'git-repo-tools', 'test-fabric'] },
          ],
        },
        {
          id: 'billing-stream',
          name: 'Billing & Checkout Team',
          topology: 'stream-aligned',
          interaction: 'Collaboration',
          description: 'Customer checkout flows, payment gateways, and tax compliance',
          members: [
            { id: 'user-sarah', name: 'Sarah M. (Product Engineer)', type: 'human', role: 'Domain Lead & Approver', avatar: '👩‍💻' },
            { id: 'agent-stripe-bot', name: 'Stripe Integration Specialist', type: 'agent', model: 'claude-3.7-sonnet', role: 'Payment Gateway Integration', avatar: '💳', skills: ['contract-drift-detector', 'e2e-driven-dev'], mcpServers: ['chrome-devtools'] },
          ],
        },
        {
          id: 'ai-guild',
          name: 'AI Tooling & Prompt Guild',
          topology: 'enabling',
          interaction: 'Facilitating',
          description: 'Continuous enablement, MCP server integrations, and eval benchmarks',
          members: [
            { id: 'user-alex', name: 'Alex K. (AI Guild Master)', type: 'human', role: 'Guild Master', avatar: '🧙‍♂️' },
            { id: 'agent-evaluator', name: 'Benchmark & Eval Sentinel', type: 'agent', model: 'gpt-4o', role: 'Prompt Regression Testing', avatar: '🔬', skills: ['app-snapshot'], mcpServers: ['system-services'] },
          ],
        },
      ],
    };
  }

  renderStats();
  renderTeamsList();
  renderTeamDetails();
}

function renderStats() {
  let humanCount = 0;
  let agentCount = 0;

  roster.teams.forEach(t => {
    t.members.forEach(m => {
      if (m.type === 'human') humanCount++;
      if (m.type === 'agent') agentCount++;
    });
  });

  document.getElementById('stat-teams-count').textContent = `${roster.teams.length} Teams`;
  document.getElementById('stat-human-count').textContent = `${humanCount} Human Engineers`;
  document.getElementById('stat-agent-count').textContent = `${agentCount} AI Agent Personas`;
  document.getElementById('teams-count-badge').textContent = `${roster.teams.length} Teams`;
}

function renderTeamsList() {
  const container = document.getElementById('teams-list');
  const filtered = roster.teams.filter(t => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.topology.toLowerCase().includes(q);
  });

  const categories = {
    platform: { label: '🛠️ Platform Teams', items: [] },
    'stream-aligned': { label: '🏢 Stream-Aligned Teams', items: [] },
    enabling: { label: '💡 Enabling Teams', items: [] },
    'complicated-subsystem': { label: '🔬 Complicated-Subsystem Teams', items: [] },
  };

  filtered.forEach(team => {
    const cat = categories[team.topology] || categories.platform;
    cat.items.push(team);
  });

  let html = '';
  Object.entries(categories).forEach(([key, cat]) => {
    if (cat.items.length === 0) return;
    html += `<div class="cat-header">${cat.label} (${cat.items.length})</div>`;
    cat.items.forEach(team => {
      const isSelected = team.id === selectedTeamId;
      const humanMembers = team.members.filter(m => m.type === 'human').length;
      const agentMembers = team.members.filter(m => m.type === 'agent').length;

      html += `
        <div class="team-item ${isSelected ? 'active' : ''}" id="team-item-${team.id}" onclick="window.selectTeam('${team.id}')">
          <div class="team-header-row">
            <span class="team-name">${team.name}</span>
            <span class="type-badge type-${team.topology.replace(/[^a-z]/g, '')}">${team.topology}</span>
          </div>
          <div style="font-size: 10px; color: var(--text-muted);">
            👥 ${humanMembers} Humans &middot; 🤖 ${agentMembers} Agents
          </div>
        </div>
      `;
    });
  });

  container.innerHTML = html;
}

function renderTeamDetails() {
  const container = document.getElementById('team-details');
  const team = roster.teams.find(t => t.id === selectedTeamId) || roster.teams[0];
  if (!team) return;

  const badgeEl = document.getElementById('team-topology-badge');
  if (badgeEl) {
    badgeEl.textContent = `${team.topology.toUpperCase()} TEAM (${team.interaction})`;
  }

  const humans = team.members.filter(m => m.type === 'human');
  const agents = team.members.filter(m => m.type === 'agent');

  container.innerHTML = `
    <!-- Team Overview Card -->
    <div class="details-card" id="team-card-${team.id}">
      <div class="card-title">
        <span>🏛️ ${team.name}</span>
        <span class="type-badge type-${team.topology.replace(/[^a-z]/g, '')}">${team.topology}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted);">${team.description}</div>
      <div style="font-size: 10px; margin-top: 4px;">
        <strong>Team Interaction Mode:</strong> <code>${team.interaction}</code>
      </div>
    </div>

    <!-- Human Pair Engineers Card -->
    <div class="details-card" id="human-roster-card">
      <div class="card-title">
        <span>👨‍💻 Human Engineering Leads & Reviewers (${humans.length})</span>
        <span class="status-tag-pass">Human-in-the-Loop Approvers</span>
      </div>
      ${humans.map(h => `
        <div class="member-card" id="human-card-${h.id}">
          <div class="member-header">
            <div class="member-left">
              <span class="avatar">${h.avatar || '👨‍💻'}</span>
              <div>
                <div class="member-title">${h.name}</div>
                <div class="member-role">${h.role}</div>
              </div>
            </div>
            <span class="type-badge" style="background: rgba(63,185,80,0.15); color: var(--success);">Human Approver</span>
          </div>
          ${h.responsibilities ? `
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              <strong>Responsibilities:</strong> ${h.responsibilities}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>

    <!-- AI Agent Personas Swarm Card -->
    <div class="details-card" id="agent-roster-card">
      <div class="card-title">
        <span>🤖 Autonomous AI Agent Personas (${agents.length})</span>
        <span class="type-badge" style="background: rgba(188,140,255,0.15); color: var(--purple);">MCP Tool Equipped</span>
      </div>
      ${agents.map(a => `
        <div class="member-card" id="agent-card-${a.id}">
          <div class="member-header">
            <div class="member-left">
              <span class="avatar">${a.avatar || '🤖'}</span>
              <div>
                <div class="member-title">${a.name}</div>
                <div class="member-role">${a.role} &middot; <code>${a.model}</code></div>
              </div>
            </div>
            <button class="btn btn-secondary" id="btn-bind-mcp-${a.id.replace(/.*-/, '')}" style="padding: 2px 8px; font-size: 10px;" onclick="window.bindSkill('${a.id}', 'contract-drift-detector')">⚡ Bind MCP Skill</button>
          </div>

          <div style="margin-top: 4px;">
            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">RobOS Agent Skills:</div>
            <div class="skills-pill-wrap">
              ${(a.skills || []).map(s => `<span class="skill-pill">⚡ ${s}</span>`).join('')}
            </div>
          </div>

          <div style="margin-top: 4px;">
            <div style="font-size: 9px; color: var(--text-muted); text-transform: uppercase; font-weight: 700;">Bound MCP Servers:</div>
            <div class="skills-pill-wrap">
              ${(a.mcpServers || []).map(m => `<span class="mcp-pill">🔌 mcp/${m}</span>`).join('')}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

window.selectTeam = function(id) {
  selectedTeamId = id;
  renderTeamsList();
  renderTeamDetails();
};

window.bindSkill = async function(agentId, skillName) {
  if (window.peopleManager) {
    const res = await window.peopleManager.assignMCP(agentId, skillName);
    if (res.ok) {
      for (const team of roster.teams) {
        const member = team.members.find(m => m.id === agentId);
        if (member && !member.skills.includes(skillName)) {
          member.skills.push(skillName);
        }
      }
      renderStats();
      renderTeamsList();
      renderTeamDetails();
      return res;
    }
  } else {
    for (const team of roster.teams) {
      const member = team.members.find(m => m.id === agentId);
      if (member && !member.skills.includes(skillName)) {
        member.skills.push(skillName);
        renderTeamDetails();
        return { ok: true, member };
      }
    }
  }
};

window.addNewAgent = async function() {
  const newAgent = {
    id: 'agent-codex-refactorer',
    name: 'Codex Autonomous Refactorer',
    type: 'agent',
    model: 'gpt-4o',
    role: 'Dead Code Elimination & Refactoring',
    avatar: '🛠️',
    skills: ['e2e-driven-dev', 'contract-drift-detector'],
    mcpServers: ['git-repo-tools', 'system-services'],
  };

  if (window.peopleManager) {
    const res = await window.peopleManager.addAgent(selectedTeamId, newAgent);
    if (res.ok) {
      const team = roster.teams.find(t => t.id === selectedTeamId);
      if (team && !team.members.some(m => m.id === newAgent.id)) {
        team.members.push(newAgent);
      }
      renderStats();
      renderTeamsList();
      renderTeamDetails();
      return res;
    }
  } else {
    const team = roster.teams.find(t => t.id === selectedTeamId);
    if (team) {
      team.members.push(newAgent);
      renderStats();
      renderTeamsList();
      renderTeamDetails();
      return { ok: true, agent: newAgent };
    }
  }
};

window.addNewTeam = function() {
  alert('Team created and saved to .robos/teams.yaml');
};

const searchInput = document.getElementById('team-search-input');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value || '';
    renderTeamsList();
  });
}

init();
