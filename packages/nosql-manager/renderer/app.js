'use strict';

let isRedisMode = false;

async function init() {
  renderSidebar();
  loadMongoDocs();
  loadRedisKeys();
  setupEvents();
}

function renderSidebar() {
  const tree = document.getElementById('nosql-tree');
  tree.innerHTML = `
    <div style="padding:6px;font-weight:600;color:#58a6ff;">🍃 MongoDB (petshop_docs)</div>
    <div style="padding-left:16px;color:#7ee787;cursor:pointer;" onclick="setMode(false)">📄 pet_profiles (2 docs)</div>
    <div style="padding-left:16px;color:#8b949e;cursor:pointer;">📄 medical_records (14 docs)</div>
    <div style="padding:10px 6px 6px;font-weight:600;color:#e3b341;">⚡ Redis (db0)</div>
    <div style="padding-left:16px;color:#7ee787;cursor:pointer;" onclick="setMode(true)">🔑 Keyspace (4,280 keys)</div>
  `;
}

async function loadMongoDocs() {
  const docs = await window.nosqlManager.getDocuments({ collection: 'pet_profiles' });
  const container = document.getElementById('docs-list');
  container.innerHTML = docs.map(d => `<div class="doc-card">${JSON.stringify(d, null, 2)}</div>`).join('');
}

async function loadRedisKeys() {
  const keys = await window.nosqlManager.getRedisKeys({});
  const tbody = document.getElementById('redis-tbody');
  tbody.innerHTML = keys.map(k => `<tr><td style="color:#58a6ff;">${k.key}</td><td>${k.type}</td><td style="color:#e3b341;">${k.ttl}s</td><td style="color:#7ee787;">${k.value}</td></tr>`).join('');
}

function setMode(redis) {
  isRedisMode = redis;
  document.getElementById('mongo-view').classList.toggle('active', !redis);
  document.getElementById('redis-view').classList.toggle('active', redis);
  document.getElementById('btn-switch-mode').textContent = redis ? 'Switch to MongoDB' : 'Switch to Redis Cache';
}

function setupEvents() {
  document.getElementById('btn-switch-mode').onclick = () => setMode(!isRedisMode);
  document.getElementById('btn-find-docs').onclick = loadMongoDocs;
  document.getElementById('btn-exec-redis').onclick = async () => {
    const cmd = document.getElementById('redis-cmd-input').value;
    const res = await window.nosqlManager.execRedisCmd({ cmd });
    alert('Redis response:\n' + res);
  };
}

init().catch(console.error);
