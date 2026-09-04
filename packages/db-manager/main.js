'use strict';
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME_DIR = process.env.HOME || os.homedir();
const CONFIG_FILE = path.join(HOME_DIR, '.config', 'robos', 'db-manager-connections.json');

var _debugServer = null;
try {
  const libPaths = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'dom-snapshot'),
    path.resolve(__dirname, '..', 'robos-lib', 'dom-snapshot'),
    '/usr/local/share/robos/robos-lib/dom-snapshot',
  ].filter(Boolean);
  for (const p of libPaths) {
    try { _debugServer = require(p); break; } catch {}
  }
} catch {}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'RobOS Relational Database Management',
    autoHideMenuBar: true,
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (_debugServer) {
    _debugServer.startDebugServer(win, 19179);
  }

  return win;
}

app.setName('db-manager');
app.setPath('userData', path.join(HOME_DIR, '.config', 'robos', 'electron', 'db-manager'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-dev-shm-usage');

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

const DEFAULT_CONNECTIONS = [
  {
    id: 'conn-postgres-local',
    name: 'Petshop Localhost (PostgreSQL 16)',
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    database: 'petshop',
    user: 'postgres',
    ssl: false,
    status: 'Connected',
    latencyMs: 1.2,
    schemas: ['public', 'information_schema'],
  },
  {
    id: 'conn-oracle-prod',
    name: 'Enterprise Financial Core (Oracle 23c)',
    type: 'oracle',
    host: 'oracle-prod.internal.acme.com',
    port: 1521,
    database: 'ORCL_FIN',
    user: 'c##billing_app',
    ssl: true,
    status: 'Connected',
    latencyMs: 7.8,
    schemas: ['BILLING', 'LEDGER', 'AUDIT'],
  },
  {
    id: 'conn-mysql-replica',
    name: 'Analytics Reporting Store (MySQL 8)',
    type: 'mysql',
    host: 'mysql-ro.internal.acme.com',
    port: 3306,
    database: 'reporting_db',
    user: 'ro_analyst',
    ssl: true,
    status: 'Connected',
    latencyMs: 4.1,
    schemas: ['reporting_db'],
  },
  {
    id: 'conn-postgres-analytics',
    name: 'Acme Pet Adoption Analytics (PostgreSQL 16)',
    type: 'postgres',
    host: '127.0.0.1',
    port: 5432,
    database: 'petshop_analytics',
    user: 'postgres',
    ssl: false,
    status: 'Connected',
    latencyMs: 0.9,
    schemas: ['public', 'analytics_marts', 'information_schema'],
  },
];

const SAMPLE_DATABASE_OBJECTS = {
  tables: [
    {
      name: 'pets',
      schema: 'public',
      rowCount: 142,
      sizeFormatted: '64 KB',
      columns: [
        { name: 'id', type: 'VARCHAR(64)', nullable: false, pk: true, defaultVal: null },
        { name: 'name', type: 'VARCHAR(128)', nullable: false, pk: false, defaultVal: null },
        { name: 'species', type: 'VARCHAR(64)', nullable: false, pk: false, defaultVal: "'Canine'" },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, pk: false, defaultVal: "'AVAILABLE'" },
        { name: 'microchip_id', type: 'VARCHAR(64)', nullable: true, pk: false, defaultVal: null },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, pk: false, defaultVal: 'CURRENT_TIMESTAMP' },
      ],
      ddl: `CREATE TABLE public.pets (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  species VARCHAR(64) NOT NULL DEFAULT 'Canine',
  status VARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
  microchip_id VARCHAR(64) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pets_status ON public.pets(status);`,
    },
    {
      name: 'vaccination_certificates',
      schema: 'public',
      rowCount: 89,
      sizeFormatted: '48 KB',
      columns: [
        { name: 'cert_id', type: 'VARCHAR(64)', nullable: false, pk: true, defaultVal: null },
        { name: 'pet_id', type: 'VARCHAR(64)', nullable: false, pk: false, defaultVal: null },
        { name: 'vaccine_type', type: 'VARCHAR(64)', nullable: false, pk: false, defaultVal: null },
        { name: 'administered_date', type: 'DATE', nullable: false, pk: false, defaultVal: 'CURRENT_DATE' },
        { name: 'expiry_date', type: 'DATE', nullable: false, pk: false, defaultVal: null },
        { name: 'verified_by_mtls', type: 'BOOLEAN', nullable: false, pk: false, defaultVal: 'true' },
      ],
      ddl: `CREATE TABLE public.vaccination_certificates (
  cert_id VARCHAR(64) PRIMARY KEY,
  pet_id VARCHAR(64) REFERENCES public.pets(id) ON DELETE CASCADE,
  vaccine_type VARCHAR(64) NOT NULL,
  administered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE NOT NULL,
  verified_by_mtls BOOLEAN NOT NULL DEFAULT true
);`,
    },
    {
      name: 'surgeries',
      schema: 'public',
      rowCount: 18,
      sizeFormatted: '24 KB',
      columns: [
        { name: 'booking_id', type: 'VARCHAR(64)', nullable: false, pk: true, defaultVal: null },
        { name: 'pet_id', type: 'VARCHAR(64)', nullable: false, pk: false, defaultVal: null },
        { name: 'procedure', type: 'VARCHAR(128)', nullable: false, pk: false, defaultVal: null },
        { name: 'operating_room', type: 'VARCHAR(32)', nullable: false, pk: false, defaultVal: "'OR-1'" },
        { name: 'status', type: 'VARCHAR(32)', nullable: false, pk: false, defaultVal: "'SCHEDULED'" },
        { name: 'scheduled_time', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, pk: false, defaultVal: null },
      ],
      ddl: `CREATE TABLE public.surgeries (
  booking_id VARCHAR(64) PRIMARY KEY,
  pet_id VARCHAR(64) REFERENCES public.pets(id),
  procedure VARCHAR(128) NOT NULL,
  operating_room VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'SCHEDULED',
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL
);`,
    },
  ],
  views: [
    { name: 'v_active_pet_vaccinations', schema: 'public', definition: 'SELECT p.id, p.name, v.vaccine_type, v.expiry_date FROM pets p JOIN vaccination_certificates v ON p.id = v.pet_id;' },
  ],
};

