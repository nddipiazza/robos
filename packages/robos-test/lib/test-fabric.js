'use strict';
const { MockStubGenerator } = require('./mock-stub-generator');

const DEFAULT_DB_FIXTURES = {
  users: [
    { id: 'usr-1', username: 'standard-user', role: 'standard-user', active: true },
    { id: 'usr-2', username: 'admin-user', role: 'admin', active: true },
  ],
  forms: [
    { id: 'form-101', title: 'Dynamic Application Form', totalSteps: 3, published: true },
  ],
  submissions: [],
};

class LocalTestFabric {
  constructor(options = {}) {
    this.display = options.display || process.env.DISPLAY || ':99';
    this.stubGenerator = new MockStubGenerator();
    this.dbState = JSON.parse(JSON.stringify(DEFAULT_DB_FIXTURES));
    this.snapshots = new Map();
    this.isRunning = false;
    this.startedAt = null;
    this.spinUpDurationMs = 0;
  }

  async start() {
    const startTime = Date.now();
    this.dbState = JSON.parse(JSON.stringify(DEFAULT_DB_FIXTURES));
    this.stubGenerator.clearEvents();
    this.stubGenerator.initDefaultStubs();
    this.isRunning = true;
    this.startedAt = new Date().toISOString();
    this.spinUpDurationMs = Date.now() - startTime;

    return {
      ok: true,
      display: this.display,
      spinUpDurationMs: this.spinUpDurationMs,
      services: ['mock-api-server', 'db-fixture-engine', 'kafka-event-bus', 'xvfb-display'],
      healthy: true,
    };
  }

  async reset() {
    this.dbState = JSON.parse(JSON.stringify(DEFAULT_DB_FIXTURES));
    this.stubGenerator.clearEvents();
    return { ok: true, resetAt: new Date().toISOString() };
  }

  async stop() {
    this.isRunning = false;
    this.stubGenerator.clearEvents();
    return { ok: true, stoppedAt: new Date().toISOString() };
  }

  createSnapshot(name = 'default') {
    this.snapshots.set(name, JSON.stringify(this.dbState));
    return { ok: true, name };
  }

  restoreSnapshot(name = 'default') {
    const raw = this.snapshots.get(name);
    if (!raw) return { ok: false, error: `Snapshot ${name} not found` };
    this.dbState = JSON.parse(raw);
    return { ok: true, name };
  }

  // Database Fixture Helper Operations
  insert(table, record) {
    if (!this.dbState[table]) this.dbState[table] = [];
    this.dbState[table].push(record);
    return record;
  }

  query(table, filterFn = () => true) {
    if (!this.dbState[table]) return [];
    return this.dbState[table].filter(filterFn);
  }

  // Mock API Dispatcher
  dispatchRequest(method, path, body = null) {
    return this.stubGenerator.handleRequest(method, path, body);
  }

  getHealth() {
    return {
      status: this.isRunning ? 'UP' : 'DOWN',
      display: this.display,
      dbTables: Object.keys(this.dbState),
      totalRecords: Object.values(this.dbState).reduce((acc, curr) => acc + curr.length, 0),
      mockStubsCount: this.stubGenerator.stubs.size,
      emittedEventsCount: this.stubGenerator.eventLog.length,
      spinUpDurationMs: this.spinUpDurationMs,
    };
  }
}

module.exports = { LocalTestFabric, DEFAULT_DB_FIXTURES };
