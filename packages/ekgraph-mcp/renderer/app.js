'use strict';

let nodes = [];
let selectedPath = 'services/auth-service';
let reqId = 1;

function logTrace(type, json) {
  const log = document.getElementById('trace-log');
  const entry = `[${new Date().toLocaleTimeString()}] [${type.toUpperCase()}] ${JSON.stringify(json, null, 2)}\n`;
  log.textContent = (log.textContent.startsWith('//') ? '' : log.textContent) + entry;
  log.scrollTop = log.scrollHeight;
}

async function sendMcpToolCall(name, args) {
  const id = reqId++;
  const request = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name, arguments: args },
  };
  logTrace('REQUEST', request);

  const response = await window.ekgMcp.rpc(request);
  logTrace('RESPONSE', response);

  await search();
  return response;
}

async function search(query = '') {
  nodes = await window.ekgMcp.search(query);
  render();
}

function render() {
  document.getElementById('stat-total-nodes').textContent = nodes.length;

  const categories = new Set(nodes.map(n => n.type));
  document.getElementById('stat-categories').textContent = categories.size;

  const listEl = document.getElementById('nodes-list');
  listEl.innerHTML = nodes.map(n => `
    <div class="node-item ${n.path === selectedPath ? 'selected' : ''}" onclick="window.selectNode('${n.path}')">
      <div class="node-item-header">
        <span class="node-path">${n.path}</span>
        <span class="node-type-badge">${n.type}</span>
      </div>
      <div class="node-title">${n.title}</div>
    </div>
  `).join('');

  renderDetail();
}

async function renderDetail() {
  const detailEl = document.getElementById('node-detail');
  const node = nodes.find(n => n.path === selectedPath) || nodes[0];
  if (!node) {
    detailEl.innerHTML = '<div>No node selected</div>';
    return;
  }

  const linked = await window.ekgMcp.getLinked(node.path);

  detailEl.innerHTML = `
    <div class="detail-row"><span class="detail-label">Canonical Path:</span> <code>${node.path}</code></div>
    <div class="detail-row"><span class="detail-label">Title:</span> <strong>${node.title}</strong></div>
    <div class="detail-row"><span class="detail-label">Node Type:</span> <span class="node-type-badge">${node.type}</span></div>
    <div class="detail-row"><span class="detail-label">Content:</span> <div>${node.content}</div></div>
    ${node.endpoint ? `<div class="detail-row"><span class="detail-label">Endpoint:</span> <code>${node.endpoint}</code></div>` : ''}
    ${node.cluster ? `<div class="detail-row"><span class="detail-label">Cluster:</span> <code>${node.cluster}</code></div>` : ''}
    <div class="detail-row">
      <span class="detail-label">Tags:</span>
      <div class="tag-list">${(node.tags || []).map(t => `<span class="tag-badge">#${t}</span>`).join('')}</div>
    </div>
    <div class="detail-row">
      <span class="detail-label">Linked Nodes:</span>
      <div class="tag-list">${linked.map(l => `<span class="tag-badge" style="color: var(--accent); cursor: pointer;" onclick="window.selectNode('${l.path}')">🔗 ${l.path}</span>`).join('')}</div>
    </div>
  `;
}

window.selectNode = function(path) {
  selectedPath = path;
  render();
  sendMcpToolCall('robos_ekgraph_get_node', { path });
};

window.traverseLinked = async function() {
  return sendMcpToolCall('robos_ekgraph_get_linked', { path: selectedPath });
};

window.createNode = async function(path = 'services/metrics-daemon', title = 'Metrics Collection Daemon') {
  return sendMcpToolCall('robos_ekgraph_create_node', {
    path,
    title,
    type: 'service',
    content: 'Autonomous Prometheus telemetry and health daemon.',
    tags: ['metrics', 'telemetry', 'monitoring'],
    links: ['environments/prod'],
  });
};

document.getElementById('input-search').addEventListener('input', (e) => {
  search(e.target.value);
});

document.getElementById('btn-traverse-linked').addEventListener('click', () => {
  window.traverseLinked();
});

document.getElementById('btn-create-node').addEventListener('click', () => {
  window.createNode();
});

document.getElementById('btn-clear-trace').addEventListener('click', () => {
  document.getElementById('trace-log').textContent = '// Log cleared.';
});

search();