function loadConnections() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_CONNECTIONS));
}

function saveConnections(conns) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(conns, null, 2), 'utf8');
  } catch {}
}

ipcMain.handle('db-get-connections', async () => loadConnections());

ipcMain.handle('db-save-connection', async (_, conn) => {
  const list = loadConnections();
  const idx = list.findIndex(c => c.id === conn.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...conn };
  else list.push(conn);
  saveConnections(list);
  return list;
});

ipcMain.handle('db-get-schema', async (_, { connId, schemaName }) => {
  if (connId === 'conn-postgres-analytics') {
    return {
      tables: [
        {
          name: 'adoption_analytics',
          schema: 'public',
          rowCount: 142,
          sizeFormatted: '32 KB',
          columns: [
            { name: 'metric_id', type: 'VARCHAR(64)', nullable: false, pk: true, defaultVal: null },
            { name: 'period', type: 'VARCHAR(32)', nullable: false, pk: false, defaultVal: "'2026-Q3'" },
            { name: 'total_adoptions', type: 'INTEGER', nullable: false, pk: false, defaultVal: '0' },
            { name: 'canine_count', type: 'INTEGER', nullable: false, pk: false, defaultVal: '0' },
            { name: 'feline_count', type: 'INTEGER', nullable: false, pk: false, defaultVal: '0' },
            { name: 'avg_adoption_fee', type: 'NUMERIC(10,2)', nullable: false, pk: false, defaultVal: '175.50' },
            { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', nullable: false, pk: false, defaultVal: 'CURRENT_TIMESTAMP' },
          ],
          ddl: `CREATE TABLE public.adoption_analytics (
  metric_id VARCHAR(64) PRIMARY KEY,
  period VARCHAR(32) NOT NULL DEFAULT '2026-Q3',
  total_adoptions INTEGER NOT NULL DEFAULT 0,
  canine_count INTEGER NOT NULL DEFAULT 0,
  feline_count INTEGER NOT NULL DEFAULT 0,
  avg_adoption_fee NUMERIC(10,2) NOT NULL DEFAULT 175.50,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_analytics_period ON public.adoption_analytics(period);`,
        },
      ],
      views: [
        { name: 'v_adoption_trends_quarterly', schema: 'public', definition: 'SELECT period, total_adoptions, avg_adoption_fee FROM adoption_analytics ORDER BY period DESC;' }
      ]
    };
  }
  return SAMPLE_DATABASE_OBJECTS;
});

ipcMain.handle('db-get-table-data', async (_, { tableName, limit = 50, offset = 0 }) => {
  if (tableName === 'adoption_analytics') {
    return {
      columns: ['metric_id', 'period', 'total_adoptions', 'canine_count', 'feline_count', 'avg_adoption_fee', 'created_at'],
      rows: [
        ['METRIC-2026-Q3', '2026-Q3', 142, 88, 54, '$175.50', '2026-09-04 12:00:00 UTC'],
        ['METRIC-2026-Q2', '2026-Q2', 128, 76, 52, '$160.00', '2026-06-30 23:59:00 UTC'],
        ['METRIC-2026-Q1', '2026-Q1', 115, 69, 46, '$150.00', '2026-03-31 23:59:00 UTC'],
      ],
      totalRows: 3,
    };
  }
  if (tableName === 'pets') {
    return {
      columns: ['id', 'name', 'species', 'status', 'microchip_id', 'created_at'],
      rows: [
        ['PET-105', 'Luna', 'Canine (Husky)', 'AVAILABLE', 'CHIP-99014-VAX', '2026-09-04 09:12:00 UTC'],
        ['PET-106', 'Milo', 'Feline (Tabby)', 'ADOPTED', 'CHIP-99015-MED', '2026-09-04 10:30:00 UTC'],
        ['PET-107', 'Barnaby', 'Canine (Golden)', 'PENDING_SURGERY', 'CHIP-99016-SURG', '2026-09-04 11:45:00 UTC'],
        ['PET-108', 'Cleo', 'Feline (Siamese)', 'AVAILABLE', 'CHIP-99017-VAX', '2026-09-04 12:00:00 UTC'],
        ['PET-109', 'Rocky', 'Canine (Bulldog)', 'AVAILABLE', 'CHIP-99018-NONE', '2026-09-04 12:15:00 UTC'],
      ],
      totalRows: 142,
    };
  }
  if (tableName === 'vaccination_certificates') {
    return {
      columns: ['cert_id', 'pet_id', 'vaccine_type', 'administered_date', 'expiry_date', 'verified_by_mtls'],
      rows: [
        ['VAX-CERT-9941', 'PET-105', 'Rabies (3-Year PureVax)', '2026-09-04', '2029-09-04', true],
        ['VAX-CERT-9942', 'PET-106', 'FVRCP Core Feline', '2026-08-12', '2027-08-12', true],
        ['VAX-CERT-9943', 'PET-107', 'DHPP Canine Core', '2026-08-20', '2027-08-20', true],
      ],
      totalRows: 89,
    };
  }
  return {
    columns: ['id', 'name', 'status'],
    rows: [['ROW-1', 'Sample Item', 'ACTIVE']],
    totalRows: 1,
  };
});

ipcMain.handle('db-execute-sql', async (_, { connId, sql }) => {
  const start = Date.now();
  await new Promise(r => setTimeout(r, 180));
  const latency = Date.now() - start;

  const s = (sql || '').trim().toLowerCase();
  if (s.includes('select') && s.includes('adoption_analytics')) {
    return {
      ok: true,
      columns: ['metric_id', 'period', 'total_adoptions', 'canine_count', 'feline_count', 'avg_adoption_fee', 'created_at'],
      rows: [
        ['METRIC-2026-Q3', '2026-Q3', 142, 88, 54, '$175.50', '2026-09-04 12:00:00 UTC'],
        ['METRIC-2026-Q2', '2026-Q2', 128, 76, 52, '$160.00', '2026-06-30 23:59:00 UTC'],
        ['METRIC-2026-Q1', '2026-Q1', 115, 69, 46, '$150.00', '2026-03-31 23:59:00 UTC'],
      ],
      rowCount: 3,
      executionTimeMs: latency,
      explainPlan: 'Index Scan using idx_analytics_period on adoption_analytics  (cost=0.15..8.20 rows=3 width=128)',
    };
  }

  if (s.includes('select') && s.includes('pets')) {
    return {
      ok: true,
      columns: ['id', 'name', 'species', 'status', 'microchip_id', 'created_at'],
      rows: [
        ['PET-105', 'Luna', 'Canine (Husky)', 'AVAILABLE', 'CHIP-99014-VAX', '2026-09-04 09:12:00 UTC'],
        ['PET-106', 'Milo', 'Feline (Tabby)', 'ADOPTED', 'CHIP-99015-MED', '2026-09-04 10:30:00 UTC'],
        ['PET-107', 'Barnaby', 'Canine (Golden)', 'PENDING_SURGERY', 'CHIP-99016-SURG', '2026-09-04 11:45:00 UTC'],
        ['PET-108', 'Cleo', 'Feline (Siamese)', 'AVAILABLE', 'CHIP-99017-VAX', '2026-09-04 12:00:00 UTC'],
        ['PET-109', 'Rocky', 'Canine (Bulldog)', 'AVAILABLE', 'CHIP-99018-NONE', '2026-09-04 12:15:00 UTC'],
      ],
      rowCount: 5,
      executionTimeMs: latency,
      explainPlan: 'Seq Scan on pets  (cost=0.00..15.42 rows=142 width=180)',
    };
  }

  return {
    ok: true,
    columns: ['status', 'rows_affected', 'message'],
    rows: [['SUCCESS', 1, 'Statement executed successfully']],
    rowCount: 1,
    executionTimeMs: latency,
  };
});

ipcMain.handle('open-url', async (_, url) => {
  if (url) shell.openExternal(url);
  return { ok: true };
});
