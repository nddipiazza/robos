'use strict';

let schema = null;

async function init() {
  schema = await window.graphqlClient.introspect();
  renderSchema();
  setupEvents();
}

function renderSchema() {
  const tree = document.getElementById('schema-tree');
  tree.innerHTML = '';

  schema.types.forEach(t => {
    const tEl = document.createElement('div');
    tEl.style.padding = '6px 4px';
    tEl.style.fontWeight = '600';
    tEl.style.color = '#e535ab';
    tEl.style.fontFamily = 'var(--font-mono)';
    tEl.style.fontSize = '12px';
    tEl.textContent = `type ${t.name}`;
    tree.appendChild(tEl);

    t.fields.forEach(f => {
      const fEl = document.createElement('div');
      fEl.style.padding = '3px 4px 3px 16px';
      fEl.style.color = '#c9d1d9';
      fEl.style.fontFamily = 'var(--font-mono)';
      fEl.style.fontSize = '11px';
      fEl.textContent = `${f.name}: ${f.type}`;
      tree.appendChild(fEl);
    });
  });
}

async function runQuery() {
  const endpoint = document.getElementById('endpoint-input').value;
  const query = document.getElementById('query-editor').value;
  let variables = {};
  try {
    variables = JSON.parse(document.getElementById('variables-editor').value);
  } catch {}

  const res = await window.graphqlClient.execute({ endpoint, query, variables });
  const latency = (res.extensions && res.extensions.latencyMs) || 160;
  document.getElementById('gql-stats-badge').textContent = `200 OK (${latency}ms)`;
  document.getElementById('response-block').textContent = JSON.stringify(res, null, 2);
}

function setupEvents() {
  document.getElementById('btn-run-query').onclick = runQuery;
  document.getElementById('query-editor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      runQuery();
    }
  });
}

init().catch(console.error);
