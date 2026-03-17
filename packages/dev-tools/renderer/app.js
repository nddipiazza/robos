const toolList = document.getElementById('tool-list');
const logPanel = document.getElementById('log-panel');
const logOutput = document.getElementById('log-output');
const logTitle = document.getElementById('log-title');
const logClose = document.getElementById('log-close');

let tools = [];
let activeLogTool = null;

logClose.addEventListener('click', () => {
  logPanel.classList.add('hidden');
  activeLogTool = null;
});

function renderTools() {
  toolList.innerHTML = '';
  for (const tool of tools) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolId = tool.id;

    const statusClass = tool.installing ? 'status-installing'
      : tool.installed ? 'status-installed' : 'status-not-installed';
    const statusText = tool.installing ? 'Installing...'
      : tool.installed ? 'Installed' : 'Not installed';

    card.innerHTML = `
      <div class="tool-info">
        <div class="tool-name">${tool.name}</div>
        <div class="tool-desc">${tool.description}</div>
        <span class="tool-category">${tool.category}</span>
      </div>
      <div class="tool-status">
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
    `;

    const btnContainer = card.querySelector('.tool-status');

    if (tool.installing) {
      const logBtn = document.createElement('button');
      logBtn.className = 'tool-btn log-btn';
      logBtn.textContent = 'View Log';
      logBtn.addEventListener('click', () => showLog(tool));
      btnContainer.appendChild(logBtn);
    } else if (tool.installed) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn uninstall';
      btn.textContent = 'Uninstall';
      btn.addEventListener('click', () => doInstall(tool.id, 'uninstall'));
      btnContainer.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tool-btn install';
      btn.textContent = 'Install';
      btn.addEventListener('click', () => doInstall(tool.id, 'install'));
      btnContainer.appendChild(btn);
    }

    toolList.appendChild(card);
  }
}

async function showLog(tool) {
  activeLogTool = tool.id;
  logTitle.textContent = `${tool.name} — Install Log`;
  const log = await window.robos.getInstallLog(tool.id);
  logOutput.textContent = log;
  logPanel.classList.remove('hidden');
  logOutput.scrollTop = logOutput.scrollHeight;
}

async function doInstall(toolId, action) {
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return;
  tool.installing = true;
  renderTools();

  logTitle.textContent = `${tool.name} — ${action === 'uninstall' ? 'Uninstall' : 'Install'} Log`;
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');
  activeLogTool = toolId;

  if (action === 'uninstall') {
    await window.robos.uninstallTool(toolId);
  } else {
    await window.robos.installTool(toolId);
  }
}

window.robos.onInstallProgress(({ toolId, text, done, success, action }) => {
  if (activeLogTool === toolId) {
    logOutput.textContent += text;
    logOutput.scrollTop = logOutput.scrollHeight;
  }
  if (done) {
    // Refresh tool list
    window.robos.getTools().then(t => {
      tools = t;
      renderTools();
    });
  }
});

// Initial load
window.robos.getTools().then(t => {
  tools = t;
  renderTools();
});
