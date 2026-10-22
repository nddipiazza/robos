const toolList = document.getElementById('tool-list');
const categoryBar = document.getElementById('category-bar');
const logPanel = document.getElementById('log-panel');
const logOutput = document.getElementById('log-output');
const logTitle = document.getElementById('log-title');
const logClose = document.getElementById('log-close');
const catalogMessage = document.getElementById('catalog-message');
const refreshButton = document.getElementById('refresh-tools');

let tools = [];
let activeLogTool = null;
let activeCategory = 'All';

const CATEGORY_ORDER = ['All', 'AI', 'IDE', 'Browser', 'Media', 'Dev', 'CLI'];

logClose.addEventListener('click', () => {
  logPanel.classList.add('hidden');
  activeLogTool = null;
});

function renderCategoryBar() {
  categoryBar.innerHTML = '';
  // Only show categories that have tools
  const activeCats = new Set(tools.map(t => t.category));
  const cats = CATEGORY_ORDER.filter(c => c === 'All' || activeCats.has(c));

  for (const cat of cats) {
    const btn = document.createElement('button');
    btn.className = 'category-btn' + (cat === activeCategory ? ' active' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      activeCategory = cat;
      renderCategoryBar();
      renderTools();
    });
    categoryBar.appendChild(btn);
  }
}

function getFilteredTools() {
  if (activeCategory === 'All') return tools;
  return tools.filter(t => t.category === activeCategory);
}

function renderTools() {
  toolList.innerHTML = '';
  const filtered = getFilteredTools();

  for (const tool of filtered) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    card.dataset.toolId = tool.id;

    const statusClass = tool.installing ? 'status-installing'
      : tool.installed ? 'status-installed' : 'status-not-installed';
    const statusText = tool.installing ? (tool.action === 'uninstall' ? 'Uninstalling…' : 'Installing…')
      : tool.supported === false ? 'Unavailable'
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
    const source = document.createElement('div');
    source.className = 'tool-desc tool-source';
    source.textContent = tool.unavailableReason || tool.source || '';
    card.querySelector('.tool-info').appendChild(source);

    if (tool.supported === false) {
      card.classList.add('unsupported');
    } else if (tool.installing) {
      const logBtn = document.createElement('button');
      logBtn.className = 'tool-btn log-btn';
      logBtn.textContent = 'View Log';
      logBtn.addEventListener('click', () => showLog(tool));
      btnContainer.appendChild(logBtn);
    } else if (tool.externallyManaged) {
      const btn = document.createElement('button');
      btn.className = 'tool-btn';
      btn.textContent = 'Windows settings';
      btn.title = 'This copy was installed outside WinGet.';
      btn.addEventListener('click', () => getRobosApi().manageWindowsSoftware());
      btnContainer.appendChild(btn);
    } else if (tool.installed) {
      if (tool.packageId || tool.npmPackage) {
        const update = document.createElement('button');
        update.className = 'tool-btn install';
        update.textContent = 'Update';
        update.disabled = tools.some(t => t.installing);
        update.addEventListener('click', () => doInstall(tool.id, 'install'));
        btnContainer.appendChild(update);
      }
      const btn = document.createElement('button');
      btn.className = 'tool-btn uninstall';
      btn.textContent = 'Uninstall';
      btn.disabled = tools.some(t => t.installing);
      btn.addEventListener('click', () => doInstall(tool.id, 'uninstall'));
      btnContainer.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tool-btn install';
      btn.textContent = 'Install';
      btn.disabled = tools.some(t => t.installing);
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

function getRobosApi() {
  return window.robos || (window.parent && window.parent.robos);
}

async function doInstall(toolId, action) {
  const api = getRobosApi();
  if (!api) return;
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return;
  tool.installing = true;
  tool.action = action;
  renderTools();

  logTitle.textContent = `${tool.name} — ${action === 'uninstall' ? 'Uninstall' : 'Install'} Log`;
  logOutput.textContent = '';
  logPanel.classList.remove('hidden');
  activeLogTool = toolId;

  try {
    const result = action === 'uninstall' ? await api.uninstallTool(toolId) : await api.installTool(toolId);
    if (result?.error) throw new Error(result.error);
  } catch (error) {
    tool.installing = false;
    logOutput.textContent += `${error.message}\n`;
    renderTools();
  }
}

async function refreshTools(force = false) {
  refreshButton.disabled = true;
  catalogMessage.textContent = 'Checking installed software…';
  try {
    tools = await getRobosApi().getTools(force);
    catalogMessage.textContent = tools.some(t => /WinGet is unavailable/.test(t.unavailableReason || ''))
      ? 'Windows Package Manager needs attention. See the package details below.'
      : 'Choose software to install. Installation progress appears below.';
    renderCategoryBar();
    renderTools();
  } catch (error) { catalogMessage.textContent = `Could not load software: ${error.message}. Click Refresh to retry.`; }
  finally { refreshButton.disabled = false; }
}
refreshButton.addEventListener('click', () => refreshTools(true));

function initSoftwareCenter() {
  const api = getRobosApi();
  if (!api || !api.getTools) {
    setTimeout(initSoftwareCenter, 100);
    return;
  }

  if (api.onInstallProgress) {
    api.onInstallProgress(({ toolId, text, done, success, action }) => {
      if (activeLogTool === toolId) {
        logOutput.textContent += text;
        logOutput.scrollTop = logOutput.scrollHeight;
      }
      if (done) {
        refreshTools();
      }
    });
  }

  refreshTools();
}

initSoftwareCenter();
