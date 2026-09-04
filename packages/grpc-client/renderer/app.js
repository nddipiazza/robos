'use strict';

let services = [];
let currentService = null;
let currentMethod = null;

async function init() {
  services = await window.grpcClient.getServices();
  renderTree();
  if (services.length > 0) {
    selectMethod(services[0], services[0].methods[0]);
  }
  setupEvents();
}

function renderTree() {
  const tree = document.getElementById('services-tree');
  tree.innerHTML = '';

  services.forEach(s => {
    const sEl = document.createElement('div');
    sEl.style.padding = '6px 4px';
    sEl.style.fontWeight = '600';
    sEl.style.color = '#58a6ff';
    sEl.style.fontFamily = 'var(--font-mono)';
    sEl.style.fontSize = '12px';
    sEl.textContent = s.service.split('.').pop();
    tree.appendChild(sEl);

    s.methods.forEach(m => {
      const mEl = document.createElement('div');
      mEl.style.padding = '4px 4px 4px 16px';
      mEl.style.color = '#c9d1d9';
      mEl.style.cursor = 'pointer';
      mEl.style.fontFamily = 'var(--font-mono)';
      mEl.style.fontSize = '12px';
      mEl.textContent = `⚡ ${m.name}`;
      mEl.onclick = () => selectMethod(s, m);
      tree.appendChild(mEl);
    });
  });
}

function selectMethod(service, method) {
  currentService = service;
  currentMethod = method;
  document.getElementById('active-method-title').textContent = `${service.service} / ${method.name}`;
  document.getElementById('payload-editor').value = JSON.stringify(method.samplePayload, null, 2);
}

async function invokeRpc() {
  if (!currentMethod) return;
  const endpoint = document.getElementById('endpoint-input').value;
  let payload = {};
  try {
    payload = JSON.parse(document.getElementById('payload-editor').value);
  } catch {}

  const res = await window.grpcClient.invoke({
    endpoint,
    method: currentMethod.name,
    payload
  });

  document.getElementById('grpc-status-badge').textContent = `${res.status} (${res.latencyMs}ms)`;
  document.getElementById('response-block').textContent = JSON.stringify(res.responseBody, null, 2);
}

function setupEvents() {
  document.getElementById('btn-invoke-grpc').onclick = invokeRpc;
  document.getElementById('payload-editor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      invokeRpc();
    }
  });
}

init().catch(console.error);
