'use strict';

let connections = [];
let activeConn = null;
let currentTable = 'pets';
let dbSchema = null;

async function init() {
  connections = await window.dbManager.getConnections();
  if (connections.length > 0) {
    activeConn = connections[0];
  }

  await renderTree();
  setupEvents();
  await loadTable('pets');
}

async function renderTree() {
  const treeRoot = document.getElementById('connections-tree');
  treeRoot.innerHTML = '';

  for (const conn of connections) {
    const connEl = document.createElement('div');
    connEl.className = `tree-item ${activeConn && activeConn.id === conn.id ? 'active' : ''}`;
    connEl.innerHTML = `<span>🐘</span> <strong>${conn.name}</strong>`;
    connEl.onclick = () => window.selectConnection(conn.id);
    treeRoot.appendChild(connEl);

    // Schemas & Tables
    const schema = await window.dbManager.getSchema({ connId: conn.id });
    const tableNames = (schema.tables || []).map(t => t.name);

    (conn.schemas || ['public']).forEach(sch => {
      const schEl = document.createElement('div');
      schEl.className = 'tree-item tree-subitem';
      schEl.innerHTML = `<span>📁</span> <span>schema: ${sch}</span>`;
      treeRoot.appendChild(schEl);

      tableNames.forEach(tbl => {
        const tblEl = document.createElement('div');
        tblEl.className = `tree-item tree-subitem ${tbl === currentTable ? 'active' : ''}`;
        tblEl.style.paddingLeft = '36px';
        tblEl.innerHTML = `<span>📄</span> <span class="tbl-name">${tbl}</span>`;
        tblEl.onclick = (e) => {
          e.stopPropagation();
          window.selectConnection(conn.id).then(() => window.selectTable(tbl));
        };
        treeRoot.appendChild(tblEl);
      });
    });
  }
}

window.selectConnection = async function(connId) {
  const found = connections.find(c => c.id === connId);
  if (found) {
    activeConn = found;
    const schema = await window.dbManager.getSchema({ connId: found.id });
    const tables = (schema.tables || []).map(t => t.name);
    if (tables.length > 0) {
      await loadTable(tables[0]);
    }
    await renderTree();
  }
};

window.selectTable = async function(tableName) {
  await loadTable(tableName);
};

async function loadTable(tableName) {
  currentTable = tableName;
  document.getElementById('current-table-label').textContent = `Table: public.${tableName}`;
  document.getElementById('tab-data-btn').textContent = `📊 Data: ${tableName}`;

  // Update tree active
  document.querySelectorAll('.tree-item').forEach(el => {
    if (el.textContent.includes(tableName)) el.classList.add('active');
    else el.classList.remove('active');
  });

  const res = await window.dbManager.getTableData({ tableName });
  const thead = document.getElementById('grid-thead');
  const tbody = document.getElementById('grid-tbody');

  thead.innerHTML = '<tr>' + res.columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
  tbody.innerHTML = res.rows.map(r => '<tr>' + r.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('');

  // Load DDL
  const schema = await window.dbManager.getSchema({ connId: activeConn.id });
  const tableObj = schema.tables.find(t => t.name === tableName);
  if (tableObj) {
    document.getElementById('ddl-content-block').textContent = tableObj.ddl;
  }
}

async function executeSql() {
  const sql = document.getElementById('sql-editor').value;
  const res = await window.dbManager.executeSql({ connId: activeConn.id, sql });

  document.getElementById('sql-stats-text').textContent = `${res.rowCount} rows returned in ${res.executionTimeMs}ms`;

  const thead = document.getElementById('sql-grid-thead');
  const tbody = document.getElementById('sql-grid-tbody');

  thead.innerHTML = '<tr>' + res.columns.map(c => `<th>${c}</th>`).join('') + '</tr>';
  tbody.innerHTML = res.rows.map(r => '<tr>' + r.map(cell => `<td>${cell}</td>`).join('') + '</tr>').join('');
}

function setupEvents() {
  // Tabs
  document.querySelectorAll('.ws-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ws-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');

      if (btn.dataset.view === 'sql') executeSql();
    });
  });

  document.getElementById('btn-run-sql').addEventListener('click', executeSql);
  document.getElementById('sql-editor').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      executeSql();
    }
  });

  document.getElementById('btn-new-query').addEventListener('click', () => {
    document.getElementById('tab-sql-btn').click();
  });
}

init().catch(console.error);
